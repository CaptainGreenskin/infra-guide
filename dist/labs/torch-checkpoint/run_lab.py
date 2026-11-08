"""Run old reference training, stop DCP processes, then restore in fresh ones.

All torch.load calls read local exports produced by this invocation, never an
untrusted download. DCP directories, not the comparison exports, resume training.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

import torch
import torch.distributed.checkpoint as dcp
from torch.utils.data import DistributedSampler

HERE = Path(__file__).resolve().parent


def compare(a, b, path="state"):
    """Independent recursive comparator: inspect every saved field, not a pass tag."""
    if isinstance(a, torch.Tensor):
        if not isinstance(b, torch.Tensor) or a.dtype != b.dtype or a.shape != b.shape:
            raise AssertionError(path + ": tensor_metadata")
        if not torch.equal(a, b):
            raise AssertionError(path + ": tensor_values")
    elif isinstance(a, dict):
        if not isinstance(b, dict) or a.keys() != b.keys():
            raise AssertionError(path + ": keys")
        for key in a:
            compare(a[key], b[key], path + "." + str(key))
    elif isinstance(a, (tuple, list)):
        if type(a) is not type(b) or len(a) != len(b):
            raise AssertionError(path + ": sequence")
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, path + "." + str(i))
    elif a != b:
        raise AssertionError(path + ": value")


def launch(script, arguments, expect_success=True):
    command = [sys.executable, "-B", "-m", "torch.distributed.run", "--standalone",
               "--nproc_per_node=2", str(HERE / script)] + list(map(str, arguments))
    environment = dict(os.environ, OMP_NUM_THREADS="1", PYTHONDONTWRITEBYTECODE="1")
    result = subprocess.run(command, text=True, capture_output=True, timeout=90, env=environment)
    if expect_success and result.returncode != 0:
        raise RuntimeError("worker_failed\n" + result.stdout[-3000:] + result.stderr[-6000:])
    if not expect_success and result.returncode == 0:
        raise AssertionError("missing_metadata_was_accepted")
    return result


def load(path):
    return torch.load(path, map_location="cpu", weights_only=True)


def run(root):
    baseline, stopped, resumed, weights = [root / n for n in ["reference", "stopped", "resumed", "weights-only"]]
    launch("reference_train.py", ["--device=cpu", "--epochs=4", "--samples=1024", "--hidden=32",
                                  "--batch-size=32", "--accum=2", "--save-dir", baseline])
    stopped_launch = launch("train_dcp.py", ["--epochs=2", "--output", stopped])
    # subprocess.run has waited for the torchrun parent AND both workers to exit.
    assert stopped_launch.returncode == 0
    launch("train_dcp.py", ["--epochs=4", "--resume", stopped / "checkpoint", "--output", resumed])
    reference, restored = load(baseline / "checkpoint.pt"), load(resumed / "comparison.pt")
    compare(reference, restored)

    traces = [json.loads((resumed / f"rank-{r}.json").read_text()) for r in range(2)]
    stopped_traces = [json.loads((stopped / f"rank-{r}.json").read_text()) for r in range(2)]
    expected_first = []
    for rank, trace in enumerate(traces):
        assert trace["loaded"] and trace["start_epoch"] == 2
        assert trace["progress"] == {"next_epoch": 4, "updates": 32}
        assert trace["optimizer_steps"] == [32] * 4
        # Separate sampler construction outside train_dcp.py checks real consumed IDs.
        for epoch_record in trace["epochs"]:
            sampler = DistributedSampler(range(1024), num_replicas=2, rank=rank,
                                         shuffle=True, seed=23, drop_last=True)
            sampler.set_epoch(epoch_record["epoch"])
            expected = list(iter(sampler))
            assert epoch_record["all_ids"] == expected
            assert epoch_record["first_ids"] == expected[:32]
        expected_first.append(trace["epochs"][0]["first_ids"])

    launch("train_dcp.py", ["--epochs=4", "--resume", stopped / "checkpoint",
                            "--output", weights, "--weights-only"])
    bad = load(weights / "comparison.pt")
    # Input and randomness still match: this counterexample isolates lost Adam history.
    compare(reference["rng_by_rank"], bad["rng_by_rank"])
    assert reference["next_epoch"] == bad["next_epoch"] == 4
    try:
        compare(reference, bad)
    except AssertionError as error:
        negative_difference = str(error)
    else:
        raise AssertionError("reset_adam_was_not_detected")
    max_error = max(float((reference["model"][k] - bad["model"][k]).abs().max()) for k in reference["model"])
    assert max_error > 0

    missing = root / "missing-metadata"
    shutil.copytree(stopped / "checkpoint", missing)
    (missing / ".metadata").unlink()
    failure = launch("train_dcp.py", ["--epochs=4", "--resume", missing,
                                      "--output", root / "must-not-complete"], expect_success=False)
    assert ".metadata" in failure.stderr and "FileNotFoundError" in failure.stderr
    assert not (root / "must-not-complete/comparison.pt").exists()
    metadata = dcp.FileSystemReader(stopped / "checkpoint").read_metadata()
    files = [{"name": p.name, "bytes": p.stat().st_size,
              "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
             for p in sorted((stopped / "checkpoint").iterdir())]
    return {
        "status": "passed", "torch": torch.__version__, "backend": "gloo", "device": "cpu",
        "world_size": 2, "reference": "unaltered copy of existing labs/ddp/train_ddp.py",
        "config": reference["signature"], "continuous_epochs": 4, "split_epochs": [2, 2],
        "restored_next_epoch": restored["next_epoch"], "applied_updates": 32,
        "exact_fields": ["model", "optimizer", "scaler", "next_epoch", "signature", "rng_by_rank"],
        "all_reference_fields_exact": True, "old_launch_completed_before_resume": True,
        "stopped_worker_pids": [t["pid"] for t in stopped_traces],
        "resumed_worker_pids": [t["pid"] for t in traces],
        "resume_first_batch_ids": expected_first, "independent_sampler_coverage": [512, 512],
        "checkpoint_files": files, "metadata_key_count": len(metadata.state_dict_metadata),
        "weights_only_control": {"restored_input_and_rng": True, "optimizer_restored": False,
                                 "difference": negative_difference, "max_parameter_error": max_error},
        "missing_metadata_control": {"exit_code": failure.returncode, "file_not_found": True,
                                     "completed_state_exported": False},
        "scope": "actual synchronous Stateful DCP, two local CPU/Gloo ranks, fixed epoch boundary; no FSDP/DTensor reshard/GPU/object store/power-loss claim",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-dir", type=Path, help="Keep files in a new directory")
    args = parser.parse_args()
    torch.set_num_threads(1)
    if args.work_dir:
        args.work_dir.mkdir(parents=True, exist_ok=False)
        report = run(args.work_dir.resolve())
    else:
        with tempfile.TemporaryDirectory(prefix="torch-checkpoint-") as directory:
            report = run(Path(directory))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
