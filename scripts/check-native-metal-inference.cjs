/* Verify the CPU/Metal comparison from native HTTP and backend records. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pack = 'native-metal-inference';
const folder = path.join(root, 'dist', 'labs', pack);
const sourceFiles = ['README.md', 'make_fixture.py', 'metal_inference.py'];
const rawFiles = ['native-responses.json', 'native-stderr.log'];
const hash = data => createHash('sha256').update(data).digest('hex');
const read = (directory, file) => fs.readFileSync(path.join(directory, file));
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(read(folder, file))]));
const cpuLab = path.join(root, 'dist', 'labs', 'native-inference');
const cpuEvidence = JSON.parse(read(cpuLab, 'validation.json'));
const backendSha = '2b04ec59315ed3bd196ef119e20c2173c094b3cf206d8d0d4ca5b5caf685f8d9';
const expectedNodes = [
 ['MUL_MAT', 'Qcur-0'], ['MUL_MAT', 'Kcur-0'], ['MUL_MAT', 'Vcur-0'],
 ['MUL_MAT', 'kq-0'], ['SOFT_MAX', 'kq_soft_max-0'], ['MUL_MAT', 'kqv-0'], ['MUL_MAT', 'result_output'],
];
const shapes = [
 ['cold', 'red green blue', true, 0, [7,8,9]],
 ['repeat', 'red green blue', true, 3, [7,8,9]],
 ['changed_suffix', 'red green four', true, 3, [11,12,13]],
 ['cache_disabled', 'red green four', false, 0, [11,12,13]],
];
const prompts = {'red green blue': [1,4,5,6], 'red green four': [1,4,5,10]};

function readPlacement(log, device) {
 const layers = [...log.matchAll(/load_tensors: layer\s+(\d+) assigned to device (\S+),/g)]
  .map(([,index, device]) => ({index: Number(index), device}));
 assert.deepEqual(layers, [0,1].map(index => ({index, device})));
 const buffers = [...log.matchAll(/(?:load_tensors|llama_kv_cache|sched_reserve):\s+(\S+) (model|KV|compute) buffer size =\s+([\d.]+) MiB/g)]
  .map(([,device, kind, mib]) => ({device, kind, mib: Number(mib)}));
 for (const [target, kind] of [[device+'_Mapped', 'model'], [device, 'KV'], [device, 'compute']]) {
  assert(buffers.some(row => row.device === target && row.kind === kind && row.mib > 0), target+' '+kind+' buffer');
 }
 return {layers, buffers};
}

function readLogCases(log, metal) {
 const starts = [...log.matchAll(/id\s+0 \| task (\d+) \| new prompt,/g)];
 assert.equal(starts.length, shapes.length);
 return starts.map((start, index) => {
  const segment = log.slice(start.index, starts[index+1]?.index);
  const task = start[1], slot = 'id\\s+0 \\| task '+task+' \\| ';
  const finished = [...segment.matchAll(new RegExp(slot+'stop processing: n_tokens = (\\d+), truncated = 0','g'))];
  assert.equal(finished.length, 1, 'one completed slot per request');
  const sampled = [...segment.matchAll(new RegExp(slot+'n_gen = \\d+, n_remaining = \\d+, next token:\\s+(\\d+)','g'))]
   .map(([,token]) => Number(token));
  const batches = segment.split('added ubatch to split:').slice(1).map(batch => {
   const rows = [...batch.matchAll(/ubatch_print:\s+\d+: id =\s+(\d+) \(.*\), pos =\s+(\d+), .*seq_id = \[0\], output = ([01])/g)]
    .map(([,token, pos, output]) => ({token_id:Number(token), position:Number(pos), logits_requested:output === '1'}));
   const metal_nodes = [...batch.matchAll(/ggml_metal_op_encode_impl: node\[\s*\d+\] - (\S+)\s+(\S+)/g)]
    .map(([,op,tensor]) => ({op,tensor}));
   if (metal) {
    for (const [op, tensor] of expectedNodes) {
     assert(metal_nodes.some(node => node.op === op && node.tensor === tensor), op+' '+tensor+' in Metal batch');
    }
   } else {
    assert.equal(metal_nodes.length, 0, 'CPU batch contains no Metal compute nodes');
   }
   return {rows, metal_nodes};
  });
  return {sampled, batches, retained: Number(finished[0][1])};
 });
}

function checkRequests(raw, traces) {
 assert.deepEqual(Object.keys(raw.tokenizations).sort(), Object.keys(prompts).sort());
 assert.deepEqual(Object.keys(raw.completions).sort(), shapes.map(([name]) => name).sort());
 for (const [text, ids] of Object.entries(prompts)) {
  const {request, response} = raw.tokenizations[text];
  assert.deepEqual(request, {content:text, add_special:true, with_pieces:true});
  assert.deepEqual(response.tokens.map(token => token.id), ids);
 }
 return shapes.map(([name,text,reuse,cached,outputs], index) => {
  const {request, http_status:status, events} = raw.completions[name];
  const prompt = prompts[text];
  assert.deepEqual(request, {prompt, id_slot:0, cache_prompt:reuse, stream:true, return_tokens:true,
   return_progress:true, n_predict:3, temperature:0, seed:7});
  assert.equal(status, 200);
  const final = events.at(-1);
  assert.equal(final.stop, true);
  assert.equal(final.stop_type, 'limit');
  assert.equal(final.id_slot, 0);
  assert.equal(final.tokens_evaluated, prompt.length);
  const trace = traces[index];
  const retained = prompt.length + outputs.length - 1;
  assert.equal(final.tokens_cached, retained);
  assert.equal(trace.retained, retained);
  assert.deepEqual(trace.sampled, outputs);
  const generated = events.filter(event => !event.stop && !('prompt_progress' in event)).map(event => event.tokens);
  assert.deepEqual(generated, outputs.map(id => [id]));
  const {cache_n, prompt_n, predicted_n} = final.timings;
  assert.deepEqual([cache_n, prompt_n, predicted_n], [cached, prompt.length - cached, outputs.length]);
  const progress = events.flatMap(event => event.prompt_progress ? [event.prompt_progress] : []);
  assert.deepEqual(progress.map(({total,cache,processed}) => [total,cache,processed]),
   [[prompt.length,cached,cached],[prompt.length,cached,prompt.length]]);
  const rows = trace.batches.map(batch => batch.rows);
  assert.deepEqual(rows.map(batch => batch.map(row => row.token_id)),
   [prompt.slice(cached), [outputs[0]], [outputs[1]]]);
  assert.deepEqual(rows.flat().map(row => row.position), Array.from({length: retained-cached}, (_,i) => cached+i));
  assert.deepEqual(rows.flat().filter(row => row.logits_requested).map(row => row.position), [3,4,5]);
  return {name,prompt_ids:prompt,cache_prompt:reuse,
   api:{cache_n,prompt_n,predicted_n,output_ids:outputs,tokens_cached:retained},batches:trace.batches};
 });
}

function verify(report, responseBytes, logBytes) {
 assert.equal(report.schema, 'infra-native-metal-inference-v1');
 assert.equal(report.status, 'passed');
 assert.deepEqual(report.source_sha256, sourceHashes);
 assert.deepEqual(report.artifact_sha256, {'native-responses.json':hash(responseBytes),'native-stderr.log':hash(logBytes)});
 const {engine, model, environment} = report;
 assert.equal(engine.version, cpuEvidence.engine.version);
 assert.equal(engine.commit, cpuEvidence.engine.commit);
 assert.equal(engine.binary_sha256, cpuEvidence.engine.binary_sha256);
 assert.equal(engine.metal_library_sha256, backendSha);
 assert.deepEqual(engine.debug_env, {LLAMA_BATCH_DEBUG:'1', GGML_METAL_GRAPH_DEBUG:'1'});
 for (const [flag, value] of [['--ctx-size','128'],['--parallel','1'],['--threads','1'],['--threads-batch','1'],
  ['--batch-size','32'],['--ubatch-size','32'],['--cache-ram','0'],['--flash-attn','off'],['--fit','off']]) {
  assert(engine.common_options.includes(flag) && engine.common_options[engine.common_options.indexOf(flag)+1] === value, flag);
 }
 assert(engine.common_options.includes('--no-warmup'));
 assert.deepEqual(model, {bytes:cpuEvidence.model.bytes,gguf_sha256:cpuEvidence.model.gguf_sha256});
 assert.equal(environment.platform, 'Darwin arm64');
 assert.match(environment.macos, /^\d+\.\d+/);
 assert.match(environment.metal_device, /^Apple /);
 const raw = JSON.parse(responseBytes);
 assert.deepEqual(Object.keys(raw).sort(), ['cpu','metal']);
 assert.deepEqual(Object.keys(report.backends).sort(), ['cpu','metal']);
 const logs = logBytes.toString().match(/^\[cpu\]\n([\s\S]*?)^\[metal\]\n([\s\S]*)$/m);
 assert(logs, 'native log sections');
 for (const [index, mode, arg, device, layers] of [[1,'cpu','none','CPU',0],[2,'metal','MTL0','MTL0',99]]) {
  const placement = readPlacement(logs[index], device);
  const traces = readLogCases(logs[index], mode === 'metal');
  const cases = checkRequests(raw[mode], traces);
  assert.deepEqual(report.backends[mode], {device:arg,n_gpu_layers:layers,placement,cases});
 }
 const withoutMetal = cases => cases.map(({batches,...caseInfo}) => ({...caseInfo,batches:batches.map(batch => batch.rows)}));
 assert.deepEqual(withoutMetal(report.backends.cpu.cases), withoutMetal(report.backends.metal.cases));
}

const [responses, log] = rawFiles.map(file => read(folder, file));
const record = JSON.parse(read(folder, 'validation.json'));
verify(record, responses, log);
assert.equal(record.environment.metal_device, 'Apple M4 Pro');
assert.deepEqual(read(folder, 'make_fixture.py'), read(cpuLab, 'make_fixture.py'));

const cpuNode = log.toString().replace(/(D ubatch_add: added ubatch to split:\n)/,
 '$1D ggml_metal_op_encode_impl: node[    3] - MUL_MAT      Qcur-0\n');
const missingSoftmax = log.toString().replace(/ggml_metal_op_encode_impl: node\[[^\n]*SOFT_MAX\s+kq_soft_max-0[^\n]*/, '');
const alteredResponses = JSON.parse(responses);
alteredResponses.metal.completions.cold.events.at(-1).timings.prompt_n--;
for (const [responseData, logData] of [[responses,cpuNode],[responses,missingSoftmax],[JSON.stringify(alteredResponses),log]]) {
 const altered = structuredClone(record);
 altered.artifact_sha256 = {'native-responses.json':hash(responseData),'native-stderr.log':hash(logData)};
 assert.throws(() => verify(altered,responseData,Buffer.from(logData)), assert.AssertionError);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), pack+'-check-'));
try {
 const fixture = path.join(tmp, 'fixture.gguf');
 execFileSync('python3', ['-B', path.join(folder, 'make_fixture.py'), fixture]);
 assert.equal(hash(fs.readFileSync(fixture)), record.model.gguf_sha256);
 if (process.env.NATIVE_METAL_INFERENCE_SERVER) {
  const out = path.join(tmp, 'replay');
  execFileSync('python3', ['-B', path.join(folder, 'metal_inference.py'), '--server', process.env.NATIVE_METAL_INFERENCE_SERVER,
   '--output-dir', out], {timeout:120000});
  verify(JSON.parse(read(out, 'validation.json')), ...rawFiles.map(file => read(out, file)));
 }
} finally {
 fs.rmSync(tmp, {recursive:true,force:true});
}

const files = [...sourceFiles, ...rawFiles, 'validation.json'];
const archive = folder+'.zip';
const entries = execFileSync('unzip', ['-Z1', archive], {encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries, files.map(file => pack+'/'+file).sort());
for (const file of files) assert.deepEqual(execFileSync('unzip', ['-p', archive, pack+'/'+file]), read(folder, file), file);
console.log('PASS: identical four llama.cpp requests across CPU and Metal, 12 request-scoped Metal batches, exact source/response/log/ZIP bindings'+
 (process.env.NATIVE_METAL_INFERENCE_SERVER ? ' and live Metal replay.' : '.'));
