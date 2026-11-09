"""Check uneven sequence shards over a real CPU/Gloo ring."""

import argparse
from datetime import timedelta
import hashlib
import json
import math
import os
from pathlib import Path

import torch
import torch.distributed as dist


WIDTH = 16
RATE = 0.1
TOLERANCE = 1e-10


def split_sequence(positions, world):
    quotient, remainder = divmod(positions, world)
    lengths = [quotient + (rank >= world - remainder) for rank in range(world)]
    starts = [sum(lengths[:rank]) for rank in range(world)]
    return [(rank, start, length) for rank, (start, length) in enumerate(zip(starts, lengths))]


def rotate(header, values, rank, world):
    """Send the same fixed shapes on each hop. Tags distinguish header and payload."""
    previous, following = (rank - 1) % world, (rank + 1) % world
    received_header, received_values = torch.empty_like(header), torch.empty_like(values)
    operations = [
        dist.P2POp(dist.isend, header, following, tag=0),
        dist.P2POp(dist.isend, values, following, tag=1),
        dist.P2POp(dist.irecv, received_header, previous, tag=0),
        dist.P2POp(dist.irecv, received_values, previous, tag=1),
    ]
    for operation in dist.batch_isend_irecv(operations):
        operation.wait()
    return received_header, received_values


def observe_header(header, expected):
    observed = tuple(header.tolist())
    if observed != expected:
        raise AssertionError(f'received shard header {observed}, expected {expected}')
    return observed


def pad_rows(tensor, wire_rows):
    return torch.cat((tensor, tensor.new_zeros((wire_rows - len(tensor), WIDTH))))


def block_scores(q, keys, query_start, key_start, key_count, mask_padding):
    query_positions = query_start + torch.arange(len(q))
    key_rows = torch.arange(len(keys))
    visible = query_positions[:, None] >= (key_start + key_rows[None, :])
    if mask_padding:
        visible &= key_rows[None, :] < key_count
    return (q @ keys.T / math.sqrt(WIDTH)).masked_fill(~visible, -torch.inf)


def forward(q, wire_k, wire_v, header, layout, rank, mask_padding):
    world = len(layout)
    query_start = layout[rank][1]
    maximum = q.new_full((len(q), 1), -torch.inf)
    mass = q.new_zeros((len(q), 1))
    numerator = torch.zeros_like(q)
    values = torch.stack((wire_k, wire_v))
    seen = []
    for hop in range(world):
        owner = (rank - hop) % world
        observed = observe_header(header, layout[owner])
        seen.append(observed)
        _, key_start, key_count = observed
        keys, contents = values
        scores = block_scores(q, keys, query_start, key_start, key_count, mask_padding)
        new_max = torch.maximum(maximum, scores.amax(dim=-1, keepdim=True))
        scale = (maximum - new_max).exp()
        weights = (scores - new_max).exp()
        mass = scale * mass + weights.sum(dim=-1, keepdim=True)
        numerator = scale * numerator + weights @ contents
        maximum = new_max
        if hop + 1 < world:
            header, values = rotate(header, values, rank, world)
    return numerator / mass, maximum, mass, seen


def backward(q, wire_k, wire_v, header, layout, rank, mask_padding, output, maximum, mass, grad_out):
    world = len(layout)
    _, query_start, local_count = layout[rank]
    grad_q = torch.zeros_like(q)
    values = torch.stack((wire_k, wire_v, torch.zeros_like(wire_k), torch.zeros_like(wire_v)))
    dot = (grad_out * output).sum(dim=-1, keepdim=True)
    seen = []
    for hop in range(world):
        owner = (rank - hop) % world
        observed = observe_header(header, layout[owner])
        seen.append(observed)
        _, key_start, key_count = observed
        keys, contents, grad_keys, grad_values = values
        scores = block_scores(q, keys, query_start, key_start, key_count, mask_padding)
        weights = (scores - maximum).exp() / mass
        grad_scores = weights * (grad_out @ contents.T - dot)
        grad_q += grad_scores @ keys / math.sqrt(WIDTH)
        grad_keys += grad_scores.T @ q / math.sqrt(WIDTH)
        grad_values += weights.T @ grad_out
        if hop == 0:
            local_contribution = (grad_keys[:local_count].clone(), grad_values[:local_count].clone())
        # Return the accumulated dK and dV to the observed owner on the last hop.
        header, values = rotate(header, values, rank, world)
    returned = observe_header(header, layout[rank])
    pad = values[2:, local_count:]
    pad_gradient_max = pad.abs().max().item() if pad.numel() else 0.0
    return (grad_q, values[2, :local_count], values[3, :local_count]), local_contribution, seen, returned, pad_gradient_max


def make_rows(start, count):
    axes = torch.arange(WIDTH, dtype=torch.float64)[None, :]
    positions = torch.arange(start, start + count, dtype=torch.float64)[:, None]
    return torch.sin(positions * 0.031 + axes * 0.11), torch.cos(positions * 0.017 - axes * 0.13)


def make_weights():
    axes = torch.arange(WIDTH, dtype=torch.float64)
    return tuple(torch.cos((axes[:, None] + 1) * (axes[None, :] + 1) * phase) / 8
                 for phase in (0.13, 0.17, 0.23))


def dense_reference(positions):
    inputs, target = make_rows(0, positions)
    weights = tuple(w.requires_grad_() for w in make_weights())
    q, k, v = (inputs @ weight for weight in weights)
    scores = q @ k.T / math.sqrt(WIDTH)
    future = torch.ones_like(scores, dtype=torch.bool).triu(1)
    output = scores.masked_fill(future, -torch.inf).softmax(-1) @ v
    loss = 0.5 * (output - target).square().mean()
    gradients = torch.autograd.grad(loss, (q, k, v, *weights))
    return output.detach(), loss.detach(), gradients[:3], gradients[3:]


def max_error(actual, expected):
    return max((a - b).abs().max().item() for a, b in zip(actual, expected))


def run(positions, rank, world, mask_padding):
    layout = split_sequence(positions, world)
    _, start, count = layout[rank]
    wire_rows = max(length for _, _, length in layout)
    rows, target = make_rows(start, count)
    weights = make_weights()
    q, k, v = (rows @ weight for weight in weights)
    header = torch.tensor(layout[rank], dtype=torch.int64)
    wire_k, wire_v = pad_rows(k, wire_rows), pad_rows(v, wire_rows)
    output, maximum, mass, forward_seen = forward(q, wire_k, wire_v, header, layout, rank, mask_padding)
    residual = output - target
    loss = 0.5 * residual.square().sum() / (positions * WIDTH)
    grad_out = residual / (positions * WIDTH)
    gradients, local_only, backward_seen, returned, pad_gradient_max = backward(
        q, wire_k, wire_v, header, layout, rank, mask_padding, output, maximum, mass, grad_out)
    weight_grads = torch.stack([rows.T @ grad for grad in gradients])
    dropped = torch.stack([rows.T @ grad for grad in (gradients[0], *local_only)])
    dist.all_reduce(weight_grads)
    dist.all_reduce(dropped)
    dist.all_reduce(loss)

    ref_output, ref_loss, ref_projections, ref_weights = dense_reference(positions)
    local = slice(start, start + count)
    update = tuple(w - RATE * g for w, g in zip(weights, weight_grads))
    ref_update = tuple(w - RATE * g for w, g in zip(weights, ref_weights))
    return {
        'rank': rank,
        'positions': [start, start + count],
        'wire_rows': wire_rows,
        'padding_rows': wire_rows - count,
        'forward_headers': forward_seen,
        'backward_headers': backward_seen,
        'returned_header': returned,
        'padding_gradient_max_abs': pad_gradient_max,
        'errors': {
            'output': (output - ref_output[local]).abs().max().item(),
            'loss': (loss - ref_loss).abs().item(),
            'projection_gradients': max_error(gradients, [g[local] for g in ref_projections]),
            'weight_gradients': max_error(weight_grads, ref_weights),
            'updated_weights': max_error(update, ref_update),
        },
        'drop_remote_dkv_max_abs_error': max_error(dropped[1:], ref_weights[1:]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--positions', type=int, required=True)
    parser.add_argument('--unsafe-padding', action='store_true', help='let padded columns enter the causal mask')
    args = parser.parse_args()
    world = int(os.environ['WORLD_SIZE'])
    if world < 2 or not world <= args.positions <= 4096:
        parser.error('use at least two processes, each with at least one position, and at most 4096 positions')
    if args.unsafe_padding and args.positions % world == 0:
        parser.error('the negative case requires at least one padded shard')
    torch.set_num_threads(1)
    dist.init_process_group('gloo', timeout=timedelta(seconds=60))
    verdict = 0
    try:
        rank = dist.get_rank()
        result = run(args.positions, rank, world, not args.unsafe_padding)
        records = [None] * world if rank == 0 else None
        dist.gather_object(result, records, dst=0)
        if rank == 0:
            reasons = []
            for row in records:
                for metric, error in row['errors'].items():
                    if not math.isfinite(error) or error > TOLERANCE:
                        reasons.append({'rank': row['rank'], 'metric': metric})
                if row['padding_gradient_max_abs'] != 0:
                    reasons.append({'rank': row['rank'], 'metric': 'padding_gradient'})
            if not args.unsafe_padding and any(row['drop_remote_dkv_max_abs_error'] <= 1e-6 for row in records):
                raise AssertionError('dropping remote dK/dV did not change the weight gradient')
            if reasons:
                verdict = 2
            print(json.dumps({
                'status': 'rejected' if reasons else 'passed',
                'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                'torch': str(torch.__version__), 'backend': 'gloo', 'device': 'cpu', 'dtype': 'float64',
                'world_size': world, 'positions': args.positions, 'width': WIDTH,
                'learning_rate': RATE, 'tolerance': TOLERANCE, 'mask_padding': not args.unsafe_padding,
                'header_fields': ['owner', 'start', 'count'], 'reasons': reasons, 'ranks': records,
            }, indent=2, allow_nan=False), flush=True)
        dist.barrier()
    finally:
        dist.destroy_process_group()
    return verdict


if __name__ == '__main__':
    raise SystemExit(main())
