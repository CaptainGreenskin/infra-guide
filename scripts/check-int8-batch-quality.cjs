/* Independently check the output oracle, timing gate and frozen lesson evidence. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/int8-batch-quality';
const folder = path.join(root, pack);
const source = 'int8_batch_quality.py';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex');
const record = JSON.parse(read(pack + '/validation.json'));
const features = {target:[1, 0], regular:[0, 8], outlier:[0, 1024]};
const settings = {
 singleton:{rows:['target'], mode:'together'},
 regular_batch:{rows:['target', 'regular'], mode:'together'},
 outlier_batch:{rows:['target', 'outlier'], mode:'together'},
 outlier_split:{rows:['target', 'outlier'], mode:'split'},
};

function closeEnough(actual, expected, error=0.0002) {
 assert(Number.isFinite(actual) && Math.abs(actual - expected) <= error, `expected ${expected}, got ${actual}`);
}

function checkRecord(data) {
 assert.equal(data.status, 'passed');
 assert.deepEqual(data.source_sha256, {[source]:sha(source), 'requirements.txt':sha('requirements.txt')});
 assert.match(data.environment.torch, /^2\.5\.1(?:\+[a-z0-9._-]+)?$/);
 assert.equal(data.environment.backend, 'qnnpack');
 assert.equal(data.environment.intraop_threads, 1);
 assert.equal(data.environment.interop_threads, 1);
 assert.deepEqual(data.fixture, {
  shape:[256, 256], nonzero_weights:[[1, 0, 1], [2, 1, 1]],
  first_two_input_features:features, remaining_input_features:'all zero',
 });
 assert.equal(data.weights.float_dtype, 'torch.float32');
 assert.equal(data.weights.quantized_dtype, 'torch.qint8');
 assert.equal(data.weights.quantized_zero_point, 0);
 closeEnough(data.weights.quantized_scale, 2 / 255, 0.0000001);
 assert.equal(data.profile.case, 'regular_batch');
 assert(data.profile.operators.includes('quantized::linear_dynamic'));
 assert(data.profile.operators.includes('aten::quantize_per_tensor'));
 assert.deepEqual(Object.keys(data.cases), Object.keys(settings));

 for (const [name, {rows, mode}] of Object.entries(settings)) {
  const actual = data.cases[name];
  const inputs = rows.map(row => features[row]);
  const fp32Scores = inputs.map(row => [0, ...row]);
  const classification = scores => scores.indexOf(Math.max(...scores));
  const expectedLabels = fp32Scores.map(classification);
  const quantize = (value, maximum) => Math.round(value * 255 / maximum) * maximum / 255;
  const batchMax = Math.max(...inputs.flat());
  const int8Scores = inputs.map(row => {
   const maximum = mode === 'together' ? batchMax : Math.max(...row);
   return [0, ...row.map(value => quantize(value, maximum) * 127 * data.weights.quantized_scale)];
  });
  assert.deepEqual(actual.rows, rows);
  assert.equal(actual.execution, mode);
  assert.deepEqual(actual.forward_batch_sizes, mode === 'split' ? [1, 1] : [rows.length]);
  assert.deepEqual(actual.expected_labels, expectedLabels);

  for (const [engine, expected] of Object.entries({fp32:fp32Scores, int8:int8Scores})) {
   const observed = actual[engine];
   assert.equal(observed.other_columns_abs_max, 0);
   assert.equal(observed.scores_0_to_2.length, expected.length);
   assert.deepEqual(observed.labels, expected.map(classification));
   for (const [i, row] of expected.entries()) {
    assert.equal(observed.scores_0_to_2[i].length, row.length);
    row.forEach((score, j) => closeEnough(observed.scores_0_to_2[i][j], score));
   }
   const correct = observed.labels.filter((label, i) => label === expectedLabels[i]).length;
   assert.equal(observed.correct, correct);
   assert.equal(observed.passed, correct === expectedLabels.length);
  }
 }

 assert.deepEqual(Object.keys(data.timings), ['singleton', 'regular_batch', 'outlier_batch']);
 for (const [name, trace] of Object.entries(data.timings)) {
  const result = data.cases[name];
  if (!result.fp32.passed || !result.int8.passed) {
   assert.equal(trace, null);
   continue;
  }
  assert.deepEqual(trace.input_shape, [result.rows.length, 256]);
  assert.equal(trace.warmup_calls_per_engine, 80);
  assert.equal(trace.calls_per_sample, 400);
  assert.equal(trace.samples.length, 12);
  for (const [index, sample] of trace.samples.entries()) {
   assert.deepEqual(sample.order, index % 2 === 0 ? ['fp32', 'int8'] : ['int8', 'fp32']);
   assert.deepEqual(Object.keys(sample.duration_ns), sample.order);
   assert(Object.values(sample.duration_ns).every(duration => Number.isSafeInteger(duration) && duration > 0));
  }
  for (const name of ['fp32', 'int8']) {
   const samples = trace.samples.map(sample => sample.duration_ns[name]).sort((a, b) => a - b);
   const denominator = trace.calls_per_sample * 1000;
   closeEnough(trace.summary[name].p50_us_per_call, (samples[5] + samples[6]) / (2 * denominator), 0.00000051);
   closeEnough(trace.summary[name].p90_us_per_call, samples[10] / denominator, 0.00000051);
  }
 }
}

checkRecord(record);
for (const mutation of [
 data => {data.cases.outlier_batch.int8.scores_0_to_2[0][1] = 1;},
 data => {data.cases.outlier_batch.int8.labels[0] = 1;},
 data => {data.cases.outlier_split.forward_batch_sizes = [2];},
 data => {data.timings.outlier_batch = data.timings.regular_batch;},
 data => {data.timings.singleton.samples[1].order.reverse();},
 data => {data.timings.regular_batch.summary.int8.p50_us_per_call = 0;},
 data => {data.source_sha256[source] = '0'.repeat(64);},
]) {
 const invalid = structuredClone(record);
 mutation(invalid);
 assert.throws(() => checkRecord(invalid), assert.AssertionError);
}

const svg = read('dist/diagrams/int8-batch-quality.svg');
const variants = ['singleton', 'regular_batch', 'outlier_batch'];
const maxima = variants.map(name => Math.max(...record.cases[name].rows.flatMap(row => features[row])));
assert.match(svg, /aria-labelledby="title desc"/);
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record:'labs/int8-batch-quality/validation.json',
 target_feature:features.target[0],
 input_maxima:maxima,
 estimated_target_codes:maxima.map(maximum => Math.round(features.target[0] * 255 / maximum)),
 target_labels:variants.map(name => record.cases[name].int8.labels[0]),
 split_labels:record.cases.outlier_split.int8.labels,
});

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys

folder = Path(sys.argv[1])
names = sorted(folder.name + '/' + member.name for member in folder.iterdir() if member.is_file())
with ZipFile(folder.with_suffix('.zip')) as archive:
    assert archive.namelist() == names
    for name in names:
        assert archive.read(name) == (folder / Path(name).name).read_bytes()
`, folder], {timeout:10000});

const authorFile = 'dist/progressive-quantization-delivery-reading.js';
const authorAt = commit => execFileSync('git', ['show', commit + ':' + authorFile], {cwd:root, encoding:'utf8'});
const previous = authorAt('c5ec649ee081dfa7a37598e0e7728411301e456c');
const published = authorAt('d9f3726b006561045cb3892e418586ccd3ce6ab8');
const bounds = author => {
 const start = author.indexOf(" const batchQuality = articles.find(a=>a.id==='quantization-serving');");
 const end = author.indexOf(" rewrite('ai-lifecycle',8,old=>[", start);
 assert(start >= 0 && end > start);
 return [start,end];
};
const [publishedStart,publishedEnd] = bounds(published);
// Preserve the original publication's exact scope; the neighboring rollout lesson evolves separately.
assert.equal(published.slice(0,publishedStart) + published.slice(publishedEnd),previous);
const author = read(authorFile);
const [start,end] = bounds(author);
const unit = author.slice(start,end);
assert.equal(unit,published.slice(publishedStart,publishedEnd),'preserve the signed INT8 experiment text');
assert.match(unit, /batchQuality\.sections\[4\]\[1\]\+=/);
assert.match(unit, /id="native-int8-batch-quality"/);
assert(unit.includes("trainingFigure('int8-batch-quality'"));
for (const path of ['.zip', '/' + source, '/README.md', '/validation.json']) {
 assert(unit.includes('href="labs/int8-batch-quality' + path + '"'));
}
for (const name of ['singleton', 'regular_batch']) {
 for (const engine of ['fp32', 'int8']) {
  assert(unit.includes(record.timings[name].summary[engine].p50_us_per_call.toFixed(2) + ' 微秒'));
 }
}

const python = process.env.INT8_BATCH_QUALITY_PYTHON;
if (python) {
 const fresh = JSON.parse(execFileSync(python, ['-B', path.join(folder, source)], {
  cwd:root, encoding:'utf8', timeout:30000, stdio:['ignore', 'pipe', 'pipe'],
 }));
 checkRecord(fresh);
}
console.log('PASS: native QNNPACK same-row batch quality, independent integer and classification oracle, gated paired timing, seven rejected controls, SVG/ZIP/source and exact lesson preservation.' + (python ? ' Fresh CPU replay verified.' : ''));
