/* Check the public observation shape, arithmetic, negative cases and reading paths. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const folder='dist/labs/kairo-receipt-readback',python=process.env.INFRA_LAB_PYTHON||'python3';
const read=file=>fs.readFileSync(file);
const record=JSON.parse(read(folder+'/validation.json'));
assert.deepEqual(Object.keys(record).sort(),
 ['boundary','fixture','observations','phases','schema','scope','status','verification_source_sha256']);
assert.deepEqual(Object.keys(record.phases).sort(),['after_commit_exit','matched','prepare','version_mismatch']);
assert.equal(record.verification_source_sha256,
 crypto.createHash('sha256').update(read(folder+'/verify_receipt_readback.py')).digest('hex'));
execFileSync(python,['-B',folder+'/verify_receipt_readback.py',folder+'/validation.json']);
execFileSync(python,['-B','-c',`
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import runpy

folder = Path('${folder}')
verify = runpy.run_path(str(folder / 'verify_receipt_readback.py'))['verify']
record = json.loads((folder / 'validation.json').read_bytes())
mutations = [
    (('boundary', 'public_provenance_verified'), True),
    (('phases', 'after_commit_exit', 'local_receipt_saved'), True),
    (('phases', 'after_commit_exit', 'receiver', 'reports', 0, 'amount'), 84),
    (('phases', 'matched', 'lookup_same_original_operation'), False),
    (('phases', 'matched', 'write_handler_entries'), 1),
    (('phases', 'version_mismatch', 'business_result'), 'RECEIPT_CONFIRMED'),
]
for keys, value in mutations:
    changed = deepcopy(record)
    row = changed
    for key in keys[:-1]:
        row = row[key]
    row[keys[-1]] = value
    try:
        verify(changed)
    except ValueError:
        continue
    raise AssertionError(f'accepted altered observation {keys}')
with ZipFile(folder.with_suffix('.zip')) as archive:
    expected = ['README.md', 'validation.json', 'verify_receipt_readback.py']
    assert sorted(x.name for x in folder.iterdir()) == expected
    assert sorted(archive.namelist()) == sorted(f'{folder.name}/{name}' for name in expected)
    for name in expected:
        assert archive.read(f'{folder.name}/{name}') == (folder/name).read_bytes()
`]);
const localURL='/labs/kairo-local-readonly/validation.json';
const local=JSON.parse(read('dist'+localURL));
const contract=JSON.parse(read('dist/labs/agent-task-reconnect/readonly-contract.json'));
const digest=request=>crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(
 Object.entries(request).sort(([first],[second])=>first.localeCompare(second))
))).digest('hex');
const requestHash=digest(contract.request), changedHash=digest({...contract.request,source_version:'A-v2'});
const total=Object.values(contract.events).reduce((sum,amount)=>sum+amount,0);
assert.equal(local.schema,1);
assert.equal(local.scope,'local_kairo_runtime_synthetic_readonly_reconnect');
assert.deepEqual(local.boundary,{
 task_host:'loopback_fixture',task_storage:'local_h2',runtime:'native_kairo',model:'scripted',
 independent_readback:'read_only_jdbc',interruption:'after_task_accept_before_http_response',
 public_provenance_verified:false,production_acceptance:false
});
assert.deepEqual(local.request,{
 request_id:contract.request.request_id,source_version:contract.request.source_version,args_sha256:requestHash
});
assert.deepEqual(local.after_interruption,{
 process_exit_code:23,http_status:null,task_count:1,task_id:'T1',task_status:'ACCEPTED',
 body_reads:0,business_writes:0,delivery_count:0
});
assert.deepEqual(local.resumed,{
 distinct_processes:2,task_count:1,task_id:local.after_interruption.task_id,
 task_states:['ACCEPTED','RUNNING','SUCCEEDED'],
 routes:[
  {case:'changed_request',http_status:409,task_id:'T1',args_sha256:changedHash,source_version:'A-v2'},
  {case:'original_session_before_delivery',http_status:404},
  {case:'original_request',http_status:200,task_id:'T1',args_sha256:requestHash},
  {case:'original_session',http_status:200,task_id:'T1',channel:contract.request.delivery,total,
   citations:Object.keys(contract.events).sort()},
  {case:'other_session',http_status:404}
 ],
 native_tool_results:[
  {resource:contract.request.resource,action:'read',status:'success',failure_reason:null,events:contract.events},
  {resource:'reports-B',action:'read',status:'denied',failure_reason:'POLICY_DENIED',events:{}},
  {resource:'reports-B',action:'write',status:'denied',failure_reason:'POLICY_DENIED',events:{}}
 ],
 body_reads:{'reports-A':1,'reports-B':0},business_writes:0,delivery_count:1
});
assert.notEqual(changedHash,requestHash);
assert.deepEqual(local.protected_snapshot,{before:contract.B_before,after:contract.B_before});
assert.deepEqual(local.contract_check,{
 status:'record_consistent',mutations_rejected:{
  different_original_task:['logical_task_count'],mismatched_request:['request_identity_or_arguments'],
  wrong_delivery_channel:['wrong_delivery_task_or_channel'],wrong_total:['wrong_business_total'],
  denied_read_leak:['denied_payload_leak'],protected_version_change:['forbidden_snapshot_changed'],
  business_write:['readonly_task_wrote']
 }
});

const localAnchor='kairo-native-readonly-reconnect';
const referenceURL='/article/kairo-practice/#native-agent-task-reconnect';
const checkLocalLesson=html=>{
 const body=html.split('id="'+localAnchor+'"');
 assert.equal(body.length,2);
 const subsection=body[1].split('</section>')[0];
 for(const text of [localURL,referenceURL,'HTTP 409','HTTP 200','HTTP 404','金额 23',
  'B 正文读取 0 次','业务写入 0 次','独立只读 JDBC','生产接口和真实身份验收仍需目标环境取证']){
  assert(subsection.includes(text),text);
 }
};
if(process.argv.includes('--source-only')){
 const context=vm.createContext({URLSearchParams});
 for(const [,file]of read('src/page-shell.html').toString().matchAll(/<script defer src="([^"]+)"/g)){
  if(file!=='app.js')vm.runInContext(read('dist/'+file).toString(),context,{filename:file});
 }
 const chapter=vm.runInContext('articles.find(article=>article.id==="kairo-practice")',context);
 checkLocalLesson(chapter.sections[7][1]);
 assert(chapter.sections[5][1].includes('第 8 节另有本机 Kairo 的 23 日报只读验收'));
 console.log('PASS: Kairo observations, preserved archive, and authored local read-only comparison.');
 process.exit(0);
}
const article=read('dist/article/kairo-practice/index.html').toString();
const anchor='kairo-native-commit-readback';
const section=article.split('id="'+anchor+'"')[1]?.split('</section>')[0];
assert(section?.includes('RECEIPT_CONFIRMED')&&section.includes('NEEDS_VERIFICATION'));
assert(section.includes('公开包可核对脱敏结果')&&section.includes('第 8 节另有本机 Kairo 的 23 日报只读验收'));
assert(article.indexOf('id="kairo-resume-evidence"')<article.indexOf('id="'+anchor+'"'));
assert(section.includes('10+27+5=42')&&section.includes('5+7+11=23')&&
 section.includes('href="/article/kairo-practice/#native-agent-task-reconnect"'));
checkLocalLesson(article);
for(const [file,href] of [
 ['module/agent','?fromConcept=agent.ag-evaluation#'+anchor],
 ['module/agent','?fromConcept=agent.ag-recovery#'+anchor],
 ['roadmap/agent-platform','?goal=agent-platform#'+anchor],
 ['labs','id="lab-agent-kairo-receipt-readback"']
])assert(read('dist/'+file+'/index.html').toString().includes(href),href);
console.log('PASS: normalized local Kairo receipt and read-only observations, rejected records and exact public archive.');
