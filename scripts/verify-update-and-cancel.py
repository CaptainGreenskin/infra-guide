"""Execute both labs, then package their exact source and actual records."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/update-and-cancel"
parser = argparse.ArgumentParser()
parser.add_argument("--torch-python", required=True)
args = parser.parse_args()
report = {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
          "programs": {}}
files = {}
for name in ("update_windows.py", "cancel_receipts.py"):
    # Do not resolve a venv interpreter symlink: that would discard its environment.
    interpreter = args.torch_python if name == "update_windows.py" else sys.executable
    source = (LAB / name).read_bytes()
    run = subprocess.run([interpreter, str(LAB / name)], capture_output=True,
                         text=True, timeout=90)
    if run.returncode:
        raise RuntimeError(name + " failed: " + run.stderr)
    version = subprocess.run([interpreter, "-c", "import platform; print(platform.python_version())"],
                             capture_output=True, text=True, check=True).stdout.strip()
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(),
                                "python": version, "exit_code": 0,
                                "result": json.loads(run.stdout)}
    files[name] = source.decode()
(LAB / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(ROOT / "dist/update-cancel-files.js").write_text(
    "const updateCancelFiles=" + json.dumps(files, ensure_ascii=False) + ";\n" +
    "const updateCancelValidation=" + json.dumps(report, ensure_ascii=False) + ";\n")
with zipfile.ZipFile(ROOT / "dist/labs/update-and-cancel.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            bundle.write(path, "update-and-cancel/" + path.name)
print("PASS: actual 2-rank CPU/Gloo updates + 4 cancellation cases; exact source, record and ZIP.")
