// Offline verification of actual SDK/HTTP artifacts. Set MCP_HTTP_AUTH_PYTHON to replay.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const lab = path.join(root, 'dist/labs/mcp-http-authorization');
const figure = path.join(root, 'dist/diagrams/mcp-http-authorization.svg');
const sources = ['README.md', 'authorization_lab.py', 'orders.json', 'requirements.txt'];
const artifacts = ['server.jsonl', 'client.jsonl', 'reports.sqlite'];
const protocol = '2026-07-28';
const issuer = 'https://fixture-issuer.invalid';
const subject = 'learner-A';
const tool = 'read_order_report';
const read = (folder, file) => fs.readFileSync(path.join(folder, file), 'utf8');
const parse = (folder, file) => JSON.parse(read(folder, file));
const jsonLines = (folder, file) => read(folder, file).trimEnd().split('\n').map(line => JSON.parse(line));
const sha = (folder, file) => createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex');
const python = (program, ...args) => execFileSync('python3', ['-B', '-c', program, ...args], {encoding: 'utf8'});

const source = parse(lab, 'orders.json');
const {task_id: reportA, version, batches} = source;
const total = Object.values(batches).flat().reduce((sum, value) => sum + value, 0);
const reportB = 'report-B';
const allowed = {report_id: reportA, source_version: version, total};
assert.equal(total, 42);
assert.deepEqual(source, parse(path.join(root, 'dist/labs/mcp-protocol'), 'orders.json'));

function checkDigests(folder, expected, names) {
 assert.deepEqual(Object.keys(expected).sort(), [...names].sort());
 for (const name of names) assert.equal(sha(folder, name), expected[name], name);
}

function checkDatabase(folder, first, last) {
 assert.equal(first.reports_sha256, last.reports_sha256);
 assert.equal(first.reports_sha256, sha(folder, 'reports.sqlite'));
 const result = JSON.parse(python(`
import json, pathlib, sqlite3, sys
db_uri = pathlib.Path(sys.argv[1]).resolve().as_uri() + "?mode=ro"
with sqlite3.connect(db_uri, uri=True) as db:
    print(json.dumps({
        "integrity": db.execute("PRAGMA integrity_check").fetchall(),
        "tables": db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(),
        "reports": [[name, tenant, version, json.loads(body)] for name, tenant, version, body
                    in db.execute("SELECT report_id, tenant, version, source_json FROM reports ORDER BY report_id")],
    }))
`, path.join(folder, 'reports.sqlite')));
 assert.deepEqual(result, {
  integrity: [['ok']], tables: [['reports']],
  reports: [[reportA, 'tenant-A', version, batches], [reportB, 'tenant-B', 1, {base: [9999]}]],
 });
}

function checkTrace(folder, record) {
 const server = jsonLines(folder, 'server.jsonl');
 const client = jsonLines(folder, 'client.jsonl');
 const [first, last] = [server[0], server.at(-1)];
 assert.equal(first.event, 'server_ready');
 assert.equal(last.event, 'server_stopped');
 assert.equal(first.pid, record.server_pid);
 assert.equal(last.pid, record.server_pid);
 checkDatabase(folder, first, last);

 const resource = new URL(first.resource);
 assert.equal(resource.protocol, 'http:');
 assert.equal(resource.hostname, '127.0.0.1');
 assert.match(resource.port, /^[1-9]\d*$/);
 assert.equal(resource.pathname, '/mcp');
 assert.equal(resource.href, resource.origin + '/mcp');
 const metadataPath = '/.well-known/oauth-protected-resource/mcp';
 const metadata = resource.origin + metadataPath;
 const expectedRequests = [
  ['missing_token', 'server/discover'], ['metadata', ''],
  ['wrong_audience', 'server/discover'], ['wrong_scope', 'server/discover'],
  ...['wrong_tenant', 'allowed'].flatMap(name => ['server/discover', 'tools/list', 'tools/call'].map(method => [name, method])),
 ];
 const indices = server.flatMap((row, index) => row.event === 'http_request' ? [index] : []);
 assert.equal(indices[0], 1);
 assert.deepEqual(indices.map(index => [server[index].case, server[index].rpc_method]), expectedRequests);
 const exchanges = indices.map((index, i) => server.slice(index, indices[i + 1] ?? server.length - 1));

 function response(exchange, sequence, status, credentialPresent) {
  assert.deepEqual(exchange.map(row => row.event), ['http_request', ...sequence, 'http_response', 'http_response_body']);
  const [request, start, body] = [exchange[0], exchange.at(-2), exchange.at(-1)];
  assert.equal(request.credential_present, credentialPresent);
  assert.equal(request.method, request.case === 'metadata' ? 'GET' : 'POST');
  assert.equal(request.path, request.case === 'metadata' ? metadataPath : '/mcp');
  assert.equal(request.protocol, request.case === 'metadata' ? '' : protocol);
  assert.equal(start.case, request.case);
  assert.equal(body.case, request.case);
  assert.equal(start.status, status);
  assert.equal(start.content_type, 'application/json');
  return {body: JSON.parse(body.body), challenge: start.challenge};
 }

 const claims = (audience, scopes) => ({event: 'token_verified', issuer, audience, subject, scopes});
 const report = {};
 assert.deepEqual(client.map(row => row.event),
  ['ingress_result', 'metadata_result', 'ingress_result', 'ingress_result', 'tool_result', 'tool_result']);
 for (const [i, status, code, verified] of [
  [0, 401, 'invalid_token', null],
  [2, 401, 'invalid_token', claims('https://wrong-audience.invalid/mcp', ['report.read'])],
  [3, 403, 'insufficient_scope', claims(resource.href, ['report.write'])],
 ]) {
  const exchange = exchanges[i];
  const caseName = exchange[0].case;
  const result = response(exchange, verified ? ['token_verified'] : [], status, Boolean(verified));
  if (verified) assert.deepEqual(exchange[1], verified);
  assert.equal(result.body.error, code);
  assert(result.challenge.startsWith('Bearer '));
  assert(result.challenge.includes(`error="${code}"`));
  assert(result.challenge.includes(`resource_metadata="${metadata}"`));
  assert.deepEqual(client[i], {event: 'ingress_result', case: caseName, status, ...result});
  report[caseName] = exchange.at(-2).status;
 }

 const metadataResult = response(exchanges[1], [], 200, false);
 assert.equal(metadataResult.challenge, '');
 assert.deepEqual(metadataResult.body, {
  resource: resource.href, authorization_servers: [issuer + '/'],
  scopes_supported: ['report.read'], bearer_methods_supported: ['header'],
 });
 assert.deepEqual(client[1], {event: 'metadata_result', status: 200, body: metadataResult.body});
 report.metadata = exchanges[1].at(-2).status;

 const toolRequests = [];
 for (const [firstIndex, clientIndex, target] of [[4, 4, reportB], [7, 5, reportA]]) {
  const denied = target === reportB;
  const caseName = denied ? 'wrong_tenant' : 'allowed';
  for (const [j, method] of ['server/discover', 'tools/list', 'tools/call'].entries()) {
   const exchange = exchanges[firstIndex + j];
   const expectedSequence = ['token_verified', 'rpc_request_body'];
   if (j === 2) expectedSequence.push(denied ? 'object_denied' : 'body_read');
   const {body, challenge} = response(exchange, expectedSequence, 200, true);
   assert.equal(challenge, '');
   assert.deepEqual(exchange[1], claims(resource.href, ['report.read']));
   const request = exchange[2].body;
   assert.equal(exchange[2].case, caseName);
   assert.equal(request.jsonrpc, '2.0');
   assert.equal(request.method, method);
   assert.equal(request.params._meta['io.modelcontextprotocol/protocolVersion'], protocol);
   assert.equal(body.jsonrpc, '2.0');
   assert.equal(body.id, request.id);
   assert(!Object.hasOwn(body, 'error'));
   const result = body.result;
   if (j === 0) assert.deepEqual(result.supportedVersions, [protocol]);
   if (j === 1) {
    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].name, tool);
    assert.equal(result.tools[0].annotations.readOnlyHint, true);
    assert.deepEqual(result.tools[0].inputSchema.required, ['report_id']);
   }
   if (j !== 2) continue;
   toolRequests.push(request);
   assert.equal(request.params.name, tool);
   assert.deepEqual(request.params.arguments, {report_id: target});
   assert.equal(result.isError, denied);
   assert.equal(result.resultType, 'complete');
   assert.deepEqual(client[clientIndex], {event: 'tool_result', case: caseName, report_id: target, result});
   const authEvent = exchange[3];
   if (denied) {
    assert.deepEqual(authEvent, {event: 'object_denied', request_id: request.id, subject, report_id: reportB});
    assert(!Object.hasOwn(result, 'structuredContent'));
    assert.deepEqual(result.content, [{type: 'text', text: 'Report unavailable.'}]);
    report.wrong_tenant = 'tool_denied';
   } else {
    assert.deepEqual(authEvent, {
     event: 'body_read', request_id: request.id, subject, tenant: 'tenant-A', batches: Object.keys(batches), ...allowed,
    });
    assert.deepEqual(result.structuredContent, allowed);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'text');
    assert.deepEqual(JSON.parse(result.content[0].text), allowed);
    report.allowed_total = result.structuredContent.total;
   }
  }
 }
 assert.deepEqual(toolRequests.map(request => request.id), [3, 3], 'request IDs repeat across the two SDK clients');
 const [deniedRequest, allowedRequest] = toolRequests;
 assert.deepEqual(deniedRequest, {...allowedRequest, params: {...allowedRequest.params, arguments: {report_id: reportB}}},
  'the body of the denied request differs only in the target report');
 report.body_reads = server.filter(row => row.event === 'body_read').length;
 assert.equal(report.body_reads, 1);
 assert.deepEqual(record.summary, report);
}

function check(folder) {
 const record = parse(folder, 'validation.json');
 assert.equal(record.schema, 'mcp-http-authorization-v1');
 assert.equal(record.status, 'passed');
 assert.equal(record.protocol, protocol);
 assert.equal(record.server_exit, 0);
 for (const pid of [record.client_pid, record.server_pid]) assert(Number.isInteger(pid) && pid > 0);
 assert.notEqual(record.client_pid, record.server_pid);
 for (const [pkg, expected] of Object.entries({mcp: '2.3.0', uvicorn: '0.54.0', httpx2: '2.16.0', PyJWT: '2.15.1', cryptography: '50.0.2'})) {
  assert.equal(record.environment[pkg], expected);
 }
 checkDigests(lab, record.source_sha256, sources);
 checkDigests(folder, record.artifact_sha256, artifacts);
 checkTrace(folder, record);
 return record.summary;
}

const summary = check(lab);
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
assert svg.attrib["viewBox"] == "0 0 1120 525"
assert svg.attrib["role"] == "img"
assert svg.attrib["aria-labelledby"] == "title desc"
assert svg.find("s:title", ns).attrib["id"] == "title"
assert svg.find("s:desc", ns).attrib["id"] == "desc"
print(svg.find("s:metadata", ns).text)
`, lab, figure, JSON.stringify(files)));
const {metadata: _status, ...drawn} = summary;
assert.deepEqual(metadata, {record: 'labs/mcp-http-authorization/validation.json', ...drawn});

const context = vm.createContext({});
for (const [, file] of read(root, 'src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
 if (file !== 'app.js') vm.runInContext(read(path.join(root, 'dist'), file), context, {filename: file});
}
const security = vm.runInContext('articleById("agent-security").sections[1][1]', context);
const kairo = vm.runInContext('articleById("kairo-practice").sections[6][1]', context);
function checkBridge(html, anchor, href) {
 const parts = html.split(`id="${anchor}"`);
 assert.equal(parts.length, 2, `${anchor}: one exercise destination`);
 assert(parts[1].includes(href), `${anchor}: link to the matching exercise`);
}
const resourceScope = 'mcp-resource-scope';
const readEvidence = 'kairo-read-evidence';
for (const html of [security, read(root, 'dist/article/agent-security/index.html')]) {
 checkBridge(html, resourceScope, '/article/kairo-practice/#' + readEvidence);
}
for (const html of [kairo, read(root, 'dist/article/kairo-practice/index.html')]) {
 checkBridge(html, readEvidence, '/article/agent-security/#' + resourceScope);
}
assert(kairo.includes('/labs/mcp-http-authorization/client.jsonl') && kairo.includes('/labs/mcp-http-authorization/server.jsonl'));

if (process.env.MCP_HTTP_AUTH_PYTHON) {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-http-authorization-'));
 try {
  const output = path.join(temporary, 'replay');
  execFileSync(process.env.MCP_HTTP_AUTH_PYTHON, ['-B', path.join(lab, 'authorization_lab.py'), '--output-dir', output],
   {stdio: 'inherit', timeout: 45_000});
  check(output);
 } finally {
  fs.rmSync(temporary, {recursive: true, force: true});
 }
}
console.log('MCP HTTP authorization: metadata, 401/401/403, repeated request ID, object refusal, 42 and sole A read, and reciprocal lesson anchors verified.');
