/* Static HTML from the same trusted content/render functions used by the browser.
   The small DOM sink only captures renderer output; it is not browser automation. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
require('./embed-manual-sharding.cjs');
require('./embed-cloud-proxy-bridge.cjs')();
require('./embed-inference-cache-bridge.cjs');
const practiceEvidence = {};
for (const lab of ['network-timing', 'permissions', 'interview-database', 'textbooks']) {
 const recordPath = path.join(dist, 'labs', lab, 'validation.json');
 practiceEvidence[lab] = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
}
fs.writeFileSync(path.join(dist, 'practice-evidence.js'), 'const practiceEvidence = '+JSON.stringify(practiceEvidence)+';\n');
const diagramHeights={},diagramWidths={};
for(const file of fs.readdirSync(path.join(dist,'diagrams')).filter(x=>x.endsWith('.svg')).sort()){
 const v=fs.readFileSync(path.join(dist,'diagrams',file),'utf8').match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
 if(v){const name=file.slice(0,-4);diagramWidths[name]=Number(v[1]);diagramHeights[name]=Number(v[2]);}
}
fs.writeFileSync(path.join(dist,'diagram-sizes.js'),'const diagramHeights='+JSON.stringify(diagramHeights)+';\nconst diagramWidths='+JSON.stringify(diagramWidths)+';\n');
const shell=fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8');
const scripts=[...shell.matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1]);
const runtimeShell=require('./build-runtime.cjs').buildRuntime(shell,dist).shell;
// Returning readers must receive the matching scripts and styles for this HTML.
const versionedShell = runtimeShell.replace(/(src|href)="([A-Za-z0-9_-]+\.(?:js|css))"/g, (_, attribute, filename) => {
 const bytes = fs.readFileSync(path.join(dist, filename));
 const digest = require('crypto').createHash('sha256').update(bytes).digest('hex').slice(0, 12);
 return attribute+'="'+filename+'?v='+digest+'"';
});
const sink={innerHTML:''},grid={innerHTML:''};
const noop=()=>{};
const stub={addEventListener:noop,setAttribute:noop,focus:noop,close:noop,showModal:noop,classList:{toggle:noop,remove:noop,add:noop}};
const document={title:'',documentElement:{classList:{toggle:noop}},addEventListener:noop,querySelectorAll:()=>[],getElementById:()=>null,
 querySelector:s=>s==='#app'?sink:s==='#module-grid'?grid:['#search-dialog','#search-open','#search-close','#search-input','#theme','#mobile-menu','#main','.top-nav','.skip'].includes(s)?stub:null};
const context={document,window:{addEventListener:noop,scrollTo:noop},location:{pathname:'/',search:'',hash:'',replace:noop},history:{},localStorage:{getItem:()=>null},URLSearchParams,requestAnimationFrame:noop,IntersectionObserver:class{observe(){}disconnect(){}}};
vm.createContext(context);
for(const file of scripts)vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
const data=vm.runInContext('({articles,modules,sources,trackDefinitions,publicSiteOrigin,interviewUnits,learningProfiles})',context);
fs.writeFileSync(path.join(root,'docs/CHAPTER_REVIEW_2026-11-04.json'),JSON.stringify({date:'2026-11-04',status:'reviewed_and_revised',chapters:vm.runInContext('chapterReadingEdits',context)},null,2)+'\n');
const routes=[{route:'/',call:'home()'},{route:'/start/',call:'startPage()',alias:'/'},{route:'/outline/',call:'outlinePage()'},{route:'/interview/',call:'interviewPage()'},{route:'/roadmap/',call:'roadmap()'},...Object.entries(data.learningProfiles).map(([id,profile])=>({route:'/roadmap/'+id+'/',call:'roadmapPage()',description:profile.aim})),{route:'/labs/',call:'labsPage()'},{route:'/resources/',call:'resourcesPage()'},{route:'/problems/',call:'problemsPage()'},{route:'/about/',call:'editorialPage()'},...Object.entries(data.interviewUnits).map(([key, unit]) => ({route:'/interview/'+key+'/', description:unit[1], call:'workshopPage('+JSON.stringify(key)+')'})),...Object.keys(data.trackDefinitions).map(id=>({route:'/track/'+id+'/',call:'trackPage('+JSON.stringify(id)+')'})),...data.modules.map(m=>({route:'/module/'+m.id+'/',call:'modulePage(moduleFor('+JSON.stringify(m.id)+'))'})),...data.articles.map(a=>({route:'/article/'+a.id+'/',article:a,call:'articlePage(articleById('+JSON.stringify(a.id)+'))'}))];
const chapterDates=new Map(data.articles.map(a=>{
 const raw=(a.updated||'2026.11.03').replaceAll('.','-');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(Date.parse(raw))||new Date(raw).toISOString().slice(0,10)!==raw)throw Error(a.id+': invalid revision date');
 return [a.id,raw];
}));
const newestDate=ids=>ids.map(id=>chapterDates.get(id)).filter(Boolean).sort().at(-1)||'2026-11-03';
const siteDate=newestDate(data.articles.map(a=>a.id));
const lastModified=route=>{
 const parts=route.split('/').filter(Boolean);
 if(parts[0]==='article')return chapterDates.get(parts[1])||siteDate;
 if(parts[0]==='module')return newestDate(data.articles.filter(a=>a.module===parts[1]).map(a=>a.id));
 if(parts[0]==='track')return newestDate(data.articles.filter(a=>data.trackDefinitions[parts[1]]?.modules.includes(a.module)).map(a=>a.id));
 return siteDate;
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const entry of routes){
 sink.innerHTML='';grid.innerHTML='';context.location.pathname=entry.route;
 vm.runInContext(entry.call,context);
 let body=sink.innerHTML.replace('<div class="module-grid" id="module-grid"></div>','<div class="module-grid" id="module-grid">'+grid.innerHTML+'</div>');
 const url=data.publicSiteOrigin+(entry.alias||entry.route);
 const description=entry.article?.desc||entry.description||({ '/':'面向中国初学者与面试准备者的 Cloud、AI、Agent Infra 指南。知识地图、分阶段路线、机制图解与可运行实验。','/start/':'学习入口已合并到首页，旧链接继续提供首页、大纲与学习路线入口。','/outline/':'按领域展开 Cloud、AI、Agent Infra 的知识地图与完整大纲，按先修和学习重点选择章节。','/interview/':'用12个核心问题复习Cloud、AI和Agent Infra：结论、机制、例子、边界与追问，附深入章节和本地自评记录。' }[entry.route])||'InfraGuide：从具体工程问题出发，用原理、代码和实验理解Cloud、AI与Agent基础设施。';
 const title=document.title;
 const schema=entry.article?{'@context':'https://schema.org','@type':'TechArticle',headline:entry.article.title,description,inLanguage:'zh-CN',url,mainEntityOfPage:url,dateModified:lastModified(entry.route),author:{'@type':'Organization',name:'InfraGuide'},isAccessibleForFree:true}:{'@context':'https://schema.org','@type':'WebPage',name:title,description,url,inLanguage:'zh-CN'};
 let html=versionedShell.replace(/<title>[\s\S]*?<\/title>/,'<title>'+esc(title)+'</title>').replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="'+esc(description)+'">').replace(/<!-- APP_START -->[\s\S]*?<!-- APP_END -->/,'<!-- APP_START --><div id="app">'+body+'</div><!-- APP_END -->');
 const head='<link rel="canonical" href="'+url+'"><meta property="og:type" content="'+(entry.article?'article':'website')+'"><meta property="og:site_name" content="InfraGuide"><meta property="og:locale" content="zh_CN"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+url+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>';
 html=html.replace('</head>',head+(entry.alias?'<meta name="robots" content="noindex,follow">':'')+'</head>').replace('href="#main"','href="'+entry.route+'#main"');
 context.renderedHTML=html;html=vm.runInContext('cleanInternalHTML(renderedHTML)',context);
 const target=path.join(dist,entry.route.slice(1),'index.html');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,html);
}
fs.writeFileSync(path.join(dist,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+routes.filter(r=>!r.alias).map(r=>'<url><loc>'+data.publicSiteOrigin+r.route+'</loc><lastmod>'+lastModified(r.route)+'</lastmod></url>').join('\n')+'\n</urlset>\n');
fs.writeFileSync(path.join(dist,'robots.txt'),'User-agent: *\nAllow: /\n\nSitemap: '+data.publicSiteOrigin+'/sitemap.xml\n');
fs.writeFileSync(path.join(dist,'404.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>章节未找到 · InfraGuide</title><body><h1>没有找到这个章节</h1><p><a href="/#sample-readings">从一个样章开始</a>，或<a href="/">返回知识库</a>。</p></body></html>');
console.log('Rendered '+routes.length+' independent pages with full initial HTML, canonical metadata and sitemap.');
