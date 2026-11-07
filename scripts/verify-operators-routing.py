"""Run three actual CPU experiments and bind sources, trace and results into the teaching bundle."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile
ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'dist/labs/operators-routing'

def main():
    p=argparse.ArgumentParser();p.add_argument('--torch-python',required=True);args=p.parse_args()
    results={}
    with tempfile.TemporaryDirectory(prefix='infra-operator-record-') as tmp:
        for name,python,extra in [('operator_lab.py',sys.executable,[]),('moe_routing.py',sys.executable,[]),
                                  ('cpu_profile.py',args.torch_python,['--trace',str(FOLDER/'cpu-trace.json')])]:
            report=Path(tmp)/(name+'.json')
            subprocess.run([python,'-B',str(FOLDER/name),'--report',str(report)]+extra,check=True,stdout=subprocess.DEVNULL,timeout=90)
            results[name]=json.loads(report.read_text());assert results[name]['status']=='passed'
    names=['cpu_ops.c','operator_lab.py','cpu_profile.py','moe_routing.py','README.md']
    files={name:(FOLDER/name).read_text() for name in names}
    hashes={name:hashlib.sha256(text.encode()).hexdigest() for name,text in files.items()}
    for name in ['operator_lab.py','moe_routing.py','cpu_profile.py']:
        source=results[name]['source_sha256'];assert (source[name] if isinstance(source,dict) else source)==hashes[name]
    assert results['operator_lab.py']['source_sha256']['cpu_ops.c']==hashes['cpu_ops.c']
    assert results['cpu_profile.py']['trace_sha256']==hashlib.sha256((FOLDER/'cpu-trace.json').read_bytes()).hexdigest()
    record={'status':'passed','verified_at':'2026-11-07','source_sha256':hashes,'programs':results,
            'scope':'Actual local CPU C11, PyTorch CPU profiling and two local process MoE reference. CUDA, GPU kernels, Nsight and network collectives still require target hardware.'}
    (FOLDER/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'dist/operators-routing-data.js').write_text('const operatorRoutingFiles='+json.dumps(files,ensure_ascii=False)+';\nconst operatorRoutingValidation='+json.dumps(record,ensure_ascii=False)+';\n')
    with zipfile.ZipFile(FOLDER.with_suffix('.zip'),'w',compression=zipfile.ZIP_DEFLATED) as z:
        for name in names+['validation.json','cpu-trace.json']:
            info=zipfile.ZipInfo(name,(2026,11,7,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,(FOLDER/name).read_bytes())
    print('Bound actual C kernels, CPU trace and local process routing to full sources and ZIP.')

if __name__=='__main__':main()
