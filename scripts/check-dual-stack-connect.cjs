const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const labs = path.resolve(__dirname, '../dist/labs');
const dist = path.dirname(labs);
const pack = path.join(labs, 'dual-stack-connect');
const source = path.join(pack, 'dual_stack_connect.py');
const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex');
const host = 'dual.example.test';
const route = '/orders/O-104';
const ipv4 = '127.0.0.1';
const ipv6 = '::1';
const delimiter = '\n--curl-observation--\n';
const writeOut = delimiter +
  '%{remote_ip}|%{remote_port}|%{local_ip}|%{local_port}|' +
  '%{http_code}|%{num_connects}|%{time_connect}|%{time_starttransfer}\n';
const expected = {
  both_listen: { mode: 'reply', only: false, tries: [ipv6], peer: ipv6, family: 'IPv6', code: 0, status: '200' },
  ipv6_refused: { mode: 'refuse', only: false, tries: [ipv6, ipv4], peer: ipv4, family: 'IPv4', code: 0, status: '200' },
  ipv6_only_refused: { mode: 'refuse', only: true, tries: [ipv6], peer: '', family: '', code: 7, status: '000' },
  ipv6_http_wait: { mode: 'hold', only: false, tries: [ipv6], peer: ipv6, family: 'IPv6', code: 28, status: '000' },
};

function verifyCase(entry, want) {
  assert(Number.isInteger(entry.port) && entry.port > 1023 && entry.port <= 65535);
  assert.equal(entry.ipv6, want.mode);
  assert.equal(entry.ipv6_only, want.only);
  const { port, curl, listeners } = entry;
  const authority = host + ':' + port;
  assert.deepEqual(curl.args, [
    '-q', '--silent', '--show-error', '--verbose', '--noproxy', '*',
    '--http1.1', '--connect-timeout', '0.5', '--max-time', '1',
    '--happy-eyeballs-timeout-ms', '100', '--resolve', authority + ':[::1],127.0.0.1',
    '--write-out', writeOut, ...(want.only ? ['--ipv6'] : []), 'http://' + authority + route,
  ]);
  assert.equal(curl.exit_code, want.code);
  const pieces = curl.stdout.split(delimiter);
  assert.equal(pieces.length, 2);
  const [body, metrics] = pieces;
  const values = metrics.trim().split('|');
  assert.equal(values.length, 8);
  const [remoteIp, remotePort, localIp, localPort, status, connects, timeConnect, timeStart] = values;
  assert.equal(remoteIp, want.peer);
  assert.equal(status, want.status);
  assert.equal(Number(remotePort), want.peer ? port : 0);
  assert.equal(localIp, want.peer);
  assert.equal(Number(connects), want.peer ? 1 : 0);
  assert.match(timeConnect, /^\d+\.\d{6}$/);
  assert.match(timeStart, /^\d+\.\d{6}$/);
  assert.equal(Number(timeConnect) > 0, Boolean(want.peer));
  assert.equal(Number(timeStart) > 0, want.code === 0);

  const trace = curl.stderr;
  const attempts = [...trace.matchAll(/^\*\s+Trying (\[::1\]|::1|127\.0\.0\.1):(\d+)\.\.\./gm)];
  assert.deepEqual(attempts.map(attempt => attempt[1].replace(/^\[|\]$/g, '')), want.tries);
  assert(attempts.every(attempt => Number(attempt[2]) === port));
  if (want.mode === 'refuse') {
    const refused = trace.indexOf('Connection refused');
    assert(refused > attempts[0].index);
    if (attempts[1]) assert(refused < attempts[1].index);
  }
  const connections = [...trace.matchAll(/^\*\s+Connected to dual\.example\.test \(([^)]+)\) port (\d+)/gm)];
  assert.deepEqual(connections.map(([, ip, p]) => [ip, Number(p)]), want.peer ? [[want.peer, port]] : []);
  assert.equal(trace.split('> GET ' + route + ' HTTP/1.1').length - 1, want.peer ? 1 : 0);
  assert.equal(trace.split('> Host: ' + authority).length - 1, want.peer ? 1 : 0);
  assert.equal(/^< HTTP\/1\.1 200 /m.test(trace), want.code === 0);
  if (want.code === 28) assert.match(trace, /curl: \(28\)/);
  if (want.code === 7) assert.match(trace, /curl: \(7\)/);

  const serverEvents = [];
  if (want.peer) {
    const client = [localIp, Number(localPort)];
    assert(Number.isInteger(client[1]) && client[1] > 1023 && client[1] <= 65535);
    serverEvents.push({ event: 'accepted', local: [remoteIp, port], peer: client },
      { event: 'request', method: 'GET', path: route, host: authority, peer: client });
  } else {
    assert.equal(Number(localPort), 0);
  }
  if (want.code === 0) {
    const order = { order: 'O-104', amount: 37, family: want.family };
    assert.deepEqual(JSON.parse(body), order);
    serverEvents.push({ event: 'response', status: 200, body: order });
  } else {
    assert.equal(body, '');
  }
  assert.deepEqual(listeners, {
    IPv4: want.family === 'IPv4' ? serverEvents : [],
    IPv6: want.family === 'IPv6' ? serverEvents : [],
  });
}

function verifyRecord(record) {
  assert.equal(record.schema, 'dual-stack-connect-v1');
  assert.equal(record.status, 'passed');
  assert(['Linux', 'Darwin'].includes(record.environment.system));
  assert.match(record.environment.curl_version, /^curl \d+\.\d+/);
  assert.match(record.environment.curl_version, /^Features: .*\bIPv6\b/m);
  assert.deepEqual(record.source_sha256, { 'dual_stack_connect.py': sourceHash });
  assert.deepEqual(record.fixture, { host, path: route, candidates: [ipv6, ipv4],
    connect_timeout_s: 0.5, max_time_s: 1, happy_eyeballs_timeout_ms: 100 });
  assert.deepEqual(Object.keys(record.cases), Object.keys(expected));
  for (const [name, want] of Object.entries(expected)) verifyCase(record.cases[name], want);
}

const suppliedRecord = process.argv[2];
const record = JSON.parse(readFileSync(suppliedRecord || path.join(pack, 'validation.json'), 'utf8'));
verifyRecord(record);
for (const change of [
  record => { record.cases.ipv6_refused.curl.stderr = record.cases.ipv6_refused.curl.stderr.replace('Connection refused', 'Connection timed out'); },
  record => { record.cases.ipv6_http_wait.listeners.IPv4.push({ event: 'request' }); },
  record => { record.cases.both_listen.listeners.IPv6[2].body.amount = 38; },
]) {
  const changed = JSON.parse(JSON.stringify(record));
  change(changed);
  assert.throws(() => verifyRecord(changed), { name: 'AssertionError' });
}
if (!suppliedRecord) {
  const lesson = readFileSync(path.join(dist, 'progressive-network-reading.js'), 'utf8');
  for (const token of ["h('native-dual-stack-connect'", '/labs/dual-stack-connect.zip',
    '/labs/dual-stack-connect/README.md', '/labs/dual-stack-connect/validation.json']) assert(lesson.includes(token), token);
  execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys

folder = Path(sys.argv[1])
members = [folder.name + "/" + name for name in ("dual_stack_connect.py", "README.md", "validation.json")]
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(members)
    for member in members:
        assert archive.read(member) == (folder.parent / member).read_bytes(), member
`, pack]);
}
if (process.env.DUAL_STACK_CURL) {
  const output = execFileSync(process.env.DUAL_STACK_PYTHON || 'python3',
    ['-B', source, '--curl', process.env.DUAL_STACK_CURL], { encoding: 'utf8', timeout: 18000 });
  verifyRecord(JSON.parse(output));
}
console.log('PASS: IPv6 success, refusal with IPv4 fallback, IPv6-only refusal, and HTTP wait after IPv6 connect; matched curl and server observations.');
