"""Build one CPython extension and isolate failures at five different boundaries."""
import hashlib
import importlib.machinery
import json
import os
import platform
import shutil
import subprocess
import sys
import sysconfig
import tempfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parent
MODULE = "infra_rowdot"
PROVIDER = "libinfraguide_rowdot_fixture.dylib"
EXPECTED = [2.375, 5.0]
SOURCE_FILES = ("extension_loader.py", "rowdot.c", "rowdot_module.c")
IMPORT_PROBE = """
import importlib
import importlib.machinery
import json
import sys

root = sys.argv[1]
sys.path[:] = [root]
name = "infra_rowdot"
spec = importlib.machinery.PathFinder.find_spec(name, [root])
result = {"discovered": spec is not None}
try:
    module = importlib.import_module(name)
except ImportError as exc:
    result.update(error_type=type(exc).__name__, error=str(exc))
else:
    result["origin"] = module.__file__
    result["output"] = [
        module.dot3((-1.25, 0.5, -0.5), (-1.5, 1.0, 0.0)),
        module.dot3((1.0, 2.0, 3.0), (-1.0, 0.0, 2.0)),
    ]
    try:
        module.dot3((1.0, 2.0), (1.0, 2.0, 3.0))
    except TypeError as exc:
        result["shape_error"] = type(exc).__name__
print(json.dumps(result))
"""


def sha256(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def build_and_probe(root):
    include = Path(sysconfig.get_path("include"))
    lib_dir = Path(sysconfig.get_config_var("LIBDIR"))
    lib_python = "python" + sysconfig.get_python_version()
    suffix = sysconfig.get_config_var("EXT_SUFFIX")
    assert (include / "Python.h").is_file(), include
    assert (lib_dir / ("lib" + lib_python + ".dylib")).is_file(), lib_dir
    extension_name = MODULE + suffix
    env = {
        key: value for key, value in os.environ.items()
        if not key.startswith("DYLD_")
        and key not in {"CPATH", "C_INCLUDE_PATH", "LIBRARY_PATH", "PYTHONHOME", "PYTHONPATH"}
    }
    redactions = [
        (str(root.resolve()), "<work>"),
        (str(root), "<work>"),
        (str(SOURCE), "<source>"),
        (str(include), "<python-include>"),
        (str(lib_dir), "<python-lib>"),
        (sys.executable, "<python>"),
    ]

    def redact(value):
        for raw, placeholder in redactions:
            value = value.replace(raw, placeholder)
        return value

    def execute(*args, expect=0):
        argv = [str(part) for part in args]
        run = subprocess.run(argv, cwd=root, env=env, capture_output=True,
                             text=True, timeout=30, check=False)
        if run.returncode != expect:
            raise RuntimeError(redact(f"{argv}: exit {run.returncode}\n{run.stderr}"))
        return {
            "argv": [redact(arg) for arg in argv],
            "exit": run.returncode,
            "stdout": redact(run.stdout),
            "stderr": redact(run.stderr),
        }

    def describe(binary):
        return {
            "nm": execute("nm", "-gU", binary),
            "dependencies": execute("otool", "-L", binary),
            "rpaths": [
                line.strip() for line in execute("otool", "-l", binary)["stdout"].splitlines()
                if line.lstrip().startswith("path ")
            ],
        }

    def stage(name, filename=extension_name, source=None, provider=True):
        case = root / name
        case.mkdir()
        binary = case / filename
        shutil.copyfile(source or good_extension, binary)
        if provider:
            shutil.copyfile(provider_binary, case / PROVIDER)
        return case, binary

    def probe(case, binary):
        execution = execute(sys.executable, "-I", "-B", "-c", IMPORT_PROBE, case)
        return {
            "filename": binary.name,
            "extension_sha256": sha256(binary),
            "provider_sha256": sha256(case / PROVIDER) if (case / PROVIDER).exists() else None,
            "run": execution,
            "observation": json.loads(execution["stdout"]),
        }

    absent_object = root / "missing_header.o"
    compile_failed = execute("clang", "-std=c11", "-nostdinc", "-c",
                             SOURCE / "rowdot_module.c", "-o", absent_object, expect=1)
    compile_failed["object_created"] = absent_object.exists()
    object_ok = root / "rowdot_module.o"
    object_wrong = root / "wrong_entry.o"
    compile_flags = ("clang", "-std=c11", "-Wall", "-Wextra", "-fPIC", "-I", include)
    compile_good = execute(*compile_flags, "-c", SOURCE / "rowdot_module.c", "-o", object_ok)
    compile_wrong = execute(*compile_flags, "-DROW_INIT=PyInit_other", "-c",
                            SOURCE / "rowdot_module.c", "-o", object_wrong)
    provider_binary = root / PROVIDER
    build_provider = execute("clang", "-std=c11", "-dynamiclib",
                             "-Wl,-install_name,@rpath/" + PROVIDER,
                             SOURCE / "rowdot.c", "-o", provider_binary)
    link_flags = ("clang", "-bundle", "-L", lib_dir,
                  "-l" + lib_python, "-Wl,-rpath,@loader_path")
    absent_extension = root / "missing_provider.so"
    link_failed = execute(*link_flags, object_ok, "-o", absent_extension, expect=1)
    link_failed["extension_created"] = absent_extension.exists()
    good_extension = root / extension_name
    link_good = execute(*link_flags, object_ok, provider_binary, "-o", good_extension)
    wrong_extension = root / "wrong_entry.so"
    link_wrong = execute(*link_flags, object_wrong, provider_binary, "-o", wrong_extension)

    found, valid = stage("success")
    renamed, wrong_filename = stage("suffix", filename=MODULE + ".foreign-fixture.so")
    wrong, wrong_symbol = stage("symbol", source=wrong_extension)
    unloaded, missing_provider = stage("dependency", provider=False)

    cases = {
        "suffix": probe(renamed, wrong_filename),
        "symbol": probe(wrong, wrong_symbol),
        "dependency": probe(unloaded, missing_provider),
        "success": probe(found, valid),
    }
    shutil.copyfile(provider_binary, unloaded / PROVIDER)
    cases["restored"] = probe(unloaded, missing_provider)

    assert not compile_failed["object_created"] and "'Python.h' file not found" in compile_failed["stderr"]
    assert not link_failed["extension_created"] and "_infraguide_rowdot3" in link_failed["stderr"]
    assert cases["suffix"]["observation"]["error_type"] == "ModuleNotFoundError"
    assert not cases["suffix"]["observation"]["discovered"]
    assert cases["symbol"]["observation"]["error_type"] == "ImportError"
    assert "(PyInit_infra_rowdot)" in cases["symbol"]["observation"]["error"]
    assert cases["dependency"]["observation"]["error_type"] == "ImportError"
    assert "Library not loaded: @rpath/" + PROVIDER in cases["dependency"]["observation"]["error"]
    assert cases["symbol"]["observation"]["discovered"] and cases["dependency"]["observation"]["discovered"]
    for name in ("success", "restored"):
        assert cases[name]["observation"]["output"] == EXPECTED
        assert cases[name]["observation"]["shape_error"] == "TypeError"

    return {
        "status": "passed",
        "scope": "macOS arm64 CPython C extension and native CPU dot product",
        "environment": {
            "system": platform.system(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "compiler": execute("clang", "--version")["stdout"],
            "extension_suffixes": importlib.machinery.EXTENSION_SUFFIXES,
            "ext_suffix": suffix,
        },
        "source_sha256": {name: sha256(SOURCE / name) for name in SOURCE_FILES},
        "build": {
            "missing_header": compile_failed, "compile": compile_good,
            "compile_wrong_entry": compile_wrong, "provider": build_provider,
            "missing_link_input": link_failed, "link": link_good,
            "link_wrong_entry": link_wrong,
        },
        "binary": {
            "success": describe(good_extension),
            "wrong_entry": describe(wrong_extension),
            "provider": describe(provider_binary),
        },
        "cases": cases,
    }


if __name__ == "__main__":
    if (platform.system(), platform.machine(), sys.implementation.name, sys.version_info[:2]) != (
        "Darwin", "arm64", "cpython", (3, 12)
    ):
        raise SystemExit("Replay requires macOS arm64 and CPython 3.12.")
    with tempfile.TemporaryDirectory(prefix="infra-python-extension-") as tmp:
        record = build_and_probe(Path(tmp))
    print(json.dumps(record, ensure_ascii=False, indent=2))
