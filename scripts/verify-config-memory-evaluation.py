"""Execute five programs; bind exact source, declared CSV and actual results to the downloadable ZIP."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/config-memory-evaluation"
parser = argparse.ArgumentParser()
parser.add_argument("--torch-python", required=True)
args = parser.parse_args()
report = {"verified_at_utc": datetime.now(timezone.utc).isoformat(),
          "platform": platform.platform(), "programs": {}, "fixtures": {}}
files = {}
for name in ["config_snapshots.py", "credential_rotation.py", "tensor_state_bytes.py",
             "checkpoint_saved_tensors.py", "evaluation_statistics.py"]:
    executable = args.torch_python if name in {"tensor_state_bytes.py", "checkpoint_saved_tensors.py"} else sys.executable
    source = (LAB / name).read_bytes()
    result = subprocess.run([executable, "-B", str(LAB / name)],
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(name + " failed: " + result.stderr)
    version = subprocess.run([executable, "-c", "import platform; print(platform.python_version())"],
                             capture_output=True, text=True, check=True).stdout.strip()
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(), "python": version,
                               "exit_code": 0, "result": json.loads(result.stdout)}
    files[name] = source.decode()
for name in ["paired-example.csv"]:
    source = (LAB / name).read_bytes()
    files[name] = source.decode()
    report["fixtures"][name] = hashlib.sha256(source).hexdigest()
(LAB / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(ROOT / "dist/config-memory-evaluation-files.js").write_text(
    "const configMemoryEvaluationFiles=" + json.dumps(files, ensure_ascii=False) + ";\n"
    + "const configMemoryEvaluationValidation=" + json.dumps(report, ensure_ascii=False) + ";\n")
with zipfile.ZipFile(ROOT / "dist/labs/config-memory-evaluation.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            archive.write(path, "config-memory-evaluation/" + path.name)
print("PASS: real file/process/HTTP examples, actual CPU state and saved-storage comparison, declared statistical fixtures; source, evidence and ZIP bound.")
