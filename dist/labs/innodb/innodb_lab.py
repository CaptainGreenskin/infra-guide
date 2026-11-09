#!/usr/bin/env python3
"""Real MySQL 8.4 access plans, record lock waits and one native deadlock."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid

IMAGE = 'mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902'
VERSION, DB = '8.4.13', 'innodb_lab'
ROOT_PASSWORD = 'isolated-innodb-lesson'
INDEX = 'ix_orders_tenant_seq'
TOTAL = 4096
QUERY = f'SELECT id, amount FROM {DB}.orders WHERE tenant_id=7 AND created_seq BETWEEN 200 AND 250 ORDER BY created_seq,id'
OWNER_LABEL = 'org.infraguide.v80-innodb-owner'
ERROR = re.compile(r'^ERROR (\d+) \(([0-9A-Z]{5})\)(?: at line \d+)?: (.*)$')
ACTUAL = re.compile(r'\(actual time=[^)]*?\brows=([\d.eE+-]+)\s+loops=(\d+)\)')
WAIT_SQL = f"""
SELECT JSON_OBJECT(
 'waiting_connection', wt.PROCESSLIST_ID, 'holding_connection', bt.PROCESSLIST_ID,
 'engine', w.ENGINE, 'schema', rl.OBJECT_SCHEMA, 'table', rl.OBJECT_NAME,
 'waiting_index', rl.INDEX_NAME, 'holding_index', bl.INDEX_NAME,
 'waiting_type', rl.LOCK_TYPE, 'holding_type', bl.LOCK_TYPE,
 'waiting_mode', rl.LOCK_MODE, 'holding_mode', bl.LOCK_MODE,
 'waiting_row', rl.LOCK_DATA, 'holding_row', bl.LOCK_DATA,
 'waiting_status', rl.LOCK_STATUS, 'holding_status', bl.LOCK_STATUS,
 'waiting_lock_id', rl.ENGINE_LOCK_ID, 'holding_lock_id', bl.ENGINE_LOCK_ID)
FROM performance_schema.data_lock_waits AS w
JOIN performance_schema.data_locks AS rl
  ON rl.ENGINE=w.ENGINE AND rl.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID
JOIN performance_schema.data_locks AS bl
  ON bl.ENGINE=w.ENGINE AND bl.ENGINE_LOCK_ID=w.BLOCKING_ENGINE_LOCK_ID
JOIN performance_schema.threads AS wt ON wt.THREAD_ID=w.REQUESTING_THREAD_ID
JOIN performance_schema.threads AS bt ON bt.THREAD_ID=w.BLOCKING_THREAD_ID
WHERE rl.OBJECT_SCHEMA='{DB}' AND rl.OBJECT_NAME='accounts';
"""


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def source_sha():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def amount(i):
    return (i * 7) % 97 + 1


def command(args, *, data=None, check=True, timeout=30):
    p = subprocess.run(args, input=data, text=True, capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError(f'{args[0]} {args[1]} failed: {(p.stderr or p.stdout)[-3500:]}')
    return p


class Session:
    """One unbuffered mysql CLI process, one connection, one outstanding batch."""
    def __init__(self, args):
        self.proc = subprocess.Popen([*args, '--force', '--skip-reconnect'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.lines = queue.Queue()
        self.reader = threading.Thread(target=self.drain, daemon=True)
        self.reader.start()
        self.pending = None

    def drain(self):
        try:
            for line in self.proc.stdout:
                self.lines.put(line.rstrip('\r\n'))
        finally:
            self.lines.put(None)

    def send(self, sql):
        require(self.pending is None and self.proc.poll() is None, 'mysql session is unavailable')
        self.pending = 'infra-marker-' + uuid.uuid4().hex
        self.proc.stdin.write(sql.rstrip().rstrip(';') + f";\nSELECT '{self.pending}';\n")
        self.proc.stdin.flush()

    def receive(self, timeout=18):
        require(self.pending is not None, 'no pending mysql command')
        deadline, output = time.monotonic() + timeout, []
        while True:
            try:
                line = self.lines.get(timeout=max(0, deadline - time.monotonic()))
            except queue.Empty:
                raise TimeoutError(f'mysql command timed out; last lines {output[-4:]}') from None
            if line is None:
                raise RuntimeError(f'mysql session closed; last lines {output[-4:]}')
            if line == self.pending:
                self.pending = None
                break
            if line:
                output.append(line)
        errors, values = [], []
        for line in output:
            match = ERROR.fullmatch(line)
            if match:
                code, sqlstate, message = match.groups()
                errors.append({'code': int(code), 'sqlstate': sqlstate, 'message': message, 'raw': line})
            else:
                values.append(line)
        return {'errors': errors, 'values': values}

    def run(self, sql):
        self.send(sql)
        result = self.receive()
        require(not result['errors'], 'unexpected native SQL error: ' + repr(result['errors']))
        return result['values']

    def close(self):
        if self.proc.poll() is None:
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=2)
            except (BrokenPipeError, subprocess.TimeoutExpired):
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    self.proc.wait(timeout=3)
        elif not self.proc.stdin.closed:
            self.proc.stdin.close()
        self.reader.join(timeout=3)
        require(not self.reader.is_alive(), 'mysql output reader did not exit')
        self.proc.stdout.close()


class Lab:
    def __init__(self):
        self.name = 'infra-innodb-' + uuid.uuid4().hex[:12]
        self.owner = f'{OWNER_LABEL}={self.name}'
        self.volume = self.name + '-data'
        self.container = None
        self.local = False
        self.sessions = []

    def docker(self, *args, **kwargs):
        return command(['docker', *args], **kwargs)

    def client(self, tcp=False):
        args = ['docker', 'exec', '-i', '-e', 'MYSQL_PWD=' + ROOT_PASSWORD, self.container,
                'mysql', '-uroot', '--batch', '--raw', '--unbuffered', '--skip-column-names', '--connect-timeout=3']
        if tcp:
            args.extend(['--protocol=TCP', '--host=127.0.0.1'])
        return args

    def sql(self, sql):
        return command(self.client(), data=sql.rstrip() + '\n').stdout.rstrip('\n')

    def json_rows(self, sql):
        return [json.loads(line) for line in self.sql(sql).splitlines() if line]

    def start(self):
        require(shutil.which('docker'), 'Docker CLI required')
        require(not os.getenv('DOCKER_HOST') and not os.getenv('DOCKER_CONTEXT'), 'unset Docker endpoint overrides')
        endpoint = self.docker('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}').stdout.strip()
        permitted = {'unix:///var/run/docker.sock', 'unix:///run/docker.sock',
                     f'unix:///run/user/{os.getuid()}/docker.sock'}
        require(endpoint in permitted, 'only standard local Docker unix endpoints are supported')
        engine = self.docker('info', '--format', '{{.OSType}} {{.Architecture}} {{.KernelVersion}}').stdout.strip()
        require(engine.startswith('linux '), 'Linux Docker engine required')
        self.local = True
        self.docker('pull', IMAGE, timeout=180)
        image = self.docker('image', 'inspect', IMAGE, '--format', '{{json .}}').stdout
        image = json.loads(image)
        name = self.docker('volume', 'create', '--label', self.owner, self.volume).stdout.strip()
        require(name == self.volume, 'unexpected volume name')
        label = self.docker('volume', 'inspect', '--format', '{{index .Labels "' + OWNER_LABEL + '"}}', self.volume).stdout.strip()
        require(label == self.name, 'data volume is not owned by this run')
        self.container = self.docker('create', '--name', self.name, '--label', self.owner, '--network', 'none',
                                     '--memory', '1g', '--pids-limit', '256', '--env', 'MYSQL_ROOT_PASSWORD=' + ROOT_PASSWORD,
                                     '--mount', f'type=volume,source={self.volume},target=/var/lib/mysql', IMAGE,
                                     '--performance-schema=ON', '--innodb-deadlock-detect=ON',
                                     '--innodb-buffer-pool-size=67108864', '--innodb-redo-log-capacity=67108864',
                                     '--max-connections=30').stdout.strip()
        self.docker('start', self.container)
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            # The image's temporary initialization server uses --skip-networking.
            # A successful internal TCP query proves the final server has started.
            p = command(self.client(tcp=True), data='SELECT VERSION();\n', check=False, timeout=8)
            if p.returncode == 0:
                version = p.stdout.strip()
                require(version == VERSION, 'unexpected MySQL version: ' + version)
                return {'version': version, 'docker_kernel': engine, 'image_id': image['Id'],
                        'repo_digests': image['RepoDigests'], 'image_architecture': image['Architecture'],
                        'host_python': platform.python_version(), 'network_mode': 'none'}
            time.sleep(0.6)
        raise RuntimeError('final mysqld did not become reachable via internal TCP')

    def session(self):
        s = Session(self.client())
        self.sessions.append(s)
        connection = s.run('SET SESSION innodb_lock_wait_timeout=40; '
                           'SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ; SELECT CONNECTION_ID()')
        require(len(connection) == 1, 'expected one connection ID')
        return int(connection[0]), s

    def owned(self, resource):
        args = ('ps', '-aq') if resource == 'container' else ('volume', 'ls', '-q')
        return self.docker(*args, '--filter', 'label=' + self.owner).stdout.splitlines()

    def cleanup(self):
        if not self.local:
            return {'attempted': False, 'remaining_containers': [], 'remaining_volumes': []}
        errors = []
        for s in self.sessions:
            try:
                s.close()
            except Exception as error:
                errors.append(str(error))
        for cid in self.owned('container'):
            self.docker('rm', '-f', cid)
        for name in self.owned('volume'):
            self.docker('volume', 'rm', name)
        result = {'attempted': True, 'remaining_containers': self.owned('container'),
                  'remaining_volumes': self.owned('volume')}
        require(not any((errors, result['remaining_containers'], result['remaining_volumes'])),
                'cleanup incomplete: ' + repr((errors, result)))
        return result


def fixture(lab):
    lab.sql(f"""
CREATE DATABASE {DB};
CREATE TABLE {DB}.orders(id INT PRIMARY KEY, tenant_id INT NOT NULL, created_seq INT NOT NULL,
  amount INT NOT NULL) ENGINE=InnoDB;
CREATE TABLE {DB}.accounts(id INT PRIMARY KEY, balance INT NOT NULL) ENGINE=InnoDB;
CREATE TABLE {DB}.receipts(operation_id VARCHAR(32) PRIMARY KEY, delta1 INT NOT NULL,
  delta2 INT NOT NULL) ENGINE=InnoDB;
INSERT INTO {DB}.accounts VALUES (1,100),(2,100);
""")
    for start in range(1, TOTAL + 1, 256):
        rows = ','.join(f'({i},{i % 16},{i // 16},{amount(i)})' for i in range(start, start + 256))
        lab.sql(f'INSERT INTO {DB}.orders VALUES {rows};')
    return lab.json_rows(f"""SELECT JSON_OBJECT('name',TABLE_NAME,'engine',ENGINE)
FROM information_schema.tables WHERE TABLE_SCHEMA='{DB}' ORDER BY TABLE_NAME;""")


def capture_plan(lab):
    return {'tree': lab.sql('EXPLAIN ANALYZE ' + QUERY + ';'),
            'rows': [[int(x) for x in line.split('\t')] for line in lab.sql(QUERY + ';').splitlines()]}


def balances(lab):
    return lab.json_rows(f"SELECT JSON_ARRAY(id,balance) FROM {DB}.accounts ORDER BY id;")


def receipts(lab):
    return lab.json_rows(f"SELECT JSON_ARRAY(operation_id,delta1,delta2) FROM {DB}.receipts ORDER BY operation_id;")


def wait_edge(lab, waiting, holding, row):
    deadline = time.monotonic() + 15
    observed = []
    while time.monotonic() < deadline:
        observed = lab.json_rows(WAIT_SQL)
        for item in observed:
            if item['waiting_connection'] == waiting and item['holding_connection'] == holding and item['waiting_row'] == str(row):
                return item
        time.sleep(0.08)
    raise TimeoutError('expected record-lock wait did not appear: ' + repr(observed))


def update(id_, delta):
    return f'UPDATE {DB}.accounts SET balance=balance+{delta} WHERE id={id_}'


def receipt(name, delta1, delta2):
    return f"INSERT INTO {DB}.receipts VALUES ('{name}',{delta1},{delta2})"


def run(lab, report):
    report['environment'] = lab.start()
    report['settings'] = lab.json_rows("SELECT JSON_OBJECT('performance_schema',@@performance_schema,"
                                      "'innodb_deadlock_detect',@@innodb_deadlock_detect);")[0]
    report['tables'] = fixture(lab)
    report['query'] = {'sql': QUERY, 'orders': int(lab.sql(f'SELECT COUNT(*) FROM {DB}.orders;')),
                       'before': capture_plan(lab)}
    lab.sql(f'CREATE INDEX {INDEX} ON {DB}.orders(tenant_id,created_seq,id); ANALYZE TABLE {DB}.orders;')
    report['query']['after'] = capture_plan(lab)
    print('observe native record lock wait', file=sys.stderr, flush=True)
    left_id, left = lab.session()
    right_id, right = lab.session()
    report['connections'] = {'left': left_id, 'right': right_id}
    wait = report['wait'] = {'before': balances(lab)}
    left.run('START TRANSACTION; ' + update(1, 10) + '; ' + receipt('wait-holder', 10, 0))
    right.send('START TRANSACTION; ' + update(1, 20) + '; SELECT ROW_COUNT()')
    wait['edge'] = wait_edge(lab, right_id, left_id, 1)
    wait['observer_while_waiting'] = balances(lab)
    left.run('COMMIT')
    wait['resumed_statement'] = right.receive()
    require(wait['resumed_statement'] == {'errors': [], 'values': ['1']}, 'waiter did not update one row after release')
    right.run(receipt('wait-waiter', 20, 0) + '; COMMIT')
    wait.update(after=balances(lab), receipts=receipts(lab))

    print('observe native deadlock and rollback', file=sys.stderr, flush=True)
    dead = report['deadlock'] = {}
    left.run('START TRANSACTION; ' + update(1, 3) + '; ' + receipt('dead-left', 3, 5))
    right.run('START TRANSACTION; ' + update(2, 7) + '; ' + receipt('dead-right', 11, 7))
    left.send(update(2, 5) + '; SELECT ROW_COUNT()')
    dead['first_edge'] = wait_edge(lab, left_id, right_id, 2)
    right.send(update(1, 11) + '; SELECT ROW_COUNT()')
    # Both mysql clients continue to the marker even if their UPDATE receives 1213.
    dead['second_updates'] = {'left': left.receive(), 'right': right.receive()}
    victims = [role for role, result in dead['second_updates'].items() if result['errors']]
    require(len(victims) == 1, 'expected exactly one native deadlock victim')
    dead['victim'] = victim = victims[0]
    survivor = 'right' if victim == 'left' else 'left'
    dead['committed'] = survivor
    errors = dead['second_updates'][victim]['errors']
    require(len(errors) == 1 and (errors[0]['code'], errors[0]['sqlstate']) == (1213, '40001'), 'expected MySQL deadlock error 1213/40001')
    require(dead['second_updates'][survivor] == {'errors': [], 'values': ['1']}, 'survivor update did not affect one row')
    dead['observer_before_commit'] = balances(lab)
    # Capture the native server's latest-deadlock diagnostic before teardown.
    dead['innodb_status'] = lab.sql('SHOW ENGINE INNODB STATUS;')
    sessions = {'left': left, 'right': right}
    sessions[survivor].run('COMMIT')
    # A 1213 victim has already rolled back its entire transaction.
    sessions[victim].run('ROLLBACK')
    dead.update(after=balances(lab), receipts=receipts(lab))
    report['final_connections'] = {role: int(s.run('SELECT CONNECTION_ID()')[0]) for role, s in sessions.items()}
    report['remaining_waits'] = lab.json_rows(WAIT_SQL)


def plan_iterator(tree, prefix):
    lines = [line.strip().removeprefix('-> ') for line in tree.splitlines()]
    matching = [line for line in lines if line.startswith(prefix)]
    require(len(matching) == 1, 'expected exactly one iterator: ' + prefix + '\n' + tree)
    m = ACTUAL.search(matching[0])
    require(m is not None, 'iterator lacks real rows and loops: ' + matching[0])
    return float(m[1]), int(m[2])


def verify_edge(edge, waiting, holding, row):
    require((edge['waiting_connection'], edge['holding_connection']) == (waiting, holding), 'wrong wait direction')
    require((edge['engine'], edge['schema'], edge['table']) == ('INNODB', DB, 'accounts'), 'unexpected wait object')
    require((edge['waiting_index'], edge['holding_index']) == ('PRIMARY', 'PRIMARY') and
            (edge['waiting_type'], edge['holding_type']) == ('RECORD', 'RECORD'), 'expected two primary-key record locks')
    require((edge['waiting_status'], edge['holding_status']) == ('WAITING', 'GRANTED') and
            (edge['waiting_row'], edge['holding_row']) == (str(row), str(row)) and
            all(edge[k].split(',')[0] == 'X' for k in ('waiting_mode', 'holding_mode')), 'wrong record/mode/status')
    require(edge['waiting_lock_id'] and edge['holding_lock_id'] and
            edge['waiting_lock_id'] != edge['holding_lock_id'], 'lock identities missing')


def verify(report):
    require(report['schema'] == 1 and report['status'] == 'passed' and report['source_sha256'] == source_sha(),
            'record status, schema or source hash mismatch')
    env = report['environment']
    require(env['version'] == VERSION and env['network_mode'] == 'none' and env['image_id'] and
            any(s.endswith(IMAGE.split('@')[1]) for s in env['repo_digests']), 'MySQL environment is not bound')
    require(report['settings'] == {'performance_schema': 1, 'innodb_deadlock_detect': 1}, 'required instrumentation is disabled')
    require(report['tables'] == [{'name': s, 'engine': 'InnoDB'} for s in ('accounts', 'orders', 'receipts')], 'unexpected engine/table inventory')
    q = report['query']
    want = [[i, amount(i)] for i in range(1, TOTAL + 1) if i % 16 == 7 and 200 <= i // 16 <= 250]
    require(q['sql'] == QUERY and q['orders'] == TOTAL and len(want) == 51 and
            q['before']['rows'] == q['after']['rows'] == want, 'query result/fixture mismatch')
    require(plan_iterator(q['before']['tree'], 'Table scan on orders') == (TOTAL, 1), 'unexpected baseline scan rows')
    require(plan_iterator(q['after']['tree'], 'Index range scan on orders using ' + INDEX) == (len(want), 1), 'unexpected indexed scan rows')
    left, right = (report['connections'][k] for k in ('left', 'right'))
    require(type(left) is int and type(right) is int and left > 0 and right > 0 and left != right, 'connections are not distinct')
    require(report['connections'] == report['final_connections'], 'mysql connection identity changed')
    w = report['wait']
    verify_edge(w['edge'], right, left, 1)
    expected_wait_receipts = [['wait-holder', 10, 0], ['wait-waiter', 20, 0]]
    require(w['before'] == w['observer_while_waiting'] == [[1, 100], [2, 100]] and
            w['resumed_statement'] == {'errors': [], 'values': ['1']} and w['after'] == [[1, 130], [2, 100]] and
            w['receipts'] == expected_wait_receipts, 'wait scenario did not reconcile')
    d = report['deadlock']
    verify_edge(d['first_edge'], left, right, 2)
    require({d['victim'], d['committed']} == {'left', 'right'}, 'wrong survivor/victim identities')
    error, = d['second_updates'][d['victim']]['errors']
    match = ERROR.fullmatch(error['raw'])
    require((error['code'], error['sqlstate']) == (1213, '40001') and match and
            match.groups() == ('1213', '40001', error['message']) and 'deadlock' in error['message'].lower(), 'missing native 1213 evidence')
    require(d['second_updates'][d['committed']] == {'errors': [], 'values': ['1']} and
            d['observer_before_commit'] == w['after'] and 'LATEST DETECTED DEADLOCK' in d['innodb_status'] and
            '`' + DB + '`.`accounts`' in d['innodb_status'], 'missing committed-view or native deadlock diagnostic')
    survivor_receipt = ['dead-left', 3, 5] if d['committed'] == 'left' else ['dead-right', 11, 7]
    require(d['receipts'] == [survivor_receipt, *expected_wait_receipts], 'victim receipt survived or survivor receipt missing')
    expected_balances = [[i, 100 + sum(r[i] for r in d['receipts'])] for i in (1, 2)]
    require(d['after'] == expected_balances and report['remaining_waits'] == [], 'balances or lock waits did not reconcile')
    require(report['cleanup'] == {'attempted': True, 'remaining_containers': [], 'remaining_volumes': []}, 'owned resources remain')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--json', type=Path, help='also save the native run record here')
    group.add_argument('--check-record', type=Path, help='validate an existing record without Docker')
    args = parser.parse_args()
    if args.check_record:
        verify(json.loads(args.check_record.read_text()))
        print('PASS source, access plans, record-lock waits, deadlock victim, committed balances and owned teardown')
        return 0
    lab = Lab()
    report = {'schema': 1, 'status': 'failed', 'source_sha256': source_sha(), 'requested_image': IMAGE,
              'scope': 'one actual MySQL InnoDB instance; synthetic queries, lock waits and deadlock; no replication or benchmark',
              'owned_resource_name': lab.name}
    try:
        run(lab, report)
        report['status'] = 'passed'
    except (Exception, KeyboardInterrupt) as error:
        report['error'] = str(error) or type(error).__name__
        if lab.container:
            try:
                p = lab.docker('logs', '--tail', '35', lab.container, timeout=12, check=False)
                report['server_logs_tail'] = (p.stdout + p.stderr)[-6000:]
            except Exception:
                pass
    finally:
        try:
            report['cleanup'] = lab.cleanup()
        except Exception as error:
            report.update(status='failed', cleanup={'error': str(error)})
    if report['status'] == 'passed':
        try:
            verify(report)
        except Exception as error:
            report.update(status='failed', error=str(error))
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.json:
        args.json.write_text(encoded)
    sys.stdout.write(encoded)
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(f'innodb_lab: {error}', file=sys.stderr)
        sys.exit(1)
