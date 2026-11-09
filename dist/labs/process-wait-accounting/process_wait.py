"""Observe a pipe read and child exit separately on macOS or Linux."""
import hashlib
import json
import os
import platform
from pathlib import Path
import select
import signal
import time

PAUSE = 0.060
WORK_NS = 50_000_000


def child(control, result):
    mode = os.read(control, 1)
    if mode not in (b"R", b"W"):
        os._exit(2)

    time.sleep(PAUSE)
    started = time.process_time_ns()
    subtotal = 0
    while time.process_time_ns() - started < WORK_NS:
        subtotal = sum((10, 27, 5))
    os.write(result, str(subtotal).encode("ascii"))

    # In read-first mode only the parent can release the exit gate.
    if mode == b"R" and os.read(control, 1) != b"X":
        os._exit(3)
    time.sleep(PAUSE)
    os._exit(0)


def measure(action):
    wall = time.perf_counter_ns()
    cpu = time.process_time_ns()
    result = action()
    return result, {
        "wall_ms": (time.perf_counter_ns() - wall) / 1_000_000,
        "parent_cpu_ms": (time.process_time_ns() - cpu) / 1_000_000,
    }


def run(mode):
    control_read, control_write = os.pipe()
    result_read, result_write = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(control_write)
        os.close(result_read)
        try:
            child(control_read, result_write)
        finally:
            os._exit(1)

    os.close(control_read)
    os.close(result_write)
    reaped = False

    def read_result():
        return int(os.read(result_read, 16))

    def reap():
        nonlocal reaped
        waited_pid, status, usage = os.wait4(pid, 0)
        reaped = True
        assert waited_pid == pid and os.WIFEXITED(status)
        return {
            "exit_code": os.WEXITSTATUS(status),
            "child_cpu_ms": (usage.ru_utime + usage.ru_stime) * 1000,
        }

    def after_send(byte, action):
        os.write(control_write, byte)
        return action()

    try:
        ready_before = bool(select.select([result_read], [], [], 0)[0])
        assert not ready_before

        if mode == "read_first":
            total, read = measure(lambda: after_send(b"R", read_result))
            observed_pid, _, _ = os.wait4(pid, os.WNOHANG)
            reaped = observed_pid == pid
            assert observed_pid == 0
            observations = {"child_exit_available_after_read": observed_pid != 0}
            child_status, wait = measure(lambda: after_send(b"X", reap))
            order = ["read_result", "child_still_alive", "reap_child"]
        else:
            child_status, wait = measure(lambda: after_send(b"W", reap))
            pipe_readable = bool(select.select([result_read], [], [], 0)[0])
            assert pipe_readable
            observations = {"pipe_readable_after_reap": pipe_readable}
            total, read = measure(read_result)
            order = ["reap_child", "pipe_readable", "read_result"]

        assert total == 42 and child_status["exit_code"] == 0
        return {"events": order, "ready_before_release": ready_before, **observations,
                "total": total, "read": read, "wait": wait, **child_status}
    finally:
        os.close(control_write)
        os.close(result_read)
        if not reaped:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                os.waitpid(pid, 0)
            except ChildProcessError:
                pass


def deadline(_signal, _frame):
    raise TimeoutError("pipe/child exit protocol exceeded 5 seconds")


def main():
    if not hasattr(os, "wait4"):
        raise SystemExit("Run this experiment on macOS or Linux.")
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(5)
    try:
        cases = {mode: run(mode) for mode in ("read_first", "wait_first")}
    finally:
        signal.alarm(0)
    print(json.dumps({
        "status": "passed",
        "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "environment": {"os": platform.system(), "machine": platform.machine(),
                        "python": platform.python_version()},
        "fixture": {"controlled_pause_ms": PAUSE * 1000, "child_work_cpu_ms": WORK_NS / 1_000_000},
        "cases": cases,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
