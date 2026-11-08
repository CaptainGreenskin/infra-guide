/* Read the canonical authored articles at an immutable published commit. No checkout mutation. */
const cp=require('child_process'),vm=require('vm');
module.exports=function articlesAtCommit(commit){
 if(!/^[0-9a-f]{40}$/.test(commit))throw Error('A full immutable commit SHA is required');
 const read=file=>cp.execFileSync('git',['show',commit+':'+file],{encoding:'utf8',maxBuffer:16*1024*1024});
 const c={};vm.createContext(c);
 for(const[,file]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(read('dist/'+file),c,{filename:file});
 return JSON.parse(JSON.stringify(vm.runInContext('articles',c)));
};
