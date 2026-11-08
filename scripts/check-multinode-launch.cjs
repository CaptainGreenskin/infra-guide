/* Actual four-worker launch evidence with an independent work/rank/state contract. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),crypto=require('crypto'),vm=require('vm'),os=require('os'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'dist/labs/multinode-launch');
const read=name=>fs.readFileSync(path.join(dir,name));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const saved=JSON.parse(read('validation.json'));
function check(record){
 assert.equal(record.status,'passed_declared_numerical_contract');
 const e=record.environment;
 assert.equal(e.device,'cpu');assert.equal(e.backend,'gloo');assert.equal(e.physical_hosts,1);assert.equal(e.launchers,2);assert.equal(e.workers_per_launcher,2);
 assert.deepEqual(record.configuration,{samples:8192,world_size:4,hidden:32,batch_size_per_rank:64,accum:2,target_epochs:2,precision:'fp32',seed:23});
 const expectedRanks=[{rank:0,local_rank:0,group_rank:0},{rank:1,local_rank:1,group_rank:0},{rank:2,local_rank:0,group_rank:1},{rank:3,local_rank:1,group_rank:1}];
 function rankProof(run){
  assert.equal(run.all_workers_same_host,true);
  assert.equal(run.rank_observations.length,4);assert.equal(run.commands.length,2);
  for(let i=0;i<4;i++){
   const row=run.rank_observations[i];for(const[key,value]of Object.entries(expectedRanks[i]))assert.equal(row[key],value,key+' '+i);
   assert.equal(row.world_size,4);assert.equal(row.local_world_size,2);assert.equal(row.role_rank,i);
   assert.equal(row.rank,row.group_rank*2+row.local_rank);
   assert(!('_host' in row),'do not publish machine names');
  }
  for(let node=0;node<2;node++)for(const arg of ['--nnodes=2','--nproc-per-node=2','--node-rank='+node,'--master-addr=127.0.0.1','--master-port=<loopback-port>'])assert(run.commands[node].includes(arg));
 }
 // Fixed sample conservation and accumulation are calculated independently of report fields.
 const perRank=8192/4,smallBatches=perRank/64,updates=smallBatches/2;
 assert.equal(perRank,2048);assert.equal(smallBatches,32);assert.equal(updates,16);
 for(const[label,epochs,start]of [['full',[1,2],0],['split',[1],0],['resumed',[2],1],['repeat_full',[1,2],0]]){
  const run=record.runs[label];rankProof(run);assert.deepEqual(run.launcher_exit_codes,[0,0]);assert(run.checkpoint_created);
  const first=run.records.find(r=>r.event==='start');assert.equal(first.world_size,4);assert.equal(first.backend,'gloo');assert.equal(first.effective_batch,64*2*4);assert.equal(first.start_epoch,start);
  const rows=run.records.filter(r=>r.event==='epoch');assert.deepEqual(rows.map(r=>r.epoch),epochs);
  for(const r of rows){assert.equal(r.samples,8192);assert.equal(r.attempted_update_windows,updates);assert.equal(r.applied_optimizer_steps,updates);assert.equal(r.optimizer_steps,updates);assert(Number.isFinite(r.loss));}
  assert.equal(run.applied_calls_per_rank,epochs.length*updates);
 }
 assert.equal(record.runs.full.applied_calls_per_rank,record.runs.split.applied_calls_per_rank+record.runs.resumed.applied_calls_per_rank);
 assert.deepEqual(record.final_state,{next_epoch:2,rng_rank_count:4,compared_fields:['model','next_epoch','optimizer','rng_by_rank','scaler','signature']});
 for(const[original,numerical]of [['full_state_comparison','recovery_numerical_comparison'],['continuous_repeat_comparison','continuous_repeat_numerical_comparison']]){
  const exact=record[original],r=record[numerical];assert.deepEqual(r.contract,{floating_atol:1e-6,floating_rtol:0,rng_counters_metadata:'exact'});assert.equal(r.within_declared_contract,true);
  assert.equal(r.bitwise_equal,exact.exit_code===0);assert.equal(r.bitwise_equal,r.different_float_tensors.length===0);
  let maximum=0;
  for(const row of r.different_float_tensors){
   assert(/^state\.(model|optimizer)\./.test(row.path)&&!row.path.endsWith('.step'),row.path+': only declared floating state uses a tolerance');
   assert(Number.isFinite(row.max_absolute_error)&&row.max_absolute_error>0&&row.max_absolute_error<=1e-6);assert(Number.isSafeInteger(row.differing_elements)&&row.differing_elements>0);
   maximum=Math.max(maximum,row.max_absolute_error);
  }
  assert.equal(r.max_absolute_error,maximum);
  if(!r.bitwise_equal)assert(exact.message.includes('tensor values differ'));
 }
 const bad=record.negative_probes.changed_configuration;rankProof(bad);assert(bad.launcher_exit_codes.every(n=>n!==0));assert.equal(bad.checkpoint_created,false);assert.equal(bad.matched_error,'Resume requires the same world size, device, precision and training settings');
 for(const[key,field]of [['changed_optimizer','state.optimizer.state'],['changed_rank_rng','state.rng_by_rank[1].cpu']]){
  const p=record.negative_probes[key];assert.notEqual(p.exit_code,0);assert.equal(p.model_weights_unchanged,true);assert.equal(p.matched_error,field);
 }
 for(const scope of ['multiple physical hosts','CUDA/NCCL','GPU/LLM performance','arbitrary mid-step crash','power loss','Kubernetes/cloud networking'])assert(record.not_executed.includes(scope));
}
check(saved);
// Freeze the observed result, rather than replacing an exact failure with a pass.
assert.equal(saved.full_state_comparison.exit_code,1);assert.equal(saved.recovery_numerical_comparison.bitwise_equal,false);assert.equal(saved.recovery_numerical_comparison.max_absolute_error,7.450580596923828e-9);
for(const file of ['verify_launch.py','launch_worker.py','train_ddp.py','compare_checkpoints.py'])assert.equal(saved.source_sha256[file],hash(read(file)),file+': actual record/source binding');
for(const file of ['train_ddp.py','compare_checkpoints.py'])assert(read(file).equals(fs.readFileSync(path.join(root,'dist/labs/ddp',file))),file+': original trainer/comparator stays unchanged');
const c={};vm.createContext(c);for(const[,file]of fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),c,{filename:file});
const data=vm.runInContext('({source:multinodeLaunchSource,worker:multinodeLaunchWorkerSource,record:multinodeLaunchValidation,article:articles.find(a=>a.id==="multinode-lab")})',c);
assert.equal(data.source,read('verify_launch.py').toString());assert.equal(data.worker,read('launch_worker.py').toString());assert.deepEqual(JSON.parse(JSON.stringify(data.record)),saved);
const html=fs.readFileSync(path.join(root,'dist/article/multinode-lab/index.html'),'utf8');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const pre=[...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]).trim());
for(const file of ['verify_launch.py','launch_worker.py'])assert(pre.includes(read(file).toString().trim()),file+': full source on page');
assert(html.includes('id="multinode-launch-run"')&&html.includes('labs/multinode-launch.zip'));
assert(html.includes('7.450580596923828e-9')||html.includes('7.45e-9')||html.includes('7.45×10'));
assert(/逐位|位级/.test(html)&&/1e-6|10⁻⁶|10<sup>−6/.test(html));
const mutations=[r=>{r.runs.full.rank_observations[2].local_rank=2;},r=>{r.runs.resumed.records.find(x=>x.event==='epoch').applied_optimizer_steps=15;},r=>{r.final_state.rng_rank_count=3;},r=>{r.recovery_numerical_comparison.bitwise_equal=true;},r=>{r.recovery_numerical_comparison.contract.floating_atol=1e-4;},r=>{r.environment.physical_hosts=2;},r=>{r.negative_probes.changed_rank_rng.model_weights_unchanged=false;},r=>{r.negative_probes.changed_configuration.checkpoint_created=true;}];
for(const mutate of mutations){const r=structuredClone(saved);mutate(r);assert.throws(()=>check(r),'proof mutation must be rejected');}
cp.execFileSync('python3',['-c',`from pathlib import Path
import zipfile
root=Path(${JSON.stringify(dir)})
with zipfile.ZipFile(str(root)+'.zip') as z:
 assert z.testzip() is None
 files=sorted(p for p in root.iterdir() if p.is_file())
 assert sorted(z.namelist())==['multinode-launch/'+p.name for p in files]
 for p in files: assert z.read('multinode-launch/'+p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
if(process.env.INFRA_LAUNCH_PYTHON){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'infra-launch-recheck-'));try{const target=path.join(temp,'run.json');cp.execFileSync(process.env.INFRA_LAUNCH_PYTHON,['-B',path.join(dir,'verify_launch.py'),'--report',target],{encoding:'utf8',timeout:510000,maxBuffer:1024*1024});check(JSON.parse(fs.readFileSync(target)));}finally{fs.rmSync(temp,{recursive:true,force:true});}}
console.log('PASS: actual two-launcher/four-worker CPU rank allocation, independent8192→32→16 work, intact source/ZIP and all-state comparison; observed bitwise failure stays visible, declared1e-6/RNG-exact contract and three rejection probes verified. '+mutations.length+' false-proof mutations rejected. No physical-host/GPU/performance inference.');
