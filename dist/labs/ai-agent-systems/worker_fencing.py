"""Real local processes, SQLite receiver fencing and a separate crash/retry case.

Logical lease time is injected for deterministic ordering. Fencing is enforced
inside the effect receiver's transaction, not by a lease check in the worker.
No distributed consensus, remote tool, or Kairo integration is implemented.
"""
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import sqlite3
import tempfile


def connect(path):
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    db.execute('PRAGMA busy_timeout=10000')
    return db


def initialize(control, receiver):
    with connect(control) as db:
        db.execute('CREATE TABLE lease(task TEXT PRIMARY KEY, owner TEXT, epoch INTEGER, deadline INTEGER)')
        db.execute("INSERT INTO lease VALUES('task-1','A',1,10)")
    with connect(receiver) as db:
        db.execute('CREATE TABLE fence(task TEXT PRIMARY KEY, epoch INTEGER)')
        db.execute("INSERT INTO fence VALUES('task-1',1)")
        db.execute('CREATE TABLE effect(tenant TEXT, op TEXT, digest TEXT, result TEXT, PRIMARY KEY(tenant,op))')


def reserve_lease(control, owner, now):
    with connect(control) as db:
        db.execute('BEGIN IMMEDIATE')
        _, _, epoch, deadline = db.execute('SELECT * FROM lease').fetchone()
        assert now > deadline
        epoch += 1
        db.execute('UPDATE lease SET owner=?,epoch=?,deadline=?', (owner, epoch, now+10))
        db.commit()
    return epoch


def arm_receiver(receiver, epoch):
    # This demo explicitly installs the fence before allowing the new owner to act.
    # Two databases are not an atomic distributed transaction: loss between these
    # steps needs a real coordination protocol and receiver acknowledgements.
    with connect(receiver) as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('UPDATE fence SET epoch=? WHERE task=? AND epoch<?', (epoch, 'task-1', epoch))
        row = db.execute("SELECT epoch FROM fence WHERE task='task-1'").fetchone()
        armed = row is not None and row[0] == epoch
        db.commit()
    return armed


def takeover(control, receiver, owner, now):
    epoch = reserve_lease(control, owner, now)
    if not arm_receiver(receiver, epoch):
        raise RuntimeError('lease reserved but receiver did not arm this exact epoch')
    return epoch


def invoke(receiver, epoch, op, value, tenant='A', tool='report.write'):
    # Trusted server policy, not caller-supplied permissions.
    if tenant != 'A' or tool != 'report.write':
        return {'status': 'denied'}
    digest = hashlib.sha256(json.dumps({'tool': tool, 'value': value}, sort_keys=True).encode()).hexdigest()
    with connect(receiver) as db:
        db.execute('BEGIN IMMEDIATE')
        current, = db.execute("SELECT epoch FROM fence WHERE task='task-1'").fetchone()
        if epoch != current:
            db.rollback()
            return {'status': 'stale_epoch'}
        previous = db.execute('SELECT digest,result FROM effect WHERE tenant=? AND op=?', (tenant, op)).fetchone()
        if previous:
            db.rollback()
            return {'status': 'duplicate', 'result': json.loads(previous[1])} if previous[0] == digest else {'status': 'conflict'}
        result = {'stored_value': value}
        db.execute('INSERT INTO effect VALUES(?,?,?,?)', (tenant, op, digest, json.dumps(result)))
        db.commit()
    return {'status': 'committed', 'result': result}


def paused_a(receiver, ready, release, results):
    ready.set()
    assert release.wait(20)
    # A brand-new operation key prevents deduplication from hiding a missing fence.
    results.put({'worker': 'A', 'pid': os.getpid(), 'result': invoke(receiver, 1, 'fresh-from-A', 99)})


def active_b(receiver, epoch, results):
    results.put({'worker': 'B', 'pid': os.getpid(), 'result': invoke(receiver, epoch, 'fresh-from-B', 7)})


def crash_after_commit(receiver, epoch):
    assert invoke(receiver, epoch, 'crash-operation', 11)['status'] == 'committed'
    os._exit(23)  # This process terminates; it is not the paused A process.


def recovered_c(receiver, epoch, results):
    results.put({'worker': 'C', 'pid': os.getpid(), 'result': invoke(receiver, epoch, 'crash-operation', 11)})


def join(process, expected=0):
    process.join(20)
    if process.is_alive():
        process.terminate()
        process.join()
        raise AssertionError('worker exceeded bounded wait')
    assert process.exitcode == expected, process.exitcode


def main():
    ctx = mp.get_context('spawn')
    with tempfile.TemporaryDirectory(prefix='agent-fence-') as temporary:
        control, receiver = [str(Path(temporary, name+'.sqlite')) for name in ('control', 'receiver')]
        initialize(control, receiver)
        ready, release, results = ctx.Event(), ctx.Event(), ctx.Queue()
        a = ctx.Process(target=paused_a, args=(receiver, ready, release, results))
        a.start()
        assert ready.wait(20) and a.is_alive()
        epoch_b = takeover(control, receiver, 'B', now=11)
        assert epoch_b == 2
        b = ctx.Process(target=active_b, args=(receiver, epoch_b, results))
        b.start(); join(b)
        assert a.is_alive()  # Lease expiry and takeover did not stop A's process.
        release.set(); join(a)
        observations = [results.get(timeout=5), results.get(timeout=5)]
        by_worker = {item['worker']: item for item in observations}
        assert by_worker['A']['result']['status'] == 'stale_epoch'
        assert by_worker['B']['result']['status'] == 'committed'
        assert by_worker['A']['pid'] != by_worker['B']['pid']
        assert invoke(receiver, 2, 'fresh-from-B', 7)['status'] == 'duplicate'
        assert invoke(receiver, 2, 'fresh-from-B', 8)['status'] == 'conflict'
        assert invoke(receiver, 2, 'bad-tenant', 9, tenant='B')['status'] == 'denied'
        assert invoke(receiver, 2, 'bad-tool', 9, tool='shell.exec')['status'] == 'denied'
        crashed = ctx.Process(target=crash_after_commit, args=(receiver, epoch_b))
        crashed.start(); join(crashed, 23)
        epoch_c = takeover(control, receiver, 'C', now=22)
        c = ctx.Process(target=recovered_c, args=(receiver, epoch_c, results))
        c.start(); join(c)
        recovered = results.get(timeout=5)
        assert recovered['result']['status'] == 'duplicate'
        assert recovered['result']['result']['stored_value'] == 11
        assert invoke(receiver, 2, 'old-B-new-op', 77)['status'] == 'stale_epoch'
        assert invoke(receiver, 3, 'new-C-op', 13)['status'] == 'committed'
        with connect(receiver) as db:
            rows = db.execute('SELECT tenant,op,json_extract(result,\'$.stored_value\') FROM effect ORDER BY op').fetchall()
            assert rows == [('A', 'crash-operation', 11), ('A', 'fresh-from-B', 7), ('A', 'new-C-op', 13)]
        # A separate database exposes the non-atomic control/receiver handoff gap.
        gap_control, gap_receiver = [str(Path(temporary, 'gap-'+name+'.sqlite')) for name in ('control', 'receiver')]
        initialize(gap_control, gap_receiver)
        reserved_b = reserve_lease(gap_control, 'B', 11)
        gap_result = invoke(gap_receiver, 1, 'A-before-install', 5)
        assert gap_result['status'] == 'committed'  # Control epoch=2 alone has not fenced A.
        assert arm_receiver(gap_receiver, reserved_b)
        assert invoke(gap_receiver, 1, 'A-after-install', 6)['status'] == 'stale_epoch'
        reserved_c = reserve_lease(gap_control, 'C', 22)
        assert arm_receiver(gap_receiver, reserved_c)
        assert arm_receiver(gap_receiver, reserved_b) is False  # Stale B cannot claim readiness.
        report = {'paused_worker_still_alive_after_takeover': True, 'takeover_epoch': epoch_b,
                  'A': by_worker['A'], 'B': by_worker['B'], 'crash_exit_code': crashed.exitcode,
                  'C_recovered_receipt': recovered, 'effects': rows, 'effect_count': len(rows),
                  'effect_sum': 31, 'stale_new_key_rejected': True,
                  'duplicate_no_effect': True, 'same_key_changed_arguments_rejected': True,
                  'unauthorized_no_effect': True,
                  'handoff_gap_probe': {'old_writer_before_install': gap_result['status'],
                                        'old_writer_after_install': 'stale_epoch',
                                        'superseded_reservation_armed': False},
                  'scope': 'local SQLite receiver + injected logical lease clock; no remote tool/consensus/Kairo'}
        results.close(); results.join_thread()
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
