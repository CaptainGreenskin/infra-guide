/* Independently verify the recorded model/host/receiver boundaries. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lab = path.join(root, 'dist/labs/model-mcp-recovery');
const planning = path.join(root, 'dist/labs/model-plan-revision');
const operation = 'report-A/v3:publish';
const protocol = '2026-07-28';
const sourceFiles = ['model_mcp_recovery.py', 'requirements.txt', 'README.md'];
const planningFiles = ['assets.json', 'fixture.json', 'model_plan_lab.py'];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const fileHashes = (directory, files) => Object.fromEntries(files.map(name => [name, hash(fs.readFileSync(path.join(directory, name)))]));
const canonical = value => {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value !== null && typeof value === 'object') {
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 }
 return JSON.stringify(value);
};
const source = read(path.join(planning, 'fixture.json'));
const {task_id, target, base_source, base_values, extra_batch, extra_values, operator} = source;
const total = [...base_values, ...extra_values].reduce((sum, value) => sum + value, 0);
const draft = {task_id, target, revision: 2, total, sources: [base_source, extra_batch]};
const priorDraft = {...draft, revision: 1, total: base_values.reduce((sum, value) => sum + value, 0), sources: [base_source]};
const sha = hash(canonical(draft));
const receipt = {operation_id: operation, receipt_id: 'receipt-report-A-v3', draft_sha256: sha, draft};
const empty = {reports: [], receipts: []};
const actual = {reports: [draft], receipts: [receipt]};
const facts = [{source: base_source, amounts: base_values}, {source: extra_batch, amounts: extra_values}];
const approval = value => ({operator, decision: 'approve', task_id, target, revision: value.revision, draft_sha256: hash(canonical(value))});
const waiting = {state: 'WAITING_APPROVAL', draft, operation_id: null, draft_sha256: null, receipt: null, local_reports: 0};
const pending = {...waiting, state: 'PUBLISH_PENDING', operation_id: operation, draft_sha256: sha};
const done = {...pending, state: 'DONE', receipt};
const names = ['read_order_manifest', 'revise_plan', 'read_extra_batch', 'request_draft'];
const args = [{report_id: task_id}, {extra_batch}, {extra_batch}, {report_id: task_id}];
const outputs = [
 {report_id: task_id, base_source, values: base_values, extra_batch, plan_has_extra: false},
 {revision: 2, accepted: true, extra_batch, plan_has_extra: true, extra_batch_read: false},
 {extra_batch, values: extra_values, all_sources_read: true},
 {state: 'WAITING_APPROVAL', draft},
];

function check(record) {
 assert.equal(record.schema, 'model-mcp-recovery-v1');
 assert.equal(record.status, 'passed');
 assert.equal(record.protocol, protocol);
 assert.equal(record.environment.mcp, '2.3.0');
 assert.equal(record.environment.uvicorn, '0.54.0');
 assert.deepEqual(record.assets, read(path.join(planning, 'assets.json')));
 assert.deepEqual(record.planning_source_sha256, fileHashes(planning, planningFiles));
 assert.deepEqual(record.source_sha256, fileHashes(lab, sourceFiles));
 assert.equal(total, 42);
 assert.equal(priorDraft.total, 37);
 assert.deepEqual(record.paused.state.task, {id: task_id, status: 'WAITING_APPROVAL', revision: 2, draft});
 assert.deepEqual(record.paused.state.facts, facts);
 assert.deepEqual(record.paused.state.plans, [
  {revision: 1, steps: [names[0], names[3]], added_source: null},
  {revision: 2, steps: [names[0], names[2], names[3]], added_source: extra_batch},
 ]);
 assert.deepEqual(record.paused.state.reports, []);
 const messages = [{role: 'system', content: source.system_prompt}, {role: 'user', content: source.question}];
 assert.equal(record.model_turns.length, names.length);
 const ids = new Set();
 for (const [index, turn] of record.model_turns.entries()) {
  assert.equal(turn.status, 200);
  assert.equal(turn.response.system_fingerprint, 'b12110-cd959bae9');
  assert.equal(turn.request.tool_choice, 'auto');
  assert.equal(turn.request.model, 'local-qwen');
  assert.deepEqual(turn.request.tools.map(tool => tool.function.name), names);
  assert.deepEqual(turn.request.messages, messages);
  const [choice] = turn.response.choices;
  assert.equal(turn.response.choices.length, 1);
  assert.equal(choice.finish_reason, 'tool_calls');
  assert.equal(choice.message.tool_calls.length, 1);
  const [call] = choice.message.tool_calls;
  assert.equal(call.type, 'function');
  assert(call.id && !ids.has(call.id));
  ids.add(call.id);
  assert.equal(call.function.name, names[index]);
  assert.deepEqual(JSON.parse(call.function.arguments), args[index]);
  const event = record.paused.state.events[index];
  assert.deepEqual(event, {seq: index + 1, kind: 'tool', payload: {name: names[index], arguments: args[index], result: outputs[index]}});
  const next = record.model_turns[index + 1];
  if (next) {
   const result = next.request.messages.at(-1);
   assert.equal(result.role, 'tool');
   assert.equal(result.tool_call_id, call.id);
   assert.deepEqual(JSON.parse(result.content), outputs[index]);
   messages.push(choice.message, result);
  }
 }
 assert.equal(record.paused.state.events.length, names.length);

 assert.equal(record.stale.decision, 'approval_mismatch');
 assert.deepEqual(record.stale.approval, approval(priorDraft));
 assert.deepEqual(record.stale.before, waiting);
 assert.deepEqual(record.stale.after, waiting);
 assert.deepEqual(record.stale.receiver, empty);
 assert.deepEqual(record.stale.receiver_events, []);
 assert.deepEqual(record.cut.approval, approval(draft));
 assert.equal(record.cut.exit, -9);
 assert.deepEqual(record.cut.host, pending);
 assert.deepEqual(record.cut.receiver, actual);
 assert.deepEqual(record.cut.receiver_events.map(event => event.event), ['request', 'receiver_commit']);
 assert.deepEqual(record.cut.receiver_events_after_exit, record.cut.receiver_events);
 assert.equal(record.cut.receiver_events[1].operation_id, operation);
 assert.deepEqual(record.receiver_events.slice(0, 2), record.cut.receiver_events);
 const calls = record.receiver_events.filter(event => event.event === 'request');
 assert.equal(calls.length, 2);
 assert(calls.every(event => event.protocol === protocol && event.wire.jsonrpc === '2.0' && event.wire.method === 'tools/call'));
 assert.deepEqual(calls.map(event => [event.wire.id, event.wire.params.name, event.wire.params.arguments]), [
  [3, 'publish_report', {operation_id: operation, draft, draft_sha256: sha}],
  [3, 'lookup_receipt', {operation_id: operation}],
 ]);
 assert.deepEqual(record.receiver_events.filter(event => event.event === 'receiver_commit'), [{event: 'receiver_commit', operation_id: operation}]);
 assert.deepEqual(record.receiver_events.filter(event => event.event === 'receiver_lookup'), [{event: 'receiver_lookup', operation_id: operation}]);
 assert(record.receiver_events.some(event => event.event === 'response_start' && event.tool === 'lookup_receipt' && event.status === 200));
 assert.equal(record.recovery.tool, 'lookup_receipt');
 assert.deepEqual(record.recovery.before, pending);
 assert.deepEqual(record.recovery.after, done);
 assert.equal(record.recovery.wire.status, 200);
 assert.deepEqual(record.recovery.wire.request, calls[1].wire);
 assert.equal(record.recovery.wire.response.id, calls[1].wire.id);
 assert.equal(record.recovery.wire.response.jsonrpc, '2.0');
 const result = record.recovery.wire.response.result;
 assert.equal(result.isError, false);
 assert.equal(result.resultType, 'complete');
 assert.deepEqual(result.structuredContent, receipt);
 assert.equal(result.content.length, 1);
 assert.equal(result.content[0].type, 'text');
 assert.deepEqual(JSON.parse(result.content[0].text), receipt);
 assert.equal(record.receiver_exit, 0);
 assert.deepEqual(record.receiver_final, actual);
 const pids = [record.engine_pid, record.paused.pid, record.stale.pid, record.cut.pid, record.recovery.pid, record.receiver_pid];
 assert(pids.every(pid => Number.isInteger(pid) && pid > 0));
 assert.equal(new Set(pids).size, pids.length);
}

const recordFile = path.join(lab, 'validation.json');
assert(!/\/(?:Users|private|var\/folders|tmp)\//.test(fs.readFileSync(recordFile, 'utf8')));
const published = read(recordFile);
check(published);
const figure = fs.readFileSync(path.join(root, 'dist/diagrams/model-mcp-recovery.svg'), 'utf8');
assert.deepEqual(JSON.parse(figure.match(/<metadata>([^<]+)<\/metadata>/)[1]), {
 record: 'labs/model-mcp-recovery/validation.json',
 operation: published.cut.host.operation_id,
 report_total: published.cut.receiver.reports[0].total,
 old_approval_total: priorDraft.total,
 worker_exit: published.cut.exit,
 resume_tool: published.recovery.tool,
 reports: published.cut.receiver.reports.length,
 receipts: published.cut.receiver.receipts.length
});
execFileSync('python3', ['-B', '-c', `
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == sorted(root.name + '/' + name for name in sys.argv[2:])
    for entry in archive.infolist():
        assert archive.read(entry) == (root / pathlib.Path(entry.filename).name).read_bytes(), entry.filename
`, lab, ...sourceFiles, 'validation.json']);

const interpreter = process.env.INFRA_MODEL_MCP_RECOVERY_PYTHON;
const server = process.env.INFRA_MODEL_MCP_RECOVERY_SERVER;
const model = process.env.INFRA_MODEL_MCP_RECOVERY_MODEL;
if (interpreter || server || model) {
 assert(interpreter && server && model, 'set all three model recovery replay variables');
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-model-mcp-recovery-'));
 const replay = path.join(directory, 'replay');
 try {
  execFileSync(interpreter, ['-B', path.join(lab, 'model_mcp_recovery.py'), 'run', '--planning-pack', planning,
   '--server', server, '--model', model, '--output-dir', replay], {timeout: 120000});
  check(read(path.join(replay, 'validation.json')));
  const stores = execFileSync('python3', ['-B', '-c', `
import json, pathlib, sqlite3, sys
from contextlib import closing
root = pathlib.Path(sys.argv[1])
with closing(sqlite3.connect((root / 'task.sqlite').as_uri() + '?mode=ro', uri=True)) as task:
    state, = task.execute('SELECT status FROM task').fetchone()
    operation, sha, ack = task.execute('SELECT * FROM dispatch').fetchone()
    local_count, = task.execute('SELECT count(*) FROM reports').fetchone()
with closing(sqlite3.connect((root / 'receiver.sqlite').as_uri() + '?mode=ro', uri=True)) as receiver:
    reports = [json.loads(row[0]) for row in receiver.execute('SELECT body FROM reports')]
    receipts = [json.loads(row[0]) for row in receiver.execute('SELECT body FROM receipts')]
print(json.dumps(dict(state=state, operation=operation, sha=sha, ack=json.loads(ack), local_count=local_count,
                      reports=reports, receipts=receipts)))
`, replay], {encoding: 'utf8'});
  assert.deepEqual(JSON.parse(stores), {state: 'DONE', operation, sha, ack: receipt, local_count: 0, ...actual});
 } finally {
  fs.rmSync(directory, {recursive: true, force: true});
 }
}
console.log('PASS model/MCP recovery: four real model turns, stale approval zero effects, worker killed before reply, one original receipt and report.');
