const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const name='pipeline-schedules',folder='dist/labs/'+name+'/',archive='dist/labs/'+name+'.zip';
const read=file=>fs.readFileSync(folder+file);
const record=JSON.parse(read('validation.json'));
const params=[{'0.weight':[[1,1],[2,-1]],'0.bias':[0.5,-0.5]},
 {weight:[[0.25,-0.5]],bias:[0.125]}];
const inputs=[[1,2],[2,-1],[-1,3],[3,1]],targets=[[0.5],[-1.25],[1],[0]],lr=0.125;
const predictions=[],squares=[];
const first={'0.weight':[[0,0],[0,0]],'0.bias':[0,0]},last={weight:[[0,0]],bias:[0]};
for(const [index,x] of inputs.entries()){
 const raw=params[0]['0.weight'].map((row,j)=>row[0]*x[0]+row[1]*x[1]+params[0]['0.bias'][j]);
 const hidden=raw.map(value=>Math.max(value,0));
 const prediction=hidden[0]/4-hidden[1]/2+1/8;
 const error=prediction-targets[index][0],delta=2*error/inputs.length;
 predictions.push([prediction]);squares.push(error**2);
 last.bias[0]+=delta;
 for(let j=0;j<hidden.length;j++){
  last.weight[0][j]+=delta*hidden[j];
  const upstream=raw[j]>0?delta*params[1].weight[0][j]:0;
  first['0.bias'][j]+=upstream;
  for(let k=0;k<x.length;k++)first['0.weight'][j][k]+=upstream*x[k];
 }
}
const add=(shape,other,fn)=>shape.map((value,i)=>Array.isArray(value)?add(value,other[i],fn):fn(value,other[i]));
const scale=(shape,factor)=>shape.map(value=>Array.isArray(value)?scale(value,factor):value*factor);
function rankOracle(rank,factor){
 const gradients=Object.fromEntries(Object.entries([first,last][rank]).map(([key,values])=>[key,scale(values,factor)]));
 const updated=Object.fromEntries(Object.entries(params[rank]).map(([key,values])=>[key,add(values,gradients[key],(v,g)=>v-lr*g)]));
 return {gradients,updated};
}
const order=codes=>codes.split(' ');
const gpipe=order('F0 F1 F2 F3 B0 B1 B2 B3');
const expectedOrders={gpipe:[gpipe,gpipe],
 '1f1b':[order('F0 F1 B0 F2 B1 F3 B2 B3'),order('F0 B0 F1 B1 F2 B2 F3 B3')],
 wrong_local_mean:[gpipe,gpipe]};
function verify(data){
 assert.equal(data.status,'passed');
 assert.deepEqual(data.inputs,inputs);
 assert.deepEqual(data.targets,targets);
 assert.equal(data.microbatches,inputs.length);
 assert.equal(data.lr,lr);
 assert.equal(data.environment.device,'cpu');
 assert.equal(data.environment.backend,'gloo');
 assert.equal(data.environment.world_size,2);
 assert.equal(data.environment.torch,'2.5.1');
 assert.deepEqual(data.reference,{predictions,mean_loss:squares.reduce((sum,x)=>sum+x,0)/4,ranks:[rankOracle(0,1),rankOracle(1,1)]});
 assert.deepEqual(Object.keys(data.schedules),Object.keys(expectedOrders));
 const peaks={};
 for(const [key,result] of Object.entries(data.schedules)){
  const factor=key==='wrong_local_mean'?4:1;
  assert.equal(result.gradient_scale_vs_dense,factor);
  assert.equal(result.p2p_work_policy,key==='1f1b'?'retain_all_handles':'upstream_default');
  assert.equal(result.ranks.length,2);
  peaks[key]=result.ranks.map((rank,index)=>{
   assert.deepEqual(rank.events,expectedOrders[key][index]);
   const pending=new Set();
   const counts=rank.events.map(([event,microbatch])=>{
    if(event==='F'){assert(!pending.has(microbatch));pending.add(microbatch);}
    else assert(pending.delete(microbatch));
    return pending.size;
   });
   assert.equal(pending.size,0);
   assert.deepEqual(rank.pending_after_each_event,counts);
   assert.equal(rank.max_pending,Math.max(...counts));
   const {gradients,updated}=rankOracle(index,factor);
   assert.deepEqual(rank.gradients,gradients);
   assert.deepEqual(rank.updated,updated);
   return rank.max_pending;
  });
  assert.deepEqual(result.ranks[1].predictions,predictions);
  assert.deepEqual(result.ranks[1].losses,squares.map(x=>x*factor/4));
  assert.equal(result.max_prediction_error,0);
  assert.equal(result.max_gradient_error,(factor-1)*3.375);
  assert.equal(result.max_step_error,(factor-1)*3.375*lr);
 }
 return peaks;
}
const peaks=verify(record);
assert.deepEqual(peaks,{gpipe:[4,4],'1f1b':[2,1],wrong_local_mean:[4,4]});
for(const mutate of [
 value=>value.schedules['1f1b'].ranks[0].events[2]='B3',
 value=>value.schedules.gpipe.ranks[1].gradients.bias[0]=0,
 value=>value.schedules.wrong_local_mean.max_gradient_error=0,
]){
 const altered=structuredClone(record);mutate(altered);
 assert.throws(()=>verify(altered),assert.AssertionError);
}
const files=['README.md','pipeline_schedules.py','requirements.txt','validation.json'];
const sha=data=>createHash('sha256').update(data).digest('hex');
assert.deepEqual(record.source_sha256,Object.fromEntries(files.slice(0,-1).map(file=>[file,sha(read(file))])));
assert.deepEqual(execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n'),files.map(file=>name+'/'+file));
for(const file of files)assert.deepEqual(execFileSync('unzip',['-p',archive,name+'/'+file]),read(file));
const svg=fs.readFileSync('dist/diagrams/pipeline-schedules.svg','utf8');
const figure=JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]);
assert.deepEqual(figure,{gpipe:{events:expectedOrders.gpipe,peaks:peaks.gpipe},'1f1b':{events:expectedOrders['1f1b'],peaks:peaks['1f1b']}});
const page=fs.readFileSync('dist/article/tensor-parallel-math/index.html','utf8');
for(const marker of ['id="native-pipeline-schedules"','diagrams/pipeline-schedules.svg','labs/pipeline-schedules.zip','labs/pipeline-schedules/validation.json','0.390625'])assert(page.includes(marker),marker);
console.log('PASS: actual two-rank GPipe and adapted 1F1B traces, independently differentiated loss and SGD step, wrong denominator, bound source, ZIP and figure.');
