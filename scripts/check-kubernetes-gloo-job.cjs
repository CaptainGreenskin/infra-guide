/* Verify the native kind record and compute the DDP update independently. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { isIPv4 } = require('node:net');
const path = require('node:path');

const name = 'kubernetes-gloo-job';
const pack = path.join(__dirname, '..', 'dist', 'labs', name);
const sourceFiles = ['Dockerfile', 'job.json', 'rank_step.py', 'observe_job.py'];
const read = file => readFileSync(path.join(pack, file));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, sha256(read(file))]));
const manifest = JSON.parse(read('job.json'));
const service = manifest.items.find(item => item.kind === 'Service');
const jobSpec = manifest.items.find(item => item.kind === 'Job');
const podSpec = jobSpec.spec.template.spec;
const jobName = jobSpec.metadata.name;
const portName = service.spec.ports[0].name;

assert.deepEqual([jobSpec.spec.completionMode, jobSpec.spec.completions, jobSpec.spec.parallelism],
  ['Indexed', 2, 2]);
assert.deepEqual(podSpec.nodeSelector, { 'infraguide-role': 'ddp' });
assert.deepEqual(service.spec.selector, jobSpec.spec.template.metadata.labels);
assert.deepEqual([service.spec.clusterIP, service.spec.publishNotReadyAddresses, podSpec.subdomain],
  ['None', true, service.metadata.name]);
const affinity = podSpec.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution;
assert.deepEqual(affinity, [{
  labelSelector: { matchLabels: service.spec.selector },
  topologyKey: 'kubernetes.io/hostname',
}]);
assert.equal(podSpec.containers[0].ports.find(port => port.name === portName).containerPort,
  service.spec.ports[0].port);

const initial = 1;
const learningRate = 0.1;
const targetsByRank = [[0], [3, 3, 3]];
const allTargets = targetsByRank.flat();
const localLossSums = targetsByRank.map(targets =>
  targets.reduce((sum, target) => sum + (initial - target) ** 2 / 2, 0));
const globalGradient = allTargets.reduce((sum, target) => sum + (initial - target), 0) / allTargets.length;
const updated = initial - learningRate * globalGradient;
assert.deepEqual(localLossSums, [0.5, 6]);
assert.equal(globalGradient, -1.25);
assert.equal(updated, 1.125);

function close(actual, expected, label) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-12,
    label + ': expected ' + expected + ', got ' + actual);
}

function verify(record) {
  assert.equal(record.status, 'passed');
  assert.deepEqual(record.source_sha256, sourceHashes);
  const { environment, control, job, before, after, rank_logs: ranks } = record;
  assert.match(environment.kind, /^kind v0\.33\.0(?:\s|$)/);
  assert.equal(environment.kubernetes, 'v1.35.8');
  assert.equal(environment.kind_node_image,
    'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0');
  assert.match(environment.trainer_image_id, /^sha256:[a-f0-9]{64}$/);
  assert.match(environment.cluster, /^infra-gloo-[a-f0-9]{8}$/);
  assert.deepEqual([environment.github_run_id, environment.github_sha],
    ['42599803867', 'd584451295e52d39e7027b71bd8c09bfd353845e']);
  assert.deepEqual([control.initial_worker, control.newly_labeled_worker],
    [environment.cluster + '-worker', environment.cluster + '-worker2']);

  assert.equal(job.mode, 'Indexed');
  assert.equal(job.succeeded, 2);
  assert(['0,1', '0-1'].includes(job.completed_indexes), 'the exact completed index set is {0,1}');
  assert(job.conditions.some(condition => condition.type === 'Complete' && condition.status === 'True'));
  assert(!job.conditions.some(condition => condition.type === 'Failed' && condition.status === 'True'));
  assert.match(job.uid, /\S/);
  for (const observation of [before, after]) {
    assert.deepEqual(observation.map(pod => pod.index), [0, 1]);
    assert.equal(new Set(observation.map(pod => pod.uid)).size, 2);
    assert.equal(new Set(observation.map(pod => pod.pod)).size, 2);
    for (const pod of observation) {
      assert.match(pod.uid, /\S/);
      assert.notEqual(pod.uid, job.uid);
      assert.equal(pod.owner_uid, job.uid);
      assert.equal(pod.hostname, jobName + '-' + pod.index);
      assert(pod.pod.startsWith(pod.hostname + '-'), 'indexed Pod name');
    }
  }

  const bound = before.find(pod => pod.node === control.initial_worker);
  const blocked = before.find(pod => pod.node === null);
  assert(bound && blocked, 'one initial binding and one unbound Pod');
  assert.equal(blocked.phase, 'Pending');
  assert.deepEqual([blocked.pod_scheduled.status, blocked.pod_scheduled.reason],
    ['False', 'Unschedulable']);
  assert.match(blocked.pod_scheduled.message, /\S/);
  assert.equal(after[bound.index].node, control.initial_worker);
  assert.equal(after[blocked.index].node, control.newly_labeled_worker);
  for (const [index, pod] of after.entries()) {
    assert.deepEqual([pod.uid, pod.pod], [before[index].uid, before[index].pod]);
    assert.equal(pod.phase, 'Succeeded');
    assert.equal(pod.pod_scheduled.status, 'True');
    assert(isIPv4(pod.ip), 'actual Pod IPv4');
  }
  assert.notEqual(after[0].node, after[1].node);
  assert.notEqual(after[0].ip, after[1].ip);

  const expectedHost = after[0].hostname + '.' + service.metadata.name;
  assert.equal(podSpec.containers[0].env.find(item => item.name === 'MASTER_ADDR').value, expectedHost);
  assert.deepEqual(ranks.map(rank => rank.rank), [0, 1]);
  for (const rank of ranks) {
    assert.deepEqual([rank.world_size, rank.backend, rank.device, rank.torch], [2, 'gloo', 'cpu', '2.5.1+cpu']);
    assert.deepEqual([rank.node, rank.pod_ip], [after[rank.rank].node, after[rank.rank].ip]);
    assert.deepEqual([rank.master_host, rank.master_ip], [expectedHost, after[0].ip]);
    assert.deepEqual(rank.targets, targetsByRank[rank.rank]);
    assert.equal(rank.global_samples, allTargets.length);
    close(rank.local_loss_sum, localLossSums[rank.rank], 'local loss');
    close(rank.gradient, globalGradient, 'DDP gradient');
    close(rank.updated_weight, updated, 'SGD weight');
  }
}

const frozen = JSON.parse(read('validation.json'));
verify(frozen);

const dist = path.join(__dirname, '..', 'dist');
const page = id => readFileSync(path.join(dist, 'article', id, 'index.html'), 'utf8');
const collectiveAnchor = 'native-job-collective-update';
const jobAnchor = 'native-kubernetes-gloo-job';
const restartAnchor = 'native-elastic-restart-step';
const jobLesson = page('kubernetes-training').split('id="' + jobAnchor + '"')[1].split('id="section-7"')[0];
const lesson = page('training-communication').split('id="' + collectiveAnchor + '"')[1].split('id="section-8"')[0];
assert(jobLesson.includes('/article/training-communication/#' + collectiveAnchor));
assert(lesson.includes('/article/kubernetes-training/#' + jobAnchor));
assert(lesson.includes('/article/checkpoint-recovery/#' + restartAnchor));
assert(lesson.includes('/labs/' + name + '/validation.json'));
for (const rank of frozen.rank_logs) {
  const gradients = rank.targets.map(target => String(initial - target).replace('-', '−')).join('、');
  assert(lesson.includes('<tr><td>rank ' + rank.rank + '</td><td>' + rank.targets.length +
    '</td><td>' + gradients + '</td><td>' + rank.updated_weight + '</td></tr>'));
}
const restart = JSON.parse(readFileSync(path.join(dist, 'labs', 'elastic-restart-step', 'validation.json')));
const crashed = restart.cases.restarted.attempts[0].map(events => events.at(-1));
const replayed = restart.cases.restarted.attempts[1].map(events => events[1]);
for (const [rank, cut] of crashed.entries()) {
  assert.equal(cut.event, 'cut');
  assert.equal(cut.checkpoint.cursor, cut.checkpoint.history.at(-1).step);
  assert(cut.checkpoint.cursor < cut.step, 'in-memory progress cannot be read as a committed checkpoint');
  assert.equal(cut.step, replayed[rank].step);
  assert.equal(cut.weight, replayed[rank].weight);
}
assert(lesson.includes('第 ' + crashed[0].step + ' 步的权重 ' + crashed[0].weight));
assert(lesson.includes('第 ' + crashed[0].checkpoint.cursor + ' 步的权重 ' + crashed[0].checkpoint.weight));
assert(page('checkpoint-recovery').includes('id="' + restartAnchor + '"'));
for (const tamper of [
  result => result.after[0].uid += '-replacement',
  result => result.after[0].owner_uid += '-other-job',
  result => result.before.find(pod => pod.node === null).pod_scheduled.reason = 'ImagePullBackOff',
  result => result.after[1].node = result.after[0].node,
  result => result.rank_logs[1].master_ip = result.after[1].ip,
  result => result.rank_logs[1].gradient = -0.5,
  result => result.rank_logs[0].updated_weight = 1.05,
  result => result.job.completed_indexes = '0',
]) {
  const changed = structuredClone(frozen);
  tamper(changed);
  assert.throws(() => verify(changed), assert.AssertionError);
}

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
`, pack, ...sourceFiles, 'README.md', 'validation.json'], { timeout: 15000 });

console.log('PASS: kind Pending-to-two-node placement and stable identities, rank-0 DNS, indexed Job completion, independent DDP update, source and ZIP.');
