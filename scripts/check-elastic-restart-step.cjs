/* Check real torchrun attempt logs against a scalar SGD and checkpoint oracle. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'elastic-restart-step';
const folder = path.join(root, 'dist', 'labs', pack);
const files = ['README.md', 'elastic_restart.py', 'requirements.txt', 'validation.json'];
const anchor = 'native-elastic-restart-step';
const read = file => fs.readFileSync(path.join(folder, file));
const page = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
const sourceHashes = Object.fromEntries(files.slice(0, -1).map(file => [file, createHash('sha256').update(read(file)).digest('hex')]));
const fixture = {input: 1, targets: [[1, 3], [2, 4], [3, 5]], lr: 1 / 8, momentum: 1 / 2,
 fail_step: 2, fail_rank: 1, world_size: 2};
const names = ['uninterrupted', 'restarted', 'weights_only'];
const exitCode = 73;

function scalarSteps(targets, start, initialWeight, initialMomentum) {
 let weight = initialWeight, momentum = initialMomentum;
 return targets.map((targetPair, i) => {
  const replicaGradients = targetPair.map(target => 2 * (fixture.input * weight - target) * fixture.input);
  const gradient = replicaGradients.reduce((sum, value) => sum + value, 0) / targetPair.length;
  momentum = fixture.momentum * momentum + gradient;
  weight -= fixture.lr * momentum;
  return {step: start + i + 1, gradient, weight, momentum};
 });
}

const continuous = scalarSteps(fixture.targets, 0, 0, 0);
const first = continuous[0];
const restoredWithoutMomentum = [first, ...scalarSteps(fixture.targets.slice(1), 1, first.weight, 0)];
const checkpoint = history => ({cursor: history.at(-1).step, history,
 weight: history.at(-1).weight, momentum: history.at(-1).momentum});
const beforeFault = checkpoint([first]);

function expectedEvents(rank, updates, cutAtEnd) {
 const events = [];
 for (const update of updates) {
  const index = update.step - 1;
  events.push({event: 'update', cursor_before: index, sample_id: fixture.world_size * index + rank,
   target: fixture.targets[index][rank], ...update});
  if (cutAtEnd && update.step === fixture.fail_step) {
   events.push({event: 'cut', checkpoint: beforeFault,
    action: rank === fixture.fail_rank ? 'exit' : 'wait_for_launcher', ...update});
  } else if (rank === 0) {
   events.push({event: 'commit', ...update});
  }
 }
 return events;
}

function verify(record) {
 assert.equal(record.status, 'passed');
 assert.deepEqual(record.fixture, fixture);
 assert.deepEqual(record.reference, continuous);
 assert.deepEqual(record.source_sha256, sourceHashes);
 const {environment} = record;
 assert.match(environment.torch, /^2\.5\.1(?:\+\S+)?$/);
 assert.match(environment.system, /^(Linux|Darwin)$/);
 assert.deepEqual([environment.launcher, environment.backend, environment.device], ['torch.distributed.run', 'gloo', 'cpu']);
 assert.deepEqual(Object.keys(record.cases), names);

 for (const name of names) {
  const crash = name !== 'uninterrupted';
  const weightsOnly = name === 'weights_only';
  const steps = weightsOnly ? restoredWithoutMomentum : continuous;
  const {launcher, attempts, checkpoint: final} = record.cases[name];
  assert.deepEqual(final, checkpoint(steps), name + ': final authoritative checkpoint');
  assert.equal(attempts.length, crash ? 2 : 1);
  const pids = new Set();
  for (const [attempt, workers] of attempts.entries()) {
   assert.equal(workers.length, fixture.world_size);
   for (const [rank, events] of workers.entries()) {
    const [start, ...body] = events;
    assert(Number.isSafeInteger(start.pid) && start.pid > 0, name + ': actual worker process identifier');
    assert(!pids.has(start.pid), name + ': every worker replaced on a new attempt');
    pids.add(start.pid);
    assert.deepEqual(start, {event: 'start', pid: start.pid, rank, restart_count: attempt,
     cursor: attempt ? beforeFault.cursor : 0, weight: attempt ? beforeFault.weight : 0,
     momentum: attempt && !weightsOnly ? beforeFault.momentum : null});
    const cutAtEnd = crash && attempt === 0;
    const updates = cutAtEnd ? continuous.slice(0, fixture.fail_step) : steps.slice(start.cursor);
    assert.deepEqual(body, expectedEvents(rank, updates, cutAtEnd), name + ': exact rank update and commit sequence');
   }
  }
  assert.equal(pids.size, crash ? 4 : 2);
  const [healthy, failed] = attempts[0].map(events => events[0].pid);
  assert.deepEqual(launcher, {exit_code: 0, max_restarts: crash ? 1 : 0,
   worker_failures: crash ? [{exit_code: exitCode, local_rank: fixture.fail_rank, pid: failed}] : [],
   stopped_peers: crash ? [{pid: healthy, signal: 'SIGTERM'}] : []}, name + ': launcher observed actual failure and stopped peer');
 }
}

const record = JSON.parse(read('validation.json'));
verify(record);
assert.deepEqual(continuous.map(({weight, momentum}) => [weight, momentum]), [[0.5, -4], [1.375, -7], [2.46875, -8.75]]);
assert.deepEqual(restoredWithoutMomentum.map(({weight, momentum}) => [weight, momentum]), [[0.5, -4], [1.125, -5], [2.15625, -8.25]]);
for (const mutate of [
 data => { data.cases.restarted.attempts[1][0][0].pid = data.cases.restarted.attempts[0][0][0].pid; },
 data => { data.cases.restarted.attempts[0][1].at(-1).checkpoint.cursor = 2; },
 data => { data.cases.restarted.attempts[1][1][1].sample_id = 4; },
 data => { data.cases.restarted.attempts[0][0].push({event: 'commit', ...continuous[1]}); },
 data => { data.cases.restarted.launcher.stopped_peers = []; },
 data => { data.cases.weights_only.checkpoint = data.cases.uninterrupted.checkpoint; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered), assert.AssertionError);
}

assert.equal(read('requirements.txt').toString('utf8').trim(), 'torch==2.5.1');
if (process.env.ELASTIC_RESTART_PYTHON) {
 const output = execFileSync(process.env.ELASTIC_RESTART_PYTHON, ['-B', path.join(folder, 'elastic_restart.py')],
  {encoding: 'utf8', timeout: 360000, maxBuffer: 1024 * 1024});
 verify(JSON.parse(output));
}

const archive = folder + '.zip';
const entries = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(file => pack + '/' + file));
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', archive, pack + '/' + file]), read(file), file);

const article = page('article/checkpoint-recovery');
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique restart experiment anchor');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-8">'));
for (const target of ['diagrams/' + pack + '.svg', 'labs/' + pack + '.zip', 'labs/' + pack + '/validation.json']) {
 assert(article.includes(target), target);
}
assert(page('roadmap/ai-training').includes('/article/checkpoint-recovery/?goal=ai-training#' + anchor));
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-ai-elastic-restart-step">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes('/article/checkpoint-recovery/#' + anchor));
const diagram = fs.readFileSync(path.join(root, 'dist', 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram), 'accessible diagram title and description');
const metadata = diagram.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram binds its outcome to the recorded experiment');
assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', fault_step: fixture.fail_step,
 worker_exit: exitCode, restart_cursor: beforeFault.cursor,
 final_weights: Object.fromEntries(names.map(name => [name, record.cases[name].checkpoint.weight]))});
console.log('PASS: actual torchrun peer replacement, independent scalar momentum and checkpoint oracle, bound source/archive, exact diagram and reading links.');
