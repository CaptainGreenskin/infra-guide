/* Shared reading controls; the document remains fully readable without JavaScript. */
function readingToolbarHTML(){return '<div class="reading-toolbar" role="group" aria-label="阅读工具"><button type="button" data-reader-contents aria-haspopup="dialog">本页目录 <span aria-hidden="true">≡</span></button><div class="reading-display"><button type="button" data-reader-large aria-pressed="false" title="切换大字阅读">大字</button><button type="button" data-reader-focus aria-pressed="false">专注阅读</button></div></div>';}

let comfortAbort;
function initReadingComfort(){
 if(typeof document.createElement!=='function')return; // Static rendering has no browser DOM.
 comfortAbort?.abort();
 const article=document.querySelector('.doc-layout .article'),root=document.documentElement;
 const preference=readStore('infraguide-reading',{large:false,focus:false});
 root.classList.toggle('reading-large',!!article&&preference.large===true);
 root.classList.toggle('reading-focus',!!article&&preference.focus===true);
 if(!article){
  root.classList.remove('reading-controls-ready');
  if(document.querySelector('.track-system-model')){comfortAbort=new AbortController();initReaderFigures(document.querySelector('#main'),comfortAbort.signal);}
  return;
 }
 comfortAbort=new AbortController();
 const signal=comfortAbort.signal;
 // The sticky toolbar replaces the repeated inline mobile contents only when it works.
 root.classList.add('reading-controls-ready');
 const toolbar=article.querySelector('.reading-toolbar');
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

 const sections=[...article.querySelectorAll('.concept-path[id],.article-section[id],.knowledge-point[id],.knowledge-examples[id]')].filter(el=>el.querySelector('h2'));
 const directory=document.createElement('dialog');
 directory.className='reader-dialog reader-directory';
 directory.setAttribute('aria-labelledby','reader-directory-title');
 directory.innerHTML='<div class="reader-dialog-head"><h2 id="reader-directory-title">本页目录</h2><button type="button" data-reader-close aria-label="关闭目录">关闭 <span aria-hidden="true">×</span></button></div><nav class="reader-directory-links" aria-label="本页知识点"></nav>';
 const directoryNav=directory.querySelector('nav');
 for(const section of sections){
  const link=document.createElement('a');
  link.href=location.pathname+location.search+'#'+section.id;
  link.textContent=section.querySelector('h2').textContent.trim().replace(/^(\d{2})(?=\D)/,'$1 · ');
  link.dataset.readerTarget=section.id;
  link.addEventListener('click',event=>{event.preventDefault();closeModal(directory);history.pushState(null,'',link.getAttribute('href'));
   // A directory target may live inside the optional practice/further-reading block.
   // pushState does not fire hashchange, so reveal it before attempting to scroll.
   for(let parent=section.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   section.scrollIntoView({behavior:'instant',block:'start'});section.setAttribute('tabindex','-1');section.focus({preventScroll:true});updateCurrent();},{signal});
  directoryNav.appendChild(link);
 }
 // Prerequisite pages without numbered sections still have the top-level map.
 if(!sections.length){const link=document.createElement('a');link.href=location.pathname+location.search+'#main';link.textContent=article.querySelector('h1').textContent;link.onclick=()=>closeModal(directory);directoryNav.appendChild(link);}
 const sidebar=document.querySelector('.sidebar');
 if(sidebar){
  const chapters=document.createElement('details');chapters.className='reader-chapters';
  const summary=document.createElement('summary');summary.textContent='切换本方向章节';chapters.appendChild(summary);
  const chapterList=document.createElement('div');chapterList.className='reader-chapter-list';
  for(const group of sidebar.querySelectorAll('details'))chapterList.appendChild(group.cloneNode(true));
  chapters.appendChild(chapterList);directory.appendChild(chapters);
 }
 document.body.appendChild(directory);
 toolbar.querySelector('[data-reader-contents]').addEventListener('click',()=>openModal(directory),{signal});

 initReaderFigures(article,signal);

 function openModal(dialog){document.body.classList.add('reader-modal-open');dialog.showModal();}
 function closeModal(dialog){dialog.close();document.body.classList.remove('reader-modal-open');}
 for(const dialog of [directory]){
  dialog.querySelector('[data-reader-close]').addEventListener('click',()=>closeModal(dialog),{signal});
  dialog.addEventListener('close',()=>document.body.classList.remove('reader-modal-open'),{signal});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal(dialog);}},{signal});
 }
 signal.addEventListener('abort',()=>{directory.close();directory.remove();document.body.classList.remove('reader-modal-open');},{once:true});

 const navLinks=[...document.querySelectorAll('.toc a')];
 function linkTarget(link){const url=new URL(link.href,location.href);if(url.pathname!==location.pathname)return '';const section=url.searchParams.get('section');return url.hash?decodeURIComponent(url.hash.slice(1)):section?(/^\d+$/.test(section)?'section-'+section:section):'';}
 const targets=new Map(navLinks.map(link=>[link,linkTarget(link)]));
 const directoryLinks=[...directoryNav.querySelectorAll('[data-reader-target]')];
 let queued=false,lastActive='';
 function updateCurrent(){
  queued=false;
  const edge=toolbar.getBoundingClientRect().bottom+48;
  let active=sections[0]?.id||'';
  for(const section of sections){if(section.getBoundingClientRect().top<=edge)active=section.id;else break;}
  if(active===lastActive)return;lastActive=active;
  for(const link of navLinks){const current=targets.get(link)===active;link.classList.toggle('active',current);if(current)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
  for(const link of directoryLinks){if(link.dataset.readerTarget===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(updateCurrent);}}
 window.addEventListener('scroll',schedule,{passive:true,signal});
 window.addEventListener('resize',schedule,{passive:true,signal});
 schedule();
}

// The same zoom/pan controls serve article figures and the whole-course maps.
function initReaderFigures(container,signal){
 const figureDialog=document.createElement('dialog');
 figureDialog.className='reader-dialog reader-figure-dialog';
 figureDialog.setAttribute('aria-labelledby','reader-figure-title');
 figureDialog.innerHTML='<div class="reader-dialog-head"><h2 id="reader-figure-title">图解</h2><div class="reader-zoom-controls"><button type="button" data-reader-fit>适合窗口</button><button type="button" data-reader-zoom aria-label="放大图解">放大 +</button><button type="button" data-reader-close aria-label="关闭图解">关闭 ×</button></div></div><p class="reader-pan-hint">放大后可横向和纵向滑动。</p><div class="reader-image-stage" tabindex="0" aria-label="图解，可滚动查看"><img alt=""></div><p class="reader-image-caption"></p>';
 document.body.appendChild(figureDialog);
 const stage=figureDialog.querySelector('.reader-image-stage'),expandedImage=stage.querySelector('img');
 let imageScale=1,imageFits=true,imageAspect=0;
 function fitFigure(){
  imageFits=true;imageScale=1;
  const frame=getComputedStyle(stage),limit=parseFloat(frame.maxHeight)-parseFloat(frame.borderTopWidth)-parseFloat(frame.borderBottomWidth)-parseFloat(frame.paddingTop)-parseFloat(frame.paddingBottom);
  const ratio=imageAspect||expandedImage.naturalWidth/expandedImage.naturalHeight;
  const width=Number.isFinite(limit)&&Number.isFinite(ratio)&&ratio>0?Math.min(stage.clientWidth,Math.max(1,limit)*ratio):stage.clientWidth;
  expandedImage.style.width=width+'px';expandedImage.style.maxWidth='100%';
  expandedImage.style.maxHeight=Number.isFinite(limit)?Math.max(1,limit)+'px':'none';
  expandedImage.style.margin='0 auto';stage.scrollTo({top:0,left:0,behavior:'instant'});
 }
 function setImageScale(scale){imageFits=false;imageScale=scale;expandedImage.style.maxWidth='none';expandedImage.style.maxHeight='none';expandedImage.style.margin='0';expandedImage.style.width=(scale*100)+'%';}
 figureDialog.querySelector('[data-reader-fit]').addEventListener('click',fitFigure,{signal});
 figureDialog.querySelector('[data-reader-zoom]').addEventListener('click',()=>{const first=Math.max(1.5*expandedImage.getBoundingClientRect().width/stage.clientWidth,960/stage.clientWidth);setImageScale(Math.min(imageFits?first:imageScale+0.5,4));},{signal});
 expandedImage.addEventListener('load',()=>{if(imageFits)fitFigure();},{signal});
 window.addEventListener('resize',()=>{if(figureDialog.open&&imageFits)fitFigure();},{signal});
 for(const figure of container.querySelectorAll('.training-figure')){
  const image=figure.querySelector('img');if(!image)continue;
  function showFigure(event){
   event.preventDefault();
   expandedImage.src=image.currentSrc||image.src;
   expandedImage.alt=image.alt;
   const sourceWidth=Number(image.getAttribute('width'))||image.naturalWidth,sourceHeight=Number(image.getAttribute('height'))||image.naturalHeight;
   imageAspect=sourceWidth>0&&sourceHeight>0?sourceWidth/sourceHeight:0;
   figureDialog.querySelector('.reader-image-caption').textContent=figure.querySelector('figcaption')?.childNodes[0]?.textContent.trim()||image.alt;
   openModal(figureDialog);
   fitFigure();
  }
  const opener=figure.querySelector('a[href*=".svg"]');
  if(opener){opener.removeAttribute('target');opener.setAttribute('aria-haspopup','dialog');const hint=opener.querySelector('.figure-zoom-hint');if(hint)hint.textContent='点击图示放大';opener.addEventListener('click',showFigure,{signal});}
  image.style.cursor='zoom-in';
  if(!opener)image.addEventListener('click',showFigure,{signal});
 }

 function openModal(dialog){document.body.classList.add('reader-modal-open');dialog.showModal();}
 function closeModal(dialog){dialog.close();document.body.classList.remove('reader-modal-open');}
 figureDialog.querySelector('[data-reader-close]').addEventListener('click',()=>closeModal(figureDialog),{signal});
 figureDialog.addEventListener('close',()=>document.body.classList.remove('reader-modal-open'),{signal});
 figureDialog.addEventListener('click',event=>{if(event.target===figureDialog){const box=figureDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeModal(figureDialog);}},{signal});
 signal.addEventListener('abort',()=>{figureDialog.close();figureDialog.remove();document.body.classList.remove('reader-modal-open');},{once:true});
}
