/* Check the observed Git signers, artifact bytes, and active release independently. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const pack = 'release-artifact-trust';
const folder = path.join(dist, 'labs', pack);
const source = 'release_artifact_trust.py';
const files = ['README.md', source, 'validation.json'];
const anchor = 'native-release-artifact-trust';
const articleRoute = '/article/delivery/';
const recordURL = 'labs/' + pack + '/validation.json';
const read = name => fs.readFileSync(path.join(folder, name));
const page = route => fs.readFileSync(path.join(dist, route, 'index.html'), 'utf8');
const sourceHash = createHash('sha256').update(read(source)).digest('hex');
const evidence = JSON.parse(read('validation.json'));
const trusted = 'release-ci@infraguide.test';
const other = 'other-ci@infraguide.test';
const v1 = 'report-v1', v2 = 'report-v2';
const digests = {
 [v1]: 'bb159caa99aac2f5ae700777d6447a5693464fc02188418ab40f1eae5aa72a20',
 [v2]: '7781f3e1b5a8d2742c6f25736cf3bbf3ff6a27fb783243bd4b7614d16e5db011',
};
const scenarios = [
 ['trusted_match', v1, v1, 0, true, true],
 ['alias_moved', v1, v2, 0, false, false],
 ['other_signer', v2, v2, 1, true, false],
 ['pinned_match', v1, v1, 0, true, true],
];

function verify(record) {
 assert.equal(record.schema, 1);
 assert.deepEqual(record.source_sha256, {[source]: sourceHash});
 assert.equal(record.temporary_workspace_removed, true);
 assert.match(record.environment.git, /^git version 2\.\d+/);
 assert.match(record.environment.openssh, /^OpenSSH_/);
 assert.match(record.environment.platform, /^(Darwin|Linux)$/);
 const {trusted_principal, other_principal, other_signer_check, no_git_remotes, artifact_digests, cases} = record.observations;
 assert.equal(trusted_principal, trusted);
 assert.equal(other_principal, other);
 assert.equal(no_git_remotes, true);
 assert.deepEqual(artifact_digests, digests);
 assert.deepEqual(Object.keys(cases), scenarios.map(([name]) => name));

 const signerOutput = result => result.stdout + result.stderr;
 const fingerprint = result => {
  const key = signerOutput(result).match(/ED25519 key SHA256:([A-Za-z0-9+/=]+)/)?.[1];
  assert(key, 'native Git signature output includes the key fingerprint');
  return key;
 };
 assert.equal(other_signer_check.returncode, 0);
 assert(signerOutput(other_signer_check).includes('Good "git" signature for ' + other));
 const otherKey = fingerprint(other_signer_check);
 const trustedKey = fingerprint(cases.trusted_match.signature);
 assert.notEqual(trustedKey, otherKey);
 assert.notEqual(cases.trusted_match.revision, cases.other_signer.revision);
 assert.equal(cases.trusted_match.revision, cases.alias_moved.revision, 'same signed manifest after alias changes');
 assert.equal(cases.trusted_match.revision, cases.pinned_match.revision);

 for (const [name, manifestVersion, candidateVersion, exit, matches, approved] of scenarios) {
  const item = cases[name];
  assert.match(item.revision, /^[a-f0-9]{40}$/);
  assert.deepEqual(item.manifest, {service: 'reports', version: manifestVersion, artifact_sha256: digests[manifestVersion]});
  assert.equal(item.candidate_version, candidateVersion);
  assert.equal(item.candidate_sha256, digests[candidateVersion]);
  assert.equal(item.content_matches, matches);
  assert.equal(item.signature.returncode, exit);
  assert.equal(item.approved, approved);
  assert.equal(item.approved, item.signature.returncode === 0 && item.candidate_sha256 === item.manifest.artifact_sha256);
  assert.deepEqual(item.active_readback, {sha256: digests[v1], version: v1});
  if (exit === 0) {
   assert(signerOutput(item.signature).includes('Good "git" signature for ' + trusted));
   assert.equal(fingerprint(item.signature), trustedKey);
  } else {
   assert(signerOutput(item.signature).includes('No principal matched.'));
   assert.equal(fingerprint(item.signature), otherKey);
  }
 }
 const rows = Object.values(cases);
 return {record: recordURL, case_order: Object.keys(cases), signature_status: rows.map(row => row.signature.returncode),
  content_matches: rows.map(row => row.content_matches), activated: rows.map(row => row.approved),
  active: rows.map(row => row.active_readback.version)};
}

const observations = verify(evidence);
for (const mutate of [
 data => { data.observations.cases.alias_moved.content_matches = true; },
 data => { data.observations.cases.alias_moved.revision = data.observations.cases.other_signer.revision; },
 data => { data.observations.cases.alias_moved.active_readback = {sha256: digests[v2], version: v2}; },
 data => { data.observations.cases.other_signer.signature.returncode = 0; },
 data => { data.observations.cases.other_signer.approved = true; },
 data => { data.observations.cases.pinned_match.candidate_sha256 = digests[v2]; },
 data => { data.observations.other_signer_check.returncode = 1; },
]) {
 const modified = structuredClone(evidence);
 mutate(modified);
 assert.throws(() => verify(modified), assert.AssertionError);
}

if (process.argv.includes('--replay')) {
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'infra-artifact-replay-'));
 try {
  const output = path.join(temp, 'validation.json');
  execFileSync('python3', ['-B', path.join(folder, source), '--output', output], {timeout: 60000, stdio: 'inherit'});
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
assert.equal(article.split(marker).length, 2, 'unique published release trust anchor');
const start = article.indexOf(marker);
const section = article.lastIndexOf('<section class="article-section"', start);
assert(article.slice(section, start).startsWith('<section class="article-section" id="section-1">'));
for (const href of ['labs/' + pack + '.zip', recordURL, 'diagrams/' + pack + '.svg']) assert(article.includes(href), href);
const artifactPoint = page('module/cloud-delivery').match(/<section class="knowledge-point" id="knowledge-artifact-contract">([\s\S]*?)<\/section>/)?.[1];
assert(artifactPoint?.includes(articleRoute + '#' + anchor));
const task = page('labs').match(/<li class="lab-learning-unit" id="lab-cloud-release-artifact-trust">([\s\S]*?)<\/li>/)?.[1];
assert(task?.includes(articleRoute + '#' + anchor));
const svg = fs.readFileSync(path.join(dist, 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(svg) && /<desc\b/.test(svg), 'diagram has an accessible title and description');
const metadata = svg.match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1];
assert(metadata, 'diagram binds results to original record');
assert.deepEqual(JSON.parse(metadata), observations);
console.log('PASS: native Git signature and trusted signer, exact artifact digest and active readbacks, source, archive, diagram and reading paths.');
