"""Isolated, real etcd 3.6.16 quorum, watch, lease and snapshot lesson.

Requires Linux, Python 3.9+ standard library and a local Docker daemon. Creates
only randomly named private networks, containers and volumes; exposes no ports.
No Kubernetes cluster or existing database is contacted. The Docker image is
pinned to the official multi-platform manifest digest checked on 2026-11-08.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import selectors
import shutil
import subprocess
import sys
import time
import uuid


VERSION = '3.6.16'
IMAGE = ('gcr.io/etcd-development/etcd:v3.6.16@sha256:'
         'b29d816b546a1966fe7034a33b34e231fa98c47ce4d2883f70b0555020b22132')
PREFIX = '/lesson/config/'
LIMIT = PREFIX + 'limit'


def decode(value):
    return base64.b64decode(value).decode()


def get_rows(response):
    return {decode(kv['key']): {'value': decode(kv.get('value', '')),
                               'create_revision': int(kv['create_revision']),
                               'mod_revision': int(kv['mod_revision']),
                               'version': int(kv['version']),
                               'lease': str(kv.get('lease', 0))}
            for kv in response.get('kvs', [])}


def normalized_range(response):
    header = response['header']
    return {'revision': int(header['revision']), 'cluster_id': str(header['cluster_id']),
            'member_id': str(header['member_id']), 'rows': get_rows(response)}


def verify(observation):
    """Check observed reads, events and identities, not only command exit codes."""
    members = observation['initial']['members']
    assert len(members) == 3 and len({m['id'] for m in members}) == 3
    assert observation['initial']['quorum'] == len(members)//2+1 == 2
    watch = observation['watch']
    assert watch['events_revision'] > watch['list_revision']
    assert {e['key'] for e in watch['events']} == {PREFIX+'release', PREFIX+'route'}
    assert {e['mod_revision'] for e in watch['events']} == {watch['events_revision']}
    assert {e['key']: e['value'] for e in watch['events']} == {PREFIX+'release': 'v2', PREFIX+'route': 'A'}
    assert observation['compaction']['old_watch']['canceled']
    assert observation['compaction']['old_watch']['compact_revision'] >= watch['events_revision']
    lease = observation['lease']
    assert lease['initial_present'] and lease['initial_lease_id'] == lease['id']
    assert lease['expired_absent'] and lease['ttl_seconds'] == 4
    p = observation['partition']
    assert p['isolated_member_id'] == observation['initial']['leader_id']
    assert p['majority_leader_id'] != p['isolated_member_id']
    assert p['majority_term'] > observation['initial']['term']
    assert p['majority_after_write']['rows'][LIMIT]['value'] == '42'
    assert p['minority_serializable']['rows'][LIMIT]['value'] == '37'
    assert p['minority_serializable']['revision'] < p['majority_after_write']['revision']
    assert p['minority_linearizable_exit'] != 0 and p['minority_write_exit'] != 0
    assert p['after_rejoin']['rows'][LIMIT]['value'] == '42'
    assert p['after_rejoin']['revision'] >= p['majority_after_write']['revision']
    assert not observation['cas']['old_revision_succeeded']
    assert observation['cas']['verified_value'] == '42'
    q = observation['lost_quorum']
    assert q['running_members'] == 1 and q['required_quorum'] == 2
    assert q['linearizable_exit'] != 0 and q['write_exit'] != 0
    assert q['after_second_member']['rows'][LIMIT]['value'] == '43'
    assert all(r['rows'][LIMIT]['value'] == '43' for r in q['all_members_recovered'])
    snapshot, restored = observation['snapshot'], observation['restore']
    assert snapshot['captured']['rows'][LIMIT]['value'] == '37'
    assert snapshot['revision'] == snapshot['captured']['revision']
    assert snapshot['bytes'] > 0 and len(snapshot['sha256']) == 64
    assert restored['before_new_write']['cluster_id'] != snapshot['captured']['cluster_id']
    assert restored['before_new_write']['rows'][LIMIT]['value'] == '37'
    assert restored['before_new_write']['revision'] >= snapshot['revision']+restored['bump_revision']
    assert restored['before_new_write']['revision'] > q['all_members_recovered'][0]['revision']
    assert restored['old_watch']['canceled']
    assert restored['old_watch']['compact_revision'] > q['all_members_recovered'][0]['revision']
    assert restored['after_new_write']['rows'][LIMIT]['value'] == '47'
    assert restored['after_new_write']['revision'] > restored['before_new_write']['revision']


class Lab:
    def __init__(self):
        self.prefix = 'infra-etcd-'+uuid.uuid4().hex[:12]
        self.containers, self.volumes, self.networks = [], [], []
        self.commands, self.watchers = [], []
        self.names = [self.prefix+'-n'+str(i) for i in range(3)]
        self.network = self.prefix+'-net'
        self.snapshot_volume = self.prefix+'-snap'
        self.cluster = ','.join(n+'=http://'+n+':2380' for n in self.names)

    def docker(self, *arguments, data=None, check=True, timeout=45):
        result = subprocess.run(['docker', *arguments], input=data, capture_output=True,
                                text=True, timeout=timeout)
        self.commands.append({'argv': ['docker', *arguments], 'exit_code': result.returncode,
                              'stdout': result.stdout, 'stderr': result.stderr[-5000:]})
        if check and result.returncode:
            raise RuntimeError('Docker '+arguments[0]+' failed: '+result.stderr[-1800:])
        return result

    def client(self, name, *arguments, data=None, check=True, timeout=8):
        return self.docker('exec', '-i', name, '/usr/local/bin/etcdctl',
                           '--endpoints=http://127.0.0.1:2379', '--dial-timeout=1s',
                           '--command-timeout=2s', '--write-out=json', *arguments,
                           data=data, check=check, timeout=timeout)

    def json(self, name, *arguments, data=None):
        return json.loads(self.client(name, *arguments, data=data).stdout)

    def read(self, name, key=LIMIT, serializable=False):
        args = ['get', key]
        if serializable:
            args.append('--consistency=s')
        return normalized_range(self.json(name, *args))

    def poll(self, operation, predicate=lambda value: bool(value), timeout=45):
        deadline, last = time.monotonic()+timeout, None
        while time.monotonic() < deadline:
            try:
                value = operation()
                if predicate(value):
                    return value
                last = repr(value)[-500:]
            except (RuntimeError, subprocess.TimeoutExpired, ValueError, KeyError) as error:
                last = str(error)[-500:]
            time.sleep(.2)
        raise RuntimeError('Bounded observation did not converge: '+str(last))

    def volume(self, name):
        self.volumes.append(name)
        self.docker('volume', 'create', '--label', 'infraguide=isolated-etcd-lesson', name)

    def network_create(self, name):
        self.networks.append(name)
        self.docker('network', 'create', '--internal', '--label',
                    'infraguide=isolated-etcd-lesson', name)

    def start(self, name, volume, network, cluster, token):
        self.containers.append(name)
        self.docker('run', '-d', '--name', name, '--hostname', name, '--network', network,
                    '--memory=256m', '--pids-limit=128', '--user=0:0',
                    '--mount', 'type=volume,source='+volume+',target=/data',
                    '--mount', 'type=volume,source='+self.snapshot_volume+',target=/snapshots',
                    IMAGE, '/usr/local/bin/etcd', '--name='+name, '--data-dir=/data/member',
                    '--listen-client-urls=http://0.0.0.0:2379',
                    '--advertise-client-urls=http://'+name+':2379',
                    '--listen-peer-urls=http://0.0.0.0:2380',
                    '--initial-advertise-peer-urls=http://'+name+':2380',
                    '--initial-cluster='+cluster, '--initial-cluster-token='+token,
                    '--initial-cluster-state=new', '--logger=zap', '--log-level=error')

    def status(self, name):
        status = self.json(name, 'endpoint', 'status')[0]['Status']
        return {'member_id': str(status['header']['member_id']), 'leader_id': str(status['leader']),
                'term': int(status['raftTerm']), 'revision': int(status['header']['revision']),
                'version': status['version'], 'name': name}

    def healthy(self, name):
        rows = self.json(name, 'endpoint', 'health')
        return len(rows) == 1 and rows[0]['health']

    def watch(self, target, network, revision, trigger=None, expect_cancel=False):
        name = self.prefix+'-watch-'+str(len(self.watchers))
        self.watchers.append(name)
        self.containers.append(name)
        argv = ['docker', 'run', '--name', name, '--network', network, '--memory=128m',
                '--pids-limit=64', IMAGE, '/usr/local/bin/etcdctl',
                '--endpoints=http://'+target+':2379', '--dial-timeout=1s',
                '--write-out=json', 'watch', PREFIX, '--prefix', '--rev='+str(revision)]
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, bufsize=1)
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        raw, observed = '', None
        try:
            if trigger:
                trigger()
            deadline = time.monotonic()+20
            while time.monotonic() < deadline:
                if not selector.select(timeout=.5):
                    if process.poll() is not None:
                        break
                    continue
                line = process.stdout.readline()
                raw += line
                if not line:
                    if process.poll() is not None:
                        break
                    continue
                try:
                    item = json.loads(line)
                except ValueError:
                    continue
                events = item.get('Events', item.get('events', [])) or []
                canceled = item.get('Canceled', item.get('canceled', False))
                if (expect_cancel and canceled) or (not expect_cancel and events):
                    header = item.get('Header', item.get('header', {}))
                    observed = {'response_revision': int(header.get('revision', 0)),
                                'canceled': bool(canceled),
                                'compact_revision': int(item.get('CompactRevision', item.get('compact_revision', 0))),
                                'events': [{'key': decode(e['kv']['key']),
                                            'value': decode(e['kv'].get('value', '')),
                                            'mod_revision': int(e['kv']['mod_revision'])}
                                           for e in events], 'raw_response': line.strip()}
                    break
        finally:
            selector.close()
            self.docker('rm', '-f', name, check=False)
            try:
                remaining, errors = process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                remaining, errors = process.communicate(timeout=5)
            self.commands.append({'argv': argv, 'exit_code': process.returncode,
                                  'stdout': raw+remaining, 'stderr': errors[-5000:]})
        if observed is None:
            raise RuntimeError('Watch did not produce its required bounded observation: '+errors[-1000:])
        return observed

    def cleanup(self):
        # Names originate only in this instance. No prune, broad label deletion,
        # external volume, pre-existing container or arbitrary endpoint is used.
        failures = []
        for kind, names, remove in [('container', self.containers, ['rm', '-f']),
                                    ('volume', self.volumes, ['volume', 'rm']),
                                    ('network', self.networks, ['network', 'rm'])]:
            for name in reversed(names):
                assert name.startswith(self.prefix+'-')
                self.docker(*remove, name, check=False)
                remaining = self.docker(kind, 'inspect', name, check=False)
                if remaining.returncode == 0:
                    failures.append({'kind': kind, 'name': name})
        return {'remaining': failures, 'complete': not failures}

    def run(self):
        if platform.system() != 'Linux' or not shutil.which('docker'):
            raise RuntimeError('Use an isolated Linux host with Python3 and a local Docker daemon')
        endpoint = os.environ.get('DOCKER_HOST') or self.docker(
            'context', 'inspect', '--format', '{{.Endpoints.docker.Host}}').stdout.strip()
        if not endpoint.startswith('unix://'):
            raise RuntimeError('This lesson refuses non-local Docker daemon endpoints')
        assert self.docker('info', '--format', '{{.OSType}}').stdout.strip() == 'linux'
        self.docker('pull', IMAGE, timeout=240)
        image_digests = json.loads(self.docker('image', 'inspect', '--format', '{{json .RepoDigests}}', IMAGE).stdout)
        assert any(d.endswith(IMAGE.split('@')[1]) for d in image_digests)
        self.network_create(self.network)
        self.volume(self.snapshot_volume)
        for name in self.names:
            volume = name+'-data'
            self.volume(volume)
            self.start(name, volume, self.network, self.cluster, self.prefix+'-original')
        for name in self.names:
            self.poll(lambda name=name: self.healthy(name))
        statuses = [self.status(name) for name in self.names]
        assert all(s['version'] == VERSION for s in statuses)
        leader_id = statuses[0]['leader_id']
        assert all(s['leader_id'] == leader_id for s in statuses)
        leader = next(s['name'] for s in statuses if s['member_id'] == leader_id)
        others = [name for name in self.names if name != leader]
        first = self.json(leader, 'put', LIMIT, '37')
        initial_read = self.read(leader)
        base_mod = initial_read['rows'][LIMIT]['mod_revision']
        self.json(leader, 'put', PREFIX+'release', 'v1')
        listed = normalized_range(self.json(leader, 'get', PREFIX, '--prefix'))
        def update_pair():
            self.json(leader, 'txn', data='version("'+LIMIT+'") > "0"\n\nput '+PREFIX+'release v2\nput '+PREFIX+'route A\n\nget '+LIMIT+'\n\n')
        event = self.watch(leader, self.network, listed['revision']+1, update_pair)
        event_revision = event['events'][0]['mod_revision']
        self.client(leader, 'compaction', str(event_revision))
        compacted_watch = self.watch(leader, self.network, listed['revision'], expect_cancel=True)

        lease_response = self.json(leader, 'lease', 'grant', '4')
        lease_id = int(lease_response.get('ID', lease_response.get('id')))
        lease_hex = format(lease_id, 'x')
        ephemeral = '/lesson/ephemeral/owner'
        self.json(leader, 'put', ephemeral, 'worker-A', '--lease='+lease_hex)
        lease_initial = self.read(leader, ephemeral)
        assert ephemeral in lease_initial['rows']
        lease_ended = self.poll(lambda: self.read(leader, ephemeral), lambda r: not r['rows'], timeout=25)

        snapshot_range = self.read(leader)
        self.client(leader, 'snapshot', 'save', '/snapshots/seed.db', timeout=30)
        snap_status = json.loads(self.docker('exec', leader, '/usr/local/bin/etcdutl',
                                           '--write-out=json', 'snapshot', 'status', '/snapshots/seed.db').stdout)
        # The only concurrent event above (the lease expiry) has already ended.
        assert int(snap_status['revision']) == snapshot_range['revision']
        snapshot_sha = self.docker('run', '--rm', '--network', 'none',
                                   '--mount', 'type=volume,source='+self.snapshot_volume+',target=/snapshots,readonly',
                                   IMAGE, '/usr/local/bin/etcdutl', '--write-out=json',
                                   'snapshot', 'status', '/snapshots/seed.db').stdout

        self.docker('network', 'disconnect', self.network, leader)
        def majority_statuses():
            return [self.status(name) for name in others]
        majority = self.poll(majority_statuses, lambda rows: rows[0]['leader_id'] != '0' and
                             rows[0]['leader_id'] == rows[1]['leader_id'] and
                             rows[0]['leader_id'] != leader_id and rows[0]['term'] > statuses[0]['term'])
        self.poll(lambda: self.healthy(others[0]))
        self.json(others[0], 'put', LIMIT, '42')
        majority_read = self.read(others[0])
        minority_serializable = self.read(leader, serializable=True)
        minority_linear = self.client(leader, 'get', LIMIT, check=False)
        minority_write = self.client(leader, 'put', LIMIT, '99', check=False)
        self.docker('network', 'connect', '--alias', leader, self.network, leader)
        rejoined = self.poll(lambda: self.read(leader), lambda r: r['rows'].get(LIMIT, {}).get('value') == '42')
        stale_cas = self.json(others[0], 'txn', data='mod("'+LIMIT+'") = "'+str(base_mod)+'"\n\nput '+LIMIT+' 99\n\nget '+LIMIT+'\n\n')
        after_cas = self.read(others[0])

        for name in self.names[1:]:
            self.docker('stop', '-t', '1', name)
        survivor = self.names[0]
        single_read = self.client(survivor, 'get', LIMIT, check=False)
        single_write = self.client(survivor, 'put', LIMIT, '99', check=False)
        self.docker('start', self.names[1])
        self.poll(lambda: self.healthy(survivor))
        self.json(survivor, 'put', LIMIT, '43')
        recovered_two = self.read(survivor)
        self.docker('start', self.names[2])
        for name in self.names:
            self.poll(lambda name=name: self.read(name), lambda r: r['rows'].get(LIMIT, {}).get('value') == '43')
        all_recovered = [self.read(name) for name in self.names]

        restored_name, restored_network = self.prefix+'-restored', self.prefix+'-restored-net'
        restored_volume = self.prefix+'-restored-data'
        self.network_create(restored_network)
        self.volume(restored_volume)
        restored_cluster = restored_name+'=http://'+restored_name+':2380'
        self.docker('run', '--rm', '--network', 'none', '--user=0:0',
                    '--mount', 'type=volume,source='+self.snapshot_volume+',target=/snapshots,readonly',
                    '--mount', 'type=volume,source='+restored_volume+',target=/data', IMAGE,
                    '/usr/local/bin/etcdutl', 'snapshot', 'restore', '/snapshots/seed.db',
                    '--name='+restored_name, '--data-dir=/data/member',
                    '--initial-cluster='+restored_cluster,
                    '--initial-advertise-peer-urls=http://'+restored_name+':2380',
                    '--initial-cluster-token='+self.prefix+'-restored',
                    '--bump-revision=1000', '--mark-compacted')
        self.start(restored_name, restored_volume, restored_network, restored_cluster, self.prefix+'-restored')
        self.poll(lambda: self.healthy(restored_name))
        restored_before = self.read(restored_name)
        invalidated = self.watch(restored_name, restored_network,
                                 all_recovered[0]['revision']+1, expect_cancel=True)
        self.json(restored_name, 'put', LIMIT, '47')
        restored_after = self.read(restored_name)

        # Copy only this owned lesson snapshot into a local temporary file to
        # bind its actual bytes. No host path is mounted into a container.
        import tempfile
        with tempfile.TemporaryDirectory(prefix='infra-etcd-snapshot-') as folder:
            snapshot_file = Path(folder)/'seed.db'
            self.docker('cp', leader+':/snapshots/seed.db', str(snapshot_file))
            snapshot_bytes = snapshot_file.read_bytes()
        observation = {
            'initial': {'members': [{'name': s['name'], 'id': s['member_id']} for s in statuses],
                        'leader_id': leader_id, 'term': statuses[0]['term'], 'quorum': 2,
                        'first_put_revision': int(first['header']['revision']), 'read': initial_read},
            'watch': {'list_revision': listed['revision'], 'events_revision': event_revision,
                      'events': event['events'], 'response': event},
            'compaction': {'requested_revision': event_revision, 'old_watch': compacted_watch},
            'lease': {'id': str(lease_id), 'ttl_seconds': int(lease_response['TTL']),
                      'initial_present': ephemeral in lease_initial['rows'],
                      'initial_lease_id': lease_initial['rows'][ephemeral]['lease'],
                      'expired_absent': not lease_ended['rows']},
            'snapshot': {'revision': int(snap_status['revision']), 'captured': snapshot_range,
                         'sha256': hashlib.sha256(snapshot_bytes).hexdigest(), 'bytes': len(snapshot_bytes),
                         'status': snap_status, 'independent_status_raw': snapshot_sha},
            'partition': {'isolated_member_id': leader_id, 'isolated_name': leader,
                          'majority_leader_id': majority[0]['leader_id'], 'majority_term': majority[0]['term'],
                          'majority_after_write': majority_read, 'minority_serializable': minority_serializable,
                          'minority_linearizable_exit': minority_linear.returncode,
                          'minority_write_exit': minority_write.returncode, 'after_rejoin': rejoined},
            'cas': {'old_mod_revision': base_mod, 'old_revision_succeeded': stale_cas.get('succeeded', False),
                    'verified_value': after_cas['rows'][LIMIT]['value']},
            'lost_quorum': {'running_members': 1, 'required_quorum': 2,
                            'linearizable_exit': single_read.returncode, 'write_exit': single_write.returncode,
                            'after_second_member': recovered_two, 'all_members_recovered': all_recovered},
            'restore': {'bump_revision': 1000, 'mark_compacted': True,
                        'before_new_write': restored_before, 'old_watch': invalidated,
                        'after_new_write': restored_after},
            'image_repo_digests': image_digests}
        verify(observation)
        return observation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Write actual JSON evidence, including failures')
    parser.add_argument('--check-record', type=Path, help='Independently inspect an existing real execution record')
    args = parser.parse_args()
    source_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    if args.check_record:
        record = json.loads(args.check_record.read_text())
        assert record['status'] == 'passed' and record['source_sha256']['etcd_lab.py'] == source_hash
        assert record['image'] == IMAGE and record['version'] == VERSION
        assert record['cleanup']['complete'] and not record['cleanup']['remaining']
        verify(record['observation'])
        print('PASS: actual etcd quorum, read/watch/lease, reconnect and snapshot observations')
        return
    lab = Lab()
    record = {'schema': 1, 'status': 'failed', 'source_sha256': {'etcd_lab.py': source_hash},
              'version': VERSION, 'image': IMAGE, 'python': platform.python_version(),
              'system': platform.system(), 'scope': [
                  'real three-container etcd cluster on one Linux Docker host',
                  'actual peer network partition; client exec uses member loopback',
                  'independent single-member snapshot restore, not a Kubernetes restore',
                  'plaintext isolated synthetic configuration; no production TLS/RBAC, physical-AZ or throughput test']}
    try:
        record['observation'] = lab.run()
        record['status'] = 'passed'
    except Exception as error:
        record['error'] = type(error).__name__+': '+str(error)
    finally:
        try:
            record['cleanup'] = lab.cleanup()
            if not record['cleanup']['complete']:
                record['status'] = 'failed'
        except Exception as error:
            record['cleanup'] = {'complete': False, 'error': str(error)}
            record['status'] = 'failed'
        record['commands'] = lab.commands
    encoded = json.dumps(record, ensure_ascii=False, indent=2)+'\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded)
    if record['status'] != 'passed':
        sys.exit(1)


if __name__ == '__main__':
    main()
