const fs=require('fs'),vm=require('vm'),assert=require('assert');
const files=['content','lab-files','training-content','training-advanced','training-exercises'];
const context={};vm.createContext(context);
for(const file of files)vm.runInContext(fs.readFileSync('dist/'+file+'.js','utf8'),context);
const result=vm.runInContext(`({
  articles:articles.map(a=>({id:a.id,module:a.module,refs:a.refs,sections:a.sections.length,number:a.number})),
  sourceKeys:Object.keys(sources),
  modules:modules.map(m=>m.id),
  training:trainingChapters.map(a=>a.number)
})`,context);
assert.equal(result.articles.length,20);
assert.equal(new Set(result.articles.map(a=>a.id)).size,20);
assert.equal(result.training.length,10);
for(const a of result.articles){assert(result.modules.includes(a.module));for(const ref of a.refs)assert(result.sourceKeys.includes(ref),a.id+': '+ref)}
for(let i=0;i<10;i++)assert.equal(result.training[i],'6.'+(i+1));
console.log('Content integrity: 20 unique articles, 10 ordered training chapters, all reference keys resolved.');

