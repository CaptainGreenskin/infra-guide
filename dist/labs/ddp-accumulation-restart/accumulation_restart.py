"""Observe a real two-rank torchrun restart inside a DDP accumulation window."""

import argparse
from contextlib import nullcontext
from datetime import timedelta
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time

import torch
import torch.distributed as dist
from torch import nn


TARGETS = ((1, 3), (5, 7), (2, 4), (6, 8))
WINDOW = 2
LEARNING_RATE = 0.25
MOMENTUM = 0.5
FAIL_MICRO = 2
FAIL_RANK = 1
FAIL_EXIT = 73
CASES = ("continuous", "replay_window", "skip_consumed")
SOURCE = Path(__file__).resolve()


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def journal_path(directory, attempt, rank):
    return directory / f"rank-{rank}-attempt-{attempt}.jsonl"


def events(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def log(path, event, **fields):
    with path.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({"event": event, **fields}) + "\n")


def summarize_checkpoint(saved):
    return {
        "next_micro": saved["next_micro"],
        "weight": saved["model"]["weight"].item(),
        "momentum": saved["optimizer"]["state"][0]["momentum_buffer"].item(),
    }


def read_checkpoint(path):
    return torch.load(path, map_location="cpu", weights_only=True)


def publish(path, next_micro, model, optimizer):
    temporary = path.with_suffix(".partial")
    with temporary.open("wb") as stream:
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                    "next_micro": next_micro}, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def worker(directory, case):
    torch.set_num_threads(1)
    rank = int(os.environ["RANK"])
    attempt = int(os.environ["TORCHELASTIC_RESTART_COUNT"])
    if os.environ["WORLD_SIZE"] != "2" or rank not in (0, 1):
        raise RuntimeError("requires the lab's local two-rank launcher")
    checkpoint = directory / "checkpoint.pt"
    journal = journal_path(directory, attempt, rank)
    dist.init_process_group("gloo", timeout=timedelta(seconds=20))
    try:
        model = nn.Linear(1, 1, bias=False, dtype=torch.float64)
        with torch.no_grad():
            model.weight.zero_()
        optimizer = torch.optim.SGD(model.parameters(), lr=LEARNING_RATE, momentum=MOMENTUM)
        loaded, loaded_sha = None, None
        if checkpoint.exists():
            saved = read_checkpoint(checkpoint)
            loaded, loaded_sha = summarize_checkpoint(saved), sha256(checkpoint)
            model.load_state_dict(saved["model"])
            optimizer.load_state_dict(saved["optimizer"])
        committed_cursor = 0 if loaded is None else loaded["next_micro"]
        if committed_cursor % WINDOW:
            raise RuntimeError("checkpoint must end at a complete window")
        start_micro = committed_cursor
        if attempt and case == "skip_consumed":
            # This deliberately confuses an input-consumption journal with a commit.
            old_events = events(journal_path(directory, attempt - 1, rank))
            start_micro = 1 + max(row["micro"] for row in old_events if row["event"] == "backward")
        ddp = nn.parallel.DistributedDataParallel(model)
        log(journal, "start", rank=rank, attempt=attempt, pid=os.getpid(),
            loaded=loaded, checkpoint_sha256=loaded_sha, start_micro=start_micro,
            grad_is_none=model.weight.grad is None)
        x = torch.ones(1, 1, dtype=torch.float64)
        optimizer.zero_grad(set_to_none=True)
        for micro in range(start_micro, len(TARGETS)):
            update = (micro + 1) % WINDOW == 0
            target = TARGETS[micro][rank]
            with nullcontext() if update else ddp.no_sync():
                loss = 0.5 * (ddp(x) - target).square().sum()
                (loss / WINDOW).backward()
            gradient = model.weight.grad.item()
            log(journal, "backward", micro=micro, sample_id=2 * micro + rank,
                target=target, synchronized=update, gradient=gradient)
            if case != "continuous" and attempt == 0 and micro == FAIL_MICRO:
                log(journal, "cut", micro=micro,
                    checkpoint=summarize_checkpoint(read_checkpoint(checkpoint)),
                    checkpoint_sha256=sha256(checkpoint),
                    action="exit" if rank == FAIL_RANK else "wait_for_launcher")
                dist.barrier()
                if rank == FAIL_RANK:
                    os._exit(FAIL_EXIT)
                time.sleep(45)
                raise RuntimeError("torchrun did not stop the surviving worker")
            if update:
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                log(journal, "update", last_micro=micro, gradient=gradient,
                    weight=model.weight.item(),
                    momentum=optimizer.state[model.weight]["momentum_buffer"].item())
                dist.barrier()
                if rank == 0:
                    publish(checkpoint, micro + 1, model, optimizer)
                    log(journal, "commit", checkpoint=summarize_checkpoint(read_checkpoint(checkpoint)),
                        checkpoint_sha256=sha256(checkpoint))
                dist.barrier()
    finally:
        dist.destroy_process_group()


def launch(directory, case):
    directory.mkdir()
    max_restarts = int(case != "continuous")
    interfaces = {name for _, name in socket.if_nameindex()}
    env = dict(os.environ, GLOO_SOCKET_IFNAME="lo0" if "lo0" in interfaces else "lo",
               OMP_NUM_THREADS="1")
    options = ["--nnodes=1", "--nproc-per-node=2", "--rdzv-backend=c10d",
               "--rdzv-endpoint=127.0.0.1:0", "--local-addr=127.0.0.1",
               "--monitor-interval=0.1", f"--max-restarts={max_restarts}"]
    command = [sys.executable, "-B", "-m", "torch.distributed.run", *options,
               "--rdzv-id=" + case, "--log-dir=" + str(directory / "launcher"),
               str(SOURCE), "--worker", case, str(directory)]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, env=env, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=55)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        # Let torchrun stop its own worker process groups.
        process.terminate()
        try:
            process.communicate(timeout=35)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate(timeout=5)
        raise
    if process.returncode != 0:
        raise RuntimeError(stderr or stdout)
    failures = [
        {"exit_code": int(code), "local_rank": int(rank), "pid": int(pid)}
        for code, rank, pid in re.findall(
            r"failed \(exitcode: (\d+)\) local_rank: (\d+) \(pid: (\d+)\)", stderr
        )
    ]
    stopped = [
        {"pid": int(pid), "signal": signal}
        for pid, signal in re.findall(r"Sending process (\d+) closing signal (\w+)", stderr)
    ]
    if len(failures) != max_restarts or len(stopped) != max_restarts:
        raise RuntimeError("unexpected launcher failure or stop records:\n" + stderr)
    checkpoint = directory / "checkpoint.pt"
    return {
        "launcher": {"exit_code": process.returncode, "options": options,
                     "worker_failures": failures, "stopped_peers": stopped},
        "attempts": [[events(journal_path(directory, attempt, rank)) for rank in range(2)]
                     for attempt in range(max_restarts + 1)],
        "final": summarize_checkpoint(read_checkpoint(checkpoint)),
        "final_checkpoint_sha256": sha256(checkpoint),
    }


def record(directory):
    runs = {case: launch(directory / case, case) for case in CASES}
    if runs["continuous"]["final"] != runs["replay_window"]["final"]:
        raise AssertionError("whole-window replay differs from uninterrupted training")
    if runs["continuous"]["final"] == runs["skip_consumed"]["final"]:
        raise AssertionError("skipping a consumed microbatch did not change the final state")
    return {
        "schema_version": 1,
        "status": "passed",
        "environment": {"os": platform.system(), "arch": platform.machine(),
                        "python": platform.python_version(), "torch": str(torch.__version__),
                        "backend": "gloo", "device": "cpu", "world_size": 2},
        "fixture": {"targets": TARGETS, "microbatches_per_window": WINDOW,
                    "learning_rate": LEARNING_RATE, "momentum_coefficient": MOMENTUM,
                    "fault": {"micro": FAIL_MICRO, "rank": FAIL_RANK, "exit_code": FAIL_EXIT}},
        "source_sha256": {path.name: sha256(path) for path in (SOURCE, SOURCE.with_name("requirements.txt"))},
        "runs": runs,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, help="retain journals and checkpoints in a new directory")
    parser.add_argument("--worker", nargs=2, metavar=("CASE", "DIRECTORY"), help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        case, directory = args.worker
        worker(Path(directory), case)
        return
    if not dist.is_gloo_available():
        parser.error("this lab requires a PyTorch build with Gloo")
    if args.work_dir is None:
        with TemporaryDirectory(prefix="ddp-accumulation-") as temporary:
            result = record(Path(temporary))
    else:
        directory = args.work_dir.resolve()
        directory.mkdir()
        result = record(directory)
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
