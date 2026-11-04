"""Two CPU GradScaler windows for the site's default (non-fused) AdamW path."""
from hashlib import sha256
import json
import platform
from pathlib import Path

import torch


def main():
    parameter = torch.nn.Parameter(torch.tensor(1.0, device="cpu", dtype=torch.float32))
    optimizer = torch.optim.AdamW([parameter], lr=0.125, weight_decay=0.0, fused=False)
    scaler = torch.amp.GradScaler("cpu", init_scale=8.0, growth_interval=20)
    post_steps = 0

    def record_step(_optimizer, _args, _kwargs):
        nonlocal post_steps
        post_steps += 1

    def progress():
        state = optimizer.state.get(parameter, {})
        adam_step = int(state["step"].item()) if "step" in state else 0
        return dict(parameter=parameter.item(), adam_step=adam_step,
                    post_steps=post_steps, scale=scaler.get_scale())

    assert torch.__version__.split("+")[0] == "2.5.1"
    assert scaler.is_enabled()
    hook = optimizer.register_step_post_hook(record_step)
    windows = []
    try:
        for label, multiplier in [("finite", 2.0), ("infinite", float("inf"))]:
            optimizer.zero_grad(set_to_none=True)
            before = progress()
            scaler.scale(parameter * multiplier).backward()
            # Preserve strict JSON even when the Tensor contains positive infinity.
            gradient = parameter.grad.item()
            gradient_display = gradient if torch.isfinite(parameter.grad).item() else "+inf"
            result = scaler.step(optimizer)
            scaler.update()
            windows.append(dict(window=label, before=before, scaled_gradient=gradient_display,
                                scaler_step_return=result, after=progress()))
    finally:
        hook.remove()
    finite, infinite = windows
    assert finite["scaled_gradient"] == 16.0
    assert finite["after"]["parameter"] < finite["before"]["parameter"]
    assert finite["after"]["post_steps"] == finite["after"]["adam_step"] == 1
    assert (finite["before"]["scale"], finite["after"]["scale"]) == (8.0, 8.0)
    assert infinite["scaled_gradient"] == "+inf"
    for key in ("parameter", "adam_step", "post_steps"):
        assert infinite["before"][key] == infinite["after"][key]
    assert (infinite["before"]["scale"], infinite["after"]["scale"]) == (8.0, 4.0)
    assert finite["scaler_step_return"] is None and infinite["scaler_step_return"] is None
    print(json.dumps(dict(
        torch_version=torch.__version__, python_version=platform.python_version(), device="cpu",
        parameter_dtype=str(parameter.dtype), optimizer="AdamW(lr=0.125, weight_decay=0, fused=False)",
        scaler="torch.amp.GradScaler('cpu', init_scale=8.0, growth_interval=20)",
        script="optimizer_step_probe.py", script_sha256=sha256(Path(__file__).read_bytes()).hexdigest(),
        attempted_windows=len(windows), applied_optimizer_calls=post_steps,
        windows=windows, assertions="PASS",
        scope="单进程CPU；直接构造FP32有限/inf梯度。未运行CUDA FP16、NCCL或DDP，未使用autocast。",
        interpretation="该默认AdamW路径每次完成底层optimizer.step才触发post hook。该计数不证明所有参数数值都变、全局训练有效或模型质量提高。"
    ), ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
