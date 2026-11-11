/* Independently derive the observed intermediate and final values. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const name = 'tiny-decoder-forward';
const pack = 'dist/labs/' + name;
const files = ['trace_forward.py', 'README.md', 'validation.json'];
const read = file => fs.readFileSync(file);
const hash = file => createHash('sha256').update(read(file)).digest('hex');
const record = JSON.parse(read(pack + '/validation.json'));
const handoff = JSON.parse(read('dist/labs/tiny-decoder-handoff/validation.json'));
const original = JSON.parse(read('dist/labs/sdpa-cache/validation.json'));
const close = (a, b) => assert(Number.isFinite(a) && Math.abs(a - b) <= 1e-12, a + ' differs from ' + b);
const compare = (a, b) => {
  assert.equal(a.length, b.length);
  a.forEach((value, index) => close(value, b[index]));
};
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const add = (a, b) => a.map((value, index) => value + b[index]);
const maxDelta = (a, b) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
const argmax = values => values.indexOf(Math.max(...values));
const cases = {base: [0,1], change_prefix: [4,1], change_future: [0,7]};

function validate(data) {
  assert.equal(data.schema, 'tiny-decoder-forward-v1');
  assert.equal(data.status, 'passed');
  assert.deepEqual(data.source_sha256, {
    'trace_forward.py': hash(pack + '/trace_forward.py'),
    'tiny_decoder.py': hash('dist/labs/sdpa-cache/tiny_decoder.py'),
  });
  assert.equal(data.environment.torch.split('+')[0], '2.5.1');
  assert.equal(data.environment.device, 'cpu');
  assert.equal(data.environment.dtype, 'float64');
  assert.equal(data.environment.sdpa, 'MATH');
  assert.equal(data.parameters, original.program.model_parameters);
  assert.deepEqual(data.training.rows, handoff.fixture.rows);
  assert.deepEqual(data.training.labels, handoff.fixture.labels[0]);
  close(data.training.loss_before, original.program.training_loss_before);
  assert.equal(data.token_weight.length, 8);
  for (const row of data.token_weight) assert.equal(row.length, 8);

  for (const [key, prompt] of Object.entries(cases)) {
    const { layers, reference, logits, selected_id: selected } = data.runs[key];
    assert.deepEqual(data.runs[key].prompt, prompt);
    assert.deepEqual(reference.visible, [[true,false],[true,true]]);
    for (const [position, token] of prompt.entries()) {
      compare(layers.token[position], data.token_weight[token]);
      compare(layers.x[position], add(layers.token[position], layers.position[position]));
      compare(layers.after_attention[position], add(layers.x[position], layers.attention[position]));
      compare(layers.after_ffn[position], add(layers.after_attention[position], layers.feed_forward[position]));
      compare(logits[position], data.token_weight.map(candidate => dot(candidate, layers.normalized[position])));
      const joined = [];
      for (const head of [0,1]) {
        const scores = reference.k[head].map(candidate => dot(reference.q[head][position], candidate) / 2);
        compare(reference.raw_scores[head][position], scores);
        const exponentials = scores.map((value, candidate) => candidate <= position ? Math.exp(value) : 0);
        const sum = exponentials.reduce((a, b) => a + b);
        const weights = exponentials.map(value => value / sum);
        compare(reference.weights[head][position], weights);
        joined.push(...reference.v[head][0].map((_, j) => dot(weights, reference.v[head].map(row => row[j]))));
      }
      compare(layers.joined[position], joined);
    }
    assert.equal(selected, argmax(logits[1]));
    close(data.runs[key].joined_max_abs_error, 0);
  }
  const { base, change_prefix: prefix, change_future: future } = data.runs;
  compare(base.logits[1], handoff.result.inference.step1.first_logits);
  assert.equal(base.selected_id, original.program.generation.trace[0].selected_id);
  assert.equal(prefix.selected_id, 7);
  for (const head of [0,1]) compare(base.reference.q[head][1], prefix.reference.q[head][1]);
  for (const [field, changed, position, comparison] of [
    ['prefix_position_1', prefix, 1, data.max_absolute_deltas.prefix_position_1],
    ['future_position_0', future, 0, data.max_absolute_deltas.future_position_0],
  ]) {
    for (const name of ['x','joined','after_ffn','logits']) {
      const value = run => (name === 'logits' ? run.logits : run.layers[name])[position];
      const delta = maxDelta(value(base), value(changed));
      close(comparison[name], delta);
      if (field === 'future_position_0' || name === 'x') close(delta, 0);
      else assert(delta > 0.01);
    }
  }
}

validate(record);
for (const mutate of [
  r => { r.runs.base.reference.weights[0][1][0] += 0.1; },
  r => { r.runs.change_prefix.layers.joined[1][2] += 0.1; },
  r => { r.runs.change_prefix.selected_id = 1; },
  r => { r.runs.change_future.logits[0][2] += 0.1; },
]) {
  const changed = JSON.parse(JSON.stringify(record));
  mutate(changed);
  assert.throws(() => validate(changed), {code:'ERR_ASSERTION'});
}

const svg = read('dist/diagrams/tiny-decoder-context.svg').toString();
const drawn = JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]);
assert.deepEqual(drawn, {
  record:'labs/tiny-decoder-forward/validation.json',
  prompts:[record.runs.base.prompt,record.runs.change_prefix.prompt],
  selected:[record.runs.base.selected_id,record.runs.change_prefix.selected_id],query_position:1,
});
const attentionPage = read('dist/article/attention-mechanics/index.html').toString();
const decoderPage = read('dist/article/transformer-block/index.html').toString();
const tokenPage = read('dist/article/tokenization-embedding/index.html').toString();
const observation = 'id="same-position-different-prefix"';
const followThrough = 'id="native-tiny-decoder-context"';
assert(attentionPage.includes(observation) && decoderPage.includes(followThrough));
const attentionReading = attentionPage.split(observation)[1].split('id="section-2"')[0];
const [decoderIntro, decoderReading] = decoderPage.split(followThrough);
assert(decoderIntro.includes('初始化后的参数') && decoderIntro.includes('没有做训练更新'));
assert(decoderReading.includes('做一次参数更新（SGD）'));
assert(attentionReading.includes('/labs/tiny-decoder-forward/validation.json'));
assert(attentionReading.includes('/article/transformer-block/#native-tiny-decoder-context'));
const runs = [record.runs.base, record.runs.change_prefix];
const component = (run, layer) => run.layers[layer][1][0].toFixed(4);
const tableRow = cells => '<tr>'+cells.map(value => '<td>'+value+'</td>').join('')+'</tr>';
const projectedFirst = (run, tensor, position) => run.reference[tensor][0][position][0];
const format = value => value.toFixed(4).replace('-', '−');
const lookupToProjection = attentionReading.split('<table>')[0];
compare(runs[0].layers.x[1], runs[1].layers.x[1]);
for (const tensor of ['q', 'k', 'v']) {
  compare(runs[0].reference[tensor][0][1], runs[1].reference[tensor][0][1]);
}
assert(lookupToProjection.includes('归一化（本例用 RMSNorm）') && lookupToProjection.includes('把每行的 8 项算成 24 项'));
assert(lookupToProjection.includes('第一个头的 Q 首项都是 '+format(projectedFirst(runs[0], 'q', 1))));
for (const tensor of ['k','v']) {
  const [before, after] = runs.map(run => projectedFirst(run, tensor, 0));
  assert(Math.abs(before-after) > 0.01);
  assert(lookupToProjection.includes(`${tensor.toUpperCase()} 首项由 ${format(before)} 变为 ${format(after)}`));
}
const originalSource = read('dist/labs/sdpa-cache/tiny_decoder.py').toString();
assert(originalSource.includes('self.qkv(self.norm1(x)).chunk(3, dim=-1)'));
assert(attentionReading.includes('归一化后的 X 记为 U') && attentionReading.includes('Q=UWq、K=UWk、V=UWv'));
assert(attentionReading.includes('/article/attention-mechanics/#same-prefix-attention-weights'));
for (const run of runs) {
  assert(attentionReading.includes(tableRow([JSON.stringify(run.prompt), component(run, 'x'),
    component(run, 'attention'), run.selected_id])), 'opening trace shows the recorded projection for each input');
}
for (const [label, layer] of [['输出投影后的第一项（图中分支输出）','attention'], ['第一次回加 H₁ 的第一项','after_attention']]) {
  assert(decoderReading.includes(tableRow([label, ...runs.map(run => component(run, layer))])),
    'decoder trace agrees with the recorded node: '+layer);
}
const lookup = 'id="same-token-lookup"', weightReading = 'id="same-prefix-attention-weights"';
const lookupFigure = read('dist/diagrams/tiny-decoder-lookup-and-score.svg').toString();
const lookupMeta = JSON.parse(lookupFigure.match(/<metadata>([^<]+)<\/metadata>/)[1]);
const baseline = runs[0];
assert.deepEqual(lookupMeta, {
  record:'labs/tiny-decoder-forward/validation.json',run:'base',position:1,token_id:baseline.prompt[1],
  lookup_first:['token','position','x'].map(layer => baseline.layers[layer][1][0].toFixed(6)),
  candidate_ids:[1,7],scores:[1,7].map(id => baseline.logits[1][id].toFixed(4)),
});
for (const value of [...lookupMeta.lookup_first, ...lookupMeta.scores])
  assert(lookupFigure.includes('>'+value.replace('-', '−')+'</text>') || lookupFigure.includes(' '+value.replace('-', '−')+'</text>'), value);
assert(tokenPage.includes(lookup) && tokenPage.includes('diagrams/tiny-decoder-lookup-and-score.svg'));
assert(tokenPage.split(lookup)[1].includes('/article/attention-mechanics/#same-position-different-prefix'));
assert(attentionReading.includes('/article/tokenization-embedding/#same-token-lookup'));
const weightsSection = attentionPage.split(weightReading)[1].split('id="section-4"')[0];
const round = row => row.map(n => n.toFixed(4).replace('-', '−')).join('、');
for (const run of runs) {
  assert(weightsSection.includes(tableRow([JSON.stringify(run.prompt), round(run.reference.raw_scores[0][1]),
    round(run.reference.weights[0][1])])));
}
assert(weightsSection.includes('/article/transformer-block/#native-tiny-decoder-context'));
const replay = decoderReading.split('id="decoder-record-recompute"')[1];
assert(replay.includes('/article/attention-mechanics/#same-prefix-attention-weights'));
assert(replay.includes('/article/tokenization-embedding/#same-token-lookup'));
const decode = source => source.replace(/&(?:amp|lt|gt|quot|#39);/g, entity =>
  ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[entity]);
const program = decode(replay.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1]);
const execute = file => execFileSync('python3', ['-B', '-c', program, file], {encoding:'utf8', stdio:['ignore','pipe','pipe']});
const results = execute(pack + '/validation.json').trim().split('\n');
assert.deepEqual(results, [...runs.map(run =>
  '['+run.prompt.join(', ')+'] 1: '+run.logits[1][1].toFixed(4)+', 7: '+run.logits[1][7].toFixed(4)+' 选出 '+run.selected_id),
  '只改未来一格，位置 0 的八个分数不变']);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'decoder-reading-'));
try {
  const altered = structuredClone(record);
  altered.runs.base.layers.joined[1][0] += 0.1;
  const bad = path.join(temp, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify(altered));
  assert.throws(() => execute(bad), err => err.status !== 0 && err.stderr.includes('AssertionError'));
} finally {
  fs.rmSync(temp, {recursive:true, force:true});
}
const archive = pack + '.zip';
const members = execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(members, files.map(file => name + '/' + file).sort());
for (const file of files) assert.deepEqual(execFileSync('unzip',['-p',archive,name + '/' + file]),read(pack + '/' + file));
console.log('PASS: three native TinyDecoder forwards, real lookup and weight walkthrough, rendered standard-library replay and negative control, exact figures and archive.');
