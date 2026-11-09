#!/usr/bin/env python3
"""Run fresh TCP and DNS probes against real Cilium NetworkPolicy on owned kind nodes."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
import uuid

KIND_VERSION = '0.33.0'
K8S_VERSION = 'v1.35.8'
NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
CILIUM_VERSION = '1.20.4'
CHART_URL = f'https://helm.cilium.io/cilium-{CILIUM_VERSION}.tgz'
CHART_SHA = '505abff8385811df1a949776fc42e9f10697989a332acc86d6e8933efcb855ed'
# Pin the official linux/amd64 image manifest directly.
PYTHON_IMAGE = 'docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431'
NS, PORT = 'policy-lab', 8080
CLIENTS = ('trusted', 'untrusted')
INGRESS, DENY, ALLOW = 'ingress-trusted', 'egress-isolate-trusted', 'egress-orders-trusted'
# (policy names, trusted DNS/HTTP, untrusted DNS/HTTP)
STAGES = {
    'baseline': ((), ('answer', 'ok'), ('answer', 'ok')),
    'ingress_trusted': ((INGRESS,), ('answer', 'ok'), ('answer', 'tcp_timeout')),
    'trusted_egress_isolated': ((DENY, INGRESS), ('gaierror', 'tcp_timeout'), ('answer', 'tcp_timeout')),
    'trusted_orders_only': ((DENY, ALLOW, INGRESS), ('gaierror', 'ok'), ('answer', 'tcp_timeout')),
    'allow_removed': ((DENY, INGRESS), ('gaierror', 'tcp_timeout'), ('answer', 'tcp_timeout')),
    'egress_isolation_removed': ((INGRESS,), ('answer', 'ok'), ('answer', 'tcp_timeout')),
    'all_policies_removed': ((), ('answer', 'ok'), ('answer', 'ok')),
}

SERVER = r'''
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json, os
class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def do_GET(self):
        if self.path != '/order':
            self.send_error(404)
            return
        body = json.dumps({'order': 'O-104', 'amount': 37, 'pod_name': os.environ['POD_NAME'],
                           'pod_uid': os.environ['POD_UID'], 'pod_ip': os.environ['POD_IP'],
                           'request_id': self.headers.get('X-Request-ID', '')}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True
    def log_message(self, *_):
        pass
ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
'''

PROBE = r'''
import http.client, json, os, socket, sys
from pathlib import Path
target, fqdn, request_id = sys.argv[1:]
row = {'request_id': request_id, 'client_uid': os.environ['POD_UID'], 'pod_ip_target': target,
       'dns': {'name': fqdn, 'resolv_conf': Path('/etc/resolv.conf').read_text()}}
try:
    answers = socket.getaddrinfo(fqdn, None, socket.AF_INET, socket.SOCK_STREAM)
    row['dns'].update(status='answer', ipv4=sorted({x[4][0] for x in answers}))
except socket.gaierror as exc:
    row['dns'].update(status='gaierror', ipv4=[], errno=exc.errno, message=str(exc))
# Use the numeric Pod IP on a new socket. The DNS result cannot change this request.
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
    conn.settimeout(1.2)
    try:
        conn.connect((target, 8080))
    except TimeoutError:
        row['http'] = {'status': 'tcp_timeout'}
    except OSError as exc:
        row['http'] = {'status': 'tcp_error', 'error': str(exc), 'errno': exc.errno}
    else:
        row['http'] = {'local': list(conn.getsockname()), 'peer': list(conn.getpeername())}
        try:
            request = ('GET /order HTTP/1.1\r\nHost: orders.policy-lab\r\nConnection: close\r\n'
                       'X-Request-ID: ' + request_id + '\r\n\r\n').encode('ascii')
            conn.sendall(request)
            response = http.client.HTTPResponse(conn)
            response.begin()
            row['http'].update(status='ok', code=response.status, body=json.loads(response.read(4096)))
        except (OSError, ValueError, http.client.HTTPException) as exc:
            row['http'].update(status='http_error', error=str(exc))
print(json.dumps(row, separators=(',', ':')))
'''


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def source_sha():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def command(args, *, env=None, stdin=None, timeout=90):
    result = subprocess.run(args, input=stdin, text=True, capture_output=True, env=env, timeout=timeout)
    if result.returncode:
        tail = (result.stderr or result.stdout)[-5000:]
        # Only show the command prefix. An exec argument may contain the whole probe source.
        raise RuntimeError(f'{args[0]} {args[1]} exited {result.returncode}: {tail}')
    return result.stdout


def preflight():
    require(platform.system() == 'Linux', 'use Linux Docker and kind')
    for tool in ('docker', 'kind', 'kubectl', 'helm'):
        require(shutil.which(tool), f'{tool} is required')
    require(not os.getenv('DOCKER_HOST') and not os.getenv('DOCKER_CONTEXT'), 'unset Docker endpoint overrides')
    endpoint = command(['docker', 'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).strip()
    permitted = {'unix:///var/run/docker.sock', 'unix:///run/docker.sock',
                 f'unix:///run/user/{os.getuid()}/docker.sock'}
    require(endpoint in permitted, 'only the standard local Linux Docker sockets are supported')
    version = command(['kind', 'version']).strip()
    require(re.search(r'\bv' + re.escape(KIND_VERSION) + r'\b', version), 'unexpected kind version')
    kubectl = json.loads(command(['kubectl', 'version', '--client', '-o', 'json']))['clientVersion']['gitVersion']
    require(kubectl == K8S_VERSION, 'unexpected kubectl version')
    helm = command(['helm', 'version', '--short']).strip()
    match = re.search(r'v(\d+)\.(\d+)\.(\d+)', helm)
    require(match and tuple(map(int, match.groups())) >= (3, 13, 0), 'Helm >=3.13.0 required')
    engine = command(['docker', 'info', '--format', '{{.OSType}} {{.Architecture}} {{.KernelVersion}}']).strip()
    require(engine.startswith(('linux x86_64 ', 'linux amd64 ')), 'Linux amd64 Docker engine required')
    return {'kind': version, 'kubectl': kubectl, 'helm': helm, 'docker_kernel': engine}


def fetch_chart(path):
    with urlopen(CHART_URL, timeout=60) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    require(len(data) <= 8 * 1024 * 1024 and hashlib.sha256(data).hexdigest() == CHART_SHA,
            'Cilium chart archive checksum mismatch')
    path.write_bytes(data)


class Cluster:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.name = 'np-' + uuid.uuid4().hex[:12]
        self.context = 'kind-' + self.name
        self.kubeconfig = str(self.directory / 'kubeconfig')
        self.env = dict(os.environ, KUBECONFIG=self.kubeconfig, KIND_EXPERIMENTAL_PROVIDER='docker',
                        HELM_CONFIG_HOME=str(self.directory / 'helm-config'),
                        HELM_CACHE_HOME=str(self.directory / 'helm-cache'),
                        HELM_DATA_HOME=str(self.directory / 'helm-data'))
        self.env.pop('KIND_EXPERIMENTAL_DOCKER_NETWORK', None)
        self.owned = False

    def kubectl(self, *args, stdin=None, timeout=90):
        return command(['kubectl', '--kubeconfig', self.kubeconfig, '--context', self.context, *args],
                       env=self.env, stdin=stdin, timeout=timeout)

    def get(self, resource, name=None, namespace=NS, *extra):
        ns = ['-n', namespace] if namespace else []
        return json.loads(self.kubectl(*ns, 'get', resource, *([name] if name else []), *extra, '-o', 'json'))

    def apply(self, value):
        self.kubectl('apply', '-f', '-', stdin=json.dumps(value))

    def start(self, chart):
        names = command(['kind', 'get', 'clusters'], env=self.env).splitlines()
        require(self.name not in names, 'random cluster name collision')
        cfg = {'kind': 'Cluster', 'apiVersion': 'kind.x-k8s.io/v1alpha4',
               'networking': {'disableDefaultCNI': True, 'apiServerAddress': '127.0.0.1'},
               'nodes': [{'role': role, 'image': NODE_IMAGE} for role in ('control-plane', 'worker')]}
        # JSON is valid YAML. No config from the operator's existing cluster is loaded.
        cfg_path = self.directory / 'kind.json'
        cfg_path.write_text(json.dumps(cfg))
        self.owned = True  # Even a partial create must be cleaned up under this owned name.
        command(['kind', 'create', 'cluster', '--name', self.name, '--kubeconfig', self.kubeconfig,
                 '--config', str(cfg_path), '--retain'], env=self.env, timeout=420)
        command(['helm', '--kubeconfig', self.kubeconfig, '--kube-context', self.context,
                 'install', 'cilium', str(chart), '--namespace', 'kube-system',
                 '--set', 'ipam.mode=kubernetes', '--set', 'kubeProxyReplacement=false',
                 '--set', 'operator.replicas=1', '--set', 'envoy.enabled=false',
                 '--set', 'hubble.enabled=false', '--wait', '--timeout', '6m'], env=self.env, timeout=400)
        self.kubectl('wait', '--for=condition=Ready', 'node', '--all', '--timeout=150s', timeout=170)
        self.kubectl('-n', 'kube-system', 'rollout', 'status', 'deployment/coredns', '--timeout=150s', timeout=170)

    def cleanup(self):
        if not self.owned:
            return {'attempted': False, 'owned_nodes_removed': False}
        command(['kind', 'delete', 'cluster', '--name', self.name, '--kubeconfig', self.kubeconfig],
                env=self.env, timeout=180)
        remains = command(['docker', 'ps', '-a', '--filter', f'label=io.x-k8s.kind.cluster={self.name}',
                           '--format', '{{.ID}}'], env=self.env).strip()
        require(not remains, 'owned kind node containers remain after delete')
        return {'attempted': True, 'owned_nodes_removed': True}


def pod(name, node):
    labels = {'app': 'orders'} if name == 'orders' else {'app': 'client', 'access': name}
    env = [{'name': key, 'valueFrom': {'fieldRef': {'fieldPath': field}}}
           for key, field in [('POD_UID', 'metadata.uid'), ('POD_NAME', 'metadata.name'), ('POD_IP', 'status.podIP')]]
    container = {'name': 'fixture', 'image': PYTHON_IMAGE, 'imagePullPolicy': 'IfNotPresent',
                 'env': env, 'securityContext': {'allowPrivilegeEscalation': False, 'capabilities': {'drop': ['ALL']}},
                 'command': ['python3', '-u', '-c', SERVER if name == 'orders' else 'import time; time.sleep(3600)']}
    if name == 'orders':
        container['readinessProbe'] = {'exec': {'command': ['python3', '-c',
            "import socket; socket.create_connection(('127.0.0.1',8080),1).close()"]}, 'periodSeconds': 2}
    else:
        container['env'].append({'name': 'RES_OPTIONS', 'value': 'timeout:1 attempts:1'})
    return {'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'name': name, 'namespace': NS, 'labels': labels},
            'spec': {'nodeName': node, 'automountServiceAccountToken': False, 'restartPolicy': 'Never',
                     'terminationGracePeriodSeconds': 0, 'containers': [container]}}


def policy(name, selected, direction, rules):
    return {'apiVersion': 'networking.k8s.io/v1', 'kind': 'NetworkPolicy',
            'metadata': {'name': name, 'namespace': NS},
            'spec': {'podSelector': {'matchLabels': selected}, 'policyTypes': [direction], direction.lower(): rules}}


def policies():
    client = {'app': 'client', 'access': 'trusted'}
    server = {'app': 'orders'}
    port = [{'protocol': 'TCP', 'port': PORT}]
    return {INGRESS: policy(INGRESS, server, 'Ingress', [{'from': [{'podSelector': {'matchLabels': client}}], 'ports': port}]),
            DENY: policy(DENY, client, 'Egress', []),
            ALLOW: policy(ALLOW, client, 'Egress', [{'to': [{'podSelector': {'matchLabels': server}}], 'ports': port}])}


def inventory(cluster):
    pods = {}
    for raw in cluster.get('pods')['items']:
        meta, spec, status = raw['metadata'], raw['spec'], raw['status']
        pods[meta['name']] = {'uid': meta['uid'], 'node': spec['nodeName'], 'ip': status['podIP'],
                              'labels': meta['labels'], 'image_id': status['containerStatuses'][0]['imageID'],
                              'restart_count': status['containerStatuses'][0]['restartCount']}
    endpoints = {}
    for raw in cluster.get('ciliumendpoints.cilium.io')['items']:
        meta, status = raw['metadata'], raw.get('status', {})
        endpoints[meta['name']] = {'uid': meta['uid'], 'identity': status.get('identity', {}).get('id'),
                                   'addresses': status.get('networking', {}).get('addressing', [])}
    svc = cluster.get('service', 'orders')
    slices = cluster.get('endpointslices.discovery.k8s.io', None, NS, '-l', 'kubernetes.io/service-name=orders')
    backends = [{'addresses': e['addresses'], 'target_uid': e.get('targetRef', {}).get('uid'),
                 'ready': e.get('conditions', {}).get('ready')}
                for obj in slices['items'] for e in obj['endpoints']]
    return {'pods': pods, 'cilium_endpoints': endpoints,
            'service': {'uid': svc['metadata']['uid'], 'cluster_ip': svc['spec']['clusterIP'], 'backends': backends}}


def verify_inventory(inv):
    pods, endpoints, service = inv['pods'], inv['cilium_endpoints'], inv['service']
    require(set(pods) == set(endpoints) == {'orders', *CLIENTS}, 'unexpected fixture inventory')
    require(len({p['uid'] for p in pods.values()}) == len({p['ip'] for p in pods.values()}) == 3,
            'fixture identity or address is shared')
    require(pods['trusted']['node'] == pods['untrusted']['node'] != pods['orders']['node'], 'expected cross-node topology')
    require(pods['orders']['labels']['app'] == 'orders' and all(pods[x]['labels']['access'] == x for x in CLIENTS),
            'fixture selector identity mismatch')
    for name, p in pods.items():
        require(ipaddress.ip_address(p['ip']).version == 4 and p['restart_count'] == 0, 'unexpected pod state')
        ep = endpoints[name]
        require(isinstance(ep['identity'], int) and ep['identity'] > 0 and
                p['ip'] in [address.get('ipv4') for address in ep['addresses']], 'missing Cilium endpoint identity/address')
    require(ipaddress.ip_address(service['cluster_ip']).version == 4 and service['cluster_ip'] != pods['orders']['ip'],
            'Service ClusterIP and backend Pod IP must differ')
    require(service['backends'] == [{'addresses': [pods['orders']['ip']], 'target_uid': pods['orders']['uid'], 'ready': True}],
            'ready EndpointSlice target does not match the orders Pod')


def snapshot_when_ready(cluster):
    end = time.monotonic() + 60
    last = 'no inventory'
    while time.monotonic() < end:
        try:
            inv = inventory(cluster)
            verify_inventory(inv)
            return inv
        except (KeyError, RuntimeError) as exc:
            last = str(exc)
            time.sleep(1)
    raise RuntimeError('fixture endpoints did not converge: ' + last)


def evaluate_pair(probes, inv, stage):
    _, *expected = STAGES[stage]
    pods, svc = inv['pods'], inv['service']
    for client, (dns_state, http_state) in zip(CLIENTS, expected):
        row = probes[client]
        if row['client_uid'] != pods[client]['uid'] or row['pod_ip_target'] != pods['orders']['ip']:
            return False
        dns, http = row['dns'], row['http']
        if (dns['status'], http['status']) != (dns_state, http_state):
            return False
        if dns['name'] != f'orders.{NS}.svc.cluster.local.' or dns['ipv4'] != ([svc['cluster_ip']] if dns_state == 'answer' else []):
            return False
        if http_state == 'ok':
            server = pods['orders']
            if http['code'] != 200 or http['local'][0] != pods[client]['ip'] or http['peer'] != [server['ip'], PORT]:
                return False
            if http['body'] != {'order': 'O-104', 'amount': 37, 'pod_name': 'orders', 'pod_uid': server['uid'],
                                'pod_ip': server['ip'], 'request_id': row['request_id']}:
                return False
    return True


def observe(cluster, inv, stage, report):
    names = STAGES[stage][0]
    actual = {p['metadata']['name']: {'uid': p['metadata']['uid'], 'spec': p['spec']}
              for p in cluster.get('networkpolicy')['items']}
    require(set(actual) == set(names), f'{stage}: wrong API policies')
    state = {'name': stage, 'policies': actual, 'attempts': []}
    report['stages'].append(state)
    print(f'observe {stage}', file=sys.stderr, flush=True)
    stable, deadline = 0, time.monotonic() + 90
    while time.monotonic() < deadline:
        pair = {}
        for client in CLIENTS:
            rid = uuid.uuid4().hex
            output = cluster.kubectl('-n', NS, 'exec', client, '--', 'python3', '-c', PROBE,
                                     inv['pods']['orders']['ip'], f'orders.{NS}.svc.cluster.local.', rid, timeout=40)
            pair[client] = json.loads(output)
        state['attempts'].append(pair)
        stable = stable + 1 if evaluate_pair(pair, inv, stage) else 0
        if stable == 2:
            return
        time.sleep(0.5)
    raise RuntimeError(f'{stage}: did not observe two matching rounds: {state["attempts"][-1]}')


def run(cluster, report):
    chart = cluster.directory / 'cilium.tgz'
    fetch_chart(chart)
    cluster.start(chart)
    report['kubernetes_server'] = json.loads(cluster.kubectl('version', '-o', 'json'))['serverVersion']['gitVersion']
    require(report['kubernetes_server'] == K8S_VERSION, 'unexpected Kubernetes server version')
    agents = cluster.get('pods', None, 'kube-system', '-l', 'k8s-app=cilium')['items']
    report['cilium_agents'] = []
    for agent in agents:
        name = agent['metadata']['name']
        image = next(x for x in agent['status']['containerStatuses'] if x['name'] == 'cilium-agent')
        version = cluster.kubectl('-n', 'kube-system', 'exec', name, '-c', 'cilium-agent', '--', 'cilium-dbg', 'version').strip()
        require(CILIUM_VERSION in version and image['ready'], 'unexpected Cilium agent state/version')
        report['cilium_agents'].append({'pod': name, 'node': agent['spec']['nodeName'], 'image': image['image'],
                                        'image_id': image['imageID'], 'version': version})
    require(len(report['cilium_agents']) == 2, 'expected two Cilium agents')
    cluster.apply({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': NS}})
    for name in ('orders', *CLIENTS):
        cluster.apply(pod(name, cluster.name + ('-worker' if name == 'orders' else '-control-plane')))
    cluster.apply({'apiVersion': 'v1', 'kind': 'Service', 'metadata': {'name': 'orders', 'namespace': NS},
                   'spec': {'selector': {'app': 'orders'}, 'ports': [{'port': 80, 'targetPort': PORT}]}})
    cluster.kubectl('-n', NS, 'wait', '--for=condition=Ready', 'pod', '--all', '--timeout=180s', timeout=200)
    report['inventory'] = inv = snapshot_when_ready(cluster)
    p = policies()
    for stage, edit in [('baseline', None), ('ingress_trusted', (True, INGRESS)),
                        ('trusted_egress_isolated', (True, DENY)), ('trusted_orders_only', (True, ALLOW)),
                        ('allow_removed', (False, ALLOW)), ('egress_isolation_removed', (False, DENY)),
                        ('all_policies_removed', (False, INGRESS))]:
        if edit:
            create, name = edit
            if create:
                cluster.apply(p[name])
            else:
                cluster.kubectl('-n', NS, 'delete', 'networkpolicy', name)
        observe(cluster, inv, stage, report)
    report['final_inventory'] = inventory(cluster)


def verify(report):
    require(report['schema'] == 1 and report['status'] == 'passed' and report['source_sha256'] == source_sha(),
            'record scope/source/status mismatch')
    require(report['kubernetes_server'] == K8S_VERSION and report['chart_sha256'] == CHART_SHA and
            report['node_image'] == NODE_IMAGE and report['python_image'] == PYTHON_IMAGE, 'fixture lock mismatch')
    inv = report['inventory']
    verify_inventory(inv)
    require(inv == report['final_inventory'], 'fixture changed during policy stages')
    agents = report['cilium_agents']
    require(len(agents) == 2 and {a['node'] for a in agents} == {p['node'] for p in inv['pods'].values()} and
            all(CILIUM_VERSION in a['version'] and a['image_id'] for a in agents), 'Cilium agent evidence missing')
    require([s['name'] for s in report['stages']] == list(STAGES), 'missing or reordered stage')
    expected_specs = {name: p['spec'] for name, p in policies().items()}
    all_ids, policy_uids = set(), {}
    for stage in report['stages']:
        name, attempts = stage['name'], stage['attempts']
        actual = stage['policies']
        require(set(actual) == set(STAGES[name][0]), f'{name}: wrong recorded policy set')
        for key, value in actual.items():
            spec = dict(value['spec'])
            if key == DENY:
                spec.setdefault('egress', [])  # API serialization may omit the empty slice.
            require(spec == expected_specs[key] and value['uid'], f'{name}: wrong policy spec')
            require(policy_uids.setdefault(key, value['uid']) == value['uid'], f'{name}: policy identity changed')
        require(len(attempts) >= 2 and all(evaluate_pair(pair, inv, name) for pair in attempts[-2:]),
                f'{name}: incorrect stable outcomes')
        for pair in attempts:
            require(set(pair) == set(CLIENTS), f'{name}: missing probe')
            for row in pair.values():
                rid = row['request_id']
                require(re.fullmatch(r'[a-f0-9]{32}', rid) and rid not in all_ids, f'{name}: reused request identity')
                all_ids.add(rid)
    require(report['cleanup'] == {'attempted': True, 'owned_nodes_removed': True}, 'owned teardown not verified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', type=Path, help='also write the run record here')
    parser.add_argument('--check-record', type=Path, help='verify a saved record without Docker, Helm or Kubernetes')
    args = parser.parse_args()
    if args.check_record:
        require(not args.json, 'choose --check-record or --json')
        record = json.loads(args.check_record.read_text())
        verify(record)
        print('PASS seven stages, Cilium and Kubernetes identities, fresh DNS/TCP probes and owned teardown')
        return 0
    record = {'schema': 1, 'status': 'failed', 'source_sha256': source_sha(), 'chart_sha256': CHART_SHA,
              'cilium_version_requested': CILIUM_VERSION, 'node_image': NODE_IMAGE, 'python_image': PYTHON_IMAGE,
              'stages': [], 'scope': 'two kind nodes on one local Linux Docker host; Cilium NetworkPolicy; fresh Pod-IP HTTP and separate Service DNS'}
    with tempfile.TemporaryDirectory(prefix='network-policy-lab-') as directory:
        cluster = Cluster(directory)
        record['cluster'] = cluster.name
        try:
            record['toolchain'] = preflight()
            run(cluster, record)
            record['status'] = 'passed'
        except (Exception, KeyboardInterrupt) as exc:
            record['error'] = str(exc) or type(exc).__name__
            if cluster.owned and Path(cluster.kubeconfig).is_file():
                try:
                    record['events_tail'] = cluster.kubectl('get', 'events', '-A', '--sort-by=.lastTimestamp', timeout=15)[-6000:]
                except Exception:
                    pass
        finally:
            try:
                record['cleanup'] = cluster.cleanup()
            except Exception as exc:
                record['cleanup'] = {'attempted': True, 'owned_nodes_removed': False, 'error': str(exc)}
                record['status'] = 'failed'
    if record['status'] == 'passed':
        try:
            verify(record)
        except Exception as exc:
            record.update(status='failed', error=str(exc))
    text = json.dumps(record, ensure_ascii=False, indent=2) + '\n'
    if args.json:
        args.json.write_text(text)
    sys.stdout.write(text)
    return 0 if record['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(f'network_policy_lab: {error}', file=sys.stderr)
        sys.exit(1)
