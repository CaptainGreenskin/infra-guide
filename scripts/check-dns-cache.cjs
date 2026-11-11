const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const pack = path.resolve(__dirname, '../dist/labs/dns-cache');
const source = path.join(pack, 'dns_cache.py');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const names = { api: 'api.example.test.', preview: 'preview.example.test.' };

function verifyRecord(record) {
  assert.equal(record.schema, 'dns-cache-v1');
  assert.equal(record.status, 'passed');
  assert.deepEqual(record.fixture, { ...names, positive_ttl_seconds: 8, negative_ttl_seconds: 5, authority_serials: [1, 2] });
  assert.equal(record.source_sha256['dns_cache.py'], sha(source));
  const { authority, resolver } = record.processes;
  assert.notEqual(authority.pid, resolver.pid);
  assert.notEqual(authority.port, resolver.port);
  for (const { pid, port } of [authority, resolver]) {
    assert(Number.isInteger(pid) && pid > 0);
    assert(Number.isInteger(port) && port > 1023 && port <= 65535);
  }
  for (const config of Object.values(record.configs)) {
    assert.match(config, /^    interface: 127\.0\.0\.1$/m);
    assert.match(config, /^    outgoing-interface: 127\.0\.0\.1$/m);
    assert.match(config, /^    serve-expired: no$/m);
  }
  const resolverConfig = record.configs.resolver;
  assert(resolverConfig.includes(`stub-addr: 127.0.0.1@${authority.port}`));
  assert(resolverConfig.includes(`forward-addr: 127.0.0.1@${authority.port}`));
  assert.match(resolverConfig, /^    stub-first: no$/m);
  assert.match(resolverConfig, /^    forward-first: no$/m);
  assert.match(record.configs.authority_before, /hostmaster\.example\.test\. 1 60 60 60 5/);
  assert.match(record.configs.authority_after, /hostmaster\.example\.test\. 2 60 60 60 5/);

  const expected = {
    before: { authority: ['192.0.2.10', null], resolver: ['192.0.2.10', null] },
    changed_authority: { authority: ['192.0.2.20', '192.0.2.30'], resolver: ['192.0.2.10', null] },
    negative_expired: { resolver: ['192.0.2.10', '192.0.2.30'] },
    both_expired: { resolver: ['192.0.2.20', '192.0.2.30'] },
  };
  let previous = -1;
  assert.deepEqual(Object.keys(record.phases), Object.keys(expected));
  for (const [phase, sides] of Object.entries(expected)) {
    assert.deepEqual(Object.keys(record.phases[phase]), Object.keys(sides));
    for (const [side, addresses] of Object.entries(sides)) {
      for (const [index, [key, name]] of Object.entries(names).entries()) {
        const item = record.phases[phase][side][key];
        const addr = addresses[index];
        assert.deepEqual(item.args.slice(0, 6), ['-4', '@127.0.0.1', '-p', String(record.processes[side].port), name, 'A']);
        assert.equal(item.args.at(-1), side === 'authority' ? '+norecurse' : '+recurse');
        const status = item.raw.match(/^;; ->>HEADER<<- .*status: (\w+),/m)?.[1];
        assert.equal(status, addr ? 'NOERROR' : 'NXDOMAIN');
        assert.equal(item.status, status);
        const flags = item.raw.match(/^;; flags: ([^;]+);/m)[1].trim().split(/\s+/);
        assert.deepEqual(item.flags, flags);
        assert.equal(flags.includes('aa'), side === 'authority');
        const rr = [...item.raw.matchAll(/^(\S+)\s+(\d+)\s+IN\s+(A|SOA)\s+(.+)$/gm)].map(match => ({
          name: match[1], ttl: Number(match[2]), type: match[3], data: match[4].trim(),
        }));
        if (addr) {
          assert.equal(rr.length, 1);
          assert.equal(rr[0].data, addr);
          assert.equal(rr[0].name, name);
          assert.equal(rr[0].type, 'A');
          assert(rr[0].ttl >= 0 && rr[0].ttl <= 8);
          assert.deepEqual(item.answers, rr);
          assert.deepEqual(item.authority, []);
        } else {
          assert.equal(rr.length, 1);
          assert.equal(rr[0].name, 'example.test.');
          assert.equal(rr[0].type, 'SOA');
          assert.match(rr[0].data, /^ns\.example\.test\. hostmaster\.example\.test\. 1 60 60 60 5$/);
          assert(rr[0].ttl >= 0 && rr[0].ttl <= 5);
          assert.deepEqual(item.answers, []);
          assert.deepEqual(item.authority, rr);
        }
        assert(Number.isFinite(item.elapsed_ms) && item.elapsed_ms >= previous);
        previous = item.elapsed_ms;
      }
    }
  }
  const phases = record.phases;
  assert.equal(phases.before.authority.api.answers[0].ttl, 8);
  assert.equal(phases.before.authority.preview.authority[0].ttl, 5);
  assert(phases.negative_expired.resolver.api.answers[0].ttl < 8);
  assert(phases.negative_expired.resolver.preview.elapsed_ms - phases.before.resolver.preview.elapsed_ms > 3500);
  assert(phases.both_expired.resolver.api.elapsed_ms - phases.before.resolver.api.elapsed_ms > 6500);
  assert(previous < 16000);
}

const recorded = JSON.parse(readFileSync(path.join(pack, 'validation.json'), 'utf8'));
assert.deepEqual(recorded.environment, { system: 'Darwin', arch: 'arm64', tools: {
  unbound: { version: 'Version 1.24.2', sha256: 'c285b524a0c209665da995279c117f726eda24d8b5856f7f725aab9a25bc05f3' },
  dig: { version: 'DiG 9.10.6', sha256: 'cf483bcc1588deb9f24083912f681cfb7f88c4f137a2269f3cb614826072d5ea' },
} });
verifyRecord(recorded);
const figure = readFileSync(path.resolve(pack, '../../diagrams/dns-cache-expiry.svg'), 'utf8');
const { before, both_expired } = recorded.phases;
assert.deepEqual(JSON.parse(figure.match(/<metadata>([^<]+)<\/metadata>/)[1]), {
  record: 'labs/dns-cache/validation.json',
  positive_ttl: before.authority.api.answers[0].ttl,
  negative_ttl: before.authority.preview.authority[0].ttl,
  old_api: before.resolver.api.answers[0].data,
  new_api: both_expired.resolver.api.answers[0].data,
  new_preview: both_expired.resolver.preview.answers[0].data
});
execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys
folder = Path(sys.argv[1])
files = ["README.md", "dns_cache.py", "validation.json"]
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(f"{folder.name}/{name}" for name in files)
    for name in files:
        assert archive.read(f"{folder.name}/{name}") == (folder / name).read_bytes(), name
`, pack]);

if (process.env.DNS_CACHE_UNBOUND) {
  const replay = execFileSync(process.env.DNS_CACHE_PYTHON || 'python3',
    ['-B', source, '--unbound', process.env.DNS_CACHE_UNBOUND, '--dig', process.env.DNS_CACHE_DIG || 'dig'],
    { encoding: 'utf8', timeout: 30000 });
  verifyRecord(JSON.parse(replay));
}

console.log('PASS: raw authoritative and cached DNS replies, separate NXDOMAIN and A expiry, bound source');
