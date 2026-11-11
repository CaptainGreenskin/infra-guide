/* Verify retrieval candidates, generated answers, and the current-source oracle independently. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'rag-citation-oracle';
const folder = path.join(root, 'dist', 'labs', pack);
const anchor = 'native-rag-citation-oracle';
const files = ['rag_lab.py', 'fixture.json', 'assets.json', 'README.md'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const sha = name => createHash('sha256').update(fs.readFileSync(name)).digest('hex');
const hashes = Object.fromEntries(files.map(name => [name, sha(path.join(folder, name))]));
const assets = json(path.join(folder, 'assets.json'));
const fixture = json(path.join(folder, 'fixture.json'));
const names = ['fresh', 'stale-unchecked', 'stale-guarded'];
const totals = [37, 37, null];
const outcomes = ['accepted', 'rejected', 'withheld'];
const requestCounts = [1, 1, 0];
const after = {...fixture.initial_current, [fixture.source_update.source_id]: fixture.source_update.version};
const body = (id, version) => {
 const doc = fixture.documents.find(row => row.source_id === id && row.version === version);
 return {reference: id + '/' + version, category: doc.category, amount: doc.amount};
};
const base = body('a-base', 'v1');
const latest = body('a-adjust', 'v3');
const stale = body('a-adjust', 'v2');
const authority = {total: base.amount + latest.amount, citations: [base.reference, latest.reference].sort()};
assert.deepEqual([base.amount, stale.amount, latest.amount], [10, 27, 27]);
assert.deepEqual([fixture.initial_current['a-adjust'], after['a-adjust']], ['v2', 'v3']);
assert.equal(fixture.tenant, 'A');
assert.deepEqual(fixture.required_categories, ['基础', '调整']);
assert.equal(authority.total, 37);
assert.deepEqual(fs.readFileSync(path.join(folder, 'assets.json')),
 fs.readFileSync(path.join(root, 'dist', 'labs', 'model-mcp-tool-choice', 'assets.json')));

const candidateRef = row => row.source_id + '/' + row.version;

function checkCandidates(rows, references, tenants) {
 assert.deepEqual(rows.map(candidateRef), references);
 assert.deepEqual(rows.map(row => row.tenant), tenants);
 assert.equal(new Set(rows.map(row => row.rowid)).size, rows.length);
 for (const row of rows) assert(Number.isInteger(row.rowid) && Number.isFinite(row.score));
 assert(rows.every((row, i) => i === 0 || row.score >= rows[i-1].score));
}

function checkEvidence(record) {
 assert.deepEqual([record.schema, record.status], ['rag-citation-oracle-v1', 'passed']);
 assert.deepEqual(record.assets, assets);
 assert.deepEqual(record.source_sha256, hashes);
 assert.match(record.environment.python, /^3\.12\.\d+$/);
 assert.deepEqual([record.environment.platform, record.environment.architecture], ['Darwin', 'arm64']);
 assert(Number.isInteger(record.engine_pid) && record.engine_pid > 0);
 assert.deepEqual(record.versions, {before: fixture.initial_current, after});
 assert.deepEqual(record.authority, authority);
 const latestReferences = [latest.reference, base.reference];
 const staleReferences = [stale.reference, base.reference];
 checkCandidates(record.unscoped_candidates.fresh, ['b-private/v5', ...latestReferences], ['B', 'A', 'A']);
 checkCandidates(record.unscoped_candidates.stale, ['b-private/v5', ...staleReferences], ['B', 'A', 'A']);
 assert.deepEqual(Object.keys(record.cases), names);

 for (const [index, label] of names.entries()) {
  const item = record.cases[label];
  const guarded = label === 'stale-guarded';
  const current = label === 'fresh';
  assert.deepEqual([item.snapshot, item.checked_source], [current ? 'fresh' : 'stale', label !== 'stale-unchecked']);
  checkCandidates(item.candidates, current ? latestReferences : staleReferences, ['A', 'A']);
  assert.deepEqual(item.candidates, record.unscoped_candidates[item.snapshot].filter(row => row.tenant === 'A'));
  const provided = guarded ? [base] : [base, current ? latest : stale];
  assert.deepEqual(item.supplied, provided);
  assert.deepEqual(item.excluded, guarded ? [{reference: stale.reference, reason: 'source_version_changed', current_version: 'v3'}] : []);
  assert.equal(item.answer.total, totals[index]);
  assert.equal(item.oracle.status, outcomes[index]);
  if (guarded) {
   assert.equal(item.model_http, null);
   assert.deepEqual(item.answer, {status: 'insufficient_evidence', total: null, citations: []});
   assert.deepEqual(item.oracle.errors, []);
   continue;
  }

  const exchange = item.model_http;
  assert.equal(exchange.status, 200);
  assert.deepEqual([exchange.response.model, exchange.response.system_fingerprint], ['local-qwen', 'b12110-cd959bae9']);
  assert.deepEqual(exchange.request.messages, [{role: 'system', content: fixture.system_prompt},
   {role: 'user', content: fixture.question + '\n资料：\n' + JSON.stringify(provided)}]);
  assert.deepEqual([exchange.request.temperature, exchange.request.seed, exchange.request.max_tokens], [0, 17, 96]);
  const responseFormat = exchange.request.response_format;
  assert.equal(responseFormat.type, 'json_schema');
  assert.deepEqual(responseFormat.json_schema, {name: 'report_answer', strict: true,
   schema: {type: 'object', properties: {status: {type: 'string', enum: ['ok', 'insufficient_evidence']},
    total: {type: ['integer', 'null']}, citations: {type: 'array', items: {type: 'string'}}},
   required: ['status', 'total', 'citations'], additionalProperties: false}});
  const [choice] = exchange.response.choices;
  assert.equal(exchange.response.choices.length, 1);
  assert.equal(choice.finish_reason, 'stop');
  assert.deepEqual(JSON.parse(choice.message.content), item.answer);
  assert.deepEqual(item.answer, {status: 'ok', total: 37, citations: provided.map(doc => doc.reference)});
  const accepted = [...item.answer.citations].sort().join(',') === authority.citations.join(',');
  assert.equal(accepted, current);
  assert.deepEqual(item.oracle.errors, accepted ? [] : ['citation_not_current']);
 }
 assert.deepEqual(names.map(name => Number(record.cases[name].model_http !== null)), requestCounts);
 assert.equal(record.model_request_count, 2);
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
 const data = JSON.parse(vm.runInContext(`JSON.stringify({chapter: articles.find(a => a.id === 'agent-retrieval'),
  point: infraDomain('agent').points.find(p => p.id === 'ag-retrieval'),
  lab: labLearningCatalog.find(a => a.id === 'agent-${pack}'), archive: labArchiveCatalog['${pack}']})`, context));
 const marker = 'id="' + anchor + '"';
 const article = data.chapter.sections[14][1];
 assert.equal(article.split(marker).length, 2);
 assert.equal(data.chapter.sections.filter(([, html]) => html.includes(marker)).length, 1);
 const section = article.slice(article.indexOf(marker));
 for (const target of ['/labs/' + pack + '.zip', '/labs/' + pack + '/README.md', '/labs/' + pack + '/validation.json', 'diagrams/' + pack + '.svg']) {
  assert(section.includes('href="' + target + '"'), anchor + ' missing ' + target);
 }
 assert(data.point.body.includes('href="/article/agent-retrieval/#' + anchor + '"'));
 const excerpt = read('dist/labs/' + pack + '/rag_lab.py')
  .match(/^    if sorted\(answer\["citations"\]\) != authority\["citations"\]:\n(?: +[^\n]+\n){2} +errors\.append\("citation_not_supplied"\)$/m)?.[0];
 assert(excerpt, 'citation oracle excerpt is missing from the program');
 const trimmed = excerpt.split('\n').map(line => line.slice(4)).join('\n');
 const escaped = trimmed.replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
 assert(section.includes('<code>' + escaped + '</code>'), 'chapter oracle excerpt must match the program');
 assert.deepEqual([data.lab.track, data.lab.chapter, data.lab.anchor, data.lab.pack, data.archive.folder],
  ['agent', 'agent-retrieval', anchor, pack, pack]);
 assert(data.lab.files.includes('rag_lab.py'));
 const goal = vm.runInContext('learningGoalHTML(learningProfiles["agent-app"])', context);
 assert(goal.includes('/article/agent-retrieval/?goal=agent-app#' + anchor), 'Agent application gate is missing');
 assert(goal.includes('/article/agent-evaluation/?goal=agent-app#citation-version-check'));
 assert(section.includes('/article/agent-evaluation/#citation-version-check'));
 const metadata = execFileSync('python3', ['-B', '-c', `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
print(json.dumps(json.loads(root.find('{http://www.w3.org/2000/svg}metadata').text)))
`, path.join(root, 'dist', 'diagrams', pack + '.svg')], {encoding: 'utf8'});
 assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', current_adjustment: 'v3',
  model_requests: requestCounts, totals, outcomes});
}

function checkReaderProgram(record) {
 const section = read('dist/article/agent-evaluation/index.html').split('id="citation-version-check"')[1];
 assert(section.includes('/labs/' + pack + '/fixture.json'));
 const code = section.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1]
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-reader-'));
 try {
  fs.copyFileSync(path.join(folder, 'fixture.json'), path.join(temp, 'fixture.json'));
  const evidence = path.join(temp, 'validation.json');
  const run = () => execFileSync('python3', ['-B', '-c', code], {cwd: temp, encoding: 'utf8'}).trim().split('\n');
  fs.writeFileSync(evidence, JSON.stringify(record));
  assert.deepEqual(run(), ['fresh 37 True True True', 'stale-unchecked 37 True False True', 'stale-guarded withheld']);
  const altered = JSON.parse(JSON.stringify(record));
  const message = altered.cases['stale-unchecked'].model_http.response.choices[0].message;
  message.content = message.content.replace('a-adjust/v2', 'a-adjust/v3');
  fs.writeFileSync(evidence, JSON.stringify(altered));
  assert.equal(run()[1], 'stale-unchecked 37 True True False', 'a current reference absent from the request must still fail');
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

function checkRaw(dir, record, python) {
 const raw = JSON.parse(execFileSync(python, ['-B', '-c', `
from contextlib import closing
import json, pathlib, sqlite3, sys
root = pathlib.Path(sys.argv[1]).resolve()
def query(name, sql, *params):
    with closing(sqlite3.connect((root / name).as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        return [dict(row) for row in db.execute(sql, params)]
matches = "SELECT rowid,source_id,version,tenant,bm25(search) AS score FROM search WHERE search MATCH ? AND snapshot=? ORDER BY score,source_id"
print(json.dumps({
    'current': query('sources.sqlite', 'SELECT * FROM current ORDER BY source_id'),
    'documents': query('sources.sqlite', 'SELECT * FROM documents ORDER BY source_id,version'),
    'fresh': query('index.sqlite', matches, sys.argv[2], 'fresh'),
    'stale': query('index.sqlite', matches, sys.argv[2], 'stale'),
}))
`, dir, fixture.query], {encoding: 'utf8'}));
 assert.deepEqual(Object.fromEntries(raw.current.map(row => [row.source_id, row.version])), after);
 const ordered = docs => [...docs].sort((a,b) => (a.source_id + '/' + a.version).localeCompare(b.source_id + '/' + b.version));
 assert.deepEqual(ordered(raw.documents), ordered(fixture.documents));
 assert.deepEqual(raw.fresh, record.unscoped_candidates.fresh);
 assert.deepEqual(raw.stale, record.unscoped_candidates.stale);
}

const record = json(path.join(folder, 'validation.json'));
checkEvidence(record);
checkArchive();
checkPage();
checkReaderProgram(record);

const {INFRA_RAG_ORACLE_PYTHON: python, INFRA_RAG_ORACLE_SERVER: server, INFRA_RAG_ORACLE_MODEL: model} = process.env;
if (python || server || model) {
 assert(python && server && model, 'Set all of INFRA_RAG_ORACLE_PYTHON, INFRA_RAG_ORACLE_SERVER and INFRA_RAG_ORACLE_MODEL');
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), pack + '-'));
 try {
  const dir = path.join(temp, 'replay');
  execFileSync(python, ['-B', path.join(folder, 'rag_lab.py'), '--output-dir', dir, '--server', server, '--model', model],
   {timeout: 120000, stdio: 'pipe'});
  const replay = json(path.join(dir, 'validation.json'));
  checkEvidence(replay);
  checkRaw(dir, replay, python);
  const stable = item => names.map(name => {
   const {model_http: exchange, candidates, ...outcome} = item.cases[name];
   return {...outcome, candidates: candidates.map(candidateRef), model_request: exchange?.request ?? null,
    generated: exchange?.response.choices[0].message.content ?? null};
  });
  assert.deepEqual(stable(replay), stable(record));
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

console.log('PASS: actual FTS5 candidates, current vs stale generated citations, no-model guard, exact archive and course evidence.');
