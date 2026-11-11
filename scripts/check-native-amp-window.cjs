/* Verify the recorded native intermediates with independent scalar arithmetic. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const dir='dist/labs/native-amp-window',script=dir+'/amp_window.py',zip=dir+'.zip';
const read=file=>fs.readFileSync(file),json=file=>JSON.parse(read(file));
const result=json(dir+'/validation.json');
const commit='a8d6afb511a69687bbb2b7e88a3cf67917e1697e';
const fp32='torch.float32',fp16='torch.float16',halfMax=65504;
const value=(value,dtype=fp32)=>({value,dtype});
const config={initial_scale:32768,growth_interval:2,growth_factor:2,backoff_factor:0.5,
 lr:0.125,betas:[0.5,0.75],eps:1e-8,weight_decay:0,fused:false,foreach:false};
const schedule={warmup:[1,1],overflow:[1,2],retry:[1,2],growth:[1,2],
 with_scaler:[1,2],without_scaler:[1,2],fp32_control:[1,2]};
const scalerState=(scale,tracker)=>({scale,growth_factor:2,backoff_factor:0.5,growth_interval:2,_growth_tracker:tracker});

function roundHalf(x){
 if(x===0)return 0;
 const spacing=2**(Math.max(-14,Math.floor(Math.log2(x)))-10);
 const grid=x/spacing,low=Math.floor(grid),remainder=grid-low;
 const nearest=low+Number(remainder>0.5||(remainder===0.5&&low%2===1));
 return nearest*spacing>halfMax?'Inf':nearest*spacing;
}
assert.equal(roundHalf(65519),65504);
assert.equal(roundHalf(65520),'Inf');
assert.equal(roundHalf(2**-25),0);
assert.equal(roundHalf(3*2**-25),2**-23);

function verify(observations){
 assert.deepEqual(Object.keys(observations),Object.keys(schedule));
 for(const [name,xs]of Object.entries(schedule)){
  const row=observations[name],{before,after}=row;
  const useAmp=name!=='fp32_control',precision=useAmp?fp16:fp32;
  const round=useAmp?roundHalf:Math.fround;
  const weight=before.weight.value,scale=before.scaler.scale;
  const sourceWeight=round(weight);
  assert.equal(before.weight.dtype,fp32);
  assert.equal(row.autocast,useAmp);
  assert(row.cleared_gradient);
  assert(row.scaler_step_returned_none);
  assert.deepEqual(row.microbatches.map(m=>m.x),xs);
  let total=0,lossTotal=0;
  row.microbatches.forEach((micro,i)=>{
   const x=xs[i],output=round(sourceWeight*x);
   const loss=Math.fround(output*output),dy=round(scale*output),dw=dy==='Inf'?'Inf':round(dy*x);
   assert.deepEqual(micro.output,value(output,precision),name+': native output');
   assert.deepEqual(micro.loss,value(loss),name+': FP32 loss');
   assert.deepEqual(micro.output_gradient,value(dy,precision),name+': native dY');
   if(useAmp){
    assert.equal(micro.weight_cast_node,'ToCopyBackward0');
    assert.deepEqual(micro.weight_gradient_before_widening,value(dw,fp16),name+': native dW before widening');
   }else{
    assert(!Object.hasOwn(micro,'weight_gradient_before_widening'));
    assert(!Object.hasOwn(micro,'weight_cast_node'));
   }
   assert.deepEqual(micro.gradient_at_fp32_parameter,value(dw),name+': dW at FP32 leaf');
   total=dw==='Inf'||total==='Inf'?'Inf':Math.fround(total+dw);
   assert.deepEqual(micro.accumulated_gradient,value(total),name+': FP32 accumulation');
   lossTotal+=loss;
  });
  assert.equal(row.mean_loss,lossTotal/xs.length);
  const grad=total==='Inf'?'Inf':Math.fround(total/scale);
  assert.deepEqual(row.unscaled_gradient,value(grad),name+': unscale');
  if(grad==='Inf'){
   assert.equal(row.optimizer_calls,0);
   assert.deepEqual(after.weight,before.weight);
   assert.deepEqual(after.optimizer,before.optimizer);
   assert.deepEqual(after.scaler,scalerState(scale*config.backoff_factor,0));
  }else{
   assert.equal(row.optimizer_calls,1);
   const step=(before.optimizer.step?.value||0)+1;
   const [beta1,beta2]=config.betas;
   const m=Math.fround(beta1*(before.optimizer.exp_avg?.value||0)+(1-beta1)*grad);
   const v=Math.fround(beta2*(before.optimizer.exp_avg_sq?.value||0)+(1-beta2)*grad*grad);
   const update=config.lr*(m/(1-beta1**step))/(Math.sqrt(v/(1-beta2**step))+config.eps);
   assert.deepEqual(after.optimizer.step,value(step));
   assert.equal(after.optimizer.exp_avg.dtype,fp32);
   assert.equal(after.optimizer.exp_avg_sq.dtype,fp32);
   assert(Math.abs(after.optimizer.exp_avg.value-m)<1e-6,name+': moment');
   assert(Math.abs(after.optimizer.exp_avg_sq.value-v)<1e-6,name+': second moment');
   assert.equal(after.weight.dtype,fp32);
   assert(Math.abs(after.weight.value-Math.fround(weight-update))<2e-7,name+': updated weight');
   const tracker=before.scaler._growth_tracker+1,grow=tracker===config.growth_interval;
   assert.deepEqual(after.scaler,scalerState(grow?scale*config.growth_factor:scale,grow?0:tracker));
  }
 }
 const {warmup,overflow,retry,growth,with_scaler,without_scaler,fp32_control}=observations;
 assert.deepEqual(warmup.before,{weight:value(1),optimizer:{},scaler:scalerState(32768,0)});
 for(const [prev,next]of [[warmup,overflow],[overflow,retry],[retry,growth]])assert.deepEqual(prev.after,next.before);
 assert.deepEqual(with_scaler,retry,'complete checkpoint reproduces the continuous attempt');
 for(const resumed of [without_scaler,fp32_control]){
  assert.deepEqual(resumed.before.weight,overflow.after.weight);
  assert.deepEqual(resumed.before.optimizer,overflow.after.optimizer);
  assert.deepEqual(resumed.before.scaler,scalerState(32768,0));
 }
 assert.equal(overflow.mean_loss,retry.mean_loss);
 assert.equal(overflow.mean_loss,fp32_control.mean_loss);
 assert.equal(overflow.microbatches[1].output_gradient.value,57344);
 assert.equal(overflow.microbatches[1].weight_gradient_before_widening.value,'Inf');
 assert.deepEqual([overflow.optimizer_calls,retry.optimizer_calls,without_scaler.optimizer_calls,fp32_control.optimizer_calls],[0,1,0,1]);
 assert.deepEqual(retry.after.optimizer,fp32_control.after.optimizer);
 assert.deepEqual(retry.after.weight,fp32_control.after.weight);
 assert.equal(growth.after.scaler.scale,32768);
}
assert.equal(result.status,'passed');
assert.deepEqual(result.config,config);
assert.equal(result.environment.device,'cpu');
assert.equal(result.environment.threads,1);
assert.match(result.environment.torch,/^2\.5\.1(?:\+.+)?$/);
assert.equal(result.environment.torch_commit,commit);
assert.deepEqual(result.source_sha256,{'amp_window.py':createHash('sha256').update(read(script)).digest('hex')});
verify(result.windows);
for(const mutate of [
 r=>r.overflow.microbatches[1].weight_gradient_before_widening.value=57344,
 r=>r.overflow.optimizer_calls=1,
 r=>r.overflow.after.optimizer.exp_avg.value=0,
 r=>r.retry.unscaled_gradient.value=71680,
 r=>r.without_scaler.before.scaler.scale=16384,
 r=>r.growth.after.scaler.scale=16384,
]){
 const changed=structuredClone(result.windows);mutate(changed);assert.throws(()=>verify(changed),assert.AssertionError);
}
const files=['README.md','amp_window.py','validation.json'];
assert.deepEqual(execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n'),files.map(file=>'native-amp-window/'+file));
for(const file of files)assert.deepEqual(execFileSync('unzip',['-p',zip,'native-amp-window/'+file]),read(dir+'/'+file));
const fig=read('dist/diagrams/native-amp-window.svg').toString();
assert.deepEqual(JSON.parse(fig.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]),{
 weight:result.windows.overflow.before.weight.value,inputs:schedule.overflow,mean_loss:result.windows.overflow.mean_loss,
 high_scale:result.windows.overflow.before.scaler.scale,high_second_output_gradient:result.windows.overflow.microbatches[1].output_gradient.value,
 high_second_weight_exact:result.windows.overflow.microbatches[1].output_gradient.value*schedule.overflow[1],max_fp16:halfMax,
 high_optimizer_calls:result.windows.overflow.optimizer_calls,low_scale:result.windows.retry.before.scaler.scale,
 low_weight_gradients:result.windows.retry.microbatches.map(m=>m.weight_gradient_before_widening.value),
 low_accumulated_fp32:result.windows.retry.microbatches.at(-1).accumulated_gradient.value,
 low_unscaled:result.windows.retry.unscaled_gradient.value,low_optimizer_calls:result.windows.retry.optimizer_calls,
});
const context=vm.createContext({});
for(const[,file]of read('src/page-shell.html').toString().matchAll(/<script defer src="([^"]+)"/g)){
 if(file!=='app.js')vm.runInContext(read('dist/'+file).toString(),context,{filename:file});
}
const lesson=vm.runInContext("articleById('gpu-memory')",context);
const section=lesson.sections[5][1],suffix=section.slice(section.indexOf('<h3 id="native-amp-window">'));
assert(section.includes('<h3 id="native-amp-window">两个微批中，哪一个数先溢出</h3>'));
for(const target of ['diagrams/native-amp-window.svg','labs/native-amp-window.zip','labs/native-amp-window/README.md',
 'labs/native-amp-window/validation.json','/article/checkpoint-recovery/#checkpoint-consistent-state']){
 assert(suffix.includes('href="'+target+'"'),target);
}
assert(!suffix.includes('<pre'), 'the new subsection reuses the original code inventory');
const trainingOverview=vm.runInContext("articleById('gpu-cluster')",context).sections[4][1];
const {overflow,retry}=result.windows;
const counter=trainingOverview.indexOf('applied_optimizer_steps');
const device=result.environment.device.toUpperCase();
const evidence=trainingOverview.indexOf(`另一个本机 ${device} 实验用了 FP16 混合精度`);
assert(counter>=0&&evidence>counter&&trainingOverview.includes('本章用固定FP32输入走通正常更新'));
assert(trainingOverview.includes(`平均损失是有限的 ${overflow.mean_loss}`));
assert(trainingOverview.includes(`权重梯度已溢出为 ${overflow.microbatches[1].weight_gradient_before_widening.value}`));
assert(trainingOverview.includes(`调用 AdamW ${overflow.optimizer_calls} 次，步数停在 ${overflow.after.optimizer.step.value}`));
assert(trainingOverview.includes(`实验显式重送相同输入，调用 AdamW ${retry.optimizer_calls} 次，步数增到 ${retry.after.optimizer.step.value}`));
assert(trainingOverview.indexOf('href="/article/gpu-memory/#native-amp-window"')>evidence);
const recovery=vm.runInContext("articleById('checkpoint-recovery')",context);
assert(recovery.sections.some(s=>s[1].includes('id="checkpoint-consistent-state"')));
if(process.env.NATIVE_AMP_PYTHON){
 const replay=JSON.parse(execFileSync(process.env.NATIVE_AMP_PYTHON,['-B',script],{encoding:'utf8'}));
 verify(replay.windows);
 assert.deepEqual(replay.windows,result.windows,'fresh native window observations');
}
console.log('PASS: native FP16 dW trace, independent FP16 rounding and AdamW window oracle, overflow/retry/scale restore, six tamper cases, exact ZIP/SVG and reading anchors.');
