const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const readPage=chapter=>readFileSync('dist/article/'+chapter+'/index.html','utf8');

const db='dist/labs/innodb/',proof=json(db+'ci-record.json'),dbRecord=json(db+'validation.json');
assert.equal(proof.conclusion,'success');
assert.match(proof.headSha,/^[a-f0-9]{40}$/);
assert.match(proof.url,/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/);
assert.equal(proof.record_sha256,sha(db+'validation.json'));
assert.equal(proof.source_sha256,sha(db+'innodb_lab.py'));
execFileSync('python3',['-B',db+'innodb_lab.py','--check-record',db+'validation.json']);
assert.match(dbRecord.query.before.tree,/-> Sort:.*\n/);
assert.doesNotMatch(dbRecord.query.after.tree,/-> Sort:/);
assert.deepEqual(dbRecord.deadlock.after,[[1,133],[2,105]]);
assert.equal(dbRecord.deadlock.victim,'right');
const dbPage=readPage('database-index-locks');
for(const match of ['id="innodb-wait-graph"','id="native-innodb-lab"','diagrams/innodb-lock-waits.svg','labs/innodb.zip',proof.url]){
 assert(dbPage.includes(match),'InnoDB page missing '+match);
}

const ai='dist/labs/native-fsdp/',fsdp=json(ai+'validation.json');
assert.equal(fsdp.status,'passed');
assert.equal(fsdp.source_sha256['fsdp_lab.py'],sha(ai+'fsdp_lab.py'));
assert.deepEqual(fsdp.environment,{torch:'2.5.1',python:'3.12.13',backend:'gloo',device:'cpu',dtype:'torch.float64',world_size:2});
assert.deepEqual(fsdp.tolerance,{atol:1e-12,rtol:0});
const close=(got,want)=>{
 const actual=[got].flat(Infinity),expected=[want].flat(Infinity);
 assert.equal(actual.length,expected.length);
 actual.forEach((value,i)=>assert(Math.abs(value-expected[i])<1e-12,[value,expected[i]].join(' vs ')));
};
const x=[[1,2],[0,-1],[2,1]],y=[[0,1],[1,0],[-.75,1]],initial=[.25,-.5,.75,.125,0,0];
assert.deepEqual(fsdp.fixture.x,x);
assert.deepEqual(fsdp.fixture.y,y);
assert.deepEqual([fsdp.model.weight,fsdp.model.bias].flat(Infinity),initial);
assert.equal(fsdp.fixture.target_count,6);
assert.deepEqual(fsdp.optimizer,{name:'Adam',learning_rate:.02});
const rowsByRank=[[0],[1,2]];
const score=(p,rows)=>{
 const gradient=initial.map(()=>0),output=[];
 let loss=0;
 for(const row of rows){
  const [a,b]=x[row],prediction=[p[0]*a+p[1]*b+p[4],p[2]*a+p[3]*b+p[5]];
  output.push(prediction);
  prediction.forEach((value,k)=>{
   const e=value-y[row][k];
   loss+=.5*e*e;
   gradient[k*2]+=e*a;
   gradient[k*2+1]+=e*b;
   gradient[4+k]+=e;
  });
 }
 return {gradient:gradient.map(g=>g/(2*rows.length)),loss:loss/(2*rows.length),output};
};
const wrong=score(initial,[0]).gradient.map((g,i)=>(g+score(initial,[1,2]).gradient[i])/2);
const correct=score(initial,[0,1,2]).gradient;
close(fsdp.fixture.first_wrong_gradient,wrong);
close(fsdp.fixture.first_global_gradient,correct);
close(Math.max(...wrong.map((g,i)=>Math.abs(g-correct[i]))),17/96);
const p=initial.slice(),m=initial.map(()=>0),v=initial.map(()=>0);
for(let step=1;step<=2;step++){
 const {gradient,loss,output}=score(p,[0,1,2]);
 gradient.forEach((g,i)=>{
  m[i]=.9*m[i]+.1*g;
  v[i]=.999*v[i]+.001*g*g;
  p[i]-=.02*(m[i]/(1-.9**step))/(Math.sqrt(v[i]/(1-.999**step))+1e-8);
 });
 assert.equal(fsdp.ranks.length,2);
 for(const [rank,result] of fsdp.ranks.entries()){
  const rows=rowsByRank[rank],slice=a=>a.slice(rank*3,rank*3+3);
  assert.equal(result.rank,rank);
  assert.deepEqual(result.rows,rows);
  assert.equal(result.local_target_count,rows.length*2);
  assert.equal(result.sharding_strategy,'FULL_SHARD');
  assert.deepEqual(result.initial_shard,slice(initial));
  close(result.negative_local_means.wrong_local_mean_gradient,slice(wrong));
  assert.equal(result.updates.length,2);
  const update=result.updates[step-1];
  assert.equal(update.step,step);
  close(update.dense_loss_before_update,loss);
  close(update.dense_gradient,gradient);
  close(update.local_forward,rows.map(i=>output[i]));
  close(update.local_gradient,slice(gradient));
  close(update.local_parameters_after_update,slice(p));
  close(update.local_adam.exp_avg,slice(m));
  close(update.local_adam.exp_avg_sq,slice(v));
  assert.equal(update.local_adam.step,step);
  assert.deepEqual(update.wrapped_layer_during_forward,{weight:[2,2],bias:[2]});
  assert.equal(update.parameter_elements_after_forward,3);
  const full=update.full_state_on_this_rank;
  close([full.parameters.weight,full.parameters.bias],p);
  close([full.adam.weight.exp_avg,full.adam.bias.exp_avg],m);
  close([full.adam.weight.exp_avg_sq,full.adam.bias.exp_avg_sq],v);
  assert.equal(full.adam.weight.step,step);
  assert.equal(full.adam.bias.step,step);
  for(const key of ['c10d::allgather_','gloo:all_gather','c10d::_reduce_scatter_base_','gloo:all_reduce']){
   assert.equal(update.native_collective_events[key],1,key);
  }
 }
}
const fsdpPage=readPage('distributed-training');
for(const match of ['id="native-fsdp-run"','diagrams/native-fsdp-state.svg','labs/native-fsdp.zip','article/checkpoint-recovery/#torch-checkpoint-run']){
 assert(fsdpPage.includes(match),'FSDP page missing '+match);
}
console.log('PASS: native InnoDB plans, wait edge, deadlock and committed receipts; native FSDP trace and every shard/full state re-derived for two Adam steps.');
