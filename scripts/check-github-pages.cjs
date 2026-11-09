const inventory=require('./content-inventory.cjs');
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const base='/infra-guide/',root=path.resolve('.pages/infra-guide');let pages=0,links=0;
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory()){walk(file);continue;}if(!item.name.endsWith('.html'))continue;pages++;const html=fs.readFileSync(file,'utf8');assert(!html.includes('href="/infra-guide/infra-guide/'));if(item.name!=='404.html')assert(html.includes('<base href="'+base+'">'));
 assert(html.includes('https://github.com/CaptainGreenskin/infra-guide')||item.name==='404.html');
 for(const [,raw]of html.matchAll(/(?:href|src)="([^"]+)"/g)){if(/^(?:https?:|data:|mailto:|tel:)/.test(raw))continue;const url=new URL(raw.replaceAll('&amp;','&'),'https://captaingreenskin.github.io'+base);assert(url.pathname.startsWith(base),raw);let target=path.join(root,decodeURIComponent(url.pathname.slice(base.length)));if(url.pathname.endsWith('/'))target=path.join(target,'index.html');assert(fs.existsSync(target),raw+' -> '+target);if(url.hash&&target.endsWith('.html')){const id=decodeURIComponent(url.hash.slice(1));const dest=fs.readFileSync(target,'utf8');assert(dest.includes('id="'+id+'"'),raw+': missing fragment');}links++;}
}}
walk(root);assert.equal(pages,inventory.pages);
const crypto=require('crypto'),reader=JSON.parse(fs.readFileSync(path.join(root,'reader-runtime-manifest.json'),'utf8'));
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const readerAssets=fs.readdirSync(path.join('dist','reader-assets'),{withFileTypes:true});
for(const asset of readerAssets){
 const file=path.join('reader-assets',asset.name);
 const fingerprint=asset.name.match(/\.([a-f0-9]{12})\.(?:js|json)$/)?.[1];
 assert(asset.isFile()&&fingerprint,file+': expected an immutable reader asset');
 const source=fs.readFileSync(path.join('dist',file));
 assert.equal(digest(source).slice(0,12),fingerprint,file+': filename must match its bytes');
 assert(source.equals(fs.readFileSync(path.join(root,file))),file+': keep earlier reader URLs byte-for-byte');
}
for(const asset of reader.assets){const data=fs.readFileSync(path.join(root,asset.file));assert.equal(digest(data),asset.sha256,asset.file+': Pages reader bytes must retain their hash');assert.equal(data.length,asset.bytes);assert(asset.file.includes('.'+asset.sha256.slice(0,12)+'.'));assert(data.equals(fs.readFileSync(path.join('dist',asset.file))),asset.file+': no reader JSON/JS origin drift');}
for(const id of inventory.ids){
 const html=fs.readFileSync(path.join(root,'article',id,'index.html'),'utf8'),template=html.match(/<template id="reader-full-runtime">([\s\S]*?)<\/template>/);
 assert(template,id+': Pages fallback template');
 const active=html.replace(template[0],'');assert.equal([...active.matchAll(/<script\b[^>]*\bsrc="/g)].length,1,id+': one active Pages bootstrap');
 const fallbacks=[...template[1].matchAll(/src="([^"]+)"/g)];assert.equal(fallbacks.length,9);
 for(const[,src]of fallbacks){const url=new URL(src,'https://captaingreenskin.github.io'+base),file=path.join(root,url.pathname.slice(base.length));assert.equal(url.searchParams.get('v'),digest(fs.readFileSync(file)).slice(0,12),id+': fallback fingerprint survives Pages rewriting');}
}

for(const basePath of ['/','/infra-guide/']){
 const c={document:{querySelector:()=>({getAttribute:()=>basePath})},location:{pathname:basePath+'article/model-serving/'}};vm.createContext(c);vm.runInContext(fs.readFileSync('dist/site-routing.js','utf8'),c);vm.runInContext(fs.readFileSync('dist/reader-experience.js','utf8'),c);
 assert.equal(vm.runInContext("publicRoute('#/module/training?section=2')",c),basePath+'module/training/?section=2');
 assert.equal(vm.runInContext('documentPathname()',c),'/article/model-serving/');
 assert.equal(vm.runInContext("hostedPath('https://example.com/')",c),'https://example.com/');
 assert.equal(vm.runInContext("hostedPath('//example.com/')",c),'//example.com/');
 assert.equal(vm.runInContext("hostedPath(hostedPath('/article/model-serving/'))",c),basePath+'article/model-serving/');
}
console.log('PASS: '+pages+' Pages HTML files / '+links+' local links/assets, '+readerAssets.length+' immutable reader assets, public repository entry and both root/subpath routing.');
