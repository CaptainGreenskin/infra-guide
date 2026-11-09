/* Independent native probe/SSE/route state replay; no engine needed for record audit. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const folder='dist/labs/native-model-rollout/',read=f=>fs.readFileSync(folder+f),json=f=>JSON.parse(read(f));
const sha=b=>createHash('sha256').update(b).digest('hex'),validation=json('validation.json'),raw=json('observations.json');
assert.equal(validation.status,'passed');assert.equal(validation.backend,'CPU');
assert.equal(validation.engine_commit,'cd959bae99ff4bed22bef2604f45241c09bbb8c8');
assert.equal(validation.engine_sha256,'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959');
assert.deepEqual(Object.keys(validation.source_sha256).sort(),['make_fixture.py','rollout_lab.py']);
for(const [name,h]of Object.entries(validation.source_sha256))assert.equal(sha(read(name)),h,name);
assert.equal(sha(read('observations.json')),validation.observations_sha256);
assert.deepEqual([validation.expected_probe_tokens,validation.bad_candidate_tokens,validation.route_generations,validation.old_stream_tokens],[[7,8,9],[8,10,12],[1,2,3],32]);
const models={
 stable:{sha256:'d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66',output_shift:1,output_scale:2,alias:'rollout-stable'},
 bad:{sha256:'b0c8f3ff720e5b8f59d4a8c98cff9d5686cd8095ace3528d08193c06c3e00b44',output_shift:2,output_scale:2,alias:'rollout-bad'},
 good:{sha256:'a71013df0ece2f3ba578d7dc79f6406bdc4be29f9deebff8afed9c59fc6a3122',output_shift:1,output_scale:3,alias:'rollout-good'}
};
const body=(n,stream)=>({prompt:[1,4,5,6],n_predict:n,temperature:0,seed:7,ignore_eos:true,return_tokens:true,cache_prompt:false,stream});
const ordered=times=>assert(times.every((t,i)=>Number.isInteger(t)&&t>=0&&(!i||t>=times[i-1])),'monotonic event order');
function finalResponse(response,version,count){
 assert.equal(response.model,models[version].alias);assert.equal(response.stop,true);assert.equal(response.stop_type,'limit');assert.equal(response.id_slot,0);
 assert.deepEqual([response.tokens_evaluated,response.tokens_predicted,response.tokens_cached],[4,count,4+count-1]);
 assert.deepEqual([response.timings.cache_n,response.timings.prompt_n,response.timings.predicted_n],[0,4,count]);
}
function verify(r){
 assert.deepEqual(r.models,models);
 assert.deepEqual(r.probes.map(p=>p.version),['stable','bad','good']);
 const outputs={};
 for(const p of r.probes){
  assert.deepEqual(p.health,{status:'ok'});assert.deepEqual(p.request,body(3,false));finalResponse(p.response,p.version,3);
  const expected=p.version==='bad'?[8,10,12]:[7,8,9];assert.deepEqual(p.response.tokens,expected,'fixed independent semantic probe');outputs[p.version]=[expected];
 }
 // Approval is derived from actual probe output, never a supplied passed/approved flag.
 const approved=new Set(r.probes.filter(p=>JSON.stringify(p.response.tokens)===JSON.stringify([7,8,9])).map(p=>p.version));
 assert.deepEqual([...approved],['stable','good']);
 const events=r.route_events;
 assert.deepEqual(events.map(e=>e.kind),['initial','rejected_semantics','admitted','admitted','old_reader_paused','published','admitted','published','rejected_stale_generation','resume_old_reader','admitted','finished']);
 ordered(events.map(e=>e.at_ns));
 let version='stable',generation=1;const bindings={};
 for(const e of events){
  if(e.kind==='published'){
   assert(approved.has(e.target));assert.equal(e.expected_generation,generation);version=e.target;generation++;
  }else if(e.kind==='rejected_semantics')assert(!approved.has(e.target));
  else if(e.kind==='rejected_stale_generation'){assert(approved.has(e.target));assert.notEqual(e.expected_generation,generation);}
  assert.equal(e.route_version,version,'route version independent replay');assert.equal(e.generation,generation,'route generation independent replay');
  if(e.kind==='admitted'){
   const expected={version,generation,model_sha256:models[version].sha256,alias:models[version].alias};
   assert.deepEqual(e.binding,expected);assert(!bindings[e.name]);bindings[e.name]=expected;
  }
 }
 assert.deepEqual([version,generation],['stable',3]);
 const requests=r.requests;
 assert.deepEqual(Object.keys(requests).sort(),['after_rejection','after_rollback','after_switch','old_stream']);
 const allOutputs={};
 for(const [name,q]of Object.entries(requests)){
  assert.deepEqual(q.binding,bindings[name]);assert.equal(q.http_status,200);
  const count=name==='old_stream'?32:3;assert.deepEqual(q.request,body(count,true));
  ordered([q.sent_ns,...q.frames.map(f=>f.at_ns),q.closed_ns]);
  const parsed=q.frames.filter(f=>f.data!=='[DONE]').map(f=>({at:f.at_ns,payload:JSON.parse(f.data)}));
  const ends=parsed.filter(f=>f.payload.stop);assert.equal(ends.length,1);assert.equal(ends[0],parsed.at(-1));
  finalResponse(ends[0].payload,q.binding.version,count);
  const tokens=parsed.filter(f=>!f.payload.stop&&!f.payload.prompt_progress).flatMap(f=>f.payload.tokens||[]);
  assert.equal(tokens.length,count);assert.deepEqual(tokens.slice(0,3),[7,8,9]);
  allOutputs[name]=tokens;
  const admitted=events.find(e=>e.kind==='admitted'&&e.name===name);assert(admitted.at_ns<=q.sent_ns);
 }
 assert.deepEqual([bindings.after_rejection.generation,bindings.old_stream.generation,bindings.after_switch.generation,bindings.after_rollback.generation],[1,1,2,3]);
 const old=requests.old_stream,switched=events.find(e=>e.kind==='published'&&e.target==='good'),rolled=events.find(e=>e.kind==='published'&&e.target==='stable');
 ordered([requests.after_rejection.closed_ns,old.sent_ns,old.frames[0].at_ns,old.reader_paused_ns,events[4].at_ns,switched.at_ns,
  requests.after_switch.sent_ns,requests.after_switch.closed_ns,rolled.at_ns,events[9].at_ns,old.reader_resumed_ns,old.frames[1].at_ns,old.closed_ns,requests.after_rollback.sent_ns]);
 // Native per-process tasks are ordered, independent of the controller's routing summary.
 outputs.stable.push(allOutputs.after_rejection,allOutputs.old_stream,allOutputs.after_rollback);outputs.good.push(allOutputs.after_switch);
 for(const [v,lines]of Object.entries(r.native_logs)){
  assert(lines.every((line,i)=>Number.isInteger(line.line)&&(!i||line.line>lines[i-1].line)));
  const text=lines.map(x=>x.text.replace(/^\S+\s+/, '')).join('\n');
  for(const marker of ['assigned to device CPU','CPU KV buffer size','CPU compute buffer size','n_slots = 1, n_ctx_slot = 128'])assert(text.includes(marker),v+': '+marker);
  const tasks=text.split(/(?=I slot[^\n]+new prompt,)/).slice(1);assert.equal(tasks.length,outputs[v].length);
  tasks.forEach((task,i)=>{
   assert(task.includes('task.n_tokens = 4'));
   const ids=[...task.matchAll(/next token:\s+(\d+)/g)].map(m=>+m[1]);assert.deepEqual(ids,outputs[v][i],v+': native samples match raw HTTP/SSE');
   const stops=[...task.matchAll(/stop processing: n_tokens = (\d+), truncated = (\d+)/g)];assert.equal(stops.length,1);
   assert.deepEqual([+stops[0][1],+stops[0][2]],[4+ids.length-1,0]);
  });
 }
}
verify(raw);
for(const mutate of [r=>r.probes[1].response.tokens=[7,8,9],r=>r.route_events[1].route_version='bad',r=>r.route_events[8].generation=4,r=>r.requests.old_stream.binding.generation=3,r=>r.requests.old_stream.reader_resumed_ns=0]){
 const bad=structuredClone(raw);mutate(bad);assert.throws(()=>verify(bad),assert.AssertionError);
}
const svg=fs.readFileSync('dist/diagrams/native-model-rollout.svg','utf8');
assert.deepEqual(JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]),{stable_tokens:[7,8,9],bad_tokens:[8,10,12],good_tokens:[7,8,9],all_healthy:true,route_versions:['stable','good','stable'],route_generations:[1,2,3],old_stream_generation:1,old_stream_tokens:32,reader_barrier:true,backend:'CPU'});
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='app.js')continue;vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
}
const article=vm.runInContext('articles.find(a=>a.id==="ai-lifecycle")',c);assert.equal(article.sections.length,8);
const html=article.sections[7][1],marker='<h3 id="native-model-rollout">';assert.equal(html.split(marker).length,2);assert(!html.split(marker)[1].includes('<pre'));
for(const value of ['diagrams/native-model-rollout.svg','labs/native-model-rollout.zip','labs/native-model-rollout/observations.json','labs/native-model-rollout/validation.json'])assert(html.includes(value),value);
const files=['README.md','rollout_lab.py','make_fixture.py','observations.json','validation.json'];
execFileSync('python3',['-B','-c',`
import hashlib,json,sys,tempfile,xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
folder=Path(sys.argv[1]); names=json.load(sys.stdin)
sys.path.insert(0,str(folder.resolve()))
from make_fixture import build
expected=${JSON.stringify(models)}
with tempfile.TemporaryDirectory() as d:
 for version,entry in expected.items():
  p=Path(d)/(version+'.gguf');build(p,output_shift=entry['output_shift'],output_scale=entry['output_scale'])
  assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256']
root=ET.parse('dist/diagrams/native-model-rollout.svg').getroot()
assert root.attrib['width']=='960'
for t in root.iter('{http://www.w3.org/2000/svg}text'): assert float(t.attrib.get('font-size','20'))>=18
with ZipFile(folder.with_suffix('.zip')) as z:
 assert sorted(z.namelist())==sorted(folder.name+'/'+n for n in names)
 assert z.testzip() is None
 for n in names: assert z.read(folder.name+'/'+n)==(folder/n).read_bytes()
`,folder],{input:JSON.stringify(files)});
console.log('PASS: native CPU healthy/bad semantic contrast; independent route/epoch/admission replay, 32-token pinned old stream, raw SSE/native sample agreement, stale/rejection mutations, generated model/source hashes, SVG/article/ZIP. Reader barrier is not a compute pause.');
