/* Check the published QMP, procfs, elapsed-time and ownership records independently. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'dist/labs/qemu-vcpu');
const read = name => fs.readFileSync(path.join(folder, name));
const json = name => JSON.parse(read(name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const record = json('validation.json');
const linux = json('linux-observation.json');
const darwin = json('darwin-observation.json');
const files = ['README.md', 'vcpu_probe.py', 'linux-observation.json', 'darwin-observation.json'];

assert.equal(record.status, 'passed');
assert.equal(record.origin.linux_run_url, 'https://github.com/CaptainGreenskin/infra-guide/actions/runs/42966772719');
assert.equal(record.origin.linux_source_commit, '8d1be31eb5dd7cea17477ec366f08eb0301ce896');
assert.equal(record.origin.linux_artifact, 'native-qemu-vcpu/linux.json');
assert.deepEqual(record.scope, {accelerator:'tcg,thread=multi',guest_os:false,kvm:false,production_workload:false});
assert.deepEqual(record.source_sha256, Object.fromEntries(files.map(name => [name, sha(read(name))])));
assert.equal(record.source_sha256['linux-observation.json'], 'c61aa42b14af6267c0031d985f2f5442604796e2545a6371c3a2acfa45d03494');

function readWindows(observation) {
  const detail = observation.linux;
  assert.deepEqual([observation.host.system, observation.host.arch], ['Linux', 'x86_64']);
  assert.match(observation.qemu_version, /QEMU emulator version 8\.2\.2/);
  assert.equal(detail.schedstats_setting, '1');
  assert.equal(detail.observed_vcpu, 0);
  assert.equal(detail.running.status, 'running');
  assert.equal(detail.running.running, true);
  assert.equal(detail.stopped.status, 'paused');
  assert.equal(detail.stopped.running, false);
  assert.deepEqual(observation.qmp_events, ['RESUME', 'STOP', 'SHUTDOWN']);
  assert.equal(detail.proc_threads.length, 2);
  const tids = observation.cpus.map(cpu => cpu['thread-id']);
  assert.equal(new Set([observation.qemu_pid, ...tids, detail.contender_pid]).size, 4);
  for (const [index, row] of detail.proc_threads.entries()) {
    assert.equal(row.cpu_index, index);
    assert.equal(row.tgid, observation.qemu_pid);
    assert.equal(row.pid, tids[index]);
    assert.equal(row.schedstat, `/proc/${row.tgid}/task/${row.pid}/schedstat`);
  }
  assert.equal(detail.allowed_host_cpus.length, 1);
  assert.deepEqual(detail.contender_affinity, detail.allowed_host_cpus);
  const compare = window => {
    assert(Number.isSafeInteger(window.elapsed_ns));
    assert(window.elapsed_ns >= 1_500_000_000 && window.elapsed_ns < 1_600_000_000);
    assert.equal(window.before.length, 3);
    assert.equal(window.after.length, 3);
    for (const value of [...window.before, ...window.after]) assert(Number.isSafeInteger(value) && value >= 0);
    const delta = window.after.map((value, index) => value - window.before[index]);
    assert(delta.every(value => value > 0));
    assert.deepEqual(window.delta, delta);
    assert(delta[0] + delta[1] <= window.elapsed_ns + 4_000_000);
    return delta;
  };
  const alone = compare(detail.alone);
  const shared = compare(detail.same_cpu_contender);
  assert(detail.same_cpu_contender.before.every((value, index) => value >= detail.alone.after[index]));
  assert(alone[0] > shared[0] && alone[1] < shared[1]);
  assert(shared[1] - alone[1] > detail.same_cpu_contender.elapsed_ns * .25);
  assert(detail.contender_runtime_ns > detail.same_cpu_contender.elapsed_ns * .25);
  assert(shared[0] + detail.contender_runtime_ns <= detail.same_cpu_contender.elapsed_ns + 4_000_000);
  return {tids, alone, shared};
}

for (const observation of [linux, darwin]) {
  assert.equal(observation.source_sha256, record.source_sha256['vcpu_probe.py']);
  assert.equal(observation.accelerator, record.scope.accelerator);
  assert.equal(observation.guest_payload_hex, '00000014');
  assert.deepEqual(observation.cpus.map(cpu => cpu['cpu-index']), [0, 1]);
  assert(observation.cpus.every(cpu => cpu.target === 'aarch64' && cpu.props['thread-id'] === 0));
  assert.equal(observation.prelaunch.status, 'prelaunch');
  assert.equal(observation.prelaunch.running, false);
}
const {tids, alone, shared} = readWindows(linux);
assert.deepEqual([darwin.host.system, darwin.host.arch], ['Darwin', 'arm64']);
assert.equal(darwin.qemu_version, 'QEMU emulator version 11.0.0');
assert.equal(darwin.linux, null);
assert.deepEqual(darwin.cpus.map(cpu => cpu['thread-id']), [darwin.qemu_pid, darwin.qemu_pid]);
assert.deepEqual(darwin.qmp_events, ['SHUTDOWN']);
for (const alter of [
  value => { value.linux.proc_threads[0].pid = value.qemu_pid; },
  value => { value.linux.same_cpu_contender.delta[1] = 0; },
  value => { value.linux.contender_affinity = [99]; },
  value => { value.linux.same_cpu_contender.elapsed_ns = 700_000_000; }
]) {
  const changed = JSON.parse(JSON.stringify(linux));
  alter(changed);
  assert.throws(() => readWindows(changed), {code:'ERR_ASSERTION'});
}

const svg = fs.readFileSync(path.join(root, 'dist/diagrams/qemu-vcpu-scheduling.svg'), 'utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]), {
  record: 'labs/qemu-vcpu/linux-observation.json',
  qemu_pid: linux.qemu_pid,
  vcpu_threads: tids,
  observed_vcpu: linux.linux.observed_vcpu,
  host_cpu: linux.linux.allowed_host_cpus[0],
  execute_ns: [alone[0], shared[0]],
  wait_ns: [alone[1], shared[1]],
  elapsed_ns: [linux.linux.alone.elapsed_ns, linux.linux.same_cpu_contender.elapsed_ns]
});
const widths = [...svg.matchAll(/<rect [^>]*width="([\d.]+)" height="32"[^>]*>/g)].map(match => Number(match[1]));
const bar = (run, wait) => Math.round(72000 * run / (run + wait)) / 100;
assert.deepEqual(widths, [bar(...alone), bar(...shared), bar(shared[1], shared[0])]);

execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys
folder = Path(sys.argv[1])
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == sorted(f"{folder.name}/{name}" for name in sys.argv[2:])
    for name in sys.argv[2:]:
        assert archive.read(f"{folder.name}/{name}") == (folder / name).read_bytes(), name
`, folder, ...files, 'validation.json']);

if (!process.argv.includes('--record-only')) {
  const html = fs.readFileSync(path.join(root, 'dist/article/cloud-compute/index.html'), 'utf8');
  const start = html.indexOf('id="native-qemu-vcpu"');
  const end = html.indexOf('id="section-3"', start);
  assert(start > html.indexOf('id="vm-vcpu-diagnosis"') && end > start);
  const lesson = html.slice(start, end);
  for (const marker of ['1,499.795 ms', '0.200 ms', '750.397 ms', '749.599 ms', 'diagrams/qemu-vcpu-scheduling.svg', '/labs/qemu-vcpu.zip', '/labs/qemu-vcpu/linux-observation.json', '/labs/qemu-vcpu/darwin-observation.json']) {
    assert(lesson.includes(marker), marker);
  }
}
console.log('PASS: native QEMU thread identities, two Linux run-queue windows, Darwin comparison, four mutation controls, bound diagram and exact source ZIP.');
