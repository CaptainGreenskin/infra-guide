/* Bind live Prometheus samples and rule-state transitions to the fixture. */
const assert=require('node:assert/strict');
const {readFileSync,mkdtempSync,rmSync}=require('node:fs');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const vm=require('node:vm');
const lab='prometheus-live-burn', folder='dist/labs/'+lab+'/', anchor='live-prometheus-burn';
const files=['README.md','ci-record.json','live-burn.rules.yaml','prometheus_live_burn.py','validation.json'];
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const thresholds={seconds:[6,16],hold:4,ratio:0.0144};
const expectedSources=Object.fromEntries(files.filter(f=>/\.(yaml|py)$/.test(f)).map(f=>[f,sha(folder+f)]));
const expectedLabels=['healthy','counter_reset','pending','firing','recovered'];
const expectedStates=['inactive','inactive','pending','firing','inactive'];
const measurements={};

function scalar(samples){
 assert.equal(samples.length,1);
 assert.equal(samples[0].value.length,2);
 const observed=Number(samples[0].value[1]);
 assert(Number.isFinite(observed));
 return observed;
}

function verifyEvidence(record){
 assert.equal(record.status,'passed');
 assert.equal(record.build.version,'3.5.0');
 assert.match(record.binary_sha256,/^[a-f0-9]{64}$/);
 assert.equal(record.clean_exit,true);
 assert.deepEqual(record.source_sha256,expectedSources);
 assert.deepEqual(record.snapshots.map(s=>s.label),expectedLabels);
 const counters={alpha:[10000,1000],beta:[2000,600]}, emitted={alpha:[],beta:[]};
 let alphaReset=0;
 const order=['healthy','fault','recovery'];
 let previousPhase=0;
 for(const event of record.observed_scrapes){
  const {replica,phase,reset,good,bad}=event;
  assert(replica==='alpha'||replica==='beta');
  const currentPhase=order.indexOf(phase);
  assert(currentPhase>=previousPhase);
  previousPhase=currentPhase;
  if(reset){
   assert.equal(replica,'alpha');assert.equal(phase,'healthy');alphaReset++;
   counters.alpha=[0,0];
  }else{
   const badAdded=phase==='fault'&&replica==='alpha'?40:0;
   counters[replica][0]+=100-badAdded;
   counters[replica][1]+=badAdded;
  }
  assert.deepEqual([good,bad],counters[replica]);
  emitted[replica].push(event);
 }
 assert.equal(alphaReset,1);
 assert(emitted.alpha.filter(e=>e.phase==='fault').length>=12);
 for(const rows of Object.values(emitted))assert(rows.some(e=>e.phase==='recovery'));

 const observed=[];
 for(const [index,{query_time,samples:s}]of record.snapshots.entries()){
  assert(Number.isFinite(query_time));
  if(index>0)assert(query_time>record.snapshots[index-1].query_time);
  assert.deepEqual(Object.keys(s),['short','long','alert','active_at','resets','rate_first_bad','sum_first_bad','raw_counters','alert_history']);
  assert(s.alert.length<=1);
  if(s.alert.length){
   assert.equal(s.alert[0].metric.alertname,'GuideLiveFastBurn');
   assert.equal(s.alert[0].metric.job,'reports');
   assert.equal(scalar(s.alert),1);
  }
  observed.push(s.alert[0]?.metric.alertstate||'inactive');
  assert.equal(s.raw_counters.length,4);
  assert.deepEqual(s.raw_counters.map(r=>r.metric.replica+'/'+r.metric.outcome).sort(),['alpha/bad','alpha/good','beta/bad','beta/good']);
  for(const {metric,values}of s.raw_counters){
   assert.equal(metric.__name__,'lab_requests_total');assert.equal(metric.job,'reports');
   assert.match(metric.instance,/^127\.0\.0\.1:\d+$/);
   assert(values.length>=2);
   const series=emitted[metric.replica].map(e=>e[metric.outcome]);
   const samples=values.map(([,x])=>Number(x));
   assert(series.some((_,i)=>samples.every((sample,j)=>series[i+j]===sample)),metric.replica+'/'+metric.outcome+': actual query matches emitted samples');
   for(const [i,[timestamp]]of values.entries()){
    assert(timestamp<=query_time+0.002&&timestamp>=query_time-thresholds.seconds[1]-0.002);
    if(i>0)assert(timestamp>values[i-1][0]);
   }
  }
 }
 assert.deepEqual(observed,expectedStates);
 const [healthy,reset,pending,firing,recovered]=record.snapshots.map(s=>s.samples);
 assert.deepEqual([scalar(healthy.short),scalar(healthy.long),scalar(reset.short),scalar(reset.long)],[0,0,0,0]);
 assert.equal(scalar(reset.resets),1);
 assert.equal(scalar(reset.rate_first_bad),0);
 assert(scalar(reset.sum_first_bad)>0);
 const resetSeries=Object.fromEntries(reset.raw_counters.filter(row=>row.metric.outcome==='bad').map(row=>[row.metric.replica,row.values.map(([,v])=>Number(v))]));
 assert.deepEqual([...new Set(resetSeries.alpha)],[1000,0]);
 assert.deepEqual([...new Set(resetSeries.beta)],[600]);
 const adjusted=(before,after)=>after-before+(after<before?before:0);
 assert.equal(adjusted(1000,0)+adjusted(600,600),0);
 assert.equal(adjusted(1600,600),600);
 for(const s of [pending,firing])assert(scalar(s.short)>thresholds.ratio&&scalar(s.long)>thresholds.ratio);
 const histories=Object.fromEntries(firing.alert_history.map(s=>[s.metric.alertstate,s.values]));
 assert(histories.pending.length>=3&&histories.firing.length>=1);
 assert(histories.pending.every(([,v])=>v==='1')&&histories.firing.every(([,v])=>v==='1'));
 const pendingStart=histories.pending[0][0], firingStart=histories.firing[0][0];
 assert(firingStart-pendingStart>=thresholds.hold-0.001);
 assert.equal(scalar(firing.active_at),Math.floor(pendingStart));
 assert.equal(scalar(pending.active_at),scalar(firing.active_at));
 assert(scalar(recovered.long)>thresholds.ratio);
 assert.equal(scalar(recovered.short),0);
 measurements.hold=firingStart-pendingStart;
}

const record=json(folder+'validation.json'), ci=json(folder+'ci-record.json');
verifyEvidence(record);
assert.equal(record.environment.system,'Linux');
assert.equal(record.environment.machine,'x86_64');
assert.equal(ci.conclusion,'success');
assert.match(ci.url,/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/);
assert.match(ci.headSha,/^[a-f0-9]{40}$/);
assert.equal(ci.archive_sha256,'e811827af26d822afb09a4f28314f61b618b12cff5369835a67f674d8b46f39a');
assert.equal(ci.binary_sha256,record.binary_sha256);
assert.equal(ci.validation_sha256,sha(folder+'validation.json'));
assert.deepEqual(ci.source_sha256,expectedSources);
for(const mutate of [
 r=>r.observed_scrapes.find(s=>s.reset).bad=600,
 r=>r.snapshots[1].samples.rate_first_bad[0].value[1]='100',
 r=>r.snapshots[1].samples.sum_first_bad[0].value[1]='0',
 r=>r.snapshots[2].samples.alert[0].metric.alertstate='firing',
 r=>r.snapshots[3].samples.active_at[0].value[1]='123',
 r=>r.snapshots[4].samples.long[0].value[1]='0',
]){
 const changed=structuredClone(record);
 mutate(changed);
 assert.throws(()=>verifyEvidence(changed),assert.AssertionError);
}
const zip='dist/labs/'+lab+'.zip';
assert.deepEqual(execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n'),files.map(f=>lab+'/'+f));
for(const file of files)assert.deepEqual(execFileSync('unzip',['-p',zip,lab+'/'+file]),readFileSync(folder+file));
const svg=readFileSync('dist/diagrams/'+lab+'.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/)[1]),{
 reset:{alpha:[1000,0],beta:[600,600],per_series_delta:0,aggregate_first_delta:600},
 windows_seconds:thresholds.seconds,evaluation_seconds:1,hold_seconds:thresholds.hold,
 threshold:thresholds.ratio,states:expectedStates.filter((_,index)=>index!==1),
});
const context=vm.createContext({});
for(const[,file]of readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file!=='app.js')vm.runInContext(readFileSync('dist/'+file,'utf8'),context,{filename:file});
}
const lesson=vm.runInContext("articleById('slo')",context), start='<h3 id="'+anchor+'">';
const section=lesson.sections[7][1];
assert(section.includes(start));
const suffix=section.slice(section.indexOf(start));
assert(!suffix.includes('<pre'));
assert.equal((suffix.match(/<figure\b/g)||[]).length,1);
for(const path of ['diagrams/'+lab+'.svg','labs/'+lab+'.zip','labs/'+lab+'/README.md','labs/'+lab+'/validation.json'])assert(suffix.includes('href="'+path+'"'),path);

if(process.env.PROMETHEUS_LIVE_BINARY){
 const temp=mkdtempSync(join(tmpdir(),'verify-live-burn-'));
 try{
  const result=join(temp,'result.json');
  execFileSync('python3',['-B',folder+'prometheus_live_burn.py','--prometheus',process.env.PROMETHEUS_LIVE_BINARY,'--output',result],{timeout:130000});
  verifyEvidence(json(result));
 }finally{rmSync(temp,{recursive:true,force:true});}
}
console.log(`PASS: live scraped counters, independent reset math, ${measurements.hold}s pending hold and recovery with long window still hot, six rejected mutations, exact ZIP/SVG and chapter anchor.`);
