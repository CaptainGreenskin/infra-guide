const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const c={};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({transportRecoveryFiles,transportRecoveryValidation,articles,cloudLearningStages})',c)));
const folder='dist/labs/transport-recovery/',r=JSON.parse(fs.readFileSync(folder+'validation.json'));
assert.deepEqual(d.transportRecoveryValidation,r);assert.equal(r.status,'passed');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
for(const[file,source]of Object.entries(d.transportRecoveryFiles)){
 assert.equal(source,fs.readFileSync(folder+file,'utf8'));assert.equal(r.source_sha256[file],sha(source),file+': source/report');
 if(file.endsWith('.py')||file==='Dockerfile.tools'){
  const id=['mysql_restore.py','Dockerfile.tools'].includes(file)?'mysql-recovery':'tcp-event-loop';
  const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
  assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),file+': full source differs');
 }
}
assert.equal(r.ci.run_id,42378802001);assert.equal(r.ci.conclusion,'success');assert(/^[0-9a-f]{40}$/.test(r.ci.source_commit));
const e=r.native.epoll,m=r.native.mysql;
function epoll(x){
 assert.equal(x.status,'passed');assert.equal(x.system,'Linux');
 assert.equal(x.cases.lt.notification_without_new_write,true);assert.equal(x.cases.et.notification_without_new_write,false);
 for(const mode of ['lt','et']){const p=x.cases[mode];assert.equal(p.first_read,'ab');assert.equal(p.unread_then_drained,'cdef');assert(p.eagain_after_drain&&p.eof_after_writer_close);}
 assert.deepEqual(x.cases.application_queue.application_turns,['ab','cd','ef','EAGAIN']);assert.equal(x.cases.application_queue.kernel_notifications,1);
}
epoll(e);assert.equal(e.source_sha256,r.source_sha256['epoll_ready.py']);
assert.equal(m.status,'passed');assert.equal(m.system,'Linux');assert(m.mysql_version.startsWith('8.4.'));
assert.equal(m.source_sha256,r.source_sha256['mysql_restore.py']);assert.equal(m.tools_dockerfile_sha256,r.source_sha256['Dockerfile.tools']);
assert.equal(m.required_files.length,2);assert.equal(m.snapshot_next_event.file,m.required_files[0]);assert.equal(m.exclude_bad_transaction_from.file,m.required_files[1]);
for(const key of ['baseline_only','full_replay','point_in_time_recovery','post_restore_write']){
 const x=m[key];assert.equal(x.balance,100+x.operations.reduce((s,p)=>s+p[1],0),key+': business conservation');
}
assert.equal(m.baseline_only.balance,100);assert.equal(m.full_replay.balance,7);assert.equal(m.point_in_time_recovery.balance,125);assert.equal(m.post_restore_write.balance,128);
assert.deepEqual(m.point_in_time_recovery.operations.map(p=>p[0]),['T101','T102','T103']);
assert.deepEqual(m.missing_first_log.operations,[['T102',20],['T103',-5]]);
assert.equal(m.missing_first_log.balance,125);assert.equal(m.missing_first_log.balance-(100+20-5),10);
assert.equal(m.missing_history_reconciliation_gap,10);assert.deepEqual(m.process_crash.state_after_restart,m.full_replay);assert.equal(m.process_crash.uncommitted_value,999);
const python=process.env.INFRA_LAB_PYTHON||'python3';
for(const name of ['tcp_framing.py','socket_backpressure.py']){
 const x=JSON.parse(cp.execFileSync(python,['-B',folder+name],{encoding:'utf8',timeout:25000}));
 if(name==='tcp_framing.py'){
  assert.equal(x.wire_bytes,2*(4+Buffer.byteLength('云上训练')));assert.equal(x.wire_bytes,32);
  assert(x.server.server_saw_eof_before_reply);assert.deepEqual(x.reply_after_half_close,['已接收2条']);assert.equal(Buffer.byteLength(x.reply_after_half_close[0])+4,17);
 }else{
  const b=Buffer.from('infra-local-byte-stream\n'.repeat(32768));assert.equal(x.payload_bytes,b.length);assert.equal(x.received_bytes,b.length);assert.equal(x.sha256,sha(b));assert(x.read_reply_after_write_shutdown);
 }
}
if(process.platform==='linux')epoll(JSON.parse(cp.execFileSync(python,['-B',folder+'epoll_ready.py'],{encoding:'utf8',timeout:10000})));
// These diagrams contain actual results and declared arithmetic; neither is a packet/performance trace.
assert.equal(1001+32,1033);assert.equal(Buffer.byteLength('已接收2条')+4,17);assert.equal(100_000_000/8*.02,250000);
const metadata=name=>JSON.parse(decode(fs.readFileSync('dist/diagrams/'+name+'.svg','utf8').match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
assert.deepEqual(metadata('v45-epoll-readiness').execution,e);
const boundary=metadata('v45-mysql-pitr-boundary');assert.deepEqual(boundary.start,m.snapshot_next_event);assert.deepEqual(boundary.stop,m.exclude_bad_transaction_from);assert.deepEqual(boundary.required_files,m.required_files);
const checks=metadata('v45-mysql-recovery-checks');for(const[key,value]of Object.entries(checks.cases))assert.deepEqual(value,m[key]);assert.equal(checks.reconciliation_gap,10);
const grid=metadata('v45-tcp-frame-grid');assert.equal(grid.wire_bytes,32);assert.equal(grid.source_sha256,r.source_sha256['tcp_framing.py']);assert.deepEqual(grid.payloads,['云上训练','恢复完成']);
assert.equal(metadata('v45-tcp-byte-positions').packet_trace,false);assert.equal(metadata('v45-mysql-log-roles').fixed_fsync_count,false);
const stage=d.cloudLearningStages.find(s=>s[1].includes('tcp-event-loop'))[1];assert(stage.indexOf('network-diagnosis')<stage.indexOf('tcp-event-loop'));assert(stage.indexOf('storage-recovery')<stage.indexOf('mysql-recovery'));
cp.execFileSync(python,['-B','-c',`import pathlib,zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/transport-recovery.zip') as z:
 for p in pathlib.Path('dist/labs/transport-recovery').iterdir():
  if p.is_file(): assert z.read(p.name)==p.read_bytes(),p.name
figures=list(pathlib.Path('dist/diagrams').glob('v45-*.svg'))
assert len(figures)==6
for p in figures:
 r=ET.parse(p).getroot(); assert r.find('{http://www.w3.org/2000/svg}title') is not None
 assert r.find('{http://www.w3.org/2000/svg}desc') is not None
 assert r.find('{http://www.w3.org/2000/svg}metadata') is not None
`],{encoding:'utf8'});
console.log('PASS: actual Linux epoll and MySQL 8.4 CI source binding, independent ROW-history gap and transaction oracles, fresh TCP/half-close, full source/ZIP, six original diagrams and course ordering. GPU/replication/cloud environments are not inferred.');
