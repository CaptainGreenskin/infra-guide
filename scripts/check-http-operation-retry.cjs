const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pack = path.join(root, 'dist/labs/http-operation-retry');
const program = path.join(pack, 'http_operation_retry.py');
const frozen = JSON.parse(readFileSync(path.join(pack, 'validation.json'), 'utf8'));
const hash = createHash('sha256').update(readFileSync(program)).digest('hex');
const python = process.env.HTTP_OPERATION_RETRY_PYTHON || 'python3';

const skuFirst = ['sku', 'quantity'];
const quantityFirst = ['quantity', 'sku'];
const post = (operation, attempt, quantity, fieldOrder = skuFirst) => ({
  operation, attempt, quantity, field_order: fieldOrder,
});
const first = post('reserve-1', 'attempt-1', 2);
const replay = post('reserve-1', 'attempt-2', 2, quantityFirst);
const differentPayload = post('reserve-1', 'attempt-3', 3);
const differentOperation = post('reserve-2', 'attempt-4', 2);
const body = (request, effectId) => ({
  operation: request.operation, effect_id: effectId, quantity: request.quantity,
});
const snapshot = (...entries) => ({
  effects: entries.map(([request, effectId]) => [effectId, 'demo', 'book', request.quantity]),
  receipts: entries.map(([request, effectId]) => ['demo', request.operation, 'book', request.quantity, effectId]),
});

function verifyRecord(record) {
  assert.equal(record.status, 'passed');
  assert.deepEqual(record.source_sha256, { 'http_operation_retry.py': hash });
  assert.match(record.environment.sqlite, /^3\./);
  assert.equal(record.header_read_timeout_ms, 120);
  assert.deepEqual(record.requests, [first, replay, differentPayload, differentOperation]);
  assert.deepEqual(record.initial, snapshot());
  assert.equal(record.first_observation, 'response_header_timeout');
  assert.equal(record.first_handler_still_open_after_retry, true);
  for (const point of ['before_header_read', 'after_timeout', 'after_retry', 'after_conflict']) {
    assert.deepEqual(record[point], snapshot([first, 1]), point);
  }
  assert.deepEqual(record.same_operation, { status: 200, body: body(first, 1) });
  assert.deepEqual(record.changed_payload, { status: 409, body: { error: 'operation_payload_conflict' } });
  assert.deepEqual(record.new_operation, { status: 201, body: body(differentOperation, 2) });
  assert.deepEqual(record.final, snapshot([first, 1], [differentOperation, 2]));
}

function runPython(args) {
  const result = spawnSync(python, args, { encoding: 'utf8', timeout: 18000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

verifyRecord(frozen);
verifyRecord(JSON.parse(runPython(['-B', program])));
const duplicate = { ...frozen, after_retry: frozen.final };
assert.throws(() => verifyRecord(duplicate), assert.AssertionError);
const noCommitBeforeTimeout = { ...frozen, before_header_read: frozen.initial };
assert.throws(() => verifyRecord(noCommitBeforeTimeout), assert.AssertionError);

const figure = readFileSync(path.join(root, 'dist/diagrams/http-operation-retry.svg'), 'utf8');
assert.deepEqual(JSON.parse(figure.match(/<metadata>(.*?)<\/metadata>/)[1]), {
  operation: first.operation,
  attempts: [first.attempt, replay.attempt],
  effect_id: frozen.same_operation.body.effect_id,
  effect_count_after_retry: frozen.after_retry.effects.length,
  timeout_stage: 'response_header',
  time_scale: false,
});
const author = readFileSync(path.join(root, 'dist/progressive-prerequisites-reading.js'), 'utf8')
  .split('id="http-operation-retry"')[1];
for (const token of [
  'diagrams/http-operation-retry.svg', 'labs/http-operation-retry.zip',
  'labs/http-operation-retry/http_operation_retry.py', 'labs/http-operation-retry/validation.json',
  '120 毫秒', '200，返回效果编号 1', '409，参数冲突', '201，创建效果编号 2',
]) {
  assert(author.includes(token), token);
}

runPython(['-c', `
from pathlib import Path
import sys
from zipfile import ZipFile

pack = Path(sys.argv[1])
expected = {name: (pack / name).read_bytes() for name in ("README.md", "http_operation_retry.py", "validation.json")}
with ZipFile(pack.with_suffix(".zip")) as archive:
    assert sorted(archive.namelist()) == sorted(pack.name + "/" + name for name in expected)
    for name, source in expected.items():
        assert archive.read(pack.name + "/" + name) == source
`, pack]);
console.log('PASS: actual HTTP header read timeout after SQLite commit, same-key replay and conflict, changed-key effect, exact evidence, figure and ZIP.');
