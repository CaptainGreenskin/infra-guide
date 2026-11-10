/* Verify independent tool choice, two protocol IDs and the resource-side access decision. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'model-mcp-tool-choice';
const folder = path.join(root, 'dist', 'labs', pack);
const anchor = 'native-model-mcp-tool-choice';
const files = ['model_tool_lab.py', 'fixture.json', 'assets.json', 'requirements.txt', 'README.md'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const shaFile = name => createHash('sha256').update(fs.readFileSync(name)).digest('hex');
const sources = Object.fromEntries(files.map(name => [name, shaFile(path.join(folder, name))]));
const assets = json(path.join(folder, 'assets.json'));
const fixture = json(path.join(folder, 'fixture.json'));
const protocol = '2026-07-28';
const toolNames = ['read_sales_report', 'read_incident_report'];
const rpcIds = [3, 4, 5];
const outcomes = ['allowed', 'allowed', 'denied'];
const bodyReads = ['A', 'A'];
const cases = [['sales-a', toolNames[0], 'A'], ['incident-a', toolNames[1], 'A'], ['sales-b', toolNames[0], 'B']];
const settings = {tool_choice: 'auto', temperature: 0, seed: 17, max_tokens: 96};
const fingerprint = 'b12110-cd959bae9';
const schema = {type: 'object', properties: {report_id: {type: 'string', description: 'The report ID to read.'}},
 required: ['report_id'], additionalProperties: false};
const outputSchema = {type: 'object', properties: {value: {type: 'integer'}, evidence_id: {type: 'string'}},
 required: ['value', 'evidence_id'], additionalProperties: false};

assert.deepEqual([assets.engine.release, assets.engine.commit, assets.engine.binary_sha256], [
 'b12110', 'cd959bae99ff4bed22bef2604f45241c09bbb8c8', 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959']);
assert.equal(assets.engine.archive, 'llama-b12110-bin-macos-arm64.tar.gz');
assert.equal(assets.engine.archive_url, `https://github.com/ggml-org/llama.cpp/releases/download/${assets.engine.release}/${assets.engine.archive}`);
assert.equal(assets.engine.archive_sha256, '4f5b8de12e0b9516658ca6a5764c6ffb3d7c659c3dd538556b1413c7b4050662');
assert.deepEqual([assets.model.repository, assets.model.revision, assets.model.filename, assets.model.bytes, assets.model.sha256], [
 'Qwen/Qwen3-0.6B-GGUF', '23749fefcc72300e3a2ad315e1317431b06b590a', 'Qwen3-0.6B-Q8_0.gguf', 639446688,
 '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031']);
assert.equal(assets.model.url, `https://huggingface.co/${assets.model.repository}/resolve/${assets.model.revision}/${assets.model.filename}`);
assert.deepEqual(fixture.tools.map(tool => tool.name), toolNames);
assert.deepEqual([fixture.principal, fixture.tenant], ['learner-A', 'A']);
assert.deepEqual([fixture.reports.A.tenant, fixture.reports.B.tenant], ['A', 'B']);
assert.deepEqual(fixture.reports.A.bodies, {
 [toolNames[0]]: {value: 42, evidence_id: 'sales-v3-9f6a'},
 [toolNames[1]]: {value: 7, evidence_id: 'incident-v1-2d1b'}
});

function checkEvidence(record) {
 assert.deepEqual([record.schema, record.status, record.protocol], ['model-mcp-tool-choice-v1', 'passed', protocol]);
 assert.deepEqual([record.environment.platform, record.environment.architecture], ['Darwin', 'arm64']);
 assert.match(record.environment.python, /^3\.12\.\d+$/);
 assert.deepEqual([record.environment.mcp, record.environment.httpx2, record.environment.uvicorn], ['2.3.0', '2.16.0', '0.54.0']);
 assert.deepEqual(record.assets, assets);
 assert.deepEqual(record.source_sha256, sources);
 assert.deepEqual(record.engine_flags, ['--n-gpu-layers', '0', '--threads', '4', '--ctx-size', '2048', '--parallel', '1', '--jinja',
  '--reasoning-budget', '0', '--chat-template-kwargs', '{"enable_thinking":false}', '--alias', 'local-qwen']);
 const pids = [record.driver_pid, record.engine_pid, record.resource_pid];
 assert(pids.every(pid => Number.isInteger(pid) && pid > 0));
 assert.equal(new Set(pids).size, 3);
 assert.match(record.reports_db_sha256.before, /^[\da-f]{64}$/);
 assert.equal(record.reports_db_sha256.before, record.reports_db_sha256.after);

 const mcp = [...record.mcp_discovery, ...cases.map(([label]) => record.cases[label].mcp_call)];
 assert.deepEqual(mcp.map(row => row.request.method), ['server/discover', 'tools/list', 'tools/call', 'tools/call', 'tools/call']);
 mcp.forEach((row, index) => {
  assert.deepEqual([row.status, row.protocol, row.request.id, row.response.id], [200, protocol, index+1, index+1]);
  assert(!('error' in row.response));
  assert.equal(row.request.params._meta['io.modelcontextprotocol/protocolVersion'], protocol);
 });
 assert(mcp[0].response.result.supportedVersions.includes(protocol));
 const catalog = mcp[1].response.result.tools;
 const tools = fixture.tools.map(tool => ({type: 'function', function: {...tool, parameters: schema}}));
 assert.deepEqual(catalog.map(tool => [tool.name, tool.description, tool.inputSchema]),
  tools.map(({function: tool}) => [tool.name, tool.description, tool.parameters]));
 assert(catalog.every(tool => tool.outputSchema));
 for (const tool of catalog) assert.deepEqual(tool.outputSchema, outputSchema);
 assert.deepEqual(Object.keys(record.cases).sort(), cases.map(([label]) => label).sort());

 const decisions = [], reads = [], calls = new Set();
 for (const [index, [label, tool, reportId]] of cases.entries()) {
  const {first_model_turn: first, mcp_call: exchange, final_model_turn: final} = record.cases[label];
  const messages = [{role: 'system', content: fixture.system_prompt}, {role: 'user', content: fixture.questions[label]}];
  const payload = {model: 'local-qwen', messages, tools, ...settings};
  assert.deepEqual(first.request, payload);
  for (const turn of [first, final]) {
   assert.deepEqual([turn.status, turn.response.model, turn.response.system_fingerprint], [200, 'local-qwen', fingerprint]);
   assert.equal(turn.response.choices.length, 1);
  }
  const [proposal] = first.response.choices;
  assert.equal(proposal.finish_reason, 'tool_calls');
  assert.equal(proposal.message.tool_calls.length, 1);
  const [call] = proposal.message.tool_calls;
  assert.equal(call.type, 'function');
  assert.equal(call.function.name, tool);
  assert.deepEqual(JSON.parse(call.function.arguments), {report_id: reportId});
  assert(typeof call.id === 'string' && call.id.length > 0);
  calls.add(call.id);
  assert.deepEqual([exchange.request.params.name, exchange.request.params.arguments], [tool, {report_id: reportId}]);
  const result = exchange.response.result;
  assert.equal(result.content.length, 1);
  assert.deepEqual(final.request, {...payload, messages: [...messages, proposal.message,
   {role: 'tool', tool_call_id: call.id, content: result.content[0].text}]});
  const [answer] = final.response.choices;
  assert.equal(answer.finish_reason, 'stop');
  assert(!answer.message.tool_calls?.length);
  const allowed = reportId === 'A';
  const rpcId = rpcIds[index];
  assert.equal(result.isError, !allowed);
  decisions.push({seq: index+1, rpc_id: rpcId, principal: fixture.principal, tool, report_id: reportId, outcome: outcomes[index]});
  if (allowed) {
   const expected = fixture.reports.A.bodies[tool];
   assert.deepEqual(result.structuredContent, expected);
   assert.deepEqual(JSON.parse(result.content[0].text), expected);
   assert(!JSON.stringify(first.request).includes(expected.evidence_id));
   assert(answer.message.content.includes(expected.evidence_id));
   assert.match(answer.message.content, new RegExp('\\b' + expected.value + '\\b'));
   reads.push({seq: reads.length+1, rpc_id: rpcId, tool, report_id: reportId});
  } else {
   assert(!('structuredContent' in result));
   assert.deepEqual(JSON.parse(result.content[0].text), {error: 'Report unavailable.'});
   assert.match(answer.message.content, /unavailable/i);
   assert(!JSON.stringify(record.cases[label]).includes(fixture.reports.B.bodies[tool].evidence_id));
  }
 }
 assert.equal(calls.size, cases.length);
 assert.deepEqual(record.receiver, {decisions, body_reads: reads});
 assert.deepEqual(record.receiver.body_reads.map(row => row.report_id), bodyReads);
}

function checkArchive() {
 execFileSync('python3', ['-B', '-c', `
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root.with_suffix('.zip')) as archive:
    names = [root.name + '/' + name for name in sys.argv[2:]]
    assert sorted(archive.namelist()) == sorted(names), archive.namelist()
    for name in names:
        info = archive.getinfo(name)
        assert info.date_time == (2026, 11, 11, 0, 0, 0)
        assert info.create_system == 3 and info.external_attr >> 16 == 0o100644
        assert archive.read(name) == (root / pathlib.Path(name).name).read_bytes(), name
`, folder, ...files, 'validation.json']);
}

function checkPage() {
 const context = vm.createContext({URLSearchParams, articleURL: id => '/article/' + id + '/',
  location: {pathname: '/roadmap/agent-app/', search: '', hash: ''}});
 for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename: file});
 }
 const data = JSON.parse(vm.runInContext(`JSON.stringify({chapter: articles.find(a => a.id === 'agent-runtime'),
  lab: labLearningCatalog.find(a => a.id === 'agent-${pack}'), archive: labArchiveCatalog['${pack}']})`, context));
 const marker = 'id="' + anchor + '"';
 const sections = data.chapter.sections.filter(([, html]) => html.includes(marker));
 assert.equal(sections.length, 1);
 const [, article] = sections[0];
 assert.equal(article.split(marker).length, 2);
 const section = article.slice(article.indexOf(marker));
 for (const target of ['/labs/' + pack + '.zip', '/labs/' + pack + '/README.md', '/labs/' + pack + '/validation.json', 'diagrams/' + pack + '.svg']) {
  assert(section.includes('href="' + target + '"'), anchor + ' missing ' + target);
 }
 const excerpt = read('dist/labs/' + pack + '/model_tool_lab.py')
  .match(/^ +result = await client\.call_tool\(name, arguments\)\n(?: +[^\n]+\n){2} +tool_message = [^\n]+$/m)?.[0];
 assert(excerpt, 'model/MCP handoff excerpt is missing from the program');
 const source = excerpt.split('\n').map(line => line.trimStart()).join('\n');
 const escaped = source.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
 assert(section.includes('<code>' + escaped + '</code>'), 'chapter handoff excerpt must match the program');
 assert.deepEqual([data.lab.track, data.lab.chapter, data.lab.anchor, data.lab.pack, data.archive.folder],
  ['agent', 'agent-runtime', anchor, pack, pack]);
 assert(data.lab.files.includes('model_tool_lab.py'));
 const goal = vm.runInContext('learningGoalHTML(learningProfiles["agent-app"])', context);
 assert(goal.includes('/article/agent-runtime/?goal=agent-app#' + anchor), 'Agent application gate is missing');
 const metadata = execFileSync('python3', ['-B', '-c', `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
print(json.dumps(json.loads(root.find('{http://www.w3.org/2000/svg}metadata').text)))
`, path.join(root, 'dist', 'diagrams', pack + '.svg')], {encoding: 'utf8'});
 assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', tools: toolNames, rpc_ids: rpcIds,
  outcomes, body_reads: bodyReads});
}

function checkRaw(dir, record) {
 const raw = JSON.parse(execFileSync('python3', ['-B', '-c', `
from contextlib import closing
import json, pathlib, sqlite3, sys
root = pathlib.Path(sys.argv[1]).resolve()
def query(name, sql):
    with closing(sqlite3.connect((root / name).as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        return [dict(row) for row in db.execute(sql)]
print(json.dumps({
    'decisions': query('resource-audit.sqlite', 'SELECT * FROM decisions ORDER BY seq'),
    'body_reads': query('resource-audit.sqlite', 'SELECT * FROM body_reads ORDER BY seq'),
    'reports': query('reports.sqlite', 'SELECT report_id,tenant,tool,body FROM catalog JOIN bodies USING(report_id) ORDER BY report_id,tool'),
}))
`, dir], {encoding: 'utf8'}));
 assert.deepEqual({decisions: raw.decisions, body_reads: raw.body_reads}, record.receiver);
 const expectedReports = Object.entries(fixture.reports).flatMap(([report_id, {tenant, bodies}]) =>
  Object.keys(bodies).sort().map(tool => ({report_id, tenant, tool, body: bodies[tool]})));
 assert.deepEqual(raw.reports.map(row => ({...row, body: JSON.parse(row.body)})), expectedReports);
 assert.equal(shaFile(path.join(dir, 'reports.sqlite')), record.reports_db_sha256.after);
}

const record = json(path.join(folder, 'validation.json'));
checkEvidence(record);
checkArchive();
checkPage();

const {INFRA_MODEL_MCP_PYTHON: python, INFRA_MODEL_MCP_SERVER: server, INFRA_MODEL_MCP_MODEL: model} = process.env;
if (python || server || model) {
 assert(python && server && model, 'Set all of INFRA_MODEL_MCP_PYTHON, INFRA_MODEL_MCP_SERVER and INFRA_MODEL_MCP_MODEL');
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-'));
 try {
  const dir = path.join(temp, 'replay');
  execFileSync(python, ['-B', path.join(folder, 'model_tool_lab.py'), '--output-dir', dir, '--server', server, '--model', model],
   {timeout: 120000, stdio: 'pipe'});
  const replay = json(path.join(dir, 'validation.json'));
  checkEvidence(replay);
  checkRaw(dir, replay);
  const stable = item => cases.map(([label]) => {
   const {first_model_turn: first, mcp_call: mcp, final_model_turn: final} = item.cases[label];
   return [first.response.choices[0].message.tool_calls[0].function, mcp, final.response.choices[0].message.content];
  });
  assert.deepEqual(stable(replay), stable(record));
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

console.log('PASS: two automatically selected read tools, raw model/MCP linkage, A-only body reads, exact archive and course evidence.');
