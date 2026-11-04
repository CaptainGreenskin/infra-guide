"""Capture actual CPU and independent stdlib runs; does not install packages."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/supervision-gradients"
parser = argparse.ArgumentParser()
parser.add_argument("--python", required=True, help="Existing PyTorch interpreter; retain its venv path")
args = parser.parse_args()
source = LAB / "supervision_gradients.py"


def run(python, *extra):
    completed = subprocess.run([python, str(source), *extra], check=True,
                               capture_output=True, text=True, timeout=45)
    return json.loads(completed.stdout)


observed = run(args.python)
reference = run("python3", "--reference-only")


def compare(a, b):
    if isinstance(a, dict):
        assert a.keys() == b.keys()
        for key in a:
            compare(a[key], b[key])
    elif isinstance(a, list):
        assert len(a) == len(b)
        for x, y in zip(a, b):
            compare(x, y)
    elif isinstance(a, float):
        assert math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12), (a, b)
    else:
        assert a == b


compare(observed["reference"], reference["reference"])
assert observed["torch"] == "2.5.1" and observed["device"] == "cpu"
record = {"status": "passed", "executed_at_utc": datetime.now(timezone.utc).isoformat(),
          "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
          "observed": observed, "stdlib_reference": reference,
          "scope": "Actual CPU autograd/SGD plus a separately executed stdlib reference; no attention, pretrained model, distributed run, GPU or throughput claim."}
(LAB / "validation.json").write_text(json.dumps(record, indent=2)+"\n")
print(json.dumps({"status": record["status"], "torch": observed["torch"],
                  "python": observed["python"], "stdlib_python": reference["python"],
                  "pad_gradient": observed["observed_gradients"]["joint"][0],
                  "finite_difference_max_error": observed["finite_difference_max_error"]}))
