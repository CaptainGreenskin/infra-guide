/* Check current prose scope, numerical assumptions and source-bound replay evidence. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),cp=require('child_process'),crypto=require('crypto');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,edits:capacityRooflineObservationEdits,forecast:capacityForecastCode})',c)));
// V52's whole-corpus statement belongs to its exact publication. Current
// whole-corpus changes are reviewed separately by check-course-reading.cjs.
d.articles=require('./content-at-commit.cjs')('814dfe982040fe1ea79b7b2a4ebb9645c5e11d48');
const commit='89db380eb03f932c423eb2f22976e87a2aec18f2',before=require('./content-at-commit.cjs')(commit);
const ids=[...new Set(d.edits.map(x=>x.id))];assert.deepEqual(ids,['elasticity','roofline-model','agent-observability']);
for(const track of ['cloud','ai','agent'])assert.equal(ids.filter(id=>d.modules.find(m=>m.id===d.articles.find(a=>a.id===id).module).track===track).length,1);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),signature=a=>sha(JSON.stringify({title:a.title,sections:a.sections}));
const body=a=>a.sections.map(s=>s[1]).join(''),blocks=a=>body(a).match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[];
for(const a of d.articles){const old=before.find(x=>x.id===a.id);assert.equal(a.title,old.title);assert.deepEqual(a.sections.map(s=>s[0]),old.sections.map(s=>s[0]),a.id+': stable section anchors');
 if(!ids.includes(a.id)){assert.deepEqual(a.sections,old.sections,a.id+': unreviewed body change');continue;}
 let index=0;const current=blocks(a);for(const block of blocks(old)){const at=current.indexOf(block,index);assert(at>=index,a.id+': complete executable block changed or removed');index=at+1;}
 assert.equal(current.length-blocks(old).length,a.id==='elasticity'?1:0,a.id+': undeclared new code');
 const html=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8');for(let i=1;i<=a.sections.length;i++)assert(html.includes('id="section-'+i+'"'));
 assert(/class="chapter-map-link" href="\/module\/[a-z0-9-]+\/\?concept=([a-z0-9-]+)#map-concept-\1"/.test(html),a.id+': chapter links to its exact concept');
 for(let i=0;i<old.sections.length;i++)for(const[,anchor]of old.sections[i][1].matchAll(/\bid="([^"]+)"/g)){assert(a.sections[i][1].includes('id="'+anchor+'"'),a.id+': original deep anchor removed '+anchor);assert.equal(html.split('id="'+anchor+'"').length-1,1,a.id+': deep anchor must remain unique');}
}
const stdout=cp.execFileSync('python3',['-c',d.forecast],{encoding:'utf8',timeout:15000}).trim();assert.equal(stdout,'160 次/秒： 继续积压，每秒增加20\n180 次/秒： 只够追平输入，旧积压不减少\n200 次/秒： 再需360秒排空');
// Independent one-second conservation oracle for the figure's entire 480s window.
let q=0,arrived=0,done=0;const points=[[0,0]];for(let second=0;second<480;second++){const incoming=180,capacity=second<120?120:200;const completed=Math.min(q+incoming,capacity);arrived+=incoming;done+=completed;q+=incoming-completed;assert.equal(arrived,done+q);if(second+1===120||second+1===480)points.push([second+1,q]);}assert.deepEqual(points,[[0,0],[120,7200],[480,0]]);assert.equal(arrived,86400);assert.equal(done,86400);
const capacity=JSON.parse(cp.execFileSync('python3',['-B','dist/labs/cloud-operations/capacity_lab.py'],{encoding:'utf8',timeout:15000}));assert.equal(capacity.unbounded.peak_backlog,200);assert.equal(capacity.bounded_160.snapshots[2].completed,2960);assert.equal(capacity.bounded_160.snapshots[2].rejected,40);assert.equal(capacity.unbounded.snapshots[2].completed,3000);
const roof=cp.execFileSync('python3',['-B','dist/labs/cloud-foundations/roofline-model.py'],{encoding:'utf8',timeout:15000}).trim().split('\n').map(line=>line.split(/\s+/).map(Number));
assert.deepEqual(roof,[[1,33554432,33570816,0.9995,.112,16.785],[256,8589934592,37748736,227.5556,28.633,18.874]]);
assert.equal(33554432+8192*2,33570816);assert.equal(33554432+2097152*2,37748736);assert.equal(300e12/2e12,150);
const ai=d.articles.find(a=>a.id==='roofline-model');assert(body(ai).includes('不是用户数'));assert(!body(ai).includes('积攒256个请求'));assert(!body(ai).includes('C=αAB+βC'));
const intervals=[[0,50],[50,350],[50,450],[450,480],[480,780],[780,850],[850,880],[880,940],[940,1000]];
assert.equal(intervals.reduce((sum,[start,end])=>sum+end-start,0),1300);assert.equal(50+Math.max(300,400)+550,1000);assert.equal(50+Math.max(200,400)+550,1000);assert.equal(50+Math.max(300,300)+550,900);
const review=require('./coherence-review-records.cjs').systemUpdate;assert.equal(review.reader_trials,0);assert.deepEqual(review.body_reviews.map(r=>r.id),ids);
for(const row of review.body_reviews){assert.equal(row.previous_content_sha256,signature(before.find(a=>a.id===row.id)));assert.equal(row.reviewed_content_sha256,signature(d.articles.find(a=>a.id===row.id)));assert(row.observation&&row.scope);}
const oldReviews=JSON.parse(cp.execFileSync('git',['show',commit+':docs/POST_WINDOW_BODY_REVIEWS.json'],{encoding:'utf8'})),reviews=JSON.parse(fs.readFileSync('docs/POST_WINDOW_BODY_REVIEWS.json','utf8'));assert.deepEqual(reviews.revisions.slice(0,oldReviews.revisions.length),oldReviews.revisions,'published body reviews must stay unchanged');
const evidence=review.observation_replay;assert.equal(evidence.source_sha256,sha(fs.readFileSync('dist/labs/scaling-collectives-traces/otel_attempts.py')));assert.equal(evidence.sdk,'1.41.1');assert.equal(evidence.api,'1.41.1');assert.equal(evidence.spans,5);assert.deepEqual([evidence.http_attempts,evidence.effects,evidence.unique_verified_tasks,evidence.cost],[2,1,1,5]);assert(evidence.parent_header_relations_verified);assert.equal(evidence.published_baseline_unchanged,'1.44.0');
// CI retains the source-bound published 1.44 record; a local replay can be required explicitly.
if(process.env.INFRA_OBSERVATION_PYTHON){const r=JSON.parse(cp.execFileSync(process.env.INFRA_OBSERVATION_PYTHON,['-B','dist/labs/scaling-collectives-traces/otel_attempts.py'],{encoding:'utf8',timeout:20000}));const root=r.spans.find(s=>s.name==='agent.task'),clients=r.spans.filter(s=>s.kind==='CLIENT'),servers=r.spans.filter(s=>s.kind==='SERVER');assert.equal(r.spans.length,5);assert.equal(root.status,'OK');for(let i=0;i<2;i++){assert.equal(clients[i].parent_id,root.span_id);assert.equal(servers[i].parent_id,clients[i].span_id);assert(servers[i].parent_remote);assert.deepEqual(r.received_traceparent[i].split('-').slice(1,3),[clients[i].trace_id,clients[i].span_id]);}assert.deepEqual([r.http_attempts,r.effects,r.unique_verified_tasks,r.all_attempt_cost_per_success],[2,1,1,5]);}
const diagramData={};for(const name of ['v52-capacity-backlog','v52-roofline-byte-ledger','v52-agent-five-spans','v52-agent-critical-path']){const svg=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8');assert(svg.includes('<title')&&svg.includes('<desc')&&svg.includes('<metadata>'));assert(d.articles.some(a=>body(a).includes('diagrams/'+name+'.svg')));diagramData[name]=JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));}
assert.deepEqual(diagramData['v52-capacity-backlog'].points,points);assert.deepEqual(diagramData['v52-agent-critical-path'].intervals,intervals);assert.equal(diagramData['v52-roofline-byte-ledger'].cases[1].total,37748736);assert.deepEqual(diagramData['v52-agent-five-spans'].edges,[['s0','c1'],['c1','s1'],['s0','c2'],['c2','s2']]);
// Preserve V52's exact published source claim; later source revisions are
// independently checked by the merged current-source review in learning connections.
for(const[file,revision]of Object.entries(review.source_revisions))assert.equal(revision.reviewed_sha256,sha(cp.execFileSync('git',['show','814dfe982040fe1ea79b7b2a4ebb9645c5e11d48:'+file],{maxBuffer:16*1024*1024})),file+': published V52 source differs from review');
console.log('PASS: three whole-body scope checks against V51, all72 other bodies and complete original code blocks preserved; fresh capacity/Roofline replays, independent 480s conservation and timeline oracles, source-bound five-span replay, four original diagrams. No real autoscaler, GPU, Collector or Kairo execution inferred.');
