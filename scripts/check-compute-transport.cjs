const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),{execFileSync}=require('child_process');
const c={};vm.createContext(c);
for(const[,f]of fs.readFileSync('src/page-shell.html','utf8').matchAll(/<script defer src="([^"]+)"/g))if(f!=='app.js')vm.runInContext(fs.readFileSync('dist/'+f,'utf8'),c,{filename:f});
const d=JSON.parse(JSON.stringify(vm.runInContext('({computeTransportFiles,computeTransportValidation,diagramWidths,diagramHeights})',c)));
const root='dist/labs/compute-and-transport/',python=process.env.INFRA_LAB_PYTHON||'python3';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function checkCPU(r){
 assert(r.python&&r.system);assert(r.logical_cpu_count_hint===null||r.logical_cpu_count_hint>0);
 const a=r.cases.one_cpu_phase,w=r.cases.one_wait_phase,t=r.cases.two_cpu_threads;
 assert(a.detail.thread_cpu_seconds>=.1);assert(w.elapsed_seconds>=.12);assert.strictEqual(w.detail,false);
 assert.equal(t.detail.length,2);assert(t.detail.every(x=>x.thread_cpu_seconds>=.1));
 for(const row of [a,w,t])assert(row.elapsed_seconds>0&&row.process_cpu_seconds>=0);
 // CPU targets are finite-work stopping conditions, independent of wall scheduling and GIL speedup.
 assert(r.scope.includes('not_VM_quota_or_throughput_benchmark'));
}
function checkTCP(r){
 const expected=Buffer.from('infra-local-byte-stream\n'.repeat(32768));
 assert.equal(r.payload_bytes,expected.length);assert.equal(r.received_bytes,expected.length);assert.equal(r.sha256,hash(expected));
 assert(r.send_buffer_setting>0&&r.receive_buffer_setting>0);assert(r.accepted_before_application_read>=0&&r.accepted_before_application_read<=expected.length);
 assert.equal(r.blocked_before_application_read,r.accepted_before_application_read<expected.length);
 assert(r.successful_send_calls>=Math.ceil(expected.length/16384));assert(r.short_writes_observed>=0&&r.short_writes_observed<=r.successful_send_calls);
 assert(r.read_reply_after_write_shutdown);assert(r.scope.includes('not_packet_or_cwnd_measurement'));
}
for(const[id,name,check]of [['cloud-compute','cpu_and_wall.py',checkCPU],['network-diagnosis','socket_backpressure.py',checkTCP]]){
 const source=fs.readFileSync(root+name,'utf8'),record=d.computeTransportValidation.programs[name];
 assert.equal(source,d.computeTransportFiles[name]);assert.equal(record.sha256,hash(source));assert.equal(record.exit_code,0);check(record.result);
 check(JSON.parse(execFileSync(python,['-B',root+name],{encoding:'utf8',timeout:25000})));
 const page=fs.readFileSync('dist/article/'+id+'/index.html','utf8');
 assert([...page.matchAll(/<pre[^>]*><code>([\s\S]*?)<\/code><\/pre>/g)].some(m=>decode(m[1])===source.trim()),name+': exact full source missing');
}
assert.equal(2*.2,.4);assert.equal(48/(2-.4),30);assert.equal(48-1.6*20,16);
assert.equal(100_000_000/8*.05,625000);assert.equal(256*1024/.05/(1024**2),5);
const compute=fs.readFileSync('dist/article/cloud-compute/index.html','utf8');
assert(!compute.includes('一个 CPU 秒表示一个核心连续执行一秒所贡献的处理时间。'),'logical CPU accounting repair not applied');
for(const[route,anchor]of [['compute','virtualization-resource-contract'],['network','tcp-connection-contract']]){
 const page=fs.readFileSync('dist/module/'+route+'/index.html','utf8');assert(page.indexOf('id="'+anchor+'"')>=0&&page.indexOf('id="'+anchor+'"')<page.indexOf('id="examples"'));
}
execFileSync(python,['-B','-c',`from pathlib import Path
import zipfile,xml.etree.ElementTree as ET
with zipfile.ZipFile('dist/labs/compute-and-transport.zip') as z:
 assert z.testzip() is None
 for p in Path('dist/labs/compute-and-transport').iterdir():
  if p.is_file():assert z.read('compute-and-transport/'+p.name)==p.read_bytes(),p.name
for p in Path('dist/diagrams').glob('v28-*.svg'):
 r=ET.parse(p).getroot();v=[float(x) for x in r.attrib['viewBox'].split()];assert len(v)==4 and v[2]>0 and v[3]>0
`],{encoding:'utf8'});
for(const name of ['v28-credit-balance','v28-cpu-wall'])assert(d.diagramWidths[name]>0&&d.diagramHeights[name]>0);
console.log('PASS: real local CPU/wall/thread observations, actual bounded nonblocking TCP/drain and reply after half-close, independent payload digest/credit/window arithmetic, exact static source/ZIP/SVG and knowledge before cases; no VM/cwnd/public-network measurement claimed.');
