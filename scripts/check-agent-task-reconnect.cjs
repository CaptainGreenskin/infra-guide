/* Cross-check the public reference adapter's HTTP, MCP, task and resource records. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'agent-task-reconnect';
const folder = path.join(root, 'dist', 'labs', pack);
const g10 = path.join(root, 'dist', 'labs', 'storage-parallel-acceptance');
const checker = path.join(g10, 'acceptance_record.py');
const anchor = 'native-agent-task-reconnect';
const files = ['reconnect_lab.py', 'readonly-contract.json', 'resources.json', 'requirements.txt', 'README.md'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFile = name => sha(fs.readFileSync(name));
const sourceHashes = Object.fromEntries(files.map(name => [name, shaFile(path.join(folder, name))]));
const contractPath = path.join(folder, 'readonly-contract.json');
const contract = json(contractPath);
const resources = json(path.join(folder, 'resources.json'));
const protocol = '2026-07-28';
const submitStatuses = [null, 202, 409];
const canonical = value => JSON.stringify(value, (_key, data) => {
 if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
 return Object.fromEntries(Object.keys(data).sort().map(key => [key, data[key]]));
});
const fingerprint = value => sha(canonical(value));
const total = Object.values(contract.events).reduce((sum, value) => sum + value, 0);
const citations = Object.keys(contract.events).sort();
const snapshots = Object.fromEntries(Object.entries(resources).map(([resource, item]) => [resource,
 {version: item.version, sha256: fingerprint(item.body)}]));

assert.deepEqual(fs.readFileSync(contractPath), fs.readFileSync(path.join(g10, 'readonly-contract.example.json')));
assert.deepEqual(contract.request, {request_id: 'R1', tenant: 'A', action: 'read_summary', resource: 'reports-A',
 delivery: 'session-17', source_version: 'A-v1'});
assert.deepEqual(contract.events, {'A-e1': 5, 'A-e2': 7, 'A-e3': 11});
assert.equal(total, 23);
assert.deepEqual(resources['reports-A'], {tenant: 'A', version: 'A-v1', body: contract.events});
assert.deepEqual(snapshots['reports-B'], contract.B_before);
assert.equal(resources['reports-B'].tenant, 'B');

function checkEvidence(record) {
 assert.equal(record.schema, 'agent-task-reconnect-v1');
 assert.equal(record.status, 'passed');
 assert.equal(record.protocol, protocol);
 assert.match(record.environment.python, /^3\.12\.\d+$/);
 assert.deepEqual([record.environment.mcp, record.environment.httpx2, record.environment.uvicorn], ['2.3.0', '2.16.0', '0.54.0']);
 assert(Number.isInteger(record.resource_pid) && record.resource_pid > 0);
 assert.deepEqual(record.fixture, {request_id: 'R1', channel: 'session-17', task_label: 'T1', total});
 assert.deepEqual(record.source_sha256, sourceHashes);
 const request = contract.request;
 const changed = {...request, source_version: 'A-v2'};
 const digest = fingerprint(request);
 const changedDigest = fingerprint(changed);
 assert.notEqual(changedDigest, digest);
 const {client, task_after_lost: before, task_final: after, mcp, resource, g10: grade} = record;
 assert.deepEqual(client.map(row => row.status), [...submitStatuses, 200, 200, 200, 404]);
 const [task] = before.tasks;
 assert.equal(before.tasks.length, 1);
 const taskId = task.task_id;
 assert.match(taskId, /^[\da-f]{32}$/);
 assert.deepEqual(task, {task_id: taskId, request_id: 'R1', args_sha256: digest, request,
  principal: contract.principal, status: 'ACCEPTED'});
 const expectedSubmissions = [[digest, 'created'], [digest, 'reused'], [changedDigest, 'conflict']].map(([hash, outcome], index) =>
  ({seq: index+1, transport_id: 'q' + index, request_id: 'R1', args_sha256: hash, task_id: taskId, outcome}));
 assert.deepEqual(before.submissions, expectedSubmissions.slice(0, 1));
 assert.deepEqual(before.deliveries, []);
 assert.deepEqual(after.tasks, [{...task, status: 'SUCCEEDED'}]);
 assert.deepEqual(after.submissions, expectedSubmissions);
 const delivery = {task_id: taskId, channel: 'session-17', total, citations};
 assert.deepEqual(after.deliveries, [delivery]);

 assert.deepEqual(client[0], {method: 'POST', path: '/tasks', transport_id: 'q0', request, status: null, error: 'RemoteDisconnected'});
 assert.deepEqual(client[1], {method: 'POST', path: '/tasks', transport_id: 'q1', request, status: 202,
  response: {task_id: taskId, status: 'ACCEPTED'}});
 assert.deepEqual(client[2], {method: 'POST', path: '/tasks', transport_id: 'q2', request: changed, status: 409,
  response: {error: 'request_digest_conflict'}});
 const finished = {task_id: taskId, status: 'SUCCEEDED'};
 const taskPath = '/tasks/' + taskId;
 assert.deepEqual(client.slice(3), [
  ['POST', taskPath + '/run', 200, finished], ['GET', taskPath, 200, finished],
  ['GET', '/sessions/session-17/' + taskId, 200, delivery], ['GET', '/sessions/other-session/' + taskId, 404, {}]
 ].map(([method, path, status, response]) => ({method, path, transport_id: null, request: null, status, response})));

 assert.deepEqual(mcp.map(row => row.request.method), ['server/discover', 'tools/list', 'tools/call', 'tools/call']);
 mcp.forEach((row, index) => {
  assert.deepEqual([row.status, row.protocol, row.request.id, row.response.id], [200, protocol, index+1, index+1]);
  assert(!('error' in row.response));
  assert.equal(row.request.params._meta['io.modelcontextprotocol/protocolVersion'], protocol);
 });
 assert(mcp[0].response.result.supportedVersions.includes(protocol));
 assert.deepEqual(mcp[1].response.result.tools.map(tool => tool.name), ['read_report']);
 for (const [index, letter] of [[2, 'A'], [3, 'B']]) {
  assert.equal(mcp[index].request.params.name, 'read_report');
  assert.deepEqual(mcp[index].request.params.arguments, {task_id: taskId, attempt_id: 'a' + (index-2), resource: 'reports-' + letter});
 }
 const positive = mcp[2].response.result;
 const negative = mcp[3].response.result;
 assert.equal(positive.isError, false);
 assert.deepEqual(positive.structuredContent, {resource: 'reports-A', source_version: 'A-v1', events: contract.events});
 assert.deepEqual(JSON.parse(positive.content[0].text), positive.structuredContent);
 assert.equal(negative.isError, true);
 assert(!('structuredContent' in negative));
 assert.deepEqual(negative.content, [{type: 'text', text: 'Report unavailable.'}]);

 assert.deepEqual(resource.before, resource.after);
 assert.deepEqual(resource.after.reports, snapshots);
 assert.deepEqual(resource.after.business_writes, []);
 assert.match(resource.after.file_sha256, /^[\da-f]{64}$/);
 assert.deepEqual(resource.body_reads, [{seq: 1, task_id: taskId, attempt_id: 'a0', resource: 'reports-A'}]);
 assert.deepEqual(resource.decisions, [['A', 'success', 'A-v1', contract.events], ['B', 'denied', null, {}]].map(
  ([tenant, status, source_version, events], index) => ({seq: index+1, task_id: taskId, attempt_id: 'a' + index, rpc_id: index+3,
   principal: contract.principal, tenant, action: 'read', resource: 'reports-' + tenant, status, source_version, events})));

 assert.equal(grade.checker_sha256, shaFile(checker));
 assert.deepEqual(grade.checker, {status: 'record_consistent', errors: [], provenance_verified: false, source: 'target_export'});
 assert.deepEqual(grade.evidence, {format: 'readonly-evidence-v1', case_id: contract.case_id,
  source: 'target_export', target_version: 'infra-guide-local-reference/1',
  submissions: ['lost', 'received'].map((ack, index) => ({transport_id: 'q' + index, request_id: 'R1', args_sha256: digest, task_id: taskId, ack})),
  authoritative_task: finished, tool_receipts: resource.decisions, B_before: contract.B_before, B_after: contract.B_before,
  business_writes: [], delivery});
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
`, folder, ...files, 'validation.json']);
}

function checkPage() {
 const context = vm.createContext({URLSearchParams, articleURL: id => '/article/' + id + '/',
  location: {pathname: '/roadmap/agent-platform/', search: '', hash: ''}});
 for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename: file});
 }
 const data = JSON.parse(vm.runInContext(`JSON.stringify({chapter: articles.find(a => a.id === 'kairo-practice'),
  lab: labLearningCatalog.find(a => a.id === '${pack}'), archive: labArchiveCatalog['${pack}']})`, context));
 const marker = 'id="' + anchor + '"';
 const article = data.chapter.sections[7][1];
 assert.equal(article.split(marker).length, 2);
 assert.equal(data.chapter.sections.filter(([, html]) => html.includes(marker)).length, 1);
 const section = article.slice(article.indexOf(marker));
 const synthesis = vm.runInContext('articleById("production-readiness").sections[4][1]', context);
 assert(section.includes('/article/production-readiness/#admission-vs-tool-commit') && section.includes('resource.body_reads'));
 const comparison = synthesis.slice(synthesis.indexOf('id="admission-vs-tool-commit"'));
 assert(comparison.includes('/article/kairo-practice/#' + anchor));
 assert(comparison.includes('/labs/' + pack + '/validation.json') && comparison.includes('/labs/integrated-service/validation.json'));
 const commit = json(path.join(root, 'dist/labs/integrated-service/validation.json')).program.cases.recover_same_operation.commit_gap;
 assert.equal(commit.local_receipt, null);
 assert(comparison.includes('任务库回执为空，接收方已有 ' + commit.receiver_effects + ' 份效果'));
 for (const target of ['/labs/' + pack + '.zip', '/labs/' + pack + '/README.md', '/labs/' + pack + '/validation.json', 'diagrams/' + pack + '.svg']) {
  assert(section.includes('href="' + target + '"'), anchor + ' missing ' + target);
 }
 assert.deepEqual([data.lab.track, data.lab.chapter, data.lab.anchor, data.lab.pack, data.archive.folder],
  ['agent', 'kairo-practice', anchor, pack, pack]);
 assert(data.lab.files.includes('reconnect_lab.py'));
 const goal = vm.runInContext('learningGoalHTML(learningProfiles["agent-platform"])', context);
 assert(goal.includes('/article/kairo-practice/?goal=agent-platform#' + anchor), 'agent-platform gate is missing');
 const resumeAnchor = 'kairo-resume-evidence';
 const resumeRecord = '/labs/langgraph-workflow/validation.json';
 const resumeLesson = data.chapter.sections[5][1].split('id="' + resumeAnchor + '"')[1];
 assert(resumeLesson?.includes(resumeRecord));
 assert(resumeLesson.includes('/article/durable-workflows/#langgraph-workflow-run'));
 const workflow = vm.runInContext('articleById("durable-workflows").sections[8][1]', context);
 assert(workflow.split('id="langgraph-workflow-run"')[1]?.includes('/article/kairo-practice/#' + resumeAnchor));
 const stable = json(path.join(root, 'dist' + resumeRecord)).program.cases.stable;
 assert.notEqual(stable.waiting.pid, stable.resumed.pid);
 assert.deepEqual(stable.waiting.state.values.draft, stable.resumed.state.values.draft);
 assert.deepEqual([stable.wrong_thread.state.checkpoint_count, stable.wrong_thread.state.values], [0, {}]);
 assert.deepEqual([stable.counts.read_base, stable.counts.read_extra], [1, 1]);
 assert.deepEqual(stable.before_resume_receiver.reports, []);
 assert.equal(stable.receiver.reports.length, 1);
 assert(resumeLesson.includes('恢复后只有一份，金额为 ' + stable.receiver.reports[0].draft.total));
 assert(goal.includes('/article/kairo-practice/?goal=agent-platform#' + resumeAnchor));
 const metadata = execFileSync('python3', ['-B', '-c', `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
print(json.dumps(json.loads(root.find('{http://www.w3.org/2000/svg}metadata').text)))
`, path.join(root, 'dist', 'diagrams', pack + '.svg')], {encoding: 'utf8'});
 assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', submit_statuses: submitStatuses,
  total, resource_body_reads: ['reports-A'], other_session_status: 404});
}

function checkRawDatabases(dir, record) {
 const raw = JSON.parse(execFileSync('python3', ['-B', '-c', `
from contextlib import closing
import json, pathlib, sqlite3, sys
root = pathlib.Path(sys.argv[1]).resolve()
def query(name, sql, *decode):
    with closing(sqlite3.connect((root / name).as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        result = [dict(row) for row in db.execute(sql)]
        for row in result:
            for field in decode:
                row[field] = json.loads(row[field])
        return result
print(json.dumps({
    'task': {
        'tasks': query('tasks.sqlite', 'SELECT * FROM tasks ORDER BY task_id', 'request'),
        'submissions': query('tasks.sqlite', 'SELECT * FROM submissions ORDER BY seq'),
        'deliveries': query('tasks.sqlite', 'SELECT * FROM deliveries ORDER BY task_id', 'citations'),
    },
    'resource': {
        'reports': query('reports.sqlite', 'SELECT resource,tenant,version,body FROM catalog JOIN bodies USING(resource)', 'version', 'body'),
        'business_writes': query('reports.sqlite', 'SELECT * FROM business_writes'),
        'decisions': query('resource-audit.sqlite', 'SELECT * FROM decisions ORDER BY seq', 'source_version', 'events'),
        'body_reads': query('resource-audit.sqlite', 'SELECT * FROM body_reads ORDER BY seq'),
    },
}))
`, dir], {encoding: 'utf8'}));
 assert.deepEqual(raw.task, record.task_final);
 assert.deepEqual(Object.fromEntries(raw.resource.reports.map(({resource, ...report}) => [resource, report])), resources);
 assert.deepEqual(raw.resource.business_writes, record.resource.after.business_writes);
 assert.deepEqual(raw.resource.decisions, record.resource.decisions);
 assert.deepEqual(raw.resource.body_reads, record.resource.body_reads);
 assert.equal(shaFile(path.join(dir, 'reports.sqlite')), record.resource.after.file_sha256);
}

const record = json(path.join(folder, 'validation.json'));
checkEvidence(record);
checkArchive();
checkPage();
const page = read('dist/article/kairo-practice/index.html');
const comparison = page.split('id="'+anchor+'"')[1]?.split('id="kairo-audit-coverage-check"')[0];
assert(comparison?.includes('href="/article/kairo-practice/#kairo-native-commit-readback"'));
assert(comparison.includes('href="/labs/kairo-receipt-readback/validation.json"'));
const {task_after_lost: lost, task_final: final, resource} = record;
assert.deepEqual(lost.tasks.map(row=>row.task_id),final.tasks.map(row=>row.task_id));
assert.equal(resource.after.business_writes.length,0);
assert(comparison.includes(`交付记录从 ${lost.deliveries.length} 条增至 ${final.deliveries.length} 条`));
const {phases} = json(path.join(root,'dist/labs/kairo-receipt-readback/validation.json'));
assert(comparison.includes(`报告数从 ${phases.prepare.receiver.reports.length} 变为 ${phases.after_commit_exit.receiver.reports.length}`));
for(const recovered of [phases.matched,phases.version_mismatch]){
 assert.equal(recovered.receiver.reports.length,phases.after_commit_exit.receiver.reports.length);
 assert(comparison.includes(`<code>write_handler_entries</code> 都为 ${recovered.write_handler_entries}`));
}
const nativeReadonlyAnchor = 'kairo-native-readonly-reconnect';
const [lesson,nativeReadonly] = page.split('id="kairo-audit-coverage-check"')[1]?.split('id="'+nativeReadonlyAnchor+'"') || [];
assert(lesson, 'the resource audit comparison is directly reachable');
const samplingAnchor = '/article/agent-observability/#native-tail-sampling-ledger';
assert(lesson.includes(samplingAnchor));
const sampling = read('dist/article/agent-observability/index.html').split('id="native-tail-sampling-ledger"')[1]?.split('id="native-model-mcp-recovery-observation"')[0];
assert(sampling?.includes('/article/kairo-practice/#kairo-audit-coverage-check'));
assert(sampling.includes('<code>R27-normal</code>') && sampling.includes('<code>effects</code>'));
assert(sampling.includes('另找资源端的正文审计'));
assert(lesson.includes('href="/labs/'+pack+'/validation.json"'));
assert(lesson.includes('href="/article/kairo-practice/#'+nativeReadonlyAnchor+'"'));
assert(lesson.includes('<code>resource.body_reads</code>') && lesson.includes('零额外读取仍待核对'));
assert(lesson.includes('<code>provenance_verified</code> 仍为 <code>false</code>'));
const nativeReadonlyRecord = '/labs/kairo-local-readonly/validation.json';
const nativeReadonlyEvidence = json(path.join(root, 'dist'+nativeReadonlyRecord));
assert(nativeReadonly?.includes('href="'+nativeReadonlyRecord+'"'));
assert(nativeReadonly.includes('<code>resumed.body_reads</code> 按资源汇总'));
assert(nativeReadonly.includes('没有逐次读取行'));
const referenceCounts = Object.fromEntries(Object.keys(resources).map(report =>
 [report,resource.body_reads.filter(row=>row.resource===report).length]));
assert.deepEqual(nativeReadonlyEvidence.resumed.body_reads,referenceCounts);
for(const [report,count] of Object.entries(nativeReadonlyEvidence.resumed.body_reads)){
 assert(nativeReadonly.includes('<code>'+report+'</code> 为 '+count));
}
assert.equal(nativeReadonlyEvidence.boundary.public_provenance_verified,false);
assert(nativeReadonly.includes('<code>boundary.public_provenance_verified</code> 仍为 <code>false</code>'));
const readerCode = lesson.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1]
 .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function checkReaderAudit(directory) {
 const lines = execFileSync('python3', ['-B', '-c', readerCode], {
  cwd: directory, encoding: 'utf8', timeout: 10000,
 }).trim().split('\n');
 assert.deepEqual(lines, ['recorded record_consistent pass',
  'extra-read record_consistent fail', 'partial-audit record_consistent pending',
  'no-audit record_consistent pending']);
}
checkReaderAudit(folder);

if (process.env.INFRA_AGENT_TASK_RECONNECT_PYTHON) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-'));
 try {
  const dir = path.join(temp, 'replay');
  execFileSync(process.env.INFRA_AGENT_TASK_RECONNECT_PYTHON, ['-B', path.join(folder, 'reconnect_lab.py'), '--output-dir', dir, '--checker', checker],
   {timeout: 90000, stdio: 'pipe'});
  const replay = json(path.join(dir, 'validation.json'));
  checkEvidence(replay);
  checkRawDatabases(dir, replay);
  checkReaderAudit(dir);
  const normalize = item => {
   const taskId = item.task_final.tasks[0].task_id;
   const volatile = new Set(['resource_pid', 'environment', 'file_sha256']);
   const body = JSON.stringify(item, (key, value) => volatile.has(key) ? undefined : value).replaceAll(taskId, 'opaque-task');
   return JSON.parse(body);
  };
  assert.deepEqual(normalize(replay), normalize(record));
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

console.log('PASS: lost HTTP reply, one opaque task, original session 23, MCP A-only read, exact archive and course evidence.');
