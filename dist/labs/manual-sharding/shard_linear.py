"""Two real CPU/Gloo workers own parameter and momentum shards.

Teaching implementation, not PyTorch FSDP: it all-reduces a full gradient and
then slices it. No GPU allocator, reduce-scatter performance or FSDP API claim.
Run with Python 3.12 and torch==2.5.1: python shard_linear.py
"""
import argparse
import json
import tempfile
from datetime import timedelta
from pathlib import Path

import torch
import torch.distributed as dist
import torch.multiprocessing as mp


WORLD = 2
SHAPES = ((4, 6), (6, 3))


def initial_weights():
    return [torch.arange(a*b, dtype=torch.float64).reshape(a, b)/50-0.2
            for a, b in SHAPES]


def gather(shard, shape):
    parts = [torch.empty_like(shard) for _ in range(WORLD)]
    dist.all_gather(parts, shard.contiguous())
    return torch.cat(parts).view(shape)


class ShardedLinear(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x, shard, shape, rank):
        ctx.save_for_backward(x, shard)
        ctx.shape, ctx.rank = shape, rank
        full = gather(shard, shape)
        output = x @ full
        # No full weight is saved for backward. The input activation is saved.
        return output

    @staticmethod
    def backward(ctx, grad_output):
        x, shard = ctx.saved_tensors
        full = gather(shard, ctx.shape)
        grad_input = grad_output @ full.T
        del full
        full_gradient = x.T @ grad_output
        # A correctness-oriented stand-in for SUM reduce-scatter. It transfers
        # the whole gradient; do not infer reduce-scatter memory/bandwidth here.
        dist.all_reduce(full_gradient, op=dist.ReduceOp.SUM)
        owned = full_gradient.flatten().chunk(WORLD)[ctx.rank].clone()
        return grad_input, owned, None, None


def worker(rank, rendezvous, destination, wrong_rank_mean):
    torch.set_num_threads(1)
    dist.init_process_group('gloo', init_method=Path(rendezvous).as_uri(),
                            rank=rank, world_size=WORLD,
                            timeout=timedelta(seconds=20))
    try:
        full_initial = initial_weights()
        shards = [torch.nn.Parameter(w.flatten().chunk(WORLD)[rank].clone())
                  for w in full_initial]
        optimizer = torch.optim.SGD(shards, lr=0.05, momentum=0.9)
        reference = [torch.nn.Parameter(w.clone()) for w in full_initial]
        reference_optimizer = torch.optim.SGD(reference, lr=0.05, momentum=0.9)
        inputs = torch.tensor([[1., 0., -1., 2.], [2., 1., 0., -1.],
                               [0., 3., 1., 1.]], dtype=torch.float64)
        targets = torch.tensor([[0., 1., -1.], [1., -1., 0.],
                                [1., 0., 1.]], dtype=torch.float64)
        chosen = slice(0, 1) if rank == 0 else slice(1, 3)
        valid = targets.numel()  # 9 total scalar prediction targets, not ranks.
        rows = []
        for step in range(3):
            optimizer.zero_grad(set_to_none=True)
            hidden = ShardedLinear.apply(inputs[chosen], shards[0], SHAPES[0], rank).tanh()
            output = ShardedLinear.apply(hidden, shards[1], SHAPES[1], rank)
            # Negative probe: average the two local means equally, even though
            # their sample counts differ. The correct path uses one global sum.
            denominator = targets[chosen].numel()*WORLD if wrong_rank_mean else valid
            local_loss = 0.5 * (output-targets[chosen]).square().sum()/denominator
            local_loss.backward()

            reference_optimizer.zero_grad(set_to_none=True)
            expected = (inputs @ reference[0]).tanh() @ reference[1]
            reference_loss = 0.5 * (expected-targets).square().sum()/valid
            reference_loss.backward()
            # Check the gradient before step; a bad normalization can otherwise
            # be hidden by an optimizer update or a later metric.
            errors = []
            for shard, ref in zip(shards, reference):
                expected_gradient = ref.grad.flatten().chunk(WORLD)[rank]
                torch.testing.assert_close(shard.grad, expected_gradient, rtol=1e-10, atol=1e-12)
                errors.append(float((shard.grad-expected_gradient).abs().max()))
            optimizer.step()
            reference_optimizer.step()
            for shard, shape, ref in zip(shards, SHAPES, reference):
                torch.testing.assert_close(gather(shard, shape), ref, rtol=1e-10, atol=1e-12)
                expected_momentum = reference_optimizer.state[ref]['momentum_buffer'].flatten().chunk(WORLD)[rank]
                torch.testing.assert_close(optimizer.state[shard]['momentum_buffer'], expected_momentum,
                                           rtol=1e-10, atol=1e-12)
            total_loss = local_loss.detach().clone()
            dist.all_reduce(total_loss)
            torch.testing.assert_close(total_loss, reference_loss.detach(), rtol=1e-10, atol=1e-12)
            rows.append({'step': step+1, 'global_loss': float(total_loss),
                         'max_owned_gradient_error': max(errors)})
        report = {'rank': rank, 'local_samples': len(inputs[chosen]),
                  'owned_parameter_elements': sum(p.numel() for p in shards),
                  'owned_gradient_elements': sum(p.grad.numel() for p in shards),
                  'owned_momentum_elements': sum(optimizer.state[p]['momentum_buffer'].numel() for p in shards),
                  'owned_parameters': [p.detach().tolist() for p in shards],
                  'owned_last_gradient': [p.grad.tolist() for p in shards],
                  'owned_momentum': [optimizer.state[p]['momentum_buffer'].tolist() for p in shards],
                  'steps': rows}
        Path(destination, f'rank-{rank}.json').write_text(json.dumps(report))
    finally:
        dist.destroy_process_group()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wrong-rank-mean', action='store_true',
                        help='negative probe: local means must fail the global gradient check')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='infra-shards-') as directory:
        rendezvous = str(Path(directory, 'rendezvous').resolve())
        mp.spawn(worker, args=(rendezvous, directory, args.wrong_rank_mean), nprocs=WORLD, join=True)
        workers = [json.loads(Path(directory, f'rank-{rank}.json').read_text()) for rank in range(WORLD)]
    assert [w['local_samples'] for w in workers] == [1, 2]
    for row in workers:
        assert row['owned_parameter_elements'] == 21
        assert row['owned_gradient_elements'] == 21
        assert row['owned_momentum_elements'] == 21
        assert len(row['steps']) == 3
    print(json.dumps({'torch': str(torch.__version__), 'device': 'cpu',
                      'backend': 'gloo', 'workers': workers,
                      'full_parameter_elements': 42,
                      'communication': 'all_gather weights; SUM all_reduce full gradient then slice',
                      'verified': 'three global gradients, parameter updates and SGD momentum versus full-batch reference',
                      'not_verified': ['PyTorch FSDP API', 'GPU memory peak', 'reduce_scatter performance', 'resharded checkpoint']},
                     indent=2))


if __name__ == '__main__':
    main()
