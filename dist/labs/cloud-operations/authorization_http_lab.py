"""Real loopback HTTP/SQLite authorization checks. Local HMAC capability, NOT JWT/OIDC."""
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.request


def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip('=')


def issue(keys, subject='reader-A', tenant='A', scopes=('read',), kid='K1',
          audience='reports-api', expires=None, epoch=1):
    payload={'sub':subject,'tenant':tenant,'scopes':list(scopes),'kid':kid,
             'iss':'infra-lab','aud':audience,'exp':expires if expires is not None else int(time.time())+60,'epoch':epoch}
    encoded=b64(json.dumps(payload,sort_keys=True,separators=(',',':')).encode())
    return encoded+'.'+b64(hmac.new(keys[kid],encoded.encode(),hashlib.sha256).digest())


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def respond(self,status,reason):
        body=json.dumps({'reason':reason}).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def run_request(self):
        request_id=secrets.token_hex(8)
        reason='invalid_credential'
        status=401
        subject=None
        try:
            header=self.headers.get('Authorization','')
            if not header.startswith('Bearer ') or len(header)>4096:
                raise ValueError('credential')
            encoded,signature=header[7:].split('.')
            payload=json.loads(base64.urlsafe_b64decode(encoded+'='*(-len(encoded)%4)))
            key=self.server.keys.get(payload['kid'])  # fixed trusted set; never fetch a user URL
            if key is None:
                raise ValueError('key')
            expected=b64(hmac.new(key,encoded.encode(),hashlib.sha256).digest())
            if not hmac.compare_digest(signature,expected):
                raise ValueError('signature')
            if payload['iss']!='infra-lab' or payload['aud']!='reports-api' or payload['exp']<=time.time():
                raise ValueError('claims')
            if type(payload['exp']) is not int or not isinstance(payload['scopes'],list):
                raise ValueError('claim types')
            subject=payload['sub']
            policy=self.server.policy.get(subject)
            parts=self.path.strip('/').split('/')
            action='read' if self.command=='GET' else 'write'
            status,reason=403,'scope_or_resource'
            if policy and len(parts)==4 and parts[0]=='tenants' and parts[2]=='reports':
                target_tenant=parts[1]
                allowed=(payload['epoch']==policy['epoch'] and target_tenant==payload['tenant']==policy['tenant']
                         and action in payload['scopes'] and action in policy['actions'])
                if allowed:
                    with sqlite3.connect(self.server.database) as db:
                        # Actual row ownership is checked independently of the caller's path.
                        row=db.execute('SELECT tenant FROM reports WHERE id=?',(parts[3],)).fetchone()
                        if row and row[0]==target_tenant:
                            if action=='write':
                                db.execute('INSERT INTO effects(tenant) VALUES(?)',(target_tenant,))
                            status,reason=200,'allowed'
        except (ValueError,KeyError,TypeError):
            status,reason=401,'invalid_credential'
        self.server.audit.append({'request_id':request_id,'subject':subject,
                                  'action':self.command,'resource':self.path,'status':status,'reason':reason})
        self.respond(status,reason)

    do_GET=run_request
    do_POST=run_request


def run():
    with tempfile.TemporaryDirectory(prefix='infra-auth-') as tmp:
        database=str(Path(tmp)/'effects.sqlite')
        with sqlite3.connect(database) as db:
            db.executescript("CREATE TABLE reports(id TEXT PRIMARY KEY,tenant TEXT);"
                             "INSERT INTO reports VALUES('rA','A'),('rB','B');"
                             'CREATE TABLE effects(tenant TEXT);')
        keys={'K1':secrets.token_bytes(32),'K2':secrets.token_bytes(32)}
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        server.keys=dict(keys)
        server.database=database
        server.audit=[]
        server.policy={'reader-A':{'tenant':'A','actions':['read'],'epoch':1},
                       'writer-A':{'tenant':'A','actions':['write'],'epoch':1}}
        worker=threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        cases=[]
        def call(name,token,path='/tenants/A/reports/rA',method='GET',expected=200):
            request=urllib.request.Request('http://127.0.0.1:%d%s'%(server.server_port,path),
                                           headers={'Authorization':'Bearer '+token},method=method)
            try:
                with urllib.request.urlopen(request,timeout=5) as response:status=response.status
            except urllib.error.HTTPError as error:
                status=error.code
                error.close()
            assert status==expected,(name,status,expected)
            cases.append({'case':name,'http_status':status})
        try:
            reader=issue(keys)
            call('read_own',reader)
            call('read_other_tenant',reader,'/tenants/B/reports/rB',expected=403)
            call('path_claim_does_not_change_row_owner',reader,'/tenants/A/reports/rB',expected=403)
            call('read_scope_cannot_write',reader,method='POST',expected=403)
            call('signed_scope_cannot_expand_server_policy',issue(keys,scopes=('write',)),method='POST',expected=403)
            call('expired',issue(keys,expires=int(time.time())-5),expected=401)
            call('zero_expiry',issue(keys,expires=0),expected=401)
            call('wrong_audience',issue(keys,audience='another-api'),expected=401)
            encoded,signature=reader.split('.')
            forged=encoded+'.'+('A' if signature[0]!='A' else 'B')+signature[1:]
            call('forged_signature',forged,expected=401)
            server.policy['reader-A']['epoch']=2
            call('policy_revoked',reader,expected=403)
            call('new_policy_epoch',issue(keys,epoch=2))
            call('new_key_accepted',issue(keys,kid='K2',epoch=2))
            del server.keys['K1']
            call('old_verification_key_removed',issue(keys,epoch=2),expected=401)
            call('authorised_write',issue(keys,subject='writer-A',scopes=('write',),kid='K2'),method='POST')
            with sqlite3.connect(database) as db:
                effects=dict(db.execute('SELECT tenant,count(*) FROM effects GROUP BY tenant'))
            assert effects=={'A':1}
            assert len(server.audit)==len(cases) and len({x['request_id'] for x in server.audit})==len(cases)
            return {'status':'passed','cases':cases,'writes_A':1,'writes_B':0,
                    'audit_events':len(server.audit),'credentials_logged':False,
                    'scope':'Real loopback HTTP, HMAC and SQLite effects. Fixed local policy and keys; not JWT/OIDC, cloud IAM, Kubernetes RBAC or production key rotation.'}
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=5)


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
