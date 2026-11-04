const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const c={};vm.createContext(c);
for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({cloudKnowledgeDomains,cloudKnowledgeExplanations,cloudOpsLabFiles,cloudOpsLabValidation,cloudLearningStages,cloudStageFields,cloudStageGates,cloudModulePlan,articles})',c);
assert.equal(d.cloudKnowledgeDomains.flatMap(domain=>domain.points).length,62);
for(const domain of d.cloudKnowledgeDomains)for(const [point]of domain.points)assert(d.cloudKnowledgeExplanations[point]?.includes('<p>'),point+': missing explanation');
for(const [id,count]of [['cloud-security',6],['cloud-capacity',5],['sre',7]]){
 const domain=d.cloudKnowledgeDomains.find(domain=>domain.module===id);assert.equal(domain.points.length,count);
 const html=fs.readFileSync('dist/module/'+id+'/index.html','utf8');
 for(const [point]of domain.points)assert(html.indexOf('id="knowledge-'+point+'"')<html.indexOf('id="field-lab"'));
 assert(html.includes('labs/cloud-operations.zip'));assert(html.includes('labs/cloud-operations/validation.json'));
 assert((html.match(/<figure /g)||[]).length>=3);
}
const record=JSON.parse(fs.readFileSync('dist/labs/cloud-operations/validation.json','utf8'));
assert.equal(record.status,'passed');assert.equal(Object.keys(record.programs).length,4);
for(const [name,source]of Object.entries(d.cloudOpsLabFiles)){
 assert.equal(source,fs.readFileSync('dist/labs/cloud-operations/'+name,'utf8'));
 assert.equal(record.source_sha256[name],crypto.createHash('sha256').update(source).digest('hex'),name);
}
const auth=record.programs['authorization_http_lab.py'];assert.equal(auth.cases.length,14);assert.equal(auth.writes_A,1);assert.equal(auth.writes_B,0);assert.equal(auth.audit_events,14);assert.equal(auth.credentials_logged,false);
const queue=record.programs['capacity_lab.py'];assert.equal(queue.unbounded.snapshots[0].backlog,200);assert.equal(queue.unbounded.snapshots[1].backlog,0);assert.equal(queue.bounded_160.snapshots[0].rejected,40);assert.equal(queue.cost.after_only_900_successes,.13);
const telemetry=record.programs['telemetry_lab.py'];assert.equal(telemetry.requests,3);assert.equal(telemetry.bad_requests,1);assert.equal(telemetry.backend_spans,2);assert(telemetry.parent_child_links_verified);assert.equal(telemetry.classic_bucket_counts['+Inf'],3);
const rules=record.programs['promtool_lab.py'];assert(rules.version.includes('3.5.0'));assert.equal(rules.fixture_groups,7);assert(rules.commands.every(cmd=>cmd.exit_code===0));
const sequence=d.cloudLearningStages.flatMap(stage=>stage[1]);assert.equal(new Set(sequence).size,sequence.length);
for(const id of d.cloudModulePlan.flatMap(row=>row[7]))assert(sequence.includes(id),id+': course omitted');
assert.equal(d.cloudStageFields.length,6);assert.equal(new Set(d.cloudStageFields.flat()).size,10);assert.equal(d.cloudStageGates.length,6);
const roadmap=fs.readFileSync('dist/roadmap/index.html','utf8');assert.equal((roadmap.split('id="route-cloud"')[1].split('id="route-ai"')[0].match(/class="stage-gate"/g)||[]).length,6);
const decoder=d.articles.find(a=>a.id==='transformer-block'),position=d.articles.find(a=>a.id==='position-encoding');
const first=roadmap.indexOf(decoder.number+' '+decoder.title),second=roadmap.indexOf(position.number+' '+position.title);assert(first>=0&&second>first);
const labs=fs.readFileSync('dist/labs/index.html','utf8');assert(labs.includes('labs/cloud-operations.zip'));
for(const [id,file]of [['iam-security','authorization_http_lab.py'],['elasticity','capacity_lab.py'],['observability','telemetry_lab.py'],['slo','promtool_lab.py']])assert(d.articles.find(a=>a.id===id).sections.at(-1)[1].includes(file));
console.log('PASS: 18 expanded topics, all 62 field points have explanations, 4 source-matched programs, 7 Prometheus fixtures and 6 ordered study gates.');
