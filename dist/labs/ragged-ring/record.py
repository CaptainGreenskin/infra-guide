"""Launch the two valid cases and one deliberately rejected case in fresh process groups."""

import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys


HERE = Path(__file__).resolve().parent
RUNNER = HERE / 'ring_ragged.py'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def execute(name, world, positions, unsafe=False):
    args = [sys.executable, '-B', '-m', 'torch.distributed.run', '--standalone',
            f'--nproc_per_node={world}', str(RUNNER), '--positions', str(positions)]
    if unsafe:
        args.append('--unsafe-padding')
    process = subprocess.run(args, text=True, capture_output=True, timeout=120)
    if process.returncode != (1 if unsafe else 0):
        raise RuntimeError(f'{name}: unexpected exit {process.returncode}\n{process.stderr}')
    result = json.loads(process.stdout)
    if result['status'] != ('rejected' if unsafe else 'passed'):
        raise AssertionError(f'{name}: wrong verdict')
    if result['source_sha256'] != digest(RUNNER):
        raise AssertionError(f'{name}: source hash differs')
    return {'name': name, 'launcher_exit_code': process.returncode, 'result': result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    cases = [
        execute('two-ranks', 2, 1025),
        execute('three-ranks', 3, 1537),
        execute('unmasked-padding', 2, 1025, unsafe=True),
    ]
    record = {
        'schema': 1, 'status': 'passed',
        'python': platform.python_version(), 'platform': platform.platform(),
        'source_sha256': {name: digest(HERE / name) for name in ('ring_ragged.py', 'record.py')},
        'scope': 'single-host CPU/Gloo, real point-to-point exchange, dense autograd oracle on each process',
        'cases': cases,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2, allow_nan=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
