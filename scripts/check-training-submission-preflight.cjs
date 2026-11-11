/* Recompute admission identity and update outcomes independently from the Python implementation. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/training-submission-preflight';
const folder = path.join(root, pack);
const source = 'submission_preflight.py';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const codeSha = sha(fs.readFileSync(path.join(folder, source)));
const dataA = '[[1,3],[2,6]]\n';
const dataB = '[[1,4],[2,8]]\n';
const modelA = '{"weight":1}\n';
const modelB = '{"weight":9}\n';
const manifest = data => ({
 format:'local-run-v1', code_sha256:codeSha, data_sha256:sha(data),
 base_sha256:sha(modelA), learning_rate:'1/8',
});
const contractA = manifest(dataA);
const contractB = manifest(dataB);
const staleCode = {...contractA, code_sha256:'0'.repeat(64)};
const canonical = record => JSON.stringify(record, Object.keys(record).sort());
const intent = (contract, pretty=false) => ({
 manifest_raw_sha256:sha(pretty ? JSON.stringify(contract, null, 2) + '\n' : canonical(contract)),
 contract_sha256:sha(canonical(contract)),
});

function fraction(numerator, denominator) {
 let x = Math.abs(numerator), y = denominator;
 while (y) [x, y] = [y, x % y];
 return denominator === x ? String(numerator / x) : `${numerator / x}/${denominator / x}`;
}

function update(data) {
 const pairs = JSON.parse(data);
 const initial = JSON.parse(modelA).weight;
 const gradSum = pairs.reduce((sum, [x, target]) => sum + (initial * x - target) * x, 0);
 const divisor = pairs.length;
 return {
  observed:{data_sha256:sha(data), base_sha256:sha(modelA)}, samples:pairs.length,
  initial_weight:String(initial), gradient:fraction(gradSum, divisor),
  updated_weight:fraction(initial * divisor * 8 - gradSum, divisor * 8),
 };
}

function check(record) {
 assert.equal(record.status, 'passed');
 assert.deepEqual(record.source_sha256, {[source]:codeSha});
 assert.match(record.environment.python, /^3\.\d+\.\d+$/);
 assert.match(record.environment.sqlite, /^3\.\d+\.\d+$/);
 const launched = (run, contract, data, workerStarts) => ({
  ...intent(contract), outcome:'launched', run_id:run, attempt_id:run + '/attempt-1',
  worker:update(data), worker_starts_total:workerStarts,
 });
 const reused = (run, contract, workerStarts, pretty=false) => ({
  ...intent(contract, pretty), outcome:'reused', run_id:run, state:'completed',
  worker_starts_total:workerStarts,
 });
 const mismatch = (name, wanted, actual) => ({
  ...intent(contractA, true), outcome:'input_digest_mismatch', file:name,
  actual_sha256:sha(actual), expected_sha256:sha(wanted), size:Buffer.byteLength(actual),
  worker_starts_total:1,
 });
 assert.equal(Buffer.byteLength(dataA), Buffer.byteLength(dataB));
 assert.equal(Buffer.byteLength(modelA), Buffer.byteLength(modelB));
 assert.deepEqual(record.cases, {
  initial:launched('run-001', contractA, dataA, 1),
  identical_retry:reused('run-001', contractA, 1),
  formatted_retry:reused('run-001', contractA, 1, true),
  stale_data:mismatch('dataset.json', dataA, dataB),
  stale_base:mismatch('base.json', modelA, modelB),
  stale_code:{...intent(staleCode), outcome:'code_digest_mismatch', actual_sha256:codeSha,
   expected_sha256:staleCode.code_sha256, worker_starts_total:1},
  changed_manifest_old_key:{...intent(contractB), outcome:'intent_conflict', run_id:'run-001',
   worker_starts_total:1},
  changed_manifest_new_key:launched('run-002', contractB, dataB, 2),
  new_run_retry:reused('run-002', contractB, 2),
 });
 const rows = [['run-001', 'train-daily', contractA, dataA], ['run-002', 'next-key', contractB, dataB]];
 assert.deepEqual(record.ledger, rows.map(([run, key, contract, data]) => ({
  run_id:run, tenant:'team-a', key, contract_sha256:intent(contract).contract_sha256,
  state:'completed', worker:update(data),
 })));
 assert.deepEqual(record.worker_starts, rows.map(([run]) => ({attempt_id:run + '/attempt-1'})));
}

const record = JSON.parse(read(pack + '/validation.json'));
check(record);
for (const mutate of [
 data => {data.cases.formatted_retry.manifest_raw_sha256 = data.cases.initial.manifest_raw_sha256;},
 data => {data.cases.stale_data.file = 'base.json';},
 data => {data.cases.stale_base.actual_sha256 = data.cases.stale_base.expected_sha256;},
 data => {data.cases.stale_code.worker_starts_total++;},
 data => {data.cases.changed_manifest_old_key.outcome = 'reused';},
 data => {data.ledger[1].worker.updated_weight = '13/8';},
 data => {data.worker_starts.push({attempt_id:'run-001/attempt-2'});},
 data => {data.source_sha256[source] = '0'.repeat(64);},
]) {
 const corrupt = structuredClone(record);
 mutate(corrupt);
 assert.throws(() => check(corrupt), assert.AssertionError);
}
check(JSON.parse(execFileSync('python3', ['-B', path.join(folder, source)],
 {encoding:'utf8', timeout:15000})));

const svg = read('dist/diagrams/training-submission-preflight.svg');
assert.match(svg, /aria-labelledby="title desc"/);
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record:'labs/training-submission-preflight/validation.json',
 keys:record.ledger.map(row => row.key), run_ids:record.ledger.map(row => row.run_id),
 worker_starts:record.worker_starts.length, updated_weights:record.ledger.map(row => row.worker.updated_weight),
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

const authorFile = 'dist/progressive-training-platform-reading.js';
const authorAt = commit => execFileSync('git', ['show', commit + ':' + authorFile], {cwd:root, encoding:'utf8'});
const previous = authorAt('28dbe43bc2852f192874fbe705d0973998fd39c6');
const published = authorAt('fcd0d183447ee904caef1c87d24b890267efcabc');
const preflightMarker = '\n platform.sections[2][1]+=\n';

// Keep the original revision boundary on its published source. Current lessons can
// evolve independently; the preflight experiment still has to match its signed text.
const publicationStart = published.indexOf(preflightMarker);
const publicationEnd = published.indexOf(' for(const chapter of [platform,gpu,kube])', publicationStart);
assert(publicationStart > 0 && publicationEnd > publicationStart);
assert.equal(published.slice(0, publicationStart) + published.slice(publicationEnd), previous);
const preflightLesson = author => {
 const start = author.indexOf(preflightMarker);
 const end = author.indexOf('\n const nativeJobReading=', start);
 assert(start > 0 && end > start);
 return author.slice(start, end);
};
const lesson = preflightLesson(read(authorFile));
assert.equal(lesson, preflightLesson(published), 'the published preflight evidence remains unchanged');
assert.match(lesson, /id="native-training-submission-preflight"/);
assert.match(lesson, /trainingFigure\('training-submission-preflight'/);
for (const link of ['.zip', '/' + source, '/README.md', '/validation.json']) {
 assert(lesson.includes('href="labs/training-submission-preflight' + link + '"'));
}
for (const row of record.ledger) assert(lesson.includes(row.worker.updated_weight));
console.log('Training submission: canonical intent, file pins, child starts, SGD oracle and ZIP verified.');
