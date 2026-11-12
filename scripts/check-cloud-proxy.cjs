/* Independent facts: actual accepted sockets, backend requests, drain sequence and DB rows. */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const vm = require('vm');
const assert = require('assert/strict');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'dist/labs/cloud-proxy');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const record = JSON.parse(fs.readFileSync(path.join(folder, 'validation.json')));

function verifyFacts(result) {
  const p = result.positive, bad = result.unsafe_write_retry;
  const of = (bundle, kind) => bundle.events.filter(e => e.kind === kind);
  const requests = (bundle, rid) => of(bundle, 'backend_request').filter(e => e.rid === rid);
  const same = (got, expected) => assert.deepEqual(got, expected);
  const outcome = (reply, status, attempts) => same([reply.status, reply.attempts], [status, attempts]);
  outcome(p.wrong_host, 421, 0);
  same(requests(p, 'wrong-host'), []);
  same(p.reuse.map(r => [r.status, r.attempts, r.body.total, r.body.order]),
    Array.from({length: 3}, () => [200, 1, 37, 'O-104']));
  same(p.reuse.map(r => r.front_connection), ['P-c1', 'P-c1', 'P-c2']);
  same(p.reuse.map(r => r.backend_connection), ['A-c1', 'A-c1', 'A-c1']);

  // These are actual accept events, independent of the proxy's response headers.
  const accepts = of(p, 'accepted');
  same(Object.fromEntries(['P', 'A', 'B'].map(name => [name, accepts.filter(e => e.server === name).length])),
    {P: 3, A: 1, B: 2});
  for (const bundle of [p, bad]) {
    same(bundle.events.map(e => e.seq), bundle.events.map((_, i) => i + 1));
    for (const upstream of of(bundle, 'upstream_attempt')) {
      const accepted = of(bundle, 'accepted').filter(e => e.server === upstream.backend &&
        JSON.stringify(e.local) === JSON.stringify(upstream.peer) &&
        JSON.stringify(e.peer) === JSON.stringify(upstream.local));
      assert.equal(accepted.length, 1, 'Every upstream socket must match a separately accepted backend socket');
      const received = requests(bundle, upstream.rid).filter(e => e.attempt === upstream.attempt &&
        e.backend === upstream.backend && e.connection === accepted[0].connection);
      assert.equal(received.length, 1, 'Every attempt must reach its claimed backend connection');
    }
    for (const request of of(bundle, 'backend_request')) {
      assert.equal(request.host, 'orders.internal.test');
      const accepted = of(bundle, 'accepted').find(e => e.connection === request.connection);
      assert(accepted && accepted.server === request.backend);
      assert.equal(of(bundle, 'upstream_attempt').filter(e => e.rid === request.rid && e.attempt === request.attempt).length, 1);
    }
    for (const front of of(bundle, 'front_request')) {
      const accepted = of(bundle, 'accepted').find(e => e.connection === front.connection);
      assert(accepted && accepted.server === 'P');
      assert.equal(front.host, front.rid === 'wrong-host' ? 'other.lab.test' : 'orders.lab.test');
      const received = of(bundle, 'client_received').filter(e => e.rid === front.rid);
      assert.equal(received.length, 1, 'Driver must read one complete client response');
      assert(received[0].seq > front.seq);
    }
  }
  const backendOrder = rid => requests(p, rid).map(e => [e.backend, e.attempt]);
  for (const rid of ['reuse-1', 'reuse-2', 'reuse-other-front']) {
    same(backendOrder(rid), [['A', 1]]);
    assert.equal(requests(p, rid)[0].connection, 'A-c1');
  }
  same(p.drain_start, {active: 1, new_assignments_allowed: false});
  outcome(p.during_drain, 200, 1);
  outcome(p.held_completed, 200, 1);
  same(backendOrder('drain-held'), [['B', 1]]);
  same(backendOrder('drain-new'), [['A', 1]]);
  const one = (kind, rid) => p.events.find(e => e.kind === kind && (rid === undefined || e.rid === rid));
  const held = one('backend_request', 'drain-held').seq;
  const drain = one('drain_started').seq;
  const fresh = one('backend_request', 'drain-new').seq;
  const freshDone = one('client_received', 'drain-new').seq;
  const heldDone = one('upstream_response', 'drain-held').seq;
  const drained = one('drain_finished').seq;
  assert(held < drain && drain < fresh && fresh < freshDone && freshDone < heldDone && heldDone < drained);
  assert(drained < one('client_received', 'drain-held').seq);
  assert(!of(p, 'backend_request').some(e => e.backend === 'B' && e.seq > drain && e.seq < drained));

  outcome(p.get_retry, 200, 2);
  same(backendOrder('transient'), [['B', 1], ['A', 2]]);
  same(of(p, 'upstream_response').filter(e => e.rid === 'transient').map(e => e.status), [503, 200]);
  outcome(p.retry_exhausted, 503, 2);
  same(backendOrder('always-busy'), [['B', 1], ['A', 2]]);
  outcome(p.shared_budget_timeout, 504, 1);
  same(backendOrder('slow-first'), [['B', 1]]);
  outcome(p.write_unknown, 502, 1);
  assert.equal(p.write_unknown.body.write_result_unknown, true);
  same(backendOrder('write-unknown'), [['A', 1]]);
  same(p.effects, [{rid: 'write-unknown', backend: 'A', total: 37}]);
  same(of(p, 'effect_committed').map(e => [e.rid, e.backend, e.total]), [['write-unknown', 'A', 37]]);
  outcome(bad.response, 502, 2);
  same(requests(bad, 'write-unsafe').map(e => [e.backend, e.attempt]), [['A', 1], ['B', 2]]);
  same(bad.effects, [{rid: 'write-unsafe', backend: 'A', total: 37}, {rid: 'write-unsafe', backend: 'B', total: 37}]);
  assert.equal(bad.effects.reduce((sum, row) => sum + row.total, 0), 74);
  assert.equal(of(bad, 'effect_committed').length, 2);
  assert.equal(result.scope, 'real_loopback_http1_proxy_two_backends_and_sqlite_no_tls_or_cloud');
}

assert.equal(record.status, 'passed');
assert.equal(record.checked, '2026-11-08');
for (const file of ['proxy_lab.py', 'README.md']) {
  assert.equal(record.source_sha256[file], sha(fs.readFileSync(path.join(folder, file))), file + ' executed-source binding');
}
verifyFacts(record.execution);
const fresh = JSON.parse(cp.execFileSync('python3', ['-B', path.join(folder, 'proxy_lab.py')], {
  encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024
}));
verifyFacts(fresh);

// Fail on stale generated source, rather than silently repairing it in a check.
const template = read('scripts/cloud-proxy-bridge.template.js');
const source = fs.readFileSync(path.join(folder, 'proxy_lab.py'), 'utf8');
assert.equal(read('dist/cloud-proxy-bridge.js'), template.replace('__CLOUD_PROXY_SOURCE__', () => JSON.stringify(source)));

// Evaluate the canonical author pipeline, never the generated app/runtime bundle.
const context = {};
vm.createContext(context);
let loaded = false;
for (const [,file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
  if (file === 'app.js' || file === 'cloud-proxy-bridge.js') continue;
  vm.runInContext(read('dist/' + file), context, {filename: file});
  if (file === 'capacity-roofline-observation.js') {
    vm.runInContext(read('dist/cloud-proxy-bridge.js'), context, {filename: 'cloud-proxy-bridge.js'});
    loaded = true;
  }
}
assert(loaded, 'Expected integration slot after capacity-roofline-observation.js');
const article = JSON.parse(JSON.stringify(vm.runInContext('articleById("vpc-network")', context)));
const baseline = require('./content-at-commit.cjs').evaluate('b06a0633d54a0ecfad39e6e3d55850a0caa0d36e', 'articleById("vpc-network")');
assert.equal(article.sections.length, 7);
assert.deepEqual(article.sections.map(s => s[0]), baseline.sections.map(s => s[0]));
const reviewedBodies = JSON.parse(read('docs/POST_WINDOW_BODY_REVIEWS.json')).revisions;
const latestBodyReview = reviewedBodies.findLast(row => row.id === article.id && row.previous_content_sha256 !== row.reviewed_content_sha256);
const publicationDate = (latestBodyReview?.reviewed_at || '2026-11-08').slice(0, 10).replaceAll('-', '.');
assert.equal(article.updated, publicationDate, 'VPC date must match the reviewed body revision');
assert.equal(article.minutes, 45);
const oldBody = baseline.sections.map(s => s[1]).join('\n');
const body = article.sections.map(s => s[1]).join('\n');
const pre = html => [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)].map(m => m[0]);
const oldBlocks = pre(oldBody), blocks = pre(body);
let position = 0;
for (const old of oldBlocks) {
  const found = blocks.indexOf(old, position);
  assert(found >= position, 'Old complete pre block changed or reordered');
  position = found + 1;
}
assert.equal(blocks.length, oldBlocks.length + 2);
for (const [,id] of oldBody.matchAll(/\bid="([^"]+)"/g)) assert(body.includes('id="' + id + '"'), 'Lost old inner ID: ' + id);
const sourceHtml = vm.runInContext('trainingCode("proxy_lab.py", "Python", cloudProxyLabSource)', context);
assert(body.includes(sourceHtml), 'Complete inline source must match the downloadable source');
assert(body.includes('id="cloud-proxy-run"'));
assert(body.includes('v43-route-practice'));
const layerIndex=body.indexOf('id="subsection-6-p8ekpv"'),runIndex=body.indexOf('id="cloud-proxy-run"'),practiceIndex=body.indexOf('id="v43-route-practice"');
assert(layerIndex>=0&&runIndex>layerIndex,'Transfer layers precede the source-matched proxy run');
assert(practiceIndex>runIndex,'The round-trip exercise follows the actual proxy run');

const drainAnchor = 'proxy-drain-readback';
const drainBody = vm.runInContext('articleById("elasticity").sections[5][1]', context).split('id="' + drainAnchor + '"')[1];
const proxySteps = record.execution.positive.events;
const drainStep = (kind, rid) => proxySteps.find(e => e.kind === kind && (!rid || e.rid === rid)).seq;
const started = drainStep('drain_started');
const sentToA = drainStep('backend_request', 'drain-new');
const newReceived = drainStep('client_received', 'drain-new');
const heldRead = drainStep('upstream_response', 'drain-held');
const finished = drainStep('drain_finished');
const heldReceived = drainStep('client_received', 'drain-held');
for (const sequence of [started, [sentToA, newReceived].join(' → '), [heldRead, finished, heldReceived].join(' → ')]) {
  assert(drainBody?.includes('<td>' + sequence + '</td>'), 'Drain table must use published event sequence: ' + sequence);
}
assert(drainBody.includes('href="/labs/cloud-proxy/validation.json"'));
assert(drainBody.includes('href="/article/vpc-network/#cloud-proxy-run"'));
assert(body.split('id="subsection-7-g5284x"')[1]?.split('id="subsection-7-a6sxak"')[0]
  .includes('href="/article/elasticity/#' + drainAnchor + '"'));
assert.equal(800 - 80 - 120, 600);
assert.equal(2 * 250 + 100, 600);
assert.equal(600 - 430 - 100, 70);
assert.equal(3 * 2 * 2, 12);

// Fixed diagram metadata is checked against independently observed runtime identities.
const diagram = name => {
  const svg = read('dist/diagrams/cloud-proxy-' + name + '.svg');
  assert(svg.includes('<title id="title">') && svg.includes('<desc id="desc">'));
  const metadata = svg.match(/<metadata>(.*?)<\/metadata>/s)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return JSON.parse(metadata);
};
assert.deepEqual(diagram('two-legs').fronts, [...new Set(fresh.positive.reuse.map(r => r.front_connection))]);
assert.deepEqual(diagram('two-legs').reuse_backend_connections, [...new Set(fresh.positive.reuse.map(r => r.backend_connection))]);
assert.equal(diagram('two-legs').reuse_requests, fresh.positive.reuse.length);
assert.equal(diagram('drain').drain_active, fresh.positive.drain_start.active);
assert.equal(diagram('drain').held_backend, fresh.positive.held_completed.body.backend);
assert.equal(diagram('drain').new_backend, fresh.positive.during_drain.body.backend);
assert.equal(diagram('drain').drained_connection, fresh.positive.held_completed.backend_connection);

const opening = vm.runInContext('articleById("cloud-overview").sections[1][1]', context);
assert(opening.includes('https://api.example.test/orders/O-104') && opening.includes('/article/vpc-network/#section-1'));
assert(opening.includes('id="cloud-first-request-trace"') && opening.includes('/article/vpc-network/#cloud-proxy-run'));
const traceFigure = read('dist/diagrams/cloud-order-proxy-trace.svg');
assert(traceFigure.includes('<title id="title">') && traceFigure.includes('<desc id="desc">'));
const trace = JSON.parse(traceFigure.match(/<metadata>(.*?)<\/metadata>/s)[1]);
assert(opening.includes('diagrams/cloud-order-proxy-trace.svg') && opening.includes('/labs/cloud-proxy/validation.json'));
for (const run of [record.execution.positive, fresh.positive]) {
  const event = kind => run.events.find(row => row.rid === trace.request && row.kind === kind);
  const front = event('front_request'), backend = event('backend_request');
  const order = run.reuse[0].body;
  assert.deepEqual([front.path, backend.path], [trace.path, trace.path]);
  assert.deepEqual([front.connection, backend.connection], [trace.front, trace.backend]);
  assert.deepEqual([event('upstream_response').status, event('client_received').status], [trace.status, trace.status]);
  assert.deepEqual([order.status, order.total], [trace.order_status, trace.total]);
  assert.deepEqual(run.events.filter(row => row.rid === trace.request && trace.events.includes(row.kind)).map(row => row.kind), trace.events);
}

cp.execFileSync('python3', ['-c', `
from pathlib import Path
import sys,zipfile
root=Path(sys.argv[1]); folder=root/'dist/labs/cloud-proxy'
with zipfile.ZipFile(folder.parent/'cloud-proxy.zip') as z:
    expected={'cloud-proxy/'+name for name in ['proxy_lab.py','README.md','validation.json']}
    assert set(z.namelist())==expected
    for member in z.namelist():
        assert z.read(member)==(folder/Path(member).name).read_bytes(), member
`, root], {encoding: 'utf8'});
console.log('Cloud proxy: stored + fresh TCP/HTTP/SQLite oracles passed; three figures/source/ZIP bound, including the opening four-event trace; 7 VPC headings and old code preserved; +2 historical code blocks.');
