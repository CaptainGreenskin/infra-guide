"""Actual PyTorch 2.5.1 CPU dynamic INT8 Linear, separate from the INT4 format.

Creates/loads only its own TorchScript file. No downloaded model or GPU is used.
"""
import json
from pathlib import Path
import tempfile

import torch
from int4_groups import W, INPUTS, BIAS


def run():
    torch.set_num_threads(1)
    supported = torch.backends.quantized.supported_engines
    if torch.backends.quantized.engine == 'none':
        engine = next((name for name in ('qnnpack','x86','fbgemm') if name in supported), None)
        if engine is None:
            raise RuntimeError('This PyTorch build has no usable quantized CPU backend')
        torch.backends.quantized.engine = engine
    model = torch.nn.Sequential(torch.nn.Linear(8, 4)).eval()
    with torch.no_grad():
        model[0].weight.copy_(torch.tensor(W, dtype=torch.float32))
        model[0].bias.copy_(torch.tensor(BIAS, dtype=torch.float32))
    inputs = torch.tensor(INPUTS, dtype=torch.float32)
    quantized = torch.ao.quantization.quantize_dynamic(model, {torch.nn.Linear}, dtype=torch.qint8)
    with torch.inference_mode():
        reference = model(inputs)
        output = quantized(inputs)
    weight = quantized[0].weight()
    assert weight.dtype == torch.qint8
    assert not isinstance(quantized[0], torch.nn.Linear)
    max_error = float((output - reference).abs().max())
    # A declared numerical tolerance for THESE fixed linear inputs, not model quality.
    assert torch.isfinite(output).all() and max_error < 0.2
    with tempfile.TemporaryDirectory(prefix="int8-runtime-") as folder:
        path = Path(folder, "own-linear.pt")
        traced = torch.jit.trace(quantized, inputs)
        torch.jit.save(traced, str(path))
        restored = torch.jit.load(str(path)).eval()
        with torch.inference_mode():
            loaded_output = restored(inputs)
        roundtrip_error = float((loaded_output - output).abs().max())
        assert roundtrip_error == 0
        artifact_bytes = path.stat().st_size
    return {"torch":torch.__version__, "device":"cpu",
            "quantized_engine":torch.backends.quantized.engine,
            "module_type":type(quantized[0]).__module__+'.'+type(quantized[0]).__name__,
            "weight_dtype":str(weight.dtype), "scheme":str(weight.qscheme()),
            "weight_integer_payload_bytes":weight.int_repr().numel(),
            "fp32_weight_payload_bytes":model[0].weight.numel() * model[0].weight.element_size(),
            "reference_outputs":reference.tolist(), "quantized_outputs":output.tolist(),
            "fixed_input_max_abs_error":max_error,
            "declared_fixed_input_error_limit":0.2,
            "torchscript_roundtrip_max_abs_error":roundtrip_error,
            "whole_torchscript_artifact_bytes":artifact_bytes,
            "execution":"actual_cpu_dynamic_int8_not_int4_no_latency_benchmark"}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
