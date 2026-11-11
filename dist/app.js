// Rendering replaces the initial HTML; restore ordinary document fragments afterwards.
function legacySectionTarget(articleId,section){return articleId==='network-diagnosis'&&section==='7'?'network-timing-lab':section}
function stableArticleAnchor(article,section){for(const[id,file,anchor]of [['network-diagnosis','labs/network-timing/timing_lab.py','network-timing-lab'],['agent-security','labs/permissions/policy_lab.py','agent-permission-lab']])if(article.id===id&&section[1].includes(file))return ' id="'+anchor+'"';return ''}
function restoreDocumentFragment(focusTarget=false){
 const hash=location.hash;
 if(!hash||hash.startsWith('#/'))return;
 let id;
 try{id=decodeURIComponent(hash.slice(1))}catch{return}
 requestAnimationFrame(()=>{
  if(location.hash!==hash)return;
  const target=document.getElementById(id);
  if(!target)return;
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  const child=target.querySelector?.(':scope > details.article-case');
  if(child)child.open=true;
  if(focusTarget){
   if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');
   target.focus({preventScroll:true});
  }
  target.scrollIntoView({behavior:'instant'});
 });
}
const $ = s => document.querySelector(s);
if ('scrollRestoration' in history) history.scrollRestoration='auto';
const icons={terminal:'<path d="m5 7 5 5-5 5m8 0h6"/><rect x="2" y="3" width="20" height="18" rx="3"/>',server:'<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.1M7 17.5h.1M12 6.5h5M12 17.5h5"/>',network:'<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/>',cube:'<path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10 9-5M12 12 3 7m9 5v10M7.5 4.5l9 5v5"/>',pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4"/>',layers:'<path d="m12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5"/>',flask:'<path d="M9 2h6M10 2v7L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 9V2M7 15h10"/>',book:'<path d="M12 5c-3-2-6-2-10-1v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v16"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n]||icons.book}</svg>`;
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStore(k,fallback){try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}}
function writeStore(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}
let progress=readStore('cloudinfra-progress',{}); if(!progress||typeof progress!=='object'||Array.isArray(progress))progress={};
let checks=readStore('cloudinfra-checks',{}); if(!checks||typeof checks!=='object'||Array.isArray(checks))checks={};
let filter='all',observer,searchIndex=-1,searchItems=[],toastTimer;
const ordered=modules.flatMap(m=>articles.filter(a=>a.module===m.id));
const moduleFor=id=>modules.find(m=>m.id===id);
const countRead=()=>ordered.filter(a=>progress[a.id]).length;
const tags=items=>`<div class="tag-row">${items.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>`;
const articleURL=id=>hostedPath(`/article/${id}/`);
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2200)}
const footer=()=>`<footer class="footer"><div class="container"><span>© 2026 InfraGuide · 从理解原理，到构建系统。</span><span>原创工程内容 · <a href="#/about">关于本站</a> · <a href="#/roadmap">学习路线</a></span></div></footer>`;
function moduleCard(m){const n=articles.filter(a=>a.module===m.id).length;return `<a href="#/module/${m.id}" class="module-card ${m.featured?'featured':''}"><div class="card-top"><span class="module-icon">${icon(m.icon)}</span>${m.featured?`<span class="small-badge">${m.n} · AI 训练主线</span>`:`<span class="card-number">${m.n}</span>`}</div><h3>${m.name}</h3><p>${m.desc}</p>${tags(m.tags)}<div class="card-footer"><span>${n} 篇内容</span><b>开始阅读 ↗</b></div></a>`}
function renderModuleGrid(){const list=filter==='all'?modules:modules.filter(m=>m.track===filter);$('#module-grid').innerHTML=list.map(moduleCard).join('');normalizeInternalLinks();document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',b.dataset.filter===filter)})}
function home(){homePage()}
function sidebar(moduleId,current){return sidebarView(moduleId,current)}
function breadcrumbs(m,end=''){return `<div class="breadcrumb"><a href="#/">知识库</a><span>／</span><a href="#/module/${m.id}">${m.name}</a>${end?`<span>／</span><span>${end}</span>`:''}</div>`}
function modulePage(m){if(infraDomain(m.id)){infraKnowledgePage(m);return}if(m.track==='cloud'){cloudKnowledgePage(m);return}const first=m.id==='practice'?practiceArticleForContext():articles.find(a=>a.module===m.id);if(first)articlePage(first);}

function articlePage(a,anchor,showTrackOverview=false){
 const navigation=chapterNavigation(a),conceptTerms=chapterInitialConceptTerms(a),m=moduleFor(a.module);
 const sections=navigation.map((s,i)=>`<section class="article-section" id="section-${i+1}"><h2${stableArticleAnchor(a,a.sections[i])}><span class="section-index">${String(i+1).padStart(2,'0')}</span>${s.title}</h2>${readerTrialEarlyLink(a.id,i+1)}${chapterSectionBody(a,i,chapterConceptProse(a,s.html,conceptTerms))}${readerTrialSectionLink(a.id,i+1)}</section>`).join('');
 const intro=a.intro!==a.desc?'<p class="intro">'+a.intro+'</p>':'';
 const overview=trackEntryOverviewHTML(a,showTrackOverview);
 const read=progress[a.id];
 const href=trainingEscape(showTrackOverview?hostedPath('/track/'+m.track+'/')+location.search:readingArticleURL(a.id));
 const contents=chapterReadingContentsHTML(a,navigation,href);
 document.title=`${a.title} · InfraGuide`;
 $('#app').innerHTML=`<main class="doc-layout" id="main" tabindex="-1">${sidebar(a.module,a.id)}
  <article class="article">${breadcrumbs(m,a.number)}<h1>${a.number} ${a.title}</h1>
   ${readingToolbarHTML()}${mobileContents(a,contents)}${showTrackOverview?overview:''}${intro}
   ${optionalConceptReviews.has(a.id)?'':chapterConceptIntro(a)}${learningContract(a,m,showTrackOverview?'':overview)}
   ${sections}${chapterConnectionHTML(a)}${chapterPracticeHTML(a)}${chapterReferencesHTML(a)}
   <div class="completion"><button class="read-btn ${read?'done':''}" data-read="${a.id}">${read?'✓ 已读 · 点击取消':'标记为已读'}</button></div>
   ${learningGoalChapterNav(a)||chapterReadingNav(a)}
  </article>
  <aside class="toc"><div class="toc-title">本文目录</div>${contents}</aside></main>${footer()}`;
 initInteractive();
 if(anchor)requestAnimationFrame(()=>{
  const target=document.getElementById(/^\d+$/.test(anchor)?`section-${anchor}`:anchor);
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  const child=target?.querySelector?.(':scope > details.article-case');
  if(child)child.open=true;
  target?.scrollIntoView({behavior:'instant'});
 });
}
function roadmap(){roadmapPage()}
let currentPath='';
function route(){const hash=documentPathname()+(location.search||''),[path,query]=hash.split('?'),parts=path.split('/').filter(Boolean),anchor=legacySectionTarget(parts[0]==='article'?parts[1]:'',new URLSearchParams(query||'').get('section'));if(path===currentPath&&parts[0]==='article'&&anchor){document.getElementById(/^\d+$/.test(anchor)?`section-${anchor}`:anchor)?.scrollIntoView({behavior:'instant'});return}currentPath=path;observer?.disconnect();$('#search-dialog').close();$('.top-nav').classList.remove('mobile-open');$('#mobile-menu').setAttribute('aria-expanded','false');document.querySelectorAll('.top-nav a').forEach(a=>a.classList.remove('active'));window.scrollTo({top:0,left:0,behavior:'instant'});if(!parts.length)home();else if(parts[0]==='module'&&moduleFor(parts[1])){modulePage(moduleFor(parts[1]));document.querySelector(`.top-nav a[href="#/module/${parts[1]}"]`)?.classList.add('active')}else if(parts[0]==='article'&&articles.find(a=>a.id===parts[1])){const a=articles.find(a=>a.id===parts[1]);articlePage(a,anchor);document.querySelector(`.top-nav a[href="#/module/${a.module}"]`)?.classList.add('active')}else if(parts[0]==='start')startPage();else if(parts[0]==='outline')outlinePage();else if(parts[0]==='interview'&&parts.length===2&&Object.hasOwn(interviewUnits,parts[1]))workshopPage(parts[1]);else if(parts[0]==='interview'&&parts.length===1)interviewPage();else if(parts[0]==='resources')resourcesPage();else if(parts[0]==='roadmap')roadmap();else if(parts[0]==='about')editorialPage();else if(parts[0]==='track'&&['cloud','ai','agent'].includes(parts[1]))trackPage(parts[1]);else if(parts[0]==='labs')labsPage();else if(parts[0]==='problems')problemsPage();else{$('#app').innerHTML=`<main id="main" class="not-found" tabindex="-1"><h1>没有找到这个章节</h1><p>你可以返回知识库，或搜索相关内容。</p><a class="btn" href="#/">返回知识库</a></main>`;document.title='章节未找到 · InfraGuide'}let navHref=parts[0]==='track'?'#/track/'+parts[1]:parts[0]==='article'?'#/track/'+chapterReadingContext(articles.find(a=>a.id===parts[1])).track:parts[0]==='module'?'#/track/'+(parts[1]==='practice'?chapterReadingContext(practiceArticleForContext()).track:trackForModule(parts[1])):'#/'+parts[0];if(navHref==='#/track/shared')navHref='#/labs';normalizeInternalLinks();document.querySelector('.top-nav a[href="'+publicRoute(navHref)+'"]')?.classList.add('active');initReadingComfort();initFieldConceptMaps();$('#main')?.focus({preventScroll:true});restoreDocumentFragment()}
// Attach the existing controls to the published article instead of rebuilding its prose.
// Keep native fragment position, open details and any text entered before startup.
function hydrateStaticArticle(){
 const shell=$('#app'),path=documentPathname();
 if(shell?.getAttribute?.('data-static-path')!==path)return false;
 if(typeof staticReadingVersion==='undefined'||shell.getAttribute('data-static-version')!==staticReadingVersion)return false;
 const parts=path.split('/').filter(Boolean),id=shell.getAttribute('data-static-article');
 const expected=parts[0]==='article'?parts[1]:parts[0]==='track'?trackDefinitions[parts[1]]?.start:parts[0]==='module'&&parts[1]==='practice'?practiceArticleForContext()?.id:null;
 const article=articles.find(a=>a.id===id);
 if(!article||expected!==id||!$('.doc-layout .article'))return false;
 currentPath=path;
 // Only the small personal navigation changes with local progress and a chosen role.
 const side=$('.sidebar');
 if(Object.keys(progress).some(key=>progress[key])&&side){
  const expanded=[...(side.querySelectorAll?.('details')||[])].map(detail=>detail.open);
  side.outerHTML=sidebar(article.module,article.id);
  [...($('.sidebar')?.querySelectorAll?.('details')||[])].forEach((detail,index)=>{if(index<expanded.length)detail.open=expanded[index];});
 }
 const roleNav=learningGoalChapterNav(article),currentNav=$('.goal-reading-nav')||$('.article-nav');
 if(roleNav&&currentNav)currentNav.outerHTML=roleNav;
 if(parts[0]==='track'&&location.search){
  const jump=$('.track-entry-head a');
  jump?.setAttribute('href',location.pathname+location.search+'#section-1');
 }
 const roadmap=$('[data-track-roadmap]');
 if(roadmap&&location.search){
  const {href,label}=trackRoadmapLink(chapterReadingContext(article).track);
  roadmap.setAttribute('href',href);
  roadmap.textContent=label;
 }
 const read=document.querySelector('[data-read="'+id+'"]');
 if(read){read.classList.toggle('done',!!progress[id]);read.textContent=progress[id]?'✓ 已读 · 点击取消':'标记为已读';}
 let changedChecks=false;
 for(const input of document.querySelectorAll('input[data-check]')){
  const key=input.dataset.check;
  if(input.checked!==input.defaultChecked){checks[key]=input.checked;changedChecks=true;}
  else input.checked=!!checks[key];
 }
 if(changedChecks)writeStore('cloudinfra-checks',checks);
 document.querySelectorAll('.top-nav a').forEach(a=>a.classList.remove('active'));
 document.querySelector('.top-nav a[href="'+publicRoute('#/track/'+chapterReadingContext(article).track)+'"]')?.classList.add('active');
 normalizeInternalLinks();initInteractive();initReadingComfort();initFieldConceptMaps();
 shell.setAttribute('data-hydrated-static','true');
 const queryTarget=legacySectionTarget(id,new URLSearchParams(location.search||'').get('section'));
 const engaged=document.activeElement?.matches?.('input,textarea,select,button,summary,a[href]');
 const reveal=(target,forceScroll)=>{
  let opened=false;
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS'&&!node.open){node.open=true;opened=true;}
  const child=target?.querySelector?.(':scope > details.article-case');if(child&&!child.open){child.open=true;opened=true;}
  if(!engaged&&(opened||forceScroll))target?.scrollIntoView({behavior:'instant'});
 };
 // The browser has already positioned ordinary static fragments. Only a newly
 // revealed target or the legacy query syntax needs an extra startup scroll.
 if(location.hash&&!location.hash.startsWith('#/'))requestAnimationFrame(()=>{
  let targetId;try{targetId=decodeURIComponent(location.hash.slice(1));}catch{return;}
  reveal(document.getElementById(targetId),false);
 });
 else if(queryTarget)requestAnimationFrame(()=>reveal(document.getElementById(/^\d+$/.test(queryTarget)?'section-'+queryTarget:queryTarget),true));

 return true;
}
function initInteractive(){initReaderActions();initAttentionDemo();initSystemInteractive();if($('#topology-demo')){let mode=0;const render=()=>{const info=[['单卡训练','一张 GPU 承载训练：先关注显存容量、算子效率与数据输入。'],['单机多卡','多张 GPU 在同一节点协作：新增梯度同步、数据分片与机内互联问题。'],['多机多卡','跨节点通信成为关键路径之一：同时验证网络、拓扑、任务协调与整体恢复。']];const node=(n,c)=>`<div class="gpu-node"><small>NODE ${n}</small><div class="gpu-chips">${Array.from({length:c},(_,i)=>`<span>GPU ${i}</span>`).join('')}</div></div>`;$('#topology-demo').innerHTML=`<div class="interactive"><div class="segmented" aria-label="训练拓扑">${info.map((x,i)=>`<button data-topology="${i}" class="${i===mode?'active':''}" aria-pressed="${i===mode}">${x[0]}</button>`).join('')}</div><div class="topology-nodes">${node('A',mode?2:1)}${mode===2?'<div class="network-bridge">⇄<br>节点间网络</div>'+node('B',2):''}</div><p class="demo-caption" aria-live="polite">${info[mode][1]}</p></div>`;$('#topology-demo').querySelectorAll('button').forEach(b=>b.onclick=()=>{mode=Number(b.dataset.topology);render()})};render()}
if($('#scaling-demo')){$('#scaling-demo').innerHTML=`<div class="interactive"><p class="demo-caption">计算示例：初始数值仅演示公式，不是实测基准。可填入同口径的真实结果。</p><div class="calc-fields"><label>单卡吞吐（样本/秒）<input id="base-throughput" type="number" min="0.01" step="any" value="100"></label><label>多卡吞吐（样本/秒）<input id="multi-throughput" type="number" min="0.01" step="any" value="620"></label><label>GPU 数量<input id="gpu-count" type="number" min="1" max="100000" step="1" value="8"></label></div><div id="calc-result" aria-live="polite"></div></div>`;const calc=()=>{const a=Number($('#base-throughput').value),b=Number($('#multi-throughput').value),n=Number($('#gpu-count').value);$('#calc-result').innerHTML=(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0||!Number.isInteger(n)||n<1||n>100000)?'<p class="calc-error">请输入正数吞吐和有效的整数 GPU 数量。</p>':`<div class="calc-output"><div><strong>${(b/a).toFixed(2)}×</strong><small>吞吐加速比</small></div><div><strong>${(b/a/n*100).toFixed(1)}%</strong><small>扩展效率</small></div></div>${b/a/n>1?'<p class="demo-caption">效率超过 100%，请检查比较口径；缓存和工作负载变化也可能带来超线性结果。</p>':''}`};document.querySelectorAll('.calc-fields input').forEach(i=>i.addEventListener('input',calc));calc()}}
function clearSearchSelection(){
 searchItems=[];searchIndex=-1;
 $('#search-input').removeAttribute('aria-activedescendant');
}
function suspendSearch(){
 clearSearchSelection();
 $('#search-status').textContent='';
 $('#search-results').innerHTML='';
}
function renderSearch(q,ranked,knowledgeCount){
 clearSearchSelection();
 searchItems=ranked.slice(0,24);
 $('#search-status').textContent=q.trim()?(ranked.length?'找到 '+ranked.length+' 项'+(ranked.length>24?'，先显示前24项；可补充关键词缩小范围。':''):'没有找到匹配内容。'):'可搜'+articles.length+'章、'+knowledgeCount+'个知识点；先选一项，或输入技术名。';
 $('#search-results').innerHTML=searchItems.length?searchItems.map((r,i)=>`<a class="search-result" id="site-search-${i}" role="option" aria-selected="false" tabindex="-1" href="${learningContextHref(hostedPath(r.path)+(r.anchor?'#'+r.anchor:''))}"><small>${r.type==='knowledge'?'系统知识点':'章节 '+r.number} · ${escapeHTML(moduleFor(r.module).name)}<span>${r.matchLabel}</span></small><strong>${siteSearchHighlight(r.titleText,r.terms)}</strong><p>${siteSearchHighlight(r.excerpt,r.terms)}</p></a>`).join(''):`<p class="search-empty">试试「GPU」「幂等」或「恢复」。多个关键词之间加空格。</p>`;
}
function search(q=''){
 const ranked=rankSiteSearch(q);
 renderSearch(q,ranked,siteSearchCache.filter(item=>item.type==='knowledge').length);
}
function openSearch(){$('#search-dialog').showModal();$('#search-input').setAttribute('aria-expanded','true');$('#search-input').value='';search();$('#search-input').focus()}
$('#search-open').onclick=startSearch;$('#search-close').onclick=()=>$('#search-dialog').close();
let searchComposing=false;
function startSearch(){searchComposing=false;openSearch()}
function focusLocalSearchResult(href){
 const target=new URL(href,location.href);
 if(target.origin!==location.origin||target.pathname!==location.pathname||target.search!==location.search||!target.hash||target.hash.startsWith('#/'))return false;
 $('#search-dialog').close();
 if(location.hash!==target.hash)location.hash=target.hash;
 restoreDocumentFragment(true);
 return true;
}
$('#search-input').addEventListener('compositionstart',()=>{if($('#search-dialog').open){searchComposing=true;suspendSearch()}});
$('#search-input').addEventListener('compositionend',e=>{if(searchComposing&&$('#search-dialog').open){searchComposing=false;search(e.target.value)}});
$('#search-input').addEventListener('input',e=>{if($('#search-dialog').open&&!searchComposing&&!e.isComposing)search(e.target.value)});
$('#search-dialog').addEventListener('click',e=>{
 const dialog=$('#search-dialog'),result=e.target.closest('.search-result');
 if(result&&!e.defaultPrevented&&e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&focusLocalSearchResult(result.href))e.preventDefault();
 else if(result||e.target===dialog)dialog.close();
});
$('#search-dialog').addEventListener('close',()=>{
 if($('#search-dialog').open)return;
 searchComposing=false;
 $('#search-input').setAttribute('aria-expanded','false');suspendSearch();
});
$('#search-input').addEventListener('keydown',e=>{
 if(!$('#search-dialog').open||searchComposing||e.isComposing||e.keyCode===229)return;
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  e.preventDefault();if(!searchItems.length)return;
  searchIndex=searchIndex<0?(e.key==='ArrowDown'?0:searchItems.length-1):(searchIndex+(e.key==='ArrowDown'?1:-1)+searchItems.length)%searchItems.length;
  $('#search-input').setAttribute('aria-activedescendant','site-search-'+searchIndex);
  document.querySelectorAll('.search-result').forEach((a,i)=>{a.classList.toggle('selected',i===searchIndex);a.setAttribute('aria-selected',String(i===searchIndex));if(i===searchIndex)a.scrollIntoView({block:'nearest'})});
 }else if(e.key==='Enter'&&searchItems.length){
  e.preventDefault();
  const result=searchItems[Math.max(0,searchIndex)],href=learningContextHref(hostedPath(result.path)+(result.anchor?'#'+result.anchor:''));
  if(!focusLocalSearchResult(href)){location.assign(href);$('#search-dialog').close();}
 }
});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if($('#search-dialog').open)$('#search-dialog').close();else startSearch()}});
function applyTheme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').setAttribute('aria-label',dark?'切换浅色模式':'切换深色模式')}
applyTheme(readStore('cloudinfra-dark',false)===true);$('#theme').onclick=()=>{const dark=!document.documentElement.classList.contains('dark');applyTheme(dark);writeStore('cloudinfra-dark',dark)};
$('#mobile-menu').onclick=()=>{const open=$('.top-nav').classList.toggle('mobile-open');$('#mobile-menu').setAttribute('aria-expanded',open)};
document.addEventListener('click',e=>{const f=e.target.closest('[data-filter]');if(f){filter=f.dataset.filter;renderModuleGrid()}const r=e.target.closest('[data-read]');if(r){progress[r.dataset.read]=!progress[r.dataset.read];const saved=writeStore('cloudinfra-progress',progress);r.classList.toggle('done',progress[r.dataset.read]);r.textContent=progress[r.dataset.read]?'✓ 已读 · 点击取消':'标记为已读';const a=articles.find(a=>a.id===r.dataset.read);$('.sidebar').outerHTML=sidebar(a.module,a.id);normalizeInternalLinks();toast(saved?(progress[a.id]?'已保存阅读进度':'已取消已读标记'):'本次进度已更新，浏览器存储不可用')}});
document.addEventListener('change',e=>{if(e.target.matches('[data-check]')){checks[e.target.dataset.check]=e.target.checked;if(!writeStore('cloudinfra-checks',checks))toast('浏览器存储不可用，勾选仅在本次会话保留')}});
$('.skip').onclick=e=>{e.preventDefault();$('#main')?.focus();$('#main')?.scrollIntoView()};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy-code]');if(!b)return;const code=b.closest('.code-block').querySelector('code').textContent;try{await navigator.clipboard.writeText(code);b.textContent='已复制';toast('代码已复制');setTimeout(()=>b.textContent='复制代码',1800)}catch{toast('无法访问剪贴板，请选中代码复制')}});
function followCourseRedirect(){const destination=courseRedirectFor(documentPathname(),location.search||'',location.hash||'');if(!destination)return false;location.replace(hostedPath(destination));return true}
window.addEventListener('popstate',()=>{if(document.querySelector('[data-field-map]')){initFieldConceptMaps();restoreDocumentFragment()}});
window.addEventListener('hashchange',()=>{if(followCourseRedirect())return;if(location.hash.startsWith('#/'))location.replace(publicRoute(location.hash));else{initFieldConceptMaps();restoreDocumentFragment()}});if(followCourseRedirect()){}else if(location.hash.startsWith('#/'))location.replace(publicRoute(location.hash));else{if(!hydrateStaticArticle())route();document.documentElement.setAttribute?.('data-site-ready','true');window.dispatchEvent?.(new Event('infra-ready'));}
