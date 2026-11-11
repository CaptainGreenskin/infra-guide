/* Reconstruct the small scheduling trace without importing vLLM or the lab. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.chdir(path.resolve(__dirname, '..'));
const pack = 'dist/labs/vllm-scheduler';
const files = ['README.md', 'requirements.txt', 'scheduler_lab.py', 'source-manifest.json', 'upstream.py'];
const read = name => fs.readFileSync(path.join(pack, name));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(read('source-manifest.json'));
const record = JSON.parse(read('validation.json'));
const commit = '01efc7ef781391e744ed08c3292817a773d654e6';

assert.equal(digest(read('source-manifest.json')), 'b481dadd67779b7435817c2b519f9d0ae877811f851782d5a04a753f75696c2a');
assert.equal(manifest.commit, commit);
assert.equal(manifest.files.length, 19);
assert.equal(manifest.files.flatMap(file => file.definitions).length, 78);
const selected = manifest.files.map(file => ({
  file: file.name, sha256: file.sha256, definitions: file.definitions.map(definition => definition.name)
}));
for (const name of ['Scheduler', 'KVCacheManager', 'BlockPool', 'Request', 'get_request_block_hasher',
  'UnitaryKVCacheCoordinator', 'FullAttentionManager', 'FCFSRequestQueue', 'ModelRunnerOutput']) {
  assert.equal(selected.flatMap(file => file.definitions).filter(definition => definition === name).length, 1, name);
}
assert.equal(record.upstream_commit, commit);
assert.equal(record.engine_version, 'v0.10.2');
assert.equal(record.scope, 'vLLM V1 upstream scheduler and KV metadata execution on local CPU');
assert.equal(record.scheduler_execution, true);
assert.equal(record.actual_model_runner, false);
assert.equal(record.device_kv_tensors, false);
assert.equal(record.msgspec, '0.19.0');
assert.deepEqual(record.loaded, selected);
assert.deepEqual(record.source_sha256, Object.fromEntries(files.map(name => [name, digest(read(name))])));

const prompt = [1, 2, 3, 4, 5, 6, 7, 8];
const distinct = [9, 2, 3, 4];
const hashes = JSON.parse(execFileSync('python3', ['-B', '-c', `
import hashlib, json, pickle, sys

def digest(value):
    return hashlib.sha256(pickle.dumps(value, protocol=5)).digest()

def prefix(tokens):
    seed = digest("0")
    chain = []
    for start in range(0, len(tokens), 4):
        seed = digest((seed, tuple(tokens[start:start + 4]), None))
        chain.append(seed.hex())
    return chain

print(json.dumps([prefix(tokens) for tokens in json.loads(sys.argv[1])]))
`, JSON.stringify([prompt, distinct])], {encoding: 'utf8'}));
assert.notEqual(hashes[0][0], hashes[1][0], 'C has a different first-block identity');

function snapshot(waiting, running, free, blocks, sharedKeys, cKey = null) {
  const blockIds = Object.values(blocks).flat();
  const refcounts = [0, 1, 2, 3].map(id => blockIds.filter(block => block === id).length);
  assert.deepEqual([...blockIds, ...free].sort(), [1, 2, 3]);
  return {
    waiting, running, request_ids: Object.keys(blocks).sort(), free, refcounts, blocks,
    cached_prefix_blocks: {A: sharedKeys, B: sharedKeys, C: [cKey]},
  };
}
function reply(request, samples, outputs) {
  return {model_runner_ids: request ? [request] : [], sampled_token_ids: request ? [samples] : [],
    engine_outputs: outputs};
}
function token(request, id, cached_tokens, finish = null) {
  return {request, tokens: [id], cached_tokens, finish};
}
function round(label, before, after_schedule, after_reply, {request, first, start, count, notices, reply: observed}) {
  const scheduled = {
    positions: request ? {[request]: Array.from({length: count}, (_, i) => start + i)} : {},
    counts: request ? {[request]: count} : {},
    new: request && first ? [request] : [],
    continued: request && !first ? [request] : [],
    computed_after_schedule: request ? {[request]: start + count} : {},
    finished_notices: notices, unused_positions: 4 - count,
  };
  return {round: label, before, scheduled, after_schedule, reply: observed, after_reply};
}

const waitingA = snapshot(['A'], [], [1, 2, 3], {A: []}, [null, null]);
const firstA = snapshot([], ['A'], [2, 3], {A: [1]}, [1, null]);
const secondA = snapshot([], ['A'], [3], {A: [1, 2]}, [1, 2]);
const afterA = snapshot([], [], [3, 2, 1], {}, [1, 2]);
const waitingB = snapshot(['B'], [], afterA.free, {B: []}, [1, 2]);
// Reuse only complete blocks within the prompt-length-minus-one limit.
const warmHit = Math.floor((prompt.length - 1) / 4) * 4;
const firstB = snapshot([], ['B'], [2], {B: [1, 3]}, [1, 2]);
const waitingC = snapshot(['C'], ['B'], [2], {B: [1, 3], C: []}, [1, 2]);
const secondB = snapshot(['C'], ['B'], [], {B: [1, 3, 2], C: []}, [1, 3]);
const afterB = snapshot(['C'], [], [2, 3, 1], {C: []}, [1, 3]);
const firstC = snapshot([], ['C'], [3, 1], {C: [2]}, [1, 3], 2);
const afterC = snapshot([], [], [3, 1, 2], {}, [1, 3], 2);

const expected = {
  block_size: 4, blocks_including_null: 4, usable_blocks: 3, token_budget: 4,
  prefix_seed: '0', null_block_id: 0,
  settings: {policy: 'fcfs', max_num_seqs: 2, max_model_len: 12, prefix_caching: true,
    chunked_prefill: true, kv_groups: 1},
  requests: {
    A: {prompt, max_output: 1, prefix_hashes: hashes[0]},
    B: {prompt, max_output: 2, prefix_hashes: hashes[0]},
    C: {prompt: distinct, max_output: 1, prefix_hashes: hashes[1]},
  },
  rounds: [
    round('cold_first_half', waitingA, firstA, firstA, {
      request: 'A', first: true, start: 0, count: 4, notices: [], reply: reply('A', [], []),
    }),
    round('cold_finish', firstA, secondA, afterA, {
      request: 'A', start: 4, count: 4, notices: [], reply: reply('A', [90], [token('A', 90, 0, 'length')]),
    }),
    round('warm_first_output', waitingB, firstB, firstB, {
      request: 'B', first: true, start: warmHit, count: prompt.length - warmHit, notices: ['A'],
      reply: reply('B', [90], [token('B', 90, warmHit)]),
    }),
    round('cache_pressure', waitingC, secondB, afterB, {
      request: 'B', start: prompt.length, count: 1, notices: [],
      reply: reply('B', [91], [token('B', 91, warmHit, 'length')]),
    }),
    round('admit_after_free', afterB, firstC, afterC, {
      request: 'C', first: true, start: 0, count: distinct.length, notices: ['B'],
      reply: reply('C', [99], [token('C', 99, 0, 'length')]),
    }),
    round('final_notice', afterC, afterC, afterC, {count: 0, notices: ['C'], reply: reply(null, [], [])}),
  ],
  late_reply: {before: afterB, reply: reply('B', [92], []), after: afterB},
};
const validate = result => assert.deepEqual(result, expected, 'independent per-round scheduling and ownership ledger');
validate(record.result);
const mutations = [
  result => { result.rounds[0].reply.engine_outputs.push(token('A', 90, 0)); },
  result => { result.rounds[2].reply.engine_outputs[0].cached_tokens = 8; },
  result => { result.rounds[3].scheduled.unused_positions = 0; },
  result => { result.rounds[3].after_schedule.waiting = []; },
  result => { result.rounds[3].after_reply.refcounts[2] = 1; },
  result => { result.rounds[4].reply.engine_outputs[0].cached_tokens = 4; },
  result => { result.late_reply.reply.engine_outputs.push(token('B', 92, 4)); },
  result => { result.rounds[5].scheduled.finished_notices = []; },
];
for (const mutate of mutations) {
  const result = JSON.parse(JSON.stringify(record.result));
  mutate(result);
  assert.throws(() => validate(result), {code: 'ERR_ASSERTION'});
}

const sourceDir = process.env.VLLM_SCHEDULER_SOURCE_DIR;
if (sourceDir) {
  const executable = process.env.VLLM_SCHEDULER_PYTHON || 'python3.12';
  const replay = JSON.parse(execFileSync(executable, ['-B', path.join(pack, 'scheduler_lab.py'),
    '--source-dir', sourceDir], {encoding: 'utf8', env: {...process.env, PYTHONHASHSEED: '0'}, timeout: 20000}));
  validate(replay.result);
  assert.deepEqual(replay.loaded, record.loaded);
  assert.deepEqual(replay.source_sha256, record.source_sha256);
  assert.equal(replay.msgspec, record.msgspec);
}

if (!process.argv.includes('--record-only')) {
  const {block_size, usable_blocks, token_budget, rounds} = record.result;
  const pressure = rounds[3];
  const svg = fs.readFileSync('dist/diagrams/vllm-scheduler.svg', 'utf8');
  const figure = JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]);
  assert.deepEqual(figure, {
    record: 'labs/vllm-scheduler/validation.json',
    upstream_commit: commit,
    positions_per_round: token_budget,
    usable_blocks,
    block_size,
    cold_positions: rounds.slice(0, 2).map(round => round.scheduled.positions.A),
    warm_cached_positions: rounds[2].reply.engine_outputs[0].cached_tokens,
    pressure: {
      running: pressure.after_schedule.running[0],
      waiting: pressure.after_schedule.waiting[0],
      blocks: pressure.after_schedule.blocks.B,
      unused_positions: pressure.scheduled.unused_positions,
      free_blocks: pressure.after_schedule.free.length
    },
    device_kv_tensors: record.device_kv_tensors
  });
  execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys
folder = Path(sys.argv[1])
files = sys.argv[2:]
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(f"{folder.name}/{name}" for name in files)
    for name in files:
        assert archive.read(f"{folder.name}/{name}") == (folder / name).read_bytes(), name
`, pack, ...files, 'validation.json']);
}
console.log('PASS: vLLM pinned scheduler, cold and warm input ranges, block pressure, terminal notice, late output rejection, 8 mutants, source hashes' +
  (sourceDir ? ', fresh upstream replay' : ', offline result oracle') +
  (process.argv.includes('--record-only') ? '.' : ', exact ZIP.'));
