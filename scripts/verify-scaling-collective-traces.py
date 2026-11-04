"""Execute reference, real Prometheus, actual Gloo and actual OTel; bind source/evidence/ZIP."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/scaling-collectives-traces"
parser = argparse.ArgumentParser()
parser.add_argument("--torch-python", required=True)
parser.add_argument("--otel-python", required=True)
parser.add_argument("--promtool", required=True)
args = parser.parse_args()
report = {"python": platform.python_version(), "programs": {}, "fixtures": {}}
files = {}
for name in ["scaling_reference.py", "prometheus_cpu.py", "collective_contracts.py", "otel_attempts.py"]:
    executable = args.torch_python if name == "collective_contracts.py" else args.otel_python if name == "otel_attempts.py" else sys.executable
    arguments = [str(Path(args.promtool).resolve())] if name == "prometheus_cpu.py" else []
    source = (LAB / name).read_bytes()
    result = subprocess.run([executable, "-B", str(LAB / name), *arguments],
                            capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(name + " failed: " + result.stderr)
    version = subprocess.run([executable, "-c", "import platform; print(platform.python_version())"],
                             capture_output=True, text=True, check=True).stdout.strip()
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(), "python": version,
                               "exit_code": 0, "result": json.loads(result.stdout)}
    files[name] = source.decode()
for name in ["cpu.rules.yaml", "cpu.test.yaml", "requirements-otel.txt"]:
    source = (LAB / name).read_bytes()
    files[name] = source.decode()
    report["fixtures"][name] = hashlib.sha256(source).hexdigest()
(LAB / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(ROOT / "dist/scaling-collective-trace-files.js").write_text(
    "const scalingCollectiveTraceFiles=" + json.dumps(files, ensure_ascii=False) + ";\n"
    + "const scalingCollectiveTraceValidation=" + json.dumps(report, ensure_ascii=False) + ";\n")
with zipfile.ZipFile(ROOT / "dist/labs/scaling-collectives-traces.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            archive.write(path, "scaling-collectives-traces/" + path.name)
print("PASS: executed HPA reference, real promtool 4 fixtures, 2-rank Gloo 3 groups, actual OTel SDK/HTTP; bound source, evidence and ZIP.")

