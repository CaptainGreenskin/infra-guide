/* Independent holder/queue ledger; optional actual pinned upstream replay. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync,spawnSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const folder='dist/labs/vllm-block-lifecycle/',read=n=>fs.readFileSync(folder+n),json=n=>JSON.parse(read(n));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),record=json('validation.json'),manifest=json('source-manifest.json');
const commit='01efc7ef781391e744ed08c3292817a773d654e6';
const expectedSources={
 'block_pool.py':['1122ed808606e1a266995113505417401baa5fa7c42afa372314462c38790876','d1e1c1c8d038292c35718bb20b995f5e973dfe19',13319],
 'kv_cache_utils.py':['c69ce881133c859f041d44ccdc8c1de1cc6b16a91f986f7da060d476719a13cf','2c0eac3ddd79d9e0a4f1bb54a538e4bab052b6b0',48703]
};
assert.deepEqual([record.status,record.engine_version,record.upstream_commit],['passed','v0.10.2',commit]);
assert.deepEqual([record.full_vllm_import,record.scheduler_execution,record.device_kv_tensors],[false,false,false]);
assert.deepEqual(Object.keys(record.source_sha256).sort(),['block_lifecycle.py','fetch_upstream.py','source-manifest.json']);
for(const [file,hash]of Object.entries(record.source_sha256))assert.equal(sha(read(file)),hash,file);
assert.deepEqual([manifest.repository,manifest.version,manifest.commit,manifest.license],['vllm-project/vllm','v0.10.2',commit,'Apache-2.0']);
assert.deepEqual(manifest.files.map(e=>e.name).sort(),Object.keys(expectedSources).sort());
for(const e of manifest.files){assert.deepEqual([e.sha256,e.git_blob_sha1,e.bytes],expectedSources[e.name]);assert.equal(e.path,'vllm/v1/core/'+e.name);}
const nodes={
 'kv_cache_utils.py':[['BlockHash',25,25],['BlockHashWithGroupId',30,30],['ExternalBlockHash',35,35],['make_block_hash_with_group_id',38,47],['get_block_hash',50,52],['get_group_id',55,57],['KVCacheBlock',158,202],['FreeKVCacheBlockQueue',205,405]],
 'block_pool.py':[['BlockPool',22,330]]
};
assert.deepEqual(record.upstream.map(x=>x.file),['kv_cache_utils.py','block_pool.py']);
for(const e of record.upstream){assert.equal(e.sha256,expectedSources[e.file][0]);assert.deepEqual(e.slices.map(s=>[s.name,s.first_line,s.last_line]),nodes[e.file]);assert(e.slices.every(s=>/^[0-9a-f]{64}$/.test(s.sha256)));}

// This ledger follows holder sets and FIFO IDs, without importing any upstream algorithm.
function expectedTrace(){
 const key=sha('fixed-prefix-A'),packed=key+'00000000';
 const owners=new Map([['A',null],['B',null],['C',null],['new2',null],['new3',null],['new1',null]]);
 let free=[1,2,3],cached=null;const rows=[];
 const emit=stage=>{
  const counts=[0,0,0,0];for(const id of owners.values())if(id!==null)counts[id]++;
  rows.push({stage,free_ids:[...free],free_count:free.length,usage:1-free.length/3,
   refcounts:counts,is_null:[true,false,false,false],hit_ids:cached===null?null:[cached],
   hashes:[null,cached===1?packed:null,null,null]});
 };
 const allocate=(owner)=>{assert(free.length);const id=free.shift();if(cached===id)cached=null;owners.set(owner,id);return id;};
 const release=owner=>{const id=owners.get(owner);assert(id!==null);owners.set(owner,null);if(![...owners.values()].includes(id))free.push(id);};
 const acquire=owner=>{assert(cached!==null);owners.set(owner,cached);free=free.filter(id=>id!==cached);};
 emit('initial');assert.equal(allocate('A'),1);cached=1;emit('A_cache_full_block');
 acquire('B');emit('B_touch_same_key');release('A');emit('A_free');release('B');emit('B_free');
 emit('C_lookup_only');acquire('C');emit('C_touch_idle_block');release('C');emit('C_free');
 assert.equal(allocate('new2'),2);assert.equal(allocate('new3'),3);emit('allocate_preceding_free_ids');
 assert.equal(allocate('new1'),1);emit('reuse_cached_id_and_evict_hash');
 assert.equal(free.length,0);emit('exhaustion_rejected');
 for(const owner of ['new2','new3','new1'])release(owner);emit('final_cleanup');
 return rows;
}
const expected=expectedTrace();
function checkResult(r){
 assert.deepEqual([r.pool_slots,r.usable_blocks,r.null_block_id,r.block_size_positions,r.group_id,r.events_enabled],[4,3,0,4,0,false]);
 assert.equal(r.key,sha('fixed-prefix-A'));assert.equal(r.other_group_misses,true);
 assert.deepEqual(r.trace,expected,'independent owner/queue/hash ledger');
 assert.deepEqual(r.exhaustion,{type:'ValueError',message:'Cannot get 1 free blocks from the pool'});
 const before={...r.trace[9]},after={...r.trace[10]};delete before.stage;delete after.stage;assert.deepEqual(after,before,'exhaustion cannot alter state');
}
checkResult(record.result);
for(const mutate of [r=>r.trace[3].refcounts[1]=0,r=>r.trace[4].hit_ids=null,r=>r.trace[5].free_ids=[2,3],r=>r.trace[7].free_ids.reverse(),r=>r.trace[9].hashes[1]=r.key+'00000000',r=>r.trace[10].refcounts[1]++,r=>r.other_group_misses=false]){
 const changed=structuredClone(record.result);mutate(changed);assert.throws(()=>checkResult(changed),assert.AssertionError);
}
const sourceDir=process.env.VLLM_UPSTREAM_DIR,python=process.env.VLLM_PYTHON||'python3';
if(sourceDir){
 for(const e of manifest.files){
  const raw=fs.readFileSync(path.join(sourceDir,e.name));assert.equal(sha(raw),e.sha256);
  assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex'),e.git_blob_sha1);
 }
 const fresh=JSON.parse(execFileSync(python,['-B',folder+'block_lifecycle.py','--source-dir',path.resolve(sourceDir)],{encoding:'utf8',timeout:10000}));
 checkResult(fresh.result);assert.deepEqual(fresh.upstream,record.upstream);assert.deepEqual(fresh.source_sha256,record.source_sha256);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vllm-pinned-rejection-'));
try{
 fs.writeFileSync(path.join(temp,'block_pool.py'),'invalid bytes');
 const bad=spawnSync(python,['-B',folder+'fetch_upstream.py','--dest',temp],{encoding:'utf8',timeout:10000});
 assert.equal(bad.status,1);assert(bad.stderr.includes('unexpected upstream SHA-256'));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
const svg=fs.readFileSync('dist/diagrams/vllm-block-lifecycle.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]),{
 pool_slots:4,null_block:0,usable_blocks:3,shared_id:1,refcounts:[1,2,1,0],free_after_last_release:[2,3,1],allocation_order:[2,3,1],upstream_commit:commit,device_kv_tensors:false});
const context={};vm.createContext(context);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context,{filename:file});
}
const lesson=vm.runInContext('articles.find(a=>a.id==="inference-performance")',context);assert.equal(lesson.sections.length,8);
const html=lesson.sections[2][1],at=html.indexOf('<h3 id="vllm-block-lifecycle">');assert(at>html.indexOf('id="vllm-v1-request-path"'));
const bridge=html.slice(at);
for(const marker of ['diagrams/vllm-block-lifecycle.svg','labs/vllm-block-lifecycle.zip','labs/vllm-block-lifecycle/validation.json','labs/vllm-block-lifecycle/source-manifest.json'])assert(bridge.includes(marker),marker);
assert(!bridge.includes('<pre'),'new bridge adds no full source code blocks');
const files=['README.md','block_lifecycle.py','fetch_upstream.py','source-manifest.json','validation.json'];
assert.deepEqual(fs.readdirSync(folder).sort(),files.sort(),'do not redistribute upstream files');
execFileSync(python,['-B','-c',`
import json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
folder=Path(sys.argv[1]); names=json.load(sys.stdin)
root=ET.parse('dist/diagrams/vllm-block-lifecycle.svg').getroot()
assert root.attrib['width']=='960'
for t in root.iter('{http://www.w3.org/2000/svg}text'):
 assert float(t.attrib.get('font-size','20'))>=18
with ZipFile(folder.with_suffix('.zip')) as z:
 assert sorted(z.namelist())==sorted(folder.name+'/'+n for n in names)
 assert z.testzip() is None
 for n in names: assert z.read(folder.name+'/'+n)==(folder/n).read_bytes()
`,folder],{input:JSON.stringify(files)});
console.log('PASS: 12 upstream allocator record states independently reconstructed; lookup/touch, free vs eviction, exhaustion, wrong-group miss, source/manifest hashes, corrupt-source rejection, SVG/bridge/ZIP.'+(sourceDir?' Actual pinned upstream AST replay also passed.':' Offline record audit; set VLLM_UPSTREAM_DIR for actual upstream AST replay.'));
