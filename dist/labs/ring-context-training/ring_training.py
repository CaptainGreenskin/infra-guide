"""Blockwise causal attention and one projection-weight update over a real process ring."""

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


def rotate(packet, rank, world):
    """Send the current owner's block forward and receive the preceding block."""
    received = torch.empty_like(packet)
    operations = [
        dist.P2POp(dist.isend, packet, (rank + 1) % world),
        dist.P2POp(dist.irecv, received, (rank - 1) % world),
    ]
    for work in dist.batch_isend_irecv(operations):
        work.wait()
    return received


def block_scores(q, keys, rank, owner):
    size = q.size(0)
    positions = torch.arange(size, device=q.device)
    visible = (rank * size + positions[:, None]) >= (owner * size + positions[None, :])
    return (q @ keys.T / math.sqrt(WIDTH)).masked_fill(~visible, -torch.inf)


def forward(q, k, v, rank, world):
    maximum = q.new_full((len(q), 1), -torch.inf)
    mass = q.new_zeros((len(q), 1))
    numerator = torch.zeros_like(q)
    packet = torch.stack((k, v))
    owners = []
    for hop in range(world):
        owner = (rank - hop) % world
        owners.append(owner)
        keys, values = packet
        scores = block_scores(q, keys, rank, owner)
        new_max = torch.maximum(maximum, scores.amax(dim=-1, keepdim=True))
        scale = (maximum - new_max).exp()
        weights = (scores - new_max).exp()
        mass = scale * mass + weights.sum(dim=-1, keepdim=True)
        numerator = scale * numerator + weights @ values
        maximum = new_max
        if hop + 1 < world:
            packet = rotate(packet, rank, world)
    return numerator / mass, maximum, mass, owners


def backward(q, k, v, output, maximum, mass, grad_out, rank, world):
    grad_q = torch.zeros_like(q)
    packet = torch.stack((k, v, torch.zeros_like(k), torch.zeros_like(v)))
    dot = (grad_out * output).sum(dim=-1, keepdim=True)
    for hop in range(world):
        owner = (rank - hop) % world
        keys, values, grad_keys, grad_values = packet
        scores = block_scores(q, keys, rank, owner)
        weights = (scores - maximum).exp() / mass
        grad_scores = weights * (grad_out @ values.T - dot)
        grad_q += grad_scores @ keys / math.sqrt(WIDTH)
        grad_keys += grad_scores.T @ q / math.sqrt(WIDTH)
        grad_values += weights.T @ grad_out
        if hop == 0:
            own_only = (grad_keys.clone(), grad_values.clone())
        # The final send returns each accumulated gradient to the original owner.
        packet = rotate(packet, rank, world)
    return (grad_q, packet[2], packet[3]), own_only


def make_rows(start, count, device):
    axes = torch.arange(WIDTH, dtype=torch.float64, device=device)[None, :]
    positions = torch.arange(start, start + count, dtype=torch.float64, device=device)[:, None]
    values = torch.sin(positions * 0.031 + axes * 0.11)
    target = torch.cos(positions * 0.017 - axes * 0.13)
    return values, target


def make_weights(device):
    axes = torch.arange(WIDTH, dtype=torch.float64, device=device)
    return tuple(torch.cos((axes[:, None] + 1) * (axes[None, :] + 1) * phase) / 8
                 for phase in (0.13, 0.17, 0.23))


def dense_reference(positions, device):
    inputs, target = make_rows(0, positions, device)
    weights = tuple(w.requires_grad_() for w in make_weights(device))
    q, k, v = (inputs @ weight for weight in weights)
    scores = q @ k.T / math.sqrt(WIDTH)
    future = torch.ones_like(scores, dtype=torch.bool).triu(1)
    output = scores.masked_fill(future, -torch.inf).softmax(-1) @ v
    loss = 0.5 * (output - target).square().mean()
    gradients = torch.autograd.grad(loss, (q, k, v, *weights))
    return output.detach(), loss.detach(), gradients[:3], gradients[3:]


def maximum_error(actual, expected):
    return max((a - b).abs().max().item() for a, b in zip(actual, expected))


def run(args, rank, world, device):
    local = args.positions // world
    start = rank * local
    rows, target = make_rows(start, local, device)
    weights = make_weights(device)
    q, k, v = (rows @ weight for weight in weights)
    output, maximum, mass, owners = forward(q, k, v, rank, world)
    loss = 0.5 * (output - target).square().sum() / (args.positions * WIDTH)
    grad_out = (output - target) / (args.positions * WIDTH)
    gradients, own_only = backward(q, k, v, output, maximum, mass, grad_out, rank, world)

    weight_grads = torch.stack([rows.T @ grad for grad in gradients])
    dropped = torch.stack([rows.T @ grad for grad in (gradients[0], *own_only)])
    # A shared projection sees the sum of contributions from all position shards.
    dist.all_reduce(weight_grads)
    dist.all_reduce(dropped)
    dist.all_reduce(loss)

    ref_output, ref_loss, ref_projections, ref_weights = dense_reference(args.positions, device)
    local_slice = slice(start, start + local)
    update = tuple(w - RATE * g for w, g in zip(weights, weight_grads))
    ref_update = tuple(w - RATE * g for w, g in zip(weights, ref_weights))
    errors = {
        "output": (output - ref_output[local_slice]).abs().max().item(),
        "loss": (loss - ref_loss).abs().item(),
        "projection_gradients": maximum_error(gradients, [g[local_slice] for g in ref_projections]),
        "weight_gradients": maximum_error(weight_grads, ref_weights),
        "updated_weights": maximum_error(update, ref_update),
    }
    if not all(math.isfinite(error) and error <= TOLERANCE for error in errors.values()):
        raise AssertionError(f"rank {rank} differs from dense autograd: {errors}")
    dropped_error = maximum_error(dropped[1:], ref_weights[1:])
    if not math.isfinite(dropped_error) or dropped_error <= 1e-6:
        raise AssertionError("dropping remote dK/dV was not rejected")
    return {
        "rank": rank,
        "positions": [start, start + local],
        "visited_owners": owners,
        "forward_rotations": world - 1,
        "backward_rotations": world,
        "returned_owner": (rank - world) % world,
        "output_and_gradient_max_abs_errors": errors,
        "drop_remote_dkv_max_abs_error": dropped_error,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--positions", type=int, default=1024)
    args = parser.parse_args()
    world = int(os.environ["WORLD_SIZE"])
    if world < 2 or not (world <= args.positions <= 4096) or args.positions % world:
        parser.error("use at least 2 processes and a divisible position count up to 4096")
    torch.set_num_threads(1)
    backend = "gloo"
    device = torch.device("cpu")
    if args.device == "cuda":
        local_rank = int(os.environ["LOCAL_RANK"])
        if local_rank >= torch.cuda.device_count() or not dist.is_nccl_available():
            parser.error("each local process needs a visible NVIDIA GPU and NCCL")
        device = torch.device("cuda", local_rank)
        torch.cuda.set_device(device)
        backend = "nccl"

    dist.init_process_group(backend, timeout=timedelta(seconds=90))
    try:
        rank = dist.get_rank()
        row = run(args, rank, world, device)
        if args.device == "cuda":
            row["gpu_name"] = torch.cuda.get_device_name(device)
        reports = [None] * world if rank == 0 else None
        dist.gather_object(row, reports, dst=0)
        if rank == 0:
            print(json.dumps({
                "status": "passed",
                "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "torch": str(torch.__version__),
                "device": args.device,
                "backend": backend,
                "world_size": world,
                "positions": args.positions,
                "width": WIDTH,
                "learning_rate": RATE,
                "tolerance": TOLERANCE,
                "ranks": reports,
            }, indent=2, allow_nan=False))
    finally:
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
