#!/usr/bin/env python3
"""Exercise upstream hostpath CSI dynamic provisioning and reclaim on owned kind."""
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
WRITER_SHA = 'a18f10c3cec6912174400bd09991ff37fe88e29dc84c89472d28c0ad5fe8bc9f'
PYTHON_IMAGE = 'docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431'
CSI_RELEASE = 'v1.19.0'
CSI_COMMIT = '6fab18ae4fc4f486193b618114eeb817d9929242'
CSI_DRIVER = 'hostpath.csi.k8s.io'
TOPOLOGY = 'topology.hostpath.csi/node'
NS, CLASS, CLAIM = 'csi-lab', 'csi-lab-wffc-delete', 'app-data'
BACKEND = '/var/lib/csi-hostpath-data/'
POD_NAMES = ('writer', 'replacement')
RAW = 'https://raw.githubusercontent.com/kubernetes-csi/'
DEPLOY = f'csi-driver-host-path/{CSI_COMMIT}/deploy/kubernetes-1.35/hostpath/'
MANIFESTS = {
    'attacher': ('external-attacher/v4.13.0/deploy/kubernetes/rbac.yaml',
                 '3a38b5198b0496927c0ce26c63e71d43e2263e2dbbb93a83acdec71d7c90a766'),
    'provisioner': ('external-provisioner/v6.4.0/deploy/kubernetes/rbac.yaml',
                    '0ee8427b746a1d3b695705b74c2d7fb165121110b1a10c0b6e204918d93e814f'),
    'driver': (DEPLOY + 'csi-hostpath-driverinfo.yaml',
               '464307265464b77189bd4b339774cd2de69589458a62a740028b248f248c7e9a'),
    'plugin': (DEPLOY + 'csi-hostpath-plugin.yaml',
               'c3d075ee1dd17fa2b93d0ea216cd94d47b57f1f825210d0ca101607c58f9fdfa'),
}
# Official registry linux/amd64 child manifests, independently checked by digest.
IMAGES = {
    'hostpath': ('hostpathplugin:v1.18.0', '9551271b5f9691832fead371f2930d56a7afc15ee76a05955624cf1c5e791768'),
    'node-driver-registrar': ('csi-node-driver-registrar:v2.18.0', '692a30d9f27d32a25ea2784d01251b73e189e9d1156dd43c58f87ad2b70ec1e6'),
    'liveness-probe': ('livenessprobe:v2.20.0', 'c3dc967a4d8b18655e14bab5553017f850fda96221b8b0d2abfd9f6213c30f35'),
    'csi-attacher': ('csi-attacher:v4.13.0', '3998c70f02511068e879b2222d7d4943db86fe044dd311f7bbb90812f778ad82'),
    'csi-provisioner': ('csi-provisioner:v6.4.0', '7f4a41ea3d53b00331db3a7f04cffb4444ffba68008e8c15da33ecfb656288db'),
}

WORKER = r'''
import hashlib, json, sqlite3, subprocess, sys
from pathlib import Path

db = Path('/data/counter.sqlite')
mode = sys.argv[1]
mounts = [line.split()[4] for line in Path('/proc/self/mountinfo').read_text().splitlines()]
if '/data' not in mounts:
    raise RuntimeError('/data is missing from the process mount table')
row = {'mount_path': '/data', 'existed': db.is_file()}
if mode == 'writer':
    if row['existed']:
        raise RuntimeError('the fresh dynamic volume already has a database')
    ops = ['write-1']
else:
    row['sha_before'] = hashlib.sha256(db.read_bytes()).hexdigest()
    con = sqlite3.connect('file:/data/counter.sqlite?mode=ro', uri=True)
    try:
        row['counter_before'] = con.execute('SELECT value FROM counter WHERE id=1').fetchone()[0]
        row['receipts_before'] = con.execute('SELECT op,before,after FROM receipt ORDER BY op').fetchall()
    finally:
        con.close()
    ops = ['write-1', 'write-2']
row['results'] = [
    json.loads(subprocess.check_output([sys.executable, '/source/volume_writer.py',
                                        '--db', str(db), '--op', op], text=True))
    for op in ops
]
row['sha_after'] = hashlib.sha256(db.read_bytes()).hexdigest()
print(json.dumps(row))
'''


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_sha():
    return sha(Path(__file__).read_bytes())


def image(tag, digest):
    return f'registry.k8s.io/sig-storage/{tag}@sha256:{digest}'


def command(*args, env=None, stdin=None, timeout=90):
    result = subprocess.run(args, input=stdin, text=True, capture_output=True, env=env, timeout=timeout)
    require(result.returncode == 0,
            f'{args[0]} {args[1]} exited {result.returncode}: {(result.stderr or result.stdout)[-3500:]}')
    return result.stdout


def preflight():
    require(sys.platform == 'linux', 'a Linux amd64 Docker host is required')
    for tool in ('docker', 'kind', 'kubectl'):
        require(shutil.which(tool), f'{tool} is required')
    require(not os.getenv('DOCKER_HOST') and not os.getenv('DOCKER_CONTEXT'), 'unset Docker endpoint overrides')
    endpoint = command('docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}').strip()
    require(endpoint in ('unix:///var/run/docker.sock', 'unix:///run/docker.sock'),
            'only standard local Docker sockets are supported')
    engine = command('docker', 'info', '--format', '{{.OSType}} {{.Architecture}} {{.KernelVersion}}').strip()
    require(engine.startswith(('linux x86_64 ', 'linux amd64 ')), 'a Linux amd64 Docker engine is required')
    kind = command('kind', 'version').strip()
    kubectl = json.loads(command('kubectl', 'version', '--client', '-o', 'json'))['clientVersion']['gitVersion']
    require(kind.split()[:2] == ['kind', KIND] and kubectl == K8S, 'unexpected kind or kubectl version')
    return {'kind': kind, 'kubectl': kubectl, 'docker_engine': engine}


def install_inputs():
    inputs = {}
    for name, (path, expected) in MANIFESTS.items():
        with urlopen(RAW + path, timeout=40) as response:
            data = response.read(1024 * 1024)
        require(sha(data) == expected, f'{name} upstream manifest SHA256 mismatch')
        inputs[name] = data.decode('utf-8')
    # Keep the upstream controller/node Pod and needed RBAC. Snapshot and resize
    # sidecars and their bindings belong to separate feature experiments.
    omit = {'resizer-cluster-role', 'snapshotter-cluster-role',
            'snapshot-metadata-cluster-role', 'resizer-role', 'snapshotter-role'}
    docs = []
    dropped = set()
    for doc in inputs['plugin'].split('\n---\n'):
        name = re.search(r'^  name: csi-hostpathplugin-([\w-]+)$', doc, re.MULTILINE)
        if name and name[1] in omit:
            dropped.add(name[1])
        else:
            docs.append(doc)
    require(dropped == omit, 'unexpected upstream plugin RBAC shape')
    plugin = '\n---\n'.join(docs)
    for name in ('csi-resizer', 'csi-snapshotter'):
        plugin, count = re.subn(rf'^        - name: {name}\n.*?(?=^        (?:- name: |# end csi containers))',
                                '', plugin, flags=re.MULTILINE | re.DOTALL)
        require(count == 1, f'unexpected upstream {name} shape')
    for tag, digest in IMAGES.values():
        old = f'image: registry.k8s.io/sig-storage/{tag}'
        require(plugin.count(old) == 1, f'unexpected upstream image {tag}')
        plugin = plugin.replace(old, 'image: ' + image(tag, digest))
    installed = re.findall(r'^ +image: (\S+)$', plugin, re.MULTILINE)
    require(set(installed) == {image(*entry) for entry in IMAGES.values()} and len(installed) == len(IMAGES),
            'unexpected upstream image set')
    return {**inputs, 'plugin': plugin}


def poll(read, ready, label, seconds=90):
    deadline = time.monotonic() + seconds
    while True:
        result = read()
        if ready(result):
            return result
        if time.monotonic() >= deadline:
            raise RuntimeError(f'timed out waiting for {label}')
        time.sleep(1)


class Cluster:
    def __init__(self, directory):
        self.name = 'csi-' + uuid.uuid4().hex[:12]
        self.node = self.name + '-control-plane'
        self.config = str(Path(directory) / 'kubeconfig')
        self.env = dict(os.environ, KUBECONFIG=self.config, KIND_EXPERIMENTAL_PROVIDER='docker')
        self.env.pop('KIND_EXPERIMENTAL_DOCKER_NETWORK', None)
        self.owned = False

    def kc(self, *args, stdin=None, timeout=90):
        return command('kubectl', '--kubeconfig', self.config, '--context', 'kind-' + self.name,
                       *args, env=self.env, stdin=stdin, timeout=timeout)

    def get(self, resource, name=None, ns=None):
        args = ([] if ns is None else ['-n', ns]) + ['get', resource] + ([name] if name else [])
        return json.loads(self.kc(*args, '-o', 'json'))

    def create(self, obj):
        self.kc('create', '-f', '-', stdin=json.dumps(obj))

    def absent(self, resource, name, ns=None):
        args = [] if ns is None else ['-n', ns]
        return not self.kc(*args, 'get', resource, name, '--ignore-not-found', '-o', 'name').strip()

    def owned_nodes(self):
        return command('docker', 'ps', '-aq', '--filter', f'label=io.x-k8s.kind.cluster={self.name}',
                       env=self.env).split()

    def start(self):
        require(self.name not in command('kind', 'get', 'clusters', env=self.env).splitlines()
                and not self.owned_nodes(), 'random kind cluster name collision')
        self.owned = True
        config = json.dumps({'kind': 'Cluster', 'apiVersion': 'kind.x-k8s.io/v1alpha4',
                             'networking': {'apiServerAddress': '127.0.0.1'},
                             'nodes': [{'role': 'control-plane'}]})
        command('kind', 'create', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                '--image', NODE_IMAGE, '--config', '-', '--wait', '150s',
                env=self.env, stdin=config, timeout=330)
        require(command('kind', 'get', 'nodes', '--name', self.name, env=self.env).split() == [self.node],
                'unexpected kind node identity')
        require(len(self.owned_nodes()) == 1, 'unexpected Docker node inventory')
        self.kc('wait', '--for=condition=Ready', 'node', self.node, '--timeout=120s', timeout=135)

    def cleanup(self):
        if not self.owned:
            return {'attempted': False, 'owned_nodes_removed': False}
        command('kind', 'delete', 'cluster', '--name', self.name, '--kubeconfig', self.config,
                env=self.env, timeout=180)
        require(not self.owned_nodes(), 'owned Docker node containers remain')
        return {'attempted': True, 'owned_nodes_removed': True}

    def backend(self, handle):
        require(re.fullmatch(r'[a-f0-9-]{36}', handle), 'unexpected backend handle format')
        return BACKEND + handle


def obj(api, kind, name, ns=None, **fields):
    metadata = {'name': name}
    if ns:
        metadata['namespace'] = ns
    return {'apiVersion': api, 'kind': kind, 'metadata': metadata, **fields}


def pod(name):
    return obj('v1', 'Pod', name, NS, spec={
        'restartPolicy': 'Never', 'automountServiceAccountToken': False,
        'tolerations': [{'key': 'node-role.kubernetes.io/control-plane', 'operator': 'Exists', 'effect': 'NoSchedule'}],
        'containers': [{'name': 'app', 'image': PYTHON_IMAGE,
                        'command': ['python', '-c', 'import time; time.sleep(1200)'],
                        'volumeMounts': [{'name': 'data', 'mountPath': '/data'},
                                         {'name': 'source', 'mountPath': '/source', 'readOnly': True}]}],
        'volumes': [{'name': 'data', 'persistentVolumeClaim': {'claimName': CLAIM}},
                    {'name': 'source', 'configMap': {'name': 'writer-source'}}],
    })


def identity(o):
    return {k: o['metadata'][k] for k in ('name', 'uid')}


def binding(cluster):
    pvc = cluster.get('pvc', CLAIM, NS)
    pv = cluster.get('pv', pvc['spec']['volumeName'])
    ps = pv['spec']
    return {'pvc': {**identity(pvc), 'phase': pvc['status']['phase'], 'pv': pvc['spec']['volumeName']},
            'pv': {**identity(pv), 'phase': pv['status']['phase'], 'claim': ps['claimRef'],
                   'driver': ps['csi']['driver'], 'handle': ps['csi']['volumeHandle'],
                   'affinity': ps['nodeAffinity']['required']['nodeSelectorTerms'],
                   'reclaim': ps['persistentVolumeReclaimPolicy'],
                   'class': ps['storageClassName'], 'capacity': ps['capacity']['storage']}}


def mounted_pod(cluster, name):
    cluster.create(pod(name))
    cluster.kc('-n', NS, 'wait', '--for=condition=Ready', 'pod/' + name, '--timeout=180s', timeout=195)
    live = cluster.get('pod', name, NS)
    spec = live['spec']
    return {**identity(live), 'node': spec['nodeName'], 'phase': live['status']['phase'],
            'image_id': live['status']['containerStatuses'][0]['imageID'],
            'claim': next(v['persistentVolumeClaim']['claimName'] for v in spec['volumes'] if v['name'] == 'data'),
            'mount_path': next(v['mountPath'] for v in spec['containers'][0]['volumeMounts'] if v['name'] == 'data')}


def attachment(cluster, pv_name):
    matches = [a for a in cluster.get('volumeattachments')['items']
               if a['spec']['source'].get('persistentVolumeName') == pv_name]
    require(len(matches) == 1, 'expected one VolumeAttachment for the mounted PV')
    a = matches[0]
    return {**identity(a), 'pv': a['spec']['source']['persistentVolumeName'],
            'node': a['spec']['nodeName'], 'attacher': a['spec']['attacher'],
            'attached': a['status'].get('attached', False)}


def run(cluster, report, source, inputs):
    cluster.start()
    server = json.loads(cluster.kc('version', '-o', 'json'))['serverVersion']['gitVersion']
    require(server == K8S, 'unexpected Kubernetes server version')
    report['kubernetes_server'] = server
    report['node'] = identity(cluster.get('node', cluster.node))
    for data in inputs.values():
        cluster.kc('apply', '-f', '-', stdin=data)
    cluster.kc('-n', 'default', 'rollout', 'status', 'statefulset/csi-hostpathplugin', '--timeout=240s', timeout=255)
    driver = cluster.get('csidriver', CSI_DRIVER)
    driver_pod = cluster.get('pod', 'csi-hostpathplugin-0', 'default')
    drivers = poll(lambda: cluster.get('csinode', cluster.node)['spec']['drivers'],
                   lambda rows: any(row['name'] == CSI_DRIVER for row in rows), 'CSI node registration')
    registration = next(row for row in drivers if row['name'] == CSI_DRIVER)
    report['csi'] = {'driver': identity(driver), 'attach_required': driver['spec'].get('attachRequired', True),
                     'registration': registration, 'pod': identity(driver_pod),
                     'images': {s['name']: s['imageID'] for s in driver_pod['status']['containerStatuses']}}
    cluster.create(obj('v1', 'Namespace', NS))
    cluster.create(obj('storage.k8s.io/v1', 'StorageClass', CLASS, provisioner=CSI_DRIVER,
                       volumeBindingMode='WaitForFirstConsumer', reclaimPolicy='Delete'))
    storage_class = cluster.get('storageclass', CLASS)
    report['storage_class'] = {k: storage_class[k] for k in ('provisioner', 'volumeBindingMode', 'reclaimPolicy')}
    cluster.create(obj('v1', 'ConfigMap', 'writer-source', NS, data={'volume_writer.py': source}))
    cluster.create(obj('v1', 'PersistentVolumeClaim', CLAIM, NS,
                       spec={'storageClassName': CLASS, 'accessModes': ['ReadWriteOnce'],
                             'volumeMode': 'Filesystem', 'resources': {'requests': {'storage': '1Gi'}}}))
    claim_uid = cluster.get('pvc', CLAIM, NS)['metadata']['uid']
    events = lambda: json.loads(cluster.kc('-n', NS, 'get', 'events',
                                           '--field-selector', 'involvedObject.uid=' + claim_uid, '-o', 'json'))['items']
    pending = poll(events, lambda rows: any(e['reason'] == 'WaitForFirstConsumer' for e in rows),
                   'WaitForFirstConsumer event', 45)
    pvc = cluster.get('pvc', CLAIM, NS)
    report['before_consumer'] = {'pvc': identity(pvc), 'phase': pvc['status']['phase'],
                                 'volume_name': pvc['spec'].get('volumeName'),
                                 'claim_pvs': [pv['metadata']['name'] for pv in cluster.get('pv')['items']
                                               if pv['spec'].get('claimRef', {}).get('uid') == claim_uid],
                                 'event': next(e['reason'] for e in pending if e['reason'] == 'WaitForFirstConsumer')}
    report['consumers'] = []
    for name in POD_NAMES:
        item = {'pod': mounted_pod(cluster, name), 'binding': binding(cluster)}
        report['consumers'].append(item)
        pv = item['binding']['pv']
        item['attachment'] = attachment(cluster, pv['name'])
        item['data'] = json.loads(cluster.kc('-n', NS, 'exec', name, '-c', 'app', '--', 'python', '-c', WORKER, name))
        item['node_file_sha256'] = command('docker', 'exec', cluster.node, 'sha256sum',
                                          cluster.backend(pv['handle']) + '/counter.sqlite', env=cluster.env).split()[0]
        cluster.kc('-n', NS, 'delete', 'pod', name, '--wait=true', '--timeout=90s', timeout=105)
        item['pod_deleted'] = cluster.absent('pod', name, NS)
        require(item['pod_deleted'], f'{name} still exists')
    cluster.kc('-n', NS, 'delete', 'pvc', CLAIM, '--wait=true', '--timeout=90s', timeout=105)
    pv = report['consumers'][-1]['binding']['pv']
    poll(lambda: cluster.absent('pv', pv['name']), bool, 'Delete reclaim of the PV', 150)
    path = cluster.backend(pv['handle'])
    # A successful stat-before (above) and a successful shell test-after on the
    # same owned node distinguish backend removal from disappearance in the API.
    command('docker', 'exec', cluster.node, 'sh', '-ec', 'test ! -e "$1"', 'sh', path, env=cluster.env)
    report['reclaim'] = {'pvc_absent': cluster.absent('pvc', CLAIM, NS), 'pv_absent': True,
                         'pv_name': pv['name'], 'backend_path': path, 'backend_absent': True}


def verify(report):
    require(report['schema'] == 1 and report['status'] == 'passed', 'expected a complete native record')
    require(report['source_sha256'] == source_sha() and report['writer_sha256'] == WRITER_SHA,
            'source binding mismatch')
    require(report['csi_release'] == CSI_RELEASE and report['csi_commit'] == CSI_COMMIT
            and report['node_image'] == NODE_IMAGE and report['python_image'] == PYTHON_IMAGE
            and report['manifest_sha256'] == {name: pair[1] for name, pair in MANIFESTS.items()}, 'pin mismatch')
    require(report['toolchain']['kind'].split()[:2] == ['kind', KIND]
            and report['toolchain']['kubectl'] == K8S == report['kubernetes_server']
            and report['toolchain']['docker_engine'].startswith(('linux amd64 ', 'linux x86_64 ')), 'toolchain mismatch')
    node = report['node']['name']
    require(re.fullmatch(r'csi-[0-9a-f]{12}', report['cluster']) and node == report['cluster'] + '-control-plane'
            and report['node']['uid'], 'node identity mismatch')
    csi = report['csi']
    require(csi['driver']['name'] == CSI_DRIVER and csi['driver']['uid'] and csi['attach_required'] is True
            and csi['registration']['name'] == CSI_DRIVER and csi['registration']['nodeID'] == node
            and csi['registration']['topologyKeys'] == [TOPOLOGY]
            and csi['pod']['name'] == 'csi-hostpathplugin-0' and csi['pod']['uid'], 'CSI registration mismatch')
    require(set(csi['images']) == set(IMAGES)
            and all(csi['images'][name].endswith('@sha256:' + digest)
                    for name, (_, digest) in IMAGES.items()), 'CSI runtime image ID mismatch')
    require(report['storage_class'] == {'provisioner': CSI_DRIVER,
                                        'volumeBindingMode': 'WaitForFirstConsumer', 'reclaimPolicy': 'Delete'},
            'storage class mismatch')
    before = report['before_consumer']
    require(before['pvc']['name'] == CLAIM and before['pvc']['uid'] and before['phase'] == 'Pending'
            and before['volume_name'] is None and before['claim_pvs'] == []
            and before['event'] == 'WaitForFirstConsumer', 'missing delayed-binding observation')
    first, second = report['consumers']
    require(first['binding'] == second['binding'] and first['pod']['uid'] != second['pod']['uid'],
            'replacement must use the same PVC/PV/handle from a new Pod')
    bind = first['binding']
    pvc, pv = bind['pvc'], bind['pv']
    require(pvc == {**before['pvc'], 'phase': 'Bound', 'pv': pv['name']}
            and pv['phase'] == 'Bound' and pv['uid'] and pv['claim']['uid'] == pvc['uid']
            and pv['claim']['name'] == CLAIM and pv['claim']['namespace'] == NS
            and pv['driver'] == CSI_DRIVER and pv['class'] == CLASS and pv['reclaim'] == 'Delete'
            and pv['capacity'] == '1Gi' and re.fullmatch(r'[a-f0-9-]{36}', pv['handle']),
            'PVC to CSI backend identity mismatch')
    require(any(e == {'key': TOPOLOGY, 'operator': 'In', 'values': [node]}
                for term in pv['affinity'] for e in term.get('matchExpressions', [])), 'PV node affinity mismatch')
    for name, item in zip(POD_NAMES, (first, second)):
        live, attached, data = (item[k] for k in ('pod', 'attachment', 'data'))
        require(live['name'] == name and live['uid'] and live['phase'] == 'Running' and live['node'] == node
                and live['claim'] == CLAIM and live['mount_path'] == data['mount_path'] == '/data'
                and live['image_id'].endswith(PYTHON_IMAGE.split('@')[1])
                and item['pod_deleted'] is True, 'Pod mount/replacement mismatch')
        require(attached['name'] and attached['uid'] and attached['attached'] is True
                and attached['node'] == node and attached['pv'] == pv['name'] and attached['attacher'] == CSI_DRIVER,
                'native VolumeAttachment mismatch')
        require(re.fullmatch(r'[0-9a-f]{64}', data['sha_after'])
                and data['sha_after'] == item['node_file_sha256'], 'container and backend bytes differ')
    left, right = first['data'], second['data']
    require(left['existed'] is False and right['existed'] is True and right['sha_before'] == left['sha_after']
            and right['counter_before'] == 1 and right['receipts_before'] == [['write-1', 0, 1]]
            and right['sha_after'] != right['sha_before'], 'pre-write data identity mismatch')
    write1 = {'op': 'write-1', 'before': 0, 'after': 1, 'duplicate': False, 'current_counter': 1}
    write2 = {'op': 'write-2', 'before': 1, 'after': 2, 'duplicate': False, 'current_counter': 2}
    require(left['results'] == [write1] and right['results'] == [{**write1, 'duplicate': True}, write2],
            'SQLite effects do not match the unchanged writer')
    require(report['reclaim'] == {'pvc_absent': True, 'pv_absent': True, 'pv_name': pv['name'],
                                  'backend_path': BACKEND + pv['handle'], 'backend_absent': True}
            and report['cleanup'] == {'attempted': True, 'owned_nodes_removed': True}, 'reclaim or cleanup unverified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--writer', type=Path, help='unchanged storage-quant-context/volume_writer.py')
    parser.add_argument('--output', type=Path, help='also save the native or failed run record')
    parser.add_argument('--check-record', type=Path, help='check a saved native record without Docker or network')
    args = parser.parse_args()
    if args.check_record:
        if args.writer or args.output:
            parser.error('use --check-record alone')
        verify(json.loads(args.check_record.read_text(encoding='utf-8')))
        print('PASS native CSI delayed binding, same-volume Pod replacement, SQLite receipts and Delete reclaim')
        return 0
    if not args.writer:
        parser.error('--writer is required for a new native run')
    report = {'schema': 1, 'status': 'failed', 'source_sha256': source_sha(), 'writer_sha256': WRITER_SHA,
              'node_image': NODE_IMAGE, 'python_image': PYTHON_IMAGE, 'csi_release': CSI_RELEASE,
              'csi_commit': CSI_COMMIT, 'manifest_sha256': {name: pair[1] for name, pair in MANIFESTS.items()}}
    with tempfile.TemporaryDirectory(prefix='csi-storage-lab-') as directory:
        cluster = Cluster(directory)
        report['cluster'] = cluster.name
        try:
            source = args.writer.read_bytes()
            require(sha(source) == WRITER_SHA, 'unexpected volume_writer.py source')
            report['toolchain'] = preflight()
            run(cluster, report, source.decode('utf-8'), install_inputs())
            report['status'] = 'passed'
        except (Exception, KeyboardInterrupt) as exc:
            report['error'] = str(exc) or type(exc).__name__
            if cluster.owned and Path(cluster.config).is_file():
                try:
                    report['events_tail'] = cluster.kc('get', 'events', '-A', '--sort-by=.lastTimestamp',
                                                       timeout=15)[-7500:]
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
        print(f'csi_storage_lab: {error}', file=sys.stderr)
        sys.exit(1)
