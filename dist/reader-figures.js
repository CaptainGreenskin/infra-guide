/* A figure can open before the article runtime attaches. Keep its SVG link usable. */
(()=>{
 const figureSelector='#main .training-figure',svgLink='a[href*=".svg"]:not([download])';
 let view,opener;

 function createView(){
  const dialog=document.createElement('dialog');
  if(typeof dialog.showModal!=='function')return;
  dialog.className='reader-dialog reader-figure-dialog';
  dialog.setAttribute('aria-labelledby','reader-figure-title');
  dialog.innerHTML='<div class="reader-dialog-head"><h2 id="reader-figure-title">图解</h2><div class="reader-zoom-controls"><button type="button" data-reader-fit>适合窗口</button><button type="button" data-reader-zoom aria-label="放大图解">放大 +</button><button type="button" data-reader-close aria-label="关闭图解">关闭 ×</button></div></div><p class="reader-pan-hint">放大后可横向和纵向滑动。</p><div class="reader-image-stage" tabindex="0" aria-label="图解，可滚动查看"><img alt=""></div><p class="reader-image-caption"></p>';
  const stage=dialog.querySelector('.reader-image-stage'),expandedImage=stage.querySelector('img');
  const caption=dialog.querySelector('.reader-image-caption');
  let scale=1,fits=true,aspect=0;
  function fit(){
   fits=true;scale=1;
   const frame=getComputedStyle(stage);
   const limit=parseFloat(frame.maxHeight)-parseFloat(frame.borderTopWidth)-parseFloat(frame.borderBottomWidth)-parseFloat(frame.paddingTop)-parseFloat(frame.paddingBottom);
   const ratio=aspect||expandedImage.naturalWidth/expandedImage.naturalHeight;
   const width=Number.isFinite(limit)&&Number.isFinite(ratio)&&ratio>0?Math.min(stage.clientWidth,Math.max(1,limit)*ratio):stage.clientWidth;
   expandedImage.style.width=width+'px';expandedImage.style.maxWidth='100%';
   expandedImage.style.maxHeight=Number.isFinite(limit)?Math.max(1,limit)+'px':'none';
   expandedImage.style.margin='0 auto';stage.scrollTo({top:0,left:0,behavior:'instant'});
  }
  dialog.querySelector('[data-reader-fit]').addEventListener('click',fit);
  dialog.querySelector('[data-reader-zoom]').addEventListener('click',()=>{
   const first=Math.max(1.5*expandedImage.getBoundingClientRect().width/stage.clientWidth,960/stage.clientWidth);
   scale=Math.min(fits?first:scale+0.5,4);fits=false;
   expandedImage.style.maxWidth='none';expandedImage.style.maxHeight='none';expandedImage.style.margin='0';expandedImage.style.width=(scale*100)+'%';
  });
  expandedImage.addEventListener('load',()=>{if(dialog.open&&fits)fit();});
  window.addEventListener('resize',()=>{if(dialog.open&&fits)fit();});
  dialog.querySelector('[data-reader-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
   if(event.target!==dialog)return;
   const box=dialog.getBoundingClientRect();
   if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{
   if(dialog.open)return;
   const previous=opener;opener=null;
   if(document.querySelector('dialog.reader-dialog[open]'))return;
   document.body.classList.remove('reader-modal-open');
   if(previous?.isConnected)previous.focus({preventScroll:true});
  });
  document.body.appendChild(dialog);
  return {dialog,fit,load(image,figure){
   expandedImage.src=image.currentSrc||image.src;
   expandedImage.alt=image.alt;
   const width=Number(image.getAttribute('width'))||image.naturalWidth,height=Number(image.getAttribute('height'))||image.naturalHeight;
   aspect=width>0&&height>0?width/height:0;
   caption.textContent=figure.querySelector('figcaption')?.childNodes[0]?.textContent.trim()||image.alt;
  }};
 }

 function activate(event){
  if(event.defaultPrevented||event.button>0||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const target=event.target,figure=target?.closest?.(figureSelector);
  if(!figure)return;
  const link=target.closest('a');
  if(link&&(!figure.contains(link)||!link.matches(svgLink)))return;
  const image=link?link.querySelector('img'):target.closest('img');
  if(!image||image.closest(figureSelector)!==figure)return;
  view??=createView();
  if(!view||view.dialog.open)return;
  view.load(image,figure);
  try{view.dialog.showModal();}catch{return;}
  opener=link||image;
  event.preventDefault();
  document.body.classList.add('reader-modal-open');
  view.fit();
 }
 document.addEventListener('click',activate);
 document.addEventListener('keydown',event=>{
  if(event.repeat||(event.key!=='Enter'&&event.key!==' '))return;
  if(event.target?.matches?.(figureSelector+' img[role="button"]')&&!event.target.closest('a'))activate(event);
 });

 function enhanceOpeners(){
  if(typeof HTMLDialogElement!=='function'||typeof HTMLDialogElement.prototype.showModal!=='function')return;
  for(const image of document.querySelectorAll(figureSelector+' img')){
   const link=image.closest('a');
   if(link&&!link.matches(svgLink))continue;
   const trigger=link||image;
   trigger.setAttribute('aria-haspopup','dialog');
   image.style.cursor='zoom-in';
   if(!link){
    image.tabIndex=0;
    image.setAttribute('role','button');
    image.setAttribute('aria-label','放大：'+image.alt);
   }
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhanceOpeners,{once:true});
 else enhanceOpeners();
 window.addEventListener('infra-ready',enhanceOpeners);
})();
