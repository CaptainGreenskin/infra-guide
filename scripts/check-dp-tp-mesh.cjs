/* Verify the recorded mesh update with a standalone scalar chain rule. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');

const pack = 'dp-tp-mesh';
const folder = 'dist/labs/' + pack;
const archive = folder + '.zip';
const files = ['README.md', 'dp_tp_mesh.py', 'requirements.txt', 'validation.json'];
const read = file => fs.readFileSync(folder + '/' + file);
const record = JSON.parse(read('validation.json'));
const inputs = [[1, 2], [2, 1], [-1, 3]];
const targets = [[3, -1], [8, 9], [7, 4]];
const mesh = [[0, 1], [2, 3]];
const rowsByReplica = [[0], [1, 2]];
const learningRate = 1 / 8;
const initial = {
 'w.weight': [[1, 0], [0, 1], [2, 0], [0, 2]],
 'u.weight': [[1, 0, 1, 2], [0, 1, 1, 0]],
 'u.bias': [1, 1],
};
const keys = Object.keys(initial);
const sum = values => values.reduce((total, value) => total + value, 0);
const dot = (left, right) => sum(left.map((value, i) => value * right[i]));
const zipValues = (left, right, op) => left.map((value, i) => Array.isArray(value)
 ? zipValues(value, right[i], op) : op(value, right[i]));
const mapParams = (left, right, op) => Object.fromEntries(keys.map(key => [key, zipValues(left[key], right[key], op)]));
const update = (params, gradients) => mapParams(params, gradients, (value, gradient) => value - learningRate * gradient);

const samples = inputs.map((input, i) => {
 const preActivation = initial['w.weight'].map(row => dot(row, input));
 const hidden = preActivation.map(value => Math.max(value, 0));
 const prediction = initial['u.weight'].map((row, j) => dot(row, hidden) + initial['u.bias'][j]);
 const residual = prediction.map((value, j) => value - targets[i][j]);
 return {input, preActivation, hidden, prediction, residual, sse: sum(residual.map(value => value * value))};
});

function differentiate(rows, denominator) {
 const gradients = mapParams(initial, initial, () => 0);
 for (const row of rows) {
  const {input, preActivation, hidden, residual} = samples[row];
  const dOutput = residual.map(error => 2 * error / denominator);
  for (let j = 0; j < dOutput.length; j++) {
   gradients['u.bias'][j] += dOutput[j];
   for (let k = 0; k < hidden.length; k++) gradients['u.weight'][j][k] += dOutput[j] * hidden[k];
  }
  for (let k = 0; k < hidden.length; k++) {
   const dHidden = preActivation[k] > 0 ? sum(dOutput.map((g, j) => g * initial['u.weight'][j][k])) : 0;
   for (let j = 0; j < input.length; j++) gradients['w.weight'][k][j] += dHidden * input[j];
  }
 }
 return gradients;
}

function shard(params, tp) {
 const start = 2 * tp;
 return {'w.weight': params['w.weight'].slice(start, start + 2),
  'u.weight': params['u.weight'].map(row => row.slice(start, start + 2)), 'u.bias': params['u.bias']};
}

const allRows = inputs.map((_, i) => i);
const allElements = inputs.length * targets[0].length;
const sseByReplica = rowsByReplica.map(rows => sum(rows.map(row => samples[row].sse)));
const mean = (first, second) => (first + second) / 2;
const predictions = samples.map(sample => sample.prediction);
const denseGradients = differentiate(allRows, allElements);
const replicaMeanGradients = mapParams(...rowsByReplica.map(rows => differentiate(rows, rows.length * targets[0].length)), mean);
const reference = {prediction: predictions, loss: sum(sseByReplica) / allElements,
 gradients: denseGradients, updated: update(initial, denseGradients)};
const equalReplicaReference = {prediction: predictions,
 loss: mean(...sseByReplica.map((sse, dp) => sse / (rowsByReplica[dp].length * targets[0].length))),
 gradients: replicaMeanGradients, updated: update(initial, replicaMeanGradients)};
const correctlyScaledReplicaGradients = rowsByReplica.map(rows => differentiate(rows, allElements / mesh.length));
const expectedCases = ['sample_weighted', 'wrong_local_mean', 'wrong_tp_group'];

function rankOracle(caseName, rank) {
 const dp = Math.floor(rank / 2), tp = rank % 2;
 const tpGroup = mesh[dp], dpGroup = mesh.map(row => row[tp]);
 const wrongGroup = caseName === 'wrong_tp_group';
 const rows = rowsByReplica[dp];
 const localMean = caseName === 'wrong_local_mean';
 const denominator = localMean ? rows.length * targets[0].length : allElements / mesh.length;
 const local = shard(initial, tp);
 const gradientSource = localMean ? replicaMeanGradients : denseGradients;
 const gradients = wrongGroup
  ? mapParams(shard(correctlyScaledReplicaGradients[dp], 0), shard(correctlyScaledReplicaGradients[dp], 1), mean)
  : shard(gradientSource, tp);
 return {rank, coordinate: [dp, tp], tp_group: tpGroup, dp_group: dpGroup,
  gradient_group: wrongGroup ? tpGroup : dpGroup, sample_ids: rows,
  local_sse: sseByReplica[dp], loss_for_backward: sseByReplica[dp] / denominator,
  prediction: rows.map(row => predictions[row]), initial: local, gradients, updated: update(local, gradients)};
}

function maximumParameterError(ranks, field) {
 const errors = ranks.flatMap(rank => {
  const expected = shard(reference[field], rank.coordinate[1]);
  return Object.values(mapParams(rank[field], expected, (actual, wanted) => Math.abs(actual - wanted))).flat(Infinity);
 });
 return Math.max(...errors);
}

function verify(data) {
 assert.equal(data.status, 'passed');
 assert.equal(data.environment.backend, 'gloo');
 assert.equal(data.environment.device, 'cpu');
 assert.equal(data.environment.world_size, 4);
 assert.match(data.environment.torch, /^2\.5\.1(?:\+\S+)?$/);
 assert.deepEqual(data.mesh, mesh);
 assert.deepEqual(data.mesh_axes, ['dp', 'tp']);
 assert.deepEqual(data.inputs, inputs);
 assert.deepEqual(data.targets, targets);
 assert.equal(data.lr, learningRate);
 assert.equal(data.atol, 1e-12);
 assert.deepEqual(data.reference, reference);
 assert.deepEqual(data.equal_replica_reference, equalReplicaReference);
 assert.deepEqual(Object.keys(data.cases), expectedCases);
 for (const caseName of expectedCases) {
  const actual = data.cases[caseName];
  const ranks = [0, 1, 2, 3].map(rank => rankOracle(caseName, rank));
  assert.deepEqual(actual.ranks, ranks, caseName + ': per-rank groups, losses, predictions, gradients and update');
  assert.deepEqual(actual.max_error_vs_sample_weighted_dense, {
   prediction: 0, gradients: maximumParameterError(ranks, 'gradients'), updated: maximumParameterError(ranks, 'updated'),
  }, caseName + ': errors against the dense sample-weighted oracle');
 }
}

verify(record);
assert.deepEqual(predictions, [[12, 5], [11, 6], [13, 4]]);
assert.deepEqual(sseByReplica, [117, 54]);
assert.deepEqual([reference.loss, equalReplicaReference.loss], [28.5, 36]);
assert.deepEqual(expectedCases.map(name => record.cases[name].ranks[0].gradients['w.weight'][0]), [[5, 7], [6, 9.75], [8, 16]]);
assert.deepEqual(expectedCases.map(name => record.cases[name].max_error_vs_sample_weighted_dense.updated), [0, 0.625, 1.625]);
for (const mutate of [
 data => { data.cases.sample_weighted.ranks[2].dp_group = [2, 3]; },
 data => { data.cases.sample_weighted.ranks[3].sample_ids = [0, 1, 2]; },
 data => { data.cases.wrong_local_mean.ranks[0].loss_for_backward = 39; },
 data => { data.cases.wrong_tp_group.ranks[0].gradients['w.weight'][0] = [5, 7]; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered), assert.AssertionError);
}

const sha = content => createHash('sha256').update(content).digest('hex');
assert.deepEqual(record.source_sha256, Object.fromEntries(files.slice(0, -1).map(file => [file, sha(read(file))])));
assert.equal(read('requirements.txt').toString('utf8').trim(), 'torch==2.5.1');
if (process.env.DP_TP_PYTHON) {
 const replay = JSON.parse(execFileSync(process.env.DP_TP_PYTHON, ['-B', folder + '/dp_tp_mesh.py'],
  {encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024}));
 verify(replay);
 assert.deepEqual(replay.source_sha256, record.source_sha256);
}

const entries = execFileSync('unzip', ['-Z1', archive], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(file => pack + '/' + file));
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', archive, pack + '/' + file]), read(file), file);

const article = fs.readFileSync('dist/article/tensor-parallel-math/index.html', 'utf8');
for (const marker of ['id="native-dp-tp-mesh"', 'diagrams/dp-tp-mesh.svg', 'labs/dp-tp-mesh.zip', 'labs/dp-tp-mesh/validation.json']) {
 assert(article.includes(marker), marker);
}
const diagram = fs.readFileSync('dist/diagrams/dp-tp-mesh.svg', 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram), 'diagram has an accessible description');
const diagramData = diagram.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(diagramData, 'diagram binds its groups to the archived record');
assert.deepEqual(JSON.parse(diagramData), {
 mesh, mesh_axes: ['dp', 'tp'], tp_groups: mesh,
 dp_groups: mesh[0].map((_, tp) => mesh.map(row => row[tp])),
 sample_ids: rowsByReplica, record: 'labs/dp-tp-mesh/validation.json',
});
const role = fs.readFileSync('dist/roadmap/ai-operators/index.html', 'utf8');
assert(role.includes('/article/tensor-parallel-math/?goal=ai-operators#native-dp-tp-mesh'));
const catalog = fs.readFileSync('dist/labs/index.html', 'utf8');
const item = catalog.match(/<li class="lab-learning-unit" id="lab-ai-dp-tp-mesh">([\s\S]*?)<\/li>/)?.[1];
assert(item?.includes('/article/tensor-parallel-math/#native-dp-tp-mesh'));
console.log('PASS: actual four-rank DP×TP, independent scalar forward/gradient/SGD oracle, both failures, bound sources and archive, exact reading links.');
