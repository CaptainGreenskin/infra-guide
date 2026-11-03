"""Run with --verify after changing lab programs; otherwise check evidence hashes and package."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'dist/labs/systems'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
programs = ['infra_lab.py', 'agent_lab.py']
hashes = {name: hashlib.sha256((LAB/name).read_bytes()).hexdigest() for name in programs}
record = LAB / 'validation.json'
if args.verify:
    reports = {}
    with tempfile.TemporaryDirectory(prefix='infra-evidence-') as temporary:
        for name in programs:
            output = Path(temporary)/(name+'.json')
            subprocess.run([sys.executable, str(LAB/name), '--output', str(output)], check=True, capture_output=True, text=True, timeout=30)
            reports[name] = json.loads(output.read_text())
    assert all(v['status']=='passed' for v in reports['infra_lab.py']['results'].values())
    assert reports['agent_lab.py']['status']=='passed'
    validation = {
        'date': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds'),
        'source_sha256': hashes,
        'core': reports['infra_lab.py'],
        'agent': reports['agent_lab.py'],
        'not_verified': ['Kubernetes cluster deployment', 'real GPU inference', 'real object storage', 'Kairo implementation', 'multiple workers and fencing', 'power-loss durability']
    }
    record.write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n')
else:
    validation = json.loads(record.read_text())
    assert validation['source_sha256']==hashes, 'Lab code changed: rerun with --verify before publishing'
names = ['infra_lab.py','agent_lab.py','probe_server.py','deployment.yaml','README.md','validation.json']
files = {name:(LAB/name).read_text() for name in names}
(ROOT/'dist/system-lab-files.js').write_text('const systemLabFiles='+json.dumps(files,ensure_ascii=False)+';\nconst systemLabValidation='+json.dumps(validation,ensure_ascii=False)+';\n')
with zipfile.ZipFile(ROOT/'dist/labs/infra-systems.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        archive.write(LAB/name,name)
print('System labs: verified evidence hashes, embedded '+str(len(names))+' files, packaged infra-systems.zip.')
