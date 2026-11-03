"""Durable tool execution teaching lab. Two independent SQLite databases.
No LLM, external service, Kairo code, or real-world side effect is invoked.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import tempfile


def signature(payload):
    return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def connect(path):
    return sqlite3.connect(str(path),timeout=5)


def setup(root):
    root.mkdir(parents=True,exist_ok=True)
    with connect(root/'runner.sqlite') as db:
        db.execute('CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, result TEXT)')
    with connect(root/'tool.sqlite') as db:
        db.execute('CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, result TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS effects (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL)')
        db.execute('INSERT OR IGNORE INTO effects VALUES (1,0)')


def enforce_policy(payload):
    if payload.get('tool') != 'record_demo_action':
        raise ValueError('tool denied by allowlist')
    if payload.get('tenant') != 'demo' or payload.get('amount') != 1:
        raise ValueError('arguments denied by policy')


def tool_service(root, op_id, payload):
    """The *receiving tool* owns atomic deduplication and the demo effect."""
    wanted = signature(payload)
    with connect(root/'tool.sqlite') as db:
        db.execute('BEGIN IMMEDIATE')
        old = db.execute('SELECT payload_hash,result FROM receipts WHERE id=?',(op_id,)).fetchone()
        if old:
            if old[0] != wanted:
                raise ValueError('idempotency key payload conflict at tool')
            return old[1]
        db.execute('UPDATE effects SET count=count+1 WHERE id=1')
        count = db.execute('SELECT count FROM effects WHERE id=1').fetchone()[0]
        result = json.dumps({'effect_count':count})
        db.execute('INSERT INTO receipts VALUES (?,?,?)',(op_id,wanted,result))
        return result


def execute(root, op_id, payload, crash_after_effect=False):
    enforce_policy(payload)  # Authority is outside a model's proposed arguments.
    wanted = signature(payload)
    with connect(root/'runner.sqlite') as db:
        db.execute('BEGIN IMMEDIATE')
        old = db.execute('SELECT payload_hash,state,attempts,result FROM operations WHERE id=?',(op_id,)).fetchone()
        if old and old[0] != wanted:
            raise ValueError('operation payload conflict')
        if old and old[1] == 'SUCCEEDED':
            return old[3]
        if old and old[2] >= 2:
            raise ValueError('demo retry budget exhausted')
        if not old:
            db.execute('INSERT INTO operations VALUES (?,?,?,0,NULL)',(op_id,wanted,'PLANNED'))
        db.execute('UPDATE operations SET state=?,attempts=attempts+1 WHERE id=?',('RUNNING',op_id))
    result = tool_service(root,op_id,payload)
    if crash_after_effect:
        # A real process exit after the tool transaction committed but before runner completion.
        os._exit(23)
    with connect(root/'runner.sqlite') as db:
        db.execute('UPDATE operations SET state=?,result=? WHERE id=?',('SUCCEEDED',result,op_id))
    return result


def experiment():
    with tempfile.TemporaryDirectory(prefix='infra-agent-') as temporary:
        root = Path(temporary)
        setup(root)
        command = [sys.executable, str(Path(__file__).resolve()), '--worker', str(root)]
        crash = subprocess.run(command+['--crash-after-effect'],capture_output=True,text=True,timeout=15)
        assert crash.returncode == 23, crash.stderr
        with connect(root/'runner.sqlite') as db:
            after_crash = db.execute('SELECT state,attempts FROM operations').fetchone()
        with connect(root/'tool.sqlite') as db:
            effects_before = db.execute('SELECT count FROM effects').fetchone()[0]
        assert after_crash == ('RUNNING',1) and effects_before == 1
        recovered = subprocess.run(command,capture_output=True,text=True,timeout=15)
        assert recovered.returncode == 0, recovered.stderr
        payload = {'tool':'record_demo_action','tenant':'demo','amount':1}
        duplicate_result = execute(root,'op-001',payload)
        with connect(root/'runner.sqlite') as db:
            state, attempts = db.execute('SELECT state,attempts FROM operations').fetchone()
        with connect(root/'tool.sqlite') as db:
            effects = db.execute('SELECT count FROM effects').fetchone()[0]
        assert state == 'SUCCEEDED' and attempts == 2 and effects == 1
        changed = dict(payload, extra='different-request')
        try:
            execute(root,'op-001',changed)
        except ValueError as e:
            assert 'conflict' in str(e)
        else:
            raise AssertionError('Changed payload accepted')
        try:
            execute(root,'op-002',dict(payload,tool='unapproved_tool'))
        except ValueError as e:
            assert 'denied' in str(e)
        else:
            raise AssertionError('Unapproved tool accepted')
        return {'status':'passed','environment':platform.system()+' '+platform.machine()+' Python '+platform.python_version(),
                'sqlite_version':sqlite3.sqlite_version,'crash_exit_code':23,
                'after_crash':{'runner_state':after_crash[0],'tool_effects':effects_before},
                'after_recovery':{'runner_state':state,'attempts':attempts,'tool_effects':effects},
                'duplicate_result':json.loads(duplicate_result),'changed_payload_rejected':True,'unapproved_tool_rejected':True,
                'scope':'Single worker, local subprocess crash, separate SQLite databases, receiver-enforced deduplication.',
                'not_verified':['Kairo implementation','multiple concurrent workers','lease fencing','remote tool idempotency','power loss','LLM quality']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--worker')
    parser.add_argument('--crash-after-effect',action='store_true')
    parser.add_argument('--output',default='runs/agent-report.json')
    args = parser.parse_args()
    if args.worker:
        execute(Path(args.worker),'op-001',{'tool':'record_demo_action','tenant':'demo','amount':1},args.crash_after_effect)
    else:
        result = experiment()
        out = Path(args.output)
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(result,ensure_ascii=False,indent=2))

