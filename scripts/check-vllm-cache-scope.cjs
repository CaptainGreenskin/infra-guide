/* Check the three vLLM cache scope controls without importing the lab. */
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.chdir(path.resolve(__dirname, '..'));
const pack = 'dist/labs/vllm-cache-scope';
const dependency = 'dist/labs/vllm-scheduler';
const files = ['README.md', 'cache_scope.py', 'validation.json'];
const dependencyFiles = ['scheduler_lab.py', 'upstream.py', 'source-manifest.json', 'requirements.txt'];
const read = (folder, name) => fs.readFileSync(path.join(folder, name));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const record = JSON.parse(read(pack, 'validation.json'));
const prior = JSON.parse(read(dependency, 'validation.json'));
const commit = '01efc7ef781391e744ed08c3292817a773d654e6';

assert.equal(record.upstream_commit, commit);
assert.equal(record.engine_version, 'v0.10.2');
assert.equal(record.scope, 'pinned vLLM V1 scheduler and KV metadata on local CPU');
assert.equal(record.scheduler_execution, true);
for (const flag of ['actual_model_runner', 'production_authentication', 'device_kv_tensors']) {
  assert.equal(record[flag], false, flag);
}
assert.equal(record.upstream_files, 19);
assert.equal(record.msgspec, '0.19.0');
assert.deepEqual(record.source_sha256, Object.fromEntries(files.slice(0, 2)
  .map(name => [name, digest(read(pack, name))])));
assert.deepEqual(record.scheduler_dependency_sha256, Object.fromEntries(dependencyFiles.map(name => {
  const hash = digest(read(dependency, name));
  assert.equal(hash, prior.source_sha256[name], name);
  return [name, hash];
})));

const blockSize = 4;
const prompt = [1, 2, 3, 4, 5, 6, 7, 8];
const prefixSeed = '0';
const saltA = 'demo-A';
const saltB = 'demo-B';
const keys = JSON.parse(execFileSync('python3', ['-B', '-c', `
import hashlib, json, pickle, sys

prompt, block_size, seed, salts = json.loads(sys.argv[1])

def digest(value):
    return hashlib.sha256(pickle.dumps(value, protocol=5)).digest()

def chain(salt):
    parent = digest(seed)
    hashes = []
    for start in range(0, len(prompt), block_size):
        extras = (salt,) if start == 0 else None
        parent = digest((parent, tuple(prompt[start:start + block_size]), extras))
        hashes.append(parent.hex())
    return hashes

print(json.dumps({salt: chain(salt) for salt in salts}))
`, JSON.stringify([prompt, blockSize, prefixSeed, [saltA, saltB]])], {encoding: 'utf8'}));
assert(keys[saltA].every((key, i) => key !== keys[saltB][i]));

const warmHit = Math.floor((prompt.length - 1) / blockSize) * blockSize;
function schedule(request, start, blocks, hit) {
  const positions = Array.from({length: blockSize}, (_, i) => start + i);
  const last = start + blockSize === prompt.length;
  const fixture_reply = last ? [90] : [];
  return {
    positions, blocks, cached_tokens: hit, fixture_reply,
    outputs: last ? [{request, tokens: [90], cached_tokens: hit, finish: 'length'}] : [],
    free_after_reply: last ? 3 : 3 - blocks.length,
  };
}
function expectedCase(label, subject, engineSalt, policy) {
  const same = engineSalt === saltA;
  return {
    case: label, fixture_subject: subject, client_supplied_salt: saltA,
    engine_cache_salt: engineSalt, policy,
    prime_hashes: keys[saltA], follow_hashes: keys[engineSalt], key_matches: [same, same],
    matching_blocks_before_schedule: same ? [1, 2] : [null, null],
    prime_rounds: [schedule('prime', 0, [1], 0), schedule('prime', blockSize, [1, 2], 0)],
    follow_rounds: same ? [schedule('follow', warmHit, [1, 3], warmHit)] :
      [schedule('follow', 0, [3], 0), schedule('follow', blockSize, [3, 2], 0)],
  };
}
const expected = {
  prompt, block_size: blockSize, prefix_seed: prefixSeed,
  cases: [
    expectedCase('same_scope', 'A', saltA, 'trusted_scope'),
    expectedCase('different_scope', 'B', saltB, 'trusted_scope'),
    expectedCase('unsafe_passthrough', 'B', saltA, 'unsafe_passthrough'),
  ],
};
const validate = result => assert.deepEqual(result, expected, 'independent prefix keys, schedule, and output ledger');
validate(record.result);
const mutants = [
  result => { result.cases[1].engine_cache_salt = saltA; },
  result => { result.cases[1].follow_hashes[1] = result.cases[1].prime_hashes[1]; },
  result => { result.cases[1].matching_blocks_before_schedule = [1, 2]; },
  result => { result.cases[0].follow_rounds[0].cached_tokens = 8; },
  result => { result.cases[1].follow_rounds.shift(); },
  result => { result.cases[2].follow_rounds[0].outputs[0].cached_tokens = 0; },
  result => { result.cases[2].follow_rounds[0].free_after_reply = 2; },
];
for (const mutate of mutants) {
  const result = JSON.parse(JSON.stringify(record.result));
  mutate(result);
  assert.throws(() => validate(result), {code: 'ERR_ASSERTION'});
}

const sourceDir = process.env.VLLM_SCHEDULER_SOURCE_DIR;
if (sourceDir) {
  const executable = process.env.VLLM_SCHEDULER_PYTHON || 'python3.12';
  const replayOptions = {encoding: 'utf8', env: {...process.env, PYTHONHASHSEED: prefixSeed}, timeout: 20000};
  const args = ['-B', path.join(pack, 'cache_scope.py'), '--source-dir', sourceDir];
  const replay = JSON.parse(execFileSync(executable, [...args, '--scheduler-dir', dependency], replayOptions));
  validate(replay.result);
  assert.deepEqual(replay.source_sha256, record.source_sha256);
  assert.deepEqual(replay.scheduler_dependency_sha256, record.scheduler_dependency_sha256);
  const badPack = fs.mkdtempSync(path.join(os.tmpdir(), 'vllm-cache-scope-bad-pack-'));
  try {
    for (const name of dependencyFiles) fs.copyFileSync(path.join(dependency, name), path.join(badPack, name));
    fs.appendFileSync(path.join(badPack, 'upstream.py'), '\n# altered dependency\n');
    const invalid = spawnSync(executable, [...args, '--scheduler-dir', badPack], replayOptions);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /scheduler pack does not match the pinned dependency: upstream\.py/);
  } finally {
    fs.rmSync(badPack, {recursive: true, force: true});
  }
}

if (!process.argv.includes('--record-only')) {
  const figure = fs.readFileSync('dist/diagrams/vllm-cache-scope.svg', 'utf8');
  const { prompt, block_size, cases } = record.result;
  assert.deepEqual(JSON.parse(figure.match(/<metadata>([^<]+)<\/metadata>/)[1]), {
    record: 'labs/vllm-cache-scope/validation.json',
    prompt,
    block_size,
    cached_tokens: cases.map(item => item.follow_rounds.at(-1).cached_tokens),
    scheduled_positions: cases.map(item => item.follow_rounds.map(round => round.positions))
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
`, pack, ...files]);
}
console.log('PASS: equal prompts, salted parent hashes, native reuse counts 4/0/4, seven negative records and exact source digests' +
  (sourceDir ? ', fresh upstream replay and altered dependency rejection' : ', offline result oracle') +
  (process.argv.includes('--record-only') ? '.' : ', exact ZIP.'));
