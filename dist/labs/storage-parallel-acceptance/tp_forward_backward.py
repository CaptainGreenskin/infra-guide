"""Two actual CPU/Gloo ranks: manually make tensor-parallel chain rules explicit.

Autograd is local. Ordinary collectives are deliberately outside its graph.
This is not a production tensor-parallel layer or a performance benchmark.
"""
import argparse
from datetime import timedelta
import hashlib
import json
from pathlib import Path
import platform
import tempfile
import time

import torch
import torch.distributed as dist
import torch.multiprocessing as mp


X = [[1., 2.]]
W = [[1., 0., 2., 0.], [0., 1., 0., 2.]]
U = [[1., 0.], [0., 1.], [1., 1.], [2., 0.]]
BIAS = [1., 1.]
TARGET = [[3., -1.]]
LR = 0.01


def tensor(value, grad=False):
    return torch.tensor(value, dtype=torch.float64, requires_grad=grad)


def baseline():
    x, w, u, bias = tensor(X, True), tensor(W, True), tensor(U, True), tensor(BIAS, True)
    y = torch.relu(x @ w) @ u + bias
    loss = ((y - tensor(TARGET))**2).sum() / 2
    loss.backward()
    return {"y": y.detach().tolist(), "loss": loss.item(),
        "dx": x.grad.tolist(), "dw": w.grad.tolist(), "du": u.grad.tolist(), "db": bias.grad.tolist(),
        "w_after": (w - LR*w.grad).detach().tolist(),
        "u_after": (u - LR*u.grad).detach().tolist(),
        "bias_after": (bias - LR*bias.grad).detach().tolist()}


def worker(rank, rendezvous, folder):
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=rendezvous, rank=rank, world_size=2,
                            timeout=timedelta(seconds=15))
    try:
        start = rank*2
        x = tensor(X, True)
        w = tensor([row[start:start+2] for row in W], True)
        u = tensor(U[start:start+2], True)
        hidden = torch.relu(x @ w)
        partial = hidden @ u
        with torch.no_grad():
            y = partial.detach().clone()
            dist.all_reduce(y, op=dist.ReduceOp.SUM)
            y += tensor(BIAS)  # Add once after summing the two partial outputs.
            dy = y - tensor(TARGET)  # d(0.5 * sum((Y-target)^2))/dY
        partial.backward(dy)  # Local autograd receives the explicit shared output gradient.
        dx_local = x.grad.detach().clone()
        dx = dx_local.clone()
        dist.all_reduce(dx, op=dist.ReduceOp.SUM)

        # Actual reduction of the deliberately wrong bias placement.
        bad_y = partial.detach() + tensor(BIAS)
        dist.all_reduce(bad_y, op=dist.ReduceOp.SUM)
        result = {"rank": rank, "w_shape": list(w.shape), "u_shape": list(u.shape),
            "hidden": hidden.detach().tolist(), "partial_output": partial.detach().tolist(),
            "y": y.tolist(), "dy": dy.tolist(), "dx_partial": dx_local.tolist(), "dx": dx.tolist(),
            "dw": w.grad.tolist(), "du": u.grad.tolist(), "db": dy.sum(dim=0).tolist(),
            "w_after": (w - LR*w.grad).detach().tolist(), "u_after": (u - LR*u.grad).detach().tolist(),
            "bias_after": (tensor(BIAS) - LR*dy.sum(dim=0)).tolist(), "wrong_bias_y": bad_y.tolist()}
        Path(folder, "rank-%d.json" % rank).write_text(json.dumps(result))
    finally:
        dist.destroy_process_group()


def close(actual, expected):
    torch.testing.assert_close(tensor(actual), tensor(expected), rtol=0, atol=1e-12)


def exercise():
    reference = baseline()
    # Hand-computed oracle, independent of the full autograd baseline.
    expected_dw = [[9, 6, 15, 18], [18, 12, 30, 36]]
    expected_du = [[9, 6], [18, 12], [18, 12], [36, 24]]
    assert reference["y"] == [[12, 5]] and reference["loss"] == 58.5
    assert reference["dx"] == [[39, 42]] and reference["db"] == [9, 6]
    assert reference["dw"] == expected_dw and reference["du"] == expected_du
    with tempfile.TemporaryDirectory(prefix="tp-chain-rule-") as folder:
        rendezvous = Path(folder, "rendezvous").as_uri()  # File must not already exist.
        context = mp.spawn(worker, args=(rendezvous, folder), nprocs=2, join=False)
        deadline = time.monotonic() + 45
        try:
            while not context.join(timeout=1):
                if time.monotonic() > deadline:
                    raise TimeoutError("trusted TP children exceeded 45 seconds")
        finally:
            for child in context.processes:
                if child.is_alive():
                    child.terminate()
            for child in context.processes:
                child.join(2)
                if child.is_alive():
                    child.kill()
                    child.join(2)
        results = [json.loads(Path(folder, "rank-%d.json" % r).read_text()) for r in range(2)]
    for r, local in enumerate(results):
        start = r*2
        close(local["y"], reference["y"])
        close(local["dx"], reference["dx"])
        close(local["dw"], [row[start:start+2] for row in reference["dw"]])
        close(local["du"], reference["du"][start:start+2])
        close(local["db"], reference["db"])
        close(local["w_after"], [row[start:start+2] for row in reference["w_after"]])
        close(local["u_after"], reference["u_after"][start:start+2])
        close(local["bias_after"], reference["bias_after"])
        assert local["wrong_bias_y"] == [[13, 6]]
    assert [r["dx_partial"] for r in results] == [[[9, 6]], [[30, 36]]]
    nonlinear_parts = tensor([1, -2])
    sum_then_relu = torch.relu(nonlinear_parts.sum()).item()
    relu_then_sum = torch.relu(nonlinear_parts).sum().item()
    assert sum_then_relu == 0 and relu_then_sum == 1
    return {"status": "passed", "python": platform.python_version(), "torch": torch.__version__,
        "backend": "gloo", "world_size": 2, "device": "cpu", "dtype": "float64",
        "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "reference": reference, "ranks": results,
        "wrong_nonlinearity": {"partials": [1, -2], "sum_then_relu": sum_then_relu, "relu_then_sum": relu_then_sum},
        "scope": "Actual two-rank forward SUM, input-gradient SUM and wrong-bias SUM. Local autograd with explicit dY; no automatic distributed-autograd layer, GPU/NCCL, multi-host, model quality or performance claim."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = exercise()
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.write_text(text)
    print(text, end="")
