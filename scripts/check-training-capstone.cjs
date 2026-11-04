const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=vm.runInContext('({articles,trainingCapstoneFiles,trainingCapstoneValidation})',c);
const hash=raw=>crypto.createHash('sha256').update(raw).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const directory='dist/labs/training-capstone',saved=JSON.parse(fs.readFileSync(directory+'/validation.json','utf8'));
assert.deepEqual(JSON.parse(JSON.stringify(data.trainingCapstoneValidation)),saved);
const html=fs.readFileSync('dist/article/training-lab/index.html','utf8');
for(const name of ['verify_run.py','train_ddp.py','compare_checkpoints.py']){
 const raw=fs.readFileSync(directory+'/'+name),source=raw.toString();
 assert.equal(saved.source_sha256[name],hash(raw));assert.equal(data.trainingCapstoneFiles[name],source);
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': full static source');
 if(name!=='verify_run.py')assert.equal(source,fs.readFileSync('dist/labs/ddp/'+name,'utf8'),name+': canonical training program changed');
}
function check(record){
 assert.equal(record.status,'passed');assert.equal(record.environment.device,'cpu');assert.equal(record.environment.backend,'gloo');
 const cfg=record.configuration;
 assert.equal(cfg.world_size,2);assert.equal(cfg.samples,1024);assert.equal(cfg.batch_size_per_rank,32);assert.equal(cfg.accum,2);
 // Independent fixed-work oracle, not a quotient read back from the program's report.
 const perRank=512,microbatches=16,updates=8;assert.equal(perRank/cfg.batch_size_per_rank,microbatches);assert.equal(microbatches/cfg.accum,updates);
 for(const[label,epochs,start]of [['full',[1,2,3,4],0],['split',[1,2],0],['resumed',[3,4],2]]){
  const run=record.runs[label];assert.equal(run.exit_code,0);
  const first=run.records.find(r=>r.event==='start');assert.equal(first.start_epoch,start);assert.equal(first.world_size,2);assert.equal(first.effective_batch,128);
  const rows=run.records.filter(r=>r.event==='epoch');assert.deepEqual(rows.map(r=>r.epoch),epochs);
  for(const row of rows){assert.equal(row.samples,1024);assert.equal(row.attempted_update_windows,updates);assert.equal(row.applied_optimizer_steps,updates);assert(Number.isFinite(row.loss));}
  assert.equal(run.applied_calls_this_run,updates*epochs.length);
 }
 assert.equal(record.runs.full.applied_calls_this_run,record.runs.split.applied_calls_this_run+record.runs.resumed.applied_calls_this_run);
 assert.equal(record.full_state_comparison.exit_code,0);assert(record.full_state_comparison.message.includes('exactly equal'));
 assert.equal(record.final_state.next_epoch,4);assert.equal(record.final_state.rng_rank_count,2);
 assert.deepEqual(record.final_state.compared_fields,['model','next_epoch','optimizer','rng_by_rank','scaler','signature']);
 for(const key of ['nondivisible_window','changed_configuration']){const p=record.negative_probes[key];assert.notEqual(p.exit_code,0);assert.equal(p.checkpoint_created,false);assert(p.matched_error);}
 const probe=record.negative_probes.changed_optimizer_state;assert.notEqual(probe.exit_code,0);assert.equal(probe.model_weights_unchanged,true);assert.equal(probe.matched_error,'state.optimizer.state');
}
check(saved);
execFileSync('python3',['-c',`from pathlib import Path
import zipfile
root=Path('${directory}')
with zipfile.ZipFile('dist/labs/training-capstone.zip') as archive:
 assert archive.testzip() is None
 assert sorted(archive.namelist())==sorted('training-capstone/'+p.name for p in root.iterdir() if p.is_file())
 for p in root.iterdir():
  if p.is_file(): assert archive.read('training-capstone/'+p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
assert(html.indexOf('恢复的是下一次更新所需的状态')<html.indexOf('python verify_run.py'));
assert(html.includes('v29-training-recovery.svg')&&html.includes('labs/training-capstone.zip'));
if(process.env.INFRA_DDP_PYTHON){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'infra-capstone-recheck-'));
 try{const report=path.join(temporary,'report.json');execFileSync(process.env.INFRA_DDP_PYTHON,[directory+'/verify_run.py','--report',report],{encoding:'utf8',timeout:330000,maxBuffer:2*1024*1024});check(JSON.parse(fs.readFileSync(report,'utf8')));}
 finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
console.log('PASS: independent epoch/window arithmetic, exact canonical/inline/ZIP source, CPU recovery record and three negative probes; '+(process.env.INFRA_DDP_PYTHON?'actual two-process runs replayed.':'PyTorch record verified; set INFRA_DDP_PYTHON for actual replay.'));
