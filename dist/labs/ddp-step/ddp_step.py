"""One scalar SGD update on two real CPU/Gloo processes. No GPU benchmark."""
import argparse
from datetime import timedelta
import json
from pathlib import Path
import platform
import sys
import tempfile

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch import nn
from torch.nn.parallel import DistributedDataParallel as DDP

CASES = [
    ('equal_ddp', [[0., 2.], [2., 4.]], 'ddp_mean'),
    ('equal_independent', [[0., 2.], [2., 4.]], 'independent'),
    ('unequal_naive', [[0.], [3., 3., 3.]], 'ddp_mean'),
    ('unequal_corrected', [[0.], [3., 3., 3.]], 'ddp_global_mean'),
]


def model_at_one():
    model = nn.Linear(1, 1, bias=False).double()
    with torch.no_grad():
        model.weight.fill_(1.)
    return model


def worker(rank, folder):
    torch.set_num_threads(1)
    root = Path(folder)
    dist.init_process_group('gloo', init_method=(root/'rendezvous').as_uri(),
                            rank=rank, world_size=2, timeout=timedelta(seconds=20))
    try:
        rows = []
        for name, batches, mode in CASES:
            model = model_at_one()
            wrapped = model if mode == 'independent' else DDP(model)
            targets = torch.tensor(batches[rank], dtype=torch.float64).reshape(-1, 1)
            local_losses = .5 * (wrapped(torch.ones_like(targets)) - targets).square()
            if mode == 'ddp_global_mean':
                count = torch.tensor(float(targets.numel()), dtype=torch.float64)
                dist.all_reduce(count, op=dist.ReduceOp.SUM)
                loss = local_losses.sum() * dist.get_world_size() / count
            else:
                loss = local_losses.mean()
            optimizer = torch.optim.SGD(model.parameters(), lr=.1)
            optimizer.zero_grad()
            loss.backward()
            gradient = model.weight.grad.item()
            optimizer.step()
            rows.append({'case': name, 'rank': rank, 'targets': batches[rank],
                         'local_mean_loss': local_losses.mean().item(),
                         'gradient_after_backward': gradient,
                         'weight_after_step': model.weight.item()})
        (root/f'rank-{rank}.json').write_text(json.dumps(rows, indent=2)+'\n')
    finally:
        dist.destroy_process_group()


def serial_reference(targets):
    model = model_at_one()
    target = torch.tensor(targets, dtype=torch.float64).reshape(-1, 1)
    loss = (.5 * (model(torch.ones_like(target))-target).square()).mean()
    loss.backward()
    gradient = model.weight.grad.item()
    torch.optim.SGD(model.parameters(), lr=.1).step()
    return {'gradient': gradient, 'weight_after_step': model.weight.item()}


def experiment():
    if not dist.is_gloo_available():
        raise RuntimeError('This experiment needs a PyTorch build with CPU/Gloo support.')
    with tempfile.TemporaryDirectory(prefix='infraguide-ddp-step-') as folder:
        mp.spawn(worker, args=(folder,), nprocs=2, join=True)
        ranks = [json.loads((Path(folder)/f'rank-{r}.json').read_text()) for r in range(2)]
    expected = {
        'equal_ddp': ([-1., -1.], [1.1, 1.1]),
        'equal_independent': ([0., -2.], [1., 1.2]),
        'unequal_naive': ([-.5, -.5], [1.05, 1.05]),
        'unequal_corrected': ([-1.25, -1.25], [1.125, 1.125]),
    }
    for rank, rows in enumerate(ranks):
        for row in rows:
            gradients, weights = expected[row['case']]
            assert abs(row['gradient_after_backward']-gradients[rank]) < 1e-12, row
            assert abs(row['weight_after_step']-weights[rank]) < 1e-12, row
    serial = {'equal': serial_reference([0., 2., 2., 4.]),
              'unequal': serial_reference([0., 3., 3., 3.])}
    assert abs(serial['equal']['weight_after_step']-1.1) < 1e-12
    assert abs(serial['unequal']['weight_after_step']-1.125) < 1e-12
    for rows in ranks:
        assert abs(rows[0]['weight_after_step']-serial['equal']['weight_after_step']) < 1e-12
        assert abs(rows[3]['weight_after_step']-serial['unequal']['weight_after_step']) < 1e-12
        assert abs(rows[2]['weight_after_step']-serial['unequal']['weight_after_step']) > .05
    return {'status': 'passed', 'python': platform.python_version(), 'torch': torch.__version__,
            'platform': platform.system()+' '+platform.machine(), 'backend': 'gloo',
            'dtype': 'float64', 'world_size': 2, 'learning_rate': .1, 'initial_weight': 1.,
            'rank_results': ranks, 'serial_reference': serial,
            'scope': 'Two real local CPU processes; one scalar parameter; one SGD update per case.',
            'not_verified': ['CUDA/NCCL', 'multiple physical nodes', 'performance scaling',
                             'large model convergence', 'gradient accumulation', 'uneven iteration counts']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='runs/ddp-step-report.json')
    args = parser.parse_args()
    report = experiment()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
