"""Differentiate one fixed expert-parallel forward on two CPU/Gloo ranks."""

from datetime import timedelta
from hashlib import sha256
import json
from pathlib import Path
import platform

import torch
import torch.distributed as dist
from torch import nn
from torch.distributed.nn.functional import all_to_all_single


TOKENS_PER_RANK = 3
EXPERT_BY_TOKEN = [1, 0, 0, 0, 1, 0]
INPUTS = [[1, 2], [2, 1], [3, -1], [-1, 2], [2, -2], [1, 3]]
TARGETS = [[-2, -1], [-1, 0], [0, 1], [1, -1], [2, 0], [3, 1]]
WEIGHTS = [[[2, -1], [1, 1]], [[-1, 1], [2, 1]]]


def exchange_rows(rows, receive_splits, send_splits):
    output = rows.new_empty((sum(receive_splits), *rows.shape[1:]))
    return all_to_all_single(output, rows.contiguous(), receive_splits, send_splits)


def gradients(output, target, x, weight, *, retain_graph):
    loss = 0.5 * (output - target).square().sum()
    dx, dw = torch.autograd.grad(loss, (x, weight), retain_graph=retain_graph)
    return {
        "outputs": output.tolist(),
        "input_grads": dx.tolist(),
        "expert_weight_grad": dw.tolist(),
        "loss": loss.item(),
    }


def run_rank(rank):
    start = rank * TOKENS_PER_RANK
    local = slice(start, start + TOKENS_PER_RANK)
    token_ids = torch.arange(local.start, local.stop)
    owners = torch.tensor(EXPERT_BY_TOKEN[local])
    x = torch.tensor(INPUTS[local], dtype=torch.float64, requires_grad=True)
    target = x.new_tensor(TARGETS[local])
    expert = nn.Linear(2, 2, bias=False, dtype=torch.float64)
    with torch.no_grad():
        expert.weight.copy_(x.new_tensor(WEIGHTS[rank]))

    # Each source tells each destination how many rows it will send.
    send_counts = owners.bincount(minlength=2)
    receive_counts = torch.empty_like(send_counts)
    dist.all_to_all_single(receive_counts, send_counts)
    send_splits, receive_splits = send_counts.tolist(), receive_counts.tolist()

    # Group by destination expert, keeping order within each group.
    pack_order = owners.argsort(stable=True)
    sent_ids = token_ids[pack_order]
    expert_ids = exchange_rows(sent_ids, receive_splits, send_splits)
    expert_inputs = exchange_rows(x[pack_order], receive_splits, send_splits)
    expert_outputs = expert(expert_inputs)

    # Reverse the split roles to send results back to their sources.
    returned_ids = exchange_rows(expert_ids, send_splits, receive_splits)
    returned = exchange_rows(expert_outputs, send_splits, receive_splits)
    restore_order = pack_order.argsort()
    restored_ids = returned_ids[restore_order]
    assert torch.equal(returned_ids, sent_ids)
    assert torch.equal(restored_ids, token_ids)

    output = returned[restore_order]
    assert output.shape == returned.shape == target.shape
    correct = gradients(output, target, x, expert.weight, retain_graph=True)
    # Same messages and shape, but targets now pair with the wrong tokens.
    wrong = gradients(returned, target, x, expert.weight, retain_graph=False)
    return {
        "rank": rank,
        "local_expert": rank,
        "local_parameters": {
            name: list(parameter.shape) for name, parameter in expert.named_parameters()
        },
        "local_parameter_elements": sum(parameter.numel() for parameter in expert.parameters()),
        "source_token_ids": token_ids.tolist(),
        "dispatch_send_splits": send_splits,
        "dispatch_receive_splits": receive_splits,
        "sent_token_ids": sent_ids.tolist(),
        "expert_token_ids": expert_ids.tolist(),
        "returned_token_ids": returned_ids.tolist(),
        "restored_token_ids": restored_ids.tolist(),
        "output_shape": list(output.shape),
        "correct": correct,
        "wrong_order": wrong,
    }


def dense_reference():
    """Serial arithmetic from token IDs, without packing or autograd."""
    outputs, input_grads = [], []
    weight_grads = [[[0, 0], [0, 0]] for _ in WEIGHTS]
    loss = 0.0
    for x, target, owner in zip(INPUTS, TARGETS, EXPERT_BY_TOKEN):
        weight = WEIGHTS[owner]
        y = [sum(a * b for a, b in zip(row, x)) for row in weight]
        dy = [value - label for value, label in zip(y, target)]
        outputs.append(y)
        loss += 0.5 * sum(value * value for value in dy)
        input_grads.append([sum(g * w for g, w in zip(dy, column)) for column in zip(*weight)])
        for row, g in enumerate(dy):
            for col, value in enumerate(x):
                weight_grads[owner][row][col] += g * value
    return {
        "outputs": outputs,
        "input_grads": input_grads,
        "expert_weight_grads": weight_grads,
        "loss": loss,
    }


def compare(ranks, reference, case):
    records = [rank[case] for rank in ranks]
    values = {
        "outputs": records[0]["outputs"] + records[1]["outputs"],
        "input_grads": records[0]["input_grads"] + records[1]["input_grads"],
        "expert_weight_grads": [record["expert_weight_grad"] for record in records],
        "loss": sum(record["loss"] for record in records),
    }
    errors = {}
    for key, value in values.items():
        actual = torch.tensor(value, dtype=torch.float64)
        expected = torch.tensor(reference[key], dtype=torch.float64)
        errors[key] = (actual - expected).abs().max().item()
    return errors


def main():
    torch.set_num_threads(1)
    dist.init_process_group("gloo", timeout=timedelta(seconds=20))
    try:
        if dist.get_world_size() != 2:
            raise ValueError("Start exactly two ranks with torchrun.")
        rank = dist.get_rank()
        backend = dist.get_backend()
        records = [None, None] if rank == 0 else None
        dist.gather_object(run_rank(rank), records, dst=0)
    finally:
        dist.destroy_process_group()

    if rank == 0:
        reference = dense_reference()
        correct = compare(records, reference, "correct")
        wrong = compare(records, reference, "wrong_order")
        assert all(error == 0 for error in correct.values()), correct
        assert all(error > 0 for error in wrong.values()), wrong
        assert [row["expert_token_ids"] for row in records] == [[1, 2, 3, 5], [0, 4]]
        source = Path(__file__)
        print(json.dumps({
            "status": "passed",
            "source_sha256": {source.name: sha256(source.read_bytes()).hexdigest()},
            "environment": {
                "python": platform.python_version(), "torch": str(torch.__version__),
                "backend": backend, "device": "cpu", "dtype": "float64", "world_size": 2,
            },
            "fixture": {
                "expert_by_token": EXPERT_BY_TOKEN, "inputs": INPUTS,
                "targets": TARGETS, "expert_weights": WEIGHTS,
                "objective": "0.5 * sum((output - target)**2) over all tokens and features",
            },
            "ranks": records,
            "dense_reference": reference,
            "correct_max_abs_error": correct,
            "wrong_order_max_abs_error": wrong,
        }, indent=2))


if __name__ == "__main__":
    main()
