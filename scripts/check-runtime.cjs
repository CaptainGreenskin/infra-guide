const inventory=require('./content-inventory.cjs');
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert'),zlib=require('zlib');
const {runtimePlan}=require('./build-runtime.cjs');
const dist=path.resolve('dist'),shell=fs.readFileSync('src/page-shell.html','utf8'),read=file=>fs.readFileSync(path.join(dist,file),'utf8');
const plan=runtimePlan(shell,read),manifest=JSON.parse(read('runtime-manifest.json'));
assert.deepEqual(manifest,plan.manifest);
for(const b of plan.bundles)assert.equal(read(b.file),b.source,b.file+': stale generated bundle');
const canonical=[...shell.matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function capture(files,base){
 const sink={innerHTML:''},grid={innerHTML:''},noop=()=>{};
 const stub={addEventListener:noop,setAttribute:noop,removeAttribute:noop,focus:noop,close:noop,showModal:noop,classList:{toggle:noop,remove:noop,add:noop}};
 const document={title:'',documentElement:{classList:{toggle:noop}},addEventListener:noop,querySelectorAll:()=>[],getElementById:()=>null,
  querySelector:s=>s==='base'?{getAttribute:()=>base}:s==='#app'?sink:s==='#module-grid'?grid:['#search-dialog','#search-open','#search-close','#search-input','#search-status','#search-results','#theme','#mobile-menu','#main','.top-nav','.skip'].includes(s)?stub:null};
 const c={document,window:{addEventListener:noop,scrollTo:noop},location:{pathname:base,search:'',hash:'',replace:noop},history:{},localStorage:{getItem:()=>null},URLSearchParams,requestAnimationFrame:noop,IntersectionObserver:class{observe(){}disconnect(){}}};
 vm.createContext(c);for(const file of files)vm.runInContext(read(file),c,{filename:file});
 const data=vm.runInContext('({articles,modules,sources,trackDefinitions,cloudKnowledgeDomains,cloudKnowledgeExplanations,infraKnowledgeDomains,interviewUnits,learningProfiles})',c);
 const calls=['home()','startPage()','outlinePage()','interviewPage()','roadmap()',...Object.keys(data.learningProfiles).map(id=>'location.pathname='+JSON.stringify(base+'roadmap/'+id+'/')+';roadmapPage();location.pathname='+JSON.stringify(base)),'labsPage()','resourcesPage()','problemsPage()','editorialPage()',...Object.keys(data.interviewUnits).map(k=>'workshopPage('+JSON.stringify(k)+')'),...Object.keys(data.trackDefinitions).map(k=>'trackPage('+JSON.stringify(k)+')'),...data.modules.map(m=>'modulePage(moduleFor('+JSON.stringify(m.id)+'))'),...data.articles.map(a=>'articlePage(articleById('+JSON.stringify(a.id)+'))')];
 const pages=calls.map(call=>{sink.innerHTML='';grid.innerHTML='';vm.runInContext(call,c);return {call,html:hash(sink.innerHTML),grid:hash(grid.innerHTML),title:document.title};});
 return {initialization:hash(JSON.stringify(data)),pages};
}
for(const base of ['/','/infra-guide/'])assert.deepEqual(capture(plan.publicFiles,base),capture(canonical,base),base+': combined classic scripts change initialization or rendered content');
const readerManifest=JSON.parse(read('reader-runtime-manifest.json')),bootstrap=readerManifest.assets.find(a=>a.file.includes('reader-bootstrap.'));
const pages=fs.readdirSync(dist,{recursive:true}).filter(file=>file.endsWith('index.html'));
let lightArticles=0;
assert.equal(pages.length,inventory.html);
for(const file of pages){
 const html=read(file),scripts=[...html.matchAll(/<script defer src="([^"?]+)\?v=([\da-f]+)"/g)];
 assert.deepEqual(scripts.map(m=>m[1]),plan.publicFiles,file+': public load order');
 for(const m of scripts)assert.equal(m[2],hash(read(m[1])).slice(0,12),file+': stale script fingerprint');
 const template=html.match(/<template id="reader-full-runtime">([\s\S]*?)<\/template>/),activeHTML=html.replace(/<template id="reader-full-runtime">[\s\S]*?<\/template>/g,'');
 const active=[...activeHTML.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
 if(file.startsWith('article/')){assert(template,file+': explicit complete-runtime fallback');assert.deepEqual(active,['/'+bootstrap.file],file+': only one initial bootstrap');lightArticles++;}
 else{assert(!template,file+': nonarticle retains the complete runtime');assert.equal(active.length,plan.publicFiles.length);}
 assert(html.includes('id="app"')&&html.includes('<main'),file+': initial full HTML missing');
}
assert.equal(lightArticles,inventory.chapters);
const compressed=files=>files.reduce((total,file)=>total+zlib.gzipSync(read(file)).length,0);
console.log('PASS: '+canonical.length+' canonical scripts and '+plan.publicFiles.length+' complete-runtime files remain equivalent at root/Pages; '+lightArticles+' full-text article pages have one external bootstrap and retain nine inert fallback scripts. Legacy gzip estimate '+compressed(canonical)+'→'+compressed(plan.publicFiles)+' bytes; inline figure startup and reader assets checked separately.');
