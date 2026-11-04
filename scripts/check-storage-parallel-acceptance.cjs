const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const folder='dist/labs/storage-parallel-acceptance',record=JSON.parse(fs.readFileSync(folder+'/validation.json','utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const c={};vm.createContext(c);for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=vm.runInContext('({articles,files:storageParallelFiles,domains:infraKnowledgeDomains,cloud:cloudKnowledgeExplanations})',c);
for(const name of ['shard_range.py','tp_forward_backward.py','acceptance_record.py']){
 const bytes=fs.readFileSync(folder+'/'+name);assert.equal(record.programs[name].status,'passed');
 assert.equal(sha(bytes),record.programs[name].source_sha256,name+': stale execution evidence');assert.equal(data.files[name],bytes.toString('utf8'));
}
for(const [name,digest]of Object.entries(record.fixtures))assert.equal(sha(fs.readFileSync(folder+'/'+name)),digest);

// Independent workload arithmetic, with response-body bytes separated from wire bytes.
const h=record.programs['shard_range.py'];assert.deepEqual(h.input,{samples:20,sample_bytes:64,samples_per_shard:4,selected_ids:[0,1,6,7,17]});
const shards=[...new Set(h.input.selected_ids.map(id=>Math.floor(id/4)))];assert.equal(shards.length,3);
assert.deepEqual(h.full_shards_with_request_cache,{requests:shards.length,body_bytes:shards.length*4*64,useful_sample_bytes:5*64});
assert.deepEqual(h.indexed_ranges,{requests:5,body_bytes:5*64,useful_sample_bytes:5*64});
assert.deepEqual(h.server_positive_requests.slice(0,3).map(r=>r.key),['shard-0','shard-1','shard-4']);
assert(h.server_positive_requests.slice(0,3).every(r=>r.range===null));
assert.deepEqual(h.server_positive_requests.slice(3).map(r=>r.range),['bytes=0-63','bytes=64-127','bytes=128-191','bytes=192-255','bytes=64-127']);
assert.deepEqual(h.negative_probes,{object_changed:412,wrong_offset:'sample_digest_mismatch',out_of_bounds:416});
const transfer=10000*64*1024/(125*1024*1024);assert.equal(transfer,5);
assert.equal(h.declared_serial_cost_model.separate_s,10000*.005+transfer);
assert.equal(h.declared_serial_cost_model.shards_s,100*.005+transfer);

// Complete hand-computed gradient and update oracle; no distributed-autograd assumption.
const t=record.programs['tp_forward_backward.py'];assert.equal(t.world_size,2);assert.equal(t.backend,'gloo');assert.equal(t.device,'cpu');assert.equal(t.dtype,'float64');assert(t.torch.startsWith('2.5.1'));
const expected={y:[[12,5]],loss:58.5,dx:[[39,42]],dw:[[9,6,15,18],[18,12,30,36]],du:[[9,6],[18,12],[18,12],[36,24]],db:[9,6]};
for(const [key,value]of Object.entries(expected))assert.deepEqual(t.reference[key],value,key);
const W=[[1,0,2,0],[0,1,0,2]],U=[[1,0],[0,1],[1,1],[2,0]],update=(weights,grad)=>weights.map((row,i)=>row.map((v,j)=>v-.01*grad[i][j]));
const close=(a,b)=>{if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((v,i)=>close(v,b[i]));}else assert(Math.abs(a-b)<1e-12,`${a} != ${b}`);};
close(t.reference.w_after,update(W,expected.dw));close(t.reference.u_after,update(U,expected.du));close(t.reference.bias_after,[.91,.94]);
assert.deepEqual(t.ranks.map(r=>r.partial_output),[[[1,2]],[[10,2]]]);assert.deepEqual(t.ranks.map(r=>r.dx_partial),[[[9,6]],[[30,36]]]);
for(let i=0;i<2;i++){
 const local=t.ranks[i];assert.equal(local.rank,i);assert.deepEqual(local.y,expected.y);assert.deepEqual(local.dx,expected.dx);assert.deepEqual(local.wrong_bias_y,[[13,6]]);
 assert.deepEqual(local.dw,expected.dw.map(row=>row.slice(i*2,i*2+2)));assert.deepEqual(local.du,expected.du.slice(i*2,i*2+2));
 assert.deepEqual(local.db,expected.db);assert.deepEqual(local.dy,[[9,6]]);close(local.bias_after,[.91,.94]);
 close(local.w_after,t.reference.w_after.map(row=>row.slice(i*2,i*2+2)));close(local.u_after,t.reference.u_after.slice(i*2,i*2+2));
}
assert.deepEqual(t.wrong_nonlinearity,{partials:[1,-2],sum_then_relu:Math.max(0,1-2),relu_then_sum:Math.max(0,1)+Math.max(0,-2)});

const a=record.programs['acceptance_record.py'];assert.equal(a.positive.total,23);assert.equal(a.positive.logical_tasks,1);assert.equal(a.positive.provenance_verified,false);assert.equal(a.negative_probes.length,10);
assert.equal(new Set(a.negative_probes.map(r=>r.case)).size,10);for(const row of a.negative_probes)assert(row.actual_errors.includes(row.expected_error));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'infra-storage-tp-check-'));
const run=(python,name,args=[])=>{const r=cp.spawnSync(python,[path.resolve(folder,name),...args],{encoding:'utf8',timeout:65000,maxBuffer:1024*1024});assert(!r.error,r.error?.message);return {exit:r.status,report:JSON.parse(r.stdout)};};
try{
 for(const name of ['shard_range.py','acceptance_record.py']){const r=run('python3',name);assert.equal(r.exit,0);assert.equal(r.report.status,'passed');assert.equal(r.report.source_sha256,sha(fs.readFileSync(folder+'/'+name)));}
 const contract=JSON.parse(fs.readFileSync(folder+'/readonly-contract.example.json','utf8')),original=JSON.parse(fs.readFileSync(folder+'/readonly-evidence.example.json','utf8'));
 const checkEvidence=(change,expectedError)=>{const e=JSON.parse(JSON.stringify(original));change(e);const file=path.join(temporary,'evidence.json');fs.writeFileSync(file,JSON.stringify(e));const result=run('python3','acceptance_record.py',['--contract',path.resolve(folder,'readonly-contract.example.json'),'--evidence',file]);assert.equal(result.report.provenance_verified,false);if(expectedError){assert.equal(result.exit,1);assert(result.report.errors.includes(expectedError));}else{assert.equal(result.exit,0);assert.equal(result.report.status,'record_consistent');}};
 assert.equal(Object.values(contract.events).reduce((x,y)=>x+y,0),23);assert.equal(contract.B_before.version,7);
 checkEvidence(()=>{},null);
 checkEvidence(e=>e.delivery.total=38,'wrong_business_total');
 checkEvidence(e=>e.tool_receipts=[],'missing_allowed_read');
 checkEvidence(e=>e.submissions[1].task_id={unexpected:'object'},'logical_task_count');
 checkEvidence(e=>e.B_after.version=8,'forbidden_snapshot_changed');
 checkEvidence(e=>{e.source='target_export';e.target_version='fixture-marker-not-a-real-target';},null);
 if(process.env.INFRA_TP_PYTHON){const result=run(process.env.INFRA_TP_PYTHON,'tp_forward_backward.py');assert.equal(result.exit,0);assert.equal(result.report.status,'passed');}
 const zipper=cp.spawnSync('python3',['-c',`import pathlib,zipfile
p=pathlib.Path('${folder}')
with zipfile.ZipFile(str(p)+'.zip') as z:
 names=[n for n in z.namelist() if not n.endswith('/')]
 assert len(names)==7
 for name in names:
  assert z.read(name)==(p/pathlib.Path(name).name).read_bytes(),name
`],{encoding:'utf8'});assert.equal(zipper.status,0,zipper.stderr);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}

const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const [id,names,mechanism]of [
 ['training-storage',['shard_range.py'],'用固定请求成本'],
 ['tensor-parallel-math',['tp_forward_backward.py'],'非线性与反向梯度'],
 ['kairo-practice',['acceptance_record.py','readonly-contract.example.json','readonly-evidence.example.json'],'权限和标准答案']]){
 const article=data.articles.find(a=>a.id===id),html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 const code=[...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]).trim());
 for(const name of names)assert(code.includes(fs.readFileSync(folder+'/'+name,'utf8').trim()),id+'/'+name+': inline source mismatch');
 const mechanismAt=article.sections.findIndex(s=>s[0].includes(mechanism)),codeAt=article.sections.findIndex(s=>s[1].includes(names[0]));assert(mechanismAt>=0&&codeAt>mechanismAt,id+': mechanism must precede experiment');
 assert(html.includes('labs/storage-parallel-acceptance.zip'));
}
const metadata=name=>{const s=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8'),m=s.match(/<metadata(?: id="experiment-counts")?>([\s\S]*?)<\/metadata>/g)?.find(v=>!v.includes('<rdf:'));return JSON.parse(decode(m.replace(/<\/?metadata[^>]*>/g,'')));};
assert.deepEqual(metadata('v32-storage-access-counts').body_bytes,[768,320]);
assert.equal(metadata('v32-pp-forward-slots').occupied,2*4);assert.equal(metadata('v32-pp-forward-slots').capacity,2*(4+2-1));
assert.equal(metadata('v32-acceptance-sequences').kairo_executed,false);
assert(data.cloud['storage-model'].includes('v32-storage-interfaces.svg'));
assert(data.domains.flatMap(d=>d.points).find(p=>p.id==='tr-parallel').body.includes('v32-pp-forward-slots.svg'));
console.log('PASS: actual HTTP/CLI replays, independent bytes/gradient/update/slot oracles, ten record counterexamples and unverified provenance, five exact static sources, ZIP and diagrams. CPU/Gloo evidence checked'+(process.env.INFRA_TP_PYTHON?' and rerun.':'; set INFRA_TP_PYTHON for actual replay.'));
