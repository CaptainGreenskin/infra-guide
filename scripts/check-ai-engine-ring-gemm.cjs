/* Cross-check native observations, archive bytes, and device-execution boundaries. */
const assert=require('node:assert/strict'), fs=require('node:fs'), cp=require('node:child_process');
const {createHash}=require('node:crypto');
const read=file=>fs.readFileSync('dist/'+file,'utf8');
const json=file=>JSON.parse(read(file));
const digest=value=>createHash('sha256').update(value).digest('hex');

const native='labs/native-inference/';
const observed=json(native+'validation.json'), raw=json(native+'native-responses.json');
const stderr=read(native+'native-stderr.log');
assert.equal(observed.status,'passed');
assert.equal(observed.engine.backend,'CPU');
assert.equal(observed.engine.commit,'cd959bae99ff4bed22bef2604f45241c09bbb8c8');
assert.equal(observed.model.kind,'synthetic');
assert.deepEqual(Object.keys(observed.source_sha256).sort(),['engine_walkthrough.py','make_fixture.py']);
for(const [file,hash]of Object.entries(observed.source_sha256))assert.equal(digest(read(native+file)),hash);
assert(stderr.includes('CPU KV buffer size')&&stderr.includes('CPU compute buffer size'));
const nativeCases=stderr.split(/(?=I slot[^\n]+new prompt,)/).slice(1);
assert.deepEqual(observed.cases.map(c=>c.name),['cold','repeat','changed_suffix','cache_disabled']);
assert.equal(nativeCases.length,4);
let priorPrompt=[];
for(const [i,caseRow]of observed.cases.entries()){
 const {request,http_status,events}=raw.completions[caseRow.name];
 const prompt=raw.tokenizations[caseRow.text].response.tokens.map(token=>token.id);
 const result=events.at(-1);
 assert.equal(http_status,200);
 assert.equal(result.stop,true);
 assert.deepEqual(prompt,request.prompt);
 assert.deepEqual(prompt,caseRow.prompt_ids);
 assert.equal(request.cache_prompt,caseRow.cache_prompt);
 let shared=0;
 while(shared<prompt.length&&prompt[shared]===priorPrompt[shared])shared++;
 assert.deepEqual(caseRow.matching_previous_prompt_prefix_ids,prompt.slice(0,shared));
 const reused=request.cache_prompt?Math.min(shared,prompt.length-1):0;
 const newPrompt=prompt.slice(reused);
 const output=events.filter(event=>!event.prompt_progress&&!event.stop).flatMap(event=>event.tokens);
 assert.equal(output.length,3);
 assert.deepEqual(output,i<2?[7,8,9]:[11,12,13]);
 assert.deepEqual(output,caseRow.api.output_ids);
 assert.deepEqual(output,caseRow.native.sampled_ids);
 assert.deepEqual([result.timings.cache_n,result.timings.prompt_n,result.timings.predicted_n,result.tokens_cached],
  [reused,newPrompt.length,output.length,prompt.length+output.length-1]);
 assert.deepEqual([caseRow.api.cache_n,caseRow.api.prompt_n,caseRow.api.predicted_n,caseRow.api.tokens_cached],
  [result.timings.cache_n,result.timings.prompt_n,result.timings.predicted_n,result.tokens_cached]);

 const batches=[...nativeCases[i].matchAll(/ubatch_print: +n_tokens += (\d+)\n((?:D ubatch_print:[^\n]+\n)+)/g)].map(match=>({
  n_tokens:Number(match[1]),
  rows:[...match[2].matchAll(/id = +(\d+) .*?pos = +(\d+), n_seq_id = +1, seq_id = \[(\d+)\], output = (\d)/g)]
   .map(m=>({token_id:Number(m[1]),position:Number(m[2]),sequence:Number(m[3]),logits_requested:m[4]==='1'}))
 }));
 assert.deepEqual(batches,caseRow.native.batches);
 assert.deepEqual(batches.map(b=>b.rows.map(r=>r.token_id)),[newPrompt,[output[0]],[output[1]]]);
 assert.deepEqual(batches.flatMap(b=>b.rows.map(r=>r.position)),Array.from({length:newPrompt.length+2},(_,j)=>reused+j));
 assert(batches.every(batch=>batch.n_tokens===batch.rows.length&&batch.rows.every((row,j)=>row.sequence===0&&row.logits_requested===(j===batch.rows.length-1))));
 assert(nativeCases[i].includes('cached n_tokens = '+reused+',')&&nativeCases[i].includes('stop processing: n_tokens = '+result.tokens_cached+','));
 priorPrompt=prompt;
}
assert(nativeCases[1].includes('n_past was set to 3'));

const ring='labs/ring-context-training/';
const ringFigure=read('diagrams/v77-ring-training.svg');
const ringMap=JSON.parse(ringFigure.match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/)[1]);
for(const [ranks,positions,recordFile]of [[2,1024,'two-ranks.json'],[3,1536,'validation.json']]){
 const record=json(ring+recordFile);
 assert.deepEqual([record.status,record.device,record.backend,record.world_size,record.positions],['passed','cpu','gloo',ranks,positions]);
 assert.equal(record.source_sha256,digest(read(ring+'ring_training.py')));
 assert.equal(record.ranks.length,ranks);
 for(const [i,row]of record.ranks.entries()){
  assert.equal(row.rank,i);
  assert.deepEqual(row.positions,[i*512,(i+1)*512]);
  assert.deepEqual(row.visited_owners,Array.from({length:ranks},(_,hop)=>(i-hop+ranks)%ranks));
  assert.deepEqual([row.forward_rotations,row.backward_rotations,row.returned_owner],[ranks-1,ranks,i]);
  const errors=row.output_and_gradient_max_abs_errors;
  assert.deepEqual(Object.keys(errors).sort(),['loss','output','projection_gradients','updated_weights','weight_gradients']);
  assert(Object.values(errors).every(error=>error>=0&&error<1e-10));
  assert(row.drop_remote_dkv_max_abs_error>1e-4);
 }
 if(ranks===3){
  assert.deepEqual(ringMap.position_ranges_half_open,record.ranks.map(row=>row.positions));
  assert.deepEqual(ringMap.send_edges,[[0,1],[1,2],[2,0]]);
  assert.deepEqual([ringMap.forward_hops,ringMap.backward_hops],[2,3]);
 }
}

const gemm='labs/gemm-variants/';
const compile=json(gemm+'validation.json'),ptx=read(gemm+'gemm_variants.ptx');
assert.equal(compile.status,'compile-validated-device-pending');
assert.equal(compile.device_execution,false);
assert.equal(compile.workflow_run_id,42549260483);
assert.equal(compile.workflow_commit,'33ce2849fef9692e15fa01f3ec09429596dd8c58');
assert.equal(compile.source_sha256,digest(read(gemm+'gemm_variants.cu')));
assert.equal(digest(cp.execFileSync('git',['show',compile.workflow_commit+':dist/'+gemm+'gemm_variants.cu'])),compile.source_sha256);
assert.deepEqual(compile.probe,json(gemm+'device-probe.json'));
assert.deepEqual([compile.probe.status,compile.probe.device_execution,compile.probe.device_count,compile.probe_exit_code],['not-run',false,0,2]);
assert.equal(compile.probe.source_sha256,compile.source_sha256);
assert.equal(compile.ptx_sha256,digest(ptx));
const entries=[...ptx.matchAll(/\.entry\s+(gemm_\w+_kernel)\s*\(/g)].map(m=>m[1]).sort();
assert.deepEqual(entries,['gemm_naive_kernel','gemm_reuse_kernel','gemm_tiled_kernel']);
assert.deepEqual(compile.entries,entries);
assert(!Object.hasOwn(compile,'benchmark'));
const gemmFigure=read('diagrams/v77-gemm-reuse.svg');
assert(gemmFigure.includes('data-source-fp32-loads="'+2*(16*16+16*16)+'"'));
assert(gemmFigure.includes('data-source-fp32-loads="'+(32*16+16*16)+'"'));

const targets=[
 ['model-serving','native-inference-engine-lab',native,'v77-engine-path'],
 ['flash-attention-io','ring-context-training',ring,'v77-ring-training'],
 ['operator-profiling','same-device-gemm',gemm,'v77-gemm-reuse']
];
for(const [chapter,anchor,folder,figure]of targets){
 const html=read('article/'+chapter+'/index.html');
 assert(html.includes('id="'+anchor+'"')&&html.includes(folder.slice(0,-1)+'.zip')&&html.includes(figure+'.svg'));
}
assert(read('article/inference-performance/index.html').includes('id="vllm-v1-request-path"'));
cp.execFileSync('python3',['-B','-c',`from pathlib import Path
from zipfile import ZipFile
for folder in ('native-inference', 'ring-context-training', 'gemm-variants'):
 p=Path('dist/labs')/folder
 with ZipFile(p.with_suffix('.zip')) as z:
  assert z.testzip() is None
  assert sorted(z.namelist()) == sorted(f.name for f in p.iterdir() if f.is_file())
  for name in z.namelist():
   assert z.read(name) == (p/name).read_bytes(), name
`],{encoding:'utf8'});
console.log('PASS: four real llama.cpp CPU requests reconstructed from HTTP and native batches; two and three Gloo ring records, dropped-gradient control; actual CUDA compile/PTX, zero-device probe and exact archives. GPU execution is not inferred.');
