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
console.log('PASS: native ConfigMap API revision, same Pod/four reads, changed inode, new Pod and cleanup; CI provenance, ZIP and exact chapter target.');
