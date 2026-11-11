"""Run real HAProxy over loopback and read one restored report through its original entrance."""
import argparse
from contextlib import ExitStack, closing
import csv
from datetime import datetime, timezone
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import re
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time


ATTACHMENT = b"A report 3"
FIXTURE = {
    "tenant": "A", "report": "R3", "commit_seq": 102, "database_seq": 103,
    "object": "object-v3", "sha256": hashlib.sha256(ATTACHMENT).hexdigest(),
}
REPORT_PATH = "/reports/R3"
ATTACHMENT_PATH = "/attachments/object-v3"
PROBE_INTERVAL_MS = 60
STABLE_COUNT = 3
HAPROXY_VERSION = "3.2.26"


def write_attachment(path):
    candidate = path.with_suffix(".new")
    candidate.write_bytes(ATTACHMENT)
    candidate.replace(path)


def start_backend(directory, name, has_attachment, stack):
    directory.mkdir()
    database = directory / "reports.db"
    artifact = directory / FIXTURE["object"]
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("CREATE TABLE reports (tenant, report, commit_seq, object, sha256)")
        db.execute("CREATE TABLE progress (seq)")
        db.execute("INSERT INTO progress VALUES (?)", (FIXTURE["database_seq"],))
        db.execute("INSERT INTO reports VALUES (:tenant, :report, :commit_seq, :object, :sha256)", FIXTURE)
    if has_attachment:
        write_attachment(artifact)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            with closing(sqlite3.connect(database)) as db:
                db.row_factory = sqlite3.Row
                row = db.execute(
                    "SELECT *, (SELECT seq FROM progress) AS database_seq FROM reports "
                    "WHERE tenant=? AND report=?", (self.headers.get("X-Lab-Tenant", ""), FIXTURE["report"])
                ).fetchone()
            payload = b""
            if self.path == "/healthz":
                status = 200
            elif self.path == "/readyz":
                status = 200 if artifact.is_file() and hashlib.sha256(artifact.read_bytes()).hexdigest() == FIXTURE["sha256"] else 503
            elif self.path not in (REPORT_PATH, ATTACHMENT_PATH):
                status = 404
            elif row is None:
                status = 403
            elif self.path == REPORT_PATH:
                status, payload = 200, json.dumps(dict(row), sort_keys=True).encode()
            elif artifact.is_file():
                status, payload = 200, artifact.read_bytes()
            else:
                status = 404

            self.send_response(status)
            self.send_header("X-Lab-Backend", name)
            self.send_header("X-Request-ID", self.headers.get("X-Request-ID", ""))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()

    def stop():
        if thread.is_alive():
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
            if thread.is_alive():
                raise RuntimeError(f"{name} listener did not stop")

    stack.callback(stop)
    return server.server_port, artifact, stop


def unused_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def fetch(port, path, request_id, tenant, clock):
    started = clock()
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
    try:
        conn.request("GET", path, headers={"X-Request-ID": request_id, "X-Lab-Tenant": tenant})
        response = conn.getresponse()
        raw = response.read()
        return {
            "request_id": request_id, "echo": response.getheader("X-Request-ID"),
            "backend": response.getheader("X-Lab-Backend"), "status": response.status,
            "body": raw.decode("utf-8", errors="replace"), "sha256": hashlib.sha256(raw).hexdigest(),
            "started_ms": started, "ended_ms": clock(),
        }
    except (OSError, http.client.HTTPException) as error:
        return {"request_id": request_id, "status": None, "error": type(error).__name__,
                "started_ms": started, "ended_ms": clock()}
    finally:
        conn.close()


def read_stats(path):
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(1)
        client.connect(str(path))
        client.sendall(b"show stat\n")
        with client.makefile("r", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
    return {
        row["svname"]: {key: row[key] for key in ("status", "check_status", "check_code")}
        for row in rows if row["svname"] in {"backend-a", "backend-b"}
    }


def run_case(binary, health_path):
    start = time.monotonic_ns()

    def clock():
        return (time.monotonic_ns() - start) // 1_000_000

    with tempfile.TemporaryDirectory(prefix="hap-r3-", dir="/tmp") as tmp, ExitStack() as stack:
        root = Path(tmp)
        a_port, _, stop_a = start_backend(root / "a", "backend-a", True, stack)
        b_port, b_attachment, _ = start_backend(root / "b", "backend-b", False, stack)
        proxy_port = unused_port()
        stats_path = root / "stats.sock"
        config = f"""global
    stats socket {stats_path} mode 600 level user
    maxconn 32
defaults
    mode http
    timeout connect 300ms
    timeout client 2s
    timeout server 2s
    timeout check 500ms
    retries 0
frontend entry
    bind 127.0.0.1:{proxy_port}
    default_backend reports
backend reports
    option httpchk
    http-check connect
    http-check send meth GET uri {health_path} ver HTTP/1.1 hdr Host recovery.lab
    http-check expect status 200
    default-server inter 80ms fall 2 rise 2 init-state fully-down
    server backend-a 127.0.0.1:{a_port} check
    server backend-b 127.0.0.1:{b_port} check backup
"""
        config_path = root / "haproxy.cfg"
        config_path.write_text(config, encoding="utf-8")
        subprocess.run([binary, "-c", "-f", str(config_path)], check=True, capture_output=True, timeout=5)
        log = stack.enter_context((root / "proxy.log").open("w+"))
        proxy = subprocess.Popen([binary, "-db", "-f", str(config_path)], stdout=log, stderr=log)

        def stop_proxy():
            if proxy.poll() is None:
                proxy.terminate()
                try:
                    proxy.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    proxy.kill()
                    proxy.wait(timeout=4)

        stack.callback(stop_proxy)

        def wait_for(step):
            deadline = time.monotonic() + 8
            while time.monotonic() < deadline:
                if proxy.poll() is not None:
                    log.seek(0)
                    raise RuntimeError(f"HAProxy stopped with {proxy.returncode}: {log.read()}")
                result = step()
                if result:
                    return result
                time.sleep(PROBE_INTERVAL_MS / 1000)
            raise RuntimeError(f"{health_path}: timed out waiting for {step.__name__}")

        def stats():
            try:
                return read_stats(stats_path)
            except OSError:
                return {}

        def initial_state():
            state = stats()
            a = state.get("backend-a", {})
            b = state.get("backend-b", {})
            if (a.get("status"), a.get("check_code"), b.get("status"), b.get("check_code")) == ("UP", "200", b_before, b_code):
                return state

        b_before, b_code = ("UP", "200") if health_path == "/healthz" else ("DOWN", "503")
        initial = wait_for(initial_state)
        preflight = {
            "backend_b_health": fetch(b_port, "/healthz", "direct-b-health", "A", clock),
            "backend_b_ready": fetch(b_port, "/readyz", "direct-b-ready", "A", clock),
            "backend_b_report": fetch(b_port, REPORT_PATH, "direct-b-report", "A", clock),
            "backend_b_attachment": fetch(b_port, ATTACHMENT_PATH, "direct-b-attachment", "A", clock),
        }
        reads = []

        def read(stage):
            trial = len(reads) + 1
            result = {
                "trial": trial, "stage": stage,
                "report": fetch(proxy_port, REPORT_PATH, f"{trial}-report", "A", clock),
                "attachment": fetch(proxy_port, ATTACHMENT_PATH, f"{trial}-attachment", "A", clock),
                "proxy": stats(),
            }
            reads.append(result)
            return result

        read("before_fault")
        wrong_tenant = fetch(proxy_port, REPORT_PATH, "wrong-tenant", "B", clock)
        fault_ms = clock()
        stop_a()
        a_closed_ms = clock()
        stopped_backend_a = fetch(a_port, "/healthz", "direct-a-after-close", "A", clock)

        def missing_attachment():
            row = read("after_fault")
            state = row["proxy"]
            statuses = (row["report"]["status"], row["attachment"]["status"])
            expected = (200, 404) if health_path == "/healthz" else (503, 503)
            if state.get("backend-a", {}).get("status") == "DOWN" and state.get("backend-b", {}).get("status") == b_before and statuses == expected:
                return row["trial"]

        incomplete = wait_for(missing_attachment)
        write_attachment(b_attachment)
        repaired_ms = clock()
        stable = []

        def stable_readback():
            row = read("after_repair")
            report, artifact = row["report"], row["attachment"]
            if (report["status"], artifact["status"], report.get("backend"), artifact.get("backend"),
                    artifact.get("sha256")) == (200, 200, "backend-b", "backend-b", FIXTURE["sha256"]):
                stable.append(row["trial"])
            else:
                stable.clear()
            if len(stable) == STABLE_COUNT:
                return row

        last = wait_for(stable_readback)
        stable_ms = last["attachment"]["ended_ms"]
        stop_proxy()
        return {
            "health_path": health_path, "frontend": f"127.0.0.1:{proxy_port}",
            "backend_endpoints": {"backend-a": f"127.0.0.1:{a_port}", "backend-b": f"127.0.0.1:{b_port}"},
            "config": config, "initial_proxy": initial, "preflight": preflight, "wrong_tenant": wrong_tenant,
            "reads": reads, "fault_ms": fault_ms, "a_closed_ms": a_closed_ms, "stopped_backend_a": stopped_backend_a,
            "incomplete_trial": incomplete,
            "repaired_ms": repaired_ms, "stable_trials": stable, "stable_ms": stable_ms,
            "elapsed_ms_from_fault": stable_ms - fault_ms, "proxy_exit": proxy.returncode,
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--haproxy", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    binary = str(args.haproxy.resolve(strict=True))
    version = subprocess.run([binary, "-v"], text=True, capture_output=True, check=True, timeout=5).stdout.splitlines()[0]
    if not re.search(r"^HAProxy version 3\.2\.26(?:[-+ ]|$)", version):
        parser.error(f"expected HAProxy {HAPROXY_VERSION}, found {version}")
    record = {
        "schema": 1, "status": "observed", "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "loopback HTTP, synthetic SQLite metadata and one known attachment, host-local HAProxy health transitions",
        "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "environment": {
            "platform": platform.platform(), "python": platform.python_version(),
            "haproxy_version": version, "haproxy_sha256": hashlib.sha256(Path(binary).read_bytes()).hexdigest(),
        },
        "fixture": FIXTURE, "probe_interval_ms": PROBE_INTERVAL_MS, "stable_read_count": STABLE_COUNT,
        "cases": {mode: run_case(binary, route) for mode, route in (("ordinary", "/healthz"), ("material", "/readyz"))},
    }
    args.output.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
