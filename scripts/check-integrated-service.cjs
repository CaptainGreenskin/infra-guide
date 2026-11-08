/* Compare independent observations, not a worker's claimed success or trace text.
   Set INFRA_INTEGRATED_PYTHON to rerun the CPU services and real stored-data faults. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),assert=require('assert'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),lab=path.join(root,'dist/labs/integrated-service');
const read=f=>fs.readFileSync(path.join(lab,f)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const record=JSON.parse(read('validation.json')),input=JSON.parse(read('source.json')),contract=JSON.parse(read('model-contract.json'));
assert.equal(record.schema,'integrated-service-validation-v1');
const files=['README.md','integrated_service.py','model-contract.json','requirements.txt','source.json'];
assert.deepEqual(Object.keys(record.source_sha256).sort(),files);
for(const file of files)assert.equal(sha(read(file)),record.source_sha256[file],file+': exact executed input/source');
assert.deepEqual(input.values,[10,27]);assert.deepEqual(contract.weight,[[1,1]]);assert.deepEqual(contract.bias,[0]);
const total=contract.weight[0].reduce((sum,w,i)=>sum+w*input.values[i],contract.bias[0]);assert.equal(total,37);
function proof(r){
 assert.equal(r.schema,'integrated-service-v1');assert.equal(r.status,'passed');
 assert.equal(r.environment.torch.split('+')[0],'2.5.1');assert.equal(r.environment.device,'cpu');
 const names=['normal','recover_same_operation','unsafe_new_operation','read_authorization','wrong_weights','wrong_version'];
 assert.deepEqual(Object.keys(r.cases),names);
 let children=0;
 for(const name of names){
  const row=r.cases[name],o=row.oracle,crash=['recover_same_operation','unsafe_new_operation'].includes(name),wrong=name.startsWith('wrong_'),duplicate=name==='unsafe_new_operation';
  const good=['normal','recover_same_operation','read_authorization'].includes(name);
  assert.equal(row.accepted_http_status,202);assert.deepEqual(row.accepted_response,{artifact:null,status:'ACCEPTED',task_id:contract.task_id});
  assert.equal(row.effects_at_acceptance,0);assert.deepEqual(row.submission_retry,{duplicate:true,status:'ACCEPTED',task_id:contract.task_id});
  const services=Object.values(row.services);assert.equal(services.length,3);
  for(const s of services){assert(Number.isInteger(s.pid)&&s.pid>0);assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(s.url));}
  assert.equal(new Set(services.map(s=>s.pid)).size,3);assert.equal(new Set(services.map(s=>s.url)).size,3);
  assert.equal(o.expected_total,total);assert.equal(o.task_status,'SUCCEEDED');assert.equal(o.task_stage,'REPORT_CONFIRMED');
  assert.equal(o.accepted,good);assert.equal(o.accepted,Object.values(o.checks).every(v=>v===true));
  assert.equal(o.model_calls,1);assert.equal(o.worker_attempts,(crash||wrong)?2:1);assert.equal(o.tool_attempts,crash?2:1);
  assert.equal(o.effect_count,duplicate?2:1);assert.equal(o.artifact_count,o.effect_count);assert.equal(o.publication_count,1);
  assert.deepEqual(o.actual_totals,Array(o.artifact_count).fill(name==='wrong_weights'?38:total));
  assert.deepEqual(o.operations,duplicate?['task-A:save','task-A:save:retry-2']:['task-A:save']);
  assert.deepEqual(o.tool_attempt_records.map(x=>x.op),crash?['task-A:save',duplicate?'task-A:save:retry-2':'task-A:save']:['task-A:save']);
  assert.deepEqual(o.tool_attempt_records.map(x=>x.duplicate),name==='recover_same_operation'?[0,1]:Array(o.tool_attempts).fill(0));
  assert.equal(o.checks.one_effect_and_artifact,!duplicate);assert.equal(o.checks.actual_report_matches_source,name!=='wrong_weights');
  assert.equal(o.checks.frozen_task_input_and_model,!wrong);assert.equal(o.checks.selected_bundle_is_approved,!wrong);assert.equal(o.checks.actual_report_uses_approved_model,!wrong);
  for(const key of ['source_is_declared_task_input','approved_weights_match_contract','approved_artifact_bytes','approved_config_matches_contract','effect_receipts_match_records','selected_artifact_bytes','one_published_target','task_and_target_match','artifact_and_effect_digests','local_completion_references_publication','real_model_call_recorded'])assert.equal(o.checks[key],true,name+'/'+key);
  assert.equal(o.source.sha256,sha(read('source.json')));assert.equal(o.source.id,input.id);assert.equal(o.source.version,input.version);
  assert.equal(o.approved_model.bundle_id,contract.bundle_id);
  if(!wrong)assert.deepEqual(o.selected_model,o.approved_model);
  if(name==='wrong_weights'){assert.equal(o.selected_model.bundle_id,o.approved_model.bundle_id);assert.notEqual(o.selected_model.weights_sha256,o.approved_model.weights_sha256);}
  if(name==='wrong_version'){assert.equal(o.selected_model.bundle_id,'linear-sum-v2');assert.equal(o.selected_model.weights_sha256,o.approved_model.weights_sha256);assert.equal(o.selected_model.config_sha256,o.approved_model.config_sha256);}
  assert.equal(row.workers.length,crash?2:1);assert.equal(row.workers.at(-1).exit_code,0);
  assert.equal(row.workers.at(-1).result.operation_identity_bypassed,duplicate);
  assert.equal(row.completed_repeat.exit_code,0);assert.equal(row.completed_repeat.result.already_complete,true);assert.equal(row.completed_repeat_unchanged,true);
  const pids=[...services.map(s=>s.pid),...row.workers.map(w=>w.result.pid),row.completed_repeat.result.pid];
  if(crash){assert.equal(row.workers[0].exit_code,23);assert.equal(row.workers[0].result.event,'exit_after_receiver_commit_before_task_ack');assert.deepEqual(row.commit_gap,{task_status:'RUNNING',task_stage:'MODEL_READY',local_receipt:null,receiver_effects:1,published_reports:1});}
  else assert.equal(row.commit_gap,null);
  const gates=o.api_audit.filter(x=>x.kind==='release_gate').map(x=>({allowed:x.allowed,...JSON.parse(x.details)}));
  assert.equal(gates.length,(crash||wrong)?2:1);
  if(wrong){
   assert.equal(row.gate_refusal.worker.exit_code,24);assert.equal(row.gate_refusal.effects_before_bypass,0);pids.push(row.gate_refusal.worker.result.pid);
   const violations=name==='wrong_weights'?['model_binding','content_total']:['model_binding'];
   assert.deepEqual(gates,[{allowed:0,mode:'enforced',violations},{allowed:0,mode:'bypassed_negative',violations}]);
  }else{assert.equal(row.gate_refusal,null);for(const gate of gates)assert.deepEqual(gate,{allowed:1,mode:'enforced',violations:[]});}
  assert.equal(new Set(pids).size,pids.length,'distinct actual worker/service processes within a case');children+=pids.length;
 }
 const auth=r.cases.read_authorization.authorization;
 assert.equal(auth.initial_read,200);assert.equal(auth.other_tenant,403);assert.equal(auth.revoked_actor,403);assert.equal(auth.artifact_retained,true);
 assert.equal(auth.receiver_reads_before,auth.receiver_reads_after);
 assert.deepEqual(auth.denied_responses,[{error:'report_read_denied'},{error:'report_read_denied'}]);
 assert.deepEqual(r.cases.read_authorization.oracle.api_audit.filter(x=>x.kind==='report_read').map(x=>[x.actor,x.allowed]),[['alice',1],['bob',0],['alice',0]]);
 const b=r.capacity;assert.equal(b.arrival_and_completion_tasks_per_second,2);assert.equal(b.end_to_end_seconds,30);
 assert.equal(b.queue_and_other_wait_seconds,10);assert.equal(b.slot_occupancy_seconds_per_task,20);
 assert.equal(b.queue_and_other_wait_seconds+b.slot_occupancy_seconds_per_task,b.end_to_end_seconds);
 assert.equal(b.mean_in_system,b.arrival_and_completion_tasks_per_second*b.end_to_end_seconds);assert.equal(b.mean_busy_slots,b.arrival_and_completion_tasks_per_second*b.slot_occupancy_seconds_per_task);assert.equal(b.slots_for_70_percent_target,Math.ceil(40/.7));
 assert.equal(b.utilization_at_64_slots,40/64);assert.equal(b.ideal_slot_capacity_tasks_per_second,64/20);
 assert(b.scope.includes('not measured'));assert.equal(r.cleanup.all_children_reaped,true);assert.equal(r.cleanup.owned_process_groups_only,true);
 assert.equal(r.cleanup.supervision_seconds,90);assert.equal(r.cleanup.reaped_count,children);
}
proof(record.program);
// ZIP bytes include the source, fixtures, instructions and their exact run record.
const zip=cp.spawnSync('python3',['-c',`import pathlib,sys,zipfile
folder=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(str(folder)+'.zip') as archive:
 for f in folder.iterdir():
  if f.is_file():
   names=[n for n in archive.namelist() if n==f.name or n.endswith('/'+f.name)]
   assert len(names)==1 and archive.read(names[0])==f.read_bytes(),f.name
`,lab],{encoding:'utf8'});assert.equal(zip.status,0,zip.stderr);
const c={};vm.createContext(c);for(const[,f]of fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync(path.join(root,'dist',f),'utf8'),c,{filename:f});
assert.equal(vm.runInContext('integratedServiceSource',c),read('integrated_service.py').toString());
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(integratedServiceValidation)',c)),record);
const article=vm.runInContext('articles.find(a=>a.id==="production-readiness")',c),body=article.sections.map(s=>s[1]).join('');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const printed=(body.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[]).map(s=>decode(s.replace(/^<pre\b[^>]*>\s*<code\b[^>]*>/,'').replace(/<\/code>\s*<\/pre>$/,'')));
assert(printed.includes(read('integrated_service.py').toString().trim()),'complete actual service source in canonical body');
const page=fs.readFileSync(path.join(root,'dist/article/production-readiness/index.html'),'utf8');
assert(page.includes('v70-service-chain.svg'));
assert(page.includes('id="integrated-service-run"'));assert(page.includes('labs/integrated-service.zip'));
const staticPrinted=(page.match(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)||[]).map(s=>decode(s.replace(/^<pre\b[^>]*>\s*<code\b[^>]*>/,'').replace(/<\/code>\s*<\/pre>$/,'')));
assert(staticPrinted.includes(read('integrated_service.py').toString().trim()),'same complete program in static page');
const figure=fs.readFileSync(path.join(root,'dist/diagrams/v70-service-chain.svg'),'utf8');
const metadata=JSON.parse(figure.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]);
assert.deepEqual(metadata.source_sha256,record.source_sha256);assert.deepEqual(metadata.input,input.values);
for(const key of ['expected_total','model_calls','tool_attempts','effect_count','artifact_count','publication_count'])assert.equal(metadata.normal[key],record.program.cases.normal.oracle[key]);
for(const key of ['worker_attempts','model_calls','tool_attempts','effect_count'])assert.equal(metadata.recovery[key],record.program.cases.recover_same_operation.oracle[key]);
// The fresh path changes real persisted artifacts, with no service left running.
if(process.env.INFRA_INTEGRATED_PYTHON){
 const script=`import importlib.util,json,pathlib,shutil,sqlite3,subprocess,sys,tempfile
lab=pathlib.Path(sys.argv[1]); spec=importlib.util.spec_from_file_location('integrated',lab/'integrated_service.py'); m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='infra-integrated-verify-') as tmp:
 root=pathlib.Path(tmp);run=root/'run'
 result=subprocess.run([sys.executable,'-B',str(lab/'integrated_service.py'),'--output-dir',str(run)],capture_output=True,text=True,timeout=110,check=True)
 fresh=json.loads(result.stdout)
 faults=[]
 def case(name,edit,expected):
  d=root/name;shutil.copytree(run/'normal',d);edit(d);actual=m.independent_oracle(d)
  assert not actual['accepted'] and not actual['checks'][expected],(name,actual)
  faults.append(name)
 def sql(d,file,statement):
  with sqlite3.connect(d/file) as c:c.execute(statement)
 def report(d,field,value):
  with sqlite3.connect(d/'receiver.sqlite') as c:
   row=c.execute('SELECT id,body FROM artifacts').fetchone();body=json.loads(row[1]);body[field]=value;c.execute('UPDATE artifacts SET body=? WHERE id=?',(json.dumps(body),row[0]))
 case('wrong_total',lambda d:report(d,'total',38),'actual_report_matches_source')
 case('wrong_target',lambda d:report(d,'target','report-B'),'task_and_target_match')
 case('wrong_digest',lambda d:sql(d,'receiver.sqlite',\"UPDATE artifacts SET content_sha='wrong'\"),'artifact_and_effect_digests')
 case('missing_publication',lambda d:sql(d,'receiver.sqlite','DELETE FROM publications'),'one_published_target')
 case('local_not_done',lambda d:sql(d,'tasks.sqlite',\"UPDATE tasks SET status='RUNNING'\"),'local_completion_references_publication')
 case('extra_model_call',lambda d:sql(d,'model.sqlite','INSERT INTO calls(input,output,bundle) SELECT input,output,bundle FROM calls'),'real_model_call_recorded')
 case('wrong_model_output_record',lambda d:sql(d,'model.sqlite','UPDATE calls SET output=38'),'real_model_call_recorded')
 case('wrong_model_bundle_record',lambda d:sql(d,'model.sqlite',"UPDATE calls SET bundle='{}'"),'real_model_call_recorded')
 case('wrong_frozen_input',lambda d:sql(d,'tasks.sqlite',"UPDATE tasks SET source='{}'"),'frozen_task_input_and_model')
 case('wrong_effect_receipt',lambda d:sql(d,'receiver.sqlite',"UPDATE effects SET receipt='{}'"),'effect_receipts_match_records')
 case('wrong_local_receipt',lambda d:sql(d,'tasks.sqlite',"UPDATE tasks SET receipt='{}'"),'local_completion_references_publication')
 print(json.dumps({'fresh':fresh,'stored_data_faults_rejected':faults}))
`;
 const fresh=cp.spawnSync(process.env.INFRA_INTEGRATED_PYTHON,['-B','-c',script,lab],{encoding:'utf8',timeout:150000,maxBuffer:1024*1024});
 assert.equal(fresh.status,0,fresh.stderr);const output=JSON.parse(fresh.stdout);proof(output.fresh);assert.equal(output.stored_data_faults_rejected.length,11);
 console.log('Fresh CPU/HTTP/SQLite suite and eleven actual persisted-data faults passed.');
}
console.log('PASS: exact service/fixture/ZIP bindings; six process/HTTP/CPU scenarios, pre-effect gate, one-effect recovery, wrong number/version and revoked-read rejection, independent capacity units, canonical/static source and new diagrams.');
