const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const c={};vm.createContext(c);
for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({articles,infraKnowledgeDomains,infraStudyGates,aiAgentLabFiles,aiAgentValidation,sources,chapterReadingEdits})',c);
assert.equal(d.infraKnowledgeDomains.length,4);
assert.equal(d.infraKnowledgeDomains.flatMap(x=>x.points).length,33);
assert.equal(d.articles.length,67);
assert.equal(d.chapterReadingEdits.length,35);assert.equal(new Set(d.chapterReadingEdits.map(x=>x.id)).size,35);
assert.deepEqual(JSON.parse(fs.readFileSync('docs/CHAPTER_REVIEW_2026-11-04.json')).chapters,JSON.parse(JSON.stringify(d.chapterReadingEdits)));
const articleIDs=new Set(d.articles.map(a=>a.id));
for(const domain of d.infraKnowledgeDomains){
 assert(domain.points.length>=6);
 for(const p of domain.points){assert(p.lead.length>35);assert(p.body.length>450);for(const a of p.articles)assert(articleIDs.has(a));}
 for(const k of domain.refs)assert(new URL(d.sources[k][1]).protocol==='https:');
 const page=fs.readFileSync('dist/module/'+domain.module+'/index.html','utf8');
 assert(page.includes('class="knowledge-body"'));
 assert(page.indexOf('knowledge-'+domain.points.at(-1).id)<page.indexOf('id="examples"'));
 assert(!page.includes('模块概览'));
 for(const p of domain.points)assert(page.includes('id="knowledge-'+p.id+'"'));
 assert(page.includes('labs/ai-agent-systems.zip')||domain.module==='model-foundations');
 assert(!page.includes('undefined'));assert(page.indexOf('class="knowledge-references"')>page.indexOf('id="examples"'));assert(page.includes('resource-recommendations'));assert(page.includes('class="github-link"'));
}
const html=route=>fs.readFileSync('dist/'+route+'/index.html','utf8');
assert(html('track/ai').includes('knowledge-mf-tensors'));
assert(html('track/agent').includes('knowledge-ag-runtime'));
for(const [file,hash]of Object.entries(d.aiAgentValidation.source_sha256)){
 const bytes=fs.readFileSync('dist/labs/ai-agent-systems/'+file);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash,file);
 assert.equal(d.aiAgentLabFiles[file],bytes.toString());
}
assert.equal(d.aiAgentValidation.status,'passed');
const r=d.aiAgentValidation.programs;
assert.equal(Object.keys(r).length,4);
const t=r['token_ddp.py'].result;assert.equal(t.processes,2);assert.equal(t.backend,'gloo');
assert.equal(t.cases.wrong_rank_mean.gradient,4);assert.equal(t.cases.global_token_mean.gradient,5);
assert.equal(t.cases.all_empty.observed_step_count,0);assert.equal(t.cases.all_empty.weight,0);
assert.deepEqual(t.cases.accumulated_global_mean.backward_sync_flags,[false,true]);
const g=r['gqa_serving.py'].result;assert.equal(g.full_incremental_max_error,0);
assert(g.wrong_head_mapping_max_error>.1&&g.wrong_query_offset_max_error>.1);
assert.equal(g.kv_bytes_per_8192_sequence,1073741824);assert.equal(g['8193_sequence_capacity_in_8gib'],7);
assert.equal(g.output_tokens_per_second,50);assert.equal(g.latency_qualified_requests_per_second,10);
const f=r['worker_fencing.py'].result;assert.equal(f.A.result.status,'stale_epoch');assert.equal(f.B.result.status,'committed');
assert.equal(f.C_recovered_receipt.result.result.stored_value,11);
assert.deepEqual(f.effects,[['A','crash-operation',11],['A','fresh-from-B',7],['A','new-C-op',13]]);
assert.equal(f.handoff_gap_probe.old_writer_before_install,'committed');assert.equal(f.handoff_gap_probe.superseded_reservation_armed,false);
const e=r['agent_evaluation.py'].result;assert.deepEqual(Object.values(e.strategies).map(x=>x.cases_passed),[4,0,2,3]);
assert.equal(e.leak_then_deny_probe.outcomes['cross-tenant'],'denied');assert.equal(e.leak_then_deny_probe.cases_passed,3);
assert(e.leak_then_deny_probe.read_receipts.some(row=>row[2]==='B'));assert.equal(e.extra_public_field_probe.public_response_contract_valid,false);assert.equal(e.extra_public_field_probe.cases_passed,0);
for(const [status,probe]of Object.entries(e.wrong_report_status_probes)){
 assert.equal(probe.outcomes.report,status);assert.equal(probe.public_response_contract_valid,true);
 assert.equal(probe.positive_task_pass,false);assert.equal(probe.cases_passed,3);
 assert.equal(probe.actual_effects,1);assert.equal(probe.unique_qualified_business_tasks,0);
}
assert.equal(e.forbidden_read_then_correct_probe.outcomes.report,'success');
assert.equal(e.forbidden_read_then_correct_probe.positive_access_valid,false);
assert.equal(e.forbidden_read_then_correct_probe.cases_passed,3);
assert.equal(e.forbidden_read_then_correct_probe.actual_effects,1);
assert.equal(e.forbidden_read_then_correct_probe.unique_qualified_business_tasks,0);
assert.equal(e.cached_content_leak_probe.cases_passed,3);assert.equal(e.cached_content_leak_probe.positive_access_valid,true);
assert.equal(e.cached_content_leak_probe.unique_qualified_business_tasks,0);
assert.equal(e.unexpected_report_probe.environment_contract_valid,false);assert.equal(e.unexpected_report_probe.cases_passed,0);
assert.equal(e.unexpected_report_probe.actual_effects,2);
const roadmap=html('roadmap');
for(const [key,count]of [['ai',5],['agent',4]]){
 const part=roadmap.split('id="route-'+key+'"')[1].split('<section class="route-block"')[0];
 assert.equal((part.match(/class="stage-gate"/g)||[]).length,count);
}
for(const id of ['distributed-training','model-serving','durable-workflows','agent-evaluation'])assert(html('article/'+id).includes('labs/ai-agent-systems/'));
assert(/不能作为服务端\s*TTFT/.test(html('article/inference-performance')));
const decodedAgentCode=[...html('article/agent-evaluation').matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').trim());
assert(decodedAgentCode.includes(fs.readFileSync('dist/labs/ai-agent-systems/agent_evaluation.py','utf8').trim()),'static Agent code differs from executed source');
const labCatalogHTML=html('labs');
for(const name of ['gqa_serving.py','token_ddp.py','worker_fencing.py','agent_evaluation.py'])assert(labCatalogHTML.includes('href="labs/ai-agent-systems/'+name+'"'),name+': lab source entry missing');
assert(labCatalogHTML.includes('labs/ai-agent-systems.zip')&&labCatalogHTML.includes('labs/ai-agent-systems/validation.json'),'lab archive or evidence entry missing');
console.log('PASS: 33 systematic points before cases, 4 exact-source programs, independent negative probes, 7 diagrams and 9 AI/Agent study gates.');
