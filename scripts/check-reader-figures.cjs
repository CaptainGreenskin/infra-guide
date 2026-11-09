/* Exercise the production delegated controller before the reading runtime exists. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const controller=new vm.Script(fs.readFileSync(path.join(__dirname,'../dist/reader-figures.js'),'utf8'));
const figureSelector='#main .training-figure';

function node(){
 const listeners=new Map(),attributes=new Map();
 return {
  style:{},isConnected:true,focusCount:0,
  setAttribute(name,value){attributes.set(name,value);},
  getAttribute(name){return attributes.get(name);},
  addEventListener(type,listener){
   if(!listeners.has(type))listeners.set(type,[]);
   listeners.get(type).push(listener);
  },
  focus(){this.focusCount++;},
  emit(type,values={}){
   const event={target:this,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...values};
   for(const listener of listeners.get(type)||[])listener(event);
   return event;
  }
 };
}

function fixture({bare=false,unsupported=false,failOpen=false}={}){
 const document=Object.assign(node(),{readyState:'loading'}),window=node();
 const image=node(),link=node(),download=node(),caption=node(),expanded=node();
 const figure={
  contains:element=>element===link||element===download,
  querySelector:selector=>selector==='figcaption'?{childNodes:[{textContent:' Figure caption '}] }:null
 };
 image.closest=selector=>selector==='a'?(bare?null:link):selector==='img'?image:selector===figureSelector?figure:null;
 image.matches=selector=>selector===figureSelector+' img[role="button"]'&&image.getAttribute('role')==='button';
 image.currentSrc='https://example.test/infra-guide/diagrams/fixture.svg';
 image.alt='Original image description';
 image.setAttribute('width','376');image.setAttribute('height','551');
 link.closest=selector=>selector==='a'?link:selector===figureSelector?figure:null;
 link.matches=selector=>selector==='a[href*=".svg"]:not([download])';
 link.querySelector=selector=>selector==='img'?image:null;
 link.setAttribute('href','diagrams/fixture.svg');link.setAttribute('target','_blank');
 download.closest=selector=>selector==='a'?download:selector===figureSelector?figure:null;
 download.matches=()=>false;
 download.setAttribute('download','');

 const calls={created:0,appended:0,opened:0,stageReset:0};
 const classes=new Set(),stage=Object.assign(node(),{
  clientWidth:400,querySelector:selector=>selector==='img'?expanded:null,scrollTo(){calls.stageReset++;}
 });
 expanded.getBoundingClientRect=()=>({width:240});
 const controls={
  '.reader-image-stage':stage,'.reader-image-caption':caption,
  '[data-reader-fit]':node(),'[data-reader-zoom]':node(),'[data-reader-close]':node()
 };
 const dialog=Object.assign(node(),{
  open:false,close(){this.open=false;this.emit('close');},
  querySelector:selector=>controls[selector],
  getBoundingClientRect:()=>({left:10,right:200,top:10,bottom:200})
 });
 if(!unsupported)dialog.showModal=function(){
  if(failOpen)throw new Error('showModal failed');
  this.open=true;calls.opened++;
 };
 document.createElement=tag=>{assert.equal(tag,'dialog');calls.created++;return dialog;};
 document.body={appendChild(element){assert.equal(element,dialog);calls.appended++;},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}};
 document.querySelector=selector=>selector==='dialog.reader-dialog[open]'&&dialog.open?dialog:null;
 document.querySelectorAll=selector=>selector===figureSelector+' img'?[image]:[];
 const HTMLDialogElement=unsupported?undefined:class{showModal(){}};
 const getComputedStyle=()=>({maxHeight:'320px',borderTopWidth:'1px',borderBottomWidth:'1px',paddingTop:'0px',paddingBottom:'0px'});
 controller.runInNewContext({document,window,HTMLDialogElement,getComputedStyle});
 return {document,window,image,link,download,caption,expanded,controls,dialog,calls,classes};
}

const early=fixture();
assert.equal(early.calls.created,0,'the head hook does not create a dialog during page parse');
for(const modifier of ['altKey','ctrlKey','metaKey','shiftKey']){
 assert.equal(early.document.emit('click',{target:early.image,[modifier]:true}).defaultPrevented,false);
}
assert.equal(early.document.emit('click',{target:early.image,button:1}).defaultPrevented,false);
assert.equal(early.document.emit('click',{target:early.download}).defaultPrevented,false);
assert.equal(early.calls.created,0,'native gestures never create a viewer');
assert.equal(early.document.emit('click',{target:early.image}).defaultPrevented,true);
assert.equal(early.dialog.open,true);
assert.equal(early.calls.appended,1);
assert.equal(early.calls.opened,1);
assert.equal(early.expanded.src,early.image.currentSrc);
assert.equal(early.expanded.alt,early.image.alt);
assert.equal(early.caption.textContent,'Figure caption');
assert.equal(early.link.getAttribute('target'),'_blank');
assert.equal(early.link.getAttribute('href'),'diagrams/fixture.svg');
assert(early.classes.has('reader-modal-open'));

early.document.emit('DOMContentLoaded');
early.window.emit('infra-ready');
early.window.emit('reader-full-runtime');
early.window.emit('infra-ready');
assert.equal(early.link.getAttribute('aria-haspopup'),'dialog');
assert.equal(early.dialog.open,true,'late startup and fallback leave an open figure in place');
assert.equal(early.calls.opened,1);
early.controls['[data-reader-zoom]'].emit('click');
assert.equal(early.expanded.style.width,'240%');
early.controls['[data-reader-fit]'].emit('click');
assert.notEqual(early.expanded.style.width,'240%');
early.dialog.emit('click',{clientX:50,clientY:50});
assert.equal(early.dialog.open,true,'clicking inside does not close the viewer');
early.dialog.emit('click',{clientX:0,clientY:0});
assert.equal(early.dialog.open,false);
assert.equal(early.link.focusCount,1);
assert(!early.classes.has('reader-modal-open'));
assert.equal(early.document.emit('click',{target:early.link}).defaultPrevented,true);
assert.equal(early.calls.appended,1,'later activation reuses the same viewer');
assert.equal(early.calls.opened,2);
early.link.isConnected=false;
early.controls['[data-reader-close]'].emit('click');
assert.equal(early.link.focusCount,1,'closing does not focus a detached opener');
assert(!early.classes.has('reader-modal-open'));

const bare=fixture({bare:true});
bare.document.emit('DOMContentLoaded');
assert.equal(bare.image.tabIndex,0);
assert.equal(bare.image.getAttribute('role'),'button');
assert.equal(bare.document.emit('keydown',{target:bare.image,key:' ',repeat:true}).defaultPrevented,false);
for(const key of ['Enter',' ']){
 assert.equal(bare.document.emit('keydown',{target:bare.image,key}).defaultPrevented,true);
 bare.dialog.close(); // Native Escape also closes the dialog and emits close.
}
assert.equal(bare.image.focusCount,2);
assert.equal(bare.calls.appended,1);

for(const options of [{unsupported:true},{failOpen:true}]){
 const failure=fixture(options);
 assert.equal(failure.document.emit('click',{target:failure.image}).defaultPrevented,false);
 assert.equal(failure.calls.opened,0);
 assert(!failure.classes.has('reader-modal-open'));
 assert.equal(failure.link.getAttribute('target'),'_blank');
}
console.log('PASS: first figure click before hydration, one dialog across late readiness and fallback, keyboard and focus, and native SVG link fallbacks.');
