const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert'),cp=require('child_process');
const dist=path.resolve('dist'),sink={innerHTML:''},grid={innerHTML:''},noop=()=>{};
const stub={addEventListener:noop,setAttribute:noop,removeAttribute:noop,focus:noop,close:noop,showModal:noop,classList:{toggle:noop,remove:noop,add:noop}};
const document={title:'',documentElement:{classList:{toggle:noop}},addEventListener:noop,querySelectorAll:()=>[],getElementById:()=>null,
 querySelector:s=>s==='base'?null:s==='#app'?sink:s==='#module-grid'?grid:stub};
const c={document,window:{addEventListener:noop,scrollTo:noop},location:{pathname:'/labs/',search:'',hash:'',replace:noop},history:{},localStorage:{getItem:()=>null},URLSearchParams,requestAnimationFrame:noop,IntersectionObserver:class{observe(){}disconnect(){}}};
vm.createContext(c);
const shell=fs.readFileSync('src/page-shell.html','utf8');
for(const [,file] of shell.matchAll(/<script defer src="([^"]+)"/g))vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),c,{filename:file});
const {units,packs,articles}=vm.runInContext('({units:labLearningCatalog,packs:labArchiveCatalog,articles})',c);
assert.equal(new Set(units.map(u=>u.id)).size,units.length,'duplicate task anchor');
assert.deepEqual([...new Set(units.map(u=>u.pack).filter(Boolean))].sort(),Object.keys(packs).sort(),'orphan archive or undefined bundle');
const localLaunchAt=units.findIndex(u=>u.id==='ai-multinode-local'),physicalLaunchAt=units.findIndex(u=>u.id==='ai-multinode');
assert(localLaunchAt>=0&&physicalLaunchAt>localLaunchAt,'run the local launcher exercise before the physical-node target handbook');
const allStrings=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(allStrings):[];
const zipChecks=[];let boundFiles=0,pendingFiles=0;
for(const unit of units){
 assert(Object.hasOwn(vm.runInContext('labTrackCatalog',c),unit.track));
 assert(articles.some(a=>a.id===unit.chapter),unit.id+': chapter missing');
 assert([0,1,2,3].includes(unit.stage)&&unit.env&&unit.observe&&unit.scope,unit.id+': missing learning contract');
 c.catalogUnit=unit;
 const run=vm.runInContext('labCatalogRunPath(catalogUnit)',c),[chapterPath,anchor]=run.split('#');
 const page=fs.readFileSync(path.join(dist,chapterPath,'index.html'),'utf8');
 assert(anchor&&page.includes('id="'+anchor+'"'),unit.id+': missing exact run target');
 const chapterLinks=page.match(/<details class="chapter-lab-links"[^>]*>[\s\S]*?<\/details>/g)||[];
 assert.equal(chapterLinks.length,1,unit.chapter+': one compact chapter practice disclosure');
 assert(chapterLinks[0].includes('href="'+run+'"'),unit.id+': chapter links to its exact run section');
 assert(chapterLinks[0].includes('href="/labs/?track='+unit.track+'#lab-'+unit.id+'"'),unit.id+': chapter links to the exact catalog evidence row');
 if(unit.kind==='目标环境手册')assert(chapterLinks[0].includes('目标环境待验'),unit.id+': planned evidence is marked');
 if(!unit.files.length){assert.equal(unit.kind,'目标环境手册');continue;}
 const recordPath=vm.runInContext('labCatalogRecordPath(catalogUnit)',c),record=JSON.parse(fs.readFileSync(path.join(dist,recordPath),'utf8')),hashes=allStrings(record);
 for(const file of unit.files){
  c.catalogFile=file;const source=vm.runInContext('labCatalogSourcePath(catalogUnit,catalogFile)',c),bytes=fs.readFileSync(path.join(dist,source));
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if((unit.pendingFiles||[]).includes(file)){pendingFiles++;assert(/待|手册/.test(unit.scope+' '+unit.kind),unit.id+': pending file presented as completed');}
  else {boundFiles++;assert(hashes.includes(digest),unit.id+'/'+file+': source not bound to execution record');}
  if(unit.pack)zipChecks.push({archive:path.join(dist,'labs',unit.pack+'.zip'),source:path.join(dist,source),name:file});
 }
 for(const pending of unit.pendingFiles||[])assert(unit.files.includes(pending));
}
const correctedTargets={
 'ai-attention':['attention-mechanics','section-6',6,'attention_lab.py'],
 'ai-ddp-step':['distributed-training','section-2',2,'ddp_step.py'],
 'ai-serving':['inference-performance','subsection-6-1ajl0y9',6,'serving_scheduler.py'],
 'agent-fencing':['durable-workflows','worker-fencing-run',9,'worker_fencing.py'],
 'agent-cancel':['agent-recovery','section-5',5,'cancel_receipts.py'],
 'agent-kairo':['kairo-practice','section-7',7],
 'cloud-recovery':['resilience','section-9',9,'recovered_effects.py'],
 'cloud-storage-journal-recovery':['storage-recovery','section-8',8,'recovery_lab.py']
};
for(const [id,[chapter,anchor,section,file]] of Object.entries(correctedTargets)){
 const unit=units.find(unit=>unit.id===id),a=articles.find(article=>article.id===chapter);
 assert(unit.chapter===chapter&&unit.anchor===anchor,id+': use the actual section for this experiment');
 if(file)assert(unit.files.includes(file)&&a.sections[section-1][1].includes(file),id+': referenced program appears in the selected section');
}
for(const article of articles){
 const page=fs.readFileSync(path.join(dist,'article',article.id,'index.html'),'utf8');
 const hasTasks=units.some(unit=>unit.chapter===article.id);
 assert.equal(page.includes('class="chapter-lab-links"'),hasTasks,article.id+': only show real catalog tasks');
 const toc=page.match(/<aside class="toc">([\s\S]*?)<\/aside>/)?.[1]||'';
 assert.equal(toc.includes('data-toc="chapter-experiments" href="/article/'+article.id+'/#chapter-experiments"'),hasTasks,article.id+': the contents link to the exact practice disclosure');
}
// Independently read ZIP members rather than trusting the JavaScript file lists.
const zipper=cp.spawnSync('python3',['-c',`import sys,json,zipfile,pathlib
for row in json.load(sys.stdin):
 with zipfile.ZipFile(row['archive']) as z:
  names=[n for n in z.namelist() if n==row['name'] or n.endswith('/'+row['name'])]
  assert names, (row['archive'],row['name'])
  assert any(z.read(n)==pathlib.Path(row['source']).read_bytes() for n in names),(row['archive'],row['source'])
`],{input:JSON.stringify(zipChecks),encoding:'utf8'});
assert.equal(zipper.status,0,zipper.stderr);
for(const selected of ['','cloud','ai','agent','unknown']){
 c.location.search=selected?'?track='+selected:'';vm.runInContext('labsPage()',c);
 const expected=units.filter(u=>!['cloud','ai','agent'].includes(selected)||u.track===selected);
 assert.equal((sink.innerHTML.match(/class="lab-learning-unit"/g)||[]).length,expected.length,selected+': wrong task selection');
 for(const u of units)assert.equal(sink.innerHTML.includes('id="lab-'+u.id+'"'),expected.includes(u),selected+': incorrect task');
 for(const track of ['cloud','ai','agent']){
  const sequence=expected.filter(u=>u.track===track&&u.stage!==0);
  assert(sequence.every((u,i)=>!i||sequence[i-1].stage<=u.stage),track+': learning stages out of order');
 }
 assert.equal((sink.innerHTML.match(/aria-current="page"/g)||[]).length,1,'direction selection semantics');
}
c.location.search='?track=ai&goal=ai-training';c.location.hash='#lab-ai-ddp-uneven-join';vm.runInContext('labsPage()',c);
const targeted=sink.innerHTML.match(/id="lab-ai-ddp-uneven-join"[\s\S]*?<li class="lab-learning-unit"/)?.[0];
assert(targeted?.includes('href="/roadmap/ai-training/#learning-goal"'),'the focused experiment exposes a return to the current role');
c.location.search='?track=agent&goal=ai-training';vm.runInContext('labsPage()',c);
assert(!sink.innerHTML.includes('/roadmap/ai-training/'),'a different direction does not present a mismatched role return');
const staticPage=fs.readFileSync(path.join(dist,'labs/index.html'),'utf8');
const earlyRoleScripts=[...staticPage.matchAll(/<script data-early-lab-role>([\s\S]*?)<\/script>/g)];
assert.equal(earlyRoleScripts.length,1,'lab links preserve a selected role before application startup');
const earlyRoleScript=earlyRoleScripts[0][1];
const fieldPage=fs.readFileSync(path.join(dist,'module/platform/index.html'),'utf8');
const earlyFieldRoleScript=fieldPage.match(/<script data-early-field-role>([\s\S]*?)<\/script>/)?.[1];
assert(earlyFieldRoleScript,'field practice links preserve a selected role before application startup');
const aiRoute=JSON.parse(vm.runInContext("JSON.stringify(learningProfileRoute(learningProfiles['ai-training']))",c));
assert(aiRoute.includes('kubernetes-training')&&!aiRoute.includes('quantization-serving'));
for(const base of ['/','/infra-guide/']){
 const origin='https://example.com',article=base+'article/';
 const hrefs=[article+'kubernetes-training/#native-kubernetes-gloo-job',
  article+'kubernetes-training/?source=lab#section-6',article+'kubernetes-training/?goal=#section-6',
  article+'quantization-serving/',base+'labs/kubernetes-gloo-job/validation.json',
  'https://elsewhere.example/article/kubernetes-training/',
  base+'module/training/#field-map-practice',base+'module/network/#field-map-practice',
  base+'labs/?track=ai#lab-ai-inference-placement',base+'labs/?track=agent#lab-agent-mcp-result-receipt',
  base+'labs/?track=ai&goal=#lab-ai-inference-placement',base+'labs/?track=ai#labs-ai'];
 for(const goal of ['ai-training','toString','']){
  const expected=hrefs.slice();
  if(goal==='ai-training'){
   expected[0]=article+'kubernetes-training/?goal=ai-training#native-kubernetes-gloo-job';
   expected[1]=article+'kubernetes-training/?source=lab&goal=ai-training#section-6';
   expected[6]=base+'module/training/?goal=ai-training#field-map-practice';
   expected[8]=base+'labs/?track=ai&goal=ai-training#lab-ai-inference-placement';
  }
  for(const script of [earlyRoleScript,earlyFieldRoleScript]){
   const links=hrefs.map(href=>({href:new URL(href,origin).href,result:href,setAttribute(name,value){
    assert.equal(name,'href');
    this.result=value;
   }}));
   vm.runInNewContext(script,{URL,URLSearchParams,location:{origin,search:'?goal='+goal},
    document:{querySelectorAll:()=>links}});
   assert.deepEqual(links.map(link=>link.result),expected,base+goal+': early practice role matches application semantics');
  }
 }
}
for(const unit of units)assert(staticPage.includes('id="lab-'+unit.id+'"'),'static full catalog omitted '+unit.id);
assert(staticPage.includes('目标环境待验')&&staticPage.includes('已有本地记录'));
console.log('PASS: '+units.length+' ordered tasks across three tracks, all '+Object.keys(packs).length+' archives; '+boundFiles+' source entries bound to execution hashes and ZIP bytes, '+pendingFiles+' explicit target-environment files, every static/deep link and track filter.');
