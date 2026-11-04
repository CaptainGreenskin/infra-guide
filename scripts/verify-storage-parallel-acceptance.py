"""Run the three authored experiments, then package exactly their recorded sources."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/storage-parallel-acceptance"
NAMES = ["shard_range.py", "tp_forward_backward.py", "acceptance_record.py"]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--torch-python", required=True)
    args = parser.parse_args()
    programs = {}
    with tempfile.TemporaryDirectory(prefix="verify-storage-tp-") as temporary:
        for name in NAMES:
            report = Path(temporary, name + ".json")
            interpreter = args.torch_python if name == "tp_forward_backward.py" else sys.executable
            command = [interpreter, str(LAB/name), "--report", str(report)]
            if name == "acceptance_record.py":
                command += ["--write-examples", str(LAB)]
            run = subprocess.run(command, capture_output=True, text=True, timeout=65, cwd=ROOT)
            if run.returncode:
                raise RuntimeError(name+" failed:\n"+run.stderr[-4000:])
            result = json.loads(report.read_text())
            assert result["status"] == "passed" and result["source_sha256"] == sha(LAB/name)
            programs[name] = result
            print("PASS", name)
    fixtures = {name: sha(LAB/name) for name in
                ["readonly-contract.example.json", "readonly-evidence.example.json"]}
    record = {"verified_at_utc": datetime.now(timezone.utc).isoformat(),
        "platform": platform.platform(), "programs": programs, "fixtures": fixtures,
        "not_executed": ["S3 or cloud storage", "GPU/NCCL or multiple physical hosts",
                         "real Kairo/model/tool backend", "record provenance attestation", "production performance"]}
    (LAB/"validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2)+"\n")
    sources = {name: (LAB/name).read_text() for name in NAMES+list(fixtures)}
    (ROOT/"dist/storage-parallel-acceptance-files.js").write_text(
        "const storageParallelFiles="+json.dumps(sources, ensure_ascii=False)+";\n"
        "const storageParallelValidation="+json.dumps(record, ensure_ascii=False)+";\n")
    archive = ROOT/"dist/labs/storage-parallel-acceptance.zip"
    with ZipFile(archive, "w", ZIP_DEFLATED) as target:
        for file in sorted(LAB.iterdir()):
            if file.is_file() and file.suffix in [".py", ".json", ".md"]:
                target.write(file, "storage-parallel-acceptance/"+file.name)
    print("Packaged", archive.name)


if __name__ == "__main__":
    main()
