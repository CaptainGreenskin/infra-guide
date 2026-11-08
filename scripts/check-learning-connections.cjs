/* Structural learning dependencies are not evidence that human readers have mastered a course. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),inventory=require('./content-inventory.cjs');
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({articles,modules,needs:chapterDependencies,optional:chapterOptionalConnections,models:learningTrackModels,stages:courseReadingStages,connections:courseStageConnections,points:cloudKnowledgeDomains.flatMap(d=>d.points.map(p=>({id:p[0],module:d.module,articles:p[4]}))).concat(infraKnowledgeDomains.flatMap(d=>d.points.map(p=>({id:p.id,module:d.module,articles:p.articles}))))})',c)));
const ids=d.articles.map(a=>a.id),byId=Object.fromEntries(d.articles.map(a=>[a.id,a]));assert.equal(ids.length,inventory.chapters);assert.deepEqual(Object.keys(d.needs).sort(),[...ids].sort());
for(const[owner,edges]of [...Object.entries(d.needs),...Object.entries(d.optional)]){assert(ids.includes(owner));for(const[id,why]of edges){assert(ids.includes(id)&&id!==owner,owner+': invalid dependency');assert(why.length>=12,owner+': explain the relationship');}}
const visiting=new Set(),done=new Set();function visit(id){assert(!visiting.has(id),id+': prerequisite cycle');if(done.has(id))return;visiting.add(id);for(const[dep]of d.needs[id])visit(dep);visiting.delete(id);done.add(id);}ids.forEach(visit);
for(const[track,stages]of Object.entries(d.stages)){
 assert.equal(d.connections[track].length,stages.length);const route=stages.flatMap(s=>s[1]);
 for(const id of route)for(const[dep]of d.needs[id])assert(route.indexOf(dep)>=0&&route.indexOf(dep)<route.indexOf(id),track+'/'+id+': unintroduced hard prerequisite '+dep);
 for(const edge of d.connections[track])assert.equal(edge.length,3);
 const model=d.models[track];assert(model.title&&model.relation&&model.exercise&&model.answer);assert(model.anchors.length>=3);
 for(const[id]of model.anchors)assert(ids.includes(id));
}
const agentReachable=new Set();function agentWalk(id){if(agentReachable.has(id))return;agentReachable.add(id);for(const[dep]of d.needs[id])agentWalk(dep);}d.articles.filter(a=>a.module==='agent').forEach(a=>agentWalk(a.id));
for(const id of agentReachable)assert(byId[id].module==='agent','Agent hard path must remain independent: '+id);
assert(d.stages.ai[3][1].includes('training-lab'));assert(!d.stages.ai[4][1].includes('training-lab'),'training capstone belongs with training and recovery');
assert.equal(d.stages.cloud[0][1][0],'cloud-overview');assert(!d.needs['config-secrets'].some(([id])=>['delivery','iam-security'].includes(id)));assert(!d.needs['kubernetes-training'].some(([id])=>id==='multinode-lab'));
for(const a of d.articles){const html=fs.readFileSync('dist/article/'+a.id+'/index.html','utf8');assert.equal((html.match(/aria-label="章节之间的概念关系"/g)||[]).length,1);assert(html.includes('在学习路线中定位这一章'));for(const[dep]of d.needs[a.id])assert(html.includes('/article/'+dep+'/'));}
const roadmap=fs.readFileSync('dist/roadmap/index.html','utf8');for(const[track,stages]of Object.entries(d.stages)){for(const id of stages.flatMap(s=>s[1]))assert(roadmap.includes('id="route-chapter-'+track+'-'+id+'"'));assert(roadmap.includes('id="synthesis-'+track+'"'));assert(roadmap.includes(d.models[track].exercise));}
const record=JSON.parse(fs.readFileSync('docs/COHERENCE_REVIEW_2026-11-08.json'));assert.equal(record.reader_trials,0);assert.equal(record.chapter_relations.length,inventory.chapters);assert.equal(record.knowledge_targets.length,inventory.points);
assert.deepEqual(record.system_models,d.models);assert.deepEqual(record.route_stages,d.stages);assert.deepEqual(record.knowledge_targets,d.points);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');for(const[file,hash]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(file)),hash,file+': unreviewed connection changes');
for(const row of record.chapter_relations){assert.deepEqual(row.required,d.needs[row.id]);assert.deepEqual(row.optional,d.optional[row.id]||[]);assert.equal(row.prereq,byId[row.id].prereq);}
console.log('PASS: '+inventory.chapters+' authored chapter dependency rows, acyclic graph, topological reading routes, independent Agent path, three system maps/synthesis tasks and exact chapter-location links. '+inventory.points+' knowledge links reviewed separately; no mastery claim from clicks or checkmarks.');
