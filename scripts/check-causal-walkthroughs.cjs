/* Verify the new numerical examples, unchanged source and actual local state replay. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),cp=require('child_process'),crypto=require('crypto');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const data=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,edits:causalWalkthroughRevisions,code:causalTeachingCode})',c)));
const prior=require('./content-at-commit.cjs')('8d5b31ef7859aa3c44766c1492b18e1577e8d821');
// Check the unchanged-body claim at the publication that made it. Current later
// edits have their own whole-corpus comparison in check-system-budget-walkthroughs.
const publishedCommit='89db380eb03f932c423eb2f22976e87a2aec18f2';
const published=require('./content-at-commit.cjs')(publishedCommit);
const ids=[...new Set(data.edits.map(e=>e.id))];assert.deepEqual(ids,['slo','gpu-execution','agent-memory']);
for(const track of ['cloud','ai','agent'])assert.equal(ids.filter(id=>data.modules.find(m=>m.id===data.articles.find(a=>a.id===id).module).track===track).length,1);
const pre=body=>body.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[],all=a=>a.sections.map(s=>s[1]).join('');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
for(const before of prior){
 const a=data.articles.find(x=>x.id===before.id);assert(a,before.id+': published chapter removed');assert.deepEqual(a.sections.map(s=>s[0]),before.sections.map(s=>s[0]),a.id+': section anchors and headings');
 if(!ids.includes(a.id)){assert.deepEqual(published.find(x=>x.id===a.id).sections,before.sections,a.id+': unreviewed V51 body change');continue;}
 let index=0;const current=pre(all(a));for(const original of pre(all(before))){const at=current.indexOf(original,index);assert(at>=index,a.id+': original complete code removed, reordered or modified');index=at+1;}
 assert.equal(current.length-pre(all(before)).length,a.id==='agent-memory'?0:1,a.id+': unexpected new code');
 const html=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8');for(let i=1;i<=a.sections.length;i++)assert(html.includes('id="section-'+i+'"'));
 assert(html.includes('在领域图谱中看本章相关概念'));
}
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[id,key]of [['slo','slo'],['gpu-execution','gpu']]){
 const snippets=[...all(data.articles.find(a=>a.id===id)).matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]));assert(snippets.includes(data.code[key]));
}
const python=source=>cp.execFileSync('python3',['-c',source],{encoding:'utf8',timeout:15000}).trim();
assert.equal(python(data.code.slo),'SLI 989/1000\n允许坏事件 10 剩余预算 -1\n燃烧倍数 11/10');
// Boundary cases include exact block multiples and two different remainders.
for(const n of [0,1,255,256,257,2500,2560,2561,5001]){
 const result=python(data.code.gpu.replace('n, block_size = 2500, 256','n, block_size = '+n+', 256'));
 const q=Math.floor(n/256),r=n%256,blocks=q+Number(r>0),extra=r?256-r:0;
 assert.equal(result,'block数 '+blocks+' 有效编号 '+n+' 保护编号 '+extra+'\n逻辑读写字节 '+n*8);
}
// Independent integer checks for the new uneven-traffic budget comparison.
assert.equal(144*100/7200,2);assert.equal(144*100/1000,14.4);assert.equal(720*10000/1000,7200);
const result=JSON.parse(cp.execFileSync('python3',['-B','dist/labs/storage-quant-context/context_state.py'],{encoding:'utf8',timeout:15000}));
assert.deepEqual(result.correct_recovery,{authority_state:'SUCCEEDED',authority_version:2,original_op:'R17:publish',receipt:13,effects:1,stale_update_rows:0,needs_chat_history:false});
assert.equal(result.negative_summary_recovery.effects,2);assert.deepEqual(result.memory_selection.accepted,[{memory_id:'current',source_version:2,value:10}]);assert.deepEqual(result.after_retraction.accepted,[]);
const stateSource=fs.readFileSync('dist/labs/storage-quant-context/context_state.py','utf8');assert(stateSource.includes('db.execute("BEGIN IMMEDIATE")'));assert(stateSource.indexOf('receiver(db, task[1])')<stateSource.indexOf('db.commit()'));
const memory=data.articles.find(a=>a.id==='agent-memory');assert(!memory.sections[4][1].includes('检索出来之后，按本次问题重新判定适用性'));assert(memory.sections[3][1].includes('任务表与效果表在同一SQLite事务提交'));assert(memory.sections[4][1].includes('属于不同对象，各自推进'));
for(const name of ['v51-slo-event-ledger','v51-gpu-work-mapping','v51-gpu-time-boundaries','v51-agent-information-flow']){
 const svg=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8');assert(svg.includes('<title')&&svg.includes('<desc')&&svg.includes('<metadata>'));
 assert(svg.includes('viewBox="0 0 1120 '));assert(data.articles.some(a=>all(a).includes('diagrams/'+name+'.svg')));
}
const review=require('./coherence-review-records.cjs').bodyUpdate;
const priorReview=JSON.parse(cp.execFileSync('git',['show','8d5b31ef7859aa3c44766c1492b18e1577e8d821:docs/POST_WINDOW_BODY_REVIEWS.json'],{encoding:'utf8'}));
const currentReview=JSON.parse(fs.readFileSync('docs/POST_WINDOW_BODY_REVIEWS.json','utf8'));
assert.deepEqual(currentReview.revisions.slice(0,priorReview.revisions.length),priorReview.revisions,'published body reviews must remain unchanged');
assert.equal(review.reader_trials,0);assert.deepEqual(review.body_reviews.map(r=>r.id),ids);
// The V51 signed body describes its published revision; the current six-body changes have a separate chained review.
for(const row of review.body_reviews){const a=published.find(a=>a.id===row.id),old=prior.find(a=>a.id===row.id);assert.equal(row.previous_content_sha256,sha(JSON.stringify({title:old.title,sections:old.sections})));assert.equal(row.reviewed_content_sha256,sha(JSON.stringify({title:a.title,sections:a.sections})));assert(row.scope&&row.observation);}
for(const[file,revision]of Object.entries(review.source_revisions))assert.equal(revision.reviewed_sha256,sha(cp.execFileSync('git',['show',publishedCommit+':'+file],{maxBuffer:16*1024*1024})),file+': published V51 source differs from review');
console.log('PASS: three reviewed body walkthroughs, all72 other bodies and original full source blocks preserved; actual Fraction/index boundary replays, independent uneven-traffic budgets and fresh SQLite state/memory replay. Four original teaching diagrams; no GPU, production telemetry, LLM or Kairo execution inferred.');
