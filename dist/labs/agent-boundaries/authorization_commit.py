"""Actual local HTTP/SQLite authorization at the write boundary; identity is a fixed test fixture."""
import argparse
from contextlib import closing
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import sqlite3
import tempfile
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PRINCIPAL = {'subject':'lin','tenant':'A','task':'R18','tool':'report.v1'}
APPROVED = {'op_id':'K1','resource':'A/draft','expected_version':7,'amount':37,'approval_id':'P1'}


def digest(intent):
    return hashlib.sha256(json.dumps(intent,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()


def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise ValueError('duplicate_json_field')
        result[key]=value
    return result


def parse_intent(raw):
    request=json.loads(raw,object_pairs_hook=unique_object)
    if not isinstance(request,dict) or set(request)!=set(APPROVED): raise ValueError('unexpected_fields')
    for key in ['op_id','resource','approval_id']:
        if type(request[key]) is not str or not 1<=len(request[key])<=64: raise ValueError('invalid_string')
    for key in ['expected_version','amount']:
        if type(request[key]) is not int or not 0<=request[key]<=1000: raise ValueError('invalid_integer')
    # Server-owned principal and tool version cannot be overwritten by the request.
    return {**PRINCIPAL,**request}


def connect(path):
    db=sqlite3.connect(path,timeout=5,isolation_level=None);db.row_factory=sqlite3.Row;return db


def setup(path):
    with closing(connect(path)) as db:
        db.executescript('''PRAGMA journal_mode=WAL;
        CREATE TABLE policy(subject TEXT PRIMARY KEY, can_write INTEGER, can_read INTEGER, epoch INTEGER);
        CREATE TABLE resource(id TEXT PRIMARY KEY, tenant TEXT, version INTEGER, amount INTEGER);
        CREATE TABLE approval(id TEXT PRIMARY KEY, fingerprint TEXT, expires_at INTEGER, used_by TEXT);
        CREATE TABLE receipt(tenant TEXT, op_id TEXT, fingerprint TEXT, version INTEGER, amount INTEGER, PRIMARY KEY(tenant,op_id));
        CREATE TABLE audit(seq INTEGER PRIMARY KEY, kind TEXT, epoch INTEGER);
        INSERT INTO policy VALUES('lin',1,1,1);
        INSERT INTO resource VALUES('A/draft','A',7,0);
        INSERT INTO resource VALUES('B/draft','B',7,0);''')
        db.execute('INSERT INTO approval VALUES(?,?,100,NULL)',('P1',digest(parse_intent(json.dumps(APPROVED)))))


def change_policy(path,write,read=1):
    with closing(connect(path)) as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('UPDATE policy SET can_write=?,can_read=?,epoch=epoch+1 WHERE subject=?',(write,read,'lin'))
        epoch=db.execute('SELECT epoch FROM policy').fetchone()[0]
        db.execute('INSERT INTO audit(kind,epoch) VALUES(?,?)',('policy_change',epoch));db.commit()


def snapshot(path):
    with closing(connect(path)) as db:
        row=db.execute("SELECT version,amount FROM resource WHERE id='A/draft'").fetchone()
        return {'version':row['version'],'amount':row['amount'],
                'effects':db.execute('SELECT count(*) FROM receipt').fetchone()[0],
                'policy_epoch':db.execute('SELECT epoch FROM policy').fetchone()[0],
                'audit':[list(r) for r in db.execute('SELECT kind,epoch FROM audit ORDER BY seq')]}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--report',type=Path);args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='infra-authorization-') as temporary:
        paths={};cached={}
        for name in ['normal','revoked_at_commit','snapshot_negative','changed_amount','cross_tenant','stale_version','expired','bad_integer','bad_float','empty_object','extra_field','duplicate_json']:
            paths[name]=Path(temporary)/(name+'.db');setup(paths[name])

        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                parts=self.path.strip('/').split('/')
                if len(parts)!=2 or parts[0] not in paths: self.send_error(404);return
                case,action=parts;db=connect(paths[case]);status=200
                try:
                    count=int(self.headers.get('Content-Length','0'))
                    if not 0<count<=4096: raise ValueError('body_size')
                    intent=parse_intent(self.rfile.read(count).decode('utf-8'));fingerprint=digest(intent)
                    db.execute('BEGIN IMMEDIATE')
                    policy=db.execute('SELECT * FROM policy WHERE subject=?',('lin',)).fetchone()
                    target=db.execute('SELECT * FROM resource WHERE id=?',(intent['resource'],)).fetchone()
                    if not target or target['tenant']!=PRINCIPAL['tenant']: raise PermissionError('resource_denied')
                    if action=='prepare':
                        cached[case]={'allowed':bool(policy['can_write']),'epoch':policy['epoch']}
                        db.execute('INSERT INTO audit(kind,epoch) VALUES(?,?)',('prepare',policy['epoch']))
                        result={'status':'prepared',**cached[case]}
                    elif action=='receipt':
                        if not policy['can_read']: raise PermissionError('read_denied')
                        receipt=db.execute('SELECT version,amount FROM receipt WHERE tenant=? AND op_id=?',('A',intent['op_id'])).fetchone()
                        result={'status':'found' if receipt else 'unknown','receipt':dict(receipt) if receipt else None}
                    elif action in ['write','unsafe_snapshot_write']:
                        # The intentionally faulty branch trusts an earlier server decision after a policy change.
                        decision=cached.get(case) if action=='unsafe_snapshot_write' else {'allowed':bool(policy['can_write']),'epoch':policy['epoch']}
                        if not decision or not decision['allowed']: raise PermissionError('write_denied')
                        receipt=db.execute('SELECT * FROM receipt WHERE tenant=? AND op_id=?',('A',intent['op_id'])).fetchone()
                        if receipt:
                            if receipt['fingerprint']!=fingerprint: raise ValueError('operation_conflict')
                            result={'status':'duplicate','version':receipt['version'],'amount':receipt['amount']}
                        else:
                            approval=db.execute('SELECT * FROM approval WHERE id=?',(intent['approval_id'],)).fetchone()
                            if not approval or approval['fingerprint']!=fingerprint: raise PermissionError('approval_mismatch')
                            # Logical fixture time only; not an expiry propagation benchmark.
                            now=101 if case=='expired' else 50
                            if now>=approval['expires_at'] or approval['used_by'] not in [None,intent['op_id']]: raise PermissionError('approval_inactive')
                            if target['version']!=intent['expected_version']: raise ValueError('version_conflict')
                            version=target['version']+1
                            db.execute('UPDATE resource SET version=?,amount=? WHERE id=?',(version,intent['amount'],intent['resource']))
                            db.execute('INSERT INTO receipt VALUES(?,?,?,?,?)',('A',intent['op_id'],fingerprint,version,intent['amount']))
                            db.execute('UPDATE approval SET used_by=? WHERE id=?',(intent['op_id'],intent['approval_id']))
                            db.execute('INSERT INTO audit(kind,epoch) VALUES(?,?)',('effect',decision['epoch']))
                            result={'status':'committed','version':version,'amount':intent['amount'],'decision_epoch':decision['epoch']}
                    else: raise ValueError('unknown_action')
                    db.commit()
                except (ValueError,PermissionError,UnicodeError) as error:
                    db.rollback();status=403 if isinstance(error,PermissionError) else 409
                    policy=db.execute('SELECT epoch FROM policy').fetchone()[0]
                    db.execute('INSERT INTO audit(kind,epoch) VALUES(?,?)',('denied',policy))
                    result={'status':'denied','reason':str(error)}
                finally:db.close()
                body=json.dumps(result,ensure_ascii=False).encode();self.send_response(status)
                self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

        server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def call(case,action='write',payload=None,raw=None):
            body=raw.encode() if raw is not None else json.dumps(payload if payload is not None else APPROVED).encode()
            request=Request('http://127.0.0.1:'+str(server.server_port)+'/'+case+'/'+action,data=body,method='POST')
            try:
                with urlopen(request,timeout=5) as response:return json.load(response)
            except HTTPError as error:return json.load(error)
        results={}
        try:
            results['normal']=call('normal');assert results['normal']['status']=='committed'
            results['same_operation']=call('normal');assert results['same_operation']['status']=='duplicate'
            changed={**APPROVED,'amount':99}
            results['same_operation_changed']=call('normal',payload=changed);assert results['same_operation_changed']['reason']=='operation_conflict'
            for case,action in [('revoked_at_commit','write'),('snapshot_negative','unsafe_snapshot_write')]:
                prepared=call(case,'prepare');assert prepared['allowed'] and prepared['epoch']==1
                change_policy(paths[case],0)
                results[case]=call(case,action)
            assert results['revoked_at_commit']['reason']=='write_denied'
            assert results['snapshot_negative']['status']=='committed'
            change_policy(paths['normal'],0,1)
            results['write_revoked_receipt_readable']=call('normal','receipt');assert results['write_revoked_receipt_readable']['receipt']=={'version':8,'amount':37}
            results['write_after_revoke']=call('normal');assert results['write_after_revoke']['reason']=='write_denied'
            change_policy(paths['normal'],0,0)
            results['receipt_read_revoked']=call('normal','receipt');assert results['receipt_read_revoked']['reason']=='read_denied'
            results['changed_amount']=call('changed_amount',payload=changed);assert results['changed_amount']['reason']=='approval_mismatch'
            results['cross_tenant']=call('cross_tenant',payload={**APPROVED,'resource':'B/draft'});assert results['cross_tenant']['reason']=='resource_denied'
            with closing(connect(paths['stale_version'])) as db: db.execute("UPDATE resource SET version=8,amount=99 WHERE id='A/draft'")
            results['stale_version']=call('stale_version');assert results['stale_version']['reason']=='version_conflict'
            results['expired']=call('expired');assert results['expired']['reason']=='approval_inactive'
            for case,payload in [('bad_integer',{**APPROVED,'amount':True}),('bad_float',{**APPROVED,'amount':37.0}),('empty_object',{}),('extra_field',{**APPROVED,'tenant':'B'})]:
                results[case]=call(case,payload=payload);assert results[case]['status']=='denied'
            results['duplicate_json']=call('duplicate_json',raw=json.dumps(APPROVED)[:-1]+',"amount":99}')
            assert results['duplicate_json']['reason']=='duplicate_json_field'
            states={name:snapshot(path) for name,path in paths.items()}
            for name,state in states.items(): assert state['effects']==(1 if name in ['normal','snapshot_negative'] else 0)
            assert states['revoked_at_commit']['amount']==0 and states['snapshot_negative']['amount']==37
            assert states['normal']['effects']==1 and states['normal']['amount']==37
            report={'status':'passed','system':platform.system(),'python':platform.python_version(),'sqlite':sqlite3.sqlite_version,
                    'source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'principal_fixture':PRINCIPAL,
                    'approved_intent':parse_intent(json.dumps(APPROVED)),'approved_fingerprint':digest(parse_intent(json.dumps(APPROVED))),
                    'results':results,'states':states,
                    'scope':'Actual loopback HTTP and separate SQLite connections with serialized write/policy transactions. Identity is injected, time is declared; no OAuth/MCP/Kairo, cross-service atomicity or instantaneous distributed revocation.'}
        finally:server.shutdown();server.server_close();thread.join(5)
    if args.report:args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
