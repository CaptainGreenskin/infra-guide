"""Record both stdlib interpreters and bind observations to canonical source."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'dist/labs/sql-paths-snapshots'
parser = argparse.ArgumentParser()
parser.add_argument('--python', required=True, help='Existing second Python, with SQLite error attributes')
args = parser.parse_args()
programs = {}
for name in ['query_paths.py','snapshot_retry.py']:
    runs=[]
    for python in ['python3', args.python]:
        process=subprocess.run([python, str(LAB/name)], check=True, capture_output=True,
                               text=True, timeout=20)
        result=json.loads(process.stdout)
        assert result['status']=='passed'
        runs.append(result)
    programs[name]={'status':'passed', 'source_sha256':hashlib.sha256((LAB/name).read_bytes()).hexdigest(), 'runs':runs}
record={'status':'passed', 'executed_at_utc':datetime.now(timezone.utc).isoformat(),
        'programs':programs,
        'scope':'Actual local SQLite only: separate in-memory query fixtures and two interleaved WAL connections. No timing, physical IO, MySQL, cloud database or concurrent thread claim.'}
(LAB/'validation.json').write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps({name:[{'python':r['python'],'sqlite':r['sqlite']} for r in row['runs']]
                  for name,row in programs.items()}))
