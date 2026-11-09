"""Run real two-rank CPU/Gloo DDP with one short input iterator."""

import copy
import hashlib
import json
import platform
import tempfile
import time
from contextlib import nullcontext
from datetime import timedelta
from pathlib import Path

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch.nn.parallel import DistributedDataParallel as DDP


TARGETS = ((2, 8), (6,))
SCENARIOS = ("no_join", "fail_fast", "initial_world", "active_world")


def step(model, optimizer, target):
    optimizer.zero_grad()
    prediction = model(torch.ones((1, 1), dtype=torch.float64)).squeeze()
    ((prediction - target).square() / 2).backward()
    gradient = model.module.weight.grad.item()
    optimizer.step()
    return {"target": target, "gradient": gradient, **state(model, optimizer)}


def state(model, optimizer):
    weight = model.module.weight
    return {
        "weight": weight.item(),
        "momentum": optimizer.state[weight]["momentum_buffer"].item(),
    }


def verify_next_step(model, optimizer):
    saved_model = copy.deepcopy(model.module.state_dict())
    saved_optimizer = copy.deepcopy(optimizer.state_dict())

    # A fresh, balanced step uses the same reduced gradient but local momentum.
    stale = step(model, optimizer, target=5)

    model.module.load_state_dict(saved_model)
    optimizer.load_state_dict(saved_optimizer)
    buffer = optimizer.state[model.module.weight]["momentum_buffer"]
    # This model has exactly one optimizer tensor; rank 0 is the last active rank.
    dist.broadcast(buffer, src=0)
    repaired = step(model, optimizer, target=5)
    return {"stale": stale, "restored": repaired}


def worker(rank, scenario, directory):
    torch.set_num_threads(1)
    dist.init_process_group(
        "gloo", init_method=(directory / "rendezvous").as_uri(), rank=rank,
        world_size=2, timeout=timedelta(seconds=4),
    )
    out = {"rank": rank, "steps": [], "outcome": "completed"}
    try:
        raw = torch.nn.Linear(1, 1, bias=False, dtype=torch.float64)
        with torch.no_grad():
            raw.weight.zero_()
        model = DDP(raw)
        optimizer = torch.optim.SGD(model.parameters(), lr=0.25, momentum=0.5)

        context = nullcontext() if scenario == "no_join" else model.join(
            divide_by_initial_world_size=scenario != "active_world",
            throw_on_early_termination=scenario == "fail_fast",
        )
        try:
            with context:
                for target in TARGETS[rank]:
                    out["steps"].append(step(model, optimizer, target))
                if scenario == "no_join" and rank == 1:
                    # Keep the peer alive without issuing a matching collective.
                    until = time.monotonic() + 12
                    while not (directory / "rank-0.json").exists():
                        if time.monotonic() > until:
                            raise RuntimeError("The bounded no-Join probe did not finish")
                        time.sleep(0.05)
                    out["outcome"] = "exhausted_without_collective"
        except RuntimeError as exc:
            message = str(exc)
            if scenario == "no_join" and rank == 0 and "Timed out" in message:
                out["outcome"] = "gloo_timeout"
            elif scenario == "fail_fast" and rank == 0 and "exhausted inputs" in message:
                out["outcome"] = "peer_exhausted"
            elif scenario == "fail_fast" and rank == 1 and "exhausted all inputs" in message:
                out["outcome"] = "local_exhausted"
            else:
                raise
            out["runtime_error"] = message.splitlines()[0]
        out["after_iterator"] = state(model, optimizer)
        if scenario == "initial_world":
            out["next_balanced_step"] = verify_next_step(model, optimizer)
        (directory / f"rank-{rank}.json").write_text(json.dumps(out))
    finally:
        dist.destroy_process_group()


def main():
    outcomes = {}
    for scenario in SCENARIOS:
        with tempfile.TemporaryDirectory(prefix="ddp-uneven-join-") as temp:
            directory = Path(temp)
            mp.spawn(worker, args=(scenario, directory), nprocs=2)
            outcomes[scenario] = [
                json.loads((directory / f"rank-{rank}.json").read_text())
                for rank in range(2)
            ]
    folder = Path(__file__).resolve().parent
    digests = {
        name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
        for name in ("ddp_uneven_join.py", "requirements.txt")
    }
    print(json.dumps({
        "status": "passed",
        "environment": {"torch": torch.__version__, "python": platform.python_version(),
                        "platform": platform.system(), "machine": platform.machine(),
                        "device": "cpu", "backend": "gloo"},
        "source_sha256": digests,
        "targets": [list(row) for row in TARGETS],
        "outcomes": outcomes,
    }, indent=2))


if __name__ == "__main__":
    main()
