"""Local-only browser fixture: fail runtime-04 once, then serve normal assets."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port',type=int,default=4341)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]/'dist'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(root),**kwargs)

    def do_GET(self):
        if urlsplit(self.path).path=='/runtime-04.js' and not self.server.failed_once:
            self.server.failed_once=True
            print('INJECTED: one runtime-04 HTTP503',flush=True)
            self.send_error(503,'One deliberate local fixture failure')
            return
        super().do_GET()

    def log_message(self,*args):
        pass


server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
server.failed_once=False
print('Local one-shot script-failure fixture on 127.0.0.1:'+str(args.port),flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
