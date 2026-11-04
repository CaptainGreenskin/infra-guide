"""Two real CPU/Gloo ranks: compare every optimizer update with a global batch.

PyTorch 2.5.1 was used for the published record. No CUDA, AMP or NCCL is run.
The deliberately wrong policies are counterexamples, not training recipes.
"""
import argparse
from contextlib import nullcontext
import json
from pathlib import Path
import tempfile

import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
import torch.multiprocessing as mp


# Five aligned microbatches on each rank; accumulation=2 leaves one tail batch.
DATA = [
    [([[1, 0], [0, 1], [1, 1]], [1, 0, 1]), ([[0, 2]], [0]),
     ([], []), ([], []), ([], [])],
    [([[2, 0]], [2]), ([[1, 2], [2, 1]], [1, 2]),
     ([], []), ([], []), ([[1, 0], [0, 1], [1, 1]], [1, -0.2, 0.4])],
]
ACCUM = 2
POLICIES = ("global_mean", "micro_means", "fixed_nominal_count")


class CountingSGD(torch.optim.SGD):
    def __init__(self, params):
        super().__init__(params, lr=0.1, momentum=0.9)
        self.step_calls = 0

    def step(self, closure=None):
        self.step_calls += 1
        return super().step(closure)


def model():
    net = torch.nn.Linear(2, 1, bias=True, dtype=torch.float64)
    with torch.no_grad():
        net.weight.copy_(torch.tensor([[0.2, -0.3]], dtype=torch.float64))
        net.bias.fill_(0.1)
    return net


def vectors(net, optimizer):
    return {
        "parameters": torch.cat([p.detach().flatten() for p in net.parameters()]).tolist(),
        "momentum": torch.cat([
            optimizer.state[p].get("momentum_buffer", torch.zeros_like(p)).flatten()
            for p in net.parameters()
        ]).tolist(),
        "actual_updates": optimizer.step_calls,
    }


def gradients(net):
    return torch.cat([p.grad.detach().flatten() for p in net.parameters()]).tolist()


def batch(rank, index):
    x, y = DATA[rank][index]
    return (torch.tensor(x, dtype=torch.float64).reshape(-1, 2),
            torch.tensor(y, dtype=torch.float64).reshape(-1, 1))


def reference():
    """Independent single-process full-window mean, no DDP/no_sync/scaling."""
    net = model()
    optimizer = CountingSGD(net.parameters())
    records = []
    for start in range(0, len(DATA[0]), ACCUM):
        indices = list(range(start, min(start + ACCUM, len(DATA[0]))))
        pairs = [batch(rank, i) for rank in range(2) for i in indices]
        x, y = torch.cat([p[0] for p in pairs]), torch.cat([p[1] for p in pairs])
        optimizer.zero_grad(set_to_none=True)
        record = {"microbatches": len(indices), "global_count": len(y)}
        if len(y):
            ((net(x) - y) ** 2).mean().backward()
            record["gradient_before_clip"] = gradients(net)
            record["norm_before_clip"] = float(torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0))
            record["gradient_after_clip"] = gradients(net)
            optimizer.step()
        record.update(vectors(net, optimizer))
        records.append(record)
    return records


def worker(rank, rendezvous, output):
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=rendezvous, rank=rank, world_size=2)
    results = {}
    try:
        for policy in POLICIES:
            net = DDP(model())
            optimizer = CountingSGD(net.parameters())
            records = []
            for start in range(0, len(DATA[rank]), ACCUM):
                indices = list(range(start, min(start + ACCUM, len(DATA[rank]))))
                # Count the complete actual window BEFORE any backward call.
                count = torch.tensor(sum(len(DATA[rank][i][1]) for i in indices), dtype=torch.int64)
                dist.all_reduce(count, op=dist.ReduceOp.SUM)
                total = int(count)
                optimizer.zero_grad(set_to_none=True)
                record = {"microbatches": len(indices), "global_count": total,
                          "backward_sync": []}
                if total == 0:
                    # Uniform decision on every rank. Momentum must not advance.
                    record["skipped"] = True
                else:
                    for offset, i in enumerate(indices):
                        sync = offset == len(indices) - 1
                        # no_sync must contain BOTH forward and backward.
                        with nullcontext() if sync else net.no_sync():
                            x, y = batch(rank, i)
                            loss_sum = ((net(x) - y) ** 2).sum()
                            if policy == "micro_means":
                                loss = loss_sum / max(len(y), 1) / len(indices)
                            else:
                                denominator = total
                                if policy == "fixed_nominal_count":
                                    # Wrong: tail has fewer microbatches, not missing samples.
                                    denominator *= ACCUM / len(indices)
                                loss = loss_sum * dist.get_world_size() / denominator
                            # Empty rank still has a connected zero loss and participates.
                            loss.backward()
                        record["backward_sync"].append(sync)
                    record["skipped"] = False
                    record["gradient_before_clip"] = gradients(net)
                    record["norm_before_clip"] = float(torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0))
                    record["gradient_after_clip"] = gradients(net)
                    optimizer.step()
                record.update(vectors(net, optimizer))
                records.append(record)
            results[policy] = records
            dist.barrier()
        Path(output, "rank-" + str(rank) + ".json").write_text(json.dumps(results))
    finally:
        dist.destroy_process_group()


def near(left, right):
    return max(abs(a - b) for a, b in zip(left, right)) < 1e-11


def run():
    baseline = reference()
    with tempfile.TemporaryDirectory(prefix="update-windows-") as folder:
        rendezvous = "file://" + str(Path(folder, "rendezvous").absolute())
        mp.spawn(worker, args=(rendezvous, folder), nprocs=2, join=True)
        ranks = [json.loads(Path(folder, "rank-" + str(i) + ".json").read_text()) for i in range(2)]
    for policy in POLICIES:
        for a, b in zip(ranks[0][policy], ranks[1][policy]):
            assert near(a["parameters"], b["parameters"])
            assert near(a["momentum"], b["momentum"])
    correct = ranks[0]["global_mean"]
    for actual, expected in zip(correct, baseline):
        for key in ("parameters", "momentum"):
            assert near(actual[key], expected[key]), (key, actual, expected)
        if actual["global_count"]:
            for key in ("gradient_before_clip", "gradient_after_clip"):
                assert near(actual[key], expected[key])
    assert [r["global_count"] for r in correct] == [7, 0, 3]
    assert [r["actual_updates"] for r in correct] == [1, 1, 2]
    assert [r["backward_sync"] for r in correct] == [[False, True], [], [True]]
    assert correct[0]["parameters"] == correct[1]["parameters"]
    assert correct[0]["momentum"] == correct[1]["momentum"]
    assert correct[0]["norm_before_clip"] > 1 and correct[2]["norm_before_clip"] < 1
    assert not near(ranks[0]["micro_means"][-1]["parameters"], baseline[-1]["parameters"])
    assert near(ranks[0]["fixed_nominal_count"][0]["parameters"], baseline[0]["parameters"])
    assert not near(ranks[0]["fixed_nominal_count"][-1]["parameters"], baseline[-1]["parameters"])

    # Standalone tensor counterexample: clipping is nonlinear (not another DDP run).
    def clip(g):
        return g * torch.clamp(1.0 / (torch.linalg.vector_norm(g) + 1e-6), max=1.0)
    g0, g1 = torch.tensor([6.0, 0.0], dtype=torch.float64), torch.tensor([0.0, 2.0], dtype=torch.float64)
    clip_mean, mean_clips = clip((g0 + g1) / 2), (clip(g0) + clip(g1)) / 2
    assert not near(clip_mean.tolist(), mean_clips.tolist())
    return {"torch": torch.__version__, "backend": "gloo", "device": "cpu",
            "dtype": "float64", "world_size": 2, "nominal_accumulation": ACCUM,
            "attempted_windows": 3, "actual_updates": 2, "empty_windows": 1,
            "single_process": baseline, "ranks": ranks,
            "clipping_counterexample": {"clip_after_mean": clip_mean.tolist(),
                                        "mean_after_local_clip": mean_clips.tolist()},
            "checks": {"each_update_matches_global_batch": True,
                       "empty_window_preserves_momentum": True,
                       "unequal_micro_means_rejected": True,
                       "fixed_tail_denominator_rejected": True}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = run()
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")
