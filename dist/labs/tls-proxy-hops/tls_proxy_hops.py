"""Real loopback HTTPS proxy with separate edge and origin trust roots."""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import socket
import ssl
import subprocess
import tempfile
import threading


EDGE_NAME = "edge.lab.test"
A_NAME = "a.origin.test"
B_NAME = "b.origin.test"
TIMEOUT = 3


def make_certificates(directory, openssl):
    def issue(*arguments):
        subprocess.run([openssl, *arguments], cwd=directory, check=True,
                       capture_output=True, timeout=20)

    (directory / "ca.cnf").write_text("""[req]
prompt=no
distinguished_name=dn
x509_extensions=ca_ext
[dn]
CN=InfraGuide test root
[ca_ext]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
""")
    for ca in ("edge", "origin"):
        issue("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256",
              "-subj", "/CN=InfraGuide " + ca + " test root", "-days", "1",
              "-config", "ca.cnf", "-keyout", ca + ".key", "-out", ca + ".pem")
    for leaf, name, ca, serial in (
        ("proxy", EDGE_NAME, "edge", "1"),
        ("a", A_NAME, "origin", "1"),
        ("b", B_NAME, "origin", "2"),
    ):
        (directory / "leaf.ext").write_text(
            "basicConstraints=critical,CA:FALSE\n"
            "keyUsage=critical,digitalSignature,keyEncipherment\n"
            "extendedKeyUsage=serverAuth\n"
            "subjectAltName=DNS:" + name + "\n"
        )
        issue("req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
              "-subj", "/CN=" + name, "-keyout", leaf + ".key", "-out", leaf + ".csr")
        issue("x509", "-req", "-in", leaf + ".csr", "-CA", ca + ".pem",
              "-CAkey", ca + ".key", "-set_serial", serial, "-days", "1",
              "-sha256", "-extfile", "leaf.ext", "-out", leaf + ".pem")


class TLSListener(ThreadingHTTPServer):
    daemon_threads = False

    def __init__(self, label, certificate, handler):
        self.label = label
        self.sni = []
        self.handshakes = []
        self.requests = []
        self.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.tls.minimum_version = ssl.TLSVersion.TLSv1_2
        self.tls.load_cert_chain(certificate.with_suffix(".pem"), certificate.with_suffix(".key"))
        self.tls.sni_callback = self.remember_name
        super().__init__(("127.0.0.1", 0), handler)

    def remember_name(self, connection, name, context):
        connection.requested_name = name
        self.sni.append(name)

    def get_request(self):
        tcp, address = super().get_request()
        tcp.settimeout(TIMEOUT)
        try:
            connection = self.tls.wrap_socket(tcp, server_side=True)
        except OSError:
            tcp.close()
            raise
        connection.label = f"{self.label}-{len(self.handshakes) + 1}"
        self.handshakes.append({"connection": connection.label, "sni": connection.requested_name})
        return connection, address


@contextmanager
def listen(label, certificate, handler):
    with TLSListener(label, certificate, handler) as listener:
        thread = threading.Thread(target=listener.serve_forever, kwargs={"poll_interval": 0.05})
        thread.start()
        try:
            yield listener
        finally:
            listener.shutdown()
            thread.join()


class LocalTLSConnection(http.client.HTTPConnection):
    def __init__(self, address, context, server_name):
        super().__init__(*address, timeout=TIMEOUT)
        self.context = context
        self.server_name = server_name

    def connect(self):
        tcp = socket.create_connection((self.host, self.port), timeout=self.timeout)
        try:
            self.sock = self.context.wrap_socket(tcp, server_hostname=self.server_name)
        except OSError:
            tcp.close()
            raise
        self.peer = {
            "verified_name": self.server_name,
            "certificate_names": [name for kind, name in self.sock.getpeercert()["subjectAltName"]
                                  if kind == "DNS"],
            "protocol": self.sock.version(),
        }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def record_request(self):
        row = {
            "request": self.headers["X-Request-ID"],
            "host": self.headers["Host"],
            "sni": self.connection.requested_name,
            "connection": self.connection.label,
        }
        self.server.requests.append(row)
        return row

    def send_json(self, status, result):
        body = json.dumps(result).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def origin_handler(expected_host):
    class OriginHandler(Handler):
        def do_GET(self):
            row = self.record_request()
            if row["host"] != expected_host:
                self.send_json(421, {"error": "unexpected origin authority"})
                return
            self.send_json(200, {"order": "O-104", "total": 37,
                                 "origin": self.server.label, "connection": row["connection"]})

    return OriginHandler


@dataclass(frozen=True)
class Route:
    backend: str
    address: tuple
    tls_name: str
    http_host: str


class OriginPool:
    """One HTTP/1.1 connection per route, with one fixed trust context."""

    def __init__(self, context):
        self.context = context
        self.connections = {}
        self.lock = threading.Lock()

    def query(self, route, request_id):
        with self.lock:
            connection = self.connections.get(route)
            mode = "reused" if connection is not None and connection.sock else "fresh"
            if mode == "fresh":
                connection = LocalTLSConnection(route.address, self.context, route.tls_name)
            audit = {"backend": route.backend, "mode": mode, "tls_name": route.tls_name,
                     "http_host": route.http_host}
            try:
                if mode == "fresh":
                    connection.connect()
                audit["peer"] = connection.peer
                connection.request("GET", "/order", headers={
                    "Host": route.http_host, "X-Request-ID": request_id,
                })
                response = connection.getresponse()
                result = json.loads(response.read())
                self.connections[route] = connection
                return response.status, result, audit
            except ssl.SSLCertVerificationError as error:
                connection.close()
                self.connections.pop(route, None)
                audit["verification_error"] = error.verify_message
                return 502, {"error": "origin certificate verification failed"}, audit
            except (OSError, ValueError, http.client.HTTPException):
                connection.close()
                self.connections.pop(route, None)
                raise

    def close(self):
        with self.lock:
            for connection in self.connections.values():
                connection.close()
            self.connections.clear()


def proxy_handler(routes, pool):
    class ProxyHandler(Handler):
        def do_GET(self):
            ingress = self.record_request()
            route = routes.get((ingress["host"], self.path))
            if route is None:
                self.send_json(421, {"error": "unknown edge authority or path"})
                return
            status, result, upstream = pool.query(route, ingress["request"])
            self.send_json(status, {"result": result, "upstream": upstream})

    return ProxyHandler


def request(proxy_address, edge_context, request_id, host, path):
    connection = LocalTLSConnection(proxy_address, edge_context, EDGE_NAME)
    try:
        connection.connect()
        connection.request("GET", path, headers={
            "Host": host, "X-Request-ID": request_id, "Connection": "close",
        })
        response = connection.getresponse()
        body = json.loads(response.read())
        return {"request": request_id, "host": host, "edge_peer": connection.peer,
                "status": response.status, **body}
    finally:
        connection.close()


def replay(directory):
    edge_context = ssl.create_default_context(cafile=str(directory / "edge.pem"))
    origin_context = ssl.create_default_context(cafile=str(directory / "origin.pem"))
    orders_host, audit_host = "orders.origin.test", "audit.origin.test"
    with listen("A", directory / "a", origin_handler(orders_host)) as a, \
         listen("B", directory / "b", origin_handler(audit_host)) as b:
        routes = {
            ("orders.lab.test", "/order"): Route("A", a.server_address, A_NAME, orders_host),
            ("audit.lab.test", "/order"): Route("B", b.server_address, B_NAME, audit_host),
            ("audit.lab.test", "/bad-cert"): Route("B", b.server_address, A_NAME, audit_host),
        }
        pool = OriginPool(origin_context)
        try:
            with listen("P", directory / "proxy", proxy_handler(routes, pool)) as proxy:
                responses = [
                    request(proxy.server_address, edge_context, "a1", "orders.lab.test", "/order"),
                    request(proxy.server_address, edge_context, "a2", "orders.lab.test", "/order"),
                    request(proxy.server_address, edge_context, "b1", "audit.lab.test", "/order"),
                    request(proxy.server_address, edge_context, "bad", "audit.lab.test", "/bad-cert"),
                ]
        finally:
            pool.close()
    listeners = {server.label: {"sni_attempts": server.sni, "handshakes": server.handshakes,
                                "http_requests": server.requests} for server in (proxy, a, b)}
    return responses, listeners


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--openssl", default="openssl")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="tls-proxy-hops-") as temporary:
        directory = Path(temporary)
        make_certificates(directory, args.openssl)
        responses, listeners = replay(directory)

    assert [row["status"] for row in responses] == [200, 200, 200, 502]
    assert [row["upstream"]["mode"] for row in responses] == ["fresh", "reused", "fresh", "fresh"]
    assert [row["connection"] for row in listeners["P"]["http_requests"]] == ["P-1", "P-2", "P-3", "P-4"]
    assert [row["connection"] for row in listeners["A"]["http_requests"]] == ["A-1", "A-1"]
    assert [row["request"] for row in listeners["B"]["http_requests"]] == ["b1"]
    assert listeners["B"]["sni_attempts"] == [B_NAME, A_NAME]
    assert listeners["B"]["handshakes"] == [{"connection": "B-1", "sni": B_NAME}]
    assert "mismatch" in responses[-1]["upstream"]["verification_error"].lower()
    print(json.dumps({
        "status": "passed",
        "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "environment": {"python": platform.python_version(), "ssl": ssl.OPENSSL_VERSION,
                        "openssl_cli": subprocess.check_output([args.openssl, "version"],
                                                               text=True, timeout=5).strip()},
        "responses": responses,
        "listeners": listeners,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
