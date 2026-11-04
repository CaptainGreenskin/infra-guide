"""Execute independent original labs, regenerate exact code/output/download files."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
LAB=ROOT/'dist/labs/storage-quant-context'
parser=argparse.ArgumentParser()
parser.add_argument('--torch-python',required=True)
args=parser.parse_args()
files={}
report={'python':platform.python_version(),'sqlite':sqlite3.sqlite_version,'programs':{}}
for name in ['wal_backup.py','volume_writer.py','int4_groups.py','context_state.py','int8_runtime.py']:
    executable=args.torch_python if name=='int8_runtime.py' else sys.executable
    source=(LAB/name).read_bytes()
    run=subprocess.run([executable,'-B',str(LAB/name)],capture_output=True,text=True,timeout=60)
    if run.returncode:
        raise RuntimeError(name+' failed: '+run.stderr)
    result=json.loads(run.stdout)
    version=subprocess.run([executable,'-c','import platform; print(platform.python_version())'],
                            capture_output=True,text=True,check=True).stdout.strip()
    report['programs'][name]={'sha256':hashlib.sha256(source).hexdigest(),'python':version,
                             'exit_code':0,'result':result}
    files[name]=source.decode()
# Downloadable Kubernetes inputs embed the exact locally checked writer.
# They are JSON manifests accepted by kubectl, not evidence of a cluster run.
namespace='infra-guide-storage'
manifests={
 'storage-namespace.json':{'apiVersion':'v1','kind':'Namespace','metadata':{'name':namespace}},
 'storage-claim.json':{'apiVersion':'v1','kind':'PersistentVolumeClaim',
   'metadata':{'name':'app-data','namespace':namespace},
   'spec':{'storageClassName':'your-csi-class','accessModes':['ReadWriteOnce'],
           'resources':{'requests':{'storage':'1Gi'}}}}
}
for number in (1,2):
    manifests['storage-job-'+str(number)+'.json']={
      'apiVersion':'batch/v1','kind':'Job',
      'metadata':{'name':'storage-writer-'+str(number),'namespace':namespace},
      'spec':{'backoffLimit':1,'template':{'spec':{
        'restartPolicy':'Never',
        'containers':[{'name':'writer','image':'python:3.12-slim',
           'command':['python','-c',files['volume_writer.py']],
           'args':['--db','/data/counter.sqlite','--op','write-'+str(number)],
           'resources':{'requests':{'cpu':'100m','memory':'64Mi'},'limits':{'memory':'128Mi'}},
           'volumeMounts':[{'name':'data','mountPath':'/data'}]}],
        'volumes':[{'name':'data','persistentVolumeClaim':{'claimName':'app-data'}}]}}}}
for name,manifest in manifests.items():
    (LAB/name).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
report['cluster_manifests']={'status':'generated_not_cluster_executed',
    'writer_sha256':report['programs']['volume_writer.py']['sha256'],
    'files':list(manifests)}
(LAB/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
(ROOT/'dist/storage-quant-context-files.js').write_text(
    'const storageQuantContextFiles='+json.dumps(files,ensure_ascii=False)+';\n'+
    'const storageQuantContextValidation='+json.dumps(report,ensure_ascii=False)+';\n')
with zipfile.ZipFile(ROOT/'dist/labs/storage-quant-context.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(LAB.iterdir()):
        if path.is_file(): archive.write(path,'storage-quant-context/'+path.name)
print('PASS: 4 standard-library programs + actual CPU INT8; exact writer in 4 generated cluster manifests, source, output and ZIP.')
