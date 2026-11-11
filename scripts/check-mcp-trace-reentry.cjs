/* Verify separate trace roots, real MCP HTTP parentage and the receiver's report. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const lab = path.join(root, 'dist/labs/mcp-trace-reentry');
const caseNames = ['first', 'resume-linked', 'resume-unlinked'];
const sourceFiles = ['README.md', 'requirements.txt', 'trace_reentry.py'];
const artifactFiles = ['ledger.sqlite', 'trace-record.json'];
const task = 'report-A';
const op = 'report-A/v3:publish';
const receipt = 'receipt-report-A-v3';
const total = 42;

const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const python = (source, ...args) => execFileSync('python3', ['-B', '-c', source, ...args], {
  encoding: 'utf8', timeout: 15000,
});

function readLedger(file) {
  return JSON.parse(python(`
import json, pathlib, sqlite3, sys
uri = pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro'
with sqlite3.connect(uri, uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone() == ('ok',)
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    print(json.dumps({
        'reports': db.execute('SELECT op,task,total,receipt FROM reports').fetchall(),
        'attempts': db.execute('SELECT number,op,trace_id,outcome FROM attempts ORDER BY number').fetchall()
    }))
`, file));
}

function splitCarrier(header) {
  const match = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/.exec(header);
  assert(match, 'valid W3C traceparent header required');
  assert.equal(parseInt(match[3], 16) & 1, 1);
  return {trace_id: '0x' + match[1], span_id: '0x' + match[2]};
}

function checkTraceHeader(header, span) {
  const {trace_id, span_id} = splitCarrier(header);
  assert.equal(trace_id, span.context.trace_id);
  assert.equal(span_id, span.context.span_id);
}

function checkRun(directory) {
  const validation = json(path.join(directory, 'validation.json'));
  assert.equal(validation.environment.mcp, '2.3.0');
  assert.equal(validation.environment['opentelemetry-sdk'], '1.45.2');
  for (const [entries, dir, files] of [
    [validation.source_sha256, lab, sourceFiles],
    [validation.artifact_sha256, directory, artifactFiles],
  ]) {
    assert.deepEqual(Object.keys(entries).sort(), files);
    for (const [file, digest] of Object.entries(entries)) assert.equal(sha(path.join(dir, file)), digest, file);
  }

  const {checkpoint, clients, server} = json(path.join(directory, 'trace-record.json'));
  assert.deepEqual(Object.keys(clients), caseNames);
  assert.equal(new Set([server.pid, ...Object.values(clients).map(client => client.pid)]).size, 4);
  assert.equal(server.requests.length, 3);
  assert.equal(server.spans.length, 3);
  assert.deepEqual([checkpoint.task, checkpoint.op, checkpoint.total], [task, op, total]);

  const original = clients.first.spans.find(span => span.name === 'agent.report.run');
  checkTraceHeader(checkpoint.origin.traceparent, original);
  const traceIds = new Set();
  const expectedAttempts = [];
  let links = 0;
  for (const [index, caseName] of caseNames.entries()) {
    const client = clients[caseName];
    assert.equal(client.spans.length, 2);
    const run = client.spans.find(span => span.name === 'agent.report.run');
    const sender = client.spans.find(span => span.name === 'mcp.tools/call.send');
    assert.equal(run.kind, 'SpanKind.INTERNAL');
    assert.equal(run.attributes['app.case'], caseName);
    assert.equal(run.parent_id, null);
    assert.deepEqual(run.links, caseName === 'resume-linked' ? [
      {context: original.context, attributes: {'app.relation': 'resumes'}},
    ] : []);
    links += run.links.length;
    assert.equal(sender.kind, 'SpanKind.CLIENT');
    assert.equal(sender.parent_id, run.context.span_id);
    assert.equal(sender.context.trace_id, run.context.trace_id);
    assert.deepEqual(sender.links, []);
    const request = server.requests[index];
    assert.equal(request.status, 200);
    assert.equal(request.protocol, '2026-07-28');
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/mcp');
    assert.equal(request.mcp_method, 'tools/call');
    assert.equal(request.parent_is_remote, true);
    checkTraceHeader(request.traceparent, sender);
    const receiver = server.spans.find(span => span.context.trace_id === run.context.trace_id);
    assert.equal(receiver.name, 'mcp.tools/call.receive');
    assert.equal(receiver.kind, 'SpanKind.SERVER');
    assert.equal(receiver.parent_id, sender.context.span_id);
    assert.deepEqual(receiver.links, []);
    for (const span of [run, sender, receiver]) assert.equal(span.attributes['app.op'], op);
    assert.equal(run.resource.attributes['service.name'], 'report-runner');
    assert.equal(sender.resource.attributes['service.name'], 'report-runner');
    assert.equal(receiver.resource.attributes['service.name'], 'report-tool');
    assert.equal(new Set([run, sender, receiver].map(span => span.context.span_id)).size, 3);

    const outcome = index === 0 ? 'committed' : 'reused';
    assert.deepEqual(client.result, {task, op, total, receipt, outcome});
    traceIds.add(run.context.trace_id);
    expectedAttempts.push([index + 1, op, run.context.trace_id.slice(2), outcome]);
  }

  assert.equal(traceIds.size, 3);
  const ledger = readLedger(path.join(directory, 'ledger.sqlite'));
  assert.deepEqual(ledger.reports, [[op, task, total, receipt]]);
  assert.deepEqual(ledger.attempts, expectedAttempts);
  assert.deepEqual(validation.results, {traces: traceIds.size, links, effects: ledger.reports.length,
    attempts: ledger.attempts.length, receipts: ledger.reports.map(row => row[3])});
  return validation.results;
}

const result = checkRun(lab);
const page = fs.readFileSync(path.join(root, 'dist/article/agent-observability/index.html'), 'utf8');
const lesson = page.split('id="trace-reentry-ledger-lookup"')[1];
assert(lesson, 'the original receipt lookup has a direct reading destination');
const readerCode = lesson.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1]
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function checkReaderLookup(directory) {
  const output = execFileSync('python3', ['-B', '-c', readerCode], {
    cwd: directory, encoding: 'utf8', timeout: 10000,
  }).trim().split('\n');
  assert.deepEqual(output, [op, '1 committed', '2 reused', '3 reused', total + ' ' + receipt]);
}
checkReaderLookup(lab);

const metadata = JSON.parse(python(`
import pathlib, sys, zipfile, xml.etree.ElementTree as ET
root, lab = map(pathlib.Path, sys.argv[1:])
with zipfile.ZipFile(lab.with_suffix('.zip')) as bundle:
    assert sorted(bundle.namelist()) == sorted(p.name for p in lab.iterdir() if p.is_file())
    for file in bundle.namelist():
        assert bundle.read(file) == (lab / file).read_bytes(), file
svg = ET.parse(root / 'dist/diagrams/mcp-trace-reentry.svg').getroot()
ns = {'svg': 'http://www.w3.org/2000/svg'}
assert svg.attrib['aria-labelledby'] == 'title desc'
assert svg.find('svg:title', ns).text and svg.find('svg:desc', ns).text
print(svg.find('svg:metadata', ns).text)
`, root, lab));
assert.equal(metadata.record, 'labs/mcp-trace-reentry/validation.json');
for (const key of ['traces', 'links', 'effects', 'attempts']) assert.equal(metadata[key], result[key]);

const interpreter = process.env.MCP_TRACE_REENTRY_PYTHON;
if (interpreter) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-mcp-trace-reentry-'));
  try {
    const replay = path.join(temporary, 'replay');
    execFileSync(interpreter, ['-B', path.join(lab, 'trace_reentry.py'), replay], {timeout: 75000});
    assert.deepEqual(checkRun(replay), result);
    checkReaderLookup(replay);
  } finally {
    fs.rmSync(temporary, {recursive: true, force: true});
  }
}
console.log('PASS MCP/OTel: 3 traces, 1 span link, 3 attempts, 1 SQLite effect' +
            (interpreter ? ' (fresh replay verified)' : ' (published record verified)'));
