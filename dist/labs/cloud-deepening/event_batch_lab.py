"""Local batch response and idempotency experiment; no cloud queue is contacted."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


def initialise(path):
    with sqlite3.connect(path) as db:
        db.executescript('CREATE TABLE attempts(event_id TEXT);'
                         'CREATE TABLE effects(event_id TEXT PRIMARY KEY, delta INTEGER);'
                         'CREATE TABLE receipts(event_id TEXT PRIMARY KEY, fingerprint TEXT);')


def process(path, record, fail=False, crash=False):
    # messageId identifies this delivery; event_id identifies the business action.
    body = record['body']
    if body.get('tenant') != 'demo' or type(body.get('delta')) is not int:
        raise ValueError('this lab accepts only demo tenant and integer delta')
    event_id = body['event_id']
    intent = hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
    db = sqlite3.connect(path,isolation_level=None,timeout=10)
    try:
        db.execute('INSERT INTO attempts VALUES(?)',(event_id,))
        if fail:
            raise RuntimeError('transient failure before business commit')
        db.execute('BEGIN IMMEDIATE')
        receipt = db.execute('SELECT fingerprint FROM receipts WHERE event_id=?',(event_id,)).fetchone()
        if receipt:
            if receipt[0] != intent:
                raise ValueError('same event_id with a different intent')
        else:
            db.execute('INSERT INTO effects VALUES(?,?)',(event_id,body['delta']))
            db.execute('INSERT INTO receipts VALUES(?,?)',(event_id,intent))
        db.execute('COMMIT')
        if crash:
            os._exit(23)  # The effect exists, but the caller has no response.
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise
    finally:
        db.close()


def handle_batch(path, records, failing=()):
    failures = []
    for record in records:
        try:
            process(path,record,fail=record['body']['event_id'] in failing)
        except (RuntimeError,ValueError):
            failures.append({'itemIdentifier':record['messageId']})
    return {'batchItemFailures':failures}


def message(event_id, message_id=None, delta=1):
    return {'messageId':message_id or 'msg-'+event_id,
            'body':{'tenant':'demo','event_id':event_id,'delta':delta}}


def run():
    with tempfile.TemporaryDirectory(prefix='infra-batch-') as tmp:
        path=str(Path(tmp)/'business.sqlite')
        initialise(path)
        crashed=subprocess.run([sys.executable,__file__,'--crash',path],capture_output=True)
        assert crashed.returncode==23
        batch=handle_batch(path,[message('A'),message('B'),message('C')],failing=('B',))
        assert batch=={'batchItemFailures':[{'itemIdentifier':'msg-B'}]}
        assert handle_batch(path,[message('B')])=={'batchItemFailures':[]}
        with sqlite3.connect(path) as db:
            attempts=dict(db.execute('SELECT event_id,count(*) FROM attempts GROUP BY event_id'))
            effects=db.execute('SELECT count(*) FROM effects').fetchone()[0]
        assert attempts=={'A':2,'B':2,'C':1} and effects==3
        # A redelivery can have a new transport ID and the same business ID.
        assert handle_batch(path,[message('A','another-message-id')])=={'batchItemFailures':[]}
        conflict=handle_batch(path,[message('A','conflict-id',delta=99)])
        assert conflict['batchItemFailures']==[{'itemIdentifier':'conflict-id'}]
        workers=[subprocess.Popen([sys.executable,__file__,'--worker',path],
                                  stdout=subprocess.PIPE,stderr=subprocess.PIPE) for _ in range(2)]
        for worker in workers:
            _,stderr=worker.communicate(timeout=20)
            assert worker.returncode==0,stderr
        with sqlite3.connect(path) as db:
            assert db.execute("SELECT count(*) FROM effects WHERE event_id='X'").fetchone()[0]==1
            assert db.execute("SELECT count(*) FROM attempts WHERE event_id='X'").fetchone()[0]==2
        return {'status':'passed','crash_after_commit_exit_code':23,
                'second_batch_response':batch,'attempts_after_B_recovery':attempts,
                'effects_after_B_recovery':effects,'new_message_id_same_action_no_effect':True,
                'same_id_different_intent_rejected':True,
                'concurrent_X':{'attempts':2,'effects':1},
                'scope':'Real local processes and SQLite atomic transactions. Batch response shape models Lambda/SQS with ReportBatchItemFailures; no real visibility timer, queue or cloud concurrency test.'}


if __name__=='__main__':
    if len(sys.argv)>1:
        process(sys.argv[2],message('A' if sys.argv[1]=='--crash' else 'X'),crash=sys.argv[1]=='--crash')
    else:
        print(json.dumps(run(),ensure_ascii=False,indent=2))
