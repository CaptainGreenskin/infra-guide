// Check the captured HTTP, SQLite and package offline. Set MCP_HTTP_PYTHON to replay with the fixed SDK.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lab = path.join(root, 'dist/labs/mcp-http-cancellation');
const figure = path.join(root, 'dist/diagrams/mcp-http-cancellation.svg');
const sources = ['README.md', 'cancellation_lab.py', 'orders.json', 'requirements.txt'];
const cases = ['before', 'after'];
const artifacts = cases.flatMap(name => ['-client.jsonl', '-server.jsonl', '.sqlite'].map(ext => name + ext));
const protocol = '2026-07-28';
const read = (folder, file) => fs.readFileSync(path.join(folder, file), 'utf8');
const parse = (folder, file) => JSON.parse(read(folder, file));
const jsonLines = (folder, file) => read(folder, file).trimEnd().split('\n').map(line => JSON.parse(line));
const sha = (folder, file) => createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex');
const python = (program, ...args) => execFileSync('python3', ['-B', '-c', program, ...args], {encoding: 'utf8'});

const fixture = parse(lab, 'orders.json');
const {task_id: taskId, version, batches} = fixture;
const operation = `${taskId}/v${version}:publish`;
const total = Object.values(batches).flat().reduce((sum, value) => sum + value, 0);
assert.equal(total, 42);
assert.deepEqual(fixture, parse(path.join(root, 'dist/labs/mcp-protocol'), 'orders.json'));

function checkDigests(folder, expected, names) {
 assert.deepEqual(Object.keys(expected).sort(), [...names].sort());
 for (const name of names) assert.equal(sha(folder, name), expected[name], name);
}

function one(rows, predicate, description) {
 const matches = rows.filter(predicate);
 assert.equal(matches.length, 1, description);
 return matches[0];
}

function checkResult(result, expected) {
 assert.equal(result.resultType, 'complete');
 assert.equal(result.isError, false);
 assert.deepEqual(result.structuredContent, expected);
 assert.equal(result.content.length, 1);
 assert.equal(result.content[0].type, 'text');
 assert.deepEqual(JSON.parse(result.content[0].text), expected);
}

function checkSqlite(folder, name, committed) {
 const state = JSON.parse(python(`
import json, pathlib, sqlite3, sys
with sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri() + "?mode=ro", uri=True) as db:
    print(json.dumps({
        "integrity": db.execute("PRAGMA integrity_check").fetchall(),
        "orphans": db.execute("PRAGMA foreign_key_check").fetchall(),
        "reports": db.execute("SELECT op, task_id, version, total FROM reports").fetchall(),
        "receipts": db.execute("SELECT op, total FROM receipts").fetchall(),
    }))
`, path.join(folder, name + '.sqlite')));
 assert.deepEqual(state, {
  integrity: [['ok']],
  orphans: [],
  reports: committed ? [[operation, taskId, version, total]] : [],
  receipts: committed ? [[operation, total]] : [],
 });
 return state;
}

function checkCase(folder, name, summary, clientPid) {
 const committed = name === 'after';
 const expected = {op: operation, total: committed ? total : null};
 const state = checkSqlite(folder, name, committed);
 const server = jsonLines(folder, name + '-server.jsonl');
 const client = jsonLines(folder, name + '-client.jsonl');
 const byEvent = (event, requestId) => one(server, row =>
  row.event === event && (requestId === undefined || row.request_id === requestId), event);
 assert.equal(server[0].event, 'server_ready');
 assert.equal(server.at(-1).event, 'server_stopped');
 assert(Number.isInteger(server[0].pid) && server[0].pid > 0 && server[0].pid !== clientPid);
 assert.equal(server.at(-1).pid, server[0].pid);
 assert.deepEqual(server.filter(row => row.event === 'http_started'), Array.from({length: 4}, () => ({
  event: 'http_started', method: 'POST', endpoint: '/mcp',
 })));
 const requests = server.filter(row => row.event === 'http_request');
 assert.deepEqual(requests.map(row => row.request.method), ['server/discover', 'tools/list', 'tools/call', 'tools/call']);
 assert.equal(new Set(requests.map(row => row.request.id)).size, 4);
 for (const {request, request_id: requestId, http_method: method, method_header: header, protocol_header: transportVersion} of requests) {
  assert.equal(request.jsonrpc, '2.0');
  assert.equal(request.id, requestId);
  assert.equal(method, 'POST');
  assert.equal(header, request.method);
  assert.equal(transportVersion, protocol);
  assert.equal(request.params._meta['io.modelcontextprotocol/protocolVersion'], protocol);
 }
 const [discover, list, watch, receipt] = requests.map(row => row.request);
 for (const [request, tool] of [[watch, 'watch_publish'], [receipt, 'read_receipt']]) {
  assert.equal(request.params.name, tool);
  assert.deepEqual(request.params.arguments, {task_id: taskId, op: operation});
 }
 assert.equal(server.filter(row => row.event === 'http_response').length, 4);
 const responseBody = request => {
  const response = byEvent('http_response', request.id);
  assert.equal(response.status, 200);
  assert.equal(response.session_header_present, false);
  assert.equal(response.content_type, request === watch ? 'text/event-stream' : 'application/json');
  return Buffer.concat(server.filter(row => row.event === 'response_bytes' && row.request_id === request.id)
   .map(row => Buffer.from(row.body_base64, 'base64'))).toString('utf8');
 };
 const normalResult = request => {
  const body = JSON.parse(responseBody(request));
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.id, request.id);
  assert(!Object.hasOwn(body, 'error'));
  return body.result;
 };
 assert.deepEqual(normalResult(discover).supportedVersions, [protocol]);
 assert.deepEqual(normalResult(list).tools.map(tool => tool.name).sort(), ['read_receipt', 'watch_publish']);

 const progress = {progress: 1, total: 2, message: 'waiting with source open'};
 const rawSse = responseBody(watch).replaceAll('\r\n', '\n');
 assert(rawSse.endsWith('\n\n'));
 const [event, data, ...trailing] = rawSse.split('\n');
 assert.equal(event, 'event: message');
 assert(data.startsWith('data: '));
 assert.deepEqual(trailing, ['', ''], 'only progress, no terminal JSON-RPC reply');
 assert.deepEqual(JSON.parse(data.slice('data: '.length)), {
  jsonrpc: '2.0', method: 'notifications/progress',
  params: {progressToken: watch.params._meta.progressToken, ...progress},
 });

 const opened = byEvent('source_opened', watch.id);
 assert.equal(opened.op, operation);
 const commits = server.filter(row => row.event === 'receiver_committed');
 assert.deepEqual(commits, committed ? [{
  event: 'receiver_committed', request_id: watch.id, op: operation, total,
 }] : []);
 const progressWire = byEvent('response_bytes', watch.id);
 const cleaned = byEvent('handler_cleaned', watch.id);
 assert.equal(cleaned.file_closed, true);
 const receiptRead = byEvent('receipt_read', receipt.id);
 assert.deepEqual(receiptRead.result, expected);
 const timeline = [opened, ...commits, progressWire, byEvent('http_disconnect', watch.id),
  byEvent('handler_cancelled', watch.id), cleaned, receiptRead].map(row => server.indexOf(row));
 assert(timeline.every((index, i) => i === 0 || timeline[i - 1] < index), 'wire, handler and ledger order');

 assert.deepEqual(client.map(row => row.event), ['progress_received', 'cancel_requested', 'caller_cancelled', 'receipt_received']);
 assert.deepEqual(client[0], {event: 'progress_received', ...progress});
 checkResult(client.at(-1).result, expected);
 checkResult(normalResult(receipt), expected);
 assert.deepEqual(summary, {
  watch_request_id: watch.id,
  reports: state.reports.length,
  receipts: state.receipts.length,
  receipt_total: state.receipts[0]?.[1] ?? null,
  file_closed: cleaned.file_closed,
  server_pid: server[0].pid,
  server_exit: 0,
 });
}

function check(folder) {
 const record = parse(folder, 'validation.json');
 assert.equal(record.schema, 'mcp-http-cancellation-v1');
 assert.equal(record.status, 'passed');
 assert.equal(record.protocol, protocol);
 assert(Number.isInteger(record.client_pid) && record.client_pid > 0);
 assert.deepEqual(record.source, {task_id: taskId, version, op: operation, expected_total: total});
 assert.deepEqual(Object.keys(record.cases).sort(), [...cases].sort());
 assert.notEqual(record.cases.before.server_pid, record.cases.after.server_pid);
 for (const [pkg, expected] of Object.entries({mcp: '2.3.0', uvicorn: '0.54.0', httpx2: '2.16.0', anyio: '4.16.0'})) {
  assert.equal(record.environment[pkg], expected);
 }
 checkDigests(lab, record.source_sha256, sources);
 checkDigests(folder, record.artifact_sha256, artifacts);
 for (const name of cases) checkCase(folder, name, record.cases[name], record.client_pid);
 return record;
}

const observed = check(lab);
const files = [...sources, ...artifacts, 'validation.json'].sort();
assert.deepEqual(fs.readdirSync(lab).sort(), files);
const metadata = JSON.parse(python(`
import json, pathlib, sys, xml.etree.ElementTree as ET, zipfile
folder, figure = map(pathlib.Path, sys.argv[1:3])
files = json.loads(sys.argv[3])
with zipfile.ZipFile(str(folder) + ".zip") as archive:
    assert sorted(archive.namelist()) == files
    for name in files:
        assert archive.read(name) == (folder / name).read_bytes(), name
svg = ET.parse(figure).getroot()
ns = {"s": "http://www.w3.org/2000/svg"}
assert svg.attrib["viewBox"] == "0 0 1120 526"
assert svg.attrib["role"] == "img"
assert svg.attrib["aria-labelledby"] == "title desc"
assert svg.find("s:title", ns).attrib["id"] == "title"
assert svg.find("s:desc", ns).attrib["id"] == "desc"
print(svg.find("s:metadata", ns).text)
`, lab, figure, JSON.stringify(files)));
assert.deepEqual(metadata, {
 record: 'labs/mcp-http-cancellation/validation.json',
 before_reports: observed.cases.before.reports,
 after_reports: observed.cases.after.reports,
 after_receipt_total: observed.cases.after.receipt_total,
});

if (process.env.MCP_HTTP_PYTHON) {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-http-cancellation-'));
 try {
  const output = path.join(temporary, 'replay');
  execFileSync(process.env.MCP_HTTP_PYTHON, ['-B', path.join(lab, 'cancellation_lab.py'), '--output-dir', output],
   {stdio: 'inherit', timeout: 45_000});
  check(output);
 } finally {
  fs.rmSync(temporary, {recursive: true, force: true});
 }
}
console.log('MCP HTTP cancellation: progress-only SSE, handler cleanup, before 0/0, after 1/1/42, raw record and ZIP verified.');
