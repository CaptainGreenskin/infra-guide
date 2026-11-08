// Only the data acquisition boundary differs. Ranking and result rendering stay shared.
const readerAbort=new AbortController();
const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...options,signal:readerAbort.signal});
const searchURL=__SEARCH_URL__,searchDigest=__SEARCH_DIGEST__;
let searchPromise=null,latestSearchQuery='',searchGeneration=0;
async function loadSearchIndex(){
 if(siteSearchCache)return;
 if(!searchPromise)searchPromise=(async()=>{
  const response=await fetch(hostedPath(searchURL),{credentials:'same-origin'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const bytes=await response.arrayBuffer();
  if(globalThis.crypto?.subtle){
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(digest!==searchDigest)throw Error('搜索索引校验失败');
  }
  const payload=JSON.parse(new TextDecoder().decode(bytes));
  if(payload.schema!==1||payload.staticReadingVersion!==staticReadingVersion||!Array.isArray(payload.entries))throw Error('搜索索引版本不匹配');
  siteSearchCache=payload.entries;
 })().catch(error=>{searchPromise=null;throw error;});
 return searchPromise;
}
async function search(query=''){
 latestSearchQuery=query;const generation=++searchGeneration;
 if(siteSearchCache){renderSearch(query);return;}
 searchItems=[];searchIndex=-1;
 $('#search-input').removeAttribute('aria-activedescendant');
 $('#search-status').textContent='正在加载完整搜索索引…';
 $('#search-results').innerHTML='<p class="search-empty">输入会保留，加载后显示当前关键词的结果。</p>';
 try{await loadSearchIndex();if(generation===searchGeneration&&!readerAbort.signal.aborted)renderSearch(latestSearchQuery);}
 catch(error){
  if(generation!==searchGeneration||readerAbort.signal.aborted)return;
  $('#search-status').textContent='搜索索引加载失败，可重试。';
  $('#search-results').innerHTML='<button type="button" class="btn secondary" data-search-retry>重试搜索</button>';
  $('#search-results').querySelector('[data-search-retry]').onclick=()=>search($('#search-input').value);
 }
}
