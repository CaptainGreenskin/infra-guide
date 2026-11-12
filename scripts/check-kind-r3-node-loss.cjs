/* Verify the frozen Linux worker-loss evidence, archive, and exact reader destinations. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const pack='kind-r3-node-loss',folder='dist/labs/'+pack,labId='cloud-kind-r3-node-loss';
const python=process.env.INFRA_LAB_PYTHON||'python3';
const read=file=>fs.readFileSync(file);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const raw=read(folder+'/validation.json'),record=JSON.parse(raw),ci=JSON.parse(read(folder+'/ci-record.json'));
const files=['README.md','ci-record.json','node_loss_lab.py','validation.json','verify_record.py'];
assert.equal(ci.run,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/43116921403');
assert.equal(ci.head_sha,'bc3bd6b91e6b0943e7abbb109e7e03971872aa56');
assert.equal(ci.workflow,'.github/workflows/cloud-kind-r3-node-loss-evidence.yml');
assert.deepEqual(ci.artifact,{
 digest:'sha256:5e0f3b907991637825c6c3baeaba94dcfccbdfdc998803361b1548205296d4ae',
 id:13897959946,name:pack,files:[folder+'/node_loss_lab.py','native-results/kind-r3-node-loss.json']
});
assert.equal(ci.validation_sha256,digest(raw));
assert.equal(ci.source_sha256,digest(read(folder+'/node_loss_lab.py')));
assert.equal(ci.source_sha256,record.source_sha256);
const reference='dist/labs/recovery-artifacts-retrieval/validation.json';
execFileSync(python,['-B',folder+'/verify_record.py',folder+'/validation.json','--reference',reference]);
execFileSync(python,['-B','-c',`
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import runpy
import sys

folder = Path(sys.argv[1])
files = sys.argv[2:]
checker = runpy.run_path(str(folder / 'verify_record.py'))
record = json.loads((folder / 'validation.json').read_bytes())
source = folder / 'node_loss_lab.py'
assert checker['verify'](record, source) == (34, [67, 68, 69], 48429)
mutations = [
    (('loss', 'docker_running'), True),
    (('blocked', 'node'), record['observation']['nodes']['b']),
    (('after', 'service', 'uid'), 'another-service'),
    (('reads', 66, 'attachment', 'body'), 'wrong bytes'),
    (('local_elapsed_ms',), 0),
]
for keys, value in mutations:
    changed = deepcopy(record)
    target = changed['observation']
    for key in keys[:-1]:
        target = target[key]
    target[keys[-1]] = value
    try:
        checker['verify'](changed, source)
    except (AssertionError, ValueError):
        continue
    raise AssertionError(f'accepted altered observation {keys}')
with ZipFile(folder.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == sorted(f'{folder.name}/{name}' for name in files)
    for name in files:
        assert archive.read(f'{folder.name}/{name}') == (folder / name).read_bytes()
`,folder,...files]);

const observed=record.observation;
const replies=row=>[row.report,row.attachment];
const double200=row=>replies(row).every(reply=>reply.status===200);
const afterFault=observed.reads.filter(row=>row.report.started_ms>=observed.fault_ms);
const first200=afterFault.find(double200);
assert.equal(first200.trial,14);
assert(replies(first200).every(reply=>reply.pod_uid===observed.before.pod.uid));
const firstB=afterFault.find(row=>double200(row)&&replies(row).every(reply=>
 reply.node===observed.after.pod.node&&reply.pod_uid===observed.after.pod.uid&&reply.echo===reply.request_id));
assert.equal(firstB.trial,30);
assert.deepEqual(JSON.parse(firstB.report.body),record.fixture);
assert.equal(digest(firstB.attachment.body),record.fixture.sha256);
assert.equal(observed.reads.find(row=>row.trial===firstB.trial+1).report.status,null);
const stable=observed.stable_trials.map(trial=>observed.reads.find(row=>row.trial===trial));
assert(firstB.attachment.ended_ms<observed.b_route_ms&&observed.b_route_ms<=stable[0].report.started_ms);
const authored=read('dist/progressive-delivery-recovery-reading.js').toString()
 .split("h('native-kind-r3-node-loss'")[1]?.split("h('subsection-6-vxh3b7'")[0];
for(const row of [firstB,stable.at(-1)]){
 const end=row.attachment.ended_ms,start=observed.fault_ms;
 assert(authored?.includes(end+' − '+start+' = '+(end-start)+' ms'),'Show the recorded readback calculation for round '+row.trial);
}
for(const marker of ['b_route_ms='+observed.b_route_ms,'attachment.ended_ms','NodePort <code>'+observed.after.service.node_port,
 'python3 -B verify_record.py validation.json'])assert(authored.includes(marker),marker);
assert(read('dist/progressive-storage-reading.js').toString()
 .split("h('csi-node-placement-evidence'")[1]?.includes('/article/resilience/#native-kind-r3-node-loss'));

const page=path=>read('dist/'+path+'/index.html').toString();
const article=page('article/resilience');
const anchor='native-kind-r3-node-loss';
const ids=['subsection-5-1dwp2yh','recovery-report-readback-gate','native-haproxy-report-failover',anchor];
let last=-1;
for(const id of ids){
 const name='id="'+id+'"';
 const position=article.indexOf(name);
 assert(position>last&&article.indexOf(name,position+name.length)===-1,id+': unique heading in order');
 last=position;
}
const lesson=article.slice(last).split('</section>')[0];
for(const phrase of ['节点亲和性与 B 冲突','第 31 轮的报告请求又失败','第 67、68、69 轮',
 '/labs/'+pack+'.zip','/labs/'+pack+'/validation.json',ci.run])assert(lesson.includes(phrase),phrase);
const concept='/module/sre/?concept=recovery-evidence#map-concept-recovery-evidence';
const conceptPage=page('module/sre');
assert(conceptPage.includes('?fromConcept=sre.recovery-evidence#'+ids[0]));
assert(conceptPage.includes('?fromConcept=sre.recovery-evidence#'+anchor));
assert(conceptPage.includes('href="/labs/?track=cloud&amp;fromConcept=sre.recovery-evidence#lab-'+labId+'"'));
const role=page('roadmap/cloud-sre');
assert(role.includes('?goal=cloud-sre#'+ids[0])&&role.includes('?goal=cloud-sre#'+anchor));
const labPage=page('labs');
const catalog=labPage.split('id="lab-'+labId+'"')[1]?.split('<li class="lab-learning-unit"')[0];
assert(catalog?.includes('/article/resilience/#'+anchor)&&catalog.includes(concept));
assert(catalog.includes('href="labs/'+pack+'/validation.json"')&&catalog.includes('href="labs/'+pack+'.zip"'));
console.log('PASS: native worker loss and local PV scheduling, exact R3 readbacks, five rejected observations, archive and study destinations.');
