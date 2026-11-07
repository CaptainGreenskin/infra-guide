"""Isolated MySQL 8.4 crash/PITR lesson using Docker and synthetic balances only.

Creates uniquely named containers and volumes, exposes no ports, removes only
its own resources, and never connects to an existing MySQL server.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import secrets
import selectors
import subprocess
import tempfile
import time
import uuid


class Lab:
    def __init__(self, image, folder):
        self.image, self.folder = image, folder
        self.prefix = 'infra-pitr-' + uuid.uuid4().hex[:12]
        self.containers, self.volumes = [], []
        self.password = secrets.token_urlsafe(28)
        self.config = folder / 'client.cnf'
        self.config.write_text('[client]\nuser=root\npassword=' + self.password + '\nprotocol=socket\n')
        self.config.chmod(0o600)

    def docker(self, *args, data=None, check=True, timeout=90, env=None):
        result = subprocess.run(['docker', *args], input=data, capture_output=True,
                                timeout=timeout, env=env)
        if check and result.returncode:
            detail = (result.stderr or result.stdout).decode(errors='replace').replace(self.password, '[redacted]')
            raise RuntimeError('Docker ' + args[0] + ' exited ' + str(result.returncode) + ': ' + detail[-1800:])
        return result

    def start(self, role, server_id, binary_log):
        name, volume = self.prefix + '-' + role, self.prefix + '-' + role + '-data'
        self.docker('volume', 'create', '--label', 'infraguide=isolated-lesson', volume)
        self.volumes.append(volume)
        env = dict(os.environ, MYSQL_ROOT_PASSWORD=self.password)
        args = ['run', '-d', '--name', name, '--network', 'none', '--memory', '1g',
                '--pids-limit', '256', '--env', 'MYSQL_ROOT_PASSWORD',
                '--mount', 'type=volume,source=' + volume + ',target=/var/lib/mysql',
                '--mount', 'type=bind,source=' + str(self.config) + ',target=/run/infra-client.cnf,readonly',
                self.image, '--server-id=' + str(server_id), '--skip-networking',
                '--innodb-buffer-pool-size=67108864', '--innodb-redo-log-capacity=67108864',
                '--innodb-flush-log-at-trx-commit=1', '--sync-binlog=1', '--gtid-mode=OFF',
                '--binlog-format=ROW', '--binlog-expire-logs-seconds=0',
                '--log-bin=mysql-bin' if binary_log else '--skip-log-bin']
        self.containers.append(name)
        self.docker(*args, env=env)
        self.wait(name)
        return name

    def mysql_args(self, name):
        return ['docker', 'exec', '-i', name, 'mysql', '--defaults-extra-file=/run/infra-client.cnf',
                '--batch', '--raw', '--skip-column-names', '--binary-mode', '--unbuffered']

    def sql(self, name, sql, check=True):
        data = sql.encode() if isinstance(sql, str) else sql
        result = subprocess.run(self.mysql_args(name), input=data, capture_output=True, timeout=45)
        if check and result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace').replace(self.password, '[redacted]')[:1800])
        return result

    def wait(self, name):
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            attempt = self.sql(name, 'SELECT 1;', check=False)
            if attempt.returncode == 0 and attempt.stdout.strip() == b'1':
                return
            time.sleep(1)
        raise RuntimeError('MySQL readiness timeout for the isolated lesson container')

    def position(self, name):
        row = self.sql(name, 'SHOW BINARY LOG STATUS;').stdout.decode().splitlines()[0].split('\t')
        return {'file': row[0], 'position': int(row[1])}

    def commit(self, name, op, delta=None, reset=False):
        mutation = 'UPDATE lab.account SET balance=0 WHERE id=1;' if reset else (
            'UPDATE lab.account SET balance=balance+(' + str(delta) + ') WHERE id=1;')
        amount = -125 if reset else delta
        self.sql(name, "START TRANSACTION;" + mutation +
                 "INSERT INTO lab.receipt VALUES ('" + op + "'," + str(amount) + ");COMMIT;")

    def state(self, name):
        balance = int(self.sql(name, 'SELECT balance FROM lab.account WHERE id=1;').stdout.strip())
        rows = self.sql(name, 'SELECT op_id,delta FROM lab.receipt ORDER BY op_id;').stdout.decode().splitlines()
        return {'balance': balance, 'operations': [[a, int(b)] for a, b in (r.split('\t') for r in rows)]}

    def restore(self, target, baseline, stream=b''):
        self.sql(target, 'DROP DATABASE IF EXISTS lab;')
        self.sql(target, baseline)
        if stream:
            self.sql(target, stream)
        return self.state(target)

    def binlog(self, source, files, start, stop=None):
        args = ['exec', source, 'mysqlbinlog', '--start-position=' + str(start)]
        if stop is not None:
            args.append('--stop-position=' + str(stop))
        args.extend('/var/lib/mysql/' + f for f in files)
        return self.docker(*args).stdout

    def cleanup(self):
        for name in reversed(self.containers):
            self.docker('rm', '-f', name, check=False)
        for volume in reversed(self.volumes):
            self.docker('volume', 'rm', volume, check=False)

    def run(self):
        self.docker('pull', self.image, timeout=300)
        digest = json.loads(self.docker('image', 'inspect', self.image, '--format', '{{json .RepoDigests}}').stdout)
        source = self.start('source', 101, True)
        version = self.sql(source, 'SELECT VERSION();').stdout.decode().strip()
        assert version.startswith('8.4.'), 'This lesson is explicitly scoped to MySQL 8.4'
        self.sql(source, 'CREATE DATABASE lab;CREATE TABLE lab.account(id INT PRIMARY KEY,balance BIGINT NOT NULL) ENGINE=InnoDB;'
                 'CREATE TABLE lab.receipt(op_id VARCHAR(32) PRIMARY KEY,delta BIGINT NOT NULL) ENGINE=InnoDB;'
                 'INSERT INTO lab.account VALUES(1,100);')
        baseline = self.docker('exec', source, 'mysqldump', '--defaults-extra-file=/run/infra-client.cnf',
                              '--single-transaction', '--source-data=2', '--set-gtid-purged=OFF',
                              '--databases', 'lab').stdout
        match = re.search(rb"SOURCE_LOG_FILE='([^']+)', SOURCE_LOG_POS=(\d+)", baseline)
        assert match, 'The consistent snapshot must include its actual source coordinates'
        start = {'file': match[1].decode(), 'position': int(match[2])}
        self.commit(source, 'T101', 10)
        self.sql(source, 'FLUSH BINARY LOGS;')
        self.commit(source, 'T102', 20)
        self.commit(source, 'T103', -5)
        stop = self.position(source)
        before_bad = self.state(source)
        assert before_bad['balance'] == 125
        self.commit(source, 'T104', reset=True)
        self.commit(source, 'T105', 7)
        committed = self.state(source)
        assert committed['balance'] == 7
        self.sql(source, 'FLUSH BINARY LOGS;')
        files = self.sql(source, 'SHOW BINARY LOGS;').stdout.decode().splitlines()
        files = [row.split('\t')[0] for row in files]
        chain = files[files.index(start['file']):files.index(stop['file']) + 1]
        assert len(chain) == 2
        correct_stream = self.binlog(source, chain, start['position'], stop['position'])
        whole_stream = self.binlog(source, chain, start['position'])
        missing_stream = self.binlog(source, chain[1:], 4, stop['position'])
        target = self.start('restore', 102, False)
        baseline_only = self.restore(target, baseline)
        whole_history = self.restore(target, baseline, whole_stream)
        missing_log = self.restore(target, baseline, missing_stream)
        recovered = self.restore(target, baseline, correct_stream)
        assert [s['balance'] for s in [baseline_only, whole_history, missing_log, recovered]] == [100, 7, 115, 125]
        assert recovered == before_bad
        assert [op for op, _ in missing_log['operations']] == ['T102', 'T103']
        self.commit(target, 'TNEW', 3)
        writable_after_restore = self.state(target)
        assert writable_after_restore['balance'] == 128

        # Hold one uncommitted update while a second session still sees committed balance 7.
        hold = subprocess.Popen(self.mysql_args(source), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE)
        hold.stdin.write(b"START TRANSACTION;UPDATE lab.account SET balance=999 WHERE id=1;SELECT 'HOLDING';DO SLEEP(60);COMMIT;")
        hold.stdin.close()
        with selectors.DefaultSelector() as selector:
            selector.register(hold.stdout, selectors.EVENT_READ)
            assert selector.select(12), 'The holding transaction never acknowledged its update'
            assert hold.stdout.readline().strip() == b'HOLDING'
        assert self.state(source) == committed
        self.docker('kill', '--signal', 'KILL', source)
        hold.wait(timeout=20)
        assert hold.returncode != 0
        self.docker('start', source)
        self.wait(source)
        after_crash = self.state(source)
        assert after_crash == committed, 'Crash recovery keeps the committed bad transaction too'
        return {'status': 'passed', 'image': self.image, 'image_digests': digest, 'mysql_version': version,
                'snapshot_next_event': start, 'exclude_bad_transaction_from': stop, 'required_files': chain,
                'baseline_only': baseline_only, 'full_replay': whole_history,
                'missing_first_log': missing_log, 'point_in_time_recovery': recovered,
                'post_restore_write': writable_after_restore,
                'process_crash': {'uncommitted_value': 999, 'held_client_exit_code': hold.returncode,
                                  'committed_state_before': committed, 'state_after_restart': after_crash},
                'stream_sha256': {label: hashlib.sha256(data).hexdigest() for label, data in
                                  [('baseline', baseline), ('correct', correct_stream), ('full', whole_stream)]},
                'scope': 'Real isolated MySQL/InnoDB, logical dump, two binlogs, replay and mysqld SIGKILL. '
                         'No host power-loss, replication, managed database, production load or external application test.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', default='mysql:8.4')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    # Require an explicit local Unix Docker endpoint; never use a remote user context.
    context = subprocess.run(['docker', 'context', 'inspect'], capture_output=True, check=True)
    endpoint = json.loads(context.stdout)[0]['Endpoints']['docker']['Host']
    if not endpoint.startswith('unix://') or (os.environ.get('DOCKER_HOST') and not os.environ['DOCKER_HOST'].startswith('unix://')):
        raise RuntimeError('Use a local Unix Docker engine for this isolated lesson')
    with tempfile.TemporaryDirectory(prefix='infra-mysql-') as directory:
        lab = Lab(args.image, Path(directory))
        try:
            result = lab.run()
        finally:
            lab.cleanup()
    result.update(source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                  python=platform.python_version(), system=platform.system())
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.report:
        args.report.write_text(serialized)
    print(serialized, end='')


if __name__ == '__main__':
    main()
