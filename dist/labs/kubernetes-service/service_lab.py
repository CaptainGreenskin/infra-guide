"""Observe probes, real ClusterIP requests, a template rollout and rollback in an owned kind cluster."""
import argparse
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import time
import uuid

NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
PYTHON_IMAGE = 'python:3.13.7-alpine3.22@sha256:9ba6d8cbebf0fb6546ae71f2a1c14f6ffd2fdab83af7fa5669734ef30ad48844'
NAMESPACE = 'service-lab'
SAMPLE_SIZE = 20
APP_CODE = r'''
import json,os,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
INSTANCE = uuid.uuid4().hex
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  path=urlsplit(self.path).path
  status=200
  if path=='/ready' and Path('/tmp/not-ready').exists():status=503
  elif path=='/live' and Path('/tmp/not-live').exists():status=503
  elif path not in ('/ready','/live','/work'):status=404
  body=json.dumps({'version':os.environ['APP_VERSION'],'pod_uid':os.environ['POD_UID'],
   'pod_name':os.environ['POD_NAME'],'instance_id':INSTANCE,'path':path,
   'request_id':self.headers.get('X-Request-ID',''),'status':status}).encode()
  self.send_response(status);self.send_header('Content-Type','application/json')
  self.send_header('Content-Length',str(len(body)));self.send_header('Connection','close')
  self.end_headers();self.wfile.write(body);self.close_connection=True
 def log_message(self,*args):pass
ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()
'''
CLIENT_CODE = r'''
import json,os,time,uuid,urllib.request,urllib.error
from pathlib import Path
url=os.environ['SERVICE_URL']
seq=0
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
while True:
 seq+=1
 phase=Path('/tmp/phase').read_text().strip() if Path('/tmp/phase').exists() else 'startup'
 request_id=uuid.uuid4().hex
 row={'seq':seq,'phase':phase,'request_id':request_id,'url':url,
      'started_at':time.time(),'new_connection':True}
 request=urllib.request.Request(url,headers={'X-Request-ID':request_id,'Connection':'close'})
 try:
  with opener.open(request,timeout=2) as response:
   row.update(status=response.status,body=json.load(response))
 except urllib.error.HTTPError as error:
  row.update(status=error.code,body=json.load(error));error.close()
 except Exception as error:
  row.update(status=None,error_type=type(error).__name__)
 row['completed_at']=time.time()
 print(json.dumps(row,separators=(',',':')),flush=True)
 time.sleep(.2)
'''


def source_sha():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def ready_uids(snapshot):
    return {row['pod_uid'] for row in snapshot['endpoints'] if row['conditions'].get('ready') is True}


def verify(o):
    """Use actual response identities and independent API observations, not command exit codes."""
    assert o['client']['path'] == 'in-cluster client Pod -> Service ClusterIP:80 -> Pod:8080'
    cluster_ip = o['client']['cluster_ip']
    assert ipaddress.ip_address(cluster_ip).is_private
    assert o['client']['service_url'] == 'http://' + cluster_ip + '/work'
    assert o['client']['environment_proxy_used'] is False
    assert o['client']['port_forward_used'] is False
    requests = o['requests']
    by_seq = {r['seq']: r for r in requests}
    assert len(by_seq) == len(requests) and len(requests) >= SAMPLE_SIZE * 6
    assert len({r['request_id'] for r in requests}) == len(requests)
    for row in requests:
        assert row['url'] == o['client']['service_url'] and row['new_connection'] is True
        assert row['completed_at'] >= row['started_at']
        if row.get('status') == 200:
            assert row['body']['request_id'] == row['request_id']
            assert row['body']['path'] == '/work' and row['body']['status'] == 200
    cases = o['cases']
    names = ('normal_v1', 'readiness_failed', 'readiness_recovered', 'liveness_restarted', 'rolled_v2', 'undo_v1')
    assert set(cases) == set(names)
    all_sample_ids = set()
    for name in names:
        case = cases[name]
        before, after = case['api_before'], case['api_after']
        assert before['service'] == after['service'] == o['service']
        assert before['service']['cluster_ip'] == cluster_ip
        assert len(before['pods']) == len(after['pods']) == 2
        assert {r['uid'] for r in before['pods']} == {r['uid'] for r in after['pods']}
        assert ready_uids(before) == ready_uids(after)
        samples = [by_seq[i] for i in case['sample_sequences']]
        assert len(samples) == SAMPLE_SIZE
        assert len(set(case['sample_sequences'])) == SAMPLE_SIZE
        assert not (all_sample_ids & set(case['sample_sequences']))
        all_sample_ids.update(case['sample_sequences'])
        assert case['sample_sequences'] == list(range(samples[0]['seq'], samples[0]['seq'] + SAMPLE_SIZE))
        assert all(r['phase'] == name and r['status'] == 200 for r in samples)
        expected = ready_uids(after)
        assert {r['body']['pod_uid'] for r in samples} == expected
        version = 'v2' if name == 'rolled_v2' else 'v1'
        assert all(r['body']['version'] == version for r in samples)
        for snapshot in (before, after):
            assert snapshot['deployment']['template_version'] == version
            assert snapshot['deployment']['observed_generation'] >= snapshot['deployment']['generation']
            for pod in snapshot['pods']:
                assert pod['version'] == version and pod['deleting'] is False
                endpoint = [e for e in snapshot['endpoints'] if e['pod_uid'] == pod['uid']]
                assert len(endpoint) == 1 and endpoint[0]['addresses'] == [pod['ip']]
                assert endpoint[0]['conditions'].get('ready') == pod['ready']
                assert endpoint[0]['conditions'].get('terminating', False) is False
        assert all(p['ready'] for p in after['pods']) if name != 'readiness_failed' else True
    normal = {p['uid']: p for p in cases['normal_v1']['api_after']['pods']}
    victim = o['readiness']['pod_uid']
    assert victim in normal and len(ready_uids(cases['normal_v1']['api_after'])) == 2
    for name in ('readiness_failed', 'readiness_recovered'):
        for snapshot in (cases[name]['api_before'], cases[name]['api_after']):
            assert {p['uid'] for p in snapshot['pods']} == set(normal)
            assert all(p['restart_count'] == normal[p['uid']]['restart_count'] for p in snapshot['pods'])
    failed = cases['readiness_failed']['api_after']
    assert ready_uids(failed) == set(normal) - {victim}
    assert next(p for p in failed['pods'] if p['uid'] == victim)['ready'] is False
    assert o['readiness']['direct_probe']['ready']['status'] == 503
    assert o['readiness']['direct_probe']['live']['status'] == 200
    assert o['readiness']['direct_probe']['work']['status'] == 200
    assert all(r['body']['pod_uid'] == victim for r in o['readiness']['direct_probe'].values())
    assert ready_uids(cases['readiness_recovered']['api_after']) == set(normal)
    restarted = {p['uid']: p for p in cases['liveness_restarted']['api_after']['pods']}
    assert set(restarted) == set(normal)
    assert restarted[victim]['restart_count'] == normal[victim]['restart_count'] + 1
    assert all(p['restart_count'] == normal[uid]['restart_count'] for uid,p in restarted.items() if uid != victim)
    assert o['liveness']['direct_probe']['live']['status'] == 503
    assert o['liveness']['direct_probe']['ready']['status'] == 200
    old_instance = o['readiness']['direct_probe']['work']['body']['instance_id']
    after_instances = {by_seq[i]['body']['instance_id'] for i in cases['liveness_restarted']['sample_sequences']
                       if by_seq[i]['body']['pod_uid'] == victim}
    assert len(after_instances) == 1 and old_instance not in after_instances
    v2 = cases['rolled_v2']['api_after']
    undo = cases['undo_v1']['api_after']
    assert ready_uids(v2).isdisjoint(set(normal)) and ready_uids(undo).isdisjoint(ready_uids(v2))
    assert o['rollout']['undo_to_revision'] == 1
    assert cases['normal_v1']['api_after']['deployment']['revision'] == '1'
    assert int(v2['deployment']['revision']) >= 2
    assert int(undo['deployment']['revision']) > int(v2['deployment']['revision'])


class Lab:
    def __init__(self):
        self.name = 'infra-service-' + uuid.uuid4().hex[:12]
        self.kubeconfig = None
        self.created = False
        self.stage = 'preflight'
        self.observation = {'cases': {}, 'requests': []}

    def command(self, *argv, data=None, check=True, timeout=180):
        result = subprocess.run(argv, input=data, text=True, capture_output=True, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError('Command failed at ' + self.stage + ' (exit ' + str(result.returncode) + ')')
        return result

    def k(self, *args, data=None):
        return self.command('kubectl', '--kubeconfig', str(self.kubeconfig), '--context', 'kind-' + self.name,
                            '--request-timeout=15s', '-n', NAMESPACE, *args, data=data)

    def apply(self, obj):
        self.k('apply', '-f', '-', data=json.dumps(obj))

    def get(self, resource, *args):
        return json.loads(self.k('get', resource, *args, '-o', 'json').stdout)

    def wait(self, predicate, description, seconds=150):
        self.stage = description
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = predicate()
            if value:
                return value
            time.sleep(.4)
        raise AssertionError('Deadline exceeded: ' + description)

    def snapshot(self):
        service = self.get('service', 'guide-service')
        deployment = self.get('deployment', 'guide-service')
        pods = self.get('pods', '-l', 'app=guide-service').get('items') or []
        slices = self.get('endpointslices.discovery.k8s.io', '-l', 'kubernetes.io/service-name=guide-service').get('items') or []
        result = {'service': {'uid': service['metadata']['uid'], 'cluster_ip': service['spec']['clusterIP'],
                             'port': service['spec']['ports'][0]['port'], 'target_port': service['spec']['ports'][0]['targetPort'],
                             'selector': service['spec']['selector'],
                             'publish_not_ready_addresses': service['spec'].get('publishNotReadyAddresses', False)},
            'deployment': {'uid': deployment['metadata']['uid'], 'generation': deployment['metadata']['generation'],
                'observed_generation': (deployment.get('status') or {}).get('observedGeneration', 0),
                'revision': (deployment['metadata'].get('annotations') or {}).get('deployment.kubernetes.io/revision', ''),
                'template_version': next(e['value'] for e in deployment['spec']['template']['spec']['containers'][0]['env'] if e['name'] == 'APP_VERSION')},
            'pods': [], 'endpoints': []}
        for pod in pods:
            status = pod.get('status') or {}
            statuses = status.get('containerStatuses') or []
            result['pods'].append({'name': pod['metadata']['name'], 'uid': pod['metadata']['uid'],
                'ip': status.get('podIP'), 'deleting': bool(pod['metadata'].get('deletionTimestamp')),
                'ready': any(c['type'] == 'Ready' and c['status'] == 'True' for c in (status.get('conditions') or [])),
                'restart_count': sum(c['restartCount'] for c in statuses),
                'version': next(e['value'] for e in pod['spec']['containers'][0]['env'] if e['name'] == 'APP_VERSION')})
        for slice_ in slices:
            for endpoint in (slice_.get('endpoints') or []):
                result['endpoints'].append({'slice_uid': slice_['metadata']['uid'], 'addresses': endpoint['addresses'],
                    'pod_uid': (endpoint.get('targetRef') or {}).get('uid'), 'conditions': endpoint.get('conditions') or {}})
        result['pods'].sort(key=lambda p: p['uid'])
        result['endpoints'].sort(key=lambda e: e['pod_uid'] or '')
        return result

    def converged(self, version, unavailable=None, restarts=None):
        s = self.snapshot()
        if len(s['pods']) != 2 or any(p['deleting'] or p['version'] != version or not p['ip'] for p in s['pods']):
            return False
        expected = {p['uid'] for p in s['pods'] if p['uid'] != unavailable}
        if ready_uids(s) != expected or len(s['endpoints']) != 2:
            return False
        if any(p['ready'] != (p['uid'] != unavailable) for p in s['pods']):
            return False
        if restarts and any(p['restart_count'] != restarts[p['uid']] for p in s['pods']):
            return False
        if s['deployment']['observed_generation'] < s['deployment']['generation']:
            return False
        return s

    def read_requests(self):
        lines = self.k('logs', 'service-client').stdout.splitlines()
        return [json.loads(line) for line in lines if line.strip()]

    def sample(self, case, snapshot, version):
        self.stage = 'sample real Service requests: ' + case
        self.k('exec', 'service-client', '--', 'python', '-c',
               "from pathlib import Path;Path('/tmp/phase.next').write_text(" + repr(case) + ");Path('/tmp/phase.next').replace('/tmp/phase')")
        expected = ready_uids(snapshot)
        def success():
            rows = [r for r in self.read_requests() if r['phase'] == case]
            tail = rows[-SAMPLE_SIZE:]
            if len(tail) != SAMPLE_SIZE:
                return False
            if not all(r.get('status') == 200 and r['body']['version'] == version and
                       r['body']['request_id'] == r['request_id'] and r['body']['pod_uid'] in expected for r in tail):
                return False
            if {r['body']['pod_uid'] for r in tail} != expected:
                return False
            return tail
        rows = self.wait(success, self.stage, 90)
        after = self.snapshot()
        self.observation['cases'][case] = {'api_before': snapshot, 'api_after': after,
            'sample_sequences': [r['seq'] for r in rows],
            'phase_requests_observed': len([r for r in self.read_requests() if r['phase'] == case])}

    def direct_probe(self, pod):
        # This is a named diagnostic from inside one Pod. It is never counted as Service traffic.
        script = """import json,urllib.request,urllib.error
result={}
for path in ('ready','live','work'):
 try:
  with urllib.request.urlopen('http://127.0.0.1:8080/'+path,timeout=3) as response:
   result[path]={'status':response.status,'body':json.load(response)}
 except urllib.error.HTTPError as error:
  result[path]={'status':error.code,'body':json.load(error)};error.close()
print(json.dumps(result))"""
        return json.loads(self.k('exec', pod, '--', 'python', '-c', script).stdout)

    def marker(self, pod, name, exists):
        self.k('exec', pod, '--', 'python', '-c',
               "from pathlib import Path;p=Path('/tmp/" + name + "');" + ("p.touch()" if exists else "p.unlink()"))

    def run(self, folder):
        assert platform.system() == 'Linux', 'Native lab requires Linux'
        for executable in ('docker', 'kind', 'kubectl'):
            assert shutil.which(executable), 'Missing ' + executable
        assert not os.environ.get('DOCKER_HOST'), 'DOCKER_HOST overrides are not accepted'
        assert not os.environ.get('KIND_EXPERIMENTAL_PROVIDER'), 'Use the Docker kind provider'
        endpoint = json.loads(self.command('docker', 'context', 'inspect').stdout)[0]['Endpoints']['docker']['Host']
        assert endpoint.startswith('unix://'), 'Only local Docker Unix sockets are accepted'
        assert self.name not in self.command('kind', 'get', 'clusters').stdout.splitlines()
        kind_version = self.command('kind', 'version').stdout.strip()
        assert kind_version.split()[1] == 'v0.33.0', 'Use pinned kind v0.33.0'
        client_version = json.loads(self.command('kubectl', 'version', '--client', '-o', 'json').stdout)['clientVersion']['gitVersion']
        assert client_version == 'v1.35.8', 'Use pinned kubectl v1.35.8'
        self.kubeconfig = folder / 'kubeconfig'
        self.stage = 'create owned cluster'
        self.created = True
        self.command('kind', 'create', 'cluster', '--name', self.name, '--kubeconfig', str(self.kubeconfig),
                     '--image', NODE_IMAGE, '--wait', '150s', timeout=400)
        self.kubeconfig.chmod(0o600)
        self.stage = 'prepare isolated objects'
        self.apply({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': NAMESPACE}})
        self.apply({'apiVersion': 'v1', 'kind': 'ConfigMap', 'metadata': {'name': 'service-code', 'namespace': NAMESPACE},
                    'data': {'app.py': APP_CODE, 'client.py': CLIENT_CODE}})
        pod_spec = {'automountServiceAccountToken': False, 'terminationGracePeriodSeconds': 5,
            'containers': [{'name': 'app', 'image': PYTHON_IMAGE, 'command': ['python', '-u', '/code/app.py'],
                'ports': [{'name': 'http', 'containerPort': 8080}],
                'env': [{'name': 'APP_VERSION', 'value': 'v1'},
                    {'name': 'POD_UID', 'valueFrom': {'fieldRef': {'fieldPath': 'metadata.uid'}}},
                    {'name': 'POD_NAME', 'valueFrom': {'fieldRef': {'fieldPath': 'metadata.name'}}}],
                'readinessProbe': {'httpGet': {'path': '/ready', 'port': 'http'}, 'periodSeconds': 1, 'failureThreshold': 1},
                'livenessProbe': {'httpGet': {'path': '/live', 'port': 'http'}, 'periodSeconds': 2, 'failureThreshold': 3},
                'resources': {'requests': {'cpu': '25m', 'memory': '24Mi'}, 'limits': {'memory': '96Mi'}},
                'volumeMounts': [{'name': 'code', 'mountPath': '/code', 'readOnly': True}]}],
            'volumes': [{'name': 'code', 'configMap': {'name': 'service-code'}}]}
        self.apply({'apiVersion': 'apps/v1', 'kind': 'Deployment', 'metadata': {'name': 'guide-service', 'namespace': NAMESPACE},
            'spec': {'replicas': 2, 'revisionHistoryLimit': 3, 'selector': {'matchLabels': {'app': 'guide-service'}},
                'strategy': {'type': 'RollingUpdate', 'rollingUpdate': {'maxUnavailable': 0, 'maxSurge': 1}},
                'template': {'metadata': {'labels': {'app': 'guide-service'}}, 'spec': pod_spec}}})
        self.apply({'apiVersion': 'v1', 'kind': 'Service', 'metadata': {'name': 'guide-service', 'namespace': NAMESPACE},
            'spec': {'selector': {'app': 'guide-service'}, 'ports': [{'port': 80, 'targetPort': 8080}]}})
        initial = self.wait(lambda: self.converged('v1'), 'initial ready Pods and EndpointSlices', 240)
        self.observation['service'] = initial['service']
        cluster_ip = initial['service']['cluster_ip']
        self.observation['client'] = {'path': 'in-cluster client Pod -> Service ClusterIP:80 -> Pod:8080',
            'cluster_ip': cluster_ip, 'service_url': 'http://' + cluster_ip + '/work',
            'environment_proxy_used': False, 'port_forward_used': False}
        self.apply({'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'name': 'service-client', 'namespace': NAMESPACE},
            'spec': {'automountServiceAccountToken': False, 'restartPolicy': 'Never',
                'containers': [{'name': 'client', 'image': PYTHON_IMAGE, 'command': ['python', '-u', '/code/client.py'],
                    'env': [{'name': 'SERVICE_URL', 'value': self.observation['client']['service_url']}],
                    'resources': {'requests': {'cpu': '10m', 'memory': '24Mi'}, 'limits': {'memory': '96Mi'}},
                    'volumeMounts': [{'name': 'code', 'mountPath': '/code', 'readOnly': True}]}],
                'volumes': [{'name': 'code', 'configMap': {'name': 'service-code'}}]}})
        self.k('wait', 'pod/service-client', '--for=condition=Ready', '--timeout=180s')
        self.sample('normal_v1', initial, 'v1')
        victim = initial['pods'][0]
        counts = {p['uid']: p['restart_count'] for p in initial['pods']}
        self.stage = 'inject readiness failure in one Pod'
        self.marker(victim['name'], 'not-ready', True)
        self.observation['readiness'] = {'pod_uid': victim['uid'], 'direct_probe': self.direct_probe(victim['name'])}
        failed = self.wait(lambda: self.converged('v1', victim['uid'], counts), 'wait Ready false and endpoint ready false')
        self.sample('readiness_failed', failed, 'v1')
        self.stage = 'recover same Pod readiness'
        self.marker(victim['name'], 'not-ready', False)
        recovered = self.wait(lambda: self.converged('v1', restarts=counts), 'wait same Pods recover readiness')
        self.sample('readiness_recovered', recovered, 'v1')
        self.stage = 'inject liveness failure separately'
        self.marker(victim['name'], 'not-live', True)
        self.observation['liveness'] = {'pod_uid': victim['uid'], 'direct_probe': self.direct_probe(victim['name'])}
        restarted_counts = dict(counts)
        restarted_counts[victim['uid']] += 1
        restarted = self.wait(lambda: self.converged('v1', restarts=restarted_counts), 'wait liveness restart and readiness recovery')
        self.sample('liveness_restarted', restarted, 'v1')
        self.stage = 'change Deployment template to v2'
        self.k('set', 'env', 'deployment/guide-service', 'APP_VERSION=v2')
        self.k('rollout', 'status', 'deployment/guide-service', '--timeout=180s')
        v2 = self.wait(lambda: self.converged('v2'), 'wait v2 Pods and endpoints')
        self.sample('rolled_v2', v2, 'v2')
        self.stage = 'undo Deployment template to revision 1'
        self.k('rollout', 'undo', 'deployment/guide-service', '--to-revision=1')
        self.k('rollout', 'status', 'deployment/guide-service', '--timeout=180s')
        undone = self.wait(lambda: self.converged('v1'), 'wait rollback v1 Pods and endpoints')
        self.sample('undo_v1', undone, 'v1')
        self.observation['rollout'] = {'undo_to_revision': 1, 'changed_field': 'spec.template.spec.containers[name=app].env[APP_VERSION]'}
        self.observation['requests'] = self.read_requests()
        self.stage = 'verify independent API and business response oracle'
        verify(self.observation)
        return {'kind': kind_version, 'kubectl': client_version,
                'kubernetes': json.loads(self.k('version', '-o', 'json').stdout)['serverVersion']['gitVersion']}

    def cleanup(self):
        if not self.created:
            return {'complete': True, 'owned_cluster_absent': True, 'delete_attempted': False}
        self.stage = 'delete owned cluster'
        deleted = self.command('kind', 'delete', 'cluster', '--name', self.name, check=False)
        remaining = self.command('kind', 'get', 'clusters', check=False)
        absent = remaining.returncode == 0 and self.name not in remaining.stdout.splitlines()
        return {'complete': deleted.returncode == 0 and absent, 'owned_cluster_absent': absent,
                'delete_attempted': True, 'delete_exit_code': deleted.returncode}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('service-record.json'))
    parser.add_argument('--check-record', type=Path)
    args = parser.parse_args()
    if args.check_record:
        record = json.loads(args.check_record.read_text())
        assert record['source_sha256']['service_lab.py'] == source_sha()
        verify(record['observation'])
        assert record['status'] == 'passed' and record['cleanup']['complete'] and record['cleanup']['owned_cluster_absent']
        print('PASS: independent API state and actual ClusterIP HTTP bodies agree')
        return
    lab = Lab()
    report = {'schema': 1, 'status': 'failed', 'system': platform.system(), 'node_image': NODE_IMAGE,
        'python_image': PYTHON_IMAGE, 'source_sha256': {'service_lab.py': source_sha()},
        'scope': 'Native Kubernetes on one kind Linux host with controlled fresh HTTP connections; not cloud load balancers, multi-host networks, fault-domain availability or long-lived connection draining.'}
    with tempfile.TemporaryDirectory(prefix='infra-service-') as tmp:
        try:
            report['versions'] = lab.run(Path(tmp))
            report['status'] = 'passed'
        except Exception as error:
            # Only allowlist frames in this source file; never serialize error text or locals.
            frames = []
            trace = error.__traceback__
            while trace:
                if Path(trace.tb_frame.f_code.co_filename).resolve() == Path(__file__).resolve():
                    frames.append({'function': trace.tb_frame.f_code.co_name, 'line': trace.tb_lineno})
                trace = trace.tb_next
            report['failure'] = {'stage': lab.stage, 'type': type(error).__name__, 'source_frames': frames}
        finally:
            report['observation'] = lab.observation
            report['cleanup'] = lab.cleanup()
            if not report['cleanup']['complete']:
                report['status'] = 'failed'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'failure': report.get('failure'), 'cleanup': report['cleanup']}))
    if report['status'] != 'passed':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
