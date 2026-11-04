"""Run the real Prometheus parser/rule evaluator against fixed teaching fixtures."""
import json
from pathlib import Path
import subprocess
import sys


def run(binary):
    executable=str(Path(binary).resolve()) if '/' in binary else binary
    folder=Path(__file__).resolve().parent
    results=[]
    for arguments in [('check','rules','slo.rules.yaml'),('test','rules','slo.test.yaml')]:
        result=subprocess.run([executable,*arguments],cwd=folder,text=True,capture_output=True,timeout=60)
        if result.returncode!=0:
            raise RuntimeError(result.stdout+'\n'+result.stderr)
        results.append({'command':'promtool '+' '.join(arguments),'exit_code':result.returncode})
    version=subprocess.run([executable,'--version'],text=True,capture_output=True,check=True)
    return {'status':'passed','version':(version.stdout+version.stderr).splitlines()[0],
            'commands':results,'fixture_groups':7,
            'checks':['weighted request ratio .91','hot 1h/5m alert','short-window recovery',
                      'merged classic p99 .99 versus wrong mean .545','no error series with positive traffic',
                      'zero traffic not 100%','absent telemetry separate'],
            'scope':'Real Prometheus promtool parser and rule engine on synthetic input series. No Prometheus scraping server, Alertmanager delivery, production SLO or oncall response test.'}


if __name__=='__main__':
    print(json.dumps(run(sys.argv[1] if len(sys.argv)>1 else 'promtool'),ensure_ascii=False,indent=2))
