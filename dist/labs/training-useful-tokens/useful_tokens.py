"""Measure the same token-classifier update with and without padded rows."""
import argparse
import hashlib
import json
import math
import platform
from contextlib import nullcontext
from pathlib import Path
from statistics import median
from time import perf_counter_ns

import torch
from torch import nn
from torch.nn import functional as F
from torch.profiler import ProfilerActivity, profile, record_function


LENGTHS = [128, 96, 64, 32, 16, 8, 4, 4]
BATCH, WIDTH, FEATURES, CLASSES = 8, 128, 32, 4
LEARNING_RATE = 0.125
WARMUP, SAMPLES, STEPS_PER_SAMPLE = 24, 12, 24
MODES = ("padded", "packed")
PHASES = ("prepare", "forward_loss", "backward", "optimizer")


def fixture():
    slots = torch.arange(BATCH * WIDTH).reshape(BATCH, WIDTH)
    features = ((slots[..., None] + torch.arange(FEATURES)) % 17 - 8).float() / 8
    labels = slots % CLASSES
    keep = torch.arange(WIDTH) < torch.tensor(LENGTHS)[:, None]
    return features, labels.masked_fill(~keep, -100), int(keep.sum())


def setup():
    model = nn.Linear(FEATURES, CLASSES, bias=False)
    with torch.no_grad():
        values = (torch.arange(CLASSES * FEATURES) % 11 - 5).float() / 32
        model.weight.copy_(values.reshape(CLASSES, FEATURES))
    return model, torch.optim.SGD(model.parameters(), lr=LEARNING_RATE)


def update(mode, model, optimizer, batch, *, wrong_denominator=False, trace=False):
    features, labels, useful = batch
    region = (lambda phase: record_function(f"{mode}.{phase}")) if trace else (lambda _: nullcontext())
    with region("prepare"):
        optimizer.zero_grad(set_to_none=True)
        if mode == "packed":
            keep = labels != -100
            features, labels = features[keep], labels[keep]
    with region("forward_loss"):
        scores = model(features).reshape(-1, CLASSES)
        # ignore_index removes the padded targets from the numerator.
        loss_sum = F.cross_entropy(scores, labels.reshape(-1), ignore_index=-100, reduction="sum")
        denominator = BATCH * WIDTH if wrong_denominator else useful
        loss = loss_sum / denominator
    with region("backward"):
        loss.backward()
    with region("optimizer"):
        optimizer.step()
    return scores.shape[0], denominator, loss_sum, loss


def one_update(mode, batch, *, wrong_denominator=False):
    model, optimizer = setup()
    before = model.weight.detach().clone()
    rows, denominator, loss_sum, loss = update(mode, model, optimizer, batch,
                                                wrong_denominator=wrong_denominator)
    gradient = model.weight.grad.detach().clone()
    after = model.weight.detach().clone()
    assert torch.count_nonzero(after - before) > 0
    torch.testing.assert_close(after, before - LEARNING_RATE * gradient)
    record = {
        "forward_rows": rows, "denominator": denominator, "loss_sum": loss_sum.item(),
        "mean_loss": loss.item(), "gradient_0_0": gradient[0, 0].item(),
        "weight_0_0_after": after[0, 0].item(),
    }
    return record, gradient, after


def collect_profile(mode, batch, trace_dir):
    model, optimizer = setup()
    with profile(activities=[ProfilerActivity.CPU], record_shapes=True) as prof:
        update(mode, model, optimizer, batch, trace=True)
    phases = []
    for event in prof.events():
        if event.name.startswith(mode + "."):
            phases.append({"name": event.name.split(".")[1],
                           "start_us": event.time_range.start,
                           "end_us": event.time_range.end})
    assert [event["name"] for event in phases] == list(PHASES)
    operators = {event.name for event in prof.events()}
    for name in ("aten::linear", "aten::cross_entropy_loss", "aten::mm",
                 "Optimizer.step#SGD.step"):
        assert name in operators
    if trace_dir:
        trace_dir.mkdir(parents=True, exist_ok=True)
        prof.export_chrome_trace(str(trace_dir / f"{mode}.json"))
    return {"phases": phases, "operators": sorted(operators)}


def measure(batch):
    for mode in MODES:
        model, optimizer = setup()
        for _ in range(WARMUP):
            update(mode, model, optimizer, batch)
    samples = []
    for index in range(SAMPLES):
        order = MODES if index % 2 == 0 else MODES[::-1]
        durations = {}
        for mode in order:
            model, optimizer = setup()
            start = perf_counter_ns()
            for _ in range(STEPS_PER_SAMPLE):
                update(mode, model, optimizer, batch)
            durations[mode] = perf_counter_ns() - start
        samples.append({"order": list(order), "duration_ns": durations})
    summary = {}
    for mode in MODES:
        per_step = sorted(s["duration_ns"][mode] / STEPS_PER_SAMPLE for s in samples)
        p50 = median(per_step)
        p90 = per_step[math.ceil(0.9 * len(per_step)) - 1]
        summary[mode] = {
            "p50_us_per_update": p50 / 1000, "p90_us_per_update": p90 / 1000,
            "useful_tokens_per_s_at_p50": batch[2] * 1e9 / p50,
        }
    return {"warmup_updates_per_mode": WARMUP, "updates_per_sample": STEPS_PER_SAMPLE,
            "samples": samples, "summary": summary}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace-dir", type=Path, help="write two optional Chrome trace files")
    args = parser.parse_args()
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    batch = fixture()
    padded, padded_grad, padded_after = one_update("padded", batch)
    packed, packed_grad, packed_after = one_update("packed", batch)
    wrong, wrong_grad, wrong_after = one_update("padded", batch, wrong_denominator=True)
    torch.testing.assert_close(padded_grad, packed_grad, rtol=1e-5, atol=1e-7)
    torch.testing.assert_close(padded_after, packed_after, rtol=1e-5, atol=1e-7)
    fraction = batch[2] / (BATCH * WIDTH)
    torch.testing.assert_close(wrong_grad, padded_grad * fraction, rtol=1e-5, atol=1e-7)
    assert not torch.allclose(padded_after, wrong_after)
    timings = measure(batch)
    profiles = {mode: collect_profile(mode, batch, args.trace_dir) for mode in MODES}
    path = Path(__file__).resolve()
    source_hashes = {item.name: hashlib.sha256(item.read_bytes()).hexdigest()
                     for item in (path, path.with_name("requirements.txt"))}
    print(json.dumps({
        "status": "passed", "source_sha256": source_hashes,
        "environment": {"python": platform.python_version(), "torch": torch.__version__,
                        "system": platform.system(), "machine": platform.machine(), "device": "cpu",
                        "dtype": str(batch[0].dtype), "threads": torch.get_num_threads(),
                        "interop_threads": torch.get_num_interop_threads()},
        "fixture": {"lengths": LENGTHS, "shape": [BATCH, WIDTH, FEATURES], "classes": CLASSES,
                    "useful_tokens": batch[2], "padded_tokens": BATCH * WIDTH - batch[2],
                    "learning_rate": LEARNING_RATE},
        "cases": {"padded": padded, "packed": packed, "wrong_denominator": wrong},
        "comparison": {"gradient_max_abs_diff": (padded_grad - packed_grad).abs().max().item(),
                       "weight_max_abs_diff": (padded_after - packed_after).abs().max().item(),
                       "wrong_weight_max_abs_diff": (padded_after - wrong_after).abs().max().item()},
        "timings": timings, "profiles": profiles,
    }, indent=2))


if __name__ == "__main__":
    main()
