/* Recompute each sample and SGD step without calling the PyTorch lab. */
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'prefetch-resume-step';
const folder = path.join(root, 'dist', 'labs', pack);
const files = ['README.md', 'prefetch_resume.py', 'requirements.txt', 'validation.json'];
const read = name => fs.readFileSync(path.join(folder, name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(files.slice(1, 3).map(file => [file, sha(read(file))]));
const order = [4, 1, 8, 3, 0, 11, 7, 2, 9, 6, 5, 10];
const inputs = Array.from({length: 6}, (_, batch) => {
 const sample_ids = order.slice(batch * 2, batch * 2 + 2);
 const targets = sample_ids.map(id => id + createHash('sha256').update('3:' + id).digest()[0] % 4 / 4);
 return {batch, sample_ids, targets};
});

function oracle(batches, state = {weight: 0, momentum: 0}) {
 let {weight, momentum} = state;
 return batches.map(batch => {
  const {targets} = inputs[batch];
  const before = weight;
  const gradient = (2 * before - targets[0] - targets[1]) / 2;
  const loss = ((before - targets[0]) ** 2 + (before - targets[1]) ** 2) / 4;
  momentum = momentum / 2 + gradient;
  weight = before - momentum / 4;
  return {...inputs[batch], loss, weight_before: before, gradient,
   momentum_after: momentum, weight_after: weight};
 });
}

const full = oracle([0, 1, 2, 3, 4, 5]);
const saved = {weight: full[0].weight_after, momentum: full[0].momentum_after};
const incorrect = oracle([5], saved);

function validateTrainer(phase, preparedBatches, expectedUpdates) {
 const {prepared, updates, trainer_pid, start_batch} = phase;
 assert(Number.isInteger(trainer_pid) && trainer_pid > 0);
 assert.equal(start_batch, preparedBatches[0]);
 assert.deepEqual(prepared.map(({batch}) => batch), preparedBatches);
 const workers = new Map();
 for (const [index, entry] of prepared.entries()) {
  const {worker_id, worker_pid, ...contents} = entry;
  assert.deepEqual(contents, inputs[entry.batch]);
  assert.equal(worker_id, index % 2);
  assert(Number.isInteger(worker_pid) && worker_pid > 0 && worker_pid !== trainer_pid);
  if (workers.has(worker_id)) assert.equal(workers.get(worker_id), worker_pid);
  workers.set(worker_id, worker_pid);
 }
 assert.equal(new Set(workers.values()).size, Math.min(preparedBatches.length, 2));
 assert.deepEqual(updates.map(({worker_id, worker_pid, ...record}) => {
  const ready = prepared.find(entry => entry.batch === record.batch);
  assert.deepEqual([worker_id, worker_pid], [ready?.worker_id, ready?.worker_pid]);
  return record;
 }), expectedUpdates);
 return [...workers.values()];
}

function verify(report) {
 assert.equal(report.platform.torch.split('+')[0], '2.5.1');
 assert.deepEqual(report.source_sha256, sourceHashes);
 assert.deepEqual(report.config, {order, epoch: 3, batch_size: 2, transform: 'sha256-byte-mod4-v1',
  workers: 2, prefetch_factor: 2});
 const {baseline, stopped, resumed, worker_cursor: wrong} = report;
 validateTrainer(baseline, [0, 1, 2, 3, 4, 5], full);
 const oldWorkers = validateTrainer(stopped, [0, 1, 2, 3, 4], full.slice(0, 1));
 const newWorkers = validateTrainer(resumed, [1, 2, 3, 4, 5], oracle([1, 2, 3, 4, 5], saved));
 validateTrainer(wrong, [5], incorrect);
 assert.equal(new Set([baseline, stopped, resumed, wrong].map(phase => phase.trainer_pid)).size, 4);
 assert(newWorkers.every(pid => !oldWorkers.includes(pid)));
 assert.notEqual(stopped.prepared[1].worker_id, resumed.prepared[0].worker_id);
 assert.equal(stopped.checkpoint.next_batch, 1);
 assert.match(stopped.checkpoint.sha256, /^[0-9a-f]{64}$/);
 for (const restarted of [resumed, wrong]) {
  assert.deepEqual(restarted.loaded, {...saved, checkpoint_next_batch: 1,
   checkpoint_sha256: stopped.checkpoint.sha256});
  assert.equal(restarted.checkpoint, null);
 }
 assert.equal(stopped.loaded, null);
 assert.equal(baseline.loaded, null);
 assert.equal(baseline.checkpoint, null);
 assert.deepEqual(resumed.updates.at(-1).weight_after, baseline.updates.at(-1).weight_after);
 assert.notEqual(wrong.updates.at(-1).weight_after, baseline.updates.at(-1).weight_after);
}

const archived = JSON.parse(read('validation.json'));
verify(archived);
for (const mutate of [
 report => { report.stopped.checkpoint.next_batch = 5; },
 report => { report.stopped.prepared.splice(2, 1); },
 report => { report.resumed.prepared[0].worker_pid = report.stopped.prepared[0].worker_pid; },
 report => { report.resumed.updates[0].targets[0] += 0.25; },
 report => { report.resumed.loaded.momentum = 0; },
 report => { report.worker_cursor.updates[0].weight_after = full.at(-1).weight_after; },
]) {
 const changed = structuredClone(archived);
 mutate(changed);
 assert.throws(() => verify(changed), assert.AssertionError);
}

if (process.env.PREFETCH_RESUME_PYTHON) {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prefetch-resume-check-'));
 try {
  const output = path.join(temporary, 'validation.json');
  execFileSync(process.env.PREFETCH_RESUME_PYTHON, ['-B', path.join(folder, 'prefetch_resume.py'), '--output', output],
   {timeout: 120000});
  verify(JSON.parse(fs.readFileSync(output)));
 } finally {
  fs.rmSync(temporary, {recursive: true, force: true});
 }
}

const zip = folder + '.zip';
assert.deepEqual(execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n').sort(),
 files.map(name => pack + '/' + name));
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', zip, pack + '/' + file]), read(file), file);
const diagram = fs.readFileSync(path.join(root, 'dist', 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram));
assert.deepEqual(JSON.parse(diagram.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record: 'labs/' + pack + '/validation.json', prepared: [0, 1, 2, 3, 4], committed: [0],
 correct_cursor: 1, worker_cursor: 5, final_weight: {
  baseline: full.at(-1).weight_after, resumed: full.at(-1).weight_after, worker_cursor: incorrect[0].weight_after,
 },
});

if (!process.argv.includes('--record-only')) {
 const page = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
 const anchor = 'native-prefetch-resume';
 const article = page('article/data-pipeline');
 const marker = '<h3 id="' + anchor + '">';
 assert.equal(article.split(marker).length, 2);
 const start = article.indexOf(marker);
 assert(article.slice(article.lastIndexOf('<section class="article-section"', start), start)
  .startsWith('<section class="article-section" id="section-6">'));
 const subsection = article.slice(start, article.indexOf('</section>', start));
 for (const target of ['diagrams/' + pack + '.svg', 'labs/' + pack + '.zip', 'labs/' + pack + '/validation.json']) {
  assert(subsection.includes(target), target);
 }
 const link = '/article/data-pipeline/#' + anchor;
 const point = page('module/training').match(/<section class="knowledge-point" id="knowledge-tr-input">([\s\S]*?)<\/section>/)?.[1];
 assert(point?.includes(link), 'domain point');
 const row = page('labs').match(/<li class="lab-learning-unit" id="lab-ai-prefetch-resume-step">([\s\S]*?)<\/li>/)?.[1];
 assert(row?.includes(link), 'catalog item');
 assert(page('roadmap/ai-training').includes('/article/data-pipeline/?goal=ai-training#' + anchor), 'role handoff');
}
console.log('PASS: native worker prep, actual checkpoint cursor, independent exact sample/SGD oracle, wrong-cursor rejection, figure and ZIP.');
