"""Trace the original 664-parameter TinyDecoder after its original SGD update."""
import argparse
import hashlib
import importlib.util
import json
import platform
from pathlib import Path

import torch
from torch.nn.attention import SDPBackend, sdpa_kernel

SOURCE_SHA = "724963cf4a04ac76f6b7d125876d0be1947b1b29a6b0a159a5bb347477dc3e6f"
ATOL = 1e-12


def load_original(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError("Use the original tiny_decoder.py from the sdpa-cache archive")
    spec = importlib.util.spec_from_file_location("tiny_decoder", path)
    original = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(original)
    return original


def trace(model, prompt):
    observed = {}

    def record_output(name):
        def save(_module, _inputs, output):
            observed[name] = output.detach().clone()
        return save

    def record_input(name):
        def save(_module, inputs):
            observed[name] = inputs[0].detach().clone()
        return save

    handles = [
        model.token.register_forward_hook(record_output("token")),
        model.position.register_forward_hook(record_output("position")),
        model.norm1.register_forward_pre_hook(record_input("x")),
        model.qkv.register_forward_hook(record_output("projected")),
        model.out.register_forward_pre_hook(record_input("joined")),
        model.out.register_forward_hook(record_output("attention")),
        model.norm2.register_forward_pre_hook(record_input("after_attention")),
        model.down.register_forward_hook(record_output("feed_forward")),
        model.norm_out.register_forward_pre_hook(record_input("after_ffn")),
        model.norm_out.register_forward_hook(record_output("normalized")),
    ]
    try:
        logits = model(torch.tensor([prompt]))
    finally:
        for handle in handles:
            handle.remove()

    length = len(prompt)
    q, k, v = (t.reshape(1, length, 2, 4).transpose(1, 2)[0]
               for t in observed["projected"].chunk(3, dim=-1))
    raw_scores = (q @ k.transpose(-2, -1)) / 2
    visible = torch.ones((length, length), dtype=torch.bool).tril()
    weights = raw_scores.masked_fill(~visible, -torch.inf).softmax(dim=-1)
    reference_joined = (weights @ v).transpose(0, 1).reshape(1, length, 8)
    torch.testing.assert_close(reference_joined, observed["joined"], atol=ATOL, rtol=0)
    return {
        "prompt": prompt,
        "layers": {name: (value if name == "position" else value[0]).tolist()
                   for name, value in observed.items() if name != "projected"},
        "reference": {"q": q.tolist(), "k": k.tolist(), "v": v.tolist(),
                      "raw_scores": raw_scores.tolist(), "visible": visible.tolist(),
                      "weights": weights.tolist()},
        "logits": logits[0].tolist(),
        "selected_id": int(logits[0, -1].argmax()),
        "joined_max_abs_error": float((observed["joined"] - reference_joined).abs().max()),
    }


def max_delta(base, changed, field, position):
    a = base["logits"] if field == "logits" else base["layers"][field]
    b = changed["logits"] if field == "logits" else changed["layers"][field]
    return max(abs(x - y) for x, y in zip(a[position], b[position]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdpa-pack", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("PyTorch 2.5.1 is required for this recorded replay")
    original = load_original(args.sdpa_pack / "tiny_decoder.py")
    torch.manual_seed(7)
    torch.set_num_threads(1)
    model = original.TinyDecoder().double()
    rows = torch.tensor([[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]])
    labels = rows[:, 1:].clone()
    labels[0, 1:] = -100
    labels[1, 3:] = -100
    with sdpa_kernel(backends=[SDPBackend.MATH]):
        loss_before = original.update(model, rows[:, :-1], labels, micro_size=2)
        model.eval()
        with torch.inference_mode():
            base = trace(model, [0, 1])
            change_prefix = trace(model, [4, 1])
            change_future = trace(model, [0, 7])
    prefix = {field: max_delta(base, change_prefix, field, 1)
              for field in ("x", "joined", "after_ffn", "logits")}
    future = {field: max_delta(base, change_future, field, 0)
              for field in ("x", "joined", "after_ffn", "logits")}
    assert base["selected_id"] == 1
    assert prefix["x"] == 0 and min(prefix["joined"], prefix["logits"]) > 0.01
    assert max(future.values()) <= ATOL
    output = {
        "schema": "tiny-decoder-forward-v1", "status": "passed",
        "environment": {"python": platform.python_version(), "torch": torch.__version__,
                        "system": platform.system(), "arch": platform.machine(),
                        "device": "cpu", "dtype": "float64", "sdpa": "MATH"},
        "source_sha256": {
            "trace_forward.py": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "tiny_decoder.py": SOURCE_SHA,
        },
        "parameters": sum(value.numel() for value in model.parameters()),
        "token_weight": model.token.weight.detach().tolist(),
        "training": {"rows": rows.tolist(), "labels": labels.tolist(), "loss_before": loss_before},
        "runs": {"base": base, "change_prefix": change_prefix, "change_future": change_future},
        "max_absolute_deltas": {"prefix_position_1": prefix, "future_position_0": future},
    }
    args.output.write_text(json.dumps(output, indent=2) + "\n")


if __name__ == "__main__":
    main()
