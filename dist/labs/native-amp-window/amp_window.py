"""Trace the actual low-precision gradient before it reaches the FP32 parameter."""

import hashlib
import io
import json
import math
import platform
from pathlib import Path

import torch

TORCH_VERSION = "2.5.1"
TORCH_COMMIT = "a8d6afb511a69687bbb2b7e88a3cf67917e1697e"
INITIAL_SCALE = 32768
GROWTH_INTERVAL = 2
LR = 0.125
BETAS = (0.5, 0.75)
EPS = 1e-8


def scalar(tensor):
    number = tensor.item()
    if math.isfinite(number):
        return number
    if math.isnan(number):
        return "NaN"
    return "Inf" if number > 0 else "-Inf"


def observe(tensor):
    return {"value": scalar(tensor), "dtype": str(tensor.dtype)}


def observe_weight_cast(output, weight, row):
    # The v2.5.1 bias-free scalar Linear graph exposes the FP16 gradient at this edge.
    transpose = output.grad_fn.next_functions[1][0]
    cast = transpose.next_functions[0][0]
    accumulator = cast.next_functions[0][0]
    if cast.name() != "ToCopyBackward0" or accumulator.variable is not weight:
        raise RuntimeError("Expected a weight cast feeding this FP32 parameter")
    row["weight_cast_node"] = cast.name()

    def capture(gradients):
        row["weight_gradient_before_widening"] = observe(gradients[0])

    return cast.register_prehook(capture)


def count_step(calls):
    def hook(*_args):
        calls.append("optimizer.step")

    return hook


def new_training():
    model = torch.nn.Linear(1, 1, bias=False, dtype=torch.float32, device="cpu")
    with torch.no_grad():
        model.weight.fill_(1)
    optimizer = torch.optim.AdamW(model.parameters(), lr=LR, betas=BETAS, eps=EPS,
                                  weight_decay=0, foreach=False, fused=False)
    scaler = torch.amp.GradScaler("cpu", init_scale=INITIAL_SCALE, growth_factor=2.0,
                                  backoff_factor=0.5, growth_interval=GROWTH_INTERVAL)
    return model, optimizer, scaler


def state(model, optimizer, scaler):
    history = optimizer.state.get(model.weight, {})
    return {
        "weight": observe(model.weight),
        "optimizer": {key: observe(value) for key, value in history.items()},
        "scaler": scaler.state_dict(),
    }


def microbatch(model, scaler, x, window_size, use_amp):
    weight = model.weight
    with torch.autocast("cpu", dtype=torch.float16, enabled=use_amp):
        output = model(torch.tensor([[x]], dtype=torch.float32, device="cpu"))
    output.retain_grad()
    loss = output.float().square().mean()
    row = {"x": x, "output": observe(output), "loss": observe(loss)}

    def capture_leaf(gradient):
        row["gradient_at_fp32_parameter"] = observe(gradient)

    cast_hook = observe_weight_cast(output, weight, row) if use_amp else None
    with weight.register_hook(capture_leaf):
        scaler.scale(loss / window_size).backward()
    if cast_hook is not None:
        cast_hook.remove()
    row["output_gradient"] = observe(output.grad)
    row["accumulated_gradient"] = observe(weight.grad)
    return row


def window(training, xs, use_amp=True):
    model, optimizer, scaler = training
    before = state(*training)
    optimizer.zero_grad(set_to_none=True)
    rows = [microbatch(model, scaler, x, len(xs), use_amp) for x in xs]
    scaler.unscale_(optimizer)
    unscaled = observe(model.weight.grad)
    calls = []
    with optimizer.register_step_post_hook(count_step(calls)):
        returned = scaler.step(optimizer)
    scaler.update()
    optimizer.zero_grad(set_to_none=True)
    return {"autocast": use_amp, "before": before, "microbatches": rows,
            "mean_loss": sum(row["loss"]["value"] for row in rows) / len(rows),
            "unscaled_gradient": unscaled, "optimizer_calls": len(calls),
            "scaler_step_returned_none": returned is None, "after": state(*training),
            "cleared_gradient": model.weight.grad is None}


def save(training):
    model, optimizer, scaler = training
    target = io.BytesIO()
    torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                "scaler": scaler.state_dict()}, target)
    return target.getvalue()


def restore(checkpoint_bytes, restore_scaler):
    checkpoint = torch.load(io.BytesIO(checkpoint_bytes), map_location="cpu", weights_only=True)
    model, optimizer, scaler = new_training()
    model.load_state_dict(checkpoint["model"])
    optimizer.load_state_dict(checkpoint["optimizer"])
    if restore_scaler:
        scaler.load_state_dict(checkpoint["scaler"])
    return model, optimizer, scaler


def main():
    if torch.__version__.split("+")[0] != TORCH_VERSION or torch.version.git_version != TORCH_COMMIT:
        raise RuntimeError(f"Expected PyTorch {TORCH_VERSION} at {TORCH_COMMIT}")
    torch.set_num_threads(1)
    training = new_training()
    warmup = window(training, (1, 1))
    overflow = window(training, (1, 2))
    checkpoint = save(training)
    retry = window(training, (1, 2))
    growth = window(training, (1, 2))
    with_scaler = window(restore(checkpoint, restore_scaler=True), (1, 2))
    without_scaler = window(restore(checkpoint, restore_scaler=False), (1, 2))
    fp32_control = window(restore(checkpoint, restore_scaler=False), (1, 2), use_amp=False)
    second_gradient = overflow["microbatches"][1]["weight_gradient_before_widening"]["value"]
    if (second_gradient != "Inf" or overflow["optimizer_calls"] != 0 or
            retry["unscaled_gradient"]["value"] != 4.375 or retry["optimizer_calls"] != 1 or
            with_scaler != retry or without_scaler["optimizer_calls"] != 0 or
            fp32_control["after"]["optimizer"] != retry["after"]["optimizer"]):
        raise RuntimeError("Observed gradients or recovery diverged from the fixed probe")
    source = Path(__file__)
    return {
        "status": "passed",
        "source_sha256": {source.name: hashlib.sha256(source.read_bytes()).hexdigest()},
        "environment": {"device": "cpu", "python": platform.python_version(),
                        "system": platform.system(), "machine": platform.machine(),
                        "torch": torch.__version__, "torch_commit": torch.version.git_version,
                        "threads": torch.get_num_threads()},
        "config": {"initial_scale": INITIAL_SCALE, "growth_interval": GROWTH_INTERVAL,
                   "growth_factor": 2, "backoff_factor": 0.5, "lr": LR,
                   "betas": BETAS, "eps": EPS, "weight_decay": 0, "fused": False,
                   "foreach": False},
        "windows": {"warmup": warmup, "overflow": overflow, "retry": retry, "growth": growth,
                    "with_scaler": with_scaler, "without_scaler": without_scaler,
                    "fp32_control": fp32_control},
    }


if __name__ == "__main__":
    print(json.dumps(main(), indent=2, allow_nan=False))
