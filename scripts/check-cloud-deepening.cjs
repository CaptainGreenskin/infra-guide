const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const c={};vm.createContext(c);
for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({cloudKnowledgeDomains,cloudKnowledgeExplanations,cloudDeepLabFiles,cloudDeepLabValidation,articles})',c);
assert.equal(d.cloudKnowledgeDomains.flatMap(domain=>domain.points).length,62);
for(const [id,count]of [['cloud-data',8],['serverless',5],['cloud-delivery',7]]){
 const domain=d.cloudKnowledgeDomains.find(domain=>domain.module===id);
 assert.equal(domain.points.length,count);
 for(const [point]of domain.points)assert(d.cloudKnowledgeExplanations[point]?.includes('<p>'),point+': missing mechanism prose');
 const html=fs.readFileSync('dist/module/'+id+'/index.html','utf8');
 assert(html.indexOf('class="knowledge-body"')<html.indexOf('id="field-lab"'));
 for(const [point]of domain.points)assert(html.indexOf('id="knowledge-'+point+'"')<html.indexOf('id="field-lab"'));
 assert(html.includes('labs/cloud-deepening.zip')&&html.includes('labs/cloud-deepening/validation.json'));
 assert((html.match(/<figure /g)||[]).length>=3);
}
const validation=JSON.parse(fs.readFileSync('dist/labs/cloud-deepening/validation.json','utf8'));
assert.equal(validation.status,'passed');assert.equal(Object.keys(validation.programs).length,4);
for(const [name,source]of Object.entries(d.cloudDeepLabFiles)){
 assert.equal(source,fs.readFileSync('dist/labs/cloud-deepening/'+name,'utf8'),name+': embedded source');
 assert.equal(validation.source_sha256[name],crypto.createHash('sha256').update(source).digest('hex'),name+': evidence source');
}
const recovery=validation.programs['recovery_lab.py'];assert.equal(recovery.restored.balance,125);assert.equal(recovery.restored.last_seq,103);assert(recovery.gap_102_rejected_before_restore);assert.equal(recovery.consumer_balance,130);
const batch=validation.programs['event_batch_lab.py'];assert.equal(batch.crash_after_commit_exit_code,23);assert.equal(batch.effects_after_B_recovery,3);assert.deepEqual(batch.attempts_after_B_recovery,{A:2,B:2,C:1});assert.deepEqual(batch.concurrent_X,{attempts:2,effects:1});
const terraform=validation.programs['terraform_lab.py'];assert.equal(terraform.terraform,'1.13.0');assert(terraform.saved_v1_plan_applied_v1_despite_v2_config&&terraform.stale_saved_plan_rejected);assert.equal(terraform.unchanged_plan_exit_code,0);
const gitops=validation.programs['gitops_model.py'];assert.equal(gitops.self_heal_off_replicas,5);assert.equal(gitops.self_heal_on_replicas,2);assert(gitops.after_spec_apply.synced_model&&!gitops.after_spec_apply.healthy_model);assert.equal(gitops.business_assertion_passed,false);assert(gitops.prune_on_deletes_tracked_only);
for(const [id,file]of [['storage-recovery','recovery_lab.py'],['serverless-execution','event_batch_lab.py'],['delivery','terraform_lab.py']]){
 const article=d.articles.find(a=>a.id===id);assert(article.sections.at(-1)[1].includes(file));
 const html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');assert(html.includes('labs/cloud-deepening.zip'));
}
console.log('PASS: 20 fully expanded field topics, knowledge before cases, 4 source-matched experiments, 3 linked articles, 62 knowledge points overall.');
