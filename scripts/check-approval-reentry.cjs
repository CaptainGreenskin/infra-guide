/* Check raw receiver rows and reopened checkpoints independently of the lab's verdict. */
'use strict';
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const pack='approval-reentry',folder='dist/labs/'+pack+'/';
const read=file=>readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const hash=value=>createHash('sha256').update(value).digest('hex');
const sha=file=>hash(readFileSync(path.join(root,file)));
const sourceFiles=['workflow.py','mcp_bridge.py','source.json'];
const members=['README.md',...sourceFiles,'requirements-graph.txt','requirements-mcp.txt','validation.json'];
const scenarios={
 normal:{effects:1,status:'succeeded',publish:'committed'},
 revoked_before_resume:{effects:0,status:'denied',publish:'denied',revoke:'before'},
 changed_arguments:{effects:0,status:'approval_mismatch',publish:'approval_mismatch',changed:true},
 committed_then_write_revoked:{effects:1,status:'succeeded',publish:'committed',revoke:'after',lookup:'found'},
 committed_then_all_revoked:{effects:1,status:'pending_confirmation',publish:'committed',revoke:'after',lookup:'denied'},
 unsafe_approval_snapshot:{effects:1,status:'succeeded',publish:'committed',revoke:'before',unsafe:true}
};
const policy=(epoch=1,can_read=1)=>({id:1,can_write:Number(epoch===1),can_read,epoch});
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
 Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const pid=value=>Number.isInteger(value)&&value>1;

function checkZip(){
 const script=[
  'from pathlib import Path',
  'from zipfile import ZipFile',
  'import sys',
  'name, *members = sys.argv[1:]',
  "folder = Path('dist/labs') / name",
  "with ZipFile(folder.with_suffix('.zip')) as archive:",
  "    assert sorted(archive.namelist()) == sorted(name + '/' + member for member in members)",
  '    for member in members:',
  "        assert archive.read(name + '/' + member) == (folder / member).read_bytes(), member"
 ].join('\n');
 execFileSync('python3',['-B','-c',script,pack,...members],{cwd:root,timeout:15000});
}

function verifyCheckpoint(checkpoint,next,values,interrupt){
 assert.match(checkpoint.checkpoint_id,/^[0-9a-f-]{36}$/);
 assert.deepEqual(checkpoint.next,next);
 assert.deepEqual(checkpoint.values,values);
 if(interrupt){
  assert.equal(checkpoint.tasks.length,1);
  assert.equal(checkpoint.tasks[0].name,next[0]);
  const entries=checkpoint.tasks[0].interrupts;
  assert.equal(entries.length,1);
  assert.match(entries[0].id,/^[0-9a-f]+$/);
  assert.deepEqual(entries[0].value,interrupt);
 }else assert.deepEqual(checkpoint.tasks,next.map(name=>({name,interrupts:[]})));
}

function verifyCase(name,record,source,env){
 const {effects,status,publish,revoke,lookup,changed,unsafe}=scenarios[name];
 const amount=Object.values(source.batches).flat().reduce((sum,n)=>sum+n,0);
 assert.equal(amount,42);
 const {operation_id,task_id,source_version,resource,approval_id}=source;
 const intent={operation_id,task_id,source_version,resource,amount};
 const intended={...source.fixture_principal,tool:'publish_report',...intent};
 const intent_digest=hash(canonical(intended));
 const receipt={...intended,revision:1,intent_digest};
 const {tool,...report}=receipt;
 const expectedReports=effects?[report]:[],expectedReceipts=effects?[receipt]:[];
 const approval={approval_id,intent_digest,expires:source.approval_expires,
                 write_at_approval:1,approval_epoch:1,used_by:effects?operation_id:null};
 const initial=policy(),revoked=policy(2,Number(lookup!=='denied'));
 assert.equal(record.thread_id,task_id+'-history');
 assert.deepEqual(record.waiting_reopened_checkpoint,record.waiting.checkpoint,name+' initial wait survived reopening');
 assert.deepEqual(record.waiting_receiver,{policy:initial,approvals:[],reports:[],events:[],receipts:[]},name+' receiver before approval');
 verifyCheckpoint(record.waiting.checkpoint,['approval'],{intent,status:'waiting_approval',observations:[]},
                  {kind:'approval_required',intent});
 assert.deepEqual(record.approval,{approval_id,intent_digest});
 assert.deepEqual(record.policy_change,revoke?revoked:undefined);
 assert.deepEqual(record.receiver.policy,revoke?revoked:initial);
 assert.deepEqual(record.receiver.approvals,[approval]);
 assert.deepEqual(record.receiver.reports,expectedReports,name+' receiver reports');
 assert.deepEqual(record.receiver.receipts,expectedReceipts,name+' receiver receipts');

 const approved=['approval','','approved',initial,intent];
 const revokedEvent=['policy_change','','revoked',revoked,{}];
 const executionPolicy=revoke==='before'?revoked:initial;
 const initialTools=[
  ['tool','get_receipt','absent',executionPolicy,{operation_id}],
  ['tool','publish_report',publish,executionPolicy,{...intent,approval_id,amount:amount-Number(!!changed)}]
 ];
 const expectedEvents=revoke==='before'?[approved,revokedEvent,...initialTools]:[approved,...initialTools];
 if(revoke==='after')expectedEvents.push(revokedEvent,['tool','get_receipt',lookup,revoked,{operation_id}]);
 const rawEvents=record.receiver.events;
 assert.equal(rawEvents.length,expectedEvents.length,name+' exact event count');
 expectedEvents.forEach(([kind,tool,outcome,p,args],index)=>{
  const e=rawEvents[index];
  assert.deepEqual([e.seq,e.kind,e.tool,e.outcome,e.policy_epoch,e.can_write,e.can_read],
                   [index+1,kind,tool,outcome,p.epoch,p.can_write,p.can_read],name+' event '+(index+1));
  assert.equal(e.operation_id,kind==='policy_change'?'':operation_id);
  assert.deepEqual(JSON.parse(e.arguments),args);
  assert(pid(e.server_pid));
  assert.equal(Boolean(e.rpc_request_id),kind==='tool');
 });
 const commits=rawEvents.filter(e=>e.tool==='publish_report'&&e.outcome==='committed');
 const currentPermission=commits.every(e=>e.can_write===1);
 assert.equal(commits.length,record.receiver.reports.length);
 assert.equal(currentPermission,!unsafe,name+' independent permission decision');
 assert.deepEqual(record.oracle,{
  accepted:currentPermission,expected_amount:amount,effect_count:effects,amounts:effects?[amount]:[],
  conditions:{exact_reports:true,exact_receipts:true,current_permission_at_commit:currentPermission,
              one_approval_bound_to_intent:true,approval_consumption:true,commits_match_effects:true}
 });

 const observation=(tool,outcome,withReceipt=false)=>{
  const result={status:outcome,...(withReceipt?{receipt}:{})};
  return {tool,python:env.mcp_python,mcp_version:env.mcp,is_error:['denied','approval_mismatch'].includes(outcome),
          result,text_content:canonical(result)};
 };
 const firstObservations=[observation('get_receipt','absent'),observation('publish_report',publish,publish==='committed')];
 const afterCut=revoke==='after',final=afterCut?record.recovery:record.resume;
 const workerPids=[record.waiting.worker_pid,final.worker_pid];
 assert.notEqual(final.checkpoint.checkpoint_id,record.waiting.checkpoint.checkpoint_id);
 assert.deepEqual(record.reopened_checkpoint,final.checkpoint,name+' final state survived reopening');
 if(afterCut){
  const {cut}=record;
  workerPids.push(cut.worker_pid);
  assert.equal(cut.exit_signal,'SIGKILL');
  assert.notEqual(cut.checkpoint.checkpoint_id,record.waiting.checkpoint.checkpoint_id);
  assert.notEqual(cut.checkpoint.checkpoint_id,final.checkpoint.checkpoint_id);
  verifyCheckpoint(cut.checkpoint,['execute'],{intent,approval_id,status:'ready_to_attempt',observations:[]});
  assert.deepEqual(cut.observations,firstObservations,name+' observed reply before graph checkpoint');
  assert.deepEqual(cut.receiver,{policy:initial,approvals:[approval],reports:expectedReports,
                                 receipts:expectedReceipts,events:rawEvents.slice(0,3)});
  const change=rawEvents.find(e=>e.kind==='policy_change');
  const after=rawEvents.filter(e=>e.kind==='tool'&&e.seq>change.seq);
  assert.deepEqual(after.map(e=>e.tool),['get_receipt'],name+' post-revocation calls');
  assert.deepEqual(record.post_revoke_tools,['get_receipt']);
 }
 assert(workerPids.every(pid)&&new Set(workerPids).size===workerPids.length,name+' distinct graph workers');
 const observations=afterCut?[observation('get_receipt',lookup,lookup==='found')]:firstObservations;
 const values={intent,approval_id,status,observations,...(status==='succeeded'?{receipt}:{})};
 if(status==='pending_confirmation'){
  verifyCheckpoint(record.reopened_checkpoint,['confirmation_wait'],values,{kind:'receipt_access_required',operation_id});
  assert.notEqual(record.reopened_checkpoint.tasks[0].interrupts[0].id,record.waiting.checkpoint.tasks[0].interrupts[0].id);
 }else verifyCheckpoint(record.reopened_checkpoint,[],values);
 assert.deepEqual(record.cleanup,{observed_mcp_server_pids:[...new Set(rawEvents.filter(e=>e.kind==='tool')
  .map(e=>e.server_pid))].sort((a,b)=>a-b),all_exited:true});
}

function checkChapterAndFigure(cases){
 const context=vm.createContext({});
 for(const [,file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)){
  if(file!=='app.js')vm.runInContext(read('dist/'+file),context,{filename:file});
 }
 const articles=vm.runInContext('articles',context);
 const section=(id,index)=>articles.find(article=>article.id===id).sections[index][1];
 const anchor='native-approval-reentry',chapter=section('durable-workflows',8),target='/article/durable-workflows/#'+anchor;
 assert.equal(chapter.split('id="'+anchor+'"').length,2);
 const native=chapter.slice(chapter.indexOf('id="'+anchor+'"'));
 for(const link of ['/labs/'+pack+'.zip','/labs/'+pack+'/README.md','/labs/'+pack+'/validation.json','diagrams/'+pack+'.svg']){
  assert(native.includes('href="'+link+'"'),anchor+' missing '+link);
 }
 for(const [id,index] of [['agent-security',4],['agent-recovery',3],['kairo-practice',5]]){
  assert(section(id,index).includes('href="'+target+'"'),id+' missing canonical native experiment link');
 }
 const verdictAnchor='approval-at-commit-verdict';
 const evaluation=section('agent-evaluation',6).split('<h3 id="'+verdictAnchor+'">');
 assert.equal(evaluation.length,2,verdictAnchor+' must occur once in evaluation section 7');
 const verdict=evaluation[1].split('</details>')[0];
 assert(native.includes('href="/article/agent-evaluation/#'+verdictAnchor+'"'));
 assert(verdict.includes('href="'+target+'"'));
 assert(verdict.includes('href="/labs/'+pack+'/validation.json"'));
 const pair=['revoked_before_resume','unsafe_approval_snapshot'];
 assert.deepEqual(cases[pair[0]].approval,cases[pair[1]].approval);
 for(const name of pair){
  assert(native.includes('<code>'+name+'</code>'));
  assert(verdict.includes('<code>cases.'+name+'</code>'));
 }
 for(const field of ['approval.approval_id','approval.intent_digest','receiver.events','write_at_approval=1']){
  assert(native.includes('<code>'+field+'</code>'),anchor+' missing '+field);
 }
 const recorded=pair.map(name=>cases[name]);
 const outcomes=recorded.map(c=>c.receiver.events.find(event=>event.seq===4).outcome);
 const statuses=recorded.map(c=>c.reopened_checkpoint.values.status);
 for(const values of [outcomes,statuses]){
  assert(verdict.includes(values.map(value=>'<td>'+value+'</td>').join('')+'</tr>'));
 }
 for(const field of ['receiver.events','receiver.reports','receiver.receipts','current_permission_at_commit','oracle.accepted']){
  assert(verdict.includes('<code>'+field+'</code>'),verdictAnchor+' missing '+field);
 }
 const source=read(folder+'mcp_bridge.py').match(/^def execute\(db_path, tool, arguments, request_context, unsafe_snapshot\):[\s\S]*?(?=^async def serve\()/m)?.[0].trim();
 assert(source,'actual receiver transaction function');
 const escaped=source.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 assert(native.includes('<code>'+escaped+'</code>'),'folded receiver transaction must match source bytes after escaping');
 const svg=read('dist/diagrams/'+pack+'.svg');
 assert.deepEqual([...svg.matchAll(/data-stage="([^"]+)"/g)].map(m=>m[1]),['approval_wait','publish_check','receipt_lookup']);
 assert.match(svg,/<svg\b[^>]*role="img"[^>]*aria-labelledby="approval-reentry-title approval-reentry-desc"/);
 for(const text of ['工作流检查点','MCP 接收库','图尚未保存回执时崩溃','沿原操作 ID 查询回执','查询被拒','接收库仍一份']){
  assert(svg.includes(text),pack+' SVG missing '+text);
 }
}

const record=json(folder+'validation.json'),source=json(folder+'source.json');
assert.equal(record.schema,'approval-reentry-validation-v1');
assert.equal(record.status,'passed');
assert(Number.isFinite(Date.parse(record.verified_at_utc)));
assert.deepEqual(record.source_sha256,Object.fromEntries(sourceFiles.map(file=>[file,sha(folder+file)])));
const env=record.environment;
assert.deepEqual([env.langgraph,env.langgraph_checkpoint_sqlite,env.mcp],['1.2.20','3.1.3','2.3.0']);
for(const version of [env.graph_python,env.mcp_python])assert.match(version,/^3\.12\.\d+$/);
assert.equal(sha(folder+'requirements-graph.txt'),sha('dist/labs/langgraph-workflow/requirements.txt'));
assert.equal(sha(folder+'requirements-mcp.txt'),sha('dist/labs/mcp-protocol/requirements.txt'));
assert.deepEqual(Object.keys(record.cases).sort(),Object.keys(scenarios).sort());
for(const name of Object.keys(scenarios))verifyCase(name,record.cases[name],source,env);
checkZip();
checkChapterAndFigure(record.cases);
console.log('PASS: 6 native approval/reentry cases, reopened waits, independent receiver evidence and exact archive, source, anchors and SVG.');
