"""Observe admission, worker slots and a separate downstream permit."""
import hashlib
import json
from pathlib import Path
import platform
from queue import Full, Queue
from threading import BoundedSemaphore, Event, Lock, Thread
import time

ARRIVALS = ("A", "B", "C", "D")
QUEUE_CAPACITY = 1
DOWNSTREAM_CAPACITY = 1
WAIT_SECONDS = 5


def run(worker_count):
    jobs = Queue(maxsize=QUEUE_CAPACITY)
    downstream = BoundedSemaphore(DOWNSTREAM_CAPACITY)
    a_has_permit, b_found_busy, release_a = Event(), Event(), Event()
    trace_lock = Lock()
    events = []
    started = time.monotonic_ns()

    def record(event, task, **detail):
        events.append({"event": event, "task": task,
                       "at_ns": time.monotonic_ns() - started, **detail})

    def mark(event, task, **detail):
        with trace_lock:
            record(event, task, **detail)

    def submit(task):
        with trace_lock:
            try:
                jobs.put_nowait(task)
            except Full:
                record("rejected", task)
            else:
                record("admitted", task)

    def worker():
        while True:
            task = jobs.get()
            try:
                if task is None:
                    return
                mark("worker_started", task)
                if not downstream.acquire(blocking=False):
                    mark("downstream_busy", task)
                    if task == "B":
                        b_found_busy.set()
                    if not downstream.acquire(timeout=WAIT_SECONDS):
                        raise TimeoutError("downstream permit was not released")
                mark("downstream_acquired", task)
                try:
                    if task == "A":
                        a_has_permit.set()
                        if not release_a.wait(WAIT_SECONDS):
                            raise TimeoutError("controller did not release task A")
                    result = sum((10, 27, 5))
                finally:
                    mark("downstream_released", task)
                    downstream.release()
                mark("completed", task, result=result)
            finally:
                jobs.task_done()

    workers = [Thread(target=worker, daemon=True) for _ in range(worker_count)]
    for thread in workers:
        thread.start()

    try:
        submit(ARRIVALS[0])
        assert a_has_permit.wait(WAIT_SECONDS), "A did not acquire its permit"
        submit(ARRIVALS[1])
        if worker_count == 2:
            assert b_found_busy.wait(WAIT_SECONDS), "B did not reach the downstream boundary"
        for task in ARRIVALS[2:]:
            submit(task)

        with trace_lock:
            last_event = {row["task"]: row["event"] for row in events}
            snapshot = {
                "queue_depth": jobs.qsize(),
                "queued": [task for task in ARRIVALS if last_event[task] == "admitted"],
                "waiting_for_downstream": [task for task in ARRIVALS if last_event[task] == "downstream_busy"],
                "holding_downstream": [task for task in ARRIVALS if last_event[task] == "downstream_acquired"],
                "rejected": [task for task in ARRIVALS if last_event[task] == "rejected"],
            }
            record("snapshot", None)
    finally:
        mark("release_A_gate", "A")
        release_a.set()
        for _ in workers:
            jobs.put(None, timeout=WAIT_SECONDS)
        for thread in workers:
            thread.join(WAIT_SECONDS)

    assert all(not thread.is_alive() for thread in workers)
    admitted = [row["task"] for row in events if row["event"] == "admitted"]
    completed = sorted(row["task"] for row in events if row["event"] == "completed")
    assert completed == sorted(admitted)
    return {"workers": worker_count, "snapshot": snapshot, "events": events}


def main():
    cases = {f"workers_{n}": run(n) for n in (1, 2)}
    assert cases["workers_1"]["snapshot"] == {
        "queue_depth": 1, "queued": ["B"], "waiting_for_downstream": [],
        "holding_downstream": ["A"], "rejected": ["C", "D"],
    }
    assert cases["workers_2"]["snapshot"] == {
        "queue_depth": 1, "queued": ["C"], "waiting_for_downstream": ["B"],
        "holding_downstream": ["A"], "rejected": ["D"],
    }
    print(json.dumps({
        "status": "passed",
        "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "environment": {"os": platform.system(), "python": platform.python_version()},
        "arrivals": ARRIVALS,
        "queue_capacity": QUEUE_CAPACITY,
        "downstream_capacity": DOWNSTREAM_CAPACITY,
        "cases": cases,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
