const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const name = 'incident-connection-lease';
const pack = path.join(root, 'dist/labs', name);
const programName = 'incident_connection_lease.py';
const program = path.join(pack, programName);
const hash = createHash('sha256').update(readFileSync(program)).digest('hex');
const record = JSON.parse(readFileSync(path.join(pack, 'validation.json'), 'utf8'));
const modes = ['sqlite_lock', 'external_inside', 'external_outside'];
const initialStages = ['arrival', 'pool_acquired'];
const sqlStages = ['sql_begin', 'sql_end'];
const externalStages = ['external_begin', 'external_received', 'external_end'];
const finalStages = ['pool_returned', 'complete'];
const reports = {
  sqlite_lock: [...initialStages, 'sql_begin', 'sql_busy', 'sql_retry', 'sql_end', ...finalStages],
  external_inside: [...initialStages, ...externalStages, ...sqlStages, ...finalStages],
  external_outside: [...initialStages, ...sqlStages, 'pool_returned', ...externalStages, 'complete'],
};
const snapshots = {
  blocked: { free_connections: 0, b_waiting: true, b_complete: false, a_complete: false },
  fixed: { free_connections: 1, b_waiting: false, b_complete: true, a_complete: false },
};
const orderTotals = { A: 42, B: 37 };

function verifyCase(row, mode, requireErrorCode) {
  const lock = mode === 'sqlite_lock';
  const fixed = mode === 'external_outside';
  assert.equal(row.sqlite_journal, 'delete');
  assert.deepEqual(row.snapshot, fixed ? snapshots.fixed : snapshots.blocked);

  const events = row.events;
  const eventList = task => events.filter(event => event.task === task).map(event => event.event);
  const find = (task, event) => events.findIndex(item => item.task === task && item.event === event);
  function ordered(...sequence) {
    const positions = sequence.map(args => find(...args));
    assert(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])),
      mode + ': wrong order for ' + JSON.stringify(sequence));
  }
  assert(events.every(({ task }) => ['A', 'B', null].includes(task)));
  assert.deepEqual(eventList('A'), reports[mode]);
  assert.deepEqual(eventList('B'), [
    'arrival', ...(fixed ? [] : ['pool_wait']), 'pool_acquired', ...sqlStages, ...finalStages,
  ]);
  assert.deepEqual(eventList(null), [...(lock ? ['independent_lock_probe'] : []), 'snapshot', 'release_gate']);

  let clock = 0;
  let holder = null;
  for (const event of events) {
    const { task, at_ns, event: action } = event;
    assert(Number.isSafeInteger(at_ns) && at_ns >= clock, 'monotonic recorded boundaries');
    clock = at_ns;
    if (action === 'pool_acquired') {
      assert.equal(holder, null, 'only one borrowed SQLite connection');
      holder = task;
    } else if (action === 'pool_returned') {
      assert.equal(holder, task);
      holder = null;
    } else if (['sql_begin', 'sql_busy', 'sql_retry', 'sql_end'].includes(action)) {
      assert.equal(holder, task);
      if (action === 'sql_end') assert.equal(event.total, orderTotals[task]);
    } else if (action === 'external_received') {
      assert.equal(holder, fixed ? null : 'A', 'the same external request moved outside the lease');
    } else if (action === 'snapshot') {
      assert.equal(holder, fixed ? null : 'A');
    }
  }
  assert.equal(holder, null);
  if (lock) {
    ordered([null, 'independent_lock_probe'], ['A', 'sql_busy'], ['B', 'pool_wait'],
      [null, 'snapshot'], [null, 'release_gate'], ['A', 'sql_retry'], ['B', 'pool_acquired']);
    for (const [task, event] of [[null, 'independent_lock_probe'], ['A', 'sql_busy']]) {
      const failure = events[find(task, event)];
      assert.equal(failure.message, 'database is locked');
      if (requireErrorCode) assert.equal(failure.sqlite_errorcode, 5);
      else assert([5, null].includes(failure.sqlite_errorcode));
    }
  } else if (fixed) {
    ordered(['A', 'pool_returned'], ['A', 'external_received'], ['B', 'arrival'], ['B', 'complete'],
      [null, 'snapshot'], [null, 'release_gate'], ['A', 'external_end'], ['A', 'complete']);
  } else {
    ordered(['A', 'external_received'], ['B', 'pool_wait'], [null, 'snapshot'], [null, 'release_gate'],
      ['A', 'external_end'], ['A', 'sql_begin'], ['A', 'pool_returned'], ['B', 'pool_acquired']);
  }

  for (const task of ['A', 'B']) {
    const receipt = task === 'A' && !lock ? 'external-a' : null;
    const expected = { total: orderTotals[task], receipt };
    assert.deepEqual(events[find(task, 'complete')].result, expected);
    assert.deepEqual(row.results[task], expected);
    if (receipt !== null) assert.equal(events[find(task, 'external_end')].receipt, receipt);
  }
}

function verify(report, requireErrorCode) {
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.source_sha256, { [programName]: hash });
  assert.equal(report.pool_capacity, 1);
  assert.deepEqual(Object.keys(report.cases), modes);
  for (const mode of modes) verifyCase(report.cases[mode], mode, requireErrorCode);
}

verify(record, true);
const python = process.env.INCIDENT_POOL_PYTHON || 'python3';
const fresh = JSON.parse(execFileSync(python, ['-B', program], { encoding: 'utf8', timeout: 24000 }));
verify(fresh, false);
for (const tamper of [
  changed => { changed.cases.sqlite_lock.events.find(e => e.event === 'sql_busy').sqlite_errorcode = 6; },
  changed => { changed.cases.external_inside.events.find(e => e.event === 'pool_wait').event = 'pool_acquired'; },
  changed => { changed.cases.external_outside.snapshot.b_complete = false; },
  changed => { changed.cases.external_outside.results.A.receipt = null; },
]) {
  const changed = structuredClone(record);
  tamper(changed);
  assert.throws(() => verify(changed, true), assert.AssertionError);
}

const figure = readFileSync(path.join(root, 'dist/diagrams', name + '.svg'), 'utf8');
const metadata = JSON.parse(figure.match(/<metadata>(.*?)<\/metadata>/)[1]);
for (const mode of modes) assert.deepEqual(metadata[mode], record.cases[mode].snapshot);

const chapter = readFileSync(path.join(root, 'dist/progressive-sre-reading.js'), 'utf8')
  .split('id="incident-connection-lease"')[1];
for (const token of [
  "trainingFigure('incident-connection-lease'", 'labs/incident-connection-lease.zip',
  'labs/incident-connection-lease/incident_connection_lease.py', 'labs/incident-connection-lease/validation.json',
  '/article/concurrency-pools/#bounded-worker-queue',
]) {
  assert(chapter.includes(token), token);
}

const sectionAt = (id, anchor) => readFileSync(path.join(root, 'dist/article', id, 'index.html'), 'utf8')
  .split('id="' + anchor + '"')[1]?.split('</section>')[0];
const incident = sectionAt('incident', 'incident-connection-lease');
const database = sectionAt('database-index-locks', 'native-innodb-lab');
assert(incident?.includes('href="/article/database-index-locks/#native-innodb-lab"'));
assert(database?.includes('href="/article/incident/#incident-connection-lease"'));
const mysqlWait = JSON.parse(readFileSync(path.join(root, 'dist/labs/innodb/validation.json'))).wait;
const edge = mysqlWait.edge;
const repaired = record.cases.external_outside.results;
for (const text of [
  '发起 SQL 的 <code>sql_begin</code> 后出现 <code>sql_busy</code>',
  '外部服务收到请求的 <code>external_received</code>，而 <code>sql_begin</code> 还没发生',
  '连接 ' + edge.waiting_connection + ' 正在等连接 ' + edge.holding_connection + ' 对主键记录 ' + edge.holding_row + ' 持有的锁',
  '最终独立读到余额 ' + mysqlWait.after.find(([id]) => String(id) === edge.holding_row)[1],
  'B 在 HTTP 回复放行前已读到 ' + repaired.B.total,
  '原回执 <code>' + repaired.A.receipt + '</code>',
]) assert(incident.includes(text), text);

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
import sys
from zipfile import ZipFile

pack = Path(sys.argv[1])
members = {pack.name + "/" + file: (pack / file).read_bytes() for file in sys.argv[2:]}
with ZipFile(pack.with_suffix(".zip")) as archive:
    assert sorted(archive.namelist()) == sorted(members)
    for path, source in members.items():
        assert archive.read(path) == source, path
`, pack, 'README.md', programName, 'validation.json'], { timeout: 15000 });
console.log('PASS: actual SQLite lock and gated HTTP, exclusive lease, same-output repair, frozen and live trace, exact source and ZIP.');
