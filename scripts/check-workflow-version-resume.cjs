/* Check the recorded LangGraph upgrade cases and optionally reopen fresh SQLite output. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'workflow-version-resume';
const folder = path.join(root, 'dist', 'labs', pack);
const sourceFiles = ['resume_lab.py', 'fixture.json', 'requirements.txt', 'README.md'];
const archiveFiles = [...sourceFiles, 'validation.json'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const hash = name => createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(name)]));
const fixture = json(path.join(folder, 'fixture.json'));
const cases = ['unsafe', 'bound', 'version-routed'];
const outcomes = {unsafe: [0, 1], bound: [0, 0], 'version-routed': [1, 0]};
const anchor = 'native-workflow-version-resume';

assert.deepEqual(fixture.batches, {base: [10, 27], late: [5]});
const amount = Object.values(fixture.batches).flat().reduce((sum, value) => sum + value, 0);
assert.equal(amount, 42);
assert.equal(fixture.thread_id, 'report-A-history');
assert.equal(fixture.approval_id, 'approval-A-1');
assert.equal(fixture.source_version, 'v3');
assert.deepEqual(fixture.original_gate, {operation: 'publish', operation_id: 'report-A:publish', target: 'A/daily'});
assert.deepEqual(fixture.inserted_gate, {operation: 'share', operation_id: 'report-A:share:B', target: 'B/daily'});
const oldIntent = {...fixture.original_gate, source_version: fixture.source_version, amount};
const newIntent = {...fixture.inserted_gate, source_version: fixture.source_version, amount};

function checkPaused(snapshot, thread, workflowVersion, intent) {
 assert.equal(snapshot.thread_id, thread);
 assert.match(snapshot.checkpoint_id, /^[\da-f-]{36}$/);
 assert.deepEqual(snapshot.next, ['approval']);
 assert.deepEqual(snapshot.state, {workflow_version: workflowVersion, draft_total: amount, status: 'waiting'});
 assert.equal(snapshot.interrupts.length, 1);
 assert.match(snapshot.interrupts[0].id, /^[\da-f]+$/);
 assert.deepEqual(snapshot.interrupts[0].intent, intent);
}

function checkEvidence(record) {
 assert.equal(record.schema, 'workflow-version-resume-v1');
 assert.equal(record.status, 'passed');
 assert.match(record.environment.python, /^3\.12\.\d+$/);
 assert.equal(record.environment.langgraph, '1.2.20');
 assert.equal(record.environment['langgraph-checkpoint-sqlite'], '3.1.3');
 assert.deepEqual(record.source_sha256, sourceHashes);
 assert.deepEqual(record.fixture, {thread_id: fixture.thread_id, amount, approval_id: fixture.approval_id,
  original_intent: oldIntent, inserted_intent: newIntent});
 assert.deepEqual(Object.keys(record.cases).sort(), [...cases].sort());

 for (const name of cases) {
  const {waiting_v1: waiting, start_pid: startPid, resume, receiver_while_waiting: beforeWrites, receiver_final: receiver} = record.cases[name];
  const routed = name === 'version-routed';
  const rejected = name === 'bound';
  const requested = routed ? oldIntent : newIntent;
  const outcome = rejected ? 'approval_mismatch' : 'committed';
  checkPaused(waiting, fixture.thread_id, 1, oldIntent);
  checkPaused(resume.fresh_v2_pause, 'fresh-v2', 2, newIntent);
  assert.deepEqual(beforeWrites, {decisions: [], writes: [], a_effects: 0, b_effects: 0});
  assert(Number.isInteger(startPid) && startPid > 0 && Number.isInteger(resume.pid) && resume.pid > 0);
  assert.notEqual(startPid, resume.pid);
  assert.deepEqual(resume.before, waiting, name + ' must reopen the same waiting checkpoint');
  assert.equal(resume.requested_graph_version, 2);
  assert.equal(resume.selected_graph_version, routed ? 1 : 2);
  assert.equal(resume.resume_interrupt_id, waiting.interrupts[0].id);
  assert.deepEqual(resume.resume_value, {approval_id: fixture.approval_id});
  assert.deepEqual(receiver.decisions, [{seq: 1, approval_id: fixture.approval_id, requested, approved: oldIntent, outcome}]);
  assert.deepEqual(receiver.writes, rejected ? [] : [{seq: 1, approval_id: fixture.approval_id, intent: requested}]);
  assert.deepEqual([receiver.a_effects, receiver.b_effects], outcomes[name]);
  assert.deepEqual(['A/daily', 'B/daily'].map(target => receiver.writes.filter(write => write.intent.target === target).length), outcomes[name]);

  if (name === 'unsafe') {
   checkPaused(resume.after, fixture.thread_id, 1, oldIntent);
  } else {
   assert.equal(resume.after.thread_id, fixture.thread_id);
   assert.match(resume.after.checkpoint_id, /^[\da-f-]{36}$/);
   assert.notEqual(resume.after.checkpoint_id, waiting.checkpoint_id);
   assert.deepEqual(resume.after.state, {workflow_version: 1, draft_total: amount, status: outcome});
   assert.deepEqual(resume.after.next, []);
   assert.deepEqual(resume.after.interrupts, []);
  }
 }
}

function checkArchive() {
 execFileSync('python3', ['-B', '-c', `
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root.with_suffix('.zip')) as archive:
    names = [root.name + '/' + name for name in sys.argv[2:]]
    assert sorted(archive.namelist()) == sorted(names), archive.namelist()
    for name in names:
        assert archive.read(name) == (root / pathlib.Path(name).name).read_bytes(), name
`, folder, ...archiveFiles]);
}

function checkPage() {
 const context = vm.createContext({URLSearchParams, articleURL: id => '/article/' + id + '/',
  location: {pathname: '/roadmap/agent-platform/', search: '', hash: ''}});
 for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename: file});
 }
 const data = JSON.parse(vm.runInContext(`JSON.stringify({chapter: articles.find(a => a.id === 'durable-workflows'),
  lab: labLearningCatalog.find(a => a.id === 'agent-workflow-version-resume'), archive: labArchiveCatalog['${pack}']})`, context));
 const article = data.chapter.sections[9][1];
 const marker = 'id="' + anchor + '"';
 assert.equal(article.split(marker).length, 2);
 assert.equal(data.chapter.sections.filter(([, html]) => html.includes(marker)).length, 1);
 const section = article.slice(article.indexOf(marker));
 for (const target of ['/labs/' + pack + '.zip', '/labs/' + pack + '/README.md', '/labs/' + pack + '/validation.json', 'diagrams/' + pack + '.svg']) {
  assert(section.includes('href="' + target + '"'), anchor + ' missing ' + target);
 }
 assert.deepEqual([data.lab.track, data.lab.chapter, data.lab.anchor, data.lab.pack, data.archive.folder],
  ['agent', 'durable-workflows', anchor, pack, pack]);
 assert(data.lab.files.includes('resume_lab.py'));
 const goal = vm.runInContext('learningGoalHTML(learningProfiles["agent-platform"])', context);
 assert(goal.includes('/article/durable-workflows/?goal=agent-platform#' + anchor), 'agent-platform gate is missing');

 const metadata = execFileSync('python3', ['-B', '-c', `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
print(json.dumps(json.loads(root.find('{http://www.w3.org/2000/svg}metadata').text)))
`, path.join(root, 'dist', 'diagrams', pack + '.svg')], {encoding: 'utf8'});
 assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', old_first: 'A/daily', new_first: 'B/daily', outcomes});
}

function verifyReplayDatabases(directory, record) {
 const raw = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json, pathlib, sqlite3, sys
from contextlib import closing
root = pathlib.Path(sys.argv[1])
result = {}
for case in sys.argv[2:]:
    with closing(sqlite3.connect((root / case / 'receiver.sqlite').as_uri() + '?mode=ro', uri=True)) as db:
        decisions = [dict(seq=seq, approval_id=approval, requested=json.loads(requested), approved=json.loads(approved), outcome=outcome)
                     for seq, approval, requested, approved, outcome in db.execute('SELECT * FROM decisions ORDER BY seq')]
        writes = [dict(seq=seq, approval_id=approval, intent=json.loads(intent))
                  for seq, approval, intent in db.execute('SELECT * FROM writes ORDER BY seq')]
    with closing(sqlite3.connect((root / case / 'checkpoints.sqlite').as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
        checkpoints = list(db.execute("SELECT thread_id, checkpoint_id FROM checkpoints WHERE checkpoint_ns=''"))
    result[case] = dict(decisions=decisions, writes=writes, checkpoints=checkpoints)
print(json.dumps(result))
`, directory, ...cases], {encoding: 'utf8'}));
 for (const name of cases) {
  const replay = record.cases[name];
  assert.deepEqual(raw[name].decisions, replay.receiver_final.decisions);
  assert.deepEqual(raw[name].writes, replay.receiver_final.writes);
  for (const checkpoint of [replay.waiting_v1, replay.resume.fresh_v2_pause, replay.resume.after]) {
   assert(raw[name].checkpoints.some(([thread, id]) => thread === checkpoint.thread_id && id === checkpoint.checkpoint_id),
    name + ' raw checkpoint is missing');
  }
 }
}

const record = json(path.join(folder, 'validation.json'));
checkEvidence(record);
checkArchive();
checkPage();

if (process.env.INFRA_WORKFLOW_VERSION_PYTHON) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-'));
 try {
  const replayDirectory = path.join(temp, 'replay');
  execFileSync(process.env.INFRA_WORKFLOW_VERSION_PYTHON, ['-B', path.join(folder, 'resume_lab.py'), '--output-dir', replayDirectory],
   {timeout: 150000, stdio: 'pipe'});
  const replay = json(path.join(replayDirectory, 'validation.json'));
  checkEvidence(replay);
  verifyReplayDatabases(replayDirectory, replay);
  const volatile = new Set(['id', 'checkpoint_id', 'resume_interrupt_id', 'pid', 'start_pid']);
  const normalize = value => JSON.parse(JSON.stringify(value, (key, data) => volatile.has(key) ? undefined : data));
  assert.deepEqual(normalize(replay.cases), normalize(record.cases));
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

console.log('PASS: LangGraph paused v1, inserted v2 gate, two receiver safeguards, exact archive and course evidence.');
