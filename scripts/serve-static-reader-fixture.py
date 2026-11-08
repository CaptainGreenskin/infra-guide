"""Loopback-only fixture: the final app script starts after a deliberate button click.

The other real scripts and the generated article load normally. This makes it
possible to type into native forms before application startup, then check that
hydration retains the same nodes and values. The normal startup-recovery notice
can be dismissed during the deliberate gate. It is not a load-time benchmark.
"""
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=4342)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1] / 'dist'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def do_GET(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            path = path / 'index.html'
        if path.is_file() and path.suffix == '.html':
            html = path.read_text()
            pattern = r'<script defer src="(app\.js\?v=[0-9a-f]+)"></script>'
            found = re.findall(pattern, html)
            if len(found) != 1:
                self.send_error(500, 'Expected the real application script once')
                return
            html = re.sub(pattern, '', html)
            gate = ('<aside style="padding:24px;border-top:1px solid #aaa"><button id="fixture-start">启动本地验证脚本</button>'
                    '<p>仅本机验证：先填写阅读笔记、展开目录，再启动脚本并检查原内容。</p></aside>'
                    '<script>document.getElementById("fixture-start").onclick=function(){'
                    'this.disabled=true;const script=document.createElement("script");script.src=' + json.dumps(found[0]) + ';'
                    'script.onload=()=>this.textContent="验证脚本已取得";document.head.appendChild(script);};</script>')
            encoded = html.replace('</body>', gate + '</body>').encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(encoded)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(encoded)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
print('Static reader fixture on 127.0.0.1:' + str(args.port), flush=True)
try:
    server.serve_forever()
finally:
    server.server_close()
