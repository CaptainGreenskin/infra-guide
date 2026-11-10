/* Independently verify native load traces and separate compiled CUDA from device execution. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/warp-memory-sectors';
const folder = path.join(root, pack);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const span = 32;
const laneIndices = Array.from({length:span}, (_, i) => i);
const word = 4;
const sector = 32;
const element = i => (i * 7 + 3) % 1021;
const total = list => list.reduce((a, b) => a + b, 0);

function distinctSectors(offsets) {
 const active = offsets.filter(offset => offset !== null);
 const bytes = active.flatMap(offset => Array.from({length:word}, (_, i) => offset + i));
 return [...new Set(bytes.map(address => Math.floor(address / sector)))].sort((a, b) => a - b);
}

function expectGroup(group, indexes) {
 const offsets = laneIndices.map(lane => lane < indexes.length ? indexes[lane] * word : null);
 assert.deepEqual(group.offset_bytes, offsets);
 assert.deepEqual(group.sectors, distinctSectors(offsets));
 assert.equal(group.load_sum, total(indexes.map(element)));
}

function check(record) {
 assert.equal(record.status, 'passed');
 assert.equal(record.device_execution, false);
 assert.deepEqual(record.source_sha256, Object.fromEntries(['address_trace.c', 'run_trace.py']
  .map(file => [file, sha(pack + '/' + file)])));
 assert.deepEqual(record.environment.flags, ['-std=c17', '-O2', '-Wall', '-Wextra', '-Werror', '-pedantic']);
 assert(record.environment.compiler.length > 0);
 assert.equal(record.trace.base_mod_sector, 0);
 const examples = record.trace.examples;
 assert.deepEqual(Object.keys(examples), ['aligned', 'offset_by_one', 'column', 'seven_lanes']);
 expectGroup(examples.aligned, laneIndices);
 expectGroup(examples.offset_by_one, laneIndices.map(i => i + 1));
 expectGroup(examples.column, laneIndices.map(i => i * span));
 expectGroup(examples.seven_lanes, laneIndices.slice(0, 7));
 assert.deepEqual(Object.values(examples).map(group => group.sectors.length), [4, 5, 32, 1]);

 const traversals = record.trace.traversals;
 assert.deepEqual(Object.keys(traversals), ['rows', 'columns']);
 for (const [direction, traversal] of Object.entries(traversals)) {
  assert.equal(traversal.groups.length, span);
  for (const [group, actual] of traversal.groups.entries()) {
   const indexes = direction === 'rows'
    ? laneIndices.map(lane => group * span + lane)
    : laneIndices.map(lane => lane * span + group);
   expectGroup(actual, indexes);
  }
  const offsets = traversal.groups.flatMap(group => group.offset_bytes).sort((a, b) => a - b);
  assert.deepEqual(offsets, Array.from({length:span * span}, (_, i) => i * word));
  assert.equal(traversal.per_group_sector_sum, total(traversal.groups.map(group => group.sectors.length)));
  assert.equal(traversal.sector_union_count, distinctSectors(offsets).length);
  assert.equal(total(traversal.groups.map(group => group.load_sum)), record.trace.copy_sum);
 }
 assert.deepEqual(Object.values(traversals).map(t => t.per_group_sector_sum), [128, 1024]);
 assert.deepEqual(Object.values(traversals).map(t => t.sector_union_count), [128, 128]);
 assert.equal(record.trace.copied_elements, span * span);
 assert.equal(record.trace.copy_sum, total(Array.from({length:span * span}, (_, i) => element(i))));
}

const record = JSON.parse(read(pack + '/validation.json'));
check(record);
for (const corrupt of [
 data => {data.device_execution = true;},
 data => {data.trace.base_mod_sector = 4;},
 data => {data.trace.examples.offset_by_one.sectors.pop();},
 data => {data.trace.examples.seven_lanes.offset_bytes[7] = 28;},
 data => {data.trace.traversals.columns.groups[0].offset_bytes[1] = 4;},
 data => {data.trace.traversals.columns.per_group_sector_sum = 128;},
 data => {data.trace.traversals.columns.sector_union_count = 1024;},
 data => {data.source_sha256['address_trace.c'] = '0'.repeat(64);},
]) {
 const altered = structuredClone(record);
 corrupt(altered);
 assert.throws(() => check(altered), assert.AssertionError);
}
if (process.argv[2]) check(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));

const cuda = 'dist/labs/cuda-core/';
const compile = JSON.parse(read(cuda + 'compile-record.json'));
const device = JSON.parse(read(cuda + 'device-probe.json'));
assert.equal(compile.compilation.status, 'passed');
assert.equal(compile.compilation.ptx.target, 'compute_80');
assert.equal(compile.compilation.ptx.sha256, sha(cuda + 'cuda_lab.ptx'));
assert.equal(compile.core_sha256['cuda_lab.cu'], sha(cuda + 'cuda_lab.cu'));
assert.equal(compile.device_execution, false);
assert.equal(compile.device_probe.status, 'not-run');
assert.equal(device.status, 'not-run');
assert.equal(device.device_execution, false);
assert.match(read(cuda + 'cuda_lab.cu'), /int row = blockIdx\.x, lane = threadIdx\.x;[\s\S]*?col \+= SUM_THREADS[\s\S]*?static_cast<size_t>\(row\) \* cols \+ col/);
const sumKernel = read(cuda + 'cuda_lab.ptx').split('.visible .entry row_sum_kernel(')[1].split('.visible .entry')[0];
assert.match(sumKernel, /mov\.u32\s+%r2, %tid\.x;[\s\S]*?mul\.lo\.s64\s+%rd12, %rd2, %rd3;\s+cvt\.s64\.s32\s+%rd13, %r2;\s+add\.s64\s+%rd14, %rd12, %rd13;\s+shl\.b64\s+%rd15, %rd14, 2;\s+add\.s64\s+%rd23, %rd1, %rd15;[\s\S]*?ld\.global\.f32\s+%f12, \[%rd23\];[\s\S]*?add\.s64\s+%rd23, %rd23, 1024;/);

const svg = read('dist/diagrams/warp-memory-sectors.svg');
assert.match(svg, /aria-labelledby="title desc"/);
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record:'labs/warp-memory-sectors/validation.json',
 examples:Object.values(record.trace.examples).map(group => group.sectors.length),
 group_sums:Object.values(record.trace.traversals).map(group => group.per_group_sector_sum),
 unions:Object.values(record.trace.traversals).map(group => group.sector_union_count),
});
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

const authorFile = 'dist/progressive-gpu-compute-reading.js';
const author = read(authorFile);
const previous = execFileSync('git', ['show', 'fcd0d183447ee904caef1c87d24b890267efcabc:' + authorFile],
 {cwd:root, encoding:'utf8'});
const published = execFileSync('git', ['show', 'fcd5db2ea4ae3635b8191f1d5531d3dc24cf96f4:' + authorFile],
 {cwd:root, encoding:'utf8'});
const publishedStart = published.indexOf("\n const warpMemory=articles.find(a=>a.id==='gpu-execution');");
assert(publishedStart > 0);
assert.equal(published.slice(0, publishedStart) + '})();\n', previous);
const lessonStart = '\n warpMemory.sections[3][1]+=';
const start = author.indexOf(lessonStart);
assert(start > 0 && author.endsWith('})();\n'));
const lesson = author.slice(start);
assert.equal(lesson, published.slice(published.indexOf(lessonStart)), 'the published lab and its links are retained');
assert.match(lesson, /warpMemory\.sections\[3\]\[1\]\+=/);
assert.match(lesson, /id="native-warp-memory-sectors"/);
assert.match(lesson, /trainingFigure\('warp-memory-sectors'/);
for (const link of ['.zip', '/address_trace.c', '/README.md', '/validation.json']) {
 assert(lesson.includes('href="labs/warp-memory-sectors' + link + '"'));
}
for (const link of ['cuda_lab.ptx', 'compile-record.json']) {
 assert(lesson.includes('href="labs/cuda-core/' + link + '"'));
}

console.log('Warp memory sectors: real C loads, independent address oracle, PTX scope and ZIP verified.');
