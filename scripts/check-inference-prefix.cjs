/* Independently replay native CPU cache observations; no engine is required for record audit. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const folder='dist/labs/native-inference-prefix/',read=n=>fs.readFileSync(folder+n),json=n=>JSON.parse(read(n));
const sha=b=>createHash('sha256').update(b).digest('hex');
const summary=json('validation.json'),runs=json('responses.json'),logs=json('native-logs.json');
assert.equal(summary.status,'passed'); assert.equal(summary.backend,'CPU');
assert.equal(summary.engine_commit,'cd959bae99ff4bed22bef2604f45241c09bbb8c8');
assert.equal(summary.engine_sha256,'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959');
assert.equal(summary.fixture_sha256,'d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66');
for(const [n,h] of Object.entries({...summary.source_sha256,...summary.evidence_sha256}))assert.equal(sha(read(n)),h,n);
assert.deepEqual(Object.keys(summary.source_sha256).sort(),['make_fixture.py','prefix_lab.py']);
assert.deepEqual(Object.keys(summary.evidence_sha256).sort(),['native-logs.json','responses.json']);
assert.equal(runs.length,3); assert.equal(logs.length,3);assert.equal(summary.repetitions,3);
function check(run,trace){
 assert.equal(run.repeat,trace.repeat);
 assert(trace.lines.every((r,i,a)=>Number.isInteger(r.line)&&(!i||r.line>a[i-1].line)));
 const text=trace.lines.map(x=>x.text.replace(/^\S+\s+/, '')).join('\n')+'\n';
 for(const marker of ['assigned to device CPU','CPU KV buffer size','CPU compute buffer size','n_slots = 1, n_ctx_slot = 128'])assert(text.includes(marker),marker);
 const chunks=text.split(/(?=I slot[^\n]+new prompt,)/).slice(1);
 assert.equal(chunks.length,3);
 let retained=[];
 for(const [i,name]of ['cold_a','warm_b','cold_b'].entries()){
  if(name==='cold_b')retained=[];
  const {body,response:r}=run.requests[name];
  const expectedPrompt=name==='cold_a'?[1,4,5,6]:[1,4,5,5,10];
  assert.deepEqual(body,{prompt:expectedPrompt,id_slot:0,cache_prompt:true,n_predict:3,ignore_eos:true,temperature:0,seed:7,return_tokens:true});
  let hit=0; while(hit<body.prompt.length&&body.prompt[hit]===retained[hit])hit++;
  hit=Math.min(hit,body.prompt.length-1);
  const fresh=body.prompt.slice(hit),expectedOutput=name==='cold_a'?[7,8,9]:[11,12,13];
  assert.deepEqual(r.tokens,expectedOutput);assert.equal(r.stop,true);assert.equal(r.stop_type,'limit');assert.equal(r.id_slot,0);
  assert.equal(r.tokens_evaluated,body.prompt.length);assert.equal(r.tokens_predicted,3);
  assert.deepEqual([r.timings.cache_n,r.timings.prompt_n,r.timings.predicted_n],[hit,fresh.length,3]);
  assert.equal(r.tokens_cached,body.prompt.length+2);
  const inputGroups=[...chunks[i].matchAll(/D init: input batch info:\n((?:D ubatch_print:[^\n]*\n)+)/g)];
  const batches=inputGroups.map(m=>[...m[1].matchAll(/id = +(\d+) .*?pos = +(\d+), n_seq_id = +1, seq_id = \[(\d+)\], output = (\d)/g)].map(x=>[+x[1],+x[2],+x[3],+x[4]]));
  assert.deepEqual(batches.map(b=>b.map(x=>x[0])),[fresh,[expectedOutput[0]],[expectedOutput[1]]]);
  assert.deepEqual(batches.flatMap(b=>b.map(x=>x[1])),Array.from({length:fresh.length+2},(_,j)=>hit+j));
  assert(batches.every(b=>b.every((x,j)=>x[2]===0&&x[3]===Number(j===b.length-1))));
  const sampled=[...chunks[i].matchAll(/next token:\s+(\d+)/g)].map(x=>+x[1]);assert.deepEqual(sampled,expectedOutput);
  assert(chunks[i].includes('cached n_tokens = '+hit+','));
  assert(chunks[i].includes('stop processing: n_tokens = '+r.tokens_cached+','));
  const snapshot=run['after_'+name];assert.equal(snapshot.length,1);
  assert.equal(snapshot[0].id,0);assert.equal(snapshot[0].is_processing,false);assert.equal(snapshot[0].n_prompt_tokens,r.tokens_cached);
  retained=body.prompt.concat(expectedOutput.slice(0,-1));
 }
 assert.deepEqual(run.initial,[{id:0,n_ctx:128,speculative:false,is_processing:false}]);
 assert.deepEqual(run.erase,{id_slot:0,n_erased:run.after_warm_b[0].n_prompt_tokens});
 assert.equal(run.erase.n_erased,7);assert.equal(run.after_erase.length,1);assert.equal(run.after_erase[0].is_processing,false);assert.equal(run.after_erase[0].n_prompt_tokens,0);
 const eraseLine=trace.lines.find(x=>x.text.includes('clearing prompt with 7 tokens'));
 const starts=trace.lines.filter(x=>x.text.includes('new prompt,'));
 const stops=trace.lines.filter(x=>x.text.includes('stop processing:'));
 assert(eraseLine&&stops[1].line<eraseLine.line&&eraseLine.line<starts[2].line);
}
runs.forEach((r,i)=>{assert.equal(r.repeat,i+1);check(r,logs[i]);});
for(const mutate of [x=>x.requests.warm_b.response.timings.cache_n++,x=>x.after_warm_b[0].is_processing=true,x=>x.erase.n_erased--]){
 const bad=structuredClone(runs[0]);mutate(bad);assert.throws(()=>check(bad,logs[0]),assert.AssertionError);
}
const changedTrace=structuredClone(logs[0]);const tokenRow=changedTrace.lines.find(x=>/id = +10 .*?pos = +4,/.test(x.text));assert(tokenRow);tokenRow.text=tokenRow.text.replace(/pos = +4,/, 'pos =    5,');assert.throws(()=>check(runs[0],changedTrace),assert.AssertionError);
assert.deepEqual([summary.warm_hit_positions,summary.warm_new_prompt_positions,summary.cold_new_prompt_positions,summary.erased_positions,summary.output_ids],[3,2,5,7,[11,12,13]]);
const svg=fs.readFileSync('dist/diagrams/native-inference-prefix.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]),{warm_hit:3,warm_prefill:2,cold_prefill:5,erased:7,output_ids:[11,12,13],repetitions:3});
const context={};vm.createContext(context);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),context,{filename:file});
}
const articles=vm.runInContext('articles',context);
const serving=articles.find(x=>x.id==='model-serving');assert.equal(serving.sections.length,8);
const html=serving.sections.map(x=>x[1]).join('');
for(const marker of ['id="native-inference-prefix"','diagrams/native-inference-prefix.svg','labs/native-inference-prefix.zip','labs/native-inference-prefix/validation.json','labs/native-inference-prefix/responses.json'])assert(html.includes(marker),marker);
const files=['README.md','prefix_lab.py','make_fixture.py','validation.json','responses.json','native-logs.json'];
execFileSync('python3',['-B','-c',`
import hashlib, json, sys, tempfile
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
folder=Path(sys.argv[1]); names=json.load(sys.stdin)
ET.parse('dist/diagrams/native-inference-prefix.svg')
sys.path.insert(0,str(folder.resolve()))
from make_fixture import build
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'f.gguf';build(p)
 assert hashlib.sha256(p.read_bytes()).hexdigest()=='d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66'
with ZipFile(folder.with_suffix('.zip')) as z:
 assert sorted(z.namelist())==sorted(folder.name+'/'+n for n in names)
 assert z.testzip() is None
 for n in names: assert z.read(folder.name+'/'+n)==(folder/n).read_bytes()
`,folder],{input:JSON.stringify(files)});
console.log('PASS: 3 native CPU repetitions; independently derived prefix and all input positions; idle retention, erase, token parity, mutation rejection, source/evidence/fixture hashes, article bridge and ZIP.');
