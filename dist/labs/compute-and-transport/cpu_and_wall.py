"""Measure actual local CPU and elapsed time; no VM, cgroup limit or capacity benchmark."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import platform
from threading import Barrier, Event
import time


def burn_thread_cpu(seconds):
    started = time.thread_time()
    value = 1
    while time.thread_time()-started < seconds:
        for _ in range(200):
            value = (value*1664525+1013904223) & 0xffffffff
    return {"thread_cpu_seconds": time.thread_time()-started, "checksum": value}


def measure(action):
    wall, cpu = time.perf_counter(), time.process_time()
    detail = action()
    return {"elapsed_seconds": time.perf_counter()-wall,
            "process_cpu_seconds": time.process_time()-cpu, "detail": detail}


def paired_threads():
    gate = Barrier(2)
    def worker():
        gate.wait(timeout=5)
        return burn_thread_cpu(.10)
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(worker) for _ in range(2)]
        return [job.result(timeout=10) for job in jobs]


def main():
    cases = {
        "one_cpu_phase": measure(lambda: burn_thread_cpu(.10)),
        "one_wait_phase": measure(lambda: Event().wait(.12)),
        "two_cpu_threads": measure(paired_threads),
    }
    assert cases["one_cpu_phase"]["detail"]["thread_cpu_seconds"] >= .10
    assert cases["one_wait_phase"]["elapsed_seconds"] >= .12
    assert all(row["thread_cpu_seconds"] >= .10 for row in cases["two_cpu_threads"]["detail"])
    for row in cases.values():
        assert row["elapsed_seconds"] > 0 and row["process_cpu_seconds"] >= 0
    print(json.dumps({"python": platform.python_version(), "system": platform.system(),
                      "logical_cpu_count_hint": os.cpu_count(), "cases": cases,
                      "scope": "actual_local_CPU_and_wait_measurements_not_VM_quota_or_throughput_benchmark",
                      "limits": ["CPU targets are workload stopping conditions, not a simulated cgroup budget",
                                 "two threads share this process; GIL/build/native-code/platform affect parallel execution",
                                 "logical CPU count does not measure guaranteed capacity or identify physical core ownership",
                                 "actual timings vary; compare accounting categories, not speedup ratios"]}, indent=2))


if __name__ == "__main__":
    main()
