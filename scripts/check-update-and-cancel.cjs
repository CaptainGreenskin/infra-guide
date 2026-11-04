const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({updateCancelFiles,updateCancelValidation})',c);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[id,name]of [['distributed-training','update_windows.py'],['agent-recovery','cancel_receipts.py']]){
 const source=fs.readFileSync('dist/labs/update-and-cancel/'+name,'utf8');
 assert.equal(d.updateCancelFiles[name],source);
 const record=d.updateCancelValidation.programs[name];
 assert.equal(record.sha256,crypto.createHash('sha256').update(source).digest('hex'));
 assert.equal(record.exit_code,0);assert(record.python);
 const html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),'static full source mismatch: '+name);
 assert(html.includes('labs/update-and-cancel.zip'));
}

// CI does NOT run PyTorch. Independently derive the recorded trajectory with
// elementary derivatives of mean squared error, clipping and SGD momentum.
const report=d.updateCancelValidation.programs['update_windows.py'].result;
assert.equal(report.backend,'gloo');assert.equal(report.world_size,2);assert.equal(report.device,'cpu');
assert.equal(report.dtype,'float64');assert.equal(report.attempted_windows,3);
assert.equal(report.actual_updates,2);assert.equal(report.empty_windows,1);
const close=(a,b)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert(Math.abs(x-b[i])<1e-11,`${x} != ${b[i]}`));};
const windows=[
 [[[1,0],1],[[0,1],0],[[1,1],1],[[0,2],0],[[2,0],2],[[1,2],1],[[2,1],2]],
 [],
 [[[1,0],1],[[0,1],-0.2],[[1,1],0.4]]
];
let theta=[0.2,-0.3,0.1],momentum=[0,0,0],updates=0;
for(let i=0;i<windows.length;i++){
 const data=windows[i],actual=report.ranks[0].global_mean[i],baseline=report.single_process[i];
 assert.equal(actual.global_count,data.length);
 assert.equal(actual.microbatches,[2,2,1][i]);
 assert.deepEqual(actual.backward_sync,[[false,true],[],[true]][i]);
 assert.equal(actual.skipped,data.length===0);
 if(data.length){
  let grad=[0,0,0];
  for(const[x,y]of data){const residual=theta[0]*x[0]+theta[1]*x[1]+theta[2]-y;[x[0],x[1],1].forEach((v,k)=>grad[k]+=2*residual*v/data.length);}
  close(actual.gradient_before_clip,grad);close(baseline.gradient_before_clip,grad);
  const norm=Math.hypot(...grad),factor=Math.min(1,1/(norm+1e-6));
  assert(Math.abs(actual.norm_before_clip-norm)<1e-11);
  grad=grad.map(x=>x*factor);close(actual.gradient_after_clip,grad);
  momentum=momentum.map((v,k)=>0.9*v+grad[k]);
  theta=theta.map((v,k)=>v-0.1*momentum[k]);updates++;
 }
 close(actual.parameters,theta);close(actual.momentum,momentum);
 close(baseline.parameters,theta);close(baseline.momentum,momentum);
 assert.equal(actual.actual_updates,updates);
}
for(const policy of ['global_mean','micro_means','fixed_nominal_count']){
 assert.deepEqual(report.ranks[0][policy],report.ranks[1][policy]);
 const records=report.ranks[0][policy];
 close(records[0].parameters,records[1].parameters);
 close(records[0].momentum,records[1].momentum);
}
for(const policy of ['micro_means','fixed_nominal_count']){
 assert(Math.hypot(...report.ranks[0][policy][2].parameters.map((x,i)=>x-theta[i]))>0.01);
}
close(report.ranks[0].fixed_nominal_count[0].parameters,report.single_process[0].parameters);
close(report.ranks[0].fixed_nominal_count[2].gradient_before_clip,report.single_process[2].gradient_before_clip.map(x=>x/2));
close(report.clipping_counterexample.clip_after_mean,[3,1].map(x=>x/(Math.sqrt(10)+1e-6)));
close(report.clipping_counterexample.mean_after_local_clip,[3/(6+1e-6),1/(2+1e-6)]);

const cancel=JSON.parse(execFileSync('python3',['dist/labs/update-and-cancel/cancel_receipts.py'],{encoding:'utf8',timeout:25000}));
assert.deepEqual(cancel,d.updateCancelValidation.programs['cancel_receipts.py'].result);
assert.equal(cancel.authority,'one_local_sqlite');
assert.deepEqual(cancel.cases.pending,{worker_started:false,final:{state:'CANCELLED',effects:0}});
for(const mode of ['cooperative','noncooperative']){
 const row=cancel.cases[mode];assert(row.child_alive_after_request&&row.child_joined);
 assert.deepEqual(row.after_request,{state:'CANCEL_REQUESTED',effects:0});
 assert.deepEqual(row.final,{state:'CANCELLED',effects:0});
}
assert.equal(cancel.cases.cooperative.exit,'normal');assert.equal(cancel.cases.noncooperative.exit,'terminated');
assert.equal(cancel.cases.committed.cancel_reply,'too_late_committed');
assert.equal(cancel.cases.committed.exit,'terminated');
assert.deepEqual(cancel.cases.committed.final,{state:'SUCCEEDED',effects:1});

execFileSync('python3',['-c',`from pathlib import Path
import zipfile
with zipfile.ZipFile('dist/labs/update-and-cancel.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/update-and-cancel').iterdir():
  if p.is_file(): assert z.read('update-and-cancel/'+p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
for(const[route,anchor]of [['native','pod-stop-evidence'],['training','optimizer-update-window'],['agent','cancel-request-and-effect']]){
 const html=fs.readFileSync('dist/module/'+route+'/index.html','utf8');
 const start=html.indexOf('id="'+anchor+'"'),examples=html.indexOf('id="examples"');
 assert(start>=0&&examples>start,'knowledge must precede cases: '+route);
}
const native=fs.readFileSync('dist/article/k8s-workloads/index.html','utf8');
for(const term of ['successThreshold: 3','failureThreshold: 12','publishNotReadyAddresses','STOPSIGNAL','21s'])assert(native.includes(term));
assert(!fs.readFileSync('dist/resources/index.html','utf8').includes('github-projects'));
console.log('PASS: actual cancellation processes, independent gradient/clipping/momentum oracle, 2-rank record hashes, exact static code + ZIP, knowledge before cases. PyTorch record checked, not rerun in CI.');
