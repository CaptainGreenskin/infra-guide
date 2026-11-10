"""Run GPipe and 1F1B on two CPU ranks and check a full training update."""

import hashlib
import json
import os
import platform
import socket
from contextlib import nullcontext
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch import nn
from torch.distributed.pipelining import PipelineStage, Schedule1F1B, ScheduleGPipe
from torch.distributed.pipelining import schedules as torch_schedules


MICROBATCHES = 4
DTYPE = torch.float64
LR = 0.125
ATOL = 1e-12
INPUTS = [[1, 2], [2, -1], [-1, 3], [3, 1]]
TARGETS = [[0.5], [-1.25], [1.0], [0.0]]
CASES = [("gpipe", ScheduleGPipe, 4), ("1f1b", Schedule1F1B, 4),
         ("wrong_local_mean", ScheduleGPipe, 1)]


def tensor(values):
    return torch.tensor(values, dtype=DTYPE)


def build_stage(rank):
    if rank == 0:
        layer = nn.Linear(2, 2, dtype=DTYPE)
        weight, bias = [[1, 1], [2, -1]], [0.5, -0.5]
    else:
        layer = nn.Linear(2, 1, dtype=DTYPE)
        weight, bias = [[0.25, -0.5]], [0.125]
    with torch.no_grad():
        layer.weight.copy_(tensor(weight))
        layer.bias.copy_(tensor(bias))
    return nn.Sequential(layer, nn.ReLU()) if rank == 0 else layer


class TracedStage(PipelineStage):
    """Record completed stage calls while leaving PyTorch's scheduling intact."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.events = []

    def forward_one_chunk(self, fwd_chunk_id, args, kwargs=None):
        result = super().forward_one_chunk(fwd_chunk_id, args, kwargs)
        self.events.append(("F", fwd_chunk_id))
        return result

    def backward_one_chunk(self, bwd_chunk_id, loss=None, full_backward=True):
        result = super().backward_one_chunk(bwd_chunk_id, loss, full_backward)
        self.events.append(("B", bwd_chunk_id))
        return result


class BatchWork:
    def __init__(self, works):
        self.works = works

    def wait(self):
        for work in self.works:
            work.wait()


def retain_p2p_handles(ops, desc=None):
    # PyTorch 2.5.1's helper returns only the last Work. In the local Gloo
    # libuv backend, dropping a fused send's Work can invalidate its buffer.
    return BatchWork(dist.batch_isend_irecv(ops)) if ops else None


def capture_update(module, optimizer):
    gradients = {name: p.grad.detach().tolist() for name, p in module.named_parameters()}
    optimizer.step()
    updated = {name: p.detach().tolist() for name, p in module.named_parameters()}
    return {"gradients": gradients, "updated": updated}


def pending_forwards(events):
    pending, counts = set(), []
    for operation, microbatch in events:
        if operation == "F":
            assert microbatch not in pending
            pending.add(microbatch)
        else:
            assert microbatch in pending
            pending.remove(microbatch)
        counts.append(len(pending))
    assert not pending
    return counts


def worker(rank, directory):
    torch.set_num_threads(1)
    directory = Path(directory)
    store = dist.FileStore(str(directory / "gloo-store"), 2)
    dist.init_process_group("gloo", store=store, rank=rank,
                            world_size=2, timeout=timedelta(seconds=25))
    results = {}
    try:
        for name, schedule_type, denominator in CASES:
            module = build_stage(rank)
            optimizer = torch.optim.SGD(module.parameters(), lr=LR)
            stage = TracedStage(module, rank, 2, torch.device("cpu"),
                                input_args=torch.empty((1, 2), dtype=DTYPE),
                                output_args=torch.empty((1, 2 if rank == 0 else 1), dtype=DTYPE))

            def loss_fn(output, target):
                return (output - target).square().sum() / denominator

            schedule = schedule_type(stage, n_microbatches=MICROBATCHES, loss_fn=loss_fn)
            # Keep the upstream F/B order and vary only the transport wait helper.
            keep_handles = schedule_type is Schedule1F1B
            transport = (patch.object(torch_schedules, "_batch_p2p", retain_p2p_handles)
                         if keep_handles else nullcontext())
            losses = []
            with transport:
                if rank == 0:
                    schedule.step(tensor(INPUTS))
                    predictions = None
                else:
                    output = schedule.step(target=tensor(TARGETS), losses=losses)
                    predictions = output.detach().tolist()
            counts = pending_forwards(stage.events)
            results[name] = {"events": [f"{op}{i}" for op, i in stage.events],
                             "pending_after_each_event": counts,
                             "max_pending": max(counts),
                             **capture_update(module, optimizer)}
            if rank == 1:
                results[name].update(predictions=predictions, losses=[loss.item() for loss in losses])
            dist.barrier()
        (directory / f"rank-{rank}.json").write_text(json.dumps(results))
    finally:
        dist.destroy_process_group()


def dense_reference():
    model = nn.Sequential(build_stage(0), build_stage(1))
    prediction = model(tensor(INPUTS))
    loss = nn.functional.mse_loss(prediction, tensor(TARGETS))
    loss.backward()
    return {"predictions": prediction.detach().tolist(), "mean_loss": loss.item(),
            "ranks": [capture_update(module, torch.optim.SGD(module.parameters(), lr=LR))
                      for module in model]}


def max_error(actual, expected):
    return (tensor(actual) - tensor(expected)).abs().max().item()


def verify(records, expected):
    results = {}
    for name, schedule_type, denominator in CASES:
        ranks = [record[name] for record in records]
        for rank in ranks:
            assert sorted(rank["events"]) == ["B0", "B1", "B2", "B3", "F0", "F1", "F2", "F3"]
        factor = MICROBATCHES / denominator
        prediction_error = max_error(ranks[1]["predictions"], expected["predictions"])
        assert prediction_error <= ATOL
        assert abs(sum(ranks[1]["losses"]) - factor * expected["mean_loss"]) <= ATOL
        gradient_errors, step_errors = [], []
        for observed, reference in zip(ranks, expected["ranks"]):
            assert observed["gradients"].keys() == reference["gradients"].keys()
            assert observed["updated"].keys() == reference["updated"].keys()
            for key, gradient in observed["gradients"].items():
                target = tensor(reference["gradients"][key])
                torch.testing.assert_close(tensor(gradient), factor * target, rtol=0, atol=ATOL)
                gradient_errors.append(max_error(gradient, target.tolist()))
                step_errors.append(max_error(observed["updated"][key], reference["updated"][key]))
        if name == "wrong_local_mean":
            assert max(gradient_errors) > ATOL and max(step_errors) > ATOL
        else:
            assert max(gradient_errors) <= ATOL and max(step_errors) <= ATOL
        results[name] = {"ranks": ranks, "gradient_scale_vs_dense": factor,
                         "p2p_work_policy": "retain_all_handles" if schedule_type is Schedule1F1B else "upstream_default",
                         "max_prediction_error": prediction_error,
                         "max_gradient_error": max(gradient_errors), "max_step_error": max(step_errors)}

    for name, expected_peak in [("gpipe", [4, 4]), ("1f1b", [2, 1])]:
        assert [rank["max_pending"] for rank in results[name]["ranks"]] == expected_peak
    return results


def main():
    torch.set_num_threads(1)
    # The FileStore and the Gloo connections are both local to this machine.
    interfaces = {name for _, name in socket.if_nameindex()}
    os.environ["GLOO_SOCKET_IFNAME"] = "lo0" if "lo0" in interfaces else "lo"
    with TemporaryDirectory() as directory:
        mp.spawn(worker, args=(directory,), nprocs=2, join=True)
        records = [json.loads((Path(directory) / f"rank-{rank}.json").read_text()) for rank in range(2)]
    reference = dense_reference()
    source = Path(__file__).resolve().parent
    report = {"status": "passed", "environment": {"device": "cpu", "backend": "gloo", "world_size": 2,
                                                  "system": platform.system(), "arch": platform.machine(),
                                                  "python": platform.python_version(), "torch": str(torch.__version__)},
              "inputs": INPUTS, "targets": TARGETS, "microbatches": MICROBATCHES, "lr": LR, "atol": ATOL,
              "reference": reference, "schedules": verify(records, reference),
              "scope": "Local float64 two-stage training, four equal microbatches and one SGD update. The 1F1B run retains every P2P work handle. Pending forwards count logical microbatches, not bytes or device memory.",
              "source_sha256": {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                                for name in ["pipeline_schedules.py", "requirements.txt", "README.md"]}}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
