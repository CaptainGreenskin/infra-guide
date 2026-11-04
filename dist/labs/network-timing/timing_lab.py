"""Run with Python 3 and curl: python3 timing_lab.py

Two one-shot loopback HTTP requests with different delay placement.
The output is a local observation, not a cloud or TLS benchmark.
"""
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import subprocess
from threading import Thread
import time

DELAY = 0.15
BODY = b"hello"
FORMAT = "%{http_code} %{size_download} %{time_connect} %{time_starttransfer} %{time_total}"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in {"/late-headers", "/late-body"}:
            self.send_error(404)
            return
        if self.path == "/late-headers":
            time.sleep(DELAY)
        self.send_response(200)
        self.send_header("Content-Length", str(len(BODY)))
        self.end_headers()
        self.wfile.flush()
        if self.path == "/late-body":
            time.sleep(DELAY)
        self.wfile.write(BODY)

    def log_message(self, *_):
        pass


def measure(port, path):
    url = "http://127.0.0.1:" + str(port) + path
    fields = subprocess.check_output(
        ["curl", "-q", "--noproxy", "*", "--http1.1", "--max-time", "5",
         "--silent", "--show-error", "--output", os.devnull,
         "--write-out", FORMAT, url], text=True, timeout=8
    ).split()
    status, size = map(int, fields[:2])
    connect, first_byte, total = map(float, fields[2:])
    if status != 200 or size != len(BODY) or not 0 <= connect <= first_byte <= total:
        raise AssertionError((path, fields))
    before_first = (first_byte - connect) * 1000
    after_first = (total - first_byte) * 1000
    delayed_interval = before_first if path == "/late-headers" else after_first
    # Allow for timer rounding. A busy machine can lengthen either interval.
    if delayed_interval < DELAY * 1000 - 5:
        raise AssertionError("inserted delay was not visible in the expected interval")
    return {"path": path, "http_status": status, "bytes": size,
            "connect_to_first_byte_ms": round(before_first, 3),
            "first_byte_to_end_ms": round(after_first, 3)}


def run():
    with HTTPServer(("127.0.0.1", 0), Handler) as server:
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            rows = [measure(server.server_port, path) for path in ("/late-headers", "/late-body")]
        finally:
            server.shutdown()
            worker.join()
    return {"status": "passed", "injected_delay_ms": DELAY * 1000, "samples": rows,
            "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "scope": "loopback, plain HTTP/1.1, fresh connection per request, no DNS/TLS diagnosis"}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
