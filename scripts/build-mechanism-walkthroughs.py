"""Run the owned examples, bind exact source bytes and build their downloadable bundle."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT/'dist/labs/mechanism-walkthroughs'


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--torch-python', required=True)
    args=p.parse_args()
    # Keep the venv executable path; resolving its symlink would lose its environment.
    torch_python=str(Path(args.torch_python).absolute())
    files=['route_walk.py','reconcile_walk.py','attention_trace.py','decoder_trace.py','tiny_decoder.py','workflow_history.py']
    result={}
    for name in ['route_walk.py','reconcile_walk.py','attention_trace.py','decoder_trace.py','workflow_history.py']:
        interpreter=torch_python if name in ['attention_trace.py','decoder_trace.py'] else sys.executable
        run=subprocess.run([interpreter,'-B',str(LAB/name)],capture_output=True,text=True,timeout=30)
        if run.returncode:
            raise RuntimeError(name+': '+run.stderr)
        result[name]=json.loads(run.stdout)
    environment=json.loads(subprocess.check_output([torch_python,'-c','import json,sys,torch; print(json.dumps({"python":sys.version.split()[0],"torch":str(torch.__version__),"device":"cpu"}))'],text=True))
    record={'date':'2026-11-05','stdlib_python':platform.python_version(),'torch_environment':environment,
            'source_sha256':{name:hashlib.sha256((LAB/name).read_bytes()).hexdigest() for name in files},
            'results':result,
            'scope':{'route_and_reconcile':'declared educational models; no VPC or Kubernetes API calls',
                     'attention_and_decoder':'actual PyTorch CPU float64 operations',
                     'workflow':'actual SQLite commits and subprocess exits; read-only fixture activity',
                     'real_gpu':False,'temporal_sdk':False,'kairo':False}}
    (LAB/'validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    source={name:(LAB/name).read_text(encoding='utf-8') for name in files}
    (ROOT/'dist/mechanism-walkthroughs-data.js').write_text('const mechanismWalkthroughFiles='+json.dumps(source,ensure_ascii=False)+';\nconst mechanismWalkthroughValidation='+json.dumps(record,ensure_ascii=False)+';\n',encoding='utf-8')
    with zipfile.ZipFile(ROOT/'dist/labs/mechanism-walkthroughs.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in files+['README.md','validation.json']:
            info=zipfile.ZipInfo('mechanism-walkthroughs/'+name,(2026,11,5,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o644<<16
            archive.writestr(info,(LAB/name).read_bytes())
    print('Executed 5 examples, bound 6 sources and created mechanism-walkthroughs.zip.')


if __name__=='__main__':
    main()
