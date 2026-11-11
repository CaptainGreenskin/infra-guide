/* A generated article is already the reading surface. Startup must preserve it. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const scripts=[...fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]);
const source=Object.fromEntries(scripts.map(f=>[f,fs.readFileSync('dist/'+f,'utf8')]));
function fixture({base='/',id='training-communication',route='article/'+id+'/',goal='',markerId=id,markerRoute='/'+route,hash='',query='',saved=true,version=source['static-reading-version.js'].match(/"([^"]+)"/)[1]}={}){
 const calls={body:0,sidebar:0,navigation:0,focus:0,windowScroll:0,targetScroll:0},attrs=new Map([['data-static-path',markerRoute],['data-static-article',markerId],['data-static-version',version]]),frames=[];
 const storage=new Map([['cloudinfra-progress',JSON.stringify(saved?{[id]:true}:{})],['cloudinfra-checks',JSON.stringify({[id+':1']:true})]]);
 const classes=()=>({values:new Set(),toggle(name,state){const on=state===undefined?!this.values.has(name):!!state;if(on)this.values.add(name);else this.values.delete(name);return on;},remove(name){this.values.delete(name);},add(name){this.values.add(name);}});
 const node=()=>({classList:classes(),addEventListener(){},setAttribute(){},removeAttribute(){},focus(){calls.focus++;},close(){},showModal(){}});
 const app={get innerHTML(){return '<main><article>既有正文与读者填写的笔记</article></main>';},set innerHTML(value){calls.body++;this.rendered=value;},getAttribute:name=>attrs.get(name),setAttribute:(name,value)=>attrs.set(name,value)};
 const side={details:[{open:false},{open:true}],querySelectorAll(){return this.details;},set outerHTML(value){calls.sidebar++;this.html=value;this.details=[{open:true},{open:false}];}},nav={set outerHTML(value){calls.navigation++;this.html=value;}};
 const read=node();read.textContent='标记为已读';
 const roadmap={setAttribute(name,value){this[name]=value;}};
 const userCheck={dataset:{check:id+':0'},checked:true,defaultChecked:false},storedCheck={dataset:{check:id+':1'},checked:false,defaultChecked:false};
 const container={tagName:'DETAILS',open:false,parentElement:null};
 const target={tagName:'DIV',parentElement:container,querySelector:()=>null,scrollIntoView(){calls.targetScroll++;}};
 const nodes=Object.fromEntries(['#search-dialog','#search-open','#search-close','#search-input','#search-status','#search-results','#theme','#mobile-menu','#main','.top-nav','.skip'].map(k=>[k,node()]));
 if(route.startsWith('track/'))nodes['[data-track-roadmap]']=roadmap;
 const document={title:'静态标题',documentElement:{classList:classes(),setAttribute(){}},addEventListener(){},
  getElementById:name=>['section-2','network-timing-lab','saved-target','concept-path','self-check','references'].includes(name)?target:null,
  querySelectorAll:selector=>selector==='input[data-check]'?[userCheck,storedCheck]:[],
  querySelector:selector=>selector==='base'?{getAttribute:()=>base}:selector==='#app'?app:selector==='.doc-layout .article'?{}:selector==='.sidebar'?side:selector==='.article-nav'?nav:selector==='[data-read="'+id+'"]'?read:nodes[selector]||null};
 const c={document,window:{addEventListener(){},scrollTo(){calls.windowScroll++;}},location:{pathname:base+route,search:query||(goal?'?goal='+goal:''),hash,replace(){}},history:{},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},URLSearchParams,requestAnimationFrame:fn=>frames.push(fn),IntersectionObserver:class{observe(){}disconnect(){}}};
 vm.createContext(c);for(const file of scripts)vm.runInContext(source[file],c,{filename:file});
 return {c,calls,attrs,storage,userCheck,storedCheck,side,nav,read,frames,target,container,roadmap};
}
const dataContext={};vm.createContext(dataContext);for(const f of scripts.filter(f=>f!=='app.js'))vm.runInContext(source[f],dataContext,{filename:f});
const data=JSON.parse(vm.runInContext('JSON.stringify({articles,tracks:trackDefinitions,profiles:learningProfiles})',dataContext));
let hydrated=0;
for(const a of data.articles){
 const page=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8');
 assert(page.includes('data-static-path="/article/'+a.id+'/"')&&page.includes('data-static-article="'+a.id+'"')&&page.includes('data-static-version="'+source['static-reading-version.js'].match(/"([^"]+)"/)[1]+'"'),a.id+': declared initial body and build');
 const f=fixture({id:a.id,saved:false});assert.equal(f.calls.body,0,a.id+': do not rebuild existing prose');assert.equal(f.calls.windowScroll,0);assert.equal(f.calls.focus,0);assert.equal(f.attrs.get('data-hydrated-static'),'true');hydrated++;
}
for(const base of ['/','/infra-guide/']){
 for(const[key,profile]of Object.entries(data.profiles)){
  const id=profile.targets[0],f=fixture({base,id,goal:key});
  assert.equal(f.calls.body,0,key+': role navigation preserves article nodes');assert.equal(f.calls.navigation,1);
  assert(f.nav.html.includes('goal='+key)&&f.nav.html.includes(profile.label));assert(f.side.html.includes('goal='+key));assert.deepEqual(f.side.details.map(d=>d.open),[false,true],'saved progress does not reset the reader’s sidebar expansion');
  assert(f.read.classList.values.has('done'));assert.equal(f.storedCheck.checked,true);
  assert.equal(JSON.parse(f.storage.get('cloudinfra-checks'))[id+':0'],true,'a check changed before startup is retained and saved');
  const entry=fixture({base,id:data.tracks[profile.track].start,route:'track/'+profile.track+'/',goal:key,saved:false});
  assert.equal(entry.calls.body,0,key+': preserve the original first lesson');
  assert.equal(entry.roadmap.href,'/roadmap/'+key+'/#learning-goal',key+': hydrate the static entry shortcut');
  assert.equal(entry.roadmap.textContent,profile.label+'路线 →');
 }
 for(const[track,value]of Object.entries(data.tracks)){
  const f=fixture({base,id:value.start,route:'track/'+track+'/'});assert.equal(f.calls.body,0);assert.equal(f.attrs.get('data-hydrated-static'),'true');
 }
 const alias=fixture({base,id:'training-lab',route:'module/practice/'});assert.equal(alias.calls.body,0);
 const switched=fixture({base,id:'training-lab',route:'module/practice/',query:'?track=cloud'});assert.equal(switched.calls.body,1);
 const alreadyOpen=fixture({base,hash:'#saved-target'});alreadyOpen.container.open=true;alreadyOpen.frames.forEach(f=>f());assert.equal(alreadyOpen.calls.targetScroll,0,'ordinary native fragment is not scrolled a second time');
 const fragment=fixture({base,hash:'#saved-target'});fragment.frames.forEach(f=>f());assert.equal(fragment.container.open,true);assert.equal(fragment.calls.targetScroll,1);assert.equal(fragment.calls.windowScroll,0);
 const section=fixture({base,query:'?section=2'});section.frames.forEach(f=>f());assert.equal(section.calls.targetScroll,1);
 const legacy=fixture({base,id:'network-diagnosis',query:'?section=7'});legacy.frames.forEach(f=>f());assert.equal(legacy.calls.targetScroll,1);assert.equal(legacy.container.open,true);
 for(const target of ['concept-path','self-check','references']){
  const f=fixture({base,query:'?section='+target,version:'previous-release'}),outer={tagName:'DETAILS',open:false,parentElement:null};
  f.container.parentElement=outer;assert.equal(f.calls.body,1);f.frames.forEach(frame=>frame());
  assert.equal(f.container.open,true,target+': fallback opens the immediate review/source fold');assert.equal(outer.open,true,target+': fallback opens every enclosing fold');assert.equal(f.calls.targetScroll,1);
 }
 for(const changed of [{markerId:'nonexistent'},{markerId:'agent-runtime'},{markerRoute:'/article/other/'},{version:'previous-release'}]){
  const f=fixture({base,...changed});assert.equal(f.calls.body,1,'missing or wrong static identity takes the ordinary renderer');assert.equal(f.attrs.has('data-hydrated-static'),false);
 }
}
console.log('PASS: '+hydrated+' existing article nodes retained at startup; role/progress/check state, three track entries, explicit/legacy fragments, root/Pages paths and renderer fallback. Actual browser reading/form persistence is checked separately.');
