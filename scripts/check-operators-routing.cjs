const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({operatorRoutingFiles,operatorRoutingValidation,courseReadingStages})',c)));
const root='dist/labs/operators-routing/',r=JSON.parse(fs.readFileSync(root+'validation.json'));
assert.deepEqual(r,d.operatorRoutingValidation);assert.equal(r.status,'passed');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[file,source]of Object.entries(d.operatorRoutingFiles)){
 assert.equal(source,fs.readFileSync(root+file,'utf8'));assert.equal(sha(source),r.source_sha256[file]);
 if(file==='README.md')continue;
 const page=fs.readFileSync('dist/article/'+(file==='moe_routing.py'?'moe-routing':'operator-profiling')+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),file+': exact complete source missing');
}
function checkOperators(x){
 assert.equal(x.status,'passed');assert.equal(x.source_sha256['cpu_ops.c'],r.source_sha256['cpu_ops.c']);assert.equal(x.source_sha256['operator_lab.py'],r.source_sha256['operator_lab.py']);
 const terms=[Math.exp(-2),Math.exp(-1),1],total=terms.reduce((a,b)=>a+b);
 for(let i=0;i<3;i++){const row=x.softmax.output[i];row.forEach((v,j)=>assert(Math.abs(v-(i===2?1/3:terms[j]/total))<1e-14));assert(Math.abs(row.reduce((a,b)=>a+b)-1)<1e-14);}
 assert(x.softmax.naive_exp_overflow&&x.softmax.nonfinite_rejected_without_output_change);
 assert.deepEqual([x.reduce.left_fold,x.reduce.tree,x.reduce.high_accuracy_reference],[1,0,2]);assert.equal(x.reduce.odd_five_sum,15);assert.equal(x.reduce.empty_sum,0);
 for(const p of x.gemm_shapes){
  const a=Array.from({length:p.m*p.k},(_,i)=>((i*7)%11-5)/4),b=Array.from({length:p.k*p.n},(_,i)=>((i*3)%7-3)/2);
  const expected=[];for(let i=0;i<p.m;i++)for(let j=0;j<p.n;j++){let sum=0;for(let t=0;t<p.k;t++)sum+=a[i*p.k+t]*b[t*p.n+j];expected.push(sum);}assert.deepEqual(p.output,expected);
 }
 assert(x.gemm_shapes.some(p=>p.k%p.tile&&p.n%p.tile));
 for(const timing of Object.values(x.timing.implementations)){assert.equal(timing.samples_us_per_call.length,7);assert(timing.samples_us_per_call.every(v=>v>0));assert.equal(timing.median_us,[...timing.samples_us_per_call].sort((a,b)=>a-b)[3]);}
}
function checkMoe(x){
 assert.equal(x.status,'passed');assert.equal(x.source_sha256,r.source_sha256['moe_routing.py']);
 const outputs=[[1.25,2],[2.25,.5],[1.5,-1.25],[-.5,1.75]];assert.deepEqual(x.serial_output,outputs);assert.deepEqual(x.two_process_output,outputs);assert.notDeepEqual(x.wrong_gather_output,outputs);
 assert.deepEqual(x.expert_loads,[2,3,3]);assert.equal(x.assignments.length,8);assert.equal(new Set(x.assignments.map(a=>a.token+':'+a.slot)).size,8);
 for(let t=0;t<4;t++)assert.equal(x.assignments.filter(a=>a.token===t).reduce((s,a)=>s+a.weight,0),1);
 assert.equal(x.cross_rank_assignments,x.assignments.filter(a=>a.origin_rank!==a.owner_rank).length);assert.equal(x.cross_rank_assignments,5);assert.equal(x.declared_transfer_bytes.dispatch_plus_return,2*5*2*8);
 const p=x.capacity_case;assert.equal(p.capacity_per_expert,Math.ceil(4*2/3));assert.deepEqual(p.raw_expert_loads,[4,4,0]);assert.equal(p.kept.length,6);assert.equal(p.dropped.length,2);assert.deepEqual(p.kept_weight_mass,[1,1,1,0]);assert.deepEqual(p.output[3],[0,0]);assert.deepEqual(x.tie_order,[0,1]);assert.deepEqual(x.rejected,['nonfinite','bad_width','duplicate_reply']);
 for(const stats of Object.values(x.load_diagnostics))assert(Math.abs(stats.unscaled_aux-3*stats.top1_fractions.reduce((s,f,i)=>s+f*stats.mean_full_softmax[i],0))<1e-12);
}
checkOperators(r.programs['operator_lab.py']);checkMoe(r.programs['moe_routing.py']);
const python=process.env.INFRA_LAB_PYTHON||'python3';
for(const[file,check]of [['operator_lab.py',checkOperators],['moe_routing.py',checkMoe]])check(JSON.parse(cp.execFileSync(python,['-B',root+file],{encoding:'utf8',timeout:60000})));
const p=r.programs['cpu_profile.py'];assert.equal(p.source_sha256,r.source_sha256['cpu_profile.py']);assert.equal(p.device,'cpu');assert.equal(p.threads,1);assert.equal(p.profiled_calls,5);assert(p.row_sums.every(v=>Math.abs(v-1)<1e-6));
assert.equal(p.named_ranges.length,15);for(const name of ['linear','softmax','reduce'])assert.equal(p.named_ranges.filter(x=>x.name==='lesson_'+name).length,5);
assert.equal(p.trace_sha256,sha(fs.readFileSync(root+'cpu-trace.json')));const trace=JSON.parse(fs.readFileSync(root+'cpu-trace.json'));
assert.equal(trace.traceEvents.filter(e=>e.ph==='X'&&String(e.name).startsWith('lesson_')).length,15);assert(p.events.some(e=>e.name==='aten::mm'&&e.calls===5));
const firstLinear=trace.traceEvents.find(e=>e.ph==='X'&&e.name==='lesson_linear');
assert(firstLinear,'first CPU linear region missing');
const onSameThread=(outer,inner)=>inner.pid===outer.pid&&inner.tid===outer.tid;
const inside=(outer,inner)=>onSameThread(outer,inner)&&inner.ts>=outer.ts&&inner.ts+(inner.dur??0)<=outer.ts+outer.dur;
const firstMatmul=trace.traceEvents.find(e=>e.ph==='X'&&e.name==='aten::matmul'&&inside(firstLinear,e));
assert(firstMatmul,'matmul must be inside the first linear region on the same thread');
const firstMm=trace.traceEvents.find(e=>e.ph==='X'&&e.name==='aten::mm'&&inside(firstMatmul,e));
assert(firstMm,'mm must be inside the first matmul on the same thread');
const [m,k]=p.shapes.x,[inner,n]=p.shapes.w;
assert.equal(inner,k);
assert.deepEqual(firstMm.args['Input Dims'],[p.shapes.x,p.shapes.w]);
assert.deepEqual(firstMm.args['Input type'],['float','float']);
assert.deepEqual(p.shapes.probabilities,[m,n]);
const outputBytes=4*m*n;
const allocation=trace.traceEvents.find(e=>e.name==='[memory]'&&inside(firstMm,e)&&e.args?.Bytes===outputBytes);
assert(allocation);
const profileBody=vm.runInContext('articleById("operator-profiling").sections[7][1]',c);
const profileStart=profileBody.indexOf('id="operator-profile-run"');
const profileEnd=profileBody.indexOf('<div class="code-block">',profileStart);
assert(profileStart>=0&&profileEnd>profileStart);
const walkthrough=profileBody.slice(profileStart,profileEnd);
const idealBytes=4*(m*k+k*n+m*n),flops=2*m*k*n;
for(const value of [p.shapes.x,p.shapes.w,[m,n]])assert(walkthrough.includes('<code>'+JSON.stringify(value)+'</code>'));
assert(walkthrough.includes(flops.toLocaleString('en-US')+' FLOP'));
assert(walkthrough.includes(idealBytes.toLocaleString('en-US')+' 字节'));
assert(walkthrough.includes((flops/idealBytes).toFixed(1)+' FLOP/B'));
assert(walkthrough.includes('Bytes='+outputBytes));
assert(walkthrough.includes('href="/labs/operators-routing/cpu-trace.json"'));
for(const event of [firstLinear,firstMatmul,firstMm]){
 const start=event.ts-firstLinear.ts;
 const from=start===0?'0':start.toFixed(3),end=(start+event.dur).toFixed(3);
 assert(walkthrough.includes('<code>'+event.name+'</code> '+from+'–'+end),event.name);
}
const metadata=name=>JSON.parse(decode(fs.readFileSync('dist/diagrams/'+name+'.svg','utf8').match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.deepEqual(metadata('v46-softmax-shift').result,r.programs['operator_lab.py'].softmax);assert.deepEqual(metadata('v46-reduction-order').result,r.programs['operator_lab.py'].reduce);
assert.equal(metadata('v46-gemm-access').traffic_measured,false);assert.deepEqual(metadata('v46-cpu-profile').rows,p.named_ranges.slice(0,3));assert.equal(metadata('v46-cpu-profile').trace_sha256,p.trace_sha256);
assert.deepEqual(metadata('v46-moe-routing-map').output,r.programs['moe_routing.py'].two_process_output);assert.deepEqual(metadata('v46-moe-capacity').case,r.programs['moe_routing.py'].capacity_case);
cp.execFileSync(python,['-B','-c',`import pathlib,zipfile
with zipfile.ZipFile('dist/labs/operators-routing.zip') as z:
 for p in pathlib.Path('dist/labs/operators-routing').iterdir():
  if p.is_file():assert z.read(p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
assert(d.courseReadingStages.ai.some(s=>s[1].includes('operator-profiling')));assert(d.courseReadingStages.ai.some(s=>s[1].includes('moe-routing')));
console.log('PASS: fresh C11 softmax/reduction/GEMM and two-process MoE, independent numerical/identity/capacity oracles, actual CPU trace/event binding, exact sources/ZIP and six figure records; no GPU/NCCL/Nsight evidence inferred.');
