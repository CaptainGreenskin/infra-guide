"""Compile and run the native address trace with a local C17 compiler."""
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent
FLAGS = ["-std=c17", "-O2", "-Wall", "-Wextra", "-Werror", "-pedantic"]


def main():
    compiler = shlex.split(os.environ.get("CC", "cc"))
    version = subprocess.check_output(compiler + ["--version"], text=True).splitlines()[0]
    source = ROOT / "address_trace.c"
    with tempfile.TemporaryDirectory(prefix="warp-address-trace-") as folder:
        binary = Path(folder) / "address_trace"
        subprocess.run(compiler + FLAGS + [str(source), "-o", str(binary)], check=True, timeout=30)
        result = json.loads(subprocess.check_output([str(binary)], text=True, timeout=30))
    print(json.dumps({
        "status": "passed",
        "source_sha256": {
            file.name: hashlib.sha256(file.read_bytes()).hexdigest()
            for file in (source, Path(__file__))
        },
        "environment": {
            "system": platform.system(), "machine": platform.machine(),
            "python": platform.python_version(), "compiler": version, "flags": FLAGS,
        },
        "device_execution": False,
        "trace": result,
    }, indent=2))


if __name__ == "__main__":
    main()
