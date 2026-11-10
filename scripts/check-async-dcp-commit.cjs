/* Compare the stored and resumed native DCP states with independent scalar arithmetic. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'async-dcp-commit';
const folder = path.join(root, 'dist', 'labs', pack);
const files = ['README.md', 'async_dcp.py', 'requirements.txt', 'validation.json'];
const read = name => fs.readFileSync(path.join(folder, name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(files.slice(1, 3).map(name => [name, sha(read(name))]));
const caseNames = ['frozen', 'alias', 'failed'];
const firstTargets = [2, 4], secondTargets = [6, 10];

function sgd({weight, momentum}, [left, right]) {
 const gradient = (2 * weight - left - right) / 2;
 const updatedMomentum = momentum / 2 + gradient;
 return {gradient, weight: weight - updatedMomentum / 4, momentum: updatedMomentum};
}
const step1 = sgd({weight: 0, momentum: 0}, firstTargets);
const step2 = sgd(step1, secondTargets);
const repeatedStep2 = sgd(step2, secondTargets);
const resultAfterLoad = {frozen: step1, alias: step2, failed: step1};
const resultAfterUpdate = {frozen: step2, alias: repeatedStep2, failed: step2};

function verify(report) {
 assert.equal(report.torch.split('+')[0], '2.5.1');
 assert.equal(report.backend, 'gloo');
 assert.equal(report.device, 'cpu');
 assert.equal(report.world_size, 2);
 assert.deepEqual(report.source_sha256, sourceHashes);
 assert.deepEqual(Object.keys(report.cases).sort(), caseNames.slice().sort());
 assert.deepEqual(Object.keys(report.files).sort(), [...caseNames, 'previous'].sort());
 for (const [name, sizes] of Object.entries(report.files)) {
  assert.deepEqual(Object.keys(sizes).sort(),
   name === 'failed' ? ['__0_0.distcp'] : ['.metadata', '__0_0.distcp', '__1_0.distcp']);
  assert(Object.values(sizes).every(bytes => Number.isInteger(bytes) && bytes > 0), name);
 }
 const pids = report.cases.frozen.map(row => row.pid);
 assert.equal(new Set(pids).size, 2);
 assert(pids.every(pid => Number.isInteger(pid) && pid > 0));
 for (const name of caseNames) {
  const rows = report.cases[name];
  assert.equal(rows.length, 2);
  const {weight, momentum} = resultAfterLoad[name];
  for (const [rank, row] of rows.entries()) {
   const alias = name === 'alias';
   const failed = name === 'failed';
   assert.deepEqual(row, {
    rank, pid: pids[rank],
    first: {target: firstTargets[rank], ...step1},
    continued_during_write: {target: secondTargets[rank], ...step2},
    staged_shares_live: {weight: alias, momentum: alias},
    background_thread: true,
    future_pending: true,
    metadata_before: false,
    metadata_after: !failed,
    pointer_before: name === 'frozen' ? 'previous' : 'frozen',
    pointer_after: 'frozen',
    failed_ranks: failed ? [1] : [],
    read_directory: alias ? 'alias' : 'frozen',
    restored: {completed_updates: 1, weight, momentum},
    next_update: {target: secondTargets[rank], ...resultAfterUpdate[name]},
   }, name + ' rank ' + rank);
  }
 }
}

const record = JSON.parse(read('validation.json'));
verify(record);
for (const alter of [
 data => { data.cases.frozen[1].future_pending = false; },
 data => { data.cases.alias[0].staged_shares_live.momentum = false; },
 data => { data.cases.alias[1].restored.completed_updates = 2; },
 data => { data.cases.alias[1].next_update.weight = step2.weight; },
 data => { data.cases.failed[1].pointer_after = 'failed'; },
 data => { data.files.failed['.metadata'] = 100; },
]) {
 const wrong = structuredClone(record);
 alter(wrong);
 assert.throws(() => verify(wrong), assert.AssertionError);
}

if (process.env.ASYNC_DCP_PYTHON) {
 const replay = execFileSync(process.env.ASYNC_DCP_PYTHON, ['-B', '-m', 'torch.distributed.run',
  '--standalone', '--nproc_per_node=2', path.join(folder, 'async_dcp.py')], {
  encoding: 'utf8', timeout: 135000, env: {...process.env, OMP_NUM_THREADS: '1'},
 });
 verify(JSON.parse(replay));
}

const zip = folder + '.zip';
assert.deepEqual(execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n').sort(),
 files.map(name => pack + '/' + name));
for (const name of files) assert.deepEqual(execFileSync('unzip', ['-p', zip, pack + '/' + name]), read(name), name);
const diagram = fs.readFileSync(path.join(root, 'dist', 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram));
const weights = entries => Object.fromEntries(caseNames.map(name => [name, entries[name].weight]));
assert.deepEqual(JSON.parse(diagram.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record: 'labs/' + pack + '/validation.json', completed_updates: 1,
 restored_weight: weights(resultAfterLoad), next_weight: weights(resultAfterUpdate), write_failure_rank: 1,
});

if (!process.argv.includes('--record-only')) {
 const page = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
 const anchor = 'native-async-dcp-commit';
 const article = page('article/checkpoint-recovery');
 const marker = '<h3 id="' + anchor + '">';
 assert.equal(article.split(marker).length, 2);
 const start = article.indexOf(marker);
 assert(article.slice(article.lastIndexOf('<section class="article-section"', start), start)
  .startsWith('<section class="article-section" id="section-8">'));
 const subsection = article.slice(start, article.indexOf('</section>', start));
 for (const target of ['diagrams/' + pack + '.svg', 'labs/' + pack + '.zip', 'labs/' + pack + '/validation.json',
  '/article/data-pipeline/#native-prefetch-resume']) assert(subsection.includes(target), target);
 const link = '/article/checkpoint-recovery/#' + anchor;
 const point = page('module/training').match(/<section class="knowledge-point" id="knowledge-tr-recovery">([\s\S]*?)<\/section>/)?.[1];
 assert(point?.includes(link), 'domain point');
 const row = page('labs').match(/<li class="lab-learning-unit" id="lab-ai-async-dcp-commit">([\s\S]*?)<\/li>/)?.[1];
 assert(row?.includes(link), 'catalog item');
 assert(page('roadmap/ai-training').includes('/article/checkpoint-recovery/?goal=ai-training#' + anchor), 'role handoff');
}
console.log('PASS: native DCP overlap, detached and aliased state, writer failure/publication, independent SGD, precise reading links and ZIP.');
