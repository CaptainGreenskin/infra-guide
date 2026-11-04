"""Capture actual local HTTP runs in two already available Python environments."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'dist/labs/streamed-tool-calls'
parser=argparse.ArgumentParser()
parser.add_argument('--python',required=True)
args=parser.parse_args()
source=LAB/'streamed_tool_calls.py'
runs=[]
for python in ['python3',args.python]:
    result=subprocess.run([python,str(source)],check=True,capture_output=True,
                          text=True,timeout=30)
    runs.append(json.loads(result.stdout))
assert runs[0]['fixture_sha256']==runs[1]['fixture_sha256']
assert runs[0]['results']==runs[1]['results']
record={'status':'passed','executed_at_utc':datetime.now(timezone.utc).isoformat(),
        'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'runs':runs,
        'scope':'Real loopback chunked HTTP with13 declared event fixtures, local read callback and in-process observations. No model, remote tool, persistent workflow, reconnect or Kairo integration.'}
(LAB/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'passed','python':[r['python'] for r in runs],
                  'cases':len(runs[0]['results']),'normal_bytes':runs[0]['results']['normal']['bytes_read']}))
