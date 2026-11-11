"""Follow a DNS address change through an existing and a fresh HTTP/1.1 connection."""
import argparse
from contextlib import closing, contextmanager
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import shutil
import signal
import socket
from subprocess import CalledProcessError
import sys
import tempfile
import threading
import time


dns_lab = Path(__file__).resolve().parent.parent / "dns-cache"
sys.path.insert(0, str(dns_lab))
import dns_cache as dns


PATH = "/orders/O-104"
TTL = 5
OLD_ADDRESS = "127.0.0.1"


class OrderHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def do_GET(self):
        request = {"id": self.headers["X-Lab-Request"], "host": self.headers["Host"], "path": self.path,
                   "connection": self.server.connections[self.connection]}
        self.server.requests.append(request)
        status = 200 if self.path == PATH and request["host"] == self.server.http_host else 404
        body = json.dumps({"request_id": request["id"], "backend": self.server.label,
                           "connection": request["connection"], "order": "O-104", "amount": 37}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class Origin(ThreadingHTTPServer):
    def __init__(self, address, port, label):
        if ":" in address:
            self.address_family = socket.AF_INET6
        self.label = label
        self.connections = {}
        self.accepted = []
        self.requests = []
        super().__init__((address, port), OrderHandler)
        self.http_host = f"{dns.API.rstrip('.')}:{self.server_port}"

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        super().server_bind()

    def get_request(self):
        connection, client = super().get_request()
        key = f"{self.label}-c{len(self.accepted) + 1}"
        self.connections[connection] = key
        self.accepted.append({"connection": key, "local": connection.getsockname()[:2], "peer": client[:2]})
        return connection, client

    def observation(self):
        return {"listening": self.server_address[:2], "accepted": self.accepted, "requests": self.requests}


@contextmanager
def running_origin(address, port, label):
    with Origin(address, port, label) as server:
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join(timeout=3)


def authority_config(port, directory, serial, kind, address):
    return dns.server_config(port, directory) + f'''    access-control: 127.0.0.0/8 refuse_non_local
    local-zone: "{dns.ZONE}" static
    local-data: "{dns.ZONE} 1 IN SOA ns.{dns.ZONE} hostmaster.{dns.ZONE} {serial} 60 60 60 1"
    local-data: "{dns.ZONE} {TTL} IN NS ns.{dns.ZONE}"
    local-data: "ns.{dns.ZONE} {TTL} IN A 192.0.2.53"
    local-data: "{dns.API} {TTL} IN {kind} {address}"
'''


def lookup(dig, process, port, types, recurse, start):
    return {kind: dns.dig_query(dig, process, port, dns.API, kind, recurse, start) for kind in types}


def addresses(replies):
    return [record["data"] for kind, reply in replies.items() if reply["status"] == "NOERROR"
            for record in reply["answers"] if record["type"] == kind]


def wait_for_address(query, expected, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            replies = query()
        except CalledProcessError:
            continue
        if all(reply["status"] == "NOERROR" for reply in replies.values()) and addresses(replies) == [expected]:
            return replies
        time.sleep(0.15)
    raise RuntimeError(f"DNS did not converge to {expected}")


def send(client, host, request_id, start):
    connection = client.sock
    local, peer = connection.getsockname()[:2], connection.getpeername()[:2]
    client.request("GET", PATH, headers={"Host": host, "X-Lab-Request": request_id})
    with client.getresponse() as response:
        status, body = response.status, json.loads(response.read())
    if client.sock is not connection or status != 200 or body["request_id"] != request_id:
        raise RuntimeError(f"Unexpected HTTP result for {request_id}")
    return {"id": request_id, "local": local, "peer": peer, "status": status, "response": body,
            "elapsed_ms": round((time.monotonic() - start) * 1000, 3)}


def observe(dig, auth, resolver, authority_port, resolver_port, old_config, replacement, new_kind, new_address, origin):
    start = time.monotonic()
    types = ("A",) if new_kind == "A" else ("A", "AAAA")

    def authoritative():
        return lookup(dig, auth, authority_port, types, False, start)

    def cached():
        return lookup(dig, resolver, resolver_port, types, True, start)

    before = {"authority": wait_for_address(authoritative, OLD_ADDRESS, 3),
              "resolver": wait_for_address(cached, OLD_ADDRESS, 3)}
    old_choice, = addresses(before["resolver"])
    with closing(http.client.HTTPConnection(old_choice, origin.server_port, timeout=3)) as old:
        old.connect()
        old_socket = old.sock
        first = send(old, origin.http_host, "r1", start)

        pending = old_config.with_suffix(".new")
        pending.write_text(replacement, encoding="utf-8")
        pending.replace(old_config)
        auth.send_signal(signal.SIGHUP)
        changed = {"authority": wait_for_address(authoritative, new_address, 3), "resolver": cached()}
        if OLD_ADDRESS not in addresses(changed["resolver"]):
            raise RuntimeError("Expected the same resolver to retain the old address before TTL expiry")
        refreshed = wait_for_address(cached, new_address, TTL + 4)
        new_choice, = addresses(refreshed)

        second = send(old, origin.http_host, "r2", start)
        if old.sock is not old_socket or first["peer"] != second["peer"] or first["local"] != second["local"]:
            raise RuntimeError("The old HTTP request did not reuse the same socket")
        with closing(http.client.HTTPConnection(new_choice, origin.server_port, timeout=3)) as fresh:
            fresh.connect()
            third = send(fresh, origin.http_host, "r3", start)
    return {"before": before, "changed_authority": changed, "after_expiry": {"resolver": refreshed}}, [first, second, third]


def run(unbound, dig):
    new_kind, new_address = ("A", "127.0.0.2") if sys.platform == "linux" else ("AAAA", "::1")
    tools = {"unbound": dns.tool_record(unbound, "-V"), "dig": dns.tool_record(dig, "-v")}
    with tempfile.TemporaryDirectory(prefix="infra-dns-http-", dir="/tmp") as scratch:
        directory = Path(scratch)
        authority_port, resolver_port = dns.unused_ports()
        authority_path, resolver_path = directory / "authority.conf", directory / "resolver.conf"
        old = authority_config(authority_port, directory, 1, "A", OLD_ADDRESS)
        updated = authority_config(authority_port, directory, 2, new_kind, new_address)
        resolver_text = dns.resolver_config(resolver_port, authority_port, directory)
        authority_path.write_text(old, encoding="utf-8")
        resolver_path.write_text(resolver_text, encoding="utf-8")
        with running_origin(OLD_ADDRESS, 0, "A") as a, running_origin(new_address, a.server_port, "B") as b:
            with dns.unbound_process(unbound, authority_path) as auth, dns.unbound_process(unbound, resolver_path) as resolver:
                phases, requests = observe(dig, auth, resolver, authority_port, resolver_port, authority_path, updated,
                                            new_kind, new_address, a)
                processes = {"authority": {"pid": auth.pid, "port": authority_port},
                             "resolver": {"pid": resolver.pid, "port": resolver_port}}
            origins = {"A": a.observation(), "B": b.observation()}
            if [r["response"]["connection"] for r in requests] != ["A-c1", "A-c1", "B-c1"]:
                raise RuntimeError("Expected two requests on A's first socket and one on B's")
            if len(a.accepted) != 1 or len(b.accepted) != 1:
                raise RuntimeError("Expected exactly one accepted socket per origin")
    return {"schema": "dns-connection-handoff-v1", "status": "passed",
            "environment": {"system": platform.system(), "arch": platform.machine(), "tools": tools},
            "fixture": {"name": dns.API, "http_host": a.http_host, "path": PATH, "order": "O-104", "amount": 37,
                        "port": a.server_port, "ttl_seconds": TTL, "old": {"type": "A", "address": OLD_ADDRESS},
                        "new": {"type": new_kind, "address": new_address}},
            "dns": phases, "processes": processes, "requests": requests, "origins": origins,
            "configs": {"authority_before": old, "authority_after": updated, "resolver": resolver_text},
            "source_sha256": {"dns_connection_handoff.py": dns.sha256(__file__),
                              "dns-cache/dns_cache.py": dns.sha256(dns_lab / "dns_cache.py")},
            "scope": "Isolated Unbound and HTTP/1.1 loopback listeners. Explicit dig resolution and socket reuse; no OS/browser cache, general connection pool, public DNS or production traffic."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unbound", default="unbound")
    parser.add_argument("--dig", default="dig")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if sys.platform not in {"linux", "darwin"}:
        parser.error("This lab needs Linux or Darwin loopback listeners")
    unbound, dig = shutil.which(args.unbound), shutil.which(args.dig)
    if not unbound or not dig:
        parser.error("Unbound and dig are required")
    result = json.dumps(run(unbound, dig), indent=2) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf-8") as output:
            output.write(result)
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
