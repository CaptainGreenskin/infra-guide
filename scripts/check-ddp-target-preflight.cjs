/* Check the real local collectives, offline target boundaries and published evidence. */
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
const author = read(authorFile);
const previous = execFileSync('git', ['show', '982e98433c65324a5d36e95662fcb48eecb221cf:' + authorFile],
 {cwd:root, encoding:'utf8'});
const start = author.indexOf('\n a.sections[1][1]+=p(\'如果目标是 RTX PRO 6000 Blackwell');
const end = author.indexOf(" a.intro=a.desc;a.updated='2026.11.09';", start);
assert(start > 0 && end > start);
assert.equal(author.slice(0, start) + author.slice(end), previous);
const lesson = author.slice(start, end);
assert.match(lesson, /a\.sections\[3\]\[1\]\+=/);
assert.match(lesson, /id="native-ddp-target-preflight"/);
assert.match(lesson, /trainingFigure\('ddp-target-preflight'/);
assert(lesson.includes('torch==2.7.1 --index-url https://download.pytorch.org/whl/cu128'));
for (const link of ['.zip', '/target_probe.py', '/README.md', '/validation.json']) {
 assert(lesson.includes('href="labs/ddp-target-preflight' + link + '"'));
}

console.log('DDP target preflight: local 4-rank collectives, offline target gates, Blackwell pin and ZIP verified.');
