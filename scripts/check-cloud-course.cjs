// Relationships and source provenance added in this iteration.
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const ctx={};vm.createContext(ctx);
for(const [,file] of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),ctx);
const {articles,publicInterviewSamples,cloudModulePlan}=vm.runInContext('({articles,publicInterviewSamples,cloudModulePlan})',ctx);
const ids=new Set(articles.map(a=>a.id));
assert.equal(cloudModulePlan.length,10);
assert.equal(cloudModulePlan.flatMap(row=>row[7]).length,28);
for(const [module,n,,,,,,chapters] of cloudModulePlan)chapters.forEach((id,index)=>{const a=articles.find(a=>a.id===id);assert.equal(a.module,module);assert.equal(a.number,n+'.'+(index+1));});
assert.equal(publicInterviewSamples.length,15);
assert.equal(new Set(publicInterviewSamples.map(s=>s.url)).size,14);
assert.equal(publicInterviewSamples.reduce((n,s)=>n+s.questions.length,0),29);
for(const sample of publicInterviewSamples){assert(new URL(sample.url).protocol==='https:');assert(sample.role&&sample.date&&sample.interview);for(const question of sample.questions){assert(ids.has(question[2]));assert(question[3].length>25&&question[4].length>12);}}
assert.equal(publicInterviewSamples.filter(s=>s.historical).length,1);
assert.equal(publicInterviewSamples.filter(s=>s.uncertain).length,1);
const record=JSON.parse(fs.readFileSync('dist/labs/cloud-native/validation.json','utf8'));
assert.equal(record.status,'passed');assert.equal(record.checks.length,7);
for(const [file,sha] of Object.entries(record.source_sha256))assert.equal(sha,crypto.createHash('sha256').update(fs.readFileSync('dist/labs/cloud-native/'+file)).digest('hex'),file);
const schema=JSON.parse(fs.readFileSync('dist/labs/cloud-native/schema-check.json','utf8'));
assert.equal(schema.objects.length,7);assert.equal(schema.status,'passed');
const page=fs.readFileSync('dist/interview/experiences/index.html','utf8');
assert.equal((page.match(/class="experience-question"/g)||[]).length,29);
assert.equal((page.match(/class="experience-source"/g)||[]).length,15);
for(const id of ['container-runtime','k8s-workloads','k8s-networking','k8s-storage','k8s-autoscaling','serverless-execution']){
 const a=articles.find(a=>a.id===id);assert(a.sections.length>=7&&a.refs.length>=3);assert(a.textbook&&a.updated==='2026.11.04');
}
console.log('PASS: P0 prerequisites + 9 Cloud fields / 28 chapters, 15 role samples / 14 sources / 29 review groups, 7 source-matched local checks and 7 offline-validated Kubernetes objects.');
