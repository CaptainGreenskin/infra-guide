const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const name = 'bounded-worker-queue';
const pack = path.join(root, 'dist/labs', name);
const program = path.join(pack, 'bounded_worker_queue.py');
const hash = createHash('sha256').update(readFileSync(program)).digest('hex');
const frozen = JSON.parse(readFileSync(path.join(pack, 'validation.json'), 'utf8'));
const arrivals = ['A', 'B', 'C', 'D'];
const result = [10, 27, 5].reduce((sum, value) => sum + value, 0);
const expectedSnapshots = {
  workers_1: { queue_depth: 1, queued: ['B'], waiting_for_downstream: [], holding_downstream: ['A'], rejected: ['C', 'D'] },
  workers_2: { queue_depth: 1, queued: ['C'], waiting_for_downstream: ['B'], holding_downstream: ['A'], rejected: ['D'] },
};

function verifyCase(row, workerLimit, expectedSnapshot) {
  assert.equal(row.workers, workerLimit);
  const queue = [];
  const running = new Map();
  const submitted = [];
  const rejected = [];
  const completed = [];
  let permitHolder = null;
  let sampled = false;
  let opened = false;
  let lastClock = 0;
  let peakRunning = 0;
  for (const { event, task, at_ns, result: output } of row.events) {
    assert(Number.isSafeInteger(at_ns) && at_ns >= lastClock, 'ordered monotonic trace');
    lastClock = at_ns;
    switch (event) {
      case 'admitted':
        assert(!sampled && queue.length < 1 && !submitted.includes(task));
        submitted.push(task);
        queue.push(task);
        break;
      case 'rejected':
        assert(!sampled && queue.length === 1 && !submitted.includes(task));
        submitted.push(task);
        rejected.push(task);
        break;
      case 'worker_started':
        assert.equal(queue.shift(), task, 'FIFO dispatch');
        assert(!running.has(task) && running.size < workerLimit);
        running.set(task, 'started');
        peakRunning = Math.max(peakRunning, running.size);
        break;
      case 'downstream_busy':
        assert.equal(running.get(task), 'started');
        running.set(task, 'waiting');
        break;
      case 'downstream_acquired':
        assert(['started', 'waiting'].includes(running.get(task)));
        assert.equal(permitHolder, null, 'at most one task in downstream');
        permitHolder = task;
        running.set(task, 'holding');
        break;
      case 'downstream_released':
        assert.equal(running.get(task), 'holding');
        assert.equal(permitHolder, task);
        assert(task !== 'A' || opened, 'A stays inside through the snapshot');
        permitHolder = null;
        running.set(task, 'returned');
        break;
      case 'completed':
        assert.equal(running.get(task), 'returned');
        assert.equal(output, result);
        running.delete(task);
        completed.push(task);
        break;
      case 'snapshot':
        assert(!sampled && !opened && task === null);
        assert.deepEqual(submitted, arrivals);
        assert.deepEqual(row.snapshot, {
          queue_depth: queue.length,
          queued: queue,
          waiting_for_downstream: [...running].filter(([, state]) => state === 'waiting').map(([id]) => id),
          holding_downstream: [permitHolder],
          rejected,
        });
        assert.deepEqual(row.snapshot, expectedSnapshot);
        sampled = true;
        break;
      case 'release_A_gate':
        assert(sampled && !opened && permitHolder === 'A' && task === 'A');
        opened = true;
        break;
      default:
        assert.fail('unexpected event ' + event);
    }
  }
  assert(sampled && opened);
  assert.equal(permitHolder, null);
  assert.equal(queue.length + running.size, 0);
  assert.equal(peakRunning, workerLimit);
  assert.deepEqual(completed.sort(), arrivals.filter(task => !rejected.includes(task)));
}

function verify(record) {
  assert.equal(record.status, 'passed');
  assert.deepEqual(record.source_sha256, { 'bounded_worker_queue.py': hash });
  assert.deepEqual(record.arrivals, arrivals);
  assert.deepEqual([record.queue_capacity, record.downstream_capacity], [1, 1]);
  for (const workers of [1, 2]) {
    const key = 'workers_' + workers;
    verifyCase(record.cases[key], workers, expectedSnapshots[key]);
  }
}

verify(frozen);
const replay = execFileSync(process.env.BOUNDED_QUEUE_PYTHON || 'python3', ['-B', program],
  { encoding: 'utf8', timeout: 18000 });
verify(JSON.parse(replay));
assert.deepEqual(frozen.cases.workers_2.events.filter(row => row.event === 'completed').map(row => row.task),
  ['A', 'C', 'B'], 'the chapter discusses this frozen example, not a guarantee for future runs');

for (const tamper of [
  record => { record.cases.workers_2.snapshot.waiting_for_downstream = []; },
  record => { record.cases.workers_1.events.find(row => row.event === 'rejected').event = 'admitted'; },
  record => {
    const row = record.cases.workers_2.events.find(item => item.event === 'downstream_busy');
    row.event = 'downstream_acquired';
  },
]) {
  const changed = structuredClone(frozen);
  tamper(changed);
  assert.throws(() => verify(changed), assert.AssertionError);
}

const figure = readFileSync(path.join(root, 'dist/diagrams', name + '.svg'), 'utf8');
const metadata = JSON.parse(figure.match(/<metadata>(.*?)<\/metadata>/)[1]);
assert.deepEqual([metadata.queue_capacity, metadata.downstream_capacity], [1, 1]);
for (const key of Object.keys(expectedSnapshots)) {
  const { queue_depth, ...state } = expectedSnapshots[key];
  assert.equal(queue_depth, 1);
  assert.deepEqual(metadata[key], state);
}

const chapter = readFileSync(path.join(root, 'dist/progressive-prerequisites-reading.js'), 'utf8')
  .split('id="bounded-worker-queue"')[1];
for (const token of [
  'diagrams/bounded-worker-queue.svg', 'labs/bounded-worker-queue.zip',
  'labs/bounded-worker-queue/bounded_worker_queue.py', 'labs/bounded-worker-queue/validation.json',
  "['1','B','无','A','C、D']", "['2','C','B','A','D']",
]) {
  assert(chapter.includes(token), token);
}

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
import sys
from zipfile import ZipFile

pack = Path(sys.argv[1])
members = {pack.name + "/" + file: (pack / file).read_bytes() for file in sys.argv[2:]}
with ZipFile(pack.with_suffix(".zip")) as archive:
    assert sorted(archive.namelist()) == sorted(members)
    for path, source in members.items():
        assert archive.read(path) == source, path
`, pack, 'README.md', 'bounded_worker_queue.py', 'validation.json'], { timeout: 15000 });
console.log('PASS: bounded queue admission, distinct downstream wait, one-permit invariant, actual replay, evidence and ZIP.');
