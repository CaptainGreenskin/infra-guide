/* Reconstruct dense attention and the missing-rescale control independently of Metal. */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pack = 'metal-online-attention';
const folder = path.resolve(__dirname, '..', 'dist', 'labs', pack);
const read = name => fs.readFileSync(path.join(folder,name));
const source = ['README.md','kernels.metal','online_attention.swift'];
const hashes = Object.fromEntries(source.map(name => [name,createHash('sha256').update(read(name)).digest('hex')]));
const length = 2053, peak = 1537, prefixes = [1025,2053], widths = [128,257];
const score = index => index === peak ? 36 : ((index*13)%19-9)/4;
const value = index => index === peak ? [7,-3] : [((index*5)%23-11)/8,((index*7)%29-14)/8];
const close = (actual,expected,tolerance=1e-5*Math.max(1,Math.abs(expected))) => {
 assert(Number.isFinite(actual) && Math.abs(actual-expected) <= tolerance, actual+' differs from '+expected);
};
const closeList = (actual,expected,tolerance) => {
 assert.equal(actual.length,expected.length);
 actual.forEach((number,index) => close(number,expected[index],tolerance));
};

function dense(start,end) {
 const scores = Array.from({length:end-start},(_,offset) => score(start+offset));
 const maximum = Math.max(...scores);
 const weights = scores.map(number => Math.exp(number-maximum));
 const denominator = weights.reduce((sum,number) => sum+number,0);
 const weighted = [0,1].map(component => weights.reduce((sum,weight,offset) =>
  sum+weight*value(start+offset)[component],0));
 return {maximum,denominator,weighted,output:weighted.map(number => number/denominator)};
}

function withoutOldRescale(prefix,width) {
 let maximum = -Infinity, denominator = 0;
 const weighted = [0,0];
 for (let start=0;start<prefix;start+=width) {
  const part = dense(start,Math.min(start+width,prefix));
  maximum = Math.max(maximum,part.maximum);
  const scale = Math.exp(part.maximum-maximum);
  denominator += part.denominator*scale;
  for (const component of [0,1]) weighted[component] += part.weighted[component]*scale;
 }
 return weighted.map(number => number/denominator);
}

function checkQuery(query,prefix,width,totalTiles) {
 const active = Math.ceil(prefix/width);
 assert.equal(query.prefix,prefix);
 assert.equal(query.active_tiles,active);
 assert.equal(query.masked_tiles,totalTiles-active);
 const expected = dense(0,prefix);
 close(query.maximum,expected.maximum,0);
 close(query.denominator,expected.denominator);
 closeList(query.weighted_sum,expected.weighted);
 closeList(query.dense_reference,expected.output,1e-12);
 closeList(query.output,expected.output,1e-6);
 const error = Math.max(...query.output.map((number,index) => Math.abs(number-expected.output[index])));
 close(query.max_abs_error,error,1e-12);
 const negative = withoutOldRescale(prefix,width);
 closeList(query.no_old_rescale_output,negative,1e-6);
 const negativeError = Math.max(...query.no_old_rescale_output.map((number,index) => Math.abs(number-expected.output[index])));
 close(query.no_old_rescale_max_abs_error,negativeError,1e-12);
 if (prefix <= peak) assert(negativeError < 1e-6);
 else assert(negativeError > 1);
 const probeTiles = [...new Set([0,active-1,...(prefix > peak ? [Math.floor(peak/width)] : [])])].sort((a,b) => a-b);
 assert.deepEqual(query.tile_probes.map(probe => probe.tile),probeTiles);
 for (const probe of query.tile_probes) {
  const start = probe.tile*width, end = Math.min(start+width,prefix);
  assert.equal(probe.positions,end-start);
  const block = dense(start,end);
  close(probe.maximum,block.maximum,0);
  close(probe.denominator,block.denominator);
  closeList(probe.weighted_sum,block.weighted);
 }
}

function verify(record) {
 assert.equal(record.schema,'infra-metal-online-attention-v1');
 assert.equal(record.status,'passed');
 assert.deepEqual(record.source_sha256,hashes);
 assert.match(record.environment.device,/^Apple /);
 assert.match(record.environment.os,/^Version \d+\./);
 assert.equal(record.environment.metal_language,'3.0');
 assert.equal(record.environment.float_math,'precise');
 assert.deepEqual(record.fixture,{length,peak_index:peak,prefixes,value_width:2,threads:32});
 assert.deepEqual(record.cases.map(item => item.tile_width),widths);
 for (const item of record.cases) {
  const width = item.tile_width, totalTiles = Math.ceil(length/width);
  assert.equal(item.tiles_per_query,totalTiles);
  assert.equal(item.scratch_bytes,prefixes.length*totalTiles*16);
  assert.deepEqual(item.positive_tail_guards,Array(4).fill(-777));
  assert.deepEqual(item.negative_tail_guards,Array(4).fill(-777));
  assert.equal(item.queries.length,prefixes.length);
  item.queries.forEach((query,index) => checkQuery(query,prefixes[index],width,totalTiles));
 }
 record.cases[0].queries.forEach((query,index) =>
  closeList(query.output,record.cases[1].queries[index].output,1e-6));
}

const record = JSON.parse(read('validation.json'));
verify(record);
assert.equal(record.environment.device,'Apple M4 Pro');
const dist=path.join(folder,'..','..');
const svg=fs.readFileSync(path.join(dist,'diagrams','metal-attention-late-peak.svg'),'utf8');
const first=record.cases[0], rounded=values=>values.map(value=>value.toFixed(4));
assert.deepEqual(JSON.parse(svg.match(/<metadata>([^<]+)<\/metadata>/)[1]),{
 record:'labs/metal-online-attention/validation.json',tile_width:first.tile_width,
 prefixes:record.fixture.prefixes,maxima:first.queries.map(query=>query.maximum),
 peak_index:record.fixture.peak_index,outputs:first.queries.map(query=>rounded(query.output)),
 no_old_rescale:rounded(first.queries[1].no_old_rescale_output),
});
const lesson=slug=>fs.readFileSync(path.join(dist,'article',slug,'index.html'),'utf8');
const practice=lesson('flash-attention-io').split('id="native-metal-online-attention"')[1].split('</details>')[0];
assert(practice.includes('diagrams/metal-attention-late-peak.svg') &&
       practice.includes('/article/operator-profiling/#native-metal-softmax'));
assert(lesson('operator-profiling').includes('/article/flash-attention-io/#native-metal-online-attention'));
const kernel=read('kernels.metal').toString().split('\n');
const publishedExcerpt=practice.match(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/)[1];
for(const line of publishedExcerpt.split('\n'))assert(kernel.some(sourceLine=>sourceLine.trim()===line.trim()),line);
const short=record.cases.map(item=>item.queries[0].active_tiles).join(' / ');
const long=record.cases.map(item=>item.queries[1].active_tiles).join(' / ');
assert(practice.includes('<td>前 1025 项</td><td>'+short+'</td>'));
assert(practice.includes('<td>全部 2053 项</td><td>'+long+'</td>'));
for (const mutate of [
 data => { data.cases[0].queries[0].active_tiles--; },
 data => { data.cases[1].queries[1].tile_probes[1].maximum = 2.25; },
 data => { data.cases[0].queries[1].no_old_rescale_output = [7,-3]; },
 data => { data.cases[1].queries[0].output[0] += 0.02; },
 data => { data.cases[1].negative_tail_guards[0] = 0; },
]) {
 const altered = structuredClone(record);
 mutate(altered);
 assert.throws(() => verify(altered),assert.AssertionError);
}

if (process.env.METAL_ONLINE_ATTENTION_SWIFT) {
 const cache = fs.mkdtempSync(path.join(os.tmpdir(),pack+'-check-'));
 try {
  const output = execFileSync(process.env.METAL_ONLINE_ATTENTION_SWIFT,
   ['-O','-module-cache-path',cache,'online_attention.swift'],{cwd:folder,encoding:'utf8',timeout:120000});
  verify(JSON.parse(output));
 } finally {
  fs.rmSync(cache,{recursive:true,force:true});
 }
}

const archive = folder+'.zip', files = [...source,'validation.json'];
const entries = execFileSync('unzip',['-Z1',archive],{encoding:'utf8'}).trim().split('\n').sort();
assert.deepEqual(entries,files.map(name => pack+'/'+name).sort());
for (const name of files) assert.deepEqual(execFileSync('unzip',['-p',archive,pack+'/'+name]),read(name),name);
console.log('PASS: dense oracle, two Metal tile widths, masked tails, missing-rescale counterexample and exact archive'+
 (process.env.METAL_ONLINE_ATTENTION_SWIFT ? ' with a fresh GPU replay.' : '.'));
