"""Observe Prometheus firing, Alertmanager admission, and real webhook delivery."""

import argparse
import contextlib
import datetime
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = pathlib.Path(__file__).resolve().parent
CASES = ("short", "long", "silenced")
ALERT = "GuideNotificationDelivery"
GROUP_WAIT = 5


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


class Fixture:
    def __init__(self):
        self.start = time.monotonic()
        self.lock = threading.Lock()
        self.active = dict.fromkeys(CASES, 0)
        self.inputs = []
        self.notifications = []

    def elapsed(self):
        return round(1000 * (time.monotonic() - self.start))

    def set(self, cases, value):
        with self.lock:
            now = self.elapsed()
            for case in cases:
                self.active[case] = value
                self.inputs.append({"at_ms": now, "case": case, "value": value})

    def metrics(self):
        with self.lock:
            return "".join(f'lab_notification_active{{case="{case}"}} {value}\n'
                           for case, value in self.active.items()).encode()

    def record(self, path, payload):
        with self.lock:
            self.notifications.append({"at_ms": self.elapsed(), "path": path, "payload": payload})

    def received(self):
        with self.lock:
            return list(self.notifications)


def serve(fixture, stack):
    class Handler(BaseHTTPRequestHandler):
        def reply(self, content, content_type):
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):
            if self.path == "/metrics":
                self.reply(fixture.metrics(), "text/plain; version=0.0.4")
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path not in {"/reports", "/fallback"}:
                self.send_error(404)
                return
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size < 65536:
                self.send_error(400)
                return
            payload = json.loads(self.rfile.read(size))
            fixture.record(self.path, payload)
            self.reply(b"{}", "application/json")

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    stack.callback(server.server_close)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    stack.callback(server.shutdown)
    return server.server_port


def reserve_port(stack):
    listener = stack.enter_context(socket.socket())
    listener.bind(("127.0.0.1", 0))
    return listener


def request(port, path, payload=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    try:
        body = json.dumps(payload).encode() if payload is not None else None
        connection.request("POST" if body is not None else "GET", path, body,
                           {"Content-Type": "application/json"} if body is not None else {})
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def api(port, path, payload=None):
    status, body = request(port, path, payload)
    if status != 200:
        raise RuntimeError(f"{path}: HTTP {status} {body[:300]!r}")
    return json.loads(body)


def until(label, probe, children, timeout=14):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for child in children:
            if child.poll() is not None:
                raise RuntimeError(f"{label}: child exited with {child.returncode}")
        try:
            value = probe()
        except (OSError, http.client.HTTPException):
            value = None
        if value:
            return value
        time.sleep(0.10)
    raise RuntimeError(f"Timed out waiting for {label}")


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def run(prometheus, alertmanager):
    fixture = Fixture()
    with contextlib.ExitStack() as stack:
        directory = pathlib.Path(stack.enter_context(tempfile.TemporaryDirectory()))
        receiver = serve(fixture, stack)
        prom_reservation = reserve_port(stack)
        manager_reservation = reserve_port(stack)
        prom = prom_reservation.getsockname()[1]
        manager = manager_reservation.getsockname()[1]

        def start(binary, args, name):
            logs = stack.enter_context((directory / f"{name}.log").open("w+"))
            process = subprocess.Popen([str(binary), *args], stdout=logs, stderr=logs, cwd=directory)
            stack.callback(stop, process)
            return process

        def addr(port):
            return f"127.0.0.1:{port}"

        settings = {
            "rules": {"groups": [{"name": "delivery", "rules": [{
                "alert": ALERT, "expr": "lab_notification_active == 1",
                "for": "1s", "labels": {"severity": "teaching"},
            }]}]},
            "prometheus": {
                "global": {"scrape_interval": "250ms", "evaluation_interval": "250ms"},
                "rule_files": ["rules.json"],
                "scrape_configs": [{"job_name": "reports", "static_configs": [{"targets": [addr(receiver)]}]}],
                "alerting": {"alertmanagers": [{"static_configs": [{"targets": [addr(manager)]}]}]},
            },
            "alertmanager": {
                "route": {"receiver": "fallback", "group_by": ["alertname", "case"],
                          "group_wait": f"{GROUP_WAIT}s", "group_interval": "2s", "repeat_interval": "60s",
                          "routes": [{"receiver": "reports", "matchers": ['severity="teaching"']}]},
                "receivers": [{"name": name, "webhook_configs": [
                    {"url": f"http://{addr(receiver)}/{name}", "send_resolved": True}
                ]} for name in ("fallback", "reports")],
            },
        }
        for name, config in settings.items():
            (directory / f"{name}.json").write_text(json.dumps(config), encoding="utf-8")

        manager_reservation.close()
        am = start(alertmanager, ["--config.file=alertmanager.json", "--storage.path=am-data",
                                  "--cluster.listen-address=", f"--web.listen-address={addr(manager)}",
                                  f"--web.external-url=http://{addr(manager)}"], "alertmanager")
        until("Alertmanager ready", lambda: request(manager, "/-/ready")[0] == 200, [am])
        prom_reservation.close()
        ps = start(prometheus, ["--config.file=prometheus.json", "--storage.tsdb.path=prom-data",
                               f"--web.listen-address={addr(prom)}",
                               f"--web.external-url=http://{addr(prom)}"], "prometheus")
        children = [am, ps]
        until("Prometheus ready", lambda: request(prom, "/-/ready")[0] == 200, children)

        def active_manager():
            data = api(prom, "/api/v1/alertmanagers")["data"]
            if any(url["url"] == f"http://{addr(manager)}/api/v2/alerts"
                   for url in data["activeAlertmanagers"]):
                return data
            return None

        discovery = until("Alertmanager discovery", active_manager, children)
        now = datetime.datetime.now(datetime.timezone.utc)
        silence = api(manager, "/api/v2/silences", {
            "matchers": [{"name": "case", "value": "silenced", "isRegex": False, "isEqual": True}],
            "startsAt": (now - datetime.timedelta(seconds=2)).isoformat(),
            "endsAt": (now + datetime.timedelta(minutes=3)).isoformat(),
            "createdBy": "infraguide-lab", "comment": "Local notification fixture",
        })
        silence_id = silence["silenceID"]
        fixture.set(CASES, 1)

        def observe_all(alerts, predicate):
            selected = {alert["labels"]["case"]: alert for alert in alerts
                        if alert["labels"].get("alertname") == ALERT and predicate(alert)}
            if set(selected) == set(CASES):
                return {"at_ms": fixture.elapsed(), "alerts": selected}
            return None

        firing = until("three Prometheus firing cases", lambda: observe_all(
            api(prom, "/api/v1/alerts")["data"]["alerts"], lambda row: row["state"] == "firing"
        ), children)
        ingress = until("three Alertmanager cases and active silence", lambda: observe_all(
            api(manager, "/api/v2/alerts"),
            lambda row: row["labels"]["case"] != "silenced" or silence_id in row["status"]["silencedBy"]
        ), children)
        fixture.set(("short",), 0)

        def short_cleared():
            alerts = api(manager, "/api/v2/alerts")
            remaining = {row["labels"]["case"] for row in alerts}
            if remaining == {"long", "silenced"}:
                return {"at_ms": fixture.elapsed(), "alerts": alerts}
            return None

        clear = until("short no longer active at Alertmanager", short_cleared, children)
        if clear["at_ms"] - fixture.inputs[0]["at_ms"] >= 1000 * GROUP_WAIT:
            raise RuntimeError("Short alert did not recover within its first group wait")

        def event(case, status):
            return next((row for row in fixture.received()
                         if row["payload"]["groupLabels"].get("case") == case
                         and row["payload"]["status"] == status), None)

        until("long firing webhook", lambda: event("long", "firing"), children)
        until("silenced group wait to pass",
              lambda: fixture.elapsed() >= ingress["at_ms"] + 1000 * (GROUP_WAIT + 1), children)
        after_wait = {"at_ms": fixture.elapsed(), "alerts": api(manager, "/api/v2/alerts")}
        if not any(row["labels"]["case"] == "silenced" and silence_id in row["status"]["silencedBy"]
                   for row in after_wait["alerts"]):
            raise RuntimeError("Silence not present after the first group wait")
        fixture.set(("long", "silenced"), 0)
        until("long resolved webhook", lambda: event("long", "resolved"), children)
        received = fixture.received()
        observed = [(row["path"], row["payload"]["groupLabels"]["case"], row["payload"]["status"])
                    for row in received]
        if observed != [("/reports", "long", "firing"), ("/reports", "long", "resolved")]:
            raise RuntimeError(f"Unexpected receiver sequence: {observed}")
        result = {"configuration": settings, "active_target": discovery, "silence_id": silence_id,
                  "inputs": fixture.inputs, "prometheus_firing": firing, "alertmanager_ingress": ingress,
                  "short_cleared": clear, "after_group_wait": after_wait,
                  "receiver_events": received, "observed_until_ms": fixture.elapsed()}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prometheus", required=True, type=pathlib.Path)
    parser.add_argument("--alertmanager", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    args = parser.parse_args()
    prom, manager = args.prometheus.resolve(strict=True), args.alertmanager.resolve(strict=True)
    tools = {}
    for name, binary, expected in (("prometheus", prom, "3.5.0"), ("alertmanager", manager, "0.34.2")):
        version = subprocess.check_output([str(binary), "--version"], stderr=subprocess.STDOUT,
                                          text=True, timeout=10).splitlines()[0]
        if f"version {expected} " not in version:
            raise RuntimeError(f"Expected {name} {expected}, got {version}")
        tools[name] = {"version": version, "binary_sha256": digest(binary)}
    result = run(prom, manager)
    record = {"schema": 1, "status": "passed", "environment": {
        "system": platform.system(), "machine": platform.machine(), "python": platform.python_version(),
        "tools": tools, "transport": "loopback HTTP",
    }, "source_sha256": {name: digest(HERE / name) for name in
                         ("alert_notification.py", "README.md", "release-provenance.json")}, **result}
    args.output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
