/* Recompute the training oracle and verify the linked CPU timing evidence. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/training-useful-tokens';
const folder = path.join(root, pack);
const source = 'useful_tokens.py';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex');
const record = JSON.parse(read(pack + '/validation.json'));
const lengths = [128, 96, 64, 32, 16, 8, 4, 4];
const width = 128;
const featureSize = 32;
const classes = 4;
const learningRate = 0.125;
const useful = lengths.reduce((a, b) => a + b, 0);
const slots = lengths.length * width;
const modes = ['padded', 'packed'];
const phases = ['prepare', 'forward_loss', 'backward', 'optimizer'];

function near(actual, expected, tolerance) {
 assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `expected ${expected} ± ${tolerance}, got ${actual}`);
}

// The classifier has no bias. Derive softmax, summed cross-entropy and
// all weight gradients from the input formula, without importing PyTorch.
function oracle() {
 const weights = Array.from({length:classes}, (_, label) =>
  Array.from({length:featureSize}, (_, i) => ((label * featureSize + i) % 11 - 5) / 32));
 const gradients = weights.map(row => row.map(() => 0));
 let loss = 0;
 for (const [batch, length] of lengths.entries()) {
  for (let pos = 0; pos < length; pos++) {
   const slot = batch * width + pos;
   const target = slot % classes;
   const features = Array.from({length:featureSize}, (_, i) => ((slot + i) % 17 - 8) / 8);
   const exponents = weights.map(row =>
    Math.exp(row.reduce((sum, value, i) => sum + value * features[i], 0)));
   const total = exponents.reduce((a, b) => a + b, 0);
   loss -= Math.log(exponents[target] / total);
   exponents.forEach((value, label) => {
    const error = value / total - Number(label === target);
    features.forEach((feature, i) => { gradients[label][i] += error * feature; });
   });
  }
 }
 return {loss, gradient:gradients[0][0], initial:weights[0][0],
  maxGradient:Math.max(...gradients.flat().map(Math.abs))};
}
const expected = oracle();

function checkRecord(data) {
 assert.equal(data.status, 'passed');
 assert.deepEqual(data.source_sha256, {[source]:sha(source), 'requirements.txt':sha('requirements.txt')});
 assert.match(data.environment.torch, /^2\.5\.1(?:\+[a-z0-9._-]+)?$/);
 assert.equal(data.environment.device, 'cpu');
 assert.equal(data.environment.dtype, 'torch.float32');
 assert.equal(data.environment.threads, 1);
 assert.equal(data.environment.interop_threads, 1);
 assert.deepEqual(data.fixture, {lengths, shape:[lengths.length, width, featureSize],
  classes, useful_tokens:useful, padded_tokens:slots - useful, learning_rate:learningRate});
 assert.deepEqual(Object.keys(data.cases), [...modes, 'wrong_denominator']);
 for (const [name, actual] of Object.entries(data.cases)) {
  const divisor = name === 'wrong_denominator' ? slots : useful;
  const gradient = expected.gradient / divisor;
  assert.equal(actual.forward_rows, name === 'packed' ? useful : slots);
  assert.equal(actual.denominator, divisor);
  near(actual.loss_sum, expected.loss, 0.00015);
  near(actual.mean_loss, expected.loss / divisor, 0.000001);
  near(actual.gradient_0_0, gradient, 0.00000005);
  near(actual.weight_0_0_after, expected.initial - learningRate * gradient, 0.00000005);
 }
 near(data.comparison.gradient_max_abs_diff, 0, 0.0000001);
 near(data.comparison.weight_max_abs_diff, 0, 0.0000001);
 const wrongDiff = learningRate * expected.maxGradient * (1 / useful - 1 / slots);
 near(data.comparison.wrong_weight_max_abs_diff, wrongDiff, 0.0000001);
 assert.deepEqual(Object.keys(data.profiles), modes);
 for (const mode of modes) {
  const trace = data.profiles[mode];
  assert.deepEqual(trace.phases.map(phase => phase.name), phases);
  let previousEnd = 0;
  for (const phase of trace.phases) {
   assert(Number.isFinite(phase.start_us) && phase.start_us >= previousEnd);
   assert(Number.isFinite(phase.end_us) && phase.end_us > phase.start_us);
   previousEnd = phase.end_us;
  }
  for (const name of ['aten::linear', 'aten::cross_entropy_loss', 'aten::mm',
   'LogSoftmaxBackward0', 'Optimizer.step#SGD.step']) {
   assert(trace.operators.includes(name), `${mode} trace missing ${name}`);
  }
  assert.equal(trace.operators.includes('aten::index'), mode === 'packed');
 }

 const timings = data.timings;
 assert.equal(timings.warmup_updates_per_mode, 24);
 assert.equal(timings.updates_per_sample, 24);
 assert.equal(timings.samples.length, 12);
 for (const [i, sample] of timings.samples.entries()) {
  assert.deepEqual(sample.order, i % 2 === 0 ? modes : modes.slice().reverse());
  assert.deepEqual(Object.keys(sample.duration_ns), sample.order);
  assert(Object.values(sample.duration_ns).every(value => Number.isSafeInteger(value) && value > 0));
 }
 assert.deepEqual(Object.keys(timings.summary), modes);
 for (const mode of modes) {
  const ns = timings.samples.map(s => s.duration_ns[mode] / timings.updates_per_sample).sort((a, b) => a - b);
  const p50 = (ns[5] + ns[6]) / 2;
  near(timings.summary[mode].p50_us_per_update, p50 / 1000, 1e-9);
  near(timings.summary[mode].p90_us_per_update, ns[10] / 1000, 1e-9);
  near(timings.summary[mode].useful_tokens_per_s_at_p50, useful * 1e9 / p50, 1e-7);
 }
}

checkRecord(record);
for (const mutation of [
 data => {data.cases.padded.denominator = slots;},
 data => {data.cases.packed.gradient_0_0 = 0;},
 data => {data.cases.wrong_denominator.weight_0_0_after = data.cases.padded.weight_0_0_after;},
 data => {data.comparison.wrong_weight_max_abs_diff = 0;},
 data => {data.profiles.packed.phases[1].start_us = 0;},
 data => {data.profiles.packed.operators = data.profiles.padded.operators;},
 data => {data.timings.samples[1].order.reverse();},
 data => {data.timings.summary.padded.useful_tokens_per_s_at_p50 *= slots / useful;},
 data => {data.source_sha256[source] = '0'.repeat(64);},
]) {
 const invalid = structuredClone(record);
 mutation(invalid);
 assert.throws(() => checkRecord(invalid), assert.AssertionError);
}

const svg = read('dist/diagrams/training-useful-tokens.svg');
assert.match(svg, /aria-labelledby="title desc"/);
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]),
 {record:'labs/training-useful-tokens/validation.json', slots, targets:useful, padding:slots - useful, phases});

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys

folder = Path(sys.argv[1])
with ZipFile(folder.with_suffix('.zip')) as archive:
    expected = sorted(folder.name + '/' + item.name for item in folder.iterdir() if item.is_file())
    assert archive.namelist() == expected
    for name in expected:
        assert archive.read(name) == (folder / Path(name).name).read_bytes()
`, folder], {timeout:10000});

const authorFile = 'dist/progressive-training-recovery-reading.js';
const author = read(authorFile);
const previous = execFileSync('git', ['show', 'd9f3726b:' + authorFile], {cwd:root, encoding:'utf8'});
const published = execFileSync('git', ['show', 'bf8aeae8293360d9a9cdd58e54d84093c134caa9:' + authorFile], {cwd:root, encoding:'utf8'});
const marker = " const throughput=articles.find(a=>a.id==='training-performance');";
const start = author.indexOf(marker), publishedStart = published.indexOf(marker);
assert(start > 0 && publishedStart > 0 && author.endsWith('})();\n'));
assert.equal(published.slice(0, publishedStart).trimEnd() + '\n})();\n', previous);
const unit = author.slice(start);
assert.equal(unit, published.slice(publishedStart), 'Throughput teaching unit must remain unchanged');
assert.match(unit, /throughput\.sections\[3\]\[1\]\+=/);
assert.match(unit, /id="cpu-useful-token-throughput"/);
assert(unit.includes("trainingFigure('training-useful-tokens'"));
for (const link of ['.zip', '/' + source, '/README.md', '/validation.json']) {
 assert(unit.includes('href="labs/training-useful-tokens' + link + '"'));
}
for (const [mode, timings] of Object.entries(record.timings.summary)) {
 assert(unit.includes(timings.p50_us_per_update.toFixed(1)), mode);
 assert(unit.includes(timings.p90_us_per_update.toFixed(1)), mode);
}
for (const item of Object.values(record.cases)) {
 for (const name of ['gradient_0_0', 'weight_0_0_after']) {
  assert(unit.includes(item[name].toFixed(6).replace('-', '−')), name);
 }
}

const context = vm.createContext({});
for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
 if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename:file});
}
const dataBatching = vm.runInContext('articleById("data-pipeline").sections[3][1]', context);
const compactInputShape = [useful, featureSize];
assert(dataBatching.includes(`收到 ${JSON.stringify(record.fixture.shape)}，即 ${slots.toLocaleString('en-US')} 个位置`));
assert(dataBatching.includes(`线性层收到 ${JSON.stringify(compactInputShape)}。两条路径都除以 ${useful}`));
assert(dataBatching.includes('href="/article/training-performance/#cpu-useful-token-throughput"'));
for (const field of ['aten::linear', 'aten::index', 'Input Dims', 'forward_rows', 'denominator']) {
 assert(dataBatching.includes(`<code>${field}</code>`), field);
}
assert.equal(record.comparison.gradient_max_abs_diff, 0);
assert.equal(record.comparison.weight_max_abs_diff, 0);

if (process.env.USEFUL_TOKENS_PYTHON) {
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'training-useful-tokens-'));
 try {
  const output = execFileSync(process.env.USEFUL_TOKENS_PYTHON, ['-B', path.join(folder, source),
   '--trace-dir', tmp], {encoding:'utf8', timeout:30000});
  const replay = JSON.parse(output);
  checkRecord(replay);
  for (const mode of modes) {
   const trace = JSON.parse(fs.readFileSync(path.join(tmp, mode + '.json'), 'utf8'));
   const events = trace.traceEvents.filter(event => event.ph === 'X' && event.name?.startsWith(mode + '.'));
   assert.deepEqual(events.map(event => event.name), phases.map(phase => mode + '.' + phase));
   for (const [i, event] of events.entries()) {
    const phase = replay.profiles[mode].phases[i];
    near(event.dur, phase.end_us - phase.start_us, 0.1);
   }
   const linear = trace.traceEvents.filter(event => event.ph === 'X' && event.name === 'aten::linear');
   assert.equal(linear.length, 1);
   assert.deepEqual(linear[0].args['Input Dims'][0], mode === 'padded' ? record.fixture.shape : compactInputShape);
   const selectFeatures = trace.traceEvents.find(event => event.ph === 'X' && event.name === 'aten::index' &&
    JSON.stringify(event.args['Input Dims'][0]) === JSON.stringify(record.fixture.shape));
   if (mode === 'packed') {
    assert(selectFeatures && selectFeatures.ts >= events[0].ts && selectFeatures.ts < linear[0].ts);
   } else {
    assert.equal(selectFeatures, undefined);
   }
  }
 } finally {
  fs.rmSync(tmp, {force:true, recursive:true});
 }
}

console.log('Useful-token training: fixed-target optimizer oracle, CPU trace, timing math and ZIP verified.');
