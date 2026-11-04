"""Execute local labs; bind source, actual output, displayed code and ZIP."""
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
LAB = ROOT / "dist/labs/network-input-tools"
parser = argparse.ArgumentParser()
parser.add_argument("--torch-python", required=True)
args = parser.parse_args()
files = {}
report = {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version, "programs": {}}
for name in ["tls_identity.py", "sampler_coverage.py", "packing_boundaries.py", "tool_runtime.py"]:
    executable = args.torch_python if name == "sampler_coverage.py" else sys.executable
    source = (LAB / name).read_bytes()
    run = subprocess.run([executable, "-B", str(LAB / name)], capture_output=True, text=True, timeout=180)
    if run.returncode:
        raise RuntimeError(name + " failed: " + run.stderr)
    version = subprocess.run([executable, "-c", "import platform; print(platform.python_version())"],
                             capture_output=True, text=True, check=True).stdout.strip()
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(), "python": version,
                               "exit_code": 0, "result": json.loads(run.stdout)}
    files[name] = source.decode()
(LAB / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(ROOT / "dist/network-input-tools-files.js").write_text(
    "const networkInputToolsFiles=" + json.dumps(files, ensure_ascii=False) + ";\n"
    + "const networkInputToolsValidation=" + json.dumps(report, ensure_ascii=False) + ";\n")
with zipfile.ZipFile(ROOT / "dist/labs/network-input-tools.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            archive.write(path, "network-input-tools/" + path.name)
print("PASS: actual TLS/HTTP, 2 Gloo ranks and 4 loader workers, packing math, 10 HTTP tool cases; source/output/ZIP bound.")

