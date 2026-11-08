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
 if(anchor)assert(page.includes('id="'+anchor+'"'),unit.id+': missing run target');
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
const staticPage=fs.readFileSync(path.join(dist,'labs/index.html'),'utf8');
for(const unit of units)assert(staticPage.includes('id="lab-'+unit.id+'"'),'static full catalog omitted '+unit.id);
assert(staticPage.includes('目标环境待验')&&staticPage.includes('已有本地记录'));
console.log('PASS: '+units.length+' ordered tasks across three tracks, all '+Object.keys(packs).length+' archives; '+boundFiles+' source entries bound to execution hashes and ZIP bytes, '+pendingFiles+' explicit target-environment files, every static/deep link and track filter.');
