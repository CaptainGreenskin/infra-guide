"""Create an isolated kind cluster. Every API call names its own kubeconfig/context."""
import argparse
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
PAUSE = 'registry.k8s.io/pause:3.10'


def command(*args, data=None, check=True, timeout=240):
    return subprocess.run(args, input=data, text=True, capture_output=True, check=check, timeout=timeout)


def milli(value):
    return int(value[:-1]) if value.endswith('m') else int(Decimal(value) * 1000)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=Path('scheduling-record.json'))
    args = ap.parse_args()
    assert not os.environ.get('DOCKER_HOST'), 'Use a local Docker context'
    context = json.loads(command('docker', 'context', 'inspect').stdout)[0]
    assert context['Endpoints']['docker']['Host'].startswith('unix://')
    name = 'infra-schedule-' + uuid.uuid4().hex[:10]
    assert name not in command('kind', 'get', 'clusters').stdout.splitlines()
    observations = {}
    with tempfile.TemporaryDirectory(prefix='infra-kind-') as tmp:
        kubeconfig = Path(tmp) / 'kubeconfig'
        config = Path(tmp) / 'kind.yaml'
        config.write_text('kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnodes:\n'
                          '- role: control-plane\n- role: worker\n- role: worker\n')

        def kubectl(*parts, data=None, check=True):
            return command('kubectl', '--kubeconfig', str(kubeconfig), '--context', 'kind-' + name,
                           '--request-timeout=30s', *parts, data=data, check=check)

        def apply(obj, check=True):
            return kubectl('apply', '-f', '-', data=json.dumps(obj), check=check)

        def get(kind, obj=None, namespace=None):
            parts = ['get', kind] + ([obj] if obj else []) + (['-n', namespace] if namespace else [])
            return json.loads(kubectl(*parts, '-o', 'json').stdout)

        def wait_pod(namespace, pod, ready):
            deadline = time.monotonic() + 100
            while time.monotonic() < deadline:
                obj = get('pod', pod, namespace)
                conds = obj.get('status', {}).get('conditions', [])
                if ready:
                    ok = any(c['type'] == 'Ready' and c['status'] == 'True' for c in conds)
                else:
                    ok = any(c['type'] == 'PodScheduled' and c['status'] == 'False'
                             and c.get('reason') == 'Unschedulable' for c in conds)
                if ok:
                    return {'uid': obj['metadata']['uid'], 'phase': obj['status']['phase'],
                            'node': obj['spec'].get('nodeName'), 'conditions': conds}
                time.sleep(.5)
            raise AssertionError(f'{namespace}/{pod}: unexpected status {obj.get("status")}')

        def pod(namespace, podname, cpu='50m', spread=False, tolerate=False):
            spec = {'nodeSelector': {'guide/pool': 'worker'},
                    'containers': [{'name': 'idle', 'image': PAUSE, 'imagePullPolicy': 'Never',
                                    'resources': {'requests': {'cpu': cpu, 'memory': '16Mi'},
                                                  'limits': {'cpu': cpu, 'memory': '32Mi'}}}]}
            if spread:
                spec['affinity'] = {'podAntiAffinity': {'requiredDuringSchedulingIgnoredDuringExecution': [
                    {'labelSelector': {'matchLabels': {'app': 'spread'}}, 'topologyKey': 'kubernetes.io/hostname'}]}}
            if tolerate:
                spec['tolerations'] = [{'key': 'dedicated', 'operator': 'Equal', 'value': 'training', 'effect': 'NoSchedule'}]
            return {'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'namespace': namespace,
                    'name': podname, 'labels': {'app': 'spread' if spread else 'idle'}}, 'spec': spec}

        try:
            command('kind', 'create', 'cluster', '--name', name, '--kubeconfig', str(kubeconfig),
                    '--config', str(config), '--image', NODE_IMAGE, '--wait', '150s', timeout=400)
            command('docker', 'pull', PAUSE)
            command('kind', 'load', 'docker-image', PAUSE, '--name', name)
            nodes = get('nodes')['items']
            workers = sorted(n['metadata']['name'] for n in nodes if 'node-role.kubernetes.io/control-plane' not in n['metadata']['labels'])
            assert len(workers) == 2
            for node in workers:
                kubectl('label', 'node', node, 'guide/pool=worker')
            kubectl('taint', 'node', workers[1], 'dedicated=training:NoSchedule')
            for ns in ('quota-lab', 'shape-lab', 'spread-lab'):
                apply({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': ns}})
            apply({'apiVersion': 'v1', 'kind': 'ResourceQuota', 'metadata': {'name': 'cpu-budget', 'namespace': 'quota-lab'},
                   'spec': {'hard': {'requests.cpu': '300m'}}})
            apply(pod('quota-lab', 'first', cpu='250m'))
            observations['quota_first'] = wait_pod('quota-lab', 'first', True)
            rejected = apply(pod('quota-lab', 'second', cpu='100m'), check=False)
            assert rejected.returncode != 0 and 'exceeded quota' in rejected.stderr, rejected.stderr
            absent = kubectl('get', 'pod', 'second', '-n', 'quota-lab', '--ignore-not-found', '-o', 'name').stdout.strip()
            assert absent == ''
            observations['quota_rejection'] = {'object_exists': False, 'error': rejected.stderr.strip(),
                                               'quota': get('resourcequota', 'cpu-budget', 'quota-lab')['status']}
            allocatable = {n['metadata']['name']: n['status']['allocatable'] for n in get('nodes')['items'] if n['metadata']['name'] in workers}
            oversized = max(milli(v['cpu']) for v in allocatable.values()) + 1000
            apply(pod('shape-lab', 'too-large', cpu=str(oversized) + 'm', tolerate=True))
            observations['oversized'] = wait_pod('shape-lab', 'too-large', False)
            observations['oversized']['request_millicpu'] = oversized
            apply(pod('shape-lab', 'fits', tolerate=True))
            observations['fits'] = wait_pod('shape-lab', 'fits', True)
            apply(pod('spread-lab', 'spread-0', spread=True))
            observations['spread_first'] = wait_pod('spread-lab', 'spread-0', True)
            assert observations['spread_first']['node'] == workers[0]
            apply(pod('spread-lab', 'spread-1', spread=True))
            observations['spread_blocked'] = wait_pod('spread-lab', 'spread-1', False)
            kubectl('patch', 'pod', 'spread-1', '-n', 'spread-lab', '--type=merge', '-p', json.dumps({
                'spec': {'tolerations': [{'key': 'dedicated', 'operator': 'Equal', 'value': 'training', 'effect': 'NoSchedule'}]}}))
            observations['spread_tolerated'] = wait_pod('spread-lab', 'spread-1', True)
            assert observations['spread_tolerated']['node'] == workers[1]
            apply(pod('spread-lab', 'spread-2', spread=True, tolerate=True))
            observations['spread_full'] = wait_pod('spread-lab', 'spread-2', False)
            events = get('events', namespace='spread-lab')['items']
            report = {'schema': 1, 'scope': 'actual kind API/scheduler on one Linux host; logical nodes, not physical multi-node capacity',
                      'kind': command('kind', 'version').stdout.strip(), 'node_image': NODE_IMAGE,
                      'kubernetes': json.loads(kubectl('version', '-o', 'json').stdout)['serverVersion'],
                      'allocatable': allocatable, 'workers': workers, 'observations': observations,
                      'events': [{'reason': e.get('reason'), 'message': e.get('message'),
                                  'object': e['involvedObject']['name']} for e in events],
                      'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            print(json.dumps(report, ensure_ascii=False))
        finally:
            command('kind', 'delete', 'cluster', '--name', name, check=False)


if __name__ == '__main__':
    main()
