/* Prepare authored source strings and an exact lab archive from checked files. */
const fs=require('fs'),cp=require('child_process');
const folder='dist/labs/cuda-core/';
const files=['cuda_lab.cu','reference.py','build.py','toolchain-lock.json','README.md'];
const sources=Object.fromEntries(files.map(f=>[f,fs.readFileSync(folder+f,'utf8')]));
const record=JSON.parse(fs.readFileSync(folder+'validation.json'));
fs.writeFileSync('dist/cuda-core-data.js','/* Actual CUDA source; compile records do not assert GPU execution. */\nconst cudaCoreFiles='+JSON.stringify(sources)+';\nconst cudaCoreValidation='+JSON.stringify(record)+';\n');
cp.execFileSync('python3',['-B','-c',`from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
root=Path('${folder}');target=Path('dist/labs/cuda-core.zip')
with ZipFile(target,'w',ZIP_DEFLATED) as z:
 for p in sorted(root.iterdir()):
  if p.is_file():z.write(p,p.name)
`],{stdio:'inherit'});
console.log('Prepared CUDA source data and exact lab ZIP.');
