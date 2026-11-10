/* Independently check numbers, ownership, original article contracts and shipped artifacts. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const {execFileSync,spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const lab='dist/labs/inference-cache/';
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
// libm can change the final bits of exp-derived CPU scores across platforms.
// Only these exact numerical leaves may vary; counters, tokens and shape cannot.
function approximateOutputPath(parts){
 return parts.length===6&&parts[0]==='pressure'&&parts[1]==='trace'&&/^(0|[1-9]\d*)$/.test(parts[2])&&parts[3]==='requests'&&parts[5]==='output'
  ||parts.length===5&&parts[0]==='cow_exhaustion'&&parts[1]==='unchanged_snapshot'&&parts[2]==='requests'&&parts[4]==='output'
  ||parts.length===2&&parts[0]==='identities'&&parts[1]==='wrong_block_tokens_only_output_error';
}
function sameExecutedResult(value,expected,parts=[]){
 const label=parts.join('.')||'<root>';
 if(typeof value==='number')assert(Number.isFinite(value),'non-finite actual at '+label);
 if(typeof expected==='number')assert(Number.isFinite(expected),'non-finite record at '+label);
 if(approximateOutputPath(parts)){
  assert(typeof value==='number'&&typeof expected==='number','numeric output required at '+label);
  assert(Math.abs(value-expected)<=1e-12,'numerical drift at '+label);
 }else if(expected!==null&&typeof expected==='object'){
  assert(value!==null&&typeof value==='object','object required at '+label);
  assert.equal(Array.isArray(value),Array.isArray(expected),'container type at '+label);
  if(Array.isArray(expected))assert.equal(value.length,expected.length,'array length at '+label);
  assert.deepStrictEqual(Object.keys(value).sort(),Object.keys(expected).sort(),'exact fields at '+label);
  for(const key of Object.keys(expected))sameExecutedResult(value[key],expected[key],parts.concat(key));
 }else assert.deepStrictEqual(value,expected,'exact value at '+label);
}
// Exercise all allowed leaves and independently reject changes outside the whitelist.
const resultFixture={pressure:{trace:[{requests:{A:{output:.41989627258244244,tokens:[1,2],blocks:[[0,1]]}},computed_positions:2}]},cow_exhaustion:{unchanged_snapshot:{requests:{C:{output:.1}}}},identities:{wrong_block_tokens_only_output_error:.20677923789449304},metadata:{output:.4},scope:'cpu'};
const copyFixture=()=>JSON.parse(JSON.stringify(resultFixture));
const lastBits=copyFixture();
lastBits.pressure.trace[0].requests.A.output+=Number.EPSILON;
lastBits.cow_exhaustion.unchanged_snapshot.requests.C.output+=Number.EPSILON;
lastBits.identities.wrong_block_tokens_only_output_error=.20677923789449237;
sameExecutedResult(lastBits,resultFixture);
for(const mutate of [
 x=>{x.pressure.trace[0].requests.A.output+=1e-8;},
 x=>{x.cow_exhaustion.unchanged_snapshot.requests.C.output+=1e-8;},
 x=>{x.identities.wrong_block_tokens_only_output_error+=1e-8;},
 x=>{x.pressure.trace[0].requests.A.output=NaN;},
 x=>{x.identities.wrong_block_tokens_only_output_error=Infinity;},
 x=>{delete x.cow_exhaustion.unchanged_snapshot.requests.C.output;},
 x=>{x.pressure.trace[0].computed_positions+=1e-12;},
 x=>{x.pressure.trace[0].requests.A.tokens[0]+=1e-12;},
 x=>{x.pressure.trace[0].requests.A.blocks[0][0]+=1e-12;},
 x=>{x.metadata.output+=Number.EPSILON;},
 x=>{x.pressure.trace.push(x.pressure.trace[0]);},
 x=>{x.scope='changed';},
 x=>{x.extra=true;}
]){const changed=copyFixture();mutate(changed);assert.throws(()=>sameExecutedResult(changed,resultFixture),assert.AssertionError);}
const invalidRecord=copyFixture();invalidRecord.pressure.trace[0].requests.A.output=NaN;
assert.throws(()=>sameExecutedResult(resultFixture,invalidRecord),assert.AssertionError);
const record=JSON.parse(fs.readFileSync(lab+'validation.json'));
assert.equal(record.status,'passed');
for(const[name,hash]of Object.entries(record.source_sha256))assert.equal(digest(fs.readFileSync(lab+name)),hash,'source record: '+name);
const actual=JSON.parse(execFileSync('python3',['-B',lab+'paged_cache.py'],{encoding:'utf8',timeout:20000}));
sameExecutedResult(actual,record.result);
const broken=spawnSync('python3',['-B',lab+'paged_cache.py','--unsafe-shared-write'],{encoding:'utf8',timeout:20000});
assert.equal(broken.status,1);assert(broken.stderr.includes('cached_cell_differs_from_full_prefix'));

// Independent full-prefix JS oracle; never use Python step, block layout or emitted scores.
const attention=(query,keys,values)=>{
 const scores=keys.map(k=>query*k),peak=Math.max(...scores),weights=scores.map(s=>Math.exp(s-peak));
 return weights.reduce((n,w,i)=>n+w*values[i],0)/weights.reduce((a,b)=>a+b,0);
};
function whole(tokens){
 const k=tokens.map((t,i)=>t*.13+i*.03),v=tokens.map((t,i)=>t*.17-i*.02);
 const z=tokens.map((t,i)=>attention(t*.11,k.slice(0,i+1),v.slice(0,i+1)));
 const k2=z.map((h,i)=>.7*h+.05*i),v2=z.map((h,i)=>.9*h+.02*tokens[i]);
 return z.map((h,i)=>attention(.8*h,k2.slice(0,i+1),v2.slice(0,i+1)));
}
function owners(snapshot){
 const refs=new Map();
 for(const request of Object.values(snapshot.requests)){
  const values=whole(request.tokens);
  assert(Math.abs(values.at(-1)-request.output)<1e-12,'independent numerical output');
  assert.equal(request.blocks.length,Math.ceil(request.tokens.length/4));
  for(const[slot,generation]of request.blocks){
   assert.equal(snapshot.physical[slot].generation,generation,'only current handle generation');
   refs.set(slot,(refs.get(slot)||0)+1);
  }
 }
 for(const block of snapshot.physical){
  assert.equal(block.refs,refs.get(block.slot)||0,'refs must count actual holders');
  assert(block.positions>=0&&block.positions<=4);
  if(block.cached)assert.equal(block.positions,4);
 }
}
const p=actual.pressure;
assert.equal(p.block_size,4);assert.equal(p.pool_blocks,4);p.trace.forEach(owners);
assert.deepStrictEqual(p.trace.map(x=>x.computed_positions),[8,9,13,25,31,31]);
assert.deepStrictEqual(p.trace.map(x=>x.reused_positions),[4,4,4,4,4,4]);
assert.deepStrictEqual(p.trace.map(x=>x.copies),[0,1,1,1,1,1]);
assert.equal(p.rejected,'all_blocks_referenced');assert.equal(p.stale_handle,'stale_generation');
assert.equal(p.restored_computed_positions,6);assert.equal(p.final_active_references,0);
assert.equal(p.trace[1].physical[0].refs,3);
assert.deepStrictEqual(p.trace[1].requests.C.blocks,[[0,1],[3,1]]);
assert.deepStrictEqual(p.trace[1].requests.A.blocks,[[0,1],[1,1]]);
assert.equal(p.trace[2].physical[2].generation,2);
owners(actual.cow_exhaustion.unchanged_snapshot);
assert.equal(actual.cow_exhaustion.error,'all_blocks_referenced');
assert.equal(actual.cow_exhaustion.final_active_references,0);
assert.equal(actual.identities.adapter_changed_reused_positions,0);
assert.equal(actual.identities.adapter_changed_computed_positions,5);
assert(actual.identities.wrong_block_tokens_only_output_error>.2);

const specifications={A:{arrival:0,prompt:[1],count:4}};
for(let i=1;i<=8;i++)for(let j=0;j<2;j++)specifications['B'+i+j]={arrival:i,prompt:[2+j],count:1};
for(const run of actual.schedulers){
 assert.equal(run.completed_requests,17);assert.equal(run.work_positions,20);
 const used={},events={};for(const name of Object.keys(specifications)){used[name]=0;events[name]=[];}
 for(const step of run.trace){
  assert(step.processed.length<=2);assert.equal(new Set(step.processed).size,step.processed.length);
  for(const name of step.processed){
   assert(step.iteration>=specifications[name].arrival);used[name]++;
   assert(used[name]<=specifications[name].prompt.length+specifications[name].count-1);
  }
  assert.deepStrictEqual(step.emitted,step.processed); // all prompts are exactly one position in this fixed load
  for(const name of step.emitted)events[name].push(step.iteration);
 }
 assert.equal(Object.values(used).reduce((a,b)=>a+b),20);
 for(const[name,spec]of Object.entries(specifications)){
  const tokens=spec.prompt.slice(),expected=[];
  for(let n=0;n<spec.count;n++){
   const score=whole(tokens).at(-1),next=Math.trunc(Math.abs(score)*1000)%10+1;
   expected.push(next);tokens.push(next);
  }
  assert.deepStrictEqual(run.requests[name].outputs,expected,'independent generated sequence '+name);
  assert.deepStrictEqual(run.requests[name].events,events[name]);
 }
 assert.deepStrictEqual(run.A_output_iterations,events.A);
 assert.equal(run.A_max_output_gap,Math.max(...events.A.slice(1).map((t,i)=>t-events.A[i])));
 assert.equal(run.B81_first_output_wait,events.B81[0]-8);
}
assert.deepStrictEqual(actual.schedulers.map(s=>s.A_max_output_gap),[9,2]);
assert.deepStrictEqual(actual.schedulers.map(s=>s.B81_first_output_wait),[0,2]);
assert.deepStrictEqual(actual.schedulers.map(s=>s.iterations),[12,11]);

const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&');
const diagrams={};
for(const name of ['blocks','lifecycle','fairness']){
 const svg=fs.readFileSync('dist/diagrams/inference-cache-'+name+'.svg','utf8');
 assert(svg.includes('<title')&&svg.includes('<desc'));
 diagrams[name]=JSON.parse(decode(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
}
// Published artifacts remain exactly bound to their immutable published record.
assert.deepStrictEqual(diagrams.blocks.before,record.result.pressure.trace[0]);assert.deepStrictEqual(diagrams.blocks.after,record.result.pressure.trace[1]);
assert.deepStrictEqual(diagrams.lifecycle.events,record.result.pressure.trace);
assert.deepStrictEqual(diagrams.fairness.schedulers,record.result.schedulers);

const context={};vm.createContext(context);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;
 vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context,{filename:file});
}
if(!vm.runInContext('typeof inferenceCacheBridgeRevisions!=="undefined"',context))vm.runInContext(fs.readFileSync('dist/inference-cache-bridge.js','utf8'),context,{filename:'inference-cache-bridge.js'});
const article=JSON.parse(vm.runInContext('JSON.stringify(articles.find(a=>a.id==="inference-performance"))',context));
const contract=JSON.parse(fs.readFileSync(lab+'contracts.json'));
assert.deepStrictEqual(article.sections.map(s=>s[0]),contract.titles);
const queueSection=5,queueHeading='<h3 id="native-inference-queue">';
const queueBody=article.sections[queueSection][1],queueStart=queueBody.indexOf(queueHeading);
assert(queueStart>=0,'native inference queue has its own heading');
const codeBlocks=html=>[...html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)].map(m=>m[0]);
const queueCode=codeBlocks(queueBody.slice(queueStart));
assert.equal(queueCode.length,1,'native queue unit has one distinct run command');
assert(queueCode[0].includes('concurrency_lab.py'),'native queue run command');
const disaggregationBody=article.sections[2][1];
const disaggregationStart=disaggregationBody.indexOf('<div class="mechanism-core" data-practice="pd-split">');
const handoffStart=disaggregationBody.indexOf('<h3 id="native-slot-handoff">',disaggregationStart);
const disaggregationEnd=disaggregationBody.indexOf('<h3 id="vllm-v1-request-path">',disaggregationStart);
assert(disaggregationStart>=0&&handoffStart>disaggregationStart&&disaggregationEnd>handoffStart,'isolate the disaggregation and native cache handoff experiments');
const disaggregationCode=codeBlocks(disaggregationBody.slice(disaggregationStart,handoffStart));
assert.equal(disaggregationCode.length,1);
assert(disaggregationCode[0].includes('pd_split.py'),'disaggregation experiment has its own run command');
let total=0;
for(let i=0;i<article.sections.length;i++){
 const html=article.sections[i][1];
 const historical=i===2?html.slice(0,disaggregationStart)+html.slice(disaggregationEnd):i===queueSection?html.slice(0,queueStart):html;
 const pre=codeBlocks(historical);
 const original=contract.original_pre_sha256[i];
 assert.deepStrictEqual(pre.map(digest).filter(hash=>original.includes(hash)),original,'all original full pre blocks in order: '+i);
 for(const id of contract.inner_ids[i])assert(html.includes('id="'+id+'"'),'existing internal ID '+id);
 total+=pre.length-original.length;
}
assert.equal(total,contract.added_pre_blocks);
const source=fs.readFileSync(lab+'paged_cache.py','utf8');
assert.equal(vm.runInContext('inferenceCacheSource',context),source);
assert([...article.sections[5][1].matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()));
assert(article.sections[2][1].includes('id="inference-cache-mechanism"'));
assert(article.sections[5][1].includes('id="inference-cache-run"'));
assert(article.updated>='2026.11.08');assert(article.minutes>=50);
execFileSync('python3',['-c',`from pathlib import Path
import zipfile
lab=Path('dist/labs/inference-cache')
with zipfile.ZipFile(lab.with_suffix('.zip')) as z:
 assert z.testzip() is None
 expected=['README.md','contracts.json','paged_cache.py','validation.json']
 assert sorted(z.namelist())==sorted('inference-cache/'+n for n in expected)
 for name in expected: assert z.read('inference-cache/'+name)==(lab/name).read_bytes(),name
`],{encoding:'utf8'});
console.log('PASS: path-limited finite-score tolerance and strict rejection fixtures, real cache numbers and ownership, failed COW rollback, stale generations, full-prefix identity, 17 independently recomputed sequences, actual fairness/work conservation, source-bound 3 SVGs, 2 new pre blocks with all old blocks/IDs retained, exact ZIP.');
