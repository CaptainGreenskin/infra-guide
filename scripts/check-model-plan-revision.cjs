/* Recompute the approval binding and verify actual model turns, persisted decisions, and artifacts. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'model-plan-revision';
const folder = path.join(root, 'dist', 'labs', pack);
const anchor = 'native-model-plan-revision';
const sourceFiles = ['model_plan_lab.py', 'assets.json', 'fixture.json', 'README.md'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, hash(fs.readFileSync(path.join(folder, name)))]));
const fixture = json(path.join(folder, 'fixture.json'));
const assets = json(path.join(folder, 'assets.json'));
const toolNames = ['read_order_manifest', 'revise_plan', 'read_extra_batch', 'request_draft'];
const decisions = ['waiting_approval', 'approval_mismatch', 'published', 'already_done'];
const publishCounts = [0, 0, 1, 1];
const {task_id: task, target, operator, base_source: base, base_values: baseValues, extra_batch: extra, extra_values: extraValues} = fixture;
const sum = values => values.reduce((total, value) => total + value, 0);
const totals = [sum(baseValues), sum([...baseValues, ...extraValues])];
const revisions = [1, 2];
const facts = [{source: base, amounts: baseValues}, {source: extra, amounts: extraValues}];
const drafts = revisions.map((revision, index) => ({task_id: task, target, revision, total: totals[index],
 sources: facts.slice(0, index + 1).map(fact => fact.source)}));
const plans = [
 {revision: 1, steps: [toolNames[0], toolNames[3]], added_source: null},
 {revision: 2, steps: [toolNames[0], toolNames[2], toolNames[3]], added_source: extra}
];
const reports = [{target, draft: drafts[1]}];
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
 ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const approval = draft => ({operator, decision: 'approve', task_id: task, target, revision: draft.revision,
 draft_sha256: hash(JSON.stringify(ordered(draft)))});
const approvals = [null, approval(drafts[0]), approval(drafts[1]), approval(drafts[1])];

assert.deepEqual([task, target, operator, base, baseValues, extra, extraValues],
 ['report-A', 'A/daily', 'operator-A', 'orders-A/v3', [10, 27], 'late-A/v1', [5]]);
assert.deepEqual(totals, [37, 42]);
assert.deepEqual(assets, json(path.join(root, 'dist', 'labs', 'model-mcp-tool-choice', 'assets.json')));
assert.notEqual(approvals[1].draft_sha256, approvals[2].draft_sha256);

function checkEvidence(record) {
 assert.equal(record.schema, 'model-plan-revision-v1');
 assert.equal(record.status, 'passed');
 assert.match(record.environment.python, /^3\.12\.\d+$/);
 assert.equal(record.environment.platform, 'Darwin');
 assert.equal(record.environment.architecture, 'arm64');
 assert.deepEqual(record.fixture, fixture);
 assert.deepEqual(record.assets, assets);
 assert.deepEqual(record.engine_flags, ['--n-gpu-layers', '0', '--threads', '4', '--ctx-size', '2048', '--parallel', '1', '--jinja',
  '--reasoning-budget', '0', '--chat-template-kwargs', '{"enable_thinking":false}', '--alias', 'local-qwen']);
 assert.deepEqual(record.source_sha256, sourceHashes);
 const requests = [{report_id: task}, {extra_batch: extra}, {extra_batch: extra}, {report_id: task}];
 const results = [
  {report_id: task, base_source: base, values: baseValues, extra_batch: extra, plan_has_extra: false},
  {revision: 2, accepted: true, extra_batch: extra, plan_has_extra: true, extra_batch_read: false},
  {extra_batch: extra, values: extraValues, all_sources_read: true},
  {state: 'WAITING_APPROVAL', draft: drafts[1]}
 ];
 const messages = [{role: 'system', content: fixture.system_prompt}, {role: 'user', content: fixture.question}];
 assert(!JSON.stringify(record.model_turns[0].request).includes(extra));
 assert.equal(record.model_turns.length, toolNames.length);
 const expectedEvents = [];
 for (const [index, turn] of record.model_turns.entries()) {
  assert.equal(turn.status, 200);
  assert.equal(turn.response.system_fingerprint, 'b12110-cd959bae9');
  assert.deepEqual(turn.request.messages, messages);
  const {model, tool_choice: mode, temperature, seed, max_tokens: tokens, tools} = turn.request;
  assert.deepEqual([model, mode, temperature, seed, tokens], ['local-qwen', 'auto', 0, 17, 96]);
  assert.deepEqual(tools.map(tool => tool.function.name), toolNames);
  assert.deepEqual(tools, record.model_turns[0].request.tools, 'all tools remain offered across turns');
  assert.equal(turn.response.choices.length, 1);
  const {finish_reason: reason, message} = turn.response.choices[0];
  assert.equal(reason, 'tool_calls');
  assert.equal(message.tool_calls.length, 1);
  const [call] = message.tool_calls;
  assert.equal(call.type, 'function');
  assert.match(call.id, /^[a-zA-Z0-9]+$/);
  assert.equal(call.function.name, toolNames[index]);
  assert.deepEqual(JSON.parse(call.function.arguments), requests[index]);
  messages.push(message, {role: 'tool', tool_call_id: call.id, content: JSON.stringify(results[index])});
  expectedEvents.push({seq: index + 1, kind: 'tool', payload: {name: toolNames[index], arguments: requests[index], result: results[index]}});
 }
 const pendingTask = {id: task, status: 'WAITING_APPROVAL', revision: 2, draft: drafts[1]};
 const doneTask = {...pendingTask, status: 'DONE'};
 assert.deepEqual(record.paused.state, {task: pendingTask, plans, facts, events: expectedEvents, reports: []});
 assert.equal(record.resumes.length, decisions.length);
 const pids = [record.engine_pid, record.paused.pid, ...record.resumes.map(resume => resume.pid)];
 assert(pids.every(pid => Number.isInteger(pid) && pid > 0));
 assert.equal(new Set(pids).size, pids.length, 'model, staging and resumes ran as separate processes');
 for (const [index, resume] of record.resumes.entries()) {
  const expectedDecision = decisions[index];
  assert.equal(resume.decision, expectedDecision);
  assert.deepEqual(resume.before, index === 3 ? doneTask : pendingTask);
  expectedEvents.push({seq: toolNames.length + index + 1, kind: 'resume', payload: {approval: approvals[index], decision: expectedDecision}});
  assert.deepEqual(resume.after, {task: index >= 2 ? doneTask : pendingTask, plans, facts,
   events: expectedEvents, reports: reports.slice(0, publishCounts[index])});
 }
 assert.deepEqual(record.readback, {task: doneTask, plans, facts, events: expectedEvents, reports});
}

function checkArchiveAndDiagram() {
 const metadata = execFileSync('python3', ['-B', '-c', `
import pathlib, sys, xml.etree.ElementTree as ET, zipfile
root, svg = map(pathlib.Path, sys.argv[1:3])
with zipfile.ZipFile(root.with_suffix('.zip')) as archive:
    names = sorted(root.name + '/' + name for name in sys.argv[3:])
    assert archive.namelist() == names, archive.namelist()
    for entry in archive.infolist():
        assert archive.read(entry) == (root / pathlib.Path(entry.filename).name).read_bytes(), entry.filename
        assert entry.date_time == (2026, 11, 11, 0, 0, 0), entry.date_time
print(ET.parse(svg).getroot().find('{http://www.w3.org/2000/svg}metadata').text)
`, folder, path.join(root, 'dist', 'diagrams', pack + '.svg'), ...sourceFiles, 'validation.json'], {encoding: 'utf8'});
 assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', tools: toolNames,
  revisions, totals, publish_counts: publishCounts});
}

function checkPage() {
 const context = vm.createContext({URLSearchParams, articleURL: id => '/article/' + id + '/',
  location: {pathname: '/roadmap/agent-platform/', search: '', hash: ''}});
 for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename: file});
 }
 const data = JSON.parse(vm.runInContext(`JSON.stringify({
  chapter: articles.find(article => article.id === 'durable-workflows'),
  point: infraDomain('agent').points.find(point => point.id === 'ag-planning'),
  lab: labLearningCatalog.find(lab => lab.id === 'agent-model-plan-revision'),
  archive: labArchiveCatalog['${pack}']
 })`, context));
 const marker = 'id="' + anchor + '"';
 const section = data.chapter.sections[8][1];
 assert.equal(data.chapter.sections.filter(([, html]) => html.includes(marker)).length, 1);
 assert.equal(section.split(marker).length, 2);
 const lesson = section.split(marker)[1].split('id="langgraph-workflow-run"')[0];
 assert(section.indexOf('id="agent-planning-run"') < section.indexOf(marker));
 for (const target of ['/labs/' + pack + '.zip', '/labs/' + pack + '/README.md', '/labs/' + pack + '/validation.json',
  'diagrams/' + pack + '.svg']) assert(lesson.includes('href="' + target + '"'), 'missing lesson link ' + target);
 const source = fs.readFileSync(path.join(folder, 'model_plan_lab.py'), 'utf8');
 const lines = source.split('\n').map(line => line.trim());
 const callIndex = lines.indexOf('result = perform_tool(directory, name, args)');
 assert(callIndex >= 0 && lines[callIndex + 1].includes('tool_call_id'));
 const excerpt = vm.runInContext(`trainingEscape(${JSON.stringify(lines.slice(callIndex, callIndex + 2).join('\n'))})`, context);
 assert(lesson.includes(excerpt), 'lesson must display the two actual tool dispatch lines');
 assert(data.point.body.includes('/article/durable-workflows/#' + anchor));
 assert.deepEqual([data.lab.track, data.lab.chapter, data.lab.anchor, data.lab.pack, data.archive.folder],
  ['agent', 'durable-workflows', anchor, pack, pack]);
 assert(data.lab.files.includes('model_plan_lab.py'));
 const goal = vm.runInContext('learningGoalHTML(learningProfiles["agent-platform"])', context);
 assert(goal.includes('/article/durable-workflows/?goal=agent-platform#' + anchor));
}

function verifyReplayDatabase(directory, record) {
 const actual = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json, pathlib, sqlite3, sys
from contextlib import closing
directory = pathlib.Path(sys.argv[1])
with closing(sqlite3.connect((directory / 'task.sqlite').as_uri() + '?mode=ro', uri=True)) as db:
    plans = [dict(revision=revision, steps=json.loads(steps), added_source=source)
             for revision, steps, source in db.execute('SELECT * FROM plans ORDER BY revision')]
    facts = [dict(source=source, amounts=json.loads(amounts))
             for source, amounts in db.execute('SELECT * FROM facts ORDER BY rowid')]
    reports = [dict(target=target, draft=json.loads(draft))
               for target, draft in db.execute('SELECT * FROM reports')]
    events = [dict(seq=seq, kind=kind, payload=json.loads(body)) for seq, kind, body in db.execute('SELECT * FROM events ORDER BY seq')]
print(json.dumps(dict(plans=plans, facts=facts, reports=reports, events=events)))
`, directory], {encoding: 'utf8'}));
 assert.deepEqual(actual, {plans, facts, reports, events: record.readback.events});
 const rawTurns = fs.readFileSync(path.join(directory, 'model-turns.jsonl'), 'utf8').trim().split('\n').map(row => JSON.parse(row));
 assert.deepEqual(rawTurns, record.model_turns);
}

const record = json(path.join(folder, 'validation.json'));
checkEvidence(record);
checkArchiveAndDiagram();

const replayServer = process.env.INFRA_MODEL_PLAN_SERVER;
const replayModel = process.env.INFRA_MODEL_PLAN_GGUF;
if (replayServer || replayModel) {
 assert(replayServer && replayModel, 'set INFRA_MODEL_PLAN_SERVER and INFRA_MODEL_PLAN_GGUF together');
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-'));
 try {
  const replayDirectory = path.join(temp, 'replay');
  execFileSync(process.env.INFRA_MODEL_PLAN_PYTHON || 'python3.12',
   ['-B', path.join(folder, 'model_plan_lab.py'), 'run', '--output-dir', replayDirectory, '--server', replayServer, '--model', replayModel],
   {timeout: 120000, stdio: 'pipe'});
  const replay = json(path.join(replayDirectory, 'validation.json'));
  checkEvidence(replay);
  verifyReplayDatabase(replayDirectory, replay);
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}
checkPage();
console.log('model-plan-revision: four actual model proposals, persisted revision, exact approval, and SQLite report verified');
