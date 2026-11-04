"""Execute independent mechanism labs and regenerate exact website/download assets."""
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/learning-mechanisms"
PROGRAMS = ["tcp_framing.py", "checkpoint_commit.py", "approval_receipt.py"]
report = {"python": platform.python_version(), "programs": {}}
files = {}
for name in PROGRAMS:
    path = LAB / name
    source = path.read_bytes()
    run = subprocess.run([sys.executable, str(path)], capture_output=True, text=True, timeout=25)
    if run.returncode:
        raise RuntimeError(name + " failed: " + run.stderr)
    result = json.loads(run.stdout)
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(),
                                "result": result, "exit_code": run.returncode}
    files[name] = source.decode()
report_path = LAB / "validation.json"
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(ROOT / "dist/learning-mechanism-files.js").write_text(
    "const mechanismLabFiles=" + json.dumps(files, ensure_ascii=False) + ";\n" +
    "const mechanismLabValidation=" + json.dumps(report, ensure_ascii=False) + ";\n")
with zipfile.ZipFile(ROOT / "dist/labs/learning-mechanisms.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            bundle.write(path, "learning-mechanisms/" + path.name)
print(json.dumps({"programs_passed": len(PROGRAMS), "results": {
    name: record["result"] for name, record in report["programs"].items()}}, ensure_ascii=False))
