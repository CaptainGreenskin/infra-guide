const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({leasesPlacementSandboxFiles,leasesPlacementSandboxValidation,diagramWidths,diagramHeights})',c)));
const python=process.env.INFRA_LAB_PYTHON||'python3',root='dist/labs/leases-placement-sandbox/';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const record=d.leasesPlacementSandboxValidation.programs;
for(const[id,name]of [['serverless-execution','visibility_receipts.py'],['serverless-execution','batch_response_reference.py'],['gpu-scheduling','placement_reservations.py'],['agent-sandbox','subprocess_limits.py'],['agent-sandbox','descriptors_and_paths.py']]){
 const source=fs.readFileSync(root+name,'utf8');assert.equal(source,d.leasesPlacementSandboxFiles[name]);assert.equal(record[name].sha256,hash(source));assert.equal(record[name].exit_code,0);
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': exact full static source missing');
}
const replay={};
for(const name of Object.keys(record)){
 replay[name]=JSON.parse(execFileSync(python,['-B',root+name],{encoding:'utf8',timeout:25000}));
 if(!['placement_reservations.py','subprocess_limits.py'].includes(name))assert.deepEqual(replay[name],record[name].result);
}

const queue=record['visibility_receipts.py'].result;
assert.deepEqual(queue.controlled_timeline.map(x=>x.at),[0,31,32,33]);
assert.equal(queue.first_receive.visible_at,0+30);assert.equal(queue.second_receive.visible_at,31+30);
assert.equal(queue.first_receive.message_id,queue.second_receive.message_id);assert.notEqual(queue.first_receive.receipt_handle,queue.second_receive.receipt_handle);
assert.equal(queue.first_receive.event_id,queue.second_receive.event_id);
assert.deepEqual(queue.old_worker_can_commit_after_visibility_expiry,{duplicate:false,total:37});
assert.deepEqual(queue.new_worker_reuses_business_receipt,{duplicate:true,total:37});
assert.equal(queue.stale_ack_accepted,false);assert.equal(queue.current_ack_accepted,true);
assert.deepEqual(queue.effects,[['report-27',37]]);assert(queue.republished_transport_same_business.duplicate&&queue.same_id_changed_intent_rejected);
assert.equal(queue.renewal.new_visible_at,20+30);assert(queue.renewal.hidden_at_31&&queue.renewal.stale_extend_rejected);
assert.equal(queue.renewal.next_receive_at,51);assert.equal(queue.renewal.new_epoch,2);
const batch=record['batch_response_reference.py'].result.cases;
assert.deepEqual(batch.standard_partial.transport_retries,['msg-B']);assert.deepEqual(batch.standard_partial.effects,['msg-A','msg-C']);
assert.deepEqual(batch.partial_not_enabled.acknowledged_without_effect,['msg-B']);assert.deepEqual(batch.partial_not_enabled.transport_retries,[]);
assert.deepEqual(batch.handler_raises.transport_retries,['msg-A','msg-B','msg-C']);assert.deepEqual(batch.handler_raises.acknowledged,[]);
assert.deepEqual(batch.fifo_stop.processed,['msg-A','msg-B']);assert.deepEqual(batch.fifo_stop.transport_retries,['msg-B','msg-C']);assert.deepEqual(batch.fifo_stop.effects,['msg-A']);

// Independent exhaustive assignment oracle: enumerate integer encodings, then aggregate capacity.
function feasible(free,demands,racks=null,sameRack=false){
 const output=[];
 for(let encoding=0;encoding<free.length**demands.length;encoding++){
  let n=encoding,plan=[],used=free.map(()=>0);
  for(const demand of demands){const node=n%free.length;n=Math.floor(n/free.length);plan.push(node);used[node]+=demand;}
  if(used.some((v,i)=>v>free[i]))continue;
  if(sameRack&&new Set(plan.map(i=>racks[i])).size>1)continue;
  output.push(plan);
 }
 return output;
}
assert.equal(feasible([8,4,4,0],[8,8]).length,0);assert.equal(feasible([8,4,4,0],[8,4,4]).length,2);
assert.deepEqual(feasible([8,4],[4,8]),[[1,0]]);assert.equal(feasible([8,8],[8,8],['a','b'],true).length,0);
function checkPlacement(result){
 assert.equal(result.resource_kind,'declared_integer_gpu_slots_not_devices');
 const f=result.finite_search;
 assert.equal(f.workers_8_8,null);assert.deepEqual(f.workers_8_4_4,['n1','n2','n3']);
 assert.equal(f.greedy_4_then_8,null);assert.deepEqual(f.search_4_then_8,['n2','n1']);
 assert.equal(f.rack_required,null);assert.deepEqual(f.rack_unconstrained,['n1','n2']);
 for(const key of ['wrong_flavor','cpu_short','memory_short'])assert.equal(f[key],null);
 for(const limit of [8,12]){const q=f['quota_borrow_'+limit];assert.equal(q.used_after,12+16);assert.equal(q.borrow_required,12+16-16);assert.equal(q.quota_allowed,limit>=12);}
 const g=result.group_reservation,b=g.rollback_state,s=g.committed_state;
 assert.equal(g.injected_after_first_node,'injected_rollback');assert.deepEqual(b.nodes.map(x=>[x.free,x.version]),[[8,0],[8,0]]);assert.equal(b.quota_used,0);assert.deepEqual(b.allocations,[]);
 assert.deepEqual(g.contenders.map(x=>x.result).sort(),['admitted','stale_snapshot']);
 const winner=g.contenders.find(x=>x.result==='admitted').job;
 assert.deepEqual(s.nodes.map(x=>[x.free,x.version]),[[0,1],[0,1]]);assert.equal(s.quota_used,16);
 assert.equal(s.allocations.length,2);assert(s.allocations.every(x=>x.job===winner&&x.gpu_slots===8));
 assert.deepEqual(s.allocations.map(x=>x.node).sort(),['node-1','node-2']);
 assert.equal(s.allocations.reduce((n,x)=>n+x.gpu_slots,0),s.quota_used);
}
checkPlacement(record['placement_reservations.py'].result);checkPlacement(replay['placement_reservations.py']);
assert.deepEqual(record['placement_reservations.py'].result.finite_search,replay['placement_reservations.py'].finite_search);
function checkLimits(result){
 const r=result.cases;
 assert.deepEqual(r.file_size.output,{first_write_bytes:4096,next_write_EFBIG:true,file_size:4096});
 assert.equal(r.descriptors.output.limit,64);assert(r.descriptors.output.next_open_EMFILE);assert(r.descriptors.output.opened_extra>0&&r.descriptors.output.opened_extra<64);
 assert(r.cpu.ready_before_limit&&!r.cpu.force_after_TERM_required);assert(['SIGXCPU','SIGKILL'].includes(r.cpu.termination_signal));assert(r.cpu.child_cpu_seconds>=.5);
 assert(r.wall.ready_before_limit&&r.wall.force_after_TERM_required);assert.equal(r.wall.termination_signal,'SIGKILL');
 assert.equal(r.wall.wall_budget_from_ready_seconds,.25);assert.equal(r.wall.term_grace_seconds,.2);assert(r.wall.child_cpu_seconds<.5);
 for(const item of Object.values(r)){assert(item.elapsed_wall_seconds>0&&item.child_cpu_seconds>=0);assert(item.child_cpu_seconds<=item.elapsed_wall_seconds+.1);}
}
checkLimits(record['subprocess_limits.py'].result);checkLimits(replay['subprocess_limits.py']);
const paths=record['descriptors_and_paths.py'].result;
assert.deepEqual(paths.launch.explicit_unsafe_inheritance,{fixture_environment_present:true,inherited_descriptor_readable:true,same_uid_fixture_still_readable_by_path:true});
assert.deepEqual(paths.launch.minimal_launch,{fixture_environment_present:false,inherited_descriptor_readable:false,same_uid_fixture_still_readable_by_path:true});
assert.deepEqual(paths.single_leaf_path,{prefix_check_passed:true,after_check_symlink_read:'fixture-B',no_follow_rejected_symlink:true,normal_leaf_read:'fixture-A'});
assert.equal(8*12/60,1.6);assert.equal(4*(6+3)/60,.6);
const groupDir='dist/labs/sandbox-process-group/',groupFile=groupDir+'sandbox_process_group.py';
const groupRecord=JSON.parse(fs.readFileSync(groupDir+'validation.json','utf8'));
const groupReplay=JSON.parse(execFileSync(python,['-B',groupFile],{encoding:'utf8',timeout:22000}));
for(const observation of [groupRecord,groupReplay]){
 assert.equal(observation.source_sha256,hash(fs.readFileSync(groupFile)));
 assert.equal(observation.scope,'owned_posix_groups_in_one_host');
 assert.equal(observation.status,'passed');assert.equal(observation.term_grace_seconds,0.2);
 assert.deepEqual(observation.input_values,[10,27]);
 const {A,B}=observation;
 for(const {identity} of [A,B]){
  assert.equal(identity.pgid,identity.parent_pid);
  assert.notEqual(identity.pid,identity.pgid);
 }
 assert.equal(new Set([A.identity.pgid,A.identity.pid,B.identity.pgid,B.identity.pid]).size,4);
 assert.deepEqual([A.term_grace_expired,A.exit,A.pipe_eof_after_kill,A.report_written],[true,-9,true,false]);
 assert.deepEqual([B.running_after_a_stop,B.exit,B.pipe_eof_after_finish,B.report],[true,0,true,{task:'B',total:37}]);
}
const sandboxPage=fs.readFileSync('dist/article/agent-sandbox/index.html','utf8');
const groupLesson=sandboxPage.split('id="native-sandbox-process-group"')[1]?.split('</section>')[0];
assert(groupLesson?.includes('python3 -B sandbox_process_group.py &gt; my-record.json'));
assert(groupLesson.includes('容器复用、生产隔离和资源清理要用目标运行时自己的证据'));
assert(groupLesson.includes('/labs/sandbox-process-group/validation.json'));
for(const [page,destination] of [
 ['roadmap/agent-platform','?goal=agent-platform#native-sandbox-process-group'],
 ['module/agent','?fromConcept=agent.ag-sandbox#native-sandbox-process-group'],
 ['interview/companies','/article/agent-sandbox/#native-sandbox-process-group']
])assert(fs.readFileSync('dist/'+page+'/index.html','utf8').includes(destination),destination);
execFileSync(python,['-B','-c',`from pathlib import Path
import zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/leases-placement-sandbox.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/leases-placement-sandbox').iterdir():
  if p.is_file(): assert z.read('leases-placement-sandbox/'+p.name)==p.read_bytes(),p.name
for p in Path('dist/diagrams').glob('v26-*.svg'):
 root=ET.parse(p).getroot();v=[float(x) for x in root.attrib['viewBox'].split()];assert len(v)==4 and v[2]>0 and v[3]>0,p.name
`],{encoding:'utf8'});
assert(d.diagramWidths['v26-process-budgets']>0&&d.diagramHeights['v26-process-budgets']>0);
for(const[route,anchor]of [['serverless','serverless-delivery-identities'],['platform','gpu-placement-stages'],['agent','sandbox-authority-boundary']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');assert(page.indexOf('id="'+anchor+'"')>=0&&page.indexOf('id="'+anchor+'"')<page.indexOf('id="examples"'));
}
console.log('PASS: real queue DB/identity replay, four batch policies, independent finite placement oracle, actual two-process complete reservation/rollback, actual POSIX limits and concurrent group teardown with separate report, inheritance/path counterexamples, exact static code/ZIP/SVG and knowledge before cases. No cloud/GPU/container execution claimed.');
