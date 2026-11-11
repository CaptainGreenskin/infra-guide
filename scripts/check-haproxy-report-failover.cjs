/* Validate the original Linux HAProxy observations and the exact source/reading paths. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const folder='dist/labs/haproxy-report-failover',python=process.env.INFRA_LAB_PYTHON||'python3';
const read=file=>fs.readFileSync(file);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const raw=read(folder+'/validation.json'),record=JSON.parse(raw),ci=JSON.parse(read(folder+'/ci-record.json'));
assert.equal(ci.validation_sha256,digest(raw));
assert.equal(ci.source_sha256,digest(read(folder+'/failover_lab.py')));
assert.equal(ci.source_sha256,record.source_sha256);
assert.equal(ci.run,'https://github.com/CaptainGreenskin/infra-guide/actions/runs/43113784181');
assert.equal(ci.head_sha,'73cd34546b9946c91128a10e7dcf53547ba077eb');
assert.equal(ci.workflow,'.github/workflows/haproxy-report-failover-evidence.yml');
assert.equal(ci.haproxy_archive_sha256,'760ef35fafc1e05844e73ad07e138e9e96fddbf5de02f606249c027f754827da');
assert.equal(ci.artifact.name,'haproxy-report-failover');
assert.match(ci.artifact.digest,/^sha256:[a-f0-9]{64}$/);
execFileSync(python,['-B',folder+'/verify_record.py',folder+'/validation.json','--reference',
 'dist/labs/recovery-artifacts-retrieval/validation.json']);
execFileSync(python,['-B','-c',`
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import runpy

folder = Path('${folder}')
checks = runpy.run_path(str(folder / 'verify_record.py'))
verify = checks['validate_case']
record = json.loads((folder / 'validation.json').read_bytes())
ordinary, material = (record['cases'][key] for key in ('ordinary', 'material'))
cases = [
    ('ordinary', ('reads', ordinary['incomplete_trial'] - 1, 'attachment', 'status'), 200),
    ('material', ('reads', material['incomplete_trial'] - 1, 'report', 'backend'), 'backend-b'),
    ('material', ('reads', material['stable_trials'][-1] - 1, 'attachment', 'body'), 'wrong attachment'),
    ('ordinary', ('elapsed_ms_from_fault',), -1),
    ('material', ('config',), ordinary['config']),
]
for mode, keys, value in cases:
    modified = deepcopy(record['cases'][mode])
    row = modified
    for key in keys[:-1]:
        row = row[key]
    row[keys[-1]] = value
    try:
        checks['normalized_config'](modified)
        verify(mode, modified)
    except (AssertionError, ValueError):
        continue
    raise AssertionError(f'accepted altered observation {keys}')
with ZipFile(folder.with_suffix('.zip')) as archive:
    assert sorted(archive.namelist()) == sorted(str(Path(folder.name) / x.name) for x in folder.iterdir())
    for path in folder.iterdir():
        assert archive.read(f'{folder.name}/{path.name}') == path.read_bytes()
`]);
const article=read('dist/article/resilience/index.html').toString();
const anchor='native-haproxy-report-failover';
const section=article.split('id="'+anchor+'"')[1]?.split('</section>')[0];
assert(section?.includes('报告 200，附件 404')&&section.includes('入口两次返回 503')&&section.includes(ci.run));
assert(section.includes('verify_record.py my-run.json')&&section.includes('连续三轮'));
assert(article.indexOf('id="recovery-report-readback-gate"')<article.indexOf('id="'+anchor+'"'));
for(const [file,href] of [
 ['module/sre','?fromConcept=sre.recovery-evidence#'+anchor],
 ['interview/companies','/article/resilience/#'+anchor],
 ['roadmap/cloud-sre','?goal=cloud-sre#'+anchor],
 ['labs','id="lab-cloud-haproxy-report-failover"']
])assert(read('dist/'+file+'/index.html').toString().includes(href),href);
console.log('PASS: native HAProxy readback and exact R3 bytes, five rejected observations, archive and study destinations.');
