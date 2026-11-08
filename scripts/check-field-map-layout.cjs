/* Check actual SVG geometry, then prove the checker rejects broken controls. */
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
if(process.argv.length!==2){console.error('Usage: node scripts/check-field-map-layout.cjs');process.exit(2);}
function run(file,args=[]){
 const result=spawnSync('python3',['-B',path.join(__dirname,file),...args],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
 if(result.error)console.error(result.error.message);
 if(result.stdout)process.stdout.write(result.stdout);
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.status!==0)process.exit(result.status||1);
}
run('field-map-layout.py',['--repo',root,'--geometry-only']);
run('field-map-layout-fixtures.py');
console.log('PASS: actual 14-field SVG geometry, label/arrow ownership and endpoint clearance; eight rejected in-memory controls. Font estimates are advisory; real desktop/mobile rendering is verified separately.');
