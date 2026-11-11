// Verify the repaired evidence boundaries, independent queue arithmetic and source provenance.
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const ctx={};vm.createContext(ctx);
for(const [,file]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(read('dist/'+file),ctx,{filename:file});
const data=vm.runInContext('({articles,modules,depthReviewEdits})',ctx);
const audit=JSON.parse(read('docs/EDITORIAL_AUDIT_2026-11-04.json'));
const migration=JSON.parse(read('docs/COURSE_MIGRATION_2026-11-07.json'));
const expansion=require('./content-review-records.cjs');
assert(expansion.historical_eight_hour_counts_unchanged);
const pointRevisions=[...migration.knowledge_revisions,...expansion.knowledge_revisions];
for(const[file,expected]of Object.entries(migration.historical_audits))assert.equal(hash(file),expected,file+': completed historical audit must stay unchanged');
assert.equal(audit.chapters.length,63);
assert.deepEqual([...audit.chapters,...migration.new_editorial_entries,...expansion.new_chapter_reviews].map(x=>x.id).sort(),data.articles.filter(x=>['cloud','ai','agent'].includes(data.modules.find(m=>m.id===x.module).track)).map(x=>x.id).sort());
assert.equal(audit.chapters.filter(x=>x.decision==='keep').length,43);
assert.equal(audit.chapters.filter(x=>x.decision==='local').length,16);
assert.equal(audit.chapters.filter(x=>x.decision==='deep').length,4);
assert(audit.chapters.every(x=>['accepted','rechecked'].includes(x.status)&&x.observation&&x.recheck));
assert.deepEqual(data.depthReviewEdits.map(x=>x.id).sort(),audit.chapters.filter(x=>x.decision!=='keep').map(x=>x.id).sort());

const report=JSON.parse(read('dist/labs/incident-model/report.json'));
assert.equal(report.source_sha256,hash('dist/labs/incident-model/incident_model.py'));
assert.deepEqual(report.input,{requests:1000,arrival_interval_ms:10,connections:4,fixed_post_release_work_ms:10,percentile:'nearest-rank: ceil(0.95 * 1000)'});
const runs=report.runs;
for(let i=0;i<1000;i++){
 // Four staggered connections serve each group of four in 50ms, while arrivals span 40ms.
 // Each successive group waits 10ms longer. This formula is independent of the heap implementation.
 const expectedWait=Math.floor(i/4)*10;
 for(const key of ['holding_external_wait','competing_slow_sql']){
  const r=runs[key].requests[i];assert.equal(r.pool_wait_ms,expectedWait);
  assert.equal(r.latency_ms,60+expectedWait);assert.equal(r.arrival_ms,i*10);
 }
 assert.equal(runs.fixed.requests[i].latency_ms,60);
 assert.equal(runs.fixed.requests[i].pool_wait_ms,0);
}
assert.equal(runs.holding_external_wait.requests[949].latency_ms,2430);
assert.equal(runs.holding_external_wait.requests[200].latency_ms,560);
assert.equal(runs.holding_external_wait.request_201.sql_ms,20);
assert.equal(runs.competing_slow_sql.request_201.sql_ms,50);
assert.deepEqual(runs.holding_external_wait.at_10000_ms,{completed:796,queued:199,holding:4,after_release:1});
for(const run of Object.values(runs))assert.equal(Object.values(run.at_10000_ms).reduce((a,b)=>a+b,0),1000);

const probe=JSON.parse(read('dist/labs/ddp/optimizer-step-validation.json'));
assert.equal(probe.script_sha256,hash('dist/labs/ddp/optimizer_step_probe.py'));
assert.equal(probe.attempted_windows,2);assert.equal(probe.applied_optimizer_calls,1);
assert.equal(probe.windows[1].before.adam_step,probe.windows[1].after.adam_step);
assert.equal(probe.windows[1].before.parameter,probe.windows[1].after.parameter);
assert.equal(probe.windows[0].scaler_step_return,null);assert.equal(probe.windows[1].scaler_step_return,null);
assert.equal(probe.windows[1].after.scale,4);
const ddp=JSON.parse(read('dist/labs/ddp/validation.json'));
assert.equal(ddp.train_sha256,hash('dist/labs/ddp/train_ddp.py'));
for(const run of ddp.runs)for(const record of run.records||[])if(record.event==='epoch'){
 assert.equal(record.attempted_update_windows,record.applied_optimizer_steps);
 assert.equal(record.optimizer_steps,record.applied_optimizer_steps);
}
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const [id,file]of [['ddp-code','ddp/train_ddp.py'],['incident','incident-model/incident_model.py']]){
 const a=data.articles.find(x=>x.id===id),all=a.sections.map(x=>x[1]).join('');
 assert([...all.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1]).trim()===read('dist/labs/'+file).trim()),id+': complete source differs');
}
const fresh=JSON.parse(read('docs/QUALITY_AUDIT_2026-11-04.json'));
const signature=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const currentPoints=JSON.parse(JSON.stringify(vm.runInContext(`cloudKnowledgeDomains.flatMap(d=>d.points.map(p=>({module:d.module,id:p[0],title:p[1],lead:p[2],body:cloudKnowledgeExplanations[p[0]]||'',boundary:p[3],articles:p[4]}))).concat(infraKnowledgeDomains.flatMap(d=>d.points.map(p=>({module:d.module,...p}))))`,ctx)));
const reviewed=fresh.chapters.filter(x=>/^(substantial_v\d+|fresh_review_v\d+)$/.test(x.review));
const substantial=fresh.chapters.filter(x=>/^substantial_v\d+$/.test(x.review));
assert.equal(fresh.eight_hour_progress.substantial_chapters,substantial.length,'substantial chapter summary must match distinct reviewed chapter entries');
// Preserve the completed window's record; later body revisions form an explicit hash chain.
const later=JSON.parse(read('docs/POST_WINDOW_BODY_REVIEWS.json'));
assert.equal(later.base_audit,'QUALITY_AUDIT_2026-11-04.json');assert(later.historical_eight_hour_counts_unchanged);
for(const revision of later.revisions){assert(reviewed.some(row=>row.id===revision.id),revision.id+': unknown post-window chapter');assert(revision.observation&&revision.scope&&revision.reviewed_at,'missing post-window review');}
for(const row of reviewed){const a=data.articles.find(a=>a.id===row.id);let expected=row.reviewed_content_sha256;for(const revision of later.revisions.filter(r=>r.id===row.id)){assert.equal(revision.previous_content_sha256,expected,row.id+': broken review continuity');expected=revision.reviewed_content_sha256;}assert.equal(expected,signature({title:a.title,sections:a.sections}),row.id+': changed after latest recorded review');}
const reviewedPoints=(fresh.knowledge_reviews||[]).filter(x=>/^fresh_review_v\d+$/.test(x.review));
const pointReviews=[...reviewedPoints,...expansion.new_knowledge_reviews];
for(const row of expansion.new_knowledge_reviews)assert(row.review==='new_knowledge_point'&&row.scope&&row.observation&&row.reviewed_at,row.id+': missing initial review');
assert.deepEqual(currentPoints.map(p=>p.id).sort(),pointReviews.map(p=>p.id).sort(),'complete current knowledge inventory');
for(const revision of pointRevisions)assert(pointReviews.some(row=>row.id===revision.id),revision.id+': unknown knowledge review');
for(const row of pointReviews){const p=currentPoints.find(p=>p.id===row.id);let expected=row.reviewed_content_sha256;for(const revision of pointRevisions.filter(r=>r.id===row.id)){assert.equal(revision.previous_content_sha256,expected,row.id+': broken knowledge review continuity');assert(revision.scope&&revision.observation&&revision.reviewed_at);expected=revision.reviewed_content_sha256;}assert.equal(expected,signature({title:p.title,lead:p.lead,body:p.body,boundary:p.boundary||'',articles:p.articles}),row.id+': changed after latest recorded review');}
assert.equal(fresh.eight_hour_progress.reviewed_chapters,reviewed.length);assert.equal(fresh.eight_hour_progress.reviewed_knowledge_points,reviewedPoints.length);
assert.equal(fresh.chapters.length,66);
assert.deepEqual([...fresh.chapters,...migration.new_chapter_reviews,...expansion.new_chapter_reviews].map(a=>a.id).sort(),data.articles.map(a=>a.id).sort());
for(const row of migration.new_chapter_reviews){
 const a=data.articles.find(a=>a.id===row.id);assert(row.observation&&row.review_scope&&row.reviewed_at);assert.equal(row.review,'reorganized_existing_content');
 let expected=row.reviewed_content_sha256;
 for(const revision of expansion.body_revisions.filter(r=>r.id===row.id)){assert.equal(revision.previous_content_sha256,expected,row.id+': broken relocated-body review chain');assert(revision.scope&&revision.observation&&revision.reviewed_at);expected=revision.reviewed_content_sha256;}
 assert.equal(expected,signature({title:a.title,sections:a.sections}),row.id+': changed after its latest explicit relocation/body review');
}
for(const row of expansion.new_chapter_reviews){const a=data.articles.find(a=>a.id===row.id);assert(row.review==='new_teaching_unit'&&row.observation&&row.review_scope&&row.reviewed_at);let expected=row.reviewed_content_sha256;for(const revision of (expansion.body_revisions||[]).filter(x=>x.id===row.id)){assert.equal(revision.previous_content_sha256,expected);assert(revision.scope&&revision.observation&&revision.reviewed_at);expected=revision.reviewed_content_sha256;}assert.equal(expected,signature({title:a.title,sections:a.sections}),row.id+': changed after new teaching-unit review');}
// A revised unit is a signed historical body. Follow its later explicit revisions
// instead of requiring a legitimately edited chapter to stay frozen at that unit.
const nativeRecordChecks = {
 'dist/labs/triton-tail-mask/validation.json':'./check-triton-tail-mask.cjs',
 'dist/labs/metal-softmax/validation.json':'./check-metal-softmax.cjs',
 'dist/labs/native-metal-inference/validation.json':'./check-native-metal-inference.cjs',
 'dist/labs/native-metal-queue/validation.json':'./check-native-metal-queue.cjs',
 'dist/labs/native-ngram-speculation/validation.json':'./check-native-ngram-speculation.cjs',
 'dist/labs/mcp-trace-reentry/validation.json':'./check-mcp-trace-reentry.cjs',
 'dist/labs/redis-replica-promotion/validation.json':'./check-redis-replica-promotion.cjs',
 'dist/labs/kubernetes-admission/validation.json':'./check-kubernetes-admission.cjs',
 'dist/labs/native-slot-handoff/validation.json':'./check-native-slot-handoff.cjs',
 'dist/labs/vllm-scheduler/validation.json':'./check-vllm-scheduler.cjs',
 'dist/labs/vllm-cache-scope/validation.json':'./check-vllm-cache-scope.cjs',
 'dist/labs/release-artifact-trust/validation.json':'./check-release-artifact-trust.cjs',
 'dist/labs/prefetch-resume-step/validation.json':'./check-prefetch-resume-step.cjs',
 'dist/labs/sqlite-shard-routing/validation.json':'./check-sqlite-shard-routing.cjs',
 'dist/labs/async-dcp-commit/validation.json':'./check-async-dcp-commit.cjs',
 'dist/labs/dns-connection-handoff/validation.json':'./check-dns-connection-handoff.cjs',
 'dist/labs/tiny-decoder-handoff/validation.json':'./check-tiny-decoder-handoff.cjs',
 'dist/labs/tiny-decoder-forward/validation.json':'./check-tiny-decoder-forward.cjs',
 'dist/labs/mps-checkpoint-resume/validation.json':'./check-mps-checkpoint-resume.cjs',
 'dist/labs/rope-window-cache/validation.json':'./check-rope-window-cache.cjs',
 'dist/labs/metal-online-attention/validation.json':'./check-metal-online-attention.cjs',
 'dist/labs/dual-stack-connect/validation.json':'./check-dual-stack-connect.cjs',
 'dist/labs/haproxy-report-failover/validation.json':'./check-haproxy-report-failover.cjs',
 'dist/labs/kind-r3-node-loss/validation.json':'./check-kind-r3-node-loss.cjs'
};
for(const unit of expansion.revised_teaching_units||[]){
 const a=data.articles.find(a=>a.id===unit.chapter);assert(a&&unit.scope&&unit.observation&&unit.reviewed_at);
 const chapterChain=reviewed.some(row=>row.id===unit.chapter)?later.revisions:expansion.body_revisions;
 const rows=chapterChain.filter(r=>r.id===unit.chapter),at=rows.findIndex(r=>r.reviewed_content_sha256===unit.reviewed_content_sha256);
 assert(at>=0,unit.chapter+': signed teaching-unit body missing from the preserved chain');
 let expected=unit.reviewed_content_sha256;
 for(const revision of rows.slice(at+1)){assert.equal(revision.previous_content_sha256,expected,unit.chapter+': broken post-unit review chain');expected=revision.reviewed_content_sha256;}
 assert.equal(expected,signature({title:a.title,sections:a.sections}),unit.chapter+': changed after its latest explicit review');
 if(Object.hasOwn(nativeRecordChecks,unit.record))require(nativeRecordChecks[unit.record]);
 else assert.equal(JSON.parse(read(unit.record)).status,'passed',unit.chapter+': missing passed record');
}
console.log('PASS: historical63-chapter audit/20 repairs, independent1000-request arithmetic and optimizer-call provenance; preserved window66/95 review counts with '+later.revisions.length+' explicit post-window body revisions. Current signatures include separately reviewed new units and relocation, with explicit knowledge-link revisions; pending work is not counted as complete.');
