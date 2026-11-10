"""One HTTP worker and its independently scheduled loopback load generator."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from queue import Full, Queue
from threading import Event, Lock, Thread
import hashlib
import json
import math
import platform
import sys
import time


PORT = 8765
CGROUP = Path("/sys/fs/cgroup")
NS_PER_MS = 1_000_000


def cpu_max():
    if Path("/proc/self/cgroup").read_text().strip() != "0::/":
        raise RuntimeError("expected a private cgroup v2 namespace")
    return (CGROUP / "cpu.max").read_text().strip()


def cpu_stat():
    return {key: int(value) for key, value in
            (line.split() for line in (CGROUP / "cpu.stat").read_text().splitlines())}


def digest_for(request_id, iterations):
    return hashlib.pbkdf2_hmac(
        "sha256", str(request_id).encode("ascii"), b"infra-guide-capacity", iterations
    ).hex()


@dataclass
class Work:
    request_id: int
    ingress_ns: int
    done: Event = field(default_factory=Event)
    receipt: dict = field(default_factory=dict)


def serve(iterations, waiting_slots):
    waiting = Queue(maxsize=waiting_slots)
    counts = dict(offered=0, admitted=0, completed=0, rejected=0)
    counts_lock = Lock()

    def worker():
        while True:
            job = waiting.get()
            start = time.monotonic_ns()
            cpu_start = time.thread_time_ns()
            digest = digest_for(job.request_id, iterations)
            work_cpu_ns = time.thread_time_ns() - cpu_start
            finish = time.monotonic_ns()
            job.receipt = {
                "id": job.request_id, "digest": digest,
                "queue_wait_ns": start - job.ingress_ns,
                "work_wall_ns": finish - start, "work_cpu_ns": work_cpu_ns,
            }
            with counts_lock:
                counts["completed"] += 1
            job.done.set()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, status, value):
            body = json.dumps(value).encode("ascii")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/metrics":
                with counts_lock:
                    state = {"cpu_max": cpu_max(), "cpu_stat": cpu_stat(), "counts": counts.copy()}
                self.reply(200, state)
                return
            prefix = "/work/"
            if not self.path.startswith(prefix) or not self.path[len(prefix):].isdigit():
                self.reply(404, {})
                return
            job = Work(int(self.path[len(prefix):]), time.monotonic_ns())
            with counts_lock:
                counts["offered"] += 1
                try:
                    waiting.put_nowait(job)
                except Full:
                    counts["rejected"] += 1
                    admitted = False
                else:
                    counts["admitted"] += 1
                    admitted = True
            if not admitted:
                self.reply(503, {"id": job.request_id})
                return
            job.done.wait()
            self.reply(200, job.receipt)

    class Server(ThreadingHTTPServer):
        request_queue_size = 128

    with Server(("127.0.0.1", PORT), Handler) as server:
        Thread(target=worker, daemon=True).start()
        server.serve_forever()


def request_json(path):
    connection = HTTPConnection("127.0.0.1", PORT, timeout=8)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


def metrics():
    deadline = time.monotonic() + 5
    while True:
        try:
            status, state = request_json("/metrics")
        except ConnectionRefusedError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.02)
        else:
            if status != 200:
                raise RuntimeError(f"metrics returned HTTP {status}")
            return state


def summarize_ns(samples):
    if not samples:
        return {"p50": None, "p95": None, "max": None}
    values = sorted(samples)
    return {
        "p50": round(values[math.ceil(len(values) * 0.50) - 1] / NS_PER_MS, 3),
        "p95": round(values[math.ceil(len(values) * 0.95) - 1] / NS_PER_MS, 3),
        "max": round(values[-1] / NS_PER_MS, 3),
    }


def load(iterations, offers, interval_ms):
    before = metrics()
    if cpu_max().split()[0] != "max":
        raise RuntimeError("load generator should have no direct CPU quota")
    interval_ns = interval_ms * NS_PER_MS
    origin = time.monotonic_ns() + 100 * NS_PER_MS

    def offer(request_id, target):
        sent = time.monotonic_ns()
        status, body = request_json(f"/work/{request_id}")
        received = time.monotonic_ns()
        if body.get("id") != request_id:
            raise RuntimeError(f"response ID mismatch for request {request_id}")
        return {
            "id": request_id, "status": status, "target_ns": target - origin,
            "sent_ns": sent - origin, "received_ns": received - origin,
            "receipt": body,
        }

    with ThreadPoolExecutor(max_workers=offers) as executor:
        pending = []
        for index in range(offers):
            target = origin + index * interval_ns
            wait_ns = target - time.monotonic_ns()
            if wait_ns > 0:
                time.sleep(wait_ns / 1_000_000_000)
            pending.append(executor.submit(offer, index + 1, target))
        rows = [future.result() for future in pending]
    after = metrics()

    completed = [row for row in rows if row["status"] == 200]
    rejected = [row for row in rows if row["status"] == 503]
    counts = dict(offered=offers, admitted=len(completed),
                  completed=len(completed), rejected=len(rejected))
    if (len(completed) + len(rejected) != offers or counts != after["counts"]
            or any(before["counts"].values())):
        raise RuntimeError(f"HTTP trace and server counts disagree: {counts} vs {after['counts']}")
    for row in rows:
        if not 0 <= row["target_ns"] <= row["sent_ns"] < row["received_ns"]:
            raise RuntimeError(f"invalid client timings for request {row['id']}")
    for row in completed:
        receipt = row["receipt"]
        if (receipt["queue_wait_ns"] < 0
                or min(receipt["work_cpu_ns"], receipt["work_wall_ns"]) <= 0
                or receipt["digest"] != digest_for(row["id"], iterations)):
            raise RuntimeError(f"invalid worker receipt: {receipt}")
    if any(set(row["receipt"]) != {"id"} for row in rejected):
        raise RuntimeError("a rejected request returned a worker receipt")
    if before["cpu_max"] != after["cpu_max"]:
        raise RuntimeError("server CPU quota changed within the run")

    delta = {key: value - before["cpu_stat"][key] for key, value in after["cpu_stat"].items()}
    if any(delta[key] < 0 for key in ("usage_usec", "nr_periods", "nr_throttled", "throttled_usec")):
        raise RuntimeError("CPU counters moved backwards")
    return {
        "cpu_max": after["cpu_max"], "cpu_stat_before": before["cpu_stat"],
        "cpu_stat_after": after["cpu_stat"], "cpu_stat_delta": delta,
        "counts": counts, "server_counts": after["counts"],
        "success_latency_ms": summarize_ns([r["received_ns"] - r["sent_ns"] for r in completed]),
        "success_queue_wait_ms": summarize_ns([r["receipt"]["queue_wait_ns"] for r in completed]),
        "success_work_cpu_ms": summarize_ns([r["receipt"]["work_cpu_ns"] for r in completed]),
        "send_slip_ms": summarize_ns([r["sent_ns"] - r["target_ns"] for r in rows]),
        "load_generator_cpu_max": cpu_max(), "arrivals": rows,
        "linux_kernel": platform.release(), "python_version": platform.python_version(),
    }


if __name__ == "__main__":
    role, *args = sys.argv[1:]
    if role == "serve":
        serve(*map(int, args))
    elif role == "load":
        print(json.dumps(load(*map(int, args))))
    else:
        raise SystemExit(f"unknown role: {role}")
