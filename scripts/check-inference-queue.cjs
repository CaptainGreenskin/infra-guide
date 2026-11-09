/* Recompute the released native queue evidence from indexed SSE, logs, and metrics. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

process.chdir(path.resolve(__dirname, '..'));
const name = 'native-inference-queue';
const folder = `dist/labs/${name}`;
const files = ['README.md', 'concurrency_lab.py', 'events.jsonl', 'make_fixture.py', 'validation.json'];
const read = file => fs.readFileSync(file, 'utf8');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const shaFile = file => sha(fs.readFileSync(file));
const validation = JSON.parse(read(`${folder}/validation.json`));
const prior = JSON.parse(read('dist/labs/native-inference/validation.json'));
assert.equal(validation.schema, 1);
assert.equal(validation.status, 'passed');
assert.match(validation.llama_cpp, /build 12110, commit cd959bae9/);
assert.equal(validation.engine_binary_sha256, 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959');
assert.equal(validation.fixture_sha256, prior.model.gguf_sha256);
assert.deepEqual(fs.readFileSync(`${folder}/make_fixture.py`), fs.readFileSync('dist/labs/native-inference/make_fixture.py'));
assert.deepEqual(validation.source_sha256, {
  'concurrency_lab.py': shaFile(`${folder}/concurrency_lab.py`),
  'make_fixture.py': shaFile(`${folder}/make_fixture.py`),
});
assert.deepEqual(validation.records_sha256, {'events.jsonl': shaFile(`${folder}/events.jsonl`)});
assert.match(validation.clock, /time\.monotonic_ns.*one origin per run/);

const raw = read(`${folder}/events.jsonl`);
assert(!/\/(?:Users|home|private|var\/folders)\/|\bBearer |\b(?:Authorization|Cookie|API[_-]?Key)\b/i.test(raw));
assert(raw.endsWith('\n'));
const records = raw.trimEnd().split('\n').map(line => JSON.parse(line));
records.forEach((record, index) => assert.equal(record.index, index + 1));
const scenarios = {
  A: {prompt: [1, 4, 5, 6], count: 110, prefix: [7, 8, 9]},
  B: {prompt: [1, 4, 5, 5, 10], count: 32, prefix: [11, 12, 13]},
};

function orderedTimes(times, message) {
  assert(times.every(t => Number.isSafeInteger(t) && t >= 0), `${message}: nanoseconds on the run clock`);
  assert(times.every((t, i) => i === 0 || t >= times[i - 1]), message);
}

function checkRequest(run, rows, requestName) {
  const spec = scenarios[requestName];
  const [request, ...duplicates] = rows.filter(x => x.kind === 'request' && x.name === requestName);
  assert(request && !duplicates.length, `${run.id} ${requestName}: one client request`);
  assert.deepEqual(request.body, {
    prompt: spec.prompt, n_predict: spec.count, temperature: 0, seed: 7, stream: true,
    return_tokens: true, return_progress: true, cache_prompt: false, ignore_eos: true,
  });
  assert.equal(request.http_status, 200);

  const frames = rows.filter(x => x.kind === 'sse' && x.name === requestName);
  assert(frames.length > spec.count, `${run.id} ${requestName}: complete stream`);
  orderedTimes([request.sent_ns, request.headers_ns, ...frames.map(x => x.observed_ns), request.stream_closed_ns],
    `${run.id} ${requestName}: client event order`);
  const payloads = frames.filter(x => x.data !== '[DONE]').map(x => ({at: x.observed_ns, payload: JSON.parse(x.data)}));
  const stops = payloads.filter(x => x.payload.stop);
  assert.equal(stops.length, 1, `${run.id} ${requestName}: one terminal frame`);
  const end = stops[0];
  assert.equal(end, payloads.at(-1));
  assert.equal(end.payload.stop_type, 'limit');
  assert.equal(end.payload.model, 'synthetic-concurrency-fixture');
  assert(payloads.some(x => x.payload.prompt_progress), 'exercise exclusion of prompt progress');

  const visible = payloads.filter(x => !x.payload.stop && !Object.hasOwn(x.payload, 'prompt_progress') && x.payload.tokens?.length);
  assert.equal(visible.length, spec.count);
  assert(visible.every(x => x.payload.tokens.length === 1 && Number.isInteger(x.payload.tokens[0])));
  const ids = visible.map(x => x.payload.tokens[0]);
  const [first, last] = [visible[0].at, visible.at(-1).at];
  const result = run.requests[requestName];
  assert.deepEqual(ids.slice(0, 3), spec.prefix);
  assert.equal(result.output_count, ids.length);
  assert.deepEqual(result.first_three_ids, spec.prefix);
  assert.equal(result.output_ids_sha256, sha(JSON.stringify(ids)));
  assert.equal(result.sent_ns, request.sent_ns);
  assert.equal(result.first_token_ns, first);
  assert.equal(result.last_token_ns, last);
  assert.equal(result.stop_ns, end.at);
  assert.equal(result.ttft_ns, first - request.sent_ns, `${run.id} ${requestName}: TTFT from raw SSE`);
  assert.equal(result.tpot_ns, (last - first) / (ids.length - 1), `${run.id} ${requestName}: TPOT from raw SSE`);

  const counts = {cache_n: 0, prompt_n: spec.prompt.length, predicted_n: spec.count};
  assert.deepEqual(result.counts, counts);
  for (const [key, value] of Object.entries(counts)) assert.equal(end.payload.timings[key], value);
  assert.equal(end.payload.tokens_evaluated, spec.prompt.length);
  assert.equal(end.payload.tokens_predicted, spec.count);
  assert.equal(end.payload.tokens_cached, spec.prompt.length + spec.count - 1);
  return {ids, first, stop: end.at, sent: request.sent_ns, closed: request.stream_closed_ns, final: end.payload};
}

function checkNative(run, rows, observed) {
  const engine = rows.filter(x => x.kind === 'native_log');
  orderedTimes(engine.map(x => x.line), `${run.id}: source log order`);
  assert.equal(new Set(engine.map(x => x.line)).size, engine.length);
  assert(engine.some(x => x.text.includes(`initializing, n_slots = ${run.slots}, n_ctx_slot = 128`)));
  for (const marker of ['assigned to device CPU', 'CPU KV buffer size', 'CPU compute buffer size']) {
    assert(engine.some(x => x.text.includes(marker)), `${run.id}: ${marker}`);
  }
  const starts = [], stops = [], deferred = [], samples = [];
  for (const {line, text} of engine) {
    const identity = /\bid\s+(\d+) \| task (\d+) \| /.exec(text);
    const start = /new prompt,.*?task\.n_tokens = (\d+)/.exec(text);
    const stop = /stop processing: n_tokens = (\d+), truncated = (\d+)/.exec(text);
    const sample = /next token:\s+(\d+)/.exec(text);
    const defer = /no slot is available, defer task, id_task = (\d+)/.exec(text);
    if (identity) {
      const slot = Number(identity[1]), task = Number(identity[2]);
      if (start) starts.push({line, slot, task, prompt_tokens: Number(start[1])});
      if (stop) {
        assert.equal(Number(stop[2]), 0);
        stops.push({line, slot, task, cached_tokens: Number(stop[1])});
      }
      if (sample) samples.push({slot, task, token: Number(sample[1])});
    }
    if (defer) deferred.push({line, task: Number(defer[1])});
  }
  assert.equal(starts.length, 2);
  assert.equal(stops.length, 2);
  assert.equal(new Set(starts.map(x => x.task)).size, 2);
  assert.equal(new Set(stops.map(x => x.task)).size, 2);
  assert.equal(samples.length, scenarios.A.count + scenarios.B.count);
  const actual = {};
  for (const [key, spec] of Object.entries(scenarios)) {
    // Distinct prompt lengths identify the only two jobs. Native sampled IDs give a second tie to SSE.
    const start = starts.find(x => x.prompt_tokens === spec.prompt.length);
    assert(start, `${run.id} ${key}: native task identity`);
    const stop = stops.find(x => x.task === start.task);
    const generated = samples.filter(x => x.task === start.task);
    assert.deepEqual(generated.map(x => x.token), observed[key].ids);
    assert(generated.every(x => x.slot === start.slot));
    assert.equal(start.slot, observed[key].final.id_slot);
    assert.equal(stop.slot, start.slot);
    assert.equal(stop.cached_tokens, observed[key].final.tokens_cached);
    assert(start.line < stop.line);
    actual[key] = {
      start, stop: {line: stop.line, slot: stop.slot, cached_tokens: stop.cached_tokens},
      defer_lines: deferred.filter(x => x.task === start.task).map(x => x.line),
    };
    assert.deepEqual(actual[key], run.requests[key].trace);
  }
  const {A: a, B: b} = actual;
  if (run.slots === 1) {
    assert.equal(deferred.length, b.defer_lines.length, `${run.id}: only B is deferred`);
    assert(b.defer_lines.length > 0);
    assert(b.defer_lines.every(line => a.start.line < line && line < a.stop.line));
    assert(a.stop.line < b.start.line, `${run.id}: B starts after A releases`);
    assert.equal(a.start.slot, 0);
    assert.equal(b.start.slot, 0);
  } else {
    assert.deepEqual(deferred, []);
    assert.notEqual(a.start.slot, b.start.slot);
    assert(a.start.line < b.start.line && b.start.line < Math.min(a.stop.line, b.stop.line),
      `${run.id}: both tasks start before the first release`);
  }
}

function checkRun(run, rows) {
  assert(rows.every(x => x.run_id === run.id));
  const kinds = new Set(['slot_snapshot', 'request', 'sse', 'metrics', 'native_log']);
  assert(rows.every(x => kinds.has(x.kind)));
  assert(rows.filter(x => x.kind === 'request' || x.kind === 'sse').every(x => Object.hasOwn(scenarios, x.name)));
  assert.equal(run.per_slot_context, 128);
  const expectedSlots = Array.from({length: run.slots}, (_, id) => ({id, n_ctx: 128, is_processing: false}));
  const snapshots = rows.filter(x => x.kind === 'slot_snapshot');
  assert.deepEqual(snapshots.map(x => x.stage), ['before', 'after']);
  snapshots.forEach(x => assert.deepEqual(x.slots, expectedSlots));

  const observed = Object.fromEntries(Object.keys(scenarios).map(key => [key, checkRequest(run, rows, key)]));
  orderedTimes([observed.A.first, observed.B.sent, observed.A.stop], `${run.id}: B is sent during A's stream`);
  assert(observed.B.sent < observed.A.stop);
  checkNative(run, rows, observed);

  const metrics = rows.filter(x => x.kind === 'metrics');
  assert.equal(metrics.length, run.metric_samples);
  orderedTimes(metrics.flatMap(x => [x.begin_ns, x.observed_ns]), `${run.id}: metrics sampling order`);
  assert(metrics[0].observed_ns <= observed.A.sent);
  assert(Math.max(observed.A.closed, observed.B.closed) <= metrics.at(-1).begin_ns);
  const states = metrics.map(x => [x.values.requests_processing, x.values.requests_deferred]);
  assert.deepEqual(states[0], [0, 0]);
  assert.deepEqual(states.at(-1), [0, 0]);
  assert(states.some(([active, waiting]) => active === run.slots && waiting === (run.slots === 1 ? 1 : 0)));
  assert.equal(run.observed_two_active_gauge, states.some(([active, waiting]) => active === 2 && waiting === 0));
  assert.deepEqual(run.metric_maxima, {
    requests_processing: Math.max(...states.map(([active]) => active)),
    requests_deferred: Math.max(...states.map(([, waiting]) => waiting)),
  });
  const deltas = {prompt_tokens_total: 9, tokens_predicted_total: 142, n_decode_total: run.slots === 1 ? 142 : 110};
  for (const [key, value] of Object.entries(deltas)) {
    assert.equal(metrics.at(-1).values[key] - metrics[0].values[key], value);
  }
  assert.deepEqual(run.metric_counter_deltas, deltas);
  return observed;
}

assert.equal(validation.runs.length, 6);
let next = 1;
const byMode = [];
for (const [i, run] of validation.runs.entries()) {
  const slots = i % 2 + 1;
  assert.equal(run.slots, slots);
  assert.equal(run.id, `${slots}-slot-${Math.floor(i / 2) + 1}`);
  const [from, to] = run.record_range;
  assert.equal(from, next);
  assert(Number.isInteger(to) && to >= from && to <= records.length);
  next = to + 1;
  byMode.push(checkRun(run, records.slice(from - 1, to)));
}
assert.equal(next, records.length + 1);
for (let i = 0; i < byMode.length; i += 2) {
  for (const key of Object.keys(scenarios)) assert.deepEqual(byMode[i][key].ids, byMode[i + 1][key].ids);
}

// A plausible one-nanosecond summary change must still fail the SSE replay.
const altered = structuredClone(validation.runs[0]);
altered.requests.B.ttft_ns++;
assert.throws(() => checkRun(altered, records.slice(0, altered.record_range[1])), /TTFT from raw SSE/);

const page = read('dist/article/inference-performance/index.html');
for (const marker of [`id="${name}"`, `data-toc="${name}"`, `diagrams/${name}.svg`, `labs/${name}.zip`,
  `labs/${name}/validation.json`, `labs/${name}/events.jsonl`]) assert(page.includes(marker), marker);
assert.match(read(`dist/diagrams/${name}.svg`), /<svg\b/);
assert.match(read('dist/article/model-serving/index.html'), /href="\/(?:infra-guide\/)?article\/inference-performance\/#native-inference-queue"/);

execFileSync('python3', ['-B', '-c', `
import json, sys
from pathlib import Path
from zipfile import ZipFile
folder = Path(sys.argv[1])
names = json.load(sys.stdin)
with ZipFile(folder.with_suffix('.zip')) as archive:
    members = [folder.name + '/' + name for name in names]
    assert sorted(archive.namelist()) == sorted(members), 'missing, duplicate, or unexpected ZIP entries'
    assert archive.testzip() is None, 'corrupt ZIP member'
    for name, member in zip(names, members):
        assert archive.read(member) == (folder / name).read_bytes(), member
`, folder], {input: JSON.stringify(files)});
console.log('PASS: six native inference runs reproduce SSE timing and tokens, task identity, slot/queue observations, and Prometheus counts; published links, fixture, hashes, and ZIP verified.');
