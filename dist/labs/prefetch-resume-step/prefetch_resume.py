"""Resume native PyTorch DataLoader input at the last saved optimizer step."""

import argparse
from functools import partial
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import platform
import tempfile

import torch
from torch.utils.data import DataLoader, Dataset, get_worker_info


ORDER = [4, 1, 8, 3, 0, 11, 7, 2, 9, 6, 5, 10]
EPOCH = 3
BATCH_SIZE = 2
WORKERS = 2
PREFETCH = 2
SAVE_AFTER = 1
DATA_IDENTITY = {"order": ORDER, "epoch": EPOCH, "batch_size": BATCH_SIZE, "transform": "sha256-byte-mod4-v1"}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class FixedSamples(Dataset):
    def __len__(self):
        return len(ORDER)

    def __getitem__(self, position):
        sample_id = ORDER[position]
        # A stateless fixture transform: any worker can recreate this sample.
        offset = hashlib.sha256(f"{EPOCH}:{sample_id}".encode()).digest()[0] % 4 / 4
        return position, sample_id, sample_id + offset


def assemble(items, prepared):
    positions, ids, targets = zip(*items)
    batch = {
        "batch": positions[0] // BATCH_SIZE, "sample_ids": list(ids), "targets": list(targets),
        "worker_id": get_worker_info().id, "worker_pid": os.getpid(),
    }
    # This reports completed collation, before the loader returns the batch to training.
    prepared.put(batch)
    return batch


def train_batch(batch, weight, optimizer):
    before = weight.item()
    optimizer.zero_grad()
    targets = torch.tensor(batch["targets"], dtype=torch.float64)
    loss = (0.5 * (weight - targets).square()).mean()
    loss.backward()
    grad = weight.grad.item()
    optimizer.step()
    return {**batch, "loss": loss.item(), "weight_before": before, "gradient": grad,
            "momentum_after": optimizer.state[weight]["momentum_buffer"].item(), "weight_after": weight.item()}


def trainer(mode, directory, start, stop):
    torch.set_num_threads(1)
    ctx = mp.get_context("spawn")
    checkpoint = directory / "checkpoint.pt"
    weight = torch.nn.Parameter(torch.zeros((), dtype=torch.float64))
    optimizer = torch.optim.SGD([weight], lr=0.25, momentum=0.5)
    loaded = None
    if mode in ("resumed", "worker_cursor"):
        saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
        if saved["data_identity"] != DATA_IDENTITY:
            raise ValueError("input identity changed since the checkpoint")
        weight.detach().copy_(saved["weight"])
        optimizer.load_state_dict(saved["optimizer"])
        if mode == "resumed":
            start = saved["next_batch"]
        loaded = {"checkpoint_sha256": sha(checkpoint), "checkpoint_next_batch": saved["next_batch"],
                  "weight": weight.item(), "momentum": optimizer.state[weight]["momentum_buffer"].item()}

    ready = ctx.Queue()
    loader = DataLoader(FixedSamples(), batch_size=BATCH_SIZE, sampler=range(start * BATCH_SIZE, len(ORDER)),
                        num_workers=WORKERS, prefetch_factor=PREFETCH, multiprocessing_context=ctx,
                        collate_fn=partial(assemble, prepared=ready), timeout=30)
    iterator = iter(loader)
    updates = []
    written = None
    try:
        for _ in range(start, stop):
            updates.append(train_batch(next(iterator), weight, optimizer))
        # Initial prefetch schedules 4 batches. Each yielded batch schedules one more.
        ready_count = min(len(ORDER) // BATCH_SIZE - start, WORKERS * PREFETCH + len(updates))
        prepared = sorted([ready.get(timeout=30) for _ in range(ready_count)], key=lambda b: b["batch"])
        if mode == "stopped":
            next_batch = updates[-1]["batch"] + 1
            torch.save({"weight": weight.detach().clone(), "optimizer": optimizer.state_dict(),
                        "data_identity": DATA_IDENTITY, "next_batch": next_batch}, checkpoint)
            written = {"sha256": sha(checkpoint), "next_batch": next_batch}
    finally:
        del iterator
        ready.close()
        ready.join_thread()
    report = {"trainer_pid": os.getpid(), "start_batch": start, "prepared": prepared,
              "updates": updates, "loaded": loaded, "checkpoint": written}
    (directory / f"{mode}.json").write_text(json.dumps(report) + "\n")


def run_trainer(mode, directory, start, stop):
    process = mp.get_context("spawn").Process(target=trainer, args=(mode, directory, start, stop))
    process.start()
    process.join(timeout=90)
    if process.is_alive():
        process.terminate()
        process.join()
    if process.exitcode != 0:
        raise RuntimeError(f"{mode} trainer exit code {process.exitcode}")
    return json.loads((directory / f"{mode}.json").read_text())


def model_history(run):
    return [{key: value for key, value in step.items() if key not in ("worker_id", "worker_pid")}
            for step in run["updates"]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("requires PyTorch 2.5.1")
    total_batches = len(ORDER) // BATCH_SIZE
    with tempfile.TemporaryDirectory(prefix="infra-prefetch-resume-") as scratch:
        directory = Path(scratch)
        baseline = run_trainer("baseline", directory, 0, total_batches)
        stopped = run_trainer("stopped", directory, 0, SAVE_AFTER)
        ready_cursor = stopped["prepared"][-1]["batch"] + 1
        resumed = run_trainer("resumed", directory, 0, total_batches)
        wrong = run_trainer("worker_cursor", directory, ready_cursor, total_batches)
    if ready_cursor != 5 or stopped["checkpoint"]["next_batch"] != SAVE_AFTER:
        raise AssertionError("worker and optimizer boundaries must disagree")
    if model_history(stopped) + model_history(resumed) != model_history(baseline):
        raise AssertionError("restore changed the batch order, sample targets or updates")
    if wrong["updates"][-1]["weight_after"] == baseline["updates"][-1]["weight_after"]:
        raise AssertionError("worker-ready cursor must change the update result")
    here = Path(__file__).resolve().parent
    record = {"platform": {"system": platform.system(), "arch": platform.machine(),
                           "python": platform.python_version(), "torch": torch.__version__},
              "config": {**DATA_IDENTITY, "workers": WORKERS, "prefetch_factor": PREFETCH},
              "source_sha256": {name: sha(here / name) for name in ("prefetch_resume.py", "requirements.txt")},
              "baseline": baseline, "stopped": stopped, "resumed": resumed, "worker_cursor": wrong}
    args.output.write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
