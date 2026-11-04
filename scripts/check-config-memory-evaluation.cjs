const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=JSON.parse(JSON.stringify(vm.runInContext('({configMemoryEvaluationFiles,configMemoryEvaluationValidation,diagramHeights,diagramWidths})',c)));
const python=process.env.INFRA_LAB_PYTHON||'python3',root='dist/labs/config-memory-evaluation/';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const approximately=(a,b)=>assert(Math.abs(a-b)<1e-11,`${a} != ${b}`);
function equivalent(a,b){
 if(typeof a==='number'&&typeof b==='number'){if(Number.isInteger(a)&&Number.isInteger(b))assert.equal(a,b);else approximately(a,b);}
 else if(Array.isArray(a)){assert(Array.isArray(b));assert.equal(a.length,b.length);a.forEach((x,i)=>equivalent(x,b[i]));}
 else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))equivalent(a[k],b[k]);}
 else assert.strictEqual(a,b);
}
const records=d.configMemoryEvaluationValidation.programs;
for(const[id,name]of [['config-secrets','config_snapshots.py'],['config-secrets','credential_rotation.py'],['gpu-memory','tensor_state_bytes.py'],['gpu-memory','checkpoint_saved_tensors.py'],['agent-evaluation','evaluation_statistics.py'],['agent-evaluation','paired-example.csv']]){
 const source=fs.readFileSync(root+name,'utf8'),record=records[name];
 assert.equal(source,d.configMemoryEvaluationFiles[name]);
 if(record){assert.equal(record.sha256,hash(source));assert.equal(record.exit_code,0);assert(record.python);}
 else assert.equal(d.configMemoryEvaluationValidation.fixtures[name],hash(source));
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': exact static source missing');
}
for(const name of ['config_snapshots.py','credential_rotation.py','evaluation_statistics.py']){
 const result=JSON.parse(execFileSync(python,['-B',root+name],{encoding:'utf8',timeout:15000}));
 equivalent(result,records[name].result);
}
const config=records['config_snapshots.py'].result;
assert.deepEqual(config.mixed_separate_reads,{pool:4,timeout_ms:50});assert.equal(config.mixed_was_published,false);
assert.deepEqual(config.held_descriptor_after_path_switch,{version:1,pool:4,timeout_ms:100});
assert.deepEqual(config.new_path,{version:2,pool:6,timeout_ms:50});
assert.deepEqual(config.in_flight_snapshot,config.held_descriptor_after_path_switch);
assert.deepEqual(config.new_request_snapshot,config.new_path);
assert.deepEqual(config.rejected_candidates.map(r=>r.reason),['fields','integer_types','global_connection_budget','invalid_json','stale_generation']);
assert(config.rejected_candidates.every(r=>r.kept_version===2));
assert.deepEqual(config.rollback_values_new_generation,{version:7,pool:4,timeout_ms:100});
assert.deepEqual(Object.values(config.environment),['4','4','6']);
assert(4*6<=32&&4*9>32&&6*6>32);
const rotation=records['credential_rotation.py'].result,n=rotation.normal_overlap,e=rotation.early_revoke_counterexample;
assert.equal(n.new_credential_probe,200);assert.equal(n.cached_client_before_reload,'v1');assert.equal(n.desired_version_before_reload,'v2');
assert.equal(n.cached_request_status,200);assert.equal(n.invalid_candidate_kept,'v2');
assert.deepEqual([n.old_key_after_revoke,n.new_key_after_revoke,n.preexisting_session_after_key_revoke,n.session_after_explicit_revoke],[401,200,200,401]);
assert.deepEqual([e.client_before_reload,e.status_before_reload,e.client_after_reload,e.status_after_reload],['v1',401,'v2',200]);
assert(!JSON.stringify(rotation).includes('lab-only-fixture'));assert(!JSON.stringify(rotation).includes('LabSession '));

const states=records['tensor_state_bytes.py'].result;
assert.equal(states.torch,'2.5.1');assert.equal(states.device,'cpu');
for(const[mode,unit]of [['fp32',4],['fp32_autocast_bf16',4],['bf16_parameters',2]]){
 const r=states.modes[mode],p=58*unit,steps=4*4;
 assert.equal(r.parameters,58);assert.equal(r.parameter_tensors,4);
 for(const[stage,grad,moments,step]of [['created',0,0,0],['after_backward',p,0,0],['after_first_step',p,2*p,steps],['after_zero_grad_none',0,2*p,steps],['after_second_step',p,2*p,steps]]){
  const s=r.stages[stage];assert.equal(s.parameters.bytes,p);assert.equal(s.gradients.bytes,grad);assert.equal(s.moments.bytes,moments);assert.equal(s.step_scalars.bytes,step);
  assert.equal(s.total_retained_payload_bytes,p+grad+moments+step);
 }
 const expected=unit===4?'torch.float32':'torch.bfloat16';
 for(const key of ['parameters','gradients','moments'])assert.deepEqual(r.stages.after_first_step[key].dtypes,[expected]);
 assert.deepEqual(r.stages.after_first_step.step_scalars.dtypes,['torch.float32']);
}
assert.equal(states.modes.fp32_autocast_bf16.forward_output_dtype,'torch.bfloat16');
assert.deepEqual(states.alias_example,{view_element_bytes_sum:12*4,unique_underlying_storage_payload_bytes:8*4,same_storage:true});
const checkpoint=records['checkpoint_saved_tensors.py'].result;
assert.equal(checkpoint.torch,'2.5.1');assert.equal(checkpoint.checkpoint_use_reentrant,false);
for(const[key,expectedBytes,calls]of [['normal',32768,[1,1,1]],['checkpointed',8192,[2,2,2]]]){
 const r=checkpoint[key],unique=new Map();
 for(const item of r.saved_records_at_forward_end)if(!item.parameter_storage&&item.storage_bytes>0)unique.set(item.storage_id,item.storage_bytes);
 assert.equal([...unique.values()].reduce((a,b)=>a+b,0),expectedBytes);
 assert.equal(r.unique_non_parameter_saved_storage_bytes,expectedBytes);assert.equal(r.unique_non_parameter_saved_storages,unique.size);
 assert.deepEqual(r.forward_calls,[1,1,1]);assert.deepEqual(r.total_calls_after_backward,calls);
}
assert(checkpoint.output_max_abs_error<1e-6&&checkpoint.gradient_max_abs_error<1e-6);

const stats=records['evaluation_statistics.py'].result,a=stats.reject_all_imbalanced,j=stats.artifact_judge_calibration,pair=stats.paired_comparison;
assert.deepEqual([a.tp,a.tn,a.fp,a.fn],[0,20,0,5]);assert.equal(a.accuracy,20/25);assert.equal(a.positive_recall,0);assert.equal(a.macro_recall_over_present_classes,.5);assert.equal(a.positive_precision,null);
assert.deepEqual([j.tp,j.fp,j.fn,j.tn],[5,2,1,4]);assert.equal(j.accuracy,9/12);assert.equal(j.positive_precision,5/7);assert.equal(j.positive_recall,5/6);
const z=1.959963984540054;
for(const[key,n]of [['five_of_five',5],['hundred_of_hundred',100]]){
 const r=stats.wilson_95_examples[key];approximately(r.lower,n/(n+z*z));approximately(r.upper,1);
}
const csv=d.configMemoryEvaluationFiles['paired-example.csv'].trim().split('\n').slice(1).map(line=>line.trim().split(','));
assert.equal(csv.length,25);assert.equal(new Set(csv.map(row=>row[0])).size,25);
const counts={both_pass:0,a_only:0,b_only:0,both_fail:0};
for(const[,a,b]of csv)counts[a==='1'?(b==='1'?'both_pass':'a_only'):(b==='1'?'b_only':'both_fail')]++;
assert.deepEqual(counts,{both_pass:16,a_only:2,b_only:4,both_fail:3});assert.deepEqual(pair.cells,counts);
assert.equal(pair.a.successes,16+2);assert.equal(pair.b.successes,16+4);assert.equal(pair.b_minus_a_percentage_points,100*(4-2)/25);
assert.equal(pair.discordant,6);assert.equal(pair.paired_two_sided_exact_p,2*(1+6+15)/2**6);assert.equal(pair.exact_fraction,'11/16');
assert(stats.zero_task_interval_rejected);assert(stats.fixture_type.includes('not_agent_runs'));

execFileSync(python,['-B','-c',`from pathlib import Path
import zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/config-memory-evaluation.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/config-memory-evaluation').iterdir():
  if p.is_file(): assert z.read('config-memory-evaluation/'+p.name)==p.read_bytes(),p.name
for p in Path('dist/diagrams').glob('v25-*.svg'):
 root=ET.parse(p).getroot(); v=[float(x) for x in root.attrib['viewBox'].split()]
 assert len(v)==4 and v[2]>0 and v[3]>0,p.name
`],{encoding:'utf8'});
for(const name of ['v25-state-payload','v25-wilson-counts'])assert(d.diagramWidths[name]>0&&d.diagramHeights[name]>0,'decimal plot dimensions not parsed');
for(const[route,anchor]of [['native','config-effective-versions'],['training','memory-state-objects'],['agent','evaluation-metric-contract']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');
 assert(page.indexOf('id="'+anchor+'"')>=0&&page.indexOf('id="'+anchor+'"')<page.indexOf('id="examples"'));
}
console.log('PASS: actual POSIX/HTTP replays, independent tensor-state and alias accounting, saved-storage/gradient evidence, class/calibration denominators, Wilson all-success bound, paired CSV/exact p, exact static code/ZIP, fractional SVG dimensions and knowledge before cases.');
