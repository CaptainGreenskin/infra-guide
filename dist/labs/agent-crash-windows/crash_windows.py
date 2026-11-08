"""POSIX SIGKILL recovery windows with a surviving HTTP receiver and separate SQLite files."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
import urllib.request
import uuid

PARAMS = {'account': 'demo', 'amount': 37}
FINGERPRINT = hashlib.sha256(json.dumps(PARAMS, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def db(path):
    conn = sqlite3.connect(path, timeout=10)
    conn.execute('PRAGMA synchronous=FULL')
    return conn


def request(base, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)


def barrier(name, selected):
    if name == selected:
        print(json.dumps({'barrier': name}), flush=True)
        sys.stdin.readline()  # parent kills this process; no graceful cleanup is assumed


def worker(root, base, selected, recovery=False, new_key=False):
    path = root / 'runner.sqlite'
    with db(path) as con:
        con.execute('CREATE TABLE IF NOT EXISTS task(id INTEGER PRIMARY KEY, op TEXT, fingerprint TEXT, phase TEXT, observation TEXT)')
        con.execute('INSERT OR IGNORE INTO task VALUES(1,?,?,?,NULL)', ('logical-add-1', FINGERPRINT, 'INTENT'))
        if new_key:
            # Explicit negative: a retry has been given a fresh business identity.
            con.execute('UPDATE task SET op=?, phase=?, observation=NULL WHERE id=1', ('new-' + uuid.uuid4().hex, 'INTENT'))
    barrier('intent', selected)
    with db(path) as con:
        op, fingerprint, phase, observation = con.execute('SELECT op,fingerprint,phase,observation FROM task WHERE id=1').fetchone()
    assert fingerprint == FINGERPRINT
    if phase == 'DONE':
        print(json.dumps({'phase': phase, 'path': 'already_done'}), flush=True)
        return
    if phase == 'OBSERVED':
        receipt = json.loads(observation)
        path_taken = 'durable_observation'
    else:
        receipt = request(base, '/receipt/' + op)['receipt'] if recovery else None
        path_taken = 'queried_receipt' if receipt else 'submitted_original_operation'
        if receipt is None:
            receipt = request(base, '/effect', {'op': op, 'fingerprint': fingerprint, 'params': PARAMS})['receipt']
        barrier('response', selected)
        with db(path) as con:
            con.execute('UPDATE task SET phase=?, observation=? WHERE id=1', ('OBSERVED', json.dumps(receipt)))
    barrier('observation', selected)
    assert receipt['op'] == op and receipt['fingerprint'] == fingerprint and receipt['amount'] == 37
    with db(path) as con:
        con.execute('UPDATE task SET phase=? WHERE id=1', ('DONE',))
    barrier('done', selected)
    print(json.dumps({'phase': 'DONE', 'path': path_taken}), flush=True)


class Receiver(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, path, pause):
        self.path, self.pause = path, pause
        self.arrived = threading.Event()
        self.committed = threading.Event()
        self.release = threading.Event()
        self.audit = []
        with db(path) as con:
            con.execute('CREATE TABLE counter(value INTEGER NOT NULL)')
            con.execute('INSERT INTO counter VALUES(0)')
            con.execute('CREATE TABLE receipt(op TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, amount INTEGER NOT NULL)')
        super().__init__(('127.0.0.1', 0), Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, body):
        data = json.dumps(body).encode()
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # killed caller does not roll back receiver commit

    def do_GET(self):
        op = self.path.removeprefix('/receipt/')
        with db(self.server.path) as con:
            row = con.execute('SELECT op,fingerprint,amount FROM receipt WHERE op=?', (op,)).fetchone()
        self.server.audit.append('receipt_found' if row else 'receipt_absent')
        self.reply({'receipt': None if row is None else dict(zip(('op', 'fingerprint', 'amount'), row))})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        assert self.path == '/effect' and body['params'] == PARAMS and body['fingerprint'] == FINGERPRINT
        self.server.arrived.set()
        if self.server.pause == 'before_commit':
            assert self.server.release.wait(15)
        with db(self.server.path) as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT op,fingerprint,amount FROM receipt WHERE op=?', (body['op'],)).fetchone()
            if row:
                assert row[1] == body['fingerprint']
                self.server.audit.append('duplicate')
            else:
                con.execute('UPDATE counter SET value=value+?', (37,))
                row = (body['op'], body['fingerprint'], 37)
                con.execute('INSERT INTO receipt VALUES(?,?,?)', row)
                self.server.audit.append('effect_commit')
        self.server.committed.set()
        if self.server.pause == 'after_commit':
            assert self.server.release.wait(15)
        self.reply({'receipt': dict(zip(('op', 'fingerprint', 'amount'), row))})


def facts(root):
    with db(root / 'runner.sqlite') as con:
        row = con.execute('SELECT op,phase,observation FROM task WHERE id=1').fetchone()
    with db(root / 'tool.sqlite') as con:
        amount = con.execute('SELECT value FROM counter').fetchone()[0]
        receipts = con.execute('SELECT op,fingerprint,amount FROM receipt ORDER BY op').fetchall()
    return {'operation': row[0], 'runner_phase': row[1], 'observation': None if row[2] is None else json.loads(row[2]),
            'amount': amount, 'effects': len(receipts),
            'receipts': [dict(zip(('op', 'fingerprint', 'amount'), r)) for r in receipts]}


def oracle(state):
    # Independent receiver truth and business target; a DONE flag alone is insufficient.
    return (state['runner_phase'] == 'DONE' and state['effects'] == 1 and state['amount'] == 37
            and state['observation'] == state['receipts'][0]
            and state['receipts'][0]['op'] == 'logical-add-1')


def run_case(name, negative=False):
    pause = name if name in ('before_commit', 'after_commit') else ''
    selected = '' if pause else name
    with tempfile.TemporaryDirectory(prefix='infra-crash-') as tmp:
        root = Path(tmp)
        server = Receiver(root / 'tool.sqlite', pause)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = 'http://127.0.0.1:' + str(server.server_address[1])
        cmd = [sys.executable, '-B', str(Path(__file__).resolve()), '--worker', str(root), '--base', base]
        proc = subprocess.Popen(cmd + ['--barrier', selected], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            if pause:
                event = server.arrived if pause == 'before_commit' else server.committed
                assert event.wait(10), name
            else:
                assert json.loads(proc.stdout.readline()) == {'barrier': selected}
            proc.kill()
            proc.wait(timeout=5)
            assert proc.returncode == -signal.SIGKILL
            at_crash = facts(root)
            absent_while_old_request_lives = None
            if pause == 'before_commit':
                absent_while_old_request_lives = request(base, '/receipt/logical-add-1')['receipt'] is None
                assert absent_while_old_request_lives
            server.release.set()
            if pause:
                assert server.committed.wait(10)
            after_old_request = facts(root)
            resumed = subprocess.run(cmd + ['--recover'] + (['--new-key'] if negative else []), text=True, capture_output=True, timeout=15)
            assert resumed.returncode == 0, resumed.stderr
            recovered = facts(root)
            accepted = oracle(recovered)
            assert accepted != negative
            audit_before_done_retry = len(server.audit)
            again = subprocess.run(cmd + ['--recover'], text=True, capture_output=True, timeout=15)
            assert again.returncode == 0, again.stderr
            assert len(server.audit) == audit_before_done_retry, 'DONE retry must make no receiver calls'
            corrupted_rejected = None
            if name == 'observation' and not negative:
                with db(root / 'runner.sqlite') as con:
                    observation = recovered['observation'].copy()
                    observation['amount'] = 99
                    con.execute('UPDATE task SET observation=? WHERE id=1', (json.dumps(observation),))
                corrupted_rejected = not oracle(facts(root))
                assert corrupted_rejected
            return {'window': name, 'negative_new_identity': negative, 'kill_exit_code': proc.returncode,
                    'at_crash': at_crash, 'receipt_absent_while_old_request_lives': absent_while_old_request_lives,
                    'after_old_request': after_old_request, 'recovered': recovered,
                    'resume_path': json.loads(resumed.stdout)['path'], 'independent_oracle_accepted': accepted,
                    'done_retry_http_calls': len(server.audit) - audit_before_done_retry,
                    'corrupt_local_observation_rejected': corrupted_rejected, 'receiver_audit': server.audit}
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)
            server.release.set()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--worker', type=Path)
    ap.add_argument('--base')
    ap.add_argument('--barrier', default='')
    ap.add_argument('--recover', action='store_true')
    ap.add_argument('--new-key', action='store_true')
    args = ap.parse_args()
    if args.worker:
        worker(args.worker, args.base, args.barrier, args.recover, args.new_key)
        return
    assert os.name == 'posix', 'This experiment uses POSIX SIGKILL'
    cases = [run_case(name) for name in ('intent', 'before_commit', 'after_commit', 'response', 'observation', 'done')]
    negative = run_case('after_commit', negative=True)
    print(json.dumps({'schema': 1, 'status': 'passed', 'params': PARAMS, 'fingerprint': FINGERPRINT,
                      'python': sys.version.split()[0], 'sqlite': sqlite3.sqlite_version,
                      'cases': cases, 'negative': negative,
                      'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                      'scope': 'real POSIX process kill and surviving local HTTP receiver, separate SQLite domains; '
                               'not power-loss durability, network partition, concurrent runners, or Kairo integration'}, indent=2))


if __name__ == '__main__':
    main()
