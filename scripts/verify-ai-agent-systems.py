"""Execute the published source and bundle only its exact observed state."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
lab = root/'dist/labs/ai-agent-systems'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--torch-python', required=True, type=Path)
args = parser.parse_args()
programs = {}
for name in ['token_ddp.py', 'gqa_serving.py', 'worker_fencing.py', 'agent_evaluation.py']:
    # Preserve the venv executable path; resolving its symlink drops the venv.
    interpreter = str(args.torch_python.absolute()) if name == 'token_ddp.py' else sys.executable
    completed = subprocess.run([interpreter, str(lab/name)], capture_output=True, text=True, timeout=100)
    if completed.returncode:
        raise RuntimeError(name+'\n'+completed.stdout+'\n'+completed.stderr)
    result = json.loads(completed.stdout)
    programs[name] = {'status': 'passed', 'result': result}
    if name == 'token_ddp.py':
        version = subprocess.check_output([interpreter, '-c', 'import platform;print(platform.python_version())'], text=True).strip()
        programs[name]['python'] = version
        programs[name]['optional_numpy_warning'] = 'Failed to initialize NumPy' in completed.stderr
report = {'status': 'passed', 'verified_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'standard_library_python': platform.python_version(), 'platform': platform.platform(),
          'programs': programs,
          'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                            for p in sorted(lab.iterdir()) if p.suffix in ('.py', '.md')},
          'not_executed': ['GPU/CUDA/NCCL/FSDP/AMP and physical multi-node training',
                           'real vLLM load, real LLM generation and embedding retrieval',
                           'remote fencing, distributed consensus and wall-clock lease expiry',
                           'malicious-code sandbox isolation, Kairo integration and production task evaluation']}
(lab/'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
source = {p.name:p.read_text() for p in sorted(lab.iterdir()) if p.suffix in ('.py', '.md')}
(root/'dist/ai-agent-lab-files.js').write_text('const aiAgentLabFiles='+json.dumps(source, ensure_ascii=False)+';\nconst aiAgentValidation='+json.dumps(report, ensure_ascii=False)+';\n')
with zipfile.ZipFile(root/'dist/labs/ai-agent-systems.zip', 'w', zipfile.ZIP_DEFLATED) as bundle:
    for p in sorted(lab.iterdir()):
        if p.suffix in ('.py', '.md', '.json'):
            bundle.write(p, 'ai-agent-systems/'+p.name)
print('PASS: four published programs, actual CPU/Gloo and local process effects, exact source hashes and ZIP.')
