"""Collect rank, binding and tiny collective evidence, or check four records offline."""
import argparse
from datetime import timedelta
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys
import uuid


SOURCE = Path(__file__).resolve()
MEMBERS = [(rank, rank % 2, rank // 2) for rank in range(4)]
GATHER_EXPECTED = [1, 2, 3, 4]
SUM_EXPECTED = 10
TARGET_WHEELS = {"2.5.1": "12.4", "2.7.1": "12.8"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def session_tag(session, kind, value):
    return digest(f"{session}:{kind}:{value}".encode())


def boot_identity():
    if platform.system() == "Linux":
        value = Path("/proc/sys/kernel/random/boot_id").read_text()
    elif platform.system() == "Darwin":
        value = subprocess.check_output(["sysctl", "-n", "kern.bootsessionuuid"], text=True, timeout=10)
    else:
        raise RuntimeError("boot identity probe requires Linux or macOS")
    return str(uuid.UUID(value.strip()))


def full_gpu_identity(torch, index):
    properties = torch.cuda.get_device_properties(index)
    device_uuid = str(uuid.UUID(str(properties.uuid)))
    inventory_env = dict(os.environ)
    inventory_env.pop("NVML_MPS_DEVICE_ENUMERATION", None)
    visible_full_gpus = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=uuid", "--format=csv,noheader"],
        text=True, env=inventory_env, timeout=15,
    )
    if "gpu-" + device_uuid not in {line.strip().lower() for line in visible_full_gpus.splitlines()}:
        raise RuntimeError("bound CUDA UUID did not match a full-GPU inventory entry")
    return device_uuid


def run_worker(args):
    import torch
    import torch.distributed as dist

    rank, local, group, world, local_world = (
        int(os.environ[key]) for key in ("RANK", "LOCAL_RANK", "GROUP_RANK", "WORLD_SIZE", "LOCAL_WORLD_SIZE")
    )
    if (rank, local, group) not in MEMBERS or (world, local_world) != (4, 2):
        raise RuntimeError("requires two launchers with two fixed ranks each")
    if not re.fullmatch(r"[0-9a-f]{32}", args.session):
        raise RuntimeError("use one 32-digit lowercase hex session identifier on both launchers")
    boot_tag = session_tag(args.session, "boot", boot_identity())
    index, visible_count, gpu_tag, capability, cuda, nccl = None, 0, None, None, None, None
    if args.device == "cuda":
        if platform.system() != "Linux" or not torch.cuda.is_available() or not dist.is_nccl_available():
            raise RuntimeError("target mode requires Linux with CUDA and PyTorch NCCL")
        visible_count = torch.cuda.device_count()
        if visible_count < 2:
            raise RuntimeError("each launcher needs at least two visible CUDA devices")
        torch.cuda.set_device(local)
        index = torch.cuda.current_device()
        gpu_tag = session_tag(args.session, "gpu", full_gpu_identity(torch, index))
        capability = list(torch.cuda.get_device_capability(index))
        device = torch.device("cuda", index)
        backend = "nccl"
        cuda, nccl = torch.version.cuda, list(torch.cuda.nccl.version())
    else:
        device, backend = torch.device("cpu"), "gloo"
    dist.init_process_group(backend, timeout=timedelta(seconds=45))
    try:
        value = torch.tensor([rank + 1], dtype=torch.int64, device=device)
        gathered = [torch.empty_like(value) for _ in range(world)]
        dist.all_gather(gathered, value)
        dist.all_reduce(value, op=dist.ReduceOp.SUM)
        # Reading back the values forces the CUDA work used by this probe to complete.
        ordered, summed = [int(item.item()) for item in gathered], int(value.item())
        if ordered != GATHER_EXPECTED or summed != SUM_EXPECTED:
            raise RuntimeError("collective values did not match the expected rank contributions")
        record = {
            "schema": 1, "session": args.session, "source_sha256": digest(SOURCE.read_bytes()),
            "rank": dist.get_rank(), "local_rank": local, "group_rank": group,
            "world_size": dist.get_world_size(), "local_world_size": local_world,
            "system": platform.system(), "boot_tag": boot_tag, "backend": str(dist.get_backend()),
            "device": device.type, "cuda_index": index, "visible_cuda_devices": visible_count,
            "full_gpu_tag": gpu_tag, "cuda_capability": capability, "torch": str(torch.__version__), "cuda": cuda, "nccl": nccl,
            "gathered": ordered, "sum": summed,
        }
        args.out_dir.mkdir(parents=True, exist_ok=True)
        with (args.out_dir / f"rank-{rank}.json").open("x", encoding="utf-8") as output:
            json.dump(record, output, indent=2)
            output.write("\n")
    finally:
        dist.destroy_process_group()


def tag_is_valid(value):
    return isinstance(value, str) and bool(re.fullmatch(r"[0-9a-f]{64}", value))


def numeric_tuple(value, size):
    return isinstance(value, list) and len(value) == size and all(
        type(item) is int and item >= 0 for item in value)


def evaluate(rows):
    failures = []
    if len(rows) != 4 or any(not isinstance(row, dict) or type(row.get("rank")) is not int for row in rows):
        return {"target_ready": False, "blockers": ["four_rank_records_required"]}
    rows = sorted(rows, key=lambda row: row["rank"])
    if [(row["rank"], row.get("local_rank"), row.get("group_rank")) for row in rows] != MEMBERS:
        failures.append("rank_layout")
    if any(row.get("schema") != 1 or row.get("world_size") != 4 or row.get("local_world_size") != 2 for row in rows):
        failures.append("world_contract")
    session = rows[0].get("session")
    if not isinstance(session, str) or not re.fullmatch(r"[0-9a-f]{32}", session) or any(
            row.get("session") != session for row in rows):
        failures.append("session_mismatch")
    if any(row.get("source_sha256") != digest(SOURCE.read_bytes()) for row in rows):
        failures.append("source_mismatch")
    if any(row.get("gathered") != GATHER_EXPECTED or row.get("sum") != SUM_EXPECTED for row in rows):
        failures.append("collective_result")
    boots = [row.get("boot_tag") for row in rows]
    if not (all(tag_is_valid(boot) for boot in boots) and boots[0] == boots[1]
            and boots[2] == boots[3] and boots[0] != boots[2]):
        failures.append("two_distinct_kernels")
    if any(row.get("system") != "Linux" or row.get("backend") != "nccl" or row.get("device") != "cuda" for row in rows):
        failures.append("linux_cuda_nccl")
    if any(type(row.get("cuda_index")) is not int or row["cuda_index"] != row.get("local_rank")
           or type(row.get("visible_cuda_devices")) is not int or row["visible_cuda_devices"] < 2
           or not numeric_tuple(row.get("cuda_capability"), 2) for row in rows):
        failures.append("cuda_binding")
    gpus = [row.get("full_gpu_tag") for row in rows]
    if not all(tag_is_valid(gpu) for gpu in gpus) or len(set(gpus)) != 4:
        failures.append("four_distinct_full_gpu_uuids")
    runtime = [tuple(row.get(key) for key in ("torch", "cuda", "nccl")) for row in rows]
    torch_version, cuda, nccl = runtime[0]
    build = torch_version.split("+")[0] if isinstance(torch_version, str) else None
    if (build not in TARGET_WHEELS or TARGET_WHEELS[build] != cuda
            or not isinstance(nccl, list) or not numeric_tuple(nccl[:3], 3)
            or any(item != runtime[0] for item in runtime)):
        failures.append("matching_target_runtime")
    if any(row.get("cuda_capability") == [12, 0] for row in rows) and (build, cuda) != ("2.7.1", "12.8"):
        failures.append("sm120_requires_blackwell_wheel")
    return {"target_ready": not failures, "blockers": failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    worker = commands.add_parser("worker")
    worker.add_argument("--device", choices=["cpu", "cuda"], required=True)
    worker.add_argument("--session", required=True)
    worker.add_argument("--out-dir", type=Path, required=True)
    check = commands.add_parser("check")
    check.add_argument("records", nargs="+", type=Path)
    args = parser.parse_args()
    if args.command == "worker":
        run_worker(args)
    else:
        result = evaluate([json.loads(file.read_text()) for file in args.records])
        print(json.dumps(result, indent=2))
        return 0 if result["target_ready"] else 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
