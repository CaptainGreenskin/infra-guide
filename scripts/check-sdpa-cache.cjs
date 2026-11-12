/* Same weights and original full-prefix oracle; native API values, wrong-mask probe and source-bound figure. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'dist/labs/sdpa-cache');
const record=JSON.parse(fs.readFileSync(path.join(folder,'validation.json'),'utf8'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const[name,sha]of Object.entries(record.source_sha256))assert.equal(hash(fs.readFileSync(path.join(folder,name))),sha,name+': source changed after execution');
assert.equal(fs.readFileSync(path.join(folder,'tiny_decoder.py'),'utf8'),fs.readFileSync(path.join(root,'dist/labs/model-foundations/tiny_decoder.py'),'utf8'));
function verify(r){
 assert.equal(r.status,'passed');assert.equal(r.torch.split('+')[0],'2.5.1');assert.equal(r.device,'cpu');assert.equal(r.dtype,'float64');assert.equal(r.backend,'SDPBackend.MATH');assert.equal(r.model_parameters,664);
 assert(r.observed_backend_events.includes('aten::_scaled_dot_product_attention_math'));
 const close=(actual,expected)=>{assert.equal(actual.length,expected.length);for(let i=0;i<expected.length;i++)if(Array.isArray(expected[i]))close(actual[i],expected[i]);else assert(Math.abs(actual[i]-expected[i])<1e-12);};
 assert.deepEqual(r.paper_api.expected_full,[[2,0],[.5,3],[3.5,2]]);close(r.paper_api.native_full,r.paper_api.expected_full);close(r.paper_api.native_last,[3.5,2]);close(r.paper_api.wrong_is_causal_last,[2,0]);
 for(const item of Object.values(r.cases)){assert(item.logits_max_error>=0&&item.logits_max_error<1e-10);let past=0;for(let i=0;i<item.chunks.length;i++){
  const len=item.chunks[i],event=item.trace[i];past+=len;assert.equal(event.cache_length,past);assert.deepEqual(event.kv_shape,[2,2,past,4]);
  assert.deepEqual(event.query_positions,Array.from({length:len},(_,j)=>past-len+j));
  assert.deepEqual(event.visible,event.query_positions.map(q=>Array.from({length:past},(_,k)=>k<=q)));
 }}
 assert(r.negative_is_causal.assertion_rejected);assert(r.negative_is_causal.logits_max_error>1e-5);assert.deepEqual(r.negative_is_causal.actual_first_decode_qk_lengths,[1,3]);
 assert.deepEqual(r.negative_is_causal.trace[1].visible,[[true,false,false]]);assert.deepEqual(r.negative_is_causal.trace[1].required_visible,[[true,true,true]]);
 const g=r.generation;assert.deepEqual(g.prompt,[0,1]);assert.equal(g.output_count,3);assert.equal(g.generated_ids.length,3);assert.equal(g.final_cached_positions,4);
 assert.deepEqual(g.trace.map(e=>e.cache_length),[2,3,4]);assert.deepEqual(g.logical_sequence_including_last_output,[...g.prompt,...g.generated_ids]);assert(g.trace.every(e=>e.logits_max_error<1e-10));
}
verify(record.program);
const c={};vm.createContext(c);const shell=fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8');
for(const[,file]of shell.matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js'&&file!=='sdpa-cache-bridge.js')vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),c,{filename:file});
const read=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,c)));
const before=read("articles.filter(a=>['model-serving','flash-attention-io'].includes(a.id)).map(a=>({id:a.id,sections:a.sections}))");
vm.runInContext(fs.readFileSync(path.join(root,'dist/sdpa-cache-bridge.js'),'utf8'),c,{filename:'sdpa-cache-bridge.js'});
const after=read("articles.filter(a=>['model-serving','flash-attention-io'].includes(a.id)).map(a=>({id:a.id,sections:a.sections}))");
for(let j=0;j<before.length;j++){
 assert.equal(after[j].id,before[j].id);assert.deepEqual(after[j].sections.map(s=>s[0]),before[j].sections.map(s=>s[0]));
 for(let i=0;i<before[j].sections.length;i++)assert(after[j].sections[i][1].startsWith(before[j].sections[i][1]),'original body and full pre must remain at '+before[j].id+':'+i);
}
assert.deepEqual(read('sdpaCacheEvidence'),record);const files=read('sdpaCacheFiles');for(const name of ['cache_lab.py','tiny_decoder.py'])assert.equal(files[name],fs.readFileSync(path.join(folder,name),'utf8'));
const svg=fs.readFileSync(path.join(root,'dist/diagrams/sdpa-cache-path.svg'),'utf8');
const md=JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
assert.deepEqual(md.source_sha256,record.source_sha256);assert.deepEqual(md.visible,[[true,true,true,false],[true,true,true,true]]);assert.equal(md.model_parameters,664);assert.equal(md.backend,'SDPBackend.MATH');
cp.execFileSync('python3',['-B','-c','import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(str(p)+".zip"); names=[f.name for f in p.iterdir() if f.is_file()]; assert set(z.namelist())==set(names); assert all(z.read(n)==(p/n).read_bytes() for n in names)',folder],{encoding:'utf8'});
const serving=fs.readFileSync(path.join(root,'dist/article/model-serving/index.html'),'utf8');
const entry=serving.split('<h3 id="same-prompt-serving-rounds">')[1]?.split('<details')[0];
assert(entry,'the measured three-round request is visible before the longer example');
const generation=record.program.generation;
const entryRows=[...entry.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)];
assert.deepEqual(entryRows.map(row=>[row[1],row[2],Number(row[3]),Number(row[4])]),
 generation.trace.map((step,i)=>[i?'解码第 '+i+' 步':'预填充',i?'上一轮的 '+generation.trace[i-1].selected_id:JSON.stringify(step.input_ids),step.selected_id,step.cache_length]));
assert(entry.includes(JSON.stringify(generation.logical_sequence_including_last_output))&&entry.includes('P+G−1'));
assert(entry.includes('href="/article/transformer-model/#generation-cache-steps"')&&entry.includes('href="/article/model-serving/#sdpa-cache-storage-bytes"'));
const intro=fs.readFileSync(path.join(root,'dist/article/transformer-model/index.html'),'utf8');
assert(intro.split('<h3 id="generation-cache-steps">')[1]?.split('<details')[0].includes('href="/article/model-serving/#same-prompt-serving-rounds"'));
const performance=fs.readFileSync(path.join(root,'dist/article/inference-performance/index.html'),'utf8');
assert(performance.split('<h3 id="native-slot-handoff">')[1]?.split('<figure')[0].includes('href="/article/model-serving/#same-prompt-serving-rounds"'));
const storage=serving.split('<h3 id="sdpa-cache-storage-bytes">')[1]?.split('</details>')[0];
assert(storage?.includes('href="/article/gpu-memory/#memory-state-objects"'));
assert(storage.includes('href="/article/inference-performance/#native-slot-handoff"'));
const [kv,heads,positions,headWidth]=record.program.cases.prefill_then_decode.trace.at(-1).kv_shape;
const finalElements=kv*heads*positions*headWidth;
assert(storage.includes('四格对应 '+finalElements*8+' 字节')&&storage.includes('同样四格是 '+finalElements*2+' 字节'));
const memory=fs.readFileSync(path.join(root,'dist/article/gpu-memory/index.html'),'utf8');
assert(memory.includes('href="/article/model-serving/#sdpa-cache-storage-bytes"'));
const storageRows=[...storage.matchAll(/<tr><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)]
 .map(match=>match.slice(1).map(Number));
assert.deepEqual(storageRows,[[2,256,384,1],[3,384,384,2],[4,512,512,2]]);
const storageProbe=storage.match(/<code>python -B - &lt;&lt;&#39;PY&#39;\n([\s\S]+?)\nPY<\/code>/)?.[1];
assert(storageProbe,'the published example contains a complete replay command');
if(process.env.INFRA_TORCH_PYTHON){
 const python=process.env.INFRA_TORCH_PYTHON;
 verify(JSON.parse(cp.execFileSync(python,['-B',path.join(folder,'cache_lab.py')],{encoding:'utf8',timeout:45000})));
 const decode=code=>code.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
 const stdout=cp.execFileSync(python,['-B','-'],{input:decode(storageProbe),cwd:folder,encoding:'utf8',timeout:45000});
 assert.deepEqual(stdout.trim().split('\n').slice(1).map(row=>row.split(' ').map(Number)),storageRows);
}
console.log('PASS: native CPU SDPA cache equals original TinyDecoder logits, exact hand calculation, real wrong-mask rejection, generation P+G-1, old h2/pre order and source-bound mask figure. GPU performance not inferred.');
