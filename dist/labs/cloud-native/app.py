"""Small HTTP process for a disposable Kubernetes lab; not a production server."""
import argparse
import json
import signal
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ready = True

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/', '/healthz', '/readyz'):
            status, body = 404, {'error': 'unknown path'}
        elif self.path == '/readyz' and not ready:
            status, body = 503, {'ready': False}
        else:
            status, body = 200, {'path': self.path, 'ready': ready}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8080)
args = parser.parse_args()
server = ThreadingHTTPServer(('0.0.0.0', args.port), Handler)
print(json.dumps({'port': server.server_address[1]}), flush=True)

def stop(signum, frame):
    global ready
    ready = False
    # shutdown must run on a different thread from serve_forever.
    threading.Thread(target=server.shutdown, daemon=True).start()

signal.signal(signal.SIGTERM, stop)
try:
    server.serve_forever(poll_interval=0.1)
finally:
    server.server_close()
