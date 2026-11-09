/* Check independent network, HTTP and downstream observations from the native run. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const pack='sandbox-egress';
const folder='dist/labs/'+pack;
const frozen=fs.readFileSync(folder+'/validation.json');
const data=JSON.parse(frozen);
const fixture=JSON.parse(fs.readFileSync(folder+'/fixture.json','utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const allowed='/v1/tenants/A/reports/R27',other='/v1/tenants/B/reports/R27',secret='/v1/secrets';

function verify(record){
 assert.equal(record.schema,1);
 assert.equal(record.status,'passed');
 for(const [name,hash] of Object.entries(record.source_sha256)){
  assert.match(name,/^[a-zA-Z0-9_.-]+$/);
  assert.equal(hash,sha(fs.readFileSync(folder+'/'+name)));
 }
 for(const name of ['sandbox_egress.py','fixture.json'])assert(Object.hasOwn(record.source_sha256,name));
 assert.equal(record.environment.os,'linux');
 assert.match(record.environment.image_id,/^sha256:[a-f0-9]{64}$/);
 const {topology,cases,worker_controls:worker,upstream_events:events}=record.report;
 assert.equal(topology.networks_internal,true);
 assert.equal(topology.published_ports,0);
 assert.deepEqual(topology.worker_networks,['sandbox']);
 assert.deepEqual([...topology.broker_networks].sort(),['private','sandbox']);
 assert.deepEqual(topology.upstream_networks,['private']);
 assert.deepEqual(worker,{user:'65534:65534',read_only:true,cap_drop:['ALL'],no_new_privileges:true,has_broker_credential:false,mounts:0});
 assert.equal(cases.upstream_control.status,200);
 assert.equal(cases.direct.connected,false);
 assert(cases.direct.error_type);
 assert.equal(cases.allowed.status,200);
 const expected={tenant:'A',report_id:'R27',total:[10,27].reduce((sum,n)=>sum+n,0)};
 assert.deepEqual(cases.allowed.body,expected);
 assert.deepEqual(cases.upstream_control.body,expected);
 assert.deepEqual(cases.other_tenant_control,{status:200,body:{tenant:'B',report_id:'R27',total:99},location:null});
 assert.deepEqual(cases.secret_control,{status:200,marker_present:true});
 assert.deepEqual(fixture.capability,{method:'GET',path:allowed,tenant:'A',report_id:'R27'});
 assert.deepEqual(fixture.redirect,{on_visit:2,target:secret});
 for(const [name,status] of [['other_tenant',403],['other_method',405],['other_path',403],['query',403],['caller_authorization',400],['redirect',502]]){
  assert.equal(cases[name].status,status,name+': rejected before returning data');
  assert.equal(cases[name].location,null,name+': no redirect leaked to the worker');
 }
 assert.deepEqual(events,[
  [allowed,'broker',200],[allowed,'broker',302],
  [allowed,'upstream-control',200],[other,'upstream-control',200],[secret,'upstream-control',200]
 ].map(([path,cause,status])=>({method:'GET',path,authenticated:true,case:cause,status})));
}

verify(data);
if(process.argv[2])verify(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
assert(execFileSync('unzip',['-p',folder+'.zip',pack+'/validation.json']).equals(frozen));
const html=fs.readFileSync('dist/article/agent-sandbox/index.html','utf8');
for(const marker of ['id="native-sandbox-egress"','diagrams/sandbox-egress-boundary.svg','labs/sandbox-egress.zip','labs/sandbox-egress/validation.json'])assert(html.includes(marker),marker);
assert(fs.readFileSync('dist/module/agent/index.html','utf8').includes('/article/agent-sandbox/#native-sandbox-egress'));
assert(fs.readFileSync('dist/roadmap/agent-platform/index.html','utf8').includes('?goal=agent-platform#native-sandbox-egress'));
assert(fs.readFileSync('dist/labs/index.html','utf8').includes('id="lab-agent-sandbox-egress"'));
console.log('PASS: native sandbox topology, independent report total and network/HTTP controls, exact source and reading links.');
