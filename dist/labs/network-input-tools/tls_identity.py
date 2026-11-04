"""Real loopback TCP/TLS/HTTP, temporary private CA, verification always on.

Requires a local OpenSSL/LibreSSL CLI. Does not change system trust or DNS.
"""
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading


NAME = 'reports.internal.test'


def certificate_files(root):
    (root/'ca.cnf').write_text('''[req]
prompt=no
distinguished_name=dn
x509_extensions=ca_ext
[dn]
CN=InfraGuide Temporary Lab Root
[ca_ext]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
''')
    (root/'server.ext').write_text('''basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:reports.internal.test
''')
    commands = [
        ['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-batch',
         '-keyout','ca.key','-out','ca.pem','-days','1','-config','ca.cnf'],
        ['req','-new','-newkey','rsa:2048','-sha256','-nodes','-batch',
         '-keyout','server.key','-out','server.csr','-subj','/CN='+NAME],
        ['x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key',
         '-CAcreateserial','-out','server.pem','-days','1','-sha256','-extfile','server.ext'],
    ]
    for command in commands:
        subprocess.run(['openssl']+command,cwd=root,check=True,
                       capture_output=True,text=True,timeout=20)


def request(address, context, server_name, host):
    with socket.create_connection(address, timeout=3) as tcp:
        with context.wrap_socket(tcp, server_hostname=server_name) as connection:
            connection.sendall(('GET /report HTTP/1.1\r\nHost: '+host+
                                '\r\nConnection: close\r\n\r\n').encode('ascii'))
            response=http.client.HTTPResponse(connection)
            response.begin()
            body=json.loads(response.read())
            names=[value for kind,value in connection.getpeercert().get('subjectAltName',[]) if kind=='DNS']
            return {'http_status':response.status,'body':body,
                    'certificate_dns_names':names,'tls_version':connection.version()}


def run():
    http_requests=[]
    sni_names=[]
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            host=self.headers.get('Host')
            http_requests.append({'host':host,'path':self.path})
            correct=host==NAME and self.path=='/report'
            body=({'report':'R17','version':3,'total':37} if correct
                  else {'error':'unknown_virtual_host'})
            encoded=json.dumps(body).encode()
            self.send_response(200 if correct else 421)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)
        def log_message(self,*args):
            pass
    with tempfile.TemporaryDirectory(prefix='tls-identity-') as folder:
        root=Path(folder)
        certificate_files(root)
        server_context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        server_context.load_cert_chain(str(root/'server.pem'),str(root/'server.key'))
        def record_sni(connection,server_name,context):
            sni_names.append(server_name)
        server_context.set_servername_callback(record_sni)
        server=HTTPServer(('127.0.0.1',0),Handler)
        server.socket=server_context.wrap_socket(server.socket,server_side=True)
        thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01})
        thread.start()
        try:
            address=server.server_address
            with socket.create_connection(address,timeout=3):
                tcp_connected=True
            trusted=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            trusted.load_verify_locations(cafile=str(root/'ca.pem'))
            assert trusted.check_hostname and trusted.verify_mode==ssl.CERT_REQUIRED
            good=request(address,trusted,NAME,NAME)
            failures={}
            for label,context,server_name in [
                ('wrong_certificate_name',trusted,'wrong.internal.test'),
                ('untrusted_ca',ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT),NAME),
            ]:
                try:
                    request(address,context,server_name,NAME)
                except ssl.SSLCertVerificationError:
                    failures[label]='certificate_verification_failed'
                else:
                    raise AssertionError(label+' unexpectedly reached HTTP')
            wrong_host=request(address,trusted,NAME,'other.internal.test')
            assert good['http_status']==200 and good['body']['total']==37
            assert good['certificate_dns_names']==[NAME]
            assert wrong_host['http_status']==421
            assert len(http_requests)==2  # failed handshakes sent no HTTP request
            assert sni_names==[NAME,'wrong.internal.test',NAME,NAME]
            return {'python_ssl':ssl.OPENSSL_VERSION,
                    'openssl_cli':subprocess.run(['openssl','version'],capture_output=True,text=True,check=True).stdout.strip(),
                    'tcp_connected':tcp_connected,'good':good,'failures':failures,
                    'valid_tls_wrong_http_host':wrong_host,
                    'http_requests':http_requests,'sni_names':sni_names,
                    'verification_disabled':False,'system_trust_changed':False,
                    'scope':'loopback_tls_http_no_kubernetes_or_external_dns'}
        finally:
            server.shutdown()
            server.server_close()
            thread.join(5)
            assert not thread.is_alive()


if __name__=='__main__':
    print(json.dumps(run(),ensure_ascii=False,indent=2))
