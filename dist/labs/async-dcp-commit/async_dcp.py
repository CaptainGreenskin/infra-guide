"""Hold native asynchronous DCP writes while two DDP ranks run another step."""

import copy
from datetime import timedelta
import hashlib
import json
import os
from pathlib import Path
import platform
import tempfile
import threading

import torch
import torch.distributed as dist
import torch.distributed.checkpoint as dcp
from torch.nn.parallel import DistributedDataParallel


class HeldWriter(dcp.FileSystemWriter):
    """Observe the default stager and stop just before writing to disk."""

    def __init__(self, path, live, fail):
        super().__init__(path)
        self.live = live
        self.fail = fail
        self.entered = threading.Event()
        self.release = threading.Event()
        self.staged_shares_live = None
        self.write_on_background_thread = False

    def stage(self, state):
        staged = super().stage(state)
        self.staged_shares_live = {
            key: value.data_ptr() == training_values(self.live)[key].data_ptr()
            for key, value in training_values(staged).items()
        }
        return staged

    def write_data(self, plan, planner):
        self.write_on_background_thread = threading.current_thread() is not threading.main_thread()
        self.entered.set()
        if not self.release.wait(35):
            raise TimeoutError("fixture writer was not released")
        if self.fail:
            raise OSError("fixture rank 1 write refused")
        return super().write_data(plan, planner)


def new_training():
    model = torch.nn.Linear(1, 1, bias=False, dtype=torch.float64)
    with torch.no_grad():
        model.weight.zero_()
    model = DistributedDataParallel(model)
    optimizer = torch.optim.SGD(model.parameters(), lr=0.25, momentum=0.5)
    return model, optimizer


def update(model, optimizer, rank, step):
    target = ((2, 4), (6, 10))[step - 1][rank]
    x = torch.ones((1, 1), dtype=torch.float64)
    optimizer.zero_grad()
    loss = 0.5 * (model(x) - target).square().mean()
    loss.backward()
    gradient = model.module.weight.grad.item()
    optimizer.step()
    return {"target": target, "gradient": gradient, **values(state(model, optimizer, step))}


def state(model, optimizer, step):
    return {"model": model.module.state_dict(), "optimizer": optimizer.state_dict(),
            "completed_updates": torch.tensor(step, dtype=torch.int64)}


def training_values(payload):
    return {"weight": payload["model"]["weight"],
            "momentum": payload["optimizer"]["state"][0]["momentum_buffer"]}


def values(payload):
    return {key: tensor.item() for key, tensor in training_values(payload).items()}


def point_to(directory, name):
    temp = directory / "CURRENT.next"
    temp.write_text(name + "\n")
    os.replace(temp, directory / "CURRENT")


def read_pointer(directory):
    return (directory / "CURRENT").read_text().strip()


def load(directory, pg):
    model, optimizer = new_training()
    # Allocate a momentum tensor in the destination so the loader has a place to put it.
    parameter = model.module.weight
    optimizer.state[parameter]["momentum_buffer"] = torch.zeros_like(parameter)
    received = state(model, optimizer, 0)
    dcp.load(received, checkpoint_id=directory, process_group=pg)
    model.module.load_state_dict(received["model"])
    optimizer.load_state_dict(received["optimizer"])
    return model, optimizer, received


def run_case(root, name, rank, pg):
    model, optimizer = new_training()
    first = update(model, optimizer, rank, 1)
    payload = state(model, optimizer, 1)
    frozen = name != "alias"
    writer = HeldWriter(root / name, payload, fail=name == "failed" and rank == 1)
    argument = copy.deepcopy(payload) if frozen else payload
    future = dcp.async_save(argument, storage_writer=writer, process_group=pg)
    try:
        if not writer.entered.wait(30):
            raise TimeoutError("background DCP did not enter write_data")
        second = update(model, optimizer, rank, 2)
        pending = not future.done()
        metadata_before = (root / name / ".metadata").exists()
        pointer_before = read_pointer(root)
        # Both ranks finish the training step before releasing their DCP writes.
        dist.barrier()
    finally:
        writer.release.set()

    failure_ranks = []
    try:
        future.result(timeout=35)
    except dcp.CheckpointException as error:
        if name != "failed" or set(error.failures) != {1}:
            raise
        failure_ranks = sorted(error.failures)
    if name == "failed" and not failure_ranks:
        raise AssertionError("the injected write should fail the DCP future")

    metadata_after = (root / name / ".metadata").exists()
    if name == "frozen" and rank == 0:
        if not metadata_after:
            raise AssertionError("successful save did not publish DCP metadata")
        point_to(root, name)
    dist.barrier()
    pointer_after = read_pointer(root)
    # Inspect the alias path for comparison, without making it the restart target.
    selected = name if name == "alias" else pointer_after
    reloaded_model, reloaded_optimizer, received = load(root / selected, pg)
    completed = received["completed_updates"].item()
    restored = {"completed_updates": completed, **values(received)}
    if completed != 1:
        raise AssertionError("expected to resume at the first update")
    next_update = update(reloaded_model, reloaded_optimizer, rank, completed + 1)
    return {"rank": rank, "pid": os.getpid(), "first": first, "continued_during_write": second,
            "staged_shares_live": writer.staged_shares_live, "background_thread": writer.write_on_background_thread,
            "future_pending": pending, "metadata_before": metadata_before, "metadata_after": metadata_after,
            "pointer_before": pointer_before, "pointer_after": pointer_after, "failed_ranks": failure_ranks,
            "read_directory": selected, "restored": restored, "next_update": next_update}


def check(cases):
    for name, rows in cases.items():
        for row in rows:
            assert row["future_pending"] and row["background_thread"] and not row["metadata_before"]
            assert set(row["staged_shares_live"].values()) == {name == "alias"}
            assert row["pointer_after"] == "frozen"
            assert row["metadata_after"] is (name != "failed")
            assert row["failed_ranks"] == ([1] if name == "failed" else [])
            assert row["restored"]["weight"] == (2.9375 if name == "alias" else 0.75)
            assert row["next_update"]["weight"] == (5.296875 if name == "alias" else 2.9375)


def main():
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("use PyTorch 2.5.1")
    timeout = timedelta(seconds=75)
    dist.init_process_group("gloo", timeout=timeout)
    rank = dist.get_rank()
    if dist.get_world_size() != 2:
        raise RuntimeError("requires exactly two ranks")
    # Background storage coordination and foreground DDP use different process groups.
    pg = dist.new_group(backend="gloo", timeout=timeout)
    scratch = tempfile.TemporaryDirectory(prefix="infra-async-dcp-") if rank == 0 else None
    shared = [scratch.name if scratch else None]
    dist.broadcast_object_list(shared, src=0)
    root = Path(shared[0])
    try:
        previous, previous_optimizer = new_training()
        parameter = previous.module.weight
        previous_optimizer.state[parameter]["momentum_buffer"] = torch.zeros_like(parameter)
        dcp.save(state(previous, previous_optimizer, 0), checkpoint_id=root / "previous", process_group=pg)
        if rank == 0:
            point_to(root, "previous")
        dist.barrier()
        cases = {}
        for name in ("frozen", "alias", "failed"):
            result = run_case(root, name, rank, pg)
            gathered = [None, None]
            dist.all_gather_object(gathered, result)
            cases[name] = gathered
        check(cases)
        if rank == 0:
            files = {name: {file.name: file.stat().st_size for file in sorted((root / name).iterdir())}
                     for name in ("previous", *cases)}
            here = Path(__file__).resolve().parent
            hashes = {name: hashlib.sha256((here / name).read_bytes()).hexdigest()
                      for name in ("async_dcp.py", "requirements.txt")}
            print(json.dumps({"torch": torch.__version__, "python": platform.python_version(),
                              "platform": platform.system() + "/" + platform.machine(),
                              "backend": "gloo", "device": "cpu", "world_size": dist.get_world_size(),
                              "source_sha256": hashes, "files": files, "cases": cases}, indent=2))
    finally:
        dist.destroy_process_group(pg)
        dist.destroy_process_group()
        if scratch:
            scratch.cleanup()


if __name__ == "__main__":
    main()
