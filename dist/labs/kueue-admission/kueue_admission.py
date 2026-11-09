#!/usr/bin/env python3
"""Observe native Kueue quota admission, Kubernetes placement and indexed CPU output."""
import argparse
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
NS = 'kueue-lab'
API = 'kueue.x-k8s.io/v1beta2'
FLAVOR, CLUSTER_QUEUE, LOCAL_QUEUE = 'cpu', 'cpu-budget', 'work'
HOLDER, TARGET = 'holder', 'indexed-sum'
LABEL = 'lab.example/eligible'
KUEUE_NS, CONTROLLER = 'kueue-system', 'kueue-controller-manager'
VERSION = 'v0.20.5'
MANIFEST_URL = f'https://github.com/kubernetes-sigs/kueue/releases/download/{VERSION}/manifests.yaml'
MANIFEST_SHA = 'c23f0a9001d2896f13d5592fe905a49bd276d26b84d16c762c474f0548ccff0d'
CONTROLLER_IMAGE = 'registry.k8s.io/kueue/kueue:' + VERSION
CONTROLLER_DIGEST = 'sha256:d355deeef3168f440a225d44900999290bcd82e64af386c115edb504d9aba7dd'
RELEASE_FILE = '/tmp/release'
INDEX_KEY = 'batch.kubernetes.io/job-completion-index'

HOLDER_CODE = r'''
from pathlib import Path
import time
release = Path('/tmp/release')
deadline = time.monotonic() + 480
while not release.is_file():
    if time.monotonic() >= deadline:
        raise RuntimeError('holder release not received')
    time.sleep(0.2)
print('holder released')
'''

WORKER_CODE = r'''
import json, os
shards = ((10, 27), (5, 7))
index = int(os.environ['JOB_COMPLETION_INDEX'])
data = shards[index]
print(json.dumps({'index': index, 'input': data, 'partial': sum(data), 'pod_uid': os.environ['POD_UID']}))
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
        self.name = 'kueue-' + uuid.uuid4().hex[:12]
        self.nodes_expected = [self.name + '-control-plane', self.name + '-worker']
        self.worker = self.nodes_expected[1]
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
                             'nodes': [{'role': 'control-plane'}, {'role': 'worker'}]})
        command('kind', 'create', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                '--image', NODE_IMAGE, '--config', '-', '--wait', '150s', env=self.env,
                stdin=config, timeout=330)
        require(sorted(command('kind', 'get', 'nodes', '--name', self.name, env=self.env).split()) == self.nodes_expected
                and len(self.nodes()) == 2, 'unexpected kind node inventory')
        self.kc('wait', '--for=condition=Ready', 'node', '--all', '--timeout=120s', timeout=135)

    def create(self, value):
        self.kc('create', '-f', '-', stdin=json.dumps(value))

    def get(self, kind, name, ns=NS):
        return json.loads(self.kc(*(['-n', ns] if ns else []), 'get', kind, name, '-o', 'json'))

    def cleanup(self):
        if not self.owned:
            return {'attempted': False, 'owned_nodes_removed': False}
        command('kind', 'delete', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                env=self.env, timeout=180)
        require(not self.nodes(), 'owned Docker node containers remain')
        return {'attempted': True, 'owned_nodes_removed': True}


def pinned_manifest(local_path):
    if local_path:
        raw = local_path.read_bytes()
    else:
        for attempt in range(3):
            try:
                with urlopen(MANIFEST_URL, timeout=45) as response:
                    raw = response.read(32 * 1024 * 1024)
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
    require(hashlib.sha256(raw).hexdigest() == MANIFEST_SHA, 'upstream Kueue manifest SHA256 mismatch')
    manifest = raw.decode('utf-8')
    image = 'image: ' + CONTROLLER_IMAGE
    require(manifest.count(image) == 1, 'unexpected upstream Kueue image field')
    return manifest.replace(image, image + '@' + CONTROLLER_DIGEST)


def resource(api, kind, name, ns=None, **fields):
    return {'apiVersion': api, 'kind': kind,
            'metadata': {'name': name, **({'namespace': ns} if ns else {})}, **fields}


def queue_resources():
    return [
        resource(API, 'ResourceFlavor', FLAVOR, spec={}),
        resource(API, 'ClusterQueue', CLUSTER_QUEUE, spec={
            'namespaceSelector': {},
            'resourceGroups': [{'coveredResources': ['cpu'],
                                'flavors': [{'name': FLAVOR, 'resources': [{'name': 'cpu', 'nominalQuota': '200m'}]}]}],
        }),
        resource(API, 'LocalQueue', LOCAL_QUEUE, NS, spec={'clusterQueue': CLUSTER_QUEUE}),
    ]


def job(name):
    indexed = name == TARGET
    count, cpu = (2, '100m') if indexed else (1, '200m')
    container = {
        'name': 'worker', 'image': PYTHON_IMAGE,
        'command': ['python', '-u', '-c', WORKER_CODE if indexed else HOLDER_CODE],
        'resources': {'requests': {'cpu': cpu}},
        'env': [{'name': 'POD_UID', 'valueFrom': {'fieldRef': {'fieldPath': 'metadata.uid'}}}],
    }
    pod = {'restartPolicy': 'Never', 'automountServiceAccountToken': False, 'containers': [container]}
    if indexed:
        pod['nodeSelector'] = {LABEL: 'true'}
    value = resource('batch/v1', 'Job', name, NS, spec={
        'suspend': True, 'parallelism': count, 'completions': count,
        'completionMode': 'Indexed' if indexed else 'NonIndexed', 'backoffLimit': 0, 'template': {'spec': pod},
    })
    value['metadata']['labels'] = {'kueue.x-k8s.io/queue-name': LOCAL_QUEUE}
    return value


def poll(read, valid, label, seconds=140):
    deadline = time.monotonic() + seconds
    while True:
        observed = read()
        if valid(observed):
            return observed
        if time.monotonic() >= deadline:
            raise RuntimeError(f'timed out waiting for {label}: {json.dumps(observed)[-5500:]}')
        time.sleep(1.5)


def owned_by(value, uid):
    return any(ref['kind'] == 'Job' and ref['uid'] == uid
               for ref in value['metadata'].get('ownerReferences', []))


def condition(value, name, status=True):
    expected = 'True' if status else 'False'
    return next((c for c in (value.get('conditions') or []) if c['type'] == name and c['status'] == expected), None)


def collect(cluster, job_name):
    current = cluster.get('job', job_name)
    m, spec = current['metadata'], current['spec']
    uid = m['uid']
    all_workloads = json.loads(cluster.kc('-n', NS, 'get', 'workloads', '-o', 'json'))['items']
    matching = [w for w in all_workloads if owned_by(w, uid)]
    require(len(matching) <= 1, 'unexpected multiple Workloads for one Job')
    workload = None
    if matching:
        w = matching[0]
        workload = {'metadata': {k: w['metadata'][k] for k in ('name', 'uid', 'ownerReferences')},
                    'spec': {k: w['spec'][k] for k in ('queueName', 'podSets')}, 'status': w.get('status', {})}
    all_pods = json.loads(cluster.kc('-n', NS, 'get', 'pods', '-o', 'json'))['items']
    pods = []
    for pod in all_pods:
        if not owned_by(pod, uid):
            continue
        pm, ps, status = (pod[k] for k in ('metadata', 'spec', 'status'))
        container = next((c for c in (status.get('containerStatuses') or []) if c['name'] == 'worker'), {})
        pods.append({
            'name': pm['name'], 'uid': pm['uid'], 'ownerReferences': pm['ownerReferences'],
            'index': pm.get('annotations', {}).get(INDEX_KEY),
            'node': ps.get('nodeName'), 'node_selector': ps.get('nodeSelector'),
            'phase': status.get('phase'), 'conditions': status.get('conditions', []),
            'image_id': container.get('imageID'), 'restart_count': container.get('restartCount'),
            'exit_code': container.get('state', {}).get('terminated', {}).get('exitCode'),
        })
    return {'job': {'name': m['name'], 'uid': uid, 'suspend': spec.get('suspend', False),
                    'parallelism': spec['parallelism'], 'completions': spec['completions'],
                    'completion_mode': spec['completionMode'], 'status': current.get('status', {})},
            'workload': workload, 'pods': sorted(pods, key=lambda p: p['name'])}


def admitted(state):
    w = state['workload']
    return w and w['status'].get('admission') and condition(w['status'], 'QuotaReserved') and condition(w['status'], 'Admitted')


def blocked_by_quota(state):
    w = state['workload']
    if not w or w['status'].get('admission') or not state['job']['suspend'] or state['pods']:
        return False
    reserved = condition(w['status'], 'QuotaReserved', False)
    return reserved and reserved.get('reason') == 'WaitingForQuota' and 'quota' in reserved.get('message', '').lower()


def unscheduled_pods(state):
    return admitted(state) and not state['job']['suspend'] and len(state['pods']) == 2 and all(
        p['phase'] == 'Pending' and not p['node'] and p['node_selector'] == {LABEL: 'true'}
        and (condition(p, 'PodScheduled', False) or {}).get('reason') == 'Unschedulable' for p in state['pods']
    )


def scheduling_events(cluster, pod):
    events = json.loads(cluster.kc('-n', NS, 'get', 'events', '--field-selector',
                                  'involvedObject.uid=' + pod['uid'], '-o', 'json'))['items']
    return [{'reason': e['reason'], 'message': e['message'], 'object_uid': e['involvedObject']['uid']}
            for e in events if e.get('reason') == 'FailedScheduling']


def node_labels(cluster):
    nodes = json.loads(cluster.kc('get', 'nodes', '-o', 'json'))['items']
    return {node['metadata']['name']: node['metadata'].get('labels', {}).get(LABEL) for node in nodes}


def run(cluster, report, manifest):
    cluster.start()
    server = json.loads(cluster.kc('version', '-o', 'json'))['serverVersion']['gitVersion']
    require(server == K8S, 'unexpected Kubernetes server version')
    report['kubernetes_server'] = server
    cluster.kc('apply', '--server-side', '-f', '-', stdin=manifest, timeout=150)
    for name in ('resourceflavors', 'clusterqueues', 'localqueues', 'workloads'):
        cluster.kc('wait', '--for=condition=Established', f'crd/{name}.kueue.x-k8s.io',
                   '--timeout=70s', timeout=85)
    cluster.kc('-n', KUEUE_NS, 'rollout', 'status', 'deployment/' + CONTROLLER, '--timeout=200s', timeout=215)
    controller = json.loads(cluster.kc('-n', KUEUE_NS, 'get', 'pods', '-l', 'control-plane=controller-manager',
                                      '-o', 'json'))['items']
    require(len(controller) == 1, 'unexpected Kueue controller Pod set')
    container = next(s for s in controller[0]['status']['containerStatuses'] if s['name'] == 'manager')
    report['controller'] = {'pod_uid': controller[0]['metadata']['uid'], 'image_id': container['imageID'],
                            'ready': container['ready']}
    cluster.create(resource('v1', 'Namespace', NS))
    for value in queue_resources():
        cluster.create(value)
    cluster.kc('wait', '--for=condition=Active', 'clusterqueue/' + CLUSTER_QUEUE, '--timeout=70s', timeout=85)
    cluster.kc('-n', NS, 'wait', '--for=condition=Active', 'localqueue/' + LOCAL_QUEUE,
               '--timeout=70s', timeout=85)
    report['queues'] = {
        'flavor': cluster.get('resourceflavor', FLAVOR, None)['spec'],
        'cluster': cluster.get('clusterqueue', CLUSTER_QUEUE, None)['spec'],
        'local': cluster.get('localqueue', LOCAL_QUEUE)['spec'],
    }
    report['node_labels_before'] = node_labels(cluster)
    require(report['node_labels_before'] == {name: None for name in cluster.nodes_expected},
            'fixture requires no eligible nodes before labeling')
    cluster.create(job(HOLDER))
    holder = poll(lambda: collect(cluster, HOLDER), lambda s: admitted(s) and not s['job']['suspend']
                  and len(s['pods']) == 1 and s['pods'][0]['phase'] == 'Running'
                  and s['pods'][0]['node'] == cluster.worker and condition(s['pods'][0], 'Ready'),
                  'holder admission and worker binding')
    report['holder_running'] = holder
    cluster.create(job(TARGET))
    report['target_waiting_quota'] = poll(lambda: collect(cluster, TARGET), blocked_by_quota,
                                          'target pending because holder consumed quota')
    require(collect(cluster, HOLDER)['pods'][0]['phase'] == 'Running', 'holder did not remain active until release')
    cluster.kc('-n', NS, 'exec', holder['pods'][0]['name'], '-c', 'worker', '--', 'touch', RELEASE_FILE)
    cluster.kc('-n', NS, 'wait', '--for=condition=Complete', 'job/' + HOLDER, '--timeout=100s', timeout=115)
    report['holder_finished'] = poll(lambda: collect(cluster, HOLDER), lambda s: condition(s['job']['status'], 'Complete')
                                     and s['workload'] and condition(s['workload']['status'], 'Finished'),
                                     'holder Job and Workload finished')
    pending = poll(lambda: collect(cluster, TARGET), unscheduled_pods, 'admitted target with two unscheduled Pods')
    report['target_admitted_unplaced'] = pending
    pending['failed_scheduling'] = {}
    for pod in pending['pods']:
        pending['failed_scheduling'][pod['uid']] = poll(
            lambda: scheduling_events(cluster, pod), lambda events: any('selector' in e['message'] for e in events),
            'FailedScheduling event for ' + pod['name'], seconds=65)
    cluster.kc('label', 'node', cluster.worker, LABEL + '=true')
    report['node_labels_after'] = node_labels(cluster)
    cluster.kc('-n', NS, 'wait', '--for=condition=Complete', 'job/' + TARGET, '--timeout=130s', timeout=145)
    finished = poll(lambda: collect(cluster, TARGET), lambda s: condition(s['job']['status'], 'Complete')
                    and s['workload'] and condition(s['workload']['status'], 'Finished')
                    and len(s['pods']) == 2 and all(p['phase'] == 'Succeeded' for p in s['pods']),
                    'indexed Job and Workload finished')
    report['target_finished'] = finished
    rows = [json.loads(cluster.kc('-n', NS, 'logs', pod['name'], '-c', 'worker')) for pod in finished['pods']]
    report['worker_output'] = sorted(rows, key=lambda row: row['index'])
    report['total'] = sum(row['partial'] for row in rows)


def verify_stage(stage, expected_job, count):
    j, w = stage['job'], stage['workload']
    require(j['name'] == expected_job and j['uid'] and j['parallelism'] == j['completions'] == count,
            'Job identity or size mismatch')
    require(w['metadata']['uid'] and owned_by(w, j['uid']) and w['spec']['queueName'] == LOCAL_QUEUE
            and len(w['spec']['podSets']) == 1 and w['spec']['podSets'][0]['count'] == count,
            'Workload owner, queue, or PodSet count mismatch')
    req = w['spec']['podSets'][0]['template']['spec']['containers'][0]['resources']['requests']['cpu']
    require(req == ('100m' if count == 2 else '200m'), 'Workload CPU request mismatch')
    require(all(p['uid'] and owned_by({'metadata': p}, j['uid']) for p in stage['pods']),
            'Pod owner identity mismatch')


def verify_assignment(stage, count):
    reservation = stage['workload']['status']['admission']
    require(reservation['clusterQueue'] == CLUSTER_QUEUE and len(reservation['podSetAssignments']) == 1,
            'ClusterQueue reservation mismatch')
    a = reservation['podSetAssignments'][0]
    require(a['count'] == count and a['flavors']['cpu'] == FLAVOR and a['resourceUsage']['cpu'] == '200m',
            'CPU assignment does not match fixture quota')


def verify(report):
    require(report['schema'] == 1 and report['status'] == 'passed' and report['source_sha256'] == source_sha(),
            'expected a complete native record bound to this source')
    require(report['kubernetes_server'] == K8S == report['toolchain']['kubectl']
            and report['toolchain']['kind'].split()[:2] == ['kind', KIND]
            and report['toolchain']['docker_engine'].startswith(('linux amd64 ', 'linux x86_64 '))
            and report['node_image'] == NODE_IMAGE and report['python_image'] == PYTHON_IMAGE
            and report['kueue_version'] == VERSION and report['manifest_sha256'] == MANIFEST_SHA
            and report['controller_image'] == CONTROLLER_IMAGE + '@' + CONTROLLER_DIGEST, 'runtime pins mismatch')
    controller = report['controller']
    require(controller['pod_uid'] and controller['ready'] is True and controller['image_id'].endswith(CONTROLLER_DIGEST),
            'native Kueue controller image mismatch')
    require(re.fullmatch(r'kueue-[0-9a-f]{12}', report['cluster']), 'unexpected owned cluster name')
    control, worker = (report['cluster'] + '-' + suffix for suffix in ('control-plane', 'worker'))
    require(report['node_labels_before'] == {control: None, worker: None}
            and report['node_labels_after'] == {control: None, worker: 'true'}, 'node selector intervention mismatch')
    require(report['queues']['cluster']['resourceGroups'] == queue_resources()[1]['spec']['resourceGroups']
            and report['queues']['local']['clusterQueue'] == CLUSTER_QUEUE
            and not report['queues']['flavor'].get('nodeLabels'), 'queue or CPU flavor mismatch')

    h, hd, w, p, d = (report[name] for name in ('holder_running', 'holder_finished', 'target_waiting_quota',
                                               'target_admitted_unplaced', 'target_finished'))
    for state in (h, hd):
        verify_stage(state, HOLDER, 1)
    for state in (w, p, d):
        verify_stage(state, TARGET, 2)
        require(state['job']['completion_mode'] == 'Indexed', 'target is not indexed')
    require(h['job']['uid'] == hd['job']['uid'] and h['workload']['metadata']['uid'] == hd['workload']['metadata']['uid']
            and admitted(h) and not h['job']['suspend'] and len(h['pods']) == 1
            and h['pods'][0]['phase'] == 'Running' and h['pods'][0]['node'] == worker
            and condition(h['pods'][0], 'Ready') and condition(hd['job']['status'], 'Complete')
            and condition(hd['workload']['status'], 'Finished') and len(hd['pods']) == 1
            and hd['pods'][0]['uid'] == h['pods'][0]['uid'] and hd['pods'][0]['exit_code'] == 0,
            'holder did not occupy and release the CPU reservation')
    verify_assignment(h, 1)
    require(w['job']['uid'] == p['job']['uid'] == d['job']['uid']
            and w['workload']['metadata']['uid'] == p['workload']['metadata']['uid'] == d['workload']['metadata']['uid']
            and w['job']['uid'] != h['job']['uid'] and blocked_by_quota(w) and unscheduled_pods(p),
            'target did not transition from quota waiting to admitted but unscheduled')
    verify_assignment(p, 2)
    require(set(p['failed_scheduling']) == {pod['uid'] for pod in p['pods']}
            and all(any(e['reason'] == 'FailedScheduling' and e['object_uid'] == pod['uid']
                        and 'selector' in e['message'] for e in p['failed_scheduling'][pod['uid']]) for pod in p['pods']),
            'missing selector FailedScheduling evidence')
    require(condition(d['job']['status'], 'Complete') and condition(d['workload']['status'], 'Finished')
            and d['job']['status']['completedIndexes'] in ('0,1', '0-1') and len(d['pods']) == 2
            and {p['index']: p['uid'] for p in d['pods']} == {pod['index']: pod['uid'] for pod in p['pods']},
            'Job completion or Pod continuity mismatch')
    by_index = {pod['index']: pod for pod in d['pods']}
    require(set(by_index) == {'0', '1'} and all(
        pod['phase'] == 'Succeeded' and pod['exit_code'] == 0 and pod['node'] == worker
        and pod['node_selector'] == {LABEL: 'true'} and pod['restart_count'] == 0
        and pod['image_id'].endswith(PYTHON_IMAGE.split('@')[1]) for pod in d['pods']),
        'indexed workers did not bind and complete on the eligible node')
    require(report['worker_output'] == [
        {'index': 0, 'input': [10, 27], 'partial': 37, 'pod_uid': by_index['0']['uid']},
        {'index': 1, 'input': [5, 7], 'partial': 12, 'pod_uid': by_index['1']['uid']},
    ] and report['total'] == 49, 'independent indexed output check failed')
    require(report['cleanup'] == {'attempted': True, 'owned_nodes_removed': True}, 'owned teardown unverified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='also save the native or failed run record')
    parser.add_argument('--check-record', type=Path, help='check a saved record without Docker or network')
    parser.add_argument('--manifest', type=Path, help='use a downloaded release manifest with the same pinned SHA256')
    args = parser.parse_args()
    if args.check_record:
        if args.output or args.manifest:
            parser.error('use --check-record alone')
        verify(json.loads(args.check_record.read_text(encoding='utf-8')))
        print('PASS native Kueue quota, Kubernetes placement, two indexed outputs and owned cleanup')
        return 0
    report = {'schema': 1, 'status': 'failed', 'source_sha256': source_sha(),
              'node_image': NODE_IMAGE, 'python_image': PYTHON_IMAGE, 'kueue_version': VERSION,
              'manifest_sha256': MANIFEST_SHA, 'controller_image': CONTROLLER_IMAGE + '@' + CONTROLLER_DIGEST}
    with tempfile.TemporaryDirectory(prefix='kueue-admission-lab-') as directory:
        cluster = Cluster(directory)
        report['cluster'] = cluster.name
        try:
            report['toolchain'] = toolchain()
            run(cluster, report, pinned_manifest(args.manifest))
            report['status'] = 'passed'
        except (Exception, KeyboardInterrupt) as exc:
            report['error'] = str(exc) or type(exc).__name__
            if cluster.owned and Path(cluster.config).is_file():
                for key, args in (
                    ('events_tail', ('get', 'events', '-A', '--sort-by=.lastTimestamp')),
                    ('controller_logs_tail', ('-n', KUEUE_NS, 'logs', 'deployment/' + CONTROLLER, '--tail=50')),
                ):
                    try:
                        report[key] = cluster.kc(*args, timeout=15)[-7000:]
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
        print(f'kueue_admission: {error}', file=sys.stderr)
        sys.exit(1)
