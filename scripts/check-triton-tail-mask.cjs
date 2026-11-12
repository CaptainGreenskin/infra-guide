/* Independently check the raw interpreter outputs, negative control, and published assets. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.chdir(path.resolve(__dirname, '..'));

const dir = 'dist/labs/triton-tail-mask';
const zip = dir + '.zip';
const sourceFiles = ['requirements-linux.txt', 'triton_tail_mask.py'];
const read = file => fs.readFileSync(file);
const readJSON = file => JSON.parse(read(file));
const hash = file => createHash('sha256').update(read(file)).digest('hex');

function near(actual, expected, absolute, relative = 0) {
 assert(Number.isFinite(actual) && Math.abs(actual - expected) <= absolute + relative * Math.abs(expected),
  `Expected ${actual} near ${expected}`);
}

function expectedRows(width) {
 return [
  Array.from({length: width}, (_, i) => Math.fround(-(i + 1) * Math.log(2))),
  Array.from({length: width}, (_, i) => 1000 - i),
 ];
}

function verify(record) {
 assert.equal(record.schema, 'triton-tail-mask-v1');
 const {python, ...environment} = record.environment;
 assert.match(python, /^3\.12\.\d+$/);
 assert.deepEqual(environment, {
  system: 'Linux', machine: 'x86_64', triton: '3.3.1', torch: '2.7.1+cpu',
  numpy: '2.2.6', triton_interpret: '1', tensor_device: 'cpu', kernel_executor: 'InterpretedFunction',
 });
 assert.deepEqual(record.source_sha256, Object.fromEntries(sourceFiles.map(name => [name, hash(dir + '/' + name)])));
 assert.deepEqual(record.cases.map(({width, block, stride}) => [width, block, stride]), [[5, 8, 11], [8, 8, 11], [33, 64, 67]]);

 for (const entry of record.cases) {
  const {width, block, stride, variants} = entry;
  const rows = expectedRows(width);
  assert.deepEqual(entry.valid_lanes, Array.from({length: block}, (_, i) => i < width));
  assert.deepEqual(entry.input_rows, rows.map(row => row.concat(Array(stride - width).fill(123))));
  assert.equal(entry.output_padding_sentinel, -777);
  assert.deepEqual(Object.keys(variants), ['masked_negative_infinity', 'masked_zero']);

  for (const [name, variant] of Object.entries(variants)) {
   const {active_output, active_sum, logsumexp, output_padding} = variant;
   assert.deepEqual([active_output.length, active_sum.length, logsumexp.length], [2, 2, 2]);
   assert.deepEqual(output_padding, rows.map(() => Array(stride - width).fill(-777)));

   rows.forEach((row, i) => {
    const pads = name === 'masked_zero' ? block - width : 0;
    const maximum = Math.max(...row, pads ? 0 : -Infinity);
    const exponents = row.map(value => Math.exp(value - maximum));
    const padContribution = pads ? pads * Math.exp(-maximum) : 0;
    const denominator = exponents.reduce((sum, value) => sum + value, padContribution);
    assert.equal(active_output[i].length, width);
    active_output[i].forEach((actual, j) => near(actual, exponents[j] / denominator, 2e-7, 2e-6));
    near(active_sum[i], active_output[i].reduce((sum, value) => sum + value, 0), 1e-14);
    near(logsumexp[i], maximum + Math.log(denominator), 8e-5);
   });
  }

  const {masked_negative_infinity: correct, masked_zero: wrong} = variants;
  correct.active_sum.forEach(sum => near(sum, 1, 2e-6));
  if (width === block) assert.deepEqual(correct, wrong);
  else assert(wrong.active_sum[0] < 0.5);
 }

 const {masked_negative_infinity: correct, masked_zero: wrong} = record.cases[0].variants;
 near(correct.active_output[0][0], 16 / 31, 2e-6);
 near(wrong.active_output[0][0], 16 / 127, 2e-6);
 near(wrong.active_sum[0], 31 / 127, 2e-6);
}

const record = readJSON(dir + '/validation.json');
const proof = readJSON(dir + '/ci-record.json');
verify(record);
assert.equal(proof.scope, 'Official Triton CPU interpreter execution');
assert.equal(proof.repository, 'CaptainGreenskin/infra-guide');
assert.equal(proof.runner, 'ubuntu-24.04');
assert.equal(proof.workflow, '.github/workflows/triton-tail-mask.yml');
assert.equal(proof.artifact, 'native-triton-tail-mask');
assert.equal(proof.commit, '33331c06ff56e3b5de8d59ea5647216a393a6604');
assert.equal(proof.branch, 'evidence/triton-tail-mask-20261109');
assert.equal(proof.run_id, 42587107250);
assert.equal(proof.run_url, 'https://github.com/CaptainGreenskin/infra-guide/actions/runs/42587107250');
assert.equal(proof.artifact_id, 13659583638);
assert.equal(proof.artifact_sha256, 'e8dfefd2b8be026cc73d417561a9f5d36d754bc5a6409096874c756778f53c37');
assert.equal(proof.validation_sha256, hash(dir + '/validation.json'));

for (const mutate of [
 r => r.environment.tensor_device = 'cuda',
 r => r.environment.kernel_executor = 'JITFunction',
 r => r.source_sha256['triton_tail_mask.py'] = '0'.repeat(64),
 r => r.cases.pop(),
 r => r.cases[0].valid_lanes[7] = true,
 r => r.cases[0].input_rows[0][5] = 0,
 r => r.cases[0].variants.masked_zero = r.cases[0].variants.masked_negative_infinity,
 r => r.cases[0].variants.masked_zero.output_padding[0][0] = 0,
 r => r.cases[0].variants.masked_negative_infinity.active_output[0].reverse(),
 r => r.cases[1].variants.masked_zero.active_sum[0] = 0.3,
]) {
 const bad = structuredClone(record);
 mutate(bad);
 assert.throws(() => verify(bad), assert.AssertionError);
}

const members = ['README.md', 'ci-record.json', ...sourceFiles, 'validation.json'];
assert.deepEqual(execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n'),
 members.map(file => 'triton-tail-mask/' + file));
for (const file of members) assert.deepEqual(execFileSync('unzip', ['-p', zip, 'triton-tail-mask/' + file]), read(dir + '/' + file));

const figure = read('dist/diagrams/triton-tail-mask.svg').toString();
assert.deepEqual(JSON.parse(figure.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]), {
 width: 5, block: 8, valid: record.cases[0].valid_lanes,
 fill: ['-inf', '0'], first_output: ['16/31', '16/127'], active_sum: ['1', '31/127'],
});

const context = vm.createContext({});
for (const [, file] of read('src/page-shell.html').toString().matchAll(/<script defer src="([^"]+)"/g)) {
 if (file !== 'app.js') vm.runInContext(read('dist/' + file).toString(), context, {filename: file});
}
const lesson = vm.runInContext("articleById('operator-profiling')", context);
const section = lesson.sections[7][1];
const anchor = '<h3 id="triton-tail-mask-run">';
assert(section.includes(anchor));
const suffix = section.slice(section.indexOf(anchor));
for (const target of ['diagrams/triton-tail-mask.svg', 'labs/triton-tail-mask.zip', 'labs/triton-tail-mask/triton_tail_mask.py',
 'labs/triton-tail-mask/README.md', 'labs/triton-tail-mask/validation.json']) {
 assert(suffix.includes('href="' + target + '"'), target);
}
assert.match(suffix, /官方 CPU 解释器/);
assert.match(suffix, /GPU 访存安全和计时需要目标设备上的证据/);
assert.match(suffix, /没有任何可读键[^<]*−∞−\(−∞\)[^<]*NaN/);
assert(suffix.includes('href="/article/flash-attention-io/#native-metal-empty-attention-row"'));

if (process.env.TRITON_TAIL_PYTHON) {
 const replay = JSON.parse(execFileSync(process.env.TRITON_TAIL_PYTHON, ['-B', dir + '/triton_tail_mask.py'], {
  encoding: 'utf8', env: {...process.env, TRITON_INTERPRET: '1'},
 }));
 verify(replay);
}
console.log('PASS: Triton CPU interpreter, 3 widths, independent row-wise oracle, tail writes and zero-padding control, 10 rejected mutations, exact ZIP and lesson anchor.');
