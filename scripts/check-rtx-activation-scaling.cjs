/* Recompute the paired summaries from the unmodified public measurement CSV. */
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const lab = path.join(dist, 'labs/rtx-activation-scaling');
const experiment = 'experiments/010-7b-context-scaling/';
const upstream = '2fbbf69d815cf7846410dc3246f15b19c3ccec23';
const measured = '583ec7fde7a7aa894469515018c235862e13ccc3';
const campaign = 'results/2026-11-09/';
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const csv = fs.readFileSync(path.join(lab, 'runs.csv'));
assert.equal(sha256(csv), '5248e3ed2ae11c94a8212eb7bba917df56c6a87b37c75cf887ec56d379a65786');
const [header, ...lines] = csv.toString('utf8').trimEnd().split(/\r?\n/);
const columns = header.split(',');
assert.deepEqual(columns, ['mode','sequence','repeat','checkpoint','status','tokens_per_second',
  'peak_allocated_bytes','peak_reserved_bytes','process_wall_seconds','initialization_seconds',
  'free_before_bytes','allocator_cap_bytes']);
const rows = lines.map(line => {
  const values = line.split(',');
  assert.equal(values.length, columns.length);
  return Object.fromEntries(columns.map((key, index) => [key, values[index]]));
});
assert.equal(rows.length, 48);
assert(rows.every(r => r.status === 'ok' && Number(r.peak_reserved_bytes) >= Number(r.peak_allocated_bytes)));
const groups = [];
function median(samples) {
  assert(samples.length % 2 === 1);
  return [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
}
for (const mode of ['full-adafactor', 'lora-adamw']) {
  for (const sequence of [512, 1024, 2048, 4096]) {
    for (const checkpoint of [false, true]) {
      const flag = checkpoint ? 'True' : 'False';
      const group = rows.filter(r => r.mode === mode && Number(r.sequence) === sequence && r.checkpoint === flag);
      assert.deepEqual(group.map(r => Number(r.repeat)).sort(), [0, 1, 2]);
      const peak = median(group.map(r => Number(r.peak_allocated_bytes)));
      const rate = median(group.map(r => Number(r.tokens_per_second)));
      assert(Number.isSafeInteger(peak) && peak > 0 && Number.isFinite(rate) && rate > 0);
      groups.push({mode, sequence, checkpoint, peak, rate});
    }
  }
}
const record=JSON.parse(fs.readFileSync(path.join(lab,'validation.json'),'utf8'));
assert.deepEqual(record,{
  status:'passed',scope:'pinned_existing_rtx_samples_recomputed',archive_commit:upstream,
  measurement_code_commit:measured,sample_count:rows.length,source_sha256:{'runs.csv':sha256(csv)},
  groups:groups.filter(g=>g.mode==='full-adafactor'&&g.sequence>=2048)
    .map(({sequence,checkpoint,peak,rate})=>({sequence,checkpoint,peak,rate}))
});

const source = fs.readFileSync(path.join(dist, 'progressive-training-reading.js'), 'utf8');
const lesson = source.slice(source.indexOf('id="rtx-activation-scaling"'), source.indexOf('id="native-amp-window"'));
const reading = fs.readFileSync(path.join(lab, 'README.md'), 'utf8');
assert(source.includes(upstream + '/' + experiment) && source.includes(campaign));
assert(lesson.includes('/labs/rtx-activation-scaling/README.md'));
assert(lesson.includes('/labs/rtx-activation-scaling.zip'));
assert(reading.includes(measured + '/' + experiment.slice(0, -1)));
assert(reading.includes(upstream + '/' + experiment + campaign));
assert(lesson.includes('从模型初始化前重置计数') && lesson.includes('覆盖热身'));
assert(lesson.includes('吞吐按热身后 6 次完整更新计'));
const gib = bytes => (bytes / 2**30).toFixed(2);
for (const sequence of [2048, 4096]) {
  const [off, on] = groups.filter(g => g.mode === 'full-adafactor' && g.sequence === sequence);
  assert(lesson.includes(
    `<strong>${sequence} 词元</strong>。峰值 ${gib(off.peak)} → ${gib(on.peak)} GiB`
  ));
  assert(lesson.includes(`吞吐 ${off.rate.toFixed(1)} → ${on.rate.toFixed(1)} 词元/秒`));
  if (sequence === 2048) {
    assert.equal(on.peak - off.peak, 2**20);
    assert(lesson.includes('开启后高 1 MiB'));
  } else {
    assert(lesson.includes('约 ' + gib(off.peak - on.peak) + ' GiB'));
  }
}

// Optional directory containing the four pinned upstream originals named below.
if (process.argv[2]) {
  const originals = process.argv[2];
  function pinnedJson(filename, digest) {
    const bytes = fs.readFileSync(path.join(originals, filename));
    assert.equal(sha256(bytes), digest, filename);
    return JSON.parse(bytes);
  }
  const summary = pinnedJson('summary.json', '18a852d443eb55c91660304e8ba98c082eeccffda7a043e548618007a1dd6cf0');
  assert.deepEqual([summary.valid_pairs, summary.planned_pairs, summary.pairs.length], [24, 24, 24]);
  assert(summary.pairs.every(p => p.valid && p.max_loss_gap === 0 && p.max_grad_relative_gap === 0));
  assert.equal(summary.groups.length, groups.length);
  for (const group of groups) {
    const reported = summary.groups.find(g =>
      g.mode === group.mode && g.sequence === group.sequence && g.checkpoint === group.checkpoint);
    assert.equal(reported.complete_pairs, 3);
    assert.equal(reported.peak_allocated_gib_median, group.peak / 2**30);
    assert.equal(reported.tokens_per_second_median, group.rate);
  }
  const sources = pinnedJson('sources.json', '3883df27f5f27582f4126f15aeee87e8b2875443889dec1c43f0a5e498c005b9');
  const pair = [
    pinnedJson('full-adafactor-s4096-ac0-r0.json', 'cd25ba8e07c3ac69566bbaaf150756693cc37840c554acb7199f6be87b9b90a9'),
    pinnedJson('full-adafactor-s4096-ac1-r0.json', 'd48efa6cbecff47a8fe4fb8fd2baacc0ebfaa4142192eca843c0ccbdbe48180b'),
  ];
  for (const [i, trial] of pair.entries()) {
    assert.equal(trial.protocol_sha256, sources[experiment + 'protocol.json']);
    assert.deepEqual([trial.status, trial.gpu, trial.torch, trial.base_parameters, trial.sequence, trial.batch,
      trial.checkpoint, trial.repeat, trial.deterministic_algorithms],
    ['ok', 'NVIDIA RTX PRO 6000 Blackwell Workstation Edition', '2.14.1+cu130', 7028273152, 4096, 1, Boolean(i), 0, true]);
    assert.deepEqual(trial.records.map(r => r.warmup), [true, true, false, false, false, false, false, false]);
    const seconds = trial.records.filter(r => !r.warmup).reduce((sum, r) => sum + r.seconds, 0);
    assert.equal(trial.tokens_per_second, 6 * trial.batch * trial.sequence / seconds);
    const csvRow = rows.find(r => r.mode === trial.mode && Number(r.sequence) === trial.sequence
      && Number(r.repeat) === trial.repeat && r.checkpoint === (i ? 'True' : 'False'));
    assert.deepEqual([trial.tokens_per_second, trial.peak_allocated_bytes, trial.peak_reserved_bytes],
      [Number(csvRow.tokens_per_second), Number(csvRow.peak_allocated_bytes), Number(csvRow.peak_reserved_bytes)]);
  }
  assert.equal(pair[0].input_sha256, pair[1].input_sha256);
  assert.equal(pair[0].initial_probe_sha256, pair[1].initial_probe_sha256);
  assert.deepEqual(pair[0].records.map(r => [r.loss, r.grad_norm]), pair[1].records.map(r => [r.loss, r.grad_norm]));
}
console.log('PASS: pinned RTX process samples, independently derived peak and throughput medians, scoped lesson and optional upstream originals');
