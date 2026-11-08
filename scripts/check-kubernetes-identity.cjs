/* Native ServiceAccount/RBAC evidence, unchanged legacy sections and independent oracles. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),assert=require('assert'),os=require('os');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const folder='dist/labs/kubernetes-identity/',read=f=>fs.readFileSync(f,'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const source=read(folder+'identity_lab.py');
assert(!source.includes('load_cert_chain'),'Business TLS must never load the admin client certificate');
assert(source.includes("ssl.create_default_context(cadata=ca)"));
assert(source.includes('urllib.request.ProxyHandler({})'));
assert(source.includes("'jsonpath={.clusters[0].cluster}'"));
assert(!source.includes("'--token'"),'Do not expose bearer tokens as CLI arguments');
execFileSync('python3',['-B','-c',`from pathlib import Path
import os,runpy
from types import SimpleNamespace
from unittest.mock import patch
path=Path('${folder}identity_lab.py')
compile(path.read_text(),str(path),'exec')
m=runpy.run_path(str(path))
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
`],{encoding:'utf8'});
if(process.argv.includes('--source-only')){
 console.log('PASS: Python syntax, CA/Bearer separation and remote Docker rejection; native execution not asserted.');
 process.exit(0);
}
const validation=JSON.parse(read(folder+'validation.json')),native=validation.execution,o=native.observation;
assert.equal(validation.status,'passed');assert.equal(native.status,'passed');assert.equal(native.system,'Linux');
assert(/^https:\/\/github\.com\/CaptainGreenskin\/infra-guide\/actions\/runs\/\d+$/.test(validation.origin.run_url));
assert(/^[0-9a-f]{40}$/.test(validation.origin.source_commit));
assert(native.cleanup.complete&&native.cleanup.owned_cluster_absent&&native.cleanup.delete_attempted);
assert.equal(native.node_image,'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0');
assert(native.versions.kind.split(' ').includes('v0.33.0'));assert.equal(native.versions.kubernetes,'v1.35.8');
for(const[name,digest]of Object.entries(validation.source_sha256))assert.equal(sha(fs.readFileSync(folder+name)),digest,name+': source binding');
assert.equal(native.source_sha256['identity_lab.py'],sha(source));

function independent(observation){
 const calls=Object.fromEntries(observation.http.map(row=>[row.case,row]));
 assert.equal(Object.keys(calls).length,12);assert.equal(observation.http.length,12);
 const subject='system:serviceaccount:report-a:report-reader',key='/api/v1/namespaces/report-a/configmaps/reports-v1';
 assert.deepEqual(['read_allowed','binding_removed','binding_restored'].map(name=>calls[name].status),[200,403,200]);
 assert(['read_allowed','binding_removed','binding_restored'].every(name=>calls[name].credential_ref==='reader-1'));
 assert.equal(calls.who_am_i.status,201);assert.equal(calls.who_am_i.body.status.userInfo.username,subject);
 for(const name of ['read_allowed','binding_restored','bound_before_delete']){
  const body=calls[name].body;assert.equal(calls[name].status,200);assert.equal(body.kind,'ConfigMap');
  assert.equal(body.metadata.name,'reports-v1');assert.equal(body.metadata.namespace,'report-a');assert.deepEqual(body.data,{value:'37'});
 }
 for(const name of ['other_name','other_namespace','patch_denied','secret_denied','list_denied','binding_removed']){
  assert.equal(calls[name].status,403);assert.equal(calls[name].body.reason,'Forbidden');assert(calls[name].body.message.includes(subject));
 }
 assert.equal(calls.patch_denied.method,'PATCH');assert.equal(calls.patch_denied.path,key);
 assert.equal(calls.other_namespace.path,'/api/v1/namespaces/report-b/configmaps/reports-v1');
 assert.equal(calls.other_name.path,'/api/v1/namespaces/report-a/configmaps/reports-v2');
 assert.equal(calls.secret_denied.path,'/api/v1/namespaces/report-a/secrets/report-signing');
 assert.equal(calls.wrong_audience.status,401);assert.equal(calls.bound_after_delete.status,401);
 for(const name of ['before_binding_removed','without_binding','after_binding_restored','bound_before_delete']){
  assert.equal(observation.token_reviews[name].authenticated,true);assert.equal(observation.token_reviews[name].user.username,subject);
 }
 assert.equal(observation.token_reviews.wrong_audience.authenticated,false);
 assert.equal(observation.token_reviews.bound_after_delete.authenticated,false);
 assert.deepEqual(observation.credentials['wrong-audience'].audiences,['reports-api.invalid']);
 assert.equal(observation.credentials['bound-1'].bound_pod_uid,observation.bound_pod.uid);
 assert.equal(observation.bound_pod.deleted,true);assert(observation.bound_pod.revocation_observed_seconds>=0&&observation.bound_pod.revocation_observed_seconds<=90);
 assert.deepEqual(observation.before,observation.after);assert.equal(Object.keys(observation.before).length,4);
 assert.equal(observation.before[key].data_sha256,sha('{"value":"37"}'));
 assert.deepEqual(observation.tls,{ca_verified:true,client_certificate_loaded:false,environment_proxy_used:false,endpoint_loopback:true});
}
independent(o);
for(const mutate of [
 x=>x.http.find(r=>r.case==='binding_removed').status=200,
 x=>x.http.find(r=>r.case==='read_allowed').body.data.value='99',
 x=>x.http.find(r=>r.case==='who_am_i').body.status.userInfo.username='kubernetes-admin',
 x=>x.http.find(r=>r.case==='wrong_audience').status=200,
 x=>x.http.find(r=>r.case==='other_namespace').status=200,
 x=>x.token_reviews.without_binding.authenticated=false,
 x=>x.token_reviews.bound_after_delete.authenticated=true,
 x=>x.after['/api/v1/namespaces/report-a/configmaps/reports-v1'].resource_version='modified',
 x=>x.tls.client_certificate_loaded=true,
 x=>x.credentials['bound-1'].bound_pod_uid='another-pod'
]){const changed=JSON.parse(JSON.stringify(o));mutate(changed);assert.throws(()=>independent(changed),assert.AssertionError);}
assert(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(JSON.stringify(validation)),'Credential material leaked into record');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'infra-identity-check-'));
try{
 const file=path.join(temp,'native.json');fs.writeFileSync(file,JSON.stringify(native));
 execFileSync('python3',['-B',folder+'identity_lab.py','--check-record',file],{encoding:'utf8'});
}finally{fs.rmSync(temp,{recursive:true,force:true});}

// Evaluate the bridge against explicit old content so replacing an h2, ID or
// old code block cannot be hidden by the final composed runtime.
const titles=['门能打开，不代表屋里什么都能动','沿着身份链走一遍，找出每次委托','从一项具体任务推导最少的权限','允许、缺少允许、显式拒绝是三种判断','两次拒绝与一次更危险的成功','短期凭证要处理签发、续期和撤销三个时刻','把最小权限验收写成正例和负例','课堂验收：单次成功可以说明多少事','配套实战：真实HTTP授权与无副作用验收'];
const original=titles.map((t,i)=>[t,'<p id="old-'+i+'">old '+i+'</p><pre><code>legacy-'+i+'</code></pre>']);
const c={articles:[{id:'iam-security',title:'身份与最小权限：谁能让系统做什么',sections:JSON.parse(JSON.stringify(original)),refs:[]}],sources:{}};
vm.createContext(c);vm.runInContext(read('dist/kubernetes-identity-bridge.js'),c);
const article=JSON.parse(JSON.stringify(c.articles[0]));assert.equal(article.id,'iam-security');assert.equal(article.title,'身份与最小权限：谁能让系统做什么');
assert.deepEqual(article.sections.map(s=>s[0]),titles);
article.sections.forEach((s,i)=>assert(s[1].startsWith(original[i][1]),'Legacy body/code must stay intact'));
const embedded=JSON.parse(vm.runInContext('JSON.stringify(kubernetesIdentityEvidence)',c));assert.deepEqual(embedded,validation);
assert.equal(vm.runInContext('kubernetesIdentitySource',c),source);
// Compare the bridge at its real composition boundary. Later complete-body
// revisions depend on this material and cannot run before it has been injected.
const runtime={};vm.createContext(runtime);
for(const[,file]of read('src/page-shell.html').matchAll(/<script defer src="([^"]+)"/g)){
 if(file==='kubernetes-identity-bridge.js')break;
 if(file!=='app.js')vm.runInContext(read('dist/'+file),runtime,{filename:file});
}
const actualBefore=JSON.parse(vm.runInContext('JSON.stringify(articles.find(a=>a.id==="iam-security"))',runtime));
vm.runInContext(read('dist/kubernetes-identity-bridge.js'),runtime,{filename:'kubernetes-identity-bridge.js'});
const actualAfter=JSON.parse(vm.runInContext('JSON.stringify(articles.find(a=>a.id==="iam-security"))',runtime));
assert.equal(actualAfter.title,actualBefore.title);assert.equal(actualAfter.id,actualBefore.id);
assert.deepEqual(actualAfter.sections.map(s=>s[0]),actualBefore.sections.map(s=>s[0]));
actualBefore.sections.forEach((s,i)=>assert(actualAfter.sections[i][1].startsWith(s[1]),'Actual authored IAM body changed'));
const body=article.sections.map(s=>s[1]).join('');
for(const id of ['kubernetes-identity-normal','kubernetes-identity-rbac','kubernetes-identity-changes','kubernetes-identity-run'])assert(body.includes('id="'+id+'"'));
assert(body.includes('TokenRequest')&&body.includes('SelfSubjectReview')&&body.includes('TokenReview')&&body.includes('reports-v1'));
assert(body.includes(validation.origin.run_url));
const visible=JSON.parse(execFileSync('python3',['-B','-c',`from html.parser import HTMLParser
import json,re,sys
class Visible(HTMLParser):
 def __init__(self):super().__init__();self.depth=0;self.summary=False;self.pre=0;self.parts=[];self.figures=0;self.heads=0;self.codes=0
 def handle_starttag(self,tag,attrs):
  if tag=='details':self.depth+=1
  if tag=='summary' and self.depth==1:self.summary=True
  if tag=='pre':
   self.pre+=1
   if not self.depth:self.codes+=1
  if not self.depth and tag=='figure':self.figures+=1
  if not self.depth and tag=='h3':self.heads+=1
 def handle_endtag(self,tag):
  if tag=='details':self.depth-=1
  if tag=='summary':self.summary=False
  if tag=='pre':self.pre-=1
 def handle_data(self,data):
  if not self.pre and (not self.depth or self.summary):self.parts.append(data)
p=Visible();p.feed(sys.stdin.read())
print(json.dumps({'chinese':len(re.findall('[\\u4e00-\\u9fff]',''.join(p.parts))),'figures':p.figures,'heads':p.heads,'codes':p.codes}))
`],{encoding:'utf8',input:body}));
assert(visible.chinese>=400&&visible.chinese<=650,'Default bridge prose must remain concise: '+visible.chinese);
assert.equal(visible.figures,1);assert.equal(visible.heads,1);assert.equal(visible.codes,10,'One new short API block, plus nine preserved legacy code fixtures');
const unescape=text=>text.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
for(const name of ['flow','decisions']){
 const svg=read('dist/diagrams/kubernetes-identity-'+name+'.svg');assert(svg.includes('<title')&&svg.includes('<desc'));
 const metadata=JSON.parse(unescape(svg.match(/<metadata>([\s\S]*?)<\/metadata>/)[1]));
 assert.equal(metadata.source_sha256,native.source_sha256['identity_lab.py']);
 assert.deepEqual(metadata.observation,name==='flow'?{credentials:o.credentials,http:o.http.filter(row=>['who_am_i','read_allowed'].includes(row.case))}:{http:o.http,token_reviews:o.token_reviews,bound_pod:o.bound_pod});
}
execFileSync('python3',['-B','-c',`from pathlib import Path
import zipfile
folder=Path('${folder}')
with zipfile.ZipFile(folder.with_suffix('.zip')) as archive:
 names=['README.md','identity_lab.py','validation.json']
 assert archive.testzip() is None
 assert sorted(archive.namelist())==sorted('kubernetes-identity/'+n for n in names)
 for name in names:assert archive.read('kubernetes-identity/'+name)==(folder/name).read_bytes(),name
`],{encoding:'utf8'});
console.log('PASS: native CA/Bearer identity, same-token 200/403/200, resource/namespace/verb boundaries, audience and bound-Pod revocation, unchanged object oracle and old sections/code; default '+visible.chinese+' Chinese characters, 1 main figure/API block; source/record/two SVGs/ZIP.');
