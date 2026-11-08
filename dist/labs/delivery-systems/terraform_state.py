"""Real Terraform local backend + official local_file provider, only in an owned temp directory."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import tempfile
import time


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=Path('terraform-record.json'))
    ap.add_argument('--hold', nargs=2)
    args = ap.parse_args()
    if args.hold:
        ready, release = map(Path, args.hold)
        ready.write_text('apply holds local state lock\n')
        deadline = time.monotonic() + 25
        while not release.exists():
            if time.monotonic() > deadline:
                raise TimeoutError('parent did not release the owned provisioner')
            time.sleep(.05)
        return
    assert os.name == 'posix'
    with tempfile.TemporaryDirectory(prefix='infra-tf-state-') as tmp:
        root = Path(tmp)
        ready, release = root / 'ready', root / 'release'
        config = {'terraform': {'required_version': '= 1.13.0', 'required_providers': {
            'local': {'source': 'hashicorp/local', 'version': '= 2.5.3'}}},
            'variable': {'content': {'type': 'string', 'default': 'alpha'}},
            'resource': {
                'local_file': {'managed': {'filename': '${path.module}/managed.txt', 'content': '${var.content}',
                                          'file_permission': '0600', 'directory_permission': '0700'}},
                'terraform_data': {'gate': {'input': 'one-controlled-apply', 'depends_on': ['local_file.managed'],
                    'provisioner': [{'local-exec': {'command': shlex.join([
                        sys.executable, str(Path(__file__).resolve()), '--hold', str(ready), str(release)])}}]}}}}
        (root / 'main.tf.json').write_text(json.dumps(config, indent=2))
        (root / 'terraform.rc').write_text('disable_checkpoint = true\n')
        env = {**os.environ, 'TF_IN_AUTOMATION': '1', 'TF_INPUT': '0', 'TF_CLI_CONFIG_FILE': str(root / 'terraform.rc')}
        prefix = ['terraform', '-chdir=' + str(root)]

        def tf(*parts, expected=(0,)):
            result = subprocess.run(prefix + list(parts), env=env, text=True, capture_output=True, timeout=120)
            if result.returncode not in expected:
                raise RuntimeError((result.stdout + result.stderr).replace(str(root), 'ROOT')[-6000:])
            return result

        def plan(name, *flags):
            result = tf('plan', '-input=false', '-no-color', '-detailed-exitcode', '-out=' + name, *flags, expected=(0, 2))
            body = json.loads(tf('show', '-json', name).stdout)
            return result.returncode, body

        def state():
            r = json.loads(tf('state', 'pull').stdout)
            return {'serial': r['serial'], 'lineage': r['lineage'],
                    'resources': [{'address': p['type'] + '.' + p['name'],
                                   'content': p['instances'][0]['attributes'].get('content')}
                                  for p in r.get('resources', []) if p.get('instances')]}

        def file_content():
            return (root / 'managed.txt').read_text()

        tf('init', '-input=false', '-no-color')
        version = json.loads(tf('version', '-json').stdout)
        assert version['terraform_version'] == '1.13.0'
        assert version['provider_selections']['registry.terraform.io/hashicorp/local'] == '2.5.3'
        writer = subprocess.Popen(prefix + ['apply', '-input=false', '-auto-approve', '-no-color', '-parallelism=1'],
                                  env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            deadline = time.monotonic() + 60
            while not ready.exists():
                if writer.poll() is not None:
                    stdout, stderr = writer.communicate()
                    raise RuntimeError(stdout + stderr)
                assert time.monotonic() < deadline, 'apply never reached the controlled provisioner'
                time.sleep(.1)
            assert writer.poll() is None and file_content() == 'alpha'
            lock_path = root / '.terraform.tfstate.lock.info'
            lock = json.loads(lock_path.read_text())
            blocked = tf('plan', '-input=false', '-no-color', '-lock-timeout=0s', expected=(1,))
            assert 'Error acquiring the state lock' in blocked.stdout + blocked.stderr
            assert writer.poll() is None
            lock_record = {'second_exit': blocked.returncode, 'first_still_running': True,
                           'lock_operation': lock['Operation'], 'file_during_apply': file_content()}
        finally:
            release.write_text('release\n')
            try:
                stdout, stderr = writer.communicate(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(writer.pid, signal.SIGTERM)
                stdout, stderr = writer.communicate(timeout=10)
        assert writer.returncode == 0, (stdout + stderr).replace(str(root), 'ROOT')
        assert not lock_path.exists()
        initial = state()
        clean_code, _ = plan('clean.plan')
        assert clean_code == 0 and file_content() == 'alpha'
        (root / 'managed.txt').write_text('outside')
        stale_code, stale_plan = plan('cached.plan', '-refresh=false')
        assert stale_code == 0 and file_content() == 'outside'
        before_refresh_state = state()
        refresh_code, refresh_plan = plan('refresh.plan', '-refresh-only')
        assert refresh_code == 2
        drifts = [{'address': x['address'], 'actions': x['change']['actions']} for x in refresh_plan['resource_drift']]
        assert {'address': 'local_file.managed', 'actions': ['delete']} in drifts
        tf('apply', '-input=false', '-no-color', 'refresh.plan')
        after_refresh_state = state()
        assert file_content() == 'outside'
        assert not any(r['address'] == 'local_file.managed' for r in after_refresh_state['resources'])
        repair_code, repair_plan = plan('repair.plan')
        actions = [{'address': x['address'], 'actions': x['change']['actions']} for x in repair_plan['resource_changes']]
        assert repair_code == 2 and {'address': 'local_file.managed', 'actions': ['create']} in actions
        tf('apply', '-input=false', '-no-color', 'repair.plan')
        assert file_content() == 'alpha'
        repaired_file = file_content()
        repaired = state()
        tf('workspace', 'new', 'blue')
        tf('apply', '-input=false', '-auto-approve', '-no-color', '-var=content=alpha')
        blue = state()
        tf('workspace', 'new', 'green')
        tf('apply', '-input=false', '-auto-approve', '-no-color', '-var=content=beta')
        green = state()
        assert file_content() == 'beta' and blue['lineage'] != green['lineage']
        tf('workspace', 'select', 'blue')
        workspace_cached_code, _ = plan('workspace-cached.plan', '-refresh=false', '-var=content=alpha')
        workspace_fresh_code, _ = plan('workspace-fresh.plan', '-var=content=alpha')
        assert workspace_cached_code == 0 and workspace_fresh_code == 2 and file_content() == 'beta'
        report = {'schema': 1, 'status': 'passed', 'version': version, 'lock': lock_record,
                  'initial': initial, 'external_edit': {'actual_file': 'outside', 'cached_plan_exit': stale_code,
                    'cached_state': before_refresh_state},
                  'refresh_only': {'plan_exit': refresh_code, 'drifts': drifts, 'state': after_refresh_state,
                                   'actual_file_after_apply': 'outside'},
                  'repair': {'actions': actions, 'actual_file': repaired_file, 'state': repaired},
                  'workspaces': {'blue': blue, 'green': green, 'same_target': 'ROOT/managed.txt', 'actual_file': file_content(),
                                 'blue_cached_plan_exit': workspace_cached_code, 'blue_fresh_plan_exit': workspace_fresh_code},
                  'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  'provider_lock_sha256': hashlib.sha256((root / '.terraform.lock.hcl').read_bytes()).hexdigest(),
                  'scope': 'actual Terraform local backend + official local_file; temp files only, not cloud provider/remote backend/HA'}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))


if __name__ == '__main__':
    main()
