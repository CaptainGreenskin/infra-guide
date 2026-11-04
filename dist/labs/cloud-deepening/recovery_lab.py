"""SQLite backup + application-journal replay. This is NOT database WAL PITR."""
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile


def connect(path):
    return sqlite3.connect(str(path), isolation_level=None)


def fingerprint(event):
    return hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()


def replay(db, event):
    db.execute('BEGIN IMMEDIATE')
    try:
        old = db.execute('SELECT fingerprint FROM applied WHERE seq=?',
                         (event['seq'],)).fetchone()
        if old:
            if old[0] != fingerprint(event):
                raise ValueError('same sequence, different intent')
            db.execute('COMMIT')
            return False
        last = db.execute('SELECT last_seq FROM watermark').fetchone()[0]
        if event['seq'] != last + 1:
            raise ValueError('journal gap: expected %s, got %s' % (last + 1, event['seq']))
        db.execute('UPDATE account SET balance=balance+? WHERE id=1', (event['delta'],))
        db.execute('INSERT INTO applied VALUES (?,?)', (event['seq'], fingerprint(event)))
        db.execute('UPDATE watermark SET last_seq=?', (event['seq'],))
        db.execute('COMMIT')
        return True
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise


def restore(base, destination, journal, target):
    # Validate availability and identity BEFORE exposing a recovered database.
    unique = {}
    for event in journal:
        seq = event['seq']
        if seq in unique and fingerprint(unique[seq]) != fingerprint(event):
            raise ValueError('conflicting journal records')
        unique[seq] = event
    source = connect(base)
    try:
        baseline = source.execute('SELECT last_seq FROM watermark').fetchone()[0]
    finally:
        source.close()
    if target < baseline:
        raise ValueError('target predates this baseline')
    if any(seq not in unique for seq in range(baseline + 1, target + 1)):
        raise ValueError('incomplete journal chain')
    source, recovered = connect(base), connect(destination)
    try:
        source.backup(recovered)
        for seq in range(baseline + 1, target + 1):
            replay(recovered, unique[seq])
        assert recovered.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        balance = recovered.execute('SELECT balance FROM account WHERE id=1').fetchone()[0]
        point = recovered.execute('SELECT last_seq FROM watermark').fetchone()[0]
        return {'last_seq': point, 'balance': balance}
    finally:
        source.close()
        recovered.close()


def run():
    with tempfile.TemporaryDirectory(prefix='infra-recovery-') as tmp:
        folder = Path(tmp)
        live, base = connect(folder/'live.sqlite'), connect(folder/'base.sqlite')
        live.executescript('CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER);'
                           'INSERT INTO account VALUES(1,100);'
                           'CREATE TABLE watermark(last_seq INTEGER);'
                           'INSERT INTO watermark VALUES(100);'
                           'CREATE TABLE applied(seq INTEGER PRIMARY KEY, fingerprint TEXT);')
        live.backup(base)
        base.close()
        journal = [{'seq':101,'delta':10},{'seq':102,'delta':20},
                   {'seq':103,'delta':-5},{'seq':104,'delta':-125}]
        for event in journal:
            replay(live,event)
        assert live.execute('SELECT balance FROM account').fetchone()[0] == 0
        live.close()
        result = restore(folder/'base.sqlite',folder/'recovered.sqlite',journal,103)
        assert result == {'last_seq':103,'balance':125}
        rejected = False
        try:
            restore(folder/'base.sqlite',folder/'gap.sqlite',
                    [event for event in journal if event['seq'] != 102],103)
        except ValueError:
            rejected = True
        assert rejected and not (folder/'gap.sqlite').exists()
        recovered = connect(folder/'recovered.sqlite')
        assert replay(recovered, {'seq':103,'delta':-5}) is False
        conflict = False
        try:
            replay(recovered, {'seq':103,'delta':99})
        except ValueError:
            conflict = True
        assert conflict
        # Consumer validation: a new write must continue from the restored point.
        replay(recovered, {'seq':104,'delta':5})
        assert recovered.execute('SELECT balance FROM account').fetchone()[0] == 130
        recovered.close()
        return {'status':'passed','sqlite':sqlite3.sqlite_version,
                'source_after_bad_104':0,'requested_target':103,'restored':result,
                'gap_102_rejected_before_restore':rejected,
                'duplicate_103_no_effect':True,'same_sequence_different_intent_rejected':conflict,
                'consumer_continued_to':104,'consumer_balance':130,
                'scope':'Real SQLite backup/transactions; synthetic application journal, not MySQL binlog/PostgreSQL WAL or power-loss durability.'}


if __name__ == '__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
