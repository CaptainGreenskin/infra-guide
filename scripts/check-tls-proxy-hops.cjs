const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/tls-proxy-hops';
const script = 'tls_proxy_hops.py';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const digest = file => createHash('sha256').update(read(file)).digest('hex');
const record = JSON.parse(read(pack + '/validation.json'));
const scenarios = [
 {id:'a1', front:'P-1', host:'orders.lab.test', backend:'A', name:'a.origin.test', originHost:'orders.origin.test', mode:'fresh', origin:'A-1', status:200},
 {id:'a2', front:'P-2', host:'orders.lab.test', backend:'A', name:'a.origin.test', originHost:'orders.origin.test', mode:'reused', origin:'A-1', status:200},
 {id:'b1', front:'P-3', host:'audit.lab.test', backend:'B', name:'b.origin.test', originHost:'audit.origin.test', mode:'fresh', origin:'B-1', status:200},
 {id:'bad', front:'P-4', host:'audit.lab.test', backend:'B', name:'a.origin.test', originHost:'audit.origin.test', mode:'fresh', origin:null, status:502},
];
const edge = 'edge.lab.test';

function checkPeer(peer, name) {
 assert.equal(peer.verified_name, name);
 assert.deepEqual(peer.certificate_names, [name]);
 assert.match(peer.protocol, /^TLSv1\.[23]$/);
}

function check(record) {
 assert.equal(record.status, 'passed');
 assert.deepEqual(record.source_sha256, {[script]:digest(pack + '/' + script)});
 for (const key of ['python', 'ssl', 'openssl_cli']) assert(record.environment[key]);
 assert.equal(record.responses.length, scenarios.length);
 for (const [index, expected] of scenarios.entries()) {
  const response = record.responses[index];
  const upstream = response.upstream;
  assert.equal(response.request, expected.id);
  assert.equal(response.host, expected.host);
  assert.equal(response.status, expected.status);
  checkPeer(response.edge_peer, edge);
  assert.equal(upstream.backend, expected.backend);
  assert.equal(upstream.mode, expected.mode);
  assert.equal(upstream.tls_name, expected.name);
  assert.equal(upstream.http_host, expected.originHost);
  if (expected.origin) {
   checkPeer(upstream.peer, expected.name);
   assert.deepEqual(response.result, {order:'O-104', total:37, origin:expected.backend, connection:expected.origin});
  } else {
   assert.equal(upstream.peer, undefined);
   assert.deepEqual(response.result, {error:'origin certificate verification failed'});
   assert.match(upstream.verification_error, /hostname mismatch/i);
  }
 }
 const {P, A, B} = record.listeners;
 assert.deepEqual(P.sni_attempts, scenarios.map(() => edge));
 assert.deepEqual(P.handshakes, scenarios.map(row => ({connection:row.front, sni:edge})));
 assert.deepEqual(P.http_requests, scenarios.map(row => ({request:row.id, host:row.host, sni:edge, connection:row.front})));
 for (const [listener, label] of [[A, 'A'], [B, 'B']]) {
  const rows = scenarios.filter(row => row.backend === label);
  const complete = rows.filter(row => row.origin);
  assert.deepEqual(listener.sni_attempts, rows.filter(row => row.mode === 'fresh').map(row => row.name));
  assert.deepEqual(listener.handshakes, complete.filter(row => row.mode === 'fresh')
   .map(row => ({connection:row.origin, sni:row.name})));
  assert.deepEqual(listener.http_requests, complete.map(row =>
   ({request:row.id, host:row.originHost, sni:row.name, connection:row.origin})));
 }
}

check(record);
const fake = structuredClone(record);
fake.listeners.B.http_requests.push({request:'bad', host:'audit.origin.test', sni:'a.origin.test', connection:'B-2'});
assert.throws(() => check(fake), assert.AssertionError);
const unsafe = structuredClone(record);
unsafe.responses[3].upstream.mode = 'reused';
assert.throws(() => check(unsafe), assert.AssertionError);

const diagram = read('dist/diagrams/tls-proxy-hops.svg');
assert.match(diagram, /<title id="title">[^<]+<\/title>/);
assert.match(diagram, /<desc id="desc">[^<]+<\/desc>/);
assert.deepEqual(JSON.parse(diagram.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 front:record.listeners.P.http_requests.map(row => row.connection),
 origin:record.responses.map(row => row.result.connection ?? null),
 statuses:record.responses.map(row => row.status),
 failed_sni:record.listeners.B.sni_attempts.at(-1),
});

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys
folder = Path(sys.argv[1])
files = ["README.md", "tls_proxy_hops.py", "validation.json"]
with ZipFile(folder.with_suffix(".zip")) as bundle:
    assert bundle.namelist() == [folder.name + "/" + name for name in files]
    for name in files:
        assert bundle.read(folder.name + "/" + name) == (folder / name).read_bytes()
`, path.join(root, pack)], {timeout:10000});

const context = vm.createContext({});
for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
 if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename:file});
}
const expression = 'articleById("vpc-network").sections';
const sections = JSON.parse(JSON.stringify(vm.runInContext(expression, context)));
const baseline = require('./content-at-commit.cjs').evaluate('fa497003e7a578da416b89f6105f90df9f8c0cbe', expression);
const boundary = '<h3 id="native-tls-proxy">';
const [retained, added] = sections[6][1].split(boundary);
assert(added && !added.includes(boundary));
assert.deepEqual(sections.slice(0, 6), baseline.slice(0, 6));
assert.equal(sections[6][0], baseline[6][0]);
assert.equal(retained, baseline[6][1]);
for (const asset of [
 'diagrams/tls-proxy-hops.svg', 'labs/tls-proxy-hops.zip',
 'labs/tls-proxy-hops/README.md', 'labs/tls-proxy-hops/tls_proxy_hops.py',
 'labs/tls-proxy-hops/validation.json',
]) assert(added.includes(asset), asset);

if (process.env.TLS_PROXY_PYTHON) {
 const arguments = ['-B', path.join(root, pack, script)];
 if (process.env.TLS_PROXY_OPENSSL) arguments.push('--openssl', process.env.TLS_PROXY_OPENSSL);
 check(JSON.parse(execFileSync(process.env.TLS_PROXY_PYTHON, arguments, {encoding:'utf8', timeout:30000})));
}
console.log('PASS TLS proxy hops: independent trust, upstream connection reuse, hostname rejection before origin HTTP, and exact chapter history');
