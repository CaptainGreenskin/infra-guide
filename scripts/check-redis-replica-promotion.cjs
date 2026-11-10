/* Bind the Redis replication experiment to independently predicted business values. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const pack = 'redis-replica-promotion';
const folder = path.join(dist, 'labs', pack);
const source = 'replica_promotion.py';
const files = ['README.md', source, 'validation.json'];
const anchor = 'native-redis-replica-promotion';
const articleRoute = '/article/cache-consistency/';
const before = 'v7/pending';
const after = 'v8/shipped';
const sourceArchiveHash = '78dd7326c5c959202c6c3849d3ea9c61896d78d647c20f6542b52c0917f96eac';
const recordURL = 'labs/' + pack + '/validation.json';
const read = name => fs.readFileSync(path.join(folder, name));
const page = route => fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8');
const sha = data => createHash('sha256').update(data).digest('hex');
const report = JSON.parse(read('validation.json'));

const script = read(source).toString('utf8');
const sameClientBlock = script.match(/with connect\(primary\) as writer:\n((?: {12}[^\n]+\n)+)/)?.[1];
assert(sameClientBlock, 'SET and WAIT use one connection to the primary');
assert.deepEqual([...sameClientBlock.matchAll(/writer\("([A-Z]+)"/g)].map(([, command]) => command),
 ['CLIENT', 'SET', 'WAIT', 'CLIENT']);
assert(sameClientBlock.includes('require(writer("CLIENT", "ID"), client_id)'), 'same socket client ID is observed again');

const replication = connected => ({primary_role: 'master', connected_replicas: Number(connected),
 replica_role: 'slave', master_link_status: connected ? 'up' : 'down'});
function verify(record) {
 assert.equal(record.schema, 1);
 assert.equal(record.scope, 'local Redis asynchronous replication and manual promotion');
 assert.deepEqual(record.source_sha256, {[source]: sha(read(source))});
 const runtime = record.runtime;
 assert.equal(runtime.redis, '8.2.6');
 assert.match(runtime.redis_version_output, /^Redis server v=8\.2\.6 /);
 assert.equal(runtime.source_archive_sha256, sourceArchiveHash);
 assert.match(runtime.binary_sha256, /^[a-f0-9]{64}$/);
 assert.match(runtime.platform, /^(Darwin|Linux)$/);
 assert.match(runtime.python, /^3\.\d+\.\d+$/);
 assert.deepEqual(record.fixture, {key: 'order:104', before, after, wait_replicas: 1, wait_ms: 500});
 assert.deepEqual(Object.keys(record.branches).sort(), ['disconnected', 'healthy']);
 const wait = {}, promoted = {};
 for (const [branch, connected] of [['healthy', true], ['disconnected', false]]) {
  const result = record.branches[branch];
  const observedValue = connected ? after : before;
  assert.deepEqual(result.initial_replication, replication(true));
  assert.equal(result.initial_replica_value, before);
  assert.equal(result.severed_links, Number(!connected));
  assert.deepEqual(result.replication, replication(connected), 'check both ends of the link before SET');
  const {client_id: id} = result.primary_write;
  assert(Number.isInteger(id) && id > 0);
  assert.deepEqual(result.primary_write, {client_id: id, value: after, set_reply: 'OK', wait_replicas: Number(connected)});
  assert.equal(result.replica_value_before_promotion, observedValue);
  assert.deepEqual(result.after_promotion, {reply: 'OK', role: 'master', old_primary_value: after, promoted_value: observedValue});
  assert.deepEqual(result.replica_log, ['MASTER <-> REPLICA sync: Finished with success',
   'Connection with master lost.', 'MASTER MODE enabled']);
  assert.deepEqual(result.cleanup, {primary_exit: 0, replica_exit: 0, primary_stopped_before_promotion: true,
   unix_sockets_closed: true, relay_bind_host: '127.0.0.1', relay_closed: true});
  wait[branch] = result.primary_write.wait_replicas;
  promoted[branch] = result.after_promotion.promoted_value;
 }
 return {record: recordURL, before, after, wait, promoted};
}

const observations = verify(report);
for (const mutate of [
 data => { data.branches.disconnected.replication.master_link_status = 'up'; },
 data => { data.branches.disconnected.primary_write.wait_replicas = 1; },
 data => { data.branches.healthy.after_promotion.promoted_value = before; },
 data => { data.branches.disconnected.after_promotion.promoted_value = after; },
 data => { data.branches.disconnected.after_promotion.old_primary_value = before; },
 data => { data.branches.disconnected.cleanup.primary_stopped_before_promotion = false; },
 data => { data.branches.disconnected.cleanup.relay_bind_host = '0.0.0.0'; },
]) {
 const changed = structuredClone(report);
 mutate(changed);
 assert.throws(() => verify(changed), assert.AssertionError);
}

const binary = process.env.REDIS_REPLICA_PROMOTION_BINARY;
const sourceArchive = process.env.REDIS_REPLICA_PROMOTION_SOURCE;
if (binary || sourceArchive) {
 assert(binary && sourceArchive, 'provide both the Redis binary and pinned source archive');
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-redis-promotion-replay-'));
 try {
  const output = path.join(temp, 'validation.json');
  execFileSync('python3', ['-B', path.join(folder, source), '--redis-server', binary,
   '--source-archive', sourceArchive, '--output', output], {timeout: 60000, stdio: 'inherit'});
  assert.deepEqual(verify(JSON.parse(fs.readFileSync(output))), observations);
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

const zip = folder + '.zip';
execFileSync('unzip', ['-tqq', zip]);
const entries = execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(name => pack + '/' + name));
for (const name of files) assert.deepEqual(execFileSync('unzip', ['-p', zip, pack + '/' + name]), read(name), name);

const article = page(articleRoute);
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique published Redis experiment anchor');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-7">'));
for (const href of ['labs/' + pack + '.zip', recordURL, 'diagrams/' + pack + '.svg']) assert(article.includes(href), href);
const cachePoint = page('module/cloud-data').match(/<section class="knowledge-point" id="knowledge-cache-layer">([\s\S]*?)<\/section>/)?.[1];
assert(cachePoint?.includes(articleRoute + '#' + anchor));
assert(page('roadmap/cloud-sre').includes(articleRoute + '?goal=cloud-sre#' + anchor));
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-cloud-redis-replica-promotion">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes(articleRoute + '#' + anchor));
const svg = fs.readFileSync(path.join(dist, 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(svg) && /<desc\b/.test(svg), 'diagram has an accessible title and description');
const metadata = svg.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram binds results to original record');
assert.deepEqual(JSON.parse(metadata), observations);
console.log('PASS: Redis same-connection SET/WAIT, disconnected promotion values, isolated cleanup, exact source and archive, diagram and reading paths.');
