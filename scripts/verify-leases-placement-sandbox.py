"""Execute the bounded references and actual POSIX/SQLite experiments, then bind source/evidence/ZIP."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/leases-placement-sandbox"
report = {"verified_at_utc": datetime.now(timezone.utc).isoformat(),
          "python": platform.python_version(), "platform": platform.platform(), "programs": {}}
files = {}
for name in ["visibility_receipts.py", "batch_response_reference.py", "placement_reservations.py",
             "subprocess_limits.py", "descriptors_and_paths.py"]:
    source = (LAB / name).read_bytes()
    result = subprocess.run([sys.executable, "-B", str(LAB / name)],
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(name + " failed: " + result.stderr)
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(), "exit_code": 0,
                               "result": json.loads(result.stdout)}
    files[name] = source.decode()
(LAB / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
(ROOT / "dist/leases-placement-sandbox-files.js").write_text(
    "const leasesPlacementSandboxFiles=" + json.dumps(files, ensure_ascii=False) + ";\n"
    + "const leasesPlacementSandboxValidation=" + json.dumps(report, ensure_ascii=False) + ";\n")
with zipfile.ZipFile(ROOT / "dist/labs/leases-placement-sandbox.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(LAB.iterdir()):
        if path.is_file():
            archive.write(path, "leases-placement-sandbox/" + path.name)
print("PASS: queue/batch references, real two-process SQLite reservation, actual bounded POSIX limits/FD/path examples; exact source, evidence and ZIP bound.")
