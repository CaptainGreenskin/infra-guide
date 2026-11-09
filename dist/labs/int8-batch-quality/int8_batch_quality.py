"""Measure a CPU dynamic INT8 operator only after its classification gate."""
import argparse
import hashlib
import json
import math
import platform
import statistics
import time
from pathlib import Path

import torch
from torch import nn

WIDTH = 256
WARMUP_CALLS = 80
SAMPLE_PAIRS = 12
CALLS_PER_SAMPLE = 400
ROWS = {"target": (1, 0), "regular": (0, 8), "outlier": (0, 1024)}


def fixture_rows(names):
    result = torch.zeros((len(names), WIDTH), dtype=torch.float32)
    for index, name in enumerate(names):
        result[index, :2] = torch.tensor(ROWS[name], dtype=torch.float32)
    return result


def score_record(scores, expected):
    assert scores.dtype == torch.float32
    assert tuple(scores.shape) == (len(expected), WIDTH)
    assert torch.isfinite(scores).all()
    labels = scores.argmax(dim=1).tolist()
    return {
        "scores_0_to_2": scores[:, :3].tolist(),
        "other_columns_abs_max": scores[:, 3:].abs().max().item(),
        "labels": labels,
        "correct": sum(actual == want for actual, want in zip(labels, expected)),
        "passed": labels == expected,
    }


def probe(fp32, int8, names, execution):
    inputs = fixture_rows(names)
    # By construction only W[1,0] and W[2,1] are one.
    expected = [1 if ROWS[name][0] > ROWS[name][1] else 2 for name in names]
    chunks = inputs.split(1) if execution == "split" else (inputs,)
    result = {
        "rows": list(names),
        "execution": execution,
        "forward_batch_sizes": [len(chunk) for chunk in chunks],
        "expected_labels": expected,
    }
    for label, model in (("fp32", fp32), ("int8", int8)):
        scores = torch.cat([model(chunk) for chunk in chunks], dim=0)
        result[label] = score_record(scores, expected)
    return result


def elapsed_ns(model, inputs):
    started = time.perf_counter_ns()
    for _ in range(CALLS_PER_SAMPLE):
        model(inputs)
    return time.perf_counter_ns() - started


def timing_summary(samples, label):
    duration = sorted(row["duration_ns"][label] for row in samples)
    p90 = duration[math.ceil(len(duration) * 0.9) - 1]
    to_microseconds = CALLS_PER_SAMPLE * 1000
    return {
        "p50_us_per_call": round(statistics.median(duration) / to_microseconds, 6),
        "p90_us_per_call": round(p90 / to_microseconds, 6),
    }


def timed_comparison(fp32, int8, case):
    if not case["fp32"]["passed"] or not case["int8"]["passed"]:
        return None
    assert case["execution"] == "together"
    inputs = fixture_rows(case["rows"])
    models = {"fp32": fp32, "int8": int8}
    for _ in range(WARMUP_CALLS):
        for model in models.values():
            model(inputs)

    samples = []
    for index in range(SAMPLE_PAIRS):
        order = list(models) if index % 2 == 0 else list(reversed(models))
        duration = {name: elapsed_ns(models[name], inputs) for name in order}
        assert all(value > 0 for value in duration.values())
        samples.append({"order": order, "duration_ns": duration})
    return {
        "input_shape": list(inputs.shape),
        "warmup_calls_per_engine": WARMUP_CALLS,
        "calls_per_sample": CALLS_PER_SAMPLE,
        "samples": samples,
        "summary": {name: timing_summary(samples, name) for name in models},
    }


def record_experiment():
    assert torch.__version__.split("+")[0] == "2.5.1"
    assert "qnnpack" in torch.backends.quantized.supported_engines
    torch.backends.quantized.engine = "qnnpack"
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)

    fp32 = nn.Sequential(nn.Linear(WIDTH, WIDTH, bias=False)).eval()
    with torch.no_grad():
        fp32[0].weight.zero_()
        fp32[0].weight[1, 0] = 1
        fp32[0].weight[2, 1] = 1
    int8 = torch.ao.quantization.quantize_dynamic(fp32, {nn.Linear}, dtype=torch.qint8)
    packed = int8[0].weight()
    assert packed.dtype == torch.qint8
    assert tuple(packed.shape) == (WIDTH, WIDTH)

    with torch.inference_mode():
        cases = {
            "singleton": probe(fp32, int8, ("target",), "together"),
            "regular_batch": probe(fp32, int8, ("target", "regular"), "together"),
            "outlier_batch": probe(fp32, int8, ("target", "outlier"), "together"),
            "outlier_split": probe(fp32, int8, ("target", "outlier"), "split"),
        }
        assert all(case["fp32"]["passed"] for case in cases.values())
        assert [case["int8"]["passed"] for case in cases.values()] == [True, True, False, True]
        assert cases["outlier_batch"]["int8"]["scores_0_to_2"][0] == [0, 0, 0]
        assert cases["outlier_batch"]["int8"]["other_columns_abs_max"] == 0

        inputs = fixture_rows(("target", "regular"))
        with torch.profiler.profile(activities=[torch.profiler.ProfilerActivity.CPU]) as profile:
            int8(inputs)
        operators = sorted(event.key for event in profile.key_averages())
        assert {"quantized::linear_dynamic", "aten::quantize_per_tensor"} <= set(operators)

        timings = {
            name: timed_comparison(fp32, int8, cases[name])
            for name in ("singleton", "regular_batch", "outlier_batch")
        }
        assert timings["outlier_batch"] is None

    directory = Path(__file__).resolve().parent
    return {
        "status": "passed",
        "environment": {
            "system": platform.system(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "torch": torch.__version__,
            "backend": torch.backends.quantized.engine,
            "intraop_threads": torch.get_num_threads(),
            "interop_threads": torch.get_num_interop_threads(),
        },
        "source_sha256": {
            name: hashlib.sha256((directory / name).read_bytes()).hexdigest()
            for name in ("int8_batch_quality.py", "requirements.txt")
        },
        "fixture": {
            "shape": [WIDTH, WIDTH],
            "nonzero_weights": [[1, 0, 1], [2, 1, 1]],
            "first_two_input_features": ROWS,
            "remaining_input_features": "all zero",
        },
        "weights": {
            "float_dtype": str(fp32[0].weight.dtype),
            "quantized_dtype": str(packed.dtype),
            "quantized_scale": packed.q_scale(),
            "quantized_zero_point": packed.q_zero_point(),
        },
        "profile": {"case": "regular_batch", "operators": operators},
        "cases": cases,
        "timings": timings,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    record = json.dumps(record_experiment(), ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(record, encoding="utf-8")
    else:
        print(record, end="")


if __name__ == "__main__":
    main()
