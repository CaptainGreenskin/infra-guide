/* Verify the native training and inference handoff independently of the lab runner. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.chdir(path.resolve(__dirname, '..'));
const pack = 'dist/labs/tiny-decoder-handoff';
const dependency = 'dist/labs/sdpa-cache';
const source = ['handoff.py', 'README.md'];
const inputs = ['tiny_decoder.py', 'cache_lab.py', 'requirements.txt'];
const read = (folder, name) => fs.readFileSync(path.join(folder, name));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const digestSet = (folder, files) => Object.fromEntries(files.map(name => [name, digest(read(folder, name))]));
const isHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const record = JSON.parse(read(pack, 'validation.json'));
const rows = [[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]];
const labels = [[[1, -100, -100, -100], [5, 6, 7, -100]], [[1, 2, 3, -100], [-100, -100, -100, 0]]];
const lr = 0.05;
const momentum = 0.5;
const atol = 1e-12;
const initialWeight = 0.9265430569648743;
const expectedLosses = [8.627936874049762, 9.196268635117027];
const expectedFirstLogits = [
  [-0.9500901836522256, 3.7803663408380244, -5.082695740761187, 2.873464640659525,
    -2.8799724558887507, -1.2462966554822557, 2.5823052858954627, 3.4652949822117733],
  [-0.37586980965583705, 3.08344294981834, -4.034304335093411, 2.543320666129088,
    -2.7243559493099405, -0.5350001807246638, 2.2359425773846806, 2.8799698685767803],
];
const bits = digestSet(dependency, inputs);
assert.deepEqual(bits, {
  'tiny_decoder.py': '724963cf4a04ac76f6b7d125876d0be1947b1b29a6b0a159a5bb347477dc3e6f',
  'cache_lab.py': '0095bbd7dda812dfc88360b1aac3515c17df8c32e50723547ca78194e451076c',
  'requirements.txt': '8049eb34ab1429faf23b56ab9d5edc0b20ef0e2d9a98f319eec5505a7277850e',
});
assert.deepEqual(read(dependency, 'tiny_decoder.py'), read('dist/labs/model-foundations', 'tiny_decoder.py'));
assert.deepEqual(record.source_sha256, digestSet(pack, source));
assert.deepEqual(record.sdpa_dependency_sha256, bits);

function close(actual, expected, description) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= atol,
    description + ': expected ' + expected + ', found ' + actual);
}
function small(error, description) {
  assert(Number.isFinite(error) && error >= 0 && error <= atol, description);
}
function state(value, momentumCount) {
  for (const key of ['weights_sha256', 'momentum_sha256', 'rng_sha256']) assert(isHash(value[key]), key);
  assert.equal(value.parameter_count, 664);
  assert.equal(value.momentum_elements, momentumCount);
}
function compareGeneration(value, step) {
  assert.deepEqual(value.prompt, [0, 1]);
  assert.equal(value.output_count, 3);
  assert.deepEqual(value.generated_ids, [1, 1, 1]);
  assert.deepEqual(value.logical_sequence_including_last_output, [0, 1, 1, 1, 1]);
  assert.equal(value.final_cached_positions, 4);
  assert.equal(value.last_output_not_forwarded, 1);
  assert.equal(value.trace.length, 3);
  const positions = [[0, 1], [2], [3]];
  for (const [index, event] of value.trace.entries()) {
    assert.equal(event.phase, index === 0 ? 'prefill' : 'decode');
    assert.deepEqual(event.input_ids, index === 0 ? [0, 1] : [1]);
    assert.deepEqual(event.query_positions, positions[index]);
    assert.equal(event.selected_id, 1);
    assert.equal(event.cache_length, index + 2);
    assert.deepEqual(event.visible, positions[index].map(q => Array.from({length: index + 2}, (_, k) => k <= q)));
    small(event.logits_max_error, 'cached/full logits at exported step ' + step);
  }
}
function validate(value) {
  assert.equal(value.scope, 'two CPU/Gloo ranks, checkpoint handoff and new-process native CPU SDPA');
  assert.equal(value.torch.split('+')[0], '2.5.1');
  assert.deepEqual(value.fixture, {
    seed: 7, rows, labels, input_sha256: digest(JSON.stringify([rows, labels])),
    world_size: 2, lr, momentum, atol, probe: 'token.weight[1,0]', device: 'cpu', dtype: 'float64',
  });
  const {training, inference} = value.result;
  const {first, resume, checkpoint_sha256: checkpoints, dense} = training;
  assert.equal(checkpoints.length, 2);
  assert(checkpoints.every(isHash) && checkpoints[0] !== checkpoints[1]);
  assert.equal(dense.steps.length, 2);
  close(dense.original_a1_loss, expectedLosses[0], 'old A1 loss');
  small(dense.original_a1_step1_weights_max_abs_error, 'old A1 update and DDP step 1');
  close(dense.weights_only_resume_step2_error, 0.056944463894294195, 'weights-only counterexample');

  const pids = [];
  let probeWeight = initialWeight;
  let probeMomentum = 0;
  for (const [index, group] of [first, resume].entries()) {
    assert.equal(group.length, 2);
    const n = labels[index].flat().filter(label => label !== -100).length;
    const probeGradient = group.reduce((total, row) => total + row.probe.local_scaled_gradient, 0) / 2;
    const meanLoss = group.reduce((total, row) => total + row.local_loss_sum, 0) / n;
    const newMomentum = momentum * probeMomentum + probeGradient;
    const newWeight = probeWeight - lr * newMomentum;
    for (const [rank, row] of group.entries()) {
      pids.push(row.pid);
      assert.equal(row.rank, rank);
      assert.equal(row.backend, 'gloo');
      assert.equal(row.step, index + 1);
      assert.equal(row.next_batch_before, index);
      assert.equal(row.next_batch_after, index + 1);
      assert.deepEqual(row.input_ids, rows[rank].slice(0, -1));
      assert.deepEqual(row.labels, labels[index][rank]);
      assert.equal(row.valid_targets, labels[index][rank].filter(label => label !== -100).length);
      assert.equal(row.global_valid_targets, n);
      assert.equal(row.checkpoint_read_sha256, index === 0 ? null : checkpoints[0]);
      close(row.global_mean_loss, meanLoss, 'global sum divided by total effective labels');
      close(row.global_mean_loss, expectedLosses[index], 'known dense loss');
      const p = row.probe;
      close(p.old_weight, probeWeight, 'prior parameter');
      close(p.old_momentum, probeMomentum, 'prior momentum');
      close(p.global_gradient, probeGradient, 'DDP mean of already scaled local gradients');
      close(p.new_momentum, newMomentum, 'actual momentum recurrence');
      close(p.new_weight, newWeight, 'actual SGD update');
      state(row.before, index === 0 ? 0 : 664);
      state(row.after, 664);
      assert.notEqual(row.after.weights_sha256, row.before.weights_sha256);
      assert.equal(row.after.rng_sha256, row.before.rng_sha256, 'deterministic model uses no new random choices');
    }
    probeWeight = newWeight;
    probeMomentum = newMomentum;
    assert.deepEqual(group[0].before, group[1].before);
    assert.deepEqual(group[0].after, group[1].after);
    const expectedDense = dense.steps[index];
    assert.equal(expectedDense.step, index + 1);
    close(expectedDense.loss, meanLoss, 'dense/full loss');
    for (const key of ['loss_abs_error', 'weights_max_abs_error', 'momentum_max_abs_error', 'gradients_max_abs_error']) {
      small(expectedDense[key], key);
    }
  }
  assert.deepEqual(first[0].after, resume[0].before, 'all checkpoint state agrees before fresh rank update');
  close(probeWeight, 0.8938590387934852, 'final parameter probe');
  close(probeMomentum, 0.5919311830340181, 'final momentum probe');

  for (const [index, [request, group]] of [[inference.step1, first], [inference.step2, resume]].entries()) {
    pids.push(request.pid);
    const step = index + 1;
    assert(isHash(request.manifest.weights_sha256));
    assert.deepEqual(request.manifest, {
      version: 1, model: 'TinyDecoder', step, checkpoint_sha256: checkpoints[index],
      weights_sha256: request.manifest.weights_sha256,
      weights_state_sha256: group[0].after.weights_sha256, vocab_size: 8, max_positions: 4, parameters: 664,
    });
    assert.equal(request.first_logits.length, 8);
    for (const [j, logit] of request.first_logits.entries()) close(logit, expectedFirstLogits[index][j], 'first logit');
    compareGeneration(request.generation, step);
  }
  assert.equal(new Set(pids).size, 6, 'four training and two inference processes have distinct PIDs');
  assert(pids.every(pid => Number.isInteger(pid) && pid > 0));
  assert.notEqual(inference.step1.manifest.weights_sha256, inference.step2.manifest.weights_sha256);
  const delta = Math.max(...inference.step1.first_logits.map((x, i) => Math.abs(x - inference.step2.first_logits[i])));
  close(inference.first_logits_delta, delta, 'equal greedy outputs can conceal different scores');
  close(delta, 1.0483914056677754, 'known old/new score difference');
  assert.deepEqual(inference.wrong_bundle, {exit: 2, reason: 'weight file does not match bundle manifest'});
}
validate(record);

const mutants = [
  r => { r.result.training.first[0].valid_targets = 2; },
  r => { r.result.training.resume[1].probe.global_gradient = 0; },
  r => { r.result.training.resume[1].pid = r.result.training.first[1].pid; },
  r => { r.result.training.resume[1].next_batch_before = 0; },
  r => { r.result.training.resume[0].before.momentum_elements = 0; },
  r => { r.result.inference.step2.manifest.weights_state_sha256 = r.result.inference.step1.manifest.weights_state_sha256; },
  r => { r.result.inference.step2.generation.trace[2].cache_length = 5; },
  r => { r.result.inference.first_logits_delta = 0; },
  r => { r.result.inference.wrong_bundle.exit = 0; },
];
for (const mutate of mutants) {
  const modified = JSON.parse(JSON.stringify(record));
  mutate(modified);
  assert.throws(() => validate(modified), {code: 'ERR_ASSERTION'});
}

const executable = process.env.TINY_DECODER_HANDOFF_PYTHON;
if (executable) {
  const rerun = JSON.parse(execFileSync(executable,
    ['-B', path.join(pack, 'handoff.py'), '--sdpa-pack', dependency],
    {encoding: 'utf8', timeout: 70000}));
  validate(rerun);
  assert.deepEqual(rerun.source_sha256, record.source_sha256);
  assert.deepEqual(rerun.sdpa_dependency_sha256, record.sdpa_dependency_sha256);
}
if (!process.argv.includes('--record-only')) {
  const page = read('dist/article/gpu-cluster', 'index.html').toString();
  const opening = page.match(/<section class="article-section" id="section-1">([\s\S]*?)<\/section>/)?.[1];
  assert(opening);
  const {first, dense} = record.result.training;
  const globalTargets = first.reduce((sum, rank) => sum + rank.valid_targets, 0);
  const autogradPage = read('dist/article/autograd-training', 'index.html').toString();
  const proof = autogradPage.split('id="tiny-decoder-rank-update"')[1].split('id="section-10"')[0];
  const fixed = (value, digits) => value.toFixed(digits).replace('-', '−');
  for (const rank of first) {
    const cells = ['rank '+rank.rank, rank.valid_targets, fixed(rank.local_loss_sum,6), fixed(rank.probe.local_scaled_gradient,7)];
    assert(proof.includes('<tr>'+cells.map(value => '<td>'+value+'</td>').join('')+'</tr>'));
  }
  const probe = first[0].probe;
  const localMeanGradient = first.reduce((sum, rank) =>
    sum + rank.probe.local_scaled_gradient * globalTargets / (first.length * rank.valid_targets), 0) / first.length;
  const localMeanWeight = probe.old_weight - lr * localMeanGradient;
  for (const [value, digits] of [[probe.global_gradient,7], [probe.old_weight,8], [probe.new_weight,8], [localMeanGradient,7], [localMeanWeight,8]]) {
    assert(proof.includes(fixed(value,digits)));
  }
  assert(proof.includes('/labs/tiny-decoder-handoff/handoff.py') && proof.includes('/labs/tiny-decoder-handoff/validation.json'));
  const distributedPage = read('dist/article/distributed-training', 'index.html').toString();
  const objective = distributedPage.split('id="section-2"')[1].split('id="section-3"')[0];
  assert(objective.includes('/article/autograd-training/#tiny-decoder-rank-update'));
  assert(opening.includes(`${first[0].before.parameter_count} 参数 TinyDecoder`));
  assert(opening.includes('本机 CPU 进程用 Gloo 通信'));
  for (const rank of first) {
    assert(opening.includes(`rank ${rank.rank} 处理 ${JSON.stringify(rank.input_ids)}，有 ${rank.valid_targets} 个`));
  }
  assert(opening.includes(`乘 ${first.length}/${globalTargets} 再反向`) && opening.includes(`各占 1/${globalTargets}`));
  const loss = first.reduce((sum, rank) => sum + rank.local_loss_sum, 0) / globalTargets;
  const stepDifference = dense.original_a1_step1_weights_max_abs_error.toExponential(2).replace('e-17', '×10⁻¹⁷');
  assert(opening.includes(`平均损失约 ${loss.toFixed(5)}`) && opening.includes(`最大绝对差约 ${stepDifference}`));
  const experiment = 'href="/article/checkpoint-recovery/#native-tiny-decoder-handoff"';
  const classifier = opening.indexOf('下面换用 1,024 条合成样本的分类任务');
  assert(classifier > opening.indexOf(experiment) && opening.includes(experiment));
  assert(read('dist/article/checkpoint-recovery', 'index.html').includes('id="native-tiny-decoder-handoff"'));
  execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys
folder = Path(sys.argv[1])
files = sys.argv[2:]
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(f"{folder.name}/{name}" for name in files)
    for name in files:
        assert archive.read(f"{folder.name}/{name}") == (folder / name).read_bytes(), name
`, pack, ...source, 'validation.json']);
}
console.log('PASS: DDP rank/target ledger, checkpoint and export identity, scalar gradient/SGD oracle, CPU cache trace, 9 mutants' +
  (executable ? ', fresh native replay' : ', offline records') +
  (process.argv.includes('--record-only') ? '.' : ', exact ZIP.'));
