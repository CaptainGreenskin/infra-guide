"""InfraGuide local mechanisms lab. Python 3.9+, standard library only.
No cloud resources or production endpoints are used. See README.md.
"""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import platform
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.request import urlopen


def http_lab():
    state = {'ready': True}
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def do_GET(self):
            status = 200
            if self.path == '/ready':
                status = 200 if state['ready'] else 503
            elif self.path == '/failure':
                status = 503
            elif self.path not in ('/live', '/work'):
                status = 404
            body = json.dumps({'status': status, 'ready': state['ready']}).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    observations = []
    def request(path):
        start = time.perf_counter()
        try:
            with urlopen('http://127.0.0.1:%d%s' % (server.server_port, path), timeout=2) as r:
                status, body = r.status, r.read()
        except HTTPError as e:
            status, body = e.code, e.read()
        observations.append({'path': path, 'status': status,
                             'elapsed_ms': (time.perf_counter()-start)*1000})
        assert json.loads(body)['status'] == status
        return status
    try:
        assert request('/work') == 200
        assert request('/failure') == 503
        assert request('/missing') == 404
        assert request('/ready') == 200
        state['ready'] = False
        assert request('/ready') == 503
        assert request('/live') == 200
        # Simulated readiness is a signal; no orchestrator or traffic router exists here.
        assert request('/work') == 200
        return {'status': 'passed', 'scope': 'Real loopback HTTP; readiness signals only, no Kubernetes.',
                'observations': observations}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_version(folder):
    manifest = json.loads((folder/'manifest.json').read_text())
    for name, expected in manifest['files'].items():
        # This tutorial manifest is trusted local input. Production readers must validate paths too.
        data = (folder/name).read_bytes()
        if digest(data) != expected:
            raise ValueError('artifact checksum mismatch: ' + name)
    return manifest


def storage_lab():
    with tempfile.TemporaryDirectory(prefix='infra-artifacts-') as temporary:
        root = Path(temporary)
        v1 = root/'v1'
        v1.mkdir()
        payload = b'example-model-version-1\n'
        (v1/'model.txt').write_bytes(payload)
        (v1/'manifest.json').write_text(json.dumps({'version': 'v1', 'files': {'model.txt': digest(payload)}}))
        validate_version(v1)
        (root/'CURRENT.tmp').write_text('v1')
        os.replace(root/'CURRENT.tmp', root/'CURRENT')
        draft = root/'v2-draft'
        draft.mkdir()
        (draft/'partial.txt').write_text('incomplete')
        # No publish pointer update: consumers still select the last complete version.
        selected = root/(root/'CURRENT').read_text()
        validate_version(selected)
        assert (selected/'model.txt').read_bytes() == payload
        bad = root/'v3-corrupt'
        bad.mkdir()
        (bad/'model.txt').write_bytes(b'corrupt')
        (bad/'manifest.json').write_text((v1/'manifest.json').read_text())
        try:
            validate_version(bad)
        except ValueError:
            rejected = True
        else:
            raise AssertionError('Corrupt version was accepted')
        assert (root/'CURRENT').read_text() == 'v1'
        return {'status':'passed', 'restored_version':'v1', 'incomplete_not_published': True,
                'corrupt_rejected': rejected,
                'scope':'Local filesystem protocol test; not object-store or power-loss durability validation.'}


def slo_stats(groups, target):
    total = sum(row['total'] for row in groups)
    good = sum(row['good'] for row in groups)
    if not 0 < target < 1 or any(not 0 <= r['good'] <= r['total'] for r in groups):
        raise ValueError('Invalid target or event counts')
    if total == 0:
        return {'total':0,'good':0,'success_ratio':None,'burn_rate':None}
    bad = total-good
    allowance = total*(1-target)
    return {'total':total,'good':good,'bad':bad,'success_ratio':good/total,
            'allowed_bad':allowance,'budget_remaining':allowance-bad,
            'burn_rate':(bad/total)/(1-target)}


def slo_lab():
    groups = [{'name':'A','total':900,'good':899}, {'name':'B','total':100,'good':90}]
    result = slo_stats(groups, .99)
    assert result['total'] == 1000 and result['bad'] == 11
    assert math.isclose(result['burn_rate'], 1.1)
    assert slo_stats([], .99)['success_ratio'] is None
    naive = sum(g['good']/g['total'] for g in groups)/len(groups)
    assert not math.isclose(naive, result['success_ratio'])
    # A separate quantile fixture; nearest-rank definition is explicit.
    samples = [10]*99 + [1000]
    p99 = sorted(samples)[math.ceil(.99*len(samples))-1]
    assert p99 == 10
    return {'status':'passed','scope':'Synthetic event-count and latency fixtures, not production measurements.',
            'aggregate':result,'incorrect_unweighted_ratio':naive,
            'global_p99_nearest_rank_ms':p99,'incorrect_mean_of_instance_p99_ms':505}


def inference_lab():
    traces = [
        {'id':'A','sent':0.,'scheduled':.2,'first':.4,'last':1.4,'tokens':51,'ok':True},
        {'id':'B','sent':.2,'scheduled':.3,'first':.5,'last':.5,'tokens':1,'ok':True},
        {'id':'C','sent':.3,'last':.7,'tokens':0,'ok':False},
    ]
    good = [t for t in traces if t['ok']]
    per_request = [{'id':t['id'],'client_ttft_ms':(t['first']-t['sent'])*1000,
                    'scheduled_to_first_ms':(t['first']-t['scheduled'])*1000,
                    'tpot_ms':(t['last']-t['first'])*1000/(t['tokens']-1) if t['tokens']>1 else None}
                   for t in good]
    assert math.isclose(per_request[0]['client_ttft_ms'],400)
    assert math.isclose(per_request[0]['tpot_ms'],20)
    assert per_request[1]['tpot_ms'] is None
    span = max(t['last'] for t in traces)-min(t['sent'] for t in traces)
    return {'status':'passed','scope':'Hand-authored trace fixture; no model, GPU or serving engine executed.',
            'requests':per_request,'failure_fraction':1/3,
            'output_tokens_per_second':sum(t['tokens'] for t in good)/span,'observation_seconds':span}


def manifest_lab():
    def validate(m):
        for key in ('run_id','image_digest','code_revision','data_version','output_uri'):
            if not isinstance(m.get(key), str) or not m[key]:
                raise ValueError('missing field: '+key)
        if not isinstance(m.get('workers'), int) or isinstance(m['workers'],bool) or m['workers']<1:
            raise ValueError('workers must be a positive integer')
        if m.get('recovery_boundary') not in ('epoch','none'):
            raise ValueError('unsupported recovery boundary')
    example = {'run_id':'demo-001','image_digest':'sha256:'+'a'*64,
               'code_revision':'example-revision','data_version':'synthetic-v1',
               'output_uri':'example://isolated-output/demo-001','workers':2,'recovery_boundary':'epoch'}
    validate(example)
    broken = dict(example)
    del broken['data_version']
    try:
        validate(broken)
    except ValueError:
        pass
    else:
        raise AssertionError('Missing data version accepted')
    return {'status':'passed','example':example,
            'scope':'Field/shape validation only. Example references are fictional; artifact existence, IAM and scheduling not validated.'}


def run_all():
    return {'environment':platform.system()+' '+platform.machine()+' Python '+platform.python_version(),
            'results':{'http':http_lab(),'storage':storage_lab(),'slo':slo_lab(),
                       'inference_metrics':inference_lab(),'manifest':manifest_lab()}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='runs/core-report.json')
    args = parser.parse_args()
    report = run_all()
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))

