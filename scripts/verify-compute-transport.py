"""Run bounded real CPU/socket observations and bind source, evidence and download archive."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "dist/labs/compute-and-transport"
files = {}
report = {"verified_at_utc": datetime.now(timezone.utc).isoformat(), "platform": platform.platform(), "programs": {}}
for name in ["cpu_and_wall.py", "socket_backpressure.py"]:
    source = (LAB/name).read_bytes()
    result = subprocess.run([sys.executable, "-B", str(LAB/name)], capture_output=True, text=True, timeout=25)
    if result.returncode:
        raise RuntimeError(name+": "+result.stderr)
    report["programs"][name] = {"sha256": hashlib.sha256(source).hexdigest(), "exit_code": 0,
                               "result": json.loads(result.stdout)}
    files[name] = source.decode()
(LAB/"validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
(ROOT/"dist/compute-transport-files.js").write_text("const computeTransportFiles="+json.dumps(files,ensure_ascii=False)+";\n"
    +"const computeTransportValidation="+json.dumps(report,ensure_ascii=False)+";\n")
with zipfile.ZipFile(ROOT/"dist/labs/compute-and-transport.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for p in sorted(LAB.iterdir()):
        if p.is_file():archive.write(p,"compute-and-transport/"+p.name)
print("PASS: actual local CPU/wall/thread and bounded nonblocking TCP/drain observations; exact source, records and ZIP bound.")
