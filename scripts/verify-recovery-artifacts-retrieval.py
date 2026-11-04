"""Execute coherent recovery, HTTP receipts, actual tensor bundle and actual FTS5; bind exact sources."""
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
LAB = ROOT / "dist/labs/recovery-artifacts-retrieval"
parser = argparse.ArgumentParser()
parser.add_argument("--torch-python", required=True)
args = parser.parse_args()
report = {"verified_at_utc": datetime.now(timezone.utc).isoformat(), "platform": platform.platform(),
          "programs": {}, "fixtures": {}}
files = {}
for name in ["consistent_recovery_cut.py", "recovered_effects.py", "artifact_bundle.py", "chinese_fts_rrf.py"]:
    executable = args.torch_python if name == "artifact_bundle.py" else sys.executable
    source = (LAB / name).read_bytes()
    result = subprocess.run([executable, "-B", str(LAB / name)], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(name+" failed: "+result.stderr)
    version = subprocess.run([executable, "-c", "import platform; print(platform.python_version())"],
                             capture_output=True, text=True, check=True).stdout.strip()
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(), "python": version,
                               "exit_code": 0, "result": json.loads(result.stdout)}
    files[name] = source.decode()
for name in ["requirements-model.txt"]:
    source = (LAB / name).read_bytes()
    files[name] = source.decode()
    report["fixtures"][name] = hashlib.sha256(source).hexdigest()
(LAB / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
(ROOT / "dist/recovery-artifacts-retrieval-files.js").write_text(
    "const recoveryArtifactsRetrievalFiles="+json.dumps(files, ensure_ascii=False)+";\n"
    + "const recoveryArtifactsRetrievalValidation="+json.dumps(report, ensure_ascii=False)+";\n")
with zipfile.ZipFile(ROOT / "dist/labs/recovery-artifacts-retrieval.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            archive.write(path, "recovery-artifacts-retrieval/"+path.name)
print("PASS: actual backup/object validation, HTTP recovery receipts, Safetensors/CPU gates and pointer CAS, FTS5/RRF/graded metrics; exact source/evidence/ZIP bound.")
