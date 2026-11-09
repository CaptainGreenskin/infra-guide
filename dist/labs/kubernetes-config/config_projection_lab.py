#!/usr/bin/env python3
"""Observe ConfigMap projection, subPath, startup env and an open fd in real kind."""
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
import uuid

KIND = 'v0.33.0'
K8S = 'v1.35.8'
NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
PYTHON_IMAGE = 'docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431'
NS, CONFIG = 'config-lab', 'app-config'
SNAPSHOT = '/tmp/config-snapshot.json'

PROBE = r'''
import json, os, time
from pathlib import Path

path = Path('/projected/version')
snapshot = Path('/tmp/config-snapshot.json')
held = os.open(path, os.O_RDONLY)
try:
    while True:
        try:
            fresh = path.open()
        except FileNotFoundError:
            time.sleep(0.1)
            continue
        with fresh:
            row = {'pod_uid': os.environ['POD_UID'], 'pid': os.getpid(),
                   'startup_env': os.environ['APP_VERSION'],
                   'projected': fresh.read(), 'projected_inode': os.fstat(fresh.fileno()).st_ino,
                   'held_fd': os.pread(held, 32, 0).decode(),
                   'held_inode': os.fstat(held).st_ino,
                   'sub_path': Path('/pinned/version').read_text()}
        temp = snapshot.with_suffix('.tmp')
        temp.write_text(json.dumps(row))
        os.replace(temp, snapshot)
        time.sleep(0.3)
finally:
    os.close(held)
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
        self.name = 'cfg-' + uuid.uuid4().hex[:12]
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

    def get(self, kind, name):
        return json.loads(self.kc('-n', NS, 'get', kind, name, '-o', 'json'))

    def cleanup(self):
        if not self.owned:
            return {'attempted': False, 'owned_nodes_removed': False}
        command('kind', 'delete', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                env=self.env, timeout=180)
        require(not self.nodes(), 'owned Docker node containers remain')
        return {'attempted': True, 'owned_nodes_removed': True}


def pod(name):
    return {'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'namespace': NS, 'name': name}, 'spec': {
        'restartPolicy': 'Never', 'automountServiceAccountToken': False,
        'tolerations': [{'key': 'node-role.kubernetes.io/control-plane', 'operator': 'Exists', 'effect': 'NoSchedule'}],
        'volumes': [{'name': 'config', 'projected': {'sources': [{'configMap': {'name': CONFIG}}]}}],
        'containers': [{
            'name': 'reader', 'image': PYTHON_IMAGE, 'command': ['python', '-u', '-c', PROBE],
            'env': [
                {'name': 'APP_VERSION', 'valueFrom': {'configMapKeyRef': {'name': CONFIG, 'key': 'version'}}},
                {'name': 'POD_UID', 'valueFrom': {'fieldRef': {'fieldPath': 'metadata.uid'}}},
            ],
            'volumeMounts': [
                {'name': 'config', 'mountPath': '/projected', 'readOnly': True},
                {'name': 'config', 'mountPath': '/pinned/version', 'subPath': 'version', 'readOnly': True},
            ],
            'readinessProbe': {'exec': {'command': ['sh', '-c', 'test -s ' + SNAPSHOT]}, 'periodSeconds': 1},
        }],
    }}


def source(cluster):
    value = cluster.get('configmap', CONFIG)
    meta = value['metadata']
    return {'name': meta['name'], 'uid': meta['uid'], 'resource_version': meta['resourceVersion'],
            'version': value['data']['version']}


def probe(cluster, name):
    return json.loads(cluster.kc('-n', NS, 'exec', name, '-c', 'reader', '--', 'cat', SNAPSHOT, timeout=20))


def observation(cluster, name, row):
    current = cluster.get('pod', name)
    meta, spec, status = (current[k] for k in ('metadata', 'spec', 'status'))
    container = status['containerStatuses'][0]
    return {'pod': {'name': meta['name'], 'uid': meta['uid'], 'node': spec['nodeName'], 'phase': status['phase'],
                    'container_id': container['containerID'], 'image_id': container['imageID'],
                    'restart_count': container['restartCount']},
            'probe': row}


def wait_ready(cluster, name):
    cluster.create(pod(name))
    cluster.kc('-n', NS, 'wait', '--for=condition=Ready', 'pod/' + name, '--timeout=160s', timeout=175)


def wait_projection(cluster, name):
    deadline = time.monotonic() + 160
    while True:
        row = probe(cluster, name)
        if row['projected'] == 'v2':
            return row
        if time.monotonic() >= deadline:
            raise RuntimeError(f'projected path did not reach v2: {row}')
        time.sleep(1)


def run(cluster, report):
    cluster.start()
    report['kubernetes_server'] = json.loads(cluster.kc('version', '-o', 'json'))['serverVersion']['gitVersion']
    require(report['kubernetes_server'] == K8S, 'unexpected Kubernetes server version')
    cluster.create({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': NS}})
    cluster.create({'apiVersion': 'v1', 'kind': 'ConfigMap', 'metadata': {'namespace': NS, 'name': CONFIG},
                    'data': {'version': 'v1'}})
    first, replacement = 'original', 'replacement'
    wait_ready(cluster, first)
    report['before'] = {'source': source(cluster), **observation(cluster, first, probe(cluster, first))}
    cluster.kc('-n', NS, 'patch', 'configmap', CONFIG, '--type=merge',
               '-p', json.dumps({'data': {'version': 'v2'}}))
    report['source_after_patch'] = source(cluster)
    report['after_projection'] = observation(cluster, first, wait_projection(cluster, first))
    cluster.kc('-n', NS, 'delete', 'pod', first, '--wait=true', '--timeout=90s', timeout=105)
    report['original_absent'] = not cluster.kc('-n', NS, 'get', 'pod', first, '--ignore-not-found', '-o', 'name').strip()
    require(report['original_absent'], 'original Pod still exists')
    wait_ready(cluster, replacement)
    report['replacement'] = {'source': source(cluster),
                             **observation(cluster, replacement, probe(cluster, replacement))}


def verify(report):
    require(report['schema'] == 1 and report['status'] == 'passed' and report['source_sha256'] == source_sha(),
            'expected a complete record bound to this source')
    require(report['node_image'] == NODE_IMAGE and report['python_image'] == PYTHON_IMAGE
            and report['kubernetes_server'] == K8S == report['toolchain']['kubectl']
            and report['toolchain']['kind'].split()[:2] == ['kind', KIND]
            and report['toolchain']['docker_engine'].startswith(('linux amd64 ', 'linux x86_64 ')),
            'runtime pins do not match')
    require(re.fullmatch(r'cfg-[0-9a-f]{12}', report['cluster']), 'unexpected cluster name')
    first, changed, last = (report[k] for k in ('before', 'after_projection', 'replacement'))
    old, new = first['source'], report['source_after_patch']
    require(old['name'] == new['name'] == CONFIG and old['uid'] and old['uid'] == new['uid']
            and old['version'] == 'v1' and new['version'] == 'v2'
            and old['resource_version'] and new['resource_version']
            and old['resource_version'] != new['resource_version']
            and last['source'] == new, 'ConfigMap update or replacement source mismatch')
    require(first['pod'] == changed['pod'] and first['pod']['uid'] != last['pod']['uid']
            and first['pod']['container_id'] != last['pod']['container_id'] and report['original_absent'] is True,
            'update must retain the original container, then replace the Pod')
    for stage, name, expected in ((first, 'original', ('v1', 'v1', 'v1', 'v1')),
                                  (changed, 'original', ('v2', 'v1', 'v1', 'v1')),
                                  (last, 'replacement', ('v2', 'v2', 'v2', 'v2'))):
        pod_row, row = stage['pod'], stage['probe']
        require(pod_row['name'] == name and pod_row['uid'] and pod_row['container_id']
                and pod_row['node'] == report['cluster'] + '-control-plane' and pod_row['phase'] == 'Running'
                and pod_row['restart_count'] == 0 and pod_row['image_id'].endswith(PYTHON_IMAGE.split('@')[1])
                and row['pod_uid'] == pod_row['uid'] and row['pid'] == 1, 'Pod or observer identity mismatch')
        require(tuple(row[k] for k in ('projected', 'held_fd', 'sub_path', 'startup_env')) == expected,
                f'wrong four-path observation in {name}')
        require(all(type(row[k]) is int and row[k] > 0 for k in ('held_inode', 'projected_inode')),
                'missing inode observation')
    a, b, c = (stage['probe'] for stage in (first, changed, last))
    require(a['held_inode'] == a['projected_inode'] == b['held_inode']
            and b['projected_inode'] != b['held_inode'] and c['held_inode'] == c['projected_inode'],
            'held fd and fresh path identity mismatch')
    require(report['cleanup'] == {'attempted': True, 'owned_nodes_removed': True}, 'owned teardown unverified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='also save the native or failed run record')
    parser.add_argument('--check-record', type=Path, help='check the saved native record without Docker or network')
    args = parser.parse_args()
    if args.check_record:
        if args.output:
            parser.error('use --check-record alone')
        verify(json.loads(args.check_record.read_text(encoding='utf-8')))
        print('PASS native projected ConfigMap, held fd, subPath, startup env and replacement')
        return 0
    report = {'schema': 1, 'status': 'failed', 'source_sha256': source_sha(),
              'node_image': NODE_IMAGE, 'python_image': PYTHON_IMAGE}
    with tempfile.TemporaryDirectory(prefix='config-projection-lab-') as directory:
        cluster = Cluster(directory)
        report['cluster'] = cluster.name
        try:
            report['toolchain'] = toolchain()
            run(cluster, report)
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
        print(f'config_projection_lab: {error}', file=sys.stderr)
        sys.exit(1)
