"""Resume the existing 664-parameter TinyDecoder in a fresh Apple GPU process."""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile


os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "0"
import torch
from torch.nn.attention import SDPBackend, sdpa_kernel

from tiny_decoder import TinyDecoder, loss_sum


SOURCE = "724963cf4a04ac76f6b7d125876d0be1947b1b29a6b0a159a5bb347477dc3e6f"
ROWS = [[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]]
TARGETS = [[[1, -100, -100, -100], [5, 6, 7, -100]],
           [[1, 2, 3, -100], [-100, -100, -100, 0]]]
MODES = ["continuous", "save", "resume", "omit_momentum", "omit_rng"]
TOTAL_STEPS = 6
SPLIT_STEP = 3
INITIAL_SEED = 7
MPS_SEED = 33


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def state_summary(model, optimizer):
    parameters = list(model.parameters())
    momentum = [optimizer.state[p]["momentum_buffer"] for p in parameters if p in optimizer.state]
    require(all(p.device.type == "mps" for p in parameters + momentum), "state is not on MPS")
    model_values = torch.cat([p.detach().cpu().reshape(-1) for p in parameters])
    momentum_values = torch.cat([p.cpu().reshape(-1) for p in momentum]) if momentum else torch.empty(0)
    rng = torch.mps.get_rng_state().tolist()
    token_momentum = optimizer.state.get(model.token.weight, {}).get("momentum_buffer")
    return {
        "model_sha256": sha256(bytes(model_values.view(torch.uint8).tolist())),
        "momentum_sha256": sha256(bytes(momentum_values.view(torch.uint8).tolist())),
        "momentum_values": momentum_values.numel(),
        "mps_rng_sha256": sha256(bytes(rng)),
        "token_weight_1_0": model.token.weight[1, 0].item(),
        "token_momentum_1_0": token_momentum[1, 0].item() if token_momentum is not None else None,
        "model_vector": model_values.tolist(),
        "momentum_vector": momentum_values.tolist(),
    }


def run_worker(mode, checkpoint):
    require(torch.__version__ == "2.5.1" and torch.backends.mps.is_available(), "need PyTorch 2.5.1 and MPS")
    torch.set_num_threads(1)
    torch.manual_seed(INITIAL_SEED)
    torch.mps.manual_seed(MPS_SEED)
    model = TinyDecoder().to(device="mps", dtype=torch.float32)
    require(sum(p.numel() for p in model.parameters()) == 664, "unexpected TinyDecoder size")
    optimizer = torch.optim.SGD(model.parameters(), lr=0.05, momentum=0.5, foreach=False)
    inputs = torch.tensor([row[:-1] for row in ROWS], device="mps")
    targets = torch.tensor(TARGETS, device="mps")
    start, checkpoint_sha = 0, None
    end = SPLIT_STEP if mode == "save" else TOTAL_STEPS
    if mode in ("resume", "omit_momentum", "omit_rng"):
        checkpoint_sha = sha256(checkpoint.read_bytes())
        state = torch.load(checkpoint, map_location="cpu", weights_only=True)
        start = state["next_step"]
        require(start == SPLIT_STEP, "unexpected checkpoint cursor")
        model.load_state_dict(state["model"])
        if mode != "omit_momentum":
            optimizer.load_state_dict(state["optimizer"])
        if mode != "omit_rng":
            torch.mps.set_rng_state(state["mps_rng"])

    initial = state_summary(model, optimizer)
    steps = []
    with sdpa_kernel(backends=[SDPBackend.MATH]):
        for step in range(start, end):
            # The original model has no Dropout. A native MPS draw selects this update's supervision plan.
            plan = int(torch.randint(0, len(TARGETS), (1,), device="mps").item())
            optimizer.zero_grad(set_to_none=True)
            logits = model(inputs)
            loss = loss_sum(logits, targets[plan]) / 4
            loss.backward()
            gradient = model.token.weight.grad
            require(logits.device.type == gradient.device.type == "mps", "model did not execute on MPS")
            optimizer.step()
            torch.mps.synchronize()
            steps.append({
                "step": step, "plan": plan, "loss": loss.item(),
                "token_weight_1_0": model.token.weight[1, 0].item(),
                "token_grad_1_0": gradient[1, 0].item(),
                "logits_device": str(logits.device), "gradient_device": str(gradient.device),
            })
    final = state_summary(model, optimizer)
    if mode == "save":
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                    "mps_rng": torch.mps.get_rng_state(), "next_step": end}, checkpoint)
        checkpoint_sha = sha256(checkpoint.read_bytes())
    return {"mode": mode, "pid": os.getpid(), "start": start, "next_step": end, "steps": steps,
            "checkpoint_sha256": checkpoint_sha, "initial": initial, "final": final,
            "device_allocated_bytes": torch.mps.current_allocated_memory()}


def maximum_difference(left, right):
    return max(abs(a - b) for a, b in zip(left, right, strict=True))


def plans(run):
    return [step["plan"] for step in run["steps"]]


def compare(runs):
    continuous, save, resume, omit_momentum, omit_rng = [runs[mode] for mode in MODES]
    require(len({run["pid"] for run in runs.values()}) == len(MODES), "expected five different processes")
    require(all(run["device_allocated_bytes"] > 0 for run in runs.values()), "missing GPU allocation")
    probes = ("loss", "token_weight_1_0", "token_grad_1_0")
    require(all(math.isfinite(step[key]) for run in runs.values() for step in run["steps"] for key in probes),
            "non-finite training probe")
    require(continuous["steps"] == save["steps"] + resume["steps"], "resumed steps differ from uninterrupted steps")
    require(save["final"] == resume["initial"], "checkpoint did not restore model, momentum and MPS RNG")
    for run in (resume, omit_momentum, omit_rng):
        require(run["checkpoint_sha256"] == save["checkpoint_sha256"], "different checkpoint bytes")
    require(omit_momentum["initial"]["momentum_values"] == 0, "momentum was not omitted")
    require(omit_momentum["initial"]["mps_rng_sha256"] == resume["initial"]["mps_rng_sha256"], "changed RNG in momentum control")
    require(omit_rng["initial"]["momentum_sha256"] == resume["initial"]["momentum_sha256"], "changed momentum in RNG control")
    require(omit_rng["initial"]["mps_rng_sha256"] != resume["initial"]["mps_rng_sha256"], "RNG was not omitted")
    for control in (omit_momentum, omit_rng):
        require(control["initial"]["model_sha256"] == resume["initial"]["model_sha256"], "changed weights in a control")
    require(plans(omit_momentum) == plans(resume) and plans(omit_rng) != plans(resume), "unexpected plan control")
    differences = {
        mode: {
            "max_weight_abs_diff": maximum_difference(continuous["final"]["model_vector"], run["final"]["model_vector"]),
            "max_momentum_abs_diff": maximum_difference(continuous["final"]["momentum_vector"], run["final"]["momentum_vector"]),
        }
        for mode, run in [("resume", resume), ("omit_momentum", omit_momentum), ("omit_rng", omit_rng)]
    }
    require(continuous["final"] == resume["final"], "full restore diverged")
    require(all(differences[mode]["max_weight_abs_diff"] > 1e-4 for mode in ("omit_momentum", "omit_rng")),
            "missing-state controls failed to diverge")
    return differences


def run():
    here = Path(__file__).resolve().parent
    require(sha256((here / "tiny_decoder.py").read_bytes()) == SOURCE, "unexpected original model revision")
    with tempfile.TemporaryDirectory(prefix="mps-checkpoint-resume-") as directory:
        checkpoint = str(Path(directory) / "step-3.pt")
        runs = {}
        for mode in MODES:
            child = subprocess.run([sys.executable, "-B", __file__, "--worker", mode, "--checkpoint", checkpoint],
                                   check=True, text=True, capture_output=True, timeout=60)
            runs[mode] = json.loads(child.stdout)
    differences = compare(runs)
    for run in runs.values():
        for key in ("initial", "final"):
            for vector in ("model_vector", "momentum_vector"):
                del run[key][vector]
    device = subprocess.run(["/usr/sbin/system_profiler", "SPDisplaysDataType", "-json"],
                            check=True, text=True, capture_output=True, timeout=10)
    gpu = json.loads(device.stdout)["SPDisplaysDataType"][0]["sppci_model"]
    return {
        "schema": "infra-mps-checkpoint-resume-v1", "status": "passed",
        "environment": {"platform": f"{platform.system()} {platform.machine()}", "macos": platform.mac_ver()[0],
                        "python": platform.python_version(), "torch": str(torch.__version__), "gpu": gpu,
                        "pytorch_enable_mps_fallback": os.environ["PYTORCH_ENABLE_MPS_FALLBACK"]},
        "fixture": {"parameters": 664, "rows": ROWS, "targets": TARGETS, "steps": TOTAL_STEPS, "checkpoint_next_step": SPLIT_STEP,
                    "optimizer": {"type": "SGD", "lr": 0.05, "momentum": 0.5}, "mps_seed": MPS_SEED},
        "source_sha256": {name: sha256((here / name).read_bytes())
                          for name in ("mps_resume.py", "tiny_decoder.py", "requirements.txt", "README.md")},
        "runs": runs, "comparisons_with_continuous": differences,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", choices=MODES, help=argparse.SUPPRESS)
    parser.add_argument("--checkpoint", type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    result = run_worker(args.worker, args.checkpoint) if args.worker else run()
    print(json.dumps(result, indent=2, sort_keys=True))
