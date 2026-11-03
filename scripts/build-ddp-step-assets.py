"""Record a real CPU/Gloo experiment, then package matching source and evidence."""
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
LAB = ROOT/'dist/labs/ddp-step'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--verify', action='store_true')
args = parser.parse_args()
sha = hashlib.sha256((LAB/'ddp_step.py').read_bytes()).hexdigest()
if args.verify:
    with tempfile.TemporaryDirectory(prefix='ddp-step-check-') as folder:
        output = Path(folder)/'report.json'
        subprocess.run([sys.executable, str(LAB/'ddp_step.py'), '--output', str(output)],
                       check=True, capture_output=True, text=True, timeout=60)
        report = json.loads(output.read_text())
    assert report['status'] == 'passed'
    record = {'date': datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec='seconds'),
              'source_sha256': sha, 'report': report}
    (LAB/'validation.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n')
else:
    record = json.loads((LAB/'validation.json').read_text())
    assert record['source_sha256'] == sha, 'Source changed; rerun --verify using the pinned PyTorch environment.'
files = {name: (LAB/name).read_text() for name in ['ddp_step.py', 'README.md', 'validation.json']}
(ROOT/'dist/ddp-step-files.js').write_text('const ddpStepFiles='+json.dumps(files, ensure_ascii=False)+';\nconst ddpStepValidation='+json.dumps(record, ensure_ascii=False)+';\n')
with zipfile.ZipFile(ROOT/'dist/labs/ddp-one-step.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(LAB/name, name)
print('PASS: 2 CPU/Gloo processes, 4 cases, serial references and matching source/evidence package.')
