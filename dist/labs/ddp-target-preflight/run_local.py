"""Run the same rank probe using two real local torchrun launchers and CPU/Gloo."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import time

from target_probe import SOURCE, evaluate


def cleanup(processes):
    for process in processes:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()


def launch_local(folder, session):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, OMP_NUM_THREADS="1")
    processes, streams = [], []
    try:
        for group in (0, 1):
            log = (folder / f"launcher-{group}.log").open("w")
            streams.append(log)
            processes.append(subprocess.Popen(
                [sys.executable, "-B", "-m", "torch.distributed.run", "--nnodes=2", "--nproc-per-node=2",
                 f"--node-rank={group}", "--master-addr=127.0.0.1", f"--master-port={port}",
                 "--max-restarts=0", str(SOURCE), "worker", "--device=cpu", "--session", session,
                 "--out-dir", str(folder)], stdout=log, stderr=subprocess.STDOUT,
                env=env, start_new_session=True,
            ))
        deadline = time.monotonic() + 90
        while any(process.poll() is None for process in processes):
            if any(process.poll() not in (None, 0) for process in processes):
                break
            if time.monotonic() > deadline:
                break
            time.sleep(0.05)
    finally:
        cleanup(processes)
        for stream in streams:
            stream.close()
    statuses = [process.returncode for process in processes]
    if statuses != [0, 0]:
        raise RuntimeError(f"local launch failed: {statuses}\n" +
                           "\n".join(log.read_text()[-2000:] for log in folder.glob("launcher-*.log")))
    return statuses


def main():
    session = secrets.token_hex(16)
    with tempfile.TemporaryDirectory(prefix="ddp-target-preflight-") as temporary:
        folder = Path(temporary)
        statuses = launch_local(folder, session)
        rows = [json.loads((folder / f"rank-{rank}.json").read_text()) for rank in range(4)]
        verdict = evaluate(rows)
        result = subprocess.run([sys.executable, "-B", str(SOURCE), "check"] +
                                [str(folder / f"rank-{rank}.json") for rank in range(4)],
                                capture_output=True, text=True, timeout=15)
        assert result.returncode == 2 and json.loads(result.stdout) == verdict
    assert verdict == {"target_ready": False, "blockers": [
        "two_distinct_kernels", "linux_cuda_nccl", "cuda_binding",
        "four_distinct_full_gpu_uuids", "matching_target_runtime",
    ]}
    hashes = {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in (SOURCE, Path(__file__))}
    print(json.dumps({
        "status": "passed", "source_sha256": hashes, "target_execution": "not_run",
        "local_environment": {"launchers": 2, "physical_hosts": 1, "backend": "gloo", "device": "cpu"},
        "launcher_exit_codes": statuses, "rank_records": rows, "target_gate": verdict,
        "target_gate_exit_code": result.returncode,
    }, indent=2))


if __name__ == "__main__":
    main()
