/* Check actual concept relationships and continuous reading, not human mastery. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,maps:fieldConceptMaps,practice:fieldPracticePaths,labs:labLearningCatalog,routes:courseReadingStages,log:readabilityRevisionLog})',c)));
assert.equal(Object.keys(d.maps).length,14);let nodes=0,edges=0;
assert.deepEqual(Object.keys(d.practice).sort(),Object.keys(d.maps).sort(),'every field has one evidence-based exercise');
assert.equal(new Set(Object.values(d.practice).map(([,lab])=>lab)).size,14,'practice targets are distinct');
for(const[moduleId,graph]of Object.entries(d.maps)){
 c.moduleId=moduleId;const points=JSON.parse(JSON.stringify(vm.runInContext('fieldPointRecords(moduleId)',c))),ids=graph.nodes.map(n=>n[0]);
 assert.deepEqual([...ids].sort(),points.map(p=>p.id).sort(),moduleId+': map must correspond to real knowledge points');assert.equal(new Set(ids).size,ids.length);
 const seen=new Set([ids[0]]);
 for(const[from,verb,to,why]of graph.edges){assert(ids.includes(from)&&ids.includes(to)&&from!==to);assert(verb.length>=2&&why.length>=25);}
 for(let i=0;i<ids.length;i++)for(const[from,,to]of graph.edges)if(seen.has(from)||seen.has(to)){seen.add(from);seen.add(to);}
 assert.equal(seen.size,ids.length,moduleId+': isolated concept');for(const[id,label,meaning]of graph.nodes)assert(label&&meaning.length>=18,id);
 assert(graph.question&&graph.answer);for(const[target,why]of graph.outlets)assert(d.maps[target]&&why.length>=15);
 const html=fs.readFileSync('dist/module/'+moduleId+'/index.html','utf8');assert.equal((html.match(/id="concept-relations"/g)||[]).length,1);assert(html.includes('role="status"'));assert(html.indexOf('id="concept-relations"')<html.indexOf('id="examples"'));
 for(const id of ids)assert(html.includes('id="knowledge-'+id+'"'),moduleId+': definition target missing '+id);
 const [concept,labId,question]=d.practice[moduleId];
 const unit=d.labs.find(lab=>lab.id===labId),chapter=d.articles.find(a=>a.id===unit?.chapter);
 assert(chapter?.module===moduleId&&points.some(p=>p.id===concept&&p.articles.includes(chapter.id)),moduleId+': practice follows an existing concept into its own field');
 assert(question.length>=25&&unit.files.length&&!(unit.pendingFiles||[]).length,moduleId+': checked practice requires evidence');
 c.unit=unit;
 const target=vm.runInContext('labCatalogRunPath(unit)',c);
 const [path,anchor]=target.split('#');
 assert(anchor&&fs.readFileSync('dist'+path+'index.html','utf8').includes('id="'+anchor+'"'),moduleId+': practice must land at the exact section');
 const record=JSON.parse(fs.readFileSync('dist/'+vm.runInContext('labCatalogRecordPath(unit)',c),'utf8'));
 assert(/^passed(?:_|$)/.test(record.status||'')||unit.files.every(file=>record.programs?.[file]?.exit_code===0),moduleId+': practice record status');
 const practice=html.match(/<section class="field-map-practice"[\s\S]*?<\/section>/g)||[];
 assert.equal(practice.length,1,moduleId+': one visible practice after the diagram');
 assert(html.indexOf(practice[0])>html.indexOf('src="diagrams/field-'+moduleId+'.svg"')&&html.indexOf(practice[0])<html.indexOf('<details class="field-map-explorer"'),moduleId+': keep the exercise outside the optional explorer');
 assert(practice[0].includes('data-field-practice="'+labId+'"')&&practice[0].includes('href="'+target+'"'),moduleId+': actual page links to the chosen practice');
 nodes+=ids.length;edges+=graph.edges.length;
}
assert.equal(nodes,100);assert.equal(edges,87); // 95 existing field points plus five prerequisite groups.
const routeIds=Object.values(d.routes).flatMap(stages=>stages.flatMap(s=>s[1]));assert.equal(new Set(routeIds).size,d.articles.length);assert.equal(routeIds.length,d.articles.length);
assert.equal(vm.runInContext('chapterReadingContext(undefined).track',c),'shared','missing article routes must retain the not-found page without crashing');
for(const a of d.articles){
 c.a=a;const r=JSON.parse(JSON.stringify(vm.runInContext('chapterReadingContext(a)',c))),refs=JSON.parse(JSON.stringify(vm.runInContext('chapterFieldConcepts(a)',c)));
 assert(refs.length>0,a.id+': concept position missing');for(const[moduleId,id]of refs){assert(d.maps[moduleId].nodes.some(n=>n[0]===id));const page=fs.readFileSync('dist/module/'+moduleId+'/index.html','utf8'),definition=page.match(new RegExp('<div class="field-map-definition" data-concept-definition="'+id+'">([\\s\\S]*?)</div>'))?.[1];assert(definition?.includes('href="/article/'+a.id+'/"'),a.id+': concept must link back to this chapter');}
 assert(r.ids.includes(a.id));const html=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8'),nav=html.match(/<nav class="article-nav"[\s\S]*?<\/nav>/)[0];
 const capstone=r.ids.find(id=>d.articles.find(a=>a.id===id).module==='practice'),sidebar=html.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];assert(sidebar.includes('<summary><a href="/article/'+capstone+'/"'),a.id+': practice group must stay in the current route');
 if(r.previous)assert(nav.includes('href="/article/'+r.previous.id+'/"'));if(r.next)assert(nav.includes('href="/article/'+r.next.id+'/"'));
 assert(html.includes('在领域图谱中看本章相关概念'));if(a.module==='practice'){assert(html.includes('本方向')||nav.includes('学习路线'));const side=html.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];for(const other of d.articles.filter(x=>x.module==='practice'&&x.id!==a.id))assert(!side.includes('/article/'+other.id+'/'),a.id+': unrelated capstone in current sidebar');}
}
for(const[id,expected]of [['cloud-overview','linux-resource'],['training-lab','model-serving'],['kairo-practice','production-readiness']]){c.a=d.articles.find(a=>a.id===id);assert.equal(vm.runInContext('chapterReadingContext(a).next.id',c),expected);}
c.a=d.articles.find(a=>a.id==='distributed-systems');assert.notEqual(vm.runInContext('chapterReadingContext(a).next.id',c),'cloud-overview','do not loop back from P0 to the overview');
const changed=new Set(d.log.map(r=>r[0]));assert.equal(changed.size,6);
// Preserve the V50 six-body audit at its published boundary. Subsequent body edits
// are checked against this exact publication by check-causal-walkthroughs.cjs.
const atCommit=require('./content-at-commit.cjs');
const oldArticles=atCommit('c6f47c9bcd8b7c9dfb284422957fd24c149447a7'),publishedArticles=atCommit('8d5b31ef7859aa3c44766c1492b18e1577e8d821'),blocks=html=>html.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[];
for(const a of publishedArticles){const old=oldArticles.find(x=>x.id===a.id);assert.deepEqual(blocks(a.sections.map(s=>s[1]).join('')),blocks(old.sections.map(s=>s[1]).join('')),a.id+': executed code changed in the published V50 prose revision');if(!changed.has(a.id))assert.equal(JSON.stringify(a.sections),JSON.stringify(old.sections),a.id+': unreviewed V50 body change');}
const runtime=d.articles.find(a=>a.id==='agent-runtime');assert(runtime.sections[3][1].includes('<td>连接与HTTP响应</td>'));assert(runtime.sections[3][1].includes('v50-tool-error-layers'));
assert(!runtime.sections[3][1].includes('v23-tool-error-layers'),'canonical figure must consistently use the new layer diagram');assert(runtime.sections[3][1].includes('<img src="diagrams/v50-tool-error-layers.svg" width="1120" height="820"'),'diagram dimensions must match the actual new SVG');
const appSource=fs.readFileSync('dist/app.js','utf8'),fragmentStart=appSource.indexOf('function restoreDocumentFragment'),fragmentEnd=appSource.indexOf('\nconst $',fragmentStart),fragmentCode=appSource.slice(fragmentStart,fragmentEnd);
let scrolled=false;const parent={tagName:'DETAILS',open:false,parentElement:null},target={tagName:'DETAILS',open:false,parentElement:parent,scrollIntoView(){scrolled=true;}};
vm.runInNewContext(fragmentCode+';restoreDocumentFragment()', {location:{hash:'#concept-relations'},requestAnimationFrame:fn=>fn(),document:{getElementById:()=>target}});assert(target.open&&parent.open&&scrolled,'a fragment targeting details itself must open it');
for(const[id,bad]of [['transformer-model','第 0.3 章'],['transformer-block','这是0.6节'],['training-lab','先用 6.2']])assert(!d.articles.find(a=>a.id===id).sections.some(s=>s[1].includes(bad)));
// Independent arithmetic for the two synthesis questions.
assert.equal((120*30+300)/30,130);assert.equal(2*4*8,64);assert.equal(2*2*4*4,64);assert.equal(2*8*8,128);assert.equal(2*2*8*8,256);
const {record,update,laterUpdates}=require('./coherence-review-records.cjs');assert.equal(update.reader_trials,0);
const latestMaps=[...laterUpdates].reverse().find(stage=>stage.field_maps_snapshot)?.field_maps_snapshot||update.field_maps;
assert.deepEqual(latestMaps,d.maps,'current maps must match the latest separate relationship review');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');for(const[file,expected]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(file)),expected,file+': unreviewed source change');
console.log('PASS: 14 connected field maps /95 existing points+5 prerequisite groups /87 authored relationships /14 exact evidence handoffs; all'+d.articles.length+' chapters have a concept position and route-consistent neighbors, shared capstones stay in their track; six reviewed prose revisions preserve every full code block. Human comprehension is not inferred.');
