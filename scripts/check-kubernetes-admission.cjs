/* Verify the API's raw authorization, admission, and independently read results. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const pack = 'kubernetes-admission';
const folder = path.join(dist, 'labs', pack);
const source = ['go.mod', 'go.sum', 'main.go'];
const files = ['README.md', ...source, 'validation.json'];
const anchor = 'native-kubernetes-admission';
const articleRoute = '/article/iam-security/';
const recordURL = 'labs/' + pack + '/validation.json';
const username = 'report-writer';
const policyName = 'reports-no-privileged';
const policyMessage = 'report containers must not run privileged';
const read = name => fs.readFileSync(path.join(folder, name));
const page = route => fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8');
const sha = data => createHash('sha256').update(data).digest('hex');
const sourceHashes = Object.fromEntries(source.map(name => [name, sha(read(name))]));
const evidence = JSON.parse(read('validation.json'));

const expected = [
 {namespace: 'report-a', name: 'safe', privileged: false, authorized: true, create: 201, get: 200},
 {namespace: 'report-a', name: 'privileged', privileged: true, authorized: true, create: 422, get: 404},
 {namespace: 'report-b', name: 'privileged', privileged: true, authorized: true, create: 201, get: 200},
 {namespace: 'report-c', name: 'privileged', privileged: true, authorized: false, create: 403, get: 404},
];

function verify(report) {
 assert.equal(report.schema, 1);
 assert.deepEqual(report.source_sha256, sourceHashes);
 const runtime = report.environment;
 assert.match(runtime.os, /^(darwin|linux)$/);
 assert.match(runtime.go, /^go1\.\d+\.\d+$/);
 assert.equal(runtime.client_go, 'v0.35.8');
 assert.equal(runtime.envtest, 'v0.23.3');
 assert.equal(runtime['kube-apiserver'].version, 'Kubernetes v1.35.0');
 assert.match(runtime.etcd.version, /^etcd Version: 3\.6\.\d+$/);
 for (const name of ['kube-apiserver', 'etcd']) assert.match(runtime[name].sha256, /^[a-f0-9]{64}$/);

 const {identity, isolation, policy, cases} = report.observations;
 assert.deepEqual(identity, {username, groups: ['system:authenticated']});
 assert.deepEqual(isolation, {hosts: {kube_apiserver: '127.0.0.1', etcd: '127.0.0.1'}, listeners_closed: true, used_existing_cluster: false});
 assert.deepEqual(policy, {name: policyName, message: policyMessage, namespace_selector: {'report-admission': 'enforced'},
  actions: ['Deny'], operations: ['CREATE'],
  expression: 'object.spec.containers.all(c, !has(c.securityContext) || !has(c.securityContext.privileged) || !c.securityContext.privileged)'});
 assert.equal(cases.length, expected.length);
 const acceptedUIDs = new Set();
 for (const [i, entry] of cases.entries()) {
  const test = expected[i];
  const {namespace, name, privileged} = test;
  assert.deepEqual(entry.request, {namespace, name, privileged});
  assert.equal(entry.authorization.allowed, test.authorized);
  if (test.authorized) assert(entry.authorization.reason.includes('RoleBinding "pod-submit/' + namespace + '"'));
  assert.equal(entry.create.code, test.create);
  assert.equal(entry.admin_get.code, test.get);
  const created = entry.create.body, stored = entry.admin_get.body;
  if (test.create === 201) {
   for (const pod of [created, stored]) {
    assert.equal(pod.kind, 'Pod');
    assert.equal(pod.metadata.namespace, namespace);
    assert.equal(pod.metadata.name, name);
    assert.match(pod.metadata.uid, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
    assert.equal(pod.spec.containers.length, 1);
    assert.equal(pod.spec.containers[0].securityContext.privileged, privileged);
    assert.equal(pod.spec.schedulerName, 'unavailable-teaching-scheduler');
   }
   assert.equal(stored.metadata.uid, created.metadata.uid);
   acceptedUIDs.add(stored.metadata.uid);
   continue;
  }
  assert.equal(created.kind, 'Status');
  assert.equal(created.status, 'Failure');
  assert.equal(created.code, test.create);
  if (test.create === 422) {
   assert.equal(created.reason, 'Invalid');
   assert(created.message.includes('ValidatingAdmissionPolicy') && created.message.includes(policyName) && created.message.includes(policyMessage));
   assert(created.details.causes.some(cause => cause.message.includes(policyMessage)));
  } else {
   assert.equal(created.reason, 'Forbidden');
   assert(created.message.includes('User "' + username + '" cannot create resource "pods"'));
   assert(created.message.includes(namespace));
  }
  assert.equal(stored.kind, 'Status');
  assert.equal(stored.code, 404);
  assert.equal(stored.reason, 'NotFound');
  assert.deepEqual(stored.details, {name, kind: 'pods'});
 }
 assert.equal(acceptedUIDs.size, 2);
 return {record: recordURL, identity: username, namespaces: cases.map(entry => entry.request.namespace),
  authorized: cases.map(entry => entry.authorization.allowed), create: cases.map(entry => entry.create.code),
  admin_get: cases.map(entry => entry.admin_get.code)};
}

const observations = verify(evidence);
for (const mutate of [
 data => { data.observations.cases[1].authorization.allowed = false; },
 data => { data.observations.cases[1].create.body.reason = 'Forbidden'; },
 data => { data.observations.cases[1].admin_get.body.reason = 'Forbidden'; },
 data => { data.observations.cases[2].admin_get.body.spec.containers[0].securityContext.privileged = false; },
 data => { data.observations.cases[2].admin_get.body.metadata.uid = data.observations.cases[0].create.body.metadata.uid; },
 data => { data.observations.cases[3].create.body.message = 'pod invalid'; },
 data => { data.observations.isolation.hosts.kube_apiserver = '0.0.0.0'; },
]) {
 const modified = structuredClone(evidence);
 mutate(modified);
 assert.throws(() => verify(modified), assert.AssertionError);
}

const assets = process.env.K8S_ADMISSION_ASSETS;
if (assets) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-admission-replay-'));
 try {
  const output = path.join(temp, 'validation.json');
  execFileSync('go', ['run', '-mod=readonly', '.', '--assets', path.resolve(assets), '--output', output],
   {cwd: folder, timeout: 180000, stdio: 'inherit'});
  assert.deepEqual(verify(JSON.parse(fs.readFileSync(output))), observations);
 } finally {
  fs.rmSync(temp, {recursive: true, force: true});
 }
}

const zip = folder + '.zip';
execFileSync('unzip', ['-tqq', zip]);
const entries = execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(name => pack + '/' + name));
for (const name of files) assert.deepEqual(execFileSync('unzip', ['-p', zip, pack + '/' + name]), read(name), name);

const article = page(articleRoute);
const marker = 'id="' + anchor + '"';
assert.equal(article.split(marker).length, 2, 'unique published admission anchor');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-7">'));
for (const href of ['labs/' + pack + '.zip', recordURL, 'diagrams/' + pack + '.svg']) assert(article.includes(href), href);
const securityPoint = page('module/cloud-security').match(/<section class="knowledge-point" id="knowledge-execution-security">([\s\S]*?)<\/section>/)?.[1];
assert(securityPoint?.includes(articleRoute + '#' + anchor));
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-cloud-kubernetes-admission">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes(articleRoute + '#' + anchor));
const svg = fs.readFileSync(path.join(dist, 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(svg) && /<desc\b/.test(svg), 'diagram has an accessible title and description');
const metadata = svg.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram binds results to original record');
assert.deepEqual(JSON.parse(metadata), observations);
console.log('PASS: Kubernetes same-subject authorization, real CEL admission and independent object GET, isolated cleanup, exact source, archive and reading paths.');
