/* Offline native Service evidence, independent business oracle and preserved source checks. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),assert=require('assert'),os=require('os');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/kubernetes-service/',read=f=>fs.readFileSync(f,'utf8');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const source=read(folder+'service_lab.py');
const workflow=read('.github/workflows/kubernetes-service.yml');
assert(source.includes("'--kubeconfig', str(self.kubeconfig), '--context', 'kind-' + self.name"));
assert(source.includes("urllib.request.ProxyHandler({})"));
assert(source.includes("'automountServiceAccountToken': False"));
assert(!source.includes("'port-forward'"),'No port-forward command can stand in for Service traffic');
assert(workflow.includes('v0.33.0/kind-linux-amd64.sha256sum')&&workflow.includes('sha256sum -c'));
assert(workflow.includes('v1.35.8/bin/linux/amd64/kubectl.sha256'));
execFileSync('python3',['-B','-c',`from pathlib import Path
import os,runpy
from types import SimpleNamespace
from unittest.mock import patch
p=Path('${folder}service_lab.py');compile(p.read_text(),str(p),'exec')
m=runpy.run_path(str(p));compile(m['APP_CODE'],'app.py','exec');compile(m['CLIENT_CODE'],'client.py','exec')
for host,endpoint in [('tcp://example.invalid:2375','unix:///safe.sock'),('', 'ssh://example.invalid'),('', 'tcp://example.invalid:2375')]:
 lab=m['Lab']();calls=[]
 def command(*argv,**kwargs):
  calls.append(argv)
  assert argv==('docker','context','inspect'),'Daemon accessed before endpoint rejection'
  return SimpleNamespace(stdout='[{"Endpoints":{"docker":{"Host":"'+endpoint+'"}}}]',returncode=0)
 lab.command=command
 with patch.dict(os.environ,{'DOCKER_HOST':host},clear=True),patch('platform.system',return_value='Linux'),patch('shutil.which',return_value='/usr/bin/tool'):
  try:lab.run(Path('/unused'))
  except AssertionError:pass
  else:raise AssertionError('Remote Docker accepted')
 assert len(calls)==(0 if host else 1) and not lab.created
# EndpointSlice exists before its controller has populated endpoints. Optional API arrays
# may be omitted or explicitly null; neither is a converged/ready state.
lab=m['Lab']()
objects={
 'service':{'metadata':{'uid':'s'},'spec':{'clusterIP':'10.96.0.1','ports':[{'port':80,'targetPort':8080}],'selector':{'app':'guide-service'}}},
 'deployment':{'metadata':{'uid':'d','generation':1,'annotations':None},'status':None,'spec':{'template':{'spec':{'containers':[{'env':[{'name':'APP_VERSION','value':'v1'}]}]}}}},
 'pods':{'items':[{'metadata':{'name':'starting','uid':'p'},'status':{'containerStatuses':None,'conditions':None},'spec':{'containers':[{'env':[{'name':'APP_VERSION','value':'v1'}]}]}}]},
 'endpointslices.discovery.k8s.io':{'items':[{'metadata':{'uid':'slice'},'endpoints':None}]}}
lab.get=lambda resource,*args:objects[resource]
snapshot=lab.snapshot()
assert snapshot['endpoints']==[] and snapshot['pods'][0]['ready'] is False
assert snapshot['pods'][0]['restart_count']==0 and snapshot['pods'][0]['ip'] is None
assert snapshot['deployment']['revision']=='' and snapshot['deployment']['observed_generation']==0
assert lab.converged('v1') is False
objects['pods']['items'][0]['status']=None
assert lab.snapshot()['pods'][0]['ip'] is None and lab.converged('v1') is False
objects['pods']={'items':None};objects['endpointslices.discovery.k8s.io']={'items':None}
assert lab.snapshot()['pods']==[] and lab.converged('v1') is False
`],{encoding:'utf8'});
if(process.argv.includes('--source-only')){
 console.log('PASS: host/app/client syntax, remote Docker rejection and early nullable API state; native execution not asserted.');process.exit(0);
}
const validation=JSON.parse(read(folder+'validation.json')),native=validation.execution,o=native.observation;
assert.equal(validation.status,'passed');assert.equal(native.status,'passed');assert.equal(native.system,'Linux');
assert(/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/.test(validation.origin.run_url));
assert(/^[0-9a-f]{40}$/.test(validation.origin.source_commit));
assert(native.cleanup.complete&&native.cleanup.owned_cluster_absent&&native.cleanup.delete_attempted);
assert.equal(native.node_image,'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0');
assert.equal(native.python_image,'python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844');
assert(native.versions.kind.split(' ').includes('v0.33.0'));assert.equal(native.versions.kubernetes,'v1.35.8');assert.equal(native.versions.kubectl,'v1.35.8');
for(const[name,digest]of Object.entries(validation.source_sha256))assert.equal(sha(fs.readFileSync(folder+name)),digest,name+': source binding');
assert.equal(native.source_sha256['service_lab.py'],sha(source));
assert.equal(sha(execFileSync('git',['show',validation.origin.source_commit+':'+folder+'service_lab.py'])),sha(source),'Immutable native source commit');

function independent(x){
 const names=['normal_v1','readiness_failed','readiness_recovered','liveness_restarted','rolled_v2','undo_v1'];
 assert.deepEqual(Object.keys(x.cases).sort(),[...names].sort());
 assert.equal(x.client.path,'in-cluster client Pod -> Service ClusterIP:80 -> Pod:8080');
 assert.equal(x.client.service_url,'http://'+x.client.cluster_ip+'/work');
 assert.equal(x.client.environment_proxy_used,false);assert.equal(x.client.port_forward_used,false);
 assert.equal(x.service.cluster_ip,x.client.cluster_ip);assert.equal(x.service.port,80);assert.equal(x.service.target_port,8080);
 assert.deepEqual(x.service.selector,{app:'guide-service'});assert.equal(x.service.publish_not_ready_addresses,false);
 const all=new Map(x.requests.map(r=>[r.seq,r]));assert.equal(all.size,x.requests.length);
 assert(x.requests.length>=120);assert.equal(new Set(x.requests.map(r=>r.request_id)).size,x.requests.length);
 for(let i=0;i<x.requests.length;i++){
  const r=x.requests[i];assert.equal(r.seq,i+1);assert.equal(r.url,x.client.service_url);assert.equal(r.new_connection,true);
  assert(r.completed_at>=r.started_at);assert(/^[a-f0-9]{32}$/.test(r.request_id));
  if(r.status===200){assert.equal(r.body.request_id,r.request_id);assert.equal(r.body.path,'/work');assert.equal(r.body.status,200);}
 }
 const ready=s=>s.endpoints.filter(e=>e.conditions.ready===true).map(e=>e.pod_uid).sort();
 const podMap=s=>new Map(s.pods.map(p=>[p.uid,p]));
 const sampleIDs=new Set();
 for(const name of names){
  const c=x.cases[name],before=c.api_before,after=c.api_after;
  assert.deepEqual(before.service,x.service);assert.deepEqual(after.service,x.service);
  assert.equal(before.deployment.uid,after.deployment.uid);assert.equal(before.deployment.uid,x.cases.normal_v1.api_before.deployment.uid);
  assert.equal(before.pods.length,2);assert.equal(after.pods.length,2);
  assert.deepEqual(before.pods.map(p=>p.uid).sort(),after.pods.map(p=>p.uid).sort());
  assert.deepEqual(ready(before),ready(after));assert.equal(c.sample_sequences.length,20);
  for(let i=0;i<20;i++)assert.equal(c.sample_sequences[i],c.sample_sequences[0]+i,'Consecutive request window');
  const rows=c.sample_sequences.map(seq=>{assert(!sampleIDs.has(seq));sampleIDs.add(seq);assert(all.has(seq));return all.get(seq);});
  const version=name==='rolled_v2'?'v2':'v1';
  assert.deepEqual([...new Set(rows.map(r=>r.body.pod_uid))].sort(),ready(after));
  for(const r of rows){assert.equal(r.phase,name);assert.equal(r.status,200);assert.equal(r.body.version,version);assert.equal(r.body.request_id,r.request_id);}
  const completePhase=x.requests.filter(r=>r.phase===name);
  assert(completePhase.length>=c.phase_requests_observed&&c.phase_requests_observed>=20);
  for(const s of [before,after]){
   assert.equal(s.endpoints.length,2);assert.equal(s.deployment.template_version,version);
   assert(s.deployment.observed_generation>=s.deployment.generation);
   assert.equal(new Set(s.pods.map(p=>p.uid)).size,2);
   for(const p of s.pods){
    assert.equal(p.version,version);assert.equal(p.deleting,false);assert(p.uid&&p.ip);
    const endpoints=s.endpoints.filter(e=>e.pod_uid===p.uid);assert.equal(endpoints.length,1);
    assert.deepEqual(endpoints[0].addresses,[p.ip]);assert.equal(endpoints[0].conditions.ready,p.ready);
    assert.notEqual(endpoints[0].conditions.terminating,true);
    if(name!=='readiness_failed')assert.equal(p.ready,true);
   }
  }
 }
 const initial=x.cases.normal_v1.api_after,baseline=podMap(initial),victim=x.readiness.pod_uid;
 assert.equal(ready(initial).length,2);assert(baseline.has(victim));assert.equal(x.liveness.pod_uid,victim);
 for(const name of ['readiness_failed','readiness_recovered'])for(const s of [x.cases[name].api_before,x.cases[name].api_after]){
  assert.deepEqual(s.pods.map(p=>p.uid).sort(),[...baseline.keys()].sort());
  s.pods.forEach(p=>assert.equal(p.restart_count,baseline.get(p.uid).restart_count,'Readiness must not restart either container'));
 }
 assert.deepEqual(ready(x.cases.readiness_failed.api_after),[...baseline.keys()].filter(uid=>uid!==victim).sort());
 assert.equal(podMap(x.cases.readiness_failed.api_after).get(victim).ready,false);
 assert.deepEqual(ready(x.cases.readiness_recovered.api_after),[...baseline.keys()].sort());
 const probes=x.readiness.direct_probe;
 assert.equal(probes.ready.status,503);assert.equal(probes.live.status,200);assert.equal(probes.work.status,200);
 Object.entries(probes).forEach(([name,r])=>{assert.equal(r.body.pod_uid,victim);assert.equal(r.body.path,'/'+name);assert.equal(r.body.status,r.status);});
 assert.equal(x.liveness.direct_probe.live.status,503);assert.equal(x.liveness.direct_probe.ready.status,200);
 for(const s of [x.cases.liveness_restarted.api_before,x.cases.liveness_restarted.api_after]){
  assert.deepEqual(s.pods.map(p=>p.uid).sort(),[...baseline.keys()].sort());
  s.pods.forEach(p=>assert.equal(p.restart_count,baseline.get(p.uid).restart_count+(p.uid===victim?1:0)));
 }
 const instances=new Set(x.cases.liveness_restarted.sample_sequences.map(i=>all.get(i)).filter(r=>r.body.pod_uid===victim).map(r=>r.body.instance_id));
 assert.equal(instances.size,1);assert(!instances.has(probes.work.body.instance_id));
 const v2=x.cases.rolled_v2.api_after,undo=x.cases.undo_v1.api_after;
 assert(ready(v2).every(uid=>!baseline.has(uid)));assert(ready(undo).every(uid=>!ready(v2).includes(uid)));
 assert.equal(initial.deployment.revision,'1');assert(+v2.deployment.revision>=2);assert(+undo.deployment.revision>+v2.deployment.revision);
 assert.equal(x.rollout.undo_to_revision,1);assert.equal(x.rollout.changed_field,'spec.template.spec.containers[name=app].env[APP_VERSION]');
}
independent(o);
for(const mutate of [
 x=>x.client.service_url='http://127.0.0.1:8080/work',
 x=>x.client.port_forward_used=true,
 x=>x.requests.find(r=>r.seq===x.cases.normal_v1.sample_sequences[0]).body.version='v9',
 x=>x.requests.find(r=>r.seq===x.cases.rolled_v2.sample_sequences[0]).body.request_id='another-request',
 x=>x.cases.readiness_failed.api_after.pods.find(p=>p.uid===x.readiness.pod_uid).restart_count++,
 x=>x.cases.readiness_failed.api_after.endpoints.find(e=>e.pod_uid===x.readiness.pod_uid).conditions.ready=true,
 x=>x.requests.find(r=>r.seq===x.cases.readiness_failed.sample_sequences[0]).body.pod_uid=x.readiness.pod_uid,
 x=>x.cases.liveness_restarted.api_after.pods.find(p=>p.uid===x.readiness.pod_uid).restart_count--,
 x=>x.cases.undo_v1.api_after.deployment.template_version='v2',
 x=>x.cases.rolled_v2.sample_sequences[1]=x.cases.rolled_v2.sample_sequences[0],
 x=>x.cases.undo_v1.api_after.service.cluster_ip='10.0.0.99',
 x=>x.readiness.direct_probe.work.status=503
]){const altered=JSON.parse(JSON.stringify(o));mutate(altered);assert.throws(()=>independent(altered),assert.AssertionError);}
assert(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|client-key-data|certificate-authority-data/.test(JSON.stringify(validation)),'Credential or kubeconfig material leaked');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'infra-service-check-'));
try{
 const file=path.join(temp,'native.json');fs.writeFileSync(file,JSON.stringify(native));
 execFileSync('python3',['-B',folder+'service_lab.py','--check-record',file],{encoding:'utf8'});
 if(process.env.INFRA_GUIDE_RUN_KUBERNETES_SERVICE==='1'){
  const live=path.join(temp,'fresh-native.json');execFileSync('python3',['-B',folder+'service_lab.py','--output',live],{encoding:'utf8',stdio:'inherit'});
  independent(JSON.parse(read(live)).observation);
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}
const bridge=read('dist/kubernetes-service-bridge.js');
const runtime={};vm.createContext(runtime);
for(const[,f]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g))
 if(f!=='app.js'&&f!=='kubernetes-service-bridge.js')vm.runInContext(read('dist/'+f),runtime,{filename:f});
const allBefore=JSON.parse(vm.runInContext('JSON.stringify(articles)',runtime)),before=allBefore.find(a=>a.id==='cloud-service-lab');
vm.runInContext(bridge,runtime,{filename:'kubernetes-service-bridge.js'});
const allAfter=JSON.parse(vm.runInContext('JSON.stringify(articles)',runtime)),after=allAfter.find(a=>a.id==='cloud-service-lab');
assert.deepEqual(allAfter.filter(a=>a.id!=='cloud-service-lab'),allBefore.filter(a=>a.id!=='cloud-service-lab'),'Only service chapter may change');
assert.equal(after.id,before.id);assert.equal(after.title,before.title);assert.equal(after.number,before.number);
assert.deepEqual(after.sections.map(s=>s[0]),before.sections.map(s=>s[0]));
const pre=s=>[...s.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)].map(m=>m[0]);
for(let i=0;i<before.sections.length;i++){
 assert(after.sections[i][1].includes(before.sections[i][1]),'Legacy body must be preserved verbatim in historical details');
 const legacyStart=after.sections[i][1].indexOf('<details class="full-code service-legacy">');
 assert(legacyStart>0);assert(after.sections[i][1].slice(legacyStart).includes(before.sections[i][1]));
 for(const oldPre of pre(before.sections[i][1]))assert(after.sections[i][1].includes(oldPre),'Complete old source bytes preserved');
}
assert.equal(vm.runInContext('kubernetesServiceSource',runtime),source);
assert.equal(vm.runInContext('kubernetesServiceReadme',runtime),read(folder+'README.md'));
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(kubernetesServiceEvidence)',runtime)),validation);
const body=after.sections.map(s=>s[1]).join('');
for(const id of ['kubernetes-service-normal','kubernetes-service-objects','kubernetes-service-probes','kubernetes-service-rollout','kubernetes-service-run'])assert(body.includes('id="'+id+'"'));
assert(body.includes(validation.origin.run_url));assert(body.includes('完整序列请求数')&&body.includes('非 200 / 传输失败'));
const published=read('dist/article/cloud-service-lab/index.html');
const cloud=read('dist/article/cloud-overview/index.html').split('id="section-4"')[1].split('id="section-5"')[0];
assert(cloud.includes('/article/cloud-service-lab/#kubernetes-service-probes'));
assert(cloud.includes('/labs/systems/validation.json'));
const localRecord=JSON.parse(read('dist/labs/systems/validation.json'));
assert.equal(sha(read('dist/labs/systems/infra_lab.py')),localRecord.source_sha256['infra_lab.py']);
const localProbes=localRecord.core.results.http.observations.slice(-3).map(row=>[row.path,row.status]);
assert.deepEqual(localProbes,['ready','live','work'].map(name=>['/'+name,o.readiness.direct_probe[name].status]));
const container=read('dist/article/container-runtime/index.html').split('id="section-4"')[1].split('</section>')[0];
const kubectl=container.indexOf('kubectl -n demo get pod');
assert(kubectl>0&&container.slice(0,kubectl).includes('Kubernetes 命名空间')&&container.slice(0,kubectl).includes('Linux 命名空间'));
const restartUid=o.liveness.pod_uid;
const beforeCase=o.cases.normal_v1,afterCase=o.cases.liveness_restarted;
const restartCount=phase=>phase.api_after.pods.find(pod=>pod.uid===restartUid).restart_count;
const [beforeRestart,afterRestart]=[beforeCase,afterCase].map(phase=>
 o.requests.find(r=>phase.sample_sequences.includes(r.seq)&&r.body.pod_uid===restartUid));
for(const response of [beforeRestart,afterRestart])assert.deepEqual(
 [response.status,response.body.path,response.body.version],[200,'/work','v1']);
for(const key of [restartUid,beforeRestart.body.instance_id,afterRestart.body.instance_id])
 assert(container.includes('<code>'+key.slice(0,8)+'…</code>'),key);
assert(container.includes('重启次数从 '+restartCount(beforeCase)+' 变为 '+restartCount(afterCase)));
assert(container.includes('应用每次启动生成的 <code>instance_id</code>'));
assert(container.includes('/labs/kubernetes-service/validation.json'));
assert(container.includes('/article/kubernetes-basics/#subsection-3-4ww5rs'));
assert(read('dist/article/kubernetes-basics/index.html').includes('id="subsection-3-4ww5rs"'));
const response=published.match(/<div class="mechanism-core" id="kubernetes-service-first-response">([\s\S]*?)<\/table>/)?.[1];
assert(response,'The initial native response belongs in the visible article');
const first=o.requests[0],initial=o.cases.normal_v1.api_before;
assert.equal(first.status,200);
const backend=initial.endpoints.find(endpoint=>endpoint.pod_uid===first.body.pod_uid);
for(const value of [first.body.request_id,first.body.pod_uid,first.body.version,backend.addresses[0]+':'+o.service.target_port])
 assert(response.includes('<code>'+value+'</code>'),value+': response walkthrough must match the captured request and endpoint');
assert(response.includes('labs/kubernetes-service/validation.json'),'Initial response should link to its source record');
const recovery=o.requests.filter(request=>request.phase==='readiness_recovered');
const successes=recovery.filter(request=>request.status===200).length;
assert(successes<recovery.length,'This fixture must show why 20/20 does not cover the full phase');
assert(published.includes(successes+'/'+recovery.length+'（'+(100*successes/recovery.length).toFixed(2)+'%）'),'Show the full phase denominator beside the stable window');
const stable=o.cases.readiness_recovered.sample_sequences;
const incomplete=recovery.filter(request=>request.status!==200);
assert.deepEqual(incomplete.map(({seq,status,error_type})=>[seq,status,error_type]),[[136,null,'URLError']]);
const network=read('dist/article/k8s-networking/index.html').split('id="section-2"')[1]?.split('</section>')[0];
const slo=read('dist/article/slo/index.html').split('id="service-observed-denominator"')[1]?.split('</section>')[0];
for(const lesson of [network,slo]){
 assert(lesson?.includes('第 '+stable[0]+'–'+stable.at(-1)+' 条'));
 assert(lesson.includes('第 '+incomplete[0].seq+' 条')&&lesson.includes('/article/cloud-service-lab/#kubernetes-service-probes'));
}
assert(slo.includes('URLError')&&slo.includes(successes+'/'+recovery.length+'，约 '+(100*successes/recovery.length).toFixed(2)+'%'));
assert(slo.includes('/labs/kubernetes-service/validation.json'),'The calculation must link to the original full sequence');
for(const [index,id,anchor] of [
 [0,'cloud-overview','section-4'],[0,'k8s-networking','section-2'],[1,'k8s-workloads','section-4'],
 [2,'slo','section-2'],[2,'cloud-overview','section-4'],[3,'delivery','section-5'],[3,'delivery','section-6']
]){
 const href='/article/'+id+'/#'+anchor;
 const visible=after.sections[index][1].split('<details class="full-code service-legacy">')[0];
 assert(visible.includes('href="'+href+'"')&&published.includes('href="'+href+'"'),href+': link from the relevant mechanism and render it');
 assert(read('dist/article/'+id+'/index.html').includes('id="'+anchor+'"'),href+': existing destination');
}
const deliveryRollout=read('dist/article/delivery/index.html').split('id="section-6"')[1]?.split('</section>')[0];
const serviceRollout=published.split('id="kubernetes-service-rollout"')[1]?.split('<details class="full-code service-legacy">')[0];
assert(deliveryRollout?.includes('href="/article/cloud-service-lab/#kubernetes-service-rollout"'));
assert(serviceRollout?.includes('href="/article/delivery/#section-6"'));
const rolloutCases=['normal_v1','rolled_v2','undo_v1'].map(name=>o.cases[name]);
const rolloutFirst=rolloutCases.map(phase=>o.requests.find(request=>request.seq===phase.sample_sequences[0]));
const [,publishedRevision,undoRevision]=rolloutCases.map(phase=>phase.api_after.deployment.revision);
const uidPrefixes=rolloutFirst.map(request=>'<code>'+request.body.pod_uid.slice(0,8)+'</code>').join('、');
for(const fragment of [
 '<code>'+o.service.cluster_ip+':'+o.service.port+'</code> 的 <code>'+rolloutFirst[0].body.path+'</code>',
 '各取连续 '+rolloutCases[0].sample_sequences.length+' 条响应，均为 HTTP '+rolloutFirst[0].status,
 '返回版本依次是 '+rolloutFirst.map(request=>request.body.version).join('、'),
 '各窗口首条响应的 Pod UID 分别以 '+uidPrefixes+' 开头',
 '发布 '+rolloutFirst[1].body.version+' 生成修订 '+publishedRevision,
 '指定回退到修订 '+o.rollout.undo_to_revision,
 '当前修订推进到 '+undoRevision,
])assert(deliveryRollout.includes(fragment),fragment+': delivery walkthrough must match the native trace');
assert(serviceRollout.includes('<code>rollout.undo_to_revision</code> 的 '+o.rollout.undo_to_revision));
assert(serviceRollout.includes('<code>cases.undo_v1.api_after.deployment.revision</code> 的 '+undoRevision));
const serviceFigures=[...body.matchAll(/<figure\b[^>]*>[\s\S]*?<\/figure>/g)].map(m=>m[0]).filter(html=>html.includes('diagrams/kubernetes-service-'));
assert.equal(serviceFigures.length,2,'Both native figures need the standard reader interaction');
for(const name of ['flow','changes']){
 const url='diagrams/kubernetes-service-'+name+'.svg',html=serviceFigures.find(f=>f.includes('src="'+url+'"'));
 assert(html,'Missing figure '+name);
 const opener=html.match(/<a class="figure-link" href="([^"]+)" target="_blank" rel="noopener" aria-label="([^"]+)">([\s\S]*?)<\/a>/);
 assert(opener,'Figure needs an accessible keyboard-focusable zoom link');assert.equal(opener[1],url);
 const image=opener[3].match(/<img src="([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]+)" loading="lazy">/);
 assert(image,'Figure needs explicit alt and intrinsic dimensions');assert.equal(image[1],url);
 const viewBox=read('dist/'+url).match(/viewBox="0 0 (\d+) (\d+)"/);assert(viewBox);
 assert.deepEqual(image.slice(2,4),viewBox.slice(1,3),'Intrinsic dimensions must match the source SVG');
 assert.equal(opener[2],'放大：'+image[4]);assert(image[4].length>20,'Descriptive alt must survive');
 assert(opener[3].includes('<span class="figure-zoom-hint">点击图示放大 ↗</span>'));
 assert(html.includes('<a href="'+url+'" download>下载 SVG ↗</a>'),'Figure needs its own download link');
}
for(const name of ['flow','changes']){
 const svg=read('dist/diagrams/kubernetes-service-'+name+'.svg');assert(svg.includes('<title')&&svg.includes('<desc'));
 const unescape=s=>s.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 const metadata=JSON.parse(unescape(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
 assert.equal(metadata.source_sha256,native.source_sha256['service_lab.py']);
 assert.deepEqual(metadata.observation,name==='flow'?{client:o.client,normal:o.cases.normal_v1}:{cases:o.cases,readiness:o.readiness,liveness:o.liveness,rollout:o.rollout});
}
execFileSync('python3',['-B','-c',`from pathlib import Path
import io,zipfile
folder=Path('${folder}');names=['README.md','service_lab.py','validation.json']
with zipfile.ZipFile(folder.with_suffix('.zip')) as archive:
 assert archive.testzip() is None
 assert archive.namelist()==['kubernetes-service/'+name for name in names]
 for name in names:assert archive.read('kubernetes-service/'+name)==(folder/name).read_bytes(),name
expected=io.BytesIO()
with zipfile.ZipFile(expected,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for name in names:
  info=zipfile.ZipInfo('kubernetes-service/'+name,date_time=(1980,1,1,0,0,0))
  info.create_system=3;info.external_attr=0o100644 << 16;info.compress_type=zipfile.ZIP_DEFLATED
  archive.writestr(info,(folder/name).read_bytes(),compresslevel=9)
assert expected.getvalue()==folder.with_suffix('.zip').read_bytes(),'Deterministic ZIP bytes'
`],{encoding:'utf8'});
console.log('PASS: real ClusterIP HTTP identity/version oracle, readiness without restart, separate liveness restart, v2/undo v1, twelve tamper cases, immutable source/record binding, two accessible zoom/download figures, deterministic source-bound ZIP and preserved five h2/legacy source bytes. Default offline; no new kind created.');
