/* Verify the frozen Metal empty-row record without needing a GPU in Pages CI. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(__dirname,'..','dist');
const lab = name => path.join(dist,'labs',name);
const base = lab('metal-online-attention');
const folder = lab('metal-empty-attention-row');
const read = (directory,name) => fs.readFileSync(path.join(directory,name),'utf8');
const hashes = (directory,names) => Object.fromEntries(names.map(name =>
 [name,digest(fs.readFileSync(path.join(directory,name)))]));
const digest = data => createHash('sha256').update(data).digest('hex');

const baseHashes = {
 'online_attention.swift':'7ed0cf2fb8c675ad0dbd3745ebe2928fc3830f2d00b54b9c038f414ac54670b1',
 'kernels.metal':'3d99be69b943a9235686a5d498135e6c01220e4c9c44eb5c84f76aa5747ea849',
 'validation.json':'e92361ecf20f0e0a063801913c17b1ec88eaf45ae4b4dd26a7fc0ac67a2f7285',
};
assert.deepEqual(hashes(base,Object.keys(baseHashes)),baseHashes);
const sourceHashes = hashes(folder,['empty_row.py','empty_row.swift']);
const published = JSON.parse(read(base,'validation.json'));
const [helpers,driver] = read(base,'online_attention.swift').split('func run() throws -> [String: Any] {');
const fixtureSource = driver.slice(driver.indexOf('    let scores = '),driver.indexOf('    let input = try'));
const composedDriver = helpers + 'func emptyRowFixture() -> ([Float], [Float]) {\n' +
 fixtureSource + '    return (scores, values)\n}\n\n' + read(folder,'empty_row.swift');
const kernel = read(base,'kernels.metal');
const writes = 'result[i + 4] = weighted.x / denominator;\n    result[i + 5] = weighted.y / denominator;';
assert.equal(kernel.split(writes).length,2);
const guardedWrites = writes.replaceAll('= weighted','= denominator == 0.0f ? 0.0f : weighted');
const guardedHash = digest(kernel.replace(writes,guardedWrites));

const {length,peak_index:peak,prefixes:positivePrefixes} = published.fixture;
const widths = [128,257];
const emptyStats = ['-inf',0,0,0];
const tail = Array(4).fill(-777);

function dense(prefix) {
 const scores = Array.from({length:prefix},(_,i) => i === peak ? 36 : ((i*13)%19-9)/4);
 const maximum = Math.max(...scores);
 let denominator = 0, x = 0, y = 0;
 for (const [i,score] of scores.entries()) {
  const [vx,vy] = i === peak ? [7,-3] : [((i*5)%23-11)/8,((i*7)%29-14)/8];
  const weight = Math.exp(score-maximum);
  denominator += weight;
  x += weight*vx;
  y += weight*vy;
 }
 return [maximum,denominator,x,y,x/denominator,y/denominator];
}

function compare(actual,expected,tolerance) {
 assert.equal(actual.length,expected.length);
 actual.forEach((value,index) => {
  const wanted = expected[index];
  assert(Number.isFinite(value) && Math.abs(value-wanted) <= tolerance * Math.max(1,Math.abs(wanted)),
   'field ' + index + ' differs: ' + value + ' vs ' + wanted);
 });
}

function verify(record,frozen) {
 assert.equal(record.schema,'infra-metal-empty-attention-row-v1');
 assert.equal(record.status,'passed');
 assert.match(record.environment.device,frozen ? /^Apple M4 Pro$/ : /^Apple /);
 assert.match(record.environment.os,/^Version \d+\./);
 assert.equal(record.environment.metal_language,'3.0');
 assert.equal(record.environment.float_math,'precise');
 assert.deepEqual(record.fixture,{length,peak_index:peak,prefixes:[0,...positivePrefixes],
  value_width:2,output_guard_count:4,output_sentinel:-777});
 assert.deepEqual(record.base_sha256,baseHashes);
 assert.deepEqual(record.source_sha256,sourceHashes);
 assert.equal(record.composed_swift_sha256,digest(composedDriver));
 assert.equal(record.guarded_kernel_sha256,guardedHash);
 assert.deepEqual(record.cases.map(item => item.tile_width),widths);
 for (const item of record.cases) {
  const count = Math.ceil(length/item.tile_width);
  assert.equal(item.tiles_per_query,count);
  assert.deepEqual(item.empty_tiles,Array(count).fill(emptyStats));
  assert.deepEqual(item.original_empty,[...emptyStats,'nan','nan']);
  assert.deepEqual(item.guarded_empty,[...emptyStats,0,0]);
  assert.deepEqual(item.original_tail_guards,tail);
  assert.deepEqual(item.guarded_tail_guards,tail);
  assert.deepEqual(item.positive_rows.map(row => row.prefix),positivePrefixes);
  const oldQueries = published.cases.find(old => old.tile_width === item.tile_width).queries;
  for (const row of item.positive_rows) {
   const expected = dense(row.prefix);
   assert.equal(row.same_bits,true);
   assert.deepEqual(row.guarded,row.original);
   compare(row.dense_reference,expected,1e-12);
   compare(row.guarded,expected,1e-5);
   compare(row.guarded.slice(4),expected.slice(4),1e-8);
   const original = oldQueries.find(query => query.prefix === row.prefix).output;
   const difference = Math.max(...original.map((value,index) => Math.abs(value-row.guarded[index+4])));
   assert.equal(row.published_max_abs_difference,difference);
   assert(difference <= (frozen ? 0 : 1e-5),'nonempty output differs from old run');
  }
 }
}

verify(JSON.parse(read(folder,'validation.json')),true);
if (process.argv[2]) verify(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),false);
const archive = folder + '.zip';
const expectedEntries = [folder + '/README.md',folder + '/empty_row.py',folder + '/empty_row.swift',
 folder + '/validation.json',...Object.keys(baseHashes).map(name => path.join(base,name))];
const entryName = file => path.relative(path.join(dist,'labs'),file).split(path.sep).join('/');
const entries = execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n');
assert.deepEqual(entries,expectedEntries.map(entryName).sort());
for (const file of expectedEntries) {
 assert.deepEqual(execFileSync('unzip',['-p',archive,entryName(file)]),fs.readFileSync(file),entryName(file));
}
const author = read(dist,'progressive-gpu-compute-reading.js');
const previous = author.indexOf('id="native-metal-online-attention"');
const start = author.indexOf('id="native-metal-empty-attention-row"');
const end = author.indexOf("contextLesson.updated=",start);
assert(previous >= 0 && author.indexOf('</details>',previous) < start && end > start);
const explanation = author.slice(start,end);
for (const name of ['README.md','validation.json','empty_row.swift']) {
 assert(explanation.includes('/labs/metal-empty-attention-row/' + name));
}
assert(explanation.includes('17 和 8 个空块'));
assert(explanation.includes('[NaN,NaN]') && explanation.includes('[0,0]'));
assert(explanation.includes('六个 FP32 字段按位一致'));
assert(explanation.includes('href="/article/operator-profiling/#triton-tail-mask-run"'));
assert(explanation.includes('减最大值前的五项指数之和是 31/32'));
for (const field of ['empty_tiles','original_empty','guarded_empty','positive_rows']) {
 assert(explanation.includes('<code>'+field+'</code>'), 'read the relevant field in the recorded run');
}
console.log('Metal empty attention row: source and dense oracle verified; both positive rows match.');
