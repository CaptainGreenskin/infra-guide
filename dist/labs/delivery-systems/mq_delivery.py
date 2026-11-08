"""Own broker/client/network/volume only. No host ports or cloud resources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid


def run(*parts, check=True, timeout=240):
    r = subprocess.run(parts, text=True, capture_output=True, timeout=timeout)
    if check and r.returncode:
        raise RuntimeError(parts[0] + ': ' + (r.stdout + r.stderr)[-5000:])
    return r


def wait_broker(name):
    deadline = time.monotonic() + 90
    last_error = ''
    while time.monotonic() < deadline:
        r = run('docker', 'exec', '--user', 'rabbitmq', name, 'rabbitmq-diagnostics', '-q', 'check_port_connectivity', check=False, timeout=20)
        if r.returncode == 0:
            return
        last_error = (r.stdout + r.stderr)[-1500:]
        state = json.loads(run('docker', 'inspect', '--format', '{{json .State}}', name).stdout)
        if not state['Running']:
            break
        time.sleep(1)
    logs = run('docker', 'logs', '--tail', '40', name, check=False)
    raise TimeoutError('owned RabbitMQ not ready: ' + last_error + '\n' + logs.stdout + logs.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=Path('mq-record.json'))
    args = ap.parse_args()
    assert not os.environ.get('DOCKER_HOST')
    endpoint = json.loads(run('docker', 'context', 'inspect').stdout)[0]['Endpoints']['docker']['Host']
    assert endpoint.startswith('unix://')
    suffix = uuid.uuid4().hex[:12]
    broker, client, network, volume, image = ['infra-mq-' + n + '-' + suffix for n in ('broker', 'client', 'net', 'data', 'image')]
    folder = Path(__file__).resolve().parent
    try:
        run('docker', 'build', '-f', str(folder / 'Dockerfile.mq-client'), '-t', image, str(folder))
        run('docker', 'pull', 'rabbitmq:4.4.0')
        broker_image = json.loads(run('docker', 'image', 'inspect', 'rabbitmq:4.4.0').stdout)[0]['RepoDigests'][0]
        run('docker', 'network', 'create', '--internal', network)
        run('docker', 'volume', 'create', volume)
        run('docker', 'run', '-d', '--name', broker, '--network', network, '--network-alias', 'broker',
            '--cpus', '1', '--memory', '512m', '--pids-limit', '128',
            '-e', 'RABBITMQ_DEFAULT_USER=guide', '-e', 'RABBITMQ_DEFAULT_PASS=public-disposable-lab',
            '-e', 'RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2',
            '-e', 'RABBITMQ_CTL_ERL_ARGS=+S 1:1 +SDcpu 1 +SDio 1', '-v', volume + ':/var/lib/rabbitmq', broker_image)
        wait_broker(broker)
        run('docker', 'run', '-d', '--name', client, '--network', network, '--memory', '160m', '--pids-limit', '64',
            '-e', 'GUIDE_BROKER=broker', image)
        first = json.loads(run('docker', 'exec', client, 'python', '-B', '/work/mq_client.py').stdout)
        assert first['status'] == 'passed'
        run('docker', 'restart', broker)
        wait_broker(broker)
        restarted = json.loads(run('docker', 'exec', client, 'python', '-B', '/work/mq_client.py', '--phase', 'after-restart').stdout)
        report = {'schema': 1, 'status': 'passed', 'broker_image': broker_image,
                  'execution': first, 'after_broker_restart': restarted,
                  'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                    for p in (Path(__file__), folder / 'mq_client.py', folder / 'Dockerfile.mq-client')},
                  'scope': 'actual isolated RabbitMQ, manual ACK and publisher confirms, one-node durable restart; no SQS/Lambda/HA/cloud claim'}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps(report))
    finally:
        for name in (client, broker):
            run('docker', 'rm', '-f', name, check=False)
        run('docker', 'volume', 'rm', volume, check=False)
        run('docker', 'network', 'rm', network, check=False)
        run('docker', 'image', 'rm', image, check=False)


if __name__ == '__main__':
    main()
