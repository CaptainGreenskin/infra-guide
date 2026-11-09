/* Check real IPC, fixed outputs and timing arithmetic independently of the lab driver. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');

const pack='dist/labs/pd-split';
const source=pack+'/pd_split.py';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=JSON.parse(fs.readFileSync(pack+'/validation.json'));
const inputs={A:[3,1,4,1],B:Array.from({length:8192},(_,i)=>(17*i+11)%257)};
const outputCount={A:4,B:2};

function oracle(id){
 const prompt=inputs[id];
 const cells=[];
 const outputs=[];
 let token=prompt.at(-1);
 for(const [i,t] of prompt.entries())cells.push([(t+i)%257,(3*t+2*i)%257]);
 const payload=Buffer.alloc(9+prompt.length*4);
 payload.write('PDS1',0,'ascii');
 payload.write(id,4,'ascii');
 payload.writeUInt16BE(prompt.length,5);
 const promptBytes=Buffer.alloc(prompt.length*2);
 for(const [i,[k,v]] of cells.entries()){
  payload.writeUInt16BE(k,9+i*4);
  payload.writeUInt16BE(v,11+i*4);
  promptBytes.writeUInt16BE(prompt[i],i*2);
 }
 for(let step=0;step<outputCount[id];step++){
  if(step){
   const i=cells.length;
   cells.push([(token+i)%257,(3*token+2*i)%257]);
  }
  const q=1+token%11;
  const [sum,total]=cells.reduce(([sum,total],[k,v])=>{
   const weight=1+q*k%19;
   return [sum+weight*v,total+weight];
  },[0,0]);
  token=(Math.floor(sum/total)+cells.length)%257;
  outputs.push(token);
 }
 payload.writeUInt16BE(outputs[0],7);
 const size=Buffer.alloc(4);
 size.writeUInt32BE(payload.length+32);
 const frame=Buffer.concat([size,payload,Buffer.from(sha(payload),'hex')]);
 return {outputs,frame,promptHash:sha(promptBytes),cacheBytes:prompt.length*4};
}
const expected=Object.fromEntries(Object.keys(inputs).map(id=>[id,oracle(id)]));

function one(events,name,id){
 const found=events.filter(e=>e.event===name&&e.request_id===id);
 assert.equal(found.length,1,`${id}: ${name}`);
 return found[0];
}
function ordered(events){
 assert(events.every(e=>Number.isSafeInteger(e.ns)&&e.ns>=0));
 assert(events.every((e,i)=>i===0||events[i-1].ns<=e.ns),events.map(e=>e.event).join(' → '));
}

function verifyTopology(topology,layout,slo){
 const {events,per_request:requests,worker_pids:workers,cohort}=topology;
 const workerIds=Object.values(workers);
 assert.equal(workerIds.length,layout==='colocated'?1:2);
 assert.equal(new Set(workerIds).size,workerIds.length);
 assert(workerIds.every(n=>Number.isSafeInteger(n)&&n>0));
 for(const id of Object.keys(inputs)){
  const find=name=>one(events,name,id);
  const arrival=find('arrival'),queued=find('prefill_queued'),prefill=find('prefill_start');
  const ready=find('kv_ready'),endPrefill=find('prefill_end');
  const decodeQueued=find('decode_queued'),decode=find('decode_start'),end=find('decode_end');
  const outputs=events.filter(e=>e.request_id===id&&e.event==='token').sort((a,b)=>a.index-b.index);
  const spec=expected[id],result=requests[id];
  assert.deepEqual(outputs.map(e=>e.index),spec.outputs.map((_,i)=>i));
  assert.deepEqual(outputs.map(e=>e.value),spec.outputs);
  assert.deepEqual(result.outputs,spec.outputs);
  ordered([arrival,queued,prefill,outputs[0]]);
  ordered([outputs[0],ready,decode,...outputs.slice(1),end]);
  ordered([prefill,endPrefill]);
  ordered([decodeQueued,decode]);
  assert(workerIds.includes(prefill.pid)&&workerIds.includes(decode.pid));
  assert.equal(outputs[0].pid,prefill.pid);
  assert(outputs.slice(1).every(e=>e.pid===decode.pid));
  assert.equal(ready.pid,decode.pid);
  assert.equal(result.kv_cache_bytes,spec.cacheBytes);

  if(layout==='split'){
   const startSend=find('kv_send_start'),sent=find('kv_send_end');
   const startReceive=find('kv_receive_start'),received=find('kv_receive_end');
   assert.notEqual(prefill.pid,decode.pid);
   assert.equal(sent.pid,prefill.pid);
   assert.equal(received.pid,decode.pid);
   ordered([outputs[0],startSend,sent]);
   ordered([startReceive,received,ready]);
   ordered([startSend,received]);
   for(const event of [sent,received]){
    assert.equal(event.frame_bytes,spec.frame.length);
    assert.equal(event.frame_sha256,sha(spec.frame));
   }
   assert.equal(result.wire_bytes,spec.frame.length);
   assert.equal(result.kv_handoff_ns,ready.ns-startSend.ns);
  }else{
   assert.equal(prefill.pid,decode.pid);
   assert(!events.some(e=>e.request_id===id&&/^kv_(send|receive)_/.test(e.event)));
   assert.equal(result.wire_bytes,0);
   assert.equal(result.kv_handoff_ns,null);
  }
  const intervals=outputs.slice(1).map((e,i)=>e.ns-outputs[i].ns);
  const tpot=(outputs.at(-1).ns-outputs[0].ns)/(outputs.length-1);
  const ttft=outputs[0].ns-arrival.ns;
  assert.deepEqual(result.token_intervals_ns,intervals);
  assert.equal(result.ttft_ns,ttft);
  assert.equal(result.tpot_ns,tpot);
  assert.equal(result.decode_queue_ns,decode.ns-decodeQueued.ns);
  assert.equal(result.decode_ready_queue_ns,decode.ns-Math.max(decodeQueued.ns,ready.ns));
  assert.equal(result.within_slo,ttft<=slo.ttft_ns&&tpot<=slo.tpot_ns);
 }
 const find=(name,id)=>one(events,name,id);
 const bPrefill=find('prefill_start','B'),aDecode=find('decode_start','A');
 const bPrefillEnd=find('prefill_end','B'),aEnd=find('decode_end','A');
 const aFirst=events.find(e=>e.request_id==='A'&&e.event==='token'&&e.index===0);
 const aQueued=find('decode_queued','A'),release=find('prefill_gate_release','B');
 ordered([aFirst,find('arrival','B'),bPrefill,aQueued,release,bPrefillEnd]);
 if(layout==='colocated'){
  ordered([bPrefill,bPrefillEnd,aDecode]);
 }else{
  ordered([bPrefill,aDecode,aEnd,release,bPrefillEnd]);
  if(layout==='colocated_two_workers')assert.notEqual(bPrefill.pid,aDecode.pid);
 }
 const completed=Object.values(requests);
 const qualified=completed.filter(r=>r.within_slo).length;
 const window=Math.max(...events.filter(e=>e.event==='decode_end').map(e=>e.ns))-
  Math.min(...events.filter(e=>e.event==='arrival').map(e=>e.ns));
 assert(window>0);
 assert.equal(cohort.window_ns,window);
 assert.equal(cohort.completed_count,2);
 assert.equal(cohort.slo_met_count,qualified);
 assert.equal(cohort.goodput_requests_per_second,qualified*1e9/window);
}

function verifyReport(report){
 assert.deepEqual(report.slo,{ttft_ns:30000000,tpot_ns:1500000});
 assert.equal(report.requests.length,2);
 for(const request of report.requests){
  const id=request.request_id;
  assert.equal(request.prompt_tokens,inputs[id].length);
  assert.equal(request.output_tokens,outputCount[id]);
  assert.equal(request.prompt_sha256,expected[id].promptHash);
 }
 for(const layout of ['colocated','split','colocated_two_workers'])verifyTopology(report[layout],layout,report.slo);
 const negative=report.negative;
 assert.equal(negative.fault,'checksum_corruption');
 assert.equal(negative.kv_rejection,'checksum_mismatch');
 assert.equal(negative.decode_rejection,'cache_not_ready');
 assert.deepEqual(negative.outputs,expected.A.outputs.slice(0,1));
 const tokens=negative.events.filter(e=>e.event==='token');
 assert.deepEqual(tokens.map(e=>e.value),expected.A.outputs.slice(0,1));
 const rejected=one(negative.events,'kv_rejected','A');
 const noDecode=one(negative.events,'decode_rejected','A');
 assert.equal(rejected.reason,negative.kv_rejection);
 assert.equal(noDecode.reason,negative.decode_rejection);
 const received=one(negative.events,'kv_receive_end','A');
 ordered([tokens[0],received,rejected,noDecode]);
 const corrupt=Buffer.from(expected.A.frame);
 corrupt[corrupt.length-1]^=1;
 assert.equal(received.frame_bytes,corrupt.length);
 assert.equal(received.frame_sha256,sha(corrupt));
 assert.notEqual(tokens[0].pid,rejected.pid);
 assert.equal(rejected.pid,noDecode.pid);
 assert(!negative.events.some(e=>e.event==='kv_ready'||e.event==='decode_start'));
}

assert.equal(record.status,'passed');
assert.equal(record.source_sha256,sha(fs.readFileSync(source)));
verifyReport(record.report);
const replay=JSON.parse(execFileSync('python3',['-B',source],{encoding:'utf8',timeout:20000}));
assert.equal(replay.source_sha256,record.source_sha256);
verifyReport(replay.report);

execFileSync('python3',['-c',`from pathlib import Path
from zipfile import ZipFile
folder=Path('dist/labs/pd-split')
with ZipFile(folder.with_suffix('.zip')) as archive:
 assert archive.testzip() is None
 files={p.name:p.read_bytes() for p in folder.iterdir() if p.is_file()}
 assert set(archive.namelist())=={'pd-split/'+name for name in files}
 for name,data in files.items():
  assert archive.read('pd-split/'+name)==data
`]);
const html=fs.readFileSync('dist/article/inference-performance/index.html','utf8');
for(const token of ['id="native-pd-split"','diagrams/pd-split-handoff.svg','labs/pd-split.zip','labs/pd-split/validation.json','pd_split.py --write-record replay.json'])assert(html.includes(token),token);
const ms=ns=>(ns/1e6).toFixed(3);
for(const [layout,label] of [['colocated','单进程共置'],['split','分池'],['colocated_two_workers','双进程共置']]){
 const {per_request:{A,B},cohort}=record.report[layout];
 const displayed=`<tr><td>${label}</td><td>${ms(A.decode_queue_ns)} ms</td><td>${ms(A.tpot_ns)} / ${ms(B.tpot_ns)} ms</td><td>${cohort.slo_met_count} / ${cohort.completed_count}</td></tr>`;
 assert(html.includes(displayed),layout+': displayed comparison is sourced from the frozen run');
}
assert(fs.readFileSync('dist/labs/index.html','utf8').includes('id="lab-ai-pd-split"'));
assert(fs.readFileSync('dist/roadmap/ai-inference/index.html','utf8').includes('?goal=ai-inference#native-pd-split'));
assert(fs.readFileSync('dist/module/platform/index.html','utf8').includes('/article/inference-performance/#native-pd-split'));
assert(fs.readFileSync('dist/interview/companies/index.html','utf8').includes('/article/inference-performance/#native-pd-split'));
console.log('PASS: live and frozen CPU socket traces, independent output and frame-byte oracles, timing/SLO arithmetic, checksum rejection, exact source/ZIP and reading links.');
