"""Two CPU ranks split a four-position sequence and exchange its K/V blocks."""

from datetime import timedelta
import hashlib
import json
import math
from pathlib import Path

import torch
import torch.distributed as dist


WORLD_SIZE = 2
BLOCK_SIZE = 2
DTYPE = torch.float64
TOLERANCE = dict(atol=1e-12, rtol=0.0)


def fixture(rank):
    q = [[math.sqrt(2), 0], [0, math.sqrt(2)]]
    if rank == 0:
        k = [[0, 0], [math.log(2), math.log(2)]]
        v = [[2, 0], [0, 2]]
    else:
        k = [[math.log(3), 0], [0, math.log(4)]]
        v = [[4, 2], [2, 4]]
    return tuple(torch.tensor(rows, dtype=DTYPE) for rows in (q, k, v))


def exchange_kv(local_k, local_v):
    keys = [torch.empty_like(local_k) for _ in range(WORLD_SIZE)]
    values = [torch.empty_like(local_v) for _ in range(WORLD_SIZE)]
    dist.all_gather(keys, local_k)
    dist.all_gather(values, local_v)
    return list(zip(range(WORLD_SIZE), keys, values))


def block_attention(local_q, query_positions, blocks):
    outputs, traces = [], []
    for query, position in zip(local_q, query_positions):
        state, steps = None, []
        for owner, keys, values in blocks:
            start = owner * BLOCK_SIZE
            key_positions = torch.arange(start, start + BLOCK_SIZE)
            visible = key_positions <= position
            if not visible.any():
                steps.append({"owner": owner, "visible_keys": []})
                continue

            scores = keys[visible] @ query / math.sqrt(query.numel())
            block_max = scores.max()
            block_weights = (scores - block_max).exp()
            block_denominator = block_weights.sum()
            block_weighted_values = block_weights @ values[visible]
            if state is None:
                state = block_max, block_denominator, block_weighted_values
            else:
                old_max, old_denominator, old_weighted_values = state
                new_max = torch.maximum(old_max, block_max)
                old_scale = (old_max - new_max).exp()
                block_scale = (block_max - new_max).exp()
                state = (
                    new_max,
                    old_scale * old_denominator + block_scale * block_denominator,
                    old_scale * old_weighted_values + block_scale * block_weighted_values,
                )

            maximum, denominator, weighted_values = state
            steps.append({
                "owner": owner,
                "visible_keys": key_positions[visible].tolist(),
                "block_max": block_max.item(),
                "block_denominator": block_denominator.item(),
                "block_weighted_values": block_weighted_values.tolist(),
                "merged_max": maximum.item(),
                "merged_denominator": denominator.item(),
                "merged_weighted_values": weighted_values.tolist(),
            })

        if state is None:
            raise ValueError("each query must have at least one visible key")
        _, denominator, weighted_values = state
        outputs.append(weighted_values / denominator)
        traces.append({"query_position": position, "blocks": steps})
    return torch.stack(outputs), traces


def dense_reference():
    # Only rank 0 builds the original full inputs for this independent oracle.
    q, k, v = (torch.cat(parts) for parts in zip(fixture(0), fixture(1)))
    scores = q @ k.T / math.sqrt(q.shape[-1])
    future = torch.ones_like(scores, dtype=torch.bool).triu(diagonal=1)
    return scores.masked_fill(future, -torch.inf).softmax(dim=-1) @ v


def verify(reports):
    expected = dense_reference()
    hand_result = torch.tensor([[2, 0], [2/3, 4/3], [7/3, 5/3], [7/4, 11/4]], dtype=DTYPE)
    torch.testing.assert_close(expected, hand_result, **TOLERANCE)

    actual = torch.tensor([row for report in reports for row in report["output"]], dtype=DTYPE)
    torch.testing.assert_close(actual, expected, **TOLERANCE)

    negatives = {}
    for name in ("local_query_positions", "omit_remote_kv"):
        wrong = torch.tensor([row for report in reports for row in report[name]], dtype=DTYPE)
        # Rank 0 remains correct in both controls. Rank 1 must be rejected.
        torch.testing.assert_close(wrong[:BLOCK_SIZE], expected[:BLOCK_SIZE], **TOLERANCE)
        try:
            torch.testing.assert_close(wrong[BLOCK_SIZE:], expected[BLOCK_SIZE:], **TOLERANCE)
        except AssertionError:
            negatives[name] = {"rejected_rank": 1, "max_abs_error": (wrong - expected).abs().max().item()}
        else:
            raise AssertionError(f"oracle accepted the broken path: {name}")
    return {
        "status": "passed",
        "torch": str(torch.__version__),
        "backend": dist.get_backend(),
        "device": str(actual.device),
        "dtype": str(actual.dtype),
        "world_size": len(reports),
        "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "attention_exchange": "two dist.all_gather calls, one for K and one for V",
        "scope": "single-host CPU/Gloo, single-head causal forward only",
        "tolerance": TOLERANCE,
        "dense_reference": expected.tolist(),
        "hand_result": hand_result.tolist(),
        "max_abs_error": (actual - expected).abs().max().item(),
        "negative_cases": negatives,
        "ranks": reports,
    }


def main():
    torch.set_num_threads(1)
    dist.init_process_group("gloo", timeout=timedelta(seconds=30))
    try:
        if dist.get_world_size() != WORLD_SIZE:
            raise ValueError("launch exactly two ranks")
        rank = dist.get_rank()
        start = rank * BLOCK_SIZE
        positions = list(range(start, start + BLOCK_SIZE))
        q, k, v = fixture(rank)
        blocks = exchange_kv(k, v)
        output, trace = block_attention(q, positions, blocks)
        wrong_positions, _ = block_attention(q, range(BLOCK_SIZE), blocks)
        missing_remote, _ = block_attention(q, positions, [blocks[rank]])

        report = {
            "rank": rank,
            "positions": positions,
            "output": output.tolist(),
            "trace": trace,
            "local_query_positions": wrong_positions.tolist(),
            "omit_remote_kv": missing_remote.tolist(),
        }
        reports = [None] * WORLD_SIZE if rank == 0 else None
        dist.gather_object(report, reports, dst=0)
        if rank == 0:
            print(json.dumps(verify(reports), indent=2, allow_nan=False))
    finally:
        dist.destroy_process_group()


if __name__ == "__main__":
    main()
