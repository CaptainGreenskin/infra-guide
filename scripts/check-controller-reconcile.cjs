/* Check controller observations against an independent HTTP transition ledger. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const {isIP} = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'controller-reconcile';
const folder = path.join(root, 'dist', 'labs', pack);
const sourceFiles = ['controller.go', 'go.mod', 'go.sum', 'main.go'];
const files = ['README.md', ...sourceFiles, 'validation.json'];
const anchor = 'native-controller-reconcile';
const finalizer = 'reports.infraguide.test/remove-sink';
const read = file => fs.readFileSync(path.join(folder, file));
const readPage = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(read(file)).digest('hex')]));
const record = JSON.parse(read('validation.json'));

function providerAt(events, through, uid, target) {
 const state = {put_attempts: 0, delete_attempts: 0, created: 0, effect_present: false};
 for (const event of events.slice(0, through)) {
  if (event.uid !== uid) continue;
  if (event.method === 'PUT') {
   state.put_attempts++;
   assert.equal(event.status, state.effect_present ? 200 : 201, 'PUT must distinguish initial effect from replay');
   if (event.status === 201) {
    state.created++;
    state.effect_present = true;
   }
  } else {
   assert.equal(event.method, 'DELETE');
   assert.equal(event.status, 204);
   assert(state.effect_present, 'cleanup follows a completed write');
   state.delete_attempts++;
   state.effect_present = false;
  }
 }
 if (state.effect_present) state.target = target;
 return state;
}

function checkLive(object, uid, generation, observed, provider, deletionTimestamp) {
 const expected = {api_status: 200, uid, generation, observed_generation: observed,
  status_reported: observed !== 0, finalizers: [finalizer], deleting: Boolean(deletionTimestamp), provider};
 if (observed) expected.sink_uid = uid;
 if (deletionTimestamp) expected.deletion_timestamp = deletionTimestamp;
 assert.deepEqual(object, expected);
}

function verify(record) {
 assert.equal(record.schema, 1);
 assert.equal(record.status, 'passed');
 assert.deepEqual(record.source_sha256, sourceHashes);
 const environment = record.environment;
 assert.equal(environment.client_go, 'v0.35.8');
 assert.equal(environment.envtest, 'v0.23.3');
 const goMinor = environment.go.match(/^go1\.(\d+)\.\d+$/)?.[1];
 assert(Number(goMinor) >= 25, 'Go version satisfies the locked module');
 assert.match(environment.os, /^(darwin|linux)$/);
 assert.equal(environment['kube-apiserver'].version, 'Kubernetes v1.35.0');
 assert.match(environment.etcd.version, /^etcd Version: 3\.6\.\d+/);
 for (const binary of ['kube-apiserver', 'etcd']) assert.match(environment[binary].sha256, /^[a-f0-9]{64}$/);

 const {normal, replay, deletion, provider_events: events, isolation} = record.report;
 assert.equal(isolation.used_existing_cluster, false);
 assert.equal(isolation.listeners_closed, true);
 assert.deepEqual(Object.keys(isolation.hosts).sort(), ['etcd', 'kube_apiserver', 'provider']);
 for (const host of Object.values(isolation.hosts)) {
  assert(host === '::1' || (isIP(host) === 4 && host.startsWith('127.')), 'loopback listener: ' + host);
 }
 const normalUID = normal.uid, replayUID = replay.after_exit.uid;
 for (const uid of [normalUID, replayUID]) assert.match(uid, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
 assert.notEqual(normalUID, replayUID, 'different API objects must have different UIDs');
 assert.equal(replay.worker_exit_code, 73);
 assert.deepEqual(events, [
  {method: 'PUT', uid: normalUID, status: 201},
  {method: 'PUT', uid: replayUID, status: 201},
  {method: 'PUT', uid: replayUID, status: 200},
  {method: 'DELETE', uid: replayUID, status: 204},
 ]);
 const replayProvider = through => providerAt(events, through, replayUID, 'weekly-report');
 checkLive(normal, normalUID, 1, 1, providerAt(events, 1, normalUID, 'daily-report'));
 checkLive(replay.after_exit, replayUID, 1, 0, replayProvider(2));
 checkLive(replay.after_restart, replayUID, 1, 1, replayProvider(3));
 const timestamp = deletion.retained.deletion_timestamp;
 assert.match(timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
 assert(Number.isFinite(Date.parse(timestamp)), 'valid deletion timestamp');
 // Generation 2 is observed in the deleting object in this pinned CRD/API fixture.
 checkLive(deletion.retained, replayUID, 2, 1, replayProvider(3), timestamp);
 assert.deepEqual(deletion.after_cleanup, {api_status: 404, uid: replayUID, generation: 0,
  observed_generation: 0, status_reported: false, deleting: false, provider: replayProvider(4)});
 assert.equal(deletion.other_sink_uid, normalUID);
 assert.deepEqual(deletion.other_provider_after_cleanup, providerAt(events, 4, normalUID, 'daily-report'));
 return {record: 'labs/' + pack + '/validation.json', provider_statuses: events.map(event => event.status),
  worker_exit: replay.worker_exit_code,
  replay_get: [replay.after_exit, replay.after_restart, deletion.retained, deletion.after_cleanup].map(object => object.api_status)};
}

const observations = verify(record);
for (const mutate of [
 data => { data.report.replay.after_exit.status_reported = true; },
 data => { data.report.replay.after_restart.uid = data.report.normal.uid; },
 data => { data.report.provider_events[2].status = 201; },
 data => { data.report.deletion.retained.provider.effect_present = false; },
 data => { data.report.deletion.after_cleanup.api_status = 200; },
 data => { data.report.deletion.other_provider_after_cleanup.effect_present = false; },
 data => { data.report.isolation.hosts.provider = '0.0.0.0'; },
 data => { data.report.isolation.listeners_closed = false; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered), assert.AssertionError);
}
if (process.argv[2]) verify(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));

const archive = folder + '.zip';
const entries = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(file => pack + '/' + file));
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', archive, pack + '/' + file]), read(file), file);

const article = readPage('article/delivery');
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique controller lesson anchor');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-8">'));
for (const target of ['diagrams/' + pack + '.svg', 'labs/' + pack + '.zip', observations.record]) assert(article.includes(target), target);
assert(readPage('roadmap/cloud-platform').includes('/article/delivery/?goal=cloud-platform#' + anchor));
const catalog = readPage('labs');
const task = catalog.match(/<li class="lab-learning-unit" id="lab-cloud-controller-reconcile">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes('/article/delivery/#' + anchor));
const diagram = fs.readFileSync(path.join(root, 'dist', 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram), 'accessible diagram title and description');
const metadata = diagram.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram links its events to the original record');
assert.deepEqual(JSON.parse(metadata), observations);
console.log('PASS: real controller UID and HTTP transitions, crash replay, retained deletion and cleanup, bound source/archive, exact diagram and reading links.');
