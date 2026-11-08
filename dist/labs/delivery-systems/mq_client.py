"""Real AMQP 0-9-1 client. Runs inside the owned internal Docker network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import time

import pika


def connect():
    return pika.BlockingConnection(pika.ConnectionParameters(
        os.environ['GUIDE_BROKER'], credentials=pika.PlainCredentials('guide', 'public-disposable-lab'),
        heartbeat=30, blocked_connection_timeout=10, socket_timeout=10))


def declare(ch, queue):
    return ch.queue_declare(queue=queue, durable=True, arguments={'x-queue-type': 'classic'})


def publish(ch, queue, message='transport-1', op='report-27', amount=37, mandatory=True):
    body = json.dumps({'op': op, 'amount': amount}, sort_keys=True).encode()
    ch.basic_publish(exchange='', routing_key=queue, body=body, mandatory=mandatory,
                     properties=pika.BasicProperties(delivery_mode=2, message_id=message))


def ledger(path, body=None):
    with sqlite3.connect(path) as con:
        con.execute('CREATE TABLE IF NOT EXISTS effects(op TEXT PRIMARY KEY, amount INTEGER NOT NULL, fingerprint TEXT NOT NULL)')
        duplicate = None
        if body is not None:
            data = json.loads(body)
            digest = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT amount,fingerprint FROM effects WHERE op=?', (data['op'],)).fetchone()
            if row:
                assert row == (data['amount'], digest), 'same operation has conflicting parameters'
                duplicate = True
            else:
                con.execute('INSERT INTO effects VALUES(?,?,?)', (data['op'], data['amount'], digest))
                duplicate = False
        rows = con.execute('SELECT op,amount FROM effects ORDER BY op').fetchall()
    return {'effects': len(rows), 'total': sum(r[1] for r in rows), 'operations': rows, 'duplicate': duplicate}


def receive(ch, queue):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        method, props, body = ch.basic_get(queue, auto_ack=False)
        if method:
            return method, props, body
        time.sleep(.05)
    raise TimeoutError('message did not become ready: ' + queue)


def worker(queue, path, early_ack):
    conn = connect()
    ch = conn.channel()
    method, props, body = receive(ch, queue)
    if early_ack:
        ch.basic_ack(method.delivery_tag)
        declare(ch, queue)  # same-channel RPC is a barrier after the asynchronous ACK
    else:
        ledger(path, body)
    print(json.dumps({'message_id': props.message_id, 'delivery_tag': method.delivery_tag}), flush=True)
    sys.stdin.readline()  # parent kills this process, before the missing commit/ACK


def pump(conn, predicate):
    deadline = time.monotonic() + 10
    while not predicate():
        assert time.monotonic() < deadline
        conn.process_data_events(time_limit=.1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--worker')
    ap.add_argument('--db', default='/work/effects.sqlite')
    ap.add_argument('--early-ack', action='store_true')
    ap.add_argument('--phase', choices=['prepare', 'after-restart'], default='prepare')
    args = ap.parse_args()
    if args.worker:
        worker(args.worker, args.db, args.early_ack)
        return
    conn = connect()
    ch = conn.channel()
    version = conn._impl.server_properties['version']
    if args.phase == 'after-restart':
        declare(ch, 'guide_restart')
        method, props, body = receive(ch, 'guide_restart')
        assert props.delivery_mode == 2 and json.loads(body) == {'op': 'survive-restart', 'amount': 7}
        ch.basic_ack(method.delivery_tag)
        ready = declare(ch, 'guide_restart').method.message_count
        assert ready == 0
        print(json.dumps({'broker_version': version, 'persistent_body': json.loads(body), 'ready_after_ack': ready,
                          'scope': 'same durable single-node broker volume after container restart, not power loss or HA'}))
        conn.close()
        return
    rows = {}
    ch.confirm_delivery()
    try:
        publish(ch, 'not-declared', mandatory=True)
        raise AssertionError('mandatory unroutable publish was not returned')
    except pika.exceptions.UnroutableError:
        rows['mandatory'] = {'unroutable_detected': True}
    # Publisher confirm by itself does not imply that any consumer/queue received it.
    publish(ch, 'not-declared', mandatory=False)
    probe = conn.channel()
    try:
        probe.queue_declare('not-declared', passive=True)
        raise AssertionError('unexpected queue')
    except pika.exceptions.ChannelClosedByBroker as exc:
        assert exc.reply_code == 404
        rows['confirm_without_route'] = {'publish_returned_normally': True, 'queue_exists': False}
    declare(ch, 'guide_effect')
    publish(ch, 'guide_effect')
    proc = subprocess.Popen([sys.executable, '-B', __file__, '--worker', 'guide_effect', '--db', args.db],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        first = json.loads(proc.stdout.readline())
        at_crash = ledger(args.db)
        assert at_crash['effects'] == 1 and at_crash['total'] == 37
        proc.kill()
        proc.wait(timeout=5)
        assert proc.returncode == -signal.SIGKILL
        method, props, body = receive(ch, 'guide_effect')
        assert method.redelivered and props.message_id == first['message_id']
        recovered = ledger(args.db, body)
        assert recovered['duplicate'] and recovered['effects'] == 1 and recovered['total'] == 37
        ch.basic_ack(method.delivery_tag)
        publish(ch, 'guide_effect', message='new-transport-same-business')
        again, republished, body = receive(ch, 'guide_effect')
        again_state = ledger(args.db, body)
        assert again_state['duplicate'] and again_state['effects'] == 1
        ch.basic_ack(again.delivery_tag)
        assert declare(ch, 'guide_effect').method.message_count == 0
        rows['effect_before_ack_crash'] = {'kill_exit': proc.returncode, 'first_delivery': first,
            'redelivery': {'message_id': props.message_id, 'delivery_tag': method.delivery_tag, 'redelivered': method.redelivered},
            'republished_message_id': republished.message_id, 'at_crash': at_crash, 'recovered': recovered, 'after_republish': again_state}
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
    declare(ch, 'guide_early_ack')
    publish(ch, 'guide_early_ack', op='early-ack', amount=11)
    negative_db = str(Path(args.db).with_name('early-ack.sqlite'))
    proc = subprocess.Popen([sys.executable, '-B', __file__, '--worker', 'guide_early_ack', '--db', negative_db, '--early-ack'],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        first = json.loads(proc.stdout.readline())
        proc.kill()
        proc.wait(timeout=5)
        remaining = declare(ch, 'guide_early_ack').method.message_count
        effects = ledger(negative_db)
        assert remaining == 0 and effects['effects'] == 0
        rows['ack_before_effect_negative'] = {'kill_exit': proc.returncode, 'ready_messages': remaining,
                                              'business': effects, 'business_oracle_passed': False}
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
    declare(ch, 'guide_push')
    for i in range(2):
        publish(ch, 'guide_push', message='push-' + str(i))
    consumer = conn.channel()
    consumer.basic_qos(prefetch_count=1)
    deliveries = []
    tag = consumer.basic_consume('guide_push', lambda _ch, m, _p, _b: deliveries.append(m.delivery_tag), auto_ack=False)
    pump(conn, lambda: len(deliveries) == 1)
    ready_before_ack = declare(ch, 'guide_push').method.message_count
    assert ready_before_ack == 1 and len(deliveries) == 1
    consumer.basic_ack(deliveries[0])
    pump(conn, lambda: len(deliveries) == 2)
    consumer.basic_ack(deliveries[1])
    consumer.basic_cancel(tag)
    rows['prefetch_push'] = {'prefetch': 1, 'delivered_before_ack': 1, 'ready_before_ack': ready_before_ack,
                             'delivered_after_ack': len(deliveries), 'ready_after_all_ack': declare(ch, 'guide_push').method.message_count}
    declare(ch, 'guide_pull')
    for i in range(2):
        publish(ch, 'guide_pull', message='pull-' + str(i))
    pull = conn.channel()
    pull.basic_qos(prefetch_count=1)
    m1, _, _ = receive(pull, 'guide_pull')
    m2, _, _ = receive(pull, 'guide_pull')
    assert m2.delivery_tag > m1.delivery_tag
    rows['prefetch_get_exception'] = {'prefetch': 1, 'unacked_get_deliveries': 2,
                                     'ready_before_ack': declare(ch, 'guide_pull').method.message_count}
    pull.basic_ack(m1.delivery_tag)
    pull.basic_ack(m2.delivery_tag)
    pull.close()
    declare(ch, 'guide_tags')
    publish(ch, 'guide_tags', message='channel-scope')
    right, wrong = conn.channel(), conn.channel()
    original, _, _ = receive(right, 'guide_tags')
    try:
        wrong.basic_ack(original.delivery_tag)
        declare(wrong, 'guide_tags')
        raise AssertionError('wrong channel ACK was accepted')
    except pika.exceptions.ChannelClosedByBroker as exc:
        assert exc.reply_code == 406 and 'unknown delivery tag' in exc.reply_text.lower()
        rows['wrong_channel_ack'] = {'reply_code': exc.reply_code, 'wrong_channel_closed': wrong.is_closed,
                                      'right_channel_open': right.is_open}
    right.close()
    repeated, prop, _ = receive(ch, 'guide_tags')
    assert repeated.redelivered and prop.message_id == 'channel-scope'
    ch.basic_ack(repeated.delivery_tag)
    declare(ch, 'guide_restart')
    publish(ch, 'guide_restart', op='survive-restart', amount=7)
    pending = declare(ch, 'guide_restart').method.message_count
    assert pending == 1
    report = {'schema': 1, 'status': 'passed', 'broker_version': version, 'pika_version': pika.__version__,
              'cases': rows, 'durable_before_restart': {'ready_messages': pending, 'delivery_mode': 2},
              'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'scope': 'actual AMQP broker and SQLite consumer effects, own internal Docker network; not SQS/Lambda/HA'}
    conn.close()
    print(json.dumps(report))


if __name__ == '__main__':
    main()
