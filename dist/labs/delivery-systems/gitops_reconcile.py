"""Actual Argo CD Core + kind, three immutable public revisions, independent HTTP version oracle."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import uuid

NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
ARGO_VERSION = 'v3.6.1'
ARGO_URL = 'https://raw.githubusercontent.com/argoproj/argo-cd/' + ARGO_VERSION + '/manifests/core-install.yaml'


def command(*parts, data=None, check=True, timeout=240):
    r = subprocess.run(parts, input=data, text=True, capture_output=True, timeout=timeout)
    if check and r.returncode:
        raise RuntimeError(parts[0] + ': ' + r.stderr[-4500:])
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=Path('gitops-record.json'))
    args = ap.parse_args()
    sources = json.loads(Path(__file__).with_name('gitops-revisions.json').read_text())
    assert not os.environ.get('DOCKER_HOST')
    endpoint = json.loads(command('docker', 'context', 'inspect').stdout)[0]['Endpoints']['docker']['Host']
    assert endpoint.startswith('unix://'), 'Only a local Docker context is accepted'
    name = 'infra-gitops-' + uuid.uuid4().hex[:10]
    assert name not in command('kind', 'get', 'clusters').stdout.splitlines()
    records = {}
    with tempfile.TemporaryDirectory(prefix='infra-gitops-') as tmp:
        root = Path(tmp)
        kubeconfig = root / 'kubeconfig'

        def k(*parts, data=None, check=True):
            return command('kubectl', '--kubeconfig', str(kubeconfig), '--context', 'kind-' + name,
                           '--request-timeout=30s', *parts, data=data, check=check)

        def get(kind, obj, ns='guide-demo'):
            return json.loads(k('get', kind, obj, '-n', ns, '-o', 'json').stdout)

        def apply(obj):
            return k('apply', '-f', '-', data=json.dumps(obj))

        def exists(kind, obj):
            return bool(k('get', kind, obj, '-n', 'guide-demo', '--ignore-not-found', '-o', 'name').stdout.strip())

        def patch_app(patch):
            k('patch', 'application', 'guide', '-n', 'argocd', '--type=merge', '-p', json.dumps(patch))
            k('annotate', 'application', 'guide', '-n', 'argocd', 'argocd.argoproj.io/refresh=hard', '--overwrite')

        def wait(label, predicate, timeout=150):
            deadline = time.monotonic() + timeout
            last = None
            while time.monotonic() < deadline:
                try:
                    last = predicate()
                    if last:
                        return last
                except (RuntimeError, KeyError, IndexError):
                    pass
                time.sleep(1)
            raise AssertionError(label + ': condition not reached; last=' + str(last))

        def app_status():
            app = get('application', 'guide', 'argocd')
            st = app.get('status', {})
            return {'sync': st.get('sync', {}).get('status'), 'revision': st.get('sync', {}).get('revision'),
                    'health': st.get('health', {}).get('status'),
                    'operation': st.get('operationState', {}).get('phase'),
                    'conditions': st.get('conditions', [])}

        def synced(revision):
            st = app_status()
            return st if st['revision'] == revision and st['sync'] == 'Synced' and st['health'] == 'Healthy' else False

        def active_pods():
            items = json.loads(k('get', 'pods', '-n', 'guide-demo', '-l', 'app=guide-web', '-o', 'json').stdout)['items']
            return [p for p in items if not p['metadata'].get('deletionTimestamp')]

        def one_ready_pod():
            pods = active_pods()
            if len(pods) != 1:
                return False
            p = pods[0]
            if not any(c['type'] == 'Ready' and c['status'] == 'True' for c in p.get('status', {}).get('conditions', [])):
                return False
            return {'name': p['metadata']['name'], 'uid': p['metadata']['uid']}

        def response():
            pod = wait('single ready application pod', one_ready_pod)
            script = 'import json,urllib.request; print(urllib.request.urlopen("http://guide-web:8080/version",timeout=3).read().decode())'
            body = json.loads(k('exec', '-n', 'guide-demo', pod['name'], '--', 'python', '-c', script).stdout)
            return {'http': body, 'pod': pod, 'desired_config': get('configmap', 'guide-version')['data']['version']}

        try:
            command('kind', 'create', 'cluster', '--name', name, '--kubeconfig', str(kubeconfig),
                    '--image', NODE_IMAGE, '--wait', '150s', timeout=400)
            for ns in ('argocd', 'guide-demo'):
                apply({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': ns}})
            install = urllib.request.urlopen(ARGO_URL, timeout=45).read()
            install_path = root / 'argocd-core.yaml'
            install_path.write_bytes(install)
            # Fresh, owned cluster: create avoids oversized last-applied annotations on CRDs.
            k('create', '-n', 'argocd', '-f', str(install_path))
            k('rollout', 'status', 'deployment/argocd-repo-server', '-n', 'argocd', '--timeout=180s')
            project = {'apiVersion': 'argoproj.io/v1alpha1', 'kind': 'AppProject',
                       'metadata': {'name': 'guide-scope', 'namespace': 'argocd'},
                       'spec': {'sourceRepos': [sources['repo']],
                                'destinations': [{'server': 'https://kubernetes.default.svc', 'namespace': 'guide-demo'}],
                                'clusterResourceWhitelist': [], 'namespaceResourceWhitelist': [
                                    {'group': '', 'kind': 'ConfigMap'}, {'group': '', 'kind': 'Service'},
                                    {'group': 'apps', 'kind': 'Deployment'}]}}
            apply(project)
            apply({'apiVersion': 'v1', 'kind': 'ConfigMap', 'metadata': {'name': 'unmanaged', 'namespace': 'guide-demo'}, 'data': {'owner': 'outside-this-application'}})
            apply({'apiVersion': 'argoproj.io/v1alpha1', 'kind': 'Application',
                   'metadata': {'name': 'guide', 'namespace': 'argocd'},
                   'spec': {'project': 'guide-scope', 'source': {'repoURL': sources['repo'], 'path': sources['path'],
                             'targetRevision': sources['v1'], 'directory': {}},
                            'destination': {'server': 'https://kubernetes.default.svc', 'namespace': 'guide-demo'},
                            'syncPolicy': {'automated': {'enabled': True, 'selfHeal': False, 'prune': False}}}})
            initial = wait('v1 synced and healthy', lambda: synced(sources['v1']), timeout=240)
            records['v1'] = {'status': initial, **response()}
            assert records['v1']['http']['version'] == 'v1'
            k('scale', 'deployment/guide-web', '-n', 'guide-demo', '--replicas=2')
            k('rollout', 'status', 'deployment/guide-web', '-n', 'guide-demo', '--timeout=90s')
            k('annotate', 'application', 'guide', '-n', 'argocd', 'argocd.argoproj.io/refresh=hard', '--overwrite')
            wait('drift detected', lambda: app_status()['sync'] == 'OutOfSync')
            records['self_heal_off'] = {'status': app_status(), 'live_replicas': get('deployment', 'guide-web')['spec']['replicas']}
            assert records['self_heal_off']['live_replicas'] == 2
            patch_app({'spec': {'syncPolicy': {'automated': {'selfHeal': True}}}})
            wait('self healed v1', lambda: synced(sources['v1']))
            before_v2 = response()
            records['self_heal_on'] = {'status': app_status(), 'live_replicas': get('deployment', 'guide-web')['spec']['replicas'], **before_v2}
            assert records['self_heal_on']['live_replicas'] == 1
            patch_app({'spec': {'source': {'targetRevision': sources['config_only_v2']}}})

            def v2_applied():
                st = app_status()
                return st if (st['revision'] == sources['config_only_v2'] and st['operation'] == 'Succeeded'
                              and get('configmap', 'guide-version')['data']['version'] == 'v2') else False
            wait('v2 manifests applied, pruning disabled', v2_applied)
            records['prune_off'] = {'status': app_status(), 'retired_exists': exists('configmap', 'guide-retired'),
                                    'unmanaged_exists': exists('configmap', 'unmanaged')}
            assert records['prune_off']['retired_exists'] and records['prune_off']['unmanaged_exists']
            patch_app({'spec': {'syncPolicy': {'automated': {'prune': True}}}})
            wait('managed retired ConfigMap pruned', lambda: not exists('configmap', 'guide-retired'))
            wait('v2 fully synced and healthy', lambda: synced(sources['config_only_v2']))
            v2 = response()
            records['v2_synced_but_old_business'] = {'status': app_status(), **v2,
                'retired_exists': exists('configmap', 'guide-retired'), 'unmanaged_exists': exists('configmap', 'unmanaged'),
                'business_oracle_passed': v2['http']['version'] == 'v2'}
            assert v2['desired_config'] == 'v2' and v2['http']['version'] == 'v1'
            assert v2['pod']['uid'] == before_v2['pod']['uid']
            assert records['v2_synced_but_old_business']['unmanaged_exists']
            patch_app({'spec': {'source': {'targetRevision': sources['rollout_v2']}}})
            wait('new template v2', lambda: synced(sources['rollout_v2']))
            v3 = response()
            assert v3['http']['version'] == 'v2' and v3['pod']['uid'] != v2['pod']['uid']
            records['v3_new_pod'] = {'status': app_status(), **v3, 'business_oracle_passed': True}
            # Change desired revision; this is not the disabled-with-auto-sync rollback API.
            patch_app({'spec': {'source': {'targetRevision': sources['v1']}}})
            wait('return desired revision to v1', lambda: synced(sources['v1']))
            back = response()
            assert back['http']['version'] == 'v1' and exists('configmap', 'guide-retired')
            records['return_to_v1'] = {'status': app_status(), **back, 'managed_config_recreated': True}
            report = {'schema': 1, 'status': 'passed', 'kind': command('kind', 'version').stdout.strip(),
                      'kubernetes': json.loads(k('version', '-o', 'json').stdout)['serverVersion']['gitVersion'],
                      'argo_version': ARGO_VERSION, 'argo_manifest_url': ARGO_URL,
                      'argo_manifest_sha256': hashlib.sha256(install).hexdigest(), 'sources': sources,
                      'records': records, 'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                      'revision_file_sha256': hashlib.sha256(Path(__file__).with_name('gitops-revisions.json').read_bytes()).hexdigest(),
                      'scope': 'real Argo CD Core Git fetch/reconcile and HTTP in a single-host kind cluster; not cloud/prod/physical multi-node'}
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + '\n')
            print(json.dumps(report))
        except Exception:
            if kubeconfig.exists():
                status = k('get', 'application', 'guide', '-n', 'argocd', '-o', 'json', check=False)
                if status.returncode == 0:
                    # Only application status; never write kubeconfig or Secret data to artifacts.
                    failure = json.loads(status.stdout).get('status', {})
                    args.output.parent.mkdir(parents=True, exist_ok=True)
                    args.output.with_suffix('.failure.json').write_text(json.dumps(failure, indent=2))
            raise
        finally:
            command('kind', 'delete', 'cluster', '--name', name, check=False)


if __name__ == '__main__':
    main()
