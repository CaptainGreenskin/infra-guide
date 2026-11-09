#!/usr/bin/env python3
"""Observe the real Resource CPU HPA from Metrics API to available kind Pods."""
import argparse
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
import uuid

KIND = 'v0.33.0'
K8S = 'v1.35.8'
NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
PYTHON_IMAGE = 'docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431'
NS, APP = 'hpa-lab', 'cpu-demo'
METRICS_VERSION = 'v0.9.1'
METRICS_URL = f'https://github.com/kubernetes-sigs/metrics-server/releases/download/{METRICS_VERSION}/components.yaml'
METRICS_SHA = '3c7f57cdbee0f57fb0259a150e8f6d6cb4f29d72d1aa5dce8803151dd6d4c2a1'
METRICS_IMAGE = 'registry.k8s.io/metrics-server/metrics-server:' + METRICS_VERSION
METRICS_DIGEST = 'sha256:4dbfba731a021437b4cab5ba2092569edbd898030c27d10c6ec85e03b63789f6'
TARGET, REQUEST, LIMIT = 50, '100m', '200m'
READY_FILE, BURN_FILE = '/tmp/ready', '/tmp/burn'

BURNER = r'''
from pathlib import Path
import time

marker = Path('/tmp/burn')
while True:
    if marker.is_file():
        until = time.monotonic() + 0.2
        while time.monotonic() < until:
            pass
    else:
        time.sleep(0.1)
'''


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def source_sha():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def command(*args, env=None, stdin=None, timeout=80):
    result = subprocess.run(args, input=stdin, text=True, capture_output=True, env=env, timeout=timeout)
    require(result.returncode == 0,
            f'{args[0]} {args[1]} exited {result.returncode}: {(result.stderr or result.stdout)[-3500:]}')
    return result.stdout


def toolchain():
    require(sys.platform == 'linux', 'Linux amd64 Docker is required')
    for tool in ('docker', 'kind', 'kubectl'):
        require(shutil.which(tool), f'{tool} is required')
    require(not os.getenv('DOCKER_HOST') and not os.getenv('DOCKER_CONTEXT'), 'unset Docker endpoint overrides')
    endpoint = command('docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}').strip()
    require(endpoint in ('unix:///var/run/docker.sock', 'unix:///run/docker.sock'),
            'only the standard local Docker socket is supported')
    engine = command('docker', 'info', '--format', '{{.OSType}} {{.Architecture}} {{.KernelVersion}}').strip()
    require(engine.startswith(('linux x86_64 ', 'linux amd64 ')), 'Linux amd64 Docker is required')
    kind = command('kind', 'version').strip()
    kubectl = json.loads(command('kubectl', 'version', '--client', '-o', 'json'))['clientVersion']['gitVersion']
    require(kind.split()[:2] == ['kind', KIND] and kubectl == K8S, 'unexpected kind or kubectl version')
    return {'kind': kind, 'kubectl': kubectl, 'docker_engine': engine}


class Cluster:
    def __init__(self, directory):
        self.name = 'hpa-' + uuid.uuid4().hex[:12]
        self.node = self.name + '-control-plane'
        self.config = str(Path(directory) / 'kubeconfig')
        self.env = dict(os.environ, KUBECONFIG=self.config, KIND_EXPERIMENTAL_PROVIDER='docker')
        self.env.pop('KIND_EXPERIMENTAL_DOCKER_NETWORK', None)
        self.owned = False

    def kc(self, *args, stdin=None, timeout=80):
        return command('kubectl', '--kubeconfig', self.config, '--context', 'kind-' + self.name,
                       *args, env=self.env, stdin=stdin, timeout=timeout)

    def nodes(self):
        return command('docker', 'ps', '-aq', '--filter', f'label=io.x-k8s.kind.cluster={self.name}',
                       env=self.env).split()

    def start(self):
        require(self.name not in command('kind', 'get', 'clusters', env=self.env).splitlines()
                and not self.nodes(), 'random cluster name collision')
        self.owned = True
        config = json.dumps({'kind': 'Cluster', 'apiVersion': 'kind.x-k8s.io/v1alpha4',
                             'networking': {'apiServerAddress': '127.0.0.1'},
                             'nodes': [{'role': 'control-plane'}]})
        command('kind', 'create', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                '--image', NODE_IMAGE, '--config', '-', '--wait', '150s', env=self.env,
                stdin=config, timeout=330)
        require(command('kind', 'get', 'nodes', '--name', self.name, env=self.env).split() == [self.node]
                and len(self.nodes()) == 1, 'unexpected kind node inventory')
        self.kc('wait', '--for=condition=Ready', 'node', self.node, '--timeout=120s', timeout=135)

    def create(self, value):
        self.kc('create', '-f', '-', stdin=json.dumps(value))

    def get(self, kind, name, ns=NS):
        return json.loads(self.kc('-n', ns, 'get', kind, name, '-o', 'json'))

    def cleanup(self):
        if not self.owned:
            return {'attempted': False, 'owned_nodes_removed': False}
        command('kind', 'delete', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                env=self.env, timeout=180)
        require(not self.nodes(), 'owned Docker node containers remain')
        return {'attempted': True, 'owned_nodes_removed': True}


def metrics_manifest():
    with urlopen(METRICS_URL, timeout=45) as response:
        raw = response.read(1024 * 1024)
    require(hashlib.sha256(raw).hexdigest() == METRICS_SHA, 'upstream metrics-server manifest SHA256 mismatch')
    manifest = raw.decode('utf-8')
    flag = '        - --metric-resolution=15s'
    require(manifest.count(flag) == 1 and manifest.count('image: ' + METRICS_IMAGE) == 1,
            'unexpected upstream metrics-server manifest shape')
    # kind's kubelet serving certificate is self-signed. Limit this setting
    # to this lab's own disposable cluster.
    return (manifest.replace(flag, flag + '\n        - --kubelet-insecure-tls')
            .replace('image: ' + METRICS_IMAGE, 'image: ' + METRICS_IMAGE + '@' + METRICS_DIGEST))


def workload():
    return {'apiVersion': 'apps/v1', 'kind': 'Deployment', 'metadata': {'namespace': NS, 'name': APP}, 'spec': {
        'replicas': 1,
        'selector': {'matchLabels': {'app': APP}},
        'template': {'metadata': {'labels': {'app': APP}}, 'spec': {
            'automountServiceAccountToken': False,
            'tolerations': [{'key': 'node-role.kubernetes.io/control-plane', 'operator': 'Exists',
                             'effect': 'NoSchedule'}],
            'containers': [{
                'name': 'worker', 'image': PYTHON_IMAGE, 'command': ['python', '-u', '-c', BURNER],
                'resources': {'requests': {'cpu': REQUEST, 'memory': '32Mi'},
                              'limits': {'cpu': LIMIT, 'memory': '64Mi'}},
                'readinessProbe': {'exec': {'command': ['sh', '-c', 'test -f ' + READY_FILE]},
                                   'periodSeconds': 1},
            }],
        }},
    }}


def autoscaler():
    return {'apiVersion': 'autoscaling/v2', 'kind': 'HorizontalPodAutoscaler',
            'metadata': {'namespace': NS, 'name': APP}, 'spec': {
                'scaleTargetRef': {'apiVersion': 'apps/v1', 'kind': 'Deployment', 'name': APP},
                'minReplicas': 1, 'maxReplicas': 2,
                'metrics': [{'type': 'Resource', 'resource': {'name': 'cpu',
                             'target': {'type': 'Utilization', 'averageUtilization': TARGET}}}],
                'behavior': {'scaleDown': {'stabilizationWindowSeconds': 0}},
            }}


def poll(read, valid, label, seconds=190):
    deadline = time.monotonic() + seconds
    while True:
        observed = read()
        if valid(observed):
            return observed
        if time.monotonic() >= deadline:
            raise RuntimeError(f'timed out waiting for {label}: {json.dumps(observed)[-4800:]}')
        time.sleep(2)


def cpu_milli(text):
    match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)([num]?)', text)
    require(match, 'unexpected CPU quantity: ' + text)
    return Decimal(match[1]) * {'n': Decimal('0.000001'), 'u': Decimal('0.001'),
                                'm': Decimal(1), '': Decimal(1000)}[match[2]]


def available(conditions, kind):
    return any(c['type'] == kind and c['status'] == 'True' for c in conditions)


def pods(cluster):
    value = json.loads(cluster.kc('-n', NS, 'get', 'pods', '-l', 'app=' + APP, '-o', 'json'))
    result = []
    for item in value['items']:
        meta, spec, status = (item[k] for k in ('metadata', 'spec', 'status'))
        container = next((c for c in status.get('containerStatuses', []) if c['name'] == 'worker'), {})
        result.append({'name': meta['name'], 'uid': meta['uid'], 'node': spec.get('nodeName'),
                       'phase': status['phase'], 'ready': available(status.get('conditions', []), 'Ready'),
                       'deleting': 'deletionTimestamp' in meta,
                       'restart_count': container.get('restartCount'), 'image_id': container.get('imageID')})
    return sorted(result, key=lambda p: p['name'])


def metrics(cluster):
    value = json.loads(cluster.kc('get', '--raw', f'/apis/metrics.k8s.io/v1beta1/namespaces/{NS}/pods'))
    return {m['metadata']['name']: {'timestamp': m['timestamp'], 'window': m['window'],
                                   'cpu': next(c['usage']['cpu'] for c in m['containers'] if c['name'] == 'worker')}
            for m in (value.get('items') or [])}


def observe(cluster):
    hpa = cluster.get('hpa', APP)
    dep = cluster.get('deployment', APP)
    hs = hpa.get('status', {})
    metric = next((m['resource']['current'] for m in hs.get('currentMetrics', [])
                   if m['type'] == 'Resource' and m['resource']['name'] == 'cpu'), {})
    return {'hpa': {'uid': hpa['metadata']['uid'], 'current': hs.get('currentReplicas'),
                    'desired': hs.get('desiredReplicas'), 'cpu_percent': metric.get('averageUtilization'),
                    'cpu_average': metric.get('averageValue'), 'conditions': hs.get('conditions', [])},
            'deployment': {'uid': dep['metadata']['uid'], 'desired': dep['spec']['replicas'],
                           'available': dep.get('status', {}).get('availableReplicas', 0)},
            'pods': pods(cluster), 'metrics': metrics(cluster)}


def expect_shape(row, desired, ready):
    hpa, dep = row['hpa'], row['deployment']
    return (hpa['desired'] == desired == dep['desired'] and dep['available'] == ready
            and available(hpa['conditions'], 'ScalingActive')
            and len(row['pods']) == desired
            and sum(p['ready'] for p in row['pods']) == ready
            and all(p['phase'] == 'Running' and not p['deleting'] for p in row['pods'])
            and type(hpa['cpu_percent']) is int)


def cpu_on_side(row, name, above):
    sample = row['metrics'].get(name)
    if not sample or not sample['timestamp'] or not sample['window']:
        return False
    # TARGET% of the fixture's 100m request is TARGET milliCPU.
    raw, status = cpu_milli(sample['cpu']), row['hpa']['cpu_percent']
    return raw > TARGET and status > TARGET if above else raw < TARGET and status < TARGET


def run(cluster, report, manifest):
    cluster.start()
    report['kubernetes_server'] = json.loads(cluster.kc('version', '-o', 'json'))['serverVersion']['gitVersion']
    require(report['kubernetes_server'] == K8S, 'unexpected Kubernetes server version')
    cluster.kc('apply', '-f', '-', stdin=manifest)
    cluster.kc('-n', 'kube-system', 'rollout', 'status', 'deployment/metrics-server',
               '--timeout=200s', timeout=215)
    cluster.kc('wait', '--for=condition=Available', 'apiservice/v1beta1.metrics.k8s.io',
               '--timeout=100s', timeout=115)
    service = json.loads(cluster.kc('get', 'apiservice', 'v1beta1.metrics.k8s.io', '-o', 'json'))
    metrics_pod = json.loads(cluster.kc('-n', 'kube-system', 'get', 'pods', '-l',
                                       'k8s-app=metrics-server', '-o', 'json'))['items']
    require(len(metrics_pod) == 1, 'unexpected metrics-server Pod set')
    pod = metrics_pod[0]
    report['metrics_server'] = {'apiservice': service['metadata']['name'],
                                'available': available(service['status']['conditions'], 'Available'),
                                'pod_uid': pod['metadata']['uid'],
                                'image_id': pod['status']['containerStatuses'][0]['imageID'],
                                'kind_kubelet_insecure_tls': '--kubelet-insecure-tls' in pod['spec']['containers'][0]['args']}
    cluster.create({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': NS}})
    cluster.create(workload())
    original = poll(lambda: pods(cluster), lambda p: len(p) == 1 and p[0]['phase'] == 'Running',
                    'original worker Running')[0]
    name = original['name']
    cluster.kc('-n', NS, 'exec', name, '-c', 'worker', '--', 'touch', READY_FILE)
    cluster.kc('-n', NS, 'wait', '--for=condition=Ready', 'pod/' + name, '--timeout=80s', timeout=90)
    cluster.create(autoscaler())
    report['workload_resources'] = cluster.get('deployment', APP)['spec']['template']['spec']['containers'][0]['resources']
    spec = cluster.get('hpa', APP)['spec']
    report['hpa_spec'] = {k: spec[k] for k in ('scaleTargetRef', 'minReplicas', 'maxReplicas', 'metrics', 'behavior')}
    observe_now = lambda: observe(cluster)
    report['idle'] = poll(observe_now, lambda r: expect_shape(r, 1, 1) and cpu_on_side(r, name, False),
                          'one available replica and low CPU')
    cluster.kc('-n', NS, 'exec', name, '-c', 'worker', '--', 'touch', BURN_FILE)
    held = poll(observe_now, lambda r: expect_shape(r, 2, 1) and cpu_on_side(r, name, True),
                'two desired replicas with one available and high CPU')
    report['readiness_held'] = held
    require(any(p['uid'] == original['uid'] and p['ready'] for p in held['pods']), 'original worker lost readiness')
    extra = next(p for p in held['pods'] if not p['ready'])
    cluster.kc('-n', NS, 'exec', extra['name'], '-c', 'worker', '--', 'touch', READY_FILE)
    report['two_available'] = poll(observe_now, lambda r: expect_shape(r, 2, 2),
                                   'second worker available')
    cluster.kc('-n', NS, 'exec', name, '-c', 'worker', '--', 'rm', BURN_FILE)
    report['cooldown'] = poll(observe_now, lambda r: expect_shape(r, 1, 1)
                              and cpu_on_side(r, r['pods'][0]['name'], False),
                              'scaled back to one available replica and low CPU')


def verify(report):
    require(report['schema'] == 1 and report['status'] == 'passed' and report['source_sha256'] == source_sha(),
            'expected a complete native record bound to this source')
    require(report['node_image'] == NODE_IMAGE and report['python_image'] == PYTHON_IMAGE
            and report['metrics_manifest_sha256'] == METRICS_SHA and report['metrics_image'] == METRICS_IMAGE + '@' + METRICS_DIGEST
            and report['kubernetes_server'] == K8S == report['toolchain']['kubectl']
            and report['toolchain']['kind'].split()[:2] == ['kind', KIND]
            and report['toolchain']['docker_engine'].startswith(('linux amd64 ', 'linux x86_64 ')),
            'runtime pins do not match')
    node = report['cluster'] + '-control-plane'
    require(re.fullmatch(r'hpa-[0-9a-f]{12}', report['cluster']), 'unexpected owned cluster')
    ms = report['metrics_server']
    require(ms['apiservice'] == 'v1beta1.metrics.k8s.io' and ms['available'] is True and ms['pod_uid']
            and ms['image_id'].endswith(METRICS_DIGEST) and ms['kind_kubelet_insecure_tls'] is True,
            'Metrics API or runtime image identity mismatch')
    require(report['workload_resources'] == workload()['spec']['template']['spec']['containers'][0]['resources'],
            'CPU resource pins mismatch')
    spec, expected = report['hpa_spec'], autoscaler()['spec']
    require(all(spec[k] == expected[k] for k in ('scaleTargetRef', 'minReplicas', 'maxReplicas', 'metrics'))
            and spec['behavior']['scaleDown']['stabilizationWindowSeconds'] == 0, 'HPA spec mismatch')
    idle, held, two, down = (report[k] for k in ('idle', 'readiness_held', 'two_available', 'cooldown'))
    for row, desired, ready in ((idle, 1, 1), (held, 2, 1), (two, 2, 2), (down, 1, 1)):
        require(expect_shape(row, desired, ready), 'desired/available Pod shape mismatch')
        require(row['hpa']['uid'] == idle['hpa']['uid'] and row['hpa']['uid']
                and row['deployment']['uid'] == idle['deployment']['uid'] and row['deployment']['uid'],
                'HPA or Deployment identity changed')
        require(all(p['uid'] and p['node'] == node and p['restart_count'] == 0
                    and p['image_id'].endswith(PYTHON_IMAGE.split('@')[1]) for p in row['pods']),
                'worker runtime identity mismatch')
    original = idle['pods'][0]
    require(original in held['pods'] and original in two['pods'], 'original Pod identity or readiness changed')
    require({p['uid'] for p in held['pods']} == {p['uid'] for p in two['pods']}
            and len({p['uid'] for p in held['pods']}) == 2
            and down['pods'][0]['uid'] in {p['uid'] for p in two['pods']},
            'readiness release or downscale changed the wrong Pod identity')
    require(cpu_on_side(idle, original['name'], False) and cpu_on_side(held, original['name'], True)
            and cpu_on_side(down, down['pods'][0]['name'], False), 'CPU metric chain mismatch')
    require(report['cleanup'] == {'attempted': True, 'owned_nodes_removed': True}, 'owned teardown unverified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='also save the native or failed run record')
    parser.add_argument('--check-record', type=Path, help='check a saved record without Docker or network')
    args = parser.parse_args()
    if args.check_record:
        if args.output:
            parser.error('use --check-record alone')
        verify(json.loads(args.check_record.read_text(encoding='utf-8')))
        print('PASS native CPU Metrics API, HPA desired, delayed availability, downscale and owned cleanup')
        return 0
    report = {'schema': 1, 'status': 'failed', 'source_sha256': source_sha(),
              'node_image': NODE_IMAGE, 'python_image': PYTHON_IMAGE,
              'metrics_manifest_sha256': METRICS_SHA, 'metrics_image': METRICS_IMAGE + '@' + METRICS_DIGEST}
    with tempfile.TemporaryDirectory(prefix='hpa-control-lab-') as directory:
        cluster = Cluster(directory)
        report['cluster'] = cluster.name
        try:
            report['toolchain'] = toolchain()
            run(cluster, report, metrics_manifest())
            report['status'] = 'passed'
        except (Exception, KeyboardInterrupt) as exc:
            report['error'] = str(exc) or type(exc).__name__
            if cluster.owned and Path(cluster.config).is_file():
                try:
                    report['events_tail'] = cluster.kc('get', 'events', '-A', '--sort-by=.lastTimestamp',
                                                       timeout=15)[-6500:]
                except Exception:
                    pass
        finally:
            try:
                report['cleanup'] = cluster.cleanup()
            except Exception as exc:
                report.update(status='failed', cleanup={'attempted': True, 'owned_nodes_removed': False,
                                                        'error': str(exc)})
    if report['status'] == 'passed':
        try:
            verify(report)
        except Exception as exc:
            report.update(status='failed', error=str(exc))
    result = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result, encoding='utf-8')
    print(result, end='')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyError, TypeError, ValueError, OSError, RuntimeError) as error:
        print(f'hpa_control_lab: {error}', file=sys.stderr)
        sys.exit(1)
