/* Recompute the account balances independently of PostgreSQL and the lab driver. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const pack='postgres-pitr';
const folder='dist/labs/'+pack;
const frozen=fs.readFileSync(folder+'/validation.json');
const data=JSON.parse(frozen);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const initial=100;
const changes=[10,20,-5];
const beforeClear=changes.reduce((balance,delta)=>balance+delta,initial);

function verify(record){
 assert.equal(record.schema,1);
 assert.equal(record.status,'passed');
 for(const [name,hash] of Object.entries(record.source_sha256)){
  assert.match(name,/^[a-zA-Z0-9_.-]+$/);
  assert.equal(hash,sha(fs.readFileSync(folder+'/'+name)));
 }
 for(const name of ['postgres_pitr.py','pitr.sh'])assert(Object.hasOwn(record.source_sha256,name));
 assert.equal(record.environment.os,'linux');
 assert.equal(record.environment.network,'none');
 assert.match(record.environment.postgres_version,/^17\./);
 assert.match(record.environment.image_id,/^sha256:[a-f0-9]{64}$/);
 const {base,primary,primary_after:primaryAfter,restores,named_after_write:namedAfter,archive,missing_wal:missing}=record.report;
 assert.equal(record.report.backup_verified,true);
 assert.equal(base.balance,initial);
 assert.deepEqual(base.ledger,[]);
 assert.equal(base.timeline,1);
 assert.deepEqual(primaryAfter,primary);
 assert.deepEqual(primary.ledger,[101,102,103,104]);
 assert.equal(restores.named.balance,beforeClear);
 assert.deepEqual(restores.named.ledger,[101,102,103]);
 assert.deepEqual(restores.named.deltas,changes);
 assert.equal(restores.latest.balance,0);
 assert.deepEqual(restores.latest.ledger,[101,102,103,104]);
 assert.equal(namedAfter.balance,beforeClear+5);
 assert.deepEqual(namedAfter.ledger,[101,102,103,105]);
 assert.deepEqual(namedAfter.deltas,[...changes,5]);
 for(const restore of [restores.named,restores.latest]){
  assert.equal(restore.in_recovery,false);
  assert.equal(restore.timeline,2);
  assert.equal(restore.system_identifier,base.system_identifier);
  assert.match(restore.fork_lsn,/^[0-9A-F]+\/[0-9A-F]+$/);
 }
 assert.equal(archive.restore_point,'after_t103');
 assert.equal(restores.named.fork_lsn,archive.point_lsn);
 assert.notEqual(restores.latest.fork_lsn,archive.point_lsn);
 assert.match(archive.target_segment,/^[0-9A-F]{24}$/);
 assert.match(archive.target_segment_sha256,/^[a-f0-9]{64}$/);
 assert.equal(archive.target_segment_bytes,2**20);
 assert.equal(primary.balance,0);
 assert.equal(missing.started,false);
 assert.equal(missing.omitted_segment,archive.target_segment);
 assert.match(missing.error,/recovery ended before configured recovery target was reached/i);
}

verify(data);
if(process.argv[2])verify(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
assert(execFileSync('unzip',['-p',folder+'.zip',pack+'/validation.json']).equals(frozen));
const html=fs.readFileSync('dist/article/storage-recovery/index.html','utf8');
for(const marker of ['id="native-postgres-pitr"','diagrams/postgres-pitr-wal.svg','labs/postgres-pitr.zip','labs/postgres-pitr/validation.json'])assert(html.includes(marker),marker);
const recoveryBridge='recovery-postgres-native-checkpoints';
assert(html.includes('/article/resilience/#'+recoveryBridge),'Storage lab links to the recovery acceptance example');
const resilience=fs.readFileSync('dist/article/resilience/index.html','utf8');
const bridge=resilience.split('id="'+recoveryBridge+'"')[1]?.split('</section>')[0];
assert(bridge?.includes('/article/storage-recovery/#native-postgres-pitr'),'Recovery chapter links back to the native procedure');
const {archive,base,restores,named_after_write:namedAfter,missing_wal:missing}=data.report;
assert.equal(archive.target_segment,archive.last_segment);
assert.equal(archive.target_segment_sha256,archive.last_segment_sha256);
const postgresLesson=fs.readFileSync('dist/progressive-storage-reading.js','utf8')
 .split("h('native-postgres-pitr'")[1]?.split('recovery.updated=')[0];
for(const detail of [archive.point_lsn,archive.target_segment,restores.latest.fork_lsn,'pg_walfile_name','pg_wal','backup_verified=true']){
 assert(postgresLesson?.includes('<code>'+detail+'</code>'),detail+': follow the in-file restore position and missing archive control');
}
assert(postgresLesson.includes('href="/labs/postgres-pitr/pitr.sh"'));
const mysql=JSON.parse(fs.readFileSync('dist/labs/transport-recovery/validation.json','utf8')).native.mysql;
assert.deepEqual(mysql.point_in_time_recovery.operations,restores.named.ledger.map((id,i)=>['T'+id,restores.named.deltas[i]]));
assert.equal(mysql.point_in_time_recovery.balance,restores.named.balance);
const mysqlNegative=mysql.missing_first_log;
const replayedTotal=mysql.baseline_only.balance+mysqlNegative.operations.reduce((total,[,delta])=>total+delta,0);
assert.deepEqual(mysqlNegative.operations,mysql.point_in_time_recovery.operations.slice(1));
assert.equal(mysqlNegative.balance-replayedTotal,mysql.missing_history_reconciliation_gap);
const mysqlPage=fs.readFileSync('dist/article/mysql-recovery/index.html','utf8');
const mysqlGap=mysqlPage.split('id="mysql-missing-binlog"')[1]?.split('</section>')[0];
const postgresGap=html.split('id="postgres-missing-wal"')[1]?.split('</section>')[0];
assert(mysqlGap?.includes('/article/storage-recovery/#postgres-missing-wal')&&mysqlGap.includes('/labs/transport-recovery/validation.json'));
assert(postgresGap?.includes('/article/mysql-recovery/#mysql-missing-binlog')&&postgresGap.includes('/labs/postgres-pitr/validation.json'));
for(const file of mysql.required_files)assert(mysqlGap.includes('<code>'+file+'</code>'));
assert(mysqlGap.includes('余额 '+mysqlNegative.balance)&&mysqlGap.includes('得到 '+replayedTotal)&&mysqlGap.includes('相差 '+mysql.missing_history_reconciliation_gap));
assert(postgresGap.includes('<code>'+archive.restore_point+'</code>')&&postgresGap.includes('<code>'+missing.error+'</code>'));
assert(postgresGap.includes('<code>missing_wal.started</code> 为 <code>'+missing.started+'</code>'));
for(const field of [archive.restore_point,archive.point_lsn,restores.latest.fork_lsn,missing.omitted_segment])
 assert(bridge.includes('<code>'+field+'</code>'),field+': recovery location or missing archive must match the record');
assert(bridge.includes('余额是 '+base.balance),'Show the common baseline balance');
for(const amount of [restores.named.balance,restores.latest.balance])
 assert(bridge.includes('余额 '+amount),amount+': recovered balance must match the record');
assert(bridge.includes('变成 '+namedAfter.balance)&&bridge.includes('缺少这些时刻和应用侧验收'),'Account writes and timing scope remain explicit');
assert(fs.readFileSync('dist/module/cloud-data/index.html','utf8').includes('/article/storage-recovery/#native-postgres-pitr'));
assert(fs.readFileSync('dist/roadmap/cloud-sre/index.html','utf8').includes('?goal=cloud-sre#native-postgres-pitr'));
assert(fs.readFileSync('dist/labs/index.html','utf8').includes('id="lab-cloud-postgres-pitr"'));
console.log('PASS: PostgreSQL WAL restore observations, independent ledger oracle, target gap rejection and exact reading links.');
