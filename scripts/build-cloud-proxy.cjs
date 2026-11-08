/* Explicit author execution record + deterministic source embed and ZIP. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'dist/labs/cloud-proxy');
require('./embed-cloud-proxy-bridge.cjs')();

const execution = JSON.parse(cp.execFileSync('python3', ['-B', path.join(folder, 'proxy_lab.py')], {
  encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024
}));
const environment = JSON.parse(cp.execFileSync('python3', ['-c',
  'import sys,platform,json;print(json.dumps(dict(python=platform.python_version(),implementation=platform.python_implementation(),os=platform.system(),sqlite=__import__("sqlite3").sqlite_version)))'
], {encoding: 'utf8'}));
const source_sha256 = Object.fromEntries(['proxy_lab.py', 'README.md'].map(file => [file,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(folder, file))).digest('hex')]));
const record = {
  schema: 1,
  status: 'passed',
  checked: '2026-11-08',
  environment,
  command: 'python3 -B proxy_lab.py',
  source_sha256,
  execution,
  boundaries: ['real loopback TCP + HTTP/1.1 + SQLite commit', 'fixed small Content-Length fixture, one sequential upstream connection per backend',
    'upstream deadline begins after ingress/body validation', 'no TLS, DNS, Kubernetes, NGINX execution, cloud or performance claim'],
  sources: [
    'https://docs.python.org/3.9/library/http.client.html',
    'https://docs.python.org/3.9/library/http.server.html',
    'https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream',
    'https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive',
    'https://nginx.org/en/docs/stream/ngx_stream_proxy_module.html',
    'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination'
  ],
  api_crosscheck: 'Context7 /python/cpython/v3.9.22: HTTPConnection/HTTPResponse complete read before reuse and HTTP/1.1 Content-Length'
};
fs.writeFileSync(path.join(folder, 'validation.json'), JSON.stringify(record, null, 2) + '\n');
cp.execFileSync('python3', ['-c', `
from pathlib import Path
import sys,zipfile
folder=Path(sys.argv[1]); target=folder.parent/'cloud-proxy.zip'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED) as archive:
    for name in ['README.md','proxy_lab.py','validation.json']:
        entry=zipfile.ZipInfo('cloud-proxy/'+name, date_time=(2026,11,8,0,0,0))
        entry.compress_type=zipfile.ZIP_DEFLATED
        entry.external_attr=0o644 << 16
        archive.writestr(entry,(folder/name).read_bytes())
`, folder]);
console.log('Recorded real HTTP proxy execution; embedded exact source; packaged 3 files.');
