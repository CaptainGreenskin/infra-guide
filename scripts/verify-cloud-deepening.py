"""Run the source-matched local labs, then package their code and evidence."""
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
parser.add_argument('--terraform',default=shutil.which('terraform'))
args=parser.parse_args()
if not args.terraform:
    parser.error('provide the official Terraform CLI using --terraform')
root=Path(__file__).resolve().parents[1]
folder=root/'dist/labs/cloud-deepening'
records={}
for name in ['recovery_lab.py','event_batch_lab.py','terraform_lab.py','gitops_model.py']:
    command=[sys.executable,str(folder/name)]
    if name=='terraform_lab.py':command.append(str(Path(args.terraform).resolve()))
    result=subprocess.run(command,text=True,capture_output=True,check=True,timeout=120)
    record=json.loads(result.stdout)
    assert record['status']=='passed',name
    records[name]=record
files={file.name:file.read_text() for file in sorted(folder.iterdir())
       if file.is_file() and file.suffix in ('.py','.tf','.yaml','.md')}
record={'status':'passed','verified_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'python':platform.python_version(),'platform':platform.platform(),
        'programs':records,'source_sha256':{name:hashlib.sha256(value.encode()).hexdigest() for name,value in files.items()},
        'not_executed':['MySQL/PostgreSQL engine recovery','AWS Lambda/SQS or other cloud functions',
                        'Terraform cloud providers or remote backend locking','Argo CD/Flux/Kubernetes cluster'],
        'configuration_review_only':['mysql-pitr.md','argocd-application.yaml']}
(folder/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
(root/'dist/cloud-deep-lab-files.js').write_text('const cloudDeepLabFiles='+json.dumps(files,ensure_ascii=False)+';\nconst cloudDeepLabValidation='+json.dumps(record,ensure_ascii=False)+';\n')
with zipfile.ZipFile(root/'dist/labs/cloud-deepening.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(folder.iterdir()):
        if file.is_file():archive.write(file,'cloud-deepening/'+file.name)
print('PASS: 4 source-matched local programs, including real Terraform CLI; evidence and downloadable ZIP generated.')
