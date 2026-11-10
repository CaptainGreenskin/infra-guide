/* Verify the recorded Apple GPU experiment without importing its Metal or Swift implementation. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'metal-gemm';
const folder = path.join(root, 'dist', 'labs', pack);
const files = ['README.md', 'kernels.metal', 'metal_gemm.swift', 'validation.json'];
const read = file => fs.readFileSync(path.join(folder, file));
const page = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
const hashes = Object.fromEntries(files.slice(0, -1).map(file => [file, createHash('sha256').update(read(file)).digest('hex')]));
const anchor = 'native-metal-gemm';
const kernels = ['naive', 'tiled'];
const tile = 16;
const guardCount = 8;
const benchmarkShape = [512, 512, 512];
const shapes = [[1, 1, 1], [17, 19, 13], [31, 33, 29], [32, 32, 32], [35, 67, 19], benchmarkShape];
const shapeKey = shape => shape.join('x');
const shapeFields = ([m, n, k]) => ({m, n, k});
const bytes = {naive: 0, tiled: 2 * tile * tile * 4};

function dotProduct([, n, k], index) {
 const row = Math.floor(index / n), col = index % n;
 let units = 0;
 for (let inner = 0; inner < k; inner++) {
  const a = (row * 3 + inner * 7 + 1) % 17 - 8;
  const b = (inner * 5 + col * 11 + 2) % 19 - 9;
  units += a * b;
 }
 return units / 256;
}

function oracle(shape) {
 const [m, n] = shape;
 const count = m * n;
 const probeIndexes = [...new Set([0, Math.floor(count / 2), count - 1])];
 return {checked: count, max_abs_error: 0, tail_guard_values: Array(guardCount).fill(-777),
  probes: probeIndexes.map(index => ({index, value: dotProduct(shape, index)}))};
}

function median(samples) {
 const sorted = [...samples].sort((a, b) => a - b);
 assert(sorted.length % 2 === 1);
 return sorted[(sorted.length - 1) / 2];
}

function close(actual, expected) {
 assert(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12 * Math.max(1, Math.abs(expected)),
  'expected ' + expected + ', got ' + actual);
}

function verify(record) {
 assert.equal(record.status, 'passed');
 assert.deepEqual(record.source_sha256, hashes);
 assert.equal(record.environment.metal_language, '3.0');
 assert.equal(record.environment.float_math, 'precise');
 assert.equal(typeof record.environment.unified_memory, 'boolean');
 assert(record.environment.device.length > 0 && record.environment.os.length > 0);
 assert.deepEqual(record.fixture, {dtype: 'float32', tail_guard_count: guardCount, threadgroup: [tile, tile]});
 assert.deepEqual(Object.keys(record.validation).sort(), shapes.map(shapeKey).sort());
 assert.deepEqual(Object.keys(record.resources).sort(), kernels);
 for (const kernel of kernels) {
  const resource = record.resources[kernel];
  assert.equal(resource.static_threadgroup_bytes, bytes[kernel]);
  assert(Number.isInteger(resource.thread_execution_width) && resource.thread_execution_width > 0);
  assert(Number.isInteger(resource.max_threads_per_threadgroup) && resource.max_threads_per_threadgroup >= tile * tile);
 }
 let checkedPerKernel = 0;
 for (const shape of shapes) {
  const row = record.validation[shapeKey(shape)];
  const expected = oracle(shape);
  assert.deepEqual(row.shape, shapeFields(shape));
  assert.deepEqual(Object.keys(row.kernels).sort(), kernels);
  for (const kernel of kernels) assert.deepEqual(row.kernels[kernel], expected, shapeKey(shape) + ' ' + kernel);
  checkedPerKernel += expected.checked;
 }
 assert.equal(checkedPerKernel, 266860);

 const bench = record.benchmark;
 assert.deepEqual(bench.shape, shapeFields(benchmarkShape));
 assert.equal(bench.warmups_per_kernel, 3);
 assert.equal(bench.dispatches_per_command_buffer, 1);
 assert.equal(bench.pairs.length, 9);
 assert.deepEqual(Object.keys(bench.median_gpu_us).sort(), kernels);
 assert.deepEqual(Object.keys(bench.range_gpu_us).sort(), kernels);
 for (const [index, pair] of bench.pairs.entries()) {
  assert.equal(pair.sample, index + 1);
  assert.deepEqual(pair.order, index % 2 ? [...kernels].reverse() : kernels);
  assert.deepEqual(Object.keys(pair.gpu_us).sort(), kernels);
  for (const span of Object.values(pair.gpu_us)) assert(Number.isFinite(span) && span > 0);
 }
 for (const kernel of kernels) {
  const spans = bench.pairs.map(pair => pair.gpu_us[kernel]);
  close(bench.median_gpu_us[kernel], median(spans));
  assert.deepEqual(bench.range_gpu_us[kernel], {min: Math.min(...spans), max: Math.max(...spans)});
 }
 close(bench.median_paired_naive_over_tiled, median(bench.pairs.map(({gpu_us: spans}) => spans.naive / spans.tiled)));
}

const record = JSON.parse(read('validation.json'));
verify(record);
assert.equal(record.environment.device, 'Apple M4 Pro');
assert(record.environment.unified_memory);
assert.match(record.environment.os, /^Version 26\.2\b/);
for (const mutate of [
 data => { data.validation['35x67x19'].kernels.tiled.probes[2].value += 1 / 256; },
 data => { data.validation['35x67x19'].kernels.tiled.tail_guard_values[7] = 0; },
 data => { data.validation['17x19x13'].shape.k++; },
 data => { data.benchmark.pairs[2].gpu_us.naive = 0; },
 data => { data.benchmark.pairs[1].order = [...kernels]; },
 data => { data.benchmark.median_gpu_us.tiled++; },
 data => { data.benchmark.median_paired_naive_over_tiled++; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered), assert.AssertionError);
}

if (process.argv[2]) verify(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
if (process.env.METAL_GEMM_SWIFT) {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'metal-gemm-check-'));
 try {
  const output = execFileSync(process.env.METAL_GEMM_SWIFT, ['-O', '-module-cache-path', temporary, 'metal_gemm.swift'],
   {cwd: folder, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024});
  // A new hardware run can have different absolute timings. Recompute its own statistics.
  verify(JSON.parse(output));
 } finally {
  fs.rmSync(temporary, {recursive: true, force: true});
 }
}

const archive = folder + '.zip';
const entries = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(file => pack + '/' + file));
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', archive, pack + '/' + file]), read(file), file);

const article = page('article/operator-profiling');
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique Metal lab heading');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-8">'));
assert(article.slice(section, start).includes('id="same-device-gemm"'), 'keeps the CUDA experiment adjacent');
const practice = article.slice(start, article.indexOf('<h3 id="native-python-extension"', start));
for (const target of ['diagrams/' + pack + '.svg', 'labs/' + pack + '.zip', 'labs/' + pack + '/validation.json']) {
 assert(practice.includes(target), target);
}
const knowledge = page('module/model-foundations').match(/<section class="knowledge-point" id="knowledge-mf-gpu">([\s\S]*?)<\/section>/)?.[1];
assert(knowledge?.includes('/article/operator-profiling/#' + anchor), 'AI domain entry');
assert(page('roadmap/ai-operators').includes('/article/operator-profiling/?goal=ai-operators#' + anchor));
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-ai-native-metal-gemm">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes('/article/operator-profiling/#' + anchor));
const diagram = fs.readFileSync(path.join(root, 'dist', 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram), 'accessible diagram title and description');
const metadata = diagram.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram binds its geometry to the recorded experiment');
const illustrated = [35, 67, 19];
const outputTiles = illustrated.slice(0, 2).map(length => Math.ceil(length / tile));
const validK = Array.from({length: Math.ceil(illustrated[2] / tile)}, (_, i) => Math.min(tile, illustrated[2] - i * tile));
assert.deepEqual(JSON.parse(metadata), {record: 'labs/' + pack + '/validation.json', tail_shape: illustrated,
 output_tiles: outputTiles, valid_k: validK, threadgroup_bytes: bytes});
console.log('PASS: actual Metal GEMM output probes, exact tail guards and paired GPU statistics, bound sources/archive and precise reading links.');
