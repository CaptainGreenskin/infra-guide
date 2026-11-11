/* Check native build diagnostics, equal bytes across import controls, and numerical output. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
process.chdir(path.resolve(__dirname,'..'));
const dir='dist/labs/python-extension-loader',zip=dir+'.zip',moduleName='infra_rowdot';
const provider='libinfraguide_rowdot_fixture.dylib';
const read=file=>fs.readFileSync(file),hash=file=>createHash('sha256').update(read(file)).digest('hex');
const expectedOutput=[
 [[-1.25,0.5,-0.5],[-1.5,1,0]],
 [[1,2,3],[-1,0,2]],
].map(([a,b])=>a.reduce((total,x,i)=>total+x*b[i],0));
const sourceFiles=['extension_loader.py','rowdot.c','rowdot_module.c'];
const hashShape=/^[0-9a-f]{64}$/;

function verify(record){
 const {environment,build,binary,cases}=record;
 assert.equal(record.status,'passed');
 assert.equal(record.scope,'macOS arm64 CPython C extension and native CPU dot product');
 assert.deepEqual([environment.system,environment.machine],['Darwin','arm64']);
 assert.match(environment.python,/^3\.12\.\d+$/);
 assert.match(environment.compiler,/clang version .*\nTarget: arm64-apple-darwin/);
 assert.equal(environment.ext_suffix,'.cpython-312-darwin.so');
 assert(environment.extension_suffixes.includes(environment.ext_suffix));
 assert.deepEqual(record.source_sha256,Object.fromEntries(sourceFiles.map(name=>[name,hash(dir+'/'+name)])));

 const failedCompile=build.missing_header,failedLink=build.missing_link_input;
 assert.equal(failedCompile.exit,1);
 assert.equal(failedCompile.object_created,false);
 assert(failedCompile.argv.includes('-nostdinc')&&!failedCompile.argv.includes('-I'));
 assert.match(failedCompile.stderr,/'Python\.h' file not found/);
 assert.equal(failedLink.exit,1);
 assert.equal(failedLink.extension_created,false);
 assert(failedLink.argv.includes('-lpython3.12'));
 assert(!failedLink.argv.some(arg=>arg.endsWith('/'+provider)));
 assert.match(failedLink.stderr,/Undefined symbols for architecture arm64:[\s\S]*"_infraguide_rowdot3"/);
 for(const key of ['compile','compile_wrong_entry','provider','link','link_wrong_entry'])assert.equal(build[key].exit,0);
 assert(build.compile.argv.includes('<python-include>'));
 assert(build.compile_wrong_entry.argv.includes('-DROW_INIT=PyInit_other'));
 assert(build.provider.argv.includes('-Wl,-install_name,@rpath/'+provider));
 assert(build.link.argv.includes('-Wl,-rpath,@loader_path')&&build.link.argv.includes('<work>/'+provider));
 const exports=details=>details.nm.stdout.trim().split(/\n/).map(line=>line.trim().split(/\s+/).at(-1));
 assert.deepEqual(exports(binary.success),['_PyInit_infra_rowdot']);
 assert.deepEqual(exports(binary.wrong_entry),['_PyInit_other']);
 assert.deepEqual(exports(binary.provider),['_infraguide_rowdot3']);
 for(const key of ['success','wrong_entry']){
  assert(binary[key].dependencies.stdout.split(/\n/).some(line=>line.trimStart().startsWith('@rpath/'+provider+' (')));
  assert(binary[key].rpaths.some(line=>line.startsWith('path @loader_path (')));
 }

 assert.deepEqual(Object.keys(cases).sort(),['dependency','restored','success','suffix','symbol']);
 const {suffix,symbol,dependency,success,restored}=cases;
 const normalFile=moduleName+environment.ext_suffix;
 const directory={suffix:'suffix',symbol:'symbol',dependency:'dependency',success:'success',restored:'dependency'};
 for(const [key,row]of Object.entries(cases)){
  assert.equal(row.run.exit,0);
  assert.equal(row.run.argv.at(-1),'<work>/'+directory[key]);
  assert.deepEqual(row.run.argv.slice(0,4),['<python>','-I','-B','-c']);
  assert.deepEqual(JSON.parse(row.run.stdout),row.observation);
  assert.match(row.extension_sha256,hashShape);
  if(key!=='suffix')assert.equal(row.filename,normalFile);
 }
 assert.equal(suffix.filename,moduleName+'.foreign-fixture.so');
 assert(!environment.extension_suffixes.some(ending=>suffix.filename===moduleName+ending));
 assert.match(success.provider_sha256,hashShape);
 for(const row of [suffix,dependency,restored])assert.equal(row.extension_sha256,success.extension_sha256);
 for(const row of [suffix,symbol,restored])assert.equal(row.provider_sha256,success.provider_sha256);
 assert.notEqual(symbol.extension_sha256,success.extension_sha256);
 assert.equal(dependency.provider_sha256,null);
 assert.deepEqual(suffix.observation,{
  discovered:false,error_type:'ModuleNotFoundError',error:"No module named 'infra_rowdot'",
 });
 assert.deepEqual(symbol.observation,{
  discovered:true,error_type:'ImportError',error:'dynamic module does not define module export function (PyInit_infra_rowdot)',
 });
 assert.equal(dependency.observation.discovered,true);
 assert.equal(dependency.observation.error_type,'ImportError');
 assert(dependency.observation.error.includes('Library not loaded: @rpath/'+provider));
 assert(dependency.observation.error.includes('<work>/dependency/'+provider));
 assert(!Object.hasOwn(dependency.observation,'output'));
 for(const [key,row]of [['success',success],['restored',restored]]){
  assert.deepEqual(row.observation,{
   discovered:true,origin:'<work>/'+directory[key]+'/'+normalFile,output:expectedOutput,shape_error:'TypeError',
  });
 }
}

const result=JSON.parse(read(dir+'/validation.json'));
verify(result);
for(const mutate of [
 r=>r.build.missing_header.object_created=true,
 r=>r.build.missing_link_input.stderr='link failed for another reason',
 r=>r.cases.suffix.filename=moduleName+r.environment.ext_suffix,
 r=>r.binary.wrong_entry.nm.stdout=r.binary.success.nm.stdout,
 r=>r.cases.dependency.provider_sha256=r.cases.success.provider_sha256,
 r=>r.cases.restored.extension_sha256='b'.repeat(64),
 r=>{r.cases.restored.observation.output=[2.375,6];r.cases.restored.run.stdout=JSON.stringify(r.cases.restored.observation);},
]){
 const bad=structuredClone(result);mutate(bad);assert.throws(()=>verify(bad),assert.AssertionError);
}

const files=['README.md',...sourceFiles,'validation.json'];
assert.deepEqual(execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n'),files.map(file=>'python-extension-loader/'+file));
for(const file of files)assert.deepEqual(execFileSync('unzip',['-p',zip,'python-extension-loader/'+file]),read(dir+'/'+file));
const figure=read('dist/diagrams/python-extension-loader.svg').toString();
assert.deepEqual(JSON.parse(figure.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]),{
 module:moduleName,ext_suffix:result.environment.ext_suffix,
 stages:['compile','link','suffix','dependency','symbol','numeric'],
 diagnostics:['Python.h','_infraguide_rowdot3','ModuleNotFoundError','Library not loaded','PyInit_infra_rowdot'],
 output:expectedOutput,
});
const context=vm.createContext({});
for(const [,file]of read('src/page-shell.html').toString().matchAll(/<script defer src="([^"]+)"/g)){
 if(file!=='app.js')vm.runInContext(read('dist/'+file).toString(),context,{filename:file});
}
const lesson=vm.runInContext("articleById('operator-profiling')",context);
const section=lesson.sections[7][1],anchor='<h3 id="native-python-extension">从 C 源码到 import，哪一步出了错</h3>';
assert(section.includes(anchor));
const start=section.indexOf(anchor)+anchor.length,nextHeading=section.indexOf('<h3',start);
const example=section.slice(start,nextHeading<0?undefined:nextHeading);
for(const target of ['diagrams/python-extension-loader.svg','labs/python-extension-loader.zip',
 'labs/python-extension-loader/README.md','labs/python-extension-loader/validation.json']){
 assert(example.includes('href="'+target+'"'),target);
}
assert(!example.includes('<pre'));
if(process.env.PYTHON_EXTENSION_REPLAY){
 const replay=JSON.parse(execFileSync(process.env.PYTHON_EXTENSION_REPLAY,['-B',dir+'/extension_loader.py'],{encoding:'utf8'}));
 verify(replay);
}
console.log('PASS: native CPython compile/link/discovery/dyld/PyInit diagnostics, same bytes after restoring dependency, two numerical cases, seven rejected mutations, exact ZIP and lesson anchor.');
