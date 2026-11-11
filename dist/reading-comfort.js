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
 const [before,fragment]=path.split('#');
 const href=readerInternalHref(before+(!params.has('goal')&&learningProfiles[role]?.track===track?'&goal='+role:'')+'#'+fragment);
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
  return;
 }
 comfortAbort=new AbortController();
 const signal=comfortAbort.signal;
 // The sticky toolbar replaces the repeated inline mobile contents only when it works.
 root.classList.add('reading-controls-ready');
 const toolbar=article.querySelector('.reading-toolbar');
 initReadingConceptReturn(article,toolbar);
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
 if(sidebar){
  const overview=sidebar.querySelector('[data-track-overview]')?.cloneNode(true);
  if(overview){
   overview.classList.remove('side-home');
   overview.addEventListener('click',()=>closeModal(directory),{signal});
   directoryNav.prepend(overview);
  }
  const chapters=document.createElement('details');chapters.className='reader-chapters';
  const summary=document.createElement('summary');summary.textContent='切换本方向章节';chapters.appendChild(summary);
  const chapterList=document.createElement('div');chapterList.className='reader-chapter-list';
  for(const group of sidebar.querySelectorAll('details'))chapterList.appendChild(group.cloneNode(true));
  chapters.appendChild(chapterList);directory.appendChild(chapters);
 }
 document.body.appendChild(directory);
 toolbar.querySelector('[data-reader-contents]').addEventListener('click',openDirectory,{signal});

 function openDirectory(){
  updateCurrent();
  document.body.classList.add('reader-modal-open');
  directory.showModal();
  const current=directoryNav.querySelector('[aria-current="location"]:not([hidden])');
  if(!current)return;
  const item=current.getBoundingClientRect();
  const header=directory.querySelector('.reader-dialog-head').getBoundingClientRect();
  if(item.top<header.bottom||item.bottom>directory.getBoundingClientRect().bottom){
   current.scrollIntoView({behavior:'instant',block:'center'});
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
  if(active===lastActive)return;lastActive=active;
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
