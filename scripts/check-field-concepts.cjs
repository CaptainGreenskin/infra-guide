/* Check actual concept relationships and continuous reading, not human mastery. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,maps:fieldConceptMaps,guides:fieldConceptReadings,practice:fieldPracticePaths,followups:fieldPracticeFollowups,evidence:fieldConceptEvidence,targets:fieldConceptSectionTargets,labs:labLearningCatalog,routes:courseReadingStages,dependencies:chapterDependencies,optional:chapterOptionalConnections,log:readabilityRevisionLog})',c)));
assert.equal(Object.keys(d.maps).length,14);
assert.deepEqual(Object.keys(d.targets).sort(),Object.keys(d.maps).sort(),'every field has direct subsection links');
let nodes=0,edges=0,sectionLinks=0;
assert.deepEqual(Object.keys(d.practice).sort(),Object.keys(d.maps).sort(),'every field has one evidence-based exercise');
assert.deepEqual(Object.keys(d.followups).sort(),Object.keys(d.maps).sort(),'every field has a second evidence-based exercise');
const exerciseCount=Object.keys(d.practice).length+Object.keys(d.followups).length;
assert.equal(new Set([...Object.values(d.practice),...Object.values(d.followups)].map(([,lab])=>lab)).size,exerciseCount,'practice targets are distinct');
const labPage=fs.readFileSync('dist/labs/index.html','utf8');
const safe=value=>{c.value=value;return vm.runInContext('trainingEscape(value)',c);};
const copy=value=>value.replace(/\s+/g,'');
const decode=value=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
function checkConceptReturn(chapterHTML,moduleId,concept){
 const attr=chapterHTML.match(/class="chapter-map-link" [^>]*data-concept-returns="([^"]+)"/)?.[1];
 assert(attr,concept+': related article carries validated return choices');
 const [,label]=d.maps[moduleId].nodes.find(node=>node[0]===concept);
 const track=d.modules.find(module=>module.id===moduleId).track;
 assert.deepEqual(JSON.parse(decode(attr))[moduleId+'.'+concept],['/module/'+moduleId+'/?concept='+concept+'#map-concept-'+concept,label,track]);
}

function checkPractice(moduleId,points,block,[concept,labId,question,result],answerClass,returnAnchor){
 const unit=d.labs.find(lab=>lab.id===labId),chapter=d.articles.find(a=>a.id===unit?.chapter);
 assert(chapter?.module===moduleId&&points.some(p=>p.id===concept&&p.articles.includes(chapter.id)),labId+': practice follows an existing concept into its own field');
 assert(question.length>=25&&unit.files.length&&!(unit.pendingFiles||[]).length,labId+': checked practice requires evidence');
 c.unit=unit;
 const target=vm.runInContext('labCatalogRunPath(unit)',c),[path,anchor]=target.split('#');
 assert(anchor&&fs.readFileSync('dist'+path+'index.html','utf8').includes('id="'+anchor+'"'),labId+': practice lands at the exact section');
 const recordPath=vm.runInContext('labCatalogRecordPath(unit)',c),record=JSON.parse(fs.readFileSync('dist/'+recordPath,'utf8'));
 assert(/^passed(?:_|$)/.test(record.status||'')||unit.files.every(file=>record.programs?.[file]?.exit_code===0),labId+': practice record status');
 const catalog='/labs/?track='+unit.track+'#lab-'+labId;
 assert(block.includes('href="'+target+'"')&&block.includes('class="field-practice-catalog" href="'+catalog+'"'),labId+': exact chapter and catalog links');
 assert(copy(block).includes(copy('<p>'+safe(question)+'</p>')),labId+': stated question is visible');
 assert(copy(block).includes(copy('<p class="field-practice-environment">'+safe(unit.kind+' · '+unit.env)+'</p>')),labId+': show the actual environment before opening the answer');
 const answers=block.match(new RegExp('<details class="'+answerClass+'">[\\s\\S]*?<\\/details>','g'))||[];
 assert.equal(answers.length,1,labId+': one result, initially collapsed');
 assert(result.length>=30&&copy(answers[0]).includes(copy('<summary>核对结果</summary><p>'+safe(result)+'</p>')),labId+': stated result only in the disclosure');
 assert(!copy(block.slice(0,block.indexOf(answers[0]))).includes(copy(safe(result))),labId+': keep prediction separate from the result');
 assert(copy(answers[0]).includes(copy('<p class="field-practice-scope">'+safe(unit.scope)+'</p>'))&&answers[0].includes('href="'+recordPath+'"'),labId+': raw record and its exact validation scope');
 const row=labPage.match(new RegExp('<li class="lab-learning-unit" id="lab-'+labId+'">([\\s\\S]*?)(?=<li class="lab-learning-unit"|$)'))?.[1];
 assert(row?.includes('class="lab-field-practice-return" href="/module/'+moduleId+'/#'+returnAnchor+'"'),labId+': catalog returns to the same question');
}
for(const[moduleId,graph]of Object.entries(d.maps)){
 c.moduleId=moduleId;const points=JSON.parse(JSON.stringify(vm.runInContext('fieldPointRecords(moduleId)',c))),ids=graph.nodes.map(n=>n[0]);
 assert.deepEqual([...ids].sort(),points.map(p=>p.id).sort(),moduleId+': map must correspond to real knowledge points');assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual(Object.keys(d.targets[moduleId]).sort(),[...ids].sort(),moduleId+': every concept has one subsection destination');

 const seen=new Set([ids[0]]);
 for(const[from,verb,to,why]of graph.edges){assert(ids.includes(from)&&ids.includes(to)&&from!==to);assert(verb.length>=2&&why.length>=25);}
 for(let i=0;i<ids.length;i++)for(const[from,,to]of graph.edges)if(seen.has(from)||seen.has(to)){seen.add(from);seen.add(to);}
 assert.equal(seen.size,ids.length,moduleId+': isolated concept');for(const[id,label,meaning]of graph.nodes)assert(label&&meaning.length>=18,id);
 assert(graph.question&&graph.answer);for(const[target,why]of graph.outlets)assert(d.maps[target]&&why.length>=15);
 const html=fs.readFileSync('dist/module/'+moduleId+'/index.html','utf8');assert.equal((html.match(/id="concept-relations"/g)||[]).length,1);assert(html.includes('role="status"'));assert(html.indexOf('id="concept-relations"')<html.indexOf('id="examples"'));
 for(const id of ids){
  assert(/^[a-z0-9-]+$/.test(id),moduleId+': stable concept fragment');
  assert(html.includes('id="knowledge-'+id+'"'),moduleId+': definition target missing '+id);
  assert.equal(html.split('id="map-concept-'+id+'" tabindex="-1"').length,2,moduleId+': unique focusable concept target '+id);
  assert(html.includes('data-map-focus="all" href="/module/'+moduleId+'/#concept-relations">回到关系图 →'),moduleId+': return link works before enhancement');
  const authored=[d.practice[moduleId],d.followups[moduleId]].filter(row=>row?.[0]===id).map(([,lab])=>lab);
  const extra=d.evidence[moduleId]?.[id]||[];
  const evidence=[...authored,...extra];
  assert.equal(new Set(evidence).size,evidence.length,id+': do not duplicate existing concept-specific practices');
  const definitionAt=html.indexOf('id="map-concept-'+id+'"');
  const definitionEnd=html.indexOf('id="map-concept-',definitionAt+1);
  const definition=html.slice(definitionAt,definitionEnd<0?html.indexOf('field-map-status',definitionAt):definitionEnd);
  const [chapterId,fragment,label]=d.targets[moduleId][id];
  const chapter=d.articles.find(a=>a.id===chapterId);
  assert(chapter&&points.find(p=>p.id===id).articles.includes(chapterId),id+': direct subsection belongs to an existing related chapter');
  assert(/^[a-z0-9-]+$/.test(fragment)&&label.length>=6&&label.length<=30,id+': stable subsection and concise Chinese label');
  const chapterHTML=fs.readFileSync('dist/article/'+chapterId+'/index.html','utf8');
  assert.equal(chapterHTML.split(' id="'+fragment+'"').length,2,id+': unique authored subsection target');
  const pointAt=html.indexOf('<section class="knowledge-point" id="knowledge-'+id+'">');
  const nextPoint=html.indexOf('<section class="knowledge-point"',pointAt+1);
  const pointHTML=html.slice(pointAt,nextPoint<0?html.indexOf('id="field-map-practice"',pointAt):nextPoint);
  if(id==='mf-attention'){
   assert(pointHTML.includes('O=P·V'),id+': show the matrix product unambiguously');
   assert(!pointHTML.includes('data-concept-term="PV"')&&!pointHTML.includes('持久卷'),id+': the attention formula does not contain a storage term');
  }
  const from='?fromConcept='+moduleId+'.'+id;
  const directHref='/article/'+chapterId+'/'+from+'#'+fragment;
  checkConceptReturn(chapterHTML,moduleId,id);
  for(const view of [definition.match(/<p class="field-map-chapters">([\s\S]*?)<\/p>/)?.[1],pointHTML?.match(/<p class="path-links">([\s\S]*?)<\/p>/)?.[1]]){
   assert(view,id+': concept and knowledge both render related chapters');
   const first=view.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/);
   assert(first?.[1].includes('class="field-section-link" href="'+directHref+'"'),id+': exact subsection is the first chapter destination in both places');
   assert(copy(first[2].replace(/<[^>]+>/g,'')).includes(copy(chapter.number+' '+safe(label))),id+': label describes the target');
   assert.equal((view.match(/class="field-section-link"/g)||[]).length,1,id+': a single primary destination');
   assert(!view.includes('href="/article/'+chapterId+'/'+from+'"'),id+': avoid a duplicate generic link for the same chapter');
  }
  sectionLinks++;
  const list=definition.match(/<div class="field-map-labs">([\s\S]*?)<\/div>/)?.[1];
  assert.equal(Boolean(list),Boolean(evidence.length),id+': show only concept-specific practice links');
  assert.equal((list?.match(/class="field-map-lab-catalog"/g)||[]).length,evidence.length,id+': one link per distinct lab');
  for(const labId of evidence){
   c.unit=d.labs.find(unit=>unit.id===labId);
   assert(c.unit&&!c.unit.pendingFiles?.length&&c.unit.files.length,id+': practice needs a recorded result');
   assert.equal(d.articles.find(a=>a.id===c.unit.chapter)?.module,moduleId,id+': evidence stays in its field');
   const [runPath,runAnchor]=vm.runInContext('labCatalogRunPath(unit)',c).split('#');
   const destination=runPath+from+(runAnchor?'#'+runAnchor:'');
   checkConceptReturn(fs.readFileSync('dist'+runPath+'index.html','utf8'),moduleId,id);
   const catalog=vm.runInContext('labCatalogTaskPath(unit)',c);
   const [catalogPath,catalogAnchor]=catalog.split('#');
   const catalogDestination=catalogPath+'&amp;fromConcept='+moduleId+'.'+id+'#'+catalogAnchor;
   assert(list.includes('href="'+destination+'"')&&list.includes('href="'+catalogDestination+'" data-lab-chapter="'+c.unit.chapter+'"'),id+': both paths keep the same focused concept');
   const task=labPage.match(new RegExp('<li class="lab-learning-unit" id="lab-'+labId+'">([\\s\\S]*?)(?=<li class="lab-learning-unit"|$)'))?.[1];
   const href='/module/'+moduleId+'/?concept='+id+'#map-concept-'+id;
   assert(task?.includes('class="lab-field-practice-return" href="'+href+'" data-lab-concept="'+moduleId+'.'+id+'">回到概念图'),labId+': catalog returns to the exact concept and records the authored origin');
  }
 }
 const main=html.match(/<div class="field-map-main">([\s\S]*?)<\/div>/);
 assert(main&&html.indexOf(main[0])>html.indexOf('src="diagrams/field-'+moduleId+'.svg"'),moduleId+': text follows the front diagram');
 const fromMap=id=>'/module/'+moduleId+'/?concept='+id+'#map-concept-'+id;
 const labels=Object.fromEntries(graph.nodes.map(([id,label])=>[id,label]));
 const expected=d.guides[moduleId].main.map(index=>{
  const [from,verb,to]=graph.edges[index];
  return '<a data-map-focus="'+from+'" href="'+fromMap(from)+'">'+labels[from]+'</a><span class="field-map-verb">'+verb+' <span aria-hidden="true">→</span></span><a data-map-focus="'+to+'" href="'+fromMap(to)+'">'+labels[to]+'</a>';
 });
 assert.deepEqual([...main[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m=>m[1]),expected,moduleId+': same authored main edges and focusable concepts');
 const practice=html.match(/<section class="field-map-practice"[\s\S]*?<\/section>/g)||[];
 assert.equal(practice.length,1,moduleId+': one visible field practice');
 const explorer=html.indexOf('<details class="field-map-explorer"');
 const full=html.match(/<details class="field-map-full"><summary>完整关系图<\/summary>([\s\S]*?)<\/details>/);
 assert(full&&html.indexOf(main[0])<html.indexOf(full[0])&&html.indexOf(full[0])<explorer,moduleId+': full map disclosure follows the main relationships');
 const diagramSrc='src="diagrams/field-'+moduleId+'.svg"';
 assert(full[1].includes(diagramSrc)&&html.slice(html.indexOf('id="concept-relations"'),html.indexOf(main[0])).includes(diagramSrc),moduleId+': both layouts use the same full diagram');
 const firstKnowledge=html.indexOf('class="knowledge-point"');
 const lastKnowledge=html.lastIndexOf('class="knowledge-point"');
 const practiceAt=html.indexOf(practice[0]);
 assert(explorer>html.indexOf(main[0])&&firstKnowledge>explorer,moduleId+': concept map and its definitions come first');
 assert(practiceAt>lastKnowledge&&practiceAt<html.indexOf('id="examples"'),moduleId+': teach the field before its practice and related chapters');
 assert(html.includes('href="/module/'+moduleId+'/#field-map-practice">跳到本领域练习'),moduleId+': the front map retains an exact practice shortcut');
 assert(practice[0].includes('data-field-practice="'+d.practice[moduleId][1]+'"'),moduleId+': keep the primary practice');
 assert.equal((html.match(/id="field-map-practice"/g)||[]).length,1,moduleId+': unique practice heading target');
 const [primary,followup]=practice[0].split('<details class="field-map-practice-next"');
 checkPractice(moduleId,points,primary,d.practice[moduleId],'field-map-practice-result','field-map-practice');
 const next=d.followups[moduleId],[concept,labId,,,title]=next,startConcept=d.practice[moduleId][0];
 assert(concept===startConcept||graph.edges.some(([from,,to])=>[from,to].includes(concept)&&[from,to].includes(startConcept)),labId+': extend the same concept or an adjacent one');
 assert(title.length>=6&&title.length<=26,labId+': show a short prompt title');
 assert(followup?.startsWith(' data-practice-next="'+labId+'"><summary>'),labId+': follow-up starts collapsed');
 assert(followup.includes('<div class="field-practice-question" id="field-practice-'+labId+'" tabindex="-1">'),labId+': the fragment reveals the actual question inside the disclosure');
 checkPractice(moduleId,points,followup,next,'field-map-practice-next-result','field-practice-'+labId);
 nodes+=ids.length;edges+=graph.edges.length;
}
assert.equal(nodes,require('./content-inventory.cjs').points+5); // Five prerequisite groups are outside the knowledge index.
assert.equal(edges,90);assert.equal(sectionLinks,nodes);
const recoveryFragment='#subsection-5-1dwp2yh',recoveryArticle='/article/resilience/';
assert.deepEqual(d.targets.sre['recovery-evidence'].slice(0,2),['resilience',recoveryFragment.slice(1)]);
assert(d.evidence.sre['recovery-evidence'].includes('cloud-recovery'));
const sreRole=fs.readFileSync('dist/roadmap/cloud-sre/index.html','utf8');
assert(sreRole.includes('class="goal-gate-primary"><a href="'+recoveryArticle+'?goal=cloud-sre'+recoveryFragment+'"'));
assert(sreRole.includes('R3 的附件仍缺失'));
const cloudDisasterRow=fs.readFileSync('dist/interview/companies/index.html','utf8').match(/<tr><td>跨可用区容灾[\s\S]*?<\/tr>/)?.[0];
assert(cloudDisasterRow?.includes('href="'+recoveryArticle+recoveryFragment+'"'));
assert(cloudDisasterRow.includes('需目标环境')&&cloudDisasterRow.includes('目标环境再测跨区切换'));
const routeIds=Object.values(d.routes).flatMap(stages=>stages.flatMap(s=>s[1]));assert.equal(new Set(routeIds).size,d.articles.length);assert.equal(routeIds.length,d.articles.length);
assert.equal(vm.runInContext('chapterReadingContext(undefined).track',c),'shared','missing article routes must retain the not-found page without crashing');
for(const a of d.articles){
 c.a=a;const r=JSON.parse(JSON.stringify(vm.runInContext('chapterReadingContext(a)',c))),refs=JSON.parse(JSON.stringify(vm.runInContext('chapterFieldConcepts(a)',c)));
 assert(refs.length>0,a.id+': concept position missing');for(const[moduleId,id]of refs){assert(d.maps[moduleId].nodes.some(n=>n[0]===id));const page=fs.readFileSync('dist/module/'+moduleId+'/index.html','utf8'),definition=page.match(new RegExp('<div class="field-map-definition" id="map-concept-'+id+'" tabindex="-1" data-concept-definition="'+id+'">([\\s\\S]*?)</div>'))?.[1];const [primary,fragment]=d.targets[moduleId][id],href='/article/'+a.id+'/?fromConcept='+moduleId+'.'+id+(a.id===primary?'#'+fragment:'');assert(definition?.includes('href="'+href+'"'),a.id+': concept must link back to this chapter');}
 assert(r.ids.includes(a.id));const html=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8'),nav=html.match(/<nav class="article-nav"[\s\S]*?<\/nav>/)[0];
 const capstone=r.ids.find(id=>d.articles.find(a=>a.id===id).module==='practice'),sidebar=html.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];assert(sidebar.includes('<summary><a href="/article/'+capstone+'/"'),a.id+': practice group must stay in the current route');
 if(r.previous)assert(nav.includes('href="/article/'+r.previous.id+'/"'));if(r.next)assert(nav.includes('href="/article/'+r.next.id+'/"'));
 const [primaryModule,primaryId]=refs[0];
 const exactLink='class="chapter-map-link" href="/module/'+primaryModule+'/?concept='+primaryId+'#map-concept-'+primaryId+'"';
 assert(html.includes(exactLink),a.id+': go directly to the primary definition');
 const connection=html.match(/<aside class="chapter-connection"[\s\S]*?<\/aside>/)?.[0];
 assert(connection?.includes(exactLink)&&connection.includes('href="/roadmap/?track='+r.track+'#route-chapter-'+r.track+'-'+a.id+'"'),a.id+': chapter links retain concept and route targets');
 const incoming=d.dependencies[a.id]?.[0];
 const outgoing=d.articles.filter(other=>r.ids.includes(other.id)).flatMap(other=>(d.dependencies[other.id]||[]).filter(([id])=>id===a.id).map(([,why])=>[other.id,why]))[0];
 const visible=[incoming,outgoing||d.optional[a.id]?.[0]].filter(Boolean);
 for(const [id,why] of visible)assert(connection.includes('href="/article/'+id+'/"')&&connection.includes(why),a.id+': keeps the linked chapter and its authored reason');
 const related=html.match(/<section class="related-reading"[\s\S]*?<\/section>/)?.[0]||'';
 const relatedLinks=[...related.matchAll(/href="\/article\/([a-z0-9-]+)\/"/g)].map(m=>m[1]);
 assert.deepEqual(relatedLinks,(a.related||[]).filter(id=>!visible.some(([shown])=>shown===id)),a.id+': every distinct related chapter remains');
 if(a.module==='practice'){assert(html.includes('本方向')||nav.includes('学习路线'));const side=html.match(/<aside class="sidebar"[\s\S]*?<\/aside>/)[0];for(const other of d.articles.filter(x=>x.module==='practice'&&x.id!==a.id))assert(!side.includes('/article/'+other.id+'/'),a.id+': unrelated capstone in current sidebar');}
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
const focusSteps=[];
const searchTarget={tagName:'SECTION',parentElement:parent,hasAttribute:()=>false,setAttribute:(key,value)=>focusSteps.push([key,value]),
 focus:({preventScroll})=>focusSteps.push(['focus',preventScroll,parent.open]),scrollIntoView:()=>focusSteps.push(['scroll'])};
parent.open=false;
vm.runInNewContext(fragmentCode+';restoreDocumentFragment(true)', {location:{hash:'#section-2'},requestAnimationFrame:fn=>fn(),document:{getElementById:()=>searchTarget}});
assert.deepEqual(focusSteps,[['tabindex','-1'],['focus',true,true],['scroll']],'same-page search reveals and focuses its result before scrolling');
for(const[id,bad]of [['transformer-model','第 0.3 章'],['transformer-block','这是0.6节'],['training-lab','先用 6.2']])assert(!d.articles.find(a=>a.id===id).sections.some(s=>s[1].includes(bad)));
// Independent arithmetic for the two synthesis questions.
assert.equal((120*30+300)/30,130);assert.equal(2*4*8,64);assert.equal(2*2*4*4,64);assert.equal(2*8*8,128);assert.equal(2*2*8*8,256);
const {record,update,laterUpdates}=require('./coherence-review-records.cjs');assert.equal(update.reader_trials,0);
const latestMaps=[...laterUpdates].reverse().find(stage=>stage.field_maps_snapshot)?.field_maps_snapshot||update.field_maps;
assert.deepEqual(latestMaps,d.maps,'current maps must match the latest separate relationship review');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');for(const[file,expected]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(file)),expected,file+': unreviewed source change');
console.log('PASS: 14 connected field maps / '+nodes+' nodes / '+edges+' authored relationships / '+sectionLinks+' direct subsection destinations / '+exerciseCount+' exact practice handoffs and catalog returns with scoped evidence; all'+d.articles.length+' chapters have a concept position and route-consistent neighbors, shared capstones stay in their track; six historical prose revisions preserve every full code block. Human comprehension is not inferred.');
