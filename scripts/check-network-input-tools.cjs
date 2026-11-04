const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=JSON.parse(JSON.stringify(vm.runInContext('({networkInputToolsFiles,networkInputToolsValidation})',c)));
const python=process.env.INFRA_LAB_PYTHON||'python3',actual={};
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[id,name]of [['k8s-networking','tls_identity.py'],['data-pipeline','sampler_coverage.py'],['data-pipeline','packing_boundaries.py'],['agent-runtime','tool_runtime.py']]){
 const source=fs.readFileSync('dist/labs/network-input-tools/'+name,'utf8'),record=d.networkInputToolsValidation.programs[name];
 assert.equal(d.networkInputToolsFiles[name],source);
 assert.equal(record.sha256,crypto.createHash('sha256').update(source).digest('hex'));
 assert.equal(record.exit_code,0);assert(record.python);
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': static complete code mismatch');
 if(name!=='sampler_coverage.py')actual[name]=JSON.parse(execFileSync(python,['-B','dist/labs/network-input-tools/'+name],{encoding:'utf8',timeout:60000}));
}
const tls=actual['tls_identity.py'];
assert(tls.tcp_connected);assert.equal(tls.good.http_status,200);
assert.deepEqual(tls.good.body,{report:'R17',version:3,total:37});
assert.deepEqual(tls.good.certificate_dns_names,['reports.internal.test']);
assert.deepEqual(tls.failures,{wrong_certificate_name:'certificate_verification_failed',untrusted_ca:'certificate_verification_failed'});
assert.equal(tls.valid_tls_wrong_http_host.http_status,421);
assert.equal(tls.valid_tls_wrong_http_host.body.error,'unknown_virtual_host');
assert.equal(tls.verification_disabled,false);assert.equal(tls.system_trust_changed,false);
assert.deepEqual(tls.http_requests.map(x=>x.host),['reports.internal.test','other.internal.test']);
assert.deepEqual(tls.sni_names,['reports.internal.test','wrong.internal.test','reports.internal.test','reports.internal.test']);
// Negotiated TLS/library versions are environment evidence, not portable expected constants.
const tlsSemantics=r=>({tcp_connected:r.tcp_connected,good:{http_status:r.good.http_status,body:r.good.body,certificate_dns_names:r.good.certificate_dns_names},failures:r.failures,
 wrong_host:{http_status:r.valid_tls_wrong_http_host.http_status,body:r.valid_tls_wrong_http_host.body},http_requests:r.http_requests,sni_names:r.sni_names,verification_disabled:r.verification_disabled,system_trust_changed:r.system_trust_changed});
assert.deepEqual(tlsSemantics(tls),tlsSemantics(d.networkInputToolsValidation.programs['tls_identity.py'].result));

// Independent coverage oracle for the actual recorded Torch run; CI does not install/rerun Torch.
const sampler=d.networkInputToolsValidation.programs['sampler_coverage.py'].result;
assert.equal(sampler.torch,'2.5.1');assert.equal(sampler.device,'cpu');assert.equal(sampler.backend,'gloo');
assert.equal(sampler.world_size,2);assert.equal(sampler.workers_per_rank,2);assert.equal(sampler.dataset_size,11);
assert.equal(sampler.training_step_executed,false);
const ids=Array.from({length:11},(_,i)=>i);
const chunks=(a,size,drop=false)=>Array.from({length:Math.ceil(a.length/size)},(_,i)=>a.slice(i*size,(i+1)*size)).filter(a=>!drop||a.length===size);
function summary(batches){
 const all=batches.flat(2),counts=new Map();
 for(const id of all)counts.set(id,(counts.get(id)||0)+1);
 return{deliveries:all.length,unique:counts.size,repeated_ids:ids.filter(id=>(counts.get(id)||0)>1),missing_ids:ids.filter(id=>!counts.has(id)),batch_counts:batches.map(x=>x.length)};
}
for(const sd of [false,true])for(const ld of [false,true]){
 const total=(sd?Math.floor(11/2):Math.ceil(11/2))*2;
 const whole=ids.slice(0,total);while(whole.length<total)whole.push(ids[whole.length%11]);
 const batches=[];
 for(let rank=0;rank<2;rank++){
  const indices=whole.filter((_,i)=>i%2===rank),key='sampler_'+Number(sd)+'_loader_'+Number(ld);
  assert.deepEqual(sampler.ranks[rank].map[key].sampler_indices,indices);
  const rankBatches=chunks(indices,4,ld);batches.push(rankBatches);
  assert.deepEqual(sampler.ranks[rank].map[key].batches,rankBatches);
 }
 assert.deepEqual(sampler.map_summary['sampler_'+Number(sd)+'_loader_'+Number(ld)],summary(batches));
}
assert.deepEqual(sampler.map_summary.no_sampler,summary([chunks(ids,4),chunks(ids,4)]));
for(const rank of sampler.ranks){assert.deepEqual(rank.shuffle.epoch_0,rank.shuffle.without_set_epoch);assert.notDeepEqual(rank.shuffle.epoch_0,rank.shuffle.epoch_1);}
for(const[name,shard,drop]of [['unsharded_workers',false,false],['sharded_keep',true,false],['sharded_drop',true,true]]){
 const perRank=[];
 for(let rank=0;rank<2;rank++){
  const batches=[];
  for(let worker=0;worker<2;worker++){
   const indices=ids.filter(i=>shard?i%4===rank*2+worker:i%2===rank);
   const expected=chunks(indices,2,drop);
   const recorded=sampler.ranks[rank].iterable[name].batches.filter(b=>b.worker===worker).map(b=>b.ids);
   assert.deepEqual(recorded,expected);batches.push(...expected);
  }
  perRank.push(batches);
 }
 assert.deepEqual(sampler.iterable_summary[name],summary(perRank));
}
assert.deepEqual(sampler.iterable_summary.sharded_keep.batch_counts,[4,3]);

// Independent fixed-vector attention, shifted labels and mask oracle.
const packing=actual['packing_boundaries.py'],emb={11:[1,0],12:[.5,.5],2:[0,1],21:[-1,0]};
const vectors=(tokens,positions)=>tokens.map((t,i)=>[emb[t][0]+.2*positions[i],emb[t][1]-.1*positions[i]]);
function attention(v,allowed){return v.map((q,i)=>{
 const scores=v.map((k,j)=>allowed(i,j)?(q[0]*k[0]+q[1]*k[1])/Math.sqrt(2):-Infinity),top=Math.max(...scores),weights=scores.map(s=>Math.exp(s-top)),sum=weights.reduce((a,b)=>a+b,0);
 return[0,1].map(d=>weights.reduce((a,w,j)=>a+w*v[j][d],0)/sum);
});}
const near=(a,b)=>{if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((v,i)=>near(v,b[i]));}else assert(Math.abs(a-b)<1e-11,a+' != '+b);};
const independent=packing.documents.flatMap(doc=>attention(vectors(doc,doc.map((_,i)=>i)),(i,j)=>j<=i));
near(packing.independent_outputs,independent);near(packing.packed_outputs,independent);
assert.equal(packing.valid_targets,3);assert.equal(packing.plain_concatenation_targets,4);
assert.deepEqual(packing.shifted_labels,[12,2,-100,2]);
const mask=packing.document_ids.map((doc,i)=>packing.document_ids.map((other,j)=>j<=i&&doc===other));
assert.deepEqual(packing.allowed_attention,mask);
const plain=attention(vectors(packing.packed_tokens,packing.positions),(i,j)=>j<=i);
const wrongPositions=attention(vectors(packing.packed_tokens,packing.packed_tokens.map((_,i)=>i)),(i,j)=>mask[i][j]);
const maxError=(a,b)=>Math.max(...a.flatMap((row,i)=>row.map((v,j)=>Math.abs(v-b[i][j]))));
assert(Math.abs(maxError(plain,independent)-packing.cross_document_max_error)<1e-11);
assert(Math.abs(maxError(wrongPositions,independent)-packing.global_positions_max_error)<1e-11);
const recordedPacking=d.networkInputToolsValidation.programs['packing_boundaries.py'].result;
near(packing.packed_outputs,recordedPacking.packed_outputs);
assert(packing.cross_document_max_error>.1&&packing.global_positions_max_error>.1);

// Actual HTTP cases, effects, counters and independent task-result checks.
const runtime=actual['tool_runtime.py'];
assert.equal(runtime.proposal_source,'deterministic_script_no_llm');
assert.equal(runtime.transport,'actual_loopback_http_jsonrpc');
assert.deepEqual(Object.keys(runtime.cases),['normal','duplicate_same_operation','invalid_bool_then_repair','foreign_resource','broken_output','finish_without_work','repeating_reads','transient_read','valid_schema_wrong_total','same_operation_changed_arguments']);
for(const[name,state,effects,calls]of [
 ['normal','SUCCEEDED',1,2],['duplicate_same_operation','SUCCEEDED',1,3],['invalid_bool_then_repair','SUCCEEDED',1,2],
 ['foreign_resource','DENIED',0,1],['broken_output','FAILED_RESULT_SCHEMA',0,1],['finish_without_work','INCOMPLETE',0,0],
 ['repeating_reads','BUDGET_EXCEEDED',0,3],['transient_read','SUCCEEDED',1,3],['valid_schema_wrong_total','INCOMPLETE',1,2],
 ['same_operation_changed_arguments','TOOL_ERROR',1,3]]){
 const run=runtime.cases[name];assert.equal(run.state,state,name);assert.equal(run.effects,effects,name);assert.equal(run.tool_attempts,calls,name);
 assert.equal(run.rpc_requests,calls+1,name);assert.equal(run.foreign_value_leaked,false,name);
 if(state==='SUCCEEDED')assert.deepEqual(run.artifact,{resource:'report-A',version:1,total:37,source_version:3});
}
assert.equal(runtime.cases.valid_schema_wrong_total.artifact.total,38);
assert.equal(runtime.cases.invalid_bool_then_repair.validation_errors,1);
assert.equal(runtime.cases.transient_read.transport_errors,1);
assert.deepEqual(runtime.cases.broken_output.observations,[]);
assert(runtime.cases.duplicate_same_operation.observations.at(-1).duplicate);
assert.deepEqual(runtime,d.networkInputToolsValidation.programs['tool_runtime.py'].result);
execFileSync(python,['-B','-c',`from pathlib import Path
import zipfile
with zipfile.ZipFile('dist/labs/network-input-tools.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/network-input-tools').iterdir():
  if p.is_file(): assert z.read('network-input-tools/'+p.name)==p.read_bytes(), p.name
`],{encoding:'utf8'});
for(const[route,anchor]of [['native','service-name-address-identity'],['training','input-dataset-sampler-loader'],['agent','tool-task-contract']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8'),knowledge=page.indexOf('id="'+anchor+'"'),cases=page.indexOf('id="examples"');
 assert(knowledge>=0&&knowledge<cases);
}
for(const name of ['service-tls-identity','policy-selector-logic','sampler-worker-batches','packing-mask','tool-control-loop','tool-error-layers']){
 const svg=fs.readFileSync('dist/diagrams/v23-'+name+'.svg','utf8');assert(svg.includes('<title>'));assert(svg.includes('<desc>'));
}
console.log('PASS: real TLS trust/name/Host boundaries, independent rank/worker coverage oracle, independent packing attention, 10 actual HTTP cases, source/static/ZIP equality and knowledge before cases.');

