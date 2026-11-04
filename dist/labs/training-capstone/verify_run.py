"""Bounded CPU/Gloo recovery capstone; run with Python 3.10-3.12 and PyTorch 2.5.1.

Uses only this directory's trusted training scripts and temporary checkpoints.
The two-epoch run exits normally; this does not simulate a mid-step crash.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import tempfile

import torch


LAB = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(argv, directory, expected_error=None):
    env = dict(os.environ, OMP_NUM_THREADS="1")
    process = subprocess.Popen(argv, cwd=directory, env=env, text=True,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=60)
    except subprocess.TimeoutExpired:
        # Only supervise our own trusted launcher/worker process group.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.communicate()
        raise RuntimeError("training command exceeded 60s; its process group was stopped")
    result = subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)
    if expected_error is not None:
        if result.returncode == 0 or expected_error not in result.stderr:
            raise AssertionError("expected rejection: " + expected_error + "\n" + result.stderr[-4000:])
        return {"exit_code": result.returncode, "matched_error": expected_error}
    if result.returncode:
        raise AssertionError("command failed\n" + result.stderr[-4000:])
    records = []
    for line in result.stdout.splitlines():
        if line.startswith("{"):
            record = json.loads(line)
            if "path" in record:
                record["path"] = str(Path(record["path"]).relative_to(directory))
            records.append(record)
    return {"exit_code": 0, "records": records, "message": result.stdout.strip() if not records else ""}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", default="run-report.json")
    args = parser.parse_args()
    if os.name != "posix":
        parser.error("this supervisor uses POSIX process groups; use Linux/macOS")
    if any(name in os.environ for name in ("RANK", "LOCAL_RANK", "WORLD_SIZE")):
        parser.error("run verify_run.py directly, outside torchrun")
    report = {"verified_at_utc": datetime.now(timezone.utc).isoformat(),
              "environment": {"python": platform.python_version(), "torch": str(torch.__version__),
                              "platform": platform.platform(), "device": "cpu", "backend": "gloo"},
              "source_sha256": {name: digest(LAB/name) for name in
                                ("train_ddp.py", "compare_checkpoints.py", "verify_run.py")},
              "configuration": {"world_size": 2, "samples": 1024, "hidden": 32,
                                "batch_size_per_rank": 32, "accum": 2, "seed": 23,
                                "precision": "fp32", "target_epochs": 4},
              "runs": {}, "negative_probes": {}}
    with tempfile.TemporaryDirectory(prefix="infra-training-capstone-") as temporary:
        directory = Path(temporary)

        def train(label, epochs, resume=None, changed=None, expected_error=None):
            output = directory/label
            config = {"device": "cpu", "samples": 1024, "hidden": 32, "batch-size": 32, "accum": 2}
            config.update(changed or {})
            argv = [sys.executable, "-m", "torch.distributed.run", "--standalone", "--nproc-per-node=2",
                    str(LAB/"train_ddp.py"), "--epochs="+str(epochs), "--save-dir="+str(output)]
            argv += ["--"+name+"="+str(value) for name, value in config.items()]
            if resume is not None:
                argv.append("--resume="+str(resume))
            result = run(argv, directory, expected_error)
            if expected_error is not None:
                result["checkpoint_created"] = (output/"checkpoint.pt").exists()
                assert not result["checkpoint_created"]
                return result
            start = next(row for row in result["records"] if row["event"] == "start")
            epochs_seen = [row for row in result["records"] if row["event"] == "epoch"]
            first = 2 if resume is not None else 0
            assert start["world_size"] == 2 and start["effective_batch"] == 128
            assert start["start_epoch"] == first
            assert [row["epoch"] for row in epochs_seen] == list(range(first+1, epochs+1))
            for row in epochs_seen:
                assert row["samples"] == 1024
                assert row["attempted_update_windows"] == row["applied_optimizer_steps"] == 8
            result["applied_calls_this_run"] = sum(row["applied_optimizer_steps"] for row in epochs_seen)
            report["runs"][label] = result
            return output/"checkpoint.pt"

        full = train("full", 4)
        split = train("split", 2)
        resumed = train("resumed", 4, resume=split)
        compare_command = [sys.executable, str(LAB/"compare_checkpoints.py")]
        report["full_state_comparison"] = run(compare_command+[str(full), str(resumed)], directory)
        final = torch.load(resumed, map_location="cpu", weights_only=True)
        assert final["next_epoch"] == 4 and len(final["rng_by_rank"]) == 2
        report["final_state"] = {"next_epoch": final["next_epoch"],
                                 "rng_rank_count": len(final["rng_by_rank"]),
                                 "compared_fields": sorted(final.keys())}

        report["negative_probes"]["nondivisible_window"] = train(
            "bad-accum", 4, changed={"accum": 3},
            expected_error="Per-rank batch count must be positive and divisible by --accum")
        report["negative_probes"]["changed_configuration"] = train(
            "bad-signature", 4, resume=split, changed={"hidden": 16},
            expected_error="Resume requires the same world size, device, precision and training settings")

        # Preserve model weights, change only one Adam moment: a weights-only oracle must miss this.
        damaged = torch.load(resumed, map_location="cpu", weights_only=True)
        moment = next(state["exp_avg"] for state in damaged["optimizer"]["state"].values())
        moment.view(-1)[0] += 0.25
        assert all(torch.equal(value, damaged["model"][key]) for key, value in final["model"].items())
        bad_path = directory/"changed-adam.pt"
        torch.save(damaged, bad_path)
        probe = run(compare_command+[str(full), str(bad_path)], directory,
                    expected_error="state.optimizer.state")
        probe["model_weights_unchanged"] = True
        probe["changed_field"] = "first exp_avg element + 0.25"
        report["negative_probes"]["changed_optimizer_state"] = probe

    report["status"] = "passed"
    target = Path(args.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
