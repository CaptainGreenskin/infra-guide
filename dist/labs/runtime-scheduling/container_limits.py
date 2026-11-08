"""Actual Docker/cgroup-v2 observations. Only UUID-owned containers are removed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import uuid


def run(*args, check=True):
    return subprocess.run(args, text=True, capture_output=True, check=check, timeout=180)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=Path('container-record.json'))
    args = ap.parse_args()
    assert not os.environ.get('DOCKER_HOST'), 'Use a local Docker context, not DOCKER_HOST'
    endpoint = json.loads(run('docker', 'context', 'inspect').stdout)[0]['Endpoints']['docker']['Host']
    assert endpoint.startswith('unix://'), 'This lab only accepts a local Unix socket'
    info = json.loads(run('docker', 'info', '--format', '{{json .}}').stdout)
    assert str(info['CgroupVersion']) == '2', 'cgroup v2 is required'
    assert info['OSType'] == 'linux'
    image = 'python:3.12-alpine'
    run('docker', 'pull', image)
    image_info = json.loads(run('docker', 'image', 'inspect', image).stdout)[0]
    # Resolve once, then use the same immutable content for all cases.
    digest = image_info['RepoDigests'][0]
    source = Path(__file__).with_name('container_probe.py')
    owned = []
    rows = []
    try:
        for mode in ('cpu', 'pids', 'oom'):
            name = 'infra-limits-' + uuid.uuid4().hex[:12]
            owned.append(name)
            run('docker', 'create', '--name', name, '--network', 'none', '--cpus', '.5',
                '--memory', '96m', '--memory-swap', '96m', '--pids-limit', '16',
                digest, 'python', '/probe.py', mode)
            run('docker', 'cp', str(source), name + ':/probe.py')
            result = run('docker', 'start', '-a', name, check=False)
            inspection = json.loads(run('docker', 'inspect', name).stdout)[0]
            state = inspection['State']
            if mode == 'oom':
                row = {'mode': mode, 'exit_code': state['ExitCode'], 'oom_killed': state['OOMKilled']}
                assert row['exit_code'] == 137 and row['oom_killed'], row
            else:
                assert result.returncode == 0, result.stderr
                row = json.loads(result.stdout)
                assert row['pid'] == 1 and row['memory_max'] == 96 * 1024**2
                assert row['cpu_max'] == '50000 100000' and row['pids_max'] == 16
                if mode == 'cpu':
                    assert row['cpu_stat_delta']['nr_throttled'] > 0, row
                    assert row['cpu_stat_delta']['usage_usec'] > 0
                else:
                    assert row['refusal'] and row['pids_current'] <= 16
                    assert 0 < row['created_threads'] < 32 and row['pids_max_events_delta'] > 0
            rows.append(row)
        # Compare concurrent lifetimes: namespace inode numbers can be reused after exit.
        live_namespaces = []
        for _ in range(2):
            name = 'infra-limits-' + uuid.uuid4().hex[:12]
            owned.append(name)
            run('docker', 'run', '-d', '--name', name, '--network', 'none', '--memory', '96m',
                '--pids-limit', '16', digest, 'python', '-c', 'import time; time.sleep(300)')
            script = 'import json,os; print(json.dumps({n:os.readlink("/proc/1/ns/"+n) for n in ("pid","mnt","net")}))'
            live_namespaces.append(json.loads(run('docker', 'exec', name, 'python', '-c', script).stdout))
        for ns in ('pid', 'mnt', 'net'):
            assert live_namespaces[0][ns] != live_namespaces[1][ns]
        report = {'schema': 1, 'scope': 'real Linux Docker, cgroup v2; not a sandbox escape test',
                  'host': platform.platform(), 'docker_server': info['ServerVersion'],
                  'image': digest, 'cases': rows, 'concurrent_namespaces': live_namespaces,
                  'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                    for p in (Path(__file__), source)}}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False))
    finally:
        for name in owned:
            run('docker', 'rm', '-f', name, check=False)


if __name__ == '__main__':
    main()
