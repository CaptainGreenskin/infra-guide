const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const base='/infra-guide/',root=path.resolve('.pages/infra-guide');let pages=0,links=0;
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){walk(file);continue;}if(!item.name.endsWith('.html'))continue;pages++;const html=fs.readFileSync(file,'utf8');assert(!html.includes('href="/infra-guide/infra-guide/'));if(item.name!=='404.html')assert(html.includes('<base href="'+base+'">'));
 assert(html.includes('https://github.com/CaptainGreenskin/infra-guide')||item.name==='404.html');
 for(const [,raw]of html.matchAll(/(?:href|src)="([^"]+)"/g)){if(/^(?:https?:|data:|mailto:|tel:)/.test(raw))continue;const url=new URL(raw.replaceAll('&amp;','&'),'https://captaingreenskin.github.io'+base);assert(url.pathname.startsWith(base),raw);let target=path.join(root,decodeURIComponent(url.pathname.slice(base.length)));if(url.pathname.endsWith('/'))target=path.join(target,'index.html');assert(fs.existsSync(target),raw+' -> '+target);if(url.hash&&target.endsWith('.html')){const id=decodeURIComponent(url.hash.slice(1));const dest=fs.readFileSync(target,'utf8');assert(dest.includes('id="'+id+'"'),raw+': missing fragment');}links++;}
}}
walk(root);assert.equal(pages,102);
for(const basePath of ['/','/infra-guide/']){
 const c={document:{querySelector:()=>({getAttribute:()=>basePath})},location:{pathname:basePath+'article/model-serving/'}};vm.createContext(c);vm.runInContext(fs.readFileSync('dist/site-routing.js','utf8'),c);vm.runInContext(fs.readFileSync('dist/reader-experience.js','utf8'),c);
 assert.equal(vm.runInContext("publicRoute('#/module/training?section=2')",c),basePath+'module/training/?section=2');
 assert.equal(vm.runInContext('documentPathname()',c),'/article/model-serving/');
 assert.equal(vm.runInContext("hostedPath('https://example.com/')",c),'https://example.com/');
 assert.equal(vm.runInContext("hostedPath('//example.com/')",c),'//example.com/');
 assert.equal(vm.runInContext("hostedPath(hostedPath('/article/model-serving/'))",c),basePath+'article/model-serving/');
}
console.log('PASS: '+pages+' Pages HTML files / '+links+' local links/assets, public repository entry and both root/subpath routing.');
