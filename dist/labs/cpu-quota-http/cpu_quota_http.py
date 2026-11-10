#!/usr/bin/env python3
"""Run the same finite HTTP load against two native Linux CPU quotas."""

from argparse import ArgumentParser
from pathlib import Path
import hashlib
import json
import subprocess
import uuid


ROOT = Path(__file__).resolve().parent
OFFER_COUNT = 100
WAITING_SLOTS = 4
QUOTAS = {"wide": "1.0", "tight": "0.25"}


def docker(*args, timeout=15):
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"docker {args[0]} exited {result.returncode}")
    return result.stdout


def run_case(image, source, quota, iterations, interval_ms):
    name = f"infraguide-cpu-quota-{uuid.uuid4().hex}"
    label = f"org.infraguide.cpu-quota-http={name}"
    common = ("--pull=never", "--read-only", "--cgroupns=private", "--cap-drop=ALL", "--label", label)
    try:
        docker("run", "--detach", "--name", name, "--network=none", f"--cpus={quota}",
               *common, image, "python", "-c", source, "serve", str(iterations), str(WAITING_SLOTS))
        result = json.loads(docker(
            "run", "--rm", f"--network=container:{name}", *common,
            image, "python", "-c", source, "load", str(iterations), str(OFFER_COUNT),
            str(interval_ms), timeout=60,
        ))
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(f"{quota} CPU run failed\n{error}") from error
    finally:
        # Select only this invocation's containers, including a client left by a timeout.
        remaining = docker("ps", "-aq", "--filter", f"label={label}").split()
        if remaining:
            docker("rm", "-f", *remaining)
    maximum, period = map(int, result["cpu_max"].split())
    if maximum * 100 != int(float(quota) * 100) * period:
        raise RuntimeError(f"expected {quota} CPU, got cpu.max {result['cpu_max']}")
    result["requested_cpus"] = float(quota)
    return result


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="python:3.11-slim", help="locally cached Python image")
    parser.add_argument("--iterations", type=int, default=400_000, help="PBKDF2 rounds per request")
    parser.add_argument("--interval-ms", type=int, default=60, help="fixed spacing between offers")
    parser.add_argument("--output", type=Path, help="save the full JSON record to this path")
    args = parser.parse_args()
    if not 1 <= args.iterations <= 800_000 or not 20 <= args.interval_ms <= 250:
        parser.error("iterations must be 1–800000 and interval-ms must be 20–250")

    source_path = ROOT / "workload.py"
    source = source_path.read_bytes()
    image, = json.loads(docker("image", "inspect", args.image))
    runs = {
        name: run_case(image["Id"], source.decode("utf-8"), quota, args.iterations, args.interval_ms)
        for name, quota in QUOTAS.items()
    }
    wide = runs["wide"]
    tight = runs["tight"]
    if (wide["linux_kernel"], wide["python_version"]) != (tight["linux_kernel"], tight["python_version"]):
        raise RuntimeError("the two runs did not use the same Linux kernel and Python version")
    demonstrated = {
        "send_slip_below_one_interval": all(
            run["send_slip_ms"]["max"] < args.interval_ms for run in runs.values()
        ),
        "tight_rejects_more": tight["counts"]["rejected"] > wide["counts"]["rejected"],
        "tight_completes_some": tight["counts"]["completed"] > 0,
        "tight_records_throttling": tight["cpu_stat_delta"]["nr_throttled"] > 0
        and tight["cpu_stat_delta"]["throttled_usec"] > 0,
    }
    record = {
        "schema": 1,
        "status": "passed" if all(demonstrated.values()) else "inconclusive",
        "source_sha256": {
            Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            source_path.name: hashlib.sha256(source).hexdigest(),
        },
        "environment": {
            "engine": "Docker", "image": args.image, "image_id": image["Id"],
            "repo_digests": image.get("RepoDigests", []), "os": image["Os"],
            "architecture": image["Architecture"], "network": "none",
            "linux_kernel": wide["linux_kernel"], "python_version": wide["python_version"],
        },
        "report": {
            "inputs": {"arrivals": OFFER_COUNT, "arrival_interval_ms": args.interval_ms,
                       "queue_capacity": WAITING_SLOTS, "iterations": args.iterations, "workers": 1},
            "demonstrated": demonstrated,
            "runs": runs,
        },
    }
    if args.output is not None:
        args.output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(f"{record['status']} · {OFFER_COUNT} offers every {args.interval_ms} ms per run")
    for name, run in runs.items():
        counts = run["counts"]
        print(f"{name:5} cpu.max={run['cpu_max']} · 200={counts['completed']} · 503={counts['rejected']}"
              f" · p95(200)={run['success_latency_ms']['p95']} ms"
              f" · Δnr_throttled={run['cpu_stat_delta']['nr_throttled']}"
              f" · max send slip={run['send_slip_ms']['max']} ms")
    if record["status"] != "passed":
        raise SystemExit(f"comparison was inconclusive: {demonstrated}")


if __name__ == "__main__":
    main()
