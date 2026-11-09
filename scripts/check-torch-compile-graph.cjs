/* Recompute fixture outputs and check the captured FX segments independently. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const folder='dist/labs/torch-compile-graph';
const files=['compile_graph.py','requirements.txt'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=JSON.parse(fs.readFileSync(folder+'/validation.json'));
const inputs={
 positive:[-1,1,2],negative:[-4,-2,0],zero:[-2,-1,0],
 wide_positive:[-2,0,1,2],wide_negative:[-3,-2,-1,0]
};
function reference(id){
 const shifted=inputs[id].map(value=>value+1);
 const sum=shifted.reduce((total,value)=>total+value,0);
 return {sum,output:shifted.map(value=>sum>0?value*2:value-2)};
}
const tensorOps=['add','sum','gt','mul','sub','where'];
const sameShape=['positive','negative','zero','positive'];

function verifyRun(run,cases,operations,newCounts,executed){
 assert.deepEqual(run.calls.map(row=>row.case),cases);
 assert.deepEqual(run.captures.map(row=>row.operations),operations);
 assert.equal(run.captures.length,operations.length);
 let next=0;
 for(const [i,row] of run.calls.entries()){
  assert.deepEqual(row.output,reference(row.case).output);
  assert.equal(row.new_graph_ids.length,newCounts[i]);
  assert.deepEqual(row.new_graph_ids,run.captures.slice(next,next+newCounts[i]).map(capture=>capture.id));
  assert.deepEqual(row.executed_graph_ids,executed[i].map(index=>run.captures[index].id));
  assert(Array.isArray(row.guard_failures));
  next+=newCounts[i];
 }
 assert.equal(next,run.captures.length);
 assert.equal(new Set(run.captures.map(capture=>capture.id)).size,operations.length);
}
function verify(data){
 assert.equal(data.schema,1);
 assert.equal(data.status,'passed');
 assert.deepEqual(data.source_sha256,Object.fromEntries(files.map(name=>[name,sha(fs.readFileSync(folder+'/'+name))])));
 assert.match(data.environment.torch,/^2\.5\.1(?:\+.*)?$/);
 assert.equal(data.environment.device,'cpu');
 assert.equal(data.environment.capture_scalar_outputs,false);
 const {report}=data;
 assert.deepEqual(report.cases.map(row=>row.id),Object.keys(inputs));
 for(const row of report.cases){
  const expected=reference(row.id);
  assert.deepEqual(row.input,inputs[row.id]);
  assert.equal(row.shifted_sum,expected.sum);
  assert.deepEqual(row.output,expected.output);
 }
 assert.equal(report.python_partial.fullgraph,false);
 verifyRun(report.python_partial,sameShape,[['add','sum'],['mul'],['sub'],['sub']],[2,1,1,0],[[0,1],[0,2],[0,3],[0,1]]);
 assert.deepEqual(report.python_partial.calls.map(row=>row.guard_failures),[
  [],["L['___stack0'] == 5.0"],["L['___stack0'] == -3.0","L['___stack0'] == 5.0"],[]
 ]);
 assert.deepEqual(report.python_fullgraph,{
  fullgraph:true,status:'rejected',error_type:'Unsupported',reason:'Tensor.item',captured_count:0
 });
 assert.equal(report.tensor_fullgraph.fullgraph,true);
 verifyRun(report.tensor_fullgraph,sameShape,[tensorOps],[1,0,0,0],[[0],[0],[0],[0]]);
 assert.equal(report.shape_control.fullgraph,true);
 assert.equal(report.shape_control.dynamic,false);
 verifyRun(report.shape_control,[...sameShape,'wide_positive','wide_negative','positive'],[tensorOps,tensorOps],[1,0,0,0,1,0,0],[[0],[0],[0],[0],[1],[1],[0]]);
 assert.deepEqual(report.shape_control.captures.map(row=>row.input_shapes),[[[3]],[[4]]]);
 assert.match(report.shape_control.calls[4].guard_failures.join('\n'),/size mismatch at index 0\. expected 3, actual 4/);
 assert.deepEqual(report.dynamo_explain,{
  python:{graph_count:2,graph_break_count:1,reasons:['Tensor.item']},
  tensor:{graph_count:1,graph_break_count:0,reasons:[]}
 });
}

function verifyNative(native){
 assert.equal(native.status,'passed');
 assert.equal(native.backend,'inductor');
 assert.equal(native.fullgraph,true);
 assert.deepEqual(native.outputs,sameShape.map(id=>({case:id,output:reference(id).output})));
 assert(Number.isSafeInteger(native.generated_kernel_count)&&native.generated_kernel_count>0);
 assert(Number.isSafeInteger(native.generated_cpp_vec_kernel_count)&&native.generated_cpp_vec_kernel_count>=0);
 assert(native.native_artifacts.length>0);
 for(const artifact of native.native_artifacts)for(const digest of ['cpp_sha256','library_sha256'])assert.match(artifact[digest],/^[0-9a-f]{64}$/);
}
verify(record);
verifyNative(record.report.inductor);
assert.equal(record.report.inductor.generated_kernel_count,2);
assert.equal(record.report.inductor.generated_cpp_vec_kernel_count,1);
assert.equal(record.report.inductor.native_artifacts.length,1);
const svg=fs.readFileSync('dist/diagrams/torch-compile-graph-break.svg','utf8');
assert(svg.includes('<title')&&svg.includes('<desc'));
assert.deepEqual(JSON.parse(svg.match(/<metadata>(.*?)<\/metadata>/s)[1]),{
 record:'labs/torch-compile-graph/validation.json',
 positive_python_initial_capture_count:record.report.python_partial.calls[0].new_graph_ids.length,
 tensor_initial_capture_count:record.report.tensor_fullgraph.calls[0].new_graph_ids.length,
 fixed_shape_capture_deltas:record.report.shape_control.calls.map(row=>row.new_graph_ids.length)
});
if(process.env.TORCH_COMPILE_PYTHON){
 const runNative=process.env.TORCH_COMPILE_NATIVE==='1';
 const args=['-B',folder+'/compile_graph.py'];
 if(runNative)args.push('--inductor');
 const replay=JSON.parse(execFileSync(process.env.TORCH_COMPILE_PYTHON,args,{encoding:'utf8',timeout:120000}));
 verify(replay);
 if(runNative)verifyNative(replay.report.inductor);
 else assert.equal(replay.report.inductor,null);
}
execFileSync('python3',['-c',`from pathlib import Path
from zipfile import ZipFile
folder=Path('dist/labs/torch-compile-graph')
with ZipFile(folder.with_suffix('.zip')) as archive:
 assert archive.testzip() is None
 files={p.name:p.read_bytes() for p in folder.iterdir() if p.is_file()}
 assert set(archive.namelist())=={'torch-compile-graph/'+name for name in files}
 for name,data in files.items():
  assert archive.read('torch-compile-graph/'+name)==data
`]);
const html=fs.readFileSync('dist/article/operator-profiling/index.html','utf8');
for(const marker of ['id="torch-compile-graph-break"','diagrams/torch-compile-graph-break.svg','labs/torch-compile-graph.zip',
 'labs/torch-compile-graph/validation.json','compile_graph.py','2、1、1、0 张图','add、sum、gt、mul、sub、where'])assert(html.includes(marker),marker);
assert(fs.readFileSync('dist/module/model-foundations/index.html','utf8').includes('/article/operator-profiling/#torch-compile-graph-break'));
assert(fs.readFileSync('dist/roadmap/ai-operators/index.html','utf8').includes('?goal=ai-operators#torch-compile-graph-break'));
assert(fs.readFileSync('dist/interview/companies/index.html','utf8').includes('/article/operator-profiling/#torch-compile-graph-break'));
assert(fs.readFileSync('dist/labs/index.html','utf8').includes('id="lab-ai-torch-compile-graph"'));
console.log('PASS: exact PyTorch capture and CPU Inductor records, independent outputs, graph/guard and shape controls, source/ZIP and reading links.');
