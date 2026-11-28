/* Shared reading controls; the document remains fully readable without JavaScript. */
function readingToolbarHTML(){return '<div class="reading-toolbar" role="group" aria-label="阅读工具"><button type="button" data-reader-contents aria-haspopup="dialog">本页目录 <span aria-hidden="true">≡</span></button><div class="reading-display"><button type="button" data-reader-large aria-pressed="false" title="切换大字阅读">大字</button><button type="button" data-reader-focus aria-pressed="false">专注阅读</button></div></div>';}

let comfortAbort;
function initReadingConceptReturn(article,toolbar){
 const params=new URLSearchParams(location.search);
 const source=params.get('fromConcept');
 if(!source||!toolbar)return;
 const footer=article.querySelector('.chapter-map-link[data-concept-returns]');
 if(!footer)return;
 const choices=JSON.parse(footer.dataset.conceptReturns);
 if(!Object.hasOwn(choices,source))return;
 const [path,label,track]=choices[source],role=params.get('returnGoal');
 const optionalRole=!params.has('goal')&&learningProfiles[role]?.track===track?role:null;
 const [before,fragment]=path.split('#');
 const href=readerInternalHref(before+(optionalRole?'&goal='+optionalRole:'')+'#'+fragment);
 footer.setAttribute('href',href);
 footer.textContent='返回概念图 · '+label+' →';
 let shortcut=toolbar.querySelector('.reader-concept-return');
 if(!shortcut){
  shortcut=document.createElement('a');
  shortcut.className='reader-concept-return';
  shortcut.textContent='返回概念图';
  toolbar.querySelector('.reading-display').before(shortcut);
 }
 shortcut.setAttribute('href',href);
 shortcut.setAttribute('aria-label','返回概念图 · '+label);
 if(params.has('returnGoal')&&!optionalRole)return;
 const goal=params.get('goal');
 for(const link of article.querySelectorAll('.chapter-lab-evidence[data-lab-concepts]')){
  if(!link.dataset.labConcepts.split(' ').includes(source))continue;
  const lab=new URL(link.href);
  if(lab.searchParams.get('track')!==track||(params.has('goal')&&lab.searchParams.get('goal')!==goal))continue;
  lab.searchParams.set('fromConcept',source);
  if(optionalRole)lab.searchParams.set('returnGoal',optionalRole);
  link.setAttribute('href',lab.pathname+lab.search+lab.hash);
 }
}
function initReadingGateReturn(toolbar){
 if(toolbar.querySelector('.reader-concept-return, .reader-gate-return'))return;
 const chapter=documentPathname().match(/^\/article\/([a-z0-9-]+)\/?$/)?.[1];
 const evidence=chapter&&learningGoalEvidenceReturn(chapter);
 if(!evidence)return;
 const shortcut=document.createElement('a');
 shortcut.className='reader-gate-return';
 shortcut.textContent='返回验收';
 shortcut.setAttribute('aria-label','返回本项岗位验收');
 shortcut.setAttribute('href',readerInternalHref(evidence));
 toolbar.querySelector('.reading-display').before(shortcut);
}
// Reading pace for the remaining-time hint: technical Chinese ~350 characters/min, Latin words ~180/min.
const chapterReadingMinutes={'linux-resource':8,'virtual-memory-oom':10,'concurrency-pools':11,'distributed-systems':11,'cloud-overview':7,'cloud-compute':17,'vpc-network':26,'network-diagnosis':20,'tcp-event-loop':13,'training-storage':12,'database-index-locks':18,'cache-consistency':15,'storage-recovery':15,'mysql-recovery':12,'mysql-replication':16,'container-runtime':13,'kubernetes-basics':13,'k8s-workloads':13,'scheduling-resources':11,'k8s-networking':14,'k8s-storage':15,'config-secrets':12,'k8s-autoscaling':13,'control-plane-consensus':14,'serverless-execution':24,'message-delivery':11,'delivery':20,'terraform-state':12,'gitops-reconciliation':13,'iam-security':22,'elasticity':23,'slo':20,'observability':15,'incident':12,'resilience':21,'transformer-model':12,'tokenization-embedding':16,'attention-mechanics':21,'transformer-block':18,'position-encoding':18,'autograd-training':18,'gpu-execution':14,'roofline-model':11,'flash-attention-io':20,'tensor-parallel-math':18,'operator-profiling':27,'gpu-cluster':12,'distributed-training':19,'gpu-memory':24,'ddp-code':14,'training-communication':20,'data-pipeline':22,'multinode-lab':21,'checkpoint-recovery':23,'training-performance':14,'training-platform':12,'gpu-scheduling':16,'kubernetes-training':15,'model-serving':33,'quantization-serving':13,'inference-performance':28,'ai-lifecycle':16,'moe-routing':15,'speculative-decoding':16,'agent-runtime':14,'mcp-protocol':18,'agent-security':13,'agent-sandbox':25,'agent-recovery':18,'agent-memory':13,'agent-evaluation':22,'durable-workflows':20,'agent-retrieval':21,'agent-observability':25,'kairo-practice':20,'training-lab':9,'cloud-service-lab':7,'production-readiness':15};
const chapterAnimatedScenes={'cloud-overview':'C01','linux-resource':'C02','vpc-network':'C03','database-index-locks':'C04','delivery':'C05','elasticity':'C06','tcp-event-loop':'C07','k8s-workloads':'C08','mysql-replication':'C09','slo':'C10','transformer-model':'A01','attention-mechanics':'A02','autograd-training':'A03','gpu-memory':'A04','distributed-training':'A05','inference-performance':'A06','gpu-execution':'A07','flash-attention-io':'A08','model-serving':'A09','tensor-parallel-math':'A10','quantization-serving':'A10','ai-lifecycle':'S03','roofline-model':'S16','agent-runtime':'G01','agent-security':'G02','agent-recovery':'G03','durable-workflows':'G04','agent-memory':'G05','mcp-protocol':'G07','agent-sandbox':'G08','agent-retrieval':'G09','agent-observability':'G10','agent-evaluation':'G10','production-readiness':'S29'};
function readingMinutes(text){const han=(text.match(/[\u3400-\u9fff]/g)||[]).length,words=(text.replace(/[\u3400-\u9fff]/g,' ').match(/[A-Za-z0-9_]+/g)||[]).length;return han/350+words/180;}
// Last section and completion per chapter, kept in this browser only; entries older than 60 days are ignored.
function readingResumeStore(){const value=readStore('infraguide-reading-position',{});return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function canonicalChapterFromPath(pathname){
 const clean=String(pathname||'').replace(/^\/infra-guide(?=\/)/,'');
 const m=clean.match(/^\/article\/([a-z0-9-]+)\/?$/);
 if(m)return m[1];
 const t=clean.match(/^\/track\/(cloud|ai|agent)\/?$/);
 return t&&typeof trackDefinitions!=='undefined'?trackDefinitions[t[1]]?.start||'':'';
}
function saveChapterReadingState(key,patch){
 const next=readingResumeStore(),prev=next[key]&&typeof next[key]==='object'?next[key]:{};
 next[key]={...prev,...patch,done:Boolean(prev.done||patch.done),at:Date.now()};
 const keys=Object.keys(next);if(keys.length>120)keys.sort((a,b)=>(next[a].at||0)-(next[b].at||0)).slice(0,keys.length-120).forEach(k=>delete next[k]);
 writeStore('infraguide-reading-position',next);
}
function initReadingProgress(article,toolbar,signal){
 const bar=document.createElement('span');bar.className='reading-progress';bar.setAttribute('aria-hidden','true');
 const remaining=document.createElement('span');remaining.className='reading-remaining';
 toolbar.appendChild(bar);toolbar.querySelector('.reading-display')?.prepend(remaining);
 // Count prose a reader actually meets: skip code listings and folded optional material.
 const prose=[...article.querySelectorAll('h1,h2,h3,h4,p,li,th,td,figcaption,blockquote')].filter(el=>!el.closest('pre,details:not([open]),.reading-toolbar,li li,blockquote p,td p')).map(el=>el.textContent).join(' ');
 const total=Math.max(1,Math.round(readingMinutes(prose)));
 const key=location.pathname,chapterId=canonicalChapterFromPath(documentPathname());
 let shown='',markedDone=Boolean(readingResumeStore()[key]?.done);
 signal.addEventListener('abort',()=>{bar.remove();remaining.remove();},{once:true});
 return function update(){
  // 0 at the page position where the chapter first fills the screen, 1 when its end reaches the bottom edge.
  const box=article.getBoundingClientRect(),top=box.top+window.scrollY,start=Math.max(0,top-window.innerHeight),end=Math.max(start+1,top+box.height-window.innerHeight);
  const ratio=Math.min(1,Math.max(0,(window.scrollY-start)/(end-start)));
  bar.style.transform='scaleX('+ratio.toFixed(4)+')';
  const left=Math.max(1,Math.ceil(total*(1-ratio)));
  const text=ratio>=0.98?'已读完':ratio<0.02?'约 '+total+' 分钟':'剩余约 '+left+' 分钟';
  if(text!==shown){shown=text;remaining.textContent=text;remaining.title='按正文字数估算，全文约 '+total+' 分钟';}
  if(ratio>=0.98&&!markedDone&&window.scrollY>0){markedDone=true;saveChapterReadingState(key,{chapter:chapterId,done:true});}
 };
}
function initReadingResume(toolbar,sections,signal){
 const key=location.pathname,store=readingResumeStore(),saved=store[key];
 const chapterId=canonicalChapterFromPath(documentPathname());
 const fresh=saved&&typeof saved.id==='string'&&Date.now()-Number(saved.at||0)<60*864e5;
 const target=fresh&&!location.hash&&sections.find(section=>section.id===saved.id);
 if(target&&target!==sections[0]&&!target.closest('details:not([open])')){
  const heading=target.matches('h3,h4')?target:target.querySelector('h2,summary');
  const note=document.createElement('p');note.className='reader-resume';
  const go=document.createElement('a');go.href=location.pathname+location.search+'#'+target.id;
  go.textContent='继续上次阅读：'+(heading?.textContent||'').trim().replace(/^(\d{2})(?=\D)/,'$1 · ')+' ↓';
  const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','不再提示上次位置');close.textContent='×';
  note.append(go,close);toolbar.after(note);
  go.addEventListener('click',event=>{event.preventDefault();history.pushState(null,'',go.getAttribute('href'));note.remove();target.scrollIntoView({behavior:'instant',block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});},{signal});
  close.addEventListener('click',()=>note.remove(),{signal});
  signal.addEventListener('abort',()=>note.remove(),{once:true});
 }
 let last=fresh?saved.id:'';
 return function remember(active){
  if(!active||active===last)return;last=active;
  const sec=sections.find(s=>s.id===active),heading=sec&&(sec.matches('h3,h4')?sec:sec.querySelector('h2,summary'));
  const label=(heading?.textContent||'').trim().replace(/^(\d{2})(?=\D)/,'$1 · ');
  saveChapterReadingState(key,{id:active,label,chapter:chapterId});
 };
}
function initChapterCompanionTools(article,toolbar,signal){
 const chapterId=canonicalChapterFromPath(documentPathname());
 const display=toolbar?.querySelector('.reading-display');
 if(!chapterId||!display)return;
 const scene=chapterAnimatedScenes[chapterId];
 const labs=article.querySelector('#chapter-experiments');
 const pills=[];
 if(scene){
  const a=document.createElement('a');
  a.className='reader-companion-pill';
  a.href=hostedPath('/courses/?scene='+scene);
  a.textContent='动画 '+scene+' ↗';
  a.title='打开本章配套 16:9 动画图解（'+scene+'）';
  pills.push(a);
 }
 if(labs){
  const count=labs.querySelectorAll('li').length;
  const btn=document.createElement('a');
  btn.className='reader-companion-pill reader-lab-pill';
  btn.href=location.pathname+location.search+'#chapter-experiments';
  btn.textContent='实验'+(count?' · '+count:'')+' ↓';
  btn.title='跳到本章可复现实验与记录';
  btn.addEventListener('click',event=>{event.preventDefault();labs.open=true;history.pushState(null,'',btn.getAttribute('href'));labs.scrollIntoView({behavior:'instant',block:'start'});},{signal});
  pills.push(btn);
 }
 for(const pill of pills)display.before(pill);
 signal.addEventListener('abort',()=>pills.forEach(p=>p.remove()),{once:true});
 // Enrich bottom continuation cards with estimated reading minutes & completion state.
 const doneSet=collectChapterStatus().done;
 for(const link of article.querySelectorAll('.article-nav a[href*="/article/"], .goal-reading-nav a[href*="/article/"]')){
  const nextId=new URL(link.href,location.href).pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
  const mins=nextId&&chapterReadingMinutes[nextId];
  if(!mins)continue;
  const small=link.querySelector('small');
  if(small&&!small.dataset.timed){
   small.dataset.timed='1';
   const dir=link.dataset.readingDirection;
   const status=doneSet.has(nextId)?' · ✓ 已读':'';
   small.textContent=dir==='next'?'下一篇 · 约 '+mins+' 分钟'+status+' →':'← 上一篇 · 约 '+mins+' 分钟'+status;
  }else if(!small&&!link.dataset.timed&&link.textContent.includes('下一章')){
   link.dataset.timed='1';
   link.textContent=link.textContent.replace(/\s*→$/,'（约 '+mins+' 分钟） →');
  }
 }
}
function collectChapterStatus(){
 const manual=readStore('cloudinfra-progress',{}),positions=readingResumeStore();
 const done=new Set(),inProgress=new Map();
 let latest=null;
 if(manual&&typeof manual==='object')for(const [k,v] of Object.entries(manual))if(v)done.add(k);
 const cutoff=Date.now()-60*864e5;
 for(const [pathKey,entry] of Object.entries(positions)){
  if(!entry||typeof entry!=='object'||Number(entry.at||0)<cutoff)continue;
  const id=entry.chapter||canonicalChapterFromPath(pathKey);
  if(!id)continue;
  if(entry.done)done.add(id);
  else if(entry.id&&entry.id!=='section-1'&&!done.has(id))inProgress.set(id,entry);
  if(entry.id&&(!latest||Number(entry.at||0)>Number(latest.at||0)))latest={id,path:pathKey,section:entry.id,label:entry.label||'',at:entry.at,done:Boolean(entry.done)};
 }
 for(const id of done)inProgress.delete(id);
 return {done,inProgress,latest};
}
function initCollectionWorkbench(){
 document.querySelectorAll('.learning-workbench,.chapter-meta-badges,.outline-module-progress').forEach(el=>el.remove());
 const path=documentPathname();
 const isHome=path==='/',isOutline=path==='/outline/',isRoadmap=path.startsWith('/roadmap/');
 if(!isHome&&!isOutline&&!isRoadmap)return;
 const {done,inProgress,latest}=collectChapterStatus();
 const courseRaw=readStore('infraguide-course-progress',null);
 const courseDone=courseRaw?.done&&typeof courseRaw.done==='object'?Object.keys(courseRaw.done).filter(k=>courseRaw.done[k]).length:0;
 const courseLast=courseRaw?.last?.id?courseRaw.last:null;
 const checksRaw=readStore('cloudinfra-checks',{});
 const checksCount=checksRaw&&typeof checksRaw==='object'?Object.values(checksRaw).filter(Boolean).length:0;
 const hasAnyActivity=done.size>0||inProgress.size>0||courseDone>0||Boolean(courseLast)||checksCount>0;
 const totalChapters=typeof articles!=='undefined'&&Array.isArray(articles)?articles.length:78;
 if(hasAnyActivity||isOutline||isRoadmap){
  const bench=document.createElement('section');
  bench.className='learning-workbench';
  bench.setAttribute('aria-label','本浏览器学习进度与快捷续学');
  const articleInfo=id=>typeof articleById==='function'&&articleById(id);
  const resumeActions=[];
  if(latest){
   const meta=articleInfo(latest.id);
   const title=meta?meta.number+' '+meta.title:latest.id;
   const sub=latest.label?' · '+latest.label:'';
   const href=hostedPath('/article/'+latest.id+'/')+(latest.section&&!latest.done?'#'+latest.section:'');
   resumeActions.push('<a class="workbench-resume-btn primary" href="'+escapeHTML(href)+'">继续阅读：'+escapeHTML(title+sub)+' →</a>');
  }
  if(courseLast){
   const stepHash=Number.isInteger(courseLast.step)?'/'+courseLast.step:'';
   resumeActions.push('<a class="workbench-resume-btn" href="'+escapeHTML(hostedPath('/courses/#'+courseLast.id+stepHash))+'">继续动画课：'+escapeHTML(courseLast.id)+' ↗</a>');
  }else if(!latest){
   resumeActions.push('<a class="workbench-resume-btn primary" href="'+escapeHTML(hostedPath('/track/cloud/'))+'">从第一章开始阅读 →</a>');
   resumeActions.push('<a class="workbench-resume-btn" href="'+escapeHTML(hostedPath('/courses/?deck=overview'))+'">观看 30 幕全景动画课 ↗</a>');
  }
  const readPct=Math.min(100,Math.round(done.size/totalChapters*100));
  const coursePct=Math.min(100,Math.round(courseDone/60*100));
  bench.innerHTML='<div class="workbench-head"><div><strong>个人学习工作台</strong><span>进度自动保存在当前浏览器</span></div><div class="workbench-actions">'+resumeActions.join('')+'</div></div>'+
   '<div class="workbench-metrics">'+
   '<a class="workbench-metric" href="'+escapeHTML(hostedPath('/outline/'))+'"><div class="metric-top"><span>章节深度阅读</span><b>'+done.size+' / '+totalChapters+' 章</b></div><div class="metric-bar"><i style="width:'+readPct+'%"></i></div><small>'+(inProgress.size?'进行中 '+inProgress.size+' 章 · 点击查看全局目录':'读到底部或点击已读自动点亮')+'</small></a>'+
   '<a class="workbench-metric" href="'+escapeHTML(hostedPath('/courses/'))+'"><div class="metric-top"><span>16:9 动画图解课</span><b>'+courseDone+' / 60 幕</b></div><div class="metric-bar"><i style="width:'+coursePct+'%"></i></div><small>'+(courseLast?'上次停在 '+escapeHTML(courseLast.id)+' · 三季共 60 幕':'第一季 18 节 · 第二季 12 节 · 全景 30 幕')+'</small></a>'+
   '<a class="workbench-metric" href="'+escapeHTML(hostedPath('/interview/'))+'"><div class="metric-top"><span>自检与面试演练</span><b>已掌握 '+checksCount+' 项</b></div><div class="metric-bar"><i style="width:'+Math.min(100,checksCount*4)+'%"></i></div><small>章节自检清单与 12 道核心面试追问</small></a>'+
   '</div>';
  const anchor=isHome?document.querySelector('.infra-hero'):document.querySelector('.collection > .description');
  anchor?.after(bench);
 }
 if(!isOutline&&!isRoadmap)return;
 // Annotate chapter rows on /outline/, /roadmap/, and /roadmap/<role>/ with reading time + status pills.
 const selector=isOutline?'.outline-chapter':'[id^="route-chapter-"], [id^="goal-chapter-"]';
 for(const link of document.querySelectorAll(selector)){
  const id=new URL(link.href,location.href).pathname.match(/\/article\/([a-z0-9-]+)\/?$/)?.[1];
  if(!id)continue;
  const mins=chapterReadingMinutes[id],scene=chapterAnimatedScenes[id];
  const isDone=done.has(id),prog=inProgress.get(id);
  const wrap=document.createElement('span');
  wrap.className='chapter-meta-badges';
  if(mins){const t=document.createElement('span');t.className='chapter-time-pill';t.textContent='约 '+mins+' 分钟';wrap.appendChild(t);}
  if(scene){const s=document.createElement('span');s.className='chapter-scene-pill';s.textContent='动画 '+scene;wrap.appendChild(s);}
  if(isDone){
   const b=document.createElement('span');b.className='chapter-status-pill is-done';b.textContent='✓ 已读';wrap.appendChild(b);
   link.dataset.readingState='done';
  }else if(prog){
   const b=document.createElement('span');b.className='chapter-status-pill is-active';b.textContent='阅读中';wrap.appendChild(b);
   link.dataset.readingState='active';
  }
  if(wrap.childNodes.length)link.appendChild(wrap);
 }
 if(isOutline){
  for(const detail of document.querySelectorAll('details[data-directory-module]')){
   const links=[...detail.querySelectorAll('.outline-chapter')];
   if(!links.length)continue;
   const doneInMod=links.filter(l=>l.dataset.readingState==='done').length;
   const activeInMod=links.filter(l=>l.dataset.readingState==='active').length;
   if(doneInMod||activeInMod){
    const badge=document.createElement('em');
    badge.className='outline-module-progress';
    badge.textContent=(doneInMod?'已读 '+doneInMod+'/'+links.length:'')+(doneInMod&&activeInMod?' · ':'')+(activeInMod?'进行中 '+activeInMod:'');
    detail.querySelector(':scope > summary')?.appendChild(badge);
    if(activeInMod&&!location.hash)detail.open=true;
   }
  }
 }
}
function initReadingComfort(){
 if(typeof document.createElement!=='function')return; // Static rendering has no browser DOM.
 comfortAbort?.abort();
 const article=document.querySelector('.doc-layout .article'),root=document.documentElement;
 const preference=readStore('infraguide-reading',{large:false,focus:false});
 root.classList.toggle('reading-large',!!article&&preference.large===true);
 root.classList.toggle('reading-focus',!!article&&preference.focus===true);
 if(!article){
  root.classList.remove('reading-controls-ready');
  initCollectionWorkbench();
  return;
 }
 comfortAbort=new AbortController();
 const signal=comfortAbort.signal;
 // The sticky toolbar replaces the repeated inline mobile contents only when it works.
 root.classList.add('reading-controls-ready');
 const toolbar=article.querySelector('.reading-toolbar');
 initReadingConceptReturn(article,toolbar);
 initReadingGateReturn(toolbar);
 initChapterCompanionTools(article,toolbar,signal);
 const buttons={large:toolbar.querySelector('[data-reader-large]'),focus:toolbar.querySelector('[data-reader-focus]')};
 function sync(){
  buttons.large.setAttribute('aria-pressed',root.classList.contains('reading-large'));
  buttons.large.title=root.classList.contains('reading-large')?'当前大字，点击恢复标准字号':'当前标准字号，点击放大';
  buttons.focus.setAttribute('aria-pressed',root.classList.contains('reading-focus'));
  buttons.focus.textContent=root.classList.contains('reading-focus')?'退出专注':'专注阅读';
 }
 sync();
 function change(key){
  root.classList.add('reading-reflow');
  const line=toolbar.getBoundingClientRect().bottom+12;
  const anchor=[...article.querySelectorAll('h1,h2,h3,p,.table-wrap,figure,.code-block')].find(el=>!el.closest('details:not([open])')&&el.getClientRects().length&&el.getBoundingClientRect().bottom>line);
  const before=anchor?.getBoundingClientRect().top;
  root.classList.toggle('reading-'+key);
  writeStore('infraguide-reading',{large:root.classList.contains('reading-large'),focus:root.classList.contains('reading-focus')});
  sync();
  if(anchor)window.scrollTo({top:window.scrollY+anchor.getBoundingClientRect().top-before,behavior:'instant'});
  root.classList.remove('reading-reflow');
  updateCurrent();
 }
 buttons.large.addEventListener('click',()=>change('large'),{signal});
 buttons.focus.addEventListener('click',()=>change('focus'),{signal});

 const navLinks=[...document.querySelectorAll('.toc a')];
 const desktopTargets=new Map(navLinks.filter(link=>link.dataset.toc).map(link=>[link.dataset.toc,link]));
 // The static track entry carries the same outline without any request query.
 if(article.querySelector(':scope > .track-entry-overview')){
  const current=location.pathname+location.search;
  for(const [id,link] of desktopTargets)link.setAttribute('href',current+'#'+encodeURIComponent(id));
 }
 const sections=[...article.querySelectorAll('.concept-path[id],.article-section[id],.knowledge-point[id],.knowledge-examples[id],.field-concept-map[id],.chapter-lab-links[id],.article-section h3[id],.article-section h4[id]')].filter(el=>el.matches('h3,h4')?desktopTargets.has(el.id)||!el.closest('details'):el.querySelector('h2,summary'));
 // Authored details can have public fragments without adding entries to the outline.
 const optionalDetails=[...article.querySelectorAll('.article-section[id] details:not(.article-case)')]
  .filter(detail=>detail.id||detail.querySelector('h3,h4,[id]'))
  .map(detail=>({detail,section:detail.closest('.article-section[id]'),summary:detail.querySelector(':scope > summary')}));
 const directory=document.createElement('dialog');
 directory.className='reader-dialog reader-directory';
 directory.setAttribute('aria-labelledby','reader-directory-title');
 directory.innerHTML='<div class="reader-dialog-head"><h2 id="reader-directory-title">本页目录</h2><button type="button" data-reader-close aria-label="关闭目录">关闭 <span aria-hidden="true">×</span></button></div><nav class="reader-directory-links" aria-label="本页知识点"></nav>';
 const directoryNav=directory.querySelector('nav');
 const directoryCaseLinks=[];
 for(const section of sections){
  const link=document.createElement('a');
  const desktopTarget=desktopTargets.get(section.id);
  link.href=desktopTarget?.getAttribute('href')||location.pathname+location.search+'#'+section.id;
  const heading=section.matches('h3,h4')?section:section.querySelector('h2,summary');
  const outlineLabel=section.id==='concept-path'||section.matches('.chapter-lab-links,.applied-exercise,.references');
  link.textContent=(outlineLabel?desktopTarget||heading:heading).textContent.trim().replace(/^(\d{2})(?=\D)/,'$1 · ');
  link.dataset.readerTarget=section.id;
  if(section.matches('h3,h4'))link.classList.add('reader-subheading-'+section.tagName.slice(1));
  const caseBody=section.closest('details.article-case');
  if(caseBody){
   link.hidden=!caseBody.open;
   directoryCaseLinks.push({link,caseBody});
  }
  link.addEventListener('click',event=>{event.preventDefault();closeModal(directory);history.pushState(null,'',link.getAttribute('href'));
   // A directory target may live inside the optional practice/further-reading block.
   // pushState does not fire hashchange, so reveal it before attempting to scroll.
   for(let parent=section;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   const child=section.querySelector(':scope > details.article-case');if(child)child.open=true;
   section.scrollIntoView({behavior:'instant',block:'start'});section.setAttribute('tabindex','-1');section.focus({preventScroll:true});updateCurrent();},{signal});
  directoryNav.appendChild(link);
 }
 // Prerequisite pages without numbered sections still have the top-level map.
 if(!sections.length){const link=document.createElement('a');link.href=location.pathname+location.search+'#main';link.textContent=article.querySelector('h1').textContent;link.onclick=()=>closeModal(directory);directoryNav.appendChild(link);}
 const sidebar=document.querySelector('.sidebar');
 let chapters;
 if(sidebar){
  const overview=sidebar.querySelector('[data-track-overview]')?.cloneNode(true);
  if(overview){
   overview.classList.remove('side-home');
   overview.addEventListener('click',()=>closeModal(directory),{signal});
   directoryNav.prepend(overview);
  }
  chapters=document.createElement('details');chapters.className='reader-chapters';
  const summary=document.createElement('summary');summary.textContent='切换本方向章节';chapters.appendChild(summary);
  const chapterList=document.createElement('div');chapterList.className='reader-chapter-list';
  for(const group of sidebar.querySelectorAll('details'))chapterList.appendChild(group.cloneNode(true));
  chapters.appendChild(chapterList);directoryNav.before(chapters);
  const currentChapter=chapterList.querySelector('[aria-current="page"]');
  chapters.addEventListener('toggle',()=>{
   if(!chapters.open||!currentChapter)return;
   const item=currentChapter.getBoundingClientRect();
   const top=summary.getBoundingClientRect().bottom,bottom=chapters.getBoundingClientRect().bottom;
   if(item.top<top||item.bottom>bottom)chapters.scrollTop+=(item.top+item.bottom-top-bottom)/2;
  },{signal});
 }
 document.body.appendChild(directory);
 toolbar.querySelector('[data-reader-contents]').addEventListener('click',openDirectory,{signal});

 function openDirectory(){
  updateCurrent();
  if(chapters)chapters.open=false;
  document.body.classList.add('reader-modal-open');
  directory.showModal();
  const current=directoryNav.querySelector('[aria-current="location"]:not([hidden])');
  if(!current)return;
  const item=current.getBoundingClientRect();
  const frame=directoryNav.getBoundingClientRect();
  if(item.top<frame.top||item.bottom>frame.bottom){
   directoryNav.scrollTop+=(item.top+item.bottom-frame.top-frame.bottom)/2;
  }
  current.focus({preventScroll:true});
 }
 function unlockModal(){if(!document.querySelector('dialog.reader-dialog[open]'))document.body.classList.remove('reader-modal-open');}
 function closeModal(dialog){dialog.close();unlockModal();}
 for(const dialog of [directory]){
  dialog.querySelector('[data-reader-close]').addEventListener('click',()=>closeModal(dialog),{signal});
  dialog.addEventListener('close',unlockModal,{signal});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal(dialog);}},{signal});
 }
 signal.addEventListener('abort',()=>{directory.close();directory.remove();unlockModal();},{once:true});

 function linkTarget(link){const url=new URL(link.href,location.href),section=url.searchParams.get('section'),id=url.hash?decodeURIComponent(url.hash.slice(1)):section?(/^\d+$/.test(section)?'section-'+section:section):'';if(url.pathname!==location.pathname&&!article.contains(document.getElementById(id)))return '';return id;}
 const targets=new Map(navLinks.map(link=>[link,linkTarget(link)]));
 const updateProgress=initReadingProgress(article,toolbar,signal);
 const rememberPosition=initReadingResume(toolbar,sections,signal);
 const directoryLinks=[...directoryNav.querySelectorAll('[data-reader-target]')];
 let queued=false,lastActive='';
 function updateCurrent(){
  queued=false;
  const edge=toolbar.getBoundingClientRect().bottom+48;
  let active=sections[0]?.id||'';
  for(const section of sections){if(section.closest('details:not([open])')||!section.getClientRects().length)continue;if(section.getBoundingClientRect().top<=edge)active=section.id;else break;}
  const optional=optionalDetails.find(({detail,summary})=>!detail.closest('details:not([open])')&&detail.getClientRects().length&&
   (summary||detail).getBoundingClientRect().bottom<=edge&&detail.getBoundingClientRect().bottom>edge);
  if(optional)active=optional.section.id;
  for(const {link,caseBody} of directoryCaseLinks)link.hidden=!caseBody.open;
  updateProgress();
  if(active===lastActive)return;lastActive=active;
  if(window.scrollY>0)rememberPosition(active);
  for(const link of navLinks){
   const current=targets.get(link)===active;
   link.classList.toggle('active',current);
   if(!current){link.removeAttribute('aria-current');continue;}
   link.setAttribute('aria-current','location');
   const caseGroup=link.closest('.chapter-toc-case-details');
   if(caseGroup){
    caseGroup.open=true;
    const toc=caseGroup.closest('.toc'),frame=toc.getBoundingClientRect(),item=link.getBoundingClientRect();
    if(item.top<frame.top)toc.scrollTop+=item.top-frame.top;
    else if(item.bottom>frame.bottom)toc.scrollTop+=item.bottom-frame.bottom;
   }
  }
  for(const link of directoryLinks){if(link.dataset.readerTarget===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(updateCurrent);}}
 window.addEventListener('scroll',schedule,{passive:true,signal});
 window.addEventListener('resize',schedule,{passive:true,signal});
 article.addEventListener('toggle',schedule,{capture:true,signal});
 schedule();
}
