/* Node/VM equivalence checks, adapted from the reviewed reader prototype.
   Bootstrap probes observe loading decisions; they do not execute the full
   fallback in a browser. Browser forms, keyboard behavior and final fallback
   execution are verified separately through the real UI. */
'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {TextDecoder}=require('util');
const inventory=require('./content-inventory.cjs');
const {buildReader}=require('./article-reader/build.cjs');
const {runtimePlan}=require('./build-runtime.cjs');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const plain=value=>JSON.parse(JSON.stringify(value));
const json=(context,expression)=>JSON.parse(vm.runInContext('JSON.stringify('+expression+')',context));
const shell=read('src/page-shell.html');
const files=[...shell.matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(files).size,files.length,'each canonical source executes once');
assert.equal(files.at(-1),'app.js','evaluate the final canonical app too');
const sources=new Map(files.map(file=>[file,read('dist/'+file)]));
const compiled=files.map(file=>new vm.Script(sources.get(file),{filename:file}));

function makeVM(base='/'){
 const noop=()=>{},sink={innerHTML:''},grid={innerHTML:''};
 const stub={addEventListener:noop,setAttribute:noop,removeAttribute:noop,focus:noop,close:noop,showModal:noop,classList:{toggle:noop,remove:noop,add:noop}};
 const document={title:'',documentElement:{classList:{toggle:noop},setAttribute:noop},addEventListener:noop,querySelectorAll:()=>[],getElementById:()=>null,
  querySelector:s=>s==='base'?{getAttribute:()=>base}:s==='#app'?sink:s==='#module-grid'?grid:['#search-dialog','#search-open','#search-close','#search-input','#search-status','#search-results','#theme','#mobile-menu','#main','.top-nav','.skip'].includes(s)?stub:null};
 const context={document,window:{addEventListener:noop,dispatchEvent:noop,scrollTo:noop},location:{pathname:base,search:'',hash:'',replace:noop},history:{},localStorage:{getItem:()=>null},URLSearchParams,Event,requestAnimationFrame:noop,IntersectionObserver:class{observe(){}disconnect(){}}};
 vm.createContext(context);for(const script of compiled)script.runInContext(context);
 return {context,sink,grid};
}

function probeRuntime(reader){
 const startup=read('scripts/article-reader/reader-startup.js');
 assert.equal(reader.runtime.split(startup).length,2,'replace exactly the real startup boundary');
 const preflight=startup.indexOf('try{');assert(preflight>0,'retain cleanup declarations and external-event registration before startup');
 const bridge=`globalThis.__probe={metadata:{${Object.keys(reader.metadata).join(',')}},sidebarView,learningGoalChapterNav,learningContextHref,readerInternalHref,cleanInternalHTML,chapterReadingContext,chapterReadingNav,readingArticleURL,practiceArticleForContext,learningProfileRoute,courseRedirectFor,legacySectionTarget,attentionExample,sloCalculation,kvCalculation,sinusoidalPositionPair,sinusoidalPositionGraphic,rankSiteSearch,siteSearchHighlight,search,loadSearchIndex,bindApplicationEvents,setComfortAbort:value=>comfortAbort=value,getAbortState:()=>({reader:readerAbort.signal.aborted,comfort:comfortAbort?.signal.aborted}),setIndex:value=>siteSearchCache=value,setProgress:value=>progress=value,getSearch:()=>({searchItems,searchIndex,latestSearchQuery,cache:siteSearchCache})};return;`;
 // Keep the production external-fallback subscription. Only hydration/startup
 // itself is replaced; its actual event cleanup can then be tested separately.
 return new vm.Script(reader.runtime.replace(startup,startup.slice(0,preflight)+bridge),{filename:'reader-runtime-probe.js'});
}

function lightVM(script,base='/',runtimeMode){
 const nodes={},state={fetches:0};
 const context={URLSearchParams,URL,AbortController,TextDecoder,crypto:crypto.webcrypto,setTimeout,clearTimeout,
  location:{pathname:base,search:'',hash:'',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},
  document:Object.assign(new EventTarget(),{documentElement:{getAttribute:name=>name==='data-reader-runtime'?runtimeMode:null},querySelector:s=>s==='base'?{getAttribute:()=>base}:s==='link[rel=canonical]'?{href:'https://example.test'+base}:nodes[s]||null}),window:new EventTarget(),
  fetch(){state.fetches++;throw Error('unexpected eager search request');}};
 vm.createContext(context);script.runInContext(context);
 assert.equal(state.fetches,0,'initializing the light runtime does not fetch the search index');
 if(runtimeMode==='full'){
  assert.equal(context.__probe,undefined,'light startup arriving late leaves full runtime in charge');
  return;
 }
 assert.equal(context.__probe.getSearch().cache,null,'the light runtime starts without an eager index');
 return {context,p:context.__probe,nodes,state};
}

function assertMetadata(metadata,canonical){
 assert.equal(metadata.articles.length,inventory.chapters);
 assert.equal(Object.keys(metadata.learningProfiles).length,7);
 assert.deepStrictEqual(metadata.articles,json(canonical,'articles.map(({id,module,number,title,group})=>({id,module,number,title,...(group===undefined?{}:{group})}))'));
 for(const a of metadata.articles){
  assert(Object.keys(a).every(key=>['id','module','number','title','group'].includes(key)),a.id+': article metadata only');
  assert(!Object.hasOwn(a,'sections')&&!Object.hasOwn(a,'intro')&&!Object.hasOwn(a,'fulltext'),a.id+': no article body in metadata');
 }
 function walk(value){
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){
   assert(!['sections','fulltext','segments','allNorm','proseNorm'].includes(key),'no hidden full-text index in metadata: '+key);
   walk(child);
  }
 }
 walk(metadata);
 assert(!/<(?:p|pre|figure)\b/i.test(JSON.stringify(metadata)),'metadata does not embed authored HTML');
 for(const [key,p]of Object.entries(metadata.learningProfiles)){
  canonical.profileKey=key;
  assert.deepStrictEqual(p.route,json(canonical,'learningProfileRoute(learningProfiles[profileKey])'),key+': preserve the prerequisite closure and order');
 }
}

function checkManifest(reader,canonical){
 const earlyFigureBytes=Buffer.byteLength(read('dist/reader-figures.js'));
 const expected={schema:1,staticReadingVersion:reader.version,articles:reader.metadata.articles.length,initialExecutableScripts:2,normalReaderScriptRequests:2,fullFallbackScripts:9,
  initialReaderJSBytes:reader.initialReaderJSBytes+earlyFigureBytes,initialInlineFigureBytes:earlyFigureBytes,metadataBytes:Buffer.byteLength(JSON.stringify(reader.metadata)),metadataSha256:hash(JSON.stringify(reader.metadata)),
  assets:[reader.bootstrapAsset,reader.runtimeAsset,reader.searchAsset],reusedFunctions:reader.provenance,searchEntries:reader.index.length};
 const published=JSON.parse(read('dist/reader-runtime-manifest.json'));
 assert.deepStrictEqual(published,expected,'published reader manifest matches a fresh build from the final canonical VM');
 assert.equal(expected.assets.length,3);
 for(const asset of expected.assets){
  const bytes=fs.readFileSync(path.join(root,'dist',asset.file));
  assert.equal(bytes.length,asset.bytes,asset.file+': published byte count');
  assert.equal(hash(bytes),asset.sha256,asset.file+': published digest');
  assert.equal(path.basename(asset.file),path.basename(asset.url));
  assert(path.basename(asset.file).includes(asset.sha256.slice(0,12)),asset.file+': content fingerprint');
 }
 assert.deepStrictEqual(reader.index,json(canonical,'buildSiteSearchIndex()'),'all original search entry and segment fields survive serialization');
 assert.equal(reader.index.length,inventory.search);
 assert.equal(new Set(reader.index.map(e=>e.id)).size,inventory.search);
 assert.equal(reader.index.filter(e=>e.type==='knowledge').length,95);
 const payload=JSON.parse(read('dist/'+reader.searchAsset.file));
 assert.deepStrictEqual(payload,{schema:1,staticReadingVersion:reader.version,entries:reader.index});
 return expected;
}

function contextProjection(key,value){
 if(['previous','next'].includes(key)&&value){
  const {id,module,number,title,group}=value;
  return {id,module,number,title,...(group===undefined?{}:{group})};
 }
 return value;
}

function checkNavigation(reader,lightScript,originals){
 let navCases=0,contextCases=0,redirectCases=0;
 const saved={'training-communication':true,'agent-runtime':true,'cloud-overview':true};
 for(const base of ['/','/infra-guide/']){
  const original=originals.get(base).context,{context,p}=lightVM(lightScript,base);
  assert.deepStrictEqual(plain(p.metadata),reader.metadata,'runtime metadata equals the build output');
  vm.runInContext('progress='+JSON.stringify(saved),original);p.setProgress(saved);
  for(const goal of ['',...Object.keys(reader.metadata.learningProfiles)])for(const a of reader.metadata.articles){
   const loc={pathname:base+'article/'+a.id+'/',search:goal?'?goal='+goal:'',hash:''};
   Object.assign(original.location,loc);Object.assign(context.location,loc);original.probeId=a.id;
   const label=base+(goal||'complete-course')+'/'+a.id;
   assert.equal(p.sidebarView(a.module,a.id),vm.runInContext('sidebarView(articleById(probeId).module,probeId)',original),label+': sidebar');
   assert.equal(p.learningGoalChapterNav(a),vm.runInContext('learningGoalChapterNav(articleById(probeId))',original),label+': role navigation');
   assert.equal(p.chapterReadingNav(a),vm.runInContext('chapterReadingNav(articleById(probeId))',original),label+': course neighbors');
   assert.equal(p.readingArticleURL(a.id),vm.runInContext('readingArticleURL(probeId)',original),label+': article URL');
   assert.equal(p.practiceArticleForContext().id,vm.runInContext('practiceArticleForContext().id',original),label+': shared project');
   // previous/next intentionally expose metadata, rather than replaying their bodies.
   assert.deepStrictEqual(JSON.parse(JSON.stringify(p.chapterReadingContext(a),contextProjection)),JSON.parse(JSON.stringify(vm.runInContext('chapterReadingContext(articleById(probeId))',original),contextProjection)),label+': context');
   navCases++;
   const hrefs=['/module/practice/#self-check',base+'article/'+a.id+'/?section=2#references','/article/model-serving/?goal=ai-inference#section-2','/module/training/?track=ai#knowledge-tr-ddp','/article/'+a.id+'/?goal=#references','https://example.org/article/'+a.id+'/','//example.org/article/'+a.id+'/','#section-2'];
   for(const href of hrefs){
    original.probeHref=href;
    assert.equal(p.learningContextHref(href),vm.runInContext('learningContextHref(probeHref)',original),label+': explicit and inherited context');
    contextCases++;
   }
   for(const href of ['#/article/'+a.id+'?section=2#detail','article/'+a.id+'/?section=2#detail',base+'article/'+a.id+'/?section=2#detail']){
    original.probeHref=href;assert.equal(p.readerInternalHref(href),vm.runInContext('readerInternalHref(probeHref)',original),label+': root/Pages URL bridge');contextCases++;
   }
   original.args=['/article/'+a.id+'/',loc.search,'#section-2'];
   assert.equal(p.courseRedirectFor(...original.args),vm.runInContext('courseRedirectFor(...args)',original),label+': redirect');redirectCases++;
  }
  const redirects=[['/start/','?goal=cloud-sre','#detail'],['/start','',''],['/article/model-serving/','?section=8&goal=ai-inference',''],['/article/network-diagnosis/','?section=7',''],['/track/ai/','','#%ZZ']];
  for(const anchor of Object.keys(reader.metadata.quantizationLegacyAnchors))redirects.push(['/article/model-serving/','?goal=ai-inference','#'+anchor]);
  for(const [track,anchors]of Object.entries(reader.metadata.legacyTrackKnowledgeAnchors))for(const anchor of anchors)redirects.push(['/track/'+track+'/','?goal=agent-app','#'+encodeURIComponent(anchor)]);
  for(const args of redirects){original.args=args;assert.equal(p.courseRedirectFor(...args),vm.runInContext('courseRedirectFor(...args)',original),base+JSON.stringify(args));redirectCases++;}
  for(const section of ['7','2','references',null]){original.args=['network-diagnosis',section];assert.equal(p.legacySectionTarget(...original.args),vm.runInContext('legacySectionTarget(...args)',original));}
  context.location.search=original.location.search='?goal=ai-inference';
  const html='<a href="/article/attention-mechanics/?source=map&amp;section=2#detail">Attention</a>';
  original.fixture=html;assert.equal(p.cleanInternalHTML(html),vm.runInContext('cleanInternalHTML(fixture)',original),base+': HTML query entities');
  vm.runInContext('progress={}',original);
 }
 assert.equal(navCases,inventory.chapters*8*2,'every article, seven roles plus the complete course, both bases');
 return {navCases,contextCases,redirectCases};
}

function checkRankingAndMath(reader,lightScript,original){
 const {p}=lightVM(lightScript);p.setIndex(reader.index);
 const queries=[...new Set(['','GPU','幂等','恢复','tools/call','structuredContent','operation_id','R17','27','base10','DDP','KV Cache','etcd','LINUX','无法匹配zzzzz','４２','a b c',...reader.index.map(e=>e.titleText)])];
 assert.equal(queries.length,190,'the reviewed corpus includes every article and knowledge title');
 for(const q of queries){
  original.q=q;
  assert.equal(JSON.stringify(p.rankSiteSearch(q)),vm.runInContext('JSON.stringify(rankSiteSearch(q))',original),'complete ranked records, tie order, excerpts and anchors: '+q);
 }
 let mathCases=0;
 for(const position of [0,1,2,3])for(const causal of [false,true])for(const future of [false,true]){
  original.args=[position,causal,future];assert.deepStrictEqual(plain(p.attentionExample(...original.args)),json(original,'attentionExample(...args)'));mathCases++;
 }
 for(const args of [[1000,989,99],[1000,990,99],[0,0,99],[1,2,99],[-1,0,99],[1,1,100],[1.5,1,99]]){
  original.args=args;assert.deepStrictEqual(plain(p.sloCalculation(...args)),json(original,'sloCalculation(...args)'));mathCases++;
 }
 for(const args of [[32,8,128,2,4096,16],[0,8,128,2,4096,16],[32,8,128,2,4096,1],[1000000,1000000,1000000,1000000,1000000,1000000],[32,8,128,2,1.5,16]]){
  original.args=args;assert.deepStrictEqual(plain(p.kvCalculation(...args)),json(original,'kvCalculation(...args)'));mathCases++;
 }
 // Independent rates and fixed-offset transform, not just agreement between two bundles.
 const rates={4:[1,0.01],8:[1,0.1,0.01,0.001]},close=(a,b)=>assert(Math.abs(a-b)<1e-12);
 for(const width of [4,8])for(const [pair,rate]of rates[width].entries())for(const position of [0,1,16,32]){
  const args=[width,pair,position],actual=p.sinusoidalPositionPair(...args);
  original.args=args;assert.deepStrictEqual(plain(actual),json(original,'sinusoidalPositionPair(...args)'));
  close(actual.frequency,rate);close(actual.angle,position*rate);
  close(actual.sine,Math.sin(position*rate));close(actual.cosine,Math.cos(position*rate));
  const next=p.sinusoidalPositionPair(width,pair,position+1);
  close(next.sine,actual.sine*Math.cos(rate)+actual.cosine*Math.sin(rate));
  close(next.cosine,-actual.sine*Math.sin(rate)+actual.cosine*Math.cos(rate));
  const chart=p.sinusoidalPositionGraphic(...args);
  assert.equal(chart,vm.runInContext('sinusoidalPositionGraphic(...args)',original));
  assert.equal((chart.match(/class="pe-cell /g)||[]).length,width*33);
  assert(chart.includes('M'+(45+position*12)+' 22V136'));
  mathCases++;
 }
 original.fixture='<img src="x"> & text';original.terms=['img'];
 assert.equal(p.siteSearchHighlight(original.fixture,original.terms),vm.runInContext('siteSearchHighlight(fixture,terms)',original));
 return {searchCases:queries.length,mathCases};
}

function searchNodes(nodes){
 const state={resultRenders:0},retry={onclick:null};
 nodes['#search-input']={value:'',removeAttribute(){}};nodes['#search-status']={textContent:''};
 nodes['#search-results']={value:'',set innerHTML(value){this.value=value;if(value.includes('class="search-result"'))state.resultRenders++;},get innerHTML(){return this.value;},querySelector:selector=>selector==='[data-search-retry]'?retry:null};
 return {state,retry};
}
function response(bytes){return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}

async function checkLazySearch(reader,lightScript,indexBytes){
 const lazy=lightVM(lightScript),{state}=searchNodes(lazy.nodes);let fetches=0,release,requested;
 lazy.context.fetch=(url,options)=>{fetches++;requested={url,options};return new Promise(resolve=>{release=resolve;});};
 assert.equal(fetches,0);
 lazy.nodes['#search-input'].value='GPU';const first=lazy.p.search('GPU');
 lazy.nodes['#search-input'].value='幂等';const second=lazy.p.search('幂等');
 assert.equal(fetches,1,'concurrent input shares one pending request');
 assert.equal(requested.url,reader.searchAsset.url);assert.equal(requested.options.credentials,'same-origin');
 assert.equal(lazy.nodes['#search-status'].textContent,'正在加载完整搜索索引…');
 assert.equal(lazy.p.getSearch().cache,null,'pending bytes are not a usable index');
 release(response(indexBytes));await Promise.all([first,second]);
 assert.equal(lazy.p.getSearch().latestSearchQuery,'幂等');
 assert.equal(lazy.nodes['#search-input'].value,'幂等','loading preserves typed input');
 assert.equal(state.resultRenders,1,'only the latest pending query renders results');
 assert.deepStrictEqual(plain(lazy.p.getSearch().searchItems),plain(lazy.p.rankSiteSearch('幂等').slice(0,24)));
 await lazy.p.search('GPU');assert.equal(fetches,1,'loaded index is reused');

 const pages=lightVM(lightScript,'/infra-guide/');searchNodes(pages.nodes);let pagesURL;
 pages.context.fetch=async url=>{pagesURL=url;return response(indexBytes);};await pages.p.search('恢复');
 assert.equal(pagesURL,'/infra-guide'+reader.searchAsset.url,'lazy asset uses the Pages prefix');

 const failures=[
  {name:'network',fetch:async()=>{throw Error('network');}},
  {name:'HTTP',fetch:async()=>({ok:false,status:503})},
  {name:'digest',fetch:async()=>response(Buffer.from('{}'))},
  {name:'version',noCrypto:true,fetch:async()=>response(Buffer.from(JSON.stringify({schema:1,staticReadingVersion:'previous-release',entries:reader.index})))}
 ];
 for(const test of failures){
  const retryVM=lightVM(lightScript),{retry}=searchNodes(retryVM.nodes);if(test.noCrypto)retryVM.context.crypto=undefined;
  let attempts=0;retryVM.context.fetch=async()=>++attempts===1?test.fetch():response(indexBytes);
  retryVM.nodes['#search-input'].value='恢复';await retryVM.p.search('恢复');
  assert.equal(attempts,1,test.name);assert.equal(retryVM.p.getSearch().cache,null,test.name+': reject unusable index');
  assert.equal(retryVM.nodes['#search-input'].value,'恢复',test.name+': preserve input on failure');
  assert(retryVM.nodes['#search-status'].textContent.includes('重试'),test.name+': actionable retry');
  assert.equal(typeof retry.onclick,'function',test.name+': bind the actual retry control');
  retryVM.nodes['#search-input'].value='幂等';await retry.onclick();
  assert.equal(attempts,2,test.name+': clear the failed promise');
  assert.deepStrictEqual(plain(retryVM.p.getSearch().searchItems),plain(retryVM.p.rankSiteSearch('幂等').slice(0,24)),test.name+': retry the current input');
 }
 return {sharedPendingFetch:true,latestQueryWins:true,retryCases:failures.length,noEagerIndex:true};
}

async function checkExternalFallback(lightScript,indexBytes){
 const f=lightVM(lightScript),searchState=searchNodes(f.nodes),controls=['#search-open','#search-close','#theme','#mobile-menu','.skip'];
 const calls={opened:0,closed:0,focus:0,comfort:0,fetches:0};
 const classes={toggle(){return false;},remove(){},add(){},contains(){return false;}};
 const node=()=>Object.assign(new EventTarget(),{setAttribute(){},removeAttribute(){},classList:classes,focus(){calls.focus++;}});
 for(const selector of controls)f.nodes[selector]=node();
 f.nodes['#search-input']=Object.assign(node(),{value:''});
 f.nodes['#search-dialog']=Object.assign(node(),{open:false,showModal(){this.open=true;calls.opened++;},close(){this.open=false;calls.closed++;}});
 f.nodes['.top-nav']=node();f.nodes['#main']=node();
 f.context.document.documentElement={classList:classes};
 let resolveFetch;f.context.fetch=()=>{calls.fetches++;return new Promise(resolve=>{resolveFetch=resolve;});};
 f.p.bindApplicationEvents();
 assert(controls.every(selector=>typeof f.nodes[selector].onclick==='function'),'actual application property handlers are bound');
 const comfortController=new AbortController(),comfortTarget=new EventTarget();
 f.p.setComfortAbort(comfortController);
 comfortTarget.addEventListener('input',()=>calls.comfort++,{signal:comfortController.signal});
 comfortTarget.dispatchEvent(new Event('input'));assert.equal(calls.comfort,1);
 const shortcut=()=>Object.assign(new Event('keydown',{cancelable:true}),{key:'k',ctrlKey:true,metaKey:false});
 f.context.document.dispatchEvent(shortcut());
 assert.equal(calls.opened,1,'real EventTarget dispatch reaches the actual Ctrl+K listener');
 assert.equal(calls.fetches,1);const pending=f.p.search('幂等');
 assert.deepStrictEqual(plain(f.p.getAbortState()),{reader:false,comfort:false});
 // Dispatch externally: do not call requestFullRuntime() or releaseReader().
 // This regresses the late-fallback path where bootstrap initiates the switch.
 f.context.window.dispatchEvent(new Event('reader-full-runtime'));
 assert.deepStrictEqual(plain(f.p.getAbortState()),{reader:true,comfort:true},'external fallback aborts both reader listener groups');
 assert(controls.every(selector=>f.nodes[selector].onclick===null),'external fallback clears every application property handler');
 f.context.document.dispatchEvent(shortcut());comfortTarget.dispatchEvent(new Event('input'));
 assert.equal(calls.opened,1);assert.equal(calls.closed,0,'the released Ctrl+K listener no longer handles keys');assert.equal(calls.comfort,1);
 resolveFetch(response(indexBytes));await pending;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(searchState.state.resultRenders,0,'a search pending before external fallback cannot render after release');
 assert.equal(calls.fetches,1,'the fallback cleanup starts no new search request');
}

function appFragment(html){const match=html.match(/<!-- APP_START -->([\s\S]*?)<!-- APP_END -->/);assert(match,'full initial APP fragment');return match[1];}
const scriptTags=html=>[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
function withoutTemplates(html){return html.replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi,'');}
function assertEarlyFigures(html,label){
 const scripts=[...html.matchAll(/<script data-early-reader-figures>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1,label+': one independent early figure script');
 assert.equal(scripts[0][1],read('dist/reader-figures.js'),label+': exact early figure source');
 assert(scripts[0].index<html.indexOf('<script defer src='),label+': bind before any deferred runtime');
}

function checkPublishedHTML(reader,original){
 const plan=runtimePlan(shell,file=>sources.get(file));
 const legacy=plan.publicFiles.map(file=>file+'?v='+hash(fs.readFileSync(path.join(dist,file))).slice(0,12));
 assert.equal(legacy.length,9);
 let articles=0,anchors=0,otherPages=0;
 for(const a of reader.metadata.articles){
  const route='/article/'+a.id+'/',html=read('dist'+route+'index.html');
  assertEarlyFigures(html,a.id);
  const template=[...html.matchAll(/<template\b[^>]*\bid="reader-full-runtime"[^>]*>([\s\S]*?)<\/template>/g)];
  assert.equal(template.length,1,a.id+': exactly one inert full-runtime template');
  assert.deepStrictEqual(scriptTags(template[0][1]).map(m=>m[1]),legacy,a.id+': nine fingerprinted fallback scripts in canonical order');
  assert.deepStrictEqual(scriptTags(withoutTemplates(html)).map(m=>m[1]),[reader.bootstrapAsset.url],a.id+': only one initial external reader script');
  // Undo only the runtime wrapper, then exercise the production patch API again.
  const bootstrapTag=scriptTags(withoutTemplates(html))[0][0];
  const unpatched=html.replace(template[0][0]+bootstrapTag,template[0][1]);
  assert.notEqual(unpatched,html,a.id+': unwrap the actual generated runtime slot');
  assert.equal(appFragment(reader.patchArticleHTML(unpatched,route)),appFragment(unpatched),a.id+': APP_START through APP_END bytes are preserved');
  assert.equal(reader.patchArticleHTML(unpatched,route),html,a.id+': generated article uses the production patch');
  // Compare against a fresh canonical render too, rather than trusting two copies
  // of a potentially stale generated fragment.
  Object.assign(original.context.location,{pathname:route,search:'',hash:''});original.context.probeId=a.id;
  vm.runInContext('articlePage(articleById(probeId))',original.context);
  original.context.fragment='<div id="app" data-static-path="'+route+'" data-static-version="'+reader.version+'" data-static-article="'+a.id+'">'+original.sink.innerHTML+'</div>';
  assert.equal(appFragment(html),vm.runInContext('cleanInternalHTML(fragment)',original.context),a.id+': published reading surface equals the final canonical render');
  if(a.id==='position-encoding'){
   const fragment=appFragment(html);
   assert(fragment.includes('id="sinusoidal-position-pairs"'));
   assert(fragment.includes('<fieldset class="pe-controls" disabled>'));
   assert(fragment.includes('[0.8415, 0.5403]'));
   assert(fragment.includes(vm.runInContext('sinusoidalPositionGraphic(4,0,1)',original.context)));
  }
  anchors+=[...appFragment(html).matchAll(/\bid="([^"]+)"/g)].length;articles++;
 }
 const indices=fs.readdirSync(dist,{recursive:true}).filter(file=>file.endsWith('index.html'));
 assert.equal(indices.length,inventory.html,'reviewed root generated route inventory');
 for(const file of indices){
  if(file.startsWith('article/'))continue;
  const html=read('dist/'+file),route=file==='index.html'?'/':'/'+file.slice(0,-10);
  assertEarlyFigures(html,file);
  assert(!html.includes('id="reader-full-runtime"'),file+': non-article keeps the complete runtime');
  assert.deepStrictEqual(scriptTags(withoutTemplates(html)).map(m=>m[1]),legacy,file+': nine active complete scripts');
  assert.equal(reader.patchArticleHTML(html,route),html,file+': non-article HTML is unchanged by the reader patch');otherPages++;
 }
 assert.equal(articles,inventory.chapters);
 return {articles,anchors,otherPages,legacy};
}

async function checkBootstrap(reader,legacy){
 let bootCases=0;
 async function fixture(test){
  const base=test.base||'/',route=test.route||'/article/agent-runtime/',requested=[],appended=[],attrs={'data-site-ready':'true'},listeners=new Map(),banners=[];
  const markers={'data-static-path':test.markerPath===undefined?route:test.markerPath,'data-static-version':test.version===undefined?reader.version:test.version,'data-static-article':test.id===undefined?'agent-runtime':test.id};
  const makeNode=tag=>({tag,children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(...children){this.children.push(...children);}});
  const ctx={location:{pathname:base==='/'?route:base.slice(0,-1)+route,reload(){}},window:{addEventListener:(type,handler)=>listeners.set(type,handler)},
   fetch(){throw Error('bootstrap must not fetch an index');},
   document:{documentElement:{setAttribute:(key,value)=>attrs[key]=value,removeAttribute:key=>delete attrs[key]},getElementById:id=>banners.find(node=>node.id===id)||null,
    querySelector:s=>s==='base'?{getAttribute:()=>base}:s==='#app'?test.noApp?null:{getAttribute:key=>markers[key]}:s==='.doc-layout .article'?test.noArticle?null:{}:s==='[data-field-map]'?test.fieldMap?{}:null:s==='#reader-full-runtime'?test.noTemplate?null:{content:{querySelectorAll:()=>legacy.slice(0,test.templateCount===undefined?9:test.templateCount).map(src=>({getAttribute:()=>src}))}}:null,
    createElement:makeNode,body:{append:node=>banners.push(node)},head:{appendChild:script=>{requested.push(script.src);appended.push(script);if(script.src.includes('reader-runtime.'))return;queueMicrotask(()=>test.fullError?script.onerror?.(Error('asset failed')):script.onload?.());}}}};
  vm.createContext(ctx);vm.runInContext(reader.bootstrap,ctx,{filename:'reader-bootstrap.js'});
  if(test.lightError){assert.equal(requested.length,1);appended[0].onerror(Error('light asset failed'));}
  if(test.explicitFallback)listeners.get('reader-full-runtime')({detail:{reason:'static hydration identity rejected'}});
  await new Promise(resolve=>setImmediate(resolve));
  return {requested,attrs,banners,listeners,ctx};
 }
 const tests=[
  {name:'canonical article',want:1},
  {name:'Pages article',base:'/infra-guide/',want:1},
  {name:'track alias',route:'/track/agent/',want:9},
  {name:'ordinary route',route:'/outline/',want:9},
  {name:'unknown article',route:'/article/not-in-the-course/',want:9},
  {name:'noncanonical slash',route:'/article/agent-runtime',want:9},
  {name:'stale version',version:'previous-release',want:9},
  {name:'missing version',version:null,want:9},
  {name:'wrong identity',id:'agent-memory',want:9},
  {name:'missing identity',id:null,want:9},
  {name:'wrong path',markerPath:'/article/agent-memory/',want:9},
  {name:'missing app',noApp:true,want:9},
  {name:'missing article surface',noArticle:true,want:9},
  {name:'unsupported field widget',fieldMap:true,want:9},
  {name:'Pages stale version',base:'/infra-guide/',version:'previous-release',want:9},
  {name:'light asset error',lightError:true,want:10},
  {name:'explicit hydration fallback',explicitFallback:true,want:10},
  {name:'missing fallback template',version:'previous-release',noTemplate:true,want:0,failed:true},
  {name:'incomplete fallback template',version:'previous-release',templateCount:8,want:0,failed:true},
  {name:'fallback asset error',version:'previous-release',fullError:true,want:1,failed:true}
 ];
 for(const test of tests){
  const f=await fixture(test);assert.equal(f.requested.length,test.want,test.name+': request decision');
  assert(!f.requested.some(url=>url.includes('search-index')),test.name+': no eager index');
  if(test.want===1&&!test.failed){
   assert.deepStrictEqual(f.requested,[(test.base?test.base.slice(0,-1):'')+reader.runtimeAsset.url],test.name+': light asset path');
   assert.equal(f.banners.length,0);
  }else{
   assert.equal(f.attrs['data-reader-runtime'],'full',test.name+': full fallback mode');
   assert(!Object.hasOwn(f.attrs,'data-site-ready'),test.name+': fallback clears stale ready state before loading complete scripts');
   if(!test.failed)assert.deepStrictEqual(f.requested.slice(test.lightError||test.explicitFallback?1:0),legacy,test.name+': sequential complete-script requests');
   f.listeners.get('reader-full-runtime')({detail:{reason:'duplicate'}});await new Promise(resolve=>setImmediate(resolve));
   assert.equal(f.requested.length,test.want,test.name+': fallback is idempotent');
  }
  if(test.failed){assert.equal(f.banners.length,1,test.name+': controlled failure banner');assert.equal(f.banners[0].attrs.role,'status');assert(f.attrs['data-reader-fallback'].includes('重新载入'));}
  bootCases++;
 }
 return bootCases;
}

async function main(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'infraguide-article-reader-'));
 try{
  const originals=new Map([['/',makeVM('/')],['/infra-guide/',makeVM('/infra-guide/')]]),canonical=originals.get('/').context;
  const version=vm.runInContext('staticReadingVersion',canonical);
  const reader=buildReader({context:canonical,staticReadingVersion:version,root,readSource:read,assetDirectory:path.join(temp,'reader-assets'),assetPublicPath:'/reader-assets/'});
  assertMetadata(reader.metadata,canonical);checkManifest(reader,canonical);
  for(const asset of [reader.bootstrapAsset,reader.runtimeAsset,reader.searchAsset])assert(fs.readFileSync(path.join(temp,'reader-assets',path.basename(asset.file))).equals(fs.readFileSync(path.join(dist,asset.file))),asset.file+': production and temporary assets are byte-identical');
  const lightScript=probeRuntime(reader);
  lightVM(lightScript,'/infra-guide/','full');
  const navigation=checkNavigation(reader,lightScript,originals);
  const ranking=checkRankingAndMath(reader,lightScript,canonical);
  const lazy=await checkLazySearch(reader,lightScript,fs.readFileSync(path.join(temp,'reader-assets',path.basename(reader.searchAsset.file))));
  await checkExternalFallback(lightScript,fs.readFileSync(path.join(temp,'reader-assets',path.basename(reader.searchAsset.file))));
  const html=checkPublishedHTML(reader,originals.get('/'));
  const bootstrapCases=await checkBootstrap(reader,html.legacy);
  console.log('PASS: '+files.length+' final canonical sources; 3 reader assets and manifest byte-identical; '+reader.index.length+' complete search entries / '+ranking.searchCases+' full rankings; '+navigation.navCases+' article/role/base navigation cases, '+navigation.contextCases+' context cases, '+navigation.redirectCases+' redirects; '+ranking.mathCases+' shared mathematical cases; '+html.articles+' unchanged full static articles / '+html.anchors+' anchors, '+html.otherPages+' complete-runtime routes; '+bootstrapCases+' bootstrap decisions, external fallback releases both listener groups/property handlers/pending search, lazy shared fetch/latest query/'+lazy.retryCases+' retries, no eager index. VM bootstrap decisions do not prove final browser fallback execution or UI state.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
