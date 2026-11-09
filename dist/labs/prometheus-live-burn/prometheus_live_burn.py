"""Scrape two controlled counters and read live Prometheus rule evaluations."""

import argparse
import contextlib
import hashlib
import http.client
import json
import pathlib
import platform
import socket
import subprocess
import tempfile
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HERE = pathlib.Path(__file__).resolve().parent
RULES = HERE / "live-burn.rules.yaml"
THRESHOLD = 14.4 * 0.001
ALERT = 'ALERTS{alertname="GuideLiveFastBurn"}'
ACTIVE_AT = 'ALERTS_FOR_STATE{alertname="GuideLiveFastBurn"}'
SHORT = 'job:lab_bad_ratio6s{job="reports"}'
LONG = 'job:lab_bad_ratio16s{job="reports"}'
BAD = 'sum(rate(lab_requests_total{outcome="bad"}[6s]))'
SUM_FIRST = 'rate((sum(lab_requests_total{outcome="bad"}))[6s:1s])'
RESET = 'sum(resets(lab_requests_total{outcome="bad",replica="alpha"}[6s]))'


def digest(path):
    with path.open("rb") as file:
        checksum = hashlib.sha256()
        for block in iter(lambda: file.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


class Counters:
    def __init__(self):
        self.lock = threading.Lock()
        self.phase = "healthy"
        self.reset_alpha = False
        self.values = {"alpha": [10000, 1000], "beta": [2000, 600]}
        self.scrapes = []

    def next(self, replica):
        with self.lock:
            phase = self.phase
            reset = replica == "alpha" and self.reset_alpha
            if reset:
                self.reset_alpha = False
                self.values[replica] = [0, 0]
            else:
                bad_increment = 40 if phase == "fault" and replica == "alpha" else 0
                values = self.values[replica]
                values[0] += 100 - bad_increment
                values[1] += bad_increment
            good, bad = self.values[replica]
            self.scrapes.append({"replica": replica, "phase": phase, "reset": reset,
                                 "good": good, "bad": bad})
            return good, bad

    def count(self, replica, phase):
        with self.lock:
            return sum(row["replica"] == replica and row["phase"] == phase
                       for row in self.scrapes)

    def set_phase(self, phase):
        with self.lock:
            self.phase = phase

    def schedule_reset(self):
        with self.lock:
            self.reset_alpha = True


def serve_exporter(replica, counters, stack):
    class Exporter(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/metrics":
                self.send_error(404)
                return
            good, bad = counters.next(replica)
            body = ('# TYPE lab_requests_total counter\n'
                    f'lab_requests_total{{replica="{replica}",outcome="good"}} {good}\n'
                    f'lab_requests_total{{replica="{replica}",outcome="bad"}} {bad}\n').encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Exporter)
    stack.callback(server.server_close)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    stack.callback(server.shutdown)
    return f"127.0.0.1:{server.server_port}"


def free_port():
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        return reservation.getsockname()[1]


def api(port, path):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        payload = json.loads(response.read())
        if response.status != 200 or payload.get("status") != "success":
            raise RuntimeError(f"Prometheus {path}: HTTP {response.status} {payload}")
        return payload["data"]
    finally:
        connection.close()


def query(port, expression, at):
    params = urllib.parse.urlencode({"query": expression, "time": f"{at:.3f}"})
    return api(port, f"/api/v1/query?{params}")["result"]


def value(result):
    if len(result) != 1:
        return None
    return float(result[0]["value"][1])


def state(result):
    if not result:
        return "inactive"
    if len(result) != 1:
        raise RuntimeError(f"expected one alert label set: {result}")
    return result[0]["metric"]["alertstate"]


def snapshot(port, label):
    at = time.time()
    return {"label": label, "query_time": round(at, 3), "samples": {
        key: query(port, expression, at) for key, expression in {
            "short": SHORT, "long": LONG, "alert": ALERT, "active_at": ACTIVE_AT,
            "resets": RESET, "rate_first_bad": BAD, "sum_first_bad": SUM_FIRST,
            "raw_counters": 'lab_requests_total{job="reports"}[16s]',
            "alert_history": ALERT + "[20s]",
        }.items()
    }}


def wait_for(process, log_path, label, observe, timeout=24):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(log_path.read_text(encoding="utf-8"))
        try:
            result = observe()
            if result is not None:
                return result
        except (OSError, http.client.HTTPException, json.JSONDecodeError):
            pass
        time.sleep(0.18)
    raise RuntimeError(f"timed out waiting for {label}\n{log_path.read_text(encoding='utf-8')}")


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=3)


def collect(binary):
    counters = Counters()
    with tempfile.TemporaryDirectory(prefix="prom-burn-") as directory, contextlib.ExitStack() as stack:
        work = pathlib.Path(directory)
        targets = [serve_exporter(replica, counters, stack) for replica in ("alpha", "beta")]
        port = free_port()
        config = {"global": {"scrape_interval": "1s", "scrape_timeout": "900ms",
                             "evaluation_interval": "1s"}, "rule_files": [str(RULES)],
                  "scrape_configs": [{"job_name": "reports", "static_configs": [{"targets": targets}]}]}
        config_path = work / "prometheus.yml"
        config_path.write_text(json.dumps(config), encoding="utf-8")
        log_path = work / "prometheus.log"
        log = stack.enter_context(log_path.open("w", encoding="utf-8"))
        process = subprocess.Popen([str(binary), f"--config.file={config_path}",
                                    f"--storage.tsdb.path={work / 'tsdb'}",
                                    f"--web.listen-address=127.0.0.1:{port}", "--log.level=error"],
                                   stdout=log, stderr=subprocess.STDOUT)
        stack.callback(stop, process)
        build = wait_for(process, log_path, "live HTTP API", lambda: api(port, "/api/v1/status/buildinfo"))
        if build.get("version") != "3.5.0":
            raise RuntimeError(f"expected Prometheus 3.5.0: {build}")

        def capture(label, predicate):
            def poll():
                current = snapshot(port, label)
                return current if predicate(current["samples"]) else None
            return wait_for(process, log_path, label, poll)

        warm = capture("healthy", lambda s: counters.count("alpha", "healthy") >= 6
                       and counters.count("beta", "healthy") >= 6
                       and value(s["short"]) == value(s["long"]) == 0
                       and state(s["alert"]) == "inactive")
        counters.schedule_reset()
        reset = capture("counter_reset", lambda s: value(s["resets"]) == 1
                        and value(s["rate_first_bad"]) == 0
                        and (value(s["sum_first_bad"]) or 0) > 0
                        and state(s["alert"]) == "inactive")
        counters.set_phase("fault")
        pending = capture("pending", lambda s: state(s["alert"]) == "pending"
                          and min(value(s["short"]) or 0, value(s["long"]) or 0) > THRESHOLD)
        firing = capture("firing", lambda s: state(s["alert"]) == "firing"
                         and min(value(s["short"]) or 0, value(s["long"]) or 0) > THRESHOLD)
        capture("sustained_firing", lambda s: state(s["alert"]) == "firing"
                and counters.count("alpha", "fault") >= 12)
        counters.set_phase("recovery")
        recovered = capture("recovered", lambda s: state(s["alert"]) == "inactive"
                            and value(s["short"]) == 0 and (value(s["long"]) or 0) > THRESHOLD)
        stop(process)
        if process.returncode != 0:
            raise RuntimeError(f"Prometheus did not exit cleanly: {process.returncode}")
        with counters.lock:
            observed_scrapes = list(counters.scrapes)
    return {"build": build, "binary_sha256": digest(binary), "observed_scrapes": observed_scrapes,
            "snapshots": [warm, reset, pending, firing, recovered], "clean_exit": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prometheus", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    args = parser.parse_args()
    evidence = collect(args.prometheus.resolve())
    record = {"status": "passed", "scope": "loopback HTTP scraping of controlled counter batches and live rule evaluation",
              "environment": {"system": platform.system(), "machine": platform.machine(),
                              "python": platform.python_version()},
              "source_sha256": {path.name: digest(path) for path in (pathlib.Path(__file__), RULES)},
              **evidence}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")
    print(f"Live Prometheus 3.5.0 passed with {len(record['observed_scrapes'])} exporter scrapes.")


if __name__ == "__main__":
    main()
