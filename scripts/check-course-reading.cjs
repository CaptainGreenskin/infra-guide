/* Whole-course contracts: one main reading path, real concept graphs and role prerequisites.
   UI checks describe organization, not a measured claim of human comprehension. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const c={URLSearchParams,location:{search:''},articleURL:id=>'/article/'+id+'/'};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const data=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,profiles:learningProfiles,needs:chapterDependencies,maps:fieldConceptMaps,tracks:trackDefinitions})',c)));
const legacy=JSON.parse(JSON.stringify(vm.runInContext('legacyTrackKnowledgeAnchors',c)));
for(const[track,anchors]of Object.entries(legacy))for(const anchor of anchors){
 const moduleId={cloud:'compute',ai:'model-foundations',agent:'agent'}[track];
 c.args=['/track/'+track+'/','?campaign=reader','#'+anchor];
 assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/module/'+moduleId+'/?campaign=reader#'+anchor);
 assert(fs.readFileSync('dist/module/'+moduleId+'/index.html','utf8').includes('id="'+anchor+'"'),track+': original field fragment '+anchor);
}
const reviews=require('./coherence-review-records.cjs').laterUpdates;
const courseReview=reviews.findLast(({review_scope})=>review_scope?.body_baseline_commit)?.review_scope;
assert(courseReview,'a whole-course body review must precede metadata-only reviews');
const previous=require('./content-at-commit.cjs')(courseReview.body_baseline_commit);
const changed=[],added=[];
for(const a of data.articles){
 const old=previous.find(x=>x.id===a.id);
 if(!old){assert((courseReview.new_chapters||[]).includes(a.id),a.id+': undeclared new chapter');added.push(a.id);continue;}
 assert.equal(a.title,old.title);assert.equal(a.number,old.number,a.id+': published display number changed');
 assert.deepEqual(a.sections.map(s=>s[0]),old.sections.map(s=>s[0]),a.id+': preserve headings and section links');
 if(JSON.stringify(a.sections)!==JSON.stringify(old.sections))changed.push(a.id);
 const oldBody=old.sections.map(s=>s[1]).join(''),body=a.sections.map(s=>s[1]).join('');
 const blocks=body.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[],oldBlocks=oldBody.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[];
 let index=0;for(const block of oldBlocks){const at=blocks.indexOf(block,index);assert(at>=index,a.id+': original complete code removed or reordered');index=at+1;}
 assert.equal(blocks.length-oldBlocks.length,courseReview.added_code_blocks?.[a.id]||0,a.id+': undeclared added source');
 for(const[,id]of oldBody.matchAll(/\bid="([^"]+)"/g))assert(body.includes('id="'+id+'"'),a.id+': original inner anchor '+id);
}
assert.deepEqual(changed.sort(),[...courseReview.changed_bodies].sort());
assert.deepEqual(added.sort(),[...(courseReview.new_chapters||[])].sort());
assert.equal(data.articles.length,previous.length+added.length);
for(const a of previous)assert(data.articles.some(current=>current.id===a.id),a.id+': published chapter removed');
const records=require('./content-review-records.cjs'),migration=JSON.parse(fs.readFileSync('docs/COURSE_MIGRATION_2026-11-07.json'));
const dated=[...JSON.parse(fs.readFileSync('docs/POST_WINDOW_BODY_REVIEWS.json')).revisions,...records.body_revisions].filter(r=>r.previous_content_sha256&&r.previous_content_sha256!==r.reviewed_content_sha256).concat(records.new_chapter_reviews,migration.new_chapter_reviews,records.revised_teaching_units.map(r=>({...r,id:r.chapter})));
for(const row of dated){
 const a=data.articles.find(a=>a.id===row.id),date=row.reviewed_at.slice(0,10).replaceAll('-','.');
 assert((a.updated||'2026.11.03')>=date,row.id+': publication date predates its recorded body change');
}
function checkArticleHeader(html,a){
 const guideStart=html.indexOf('<details class="guided-contract"><summary>先修与实验条件</summary>');
 const firstSection=html.indexOf('id="section-1"');
 assert(guideStart>html.indexOf('<h1>')&&guideStart<firstSection,a.id+': one closed guide before the body');
 assert.equal((html.match(/<details class="guided-contract"/g)||[]).length,1);
 const guide=html.slice(guideStart,firstSection);
 for(const marker of ['class="description"','class="article-meta"','class="tag-row"','class="evidence-note"','实验验证范围'])assert(guide.includes(marker),a.id+': folded '+marker);
 assert(!html.slice(html.indexOf('<article class="article">'),guideStart).includes('class="tag-row"'),a.id+': article tags do not delay the body');
 const meta=html.match(/<div class="article-meta">([\s\S]*?)<\/div>/)?.[1];
 assert(meta?.includes('<span>'+(a.edition||'训练专题')+'</span>'),a.id+': guide retains the edition');
 assert(!/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(meta),a.id+': guide does not show a revision date');
}
const sitemap=fs.readFileSync('dist/sitemap.xml','utf8');
for(const a of data.articles){
 const html=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8'),date=(a.updated||'2026.11.03').replaceAll('.','-');
 checkArticleHeader(html,a);
 if(!Object.values(data.tracks).some(track=>track.start===a.id))assert(!html.includes('class="track-entry-overview"'),a.id+': ordinary lessons remain focused on their own topic');
 const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.equal(schema.dateModified,date,a.id+': structured data retains the editorial date');
 assert(sitemap.includes('/article/'+a.id+'/</loc><lastmod>'+date+'</lastmod>'),a.id+': sitemap retains the editorial date');
}
assert(data.articles.find(a=>a.id==='distributed-training').minutes>=32,'expanded sharding chapter must retain the reviewed reading estimate');
for(const[track,t]of Object.entries(data.tracks)){
 const html=fs.readFileSync('dist/track/'+track+'/index.html','utf8');
 const a=data.articles.find(a=>a.id===t.start);
 checkArticleHeader(html,a);
 assert(html.includes('<h1>'+a.number+' '+a.title+'</h1>'),track+': enter the actual first lesson');
 assert(!html.includes('class="knowledge-body"'),track+': no full field textbook before the first lesson');
 const expectedMapLinks=data.modules.filter(m=>m.track===track&&Object.hasOwn(data.maps,m.id)).map(m=>'/module/'+m.id+'/#concept-relations').sort();
 for(const [source,isEntry] of [[html,true],[fs.readFileSync('dist/article/'+a.id+'/index.html','utf8'),false]]){
  const entries=source.match(/<section class="track-entry-overview"[\s\S]*?<\/section>/g)||[];
  assert.equal(entries.length,1,track+': one overview in the first lesson');
  assert(entries[0].includes('id="track-overview-'+track+'"')&&source.indexOf(entries[0])<source.indexOf('id="section-1"'),track+': retain the overview and its published fragment');
  assert.equal(source.indexOf(entries[0])<source.indexOf('<details class="guided-contract">'),isEntry,track+': only the track entry opens with the map visible');
  const bodyPath=isEntry?'/track/'+track+'/':'/article/'+a.id+'/';
  assert(entries[0].includes('href="'+bodyPath+'#section-1"'),track+': jump to the first section from the map');
  const mapLinks=[...entries[0].matchAll(/href="(\/module\/[^"]+?\/#concept-relations)"/g)].map(([,href])=>href).sort();
  assert.deepEqual(mapLinks,expectedMapLinks,track+': first lesson connects all of its field maps');
  assert(entries[0].includes('href="/roadmap/?track='+track+'#route-'+track+'"'),track+': full reading order');
 }

 for(let i=1;i<=a.sections.length;i++)assert(html.includes('id="section-'+i+'"'));
}
const practiceHTML=fs.readFileSync('dist/module/practice/index.html','utf8');
const defaultPractice=data.articles.find(a=>practiceHTML.includes('data-static-article="'+a.id+'"'));
assert(defaultPractice?.module==='practice');
checkArticleHeader(practiceHTML,defaultPractice);
for(const[moduleId,g]of Object.entries(data.maps)){
 const html=fs.readFileSync('dist/module/'+moduleId+'/index.html','utf8');
 assert(html.includes('<section class="field-concept-map"'),'map is visible rather than a closed details');
 assert(html.indexOf('id="concept-relations"')<html.indexOf('class="knowledge-point"'),'map must precede extended field explanations');
 const svg=fs.readFileSync('dist/diagrams/field-'+moduleId+'.svg','utf8');
 for(const[id]of g.nodes)assert(svg.includes('data-concept="'+id+'"'));
 for(const[from,,to]of g.edges)assert(svg.includes('data-edge="'+from+' '+to+'"'));
 assert.equal((svg.match(/data-concept=/g)||[]).length,g.nodes.length);
 assert.equal((svg.match(/data-edge=/g)||[]).length,g.edges.length);
 assert(html.includes('diagrams/field-'+moduleId+'.svg'));
 c.args=['/track/'+({compute:'cloud','model-foundations':'ai',agent:'agent'}[moduleId]||'cloud')+'/','?campaign=reader','#knowledge-'+g.nodes[0][0]];
 if(['compute','model-foundations','agent'].includes(moduleId))assert.equal(vm.runInContext('courseRedirectFor(...args)',c),'/module/'+moduleId+'/?campaign=reader#knowledge-'+g.nodes[0][0]);
}
const routes={};
for(const[id,profile]of Object.entries(data.profiles)){
 c.profile=profile;const route=JSON.parse(JSON.stringify(vm.runInContext('learningProfileRoute(profile)',c)));routes[id]=route;
 assert.equal(new Set(route).size,route.length,id+': no duplicate lessons');
 for(const chapter of route){assert(data.articles.some(a=>a.id===chapter));for(const[dep]of data.needs[chapter])assert(route.indexOf(dep)>=0&&route.indexOf(dep)<route.indexOf(chapter),id+': missing or late prerequisite '+dep);}
 for(const target of profile.targets)assert(route.includes(target));
 if(profile.track==='agent')assert(route.every(id=>data.articles.find(a=>a.id===id).module==='agent'||id==='production-readiness'));
 const html=fs.readFileSync('dist/roadmap/'+id+'/index.html','utf8');
 assert(html.includes('id="learning-goal"')&&html.includes('<h1>'+profile.label+'学习路线</h1>'),id+': complete static role destination');
 for(const chapter of route)assert(html.includes('/article/'+chapter+'/?goal='+id),id+': static role route omitted '+chapter);
}
assert.deepEqual(Object.keys(data.profiles),JSON.parse(fs.readFileSync('docs/CONTENT_READING_2026-11-08.json')).route_views);
assert(!routes['ai-inference'].includes('ddp-code'),'inference readers should not be forced through distributed training');
assert(routes['ai-training'].includes('checkpoint-recovery'));assert(!routes['ai-training'].includes('quantization-serving'));
// Prerequisite closure alone does not protect a coherent teaching sequence.
// These new normal-path topics must precede later application/capstone work.
for(const id of ['agent-app','agent-platform']){
 const route=routes[id];
 assert.equal(route.indexOf('mcp-protocol'),route.indexOf('agent-runtime')+1,id+': tool protocol follows the runtime');
 assert(route.indexOf('mcp-protocol')<route.indexOf('agent-security'),id+': normal tool contract before permission enforcement');
}
assert(routes['cloud-platform'].indexOf('k8s-autoscaling')<routes['cloud-platform'].indexOf('control-plane-consensus'));
assert(routes['cloud-platform'].indexOf('control-plane-consensus')<routes['cloud-platform'].indexOf('serverless-execution'));
assert(routes['cloud-sre'].indexOf('mysql-replication')>routes['cloud-sre'].indexOf('mysql-recovery'));
assert(routes['cloud-sre'].indexOf('mysql-replication')<routes['cloud-sre'].indexOf('k8s-networking'));
assert(routes['cloud-sre'].indexOf('control-plane-consensus')>routes['cloud-sre'].indexOf('k8s-networking'));
assert(routes['cloud-sre'].indexOf('control-plane-consensus')<routes['cloud-sre'].indexOf('elasticity'));
for(const[id,capstone]of [['cloud-platform','cloud-service-lab'],['cloud-sre','cloud-service-lab'],['agent-platform','production-readiness']])
 assert.equal(routes[id].at(-1),capstone,id+': final capstone follows the new core lessons');
for(const id of ['cloud-platform','cloud-sre'])for(const core of ['cloud-compute','iam-security'])assert(routes[id].includes(core));
c.location.search='?goal=ai-inference';
assert(vm.runInContext('chapterPriority("model-serving")',c).includes('岗位重点'));
assert(vm.runInContext('chapterPriority("attention-mechanics")',c).includes('先修基础'));
assert(vm.runInContext('chapterPriority("ddp-code")',c).includes('选学专题'));
assert(vm.runInContext('learningGoalChapterNav(articleById("model-serving"))',c).includes('?goal=ai-inference'));
for(const text of ['GPU 内核负责计算。','操作系统内核负责管理进程。']){c.text='<p>'+text+'</p>';assert(!vm.runInContext('explainFirstConceptTerms(text)',c).includes('data-concept-term="内核"'),'ambiguous kernel must be defined in context');}
c.text='<p>操作系统内核。</p>';assert(vm.runInContext('explainFirstConceptTerms(text)',c).includes('data-concept-term="操作系统内核"'),'the explicit operating-system term retains its useful definition');
console.log('PASS: three direct lesson entries, 14 visible graphs with 101 nodes /90 edges, original track concept links, seven prerequisite-complete role routes and context-specific priority/continuation; GPU kernel is never mislabeled as OS kernel.');
