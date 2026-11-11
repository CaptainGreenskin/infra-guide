/* Preserve the executed source, native run provenance, archive and reading path. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const folder='dist/labs/kubernetes-config',source=folder+'/config_projection_lab.py',validation=folder+'/validation.json';
const provenance=JSON.parse(fs.readFileSync(folder+'/ci-record.json','utf8'));
const sha=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
assert.equal(provenance.url,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/42560029974');
assert.equal(provenance.headSha,'33b243ca06262da7c148b4a496f5215d803f78b3');
assert.equal(provenance.conclusion,'success');
assert.equal(provenance.source_sha256,sha(source));
assert.equal(provenance.record_sha256,sha(validation));
cp.execFileSync('python3',['-B',source,'--check-record',validation]);
cp.execFileSync('python3',['-B','-c',`
from pathlib import Path
from zipfile import ZipFile
folder = Path("dist/labs/kubernetes-config")
with ZipFile(folder.with_suffix(".zip")) as archive:
    names = {"README.md", "ci-record.json", "config_projection_lab.py", "validation.json"}
    assert set(archive.namelist()) == {"kubernetes-config/" + name for name in names}
    for name in names:
        assert archive.read("kubernetes-config/" + name) == (folder / name).read_bytes()
`]);
const html=fs.readFileSync('dist/article/config-secrets/index.html','utf8');
for(const entry of ['id="native-config-projection"','data-toc="native-config-projection"',
 'href="/article/config-secrets/#native-config-projection"','diagrams/kubernetes-config-projection.svg',
 'labs/kubernetes-config.zip','labs/kubernetes-config/validation.json',provenance.url])assert(html.includes(entry),entry);
const delivery=JSON.parse(fs.readFileSync('dist/labs/delivery-systems/validation.json','utf8'));
const {self_heal_on:initial,v2_synced_but_old_business:old,v3_new_pod:fresh}=delivery.native.gitops.records;
const env=delivery.git_history.config_only_v2['deployment.json'].object.spec.template.spec.containers[0].env;
assert.deepEqual(env.find(item=>item.name==='BUSINESS_VERSION').valueFrom.configMapKeyRef,{name:'guide-version',key:'version'});
assert.equal(old.http.pod,old.pod.name);
assert.equal(old.pod.uid,initial.pod.uid);
assert.notEqual(fresh.pod.uid,old.pod.uid);
assert.equal(fresh.http.pod,fresh.pod.name);
const projected=JSON.parse(fs.readFileSync(validation,'utf8'));
assert.equal(projected.before.pod.uid,projected.after_projection.pod.uid);
assert.equal(projected.after_projection.pod.restart_count,0);
const probe=projected.after_projection.probe;
assert.equal(old.desired_config,projected.source_after_patch.version);
assert.equal(old.http.version,probe.startup_env);
assert.deepEqual([probe.projected,probe.held_fd,probe.sub_path],[old.desired_config,old.http.version,old.http.version]);
const bridge='gitops-config-input-path';
const gitops=fs.readFileSync('dist/article/gitops-reconciliation/index.html','utf8').split('id="'+bridge+'"')[1]?.split('</section>')[0];
assert(gitops?.includes('/article/config-secrets/#native-config-projection')&&gitops.includes('/labs/delivery-systems/validation.json'));
assert(gitops.includes('值，这时已经是 '+old.desired_config)&&gitops.includes('<code>http.version</code> 仍为 '+old.http.version));
assert(gitops.includes('普通投射路径读到 '+probe.projected)&&gitops.includes('启动环境仍读到 '+probe.startup_env));
assert(html.split('id="native-config-projection"')[1]?.split('id="subsection-7-5pl5op"')[0].includes('/article/gitops-reconciliation/#'+bridge));
console.log('PASS: native ConfigMap revision and four reads, exact GitOps service link, source provenance and archive.');
