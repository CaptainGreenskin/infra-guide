"""Verify bounded local experiments and real promtool, then publish matching source/evidence."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import zipfile

parser=argparse.ArgumentParser()
parser.add_argument('--promtool',default=shutil.which('promtool'))
args=parser.parse_args()
if not args.promtool:parser.error('provide official promtool using --promtool')
root=Path(__file__).resolve().parents[1]
folder=root/'dist/labs/cloud-operations'
records={}
for name in ['authorization_http_lab.py','capacity_lab.py','telemetry_lab.py','promtool_lab.py']:
    command=[sys.executable,str(folder/name)]
    if name=='promtool_lab.py':command.append(str(Path(args.promtool).resolve()))
    result=subprocess.run(command,text=True,capture_output=True,timeout=120,check=True)
    record=json.loads(result.stdout)
    assert record['status']=='passed',name
    records[name]=record
files={file.name:file.read_text() for file in sorted(folder.iterdir())
       if file.is_file() and file.suffix in ('.py','.yaml','.md')}
record={'status':'passed','verified_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'python':platform.python_version(),'platform':platform.platform(),'programs':records,
        'source_sha256':{name:hashlib.sha256(value.encode()).hexdigest() for name,value in files.items()},
        'not_executed':['Production OIDC/JWT/cloud IAM','Kubernetes admission/RBAC/network isolation',
                        'Cloud autoscaling or production load/cost','Prometheus scraping/Alertmanager notification',
                        'Real cross-region recovery or oncall response'],
        'configuration_review_only':['rbac-readonly.yaml']}
(folder/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
(root/'dist/cloud-ops-lab-files.js').write_text('const cloudOpsLabFiles='+json.dumps(files,ensure_ascii=False)+';\nconst cloudOpsLabValidation='+json.dumps(record,ensure_ascii=False)+';\n')
with zipfile.ZipFile(root/'dist/labs/cloud-operations.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(folder.iterdir()):
        if file.is_file():archive.write(file,'cloud-operations/'+file.name)
print('PASS: 4 source-matched local programs including real promtool; evidence and downloadable ZIP generated.')
