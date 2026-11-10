"""Compare one four-rank GQA replica with two independent two-rank replicas."""

import json
import math
import os
import platform
import socket
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch.nn.functional import scaled_dot_product_attention


WORLD_SIZE = 4
KV_HEADS = 4
QUERIES_PER_KV_HEAD = 2
HEAD_DIM = 2
WIDTH = 6
ATOL = 1e-12
REQUESTS = {"A1": (3, 1), "B1": (5, 7), "A2": (4, 13)}
TP2_LAYOUT = [([0, 1], ["A1", "A2"]), ([2, 3], ["B1"])]


def hidden_states(request):
    positions, seed = REQUESTS[request]
    values = torch.arange(positions * WIDTH, dtype=torch.float64)
    return (((values * 7 + seed) % 29 - 14) / 16).reshape(positions, WIDTH)


def head_weights(heads, seed):
    """Generate only the weight slice owned by the specified heads."""
    within_head = torch.arange(WIDTH * HEAD_DIM).reshape(WIDTH, HEAD_DIM)
    indices = torch.tensor(heads)[:, None, None] * WIDTH * HEAD_DIM + within_head
    return (((indices * 5 + seed) % 31 - 15) / 16).to(torch.float64)


def project(hidden, weights):
    return torch.einsum("pd,hdk->hpk", hidden, weights)


def dense_reference(request):
    hidden = hidden_states(request)
    kv_heads = list(range(KV_HEADS))
    query_heads = list(range(KV_HEADS * QUERIES_PER_KV_HEAD))
    q = project(hidden[-1:], head_weights(query_heads, 3))
    k = project(hidden, head_weights(kv_heads, 11)).repeat_interleave(2, dim=0)
    v = project(hidden, head_weights(kv_heads, 19)).repeat_interleave(2, dim=0)
    scores = (q @ k.transpose(-1, -2)) / math.sqrt(HEAD_DIM)
    context = scores.softmax(dim=-1) @ v
    output_rows = head_weights(query_heads, 23).transpose(1, 2).reshape(-1, WIDTH)
    return context.transpose(0, 1).reshape(1, -1) @ output_rows


def run_replica(rank, ranks, requests, group):
    heads_per_rank = KV_HEADS // len(ranks)
    first_kv = ranks.index(rank) * heads_per_rank
    kv_heads = list(range(first_kv, first_kv + heads_per_rank))
    query_heads = list(range(kv_heads[0] * QUERIES_PER_KV_HEAD,
                             (kv_heads[-1] + 1) * QUERIES_PER_KV_HEAD))
    w_q, w_k, w_v, w_o = (head_weights(heads, seed) for heads, seed in
                          [(query_heads, 3), (kv_heads, 11), (kv_heads, 19),
                           (query_heads, 23)])
    calls = []
    for request in requests:
        hidden = hidden_states(request)
        history, current = hidden[:-1], hidden[-1:]
        q = project(current, w_q)
        k = torch.cat([project(history, w_k), project(current, w_k)], dim=1)
        v = torch.cat([project(history, w_v), project(current, w_v)], dim=1)
        # One query at the last position can read the full history and itself.
        context = scaled_dot_product_attention(
            q, k.repeat_interleave(QUERIES_PER_KV_HEAD, dim=0),
            v.repeat_interleave(QUERIES_PER_KV_HEAD, dim=0),
        )
        partial = torch.einsum("hpk,hdk->pd", context, w_o)
        dist.all_reduce(partial, op=dist.ReduceOp.SUM, group=group)
        calls.append({"request": request, "kv_shape_each": list(k.shape),
                      "output": partial.tolist()})
    return {"rank": rank, "kv_heads": kv_heads, "query_heads": query_heads,
            "calls": calls}


def worker(rank, directory):
    torch.set_num_threads(1)
    directory = Path(directory)
    store = dist.FileStore(str(directory / "gloo-store"), WORLD_SIZE)
    timeout = timedelta(seconds=30)
    dist.init_process_group("gloo", store=store, rank=rank,
                            world_size=WORLD_SIZE, timeout=timeout)
    try:
        tp4 = run_replica(rank, list(range(WORLD_SIZE)), REQUESTS, dist.group.WORLD)
        # All four ranks must create subgroups in the same order.
        groups = [dist.new_group(ranks, timeout=timeout) for ranks, _ in TP2_LAYOUT]
        for (ranks, requests), group in zip(TP2_LAYOUT, groups):
            if rank in ranks:
                tp2 = run_replica(rank, ranks, requests, group)
                break
        (directory / f"rank-{rank}.json").write_text(json.dumps([tp4, tp2]))
    finally:
        dist.destroy_process_group()


def verify(results, layout, expected):
    max_error = 0.0
    for ranks, requests in layout:
        rank_results = [results[rank] for rank in ranks]
        assert [head for result in rank_results for head in result["kv_heads"]] == list(range(KV_HEADS))
        for result in rank_results:
            assert [call["request"] for call in result["calls"]] == list(requests)
            for call in result["calls"]:
                request = call["request"]
                assert call["kv_shape_each"] == [KV_HEADS // len(ranks), REQUESTS[request][0], HEAD_DIM]
                actual = torch.tensor(call["output"], dtype=torch.float64)
                torch.testing.assert_close(actual, expected[request], rtol=0, atol=ATOL)
                max_error = max(max_error, (actual - expected[request]).abs().max().item())
    return max_error


def main():
    torch.set_num_threads(1)
    # Keep Gloo traffic on the machine running this lab, including group traffic.
    interfaces = {name for _, name in socket.if_nameindex()}
    os.environ["GLOO_SOCKET_IFNAME"] = "lo0" if "lo0" in interfaces else "lo"
    with TemporaryDirectory() as directory:
        mp.spawn(worker, args=(directory,), nprocs=WORLD_SIZE, join=True)
        records = [json.loads((Path(directory) / f"rank-{rank}.json").read_text())
                   for rank in range(WORLD_SIZE)]
    tp4, tp2 = map(list, zip(*records))
    expected = {request: dense_reference(request) for request in REQUESTS}
    # Distinct simultaneous requests would expose a world-wide reduction in TP2.
    assert not torch.allclose(expected["A1"], expected["B1"], rtol=0, atol=ATOL)
    layouts = [[(list(range(WORLD_SIZE)), list(REQUESTS))], TP2_LAYOUT]
    cases = {}
    for name, layout, results in zip(("one_tp4", "two_tp2"), layouts, (tp4, tp2)):
        cases[name] = {"groups": [{"ranks": ranks, "requests": requests}
                                  for ranks, requests in layout],
                       "ranks": results,
                       "max_abs_error": verify(results, layout, expected)}
    print(json.dumps({"backend": "gloo", "device": "cpu", "world_size": WORLD_SIZE,
                      "python": platform.python_version(), "torch": str(torch.__version__),
                      "atol": ATOL, "cases": cases}, indent=2))


if __name__ == "__main__":
    main()
