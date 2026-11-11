/* Recompute the published CPU, placement and receipt observations from raw records. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash,pbkdf2Sync}=require('node:crypto');
const {execFileSync}=require('node:child_process');

const specs={
 'cpu-quota-http':{article:'elasticity',field:'cloud-capacity',anchor:'native-cpu-quota-http',role:'cloud-sre',task:'cloud-cpu-quota-http',sources:['cpu_quota_http.py','workload.py']},
 'inference-placement':{article:'inference-performance',field:'platform',anchor:'tp-placement',role:'ai-inference',task:'ai-inference-placement',sources:['placement_budget.py','replica_gloo.py','requirements.txt']},
 'mcp-result-receipt':{article:'mcp-protocol',field:'agent',anchor:'native-mcp-result-receipt',role:'agent-platform',task:'agent-mcp-result-receipt',sources:['receipt_lab.py','orders.json','requirements.txt']},
};
const read=file=>fs.readFileSync(file);
const json=file=>JSON.parse(read(file));
const hash=data=>createHash('sha256').update(data).digest('hex');
const labs=fs.readFileSync('dist/labs/index.html','utf8');
const records={},figures={};
for(const [pack,spec] of Object.entries(specs)){
 const folder='dist/labs/'+pack;
 const record=records[pack]=json(folder+'/validation.json');
 assert.equal(record.status,'passed',pack);
 for(const source of spec.sources)assert.equal(record.source_sha256[source],hash(read(folder+'/'+source)),source);
 for(const [source,digest] of Object.entries(record.source_sha256)){
  assert.match(source,/^[a-z0-9_.-]+$/i);
  assert.equal(digest,hash(read(folder+'/'+source)),source);
 }
 const files=fs.readdirSync(folder).sort();
 assert.deepEqual(execFileSync('unzip',['-Z1',folder+'.zip'],{encoding:'utf8'}).trim().split('\n').sort(),files.map(file=>pack+'/'+file));
 for(const file of files)assert(execFileSync('unzip',['-p',folder+'.zip',pack+'/'+file]).equals(read(folder+'/'+file)),file);
 const article=fs.readFileSync('dist/article/'+spec.article+'/index.html','utf8');
 for(const marker of ['id="'+spec.anchor+'"','diagrams/'+pack+'.svg','labs/'+pack+'.zip','labs/'+pack+'/validation.json'])assert(article.includes(marker),marker);
 const run='/article/'+spec.article+'/';
 assert(fs.readFileSync('dist/module/'+spec.field+'/index.html','utf8').includes(run+'#'+spec.anchor));
 assert(fs.readFileSync('dist/roadmap/'+spec.role+'/index.html','utf8').includes(run+'?goal='+spec.role+'#'+spec.anchor));
 assert(labs.includes('id="lab-'+spec.task+'"'));
 const svg=fs.readFileSync('dist/diagrams/'+pack+'.svg','utf8');
 assert(svg.includes('<title')&&svg.includes('<desc'));
 figures[pack]=JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]);
 assert.equal(figures[pack].record,'labs/'+pack+'/validation.json');
}

function distribution(values){
 const sorted=[...values].sort((a,b)=>a-b);
 const at=fraction=>Number((sorted[Math.ceil(sorted.length*fraction)-1]/1e6).toFixed(3));
 return {p50:at(0.5),p95:at(0.95),max:at(1)};
}
function checkCloud(record){
 assert.equal(record.schema,1);
 assert.equal(record.status,'passed');
 assert.equal(record.environment.os,'linux');
 assert.equal(record.environment.network,'none');
 assert.match(record.environment.image_id,/^sha256:[a-f0-9]{64}$/);
 const {inputs,runs,demonstrated}=record.report;
 assert.deepEqual(inputs,{arrivals:100,arrival_interval_ms:60,queue_capacity:4,iterations:400000,workers:1});
 for(const [name,quota] of [['wide',100000],['tight',25000]]){
  const run=runs[name];
  assert.equal(run.cpu_max,quota+' 100000');
  assert.equal(run.load_generator_cpu_max,'max 100000');
  assert.equal(run.arrivals.length,100);
  const successes=[],slips=[];
  for(const [index,row] of run.arrivals.entries()){
   assert.equal(row.id,index+1);
   assert.equal(row.target_ns,index*60e6);
   assert(row.target_ns<=row.sent_ns&&row.sent_ns<row.received_ns);
   assert.equal(row.receipt.id,row.id);
   assert([200,503].includes(row.status));
   if(row.status===200){
    successes.push(row);
    assert(row.receipt.queue_wait_ns>=0&&row.receipt.work_cpu_ns>0);
    assert.match(row.receipt.digest,/^[a-f0-9]{64}$/);
   }else assert.deepEqual(row.receipt,{id:row.id});
   slips.push(row.sent_ns-row.target_ns);
  }
  const counts={offered:100,admitted:successes.length,completed:successes.length,rejected:100-successes.length};
  assert.deepEqual(run.counts,counts);
  assert.deepEqual(run.server_counts,counts);
  const first=successes[0];
  const digest=pbkdf2Sync(String(first.id),'infra-guide-capacity',400000,32,'sha256').toString('hex');
  assert.equal(first.receipt.digest,digest);
  assert.deepEqual(run.success_latency_ms,distribution(successes.map(row=>row.received_ns-row.sent_ns)));
  assert.deepEqual(run.success_queue_wait_ms,distribution(successes.map(row=>row.receipt.queue_wait_ns)));
  assert.deepEqual(run.success_work_cpu_ms,distribution(successes.map(row=>row.receipt.work_cpu_ns)));
  assert.deepEqual(run.send_slip_ms,distribution(slips));
  assert(Math.max(...slips)<60e6);
  for(const [key,delta] of Object.entries(run.cpu_stat_delta)){
   assert.equal(delta,run.cpu_stat_after[key]-run.cpu_stat_before[key]);
   assert(delta>=0);
  }
 }
 assert(runs.tight.counts.rejected>runs.wide.counts.rejected);
 assert(runs.tight.cpu_stat_delta.nr_throttled>0&&runs.tight.cpu_stat_delta.throttled_usec>0);
 assert.equal(Object.keys(demonstrated).length,4);
 assert(Object.values(demonstrated).every(value=>value===true));
}
const cloud=records['cpu-quota-http'];
checkCloud(cloud);
assert.deepEqual(Object.values(cloud.report.runs).map(run=>[run.counts.completed,run.counts.rejected,run.success_latency_ms.p95,run.cpu_stat_delta.nr_throttled]),[[100,0,39.351,0],[35,65,1171.512,70]],'published measured rows');
if(process.argv[2])checkCloud(json(process.argv[2]));
const sliAnchor='cpu-quota-sli-events';
const sliPage=fs.readFileSync('dist/article/slo/index.html','utf8');
const sliExample=sliPage.split('id="section-2"')[1]?.split('</section>')[0].split('id="'+sliAnchor+'"')[1];
assert(sliExample?.includes('/article/elasticity/#native-cpu-quota-http'));
assert(sliExample.includes('/labs/cpu-quota-http/validation.json'));
const capacityPage=fs.readFileSync('dist/article/elasticity/index.html','utf8');
assert(capacityPage.split('id="native-cpu-quota-http"')[1]?.split('</section>')[0].includes('/article/slo/#'+sliAnchor));
const threshold=500_000_000;
const duration=row=>row.received_ns-row.sent_ns;
const requestTrace=capacityPage.split('id="cpu-quota-request-records"')[1]?.split('</section>')[0];
const {wide,tight}=cloud.report.runs;
const sameRequest=[wide,tight].map(run=>run.arrivals.find(row=>row.id===6));
assert(sameRequest.every(row=>row.status===200&&row.receipt.id===row.id));
assert.equal(sameRequest[0].receipt.digest,sameRequest[1].receipt.digest);
const milliseconds=ns=>(ns/1e6).toFixed(3);
for(const [label,value] of [
 ['客户端总耗时',duration],
 ['等待工作线程',row=>row.receipt.queue_wait_ns],
 ['工作阶段的墙钟时间',row=>row.receipt.work_wall_ns],
 ['工作线程的 CPU 时间',row=>row.receipt.work_cpu_ns]
]){
 const values=sameRequest.map(row=>milliseconds(value(row))).join(' → ');
 assert(requestTrace?.includes('<tr><td>'+label+'</td><td>'+values+' ms</td></tr>'),label);
}
const [,tightReply]=sameRequest;
assert(requestTrace.includes('相差约 '+milliseconds(tightReply.receipt.work_wall_ns-tightReply.receipt.work_cpu_ns)+' ms'));
assert(requestTrace.includes('增加 '+tight.cpu_stat_delta.nr_throttled+' 是整个窗口的读数'));
const rejected=tight.arrivals.find(row=>row.id===9);
assert.deepEqual(rejected.receipt,{id:rejected.id});
assert(requestTrace.includes('窄档请求 '+rejected.id+'，它在队列满时收到 '+rejected.status));
assert(requestTrace.includes('/labs/cpu-quota-http/validation.json'));
const capacityField=fs.readFileSync('dist/module/cloud-capacity/index.html','utf8');
const performance=capacityField.split('id="map-concept-performance-budget"')[1]?.split('</div>')[0];
assert(performance?.includes('/article/cloud-compute/?fromConcept=cloud-capacity.performance-budget#section-10'));
assert(performance.includes('/article/elasticity/?fromConcept=cloud-capacity.performance-budget#native-cpu-quota-http'));
for(const run of Object.values(cloud.report.runs)){
 const responses=run.arrivals.filter(row=>row.status===200);
 const timely=responses.filter(row=>row.receipt.id===row.id&&duration(row)<=threshold).length;
 const late=responses.length-timely;
 const refused=run.arrivals.length-responses.length;
 const offered=run.arrivals.length;
 const fraction=timely+'/'+offered+'（'+(100*timely/offered)+'%）';
 const cells=[run.requested_cpus+' 核',timely,late,refused,fraction];
 assert(sliExample.includes('<tr>'+cells.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>'),'Count refused and late requests in the same native denominator');
}
const restricted=cloud.report.runs.tight.arrivals;
const [lastTimely,firstLate]=[4,5].map(id=>restricted.find(row=>row.id===id));
assert.equal(lastTimely.status,200);assert.equal(firstLate.status,200);
assert(duration(lastTimely)<=threshold&&duration(firstLate)>threshold);
assert(sliExample.includes([lastTimely,firstLate].map(row=>(duration(row)/1e6).toFixed(3)).join(' 和 ')),'The two worked latencies must come from the raw timestamps');
assert(sliExample.includes('500,000,000 纳秒'),'Show the actual comparison unit');

const placement=records['inference-placement'].report;
const budget=placement.budget;
const gloo=placement.cpu_gloo;
const budgetFolder='dist/labs/inference-placement';
assert.deepEqual(JSON.parse(execFileSync('python3',['-B',budgetFolder+'/placement_budget.py'],{encoding:'utf8'})),budget);
assert.equal(budget.fixture.reserved_positions,7168+1024-1);
assert.equal(budget.fixture.cold_request_blocks,Math.ceil(8191/16));
for(const [key,tp] of [['tp8',8],['tp4_x2',4]]){
 const found=budget.placements[key];
 const weights=140_000_000_000/tp,blockBytes=80*(8/tp)*128*2*2*16;
 const blocks=Math.floor((44*2**30-weights)/blockBytes);
 assert.equal(found.weight_bytes_per_rank,weights);
 assert.equal(found.kv_heads_per_rank,8/tp);
 assert.equal(found.kv_bytes_per_block,blockBytes);
 assert.equal(found.kv_blocks_per_rank,blocks);
 assert.equal(found.cold_requests_total,(8/tp)*Math.floor(blocks/512));
}
assert.deepEqual(Object.values(budget.placements).map(row=>row.cold_requests_total),[88,36]);
assert.equal(budget.smaller_card_control.weights_and_reserve_fit,false);
for(const [key,free,action,selected] of [
 ['cold_only',[96,640],'route','B'],['warm_only',[160,480],'route','A'],
 ['neither_fits',[100,500],'wait',null],['deadline_exceeded',[100,500],'reject',null],
 ['prefer_warm',[160,640],'route','A'],['warm_queue_longer',[160,640],'route','B'],
]){
 const row=budget.routing[key];
 assert.equal(row.action,action);
 assert.equal(row.selected,selected);
 for(const [index,candidate] of row.replicas.entries()){
  assert.equal(candidate.free_blocks,free[index]);
  assert.equal(candidate.new_blocks,[128,512][index]);
  assert.equal(candidate.new_prefill_positions,[1024,7168][index]);
  assert.equal(candidate.eligible,free[index]>=candidate.new_blocks);
 }
 if(selected){
  const eligible=row.replicas.filter(candidate=>candidate.eligible);
  const work=candidate=>candidate.new_prefill_positions+candidate.queued_prefill_positions;
  assert.equal(work(eligible.find(candidate=>candidate.replica===selected)),Math.min(...eligible.map(work)));
 }else assert(row.replicas.every(candidate=>!candidate.eligible));
}

// Independent scalar GQA oracle. No Torch operation or saved reference vector is reused.
function denseOutput(positions,seed){
 const features=6,headDim=2;
 const hidden=Array.from({length:positions},(_,position)=>
  Array.from({length:features},(_,feature)=>(((position*features+feature)*7+seed)%29-14)/16));
 const weight=(head,feature,component,offset)=>(((head*features*headDim+feature*headDim+component)*5+offset)%31-15)/16;
 const project=(input,head,offset)=>Array.from({length:headDim},(_,component)=>
  input.reduce((sum,value,feature)=>sum+value*weight(head,feature,component,offset),0));
 const output=Array(features).fill(0);
 for(let head=0;head<8;head++){
  const group=Math.floor(head/2);
  const q=project(hidden.at(-1),head,3);
  const keys=hidden.map(row=>project(row,group,11));
  const vals=hidden.map(row=>project(row,group,19));
  const scores=keys.map(key=>key.reduce((sum,value,i)=>sum+value*q[i],0)/Math.sqrt(headDim));
  const exp=scores.map(score=>Math.exp(score-Math.max(...scores)));
  const total=exp.reduce((sum,value)=>sum+value,0);
  for(let component=0;component<headDim;component++){
   const attention=vals.reduce((sum,row,i)=>sum+row[component]*exp[i]/total,0);
   for(let feature=0;feature<features;feature++)output[feature]+=attention*weight(head,feature,component,23);
  }
 }
 return output;
}
assert.equal(gloo.backend,'gloo');
assert.equal(gloo.device,'cpu');
assert.equal(gloo.world_size,4);
assert.equal(gloo.torch,'2.5.1');
assert.equal(gloo.atol,1e-12);
const requestShapes={A1:[3,1],B1:[5,7],A2:[4,13]};
const expected=Object.fromEntries(Object.entries(requestShapes).map(([name,[positions,seed]])=>[name,denseOutput(positions,seed)]));
for(const [name,groups] of Object.entries({
 one_tp4:[{ranks:[0,1,2,3],requests:['A1','B1','A2']}],
 two_tp2:[{ranks:[0,1],requests:['A1','A2']},{ranks:[2,3],requests:['B1']}],
})){
 const run=gloo.cases[name];
 assert.deepEqual(run.groups,groups);
 assert.deepEqual(run.ranks.map(row=>row.rank),[0,1,2,3]);
 for(const group of groups){
  const ranks=group.ranks.map(rank=>run.ranks[rank]);
  const count=4/ranks.length;
  assert.deepEqual(ranks.flatMap(row=>row.kv_heads),[0,1,2,3]);
  for(const row of ranks){
   assert.equal(row.kv_heads.length,count);
   assert.deepEqual(row.query_heads,row.kv_heads.flatMap(head=>[head*2,head*2+1]));
   assert.deepEqual(row.calls.map(call=>call.request),group.requests);
   for(const call of row.calls){
    assert.deepEqual(call.kv_shape_each,[count,requestShapes[call.request][0],2]);
    assert.equal(call.output.length,1);
    const values=call.output[0];
    assert.equal(values.length,6);
    values.forEach((value,i)=>assert(Math.abs(value-expected[call.request][i])<1e-12));
   }
  }
 }
 assert(run.max_abs_error>=0&&run.max_abs_error<1e-12);
}

const source=json('dist/labs/mcp-result-receipt/orders.json');
const fixture={operation_id:source.task_id+'/v'+source.version+':publish',report_id:source.task_id,version:source.version,total:Object.values(source.batches).flat().reduce((sum,value)=>sum+value,0)};
function checkAgent(record){
 assert.equal(record.schema,'mcp-result-receipt-v1');
 assert.equal(record.status,'passed');
 assert.equal(record.environment.mcp,'2.3.0');
 assert.equal(record.protocol,'2026-07-28');
 assert.deepEqual(record.fixture,fixture);
 for(const [key,status] of [['valid','accepted'],['malformed','sdk_rejected'],['wrong-operation','host_rejected']]){
  const result=record.cases[key];
  const accepted={operation_id:fixture.operation_id,state:'accepted',receipt:fixture};
  const pending={operation_id:fixture.operation_id,state:'pending',receipt:null};
  const receiver={reports:[fixture],receipts:[fixture]};
  assert.equal(result.publish_outcome.status,status);
  assert.equal(result.receiver_exit,0);
  assert.deepEqual(result.after_publish,{host:key==='valid'?accepted:pending,receiver});
  assert.deepEqual(result.final,{host:accepted,receiver});
  const calls=result.http.filter(row=>row.request.method==='tools/call');
  const [published,recovered]=calls;
  assert.deepEqual(calls.map(row=>row.request.params.name),key==='valid'?['publish_report']:['publish_report','lookup_receipt']);
  for(const call of calls){
   assert.equal(call.status,200);
   assert.equal(call.request.id,call.response.id);
   assert.equal(call.request.params.arguments.operation_id,fixture.operation_id);
   assert.equal(call.response.result.resultType,'complete');
   assert(!call.response.result.isError);
  }
  const wire=published.response.result;
  if(key==='malformed'){
   assert.deepEqual(wire.structuredContent,{...fixture,total:String(fixture.total)});
   assert.deepEqual(JSON.parse(wire.content[0].text),fixture);
   assert.match(result.publish_outcome.detail,/not of type 'integer'/);
  }else if(key==='wrong-operation'){
   assert.deepEqual(wire.structuredContent,{...fixture,operation_id:'report-A/v2:publish'});
   assert.match(result.publish_outcome.detail,/does not match the original intent/);
  }else assert.deepEqual(wire.structuredContent,fixture);
  if(recovered)assert.deepEqual(recovered.response.result.structuredContent,fixture);
  assert.equal(result.accepted_via,key==='valid'?'publish_report':'lookup_receipt');
 }
}
checkAgent(records['mcp-result-receipt']);
if(process.argv[3])checkAgent(json(process.argv[3]));
assert.deepEqual(figures['cpu-quota-http'].completed,Object.values(cloud.report.runs).map(run=>run.counts.completed));
assert.deepEqual(figures['cpu-quota-http'].rejected,Object.values(cloud.report.runs).map(run=>run.counts.rejected));
const routing=budget.routing[figures['inference-placement'].routing_case];
const [warm,cold]=routing.replicas;
assert.deepEqual(figures['inference-placement'],{
 record:'labs/inference-placement/validation.json',cards:budget.fixture.cards,routing_case:'cold_only',
 a_free:warm.free_blocks,a_new:warm.new_blocks,b_free:cold.free_blocks,b_new:cold.new_blocks,selected:routing.selected
});
assert.equal(figures['mcp-result-receipt'].operation_id,fixture.operation_id);
assert.equal(figures['mcp-result-receipt'].total,fixture.total);
console.log('PASS: raw HTTP/cgroup counts and percentiles, eight-card budget and native Gloo outputs, MCP wire/receiver/host evidence, exact archives and reading links.');
