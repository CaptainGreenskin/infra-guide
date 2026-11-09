const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pack = path.join(root, 'dist/labs/process-wait-accounting');
const script = path.join(pack, 'process_wait.py');
const hash = createHash('sha256').update(readFileSync(script)).digest('hex');
const frozen = JSON.parse(readFileSync(path.join(pack, 'validation.json'), 'utf8'));
const expectedTotal = [10, 27, 5].reduce((total, value) => total + value, 0);
const python = process.env.PROCESS_WAIT_PYTHON || 'python3';
const firstReadEvents = ['read_result', 'child_still_alive', 'reap_child'];
const firstWaitEvents = ['reap_child', 'pipe_readable', 'read_result'];

function verifyRecord(report) {
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.source_sha256, { 'process_wait.py': hash });
  assert.match(report.environment.os, /^(Darwin|Linux)$/);
  assert.deepEqual(report.fixture, { controlled_pause_ms: 60, child_work_cpu_ms: 50 });
  const { read_first: firstRead, wait_first: firstWait } = report.cases;

  assert.deepEqual(firstRead.events, firstReadEvents);
  assert.deepEqual(firstWait.events, firstWaitEvents);
  assert.equal(firstRead.child_exit_available_after_read, false);
  assert.equal(firstWait.pipe_readable_after_reap, true);

  for (const row of [firstRead, firstWait]) {
    assert.equal(row.ready_before_release, false);
    assert.equal(row.total, expectedTotal);
    assert.equal(row.exit_code, 0);
    assert(Number.isFinite(row.child_cpu_ms) && row.child_cpu_ms >= 49.99);
    for (const segment of [row.read, row.wait]) {
      assert(Number.isFinite(segment.wall_ms) && segment.wall_ms > 0);
      assert(Number.isFinite(segment.parent_cpu_ms) && segment.parent_cpu_ms >= 0);
      assert(segment.parent_cpu_ms < row.child_cpu_ms);
    }
  }
  // Allow clock rounding. Do not require a wall-clock upper bound for an already-ready read.
  assert(firstRead.read.wall_ms >= 109.9);
  assert(firstRead.wait.wall_ms >= 59.9);
  assert(firstWait.wait.wall_ms >= 169.9);
}

function runPython(args) {
  const result = spawnSync(python, args, { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

verifyRecord(frozen);
verifyRecord(JSON.parse(runPython(['-B', script])));
const invalid = JSON.parse(JSON.stringify(frozen));
invalid.cases.read_first.child_exit_available_after_read = true;
assert.throws(() => verifyRecord(invalid), assert.AssertionError);

const figure = readFileSync(path.join(root, 'dist/diagrams/process-wait-accounting.svg'), 'utf8');
assert.deepEqual(JSON.parse(figure.match(/<metadata>(.*?)<\/metadata>/)[1]), {
  read_first: firstReadEvents,
  wait_first: firstWaitEvents,
  total: expectedTotal,
  time_scale: false,
});

const authorSource = readFileSync(path.join(root, 'dist/progressive-prerequisites-reading.js'), 'utf8');
for (const token of [
  'id="process-wait-accounting"',
  'diagrams/process-wait-accounting.svg',
  'labs/process-wait-accounting.zip',
  'labs/process-wait-accounting/process_wait.py',
  'labs/process-wait-accounting/validation.json',
]) {
  assert(authorSource.includes(token), token);
}
for (const row of Object.values(frozen.cases)) {
  const readDecimals = row.read.wall_ms < 1 ? 3 : 2;
  for (const value of [
    row.read.wall_ms.toFixed(readDecimals) + ' / ' + row.read.parent_cpu_ms.toFixed(3),
    row.wait.wall_ms.toFixed(2) + ' / ' + row.wait.parent_cpu_ms.toFixed(3),
    row.child_cpu_ms.toFixed(2),
  ]) {
    assert(authorSource.includes(value), 'Chapter must match frozen record: ' + value);
  }
}

runPython(['-c', `
from pathlib import Path
import sys
from zipfile import ZipFile

pack = Path(sys.argv[1])
expected = {name: (pack / name).read_bytes() for name in ("README.md", "process_wait.py", "validation.json")}
with ZipFile(pack.with_suffix(".zip")) as archive:
    assert sorted(archive.namelist()) == sorted(pack.name + "/" + name for name in expected)
    for name, source in expected.items():
        assert archive.read(pack.name + "/" + name) == source
`, pack]);
console.log('PASS: POSIX pipe and child wait orders, isolated CPU accounting, frozen and fresh replay, exact source and ZIP, figure and chapter values.');
