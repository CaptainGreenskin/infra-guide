const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pack = 'dist/labs/kubernetes-pdb-rollout';
const source = pack + '/pdb_rollout.py';
const read = file => fs.readFileSync(path.join(root, file));
const json = file => JSON.parse(read(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitShow = (commit, file) => execFileSync('git', ['show', commit + ':' + file], {cwd:root});
const label = {app:'reports'};
const podsPath = '/api/v1/namespaces/pdb-lab/pods';
const image = 'python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844';
const nodeImage = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0';

function checkSnapshot(snapshot, ready, minimum, version='v1') {
 const {pods, deployment, pdb} = snapshot;
 assert.equal(pods.length,3);
 assert.equal(new Set(pods.map(pod=>pod.uid)).size,3);
 for(const pod of pods) {
  assert.match(pod.uid,/^[0-9a-f-]{36}$/);
  assert(pod.name.startsWith(pod.owner+'-'));
  assert.equal(pod.phase,'Running');
  assert.equal(pod.deleting,false);
 }
 const expected = version==='v1'?['v1:true','v1:true','v1:true']:['v1:true','v1:true','v2:false'];
 assert.deepEqual(pods.map(pod=>pod.version+':'+pod.ready).sort(),expected);
 assert.equal(new Set(pods.filter(pod=>pod.version==='v1').map(pod=>pod.owner)).size,1);
 assert.equal(new Set(pods.map(pod=>pod.owner)).size,version==='v1'?1:2);
 assert.equal(pods.filter(pod=>pod.ready).length,ready);
 assert.equal(deployment.generation,deployment.observedGeneration);
 assert.equal(deployment.replicas,3);
 assert.equal(deployment.templateVersion,version);
 assert.equal(deployment.availableReplicas,ready);
 assert.equal(deployment.updatedReplicas,version==='v1'?3:1);
 assert.equal(deployment.maxSurge,0);
 assert.equal(deployment.maxUnavailable,1);
 assert.equal(pdb.generation,pdb.observedGeneration);
 assert.equal(pdb.currentHealthy,ready);
 assert.equal(pdb.minAvailable,minimum);
 assert.equal(pdb.desiredHealthy,minimum);
 assert.equal(pdb.expectedPods,3);
 assert.equal(pdb.disruptionsAllowed,Math.max(0,ready-minimum));
 assert.equal(Object.keys(pdb.disruptedPods||{}).length,0);
}

function checkAction(action, snapshot, method, codes) {
 const {pod, path: url, request, response} = action;
 assert.deepEqual(snapshot.pods.find(item=>item.uid===pod.uid),pod);
 assert.equal(pod.ready,true);
 assert.equal(action.method,method);
 assert(codes.includes(action.http_status));
 const target = podsPath+'/'+pod.name;
 const options = {preconditions:{uid:pod.uid}};
 if(method==='POST') {
  assert.equal(url,target+'/eviction');
  assert.deepEqual(request,{apiVersion:'policy/v1',kind:'Eviction',
   metadata:{name:pod.name,namespace:'pdb-lab'},deleteOptions:options});
 } else {
  assert.equal(url,target);
  assert.deepEqual(request,options);
 }
 if(codes[0]===429) {
  assert.equal(response.kind,'Status');
  assert.equal(response.code,429);
  assert.equal(response.reason,'TooManyRequests');
  assert(response.details.causes.some(cause=>cause.reason==='DisruptionBudget'));
 } else if(method==='POST') {
  assert.equal(response.status,'Success');
 }
}

function checkReplacement(before, after, removed) {
 const old = new Set(before.pods.map(pod=>pod.uid));
 const current = new Set(after.pods.map(pod=>pod.uid));
 assert.deepEqual([...old].filter(uid=>!current.has(uid)),[removed]);
 assert.equal([...current].filter(uid=>!old.has(uid)).length,1);
}

function check(record) {
 assert.equal(record.status,'passed');
 assert.equal(record.environment.system,'Linux');
 assert.equal(record.environment.machine,'x86_64');
 assert.match(record.kind,/kind v0\.33\.0\b/);
 assert.equal(record.versions.clientVersion.gitVersion,'v1.35.8');
 assert.equal(record.versions.serverVersion.gitVersion,'v1.35.8');
 assert.equal(record.node_image,nodeImage);
 assert.equal(record.workload_image,image);
 assert.deepEqual(record.source_sha256,{'pdb_rollout.py':sha(read(source))});
 assert.equal(record.cluster_cleaned,true);
 const {manifest, initial, allowed_eviction:allowed, after_eviction:afterEviction,
  strict, blocked_eviction:blocked, direct_delete:deletion, before_rollout:beforeRollout,
  stalled_rollout:stalled, blocked_during_rollout:blockedDuring, after_undo:afterUndo} = record;
 const [,deployment,budget] = manifest.items;
 assert.equal(deployment.kind,'Deployment');
 assert.equal(deployment.spec.replicas,3);
 assert.deepEqual(deployment.spec.selector.matchLabels,label);
 assert.deepEqual(deployment.spec.template.metadata.labels,{...label,'lab-version':'v1'});
 assert.deepEqual(deployment.spec.strategy,{type:'RollingUpdate',rollingUpdate:{maxSurge:0,maxUnavailable:1}});
 assert.equal(deployment.spec.template.spec.containers[0].image,image);
 assert.equal(budget.kind,'PodDisruptionBudget');
 assert.equal(budget.spec.minAvailable,2);
 assert.deepEqual(budget.spec.selector.matchLabels,label);
 checkSnapshot(initial,3,2);
 checkAction(allowed,initial,'POST',[200,201]);
 checkSnapshot(afterEviction,3,2);
 checkReplacement(initial,afterEviction,allowed.pod.uid);
 checkSnapshot(strict,3,3);
 assert.deepEqual(strict.pods,afterEviction.pods);
 assert(strict.pdb.generation>afterEviction.pdb.generation);
 checkAction(blocked,strict,'POST',[429]);
 assert.equal(record.still_present_after_rejection,blocked.pod.uid);
 checkAction(deletion,strict,'DELETE',[200,202]);
 assert.equal(deletion.pod.uid,blocked.pod.uid);
 checkSnapshot(beforeRollout,3,3);
 checkReplacement(strict,beforeRollout,deletion.pod.uid);
 checkSnapshot(stalled,2,3,'v2');
 assert(stalled.deployment.generation>beforeRollout.deployment.generation);
 assert.equal(stalled.pdb.generation,beforeRollout.pdb.generation);
 const newPod = stalled.pods.find(pod=>pod.version==='v2');
 const retired = beforeRollout.pods.find(pod=>!stalled.pods.some(live=>live.uid===pod.uid));
 assert(retired?.ready);
 checkReplacement(beforeRollout,stalled,retired.uid);
 checkAction(blockedDuring,stalled,'POST',[429]);
 checkSnapshot(afterUndo,3,3);
 assert(afterUndo.deployment.generation>stalled.deployment.generation);
 assert.equal(afterUndo.pdb.generation,stalled.pdb.generation);
 checkReplacement(stalled,afterUndo,newPod.uid);
}

const raw = read(pack+'/validation.json');
const record = JSON.parse(raw);
check(record);
for(const mutate of [
 r=>{r.blocked_eviction.response.details.causes[0].reason='Throttled'},
 r=>{r.direct_delete.pod.uid=r.initial.pods[0].uid},
 r=>{r.stalled_rollout.pods.find(p=>p.version==='v2').ready=true},
 r=>{r.stalled_rollout.pdb.disruptionsAllowed=1},
 r=>{r.after_undo.pods[0].uid=r.stalled_rollout.pods.find(p=>p.version==='v2').uid},
]){
 const bad=structuredClone(record);
 mutate(bad);
 assert.throws(()=>check(bad),assert.AssertionError);
}

const ci = json(pack+'/ci-record.json');
assert.equal(ci.conclusion,'success');
assert.match(ci.headSha,/^[a-f0-9]{40}$/);
assert.equal(ci.url,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/'+ci.run_id);
assert.equal(ci.workflow,'.github/workflows/kubernetes-pdb-rollout.yml');
assert.equal(ci.source_sha256,sha(read(source)));
assert.equal(ci.record_sha256,sha(raw));
assert.deepEqual(gitShow(ci.headSha,source),read(source));
assert.equal(sha(gitShow(ci.headSha,ci.workflow)),ci.workflow_sha256);

const figure = read('dist/diagrams/kubernetes-pdb-rollout.svg').toString();
assert.match(figure,/<title id="title">[^<]+<\/title>/);
assert.match(figure,/<desc id="desc">[^<]+<\/desc>/);
const stages = [record.initial,record.strict,record.stalled_rollout,record.after_undo];
assert.deepEqual(JSON.parse(figure.match(/<metadata>(.*?)<\/metadata>/s)[1]),{
 ready:stages.map(stage=>stage.pdb.currentHealthy),
 minimum:stages.map(stage=>stage.pdb.desiredHealthy),
 allowed:stages.map(stage=>stage.pdb.disruptionsAllowed),
 blocked:[record.blocked_eviction,record.blocked_during_rollout].map(action=>action.http_status),
 stalled_versions:record.stalled_rollout.pods.map(pod=>pod.version).sort()
});

execFileSync('python3',['-B','-c',`
from pathlib import Path
from zipfile import ZipFile
import sys
folder = Path(sys.argv[1])
files = ["README.md", "ci-record.json", "pdb_rollout.py", "validation.json"]
with ZipFile(folder.with_suffix(".zip")) as archive:
    assert sorted(archive.namelist()) == [folder.name + "/" + name for name in files]
    for name in files:
        assert archive.read(folder.name + "/" + name) == (folder / name).read_bytes()
`,path.join(root,pack)]);

const context = vm.createContext({});
for(const [,file] of read('src/page-shell.html').toString().matchAll(/<script defer src="([^"]+)"/g)){
 if(file!=='app.js')vm.runInContext(read('dist/'+file).toString(),context,{filename:file});
}
const expression = 'articleById("k8s-workloads").sections';
const current = JSON.parse(JSON.stringify(vm.runInContext(expression,context)));
const baseline = require('./content-at-commit.cjs').evaluate('ebff1ffe719838148cb6d69e33189dc7e26fad98',expression);
const boundary = '<h3 id="native-pdb-eviction-rollout">';
const [retained, added] = current[5][1].split(boundary);
assert(added);
current[5][1] = retained;
assert.deepEqual(current,baseline);
for(const asset of ['diagrams/kubernetes-pdb-rollout.svg','labs/kubernetes-pdb-rollout.zip',
 'labs/kubernetes-pdb-rollout/pdb_rollout.py','labs/kubernetes-pdb-rollout/validation.json',
 'labs/kubernetes-pdb-rollout/README.md']) assert(added.includes(asset),asset);
const basicsAnchor='subsection-2-lznes3',workloadAnchor='native-pdb-eviction-rollout';
const basicsHref='/article/kubernetes-basics/#'+basicsAnchor,workloadHref='/article/k8s-workloads/#'+workloadAnchor;
const basics=read('dist/article/kubernetes-basics/index.html').toString()
 .split('id="'+basicsAnchor+'"')[1]?.split('id="subsection-2-p1xcgh"')[0];
const workload=read('dist/article/k8s-workloads/index.html').toString()
 .split('id="'+workloadAnchor+'"')[1]?.split('</section>')[0];
assert(basics?.includes(workloadHref) && basics.includes('/labs/kubernetes-pdb-rollout/validation.json'));
assert(workload?.includes(basicsHref) && added.includes(basicsHref));
assert(workload.includes('PDB 的 <code>observedGeneration</code>')&&workload.includes('Deployment 自己的代次和副本数'));
const stalled=record.stalled_rollout.deployment;
for(const [field,value] of Object.entries({
 'metadata.generation':stalled.generation,'status.observedGeneration':stalled.observedGeneration,
 'spec.replicas':stalled.replicas,'status.updatedReplicas':stalled.updatedReplicas,'status.availableReplicas':stalled.availableReplicas,
}))assert(basics.includes('<code>'+field+'='+value+'</code>'),field);
assert(basics.includes('v2 的状态是已运行（<code>Running</code>）、未就绪（<code>Ready=false</code>）'));
assert(basics.includes('要确认用户收到的版本，还需从实际入口发请求'));
console.log('PASS: kind eviction accepted, 429 budget rejection, same-UID direct DELETE, stalled rollout, undo, CI source and exact archive/figure/lesson bindings; five rejected controls.');
