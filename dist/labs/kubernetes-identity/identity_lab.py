"""Observe native ServiceAccount authentication and RBAC in a newly owned kind cluster."""
import argparse
import base64
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import platform
import shutil
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

NODE_IMAGE = 'kindest/node:v1.35.8@sha256:07b2536e30b803ed61d1677a79df6115f798ce64c80f9e22f6ed45afd09323c0'
SUBJECT = 'system:serviceaccount:report-a:report-reader'
PATH = '/api/v1/namespaces/report-a/configmaps/reports-v1'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def verify(observation):
    """Check independent HTTP bodies, authentication decisions and object snapshots."""
    calls = {row['case']: row for row in observation['http']}
    for case in ('read_allowed', 'binding_restored', 'bound_before_delete'):
        row = calls[case]
        assert row['status'] == 200 and row['body']['kind'] == 'ConfigMap'
        assert row['body']['metadata']['namespace'] == 'report-a'
        assert row['body']['metadata']['name'] == 'reports-v1'
        assert row['body']['data'] == {'value': '37'}
    assert [calls[name]['status'] for name in ('read_allowed', 'binding_removed', 'binding_restored')] == [200, 403, 200]
    assert all(calls[name]['credential_ref'] == 'reader-1' for name in
               ('read_allowed', 'binding_removed', 'binding_restored'))
    assert calls['who_am_i']['status'] == 201
    assert calls['who_am_i']['body']['status']['userInfo']['username'] == SUBJECT
    for case in ('other_name', 'other_namespace', 'patch_denied', 'secret_denied', 'list_denied', 'binding_removed'):
        row = calls[case]
        assert row['status'] == 403 and row['body']['reason'] == 'Forbidden'
        assert SUBJECT in row['body']['message']
    assert calls['wrong_audience']['status'] == 401
    assert calls['bound_after_delete']['status'] == 401
    reviews = observation['token_reviews']
    for name in ('before_binding_removed', 'without_binding', 'after_binding_restored', 'bound_before_delete'):
        assert reviews[name]['authenticated'] is True
        assert reviews[name]['user']['username'] == SUBJECT
    assert reviews['wrong_audience']['authenticated'] is False
    assert reviews['bound_after_delete']['authenticated'] is False
    assert reviews['before_binding_removed']['audiences'] == observation['credentials']['reader-1']['audiences']
    assert observation['credentials']['reader-1']['subject'] == SUBJECT
    assert observation['credentials']['wrong-audience']['audiences'] == ['reports-api.invalid']
    assert observation['credentials']['reader-1']['issuer'] == observation['credentials']['bound-1']['issuer']
    assert observation['bound_pod']['uid'] == observation['credentials']['bound-1']['bound_pod_uid']
    assert observation['bound_pod']['deleted'] is True
    assert 0 <= observation['bound_pod']['revocation_observed_seconds'] <= 90
    assert observation['bound_pod']['revocation_checks'] >= 1
    assert observation['before'] == observation['after'], 'Rejected writes must not change protected objects'
    assert len(observation['before']) == 4
    assert observation['before'][PATH]['data_sha256'] == digest({'value': '37'})
    assert observation['tls'] == {'ca_verified': True, 'client_certificate_loaded': False,
                                  'environment_proxy_used': False, 'endpoint_loopback': True}


class Lab:
    def __init__(self):
        self.name = 'infra-identity-' + uuid.uuid4().hex[:12]
        self.stage = 'preflight'
        self.kubeconfig = None
        self.created = False
        self.observation = {'http': [], 'token_reviews': {}, 'credentials': {}}

    def command(self, *argv, data=None, check=True, timeout=240):
        result = subprocess.run(argv, input=data, text=True, capture_output=True, timeout=timeout)
        if check and result.returncode:
            # TokenRequest/TokenReview output and kubeconfig must never enter diagnostics.
            raise RuntimeError('Command failed at ' + self.stage + ' (exit ' + str(result.returncode) + ')')
        return result

    def k(self, *args, data=None):
        return self.command('kubectl', '--kubeconfig', str(self.kubeconfig), '--context', 'kind-' + self.name,
                            '--request-timeout=15s', *args, data=data)

    def apply(self, obj):
        self.k('apply', '-f', '-', data=json.dumps(obj))

    def admin_get(self, path):
        return json.loads(self.k('get', '--raw', path).stdout)

    def snapshot(self):
        paths = [PATH, '/api/v1/namespaces/report-a/configmaps/reports-v2',
                 '/api/v1/namespaces/report-b/configmaps/reports-v1',
                 '/api/v1/namespaces/report-a/secrets/report-signing']
        return {path: {'uid': obj['metadata']['uid'], 'resource_version': obj['metadata']['resourceVersion'],
                       'data_sha256': digest(obj.get('data', {}))}
                for path in paths for obj in [self.admin_get(path)]}

    def issue(self, ref, audiences, pod=None):
        spec = {'audiences': audiences, 'expirationSeconds': 600}
        if pod:
            spec['boundObjectRef'] = {'apiVersion': 'v1', 'kind': 'Pod', 'name': pod['name'], 'uid': pod['uid']}
        result = json.loads(self.k('create', '--raw',
            '/api/v1/namespaces/report-a/serviceaccounts/report-reader/token', '-f', '-',
            data=json.dumps({'apiVersion': 'authentication.k8s.io/v1', 'kind': 'TokenRequest', 'spec': spec})).stdout)
        token = result['status']['token']
        # Decoding is introspection only. The API and TokenReview perform authentication.
        segment = token.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(segment + '=' * (-len(segment) % 4)))
        self.observation['credentials'][ref] = {'subject': claims['sub'], 'issuer': claims['iss'],
            'audiences': claims['aud'], 'issued_at': claims['iat'], 'expires_at': claims['exp'],
            'expiration_timestamp': result['status']['expirationTimestamp']}
        if pod:
            self.observation['credentials'][ref]['bound_pod_uid'] = claims['kubernetes.io']['pod']['uid']
        return token

    def review(self, token, audiences):
        result = json.loads(self.k('create', '--raw', '/apis/authentication.k8s.io/v1/tokenreviews', '-f', '-',
            data=json.dumps({'apiVersion': 'authentication.k8s.io/v1', 'kind': 'TokenReview',
                             'spec': {'token': token, 'audiences': audiences}})).stdout)
        status = result['status']
        # The API response also contains spec.token. Keep only this allowlisted status.
        return {'authenticated': status.get('authenticated', False),
                **{key: status[key] for key in ('user', 'audiences', 'error') if key in status}}

    def request(self, case, token, credential_ref='reader-1', path=PATH, method='GET', body=None):
        payload = None if body is None else json.dumps(body).encode()
        headers = {'Authorization': 'Bearer ' + token}
        if body is not None:
            headers['Content-Type'] = 'application/merge-patch+json' if method == 'PATCH' else 'application/json'
        request = urllib.request.Request(self.server + path, data=payload, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                status, value = response.status, json.load(response)
        except urllib.error.HTTPError as error:
            status, value = error.code, json.load(error)
            error.close()
        row = {'case': case, 'credential_ref': credential_ref, 'method': method, 'path': path,
               'status': status, 'body': value}
        self.observation['http'].append(row)
        return row

    def run(self, folder):
        assert platform.system() == 'Linux', 'Native lab requires Linux'
        for executable in ('docker', 'kind', 'kubectl'):
            assert shutil.which(executable), 'Missing ' + executable
        assert not os.environ.get('DOCKER_HOST'), 'DOCKER_HOST overrides are not accepted'
        assert not os.environ.get('KIND_EXPERIMENTAL_PROVIDER'), 'Use the Docker kind provider'
        endpoint = json.loads(self.command('docker', 'context', 'inspect').stdout)[0]['Endpoints']['docker']['Host']
        assert endpoint.startswith('unix://'), 'Only local Docker unix sockets are accepted'
        assert self.name not in self.command('kind', 'get', 'clusters').stdout.splitlines()
        version = self.command('kind', 'version').stdout.strip()
        assert version.split()[1] == 'v0.33.0', 'Use pinned kind v0.33.0'
        self.kubeconfig = folder / 'kubeconfig'
        self.stage = 'create owned cluster'
        self.created = True
        self.command('kind', 'create', 'cluster', '--name', self.name, '--kubeconfig', str(self.kubeconfig),
                     '--image', NODE_IMAGE, '--wait', '150s', timeout=400)
        self.kubeconfig.chmod(0o600)
        self.stage = 'prepare objects'
        # Extract only cluster trust and endpoint; never load admin user/client-certificate fields.
        cluster = json.loads(self.k('config', 'view', '--raw', '--minify', '-o', 'jsonpath={.clusters[0].cluster}').stdout)
        self.server = cluster['server']
        parsed = urllib.parse.urlparse(self.server)
        assert parsed.scheme == 'https' and ipaddress.ip_address(parsed.hostname).is_loopback
        ca = base64.b64decode(cluster['certificate-authority-data']).decode()
        context = ssl.create_default_context(cadata=ca)
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                                                  urllib.request.HTTPSHandler(context=context))
        self.observation['tls'] = {'ca_verified': True, 'client_certificate_loaded': False,
                                   'environment_proxy_used': False, 'endpoint_loopback': True}
        audience = self.admin_get('/.well-known/openid-configuration')['issuer']
        for namespace in ('report-a', 'report-b'):
            self.apply({'apiVersion': 'v1', 'kind': 'Namespace', 'metadata': {'name': namespace}})
        for namespace, name, value in (('report-a', 'reports-v1', '37'), ('report-a', 'reports-v2', '73'),
                                        ('report-b', 'reports-v1', '99')):
            self.apply({'apiVersion': 'v1', 'kind': 'ConfigMap', 'metadata': {'namespace': namespace, 'name': name},
                        'data': {'value': value}})
        self.apply({'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'namespace': 'report-a', 'name': 'report-signing'},
                    'stringData': {'teaching-marker': 'not-a-production-secret'}})
        self.apply({'apiVersion': 'v1', 'kind': 'ServiceAccount', 'metadata': {'namespace': 'report-a', 'name': 'report-reader'},
                    'automountServiceAccountToken': False})
        self.apply({'apiVersion': 'rbac.authorization.k8s.io/v1', 'kind': 'Role',
            'metadata': {'namespace': 'report-a', 'name': 'read-one-report'},
            'rules': [{'apiGroups': [''], 'resources': ['configmaps'], 'resourceNames': ['reports-v1'], 'verbs': ['get']}]})
        binding = {'apiVersion': 'rbac.authorization.k8s.io/v1', 'kind': 'RoleBinding',
            'metadata': {'namespace': 'report-a', 'name': 'read-one-report'},
            'subjects': [{'kind': 'ServiceAccount', 'namespace': 'report-a', 'name': 'report-reader'}],
            'roleRef': {'apiGroup': 'rbac.authorization.k8s.io', 'kind': 'Role', 'name': 'read-one-report'}}
        self.apply(binding)
        self.observation['before'] = self.snapshot()
        self.stage = 'normal token and requests'
        token = self.issue('reader-1', [audience])
        self.observation['token_reviews']['before_binding_removed'] = self.review(token, [audience])
        self.request('who_am_i', token, path='/apis/authentication.k8s.io/v1/selfsubjectreviews', method='POST',
                     body={'apiVersion': 'authentication.k8s.io/v1', 'kind': 'SelfSubjectReview'})
        self.request('read_allowed', token)
        for case, path, method, body in (
            ('other_name', '/api/v1/namespaces/report-a/configmaps/reports-v2', 'GET', None),
            ('other_namespace', '/api/v1/namespaces/report-b/configmaps/reports-v1', 'GET', None),
            ('patch_denied', PATH, 'PATCH', {'data': {'value': '999'}}),
            ('secret_denied', '/api/v1/namespaces/report-a/secrets/report-signing', 'GET', None),
            ('list_denied', '/api/v1/namespaces/report-a/configmaps', 'GET', None)):
            self.request(case, token, path=path, method=method, body=body)
        self.stage = 'same token remove and restore binding'
        self.k('delete', 'rolebinding', 'read-one-report', '-n', 'report-a', '--wait=true')
        self.observation['token_reviews']['without_binding'] = self.review(token, [audience])
        self.wait_status('binding_removed', token, 403)
        self.apply(binding)
        self.observation['token_reviews']['after_binding_restored'] = self.review(token, [audience])
        self.wait_status('binding_restored', token, 200)
        self.stage = 'wrong audience'
        wrong = self.issue('wrong-audience', ['reports-api.invalid'])
        self.observation['token_reviews']['wrong_audience'] = self.review(wrong, [audience])
        self.request('wrong_audience', wrong, credential_ref='wrong-audience')
        self.stage = 'bound object identity'
        self.apply({'apiVersion': 'v1', 'kind': 'Pod', 'metadata': {'namespace': 'report-a', 'name': 'identity-bound'},
            'spec': {'serviceAccountName': 'report-reader', 'automountServiceAccountToken': False,
                     'schedulerName': 'guide-identity-no-scheduler', 'terminationGracePeriodSeconds': 0,
                     'containers': [{'name': 'unused', 'image': 'registry.k8s.io/pause:3.10'}]}})
        pod = self.admin_get('/api/v1/namespaces/report-a/pods/identity-bound')
        bound = {'name': 'identity-bound', 'uid': pod['metadata']['uid']}
        bound_token = self.issue('bound-1', [audience], bound)
        self.observation['token_reviews']['bound_before_delete'] = self.review(bound_token, [audience])
        self.request('bound_before_delete', bound_token, credential_ref='bound-1')
        self.k('delete', 'pod', 'identity-bound', '-n', 'report-a', '--grace-period=0', '--wait=true', '--timeout=30s')
        started = time.monotonic()
        checks = 0
        while True:
            checks += 1
            result = self.review(bound_token, [audience])
            if not result['authenticated']:
                break
            assert time.monotonic() - started < 85, 'Bound token revocation not observed within budget'
            time.sleep(.5)
        self.observation['token_reviews']['bound_after_delete'] = result
        self.request('bound_after_delete', bound_token, credential_ref='bound-1')
        self.observation['bound_pod'] = {**bound, 'deleted': True, 'revocation_checks': checks,
                                        'revocation_observed_seconds': round(time.monotonic() - started, 3)}
        self.stage = 'independent protected object oracle'
        self.observation['after'] = self.snapshot()
        verify(self.observation)
        return {'kind': version, 'kubernetes': json.loads(self.k('version', '-o', 'json').stdout)['serverVersion']['gitVersion']}

    def wait_status(self, case, token, expected):
        started = time.monotonic()
        while True:
            row = self.request(case, token)
            if row['status'] == expected:
                return
            self.observation['http'].pop()  # retain only the decision used by the assertion
            assert time.monotonic() - started < 15, 'Authorization change not observed within budget'
            time.sleep(.25)

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
    parser.add_argument('--output', type=Path, default=Path('identity-record.json'))
    parser.add_argument('--check-record', type=Path)
    args = parser.parse_args()
    if args.check_record:
        record = json.loads(args.check_record.read_text())
        verify(record['observation'])
        assert record['status'] == 'passed' and record['cleanup']['complete']
        print('PASS: independent HTTP decisions and protected object snapshots agree')
        return
    lab = Lab()
    report = {'schema': 1, 'status': 'failed', 'system': platform.system(), 'node_image': NODE_IMAGE,
              'source_sha256': {'identity_lab.py': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
              'scope': 'Native kind API authentication/RBAC on one Linux host; not cloud IAM, token projection/refresh or production multi-tenancy.'}
    with tempfile.TemporaryDirectory(prefix='infra-identity-') as tmp:
        try:
            report['versions'] = lab.run(Path(tmp))
            report['status'] = 'passed'
        except Exception as error:
            report['failure'] = {'stage': lab.stage, 'type': type(error).__name__}
        finally:
            report['observation'] = lab.observation
            report['cleanup'] = lab.cleanup()
            if not report['cleanup']['complete']:
                report['status'] = 'failed'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))
    if report['status'] != 'passed':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
