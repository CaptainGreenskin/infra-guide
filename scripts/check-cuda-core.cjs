/* Independently preserve real compilation evidence and the separate device-run boundary. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process'),os=require('os');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/cuda-core/',sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=f=>fs.readFileSync(f,'utf8'),record=JSON.parse(read(folder+'validation.json'));
assert.equal(record.status,'compile-validated-device-pending');assert.equal(record.device_execution,false);
assert.equal(record.device_validation.status,'not-run');assert.equal(record.device_validation.reason,'No compatible GPU execution in this validation run');
assert(/^[0-9a-f]{40}$/.test(record.origin.source_commit));
assert(/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/.test(record.origin.run_url));
for(const[file,digest]of Object.entries(record.source_sha256))assert.equal(sha(fs.readFileSync(folder+file)),digest,file+': source binding');
const compiled=JSON.parse(read(folder+'compile-record.json'));
assert.equal(compiled.status,'passed');assert.equal(compiled.device_execution,false);assert.equal(compiled.host.system,'Linux');assert.equal(compiled.host.machine,'x86_64');
for(const[file,digest]of Object.entries(compiled.core_sha256)){
 assert.equal(digest,record.source_sha256[file]);
 assert.equal(sha(cp.execFileSync('git',['show',record.origin.source_commit+':'+folder+file])),digest,'Immutable compiled source '+file);
}
assert.equal(sha(cp.execFileSync('git',['show',record.origin.source_commit+':.github/workflows/cuda-core.yml'])),sha(read('.github/workflows/cuda-core.yml')));
for(const[file,digest]of Object.entries(record.artifacts_sha256))assert.equal(sha(fs.readFileSync(folder+file)),digest,file+': actual CI artifact bytes');
assert.equal(compiled.toolkit.release,'12.9.1');assert(compiled.nvcc_version.includes('V12.9.86'));
const lock=JSON.parse(read(folder+'toolchain-lock.json'));assert.equal(compiled.toolkit.manifest_sha256,lock.manifest_sha256);
for(const[name,pinned]of Object.entries(lock.components))for(const[key,value]of Object.entries(pinned))assert.equal(compiled.toolkit.components[name][key],value);
assert.equal(compiled.compilation.status,'passed');
assert.deepEqual(compiled.compilation.binary.targets,['sm_80','compute_80']);
assert.deepEqual(compiled.compilation.ptx.verified_entries,['row_softmax_kernel','row_sum_kernel','tiled_matmul_kernel']);
const ptx=read(folder+'cuda_lab.ptx');assert.equal(sha(ptx),compiled.compilation.ptx.sha256);
for(const name of compiled.compilation.ptx.verified_entries)assert(new RegExp('\\.entry\\s+'+name+'\\s*\\(').test(ptx));
const labels=compiled.commands.map(x=>x.label);
for(const name of ['cpu-selftest','nvcc-version','gcc-version','compile-binary','compile-ptx','binary-help','device-probe'])assert(labels.includes(name));
for(const command of compiled.commands)assert.equal(command.returncode,command.label==='device-probe'?compiled.device_probe.returncode:0);
assert.equal(compiled.device_probe.device_execution,false);
assert.equal(compiled.device_probe.status,'not-run');assert.equal(compiled.device_probe.returncode,2);
assert.equal(compiled.device_probe.source_sha256,record.source_sha256['cuda_lab.cu']);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'infra-cuda-host-'));
try{
 cp.execFileSync('python3',['-B',folder+'build.py','--host-selftest','--output-dir',temp],{encoding:'utf8',timeout:60000});
 const fresh=JSON.parse(read(path.join(temp,'build-record.json')));
 assert.equal(fresh.status,'host-selftest-passed');assert.equal(fresh.device_execution,false);assert.equal(fresh.compilation.status,'not-run');
 assert.equal(fresh.cpu_selftest.synthetic_fixtures,13);assert.equal(fresh.cpu_selftest.synthetic_values_checked,3338);assert.equal(fresh.cpu_selftest.mutations_rejected.length,16);assert.equal(fresh.cpu_selftest.device_execution,false);
 assert.equal(fresh.archive_safety_selftest.status,'passed');assert(fresh.archive_safety_selftest.same_directory_chain_accepted);
 assert.deepEqual(fresh.cpu_selftest,compiled.cpu_selftest);assert.deepEqual(fresh.archive_safety_selftest,compiled.archive_safety_selftest);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
const c={};vm.createContext(c);for(const[,f]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(read('dist/'+f),c,{filename:f});
const data=JSON.parse(vm.runInContext('JSON.stringify({files:cudaCoreFiles,validation:cudaCoreValidation,a:articleById("operator-profiling"),standalone:[...optionalConceptReviews]})',c));
assert.deepEqual(data.validation,record);
for(const[file,text]of Object.entries(data.files))assert.equal(text,read(folder+file));
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
const page=read('dist/article/operator-profiling/index.html'),body=data.a.sections.map(s=>s[1]).join('');
assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===data.files['cuda_lab.cu'].trim()));
for(const name of ['row_sum_kernel','row_softmax_kernel','tiled_matmul_kernel','--self-test','--check-gpu gpu-results.json','--fetch-toolkit','id="cuda-core-run"'])assert(body.includes(name));
assert(body.includes('GPU 数值回读、Nsight 和性能结论仍是待验项'));
assert(data.standalone.includes('operator-profiling'));
for(const name of ['v64-cuda-row','v64-cuda-tiles']){
 const svg=read('dist/diagrams/'+name+'.svg'),meta=JSON.parse(decode(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
 assert.equal(meta.source_sha256,record.source_sha256['cuda_lab.cu']);assert.equal(meta.device_execution,false);assert(page.includes(name+'.svg'));
 if(name.endsWith('row'))assert.deepEqual([meta.cols,meta.threads,meta.reduction_rounds,meta.shared_bytes],[257,256,8,1024]);
 else assert.deepEqual([meta.m,meta.k,meta.n,meta.tile,meta.grid,meta.valid_k_per_round,meta.shared_bytes],[17,19,13,16,[1,2],[16,3],2048]);
}
cp.execFileSync('python3',['-B','-c',`from pathlib import Path
from zipfile import ZipFile
root=Path('${folder}')
with ZipFile('dist/labs/cuda-core.zip') as z:
 files={p.name:p.read_bytes() for p in root.iterdir() if p.is_file()}
 assert set(z.namelist())==set(files)
 for name,data in files.items():assert z.read(name)==data,name
`],{encoding:'utf8'});
console.log('PASS: actual immutable Linux NVCC/PTX compile artifacts, 13-fixture/3338-value independent host oracle with 16 rejected mutations, archive link-graph checks, exact CUDA source/ZIP and two source diagrams; GPU numerical execution remains pending.');
