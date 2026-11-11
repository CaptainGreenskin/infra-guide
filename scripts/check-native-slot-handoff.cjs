/* Audit the native cache handoff against its binary, HTTP exchanges and engine batches. */
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'native-slot-handoff';
const folder = path.join(root, 'dist', 'labs', pack);
const files = ['README.md', 'make_fixture.py', 'prefix.bin', 'slot_handoff.py', 'validation.json'];
const read = name => fs.readFileSync(path.join(folder, name));
const json = data => JSON.parse(data);
const sha = data => createHash('sha256').update(data).digest('hex');
const initialPrompt = [1, 4, 5, 6];
const modelHash = 'd0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66';
const sourceHashes = Object.fromEntries(['slot_handoff.py', 'make_fixture.py'].map(name => [name, sha(read(name))]));

function trace(excerpt) {
 assert(excerpt.every((entry, i) => Number.isInteger(entry.line) && (!i || entry.line > excerpt[i - 1].line)));
 const logs = excerpt.map(entry => entry.text.replace(/^\S+\s+/, '')).join('\n') + '\n';
 for (const marker of ['assigned to device CPU', 'CPU KV buffer size', 'CPU compute buffer size']) {
  assert(logs.includes(marker), marker);
 }
 return logs.split(/(?=I slot[^\n]+new prompt,)/).slice(1);
}

function ok(reply) {
 assert.equal(reply.status, 200);
 return reply.body;
}

function positionCount(reply) {
 const slots = ok(reply);
 assert.equal(slots.length, 1);
 assert.equal(slots[0].id, 0);
 assert.equal(slots[0].n_ctx, 128);
 assert.equal(slots[0].is_processing, false);
 assert.equal(slots[0].speculative, false);
 return slots[0].n_prompt_tokens;
}

function verifyCompletion({request, response}, logs, prompt, outputs, hit) {
 const retained = prompt.length + outputs.length - 1;
 assert.deepEqual(request, {prompt, id_slot: 0, cache_prompt: true, n_predict: outputs.length,
  ignore_eos: true, temperature: 0, seed: 7, return_tokens: true});
 const result = ok(response);
 assert.deepEqual(result.tokens, outputs);
 assert.equal(result.stop_type, 'limit');
 assert.equal(result.tokens_evaluated, prompt.length);
 assert.equal(result.tokens_cached, retained);
 assert.equal(result.tokens_predicted, outputs.length);
 assert.deepEqual([result.timings.cache_n, result.timings.prompt_n, result.timings.predicted_n],
  [hit, prompt.length - hit, outputs.length]);
 assert(logs.includes('cached n_tokens = ' + hit + ','));
 assert(logs.includes('stop processing: n_tokens = ' + retained + ','));
 const batches = [...logs.matchAll(/D init: input batch info:\n((?:D ubatch_print:[^\n]*\n)+)/g)];
 const actual = batches.map(match => {
  // The next "equal_seqs" starts an internal sub-batch, which repeats input rows.
  const first = match[1].split(/(?=D ubatch_print: +equal_seqs +=)/)[0];
  return [...first.matchAll(/id = +(\d+) .*?pos = +(\d+), n_seq_id = +1, seq_id = \[(\d+)\], output = (\d)/g)]
   .map(token => token.slice(1).map(Number));
 });
 const expected = [prompt.slice(hit), ...outputs.slice(0, -1).map(token => [token])];
 let position = hit;
 assert.deepEqual(actual, expected.map(batch =>
  batch.map((token, i) => [token, position++, 0, Number(i === batch.length - 1)])));
 assert.deepEqual([...logs.matchAll(/next token:\s+(\d+)/g)].map(x => Number(x[1])), outputs);
}

function verify(report, file) {
 assert.equal(report.backend, 'CPU');
 assert.equal(report.platform.arch, 'arm64');
 assert.equal(report.engine_commit, 'cd959bae99ff4bed22bef2604f45241c09bbb8c8');
 assert.equal(report.engine_file_sha256['llama-server'], 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959');
 assert.equal(report.engine_file_sha256['libllama-server-impl.dylib'], 'f85a52e783abfe603b5d8631ef697e43e383e0d76fd1bb07a8b88461685e5c7b');
 assert.equal(Object.keys(report.engine_file_sha256).length, 11);
 assert(Object.values(report.engine_file_sha256).every(hash => /^[0-9a-f]{64}$/.test(hash)));
 assert.equal(report.fixture_sha256, modelHash);
 assert.deepEqual(report.source_sha256, sourceHashes);

 const {lifecycle, artifact, source, destination} = report.run;
 const sourcePid = lifecycle[0].pid, targetPid = lifecycle[2].pid;
 assert([sourcePid, targetPid].every(pid => Number.isInteger(pid) && pid > 0));
 assert.notEqual(sourcePid, targetPid);
 assert.deepEqual(lifecycle, [
  {event: 'source_ready', pid: sourcePid}, {event: 'source_exited', pid: sourcePid, returncode: 0},
  {event: 'destination_ready', pid: targetPid}, {event: 'artifact_copied'},
  {event: 'destination_exited', pid: targetPid, returncode: 0},
 ]);
 assert.equal(file.length, 396);
 assert.equal(file.toString('ascii', 0, 4), 'qsgg');
 // Pinned llama_context sequence format, then server_tokens' text-only payload.
 assert.equal(file.readUInt32LE(4), 4);
 assert.equal(file.readUInt32LE(8), 8);
 assert.deepEqual(Array.from({length: 8}, (_, i) => file.readInt32LE(12 + 4 * i)),
  [-1, 1, initialPrompt.length, ...initialPrompt, 0]);
 assert.deepEqual(artifact, {source_bytes: file.length, source_sha256: sha(file),
  destination_bytes: file.length, destination_sha256: sha(file),
  truncated_bytes: 12, truncated_sha256: sha(file.subarray(0, 12))});

 assert.equal(positionCount(source.initial), undefined);
 assert.equal(positionCount(source.before_save), initialPrompt.length);
 const saved = ok(source.save), restored = ok(destination.restore);
 assert.deepEqual([saved.id_slot, saved.filename, saved.n_saved, saved.n_written],
  [0, 'prefix.bin', initialPrompt.length, file.length]);
 assert.deepEqual([restored.id_slot, restored.filename, restored.n_restored, restored.n_read],
  [0, 'prefix.bin', initialPrompt.length, file.length]);
 assert.equal(positionCount(destination.initial), undefined);
 assert.equal(positionCount(destination.after_restore), undefined);
 assert.equal(positionCount(destination.before_bad_restore), 6);
 assert.deepEqual(destination.bad_restore, {status: 400, body: {error: {code: 400,
  message: 'Unable to restore slot: No available space in KV cache or invalid slot save file',
  type: 'invalid_request_error'}}});
 assert.equal(positionCount(destination.after_bad_restore), 0);
 assert.equal(positionCount(destination.after_cold), 6);
 const left = trace(source.logs), right = trace(destination.logs);
 assert.equal(left.length, 1);
 assert.equal(right.length, 2);
 assert(right[0].indexOf('stop processing:') < right[0].indexOf('clearing prompt with 6 tokens'));
 assert(right[0].includes('clearing prompt with 6 tokens'));
 verifyCompletion(source.completion, left[0], initialPrompt, [7], 0);
 const nextPrompt = [...initialPrompt, 7];
 verifyCompletion(destination.warm, right[0], nextPrompt, [8, 9], initialPrompt.length);
 verifyCompletion(destination.cold, right[1], nextPrompt, [8, 9], 0);
}

const report = json(read('validation.json')), file = read('prefix.bin');
verify(report, file);
for (const mutate of [
 run => { run.lifecycle[2].pid = run.lifecycle[0].pid; },
 run => { run.destination.restore.body.n_restored = 5; },
 run => { run.destination.warm.response.body.timings.cache_n = 5; },
 run => { run.destination.after_bad_restore.body[0].n_prompt_tokens = 6; },
 run => { run.destination.cold.response.body.tokens[1] = 10; },
 run => {
  const token = run.destination.logs.find(entry => /id = +7 .*?pos = +4,/.test(entry.text));
  assert(token);
  token.text = token.text.replace(/pos = +4,/, 'pos =    3,');
 },
]) {
 const wrong = structuredClone(report);
 mutate(wrong.run);
 assert.throws(() => verify(wrong, file), assert.AssertionError);
}
const corruptFile = Buffer.from(file);
corruptFile.writeUInt32LE(7, 32);
assert.throws(() => verify(report, corruptFile), assert.AssertionError);

const zip = folder + '.zip';
assert.deepEqual(execFileSync('unzip', ['-Z1', zip], {encoding: 'utf8'}).trim().split('\n').sort(),
 files.map(name => pack + '/' + name));
for (const name of files) assert.deepEqual(execFileSync('unzip', ['-p', zip, pack + '/' + name]), read(name), name);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'native-slot-check-'));
try {
 const fixture = path.join(scratch, 'fixture.gguf');
 execFileSync('python3', ['-B', path.join(folder, 'make_fixture.py'), fixture]);
 assert.equal(sha(fs.readFileSync(fixture)), modelHash);
 if (process.env.NATIVE_SLOT_ENGINE) {
  const replay = path.join(scratch, 'replay');
  execFileSync('python3', ['-B', path.join(folder, 'slot_handoff.py'), '--engine', process.env.NATIVE_SLOT_ENGINE,
   '--output', replay], {timeout: 90000});
  const repeated = fs.readFileSync(path.join(replay, 'prefix.bin'));
  verify(json(fs.readFileSync(path.join(replay, 'validation.json'))), repeated);
  assert.deepEqual(repeated, file);
 }
} finally {
 fs.rmSync(scratch, {recursive: true, force: true});
}

const diagram = fs.readFileSync(path.join(root, 'dist', 'diagrams', pack + '.svg'), 'utf8');
assert(/<title\b/.test(diagram) && /<desc\b/.test(diagram));
assert.deepEqual(json(diagram.match(/<metadata>(.*?)<\/metadata>/s)[1]), {
 record: 'labs/' + pack + '/validation.json', snapshot_bytes: file.length, source_prompt: initialPrompt, first_output: 7,
 warm_cache_n: 4, warm_prompt_n: 1, cold_prompt_n: 5, continuation: [8, 9], truncated_bytes: 12,
 restore_error: 400, positions_after_error: 0,
});
if (!process.argv.includes('--record-only')) {
 const page = route => fs.readFileSync(path.join(root, 'dist', route, 'index.html'), 'utf8');
 const article = page('article/inference-performance');
 const marker = '<h3 id="' + pack + '">';
 assert.equal(article.split(marker).length, 2);
 const start = article.indexOf(marker);
 assert(article.slice(article.lastIndexOf('<section class="article-section"', start), start)
  .startsWith('<section class="article-section" id="section-3">'));
 const subsection = article.slice(start, article.indexOf('<h3 id="vllm-v1-request-path">', start));
 for (const target of ['diagrams/' + pack + '.svg', 'labs/' + pack + '.zip', 'labs/' + pack + '/validation.json']) {
  assert(subsection.includes(target), target);
 }
 const {source, destination} = report.run;
 const warm = destination.warm.response.body, cold = destination.cold.response.body;
 const restored = destination.restore.body.n_restored;
 for (const field of [`n_restored=${restored}`, '快照没有 <code>n_prompt_tokens</code> 字段',
  `timings.cache_n=${warm.timings.cache_n}`, `timings.prompt_n=${warm.timings.prompt_n}`,
  `HTTP ${destination.bad_restore.status}`, `从 ${positionCount(destination.before_bad_restore)} 变为 ${positionCount(destination.after_bad_restore)}`,
  `timings.cache_n=${cold.timings.cache_n}`, `timings.prompt_n=${cold.timings.prompt_n}`,
  `<code>tokens_cached</code> 都是 ${cold.tokens_cached}`]) {
  assert(subsection.includes(field), field);
 }
 const articleLink = '/article/inference-performance/#' + pack;
 const serving = page('article/model-serving');
 const flow = serving.slice(serving.indexOf('<h3 id="native-inference-request-path">'), serving.indexOf('<h3 id="request-version-binding">'));
 const output = source.completion.response.body.tokens[0];
 assert(flow.includes(`${JSON.stringify(source.completion.request.prompt)} 后输出 ${output}`));
 assert(flow.includes(`${JSON.stringify(destination.warm.request.prompt)} 发起新请求`));
 assert(flow.includes(`第一个新算位置是 ${restored}，送入的是词元 ${output}`));
 assert(flow.includes(articleLink), 'request lifecycle links to the same cache handoff');
 const point = page('module/platform').match(/<section class="knowledge-point" id="knowledge-sv-prefill">([\s\S]*?)<\/section>/)?.[1];
 assert(point?.includes(articleLink), 'domain point');
 const catalog = page('labs').match(/<li class="lab-learning-unit" id="lab-ai-native-slot-handoff">([\s\S]*?)<\/li>/)?.[1];
 assert(catalog?.includes(articleLink), 'catalog item');
 assert(page('roadmap/ai-inference').includes('/article/inference-performance/?goal=ai-inference#' + pack), 'role handoff');
}
console.log('PASS: native CPU cache artifact, separate server PIDs, HTTP restore and failure cleanup, exact input positions, output parity, source/ZIP and diagram.');
