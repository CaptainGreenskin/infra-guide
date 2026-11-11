/* Reconstruct the shared device batches and slot-local outputs from native evidence. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pack = 'native-metal-queue';
const root = path.resolve(__dirname,'..');
const folder = path.join(root,'dist','labs',pack);
const cpuFolder = path.join(root,'dist','labs','native-inference-queue');
const source = ['README.md','make_fixture.py','metal_queue.py','queue_client.py'];
const artifacts = ['native-responses.json','native-stderr.log'];
const read = (directory,name) => fs.readFileSync(path.join(directory,name));
const hash = data => createHash('sha256').update(data).digest('hex');
const hashes = Object.fromEntries(source.map(name => [name,hash(read(folder,name))]));
const cpu = JSON.parse(read(cpuFolder,'validation.json'));
const prompts = {A:[1,4,5,6],B:[1,4,5,5,10]};
const limits = {A:110,B:32};
const startPattern = /id\s+(\d+) \| task (\d+) \| new prompt,.*?task\.n_tokens = (\d+)/;
const stopPattern = /id\s+(\d+) \| task (\d+) \| stop processing: n_tokens = (\d+), truncated = 0/;
const deferPattern = /no slot is available, defer task, id_task = (\d+)/;
const samplePattern = /id\s+(\d+) \| task (\d+) \| n_gen = \d+, n_remaining = \d+, next token:\s+(\d+)/;
const rowPattern = /ubatch_print:\s+\d+: id =\s+(\d+) \(.*?\), pos =\s+(\d+), n_seq_id =\s+1, seq_id = \[([.01]+)\], output = ([01])/;
const nodePattern = /ggml_metal_op_encode_impl: node\[\s*\d+\] - (\S+)\s+(\S+)/;
const needed = ['MUL_MAT kq-0','SOFT_MAX kq_soft_max-0','MUL_MAT kqv-0','MUL_MAT result_output'];

function scan(log) {
 const starts = [], stops = new Map(), deferred = [], samples = [];
 const batches = [];
 let batch, keepRows = false;
 for (const [line, text] of log.split('\n').entries()) {
  const start = text.match(startPattern), stop = text.match(stopPattern), defer = text.match(deferPattern);
  if (start) starts.push({line,slot:Number(start[1]),task:Number(start[2]),prompt:Number(start[3])});
  if (stop) stops.set(Number(stop[2]),{line,slot:Number(stop[1]),retained:Number(stop[3])});
  if (defer) deferred.push({line,task:Number(defer[1])});
  if (text.includes('added ubatch to split:') && starts.length) {
   batch = {ordinal:batches.length+1,rows:[],nodes:[],samples:[]};
   batches.push(batch);
   keepRows = true;
  } else if (text.includes('input batch info:')) keepRows = false;
  const sample = text.match(samplePattern);
  if (sample) {
   const observed = {line,slot:Number(sample[1]),task:Number(sample[2]),token_id:Number(sample[3])};
   samples.push(observed);
   batch?.samples.push(observed);
  }
  if (!batch) continue;
  if (keepRows) {
   const count = text.match(/ubatch_print:\s+n_tokens\s+=\s+(\d+)/);
   if (count) batch.count = Number(count[1]);
   const row = text.match(rowPattern);
   if (row) batch.rows.push({line,token_id:Number(row[1]),position:Number(row[2]),
    seq_id:Number(row[3].replaceAll('.','')),output:row[4]==='1'});
  }
  const node = text.match(nodePattern);
  if (node) batch.nodes.push({line,op:node[1],tensor:node[2]});
 }
 return {starts,stops,deferred,samples,batches};
}

function checkRequest(name,request,trace) {
 const start = trace.starts.find(item => item.prompt === prompts[name].length);
 assert(start);
 const stop = trace.stops.get(start.task);
 assert(stop && stop.slot === start.slot && stop.line > start.line);
 assert.equal(request.http_status,200);
 assert.deepEqual(request.body,{prompt:prompts[name],n_predict:limits[name],temperature:0,seed:7,
  stream:true,return_tokens:true,return_progress:true,cache_prompt:false,ignore_eos:true});
 const frames = request.events.filter(frame => frame.data !== '[DONE]').map(frame => ({at:frame.observed_ns,data:JSON.parse(frame.data)}));
 const tokens = frames.filter(({data}) => !data.stop && !('prompt_progress' in data) && data.tokens?.length);
 for (const frame of tokens) assert.equal(frame.data.tokens.length,1);
 const ids = tokens.map(frame => frame.data.tokens[0]);
 assert.equal(ids.length,limits[name]);
 assert.deepEqual(ids,trace.samples.filter(sample => sample.task === start.task).map(sample => sample.token_id));
 const final = frames.at(-1);
 assert.equal(final.data.stop,true);
 assert.equal(final.data.stop_type,'limit');
 assert.equal(final.data.id_slot,start.slot);
 assert.equal(final.data.tokens_cached,prompts[name].length+ids.length-1);
 assert.equal(stop.retained,final.data.tokens_cached);
 const {cache_n,predicted_n,prompt_n} = final.data.timings;
 assert.deepEqual([cache_n,predicted_n,prompt_n],[0,limits[name],prompts[name].length]);
 const output_ids_sha256 = hash(JSON.stringify(ids));
 assert.equal(output_ids_sha256,cpu.runs[0].requests[name].output_ids_sha256);
 return {ids,start,stop,firstAt:tokens[0].at,lastAt:final.at,report:{slot:start.slot,
  counts:{cache_n,predicted_n,prompt_n},first_three_ids:ids.slice(0,3),output_ids_sha256}};
}

function sharedDecodes(batches,a,b) {
 const bySlot = new Map([[a.start.slot,{request:a,prompt:prompts.A}],[b.start.slot,{request:b,prompt:prompts.B}]]);
 if (bySlot.size !== 2) return [];
 const confirmed = [];
 for (const batch of batches) {
  if (batch.count !== 2 || batch.rows.length !== 2 || new Set(batch.rows.map(row => row.seq_id)).size !== 2) continue;
  if (!batch.rows.every(row => row.output && row.position >= bySlot.get(row.seq_id)?.prompt.length)) continue;
  const nodes = new Set(batch.nodes.map(node => node.op+' '+node.tensor));
  const samples = new Map(batch.samples.map(sample => [sample.slot,sample]));
  if (!needed.every(node => nodes.has(node)) || ![...bySlot.keys()].every(slot => samples.has(slot))) continue;
  assert(Math.max(...batch.rows.map(row => row.line)) < Math.min(...batch.nodes.map(node => node.line)));
  assert(Math.max(...batch.nodes.map(node => node.line)) < Math.min(...[...samples.values()].map(sample => sample.line)));
  for (const row of batch.rows) {
   const {request,prompt} = bySlot.get(row.seq_id);
   const sample = samples.get(row.seq_id), offset = row.position-prompt.length;
   assert.equal(sample.task,request.start.task);
   assert.deepEqual([row.token_id,sample.token_id],request.ids.slice(offset,offset+2));
  }
  confirmed.push({batch_ordinal:batch.ordinal,rows:batch.rows.map(({line,...row}) => row),
   metal_nodes:batch.nodes.map(({line,...node}) => node),
   sampled:[...samples.values()].sort((a,b) => a.slot-b.slot).map(({slot,token_id}) => ({slot,token_id}))});
 }
 return confirmed;
}

function verify(report,responseBytes,logBytes) {
 assert.equal(report.schema,'infra-native-metal-queue-v1');
 assert.equal(report.status,'passed');
 assert.deepEqual(report.source_sha256,hashes);
 assert.deepEqual(report.artifact_sha256,{'native-responses.json':hash(responseBytes),'native-stderr.log':hash(logBytes)});
 assert.equal(report.engine.version,cpu.llama_cpp);
 assert.equal(report.engine.binary_sha256,cpu.engine_binary_sha256);
 assert.equal(report.engine.metal_library_sha256,'2b04ec59315ed3bd196ef119e20c2173c094b3cf206d8d0d4ca5b5caf685f8d9');
 assert.equal(report.fixture_sha256,cpu.fixture_sha256);
 assert.deepEqual(report.engine.debug_env,{LLAMA_BATCH_DEBUG:'1',GGML_METAL_GRAPH_DEBUG:'1'});
 for (const [flag,value] of [['--device','MTL0'],['--n-gpu-layers','99'],['--flash-attn','off'],
  ['--batch-size','32'],['--ubatch-size','32'],['--cache-ram','0'],['--cache-reuse','0']]) {
  const index=report.engine.common_options.indexOf(flag);
  assert(index>=0 && report.engine.common_options[index+1]===value);
 }
 assert.match(report.environment.metal_device,/^Apple /);
 assert.equal(report.environment.platform,'Darwin arm64');
 const sections = logBytes.toString().match(/^\[slots=1\]\n([\s\S]*?)^\[slots=2\]\n([\s\S]*)$/m);
 assert(sections);
 const raw = JSON.parse(responseBytes);
 const result = [1,2].map(slots => {
  const log = sections[slots], record = raw[slots];
  for (const marker of ['assigned to device MTL0','MTL0_Mapped model buffer size','MTL0 KV buffer size','MTL0 compute buffer size']) {
   assert(log.includes(marker));
  }
  for (const snapshot of [record.slots_before,record.slots_after]) {
   assert.equal(snapshot.length,slots);
   for (const item of snapshot) assert(item.n_ctx===128 && item.is_processing===false);
  }
  const trace = scan(log);
  assert.equal(trace.starts.length,2);
  const a = checkRequest('A',record.requests.A,trace), b = checkRequest('B',record.requests.B,trace);
  assert(a.firstAt <= record.requests.B.sent_ns && record.requests.B.sent_ns < a.lastAt);
  assert(a.start.line < b.start.line);
  if (slots===1) {
   assert.equal(a.start.slot,0);
   assert.equal(b.start.slot,0);
   assert(trace.deferred.some(item => item.task===b.start.task && a.start.line < item.line && item.line < a.stop.line));
   assert(a.stop.line < b.start.line);
  } else {
   assert.notEqual(a.start.slot,b.start.slot);
   assert(b.start.line < Math.min(a.stop.line,b.stop.line));
   assert(!trace.deferred.some(item => item.task===b.start.task));
  }
  const batches = sharedDecodes(trace.batches,a,b);
  assert.equal(batches.length > 0,slots===2);
  const delta = Object.fromEntries(['prompt_tokens_total','tokens_predicted_total','n_decode_total'].map(key =>
   [key,record.metrics_after[key]-record.metrics_before[key]]));
  assert.equal(delta.prompt_tokens_total,9);
  assert.equal(delta.tokens_predicted_total,142);
  assert(delta.n_decode_total > 0 && delta.n_decode_total <= 142);
  return {slots,per_slot_context:128,requests:{A:a.report,B:b.report},metric_counter_deltas:delta,
   shared_decode_count:batches.length,first_shared_decode:batches[0] ?? null};
 });
 assert.deepEqual(report.runs,result);
}

const [response,log] = artifacts.map(name => read(folder,name));
const record = JSON.parse(read(folder,'validation.json'));
verify(record,response,log);
assert.equal(record.environment.metal_device,'Apple M4 Pro');
assert.deepEqual(read(folder,'make_fixture.py'),read(cpuFolder,'make_fixture.py'));
assert.deepEqual(read(folder,'queue_client.py'),read(cpuFolder,'concurrency_lab.py'));
assert.deepEqual(record.runs.map(run => run.metric_counter_deltas.n_decode_total),[142,110]);
assert.deepEqual(record.runs.map(run => run.shared_decode_count),[0,31]);
for (const mutate of [
 data => { data.runs[1].first_shared_decode.rows[1].seq_id=0; },
 data => { data.runs[1].first_shared_decode.sampled[0].token_id++; },
 data => { data.runs[1].first_shared_decode.metal_nodes.pop(); },
 data => { data.runs[1].shared_decode_count++; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered,response,log),assert.AssertionError);
}
const alteredLog = Buffer.from(log.toString().split('\n').filter(line => !line.includes('SOFT_MAX     kq_soft_max-0')).join('\n'));
assert.notDeepEqual(alteredLog,log);
const altered = structuredClone(record);
altered.artifact_sha256['native-stderr.log'] = hash(alteredLog);
assert.throws(() => verify(altered,response,alteredLog),assert.AssertionError);

if (process.env.NATIVE_METAL_QUEUE_SERVER) {
 const temporary = fs.mkdtempSync(path.join(os.tmpdir(),pack+'-check-'));
 try {
  const output = path.join(temporary,'replay');
  execFileSync('python3',['-B',path.join(folder,'metal_queue.py'),'--server',process.env.NATIVE_METAL_QUEUE_SERVER,
   '--output-dir',output],{timeout:120000});
  verify(JSON.parse(read(output,'validation.json')),...artifacts.map(name => read(output,name)));
 } finally {
  fs.rmSync(temporary,{recursive:true,force:true});
 }
}

const dist = path.join(root,'dist');
const frozenSharedBatch = record.runs[1].first_shared_decode;
const diagram = read(path.join(dist,'diagrams'),pack+'.svg').toString();
assert.deepEqual(JSON.parse(diagram.match(/<metadata>([^<]+)<\/metadata>/)[1]),{
 record:'labs/'+pack+'/validation.json',slots:2,batch_ordinal:frozenSharedBatch.batch_ordinal,
 rows:frozenSharedBatch.rows,sampled:frozenSharedBatch.sampled,
});
const page = read(path.join(dist,'article','inference-performance'),'index.html').toString();
const lesson = page.split('id="native-metal-queue"')[1].split('id="section-7"')[0];
assert(lesson.includes('diagrams/native-metal-queue.svg'));
assert(lesson.includes('/article/speculative-decoding/#native-ngram-speculation'));
for (const run of record.runs) {
 assert(lesson.includes('<td>'+run.shared_decode_count+' 批</td><td>'+run.metric_counter_deltas.n_decode_total+'</td>'));
}

const files = [...source,...artifacts,'validation.json'], archive = folder+'.zip';
const entries = execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries,files.map(name => pack+'/'+name).sort());
for (const name of files) assert.deepEqual(execFileSync('unzip',['-p',archive,pack+'/'+name]),read(folder,name),name);
console.log('PASS: Metal shared decode rows, device nodes and slot-local sampling, CPU output hashes and exact archive'+
 (process.env.NATIVE_METAL_QUEUE_SERVER ? ' with a fresh GPU replay.' : '.'));
