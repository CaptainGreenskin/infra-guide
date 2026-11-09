#!/usr/bin/env python3
"""Observe real JetStream timeout redelivery and separate SQLite write authority."""
import argparse
import asyncio
from contextlib import closing
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import re
import sqlite3
import subprocess
import sys
import tempfile
import time

import nats
from nats.js.api import AckPolicy, ConsumerConfig, StorageType

ROOT = Path(__file__).resolve().parent
SERVER_VERSION = '2.15.2'
CLIENT_VERSION = '2.16.0'
ACK_WAIT = 1.0
EVENT = {'operation_id': 'report-27:publish', 'amount': 37}
MODES = ('append_only', 'business_id', 'receiver_fence')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def listen_url(process, log):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and process.poll() is None:
        found = re.search(r'Listening for client connections on 127\.0\.0\.1:(\d+)',
                          log.read_text(encoding='utf-8'))
        if found:
            return 'nats://127.0.0.1:' + found[1]
        time.sleep(0.05)
    raise RuntimeError('owned loopback broker did not start: ' + log.read_text(encoding='utf-8')[-3000:])


def initialize(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript('''
            CREATE TABLE authority(operation_id TEXT PRIMARY KEY, generation INTEGER NOT NULL);
            CREATE TABLE effects(revision INTEGER PRIMARY KEY, operation_id TEXT NOT NULL,
                                 writer TEXT NOT NULL, generation INTEGER NOT NULL, amount INTEGER NOT NULL);
            CREATE TABLE inbox(operation_id TEXT PRIMARY KEY, digest TEXT NOT NULL,
                               revision INTEGER NOT NULL REFERENCES effects(revision));
            CREATE TABLE attempts(seq INTEGER PRIMARY KEY, writer TEXT NOT NULL, generation INTEGER NOT NULL,
                                  authority INTEGER NOT NULL, outcome TEXT NOT NULL, revision INTEGER);
        ''')
        with db:
            db.execute('INSERT INTO authority VALUES(?,1)', (EVENT['operation_id'],))


def transfer_authority(path):
    with closing(sqlite3.connect(path)) as db, db:
        db.execute('BEGIN IMMEDIATE')
        changed = db.execute('UPDATE authority SET generation=2 WHERE operation_id=? AND generation=1',
                             (EVENT['operation_id'],)).rowcount
        require(changed == 1, 'authority compare-and-set failed')


def write_effect(path, mode, writer, generation, event):
    operation = event['operation_id']
    digest = sha(encoded(event))
    with closing(sqlite3.connect(path)) as db, db:
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        authority = db.execute('SELECT generation FROM authority WHERE operation_id=?', (operation,)).fetchone()[0]
        existing = None if mode == 'append_only' else db.execute(
            'SELECT digest,revision FROM inbox WHERE operation_id=?', (operation,)).fetchone()
        if mode == 'receiver_fence' and generation != authority:
            outcome, revision = 'stale_writer', None
        elif existing:
            require(existing[0] == digest, 'operation ID payload changed')
            outcome, revision = 'duplicate', existing[1]
        else:
            revision = db.execute('INSERT INTO effects(operation_id,writer,generation,amount) VALUES(?,?,?,?)',
                                  (operation, writer, generation, event['amount'])).lastrowid
            if mode != 'append_only':
                db.execute('INSERT INTO inbox VALUES(?,?,?)', (operation, digest, revision))
            outcome = 'committed'
        db.execute('INSERT INTO attempts(writer,generation,authority,outcome,revision) VALUES(?,?,?,?,?)',
                   (writer, generation, authority, outcome, revision))


def ledger(path):
    with closing(sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        return {table: [dict(row) for row in db.execute(f'SELECT * FROM {table} ORDER BY {order}')]
                for table, order in [('authority', 'operation_id'), ('effects', 'revision'),
                                     ('inbox', 'operation_id'), ('attempts', 'seq')]}


def delivery(message):
    m = message.metadata
    return {'stream': m.stream, 'consumer': m.consumer, 'stream_seq': m.sequence.stream,
            'consumer_seq': m.sequence.consumer, 'delivery_count': m.num_delivered,
            'event': json.loads(message.data)}


def consumer_state(info):
    return {'ack_pending': info.num_ack_pending, 'pending': info.num_pending,
            'ack_floor_stream_seq': info.ack_floor.stream_seq,
            'delivered_consumer_seq': info.delivered.consumer_seq}


async def observe_case(url, admin, directory, mode):
    stream, subject, durable = mode.upper(), 'reports.' + mode, 'WORK'
    await admin.add_stream(name=stream, subjects=[subject], storage=StorageType.FILE,
                           max_msgs=8, max_bytes=1048576)
    configured = await admin.add_consumer(stream, config=ConsumerConfig(
        durable_name=durable, filter_subject=subject, ack_policy=AckPolicy.EXPLICIT,
        ack_wait=ACK_WAIT, max_ack_pending=1, max_deliver=3))
    cfg = configured.config
    publish = await admin.publish(subject, encoded(EVENT), timeout=4)
    database = directory / (mode + '.sqlite')
    initialize(database)
    before = ledger(database)

    a = await nats.connect(servers=[url], name=mode + '-A', allow_reconnect=False, connect_timeout=3)
    try:
        b = await nats.connect(servers=[url], name=mode + '-B', allow_reconnect=False, connect_timeout=3)
        try:
            sub_a = await a.jetstream().pull_subscribe_bind(consumer=durable, stream=stream)
            sub_b = await b.jetstream().pull_subscribe_bind(consumer=durable, stream=stream)
            first, = await sub_a.fetch(1, timeout=5)
            # B waits for the broker to redeliver; A holds its unacknowledged message
            # and stays connected. No process exit, NAK, or synthetic lease timer.
            second, = await sub_b.fetch(1, timeout=6)
            deliveries = [delivery(first), delivery(second)]
            old_connected = a.is_connected
            client_ids = {'A': a.client_id, 'B': b.client_id}
            require(old_connected and b.is_connected and a.client_id != b.client_id,
                    'both independent worker connections must still be live')
            require([d['delivery_count'] for d in deliveries] == [1, 2]
                    and all(d['stream_seq'] == publish.seq and d['event'] == EVENT for d in deliveries),
                    'expected two real deliveries of one stream sequence')
            before_writes = ledger(database)
            transfer_authority(database)
            after_transfer = ledger(database)
            # This is an application-owned counter, not JetStream delivery_count.
            # Release old A's write first, then allow B to attempt its write.
            write_effect(database, mode, 'A', 1, deliveries[0]['event'])
            write_effect(database, mode, 'B', 2, deliveries[1]['event'])
            before_ack = consumer_state(await admin.consumer_info(stream, durable))
            confirmation = await second.ack_sync(timeout=4)
            after_ack = consumer_state(await admin.consumer_info(stream, durable))
            result = {
                'consumer': {'name': cfg.durable_name, 'ack_policy': AckPolicy(cfg.ack_policy).value,
                             'ack_wait_seconds': cfg.ack_wait, 'max_ack_pending': cfg.max_ack_pending,
                             'max_deliver': cfg.max_deliver},
                'publish_ack': {'stream': publish.stream, 'stream_seq': publish.seq},
                'deliveries': deliveries, 'client_ids': client_ids,
                'old_client_connected_after_redelivery': old_connected,
                'before_writes': before_writes, 'initial_ledger': before, 'after_transfer': after_transfer,
                'ledger': ledger(database), 'before_ack': before_ack, 'after_ack': after_ack,
                'ack_confirmation': {'writer': 'B', 'returned': confirmation is not None},
            }
            require(before == before_writes and result['ack_confirmation']['returned']
                    and before_ack['ack_pending'] == 1 and after_ack['ack_pending'] == 0
                    and after_ack['ack_floor_stream_seq'] == publish.seq, 'broker or receiver ordering mismatch')
            count, outcomes = {
                'append_only': (2, ['committed', 'committed']),
                'business_id': (1, ['committed', 'duplicate']),
                'receiver_fence': (1, ['stale_writer', 'committed']),
            }[mode]
            require(len(result['ledger']['effects']) == count
                    and [row['outcome'] for row in result['ledger']['attempts']] == outcomes,
                    'unexpected receiver contrast for ' + mode)
            return result
        finally:
            await b.close()
    finally:
        await a.close()


async def suite(url, directory):
    client = await nats.connect(servers=[url], name='jetstream-lab-control',
                                allow_reconnect=False, connect_timeout=3)
    try:
        connected = client.connected_server_version
        require(f'{connected.major}.{connected.minor}.{connected.patch}' == SERVER_VERSION,
                'unexpected server handshake version')
        admin = client.jetstream()
        return {mode: await observe_case(url, admin, directory, mode) for mode in MODES}
    finally:
        await client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', type=Path, required=True, help='official nats-server v' + SERVER_VERSION + ' binary')
    parser.add_argument('--output', type=Path, help='also save the native record')
    args = parser.parse_args()
    binary = args.server.resolve(strict=True)
    server_version = subprocess.check_output([str(binary), '--version'], text=True, timeout=15).strip()
    require(server_version == 'nats-server: v' + SERVER_VERSION and version('nats-py') == CLIENT_VERSION,
            'use the pinned server and client versions')
    with tempfile.TemporaryDirectory(prefix='jetstream-redelivery-') as temp:
        directory = Path(temp)
        log = directory / 'broker.log'
        with log.open('wb') as output:
            process = subprocess.Popen([str(binary), '-js', '-sd', str(directory / 'store'),
                                        '-a', '127.0.0.1', '-p', '-1'], cwd=directory,
                                       stdout=output, stderr=subprocess.STDOUT)
            try:
                url = listen_url(process, log)
                cases = asyncio.run(suite(url, directory))
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
        broker_stopped = process.poll() is not None
    record = {
        'schema': 'jetstream-redelivery-v1', 'status': 'passed',
        'environment': {'server': SERVER_VERSION, 'nats_py': CLIENT_VERSION, 'python': platform.python_version(),
                        'sqlite': sqlite3.sqlite_version, 'system': platform.system(),
                        'machine': platform.machine(), 'server_binary_sha256': sha(binary.read_bytes())},
        'source_sha256': {name: sha((ROOT / name).read_bytes())
                          for name in ('jetstream_redelivery.py', 'requirements.txt')},
        'fixture': EVENT, 'loopback_address': '127.0.0.1', 'cases': cases,
        'cleanup': {'broker_stopped': broker_stopped, 'scratch_removed': not directory.exists()},
    }
    text = json.dumps(record, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.write_text(text, encoding='utf-8')
    print(text, end='')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        print('jetstream_redelivery: ' + str(error), file=sys.stderr)
        sys.exit(1)
