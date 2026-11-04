"""Actual CPU parameter, gradient and lazy AdamW state payloads; not a GPU allocator measurement."""
from contextlib import nullcontext
import json

import torch
from torch import nn


def payload(tensors):
    items = list(tensors)
    return {"elements": sum(t.numel() for t in items),
            "bytes": sum(t.numel() * t.element_size() for t in items),
            "dtypes": sorted({str(t.dtype) for t in items})}


def inventory(model, optimizer):
    parameters = payload(model.parameters())
    gradients = payload(p.grad for p in model.parameters() if p.grad is not None)
    moments, steps, keys = [], [], set()
    for state in optimizer.state.values():
        keys.update(state)
        for name, value in state.items():
            if torch.is_tensor(value):
                (steps if name == "step" else moments).append(value)
    result = {"parameters": parameters, "gradients": gradients,
              "moments": payload(moments), "step_scalars": payload(steps),
              "optimizer_state_keys": sorted(keys)}
    result["total_retained_payload_bytes"] = sum(result[k]["bytes"] for k in
                                                ["parameters", "gradients", "moments", "step_scalars"])
    return result


def run(mode):
    torch.manual_seed(17)
    model = nn.Sequential(nn.Linear(4, 8), nn.ReLU(), nn.Linear(8, 2))
    if mode == "bf16_parameters":
        model = model.to(dtype=torch.bfloat16)
    dtype = next(model.parameters()).dtype
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, foreach=False)
    x = torch.randn(5, 4).to(dtype=dtype)
    target = torch.randn(5, 2)
    stages = {"created": inventory(model, optimizer)}
    forward_dtype = None
    for number in [1, 2]:
        context = torch.autocast("cpu", dtype=torch.bfloat16) if mode == "fp32_autocast_bf16" else nullcontext()
        with context:
            prediction = model(x)
            forward_dtype = str(prediction.dtype)
            loss = (prediction.float() - target).square().mean()
        assert torch.isfinite(loss)
        loss.backward()
        if number == 1:
            stages["after_backward"] = inventory(model, optimizer)
        optimizer.step()
        stages["after_first_step" if number == 1 else "after_second_step"] = inventory(model, optimizer)
        optimizer.zero_grad(set_to_none=True)
        if number == 1:
            stages["after_zero_grad_none"] = inventory(model, optimizer)
    p = sum(t.numel() for t in model.parameters())
    tensors = len(list(model.parameters()))
    size = next(model.parameters()).element_size()
    expected = 4 * p * size + 4 * tensors
    assert p == 58 and tensors == 4
    assert stages["created"]["moments"]["bytes"] == 0
    assert stages["after_backward"]["moments"]["bytes"] == 0
    assert stages["after_first_step"]["total_retained_payload_bytes"] == expected
    assert stages["after_second_step"]["total_retained_payload_bytes"] == expected
    assert stages["after_zero_grad_none"]["gradients"]["bytes"] == 0
    assert stages["after_first_step"]["optimizer_state_keys"] == ["exp_avg", "exp_avg_sq", "step"]
    return {"mode": mode, "parameters": p, "parameter_tensors": tensors,
            "forward_output_dtype": forward_dtype, "stages": stages}


def main():
    torch.set_num_threads(1)
    modes = {mode: run(mode) for mode in ["fp32", "fp32_autocast_bf16", "bf16_parameters"]}
    assert modes["fp32_autocast_bf16"]["forward_output_dtype"] == "torch.bfloat16"
    for key in ["fp32", "fp32_autocast_bf16"]:
        assert modes[key]["stages"]["after_first_step"]["total_retained_payload_bytes"] == 944
        assert modes[key]["stages"]["after_first_step"]["parameters"]["dtypes"] == ["torch.float32"]
    assert modes["bf16_parameters"]["stages"]["after_first_step"]["total_retained_payload_bytes"] == 480
    base = torch.arange(8, dtype=torch.float32)
    left, right = base[:6], base[2:]
    storage = {t.untyped_storage().data_ptr(): t.untyped_storage().nbytes() for t in [left, right]}
    alias = {"view_element_bytes_sum": sum(t.numel() * t.element_size() for t in [left, right]),
             "unique_underlying_storage_payload_bytes": sum(storage.values()),
             "same_storage": left.untyped_storage().data_ptr() == right.untyped_storage().data_ptr()}
    assert alias == {"view_element_bytes_sum": 48, "unique_underlying_storage_payload_bytes": 32,
                     "same_storage": True}
    print(json.dumps({"torch": torch.__version__, "device": "cpu", "modes": modes, "alias_example": alias,
                      "scope": "actual_retained_tensor_payloads_not_cuda_peak_reserved_rss_or_training_quality",
                      "note": "The direct BF16-parameter case illustrates state dtype; it is not a stability recommendation."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

