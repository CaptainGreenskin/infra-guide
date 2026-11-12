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
const ringSource=read(ring+'ring_training.py');
for(const [ranks,positions,recordFile]of [[2,1024,'two-ranks.json'],[3,1536,'validation.json']]){
 const record=json(ring+recordFile);
 assert.deepEqual([record.status,record.device,record.backend,record.world_size,record.positions],['passed','cpu','gloo',ranks,positions]);
 assert.equal(record.source_sha256,digest(ringSource));
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
  const html=read('article/flash-attention-io/index.html');
  const lesson=html.slice(html.indexOf('<h3 id="ring-context-training">'),html.indexOf('<h3 id="ragged-ring-training">'));
  const [first,limit]=record.ranks[0].positions;
  const route=[...ringMap.send_edges.map(([sender])=>sender),record.ranks[0].returned_owner];
  assert(lesson.includes(`位置 ${first}–${limit-1}`) && lesson.includes(route.join(' → ')));
  const displayedErrors=[
   [Math.max(...record.ranks.map(row=>row.output_and_gradient_max_abs_errors.weight_gradients)), '1.17e-17', '1.17×10⁻¹⁷'],
   [Math.max(...record.ranks.map(row=>row.drop_remote_dkv_max_abs_error)), '4.07e-4', '4.07×10⁻⁴'],
  ];
  for(const [actual,rounded,shown]of displayedErrors){
   assert.equal(actual.toExponential(2),rounded);
   assert(lesson.includes(shown),shown);
  }
  assert(ringSource.includes('dist.all_reduce(weight_grads)\n    dist.all_reduce(dropped)'));
  assert(lesson.includes('反例保留相同前向，也做最后的 AllReduce'));
  assert(lesson.includes('/article/autograd-training/#section-3'));
  const autograd=read('article/autograd-training/index.html');
  const chainRule=autograd.slice(autograd.indexOf('id="section-3">'),autograd.indexOf('id="section-4">'));
  assert(chainRule.includes('/article/flash-attention-io/#ring-context-training'));
 }
}

const parallel='labs/context-parallel/';
const rowProof=json(parallel+'validation.json');
assert.equal(rowProof.source_sha256,digest(read(parallel+'context_attention.py')));
const rowTrace=rowProof.ranks[1].trace.find(item=>item.query_position===2);
assert.deepEqual(rowTrace.blocks.map(item=>[item.owner,item.visible_keys]),[[0,[0,1]],[1,[2]]]);
const finalRow=rowTrace.blocks.at(-1);
assert(Math.abs(finalRow.merged_max-Math.log(3))<1e-12);
assert.equal(finalRow.merged_denominator,2);
assert(Math.abs(finalRow.merged_weighted_values[0]/finalRow.merged_denominator-7/3)<1e-12);
const flash=read('article/flash-attention-io/index.html');
const rowHeading='<h3 id="context-parallel-row-backward">';
const rowStart=flash.indexOf(rowHeading),ringStart=flash.indexOf('<h3 id="ring-context-training">');
assert(rowStart>=0&&rowStart<ringStart);
const rowLesson=flash.slice(rowStart,ringStart);
for(const row of [['0 · 远端','1/6','−1/18','1/6'],['1 · 远端','1/3','−7/9','1/3'],['2 · 本地','1/2','5/6','1/2'],['3 · 未来','0','0','0']]){
 assert(rowLesson.includes('<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>'));
}
assert(ringSource.includes('weights = (scores - maximum).exp() / mass'));
assert(ringSource.includes('grad_scores = weights * (grad_out @ values.T - dot)'));
const rowReplay=rowLesson.match(/<pre\b[^>]*><code>python -B - &lt;&lt;&#39;PY&#39;\n([\s\S]*?)\nPY<\/code><\/pre>/)?.[1];
assert(rowReplay&&rowReplay.includes('from context_attention import fixture, block_attention'));
assert(rowReplay.includes('assert wrong[0, 0].item() == 0'));
if(process.env.INFRA_TORCH_PYTHON){
 const entities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
 const source=rowReplay.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g,key=>entities[key]);
 const result=cp.execFileSync(process.env.INFRA_TORCH_PYTHON,['-B','-'],{
  input:source,encoding:'utf8',cwd:'dist/'+parallel,timeout:30000
 });
 assert.match(result,/分数梯度 \[-0\.055556, -0\.777778, 0\.833333, -?0\.0\]/);
 assert.match(result,/仅对本地块归一化，位置 2 的分数梯度 0\.0/);
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
const companyGemm=read('interview/companies/index.html').match(/<tr><td>训练\/推理底层性能<br>[\s\S]*?<\/tr>/)?.[0];
assert(companyGemm&&companyGemm.includes('需目标环境'));
const jobLessons=[...companyGemm.matchAll(/href="(\/article\/[^\"]+)"/g)].map(match=>match[1]);
assert.deepEqual(jobLessons,['/article/training-performance/','/article/operator-profiling/#torch-compile-graph-break','/article/operator-profiling/#same-device-gemm']);
assert.equal(json('labs/torch-compile-graph/validation.json').environment.device,'cpu');
const metal=json('labs/metal-gemm/validation.json');
assert.match(metal.environment.device,/^Apple /);
assert(metal.benchmark.median_gpu_us.naive>0&&metal.benchmark.median_gpu_us.tiled>0);
assert(companyGemm.includes('CPU 图捕获对照和 Apple GPU 同卡 GEMM 计时。CUDA 三版已在 Linux 编译'));
assert(companyGemm.includes('<code>./gemm_variants --probe-only</code>，探测通过后留存数值回读、CUDA event 计时和 Nsight 指标'));
const gemmFigure=read('diagrams/v77-gemm-reuse.svg');
assert(gemmFigure.includes('data-source-fp32-loads="'+2*(16*16+16*16)+'"'));
assert(gemmFigure.includes('data-source-fp32-loads="'+(32*16+16*16)+'"'));
const gemmSource=read(gemm+'gemm_variants.cu');
const operator=read('article/operator-profiling/index.html');
const gemmLesson=operator.slice(operator.indexOf('id="same-device-gemm"'),operator.indexOf('id="native-metal-gemm"'));
assert(gemmLesson.includes('/article/operator-profiling/#gemm-two-row-reuse'));
const sourceFixtures=gemmSource.match(/FIXTURES\{\{([\s\S]*?)\}\};/)[1];
const shapes=[...sourceFixtures.matchAll(/\{(\d+), (\d+), (\d+)\}/g)].map(match=>match.slice(1).map(Number));
const outputs=entries.length*shapes.reduce((total,[m,,n])=>total+m*n,0);
const [groups,launches]=['GROUPS','REPEATS'].map(name=>Number(gemmSource.match(new RegExp(name+' = (\\d+)'))[1]));
const expectedPath=[
 './gemm_variants --probe-only','device-detected','reason',
 'device_count='+compile.probe.device_count,'退出码 '+compile.probe_exit_code,'驱动版本不足以支持 CUDA 运行时',
 '--validate','共 '+outputs+' 个结果',shapes.at(-1).join('×'),'max_abs_error',
 '--benchmark','采 '+groups+' 组',launches+' 次启动','event_ms_per_launch','median_event_ms_per_launch','Nsight Compute','显存读写字节','实际驻留率'
];
let lastPosition=-1;
for(const step of expectedPath){
 const position=gemmLesson.indexOf(step,lastPosition+1);
 assert(position>lastPosition,step);
 lastPosition=position;
}
assert.equal(compile.probe.reason,'CUDA driver version is insufficient for CUDA runtime version');
assert(gemmLesson.includes('设备结果、时间和计数器仍待在目标卡采集'));
const modelField=read('module/model-foundations/index.html');
const gpuConcept=modelField.slice(modelField.indexOf('id="knowledge-mf-gpu"'),modelField.indexOf('id="knowledge-mf-roofline"'));
assert(gpuConcept.includes('/article/operator-profiling/#same-device-gemm')&&gpuConcept.includes('目标卡数据待采集'));

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
