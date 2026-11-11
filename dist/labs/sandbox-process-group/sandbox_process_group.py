"""Run two owned POSIX process groups and verify that stopping A leaves B usable."""
import json
import os
import platform
import select
import signal
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path


SOURCE = Path(__file__).resolve()
TERM_GRACE = 0.2


def run_child(ready_fd, directory):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    identity = {"pid": os.getpid(), "parent_pid": os.getppid(), "pgid": os.getpgrp()}
    os.write(ready_fd, json.dumps(identity).encode() + b"\n")
    deadline = time.monotonic() + 15
    while not (directory / "finish").exists():
        if time.monotonic() >= deadline:
            raise TimeoutError("the fixture received no finish request")
        time.sleep(0.01)
    values = json.loads((directory / "input.json").read_text())
    (directory / "report.json").write_text(json.dumps({"task": directory.name, "total": sum(values)}))


def run_parent(ready_fd, directory):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    subprocess.run(
        [sys.executable, "-B", str(SOURCE), "child", str(ready_fd), str(directory)],
        pass_fds=(ready_fd,),
        check=True,
    )


def read_pipe(fd):
    if not select.select([fd], [], [], 5)[0]:
        raise TimeoutError("no readiness message or EOF from the process group")
    return os.read(fd, 4096)


@contextmanager
def task(directory):
    directory.mkdir()
    (directory / "input.json").write_text("[10, 27]")
    reader, writer = os.pipe()
    process = None
    try:
        try:
            process = subprocess.Popen(
                [sys.executable, "-B", str(SOURCE), "parent", str(writer), str(directory)],
                pass_fds=(writer,),
                start_new_session=True,
            )
        finally:
            os.close(writer)
        identity = json.loads(read_pipe(reader))
        assert identity["parent_pid"] == process.pid == identity["pgid"]
        assert identity["pid"] != process.pid
        yield process, reader, identity
    finally:
        if process is not None and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)
        os.close(reader)


def prove():
    with tempfile.TemporaryDirectory(prefix="infra-process-group-") as folder:
        root = Path(folder)
        with task(root / "A") as a, task(root / "B") as b:
            a_process, a_pipe, a_identity = a
            b_process, b_pipe, b_identity = b
            assert a_process.pid != b_process.pid

            os.killpg(a_process.pid, signal.SIGTERM)
            try:
                a_process.wait(timeout=TERM_GRACE)
            except subprocess.TimeoutExpired:
                pass
            else:
                raise AssertionError("A unexpectedly exited during the TERM grace period")
            assert not select.select([a_pipe], [], [], 0)[0], "A's pipe closed during the grace period"

            os.killpg(a_process.pid, signal.SIGKILL)
            a_exit = a_process.wait(timeout=5)
            a_eof = read_pipe(a_pipe) == b""
            assert a_exit == -signal.SIGKILL and a_eof
            assert not (root / "A/report.json").exists()

            b_still_running = b_process.poll() is None
            assert b_still_running and not select.select([b_pipe], [], [], 0)[0]
            assert not (root / "B/report.json").exists()
            (root / "B/finish").touch()
            b_exit = b_process.wait(timeout=5)
            b_eof = read_pipe(b_pipe) == b""
            report = json.loads((root / "B/report.json").read_text())
            assert b_exit == 0 and b_eof and report == {"task": "B", "total": 37}

            return {
                "status": "passed",
                "source_sha256": sha256(SOURCE.read_bytes()).hexdigest(),
                "system": platform.system(),
                "machine": platform.machine(),
                "scope": "owned_posix_groups_in_one_host",
                "term_grace_seconds": TERM_GRACE,
                "input_values": [10, 27],
                "A": {"identity": a_identity, "term_grace_expired": True, "exit": a_exit,
                      "pipe_eof_after_kill": a_eof, "report_written": False},
                "B": {"identity": b_identity, "running_after_a_stop": b_still_running,
                      "exit": b_exit, "pipe_eof_after_finish": b_eof, "report": report},
            }


if __name__ == "__main__":
    if len(sys.argv) == 1:
        print(json.dumps(prove(), indent=2))
    elif len(sys.argv) == 4 and sys.argv[1] in {"parent", "child"}:
        execute = {"parent": run_parent, "child": run_child}[sys.argv[1]]
        execute(int(sys.argv[2]), Path(sys.argv[3]))
    else:
        raise SystemExit("Run with no arguments")
