"""Fetch two pinned upstream dependencies; verify bytes before writing, never execute downloads."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.request import Request, urlopen

COMMIT = '01efc7ef781391e744ed08c3292817a773d654e6'
EXPECTED = {
    'block_pool.py': '1122ed808606e1a266995113505417401baa5fa7c42afa372314462c38790876',
    'kv_cache_utils.py': 'c69ce881133c859f041d44ccdc8c1de1cc6b16a91f986f7da060d476719a13cf',
}


def verify(data, entry):
    if hashlib.sha256(data).hexdigest() != EXPECTED[entry['name']]:
        raise ValueError('unexpected upstream SHA-256: ' + entry['name'])
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if len(data) != entry['bytes'] or blob != entry['git_blob_sha1']:
        raise ValueError('upstream Git blob identity mismatch: ' + entry['name'])


def manifest():
    value = json.loads(Path(__file__).with_name('source-manifest.json').read_text())
    if value['commit'] != COMMIT or value['repository'] != 'vllm-project/vllm':
        raise ValueError('upstream identity changed')
    if {e['name']: e['sha256'] for e in value['files']} != EXPECTED:
        raise ValueError('source manifest changed')
    if any(e['path'] != 'vllm/v1/core/' + e['name'] for e in value['files']):
        raise ValueError('unexpected upstream path')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', required=True, type=Path)
    parser.add_argument('--via-gh', action='store_true', help='use an existing GitHub CLI connection')
    args = parser.parse_args()
    value = manifest()
    args.dest.mkdir(parents=True, exist_ok=True)
    for entry in value['files']:
        target = args.dest / entry['name']
        if target.exists():
            verify(target.read_bytes(), entry)
            print(entry['name'] + ': existing bytes verified')
            continue
        route = 'repos/vllm-project/vllm/contents/' + entry['path'] + '?ref=' + COMMIT
        if args.via_gh:
            result = subprocess.run(['gh', 'api', route], check=True, capture_output=True, text=True, timeout=40)
            response = json.loads(result.stdout)
        else:
            request = Request('https://api.github.com/' + route,
                              headers={'User-Agent': 'CloudInfraGuide-source-fetch', 'Accept': 'application/vnd.github+json'})
            with urlopen(request, timeout=30) as result:
                response = json.load(result)
        if response['encoding'] != 'base64' or response['sha'] != entry['git_blob_sha1']:
            raise ValueError('GitHub response identity mismatch')
        data = base64.b64decode(response['content'])
        verify(data, entry)
        target.write_bytes(data)
        print(entry['name'] + ': downloaded and verified')


if __name__ == '__main__':
    main()
