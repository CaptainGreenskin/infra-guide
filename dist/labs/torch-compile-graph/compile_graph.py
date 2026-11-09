#!/usr/bin/env python3
"""Inspect real TorchDynamo captures and, optionally, CPU TorchInductor output."""

import argparse
import hashlib
import json
import os
import platform
import re
import tempfile
from pathlib import Path
from unittest.mock import patch

import torch
import torch._dynamo as dynamo


CASES = {
    "positive": [-1, 1, 2],
    "negative": [-4, -2, 0],
    "zero": [-2, -1, 0],
    "wide_positive": [-2, 0, 1, 2],
    "wide_negative": [-3, -2, -1, 0],
}
FIXED_SHAPE = ("positive", "negative", "zero", "positive")
MIXED_SHAPES = FIXED_SHAPE + ("wide_positive", "wide_negative", "positive")
TENSOR_OPS = ["add", "sum", "gt", "mul", "sub", "where"]


def python_branch(x):
    shifted = x + 1
    if shifted.sum().item() > 0:
        return shifted * 2
    return shifted - 2


def tensor_branch(x):
    shifted = x + 1
    return torch.where(shifted.sum() > 0, shifted * 2, shifted - 2)


def reference(values):
    """Use only Python numbers, independent of either tensor function."""
    shifted = [value + 1 for value in values]
    total = sum(shifted)
    if total > 0:
        output = [value * 2 for value in shifted]
    else:
        output = [value - 2 for value in shifted]
    return total, output


def input_tensor(case):
    return torch.tensor(CASES[case], dtype=torch.float64, device="cpu")


def checked_output(case, output):
    assert output.shape == (len(CASES[case]),)
    assert output.device.type == "cpu" and output.dtype == torch.float64
    values = output.tolist()
    assert values == reference(CASES[case])[1], (case, values)
    return values


class CaptureBackend:
    """Keep the captured operations and execute GraphModule.forward on CPU."""

    def __init__(self):
        self.captures = []
        self.executed = []

    def __call__(self, graph_module, example_inputs):
        graph_id = len(self.captures) + 1
        operations = []
        for node in graph_module.graph.nodes:
            if node.op == "call_function":
                operations.append(node.target.__name__)
            if node.op == "call_method":
                operations.append(node.target)
        self.captures.append({
            "id": graph_id,
            "input_shapes": [list(value.shape) for value in example_inputs],
            "operations": operations,
        })

        def execute(*inputs):
            self.executed.append(graph_id)
            return graph_module.forward(*inputs)

        return execute


def guard_failure_offsets():
    return {code: len(reasons) for code, reasons in dynamo.guard_failures.items()}


def new_guard_failures(offsets):
    # Dynamo prefixes reasons with compile ordinals and aligns some with spaces.
    return [
        re.sub(r"^\d+/\d+:\s*", "", reason.strip())
        for code, reasons in dynamo.guard_failures.items()
        for reason in reasons[offsets.get(code, 0):]
    ]


def capture_run(function, cases, *, fullgraph):
    dynamo.reset()
    backend = CaptureBackend()
    compiled = torch.compile(function, backend=backend, fullgraph=fullgraph, dynamic=False)
    calls = []
    for case in cases:
        before = len(backend.captures)
        offsets = guard_failure_offsets()
        backend.executed.clear()
        output = checked_output(case, compiled(input_tensor(case)))
        calls.append({
            "case": case,
            "new_graph_ids": [graph["id"] for graph in backend.captures[before:]],
            "executed_graph_ids": backend.executed.copy(),
            "output": output,
            "guard_failures": new_guard_failures(offsets),
        })
    return {"fullgraph": fullgraph, "dynamic": False, "captures": backend.captures, "calls": calls}


def reject_python_fullgraph():
    dynamo.reset()
    backend = CaptureBackend()
    compiled = torch.compile(python_branch, backend=backend, fullgraph=True, dynamic=False)
    try:
        compiled(input_tensor("positive"))
    except dynamo.exc.Unsupported as error:
        reason = str(error).splitlines()[0]
        assert reason == "Tensor.item" and not backend.captures and not backend.executed
        return {
            "fullgraph": True,
            "status": "rejected",
            "error_type": type(error).__name__,
            "reason": reason,
            "captured_count": len(backend.captures),
        }
    raise AssertionError("Python scalar branch unexpectedly passed fullgraph=True")


def explain(function):
    dynamo.reset()
    explanation = dynamo.explain(function)(input_tensor("positive"))
    return {
        "graph_count": explanation.graph_count,
        "graph_break_count": explanation.graph_break_count,
        "reasons": [reason.reason for reason in explanation.break_reasons],
    }


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_inductor():
    from torch._inductor import config, metrics

    dynamo.reset()
    with tempfile.TemporaryDirectory(prefix="compile-graph-") as cache:
        # Isolate this replay from saved graphs and from any remote code cache.
        with patch.dict(os.environ, {"TORCHINDUCTOR_CACHE_DIR": cache}), config.patch(
            compile_threads=1, fx_graph_cache=False, fx_graph_remote_cache=False
        ):
            metrics.reset()
            compiled = torch.compile(tensor_branch, backend="inductor", fullgraph=True, dynamic=False)
            outputs = [
                {"case": case, "output": checked_output(case, compiled(input_tensor(case)))}
                for case in FIXED_SHAPE
            ]
            generated = Path(cache)
            sources = list(generated.rglob("*.cpp"))
            libraries = list(generated.rglob("*.so"))
            native_artifacts = []
            for source in sorted(sources):
                if 'extern "C"' in source.read_text() and re.search(r"\bvoid\s+kernel\s*\(", source.read_text()):
                    library = source.with_suffix(".so")
                    assert library in libraries
                    native_artifacts.append({"cpp_sha256": digest(source), "library_sha256": digest(library)})
            assert metrics.generated_kernel_count > 0 and native_artifacts
            return {
                "status": "passed",
                "backend": "inductor",
                "fullgraph": True,
                "outputs": outputs,
                "generated_kernel_count": metrics.generated_kernel_count,
                "generated_cpp_vec_kernel_count": metrics.generated_cpp_vec_kernel_count,
                "native_artifacts": native_artifacts,
            }


def assert_captures(partial, tensor, shape):
    assert [g["operations"] for g in partial["captures"]] == [["add", "sum"], ["mul"], ["sub"], ["sub"]]
    assert [call["new_graph_ids"] for call in partial["calls"]] == [[1, 2], [3], [4], []]
    assert [call["executed_graph_ids"] for call in partial["calls"]] == [[1, 2], [1, 3], [1, 4], [1, 2]]
    assert [g["operations"] for g in tensor["captures"]] == [TENSOR_OPS]
    assert [call["new_graph_ids"] for call in tensor["calls"]] == [[1], [], [], []]
    assert [call["executed_graph_ids"] for call in tensor["calls"]] == [[1], [1], [1], [1]]
    assert [g["operations"] for g in shape["captures"]] == [TENSOR_OPS, TENSOR_OPS]
    assert [g["input_shapes"] for g in shape["captures"]] == [[[3]], [[4]]]
    assert [call["new_graph_ids"] for call in shape["calls"]] == [[1], [], [], [], [2], [], []]
    assert [call["executed_graph_ids"] for call in shape["calls"]] == [[1], [1], [1], [1], [2], [2], [1]]
    assert any("expected 3, actual 4" in reason for reason in shape["calls"][4]["guard_failures"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inductor", action="store_true", help="also compile the tensor rewrite with CPU TorchInductor")
    parser.add_argument("--write-record", type=Path, help="save JSON to this path as well as printing it")
    args = parser.parse_args()
    if str(torch.__version__).split("+")[0] != "2.5.1":
        raise SystemExit("Use PyTorch 2.5.1 for the recorded graph and guard contract.")
    torch.set_num_threads(1)
    with dynamo.config.patch(capture_scalar_outputs=False, suppress_errors=False):
        partial = capture_run(python_branch, FIXED_SHAPE, fullgraph=False)
        rejected = reject_python_fullgraph()
        tensor = capture_run(tensor_branch, FIXED_SHAPE, fullgraph=True)
        shape = capture_run(tensor_branch, MIXED_SHAPES, fullgraph=True)
        assert_captures(partial, tensor, shape)
        explanations = {"python": explain(python_branch), "tensor": explain(tensor_branch)}
        assert explanations == {
            "python": {"graph_count": 2, "graph_break_count": 1, "reasons": ["Tensor.item"]},
            "tensor": {"graph_count": 1, "graph_break_count": 0, "reasons": []},
        }
        inductor = run_inductor() if args.inductor else None
    here = Path(__file__).resolve().parent
    rows = []
    for case, values in CASES.items():
        shifted_sum, output = reference(values)
        rows.append({"id": case, "input": values, "shifted_sum": shifted_sum, "output": output})
    record = {
        "schema": 1,
        "status": "passed",
        "source_sha256": {name: digest(here / name) for name in ("compile_graph.py", "requirements.txt")},
        "environment": {
            "python": platform.python_version(),
            "torch": str(torch.__version__),
            "torch_commit": torch.version.git_version,
            "system": platform.system(),
            "machine": platform.machine(),
            "device": "cpu",
            "threads": torch.get_num_threads(),
            "dtype": "float64",
            "capture_scalar_outputs": False,
            "dynamic": False,
        },
        "report": {
            "cases": rows,
            "python_partial": partial,
            "python_fullgraph": rejected,
            "tensor_fullgraph": tensor,
            "shape_control": shape,
            "dynamo_explain": explanations,
            "inductor": inductor,
        },
    }
    content = json.dumps(record, indent=2, allow_nan=False) + "\n"
    if args.write_record:
        args.write_record.write_text(content, encoding="utf-8")
    print(content, end="")


if __name__ == "__main__":
    main()
