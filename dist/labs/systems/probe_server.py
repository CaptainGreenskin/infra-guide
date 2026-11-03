"""Local Kubernetes teaching service. Not a production HTTP server."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def do_GET(self):
        code = 503 if self.path == '/ready' and Path('/tmp/not-ready').exists() else 200
        body = json.dumps({'version':os.environ.get('APP_VERSION','v1'),'path':self.path}).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0',8080),Handler).serve_forever()

