/* Verify the exact Linux record, negative controls and reading entry points. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const folder='dist/labs/sandbox-docker-lifecycle',python=process.env.INFRA_LAB_PYTHON||'python3';
const read=path=>fs.readFileSync(path);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const recordBytes=read(folder+'/validation.json'),record=JSON.parse(recordBytes),ci=JSON.parse(read(folder+'/ci-record.json'));
assert.equal(ci.validation_sha256,digest(recordBytes));
assert.equal(ci.run,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/43112666631');
assert.equal(ci.head_sha,'df644dbafd37a655466d283a62d6e47faebd7cdc');
assert.equal(ci.workflow,'.github/workflows/sandbox-docker-lifecycle-evidence.yml');
assert.equal(ci.artifact.name,'sandbox-docker-lifecycle');
assert.match(ci.artifact.digest,/^sha256:[a-f0-9]{64}$/);
assert.deepEqual(ci.source_sha256,record.source_sha256);
for(const file of ['docker_lifecycle.py','fixture.py'])assert.equal(digest(read(folder+'/'+file)),record.source_sha256[file]);
execFileSync(python,['-B',folder+'/docker_lifecycle.py','--check-record',folder+'/validation.json']);
execFileSync(python,['-B','-c',`
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import runpy

folder = Path('${folder}')
verify = runpy.run_path(str(folder / 'docker_lifecycle.py'))['verify']
record = json.loads((folder / 'validation.json').read_bytes())
mutations = [
    (('reuse', 'after', 'started_at'), 'different'),
    (('reuse', 'without_reset', 'worker', 'accepted'), True),
    (('reuse', 'report_after_reset'), record['reuse']['first']['independent_report']),
    (('concurrent', 'a_after', 'populated'), 1),
    (('concurrent', 'a_after', 'members_retired'), [True, False]),
    (('concurrent', 'b_after', 'members', 1, 'start_ticks'), -1),
    (('concurrent', 'b_report', 'amount'), 74),
    (('removed_ids',), []),
]
for keys, value in mutations:
    changed = deepcopy(record)
    row = changed
    for key in keys[:-1]:
        row = row[key]
    row[keys[-1]] = value
    try:
        verify(changed)
    except ValueError:
        continue
    raise AssertionError(f'accepted altered observation {keys}')
with ZipFile(folder.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == sorted(str(Path(folder.name) / x.name) for x in folder.iterdir())
    for path in folder.iterdir():
        assert archive.read(f'{folder.name}/{path.name}') == path.read_bytes()
`]);
const article=read('dist/article/agent-sandbox/index.html').toString();
const anchor='native-sandbox-docker-lifecycle';
const section=article.split('id="'+anchor+'"')[1]?.split('</section>')[0];
assert(section?.includes('三个都已移除')&&section.includes('populated=0')&&section.includes(ci.run));
assert(section.includes('docker_lifecycle.py --output my-record.json')&&section.includes('生产环境还需测'));
for(const value of [record.reuse.cold_create_to_ready_ms,record.reuse.cold_create_to_first_readback_ms,
                    record.reuse.second.request_to_readback_ms])assert(section.includes((value/1000).toFixed(2)+' 秒'));
assert(article.indexOf('id="native-sandbox-process-group"')<article.indexOf('id="'+anchor+'"'));
for(const [file,href] of [
 ['module/agent','?fromConcept=agent.ag-sandbox#'+anchor],
 ['interview/companies','/article/agent-sandbox/#'+anchor],
 ['roadmap/agent-platform','?goal=agent-platform#'+anchor],
 ['labs','id="lab-agent-sandbox-docker-lifecycle"']
])assert(read('dist/'+file+'/index.html').toString().includes(href),href);
console.log('PASS: real Linux Docker lifecycle, stable B and recovered report, eight rejected records, exact ZIP and reading destinations.');
