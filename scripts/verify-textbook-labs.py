"""Run the published textbook examples and retain source-matched observations."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--torch-python', required=True, type=Path)
args = parser.parse_args()
scripts = [
    'cloud-foundations/virtual-memory-oom.py',
    'cloud-foundations/concurrency-pools.py',
    'cloud-foundations/database-index-locks.py',
    'cloud-foundations/cache-consistency.py',
    'cloud-foundations/roofline-model.py',
    'agent-foundations/durable-workflows.py',
    'agent-foundations/agent-retrieval.py',
    'agent-foundations/agent-observability.py',
    'agent-foundations/agent-sandbox.py',
    'model-foundations/io_attention.py',
    'model-foundations/tokenization.py',
    'model-foundations/rope.py',
    'model-foundations/tiny_decoder.py',
]
records = {}
for name in scripts:
    source = ROOT / 'dist/labs' / name
    interpreter = str(args.torch_python.absolute()) if name.endswith('tiny_decoder.py') else sys.executable
    result = subprocess.run([interpreter, str(source)], capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError(name+'\n'+result.stderr)
    if name.endswith('roofline-model.py'):
        expected = ['1 33554432 33570816 0.9995 0.112 16.785',
                    '256 8589934592 37748736 227.5556 28.633 18.874']
        if result.stdout.strip().splitlines() != expected:
            raise AssertionError(result.stdout)
    records[name] = {
        'status': 'passed',
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'stdout': result.stdout.strip(),
    }
report = {
    'status': 'passed',
    'executed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    'environment': platform.platform(),
    'standard_library_python': platform.python_version(),
    'programs': records,
    'not_verified': ['GPU/CUDA/NCCL performance', 'Linux memory pressure',
                     'cloud database/cache services', 'real sandbox isolation',
                     'Kubernetes cluster', 'Kairo implementation'],
}
output = ROOT / 'dist/labs/textbooks/validation.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print('PASS: '+str(len(records))+' published examples, source hashes and execution results.')

with zipfile.ZipFile(ROOT/'dist/labs/textbook-examples.zip','w',zipfile.ZIP_DEFLATED) as bundle:
    for name in scripts:
        bundle.write(ROOT/'dist/labs'/name,name)
    bundle.write(output,'validation.json')
    bundle.write(output.parent/'README.txt','README.txt')
print('Packaged textbook-examples.zip from the verified source.')
