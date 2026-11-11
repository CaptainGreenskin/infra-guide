"""Observe QEMU's vCPU identifiers and a controlled Linux run-queue wait."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import select
import socket
import subprocess
import sys
import tempfile
import time


class Monitor:
    def __init__(self, messages):
        self.messages = messages
        self.events = []
        self.sequence = 0
        if "QMP" not in self.read():
            raise RuntimeError("Expected the QMP greeting")
        self.call("qmp_capabilities")

    def read(self):
        line = self.messages.readline()
        if not line:
            raise RuntimeError("QMP closed unexpectedly")
        return json.loads(line)

    def call(self, command):
        self.sequence += 1
        payload = {"execute": command, "id": self.sequence}
        self.messages.write(json.dumps(payload).encode("ascii") + b"\n")
        self.messages.flush()
        while True:
            message = self.read()
            if "event" in message:
                self.events.append(message["event"])
                continue
            if message.get("id") != self.sequence or "return" not in message:
                raise RuntimeError(f"{command}: unexpected QMP reply {message}")
            return message["return"]


def connect(path, process):
    deadline = time.monotonic() + 8
    client = socket.socket(socket.AF_UNIX)
    try:
        while time.monotonic() < deadline and process.poll() is None:
            try:
                client.connect(str(path))
            except (FileNotFoundError, ConnectionRefusedError):
                time.sleep(0.02)
                continue
            client.settimeout(5)
            return client
        raise RuntimeError("QEMU did not open the private QMP socket")
    except BaseException:
        client.close()
        raise


def read_schedstat(path):
    counts = [int(part) for part in path.read_text().split()]
    if len(counts) != 3 or any(count < 0 for count in counts):
        raise RuntimeError(f"Unexpected schedstat fields at {path}: {counts}")
    return counts


def snapshot(path):
    start_time = time.monotonic_ns()
    before = read_schedstat(path)
    time.sleep(1.5)
    after = read_schedstat(path)
    delta = [right - left for left, right in zip(before, after)]
    if delta[0] <= 0 or min(delta) < 0:
        raise RuntimeError(f"The vCPU did not show increasing execution counters: {delta}")
    return {"elapsed_ns": time.monotonic_ns() - start_time,
            "before": before, "after": after, "delta": delta}


def proc_thread(pid, cpu):
    tid = cpu["thread-id"]
    task = Path(f"/proc/{pid}/task/{tid}")
    fields = dict(line.split(":", 1) for line in (task / "status").read_text().splitlines())
    proc_pid, proc_tgid = int(fields["Pid"]), int(fields["Tgid"])
    if (proc_pid, proc_tgid) != (tid, pid):
        raise RuntimeError(f"QMP vCPU {cpu['cpu-index']} did not map to {task}")
    schedstat = task / "schedstat"
    read_schedstat(schedstat)
    return {"cpu_index": cpu["cpu-index"], "pid": proc_pid, "tgid": proc_tgid,
            "comm": (task / "comm").read_text().strip(), "schedstat": str(schedstat)}


def require_schedstats():
    path = Path("/proc/sys/kernel/sched_schedstats")
    if not path.is_file() or path.read_text().strip() != "1":
        raise RuntimeError("Linux schedstats are disabled; enable kernel.sched_schedstats on the test host")
    return "1"


def stop_process(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def observe_linux(qmp, pid, cpus, schedstats_setting):
    thread_ids = [cpu["thread-id"] for cpu in cpus]
    if len(set(thread_ids)) != 2 or pid in thread_ids:
        raise RuntimeError("Expected two independent TCG vCPU threads on Linux")
    threads = [proc_thread(pid, cpu) for cpu in cpus]
    tid = thread_ids[0]
    allowed = os.sched_getaffinity(tid) & os.sched_getaffinity(0)
    if not allowed:
        raise RuntimeError("No shared CPU is available to the vCPU and competitor")
    cpu = max(allowed)
    os.sched_setaffinity(tid, {cpu})
    affinity = sorted(os.sched_getaffinity(tid))
    if affinity != [cpu]:
        raise RuntimeError(f"Unexpected vCPU affinity: {affinity}")
    qmp.call("cont")
    initial_status = qmp.call("query-status")
    if not initial_status["running"]:
        raise RuntimeError("QEMU did not enter running state")
    time.sleep(0.25)
    schedstat = Path(threads[0]["schedstat"])
    baseline = snapshot(schedstat)
    competitor_code = """import os, sys
os.sched_setaffinity(0, {int(sys.argv[1])})
print("ready", flush=True)
while True:
    pass
"""
    with subprocess.Popen([sys.executable, "-c", competitor_code, str(cpu)],
                          stdout=subprocess.PIPE, text=True) as contender:
        try:
            ready, _, _ = select.select([contender.stdout], [], [], 5)
            if not ready or contender.stdout.readline().strip() != "ready":
                raise RuntimeError("CPU contender failed to start")
            contender_affinity = sorted(os.sched_getaffinity(contender.pid))
            if contender_affinity != affinity:
                raise RuntimeError(f"Unexpected CPU contender affinity: {contender_affinity}")
            time.sleep(0.25)
            contender_stat = Path(f"/proc/{contender.pid}/schedstat")
            contender_before = read_schedstat(contender_stat)[0]
            shared = snapshot(schedstat)
            contender_runtime = read_schedstat(contender_stat)[0] - contender_before
            contender_pid = contender.pid
        finally:
            stop_process(contender)
    qmp.call("stop")
    stopped_status = qmp.call("query-status")
    if stopped_status["running"]:
        raise RuntimeError("QEMU did not stop")
    if contender_runtime <= 0 or shared["delta"][1] <= baseline["delta"][1]:
        raise RuntimeError(f"The comparison did not show extra run-queue wait: {baseline=}, {shared=}")
    return {"observed_vcpu": 0, "proc_threads": threads, "allowed_host_cpus": affinity,
            "contender_pid": contender_pid, "contender_affinity": contender_affinity,
            "contender_runtime_ns": contender_runtime, "running": initial_status, "stopped": stopped_status,
            "alone": baseline, "same_cpu_contender": shared,
            "schedstats_setting": schedstats_setting}


def run(qemu):
    schedstats_setting = require_schedstats() if sys.platform == "linux" else None
    binary = subprocess.check_output([qemu, "--version"], text=True, timeout=5).splitlines()[0]
    with tempfile.TemporaryDirectory(prefix="infra-qmp-", dir="/tmp") as scratch:
        work = Path(scratch)
        qmp_socket = work / "qmp.sock"
        payload = work / "loop.bin"
        # AArch64: branch to the current instruction. Only vCPU 0 executes it.
        payload.write_bytes(bytes.fromhex("00000014"))
        command = [qemu, "-machine", "virt", "-accel", "tcg,thread=multi",
                   "-cpu", "cortex-a57", "-smp", "2", "-m", "128M", "-S",
                   "-nodefaults", "-display", "none", "-serial", "none",
                   "-monitor", "none", "-nic", "none",
                   "-qmp", f"unix:{qmp_socket},server=on,wait=off",
                   "-device", f"loader,file={payload},addr=0x40200000,force-raw=on,cpu-num=0"]
        with subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL) as process:
            try:
                with connect(qmp_socket, process) as connection:
                    with connection.makefile("rwb") as messages:
                        monitor = Monitor(messages)
                        prelaunch = monitor.call("query-status")
                        cpus = sorted(monitor.call("query-cpus-fast"), key=lambda entry: entry["cpu-index"])
                        if [entry["cpu-index"] for entry in cpus] != [0, 1] or prelaunch["running"]:
                            raise RuntimeError("Expected two configured vCPUs, initially paused")
                        observation = {
                            "qemu_pid": process.pid, "cpus": cpus, "prelaunch": prelaunch,
                            "linux": observe_linux(monitor, process.pid, cpus, schedstats_setting)
                            if schedstats_setting else None,
                        }
                        monitor.call("quit")
                        observation["qmp_events"] = monitor.events
                if process.wait(timeout=5):
                    raise RuntimeError("QEMU exited with an error")
            finally:
                stop_process(process)
    return {"host": {"system": platform.system(), "arch": platform.machine(), "kernel": platform.release()},
            "qemu_version": binary, "accelerator": "tcg,thread=multi", "guest_payload_hex": "00000014",
            "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), **observation}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qemu", default="qemu-system-aarch64")
    args = parser.parse_args()
    if sys.platform not in {"darwin", "linux"}:
        parser.error("This probe supports Darwin and Linux hosts")
    print(json.dumps(run(args.qemu), indent=2))


if __name__ == "__main__":
    main()
