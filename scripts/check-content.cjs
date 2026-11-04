const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const html=fs.readFileSync('dist/index.html','utf8');
const scripts=[...html.matchAll(/<script defer src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
const context={};vm.createContext(context);
for(const file of scripts){const code=fs.readFileSync('dist/'+file,'utf8');new vm.Script(code,{filename:file});if(file!=='app.js')vm.runInContext(code,context,{filename:file})}
const data=vm.runInContext('({articles,sources,modules,trackDefinitions,systemLabFiles,systemLabValidation,labFiles,labValidation,problemItems,studyMap,interviewQuestions})',context);
assert.equal(data.articles.length,60);assert.equal(new Set(data.articles.map(a=>a.id)).size,60);
assert.equal(new Set(data.articles.map(a=>a.number)).size,60);
const ids=new Set(data.articles.map(a=>a.id));
for(const a of data.articles){
 assert(data.modules.some(m=>m.id===a.module),a.id+': module');
 assert(a.prereq&&a.objectives.length>=3&&a.check.length>=3&&a.sections.length>=5&&a.exercise.length===2,a.id+': complete chapter');
 for(const ref of a.refs){assert(data.sources[ref],a.id+': source '+ref);assert(new URL(data.sources[ref][1]).protocol==='https:')}
 for(const id of a.related||[])assert(ids.has(id),a.id+': related '+id);
 const body=a.sections.flat().join('');
 for(const m of body.matchAll(/href="#\/article\/([^"?]+)[^"]*"/g))assert(ids.has(m[1]),a.id+': link '+m[1]);
 for(const m of body.matchAll(/(?:src|href)="((?:diagrams|labs)\/[^"#?]+)"/g))assert(fs.existsSync('dist/'+m[1]),a.id+': asset '+m[1]);
}
for(const [track,t] of Object.entries(data.trackDefinitions)){assert(ids.has(t.start));assert.equal(data.articles.filter(a=>t.modules.includes(a.module)).length,{cloud:22,ai:25,agent:10}[track])}
for(const [,,id] of data.problemItems)assert(ids.has(id));
for(const [name,source] of Object.entries(data.systemLabFiles))assert.equal(source,fs.readFileSync('dist/labs/systems/'+name,'utf8'),name+': embedded source');
for(const [name,sha] of Object.entries(data.systemLabValidation.source_sha256))assert.equal(sha,crypto.createHash('sha256').update(fs.readFileSync('dist/labs/systems/'+name)).digest('hex'),name+': evidence hash');
const slo=vm.runInContext('sloCalculation(1000,989,99)',context);assert(Math.abs(slo.burn-1.1)<1e-10);assert(Math.abs(slo.remaining+1)<1e-10);assert(vm.runInContext('sloCalculation(0,0,99).empty',context));assert(vm.runInContext('sloCalculation(1,2,99).error',context));assert(vm.runInContext('sloCalculation(1,1,100).error',context));
const kv=vm.runInContext('kvCalculation(32,8,128,2,4096,16)',context);assert.equal(kv.totalGiB,8);assert.equal(kv.perRequestGiB,.5);assert(vm.runInContext('kvCalculation(32,8,128,2,0,16).error',context));assert(vm.runInContext('kvCalculation(1e6,1e6,1e6,1e6,1e6,1e6).error',context));
console.log('PASS: 60 chapters passed structural checks; 22 Cloud / 25 AI / 10 Agent / 3 shared; links, references, assets, embedded source, evidence hashes and calculator boundaries.');

assert.equal(data.studyMap.length,3);
assert.equal(data.studyMap.flatMap(t=>t.items).length,12);
assert.equal(data.interviewQuestions.length,12);
assert.equal(new Set(data.interviewQuestions.map(q=>q.id)).size,12);
for(const t of data.studyMap){assert.equal(t.items.length,4);for(const [,,id] of t.items)assert(ids.has(id),'overview chapter '+id)}
for(const q of data.interviewQuestions){assert(ids.has(q.article),'interview chapter '+q.article);assert(data.trackDefinitions[q.track]);for(const k of ['q','lead','mechanism','example','boundary','follow'])assert(q[k].length>8,q.id+': '+k)}
console.log('PASS: 12 overview topics and 12 complete interview prompts link to existing deep chapters.');
