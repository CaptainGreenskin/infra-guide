"""Execute the CPU/Gloo acceptance checks and write a factual lab report.
Run with the Python interpreter where torch==2.5.1 is installed.
"""
from pathlib import Path
import datetime
import hashlib
import json
import math
import os
import platform
import socket
import subprocess
import sys
import tempfile

import torch

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / 'dist/labs/ddp'
RUNS = []
COMMON = ['--device=cpu', '--samples=1024', '--hidden=32', '--batch-size=32', '--accum=2']

def launch(name, args, expected_error=None):
    cmd = [sys.executable, '-m', 'torch.distributed.run', '--standalone',
           '--nproc-per-node=2', 'train_ddp.py'] + COMMON + args
    proc = subprocess.run(cmd, cwd=LAB, text=True, capture_output=True, timeout=100)
    if expected_error:
        assert proc.returncode != 0 and expected_error in proc.stderr, proc.stdout + proc.stderr
    else:
        assert proc.returncode == 0, proc.stdout + proc.stderr
    records = [json.loads(line) for line in proc.stdout.splitlines() if line.startswith('{')]
    clean_args = [x.replace(temp_root, '<temporary>') for x in cmd[1:]]
    for record in records:
        if 'path' in record:
            record['path'] = record['path'].replace(temp_root, '<temporary>')
    RUNS.append({'name': name, 'command': ['python'] + clean_args, 'exit_code': proc.returncode,
                 'expected_error': expected_error, 'records': records})
    print(name + ': passed', flush=True)
    return records

with tempfile.TemporaryDirectory(prefix='cloudinfra-ddp-') as temp_root:
    full, split = Path(temp_root)/'full', Path(temp_root)/'split'
    full_records = launch('two_process_four_epochs', ['--epochs=4', '--save-dir='+str(full)])
    split_records = launch('two_process_two_epochs', ['--epochs=2', '--save-dir='+str(split)])
    resumed = launch('resume_to_four_epochs', ['--epochs=4', '--save-dir='+str(split),
                                               '--resume='+str(split/'checkpoint.pt')])
    epochs = [r for r in full_records if r['event'] == 'epoch']
    assert len(epochs) == 4
    assert all(r['samples'] == 1024 and r['attempted_update_windows'] == 8
               and r['applied_optimizer_steps'] == r['optimizer_steps'] == 8
               and math.isfinite(r['loss']) for r in epochs)
    assert epochs[-1]['loss'] < epochs[0]['loss']
    assert next(r for r in full_records if r['event']=='start')['effective_batch'] == 128
    assert next(r for r in resumed if r['event']=='start')['start_epoch'] == 2
    compare = subprocess.run([sys.executable, 'compare_checkpoints.py', str(full/'checkpoint.pt'),
                              str(split/'checkpoint.pt')], cwd=LAB, text=True, capture_output=True, timeout=30)
    assert compare.returncode == 0, compare.stdout + compare.stderr
    print('checkpoint_state_equality: passed', flush=True)
    # Two launch agents on one host exercise the real shell launcher, NOT physical-node networking.
    with socket.socket() as port_socket:
        port_socket.bind(('127.0.0.1', 0))
        port = port_socket.getsockname()[1]
    agents = []
    try:
        for node_rank in (0, 1):
            env = dict(os.environ, NODE_RANK=str(node_rank), MASTER_ADDR='127.0.0.1',
                       MASTER_PORT=str(port), TRAIN_OUT=str(Path(temp_root)/'two-agents'),
                       PATH=str(Path(sys.executable).parent)+os.pathsep+os.environ.get('PATH', ''))
            agents.append(subprocess.Popen(
                ['bash', 'launch_2nodes.sh', '--device=cpu', '--epochs=1', '--samples=1024',
                 '--hidden=32', '--batch-size=32', '--accum=2'],
                cwd=LAB, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE))
        agent_logs = [proc.communicate(timeout=100) for proc in agents]
        assert all(proc.returncode == 0 for proc in agents), agent_logs
        agent_records = [json.loads(line) for out, err in agent_logs for line in out.splitlines()
                         if line.startswith('{')]
        assert next(r for r in agent_records if r['event']=='start')['world_size'] == 4
        epoch4 = next(r for r in agent_records if r['event']=='epoch')
        assert epoch4['samples'] == 1024 and epoch4['attempted_update_windows'] == 4
        assert epoch4['applied_optimizer_steps'] == epoch4['optimizer_steps'] == 4
        for record in agent_records:
            if 'path' in record:
                record['path'] = record['path'].replace(temp_root, '<temporary>')
        RUNS.append({'name': 'two_agents_one_host_four_cpu_ranks', 'exit_code': 0,
                     'scope': 'Both NODE_RANK values via launch_2nodes.sh; loopback networking only.',
                     'records': agent_records})
        print('two_agents_one_host_four_cpu_ranks: passed', flush=True)
    finally:
        for proc in agents:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    launch('invalid_accumulation_rejected', ['--epochs=1', '--accum=3', '--save-dir='+str(full)],
           'divisible by --accum')
    launch('incompatible_resume_rejected', ['--epochs=5', '--batch-size=16',
           '--resume='+str(full/'checkpoint.pt'), '--save-dir='+str(split)],
           'Resume requires the same')

report = {
    'date': datetime.date.today().isoformat(),
    'environment': f'{platform.system()} {platform.machine()}, Python {platform.python_version()}, PyTorch {torch.__version__}, CPU/Gloo',
    'cpu_ddp': 'passed', 'resume': 'passed', 'negative': 'passed',
    'simulated_two_agents': 'passed',
    'loss_by_epoch': [r['loss'] for r in epochs],
    'comparison': 'Exact equality of model, optimizer, scaler, next_epoch, signature, and all per-rank RNG state',
    'not_executed': ['CUDA', 'NCCL', 'multiple physical nodes', 'BF16/FP16', 'Kubernetes'],
    'measurement_scope': 'Tiny synthetic MLP functional test. Timings are local observations, not a GPU or LLM benchmark.',
    'train_sha256': hashlib.sha256((LAB/'train_ddp.py').read_bytes()).hexdigest(),
    'runs': RUNS,
}
(LAB/'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({k:report[k] for k in ('environment','cpu_ddp','resume','negative','loss_by_epoch')}))

