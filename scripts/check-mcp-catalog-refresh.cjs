/* Correlate real SDK traffic with the receiver's independently readable effects. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'dist/labs/mcp-catalog-refresh');
const read = file => fs.readFileSync(file, 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedRows = [['report-A', 'shared', 42, 2]];
const explicit = {report_id: 'report-A', destination: 'shared'};
const implicit = {report_id: 'report-A'};
const subKey = 'io.modelcontextprotocol/subscriptionId';
const expectKey = 'guide.example/expectedContract';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function digestTool({name, description, inputSchema, outputSchema}) {
  return sha(JSON.stringify(stable({name, description, inputSchema, outputSchema})));
}

function checkTrace(run, guarded) {
  const trace = run.trace.map(({direction, message}) => ({direction, ...message}));
  const sent = trace.filter(row => row.direction === 'out');
  const incoming = trace.filter(row => row.direction === 'in');
  const response = request => {
    const found = incoming.filter(row => row.id === request.id && row.result);
    assert.equal(found.length, 1);
    return found[0];
  };
  assert.equal(sent[0].method, 'server/discover');
  assert.deepEqual(response(sent[0]).result.supportedVersions, ['2026-07-28']);
  assert.equal(response(sent[0]).result.capabilities.tools.listChanged, true);

  const listen = sent.find(row => row.method === 'subscriptions/listen');
  const [ack, notification] = incoming.filter(row => row.params?._meta?.[subKey] === listen.id);
  assert.equal(listen.params.notifications.toolsListChanged, true);
  assert.equal(ack.method, 'notifications/subscriptions/acknowledged');
  assert.equal(ack.params.notifications.toolsListChanged, true);
  assert.equal(notification.method, 'notifications/tools/list_changed');
  assert.equal(notification.id, undefined);
  assert.deepEqual(Object.keys(notification.params), ['_meta']);
  assert.equal(sent.at(-1).method, 'notifications/cancelled');
  assert.equal(sent.at(-1).params.requestId, listen.id);

  const lists = sent.filter(row => row.method === 'tools/list');
  assert.equal(lists.length, guarded ? 2 : 1);
  const original = response(lists[0]).result.tools;
  assert.deepEqual(original.map(tool => tool.name), ['publish_report', 'lab_switch_catalog']);
  assert.match(original[0].description, /archive/);
  assert.deepEqual(original[0].inputSchema.required, ['report_id']);
  assert.equal(original[0].inputSchema.properties.destination, undefined);
  assert.deepEqual(run.approval_v1, {contract:digestTool(original[0]), arguments:implicit});

  const calls = sent.filter(row => row.method === 'tools/call');
  assert.equal(calls[0].params.name, 'lab_switch_catalog');
  assert.deepEqual(response(calls[0]).result.structuredContent, {revision:2});
  assert(trace.indexOf(ack) < trace.indexOf(calls[0]));
  assert(trace.indexOf(calls[0]) < trace.indexOf(notification));
  assert(trace.indexOf(notification) < trace.indexOf(calls[1]));
  assert.deepEqual(run.writes, expectedRows);

  if (!guarded) {
    assert.deepEqual(calls.map(row => row.params.name), ['lab_switch_catalog','publish_report']);
    assert.deepEqual(calls[1].params.arguments, implicit);
    assert.equal(calls[1].params._meta[expectKey], undefined);
    assert.equal(response(calls[1]).result.isError, false);
    assert.deepEqual(response(calls[1]).result.structuredContent, {destination:'shared',total:42});
    return;
  }

  assert(trace.indexOf(notification) < trace.indexOf(lists[1]));
  const refreshed = response(lists[1]).result.tools;
  assert.deepEqual(refreshed.map(tool => tool.name), ['publish_report','lab_switch_catalog','preview_report']);
  assert.deepEqual(refreshed[0].inputSchema.required, original[0].inputSchema.required);
  assert.deepEqual(refreshed[0].inputSchema.properties.destination, {enum:['archive','shared'],default:'shared'});
  assert.deepEqual(refreshed[0].outputSchema, original[0].outputSchema);
  assert.notEqual(digestTool(refreshed[0]), digestTool(original[0]));
  assert.deepEqual(run.approval_v2, {contract:digestTool(refreshed[0]), arguments:explicit});
  assert.equal(run.host_rejected, true);
  assert.equal(run.outgoing_before_bypass, 0);
  assert.deepEqual(calls.map(row => row.params.name),
    ['lab_switch_catalog','publish_report','preview_report','publish_report']);
  assert.deepEqual(calls[1].params.arguments, implicit);
  assert.equal(calls[1].params._meta[expectKey], run.approval_v1.contract);
  const rejected = response(calls[1]).result;
  assert.equal(rejected.isError, true);
  assert.equal(rejected.content[0].text, 'stale contract');
  assert.deepEqual(response(calls[2]).result.structuredContent, {destination:'shared',total:42});
  assert.deepEqual(calls[3].params.arguments, explicit);
  assert.equal(calls[3].params._meta[expectKey], run.approval_v2.contract);
  assert.equal(response(calls[3]).result.isError, false);
  assert.deepEqual(response(calls[3]).result.structuredContent, {destination:'shared',total:42});
}

function checkRecord(record, artifactDir) {
  assert.equal(record.status, 'passed');
  assert.equal(record.environment.mcp, '2.3.0');
  assert.deepEqual(Object.keys(record.cases), ['unsafe','guarded']);
  assert.deepEqual(Object.keys(record.source_sha256).sort(), ['catalog_refresh.py','requirements.txt']);
  for (const [file, hash] of Object.entries(record.source_sha256)) {
    assert.equal(sha(fs.readFileSync(path.join(folder, file))), hash);
  }
  assert.deepEqual(Object.keys(record.artifact_sha256).sort(), ['guarded.sqlite','unsafe.sqlite']);
  for (const [file, hash] of Object.entries(record.artifact_sha256)) {
    assert.equal(sha(fs.readFileSync(path.join(artifactDir, file))), hash);
  }
  for (const [mode, run] of Object.entries(record.cases)) {
    checkTrace(run, mode === 'guarded');
    const rows = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json, sqlite3, sys
from pathlib import Path
with sqlite3.connect(Path(sys.argv[1]).as_uri() + '?mode=ro', uri=True) as db:
    print(json.dumps(db.execute("SELECT report_id,destination,total,revision FROM writes ORDER BY rowid").fetchall()))
`, path.join(artifactDir, mode + '.sqlite')], {encoding:'utf8'}));
    assert.deepEqual(rows, expectedRows);
    assert.deepEqual(rows, run.writes);
  }
}

const record = JSON.parse(read(path.join(folder, 'validation.json')));
checkRecord(record, folder);
for (const alter of [
  run => {run.outgoing_before_bypass = 1;},
  run => {run.trace.find(row => row.message.method === 'notifications/tools/list_changed').message.id = 41;},
  run => {run.trace.find(row => row.message.result?.content?.[0]?.text === 'stale contract').message.result.isError = false;}
]) {
  const changed = structuredClone(record.cases.guarded);
  alter(changed);
  assert.throws(() => checkTrace(changed, true), assert.AssertionError);
}

const article = read(path.join(root, 'dist/progressive-agent-integration-reading.js'));
assert(article.includes('id="native-mcp-catalog-refresh"'));
assert(article.includes("trainingFigure('mcp-catalog-refresh'"));
for (const file of ['catalog_refresh.py','README.md','validation.json']) {
  assert(article.includes('labs/mcp-catalog-refresh/' + file));
}
assert(article.includes('labs/mcp-catalog-refresh.zip'));
const securityPage = read(path.join(root, 'dist/article/agent-security/index.html'));
const approval = securityPage.split('id="section-4"')[1].split('id="section-5"')[0];
assert(approval.includes('/article/mcp-protocol/#native-mcp-catalog-refresh'));
for (const value of record.cases.unsafe.writes[0].slice(0,3)) assert(approval.includes(String(value)));
assert(approval.includes('拦下旧批准') && approval.includes('批准记录中的摘要'));


const metadata = JSON.parse(execFileSync('python3', ['-B', '-c', `
import pathlib, sys, zipfile, xml.etree.ElementTree as ET
folder, svg = map(pathlib.Path, sys.argv[1:])
with zipfile.ZipFile(folder.with_suffix('.zip')) as bundle:
    names = sorted(p.name for p in folder.iterdir() if p.is_file())
    assert sorted(bundle.namelist()) == names
    for file in names:
        assert bundle.read(file) == (folder / file).read_bytes(), file
root = ET.parse(svg).getroot()
ns = {'s': 'http://www.w3.org/2000/svg'}
assert root.attrib['aria-labelledby'] == 'title desc'
assert root.find('s:title', ns).text and root.find('s:desc', ns).text
print(root.find('s:metadata', ns).text)
`, folder, path.join(root, 'dist/diagrams/mcp-catalog-refresh.svg')], {encoding:'utf8'}));
assert.deepEqual(metadata, {before:'archive', after:'shared', amount:42, unsafe_writes:1,
  guarded_old_writes:0, guarded_confirmed_writes:1});

const python = process.env.MCP_CATALOG_REFRESH_PYTHON;
if (python) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-catalog-refresh-check-'));
  try {
    const replay = path.join(temporary, 'replay');
    const raw = execFileSync(python, ['-B', path.join(folder, 'catalog_refresh.py'), '--output-dir', replay],
      {timeout:30000, encoding:'utf8'});
    checkRecord(JSON.parse(raw), replay);
  } finally {
    fs.rmSync(temporary, {recursive:true, force:true});
  }
}
console.log('PASS: MCP tool-list subscription, stale vs refreshed approval, receiver contract guard, independent SQLite writes, source and archive.'+
  (python ? ' Fresh SDK replay verified.' : ' Stored SDK record verified.'));
