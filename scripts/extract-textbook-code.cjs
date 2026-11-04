// Keep downloadable examples identical to the rendered lesson source.
const fs=require('fs'),vm=require('vm'),path=require('path');
const dist=path.resolve(__dirname,'../dist');
const shell=fs.readFileSync(path.resolve(__dirname,'../src/page-shell.html'),'utf8');
const context={};vm.createContext(context);
for(const [,file] of shell.matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;
 vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context,{filename:file});
}
const decode = value=>value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const folder=path.join(dist,'labs/cloud-foundations');fs.mkdirSync(folder,{recursive:true});
for(const id of ['virtual-memory-oom','concurrency-pools','database-index-locks','cache-consistency','roofline-model']){
 const article=vm.runInContext('articles.find(a=>a.id==='+JSON.stringify(id)+')',context);
 const snippets=[...article.sections.map(section=>section[1]).join('').matchAll(/<div class="code-toolbar">([\s\S]*?)<\/div><pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)]
   .filter(match=>match[1].includes('PYTHON')).map(match=>decode(match[2]));
 if(snippets.length!==1)throw new Error(id+': expected one full Python example');
 fs.writeFileSync(path.join(folder,id+'.py'),snippets[0]+'\n');
}
console.log('Extracted five exact Python examples.');
