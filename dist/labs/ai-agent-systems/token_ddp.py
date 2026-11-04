"""Real two-process CPU/Gloo loss-normalization experiment; no GPU benchmark."""
import contextlib
import datetime
import json
from pathlib import Path
import tempfile

import torch
import torch.distributed as dist
import torch.multiprocessing as mp


class CountingSGD(torch.optim.SGD):
    def __init__(self, parameters, **kwargs):
        super().__init__(parameters, **kwargs)
        self.observed_steps = 0

    def step(self, *args, **kwargs):
        self.observed_steps += 1
        return super().step(*args, **kwargs)


def worker(rank, rendezvous, output):
    torch.set_num_threads(1)
    dist.init_process_group('gloo', init_method=rendezvous, rank=rank,
                            world_size=2, timeout=datetime.timedelta(seconds=30))
    model = torch.nn.parallel.DistributedDataParallel(
        torch.nn.Linear(1, 1, bias=False, dtype=torch.float64))
    optimizer = CountingSGD(model.parameters(), lr=0.1)
    # Each valid token contributes 0.5 * (w-y)^2. At w=0 its gradient is -y.
    cases = [
        ('wrong_rank_mean', [[-2.0]], [[-4.0, -6.0, -8.0]], False),
        ('global_token_mean', [[-2.0]], [[-4.0, -6.0, -8.0]], True),
        ('accumulated_global_mean', [[-2.0], []], [[-4.0], [-6.0, -8.0]], True),
        ('one_empty_rank', [[]], [[-4.0, -6.0, -8.0]], True),
        ('all_empty', [[]], [[]], True),
    ]
    result = {}
    for name, left, right, normalized in cases:
        with torch.no_grad():
            model.module.weight.zero_()
        optimizer.zero_grad(set_to_none=True)
        steps_before = optimizer.observed_steps
        sync_flags = []
        batches = (left, right)[rank]
        count = torch.tensor(sum(map(len, batches)), dtype=torch.int64)
        dist.all_reduce(count, op=dist.ReduceOp.SUM)
        if count.item() == 0:
            gradient = model.module.weight.grad
            result[name] = {'valid_tokens': count.item(),
                            'gradient': None if gradient is None else gradient.item(),
                            'weight': model.module.weight.item(),
                            'optimizer_step': optimizer.observed_steps > steps_before,
                            'observed_step_count': optimizer.observed_steps-steps_before,
                            'backward_sync_flags': sync_flags}
            continue  # Both ranks observe the same decision; no collective is skipped alone.
        for index, values in enumerate(batches):
            sync = contextlib.nullcontext() if index == len(batches)-1 else model.no_sync()
            # no_sync must enclose forward as well as backward.
            with sync:
                sync_flags.append(bool(model.require_backward_grad_sync))
                y = torch.tensor(values, dtype=torch.float64).reshape(-1, 1)
                prediction = model(torch.ones_like(y))
                numerator = ((prediction-y)**2).sum()/2
                loss = numerator*2/count.item() if normalized else numerator/len(values)
                loss.backward()  # Empty local sum remains differentiable and contributes zero.
        gradient = model.module.weight.grad.item()
        optimizer.step()
        result[name] = {'valid_tokens': count.item(), 'gradient': gradient,
                        'weight': model.module.weight.item(),
                        'optimizer_step': optimizer.observed_steps > steps_before,
                        'observed_step_count': optimizer.observed_steps-steps_before,
                        'backward_sync_flags': sync_flags}
    Path(output, 'rank'+str(rank)+'.json').write_text(json.dumps(result))
    dist.destroy_process_group()


def main():
    with tempfile.TemporaryDirectory(prefix='token-ddp-') as temporary:
        rendezvous = (Path(temporary)/'rendezvous').as_uri()
        mp.spawn(worker, args=(rendezvous, temporary), nprocs=2, join=True)
        ranks = [json.loads(Path(temporary, 'rank'+str(i)+'.json').read_text()) for i in range(2)]
    assert ranks[0] == ranks[1]
    expected = {'wrong_rank_mean': (4, -0.4), 'global_token_mean': (5, -0.5),
                'accumulated_global_mean': (5, -0.5), 'one_empty_rank': (6, -0.6)}
    for name, (gradient, weight) in expected.items():
        assert abs(ranks[0][name]['gradient']-gradient) < 1e-12
        assert abs(ranks[0][name]['weight']-weight) < 1e-12
    assert ranks[0]['all_empty']['optimizer_step'] is False
    assert ranks[0]['all_empty']['observed_step_count'] == 0
    assert ranks[0]['all_empty']['gradient'] is None
    assert ranks[0]['all_empty']['weight'] == 0.0
    assert ranks[0]['accumulated_global_mean']['backward_sync_flags'] == [False, True]
    assert all(ranks[0][name]['observed_step_count'] == 1 for name in expected)
    # Independent single-process baseline for the complete four-token objective.
    w = torch.tensor(0., dtype=torch.float64, requires_grad=True)
    ((w-torch.tensor([-2., -4., -6., -8.], dtype=torch.float64))**2).mean().div(2).backward()
    assert w.grad.item() == 5.0
    print(json.dumps({'torch': torch.__version__, 'device': 'cpu', 'backend': 'gloo',
                      'processes': 2, 'single_process_gradient': w.grad.item(),
                      'cases': ranks[0], 'scope': 'fixed world size, scalar MSE; not LLM/GPU performance'}, indent=2))


if __name__ == '__main__':
    main()
