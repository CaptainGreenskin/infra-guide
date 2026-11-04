"""Actual bounded POSIX child-process limits; this does not create a security sandbox."""
import errno
import json
import os
from pathlib import Path
import resource
import selectors
import signal
import subprocess
import sys
import tempfile
import time


def child(mode, directory):
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    if mode == "file_size":
        signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
        resource.setrlimit(resource.RLIMIT_FSIZE, (4096, 4096))
        descriptor = os.open(str(Path(directory) / "bounded.bin"), os.O_CREAT | os.O_WRONLY, 0o600)
        first, rejected = os.write(descriptor, b"x" * 6000), False
        try:
            os.write(descriptor, b"x")
        except OSError as error:
            rejected = error.errno == errno.EFBIG
        os.close(descriptor)
        print(json.dumps({"first_write_bytes": first, "next_write_EFBIG": rejected,
                          "file_size": (Path(directory) / "bounded.bin").stat().st_size}))
    elif mode == "descriptors":
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
        opened, rejected = [], False
        try:
            for _ in range(200):
                opened.append(os.open(os.devnull, os.O_RDONLY))
        except OSError as error:
            rejected = error.errno == errno.EMFILE
        count = len(opened)
        for descriptor in opened:
            os.close(descriptor)
        print(json.dumps({"limit": 64, "opened_extra": count, "next_open_EMFILE": rejected}))
    elif mode == "cpu":
        resource.setrlimit(resource.RLIMIT_CPU, (1, 2))
        print("ready", flush=True)
        while True:
            pass
    elif mode == "wall":
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        print("ready", flush=True)
        time.sleep(30)
    else:
        raise ValueError(mode)


def run(mode, directory):
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.monotonic()
    process = subprocess.Popen([sys.executable, "-B", str(Path(__file__).resolve()), "--child", mode, directory],
                               env={"PYTHONIOENCODING": "utf-8"}, cwd=directory,
                               stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, close_fds=True, start_new_session=True)
    forced = False
    ready = False
    try:
        if mode in {"cpu", "wall"}:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                if not selector.select(timeout=5):
                    raise RuntimeError("child did not announce ready")
                ready = process.stdout.readline().strip() == "ready"
                assert ready
        # The wall budget starts after readiness, so a slow interpreter startup
        # cannot turn the intended ignored-TERM case into a different signal path.
        stdout, stderr = process.communicate(timeout=0.25 if mode == "wall" else 5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=0.2)
        except subprocess.TimeoutExpired:
            forced = True
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=3)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)
    elapsed = time.monotonic() - start
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = (after.ru_utime+after.ru_stime)-(before.ru_utime+before.ru_stime)
    assert not stderr, stderr
    result = {"exit_code": process.returncode, "elapsed_wall_seconds": elapsed,
              "child_cpu_seconds": cpu, "force_after_TERM_required": forced}
    if mode in {"file_size", "descriptors"}:
        assert process.returncode == 0
        result["output"] = json.loads(stdout)
    else:
        assert ready and stdout.strip() == ""
        result["ready_before_limit"] = True
        result["termination_signal"] = signal.Signals(-process.returncode).name
        if mode == "wall":
            result["wall_budget_from_ready_seconds"] = 0.25
            result["term_grace_seconds"] = 0.2
    return result


def main():
    if os.name != "posix":
        raise RuntimeError("POSIX child process and resource support required")
    with tempfile.TemporaryDirectory(prefix="infra-limits-") as temporary:
        results = {mode: run(mode, temporary) for mode in ["file_size", "descriptors", "cpu", "wall"]}
    assert results["file_size"]["output"] == {"first_write_bytes": 4096, "next_write_EFBIG": True, "file_size": 4096}
    assert results["descriptors"]["output"]["next_open_EMFILE"]
    assert 0 < results["descriptors"]["output"]["opened_extra"] < 64
    assert results["cpu"]["termination_signal"] in {"SIGXCPU", "SIGKILL"}
    assert results["wall"]["termination_signal"] == "SIGKILL" and results["wall"]["force_after_TERM_required"]
    assert results["wall"]["child_cpu_seconds"] < 0.5
    print(json.dumps({"os": sys.platform, "cases": results,
                      "scope": "actual_POSIX_limits_in_owned_children_not_container_or_kernel_isolation",
                      "limits": ["RLIMIT_CPU is process CPU time, not wall time or cgroup bandwidth",
                                 "RLIMIT_FSIZE bounds one file, not total temporary-disk usage",
                                 "RLIMIT_NOFILE bounds descriptors, not process count",
                                 "children use the same UID and may still access that UID's files/network",
                                 "only owned child process groups are signaled; host limits are unchanged"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--child":
        child(sys.argv[2], sys.argv[3])
    else:
        main()
