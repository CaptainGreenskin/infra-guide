/* Independent state/numeric oracles plus source, full-code, ZIP and diagram provenance. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({files:continuousDepthFiles,records:continuousDepthValidation,articles,courseDomainPlan,courseReadingStages})',c)));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(?:39|x27);/g,"'").replace(/&amp;/g,'&');
for(const[pack,files]of Object.entries(d.files)){
 const record=JSON.parse(fs.readFileSync('dist/labs/'+pack+'/validation.json'));assert.equal(record.status,'passed');assert.deepEqual(record,d.records[pack]);
 for(const[file,source]of Object.entries(files)){
  assert.equal(source,fs.readFileSync('dist/labs/'+pack+'/'+file,'utf8'));
  if(!file.endsWith('.py'))continue;
  assert.equal(hash(source),record.source_sha256[file]);
  const chapter=pack==='runtime-scheduling'?(file==='schedule_lab.py'?'scheduling-resources':'container-runtime'):pack==='speculative-decoding'?'speculative-decoding':'agent-recovery';
  const html=d.articles.find(a=>a.id===chapter).sections.map(s=>s[1]).join('');
  assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),file+': complete inline source differs');
 }
}
const rt=d.records['runtime-scheduling'],native=rt.execution.container,scheduler=rt.execution.scheduler;
assert.equal(rt.ci.run_id,42432475291);assert.equal(rt.ci.conclusion,'success');assert.equal(rt.ci.source_commit,'c79d2fa8f9bd172bcde615d87acdffd900c3511d');
assert(native.host.startsWith('Linux'));assert(/@sha256:[0-9a-f]{64}$/.test(native.image));
for(const[file,sha]of Object.entries(native.source_sha256))assert.equal(rt.source_sha256[file],sha);
assert.equal(rt.source_sha256['schedule_lab.py'],scheduler.source_sha256);
const[cpu,pids,oom]=native.cases;
assert.equal(cpu.cpu_max,'50000 100000');assert.equal(cpu.memory_max,96*1024**2);assert.equal(cpu.pid,1);
assert(cpu.cpu_stat_delta.usage_usec>0&&cpu.cpu_stat_delta.nr_throttled>0);assert(cpu.wall_seconds>=2.5);
assert.equal(pids.pids_max,16);assert.equal(pids.pids_current,pids.created_threads+1);assert.equal(pids.pids_current,16);assert(pids.refusal&&pids.pids_max_events_delta>0);
assert.equal(oom.exit_code,137);assert.equal(oom.oom_killed,true);
for(const key of ['pid','mnt','net'])assert.notEqual(native.concurrent_namespaces[0][key],native.concurrent_namespaces[1][key]);
const containerArticle=d.articles.find(a=>a.id==='container-runtime');
const containerOpening=containerArticle.sections[0][1],instanceFigure=containerOpening.indexOf('<figure');
assert(instanceFigure>0&&containerOpening.slice(0,instanceFigure).includes('命名空间（namespace）')&&containerOpening.slice(0,instanceFigure).includes('控制组（cgroup）'));
const instanceLink=containerOpening.slice(instanceFigure);
assert(instanceLink.includes('/article/container-runtime/#container-native-run')&&containerArticle.sections[7][1].includes('id="container-native-run"'));
assert(instanceLink.includes(native.image.split('@sha256:')[1].slice(0,8)));
for(const observation of native.concurrent_namespaces)assert(instanceLink.includes(observation.pid.match(/\d+/)[0]));
assert(containerArticle.sections[1][1].includes('/article/delivery/#native-release-artifact-trust'));
const o=scheduler.observations;
assert.equal(o.quota_rejection.object_exists,false);assert.equal(o.quota_rejection.quota.hard['requests.cpu'],'300m');assert.equal(o.quota_rejection.quota.used['requests.cpu'],'250m');assert(250+100>300);
const toMilli=s=>s.endsWith('m')?+s.slice(0,-1):+s*1000;
const capacity=Object.values(scheduler.allocatable).map(a=>toMilli(a.cpu));assert.equal(capacity.length,2);
assert.equal(o.oversized.request_millicpu,Math.max(...capacity)+1000);
const pending=x=>{assert.equal(x.phase,'Pending');assert.equal(x.node,null);assert(x.conditions.some(c=>c.type==='PodScheduled'&&c.status==='False'&&c.reason==='Unschedulable'));};
for(const x of [o.oversized,o.spread_blocked,o.spread_full])pending(x);
assert.equal(o.fits.phase,'Running');assert(o.fits.conditions.some(c=>c.type==='Ready'&&c.status==='True'));
assert.equal(o.spread_first.node,scheduler.workers[0]);assert.equal(o.spread_tolerated.node,scheduler.workers[1]);assert.notEqual(o.spread_first.node,o.spread_tolerated.node);
assert.equal(o.spread_blocked.uid,o.spread_tolerated.uid,'only a toleration was added to the same Pod');
assert(!([[4,4],[2,8]].some(([cpu,mem])=>cpu>=3&&mem>=6)),'declared resource shape has no feasible node');

const gcd=(a,b)=>b?gcd(b,a%b):a,format=(n,de)=>{const g=gcd(n,de);return de/g===1?String(n/g):`${n/g}/${de/g}`;};
function sampling(x){
 assert.deepEqual(x.p,['1/2','1/3','1/6']);assert.deepEqual(x.q,['1/6','1/3','1/2']);assert.deepEqual(x.accepted_mass,['1/6','1/3','1/6']);
 assert.equal(x.acceptance,'2/3');assert.deepEqual(x.residual,['1','0','0']);assert.deepEqual(x.correct_marginal,x.p);assert.deepEqual(x.wrong_using_p_as_residual,['1/3','4/9','2/9']);
 assert.deepEqual(x.equal_distributions,x.p);assert.deepEqual(x.zero_draft_support,x.p);
 assert.equal(x.sequence_probabilities.length,27);const seen=new Set();
 for(const row of x.sequence_probabilities){
  assert.equal(row.tokens.length,3);seen.add(row.tokens.join(','));let n=1,de=1;
  for(let i=0;i<3;i++){const offset=i?row.tokens[i-1]:0;const numerators=[3,2,1];n*=numerators[(row.tokens[i]+offset)%3];de*=6;}
  assert.equal(row.mass,format(n,de));assert.equal(row.target_mass,row.mass);
 }assert.equal(seen.size,27);
}
const spec=d.records['speculative-decoding'].execution;sampling(spec.sampling);
function cache(x){
 assert.equal(x.device,'cpu');assert.equal(x.dtype,'torch.float64');assert.equal(x.torch,'2.5.1');
 const good=x.all_accept,bad=x.reject_second;
 assert.deepEqual(good.draft_fixture,[0,4,3]);assert.deepEqual(good.output,[0,4,3,0]);assert.equal(good.accepted,3);assert.equal(good.committed_cache_length,7);
 assert.deepEqual(bad.draft_fixture,[0,5,3]);assert.deepEqual(bad.output,[0,4]);assert.equal(bad.accepted,1);assert.equal(bad.verified_cache_length,6);assert.equal(bad.retained_before_correction,4);assert.equal(bad.committed_cache_length,5);
 for(const row of [good,bad]){assert.deepEqual(row.output,row.serial_target_output);assert([...row.cache_max_errors,...row.conditional_max_errors,row.next_logit_max_error].every(e=>e<1e-12));assert.equal(row.target_calls_after_prefill.verify+row.target_calls_after_prefill.consume_correction_or_bonus,2);assert.equal(row.target_calls_after_prefill.serial_consuming_same_output,row.output.length);}
 assert.equal(bad.negative_keep_rejected_cache.wrong_cache_length,7);assert.equal(bad.negative_keep_rejected_cache.correct_cache_length,5);assert(bad.negative_keep_rejected_cache.next_logit_max_error>1e-5);
}cache(spec.cache);
function crashes(x){
 assert.equal(x.source_sha256,d.records['agent-crash-windows'].source_sha256['crash_windows.py']);assert.equal(x.status,'passed');assert.equal(x.cases.length,6);
 assert.deepEqual(x.cases.map(c=>c.window),['intent','before_commit','after_commit','response','observation','done']);
 assert.deepEqual(x.cases.map(c=>c.at_crash.runner_phase),['INTENT','INTENT','INTENT','INTENT','OBSERVED','DONE']);assert.deepEqual(x.cases.map(c=>c.at_crash.effects),[0,0,1,1,1,1]);
 for(const row of x.cases){const r=row.recovered;assert.equal(row.kill_exit_code,-9);assert.equal(r.runner_phase,'DONE');assert.equal(r.effects,1);assert.equal(r.amount,37);assert.equal(r.receipts.length,1);assert.deepEqual(r.observation,r.receipts[0]);assert.equal(r.receipts[0].op,'logical-add-1');assert(row.independent_oracle_accepted);assert.equal(row.done_retry_http_calls,0);}
 const race=x.cases[1];assert(race.receipt_absent_while_old_request_lives);assert.equal(race.after_old_request.effects,1);assert.equal(race.after_old_request.amount,37);assert.equal(race.resume_path,'queried_receipt');
 assert(x.cases[4].corrupt_local_observation_rejected);assert.equal(x.negative.recovered.amount,74);assert.equal(x.negative.recovered.effects,2);assert.equal(x.negative.independent_oracle_accepted,false);
}
crashes(d.records['agent-crash-windows'].execution);
const inflight=d.articles.find(a=>a.id==='agent-recovery').sections[5][1];
const race=d.records['agent-crash-windows'].execution.cases.find(row=>row.window==='before_commit');
assert(inflight.includes(`结果为空，账户仍是 ${race.at_crash.amount}`));
assert(inflight.includes(`接收方把账户改成 ${race.after_old_request.amount}`));
assert(inflight.includes(`<code>${race.after_old_request.runner_phase}</code>`)&&inflight.includes(`<code>${race.recovered.runner_phase}</code>`));
assert(inflight.includes('/labs/agent-crash-windows/validation.json')&&inflight.includes('/article/agent-runtime/#runtime-report-error-cases'));
const python=process.env.INFRA_LAB_PYTHON||'python3';
sampling(JSON.parse(cp.execFileSync(python,['-B','dist/labs/speculative-decoding/exact_sampling.py'],{encoding:'utf8',timeout:10000})));
if(process.platform!=='win32')crashes(JSON.parse(cp.execFileSync(python,['-B','dist/labs/agent-crash-windows/crash_windows.py'],{encoding:'utf8',timeout:45000})));
if(process.env.INFRA_TORCH_PYTHON)cache(JSON.parse(cp.execFileSync(process.env.INFRA_TORCH_PYTHON,['-B','dist/labs/speculative-decoding/cache_verify.py'],{encoding:'utf8',timeout:20000})));
const meta=name=>JSON.parse(decode(fs.readFileSync('dist/diagrams/'+name+'.svg','utf8').match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.deepEqual(meta('v48-container-resource-evidence').cases,native.cases);
assert.deepEqual(meta('v48-scheduler-feasibility').allocatable,scheduler.allocatable);assert.equal(meta('v48-scheduler-feasibility').actual_request_millicpu,o.oversized.request_millicpu);
assert.deepEqual(meta('v48-spec-cache-cut').execution,spec.cache.reject_second);assert.equal(meta('v48-spec-cost-boundary').measured_speedup,false);
assert.deepEqual(meta('v48-agent-crash-window-matrix').cases,d.records['agent-crash-windows'].execution.cases);
assert.equal(meta('v48-agent-absent-race').timing_scale,false);
assert.equal(d.courseDomainPlan.find(r=>r[0]==='platform')[2].at(-1),'speculative-decoding');assert(d.courseReadingStages.ai.some(s=>s[1].includes('speculative-decoding')));
cp.execFileSync(python,['-B','-c',`import pathlib,zipfile,xml.etree.ElementTree as ET
for pack in ['runtime-scheduling','speculative-decoding','agent-crash-windows']:
 with zipfile.ZipFile('dist/labs/'+pack+'.zip') as z:
  for p in pathlib.Path('dist/labs',pack).iterdir():
   if p.is_file(): assert z.read(p.name)==p.read_bytes(),p
figures=list(pathlib.Path('dist/diagrams').glob('v48-*.svg'));assert len(figures)==12
for p in figures:
 r=ET.parse(p).getroot()
 for name in ['title','desc','metadata']: assert r.find('{http://www.w3.org/2000/svg}'+name) is not None,p
`],{encoding:'utf8'});
console.log('PASS: native Docker/kind CI state and immutable source binding; exact 27-sequence law, real CPU cache records, fresh six-process-crash windows and independent business oracle; 3 full-source ZIPs, 12 varied diagrams and course links. No physical-node/GPU/Kairo result inferred.');
