"""Execute real Terraform locally using its built-in provider; no cloud resources."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def config(digit):
    return '''terraform { required_version = ">= 1.4, < 2.0" }
resource "terraform_data" "release" {
  input = { replicas = 2, digest = "sha256:%s" }
}
output "release" { value = terraform_data.release.output }
''' % (digit*64)


def run(binary):
    executable=str(Path(binary).resolve()) if '/' in binary else binary
    env={**os.environ,'TF_IN_AUTOMATION':'1','CHECKPOINT_DISABLE':'1','TF_INPUT':'0'}
    with tempfile.TemporaryDirectory(prefix='infra-terraform-') as tmp:
        folder=Path(tmp)
        def tf(*args,ok=True):
            result=subprocess.run([executable,*args],cwd=tmp,env=env,text=True,capture_output=True)
            if ok and result.returncode!=0:
                raise RuntimeError(result.stderr or result.stdout)
            return result
        def plan(digit,name):
            (folder/'main.tf').write_text(config(digit))
            tf('plan','-no-color','-out='+name)
        (folder/'main.tf').write_text(Path(__file__).with_name('main.tf').read_text())
        tf('init','-no-color')
        tf('validate','-no-color')
        plan('1','v1.tfplan')
        initial=json.loads(tf('show','-json','v1.tfplan').stdout)
        assert initial['resource_changes'][0]['change']['actions']==['create']
        (folder/'main.tf').write_text(config('2'))
        tf('apply','-no-color','v1.tfplan')
        first=json.loads(tf('output','-json').stdout)['release']['value']
        assert first['digest']=='sha256:'+'1'*64  # saved plan, not edited config
        plan('2','v2.tfplan')
        changes=json.loads(tf('show','-json','v2.tfplan').stdout)
        assert changes['resource_changes'][0]['change']['actions']==['update']
        tf('apply','-no-color','v2.tfplan')
        second=json.loads(tf('output','-json').stdout)['release']['value']
        assert second['digest']=='sha256:'+'2'*64
        stable=tf('plan','-no-color','-detailed-exitcode',ok=False)
        assert stable.returncode==0
        plan('3','stale.tfplan')
        plan('4','new.tfplan')
        tf('apply','-no-color','new.tfplan')
        stale=tf('apply','-no-color','stale.tfplan',ok=False)
        assert stale.returncode!=0 and 'stale' in (stale.stderr+stale.stdout).lower()
        version=json.loads(tf('version','-json').stdout)['terraform_version']
        return {'status':'passed','terraform':version,'provider':'terraform.io/builtin/terraform',
                'initial_actions':['create'],'saved_v1_plan_applied_v1_despite_v2_config':True,
                'v2_actions':['update'],'v2_state':second,'unchanged_plan_exit_code':0,
                'stale_saved_plan_rejected':True,
                'scope':'Real Terraform CLI and local state, built-in terraform_data only; no cloud provider, remote API drift, remote lock or GitOps controller execution.'}


if __name__=='__main__':
    print(json.dumps(run(sys.argv[1] if len(sys.argv)>1 else 'terraform'),ensure_ascii=False,indent=2))
