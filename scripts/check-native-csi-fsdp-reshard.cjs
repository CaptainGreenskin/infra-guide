/* Verify the frozen native records offline, with a separate numerical oracle for FSDP. */
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');

const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const lab=name=>'dist/labs/'+name+'/';

function checkZip(name,files){
 execFileSync('python3',['-B','-c',`
import pathlib, sys, zipfile
name, *files = sys.argv[1:]
folder = pathlib.Path('dist/labs') / name
members = {name + '/' + file: (folder / file).read_bytes() for file in files}
with zipfile.ZipFile(folder.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == sorted(members)
    for path, data in members.items():
        assert archive.read(path) == data, path
`,name,...files],{timeout:15000});
}

function checkPage(chapter,anchor,pack,extra=[]){
 const page=readFileSync('dist/article/'+chapter+'/index.html','utf8');
 for(const fragment of [
  'id="'+anchor+'"','data-toc="'+anchor+'"','labs/'+pack+'.zip',
  'labs/'+pack+'/validation.json',...extra
 ])assert(page.includes(fragment),chapter+' missing '+fragment);
}

const csi=lab('csi-storage'),csiRecord=json(csi+'validation.json'),proof=json(csi+'ci-record.json');
assert.equal(proof.url,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/42558047546');
assert.equal(proof.headSha,'27ff9bfdea1a38e1501e250c701533c4329f1111');
assert.equal(proof.conclusion,'success');
assert.match(proof.runner,/ubuntu-24\.04; one kind node on one Linux Docker host/);
assert.equal(proof.record_sha256,sha(csi+'validation.json'));
assert.equal(proof.source_sha256,sha(csi+'csi_storage_lab.py'));
assert.equal(csiRecord.source_sha256,proof.source_sha256);
assert.equal(csiRecord.writer_sha256,sha(csi+'volume_writer.py'));
assert.equal(csiRecord.writer_sha256,sha(lab('storage-quant-context')+'volume_writer.py'));
execFileSync('python3',['-B',csi+'csi_storage_lab.py','--check-record',csi+'validation.json'],{timeout:15000});

const {before_consumer:pending,node,csi:driver,reclaim,cleanup}=csiRecord;
assert.equal(csiRecord.consumers.length,2);
const [first,replacement]=csiRecord.consumers;
const {pvc,pv}=first.binding;
assert.deepEqual([pending.phase,pending.event,pending.volume_name,pending.claim_pvs],['Pending','WaitForFirstConsumer',null,[]]);
assert.deepEqual([pvc.name,pvc.uid,pvc.pv],[pending.pvc.name,pending.pvc.uid,pv.name]);
assert.equal(pv.claim.uid,pvc.uid);
assert.equal(pv.driver,driver.driver.name);
assert.equal(driver.registration.nodeID,node.name);
const [topologyKey]=driver.registration.topologyKeys;
assert.equal(topologyKey,'topology.hostpath.csi/node');
assert.deepEqual(pv.affinity,[{matchExpressions:[{key:topologyKey,operator:'In',values:[node.name]}]}]);
assert.deepEqual(replacement.binding,first.binding);
assert.notEqual(first.pod.uid,replacement.pod.uid);
for(const {pod,attachment,data,node_file_sha256,pod_deleted} of [first,replacement]){
 assert.deepEqual([pod.node,pod.claim,pod.mount_path],[node.name,pvc.name,'/data']);
 assert.deepEqual([attachment.node,attachment.pv,attachment.attacher,attachment.attached],[node.name,pv.name,pv.driver,true]);
 assert.equal(data.mount_path,pod.mount_path);
 assert.equal(data.sha_after,node_file_sha256);
 assert.equal(pod_deleted,true);
}
const counterReceipt=(op,before,duplicate=false)=>({op,before,after:before+1,duplicate,current_counter:before+1});
assert.equal(first.data.existed,false);
assert.deepEqual(first.data.results,[counterReceipt('write-1',0)]);
assert.equal(replacement.data.existed,true);
assert.equal(replacement.data.sha_before,first.data.sha_after);
assert.equal(replacement.data.counter_before,1);
assert.deepEqual(replacement.data.receipts_before,[['write-1',0,1]]);
assert.deepEqual(replacement.data.results,[counterReceipt('write-1',0,true),counterReceipt('write-2',1)]);
assert.notEqual(replacement.data.sha_after,replacement.data.sha_before);
assert.deepEqual(reclaim,{pvc_absent:true,pv_absent:true,pv_name:pv.name,backend_path:'/var/lib/csi-hostpath-data/'+pv.handle,backend_absent:true});
assert.deepEqual(cleanup,{attempted:true,owned_nodes_removed:true});
checkZip('csi-storage',['README.md','ci-record.json','csi_storage_lab.py','validation.json','volume_writer.py']);
checkPage('k8s-storage','native-csi-storage','csi-storage',['diagrams/csi-storage-lifecycle.svg',proof.url]);
const csiPage=readFileSync('dist/article/k8s-storage/index.html','utf8');
const bindingSection=csiPage.split('id="subsection-3-meie0t"')[1].split('</section>')[0];
assert.match(bindingSection,/href="[^"]*\/article\/k8s-storage\/#csi-node-placement-evidence"/);
const placement=csiPage.split('id="csi-node-placement-evidence"')[1].split('</section>')[0];
for(const fragment of [topologyKey,node.name,'同节点换 Pod','spec.nodeAffinity.required','kubernetes.io/hostname',
 'kubectl get pv','kubectl describe node','kubectl get csinode','旧写者退出或已隔离'])assert(placement.includes(fragment),fragment);
const snippet=placement.match(/<pre\b[^>]*><code>([\s\S]*?)<\/code><\/pre>/)?.[1];
assert(snippet,'rendered CSI placement commands');
const shellEntities={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"};
const commands=snippet.replace(/&(?:amp|lt|gt|quot|#39);/g,entity=>shellEntities[entity]);
execFileSync('sh',['-n'],{input:commands,timeout:10000});

const fsdp=lab('fsdp-reshard'),record=json(fsdp+'validation.json');
assert.equal(record.status,'passed');
assert.deepEqual(record.environment,{torch:'2.5.1',python:'3.12.13',backend:'gloo',device:'cpu',dtype:'torch.float64'});
assert.deepEqual(record.tolerance,{atol:1e-12,rtol:0});
assert.equal(record.independent_torchrun_groups,true);
assert.deepEqual(record.source_sha256,{'fsdp_lab.py':sha(fsdp+'fsdp_lab.py'),'fsdp_reshard.py':sha(fsdp+'fsdp_reshard.py')});
assert.equal(record.source_sha256['fsdp_lab.py'],sha(lab('native-fsdp')+'fsdp_lab.py'));

const inputs=[[1,2],[0,-1],[2,1]],targets=[[0,1],[1,0],[-.75,1]],learningRate=.02;
const initial=[.25,-.5,.75,.125,0,0],zeros=initial.map(()=>0);
assert.deepEqual(record.fixture,{x:inputs,y:targets,targets_per_update:6,adam_lr:learningRate});
const maxDelta=(a,b)=>{
 assert.equal(a.length,b.length);
 return Math.max(...a.map((value,i)=>Math.abs(value-b[i])));
};
function close(actual,expected,label){
 const delta=maxDelta([actual].flat(Infinity),[expected].flat(Infinity));
 assert(delta<=record.tolerance.atol,label+': absolute error '+delta);
}
function adamUpdate(parameters,previousMean,previousVariance,step){
 const gradient=zeros.slice();
 inputs.forEach(([x0,x1],row)=>{
  for(let output=0;output<2;output++){
   const offset=2*output,bias=4+output;
   const error=parameters[offset]*x0+parameters[offset+1]*x1+parameters[bias]-targets[row][output];
   gradient[offset]+=error*x0/6;
   gradient[offset+1]+=error*x1/6;
   gradient[bias]+=error/6;
  }
 });
 const mean=gradient.map((g,i)=>.9*previousMean[i]+.1*g);
 const variance=gradient.map((g,i)=>.999*previousVariance[i]+.001*g*g);
 const after=parameters.map((p,i)=>p-learningRate*(mean[i]/(1-.9**step))/(Math.sqrt(variance[i]/(1-.999**step))+1e-8));
 return {step,gradient,parameters:after,mean,variance};
}
const update1=adamUpdate(initial,zeros,zeros,1);
const update2=adamUpdate(update1.parameters,update1.mean,update1.variance,2);
const resetAdam=adamUpdate(update1.parameters,zeros,zeros,1);
const weightsOnlyDelta=maxDelta(resetAdam.parameters,update2.parameters);
assert(weightsOnlyDelta>1e-6);
const momentFields=['exp_avg','exp_avg_sq'],shapes={weight:[2,2],bias:[2]};

function flatNamed(weight,bias){
 assert.deepEqual(weight.map(row=>row.length),[2,2]);
 assert.equal(bias.length,2);
 return [...weight.flat(),...bias];
}
function checkSnapshot(snapshot,rank,world,expected,updated){
 const {runtime,full,update}=snapshot;
 const width=initial.length/world,start=rank*width,end=start+width;
 const label=world+' ranks, rank '+rank+', update '+expected.step;
 assert.equal(snapshot.completed_updates,expected.step);
 assert.deepEqual(snapshot.runtime_flat_range,[start,end]);
 const parameters=flatNamed(full.parameters.weight,full.parameters.bias);
 const mean=flatNamed(full.adam.weight.exp_avg,full.adam.bias.exp_avg);
 const variance=flatNamed(full.adam.weight.exp_avg_sq,full.adam.bias.exp_avg_sq);
 close(parameters,expected.parameters,label+' parameters');
 close(mean,expected.mean,label+' Adam mean');
 close(variance,expected.variance,label+' Adam variance');
 assert.deepEqual([full.adam.weight.step,full.adam.bias.step,runtime.adam.step],Array(3).fill(expected.step));
 assert.deepEqual(runtime.parameters,parameters.slice(start,end));
 assert.deepEqual(runtime.adam.exp_avg,mean.slice(start,end));
 assert.deepEqual(runtime.adam.exp_avg_sq,variance.slice(start,end));
 for(const error of [full.parameter_max_abs_error,full.adam_max_abs_error]){
  assert(error>=0&&error<=record.tolerance.atol,label+' recorded dense comparison');
 }
 if(updated){
  const rows=world===2?[[0],[1,2]][rank]:[rank];
  assert.deepEqual(update.rows,rows);
  assert.equal(update.local_targets,rows.length*2);
  close(update.gradient,expected.gradient.slice(start,end),label+' gradient');
  assert(update.gradient_max_abs_error>=0&&update.gradient_max_abs_error<=record.tolerance.atol);
 }else assert.equal(update,null);
 return [...parameters,...mean,...variance,full.adam.weight.step,full.adam.bias.step];
}

function checkLayout(layout,rank,world){
 for(const [name,shape] of Object.entries(shapes)){
  const width=Math.ceil(shape[0]/world);
  const local=Math.max(0,Math.min(width,shape[0]-rank*width));
  const expected={type:'DTensor',global_shape:shape,local_shape:[local,...shape.slice(1)],placements:['S(0)']};
  assert.deepEqual(layout.model[name],expected);
  for(const field of momentFields)assert.deepEqual(layout.adam[name][field],expected);
 }
}

function ranks(group,world){
 assert.equal(group.world_size,world);
 assert.deepEqual(group.ranks.map(row=>row.rank),Array.from({length:world},(_,rank)=>rank));
 return group.ranks;
}
const continuous=ranks(record.continuous_world2,2).map((row,rank)=>[
 checkSnapshot(row.update_1,rank,2,update1,true),checkSnapshot(row.update_2,rank,2,update2,true)
]);
const [reference1,reference2]=continuous[0];
assert.deepEqual(continuous[1],continuous[0]);
const saved=ranks(record.save_world2,2).map((row,rank)=>{
 checkLayout(row.saved_named_layout,rank,2);
 return checkSnapshot(row.update_1,rank,2,update1,true);
});
const restored=ranks(record.resume_world3,3).map((row,rank)=>{
 checkLayout(row.loaded_named_layout,rank,3);
 assert.deepEqual(row.template_adam_before_load,{exp_avg:[0,0],exp_avg_sq:[0,0],step:1});
 const start=checkSnapshot(row.loaded_boundary,rank,3,update1,false);
 const end=checkSnapshot(row.update_2,rank,3,update2,true);
 assert.deepEqual(row.negative.wrong_cursor,{rejected:true,reason:'completed_updates=0 differs from Adam step=1',loaded_completed_updates:0,model_and_adam_match_update_1:true});
 const negative=row.negative.weights_only;
 assert.equal(negative.rejected,true);
 assert.equal(negative.reason,'missing Adam state');
 assert.equal(negative.loaded_completed_updates,1);
 assert(negative.weight_max_abs_error_before_bypass>=0&&negative.weight_max_abs_error_before_bypass<=record.tolerance.atol);
 close(negative.parameter_max_abs_error_after_bypass,weightsOnlyDelta,'fresh Adam instead of restored moments');
 return {start,end};
});
const saveDelta=Math.max(...saved.map(value=>maxDelta(value,reference1)));
const loadDelta=Math.max(...restored.map(({start})=>maxDelta(start,reference1)));
const resumeDelta=Math.max(...restored.map(({end})=>maxDelta(end,reference2)));
assert.equal(saveDelta,0);
assert.equal(loadDelta,0);
assert(resumeDelta>0&&resumeDelta<=record.tolerance.atol,'frozen native record shows agreement within tolerance');
assert.deepEqual(record.verification,{
 save_vs_uninterrupted_update1_max_abs_error:saveDelta,
 load_vs_uninterrupted_update1_max_abs_error:loadDelta,
 resume_vs_uninterrupted_update2_max_abs_error:resumeDelta,
 resume_full_state_values_exactly_equal:resumeDelta===0
});
assert.deepEqual(record.plain_fsdp1_template_negative,{
 world_size:3,failed_rank:2,stage:'get_state_dict, before dcp.load',
 rejected:true,reason:'NotImplementedError: Only single local shard is supported.'
});

const scalar={shape:[],chunks:[{offset:[],shape:[]}]},expectedChunks={completed_updates:scalar};
for(const [name,shape] of Object.entries(shapes)){
 const chunk={shape,chunks:[0,1].map(rank=>({offset:[rank,...shape.slice(1).map(()=>0)],shape:[1,...shape.slice(1)]}))};
 expectedChunks['model.'+name]=chunk;
 for(const field of momentFields)expectedChunks['optimizer.state.'+name+'.'+field]=chunk;
 expectedChunks['optimizer.state.'+name+'.step']=scalar;
}
assert.deepEqual(record.checkpoint,{files:['.metadata','__0_0.distcp','__1_0.distcp'],tensor_chunks:expectedChunks});
checkZip('fsdp-reshard',['README.md','fsdp_lab.py','fsdp_reshard.py','validation.json']);
checkPage('checkpoint-recovery','fsdp-dcp-reshard','fsdp-reshard',['diagrams/fsdp-dcp-reshard.svg']);
const training=readFileSync('dist/module/training/index.html','utf8');
const recoveryPoint=training.match(/<section class="knowledge-point" id="knowledge-tr-recovery">([\s\S]*?)<\/section>/)?.[1];
const thirdRank=record.resume_world3.ranks[2];
const boundary=thirdRank.loaded_boundary;
assert(recoveryPoint?.includes('href="/article/checkpoint-recovery/#fsdp-dcp-reshard"'));
assert(recoveryPoint.includes('href="/labs/fsdp-reshard/validation.json"'));
assert(recoveryPoint.includes('<code>loaded_named_layout</code>') && recoveryPoint.includes('<code>loaded_boundary</code>'));
assert.deepEqual(Object.values(thirdRank.loaded_named_layout.model).map(item=>item.local_shape[0]),[0,0]);
assert.equal(boundary.runtime.parameters.length,2);
assert(recoveryPoint.includes('接收片都是空的，装回训练布局后，它持有两项偏置'));
assert.equal(boundary.completed_updates,boundary.runtime.adam.step);
assert(recoveryPoint.includes(`两种步数都是 ${boundary.completed_updates}`));
assert.equal(resumeDelta.toExponential(2),'1.73e-18');
assert(recoveryPoint.includes('1.73×10⁻¹⁸'));
console.log('PASS: frozen CSI CI provenance, volume identity, durable receipts and reclaim; native DCP 2→3 state and Adam updates independently checked, with exact source ZIPs.');
