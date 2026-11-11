#!/usr/bin/env python3
"""Observe curl's two loopback candidates and the first HTTP response."""
import argparse
from contextlib import contextmanager
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import threading

HOST = "dual.example.test"
ROUTE = "/orders/O-104"
IPV4 = "127.0.0.1"
IPV6 = "::1"
METADATA = "\n--curl-observation--\n"
WRITE_OUT = METADATA + (
    "%{remote_ip}|%{remote_port}|%{local_ip}|%{local_port}|"
    "%{http_code}|%{num_connects}|%{time_connect}|%{time_starttransfer}\n"
)
CURL_ENV = {**os.environ, "LC_ALL": "C"}


class OrderHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def do_GET(self):
        server = self.server
        peer = self.client_address[:2]
        server.record({"event": "request", "method": self.command, "path": self.path,
                       "host": self.headers.get("Host"), "peer": list(peer)})
        if server.hold_response:
            server.release.wait()
            self.close_connection = True
            return
        response = {"order": "O-104", "amount": 37, "family": server.family}
        body = (json.dumps(response, separators=(",", ":")) + "\n").encode("ascii")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        server.record({"event": "response", "status": 200, "body": response})


class OrderServer(ThreadingHTTPServer):
    daemon_threads = False
    allow_reuse_address = True

    def __init__(self, address, port, hold_response=False):
        self.address_family = socket.AF_INET6 if address == IPV6 else socket.AF_INET
        self.family = "IPv6" if address == IPV6 else "IPv4"
        self.hold_response = hold_response
        self.release = threading.Event()
        self.lock = threading.Lock()
        self.events = []
        super().__init__((address, port), OrderHandler)

    def record(self, event):
        with self.lock:
            self.events.append(event)

    def get_request(self):
        connection, peer = super().get_request()
        self.record({"event": "accepted", "local": list(connection.getsockname()[:2]),
                     "peer": list(peer[:2])})
        return connection, peer


@contextmanager
def serving(server):
    worker = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02})
    worker.start()
    try:
        yield server
    finally:
        server.release.set()
        server.shutdown()
        worker.join()
        server.server_close()


def probe(curl, port, v6_only=False):
    args = ["-q", "--silent", "--show-error", "--verbose", "--noproxy", "*",
            "--http1.1", "--connect-timeout", "0.5", "--max-time", "1",
            "--happy-eyeballs-timeout-ms", "100", "--resolve",
            f"{HOST}:{port}:[{IPV6}],{IPV4}", "--write-out", WRITE_OUT]
    if v6_only:
        args.append("--ipv6")
    args.append(f"http://{HOST}:{port}{ROUTE}")
    done = subprocess.run([curl, *args], capture_output=True, text=True, env=CURL_ENV, timeout=4)
    return {"args": args, "exit_code": done.returncode,
            "stdout": done.stdout, "stderr": done.stderr}


def run_case(curl, v6_mode, v6_only=False):
    ipv4 = OrderServer(IPV4, 0)
    port = ipv4.server_port
    with serving(ipv4):
        try:
            ipv6 = OrderServer(IPV6, port, hold_response=(v6_mode == "hold"))
        except OSError as exc:
            raise RuntimeError("The lab needs IPv6 loopback ::1 on the same port as IPv4.") from exc
        if v6_mode == "refuse":
            ipv6.server_close()
            result = probe(curl, port, v6_only)
        else:
            with serving(ipv6):
                result = probe(curl, port, v6_only)
    return {"port": port, "ipv6": v6_mode, "ipv6_only": v6_only,
            "curl": result, "listeners": {"IPv4": ipv4.events, "IPv6": ipv6.events}}


def observe(curl):
    version = subprocess.run([curl, "-q", "--version"], check=True, capture_output=True,
                             text=True, env=CURL_ENV, timeout=4).stdout
    features = next((line.split() for line in version.splitlines() if line.startswith("Features:")), [])
    if "IPv6" not in features:
        raise RuntimeError("curl must be built with IPv6 support.")
    cases = {
        "both_listen": run_case(curl, "reply"),
        "ipv6_refused": run_case(curl, "refuse"),
        "ipv6_only_refused": run_case(curl, "refuse", v6_only=True),
        "ipv6_http_wait": run_case(curl, "hold"),
    }
    expected = {
        "both_listen": (0, IPV6, "200", [], ["accepted", "request", "response"]),
        "ipv6_refused": (0, IPV4, "200", ["accepted", "request", "response"], []),
        "ipv6_only_refused": (7, "", "000", [], []),
        "ipv6_http_wait": (28, IPV6, "000", [], ["accepted", "request"]),
    }
    for name, case in cases.items():
        values = case["curl"]["stdout"].split(METADATA)[-1].strip().split("|")
        evidence = (case["curl"]["exit_code"], values[0], values[4],
                    [event["event"] for event in case["listeners"]["IPv4"]],
                    [event["event"] for event in case["listeners"]["IPv6"]])
        if evidence != expected[name]:
            raise RuntimeError(f"{name}: unexpected observation {evidence!r}")
    return {"schema": "dual-stack-connect-v1", "status": "passed",
            "environment": {"system": platform.system(), "machine": platform.machine(),
                            "python": platform.python_version(), "curl_version": version},
            "fixture": {"host": HOST, "path": ROUTE, "candidates": [IPV6, IPV4],
                        "connect_timeout_s": 0.5, "max_time_s": 1,
                        "happy_eyeballs_timeout_ms": 100},
            "source_sha256": {"dual_stack_connect.py": sha256(Path(__file__).read_bytes()).hexdigest()},
            "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curl", default="curl", help="IPv6-capable curl executable")
    parser.add_argument("--output", type=Path, help="write JSON to this file instead of stdout")
    options = parser.parse_args()
    result = json.dumps(observe(options.curl), ensure_ascii=False, indent=2) + "\n"
    if options.output:
        options.output.write_text(result, encoding="utf-8")
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
