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
