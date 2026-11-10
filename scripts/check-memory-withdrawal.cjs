/* Independently check LangGraph's Store, task snapshots and HTTP collector evidence. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'memory-withdrawal';
const folder = path.join(root, 'dist', 'labs', pack);
const anchor = 'native-memory-withdrawal';
const cases = ['unchecked', 'rechecked'];
const sourceFiles = ['memory_lab.py', 'fixture.json', 'requirements.txt', 'README.md'];
const archiveFiles = [...sourceFiles, 'validation.json'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const fixture = json(path.join(folder, 'fixture.json'));
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [
 name, createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex')
]));
const oldDelivery = ['short', 'standard'];
const freshDelivery = ['standard', 'standard'];

assert.deepEqual(fixture, {
 namespace: ['tenant-A', 'learner-A', 'preferences'], other_namespace: ['tenant-B', 'learner-B', 'preferences'],
 key: 'report-style', preference: {format: 'short', version: 1}, other_preference: {format: 'bullet', version: 1},
 fallback: 'standard', old_thread: 'old-task', new_thread: 'new-task'
});

function expectCheckpoint(checkpoint, next, values) {
 assert.match(checkpoint.checkpoint_id, /^[\da-f-]{36}$/);
 assert.deepEqual(checkpoint.next, next);
 assert.deepEqual(checkpoint.values, values);
}

function checkResume(stage, resume, thread, initial, final, receipt) {
 assert(Number.isInteger(stage.pid) && stage.pid > 0);
 assert(Number.isInteger(resume.pid) && resume.pid > 0);
 assert.notEqual(stage.pid, resume.pid, 'resume must use a separate worker process');
 expectCheckpoint(stage.paused, ['send'], {thread_id: thread, snapshot: initial});
 assert.deepEqual(resume.before, stage.paused, 'reopen the same checkpoint ID and state');
 expectCheckpoint(resume.after, [], {thread_id: thread, snapshot: final, delivery: receipt});
 assert.notEqual(resume.after.checkpoint_id, stage.paused.checkpoint_id);
 assert.deepEqual(resume.history.slice(0, 2), [resume.after, stage.paused]);
 expectCheckpoint(resume.history[2], ['stage'], {thread_id: thread});
 expectCheckpoint(resume.history[3], ['__start__'], {});
 assert.equal(resume.history.length, 4);
 assert.equal(new Set(resume.history.map(row => row.checkpoint_id)).size, resume.history.length);
}

function checkEvidence(record) {
 assert.equal(record.schema, 'memory-withdrawal-v1');
 assert.equal(record.status, 'passed');
 assert.match(record.environment.python, /^3\.12\.\d+$/);
 assert.match(record.environment.sqlite, /^3\.\d+\.\d+$/);
 assert.equal(record.environment.langgraph, '1.2.20');
 assert.equal(record.environment['langgraph-checkpoint-sqlite'], '3.1.3');
 assert.deepEqual(record.source_sha256, sourceHashes);
 assert.deepEqual(record.fixture, fixture);
 assert.deepEqual(Object.keys(record.cases), cases);
 for (const [index, name] of cases.entries()) {
  const observed = record.cases[name];
  const retained = name === 'unchecked' ? fixture.preference : null;
  const old = {seq: 1, payload: {thread_id: fixture.old_thread, format: oldDelivery[index], memory_version: retained?.version ?? null}};
  const fresh = {seq: 2, payload: {thread_id: fixture.new_thread, format: freshDelivery[index], memory_version: null}};
  assert.deepEqual(observed.store, {before: fixture.preference, after: null, other_after: fixture.other_preference});
  checkResume(observed.stage_old, observed.resume_old, fixture.old_thread, fixture.preference, retained, old);
  checkResume(observed.stage_new, observed.resume_new, fixture.new_thread, null, null, fresh);
  assert.deepEqual(observed.collector, {while_paused: [], before_purge: [old, fresh], after_purge: [old, fresh]});
  assert.deepEqual(observed.history_purge, {
   old_count_before: observed.resume_old.history.length, old_count_after: 0,
   new_checkpoint_id_after: observed.resume_new.after.checkpoint_id
  });
 }
}

function checkArchiveAndDiagram() {
 const raw = execFileSync('python3', ['-B', '-c', `
import pathlib, sys, xml.etree.ElementTree as ET, zipfile
root, svg = map(pathlib.Path, sys.argv[1:3])
with zipfile.ZipFile(root.with_suffix('.zip')) as archive:
    names = sorted(root.name + '/' + name for name in sys.argv[3:])
    assert archive.namelist() == names, archive.namelist()
    for entry in archive.infolist():
        assert archive.read(entry) == (root / pathlib.Path(entry.filename).name).read_bytes(), entry.filename
        assert entry.date_time == (2026, 11, 11, 0, 0, 0), entry.date_time
print(ET.parse(svg).getroot().find('{http://www.w3.org/2000/svg}metadata').text)
`, folder, path.join(root, 'dist', 'diagrams', pack + '.svg'), ...archiveFiles], {encoding: 'utf8'});
 assert.deepEqual(JSON.parse(raw), {record: 'labs/' + pack + '/validation.json', old_delivery: oldDelivery,
  fresh_delivery: freshDelivery, old_history_after_purge: 0});
}

function checkPage() {
 const context = vm.createContext({URLSearchParams, articleURL: id => '/article/' + id + '/',
  location: {pathname: '/roadmap/agent-app/', search: '', hash: ''}});
 for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename: file});
 }
 const data = JSON.parse(vm.runInContext(`JSON.stringify({
  chapter: articles.find(article => article.id === 'agent-memory'),
  point: infraDomain('agent').points.find(point => point.id === 'ag-context'),
  lab: labLearningCatalog.find(lab => lab.id === 'agent-memory-withdrawal'),
  archive: labArchiveCatalog['${pack}']
 })`, context));
 const marker = 'id="' + anchor + '"';
 const section = data.chapter.sections[6][1];
 assert.equal(section.split(marker).length, 2);
 assert.equal(data.chapter.sections.filter(([, html]) => html.includes(marker)).length, 1);
 const lesson = section.slice(section.indexOf(marker));
 for (const target of ['/labs/' + pack + '.zip', '/labs/' + pack + '/README.md', '/labs/' + pack + '/validation.json',
  'diagrams/' + pack + '.svg']) assert(lesson.includes('href="' + target + '"'), 'missing lesson link ' + target);
 const source = fs.readFileSync(path.join(folder, 'memory_lab.py'), 'utf8');
 const snippet = lesson.match(/<code class="language-python">([^<]+)<\/code>/)?.[1];
 assert(snippet && snippet.split('\n').every(line => source.includes(line.trim())), 'lesson code must match source');
 assert(data.point.body.includes('/article/agent-memory/#' + anchor), 'ag-context point link is missing');
 assert.deepEqual([data.lab.track, data.lab.chapter, data.lab.anchor, data.lab.pack, data.archive.folder],
  ['agent', 'agent-memory', anchor, pack, pack]);
 assert(data.lab.files.includes('memory_lab.py'));
 const goal = vm.runInContext('learningGoalHTML(learningProfiles["agent-app"])', context);
 assert(goal.includes('/article/agent-memory/?goal=agent-app#' + anchor), 'Agent application gate is missing');
}

function verifyReplayDatabases(directory, record) {
 const raw = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json, pathlib, sqlite3, sys
from contextlib import closing
root = pathlib.Path(sys.argv[1])
result = {}
for case in sys.argv[2:]:
    def connect(name):
        return closing(sqlite3.connect((root / case / (name + '.sqlite')).as_uri() + '?mode=ro&immutable=1', uri=True))
    with connect('collector') as db:
        receipts = [dict(seq=seq, payload=json.loads(payload)) for seq, payload in db.execute('SELECT seq, payload FROM receipts ORDER BY seq')]
    with connect('memory') as db:
        memory = [(prefix, key, json.loads(value)) for prefix, key, value in db.execute('SELECT prefix, key, value FROM store')]
    with connect('checkpoints') as db:
        checkpoints = list(db.execute('SELECT thread_id, checkpoint_id FROM checkpoints'))
        write_threads = [thread for (thread,) in db.execute('SELECT DISTINCT thread_id FROM writes')]
    result[case] = dict(receipts=receipts, memory=memory, checkpoints=checkpoints, write_threads=write_threads)
print(json.dumps(result))
`, directory, ...cases], {encoding: 'utf8'}));
 for (const name of cases) {
  const observed = raw[name];
  assert.deepEqual(observed.receipts, record.cases[name].collector.after_purge);
  assert.deepEqual(observed.memory, [[fixture.other_namespace.join('.'), fixture.key, fixture.other_preference]]);
  const expectedCheckpoints = record.cases[name].resume_new.history.map(row => [fixture.new_thread, row.checkpoint_id]);
  assert.deepEqual(observed.checkpoints.sort(), expectedCheckpoints.sort());
  assert(observed.write_threads.length > 0 && observed.write_threads.every(thread => thread === fixture.new_thread));
 }
}

const record = json(path.join(folder, 'validation.json'));
checkEvidence(record);
checkArchiveAndDiagram();

if (process.env.INFRA_MEMORY_WITHDRAWAL_PYTHON) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-'));
 try {
  const replayDirectory = path.join(temp, 'replay');
  execFileSync(process.env.INFRA_MEMORY_WITHDRAWAL_PYTHON,
   ['-B', path.join(folder, 'memory_lab.py'), 'run', '--output-dir', replayDirectory],
   {timeout: 100000, stdio: 'pipe'});
  const replay = json(path.join(replayDirectory, 'validation.json'));
  checkEvidence(replay);
  verifyReplayDatabases(replayDirectory, replay);
  const volatile = new Set(['checkpoint_id', 'new_checkpoint_id_after', 'pid']);
  const normalize = value => JSON.parse(JSON.stringify(value, (key, data) => volatile.has(key) ? undefined : data));
  assert.deepEqual(normalize(replay.cases), normalize(record.cases));
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

checkPage();
console.log('memory-withdrawal: native Store, persisted snapshots, HTTP receipts, purge, and lesson checks passed');
