/* Native DCP evidence, unchanged baseline, source binding and old section/pre preservation. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'dist/labs/torch-checkpoint');
const record=JSON.parse(fs.readFileSync(path.join(folder,'validation.json'),'utf8'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
for(const[name,sha]of Object.entries(record.source_sha256))assert.equal(hash(fs.readFileSync(path.join(folder,name))),sha,name+': source changed after execution');
assert.equal(fs.readFileSync(path.join(folder,'reference_train.py'),'utf8'),fs.readFileSync(path.join(root,'dist/labs/ddp/train_ddp.py'),'utf8'));
function verify(r){
 assert.equal(r.status,'passed');assert.equal(r.torch.split('+')[0],'2.5.1');assert.equal(r.backend,'gloo');assert.equal(r.device,'cpu');assert.equal(r.world_size,2);
 assert.equal(r.all_reference_fields_exact,true);assert.deepEqual(r.exact_fields,['model','optimizer','scaler','next_epoch','signature','rng_by_rank']);
 assert.equal(r.old_launch_completed_before_resume,true);assert.equal(r.stopped_worker_pids.length,2);assert.equal(r.resumed_worker_pids.length,2);
 assert.equal(r.restored_next_epoch,4);assert.equal(r.applied_updates,32);assert.deepEqual(r.split_epochs,[2,2]);
 assert.deepEqual(r.independent_sampler_coverage,[512,512]);assert(r.resume_first_batch_ids.every(ids=>ids.length===32&&new Set(ids).size===32));
 assert(r.weights_only_control.restored_input_and_rng);assert.equal(r.weights_only_control.optimizer_restored,false);
 assert(r.weights_only_control.max_parameter_error>0);assert.match(r.weights_only_control.difference,/state\.model\..+: tensor_values/);
 assert(r.missing_metadata_control.exit_code!==0);assert.equal(r.missing_metadata_control.file_not_found,true);assert.equal(r.missing_metadata_control.completed_state_exported,false);
 assert(r.metadata_key_count>10);assert(r.checkpoint_files.some(f=>f.name==='.metadata'&&f.bytes>0));assert(r.checkpoint_files.some(f=>f.name.endsWith('.distcp')&&f.bytes>0));
}
verify(record.program);
const c={};vm.createContext(c);
const shell=fs.readFileSync(path.join(root,'src/page-shell.html'),'utf8');
for(const[,file]of shell.matchAll(/<script defer src="([^"]+)"/g))if(file!=='app.js'&&file!=='torch-checkpoint-bridge.js')vm.runInContext(fs.readFileSync(path.join(root,'dist',file),'utf8'),c,{filename:file});
const read=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,c)));
const before=read("articles.find(a=>a.id==='checkpoint-recovery').sections");
vm.runInContext(fs.readFileSync(path.join(root,'dist/torch-checkpoint-bridge.js'),'utf8'),c,{filename:'torch-checkpoint-bridge.js'});
const after=read("articles.find(a=>a.id==='checkpoint-recovery').sections");
assert.deepEqual(after.map(s=>s[0]),before.map(s=>s[0]));
for(let i=0;i<before.length;i++){
 assert(after[i][1].startsWith(before[i][1]),'old body prefix must remain at section '+i);
 const oldPre=[...before[i][1].matchAll(/<pre[^>]*>[\s\S]*?<\/pre>/g)].map(m=>m[0]);
 let last=0;for(const pre of oldPre){const p=after[i][1].indexOf(pre,last);assert(p>=last,'original complete pre lost');last=p+pre.length;}
}
const files=read('torchCheckpointFiles');for(const name of ['train_dcp.py','run_lab.py'])assert.equal(files[name],fs.readFileSync(path.join(folder,name),'utf8'));
assert.deepEqual(read('torchCheckpointEvidence'),record);
const svg=fs.readFileSync(path.join(root,'dist/diagrams/torch-checkpoint-path.svg'),'utf8');
const md=JSON.parse(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
assert.deepEqual(md.source_sha256,record.source_sha256);assert.equal(md.saved_updates,16);assert.equal(md.resumed_updates,32);assert.equal(md.measured_timeline,false);
cp.execFileSync('python3',['-B','-c','import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(str(p)+".zip"); names=[f.name for f in p.iterdir() if f.is_file()]; assert set(z.namelist())==set(names); assert all(z.read(n)==(p/n).read_bytes() for n in names)',folder],{encoding:'utf8'});
if(process.env.INFRA_TORCH_PYTHON)verify(JSON.parse(cp.execFileSync(process.env.INFRA_TORCH_PYTHON,['-B',path.join(folder,'run_lab.py')],{encoding:'utf8',timeout:360000})));
console.log('PASS: actual two-rank Stateful DCP record, independent old torch.save baseline, full state/input checks, real negative controls, old h2/pre order and source-bound figure. GPU/FSDP not inferred.');
