/* Validate the archived native ring evidence without needing PyTorch in site CI. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.chdir(path.resolve(__dirname, '..'));
const folder = 'dist/labs/ragged-ring';
const read = file => fs.readFileSync(file, 'utf8');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const evidence = JSON.parse(read(`${folder}/validation.json`));
assert.equal(evidence.schema, 1);
assert.equal(evidence.status, 'passed');
assert.equal(evidence.python, '3.12.13');
assert.deepEqual(evidence.source_sha256, {
  'ring_ragged.py': sha(`${folder}/ring_ragged.py`),
  'record.py': sha(`${folder}/record.py`),
});

const specifications = [
  {name: 'two-ranks', counts: [512, 513], mask: true},
  {name: 'three-ranks', counts: [512, 512, 513], mask: true},
  {name: 'unmasked-padding', counts: [512, 513], mask: false},
];
const errorFields = ['loss', 'output', 'projection_gradients', 'updated_weights', 'weight_gradients'];
const tolerance = 1e-10;

function checkCase(test, spec) {
  const {counts, mask} = spec;
  const world = counts.length;
  const positions = counts.reduce((a, b) => a + b);
  const rowsOnWire = Math.max(...counts);
  const headers = [];
  let start = 0;
  for (const [rank, count] of counts.entries()) {
    headers.push([rank, start, count]);
    start += count;
  }
  assert.equal(test.name, spec.name);
  assert.equal(test.launcher_exit_code, mask ? 0 : 1);
  const result = test.result;
  assert.equal(result.source_sha256, evidence.source_sha256['ring_ragged.py']);
  assert.deepEqual([result.torch, result.device, result.backend, result.dtype], ['2.5.1', 'cpu', 'gloo', 'float64']);
  assert.deepEqual([result.world_size, result.positions, result.width, result.learning_rate, result.tolerance],
    [world, positions, 16, 0.1, tolerance]);
  assert.deepEqual(result.header_fields, ['owner', 'start', 'count']);
  assert.equal(result.mask_padding, mask);
  assert.equal(result.ranks.length, world);
  const reasons = [];
  for (const [rank, row] of result.ranks.entries()) {
    const [, first, count] = headers[rank];
    assert.equal(row.rank, rank);
    assert.deepEqual(row.positions, [first, first + count]);
    assert.equal(row.wire_rows, rowsOnWire);
    assert.equal(row.padding_rows, rowsOnWire - count);
    const ringOrder = Array.from({length: world}, (_, hop) => headers[(rank + world - hop) % world]);
    assert.deepEqual(row.forward_headers, ringOrder);
    assert.deepEqual(row.backward_headers, ringOrder);
    assert.deepEqual(row.returned_header, headers[rank], 'final packet belongs to the local rank');
    assert.deepEqual(Object.keys(row.errors).sort(), errorFields);
    for (const [metric, error] of Object.entries(row.errors)) {
      assert(Number.isFinite(error) && error >= 0);
      if (error > tolerance) reasons.push(`${rank}:${metric}`);
    }
    const padGrad = row.padding_gradient_max_abs;
    assert(Number.isFinite(padGrad) && padGrad >= 0);
    if (padGrad !== 0) reasons.push(`${rank}:padding_gradient`);
    assert(Number.isFinite(row.drop_remote_dkv_max_abs_error) && row.drop_remote_dkv_max_abs_error > 1e-6);
  }
  assert.deepEqual(result.reasons.map(x => `${x.rank}:${x.metric}`).sort(), reasons.sort());
  assert.equal(result.status, reasons.length ? 'rejected' : 'passed');
  if (mask) {
    assert.deepEqual(reasons, []);
  } else {
    assert(result.ranks[0].errors.output <= tolerance, 'rank 0 cannot read its own future padding');
    assert(result.ranks[1].errors.output > 1e-5, 'padding becomes visible to rank 1 without the validity test');
    assert(result.ranks[0].padding_gradient_max_abs > 1e-6, 'the padded row receives a false remote gradient');
    assert(result.ranks[0].errors.weight_gradients > 1e-8);
  }
}

assert.equal(evidence.cases.length, specifications.length);
evidence.cases.forEach((test, index) => checkCase(test, specifications[index]));
const wrongOwner = structuredClone(evidence.cases[0]);
wrongOwner.result.ranks[1].returned_header = [0, 0, 512];
assert.throws(() => checkCase(wrongOwner, specifications[0]), /final packet belongs to the local rank/);

const svg = read('dist/diagrams/ragged-ring-layout.svg');
const diagram = JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]);
assert.deepEqual(diagram.position_ranges_half_open, [[0, 2], [2, 5]]);
assert.equal(diagram.wire_rows, 3);
assert.equal(diagram.query_position, 2);
const wire = diagram.position_ranges_half_open.flatMap(([from, to]) =>
  Array.from({length: diagram.wire_rows}, (_, row) => ({position: from + row, valid: from + row < to})));
const causal = wire.filter(x => x.position <= diagram.query_position);
const visible = causal.filter(x => x.valid);
assert.deepEqual(diagram.visible_positions, visible.map(x => x.position));
assert.deepEqual(diagram.real_values, [2, 4, 6]);
assert.equal(diagram.padding_value, 0);
const numerator = diagram.real_values.reduce((a, b) => a + b);
assert.equal(diagram.masked_output, numerator / visible.length);
assert.equal(diagram.unmasked_output, numerator / causal.length);
assert.deepEqual(diagram.runtime_shapes, {'1025': specifications[0].counts, '1537': specifications[1].counts});

const context = vm.createContext({});
for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file !== 'app.js') vm.runInContext(read(`dist/${file}`), context, {filename: file});
}
const sections = JSON.parse(vm.runInContext(`JSON.stringify({
  flash: articles.find(a => a.id === 'flash-attention-io').sections[7][1],
  training: articles.find(a => a.id === 'training-communication').sections[5][1]
})`, context));
const prior = sections.flash.indexOf('id="ring-context-training"');
const ragged = sections.flash.indexOf('id="ragged-ring-training"');
assert(prior >= 0 && ragged > prior);
for (const link of ['ragged-ring-layout.svg', '/labs/ragged-ring.zip', '/labs/ragged-ring/validation.json',
  '/article/training-communication/#ragged-ring-communication']) assert(sections.flash.slice(ragged).includes(link), link);
assert(sections.training.includes('id="ragged-ring-communication"'));
assert(sections.training.includes('/article/flash-attention-io/#ragged-ring-training'));

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
folder = Path('dist/labs/ragged-ring')
names = ['README.md', 'record.py', 'ring_ragged.py', 'validation.json']
with ZipFile(folder.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == names, 'missing, duplicate, or unexpected archive entry'
    assert archive.testzip() is None
    for name in names:
        assert archive.read(name) == (folder / name).read_bytes(), name
`]);
console.log('PASS: native Gloo uneven shards, observed packet owners, rejected padding and owner controls, original teaching links, source hashes and exact ZIP.');
