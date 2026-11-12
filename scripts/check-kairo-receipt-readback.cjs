/* Check the public observation shape, arithmetic, negative cases and reading paths. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const folder='dist/labs/kairo-receipt-readback',python=process.env.INFRA_LAB_PYTHON||'python3';
const read=file=>fs.readFileSync(file);
const record=JSON.parse(read(folder+'/validation.json'));
assert.deepEqual(Object.keys(record).sort(),
 ['boundary','fixture','observations','phases','schema','scope','status','verification_source_sha256']);
assert.deepEqual(Object.keys(record.phases).sort(),['after_commit_exit','matched','prepare','version_mismatch']);
assert.equal(record.verification_source_sha256,
 crypto.createHash('sha256').update(read(folder+'/verify_receipt_readback.py')).digest('hex'));
execFileSync(python,['-B',folder+'/verify_receipt_readback.py',folder+'/validation.json']);
execFileSync(python,['-B','-c',`
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile
import json
import runpy

folder = Path('${folder}')
verify = runpy.run_path(str(folder / 'verify_receipt_readback.py'))['verify']
record = json.loads((folder / 'validation.json').read_bytes())
mutations = [
    (('boundary', 'public_provenance_verified'), True),
    (('phases', 'after_commit_exit', 'local_receipt_saved'), True),
    (('phases', 'after_commit_exit', 'receiver', 'reports', 0, 'amount'), 84),
    (('phases', 'matched', 'lookup_same_original_operation'), False),
    (('phases', 'matched', 'write_handler_entries'), 1),
    (('phases', 'version_mismatch', 'business_result'), 'RECEIPT_CONFIRMED'),
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
    expected = ['README.md', 'validation.json', 'verify_receipt_readback.py']
    assert sorted(x.name for x in folder.iterdir()) == expected
    assert sorted(archive.namelist()) == sorted(f'{folder.name}/{name}' for name in expected)
    for name in expected:
        assert archive.read(f'{folder.name}/{name}') == (folder/name).read_bytes()
`]);
const article=read('dist/article/kairo-practice/index.html').toString();
const anchor='kairo-native-commit-readback';
const section=article.split('id="'+anchor+'"')[1]?.split('</section>')[0];
assert(section?.includes('RECEIPT_CONFIRMED')&&section.includes('NEEDS_VERIFICATION'));
assert(section.includes('公开包可核对脱敏结果')&&section.includes('23 日报只读契约仍待各自验收'));
assert(article.indexOf('id="kairo-resume-evidence"')<article.indexOf('id="'+anchor+'"'));
assert(section.includes('10+27+5=42')&&section.includes('5+7+11=23')&&
 section.includes('href="/article/kairo-practice/#native-agent-task-reconnect"'));
for(const [file,href] of [
 ['module/agent','?fromConcept=agent.ag-evaluation#'+anchor],
 ['module/agent','?fromConcept=agent.ag-recovery#'+anchor],
 ['roadmap/agent-platform','?goal=agent-platform#'+anchor],
 ['labs','id="lab-agent-kairo-receipt-readback"']
])assert(read('dist/'+file+'/index.html').toString().includes(href),href);
console.log('PASS: normalized local Kairo receipt observations, four independent readbacks, six rejected records and exact public archive.');
