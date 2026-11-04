const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,file]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js')vm.runInContext(fs.readFileSync('dist/'+file,'utf8'),c,{filename:file});
const d=vm.runInContext('({storageQuantContextFiles,storageQuantContextValidation})',c);
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const actual={};
for(const[id,name]of [['k8s-storage','wal_backup.py'],['k8s-storage','volume_writer.py'],['model-serving','int4_groups.py'],['model-serving','int8_runtime.py'],['agent-memory','context_state.py']]){
 const source=fs.readFileSync('dist/labs/storage-quant-context/'+name,'utf8');
 const record=d.storageQuantContextValidation.programs[name];
 assert.equal(d.storageQuantContextFiles[name],source);
 assert.equal(record.sha256,crypto.createHash('sha256').update(source).digest('hex'));
 assert.equal(record.exit_code,0);assert(record.python);
 const html=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...html.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),'static inline source mismatch: '+name);
 if(name!=='int8_runtime.py')actual[name]=JSON.parse(execFileSync('python3',['dist/labs/storage-quant-context/'+name],{encoding:'utf8',timeout:20000}));
}
const wal=actual['wal_backup.py'];
for(const key of ['main_file_only','backup_from_snapshot','backup_from_fresh_connection','retained_after_bad_write','isolated_restore','consumer_continued']){
 assert.equal(wal[key].integrity,'ok');assert.equal(wal[key].balance,wal[key].ledger_sum);
 assert.equal(wal[key].version,wal[key].last_ledger_version);
}
assert.deepEqual([wal.main_file_only.version,wal.backup_from_snapshot.version,wal.backup_from_fresh_connection.version],[1,2,3]);
assert.deepEqual(wal.reader_snapshot_before_writer,wal.same_reader_after_writer);
assert.equal(wal.retained_after_bad_write.balance,999);
assert.equal(wal.isolated_restore.balance,130);assert.equal(wal.consumer_continued.balance,131);
const recordedWal=JSON.parse(JSON.stringify(d.storageQuantContextValidation.programs['wal_backup.py'].result));
delete recordedWal.sqlite;const portableWal={...wal};delete portableWal.sqlite;assert.deepEqual(portableWal,recordedWal);

const quant=actual['int4_groups.py'];
const W=[[12,.12,-.18,.09,.24,-.30,.06,-.12],[.08,-.16,.24,-.32,.40,-.48,.56,-.64],[.03,.06,-.09,.12,-.15,.18,-.21,.24],[-.20,.10,.30,-.40,.50,-.60,.70,-.80]];
const X=[[1,-1,.5,.25,-.5,.75,-1,1],[.1,.2,.3,.4,.5,.6,.7,.8]],bias=[.1,-.2,.3,-.4],flat=W.flat();
const near=(a,b,tolerance=1e-11)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert(Math.abs(x-b[i])<tolerance,`${x} != ${b[i]}`));};
const forward=(weights,x)=>[0,1,2,3].map(row=>weights.slice(row*8,row*8+8).reduce((v,w,i)=>v+w*x[i],0)+bias[row]);
near(forward(flat,X[0]),[11.3875,-1.68,.915,-2.85]);
// A separate exact diagonal-rescaling exercise, not a claim to run SmoothQuant.
assert.equal(2*3+4*(-1),(2/2)*(3*2)+(4/.5)*(-1*.5));
const target=[.6,.4],draft=[.8,.2],accepted=target.map((p,i)=>Math.min(p,draft[i]));
const residual=target.map((p,i)=>Math.max(p-draft[i],0));
const rejected=1-accepted.reduce((a,b)=>a+b,0),residualMass=residual.reduce((a,b)=>a+b,0);
near(accepted.map((p,i)=>p+rejected*residual[i]/residualMass),target);
const f32=value=>{const b=Buffer.alloc(4);b.writeFloatLE(value);return b.readFloatLE();};
const roundEven=value=>{const low=Math.floor(value),fraction=value-low;return fraction<.5?low:fraction>.5?low+1:low%2===0?low:low+1;};
for(const[label,record]of Object.entries(quant.schemes)){
 const group=record.group_size,scales=[];
 for(let start=0;start<flat.length;start+=group)scales.push(f32(Math.max(...flat.slice(start,start+group).map(Math.abs))/7));
 near(record.scales,scales);
 const q=flat.map((w,i)=>Math.max(-7,Math.min(7,roundEven(w/scales[Math.floor(i/group)]))));
 assert.deepEqual(record.integers,q);
 const packed=Buffer.alloc(16);q.forEach((v,i)=>packed[i>>1]|=(v&15)<<(4*(i%2)));
 assert.equal(record.payload_hex,packed.toString('hex'));
 assert.equal(record.integer_bytes,16);assert.equal(record.scale_bytes,scales.length*4);
 assert.equal(record.tensor_bytes,16+4*scales.length);assert.equal(record.file_bytes,record.tensor_bytes+12);
 const decoded=q.map((v,i)=>v*scales[Math.floor(i/group)]);
 const outputs=X.map(x=>forward(decoded,x));outputs.forEach((values,i)=>near(values,record.outputs[i]));
 const error=Math.max(...outputs.flatMap((values,i)=>values.map((v,j)=>Math.abs(v-forward(flat,X[i])[j]))));
 assert(Math.abs(record.max_output_error-error)<1e-11,label);
}
assert.deepEqual(Object.values(quant.schemes).map(x=>x.tensor_bytes),[20,32,48,80]);
assert(quant.schemes.group_2.tensor_bytes>quant.fp16_weight_bytes);
assert.equal(quant.activation_probe.clipped_values,1);
assert(quant.activation_probe.static_max_error>quant.activation_probe.dynamic_max_error);
assert(quant.activation_probe.group_rescale_matches_dequantized_dot);
assert.deepEqual(quant,d.storageQuantContextValidation.programs['int4_groups.py'].result);

// The actual INT8 record is checked, not rerun or installed by CI.
const runtime=d.storageQuantContextValidation.programs['int8_runtime.py'].result;
assert.equal(runtime.device,'cpu');assert.equal(runtime.weight_dtype,'torch.qint8');
assert(runtime.module_type.includes('quantized.dynamic'));
assert.equal(runtime.weight_integer_payload_bytes,32);assert.equal(runtime.fp32_weight_payload_bytes,128);
assert(runtime.whole_torchscript_artifact_bytes>runtime.weight_integer_payload_bytes);
assert.equal(runtime.torchscript_roundtrip_max_abs_error,0);
runtime.reference_outputs.forEach((y,i)=>near(y,forward(flat,X[i]),1e-5));
const runtimeError=Math.max(...runtime.quantized_outputs.flatMap((y,i)=>y.map((v,j)=>Math.abs(v-runtime.reference_outputs[i][j]))));
assert(Math.abs(runtime.fixed_input_max_abs_error-runtimeError)<1e-12);
assert(runtimeError<runtime.declared_fixed_input_error_limit&&runtime.declared_fixed_input_error_limit===.2);

const context=actual['context_state.py'];
assert.equal(context.correct_recovery.effects,1);assert.equal(context.correct_recovery.authority_state,'SUCCEEDED');
assert.equal(context.correct_recovery.authority_version,2);assert.equal(context.correct_recovery.stale_update_rows,0);
assert.equal(context.correct_recovery.needs_chat_history,false);
assert.equal(context.negative_summary_recovery.effects,2);
assert.deepEqual(context.memory_selection.accepted,[{memory_id:'current',source_version:2,value:10}]);
assert.deepEqual(context.memory_selection.stale_for_current_fact,['old']);
assert.deepEqual(context.after_retraction.accepted,[]);
assert.deepEqual(context,d.storageQuantContextValidation.programs['context_state.py'].result);
const writer=actual['volume_writer.py'];assert.equal(writer.final_counter,2);assert.equal(writer.cluster_executed,false);
assert.deepEqual(writer.sequence.map(x=>x.after),[1,2,1]);
assert.deepEqual(writer.sequence.map(x=>x.current_counter),[1,2,2]);
assert.deepEqual(writer.sequence.map(x=>x.duplicate),[false,false,true]);
for(const number of [1,2]){
 const job=JSON.parse(fs.readFileSync('dist/labs/storage-quant-context/storage-job-'+number+'.json','utf8'));
 assert.equal(job.apiVersion,'batch/v1');assert.equal(job.kind,'Job');
 assert.equal(job.metadata.namespace,'infra-guide-storage');
 const spec=job.spec.template.spec,container=spec.containers[0];
 assert.equal(container.command[2],d.storageQuantContextFiles['volume_writer.py']);
 assert.deepEqual(container.args,['--db','/data/counter.sqlite','--op','write-'+number]);
 assert.equal(spec.volumes[0].persistentVolumeClaim.claimName,'app-data');
 assert.equal(container.volumeMounts[0].mountPath,'/data');
}
assert.equal(d.storageQuantContextValidation.cluster_manifests.status,'generated_not_cluster_executed');

execFileSync('python3',['-c',`from pathlib import Path
import zipfile
with zipfile.ZipFile('dist/labs/storage-quant-context.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/storage-quant-context').iterdir():
  if p.is_file(): assert z.read('storage-quant-context/'+p.name)==p.read_bytes(),p.name
`],{encoding:'utf8'});
for(const[route,anchor]of [['native','volume-binding-path'],['platform','knowledge-sv-quantization'],['agent','context-state-authority']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');
 const knowledge=page.indexOf('id="'+anchor+'"'),cases=page.indexOf('id="examples"');
 assert(knowledge>=0&&knowledge<cases);
}
assert.equal(vm.runInContext("infraDomain('platform').points.filter(p=>p.id==='sv-quantization').length",c),1);
console.log('PASS: executed WAL and state counterexamples, independent INT4 packing/scales/dot-products/byte oracle, actual INT8 record + roundtrip evidence, exact static sources and ZIP, knowledge before cases.');
