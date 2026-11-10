"""Four CPU/Gloo ranks: native TP and DDP with unequal replica batches."""

import hashlib
import json
import os
import platform
import socket
from contextlib import nullcontext
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch import nn
from torch.distributed.device_mesh import DeviceMesh
from torch.distributed.tensor.parallel import ColwiseParallel, RowwiseParallel, parallelize_module


MESH = [[0, 1], [2, 3]]
INPUTS = [[1, 2], [2, 1], [-1, 3]]
TARGETS = [[3, -1], [8, 9], [7, 4]]
REPLICA_ROWS = [[0], [1, 2]]
W = [[1, 0, 2, 0], [0, 1, 0, 2]]
U = [[1, 0], [0, 1], [1, 1], [2, 0]]
BIAS = [1, 1]
LR = 0.125
ATOL = 1e-12
CASES = ("sample_weighted", "wrong_local_mean", "wrong_tp_group")


def tensor(values):
    return torch.tensor(values, dtype=torch.float64)


class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.w = nn.Linear(2, 4, bias=False, dtype=torch.float64)
        self.u = nn.Linear(4, 2, dtype=torch.float64)
        with torch.no_grad():
            self.w.weight.copy_(tensor(W).T)
            self.u.weight.copy_(tensor(U).T)
            self.u.bias.copy_(tensor(BIAS))

    def forward(self, inputs):
        return self.u(self.w(inputs).relu())


def capture_step(parameters, optimizer):
    gradients = {name: param.grad.detach().tolist() for name, param in parameters.items()}
    optimizer.step()
    return {"gradients": gradients,
            "updated": {name: param.detach().tolist() for name, param in parameters.items()}}


def run_case(mesh, case):
    dp_index, tp_index = mesh.get_coordinate()
    model = parallelize_module(Model(), mesh["tp"], {"w": ColwiseParallel(), "u": RowwiseParallel()})
    ddp = nn.parallel.DistributedDataParallel(model, device_mesh=mesh["dp"])
    # Capture the reducer's local parameters before the 2.5.1 TP+DDP forward hooks.
    parameters = dict(model.named_parameters())
    optimizer = torch.optim.SGD(parameters.values(), lr=LR)
    initial = {name: param.detach().tolist() for name, param in parameters.items()}
    rows = REPLICA_ROWS[dp_index]
    inputs = tensor([INPUTS[i] for i in rows])
    target = tensor([TARGETS[i] for i in rows])
    global_elements = len(INPUTS) * len(TARGETS[0])
    dp_group = mesh.get_group("dp")
    tp_group = mesh.get_group("tp")
    dp_size = dist.get_world_size(dp_group)
    tp_members = dist.get_process_group_ranks(tp_group)
    dp_members = dist.get_process_group_ranks(dp_group)
    wrong_axis = case == "wrong_tp_group"
    with ddp.no_sync() if wrong_axis else nullcontext():
        prediction = ddp(inputs)
        squared_error = (prediction - target).square()
        local_sse = squared_error.sum()
        loss = squared_error.mean() if case == "wrong_local_mean" else local_sse * dp_size / global_elements
        loss.backward()

    # Disable only DDP's gradient sync in this control. The forward TP is the same.
    if wrong_axis:
        for param in parameters.values():
            dist.all_reduce(param.grad, op=dist.ReduceOp.SUM, group=tp_group)
            param.grad.div_(dist.get_world_size(tp_group))

    return {"rank": dist.get_rank(), "coordinate": [dp_index, tp_index], "tp_group": tp_members, "dp_group": dp_members,
            "gradient_group": tp_members if wrong_axis else dp_members, "sample_ids": rows,
            "local_sse": local_sse.item(), "loss_for_backward": loss.item(),
            "prediction": prediction.detach().tolist(), "initial": initial,
            **capture_step(parameters, optimizer)}


def worker(rank, directory):
    torch.set_num_threads(1)
    directory = Path(directory)
    store = dist.FileStore(str(directory / "gloo-store"), 4)
    dist.init_process_group("gloo", store=store, rank=rank, world_size=4,
                            timeout=timedelta(seconds=25))
    try:
        mesh = DeviceMesh("cpu", MESH, mesh_dim_names=("dp", "tp"))
        results = {case: run_case(mesh, case) for case in CASES}
        (directory / f"rank-{rank}.json").write_text(json.dumps(results))
    finally:
        dist.destroy_process_group()


def dense_reference(equal_replica_weights=False):
    model = Model()
    parameters = dict(model.named_parameters())
    optimizer = torch.optim.SGD(parameters.values(), lr=LR)
    prediction = model(tensor(INPUTS))
    errors = (prediction - tensor(TARGETS)).square()
    if equal_replica_weights:
        loss = torch.stack([errors[rows].mean() for rows in REPLICA_ROWS]).mean()
    else:
        loss = errors.mean()
    loss.backward()
    return {"prediction": prediction.detach().tolist(), "loss": loss.item(),
            **capture_step(parameters, optimizer)}


def expected_shard(full, tp_index):
    start = tp_index * 2
    return {"w.weight": full["w.weight"][start:start + 2],
            "u.weight": [row[start:start + 2] for row in full["u.weight"]],
            "u.bias": full["u.bias"]}


def max_error(actual, expected):
    actual, expected = tensor(actual), tensor(expected)
    assert actual.shape == expected.shape
    return (actual - expected).abs().max().item()


def verify(rank_records, reference, equal_weights):
    results = {}
    full_initial = {"w.weight": tensor(W).T.tolist(), "u.weight": tensor(U).T.tolist(), "u.bias": BIAS}
    for case in CASES:
        ranks = [record[case] for record in rank_records]
        errors = {"prediction": [], "gradients": [], "updated": []}
        for rank, observed in enumerate(ranks):
            dp_index, tp_index = divmod(rank, 2)
            assert observed["rank"] == rank and observed["coordinate"] == [dp_index, tp_index]
            assert observed["tp_group"] == MESH[dp_index]
            assert observed["dp_group"] == [row[tp_index] for row in MESH]
            assert observed["gradient_group"] == observed["tp_group" if case == "wrong_tp_group" else "dp_group"]
            rows = REPLICA_ROWS[dp_index]
            assert observed["sample_ids"] == rows
            errors["prediction"].append(max_error(observed["prediction"], [reference["prediction"][i] for i in rows]))
            assert observed["initial"] == expected_shard(full_initial, tp_index)
            for key in ("gradients", "updated"):
                expected = expected_shard(reference[key], tp_index)
                assert observed[key].keys() == expected.keys()
                for param, value in observed[key].items():
                    errors[key].append(max_error(value, expected[param]))
                    if case == "wrong_local_mean":
                        assert max_error(value, expected_shard(equal_weights[key], tp_index)[param]) <= ATOL
        maxima = {key: max(values) for key, values in errors.items()}
        assert maxima["prediction"] <= ATOL
        if case == "sample_weighted":
            assert maxima["gradients"] <= ATOL and maxima["updated"] <= ATOL
        else:
            assert maxima["gradients"] > ATOL and maxima["updated"] > ATOL
        results[case] = {"ranks": ranks, "max_error_vs_sample_weighted_dense": maxima}
    assert reference["prediction"] == [[12, 5], [11, 6], [13, 4]] and reference["loss"] == 28.5
    assert equal_weights["loss"] == 36
    expected_first_row = {"sample_weighted": [5, 7], "wrong_local_mean": [6, 9.75], "wrong_tp_group": [8, 16]}
    for case, gradient in expected_first_row.items():
        assert max_error(results[case]["ranks"][0]["gradients"]["w.weight"][0], gradient) <= ATOL
    return results


def main():
    torch.set_num_threads(1)
    interfaces = {name for _, name in socket.if_nameindex()}
    os.environ["GLOO_SOCKET_IFNAME"] = "lo0" if "lo0" in interfaces else "lo"
    with TemporaryDirectory() as directory:
        mp.spawn(worker, args=(directory,), nprocs=4, join=True)
        records = [json.loads((Path(directory) / f"rank-{rank}.json").read_text()) for rank in range(4)]
    reference = dense_reference()
    equal_weights = dense_reference(equal_replica_weights=True)
    source = Path(__file__).resolve().parent
    report = {"status": "passed", "environment": {"backend": "gloo", "device": "cpu", "world_size": 4,
                                                 "python": platform.python_version(), "torch": str(torch.__version__),
                                                 "system": platform.system(), "arch": platform.machine()},
              "mesh": MESH, "mesh_axes": ["dp", "tp"], "inputs": INPUTS, "targets": TARGETS,
              "lr": LR, "atol": ATOL, "reference": reference, "equal_replica_reference": equal_weights,
              "cases": verify(records, reference, equal_weights),
              "scope": "Local four-rank float64 Gloo, native PyTorch 2.5.1 DTensor TP and DDP, one uneven batch and SGD update. The wrong-axis control explicitly reduces gradients after DDP no_sync. No GPU or checkpoint claims.",
              "source_sha256": {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                                for name in ["dp_tp_mesh.py", "requirements.txt", "README.md"]}}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
