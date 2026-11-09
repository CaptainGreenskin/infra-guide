"""Execute a row-wise Triton softmax with the official CPU interpreter."""
import hashlib
import json
import math
import os
import platform
from pathlib import Path

if os.environ.get("TRITON_INTERPRET") != "1":
    raise SystemExit("Set TRITON_INTERPRET=1 before starting Python.")

import numpy as np
import torch
import triton
import triton.language as tl
from triton.runtime.interpreter import InterpretedFunction


@triton.jit
def row_softmax(inputs, outputs, row_logsumexp, width, stride,
                BLOCK: tl.constexpr, PAD: tl.constexpr):
    row = tl.program_id(0)
    col = tl.arange(0, BLOCK)
    valid = col < width
    offset = row * stride + col

    values = tl.load(inputs + offset, mask=valid, other=PAD)
    maximum = tl.max(values, axis=0)
    exponentials = tl.exp(values - maximum)
    normalizer = tl.sum(exponentials, axis=0)

    tl.store(outputs + offset, exponentials / normalizer, mask=valid)
    tl.store(row_logsumexp + row, maximum + tl.log(normalizer))


def oracle(values, block, pad):
    """An independent float64 calculation of the active output and log sum."""
    width = values.shape[1]
    wide = np.pad(values.astype(np.float64), ((0, 0), (0, block - width)),
                  constant_values=pad)
    maximum = np.max(wide, axis=1, keepdims=True)
    exp = np.exp(wide - maximum)
    total = np.sum(exp, axis=1, keepdims=True)
    return (exp / total)[:, :width], (maximum + np.log(total)).ravel()


INPUT_POISON = 123.0
OUTPUT_SENTINEL = -777.0


def launch(inputs, width, block, pad):
    rows, stride = inputs.shape
    outputs = torch.full_like(inputs, OUTPUT_SENTINEL)
    logsumexp = torch.empty(rows, dtype=torch.float32, device="cpu")
    row_softmax[(rows,)](
        inputs, outputs, logsumexp, width, stride, BLOCK=block, PAD=pad,
    )
    active = outputs[:, :width].numpy()
    padding = outputs[:, width:].numpy()
    np.testing.assert_array_equal(padding, OUTPUT_SENTINEL)
    return active, logsumexp.numpy(), padding


def run_case(width):
    block = triton.next_power_of_2(width)
    stride = block + 3
    values = np.asarray([
        -np.arange(1, width + 1) * math.log(2),
        1000 - np.arange(width),
    ], dtype=np.float32)
    inputs = torch.full((len(values), stride), INPUT_POISON, dtype=torch.float32,
                        device="cpu")
    inputs[:, :width] = torch.from_numpy(values)
    original = inputs.clone()

    case = {
        "width": width,
        "block": block,
        "stride": stride,
        "valid_lanes": [i < width for i in range(block)],
        "input_rows": inputs.tolist(),
        "output_padding_sentinel": OUTPUT_SENTINEL,
        "variants": {},
    }
    for name, pad in (("masked_negative_infinity", -math.inf), ("masked_zero", 0.0)):
        active, logsumexp, output_padding = launch(inputs, width, block, pad)
        expected, expected_logsumexp = oracle(values, block, pad)
        np.testing.assert_allclose(active, expected, rtol=2e-6, atol=2e-7)
        np.testing.assert_allclose(logsumexp, expected_logsumexp, rtol=0, atol=8e-5)
        np.testing.assert_array_equal(inputs.numpy(), original.numpy())
        case["variants"][name] = {
            "active_output": active.tolist(),
            "active_sum": active.astype(np.float64).sum(axis=1).tolist(),
            "logsumexp": logsumexp.tolist(),
            "output_padding": output_padding.tolist(),
        }

    correct = case["variants"]["masked_negative_infinity"]
    wrong = case["variants"]["masked_zero"]
    np.testing.assert_allclose(correct["active_sum"], 1, rtol=0, atol=2e-6)
    if width == block:
        assert correct == wrong
    else:
        assert wrong["active_sum"][0] < 0.5
    if width == 5:
        np.testing.assert_allclose(
            [correct["active_output"][0][0], wrong["active_output"][0][0],
             wrong["active_sum"][0]], [16 / 31, 16 / 127, 31 / 127],
            rtol=2e-6, atol=0,
        )
    return case


def main():
    assert isinstance(row_softmax, InterpretedFunction)
    lab = Path(__file__).resolve().parent
    record = {
        "schema": "triton-tail-mask-v1",
        "environment": {
            "python": platform.python_version(),
            "system": platform.system(),
            "machine": platform.machine(),
            "triton": triton.__version__,
            "torch": torch.__version__,
            "numpy": np.__version__,
            "triton_interpret": os.environ["TRITON_INTERPRET"],
            "tensor_device": str(torch.empty(0, device="cpu").device),
            "kernel_executor": type(row_softmax).__name__,
        },
        "source_sha256": {
            name: hashlib.sha256((lab / name).read_bytes()).hexdigest()
            for name in ("triton_tail_mask.py", "requirements-linux.txt")
        },
        "cases": [run_case(width) for width in (5, 8, 33)],
    }
    print(json.dumps(record, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
