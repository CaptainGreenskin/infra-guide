const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const labs = path.resolve(__dirname, '../dist/labs');
const pack = path.join(labs, 'dns-connection-handoff');
const source = path.join(pack, 'dns_connection_handoff.py');
const helper = path.join(labs, 'dns-cache/dns_cache.py');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const names = { name: 'api.example.test.', path: '/orders/O-104', order: 'O-104', amount: 37 };

function verifyDns(replies, side, processes, types) {
  assert.deepEqual(Object.keys(replies), types);
  const selected = [];
  for (const [type, reply] of Object.entries(replies)) {
    assert.deepEqual(reply.args.slice(0, 6), ['-4', '@127.0.0.1', '-p', String(processes[side].port), names.name, type]);
    assert.equal(reply.args.at(-1), side === 'authority' ? '+norecurse' : '+recurse');
    const status = reply.raw.match(/^;; ->>HEADER<<- .*status: (\w+),/m)?.[1];
    assert.equal(status, 'NOERROR');
    assert.equal(reply.status, status);
    const flags = reply.raw.match(/^;; flags: ([^;]+);/m)[1].trim().split(/\s+/);
    assert.deepEqual(reply.flags, flags);
    assert.equal(flags.includes('aa'), side === 'authority');
    const rows = [...reply.raw.matchAll(/^(\S+)\s+(\d+)\s+IN\s+(A|AAAA|SOA)\s+(.+)$/gm)].map(m => ({
      name: m[1], ttl: Number(m[2]), type: m[3], data: m[4].trim(),
    }));
    const answers = rows.filter(row => row.type !== 'SOA');
    assert.deepEqual(reply.answers, answers);
    assert.deepEqual(reply.authority, rows.filter(row => row.type === 'SOA'));
    for (const row of answers) {
      assert.equal(row.name, names.name);
      assert.equal(row.type, type);
      assert(row.ttl >= 0 && row.ttl <= 5);
      selected.push(row.data);
    }
    assert(Number.isFinite(reply.elapsed_ms) && reply.elapsed_ms >= 0);
  }
  return selected;
}

function verifyRecord(record, requireLinux = false) {
  assert.equal(record.schema, 'dns-connection-handoff-v1');
  assert.equal(record.status, 'passed');
  assert.deepEqual(record.source_sha256, { 'dns_connection_handoff.py': sha(source), 'dns-cache/dns_cache.py': sha(helper) });
  const { environment, fixture, processes, dns, requests, origins } = record;
  assert(['Linux', 'Darwin'].includes(environment.system));
  if (requireLinux) assert.equal(environment.system, 'Linux');
  assert.match(environment.tools.unbound.version, /^Version \d/);
  assert.match(environment.tools.dig.version, /^DiG \d/);
  for (const tool of Object.values(environment.tools)) assert.match(tool.sha256, /^[0-9a-f]{64}$/);
  const old = { type: 'A', address: '127.0.0.1' };
  const next = environment.system === 'Linux' ? { type: 'A', address: '127.0.0.2' } : { type: 'AAAA', address: '::1' };
  assert(Number.isInteger(fixture.port) && fixture.port > 1023 && fixture.port <= 65535);
  assert.deepEqual(fixture, { ...names, port: fixture.port, ttl_seconds: 5,
    http_host: `api.example.test:${fixture.port}`, old, new: next });
  assert.notEqual(processes.authority.pid, processes.resolver.pid);
  assert.notEqual(processes.authority.port, processes.resolver.port);
  for (const item of Object.values(processes)) {
    assert(Number.isInteger(item.pid) && item.pid > 0);
    assert(Number.isInteger(item.port) && item.port > 1023 && item.port <= 65535);
  }
  for (const config of Object.values(record.configs)) {
    assert.match(config, /^    interface: 127\.0\.0\.1$/m);
    assert.match(config, /^    outgoing-interface: 127\.0\.0\.1$/m);
    assert.match(config, /^    serve-expired: no$/m);
  }
  const resolver = record.configs.resolver;
  assert.match(resolver, /^    stub-first: no$/m);
  assert.match(resolver, /^    forward-first: no$/m);
  assert(resolver.includes(`stub-addr: 127.0.0.1@${processes.authority.port}`));
  assert(resolver.includes(`forward-addr: 127.0.0.1@${processes.authority.port}`));
  for (const [configuration, endpoint] of [['authority_before', old], ['authority_after', next]]) {
    assert(record.configs[configuration].includes(`local-data: "${names.name} 5 IN ${endpoint.type} ${endpoint.address}"`));
  }

  const types = next.type === 'A' ? ['A'] : ['A', 'AAAA'];
  assert.deepEqual(Object.keys(dns), ['before', 'changed_authority', 'after_expiry']);
  assert.deepEqual(verifyDns(dns.before.authority, 'authority', processes, types), [old.address]);
  assert.deepEqual(verifyDns(dns.before.resolver, 'resolver', processes, types), [old.address]);
  assert.deepEqual(verifyDns(dns.changed_authority.authority, 'authority', processes, types), [next.address]);
  const stale = verifyDns(dns.changed_authority.resolver, 'resolver', processes, types);
  assert(stale.includes(old.address));
  if (requireLinux) assert.deepEqual(stale, [old.address]);
  const final = verifyDns(dns.after_expiry.resolver, 'resolver', processes, types);
  assert.deepEqual(final, [next.address]);
  const sampledAt = replies => Math.max(...Object.values(replies).map(reply => reply.elapsed_ms));
  const clock = [sampledAt(dns.before.authority), sampledAt(dns.before.resolver), requests[0].elapsed_ms,
    sampledAt(dns.changed_authority.authority), sampledAt(dns.changed_authority.resolver),
    sampledAt(dns.after_expiry.resolver), requests[1].elapsed_ms, requests[2].elapsed_ms];
  assert.deepEqual(clock, [...clock].sort((a, b) => a - b));
  assert(clock[5] - clock[1] > 3500);

  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].local, requests[1].local);
  const connectionIds = ['A-c1', 'A-c1', 'B-c1'];
  for (const [index, request] of requests.entries()) {
    const backend = index < 2 ? 'A' : 'B';
    const peer = [index < 2 ? old.address : next.address, fixture.port];
    const id = `r${index + 1}`;
    assert.equal(request.id, id);
    assert.equal(request.status, 200);
    assert.deepEqual(request.peer, peer);
    assert.deepEqual(request.response, { request_id: id, backend, connection: connectionIds[index], order: names.order, amount: 37 });
  }
  for (const [backend, indexes] of [['A', [0, 1]], ['B', [2]]]) {
    const origin = origins[backend];
    const first = requests[indexes[0]];
    assert.deepEqual(origin.listening, first.peer);
    assert.deepEqual(origin.accepted, [{ connection: `${backend}-c1`, local: first.peer, peer: first.local }]);
    assert.deepEqual(origin.requests, indexes.map(index => ({
      id: requests[index].id, host: fixture.http_host, path: fixture.path, connection: connectionIds[index],
    })));
  }
}

const suppliedRecord = process.argv[2];
const input = suppliedRecord || path.join(pack, 'validation.json');
verifyRecord(JSON.parse(readFileSync(input, 'utf8')), !suppliedRecord);
if (!suppliedRecord) {
  execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys

labs = Path(sys.argv[1])
members = [
    'dns-connection-handoff/dns_connection_handoff.py',
    'dns-connection-handoff/README.md',
    'dns-connection-handoff/validation.json',
    'dns-cache/dns_cache.py',
]
with ZipFile(labs / 'dns-connection-handoff.zip') as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(members)
    for member in members:
        assert archive.read(member) == (labs / member).read_bytes(), member
`, labs]);
}
if (process.env.DNS_HANDOFF_UNBOUND) {
  const replay = execFileSync(process.env.DNS_HANDOFF_PYTHON || 'python3',
    ['-B', source, '--unbound', process.env.DNS_HANDOFF_UNBOUND, '--dig', process.env.DNS_HANDOFF_DIG || 'dig'],
    { encoding: 'utf8', timeout: 35000 });
  verifyRecord(JSON.parse(replay));
}
console.log('PASS: raw DNS authority and cache transition; r1/r2 retain the same TCP socket and r3 reaches the new address' +
  (suppliedRecord ? '.' : ', exact ZIP.'));
