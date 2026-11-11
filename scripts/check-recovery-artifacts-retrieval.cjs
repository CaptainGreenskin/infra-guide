const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=JSON.parse(JSON.stringify(vm.runInContext('({recoveryArtifactsRetrievalFiles,recoveryArtifactsRetrievalValidation,diagramWidths,diagramHeights})',c)));
const record=d.recoveryArtifactsRetrievalValidation.programs,root='dist/labs/recovery-artifacts-retrieval/',python=process.env.INFRA_LAB_PYTHON||'python3';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const close=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function equivalent(a,b){
 if(typeof a==='number'&&typeof b==='number')close(a,b);
 else if(Array.isArray(a)){assert(Array.isArray(b));assert.equal(a.length,b.length);a.forEach((v,i)=>equivalent(v,b[i]));}
 else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))if(k!=='sqlite')equivalent(a[k],b[k]);}
 else assert.strictEqual(a,b);
}
for(const[id,name]of [['resilience','consistent_recovery_cut.py'],['resilience','recovered_effects.py'],['ai-lifecycle','artifact_bundle.py'],['ai-lifecycle','requirements-model.txt'],['agent-retrieval','chinese_fts_rrf.py']]){
 const source=fs.readFileSync(root+name,'utf8');assert.equal(source,d.recoveryArtifactsRetrievalFiles[name]);
 if(record[name]){assert.equal(hash(source),record[name].sha256);assert.equal(record[name].exit_code,0);}
 else assert.equal(hash(source),d.recoveryArtifactsRetrievalValidation.fixtures[name]);
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': exact full static source missing');
}
const replay={};
for(const name of ['consistent_recovery_cut.py','recovered_effects.py','chinese_fts_rrf.py']){
 replay[name]=JSON.parse(execFileSync(python,['-B',root+name],{encoding:'utf8',timeout:15000}));equivalent(replay[name],record[name].result);
}

// Independent candidate-cut oracle: all required log entries and objects must exist for a whole prefix.
const recovery=record['consistent_recovery_cut.py'].result,events=recovery.commits;
function latestCut(logs,objects){
 for(const end of [103,102,101,100]){
  const needed=events.filter(e=>e.seq<=end);
  if(needed.every(e=>logs.has(e.seq)&&objects.has(e.object)))return end;
 }
 throw Error('baseline unavailable');
}
const allLogs=new Set([101,102,103]),allObjects=new Set(['object-v1','object-v2','object-v3','object-v4']);
assert.equal(latestCut(allLogs,new Set(['object-v1','object-v2','object-v4'])),101);
assert.equal(latestCut(new Set([101,103]),allObjects),101);
assert.equal(latestCut(allLogs,new Set(['object-v1','object-v3','object-v4'])),100);
for(const[key,seq,minute,pass]of [['last_complete_business_prefix',101,702,false],['all_materials_present',103,717,true],['missing_log_segment',101,702,false],['corrupt_object',100,690,false]]){
 const r=recovery[key];assert.equal(r.seq,seq);assert.equal(r.minute,minute);assert.equal(r.gap_minutes_at_noon,720-minute);assert.equal(r.business_RPO_pass,pass);
 assert.equal(r.physical_integrity,'ok');assert.deepEqual(r.business_problems,[]);assert(r.A_cannot_query_B_report);
 assert.deepEqual(r.A_report_rows,r.A_readable_reports);
}
const naive=recovery.naive_latest_database;
assert.equal(naive.physical_integrity,'ok');assert(naive.database_point_within_15_minutes&&!naive.business_RPO_pass);
assert.deepEqual(naive.A_report_rows,['R1','R2','R3','R4']);assert.deepEqual(naive.A_readable_reports,['R1','R2','R4']);
assert.deepEqual(naive.business_problems,[{report:'R3',object:'object-v3',reason:'missing_object_version'}]);
const capacity=fs.readFileSync('dist/article/elasticity/index.html','utf8')
 .split('id="section-4"')[1]?.split('</section>')[0];
const completeAnchor='subsection-5-1dwp2yh';
assert(capacity?.includes('/article/resilience/#'+completeAnchor));
assert(capacity.includes('/labs/recovery-artifacts-retrieval/validation.json'));
assert(fs.readFileSync('dist/article/resilience/index.html','utf8').includes('id="'+completeAnchor+'"'));
const [missingObject]=naive.business_problems;
assert(naive.A_report_rows.includes(missingObject.report)&&!naive.A_readable_reports.includes(missingObject.report));
assert(recovery.all_materials_present.A_readable_reports.includes(missingObject.report));
assert.equal(recovery.all_materials_present.A_readable_reports.length,4);
for(const value of ['seq='+naive.seq,naive.physical_integrity,missingObject.report,missingObject.object])
 assert(capacity.includes('<code>'+value+'</code>'),value);
assert(capacity.includes('160 次/秒以剩余副本还能完成原请求为前提'));
assert(capacity.includes('独立本机恢复实验')&&capacity.includes('跨区故障后的有效吞吐和服务恢复用时，仍需在目标环境从入口验证'));
assert.equal([4,4,4,16,5,5,4].reduce((a,b)=>a+b),42);assert.equal(42-16+32,58);assert.equal(58-45,13);

const effects=record['recovered_effects.py'].result;
assert.equal(effects.first_http_after_effect_commit,503);assert(effects.confirmed_before_restore.duplicate);
assert.equal(effects.restored_outbox_before,'PENDING');assert.equal(effects.restored_outbox_after,'DONE');
assert.equal(effects.receiver_generation_after_promotion,2);
assert.deepEqual(effects.old_owner_request,{status:409,error:'stale_owner_generation'});
assert.deepEqual(effects.recovered_replay,{status:200,duplicate:true,event_id:'notify-R27',total:37});
assert.deepEqual(effects.same_id_changed_intent,{status:409,error:'intent_conflict'});
assert.deepEqual(effects.positive_effects,[['notify-R27',37]]);assert.equal(effects.new_key_negative_effect_count,2);

function verifyBundle(b){
 assert.equal(b.device,'cpu');assert.equal(b.torch,'2.5.1');assert.equal(b.safetensors,'0.8.0');
 assert.deepEqual(b.bundle_members,['model.json','tokenizer.json','weights.safetensors']);
 assert.deepEqual(b.tensor_shapes,{'readout.weight':[1,1],'readout.bias':[1],'embedding.weight':[3,1]});
 for(const[name,rows,vocab,pass]of [['r17',[1,2,0],{A:0,B:1,'?':2},true],['r18',[1,2,0],{A:1,B:0,'?':2},false],['r19',[2,1,0],{A:1,B:0,'?':2},true]]){
  const expected=Object.fromEntries(Object.entries(vocab).map(([token,id])=>[token,rows[id]]));
  assert.deepEqual(b.gates[name].outputs,expected);assert.equal(b.gates[name].passed,pass);
 }
 assert(b.r18_integrity_and_shapes_passed);assert.equal(b.r18_activation,'semantic_gate_rejected');
 assert.deepEqual(b.mixed_bundle_gate,{outputs:{A:2,B:1,'?':0},passed:false});
 for(const[key,version,generation]of [['initial_pointer','r17',1],['after_switch','r19',2],['after_rollback','r17',3]]){
  assert.equal(b[key].version,version);assert.equal(b[key].generation,generation);assert(/^[a-f0-9]{64}$/.test(b[key].manifest_sha256));
 }
 assert.equal(b.initial_pointer.manifest_sha256,b.after_rollback.manifest_sha256);
 assert.equal(b.stale_publisher,'stale_pointer');assert.equal(b.in_flight_pinned_version,'r17');assert.equal(b.in_flight_A,1);
 assert(b.missing_rollback_member_rejected&&b.tamper_rejected_before_tensor_load);
}
verifyBundle(record['artifact_bundle.py'].result);
if(process.env.INFRA_MODEL_PYTHON)verifyBundle(JSON.parse(execFileSync(process.env.INFRA_MODEL_PYTHON,['-B',root+'artifact_bundle.py'],{encoding:'utf8',timeout:30000})));
close((855+95)/1000,.95);close((882+80)/1000,.962);assert(80/100<.9);
close(8/1000,.008);close(38/19000,.002);close((8+38)/(1000+19000),.0023);assert(.008>.005&&.0023<.005);

const fts=record['chinese_fts_rrf.py'].result;
assert.deepEqual(fts.unicode61_raw_hits,[]);assert.equal(fts.raw_has_standalone_query_term,false);
assert.deepEqual(fts.query_terms,['数据','据库','库恢','恢复']);assert.equal(fts.documents,8);
assert.deepEqual(fts.actual_lexical_results.map(r=>r.id),['a-backup','a-plan','a-archive','a-dr']);
const scores=fts.actual_lexical_results.map(r=>r.bm25);assert.deepEqual(scores,scores.slice().sort((a,b)=>a-b));
assert(fts.actual_lexical_results.every(r=>r.document_version===1&&r.index_version===1));
const rankers=[fts.actual_lexical_results.map(r=>r.id),fts.declared_second_ranker],expectedScores=new Map();
for(const order of rankers)order.forEach((id,i)=>expectedScores.set(id,(expectedScores.get(id)||0)+1/(60+i+1)));
const expectedOrder=[...expectedScores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([id])=>id);
assert.deepEqual(fts.rrf_results.map(r=>r.id),expectedOrder);
for(const row of fts.rrf_results){close(row.score,expectedScores.get(row.id));const [n,z='1']=row.exact.split('/');close(Number(n)/Number(z),row.score);}
for(const[name,order]of [['lexical_metrics',rankers[0]],['rrf_metrics',expectedOrder]]){
 const chosen=order.slice(0,3),positive=Object.values(fts.grades).filter(x=>x>0).length;
 const hits=chosen.filter(id=>fts.grades[id]>0).length;
 const dcg=(grades)=>grades.reduce((sum,g,i)=>sum+(2**g-1)/Math.log2(i+2),0);
 const ideal=dcg(Object.values(fts.grades).sort((a,b)=>b-a).slice(0,3)),value=dcg(chosen.map(id=>fts.grades[id]||0));
 close(fts[name].precision_at_3,hits/3);close(fts[name].recall_at_3,hits/positive);
 close(fts[name].reciprocal_rank_at_3,1/(chosen.findIndex(id=>fts.grades[id]>0)+1));
 close(fts[name].dcg_at_3,value);close(fts[name].ideal_dcg_at_3,ideal);close(fts[name].ndcg_at_3,value/ideal);
}
assert(fts.rrf_metrics.ndcg_at_3>fts.lexical_metrics.ndcg_at_3);assert(fts.duplicate_ranker_input_rejected);
assert.equal(fts.stale_index_without_check.document_version,2);assert.equal(fts.stale_index_without_check.index_version,1);
assert(fts.stale_index_excluded_with_check);assert.equal(fts.after_reindex.document_version,2);assert.equal(fts.after_reindex.index_version,2);

execFileSync(python,['-B','-c',`from pathlib import Path
import zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/recovery-artifacts-retrieval.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/recovery-artifacts-retrieval').iterdir():
  if p.is_file(): assert z.read('recovery-artifacts-retrieval/'+p.name)==p.read_bytes(),p.name
for p in Path('dist/diagrams').glob('v27-*.svg'):
 root=ET.parse(p).getroot();v=[float(x) for x in root.attrib['viewBox'].split()];assert len(v)==4 and v[2]>0 and v[3]>0,p.name
`],{encoding:'utf8'});
for(const[route,anchor]of [['sre','recovery-business-contract'],['platform','model-bundle-contract'],['agent','retrieval-lexical-foundation']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');assert(page.indexOf('id="'+anchor+'"')>=0&&page.indexOf('id="'+anchor+'"')<page.indexOf('id="examples"'));
}
assert(d.diagramWidths['v27-ranked-gains']>0&&d.diagramHeights['v27-ranked-gains']>0);
console.log('PASS: actual backup/HTTP/FTS replays; independent complete-prefix, tensor/vocabulary and ranking/graded-metric oracles; pointer generations, exact static code/ZIP/SVG, and knowledge before cases. CPU model record verified'+(process.env.INFRA_MODEL_PYTHON?' and model rerun.':'; no GPU/embedding/cloud execution claimed.'));
