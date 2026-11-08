const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {spawnSync,execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),lab=path.join(root,'dist/labs/inference-cache');
const run=spawnSync('python3',['-B',path.join(lab,'paged_cache.py')],{encoding:'utf8',timeout:20000});
if(run.status!==0)throw Error(run.stderr);
const bad=spawnSync('python3',['-B',path.join(lab,'paged_cache.py'),'--unsafe-shared-write'],{encoding:'utf8',timeout:20000});
if(bad.status!==1||!bad.stderr.includes('cached_cell_differs_from_full_prefix'))throw Error('Shared-write negative did not reach numerical oracle: '+bad.stderr);
const files=['README.md','contracts.json','paged_cache.py'];
const record={checked_on:'2026-11-08',status:'passed',environment:{python:execFileSync('python3',['-c','import platform;print(platform.python_version())'],{encoding:'utf8'}).trim(),implementation:'standard-library CPU scalar attention'},source_sha256:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(lab,name))).digest('hex')])),result:JSON.parse(run.stdout),negative_probe:{flag:'--unsafe-shared-write',exit_code:bad.status,oracle:'cached_cell_differs_from_full_prefix'},scope:'Actual CPU cache allocation and numerical execution, not GPU throughput or a production vLLM implementation.'};
fs.writeFileSync(path.join(lab,'validation.json'),JSON.stringify(record,null,2)+'\n');
execFileSync('python3',['scripts/draw-inference-cache.py'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['scripts/embed-inference-cache-bridge.cjs'],{cwd:root,stdio:'inherit'});
execFileSync('python3',['-c',`from pathlib import Path
import zipfile
lab=Path('dist/labs/inference-cache')
with zipfile.ZipFile(lab.with_suffix('.zip'),'w',zipfile.ZIP_DEFLATED) as z:
 for name in ('README.md','contracts.json','paged_cache.py','validation.json'):
  z.write(lab/name,'inference-cache/'+name)
`],{cwd:root});
console.log('Recorded executed cache experiment, expected numerical failure, source hashes and exact ZIP.');
