const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({servingConsistencyFiles,servingConsistencyValidation})',c);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const actual={};
for(const[id,name]of [['cache-consistency','cache_outbox.py'],['inference-performance','serving_scheduler.py'],['agent-retrieval','retrieval_pipeline.py']]){
 const source=fs.readFileSync('dist/labs/serving-consistency/'+name,'utf8');
 assert.equal(d.servingConsistencyFiles[name],source);
 assert.equal(d.servingConsistencyValidation.programs[name].sha256,crypto.createHash('sha256').update(source).digest('hex'));
 const html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),'static inline source mismatch: '+name);
 actual[name]=JSON.parse(execFileSync('python3',['dist/labs/serving-consistency/'+name],{encoding:'utf8',timeout:25000}));
}
const cache=actual['cache_outbox.py'];
assert.deepEqual(cache.event_gap,{cache:[7,'pending'],source:[8,'shipped']});
assert.equal(cache.writer_commit_then_exit,23);assert.equal(cache.rollback_created_event,false);
assert.deepEqual(cache.delivery_order,[9,8,9]);assert.equal(cache.final_floor,9);
assert.deepEqual(cache.final_cache,[9,'delivered']);assert.equal(cache.pending_outbox,0);
assert.equal(cache.late_fill,'stale_fill_rejected');assert(cache.eviction_kept_floor);
assert.equal(cache.event_identity_conflict,'event_identity_conflict');
assert.equal(cache.replay_after_floor_loss,'duplicate');assert.deepEqual(cache.lost_floor_negative,[7,'pending']);

const scheduler=actual['serving_scheduler.py'];
const specs={new_short_prompt:{A:[32,4],B:[4,2],C:[8,2]},long_prompt_while_streaming:{A:[4,6],B:[32,2]}};
for(const[label,policies]of Object.entries(scheduler.cases))for(const run of Object.values(policies)){
 let elapsed=0,expectedTotal=0;
 for(const[prompt,outputs]of Object.values(specs[label]))expectedTotal+=prompt*100+(outputs-1)*1000;
 for(const step of run.trace){
  const prefill=Object.values(step.prefill).reduce((a,b)=>a+b,0);
  assert(prefill+step.decode.length<=40);assert(step.reserved_before<=run.kv_capacity);
  assert.equal(step.start_us,elapsed);elapsed+=prefill*100+step.decode.length*1000;
  assert.equal(step.end_us,elapsed);
 }
 assert.equal(elapsed,expectedTotal);assert.equal(run.finish_us,expectedTotal);
 for(const[id,[prompt,outputs]]of Object.entries(specs[label])){
  assert.equal(run.trace.reduce((n,s)=>n+(s.prefill[id]||0),0),prompt);
  assert.equal(run.trace.filter(s=>s.decode.includes(id)).length,outputs-1);
  assert.equal(run.trace.filter(s=>s.emitted.includes(id)).length,outputs);
  assert.equal(run.requests[id].reserved_slots,Math.ceil((prompt+outputs-1)/4)*4);
 }
}
assert.equal(scheduler.cases.new_short_prompt.whole.requests.B.ttft_us,2600);
assert.equal(scheduler.cases.new_short_prompt.chunked.requests.B.ttft_us,1600);
for(const run of Object.values(scheduler.cases.new_short_prompt))assert.equal(run.requests.C.admitted_us,7600);
assert.equal(scheduler.cases.long_prompt_while_streaming.whole.requests.A.max_gap_us,4200);
assert.equal(scheduler.cases.long_prompt_while_streaming.chunked.requests.A.max_gap_us,1800);
assert.equal(scheduler.cases.long_prompt_while_streaming.chunked.requests.B.ttft_us,8100);
assert.equal(scheduler.one_output.decode_steps,0);assert.equal(scheduler.one_output.max_gap_us,null);
assert.equal(scheduler.oversized_request,'request_exceeds_kv_budget');

const rag=actual['retrieval_pipeline.py'].cases;
assert.equal(rag.post_filter.body_delivery_count,0);assert.equal(rag.post_filter.rank_metrics.recall_at_2,'0');
assert.deepEqual(rag.pre_filter.rank_metrics,{precision_at_2:'1/2',recall_at_2:'1/2',reciprocal_rank:'1/2'});
assert(rag.rule_rerank_16.qualified_completion);assert.equal(rag.rule_rerank_16.answer.total,37);
assert.deepEqual(rag.rule_rerank_16.answer.citations,[['a-1',1],['a-2',2]]);
assert.equal(rag.rule_rerank_12.rank_metrics.recall_at_2,'1');
assert.equal(rag.rule_rerank_12.context_metrics.recall_at_2,'1/2');
assert.equal(rag.rule_rerank_12.context_metrics.reciprocal_rank,'1');
assert.equal(rag.rule_rerank_12.answer.status,'insufficient_evidence');assert(!rag.rule_rerank_12.qualified_completion);
assert.equal(rag.unsafe_post_filter.forbidden_task_deliveries,1);assert.equal(rag.unsafe_post_filter.obsolete_task_deliveries,1);
assert.equal(rag.revoked_before_fetch.answer.status,'denied');assert.equal(rag.revoked_before_fetch.body_delivery_count,0);
assert.equal(rag.revoked_before_fetch.used_units,0);

execFileSync('python3',['-c',`from pathlib import Path
import zipfile
with zipfile.ZipFile('dist/labs/serving-consistency.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/serving-consistency').iterdir():
  if p.is_file(): assert z.read('serving-consistency/'+p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
for(const[route,anchor]of [['cloud-data','knowledge-cache-layer'],['platform','serving-two-budgets'],['agent','retrieval-evidence-pipeline']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');
 const start=page.indexOf('id="'+anchor+'"'),examples=page.indexOf('id="examples"');
 assert(start>=0&&examples>start);
}
console.log('PASS: 3 executed programs, outbox/floor counterexamples, independent work conservation and decoding counts, staged retrieval/oracle, exact static code and ZIP.');
