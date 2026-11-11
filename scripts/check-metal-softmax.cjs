/* Check the recorded GPU results without importing the Metal or Swift implementation. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'metal-softmax';
const folder = path.join(root, 'dist', 'labs', pack);
const sourceFiles = ['README.md', 'kernels.metal', 'metal_softmax.swift'];
const read = file => fs.readFileSync(path.join(folder, file));
const hashes = Object.fromEntries(sourceFiles.map(file => [
 file, createHash('sha256').update(read(file)).digest('hex'),
]));
const kernels = ['serial', 'group'];
const kernelKeys = [...kernels].sort();
const threads = 64;
const guardCount = 8;
const shapeList = [[3, 1], [5, 31], [7, 65], [9, 257], [1024, 64], [1024, 1025]];
const benchmarkShapes = shapeList.slice(-2);
const valueTolerance = 3e-6;
const rowSumTolerance = 3e-5;

function referenceRow(row, width) {
 if (row % 5 === 0) return Array(width).fill(1 / width);
 // A common +/-512 shift cancels. Integer quarter-units also avoid its influence on the oracle.
 const scores = Array.from({length: width}, (_, column) => (row * 17 + column * 13) % 61);
 const maximum = Math.max(...scores);
 const weights = scores.map(score => Math.exp((score - maximum) / 4));
 const sum = weights.reduce((total, value) => total + value, 0);
 return weights.map(weight => weight / sum);
}

function median(samples) {
 const sorted = [...samples].sort((a, b) => a - b);
 assert.equal(sorted.length % 2, 1);
 return sorted[Math.floor(sorted.length / 2)];
}

function close(actual, expected, tolerance = 1e-12 * Math.max(1, Math.abs(expected))) {
 assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  'expected ' + expected + ', got ' + actual);
}

function checkKernelOutputs(result, rows, width) {
 const elements = rows * width;
 assert.equal(result.checked, elements);
 assert.deepEqual(result.tail_guards, Array(guardCount).fill(-777));
 assert(Number.isFinite(result.max_abs_error) && result.max_abs_error >= 0 && result.max_abs_error <= valueTolerance);
 assert(Number.isFinite(result.max_row_sum_error) && result.max_row_sum_error >= 0 && result.max_row_sum_error <= rowSumTolerance);
 const probeIndexes = [...new Set([0, width - 1, width, width + Math.floor(width / 2), 2 * width - 1, elements - 1])].sort((a, b) => a - b);
 assert.deepEqual(result.probes.map(({index}) => index), probeIndexes);
 for (const {index, value} of result.probes) {
  const row = Math.floor(index / width), column = index % width;
  const expected = referenceRow(row, width)[column];
  assert(value >= 0 && value <= 1);
  close(value, expected, valueTolerance);
  assert(Math.abs(value - expected) <= result.max_abs_error + 1e-12,
   'a retained probe exceeds the reported maximum error at index ' + index);
 }
}

function checkBenchmark(benchmark) {
 assert.equal(benchmark.warmups_per_kernel, 3);
 assert.equal(benchmark.dispatches_per_command_buffer, 1);
 assert.equal(benchmark.pairs.length, 9);
 assert.deepEqual(Object.keys(benchmark.median_gpu_us).sort(), kernelKeys);
 assert.deepEqual(Object.keys(benchmark.range_gpu_us).sort(), kernelKeys);
 for (const [index, pair] of benchmark.pairs.entries()) {
  assert.deepEqual(pair.order, index % 2 ? [...kernels].reverse() : kernels);
  assert.deepEqual(Object.keys(pair.gpu_us).sort(), kernelKeys);
  for (const span of Object.values(pair.gpu_us)) assert(Number.isFinite(span) && span > 0);
 }
 for (const kernel of kernels) {
  const spans = benchmark.pairs.map(pair => pair.gpu_us[kernel]);
  close(benchmark.median_gpu_us[kernel], median(spans));
  assert.deepEqual(benchmark.range_gpu_us[kernel], {min: Math.min(...spans), max: Math.max(...spans)});
 }
}

function verify(record) {
 assert.equal(record.schema, 'infra-metal-softmax-v1');
 assert.equal(record.status, 'passed');
 assert.deepEqual(record.source_sha256, hashes);
 assert.equal(record.environment.metal_language, '3.0');
 assert.equal(record.environment.float_math, 'precise');
 assert.equal(typeof record.environment.unified_memory, 'boolean');
 assert(typeof record.environment.device === 'string' && record.environment.device.length > 0);
 assert(typeof record.environment.os === 'string' && record.environment.os.length > 0);
 assert.deepEqual(record.fixture, {dtype: 'float32', threads, tail_guard_count: guardCount});
 assert.deepEqual(Object.keys(record.resources).sort(), kernelKeys);
 for (const kernel of kernels) {
  const resource = record.resources[kernel];
  assert(Number.isInteger(resource.thread_execution_width) && resource.thread_execution_width > 0);
  assert(Number.isInteger(resource.max_threads_per_threadgroup) && resource.max_threads_per_threadgroup >= threads);
 }
 assert.equal(record.resources.serial.static_threadgroup_bytes, 0);
 assert.equal(record.resources.group.static_threadgroup_bytes, 2 * threads * 4);
 assert.deepEqual(record.validation.map(({rows, width}) => [rows, width]), shapeList);
 for (const {rows, width, kernels: results} of record.validation) {
  assert.deepEqual(Object.keys(results).sort(), kernelKeys);
  for (const kernel of kernels) checkKernelOutputs(results[kernel], rows, width);
 }
 assert.deepEqual(record.negative.input, [512, 512, 512]);
 const exponentials = record.negative.input.map(input => Math.fround(Math.exp(input)));
 const sum = exponentials.reduce((total, value) => Math.fround(total + value), 0);
 assert.equal(record.negative.non_finite, exponentials.filter(value => !Number.isFinite(value / sum)).length);
 assert.deepEqual(record.benchmarks.map(({rows, width}) => [rows, width]), benchmarkShapes);
 for (const benchmark of record.benchmarks) checkBenchmark(benchmark);
}

const record = JSON.parse(read('validation.json'));
verify(record);
assert.equal(record.environment.device, 'Apple M4 Pro');
assert(record.environment.unified_memory);
assert.match(record.environment.os, /^Version 26\.2\b/);
for (const mutate of [
 data => { data.validation[3].kernels.group.probes.at(-1).value += 1e-4; },
 data => { data.validation[3].kernels.group.tail_guards[guardCount - 1] = 0; },
 data => { data.validation[3].kernels.serial.max_row_sum_error = 0.001; },
 data => { data.validation[3].width++; },
 data => { data.negative.non_finite--; },
 data => { data.benchmarks[0].pairs[0].gpu_us.serial = 0; },
 data => { data.benchmarks[0].pairs[1].order = [...kernels]; },
 data => { data.benchmarks[1].median_gpu_us.group++; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered), assert.AssertionError);
}

if (process.argv[2]) verify(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
if (process.env.METAL_SOFTMAX_SWIFT) {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'metal-softmax-check-'));
 try {
  const output = execFileSync(process.env.METAL_SOFTMAX_SWIFT,
   ['-O', '-module-cache-path', temporary, 'metal_softmax.swift'],
   {cwd: folder, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024});
  verify(JSON.parse(output));
 } finally {
  fs.rmSync(temporary, {recursive: true, force: true});
 }
}

const archive = folder + '.zip';
const entries = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n').sort();
const files = [...sourceFiles, 'validation.json'];
assert.deepEqual(entries, files.map(file => pack + '/' + file).sort());
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', archive, pack + '/' + file]), read(file), file);

const page = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
const anchor = 'native-metal-softmax';
const article = page('article/operator-profiling');
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique Metal softmax heading');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-8">'));
const nextSection = article.indexOf('<section class="article-section" id="section-9">', start);
assert(nextSection > start);
const practice = article.slice(start, nextSection);
const figure = 'diagrams/metal-softmax-reduction.svg';
for (const target of [figure, 'labs/' + pack + '.zip', 'labs/' + pack + '/validation.json']) {
 assert(practice.includes(target), target);
}
const diagram = fs.readFileSync(path.join(root, 'dist', figure), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram), 'accessible reduction diagram');
const layout = JSON.parse(diagram.match(/<metadata>([^<]+)<\/metadata>/)[1]);
assert.equal(layout.record, 'labs/' + pack + '/validation.json');
assert(record.validation.some(({rows, width}) => rows === layout.rows && width === layout.width));
assert.equal(layout.threads, threads);
for (const [lane, columns] of Object.entries(layout.columns)) {
 const assigned = Array.from({length: layout.width}, (_, index) => index).filter(index => index % threads === Number(lane));
 assert.deepEqual(columns, assigned);
}
assert.equal(layout.maxima_bytes, threads * 4);
assert.equal(layout.sums_bytes, threads * 4);
assert.equal(layout.maxima_bytes + layout.sums_bytes, record.resources.group.static_threadgroup_bytes);

const shader = read('kernels.metal').toString('utf8');
const snippetStart = shader.indexOf('    maxima[lane] = local_max;');
const snippetEnd = shader.indexOf('\n\n', snippetStart);
assert(snippetStart >= 0 && snippetEnd > snippetStart);
const snippet = shader.slice(snippetStart, snippetEnd).split('\n').map(line => line.slice(4)).join('\n');
assert(practice.replaceAll('&lt;', '<').replaceAll('&gt;', '>').includes(snippet), 'inline reduction matches the real kernel');
for (const {rows, width, median_gpu_us, range_gpu_us} of record.benchmarks) {
 const cells = kernels.map(name => {
  const range = range_gpu_us[name];
  return median_gpu_us[name].toFixed(2) + '（' + range.min.toFixed(2) + '–' + range.max.toFixed(2) + '）';
 });
 assert(practice.includes('<tr><td>' + [rows + '×' + width, ...cells].join('</td><td>') + '</td></tr>'),
  'display the recorded median and range for each fixed input');
}
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-ai-native-metal-softmax">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes('/article/operator-profiling/#' + anchor), 'lab catalog anchor');
assert(page('roadmap/ai-operators').includes('/article/operator-profiling/?goal=ai-operators#' + anchor), 'operator roadmap anchor');
console.log('PASS: actual Metal softmax probes, tail guards, independent stability oracle and paired GPU statistics; exact source, archive and reading links.');
