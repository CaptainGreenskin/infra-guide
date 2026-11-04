const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const folder='dist/labs/streamed-tool-calls',source=fs.readFileSync(folder+'/streamed_tool_calls.py','utf8'),record=JSON.parse(fs.readFileSync(folder+'/validation.json'));
assert.equal(record.status,'passed');assert.equal(record.source_sha256,crypto.createHash('sha256').update(source).digest('hex'));
const names=['normal','interleaved','truncated_arguments','transport_truncated','unfinished_done_event','parseable_then_garbage','duplicate_key','boolean_limit','denied_tenant','unknown_name','arguments_limit','invalid_utf8_before_done','late_stream_error'];
function validate(run){
 assert.deepEqual(Object.keys(run.results),names);assert.deepEqual(Object.keys(run.fixture_sha256),names);
 for(const name of names){const result=run.results[name];assert.equal(result.read_size,7);assert.equal(result.local_tool_calls,['normal','interleaved','late_stream_error'].includes(name)?1:0);assert.equal(result.observations.length,result.local_tool_calls);assert(result.bytes_read>0);}
 const r=run.results;assert.equal(r.normal.bytes_read,287);assert.equal(r.normal.reads,287/7);assert.equal(r.normal.events,3);assert.equal(r.normal.naive_chunk_decode_errors,2);
 for(const name of ['normal','interleaved','late_stream_error']){assert.deepEqual(r[name].observations[0].values,[10,27]);assert.equal(r[name].observations[0].values.reduce((a,b)=>a+b,0),37);assert.equal(r[name].observations[0].tenant,'A');}
 assert.equal(r.interleaved.states.a.status,'executed');assert.equal(r.interleaved.states.b.status,'denied');
 for(const name of ['truncated_arguments','unfinished_done_event']){assert.deepEqual(r[name].pending,['c1']);assert.equal(r[name].states.c1.status,'incomplete_at_eof');assert.equal(r[name].stream_error,null);}
 assert.equal(r.transport_truncated.stream_error,'http_incomplete');assert.equal(r.invalid_utf8_before_done.stream_error,'invalid_utf8');
 for(const name of ['transport_truncated','invalid_utf8_before_done'])assert.equal(r[name].states.c1.status,'incomplete_after_stream_error');
 assert.equal(r.late_stream_error.stream_error,'invalid_utf8');assert.equal(r.late_stream_error.states.c1.status,'executed');assert.deepEqual(r.late_stream_error.pending,[]);
 assert.equal(r.parseable_then_garbage.parseable_prefixes,1);assert.equal(r.parseable_then_garbage.states.c1.reason,'invalid_arguments_json');
 assert.equal(r.duplicate_key.states.c1.reason,'duplicate_json_key');assert.equal(r.boolean_limit.states.c1.reason,'name_or_schema');assert.equal(r.unknown_name.states.c1.reason,'name_or_schema');
 assert.equal(r.denied_tenant.states.c1.status,'denied');assert.equal(r.arguments_limit.states.c1.reason,'arguments_too_large');
}
assert.equal(record.runs.length,2);record.runs.forEach(validate);assert.deepEqual(record.runs.map(r=>r.python),['3.9.6','3.12.13']);assert.deepEqual(record.runs[0].fixture_sha256,record.runs[1].fixture_sha256);
const replay=cp.spawnSync('python3',[folder+'/streamed_tool_calls.py'],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});assert.equal(replay.status,0,replay.stderr);validate(JSON.parse(replay.stdout));

// Test the character/event boundary under independent chunk partitions and CRLF.
const probe=cp.spawnSync('python3',['-B','-c',`import importlib.util,json
from pathlib import Path
p=Path('${folder}/streamed_tool_calls.py')
s=importlib.util.spec_from_file_location('stream_probe',p)
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
body=m.fixtures()['normal']
expected=[{'type':'start','call_id':'c1','name':'report.read'},
          {'type':'delta','call_id':'c1','text':'{"tenant":"A","report":"中国区日报","limit":3}'},
          {'type':'done','call_id':'c1'}]
for wire in [body,body.replace(b'\\n',b'\\r\\n')]:
 for size in [1,2,3,7,13,64]:
  parser=m.LFEvents();events=[]
  for i in range(0,len(wire),size):events+=parser.feed(wire[i:i+size])
  events+=parser.feed(b'',final=True)
  assert [m.strict_json(e) for e in events]==expected,(size,wire)
parser=m.LFEvents();events=parser.feed(body[:-2])+parser.feed(b'',final=True)
assert len(events)==2
try:m.strict_json('{"tenant":"B","tenant":"A"}')
except ValueError:pass
else:raise AssertionError('duplicate field silently accepted')
print('PASS:12 LF/CRLF chunk partitions, unfinished final event and strict duplicate keys')
`],{encoding:'utf8',timeout:15000});assert.equal(probe.status,0,probe.stderr);

const c={};vm.createContext(c);for(const [,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
assert.equal(vm.runInContext('streamedToolFiles["streamed_tool_calls.py"]',c),source);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const html=fs.readFileSync('dist/article/agent-runtime/index.html','utf8'),blocks=[...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].map(m=>decode(m[1]).trim());assert(blocks.includes(source.trim()));assert(html.includes('id="streaming-tool-lab"')&&html.includes('labs/streamed-tool-calls.zip'));
const a=vm.runInContext('articles.find(a=>a.id==="agent-runtime")',c);assert(a.sections[1][1].includes('服务端事件流'));assert(a.sections[1][1].includes('v37-stream-boundaries'));assert(a.sections[8][1].includes('v37-utf8-reads'));
const metadata=name=>{const s=fs.readFileSync('dist/diagrams/'+name+'.svg','utf8'),m=s.match(/<metadata>([\s\S]*?)<\/metadata>/);assert(m);return JSON.parse(decode(m[1]));};
const layers=metadata('v37-stream-boundaries');assert.equal(layers.body_bytes,287);assert.equal(layers.reads,41);assert.equal(layers.events,3);assert.equal(layers.local_tool_calls,1);assert.equal(layers.durable_receipt,false);
const bytes=metadata('v37-utf8-reads');assert.equal(bytes.fixture_sha256,record.runs[0].fixture_sha256.normal);assert.deepEqual(bytes.rows.map(r=>r.read),[28,29,30]);assert.deepEqual(bytes.rows.map(r=>r.chinese_output),['中','国区日','报']);assert.deepEqual(bytes.rows.map(r=>r.independent_decode),[false,false,true]);assert.deepEqual(bytes.rows[0].pending_bytes,[0xe5,0x9b]);
const all=Buffer.from(bytes.rows.flatMap(r=>r.bytes)),chinese=Buffer.from('中国区日报','utf8');assert(all.includes(chinese));assert.equal(all.indexOf(chinese),191-189);
const zip=cp.spawnSync('python3',['-c',`from pathlib import Path
import zipfile
p=Path('${folder}')
with zipfile.ZipFile(str(p)+'.zip') as z:
 assert len(z.namelist())==3
 for n in z.namelist(): assert z.read(n)==(p/Path(n).name).read_bytes(),n
`],{encoding:'utf8'});assert.equal(zip.status,0,zip.stderr);
console.log('PASS:13 actual local HTTP replays, independent invocation/state oracle, LF/CRLF partition checks, premature EOF and late-error observations; exact inline source, ZIP, byte-grid/layer metadata. Local read callback only; no model, durable receipt or Kairo claim.');
