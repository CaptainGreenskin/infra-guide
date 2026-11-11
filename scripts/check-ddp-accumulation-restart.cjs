/* Recompute each gradient and check the observed restart, input and commit history. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const dist = path.resolve(__dirname, '../dist');
const slug = 'ddp-accumulation-restart';
const lab = path.join(dist, 'labs', slug);
const record = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(lab, 'validation.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isSha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

assert.equal(record.schema_version, 1);
assert.equal(record.status, 'passed');
const {environment, fixture, runs} = record;
assert.match(environment.python, /^3\.12\.\d+$/);
assert.match(environment.torch, /^2\.5\.1(?:\+cpu)?$/);
assert.deepEqual([environment.device, environment.backend, environment.world_size], ['cpu', 'gloo', 2]);
assert.deepEqual(Object.keys(record.source_sha256).sort(), ['accumulation_restart.py', 'requirements.txt']);
for (const [file, expected] of Object.entries(record.source_sha256)) {
  assert.equal(digest(fs.readFileSync(path.join(lab, file))), expected, file);
}
assert.deepEqual(fixture, {
  targets: [[1, 3], [5, 7], [2, 4], [6, 8]],
  microbatches_per_window: 2,
  learning_rate: 0.25,
  momentum_coefficient: 0.5,
  fault: {micro: 2, rank: 1, exit_code: 73},
});
assert.deepEqual(Object.keys(runs), ['continuous', 'replay_window', 'skip_consumed']);
const {targets, fault} = fixture;
const windowSize = fixture.microbatches_per_window;
const {world_size: ranks} = environment;
const rankIds = Array.from({length: ranks}, (_, rank) => rank);

for (const [name, run] of Object.entries(runs)) {
  const restarted = name !== 'continuous';
  assert.equal(run.attempts.length, restarted ? 2 : 1, name);
  const pids = run.attempts.flatMap(attempt => attempt.map(journal => journal[0].pid));
  assert(pids.every(pid => Number.isInteger(pid) && pid > 0), name);
  assert.equal(new Set(pids).size, ranks * run.attempts.length, name);
  assert.equal(run.launcher.exit_code, 0, name);
  assert(run.launcher.options.includes('--nproc-per-node=2'), name);
  assert(run.launcher.options.includes('--max-restarts=' + Number(restarted)), name);
  assert.deepEqual(run.launcher.worker_failures, restarted ?
    [{exit_code: fault.exit_code, local_rank: fault.rank, pid: pids[fault.rank]}] : [], name);
  assert.deepEqual(run.launcher.stopped_peers, restarted ? [{pid: pids[0], signal: 'SIGTERM'}] : [], name);

  let lastCommit = null;
  for (const [attempt, journals] of run.attempts.entries()) {
    assert.equal(journals.length, ranks);
    const loaded = lastCommit?.checkpoint ?? null;
    const loadedSha = lastCommit?.checkpoint_sha256 ?? null;
    const startAt = rank => {
      if (attempt && name === 'skip_consumed') {
        const consumed = run.attempts[0][rank].filter(row => row.event === 'backward').at(-1);
        return consumed.micro + 1;
      }
      return loaded?.next_micro ?? 0;
    };
    const start = startAt(0);
    const expected = rankIds.map(rank => {
      assert.equal(startAt(rank), start);
      return [{event: 'start', rank, attempt, pid: pids[attempt * ranks + rank],
        loaded, checkpoint_sha256: loadedSha, start_micro: start, grad_is_none: true}];
    });
    let weight = loaded?.weight ?? 0;
    let momentum = loaded?.momentum ?? 0;
    const local = rankIds.map(() => 0);
    for (let micro = start; micro < targets.length; micro++) {
      const sync = (micro + 1) % windowSize === 0;
      for (const rank of rankIds) local[rank] += (weight - targets[micro][rank]) / windowSize;
      const reduced = local.reduce((sum, value) => sum + value, 0) / ranks;
      for (const rank of rankIds) {
        expected[rank].push({event: 'backward', micro, sample_id: micro * ranks + rank,
          target: targets[micro][rank], synchronized: sync, gradient: sync ? reduced : local[rank]});
      }
      if (restarted && attempt === 0 && micro === fault.micro) {
        for (const rank of rankIds) {
          expected[rank].push({event: 'cut', micro, checkpoint: lastCommit.checkpoint,
            checkpoint_sha256: lastCommit.checkpoint_sha256,
            action: rank === fault.rank ? 'exit' : 'wait_for_launcher'});
        }
        break;
      }
      if (!sync) continue;
      momentum = fixture.momentum_coefficient * momentum + reduced;
      weight -= fixture.learning_rate * momentum;
      local.fill(0);
      for (const journal of expected) {
        journal.push({event: 'update', last_micro: micro, gradient: reduced, weight, momentum});
      }
      const checkpointSha = journals[0][expected[0].length]?.checkpoint_sha256;
      assert(isSha256(checkpointSha), name);
      lastCommit = {event: 'commit', checkpoint: {next_micro: micro + 1, weight, momentum},
        checkpoint_sha256: checkpointSha};
      expected[0].push(lastCommit);
    }
    assert.deepEqual(journals, expected, name + ' attempt ' + attempt);
  }
  assert.deepEqual(run.final, lastCommit.checkpoint, name);
  assert.equal(run.final_checkpoint_sha256, lastCommit.checkpoint_sha256, name);
}
assert.deepEqual(runs.continuous.final, {next_micro: 4, weight: 2.5, momentum: -6});
assert.deepEqual(runs.replay_window.final, runs.continuous.final);
assert.deepEqual(runs.skip_consumed.final, {next_micro: 4, weight: 2.25, momentum: -5});

const origin = fs.readFileSync(path.join(dist, 'progressive-training-io-reading.js'), 'utf8');
const recovery = fs.readFileSync(path.join(dist, 'progressive-training-recovery-reading.js'), 'utf8');
const prefetch = origin.slice(origin.indexOf("h('native-prefetch-resume'"));
const anchor = 'native-ddp-accumulation-restart';
const lesson = recovery.slice(recovery.indexOf('id="' + anchor + '"'), recovery.indexOf('id="native-async-dcp-commit"'));
assert(prefetch.includes('/article/checkpoint-recovery/#' + anchor));
assert(lesson.includes('/article/data-pipeline/#native-prefetch-resume'));
for (const field of ['−0.5', '−1.5', '2.5', '−6', '2.25', '−5']) assert(lesson.includes(field), field);
for (const file of ['accumulation_restart.py', 'README.md', 'validation.json']) {
  assert(lesson.includes('/labs/' + slug + '/' + file), file);
}
console.log('PASS: native DDP window fault, two restarted ranks, sample replay, independently calculated gradients, checkpoint lineage and chapter links');
