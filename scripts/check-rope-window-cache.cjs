const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const pack='rope-window-cache';
const folder=path.join(root,'dist','labs',pack);
const read=file=>fs.readFileSync(path.join(folder,file));
const sources=['README.md','requirements.txt','rope_window_cache.py'];
const published=JSON.parse(read('validation.json'));
const tolerance=1e-12;
const equal=(a,b)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);

function rotate(row,position,frequencies){
 return frequencies.flatMap((frequency,pair)=>{
  const [x,y]=row.slice(2*pair,2*pair+2);
  const c=Math.cos(position*frequency),s=Math.sin(position*frequency);
  return [x*c-y*s,x*s+y*c];
 });
}

function scalar(fixture,head,query,keys,phase){
 const {q,k,v,frequencies}=fixture;
 const x=rotate(q[head][query],phase(query),frequencies);
 const scores=keys.map(key=>rotate(k[head][key],phase(key),frequencies)
  .reduce((sum,component,i)=>sum+component*x[i],0)/Math.sqrt(x.length));
 const peak=Math.max(...scores),weights=scores.map(n=>Math.exp(n-peak));
 const total=weights.reduce((sum,n)=>sum+n,0);
 return v[head][0].map((_,i)=>keys.reduce((sum,key,j)=>sum+weights[j]*v[head][key][i],0)/total);
}

function verify(report){
 assert.equal(report.schema,'rope-window-cache-v1');
 assert.equal(report.status,'passed');
 assert.equal(report.environment.torch.split('+')[0],'2.5.1');
 assert.equal(report.environment.device,'cpu');
 assert.equal(report.environment.dtype,'float64');
 assert(report.environment.profile_events.includes('aten::_scaled_dot_product_attention_math'));
 assert.deepEqual(report.source_sha256,Object.fromEntries(sources.map(name=>
  [name,createHash('sha256').update(read(name)).digest('hex')])));
 const fixture=report.fixture,{window,chunks}=fixture;
 assert.deepEqual([window,chunks,fixture.frequencies],[4,[3,2,1,3],[0.8,0.3]]);
 const positions=Array.from({length:9},(_,i)=>i);
 for(const [name,multiplier] of [['q',7],['k',11],['v',13]]){
  const expected=[0,1].map(head=>positions.map(pos=>[0,1,2,3].map(feature=>
   ((((head*36+pos*4+feature+1)*multiplier)%29)-14)/8)));
  assert.deepEqual(fixture[name],expected);
 }
 const allKeys=query=>positions.filter(key=>key<=query&&query-key<window);
 for(const head of [0,1]) for(const query of positions)
  scalar(fixture,head,query,allKeys(query),position=>position)
   .forEach((value,i)=>equal(report.reference[head][query][i],value));
 assert.deepEqual(Object.keys(report.runs).sort(),['logical','remapped','slot_phase','write_first']);
 for(const [mode,run] of Object.entries(report.runs)){
  const slot=mode==='remapped'?position=>(3*position+1)%window:position=>position%window;
  const phase=mode==='slot_phase'?slot:position=>position;
  let start=0,slots=Array(window).fill(null);
  const deltas=[];
  assert.equal(run.steps.length,chunks.length);
  for(const [step,count] of chunks.entries()){
   const before=slots,queries=positions.slice(start,start+count);
   slots=before.slice();
   for(const position of queries)slots[slot(position)]=position;
   const candidates=mode==='write_first'?slots.filter(n=>n!==null):before.filter(n=>n!==null).concat(queries);
   const visible=queries.map(query=>candidates.filter(key=>allKeys(query).includes(key)));
   assert.deepEqual(run.steps[step],{queries,phase_positions:queries.map(phase),slots_before:before,
    candidate_keys:candidates,visible_keys:visible,slots_after:slots});
   for(const [index,query] of queries.entries()){
    let delta=0;
    for(const head of [0,1])scalar(fixture,head,query,visible[index],phase).forEach((value,i)=>{
     const actual=run.output[head][query][i];
     equal(actual,value);
     delta=Math.max(delta,Math.abs(actual-report.reference[head][query][i]));
    });
    deltas.push(delta);
   }
   start+=count;
  }
  equal(run.max_abs_error,Math.max(...deltas));
  const first=deltas.findIndex(n=>n>tolerance);
  assert.equal(run.first_different_query,first<0?null:first);
  assert.equal(run.first_different_query,{logical:null,remapped:null,slot_phase:4,write_first:3}[mode]);
 }
}
verify(published);
for(const mutate of [
 report=>{report.runs.logical.steps[1].visible_keys[0].shift();},
 report=>{report.runs.remapped.steps[1].slots_after[1]=0;},
 report=>{report.runs.slot_phase.steps[1].phase_positions[1]=4;},
 report=>{report.runs.write_first.output[0][3][0]=report.reference[0][3][0];},
]){
 const changed=structuredClone(published);
 mutate(changed);
 assert.throws(()=>verify(changed),assert.AssertionError);
}
if(process.env.ROPE_WINDOW_PYTHON){
 const replay=execFileSync(process.env.ROPE_WINDOW_PYTHON,['-B','rope_window_cache.py'],{cwd:folder,encoding:'utf8'});
 verify(JSON.parse(replay));
}
const svg=fs.readFileSync(path.join(root,'dist','diagrams','rope-window-wrap.svg'),'utf8');
const {queries,slots_before,visible_keys,slots_after}=published.runs.logical.steps[1];
assert.deepEqual(JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]),{
 record:'labs/rope-window-cache/validation.json',step:1,queries,slots_before,visible_keys,slots_after,
 early_visible:published.runs.write_first.steps[1].visible_keys[0],
});
const lesson=slug=>fs.readFileSync(path.join(root,'dist','article',slug,'index.html'),'utf8');
const position=lesson('position-encoding').split('id="native-rope-window-cache"')[1].split('id="section-7"')[0];
const serving=lesson('model-serving').split('id="serving-rope-window-handoff"')[1].split('id="section-4"')[0];
assert(position.includes('diagrams/rope-window-wrap.svg')&&position.includes('/article/model-serving/#serving-rope-window-handoff'));
assert(serving.includes('/article/position-encoding/#native-rope-window-cache'));
for(const mode of ['slot_phase','write_first']){
 const run=published.runs[mode];
 assert(position.includes('<td>'+run.first_different_query+'</td><td>约 '+run.max_abs_error.toFixed(5)+'</td>'));
}
const members=execFileSync('unzip',['-Z1',folder+'.zip'],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(members,[...sources,'validation.json'].map(name=>pack+'/'+name).sort());
for(const name of members)assert.deepEqual(execFileSync('unzip',['-p',folder+'.zip',name]),read(path.basename(name)));
console.log('PASS: native CPU SDPA, two physical maps, two first-error controls, scalar RoPE/attention oracle, precise reading links and archive.');
