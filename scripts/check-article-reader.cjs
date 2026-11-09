/* Node/VM equivalence checks, adapted from the reviewed reader prototype.
   Bootstrap probes observe loading decisions; they do not execute the full
   fallback in a browser. Browser forms, keyboard behavior and final fallback
   execution are verified separately through the real UI. */
'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {TextDecoder}=require('util');
const {gzipSync}=require('node:zlib');
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

class DOMEventTarget extends EventTarget{
 addEventListener(type,listener,options){
  const signal=options?.signal;
  if(!signal)return super.addEventListener(type,listener,options);
  if(signal.aborted)return;
  // Node can collect an earlier abort-removal callback when the same target
  // has several listeners. Keep each cleanup while using native dispatch.
  const listenerOptions={...options};
  delete listenerOptions.signal;
  super.addEventListener(type,listener,listenerOptions);
  signal.addEventListener('abort',()=>super.removeEventListener(type,listener,listenerOptions),{once:true});
 }
}

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
 const bridge=`globalThis.__probe={metadata:{${Object.keys(reader.metadata).join(',')}},sidebarView,learningGoalChapterNav,learningContextHref,readerInternalHref,cleanInternalHTML,chapterReadingContext,chapterReadingNav,readingArticleURL,practiceArticleForContext,learningProfileRoute,courseRedirectFor,legacySectionTarget,attentionExample,sloCalculation,kvCalculation,sinusoidalPositionPair,sinusoidalPositionGraphic,rankSiteSearch,siteSearchHighlight,search,loadSearchCandidates,suspendSearch,bindApplicationEvents,setComfortAbort:value=>comfortAbort=value,getAbortState:()=>({reader:readerAbort.signal.aborted,comfort:comfortAbort?.signal.aborted}),setProgress:value=>progress=value,getSearch:()=>({searchItems,searchIndex,latestSearchQuery,cacheSize:searchAssetCache.size}),settleSearchAssets:()=>Promise.allSettled([...searchAssetCache.values()])};return;`;
 // Keep the production external-fallback subscription. Only hydration/startup
 // itself is replaced; its actual event cleanup can then be tested separately.
 return new vm.Script(reader.runtime.replace(startup,startup.slice(0,preflight)+bridge),{filename:'reader-runtime-probe.js'});
}

function lightVM(script,base='/',runtimeMode){
 const nodes={},state={fetches:0};
 const context={URLSearchParams,URL,AbortController,TextDecoder,crypto:crypto.webcrypto,setTimeout,clearTimeout,
  location:{pathname:base,search:'',hash:'',origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},
  document:Object.assign(new DOMEventTarget(),{documentElement:{getAttribute:name=>name==='data-reader-runtime'?runtimeMode:null},querySelector:s=>s==='base'?{getAttribute:()=>base}:s==='link[rel=canonical]'?{href:'https://example.test'+base}:nodes[s]||null}),window:new DOMEventTarget(),
  fetch(){state.fetches++;throw Error('unexpected eager search request');}};
 vm.createContext(context);script.runInContext(context);
 assert.equal(state.fetches,0,'initializing the light runtime does not fetch the search index');
 if(runtimeMode==='full'){
  assert.equal(context.__probe,undefined,'light startup arriving late leaves full runtime in charge');
  return;
 }
 assert.equal(context.__probe.getSearch().cacheSize,0,'the light runtime starts without a fetched search asset');
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
 const searchLayout={schema:2,catalog:reader.searchCatalogAsset.file,routes:reader.searchRouteAssets.length,shards:reader.searchShardAssets.length};
 const expected={schema:1,staticReadingVersion:reader.version,articles:reader.metadata.articles.length,initialExecutableScripts:2,normalReaderScriptRequests:2,fullFallbackScripts:9,
  initialReaderJSBytes:reader.initialReaderJSBytes+earlyFigureBytes,initialInlineFigureBytes:earlyFigureBytes,metadataBytes:Buffer.byteLength(JSON.stringify(reader.metadata)),metadataSha256:hash(JSON.stringify(reader.metadata)),
  assets:[reader.bootstrapAsset,reader.runtimeAsset,...searchAssets(reader).map(([,asset])=>asset)],reusedFunctions:reader.provenance,searchEntries:reader.index.length,searchLayout};
 const published=JSON.parse(read('dist/reader-runtime-manifest.json'));
 assert.deepStrictEqual(published,expected,'published reader manifest matches a fresh build from the final canonical VM');
 assert(searchLayout.routes>1&&searchLayout.shards>1,'the search directory and entries are sharded');
 assert.equal(new Set(expected.assets.map(asset=>asset.url)).size,expected.assets.length,'each published reader asset has a distinct URL');
 for(const asset of expected.assets){
  const bytes=fs.readFileSync(path.join(root,'dist',asset.file));
  assert.equal(bytes.length,asset.bytes,asset.file+': published byte count');
  assert.equal(hash(bytes),asset.sha256,asset.file+': published digest');
  assert.equal(path.basename(asset.file),path.basename(asset.url));
  assert(path.basename(asset.file).includes(asset.sha256.slice(0,12)),asset.file+': content fingerprint');
 }
 assert.deepStrictEqual(reader.index,json(canonical,'buildSiteSearchIndex()'),'the full reference uses all canonical search entries and fields');
 assert.equal(reader.index.length,inventory.search);
 assert.equal(new Set(reader.index.map(e=>e.id)).size,inventory.search);
 assert.equal(reader.searchKnowledgeCount,95);
 assert.equal(reader.searchKnowledgeCount,reader.index.filter(e=>e.type==='knowledge').length);
 assert.deepStrictEqual(reader.searchSuggestions,json(canonical,'rankSiteSearch("").map(({id,type,titleText,desc,module,number,path,anchor})=>({id,type,titleText,desc,module,number,path,anchor}))'),'the six in-runtime suggestions keep their canonical presentation');
 const catalog=JSON.parse(read('dist/'+reader.searchCatalogAsset.file));
 assert.equal(catalog.schema,2);
 assert.equal(catalog.kind,'catalog');
 assert.equal(catalog.staticReadingVersion,reader.version);
 for(const [kind,list] of [['routes',reader.searchRouteAssets],['entries',reader.searchShardAssets]]){
  const descriptors=catalog[kind==='routes'?'routes':'shards'];
  assert.equal(descriptors.length,list.length,kind+' descriptors');
  for(const [i,asset] of list.entries()){
   const descriptor=descriptors[i];
   const payload=JSON.parse(read('dist/'+asset.file));
   assert.deepStrictEqual(descriptor,{url:asset.url,sha256:asset.sha256,token:payload.token});
   assert.equal(payload.schema,2);
   assert.equal(payload.kind,kind);
   assert(Array.isArray(payload.rows),asset.file+': compact leaf rows');
  }
 }
 const oldBytes=Buffer.byteLength(JSON.stringify({schema:1,staticReadingVersion:reader.version,entries:reader.index}));
 const searchBytes=searchAssets(reader).reduce((total,[,asset])=>total+asset.bytes,0);
 assert(searchBytes<oldBytes,'the full directory and compact shards are smaller than the former monolith');
 return expected;
}

function searchAssets(reader){
 return [['catalog',reader.searchCatalogAsset],...reader.searchRouteAssets.map(asset=>['routes',asset]),...reader.searchShardAssets.map(asset=>['entries',asset])];
}

function resultProjection({id,type,titleText,module,number,path,anchor,excerpt,terms,matchLabel}){
 return plain({id,type,titleText,module,number,path,anchor,excerpt,terms,matchLabel});
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

async function checkRankingAndMath(reader,lightScript,original,assets){
 const fixture=lightVM(lightScript),{p}=fixture;
 mountSearchAssets(fixture,assets);
 const expectedById=new Map(reader.index.map(entry=>[entry.id,entry])),seen=new Set();
 const queries=[...new Set(['GPU','幂等','恢复','tools/call','structuredContent','operation_id','R17','27','base10','DDP','KV Cache','etcd','LINUX','无法匹配zzzzz','４２','a b c',...reader.index.map(e=>e.titleText),
  'traceparent','Agent traceparent','SQL 索引','ＳＱＬ 索引','cpu.max','节点放置','ＴＣＰ','ＴＰ','恢','发','all_to_all_single','prefix_attention.py','__name__','C++','._+','++','流式','éhttp','<>'])];
 assert(queries.length>=190,'the reviewed corpus includes every article and knowledge title plus edge cases');
 for(const q of queries){
  original.q=q;
  const candidates=await p.loadSearchCandidates(q);
  assert(Array.isArray(candidates),q+': completed candidate load');
  assert.equal(new Set(candidates.map(entry=>entry.id)).size,candidates.length,q+': unique candidate union');
  for(const entry of candidates)if(!seen.has(entry.id)){
   assert.deepStrictEqual(plain(entry),expectedById.get(entry.id),'exact unpacking of candidate '+entry.id);
   seen.add(entry.id);
  }
  assert.deepStrictEqual(plain(p.rankSiteSearch(q,candidates)),json(original,'rankSiteSearch(q)'),'complete ranked records, tie order, excerpts and anchors: '+q);
 }
 assert.equal(seen.size,reader.index.length,'all canonical entries unpacked through the URL-bound loader');
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

function eventNode(){
 const attributes=new Map();
 return Object.assign(new DOMEventTarget(),{setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),
  getAttribute:key=>attributes.get(key),focus(){},classList:{toggle(){return false;},remove(){},add(){},contains(){return false;}}});
}

function searchNodes(nodes){
 const state={resultRenders:0},retry=eventNode();
 const input=nodes['#search-input']=Object.assign(eventNode(),{value:''});
 const status=nodes['#search-status']={textContent:''};
 const results=nodes['#search-results']={value:'',set innerHTML(value){this.value=value;if(value.includes('class="search-result"'))state.resultRenders++;},get innerHTML(){return this.value;},querySelector:selector=>selector==='[data-search-retry]'?retry:null};
 return {state,retry,input,status,results};
}

function searchClock(context){
 let now=0,serial=0;
 const timers=new Map();
 context.setTimeout=(fn,delay)=>{const id=++serial;timers.set(id,{at:now+delay,fn});return id;};
 context.clearTimeout=id=>timers.delete(id);
 return {advance(ms){
  const end=now+ms;
  while(timers.size){
   const [id,timer]=[...timers].sort(([,a],[,b])=>a.at-b.at)[0];
   if(timer.at>end)break;
   now=timer.at;timers.delete(id);timer.fn();
  }
  now=end;
 }};
}

function deferred(){
 let resolve;
 const promise=new Promise(done=>{resolve=done;});
 return {promise,resolve};
}

async function until(condition,label){
 for(let i=0;i<500&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,4));
 assert(condition(),label);
}

function response(bytes){return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}

function mountSearchAssets(fixture,assets,override){
 const base=fixture.context.document.querySelector('base').getAttribute('href'),prefix=base.slice(0,-1);
 const requests=[];
 fixture.context.fetch=async (url,options)=>{
  assert(url.startsWith(prefix+'/reader-assets/'),'same-origin reader search URL for '+base);
  const data=assets.get(url.slice(prefix.length));
  assert(data,'only generated search assets may be fetched: '+url);
  assert.equal(options.credentials,'same-origin');
  assert(options.signal instanceof AbortSignal,'search fetch participates in fallback cancellation');
  const request={...data,url,signal:options.signal};
  requests.push(request);
  return override?.(request)??response(request.bytes);
 };
 return requests;
}

function typeSearch(fixture,input,value){
 input.value=value;
 return fixture.p.search(value);
}

async function checkWireBudget(lightScript,assets){
 const budget={HPA:250000,etcd:210000,GPU:680000,'恢复':1400000},observed={};
 for(const [query,limit] of Object.entries(budget)){
  const fixture=lightVM(lightScript),requests=mountSearchAssets(fixture,assets);
  const candidates=await fixture.p.loadSearchCandidates(query);
  assert(fixture.p.rankSiteSearch(query,candidates).length,query+': budget covers a real search result');
  assert.equal(requests.filter(r=>r.kind==='catalog').length,1,query+': one catalog request');
  observed[query]=requests.reduce((total,r)=>total+gzipSync(r.bytes).length,0);
  assert(observed[query]<limit,query+': cold gzip bytes '+observed[query]+' exceeds '+limit);
 }
 return observed;
}

async function checkLazySearch(reader,lightScript,assets){
 const lazy=lightVM(lightScript,'/infra-guide/'),{state,input,status,results}=searchNodes(lazy.nodes),clock=searchClock(lazy.context);
 const catalog=deferred();
 const requests=mountSearchAssets(lazy,assets,request=>request.kind==='catalog'?catalog.promise:undefined);
 for(const q of ['', '  ']){
  const pending=typeSearch(lazy,input,q);
  assert.deepStrictEqual(Array.from(lazy.p.getSearch().searchItems,resultProjection),Array.from(lazy.p.rankSiteSearch(q,reader.index).slice(0,24),resultProjection),'blank suggestions render synchronously');
  assert(status.textContent.includes('95个知识点'),'suggestions use the global knowledge count');
  await pending;
 }
 await typeSearch(lazy,input,'<>');
 assert.equal(status.textContent,'没有找到匹配内容。');
 clock.advance(100);
 assert.equal(requests.length,0,'blank and punctuation-only input never fetch');
 await typeSearch(lazy,input,'');
 const rendersBefore=state.resultRenders;
 const first=typeSearch(lazy,input,'GPU');
 assert.equal(lazy.p.getSearch().searchItems.length,0,'new input immediately clears stale selection');
 assert(!results.innerHTML.includes('class="search-result"'),'old links are removed while waiting');
 assert.equal(status.textContent,'正在搜索相关内容…');
 clock.advance(99);
 const second=typeSearch(lazy,input,'幂等');
 clock.advance(99);
 assert.equal(requests.length,0,'the last input gets its own 100 ms debounce window');
 clock.advance(1);
 await until(()=>requests.length===1,'a debounced input starts the catalog request');
 assert.equal(requests[0].kind,'catalog');
 assert.equal(requests[0].url,'/infra-guide'+reader.searchCatalogAsset.url,'all search assets use the Pages base');
 const finalQuery='prefix_attention.py';
 const third=typeSearch(lazy,input,finalQuery);
 clock.advance(100);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,1,'queries share one pending catalog request');
 catalog.resolve(response(requests[0].bytes));
 await Promise.all([first,second,third]);
 const expected=plain(lazy.p.rankSiteSearch(finalQuery,reader.index).slice(0,24));
 assert(expected.length,finalQuery+': fixture has real search results');
 assert.deepStrictEqual(plain(lazy.p.getSearch().searchItems),expected);
 assert.equal(lazy.p.getSearch().latestSearchQuery,finalQuery);
 assert.equal(input.value,finalQuery,'loading preserves typed input');
 assert.equal(state.resultRenders,rendersBefore+1,'only the latest pending query renders results');
 const cold=lightVM(lightScript,'/infra-guide/'),coldRequests=mountSearchAssets(cold,assets);
 await cold.p.loadSearchCandidates(finalQuery);
 assert.deepStrictEqual(requests.map(r=>r.url),coldRequests.map(r=>r.url),'superseded catalog wait starts no old route or entry fetches');
 const entryReads=requests.filter(r=>r.kind==='entries').length;
 assert(entryReads>0&&entryReads<reader.searchShardAssets.length,'a specific code identifier transfers only candidate entry shards');
 const repeat=typeSearch(lazy,input,finalQuery);clock.advance(100);await repeat;
 assert.equal(requests.length,coldRequests.length,'loaded catalog, route and entry shards are reused');

 const delayed=lightVM(lightScript),route=deferred();
 let current=true,held;
 const delayedRequests=mountSearchAssets(delayed,assets,request=>{
  if(request.kind==='routes'&&!held){held=request;return route.promise;}
 });
 const cancelled=delayed.p.loadSearchCandidates(finalQuery,()=>current);
 await until(()=>held,'the first route response can be delayed');
 current=false;route.resolve(response(held.bytes));
 assert.equal(await cancelled,null,'superseded route lookup returns no candidate result');
 assert(!delayedRequests.some(r=>r.kind==='entries'),'superseded route lookup starts no entry downloads');

 const failures=[
  {name:'network',kind:'catalog',fail:()=>{throw Error('network');}},
  {name:'HTTP',kind:'catalog',fail:()=>({ok:false,status:503})},
  {name:'digest',kind:'catalog',fail:()=>response(Buffer.from('{}'))},
  {name:'version',kind:'catalog',noCrypto:true,mutate:payload=>{payload.staticReadingVersion='previous-release';}},
  {name:'route token',kind:'routes',noCrypto:true,mutate:payload=>{payload.token='0000000000000000';}},
  {name:'out-of-range HPA posting',kind:'routes',query:'HPA',noCrypto:true,mutate:payload=>{
   const posting=payload.rows.find(([gram])=>gram==='hpa');
   assert(posting,'HPA must have a real route posting');
   posting[1]=[999]; // Keep the advertised leaf token so posting validation must reject it.
  }},
  {name:'entry token',kind:'entries',noCrypto:true,mutate:payload=>{payload.token='0000000000000000';}}
 ];
 for(const test of failures){
  const f=lightVM(lightScript),{input,status,retry,results}=searchNodes(f.nodes),clock=searchClock(f.context);
  if(test.noCrypto)f.context.crypto=undefined;
  let failed;
  const attempted=mountSearchAssets(f,assets,request=>{
   if(request.kind!==test.kind||failed)return;
   failed=request;
   if(test.fail)return test.fail();
   const payload=JSON.parse(request.bytes);
   test.mutate(payload);
   return response(Buffer.from(JSON.stringify(payload)));
  });
  const initialQuery=test.query??finalQuery;
  const initial=typeSearch(f,input,initialQuery);
  clock.advance(100);await initial;
  assert(failed,test.name+': directed bad response reached the loader');
  assert.equal(input.value,initialQuery,test.name+': preserve input on failure');
  assert(status.textContent.includes('重试'),test.name+': actionable retry');
  assert(results.innerHTML.includes('data-search-retry'),test.name+': expose the retry control');
  assert.equal(f.p.getSearch().searchItems.length,0,test.name+': unusable assets do not render results');
  const retryQuery=test.kind==='catalog'?'幂等':initialQuery;
  input.value=retryQuery;
  retry.dispatchEvent(new Event('click'));
  clock.advance(100);
  await until(()=>f.p.getSearch().searchItems.length>0,test.name+': actual retry event renders results');
  assert.deepStrictEqual(plain(f.p.getSearch().searchItems),plain(f.p.rankSiteSearch(retryQuery,reader.index).slice(0,24)),test.name+': retry uses current input');
  assert.equal(attempted.filter(r=>r.url===failed.url).length,2,test.name+': clear and retry the failed cached request');
  assert.equal(new Set(attempted.map(r=>r.url)).size,attempted.length-1,test.name+': other assets are reused');
 }
 return {retryCases:failures.length,wire:await checkWireBudget(lightScript,assets)};
}

async function checkExternalFallback(lightScript,assets){
 const f=lightVM(lightScript),{state,input,results}=searchNodes(f.nodes),clock=searchClock(f.context);
 const controls=['#search-open','#search-close','#theme','#mobile-menu','.skip'],calls={opened:0,closed:0,comfort:0,navigated:0};
 for(const selector of controls)f.nodes[selector]=eventNode();
 const dialog=f.nodes['#search-dialog']=Object.assign(eventNode(),{open:false,showModal(){this.open=true;calls.opened++;},
  close(){this.open=false;calls.closed++;this.dispatchEvent(new Event('close'));}});
 f.nodes['.top-nav']=eventNode();f.nodes['#main']=eventNode();
 f.context.document.documentElement={classList:eventNode().classList};
 f.context.location.assign=()=>calls.navigated++;
 const entry=deferred();
 let held;
 const requests=mountSearchAssets(f,assets,request=>{
  if(request.kind==='entries'&&!held){held=request;return entry.promise;}
 });
 f.p.bindApplicationEvents();
 assert(controls.every(selector=>typeof f.nodes[selector].onclick==='function'),'actual application property handlers are bound');
 const comfortController=new AbortController(),comfortTarget=new EventTarget();
 f.p.setComfortAbort(comfortController);
 comfortTarget.addEventListener('input',()=>calls.comfort++,{signal:comfortController.signal});
 comfortTarget.dispatchEvent(new Event('input'));assert.equal(calls.comfort,1);
 const shortcut=()=>Object.assign(new Event('keydown',{cancelable:true}),{key:'k',ctrlKey:true,metaKey:false});
 f.context.document.dispatchEvent(shortcut());
 assert.equal(calls.opened,1,'real EventTarget dispatch reaches the actual Ctrl+K listener');
 assert.equal(f.p.getSearch().searchItems.length,6,'opening shows suggestions');
 assert.equal(requests.length,0,'opening the dialog does not request search data');

 input.dispatchEvent(new Event('compositionstart'));
 input.value='恢';
 input.dispatchEvent(Object.assign(new Event('input'),{isComposing:true}));
 input.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key:'Enter',isComposing:true,keyCode:229}));
 clock.advance(100);
 assert.equal(requests.length,0,'Chinese IME composition does not start a partial query');
 assert.equal(calls.navigated,0,'IME Enter cannot follow a stale suggestion');
 input.value='prefix_attention.py';
 input.dispatchEvent(new Event('compositionend'));
 clock.advance(100);
 await until(()=>held,'the committed query reaches an entry request');
 assert.deepStrictEqual(plain(f.p.getAbortState()),{reader:false,comfort:false});
 assert.equal(f.p.getSearch().searchItems.length,0,'results stay cleared while an entry is pending');
 const renders=state.resultRenders,requestCount=requests.length;
 // Dispatch externally: this is the late-fallback path initiated by bootstrap.
 f.context.window.dispatchEvent(new Event('reader-full-runtime'));
 assert.deepStrictEqual(plain(f.p.getAbortState()),{reader:true,comfort:true},'external fallback aborts both reader listener groups');
 assert(held.signal.aborted,'fallback aborts the active search request signal');
 assert(controls.every(selector=>f.nodes[selector].onclick===null),'external fallback clears every application property handler');
 assert.equal(dialog.open,false);assert.equal(calls.closed,1,'fallback closes the active search dialog');
 assert.equal(input.getAttribute('aria-expanded'),'false');
 assert.equal(results.innerHTML,'','fallback clears any remaining search presentation');
 f.context.document.dispatchEvent(shortcut());comfortTarget.dispatchEvent(new Event('input'));
 assert.equal(calls.opened,1,'the released Ctrl+K listener cannot reopen the dialog');
 assert.equal(calls.closed,1,'fallback closes the dialog exactly once');
 assert.equal(calls.comfort,1,'the released comfort listener no longer handles input');
 entry.resolve(response(held.bytes));
 await f.p.settleSearchAssets();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(state.resultRenders,renders,'a late entry response cannot render after release');
 assert.equal(requests.length,requestCount,'fallback cleanup starts no new search request');
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
  assert(!f.requested.some(url=>searchAssets(reader).some(([,asset])=>url.endsWith(asset.url))),test.name+': no eager search asset');
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
  assertMetadata(reader.metadata,canonical);const manifest=checkManifest(reader,canonical);
  const temporaryBytes=asset=>fs.readFileSync(path.join(temp,'reader-assets',path.basename(asset.file)));
  for(const asset of manifest.assets)assert(temporaryBytes(asset).equals(fs.readFileSync(path.join(dist,asset.file))),asset.file+': production and temporary assets are byte-identical');
  const assets=new Map(searchAssets(reader).map(([kind,asset])=>[asset.url,{kind,bytes:temporaryBytes(asset)}]));
  const lightScript=probeRuntime(reader);
  lightVM(lightScript,'/infra-guide/','full');
  const navigation=checkNavigation(reader,lightScript,originals);
  const ranking=await checkRankingAndMath(reader,lightScript,canonical,assets);
  const lazy=await checkLazySearch(reader,lightScript,assets);
  await checkExternalFallback(lightScript,assets);
  const html=checkPublishedHTML(reader,originals.get('/'));
  const bootstrapCases=await checkBootstrap(reader,html.legacy);
  console.log('PASS: '+files.length+' final canonical sources; '+manifest.assets.length+' reader assets and manifest byte-identical; '+reader.index.length+' complete search entries / '+ranking.searchCases+' exact full rankings through the loader; '+navigation.navCases+' article/role/base navigation cases, '+navigation.contextCases+' context cases, '+navigation.redirectCases+' redirects; '+ranking.mathCases+' shared mathematical cases; '+html.articles+' unchanged full static articles / '+html.anchors+' anchors, '+html.otherPages+' complete-runtime routes; '+bootstrapCases+' bootstrap decisions, external fallback closes the dialog and releases listeners/pending search; zero-fetch suggestions, IME, latest query, '+lazy.retryCases+' retries. Cold gzip bytes from mock-fetched asset bodies: '+JSON.stringify(lazy.wire)+'. VM checks do not prove final browser fallback execution or UI state.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
