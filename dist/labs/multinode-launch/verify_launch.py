"""Two real local torchrun launchers, two CPU/Gloo workers each.

Run directly with Python 3.10-3.12 + PyTorch 2.5.1 on Linux/macOS.
All processes and checkpoints are local and temporary. This is not a physical
multi-host, GPU/NCCL, performance, or arbitrary mid-step crash experiment.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import socket
import subprocess
import sys
import tempfile
import time

import torch

LAB = Path(__file__).resolve().parent
SOURCES = ('verify_launch.py', 'launch_worker.py', 'train_ddp.py', 'compare_checkpoints.py')
REJECTION = 'Resume requires the same world size, device, precision and training settings'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def stop_owned(processes):
    for process in processes:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()


def launch(directory, label, epochs, resume=None, changed=None, expected_error=None):
    output = directory / label
    output.mkdir()
    proof = output / 'ranks'
    port = free_port()
    config = {'device': 'cpu', 'samples': 8192, 'hidden': 32, 'batch-size': 64, 'accum': 2}
    config.update(changed or {})
    workers = [str(LAB / 'launch_worker.py'), '--epochs=' + str(epochs),
               '--save-dir=' + str(output)]
    workers += ['--' + key + '=' + str(value) for key, value in config.items()]
    if resume is not None:
        workers.append('--resume=' + str(resume))
    processes, streams, commands = [], [], []
    try:
        for node in (0, 1):
            argv = [sys.executable, '-m', 'torch.distributed.run', '--nnodes=2',
                    '--nproc-per-node=2', '--node-rank=' + str(node),
                    '--master-addr=127.0.0.1', '--master-port=' + str(port)] + workers
            stdout = (output / ('agent-' + str(node) + '.stdout')).open('w')
            stderr = (output / ('agent-' + str(node) + '.stderr')).open('w')
            streams += [stdout, stderr]
            env = dict(os.environ, OMP_NUM_THREADS='1', INFRA_LAUNCH_RECORD_DIR=str(proof))
            processes.append(subprocess.Popen(argv, cwd=directory, env=env, text=True,
                                              stdout=stdout, stderr=stderr, start_new_session=True))
            commands.append(['python' if item == sys.executable else
                             item.replace(str(LAB), '<lab>').replace(str(directory), '<temporary>')
                             .replace('--master-port=' + str(port), '--master-port=<loopback-port>')
                             for item in argv])
        deadline = time.monotonic() + 90
        while any(process.poll() is None for process in processes):
            if time.monotonic() >= deadline:
                raise RuntimeError('local launch exceeded 90s; only owned process groups are stopped')
            time.sleep(0.03)
    finally:
        stop_owned(processes)
        for stream in streams:
            stream.close()
    codes = [process.returncode for process in processes]
    stderr = '\n'.join((output / ('agent-' + str(node) + '.stderr')).read_text() for node in (0, 1))
    checkpoint = output / 'checkpoint.pt'
    if expected_error:
        assert all(code != 0 for code in codes) and expected_error in stderr, stderr[-3000:]
        assert not checkpoint.exists()
    else:
        assert codes == [0, 0], stderr[-3000:]
        assert checkpoint.exists()
    observations = [json.loads(path.read_text()) for path in sorted(proof.glob('rank-*.json'))]
    assert len(observations) == 4
    assert len({row.pop('_host') for row in observations}) == 1
    expected = [(0, 0, 0), (1, 1, 0), (2, 0, 1), (3, 1, 1)]
    assert [(r['rank'], r['local_rank'], r['group_rank']) for r in observations] == expected
    assert all(r['world_size'] == 4 and r['local_world_size'] == 2 and r['role_rank'] == r['rank']
               for r in observations)
    records = []
    for node in (0, 1):
        for line in (output / ('agent-' + str(node) + '.stdout')).read_text().splitlines():
            if line.startswith('{'):
                row = json.loads(line)
                if 'path' in row:
                    row['path'] = str(Path(row['path']).relative_to(directory))
                records.append(row)
    result = {'commands': commands, 'launcher_exit_codes': codes, 'rank_observations': observations,
              'all_workers_same_host': True, 'checkpoint_created': checkpoint.exists(), 'records': records}
    if expected_error:
        result['matched_error'] = expected_error
    else:
        start = next(row for row in records if row['event'] == 'start')
        assert start['world_size'] == 4 and start['effective_batch'] == 512
        first = 1 if resume else 0
        assert start['start_epoch'] == first
        rows = [row for row in records if row['event'] == 'epoch']
        assert [row['epoch'] for row in rows] == list(range(first + 1, epochs + 1))
        for row in rows:
            assert row['samples'] == 8192
            assert row['attempted_update_windows'] == row['applied_optimizer_steps'] == 16
        result['applied_calls_per_rank'] = sum(row['applied_optimizer_steps'] for row in rows)
    return checkpoint, result


def compare(directory, first, second, expected_error=None, allow_difference=False):
    result = subprocess.run([sys.executable, str(LAB / 'compare_checkpoints.py'), str(first), str(second)],
                            cwd=directory, text=True, capture_output=True, timeout=30)
    if expected_error:
        assert result.returncode != 0 and expected_error in result.stderr
        return {'exit_code': result.returncode, 'matched_error': expected_error}
    if allow_difference and result.returncode != 0:
        return {'exit_code': result.returncode, 'message': result.stderr.strip().splitlines()[-1]}
    assert result.returncode == 0, result.stderr[-2000:]
    return {'exit_code': 0, 'message': result.stdout.strip()}


def numerical_state(first, second):
    """An explicit teaching contract, separate from bitwise equality.

    Floating model/Adam tensors use atol=1e-6, rtol=0. Counters, metadata,
    tensor layouts and all per-rank RNG bytes must remain exactly equal.
    This bound is declared for this tiny CPU program, not for arbitrary models.
    """
    rows = []
    def walk(a, b, path='state'):
        if isinstance(a, torch.Tensor):
            assert isinstance(b, torch.Tensor) and a.shape == b.shape and a.dtype == b.dtype, path
            if not torch.equal(a, b):
                assert a.is_floating_point() and not path.endswith('.step'), path
                assert torch.isfinite(a).all() and torch.isfinite(b).all(), path
                error = (a.double() - b.double()).abs().max().item()
                rows.append({'path': path, 'max_absolute_error': error,
                             'differing_elements': int((a != b).sum().item())})
                assert torch.allclose(a, b, atol=1e-6, rtol=0), (path, error)
        elif isinstance(a, dict):
            assert isinstance(b, dict) and a.keys() == b.keys(), path
            for key in a:
                walk(a[key], b[key], path + '.' + str(key))
        elif isinstance(a, (list, tuple)):
            assert type(a) is type(b) and len(a) == len(b), path
            for index, (x, y) in enumerate(zip(a, b)):
                walk(x, y, path + '[' + str(index) + ']')
        else:
            assert type(a) is type(b) and a == b, path
    a = torch.load(first, map_location='cpu', weights_only=True)
    b = torch.load(second, map_location='cpu', weights_only=True)
    walk(a, b)
    return {'contract': {'floating_atol': 1e-6, 'floating_rtol': 0,
                          'rng_counters_metadata': 'exact'},
            'bitwise_equal': not rows, 'different_float_tensors': rows,
            'max_absolute_error': max((row['max_absolute_error'] for row in rows), default=0),
            'within_declared_contract': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', default='run-report.json')
    args = parser.parse_args()
    if os.name != 'posix' or any(key in os.environ for key in ('RANK', 'LOCAL_RANK', 'WORLD_SIZE')):
        parser.error('run directly on Linux/macOS, outside torchrun')
    report = {'verified_at_utc': datetime.now(timezone.utc).isoformat(),
              'environment': {'python': platform.python_version(), 'torch': str(torch.__version__),
                              'platform': platform.platform(), 'device': 'cpu', 'backend': 'gloo',
                              'physical_hosts': 1, 'launchers': 2, 'workers_per_launcher': 2},
              'source_sha256': {name: sha(LAB / name) for name in SOURCES},
              'configuration': {'samples': 8192, 'world_size': 4, 'hidden': 32,
                                'batch_size_per_rank': 64, 'accum': 2, 'target_epochs': 2,
                                'precision': 'fp32', 'seed': 23}, 'runs': {}, 'negative_probes': {}}
    with tempfile.TemporaryDirectory(prefix='infra-multinode-launch-') as temporary:
        directory = Path(temporary)
        full, report['runs']['full'] = launch(directory, 'full', 2)
        split, report['runs']['split'] = launch(directory, 'split', 1)
        resumed, report['runs']['resumed'] = launch(directory, 'resumed', 2, resume=split)
        report['full_state_comparison'] = compare(directory, full, resumed, allow_difference=True)
        report['recovery_numerical_comparison'] = numerical_state(full, resumed)
        repeated, report['runs']['repeat_full'] = launch(directory, 'repeat-full', 2)
        report['continuous_repeat_comparison'] = compare(directory, full, repeated, allow_difference=True)
        report['continuous_repeat_numerical_comparison'] = numerical_state(full, repeated)
        final = torch.load(resumed, map_location='cpu', weights_only=True)
        assert final['next_epoch'] == 2 and len(final['rng_by_rank']) == 4
        report['final_state'] = {'next_epoch': final['next_epoch'], 'rng_rank_count': len(final['rng_by_rank']),
                                 'compared_fields': sorted(final.keys())}
        _, report['negative_probes']['changed_configuration'] = launch(
            directory, 'bad-configuration', 2, resume=split, changed={'accum': 4}, expected_error=REJECTION)
        for key, field in [('changed_optimizer', 'state.optimizer.state'),
                           ('changed_rank_rng', 'state.rng_by_rank[1].cpu')]:
            damaged = torch.load(resumed, map_location='cpu', weights_only=True)
            if key == 'changed_optimizer':
                moment = next(state['exp_avg'] for state in damaged['optimizer']['state'].values())
                moment.view(-1)[0] += 0.25
            else:
                damaged['rng_by_rank'][1]['cpu'][0] ^= 1
            assert all(torch.equal(value, damaged['model'][name]) for name, value in final['model'].items())
            path = directory / (key + '.pt')
            torch.save(damaged, path)
            probe = compare(directory, resumed, path, expected_error=field)
            probe['model_weights_unchanged'] = True
            report['negative_probes'][key] = probe
    report['not_executed'] = ['multiple physical hosts', 'CUDA/NCCL', 'GPU/LLM performance',
                              'arbitrary mid-step crash', 'power loss', 'Kubernetes/cloud networking']
    report['status'] = 'passed_declared_numerical_contract'
    target = Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'report': str(target), 'ranks': 4,
                      'updates_per_epoch': 16, 'exact_recovery': report['recovery_numerical_comparison']['bitwise_equal'],
                      'max_absolute_error': report['recovery_numerical_comparison']['max_absolute_error']}))


if __name__ == '__main__':
    main()
