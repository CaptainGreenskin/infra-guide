/* Independently derive each SGD update, and keep the published DDP lesson intact. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/ddp-uneven-join';
const folder = path.join(root, pack);
const run = 'ddp_uneven_join.py';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = name => createHash('sha256').update(fs.readFileSync(path.join(folder, name))).digest('hex');
const record = JSON.parse(read(pack + '/validation.json'));
const inputs = [[2, 8], [6]];
const modes = ['no_join', 'fail_fast', 'initial_world', 'active_world'];

function update({weight, momentum}, gradient, target) {
 const m = momentum / 2 + gradient;
 return {target, gradient, weight:weight - m / 4, momentum:m};
}

function parameterState({weight, momentum}) {
 return {weight, momentum};
}

function check(actual) {
 assert.equal(actual.status, 'passed');
 assert.deepEqual(actual.targets, inputs);
 assert.deepEqual(actual.source_sha256, {[run]:sha(run), 'requirements.txt':sha('requirements.txt')});
 assert.match(actual.environment.torch, /^2\.5\.1(?:\+cpu)?$/);
 assert.equal(actual.environment.device, 'cpu');
 assert.equal(actual.environment.backend, 'gloo');
 assert.deepEqual(Object.keys(actual.outcomes).sort(), modes.slice().sort());

 const start = {weight:0, momentum:0};
 const sharedGradient = inputs.reduce((sum, row) => sum + start.weight - row[0], 0) / inputs.length;
 const shared = inputs.map(row => update(start, sharedGradient, row[0]));
 const first = parameterState(shared[0]);
 for (const mode of modes) {
  const rows = actual.outcomes[mode];
  assert.deepEqual(rows.map(row => row.rank), [0, 1]);
  assert.deepEqual(rows.map(row => row.steps[0]), shared);
  if (mode === 'no_join' || mode === 'fail_fast') {
   assert(rows.every(row => row.steps.length === 1));
   assert.deepEqual(rows.map(row => row.after_iterator), [first, first]);
   if (mode === 'no_join') {
    assert.deepEqual(rows.map(row => row.outcome), ['gloo_timeout', 'exhausted_without_collective']);
    assert.match(rows[0].runtime_error, /Timed out waiting 4000ms/);
    assert.equal(rows[1].runtime_error, undefined);
   } else {
    assert.deepEqual(rows.map(row => row.outcome), ['peer_exhausted', 'local_exhausted']);
    assert.match(rows[0].runtime_error, /exhausted inputs.*all ranks/);
    assert.match(rows[1].runtime_error, /Rank 1 exhausted all inputs/);
   }
   assert(rows.every(row => row.next_balanced_step === undefined));
   continue;
  }

  assert(rows.every(row => row.outcome === 'completed' && row.runtime_error === undefined));
  const activeInput = inputs[0][1], divisor = mode === 'initial_world' ? inputs.length : 1;
  const tail = update(first, (first.weight - activeInput) / divisor, activeInput);
  assert.deepEqual(rows.map(row => row.steps), [[shared[0], tail], [shared[1]]]);
  const fromLastRank = parameterState(tail);
  const stalePeer = {weight:tail.weight, momentum:first.momentum};
  assert.deepEqual(rows.map(row => row.after_iterator), [fromLastRank, stalePeer]);
  if (mode === 'initial_world') {
   const nextInput = 5, gradient = tail.weight - nextInput;
   const restored = update(fromLastRank, gradient, nextInput);
   assert.deepEqual(rows.map(row => row.next_balanced_step), [
    {stale:restored, restored},
    {stale:update(stalePeer, gradient, nextInput), restored},
   ]);
  } else {
   assert(rows.every(row => row.next_balanced_step === undefined));
  }
 }
}

check(record);
for (const mutation of [
 result => {result.outcomes.no_join[0].outcome = 'completed';},
 result => {result.outcomes.fail_fast[1].runtime_error = 'timeout';},
 result => {result.outcomes.initial_world[0].steps[1].gradient = -7;},
 result => {result.outcomes.initial_world[1].after_iterator.momentum = -5.5;},
 result => {result.outcomes.initial_world[1].next_balanced_step.restored.weight = 3.53125;},
 result => {result.outcomes.active_world[1].after_iterator.weight = 1;},
]) {
 const mutated = structuredClone(record);
 mutation(mutated);
 assert.throws(() => check(mutated), assert.AssertionError);
}

const svg = read('dist/diagrams/ddp-uneven-join.svg');
assert.match(svg, /aria-labelledby="title desc"/);
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record:'labs/ddp-uneven-join/validation.json', targets:inputs,
 initial_weight:record.outcomes.initial_world[0].after_iterator.weight,
 active_weight:record.outcomes.active_world[0].after_iterator.weight,
 stale_next:record.outcomes.initial_world.map(row => row.next_balanced_step.stale.weight),
 restored_next:record.outcomes.initial_world[0].next_balanced_step.restored.weight,
});
execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys

folder = Path(sys.argv[1])
expected = sorted(folder.name + "/" + path.name for path in folder.iterdir() if path.is_file())
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert archive.namelist() == expected
    for name in expected:
        assert archive.read(name) == (folder / Path(name).name).read_bytes()
`, folder], {timeout:10000});

const authorFile = 'dist/progressive-training-program-reading.js';
const author = read(authorFile);
const previous = execFileSync('git', ['show', 'ebff1ffe719838148cb6d69e33189dc7e26fad98:' + authorFile], {cwd:root, encoding:'utf8'});
const start = author.indexOf(" ddp.sections[1][1]+='<h3 id=\"native-ddp-join\"");
const end = author.indexOf(" const lab=select('training-lab',", start);
assert(start >= 0 && end > start);
assert.equal(author.slice(0, start) + author.slice(end), previous);

const context = vm.createContext({});
for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
 if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename:file});
}
const sections = id => vm.runInContext(`articleById(${JSON.stringify(id)}).sections`, context);
const lesson = sections('ddp-code')[1][1];
for (const item of ['id="native-ddp-join"', 'diagrams/ddp-uneven-join.svg', 'labs/ddp-uneven-join.zip',
 'labs/ddp-uneven-join/validation.json', 'labs/ddp-uneven-join/ddp_uneven_join.py', '/article/checkpoint-recovery/#checkpoint-ddp-optimizer-state']) {
 assert(lesson.includes(item), item);
}
const [last, early] = record.outcomes.initial_world;
const strategies = sections('distributed-training')[2][1];
assert(strategies.includes(`一个更新了 ${last.steps.length} 次，一个只更新了 ${early.steps.length} 次`));
assert(strategies.includes('href="/article/ddp-code/#native-ddp-join"'));
const recovery = sections('checkpoint-recovery')[1][1];
const display = number => String(number).replace('-', '−');
for (const item of [
 'id="checkpoint-ddp-optimizer-state"', '两个本机 CPU/Gloo 进程', `权重都变成 ${last.after_iterator.weight}`,
 `SGD 动量各是 ${display(last.after_iterator.momentum)} 和 ${display(early.after_iterator.momentum)}`,
 `都用目标 ${last.next_balanced_step.stale.target}，归约梯度同为 ${display(last.next_balanced_step.stale.gradient)}`,
 `分别变成 ${last.next_balanced_step.stale.weight} 和 ${early.next_balanced_step.stale.weight}`,
 `在内存中同步动量后重做这一步，两边都得到 ${last.next_balanced_step.restored.weight}`,
 'href="/article/ddp-code/#native-ddp-join"', 'href="labs/ddp-uneven-join/validation.json"',
]) assert(recovery.includes(item), item);

if (process.env.DDP_JOIN_PYTHON) {
 const fresh = execFileSync(process.env.DDP_JOIN_PYTHON, ['-B', path.join(folder, run)], {
  encoding:'utf8', timeout:90000, stdio:['ignore', 'pipe', 'pipe'],
 });
 check(JSON.parse(fresh));
}
console.log('PASS: 4 real two-rank Gloo scenarios, independent tail division and resumed momentum, 6 rejected mutations, exact source/ZIP and verified training-to-recovery handoff.');
