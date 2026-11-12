// Routing only rules out shards. Every remaining entry uses the shared ranker.
const readerAbort=new AbortController();
const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:readerAbort.signal});
const searchCatalog=__SEARCH_CATALOG__,searchSuggestions=__SEARCH_SUGGESTIONS__,searchKnowledgeCount=__SEARCH_KNOWLEDGE_COUNT__;
const searchAssetCache=new Map();
let latestSearchQuery='',searchGeneration=0;

function loadSearchAsset(asset,kind,shardCount){
 if(!searchAssetCache.has(asset.url)){
  const pending=(async()=>{
   const response=await fetch(hostedPath(asset.url),{credentials:'same-origin',signal:readerAbort.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   const bytes=await response.arrayBuffer();
   if(globalThis.crypto?.subtle){
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(digest!==asset.sha256)throw Error('搜索分片校验失败');
   }
   const payload=JSON.parse(new TextDecoder().decode(bytes));
   if(payload.schema!==2||payload.kind!==kind)throw Error('搜索格式不匹配');
   if(kind==='catalog'){
    const valid=row=>/^\/(?!\/)[a-z0-9_/-]+\.[a-f0-9]{12}\.json$/i.test(row?.url)&&/^[a-f0-9]{64}$/.test(row.sha256)&&/^[a-f0-9]{16}$/.test(row.token);
    if(payload.staticReadingVersion!==staticReadingVersion||!payload.routes?.length||!payload.shards?.length||
      !Array.isArray(payload.routes)||!Array.isArray(payload.shards)||![...payload.routes,...payload.shards].every(valid))throw Error('搜索目录版本不匹配');
    return payload;
   }
   if(payload.token!==asset.token||!Array.isArray(payload.rows))throw Error('搜索分片版本不匹配');
   if(kind==='routes'){
    const valid=row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&row[0].length>0&&row[0].length<=3&&
     Array.isArray(row[1])&&row[1].every(n=>Number.isInteger(n)&&n>=0&&n<shardCount);
    if(!payload.rows.every(valid))throw Error('搜索路由格式不匹配');
    const postings=new Map(payload.rows);
    if(postings.size!==payload.rows.length)throw Error('搜索路由格式不匹配');
    return postings;
   }
   const validRanges=ranges=>Array.isArray(ranges)&&ranges.length%2===0&&ranges.every(
    (value,index)=>Number.isSafeInteger(value)&&value>=0&&(index===0||value>ranges[index-1]));
   const validSegment=s=>s&&typeof s.heading==='string'&&typeof s.text==='string'&&
    (s.proseNorm===undefined||typeof s.proseNorm==='string')&&
    (s.proseRanges===undefined||(s.proseNorm===undefined&&validRanges(s.proseRanges)));
   const validEntry=e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.desc==='string'&&
    typeof e.path==='string'&&moduleFor(e.module)&&Number.isInteger(e.order)&&e.order>=0&&
    Array.isArray(e.segments)&&e.segments.every(validSegment);
   if(!payload.rows.every(validEntry))throw Error('搜索条目格式不匹配');
   return payload.rows.map(restoreSearchEntry);
  })().catch(error=>{searchAssetCache.delete(asset.url);throw error;});
  searchAssetCache.set(asset.url,pending);
 }
 return searchAssetCache.get(asset.url);
}
async function loadSearchCandidates(value,current=()=>true){
 const terms=[...new Set(normalizeSearchText(value).split(' ').filter(Boolean))];
 if(!terms.length)return [];
 const catalog=await loadSearchAsset(searchCatalog,'catalog');
 if(!current())return null;
 const grams=[...new Set(terms.flatMap(routingGrams))];
 const bucket=gram=>routingBucket(gram,catalog.routes.length);
 const buckets=[...new Set(grams.map(bucket))];
 const postings=new Map(await Promise.all(buckets.map(async slot=>[slot,await loadSearchAsset(catalog.routes[slot],'routes',catalog.shards.length)])));
 if(!current())return null;
 let candidates=null;
 for(const gram of grams){
  const slots=postings.get(bucket(gram)).get(gram)||[];
  const matches=new Set(slots);
  candidates=candidates===null?[...matches]:candidates.filter(slot=>matches.has(slot));
  if(!candidates.length)return [];
 }
 const rows=await Promise.all(candidates.map(slot=>loadSearchAsset(catalog.shards[slot],'entries')));
 return current()?rows.flat():null;
}
function suspendSearch(){
 searchGeneration++;latestSearchQuery='';
 clearSearchSelection();
 $('#search-status').textContent='';
 $('#search-results').innerHTML='';
}
async function search(query=''){
 if(readerAbort.signal.aborted)return;
 latestSearchQuery=query;const generation=++searchGeneration;
 const current=()=>generation===searchGeneration&&!readerAbort.signal.aborted;
 if(!normalizeSearchText(query)){
  renderSearch(query,rankSiteSearch(query,searchSuggestions),searchKnowledgeCount);
  return;
 }
 clearSearchSelection();
 $('#search-status').textContent='正在搜索相关内容…';
 $('#search-results').innerHTML='<p class="search-empty">正在查找匹配的章节、知识点和代码。</p>';
 try{
  await new Promise(resolve=>setTimeout(resolve,100));
  if(!current())return;
  const candidates=await loadSearchCandidates(query,current);
  if(current())renderSearch(latestSearchQuery,rankSiteSearch(latestSearchQuery,candidates),searchKnowledgeCount);
 }catch(error){
  if(!current())return;
  $('#search-status').textContent='搜索数据加载失败，可重试。';
  $('#search-results').innerHTML='<button type="button" class="btn secondary" data-search-retry>重试搜索</button>';
  listen($('#search-results').querySelector('[data-search-retry]'),'click',()=>{if(current())search($('#search-input').value);},{once:true});
 }
}
