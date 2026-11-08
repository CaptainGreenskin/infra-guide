/* Independent scalar JS gradients/SGD versus the actual two-worker CPU record.
   Optional replay uses the pinned local PyTorch; no GPU/FSDP result inferred. */
const fs=require('fs'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const folder='dist/labs/manual-sharding/',record=JSON.parse(fs.readFileSync(folder+'validation.json','utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const[file,expected]of Object.entries(record.source_sha256))assert.equal(hash(fs.readFileSync(folder+file)),expected,file+': execution source changed');
assert.equal(record.status,'passed');assert.equal(record.negative_probe.exit_code,1);assert(record.negative_probe.gradient_comparison_failed);
const shapes=[[4,6],[6,3]],X=[[1,0,-1,2],[2,1,0,-1],[0,3,1,1]],Y=[[0,1,-1],[1,-1,0],[1,0,1]];
const W=shapes.map(([a,b])=>Array.from({length:a*b},(_,i)=>i/50-.2)),momentum=W.map(w=>w.map(()=>0));
let gradients,losses=[];
for(let step=0;step<3;step++){
 const hidden=X.map(x=>Array.from({length:6},(_,j)=>Math.tanh(x.reduce((s,v,i)=>s+v*W[0][i*6+j],0))));
 const prediction=hidden.map(h=>Array.from({length:3},(_,j)=>h.reduce((s,v,i)=>s+v*W[1][i*3+j],0)));
 const delta=prediction.map((row,n)=>row.map((v,j)=>(v-Y[n][j])/9));
 losses.push(prediction.reduce((s,row,n)=>s+row.reduce((sum,v,j)=>sum+.5*(v-Y[n][j])**2/9,0),0));
 gradients=W.map(w=>w.map(()=>0));
 for(let n=0;n<3;n++)for(let i=0;i<6;i++)for(let j=0;j<3;j++)gradients[1][i*3+j]+=hidden[n][i]*delta[n][j];
 for(let n=0;n<3;n++)for(let h=0;h<6;h++){
  const dz=delta[n].reduce((s,v,j)=>s+v*W[1][h*3+j],0)*(1-hidden[n][h]**2);
  for(let i=0;i<4;i++)gradients[0][i*6+h]+=X[n][i]*dz;
 }
 for(let layer=0;layer<2;layer++)for(let i=0;i<W[layer].length;i++){
  momentum[layer][i]=.9*momentum[layer][i]+gradients[layer][i];
  W[layer][i]-=.05*momentum[layer][i];
 }
}
function check(result){
 assert.equal(result.torch,'2.5.1');assert.equal(result.backend,'gloo');assert.equal(result.device,'cpu');
 assert.deepEqual(result.workers.map(w=>w.rank),[0,1]);assert.deepEqual(result.workers.map(w=>w.local_samples),[1,2]);
 const close=(actual,expected)=>{assert.equal(actual.length,expected.length);for(let i=0;i<expected.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-12,`scalar oracle mismatch at ${i}: ${actual[i]} / ${expected[i]}`);};
 for(const worker of result.workers){
  for(const key of ['owned_parameter_elements','owned_gradient_elements','owned_momentum_elements'])assert.equal(worker[key],21);
  assert.equal(worker.steps.length,3);close(worker.steps.map(s=>s.global_loss),losses);
  for(const step of worker.steps)assert(step.max_owned_gradient_error>=0&&step.max_owned_gradient_error<1e-12);
  for(let layer=0;layer<2;layer++){
   const n=W[layer].length/2,range=values=>values.slice(worker.rank*n,(worker.rank+1)*n);
   close(worker.owned_parameters[layer],range(W[layer]));
   close(worker.owned_last_gradient[layer],range(gradients[layer]));
   close(worker.owned_momentum[layer],range(momentum[layer]));
  }
 }
}
check(record.result);
const page=fs.readFileSync('dist/article/distributed-training/index.html','utf8'),decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1]).trim()===fs.readFileSync(folder+'shard_linear.py','utf8').trim()));
const figure=fs.readFileSync('dist/diagrams/sharding-lifetimes.svg','utf8'),metadata=JSON.parse(figure.match(/<metadata>([\s\S]*?)<\/metadata>/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
assert.equal(metadata.full_parameter_elements,42);assert.equal(metadata.owned_parameters,21);assert.deepEqual(metadata.full_weight_during_phase,[24,18,18,24,0]);assert.deepEqual(metadata.owned_gradient_after_phase,[0,0,9,21,21]);assert.equal(metadata.measured_gpu_memory,false);
// The four-state ledger uses FP32 Adam. The executable uses float64 SGD.
assert.deepEqual([16,8+8/4,4+12/4,16/4],[16,10,7,4]);
if(process.env.INFRA_TORCH_PYTHON){
 check(JSON.parse(cp.execFileSync(process.env.INFRA_TORCH_PYTHON,['-B',folder+'shard_linear.py'],{encoding:'utf8',timeout:40000})));
 const negative=cp.spawnSync(process.env.INFRA_TORCH_PYTHON,['-B',folder+'shard_linear.py','--wrong-rank-mean'],{encoding:'utf8',timeout:40000});
 assert.equal(negative.status,1);assert(negative.stderr.includes('Tensor-likes are not close'));
}
console.log('PASS: independent scalar forward/backward/three-step momentum oracle matches both actual CPU workers; unequal inputs, original full source, real incorrect-denominator rejection and logical lifetime matrix. GPU/FSDP API not inferred.');
