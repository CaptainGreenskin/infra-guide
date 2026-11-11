const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=JSON.parse(JSON.stringify(vm.runInContext('({scalingCollectiveTraceFiles,scalingCollectiveTraceValidation})',c)));
const python=process.env.INFRA_LAB_PYTHON||'python3';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[id,name]of [['k8s-autoscaling','scaling_reference.py'],['k8s-autoscaling','prometheus_cpu.py'],['training-communication','collective_contracts.py'],['agent-observability','otel_attempts.py']]){
 const source=fs.readFileSync('dist/labs/scaling-collectives-traces/'+name,'utf8'),record=d.scalingCollectiveTraceValidation.programs[name];
 assert.equal(source,d.scalingCollectiveTraceFiles[name]);assert.equal(record.sha256,hash(source));assert.equal(record.exit_code,0);assert(record.python);
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': static full source mismatch');
}
for(const[id,name]of [['k8s-autoscaling','cpu.rules.yaml'],['k8s-autoscaling','cpu.test.yaml'],['agent-observability','requirements-otel.txt']]){
 const source=fs.readFileSync('dist/labs/scaling-collectives-traces/'+name,'utf8'),page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert.equal(hash(source),d.scalingCollectiveTraceValidation.fixtures[name]);assert.equal(source,d.scalingCollectiveTraceFiles[name]);
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name);
}
const scaling=JSON.parse(execFileSync(python,['-B','dist/labs/scaling-collectives-traces/scaling_reference.py'],{encoding:'utf8',timeout:15000}));
assert.deepEqual(scaling,d.scalingCollectiveTraceValidation.programs['scaling_reference.py'].result);
const expected={
 four_ready:[90,90,6],requests_doubled:[45,45,3],heterogeneous_requests:[18,18,1],
 missing_scale_up:[90,67,5],missing_within_tolerance:[85,63,4],
 missing_scale_down:[30,47,4],missing_reverses_direction:[10,77,4]
};
for(const[key,values]of Object.entries(expected)){
 const r=scaling.recommendations[key];assert.deepEqual([r.observed_percent,r.adjusted_percent,r.pre_policy_replicas],values,key);
}
assert.equal(scaling.wrong_mean_pod_percent,50);assert(scaling.missing_request_rejected);
assert.deepEqual(scaling.scale_down_window.map(r=>r.highest_in_last_300s),[6,4,3]);
for(const[name,result]of Object.entries(scaling.queues))for(const sample of result.samples){
 const t=sample.end_second,up=Math.min(t,75),after=Math.max(t-75,0);
 const queue=name==='bounded_queue'?Math.max(0,Math.min(60*up,500)-60*after):
             name==='extra_capacity'?Math.max(0,60*up-60*after):60*up;
 const rejected=name==='bounded_queue'?Math.max(0,60*up-500):0;
 assert.equal(sample.queue,queue,name+'@'+t);assert.equal(sample.rejected_total,rejected);
 assert.equal(sample.completed_total,180*t-queue-rejected);
}
assert.equal(scaling.queues.extra_capacity.drained_at_second,150);
assert.equal(scaling.queues.bounded_queue.drained_at_second,84);
assert.deepEqual(scaling.connection_budget,{database_limit:200,other_clients:80,connections_per_pod:40,max_pods:3,four_pods_max_each:30});

// Tool records were actually executed by the generator; CI checks source and independent oracles.
const prom=d.scalingCollectiveTraceValidation.programs['prometheus_cpu.py'].result;
assert(prom.version.includes('version 3.5.0'));assert.equal(prom.fixture_groups,4);
assert.deepEqual(prom.commands.map(r=>r.exit_code),[0,0]);
assert.equal(prom.checks.different_requests.weighted_ratio,(.09+.09)/(.1+.9));
assert(Math.abs(prom.checks.different_requests.wrong_pod_mean-(.09/.1+.09/.9)/2)<1e-12);
assert.equal(prom.checks.missing_metric.complete,0);assert.equal(prom.checks.observed_zero.complete,1);
assert.equal(prom.checks.absent,'no_result_not_zero');
const collective=d.scalingCollectiveTraceValidation.programs['collective_contracts.py'].result;
assert.equal(collective.torch,'2.5.1');assert.equal(collective.backend,'gloo');assert.equal(collective.device,'cpu');assert.equal(collective.world_size,2);
const expectedSum=[1,2,3,4].map((v,i)=>v+[10,20,30,40][i]);
for(const row of collective.modes.correct){
 assert.deepEqual(row.all_reduce_sum,expectedSum);assert.deepEqual(row.explicit_rank_mean,expectedSum.map(v=>v/2));
 assert(row.reduce_scatter_tensor.supported_here);
 assert.deepEqual(row.reduce_scatter_tensor.output,expectedSum.slice(row.rank*2,row.rank*2+2));
 assert.deepEqual(row.all_gather_shards,expectedSum);
 assert.deepEqual(row.ragged.lengths,[3,1]);assert.deepEqual(row.ragged.real_values,[2,4,6,20]);
 assert.equal(row.ragged.sum,32);assert.equal(row.ragged.count,4);assert.equal(row.ragged.global_mean,8);
 assert.equal(row.ragged.wrong_mean_of_means,(4+20)/2);
 assert(Math.abs(row.ragged.wrong_include_padding_mean-32/6)<1e-12);
 assert.equal(row.delayed_arrival.result,3);assert(row.delayed_arrival.async_result_used_after_wait);
 assert(row.delayed_arrival.local_call_and_wait_ms>=0);
 assert.equal(row.delayed_arrival.injected_pre_call_sleep_ms,row.rank===1?80:0);
}
const communicationPage=fs.readFileSync('dist/article/training-communication/index.html','utf8');
const waitSection=communicationPage.match(/<section class="article-section" id="section-4">([\s\S]*?)<\/section>/)?.[1];
assert(waitSection&&waitSection.includes('id="subsection-4-9tsq35"'));
const [early,late]=collective.modes.correct.map(row=>row.delayed_arrival);
assert(waitSection.includes(`rank 0 的 call+wait 约 ${early.local_call_and_wait_ms.toFixed(3)} ms，rank 1 约 ${late.local_call_and_wait_ms.toFixed(3)} ms`));
assert(waitSection.includes(`${late.injected_pre_call_sleep_ms} ms 是程序在调用前注入的休眠`));
const dataAnchor='subsection-6-101j0v8';
const diagnosis=waitSection.indexOf('实际训练若怀疑取数迟到');
assert(diagnosis>=0&&waitSection.indexOf('<code>next(iterator)</code> 到返回的耗时',diagnosis)>diagnosis);
assert(waitSection.indexOf(`href="/article/data-pipeline/#${dataAnchor}"`,diagnosis)>diagnosis);
assert(fs.readFileSync('dist/article/data-pipeline/index.html','utf8').includes(`id="${dataAnchor}"`));
const interviewPlan=fs.readFileSync('dist/interview/plan/index.html','utf8');
const trainingRoute=interviewPlan.match(/<section><h3>AI Infra<\/h3>([\s\S]*?)<\/section>/)?.[1];
assert(trainingRoute&&trainingRoute.includes('训练通信练习（本站原创）'));
assert(trainingRoute.includes(`rank 0 的调用加等待约 ${early.local_call_and_wait_ms.toFixed(3)} ms，rank 1 约 ${late.local_call_and_wait_ms.toFixed(3)} ms`));
const answer=trainingRoute.match(/<details><summary>核对等待来源<\/summary>([\s\S]*?)<\/details>/)?.[1];
assert(answer&&answer.includes(`本机 CPU/Gloo 对照让 rank 1 在调用前休眠 ${late.injected_pre_call_sleep_ms} ms，两个 rank 的求和结果都是 ${late.result}`));
assert(answer.includes('要查真实训练是否在等 DataLoader'));
assert.deepEqual([...trainingRoute.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),[
 '/article/transformer-model/','/article/gpu-cluster/','/article/distributed-training/','/article/gpu-memory/','/article/model-serving/',
 '/article/training-communication/#subsection-4-9tsq35'
]);
for(const[mode,category,ops,shapes]of [
 ['shape_mismatch','shape',['ALLREDUCE'],['[2]','[3]']],
 ['order_mismatch','operation',['ALLREDUCE','BROADCAST'],['[2]']]
])for(const row of collective.modes[mode]){
 assert(row.rejected&&row.fingerprint_diagnostic);assert.equal(row.category,category);
 assert.deepEqual(row.operators,ops);assert.deepEqual(row.shapes,shapes);
 assert(row.message_excerpt.includes('CollectiveFingerPrint'));
}
const otel=d.scalingCollectiveTraceValidation.programs['otel_attempts.py'].result;
assert.equal(otel.sdk,'1.44.0');assert.equal(otel.api,'1.44.0');
assert.equal(otel.spans.length,5);assert.equal(new Set(otel.spans.map(s=>s.trace_id)).size,1);
const root=otel.spans.find(s=>s.name==='agent.task'),clients=otel.spans.filter(s=>s.kind==='CLIENT'),servers=otel.spans.filter(s=>s.kind==='SERVER');
assert.equal(root.status,'OK');assert.equal(root.parent_id,null);
assert.equal(clients.length,2);assert.equal(servers.length,2);
for(const s of otel.spans){
 assert(/^[0-9a-f]{32}$/.test(s.trace_id)&&/^[0-9a-f]{16}$/.test(s.span_id));
 assert(/^\d+$/.test(s.start_unix_ns)&&/^\d+$/.test(s.end_unix_ns));
 const delta=BigInt(s.end_unix_ns)-BigInt(s.start_unix_ns);assert(delta>=0n);
 assert(Math.abs(Number(delta)/1e6-s.duration_ms)<1e-9);
}
for(let i=0;i<2;i++){
 assert.equal(clients[i].parent_id,root.span_id);assert.equal(clients[i].service,'infra-guide-runner');
 assert.equal(servers[i].parent_id,clients[i].span_id);assert.equal(servers[i].service,'infra-guide-tool');assert(servers[i].parent_remote);
 assert.deepEqual(otel.received_traceparent[i].split('-').slice(1,3),[clients[i].trace_id,clients[i].span_id]);
}
assert.equal(clients[0].status,'ERROR');assert(clients[0].events.includes('result_unknown'));
assert(servers[0].events.includes('effect_committed'));assert(servers[1].events.includes('receipt_reused'));
assert.equal(servers[0].attributes['app.duplicate'],false);assert.equal(servers[1].attributes['app.duplicate'],true);
assert.equal(otel.http_attempts,2);assert.equal(otel.effects,1);assert.equal(otel.unique_verified_tasks,1);
const totals={};
for(const metric of otel.metrics){
 for(const point of metric.points){
  assert(!('app.task_id' in point.attributes)&&!('app.op_id' in point.attributes));
  if('value' in point)totals[metric.name]=(totals[metric.name]||0)+point.value;
  else{assert.equal(point.count,2);assert(point.sum_ms>=0);}
 }
}
assert.deepEqual(totals,{'lab.tool.effects':1,'lab.tool.attempts':2,'lab.teaching.cost':5,'lab.task.successes':1});
assert.equal(otel.cost_ledger.reduce((total,row)=>total+row.teaching_cost_units,0),5);
assert.equal(otel.all_attempt_cost_per_success,5);assert.equal(otel.success_http_attempt_only_cost,2);
assert.equal(otel.pricing,'fixed_teaching_units_not_real_model_or_cloud_billing');
// Independent critical-path and biased-sampling examples.
assert.equal(50+Math.max(300,400)+30+300+70+30+60+60,1000);
assert.equal(50+300+400+30+300+70+30+60+60,1300);
assert.equal((90/.1)/(90/.1+100),.9);assert(90/190<.48);
assert.equal(80*2+10*5+10*4,250);
execFileSync(python,['-B','-c',`from pathlib import Path
import zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/scaling-collectives-traces.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/scaling-collectives-traces').iterdir():
  if p.is_file(): assert z.read('scaling-collectives-traces/'+p.name)==p.read_bytes(),p.name
for p in Path('dist/diagrams').glob('v24-*.svg'):
 ET.parse(p)
`],{encoding:'utf8'});
for(const[route,anchor]of [['native','scaling-control-chain'],['training','collective-members-layout'],['agent','agent-observation-signals']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');
 assert(page.indexOf('id="'+anchor+'"')>=0&&page.indexOf('id="'+anchor+'"')<page.indexOf('id="examples"'));
}
console.log('PASS: independent HPA/queue oracle, real promtool record + exact fixtures, Gloo reduction/ragged/mismatch evidence, actual SDK parent/header/time/counter relationships, exact static source/ZIP and knowledge before cases. External tools were run locally; CI does not reinstall them.');

