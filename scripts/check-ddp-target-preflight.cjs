/* Check the real local collectives, offline target boundaries and published evidence. */
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/ddp-target-preflight';
const folder = path.join(root, pack);
const probe = path.join(folder, 'target_probe.py');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha = file => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const tag = value => createHash('sha256').update(value).digest('hex');
const ranks = [0, 1, 2, 3];
const gathered = ranks.map(rank => rank + 1);
const sum = gathered.reduce((a, b) => a + b, 0);
const blockers = ['two_distinct_kernels', 'linux_cuda_nccl', 'cuda_binding',
 'four_distinct_full_gpu_uuids', 'matching_target_runtime'];

function check(record) {
 assert.equal(record.status, 'passed');
 assert.equal(record.target_execution, 'not_run');
 assert.deepEqual(record.source_sha256, Object.fromEntries(['target_probe.py', 'run_local.py']
  .map(name => [name, sha(pack + '/' + name)])));
 assert.deepEqual(record.local_environment, {launchers:2, physical_hosts:1, backend:'gloo', device:'cpu'});
 assert.deepEqual(record.launcher_exit_codes, [0, 0]);
 assert.equal(record.target_gate_exit_code, 2);
 assert.deepEqual(record.target_gate, {target_ready:false, blockers});
 const rows = record.rank_records;
 assert.deepEqual(rows.map(row => row.rank), ranks);
 const {boot_tag, session, system} = rows[0];
 assert.match(boot_tag, /^[0-9a-f]{64}$/);
 assert.match(session, /^[0-9a-f]{32}$/);
 assert(['Darwin', 'Linux'].includes(system));
 for (const [rank, row] of rows.entries()) {
  assert.deepEqual(row, {
   schema:1, session, source_sha256:record.source_sha256['target_probe.py'],
   rank, local_rank:rank % 2, group_rank:Math.floor(rank / 2), world_size:4, local_world_size:2,
   system, boot_tag, backend:'gloo', device:'cpu', cuda_index:null, visible_cuda_devices:0,
   full_gpu_tag:null, cuda_capability:null, torch:row.torch, cuda:null, nccl:null, gathered, sum,
  });
  assert.match(row.torch, /^2\.5\.1(?:\+cpu)?$/);
 }
}

const record = JSON.parse(read(pack + '/validation.json'));
check(record);
if (process.argv[2]) check(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));

// These target-shaped rows exercise the gate, never serve as a GPU run record.
const fake = record.rank_records.map((row, i) => ({
 ...row, system:'Linux', boot_tag:tag('fixture-boot-' + row.group_rank), backend:'nccl', device:'cuda',
 cuda_index:row.local_rank, visible_cuda_devices:2, full_gpu_tag:tag('fixture-gpu-' + i),
 cuda_capability:[12, 0], torch:'2.7.1+cu128', cuda:'12.8', nccl:[2, 26, 2],
}));
const previousRuntime = rows => rows.forEach(row => {
 row.torch = '2.5.1+cu124';
 row.cuda = '12.4';
 row.nccl = [2, 21, 5];
});
const legacy = structuredClone(fake);
previousRuntime(legacy);
legacy.forEach(row => { row.cuda_capability = [8, 0]; });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-target-gate-'));
function cli(rows, failures) {
 const files = rows.map((row, i) => {
  const name = path.join(tmp, 'rank-' + i + '.json');
  fs.writeFileSync(name, JSON.stringify(row));
  return name;
 });
 const result = spawnSync('python3', ['-B', probe, 'check', ...files], {encoding:'utf8', timeout:10000});
 assert.equal(result.status, failures.length ? 2 : 0, result.stderr);
 assert.deepEqual(JSON.parse(result.stdout), {target_ready:!failures.length, blockers:failures});
}
try {
 cli(record.rank_records, blockers);
 cli(fake, []);
 cli(legacy, []);
 for (const [failure, mutate] of [
  ['four_rank_records_required', rows => rows.pop()],
  ['rank_layout', rows => {rows[3].rank = 2;}],
  ['world_contract', rows => {rows[2].world_size = 3;}],
  ['session_mismatch', rows => {rows[2].session = '0'.repeat(32);}],
  ['source_mismatch', rows => {rows[0].source_sha256 = '0'.repeat(64);}],
  ['collective_result', rows => {rows[3].sum = 9;}],
  ['collective_result', rows => {rows[3].gathered.reverse();}],
  ['two_distinct_kernels', rows => rows.forEach(row => {row.boot_tag = rows[0].boot_tag;})],
  ['two_distinct_kernels', rows => {rows[2].boot_tag = tag('wrong-group');}],
  ['linux_cuda_nccl', rows => {rows[0].backend = 'gloo';}],
  ['cuda_binding', rows => {rows[1].cuda_index = 0;}],
  ['four_distinct_full_gpu_uuids', rows => {rows[1].full_gpu_tag = rows[0].full_gpu_tag;}],
  ['matching_target_runtime', rows => {rows[3].nccl = [2, 24, 2];}],
  ['sm120_requires_blackwell_wheel', previousRuntime],
 ]) {
  const copy = structuredClone(fake);
  mutate(copy);
  cli(copy, [failure]);
 }
} finally {
 fs.rmSync(tmp, {recursive:true, force:true});
}

const svg = read('dist/diagrams/ddp-target-preflight.svg');
assert.match(svg, /aria-labelledby="title desc"/);
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record:'labs/ddp-target-preflight/validation.json', ranks, gathered, sum,
 local_target_ready:record.target_gate.target_ready, target_execution:record.target_execution,
});
execFileSync('python3', ['-B', '-c', `
from pathlib import Path
from zipfile import ZipFile
import sys

folder = Path(sys.argv[1])
with ZipFile(folder.with_suffix('.zip')) as archive:
    expected = sorted(folder.name + '/' + item.name for item in folder.iterdir() if item.is_file())
    assert archive.namelist() == expected
    for name in expected:
        assert archive.read(name) == (folder / Path(name).name).read_bytes()
`, folder], {timeout:10000});

const authorFile = 'dist/progressive-multinode-reading.js';
const at = revision => execFileSync('git', ['show', revision + ':' + authorFile], {cwd:root, encoding:'utf8'});
function preflightSource(author){
 const start = author.indexOf('\n const targetSetup=');
 const end = author.indexOf(' a.intro=a.desc;', start);
 assert(start > 0 && end > start, 'preflight author boundaries');
 return {lesson:author.slice(start, end), rest:author.slice(0, start) + author.slice(end)};
}
const released = preflightSource(at('92026dcb7dd73240b7fb18acf433fc52d0a245ab'));
assert.equal(released.rest, at('982e98433c65324a5d36e95662fcb48eecb221cf'),
 'the original preflight release preserved the rest of the lesson');
const {lesson} = preflightSource(read(authorFile));
assert.equal(lesson, released.lesson, 'the released preflight and resume teaching remain exact');
assert.match(lesson, /a\.sections\[3\]\[1\]\+=/);
assert.match(lesson, /id="native-ddp-target-preflight"/);
assert.match(lesson, /trainingFigure\('ddp-target-preflight'/);
assert(lesson.includes('torch==2.7.1 --index-url https://download.pytorch.org/whl/cu128'));
for (const link of ['.zip', '/target_probe.py', '/README.md', '/validation.json']) {
 assert(lesson.includes('href="labs/ddp-target-preflight' + link + '"'));
}
const page = read('dist/article/multinode-lab/index.html');
const section = number => page.split(`id="section-${number}"`)[1].split(`id="section-${number+1}"`)[0];
const intro = section(1);
assert(intro.includes(`四个进程都读回 ${JSON.stringify(gathered)} 与 ${sum}`));
assert(intro.includes(`<code>target_ready=${record.target_gate.target_ready}</code>（退出码 ${record.target_gate_exit_code}）`));
assert(intro.includes('/article/multinode-lab/#native-ddp-target-preflight'));
const install = section(2);
const hardwareChoice = install.indexOf('RTX PRO 6000 Blackwell（计算能力 12.0）');
const historicalCommand = install.indexOf('pip install torch==2.5.1 --index-url https://download.pytorch.org/whl/cu124');
assert(hardwareChoice >= 0 && historicalCommand > hardwareChoice);
assert(install.includes('PyTorch 2.7.1 / CUDA 12.8 的独立安装与预检'));
assert(install.includes('<code>python -B check_env.py</code>'));
assert(install.includes('/article/operator-profiling/#cuda-core-run'));
const target = section(4).split('id="native-ddp-target-preflight"')[1];
const launch = target.indexOf('torchrun --nnodes=2');
assert(launch >= 0);
for (const command of ['export NODE_RANK=0', 'export NODE_RANK=1', 'export MASTER_ADDR=10.0.1.10 MASTER_PORT=29500',
 'export PREFLIGHT_SESSION=实际会话号']) {
 assert(target.slice(0, launch).includes(`<code>${command}</code>`));
}

const context = {};
vm.createContext(context);
for (const [, file] of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)) {
 if (file !== 'app.js') vm.runInContext(read('dist/' + file), context, {filename:file});
}
const readbackId = 'ddp-target-record-readback';
const jobId = 'native-kubernetes-gloo-job';
const kindJob = JSON.parse(read('dist/labs/kubernetes-gloo-job/validation.json'));
assert.equal(new Set(kindJob.after.map(pod => pod.node)).size, 2);
assert(kindJob.rank_logs.every(rank => rank.backend === 'gloo' && rank.device === 'cpu' && rank.updated_weight === 1.125));
const jobReading = vm.runInContext('articles.find(a=>a.id==="kubernetes-training").sections[5][1]', context);
assert(jobReading.split(`id="${jobId}"`)[1]?.includes('/article/multinode-lab/#' + readbackId));
const handoff = vm.runInContext('articles.find(a=>a.id==="multinode-lab").sections[3][1]', context);
const [before, readback, ...duplicate] = handoff.split(`<h3 id="${readbackId}">`);
assert(readback && !duplicate.length && before.includes('id="native-ddp-target-preflight"'));
assert(readback.includes('/article/kubernetes-training/#' + jobId));
for (const marker of ['1.125', 'two_distinct_kernels', 'four_rank_records_required']) assert(readback.includes(marker));
const sharedId = 'shared-checkpoint-readback';
const commands = [...readback.split('<h3 id="' + sharedId + '">')[0].matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)];
assert.equal(commands.length, 1, 'one offline readback command follows the original target procedure');
const decode = value => value.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const shell = decode(commands[0][1]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ddp-target-reading-'));
try {
 fs.copyFileSync(probe, path.join(scratch, 'target_probe.py'));
 fs.copyFileSync(path.join(folder, 'validation.json'), path.join(scratch, 'validation.json'));
 const output = execFileSync('sh', ['-s'], {cwd:scratch, input:shell, encoding:'utf8', timeout:15000});
 assert.deepEqual(output.trim().split('\n').map(line => JSON.parse(line)), [
  [ranks.length, record.target_gate_exit_code, blockers],
  [ranks.length - 1, 2, ['four_rank_records_required']],
 ]);
} finally {
 fs.rmSync(scratch, {recursive:true, force:true});
}

const shared = section(4).split('<h3 id="' + sharedId + '">')[1];
assert(shared?.includes('href="/article/checkpoint-recovery/#section-4"'));
assert(read('dist/article/checkpoint-recovery/index.html').includes('href="/article/multinode-lab/#'+sharedId+'"'));
const sharedProgram = shared.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
assert(sharedProgram, 'the complete directory probe is available to readers');
execFileSync('python3', ['-B', '-c', `
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

def run_pair(program, roots, session, timeout):
    calls = [[sys.executable, "-B", str(program), str(root), session, side,
              "--timeout", str(timeout)] for root, side in zip(roots, ("A", "B"))]
    workers = [subprocess.Popen(call, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
               for call in calls]
    try:
        responses = []
        for worker in workers:
            output, errors = worker.communicate(timeout=7)
            assert not errors, errors
            responses.append((worker.returncode, json.loads(output)))
        return responses
    finally:
        for worker in workers:
            if worker.poll() is None:
                worker.kill()
                worker.communicate()

with TemporaryDirectory() as tmp:
    root = Path(tmp)
    program = root / "shared_checkpoint_probe.py"
    program.write_text(sys.argv[1])
    session = "a" * 32
    responses = run_pair(program, (root, root), session, 4.0)
    (status_a, a), (status_b, b) = responses
    assert (status_a, status_b) == (0, 0), responses
    assert a["session"] == b["session"] == session
    for own, peer, side in [(a, b, "A"), (b, a, "B")]:
        raw = (root / f".ddp-probe-{session}-{side}.json").read_bytes()
        assert own["status"] == "passed" and own["side"] == side
        assert sha256(raw).hexdigest() == own["own_sha256"] == peer["peer_sha256"]
    assert a["own_sha256"] != b["own_sha256"]
    duplicate = subprocess.run([sys.executable, "-B", str(program), str(root), session, "A"],
                               capture_output=True, timeout=7)
    assert duplicate.returncode == 2 and b"start a new session" in duplicate.stderr
    assert sha256((root / f".ddp-probe-{session}-A.json").read_bytes()).hexdigest() == a["own_sha256"]

    private = [root / side / "shared-checkpoints" for side in ("A", "B")]
    for directory in private:
        directory.mkdir(parents=True)
    assert run_pair(program, private, "b" * 32, 0.2) == [
        (2, {"status": "peer_missing", "side": "A"}),
        (2, {"status": "peer_missing", "side": "B"}),
    ]
`, decode(sharedProgram)], {timeout:16000});

console.log('DDP target preflight: four-rank records, offline target gates, bidirectional directory readback, same-name negative control, duplicate-session rejection, Blackwell pin and ZIP verified.');
