/* Build-time adapter over the site's final VM state. No Git, runtime content replay, or external packages. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {buildSearchData,routingGrams,routingBucket,restoreSearchEntry}=require('./search-data.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function buildReader({context,staticReadingVersion,root,readSource,assetDirectory,assetPublicPath='/reader-assets/'}){
 if(!context||!vm.isContext(context))throw Error('Pass the final render-pages VM context');
 if(!/^[a-f0-9]{64}$/.test(staticReadingVersion||''))throw Error('Pass the current staticReadingVersion');
 if(!assetDirectory||!/^\/[A-Za-z0-9_/-]+\/$/.test(assetPublicPath)||assetPublicPath.includes('..'))throw Error('Pass an assetDirectory and canonical root public path');
 readSource=readSource||(file=>fs.readFileSync(path.join(root,file),'utf8'));
 const own=file=>fs.readFileSync(path.join(__dirname,file),'utf8');
 const json=expression=>JSON.parse(vm.runInContext('JSON.stringify('+expression+')',context));
 const version=staticReadingVersion,index=json('buildSiteSearchIndex()');
 const metadata=json(`({articles:articles.map(({id,module,number,title,group})=>({id,module,number,title,...(group===undefined?{}:{group})})),modules:modules.map(({id,n,name,track})=>({id,n,name,track})),trackDefinitions:Object.fromEntries(Object.entries(trackDefinitions).map(([k,{label,modules,start}])=>[k,{label,modules,start}])),courseReadingStages,learningProfiles:Object.fromEntries(Object.entries(learningProfiles).map(([k,p])=>[k,{track:p.track,label:p.label,targets:p.targets,route:learningProfileRoute(p)}])),conceptDirectoryTitles,conceptDirectoryGroups,trainingDirectoryGroupTitles,quantizationLegacyAnchors,legacyTrackKnowledgeAnchors,attentionValidation:{report:{attention:attentionValidation.report.attention}}})`);
 const trackEntries=Object.fromEntries(Object.entries(metadata.trackDefinitions).map(([key,{start}])=>['/track/'+key+'/',start]));
 const provenance=[];
 function fn(name){const code=vm.runInContext(name+'.toString()',context);provenance.push({name,sha256:hash(code)});return 'const '+name+'='+code+';\n';}
 function asset(stem,extension,body){
  const sha256=hash(body),name=stem+'.'+sha256.slice(0,12)+'.'+extension,url=assetPublicPath+name,file=url.slice(1);
  fs.mkdirSync(assetDirectory,{recursive:true});const target=path.join(assetDirectory,name);
  // Retain earlier published hashes. Never clear the asset directory during a build.
  if(!fs.existsSync(target))fs.writeFileSync(target,body);else if(hash(fs.readFileSync(target))!==sha256)throw Error('Content hash collision: '+name);
  return {file,url,bytes:Buffer.byteLength(body),sha256};
 }
 const names=['hostedPath','documentPathname','publicRoute','readerInternalHref','cleanInternalHTML','normalizeInternalLinks','initReaderActions','chapterDirectoryTitle','courseDirectoryEntries','chapterReadingContext','chapterReadingNav','selectedLearningProfile','learningProfilePriority','readingArticleURL','learningGoalChapterNav','learningContextHref','practiceArticleForContext','sidebarView','courseRedirectFor','legacySectionTarget','restoreDocumentFragment','hydrateStaticArticle','initInteractive','attentionExample','initAttentionDemo','sloCalculation','kvCalculation','sinusoidalPositionPair','sinusoidalPositionGraphic','sinusoidalPositionReading','sinusoidalPositionOptions','initSinusoidalPositionDemo','initSystemInteractive','readStore','writeStore','toast'];
 const searchFunctions=['searchPlainText','normalizeSearchText','searchFind','searchContains','siteSearchExcerpt','rankSiteSearch','siteSearchHighlight'];
 const suggestions=json("rankSiteSearch('').map(({id,type,titleText,desc,module,number,path,anchor})=>({id,type,titleText,desc,module,number,path,anchor}))");
 const {catalogAsset:searchCatalogAsset,routeAssets:searchRouteAssets,shardAssets:searchShardAssets,suggestions:searchSuggestions,knowledgeCount:searchKnowledgeCount}=
  buildSearchData({index,normalizeSearchText:vm.runInContext('normalizeSearchText',context),asset,version,suggestions});
 const app=readSource('dist/app.js'),start=app.indexOf("$('#search-open').onclick"),end=app.indexOf('function followCourseRedirect');
 if(start<0||end<=start)throw Error('Full app event boundaries changed');
 let glue=app.slice(start,end);
 const filterBranch="const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;renderModuleGrid()}";
 if(!glue.includes(filterBranch))throw Error('Full app event structure changed');
 glue=glue.replace(filterBranch,'').replaceAll("$('#search-input').addEventListener(","listen($('#search-input'),").replaceAll("$('#search-dialog').addEventListener(","listen($('#search-dialog'),").replaceAll('document.addEventListener(','listen(document,');
 const searchAcquisition='(siteSearchCache||(siteSearchCache=buildSiteSearchIndex()))';
 const rankOriginal=fn('rankSiteSearch');
 if(!rankOriginal.includes(searchAcquisition))throw Error('Ranking acquisition boundary changed');
 const runtime=[
  '(function(){\n\'use strict\';\n','const staticReadingVersion='+JSON.stringify(version)+';\n',
  Object.entries(metadata).map(([name,value])=>'const '+name+'='+JSON.stringify(value)+';\n').join(''),
  "const infraBasePath=document.querySelector('base')?.getAttribute('href')||'/';\n",
  "const $=s=>document.querySelector(s);\nconst articleById=id=>articles.find(a=>a.id===id);\nconst moduleFor=id=>modules.find(m=>m.id===id);\nconst articleURL=id=>hostedPath('/article/'+id+'/');\nconst sidebar=(moduleId,current)=>sidebarView(moduleId,current);\n",
  fn('escapeHTML'),fn('trainingEscape'),
  "// Sharing keeps the canonical deployment origin and project prefix, including in local preview.\nconst publicSiteOrigin=(()=>{try{const canonical=new URL(document.querySelector('link[rel=canonical]').href);return canonical.origin+canonical.pathname.replace(/\\/(?:article|track)\\/[^/]+\\/?$/,'').replace(/\\/$/,'')}catch{return location.origin}})();\n",
  names.map(fn).join(''),"const learningProfileRoute=profile=>profile.route;\n",
  "let progress=readStore('cloudinfra-progress',{});if(!progress||typeof progress!=='object'||Array.isArray(progress))progress={};\nlet checks=readStore('cloudinfra-checks',{});if(!checks||typeof checks!=='object'||Array.isArray(checks))checks={};\nlet searchIndex=-1,searchItems=[],toastTimer,currentPath='';\nconst ordered=modules.flatMap(m=>articles.filter(a=>a.module===m.id));\n",
  readSource('dist/reading-comfort.js'),
  "// Module field-map widgets are explicitly unsupported on the article path.\nfunction initFieldConceptMaps(){if(document.querySelector('[data-field-map]'))throw Error('unsupported article field map');}\n",
  searchFunctions.map(name=>name==='rankSiteSearch'?rankOriginal.replace(searchAcquisition,"(()=>{throw Error('pass search candidates explicitly')})()"):fn(name)).join(''),
  [routingGrams,routingBucket,restoreSearchEntry].map(f=>f.toString()).join('\n'),
  fn('clearSearchSelection'),fn('renderSearch'),own('reader-glue.js')
   .replace('__SEARCH_CATALOG__',JSON.stringify({url:searchCatalogAsset.url,sha256:searchCatalogAsset.sha256}))
   .replace('__SEARCH_SUGGESTIONS__',JSON.stringify(searchSuggestions)).replace('__SEARCH_KNOWLEDGE_COUNT__',String(searchKnowledgeCount)),
  vm.runInContext('openSearch.toString()',context)+'\n','function bindApplicationEvents(){\n'+glue+'\n}\n',fn('followCourseRedirect'),own('reader-startup.js'),'\n})();\n'
 ].join('\n');
 new vm.Script(runtime,{filename:'reader-runtime.js'});const runtimeAsset=asset('reader-runtime','js',runtime);
 const bootstrap=own('reader-bootstrap.js').replace('__VERSION__',JSON.stringify(version)).replace('__RUNTIME_URL__',JSON.stringify(runtimeAsset.url)).replace('__ARTICLE_IDS__',JSON.stringify(metadata.articles.map(a=>a.id))).replace('__TRACK_ENTRIES__',JSON.stringify(trackEntries));
 new vm.Script(bootstrap,{filename:'reader-bootstrap.js'});const bootstrapAsset=asset('reader-bootstrap','js',bootstrap);
 function patchArticleHTML(html,route,{runtimeTags}={}){
  const id=route.match(/^\/article\/([a-z0-9-]+)\/$/)?.[1]||trackEntries[route];
  if(!id)return html; // Collections and dynamic practice routes keep the complete runtime.
  if(!metadata.articles.some(a=>a.id===id))throw Error('Unknown canonical article '+id);
  if(html.includes('id="reader-full-runtime"'))throw Error('Article already patched');
  runtimeTags=runtimeTags||[...html.matchAll(/<script defer src="(?:runtime-0[1-6]|reading-comfort|site-search|app)\.js[^\"]*"><\/script>/g)].map(m=>m[0]);
  if(runtimeTags.length!==9||runtimeTags.some(tag=>!html.includes(tag)))throw Error(id+': expected the final nine complete runtime tags');
  const before=html.match(/<!-- APP_START -->([\s\S]*?)<!-- APP_END -->/)?.[1];
  if(!before)throw Error(id+': missing full static article');
  html=html.replace(runtimeTags[0],'<!-- READER_RUNTIME_SLOT -->');for(const tag of runtimeTags.slice(1))html=html.replace(tag,'');
  html=html.replace('<!-- READER_RUNTIME_SLOT -->','<template id="reader-full-runtime">'+runtimeTags.join('')+'</template><script defer src="'+bootstrapAsset.url+'"></script>');
  if(html.match(/<!-- APP_START -->([\s\S]*?)<!-- APP_END -->/)?.[1]!==before)throw Error(id+': static surface changed');
  return html;
 }
 return {metadata,index,version,provenance,runtime,bootstrap,searchCatalogAsset,searchRouteAssets,searchShardAssets,searchSuggestions,searchKnowledgeCount,
  runtimeAsset,bootstrapAsset,patchArticleHTML,initialReaderJSBytes:bootstrapAsset.bytes+runtimeAsset.bytes};
}
module.exports={buildReader};
