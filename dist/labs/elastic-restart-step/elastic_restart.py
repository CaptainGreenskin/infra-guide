"""Prove a real torchrun restart rolls an uncommitted optimizer step back."""

import hashlib
import json
import os
import platform
import re
import socket
import subprocess
import sys
import time
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory

import torch
import torch.distributed as dist
from torch import nn


TARGETS = [[1, 3], [2, 4], [3, 5]]
LR = 1 / 8
MOMENTUM = 1 / 2
FAIL_STEP = 2
FAIL_RANK = 1
FAIL_EXIT = 73
CASES = ("uninterrupted", "restarted", "weights_only")


def log(path, event, **fields):
    with path.open("a", encoding="utf-8") as output:
        output.write(json.dumps({"event": event, **fields}) + "\n")


def state(model, optimizer):
    weight = model.weight
    buffer = optimizer.state.get(weight, {}).get("momentum_buffer")
    return {"weight": weight.item(), "momentum": None if buffer is None else buffer.item()}


def checkpoint_at(path):
    saved = torch.load(path, map_location="cpu", weights_only=True)
    weight = saved["model"]["weight"].item()
    momentum = saved["optimizer"]["state"][0]["momentum_buffer"].item()
    return {"cursor": saved["cursor"], "history": saved["history"], "weight": weight, "momentum": momentum}


def publish(path, cursor, history, model, optimizer):
    temporary = path.with_suffix(".partial")
    with temporary.open("wb") as output:
        torch.save({"cursor": cursor, "history": history, "model": model.state_dict(),
                    "optimizer": optimizer.state_dict()}, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def worker(directory, case):
    torch.set_num_threads(1)
    directory = Path(directory)
    rank = int(os.environ["RANK"])
    attempt = int(os.environ["TORCHELASTIC_RESTART_COUNT"])
    if os.environ["MASTER_ADDR"] != "127.0.0.1" or os.environ["WORLD_SIZE"] != "2" or rank not in (0, 1):
        raise RuntimeError("requires the lab's local two-rank launcher")
    journal = directory / f"worker-{attempt}-{rank}.jsonl"
    checkpoint = directory / "checkpoint.pt"
    dist.init_process_group("gloo", timeout=timedelta(seconds=20))
    try:
        model = nn.Linear(1, 1, bias=False, dtype=torch.float64)
        with torch.no_grad():
            model.weight.zero_()
        optimizer = torch.optim.SGD(model.parameters(), lr=LR, momentum=MOMENTUM)
        cursor, history = 0, []
        if checkpoint.exists():
            saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
            model.load_state_dict(saved["model"])
            if case != "weights_only":
                optimizer.load_state_dict(saved["optimizer"])
            cursor, history = saved["cursor"], saved["history"]
        log(journal, "start", pid=os.getpid(), rank=rank, restart_count=attempt, cursor=cursor,
            **state(model, optimizer))
        replica = nn.parallel.DistributedDataParallel(model)
        feature = torch.ones((1, 1), dtype=torch.float64)
        for index in range(cursor, len(TARGETS)):
            step = index + 1
            optimizer.zero_grad()
            target = TARGETS[index][rank]
            (replica(feature) - target).square().mean().backward()
            gradient = model.weight.grad.item()
            optimizer.step()
            update = {"step": step, "gradient": gradient, **state(model, optimizer)}
            log(journal, "update", cursor_before=index, sample_id=2 * index + rank, target=target, **update)
            dist.barrier()
            if case != "uninterrupted" and attempt == 0 and step == FAIL_STEP:
                log(journal, "cut", checkpoint=checkpoint_at(checkpoint),
                    action="exit" if rank == FAIL_RANK else "wait_for_launcher", **update)
                dist.barrier()
                if rank == FAIL_RANK:
                    os._exit(FAIL_EXIT)
                time.sleep(60)
                raise RuntimeError("torchrun did not stop the healthy peer")
            if rank == 0:
                history = history + [update]
                publish(checkpoint, step, history, model, optimizer)
                log(journal, "commit", **update)
            dist.barrier()
    finally:
        dist.destroy_process_group()


def launch(directory, case):
    directory.mkdir()
    max_restarts = int(case != "uninterrupted")
    interfaces = {name for _, name in socket.if_nameindex()}
    env = dict(os.environ, GLOO_SOCKET_IFNAME="lo0" if "lo0" in interfaces else "lo")
    command = [sys.executable, "-m", "torch.distributed.run", "--nnodes=1", "--nproc-per-node=2",
               "--rdzv-backend=c10d", "--rdzv-endpoint=127.0.0.1:0", "--local-addr=127.0.0.1",
               "--rdzv-id=" + directory.name, "--monitor-interval=0.1", f"--max-restarts={max_restarts}",
               "--log-dir=" + str(directory / "launcher"), str(Path(__file__).resolve()),
               "worker", str(directory), case]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, env=env, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=75)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        # torchrun owns the worker process groups. Let its signal handler stop them.
        if process.poll() is None:
            process.terminate()
        try:
            process.communicate(timeout=35)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        raise
    if process.returncode != 0:
        raise RuntimeError(stderr or stdout)
    failures = [{"exit_code": int(code), "local_rank": int(rank), "pid": int(pid)}
                for code, rank, pid in re.findall(r"failed \(exitcode: (\d+)\) local_rank: (\d+) \(pid: (\d+)\)", stderr)]
    stopped = [{"pid": int(pid), "signal": name}
               for pid, name in re.findall(r"Sending process (\d+) closing signal (\w+)", stderr)]
    attempts = [[list(map(json.loads, (directory / f"worker-{attempt}-{rank}.jsonl").read_text().splitlines()))
                 for rank in range(2)] for attempt in range(max_restarts + 1)]
    return {"launcher": {"exit_code": process.returncode, "max_restarts": max_restarts,
                         "worker_failures": failures, "stopped_peers": stopped},
            "attempts": attempts, "checkpoint": checkpoint_at(directory / "checkpoint.pt")}


def reference(start=0, weight=0, momentum=0):
    result = []
    for index in range(start, len(TARGETS)):
        gradient = 2 * weight - sum(TARGETS[index])
        momentum = MOMENTUM * momentum + gradient
        weight -= LR * momentum
        result.append({"step": index + 1, "gradient": gradient, "weight": weight, "momentum": momentum})
    return result


def verify(cases, expected):
    first = expected[0]
    lost = expected[1]
    for name, run in cases.items():
        interrupted = name != "uninterrupted"
        wrong = name == "weights_only"
        final = expected if not wrong else [first] + reference(1, first["weight"], 0)
        assert run["checkpoint"] == {"cursor": 3, "history": final,
                                     "weight": final[-1]["weight"], "momentum": final[-1]["momentum"]}
        launcher = run["launcher"]
        assert launcher["max_restarts"] == int(interrupted)
        first_workers = [events[0]["pid"] for events in run["attempts"][0]]
        assert launcher["worker_failures"] == ([{"exit_code": FAIL_EXIT, "local_rank": FAIL_RANK,
                                                "pid": first_workers[FAIL_RANK]}] if interrupted else [])
        assert launcher["stopped_peers"] == ([{"pid": first_workers[0], "signal": "SIGTERM"}] if interrupted else [])
        if interrupted:
            new_workers = [events[0]["pid"] for events in run["attempts"][1]]
            assert len(set(first_workers + new_workers)) == 4
        for attempt, workers in enumerate(run["attempts"]):
            for rank, events in enumerate(workers):
                start, *entries = events
                assert start == {"event": "start", "pid": start["pid"], "rank": rank,
                                 "restart_count": attempt, "cursor": attempt,
                                 "weight": first["weight"] if attempt else 0,
                                 "momentum": first["momentum"] if attempt and not wrong else None}
                crash_attempt = interrupted and attempt == 0
                steps = expected[:2] if crash_attempt else final[attempt:]
                wanted = []
                for update in steps:
                    index = update["step"] - 1
                    wanted.append({"event": "update", "cursor_before": index, "sample_id": 2 * index + rank,
                                   "target": TARGETS[index][rank], **update})
                    if crash_attempt and update == lost:
                        wanted.append({"event": "cut", "checkpoint": {"cursor": 1, "history": [first],
                                       "weight": first["weight"], "momentum": first["momentum"]},
                                       "action": "exit" if rank == FAIL_RANK else "wait_for_launcher", **lost})
                    elif rank == 0:
                        wanted.append({"event": "commit", **update})
                assert entries == wanted, (name, attempt, rank, entries)
    assert cases["weights_only"]["checkpoint"] != cases["uninterrupted"]["checkpoint"]


def main():
    with TemporaryDirectory(prefix="elastic-restart-step-") as directory:
        cases = {name: launch(Path(directory) / name, name) for name in CASES}
    expected = reference()
    verify(cases, expected)
    folder = Path(__file__).resolve().parent
    report = {"status": "passed", "environment": {"python": platform.python_version(), "torch": str(torch.__version__),
                                                  "system": platform.system(), "arch": platform.machine(),
                                                  "launcher": "torch.distributed.run", "backend": "gloo", "device": "cpu"},
              "fixture": {"input": 1, "targets": TARGETS, "lr": LR, "momentum": MOMENTUM,
                          "fail_step": FAIL_STEP, "fail_rank": FAIL_RANK, "world_size": 2},
              "reference": expected, "cases": cases,
              "scope": "Single host, two CPU ranks, fixed inputs, one real worker exit and group restart per fault case. Only the checkpoint after the completed update is authoritative.",
              "source_sha256": {name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
                                for name in ["elastic_restart.py", "requirements.txt", "README.md"]}}
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "worker":
        worker(sys.argv[2], sys.argv[3])
    else:
        main()
