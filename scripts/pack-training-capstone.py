"""Package an already executed capstone record; refuse stale source provenance."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT/"dist/labs/training-capstone"
report = json.loads((LAB/"validation.json").read_text())
assert report["status"] == "passed"
files = {}
for name, expected in report["source_sha256"].items():
    raw = (LAB/name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected, name+": source changed after execution"
    files[name] = raw.decode()
for name in ("train_ddp.py", "compare_checkpoints.py"):
    assert (LAB/name).read_bytes() == (ROOT/"dist/labs/ddp"/name).read_bytes()
(ROOT/"dist/training-capstone-files.js").write_text(
    "const trainingCapstoneFiles="+json.dumps(files, ensure_ascii=False)+";\n"
    +"const trainingCapstoneValidation="+json.dumps(report, ensure_ascii=False)+";\n")
with zipfile.ZipFile(ROOT/"dist/labs/training-capstone.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(LAB.iterdir()):
        if file.is_file():
            archive.write(file, "training-capstone/"+file.name)
print("PASS: executed capstone source, record, canonical DDP programs and ZIP bytes bound.")
