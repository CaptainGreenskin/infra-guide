const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('dist/site-recovery.js','utf8');
function fixture(initiallyReady=false){
 const root=new Map(initiallyReady?[['data-site-ready','true']]:[]),domEvents=new Map(),windowEvents=new Map();let reloads=0,focused=null;
 class Node{constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.events={};}setAttribute(k,v){this.attributes[k]=v;}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}addEventListener(k,handler){this.events[k]=handler;}focus(){focused=this;}}
 const body=new Node('body');const find=(node,id)=>node.id===id?node:node.children.map(n=>find(n,id)).find(Boolean);
 const document={documentElement:{hasAttribute:k=>root.has(k)},body,getElementById:id=>find(body,id),createElement:tag=>new Node(tag),addEventListener:(type,handler)=>domEvents.set(type,handler)};
 const window={addEventListener:(type,handler)=>windowEvents.set(type,handler)};
 const c={document,window,location:{reload:()=>reloads++}};vm.createContext(c);vm.runInContext(source,c);
 return {body,root,domEvents,windowEvents,loaded:()=>domEvents.get('DOMContentLoaded')(),banner:()=>find(body,'site-recovery'),reloads:()=>reloads,focused:()=>focused};
}
const healthy=fixture(true);healthy.loaded();assert.equal(healthy.banner(),undefined);
const broken=fixture();broken.loaded();const banner=broken.banner();assert(banner);assert.equal(banner.attributes.role,'status');assert(banner.children[0].textContent.includes('正文仍可阅读'));
const retry=banner.children.find(n=>n.textContent==='重新载入'),dismiss=banner.children.find(n=>n.textContent==='继续阅读');assert.equal(broken.focused(),retry);
retry.events.click();assert.equal(broken.reloads(),1);assert(broken.banner());
dismiss.events.click();assert.equal(broken.banner(),undefined);
const recovered=fixture();recovered.loaded();recovered.root.set('data-site-ready','true');recovered.windowEvents.get('infra-ready')();assert.equal(recovered.banner(),undefined);
assert.equal((fs.readFileSync('src/page-shell.html','utf8').match(/src="site-recovery.js"/g)||[]).length,1);
assert(fs.readFileSync('dist/app.js','utf8').includes("route();document.documentElement.setAttribute?.('data-site-ready','true')"));
const server=fs.readFileSync('scripts/serve-startup-fault.py','utf8');assert(server.includes("('127.0.0.1',args.port)"));assert(server.includes("self.send_error(503"));assert(server.includes("self.server.failed_once=True"));
console.log('PASS: startup failure keeps static reading, healthy startup stays quiet, recovery reload/dismiss/focus and ready cleanup; actual one-shot HTTP503 browser fixture is local-only.');
