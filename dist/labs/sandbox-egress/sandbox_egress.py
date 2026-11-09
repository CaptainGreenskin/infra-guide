"""Run a disposable Docker egress boundary and check the receiver's HTTP ledger."""

import argparse
import hashlib
import hmac
import http.client
import http.server
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import uuid


PORT = 8080
IMAGE = "python:3.11-slim"
TOKEN_ENV = "SANDBOX_EGRESS_TEST_TOKEN"
MAX_BODY = 4096


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def send_json(handler, status, data, extra_headers=None):
    body = json.dumps(data, separators=(",", ":")).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    for name, value in (extra_headers or {}).items():
        handler.send_header(name, value)
    handler.end_headers()
    handler.wfile.write(body)


def report_path(tenant):
    return f"/v1/tenants/{tenant}/reports/R27"


def request(host, method, path, headers=None):
    connection = http.client.HTTPConnection(host, PORT, timeout=3)
    try:
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        body = response.read(MAX_BODY + 1)
        require(len(body) <= MAX_BODY, "response exceeded the lab body limit")
        require(response.getheader("Content-Type") == "application/json", "unexpected response type")
        return {
            "status": response.status,
            "body": json.loads(body),
            "location": response.getheader("Location"),
        }
    finally:
        connection.close()


class QuietHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass


def upstream(fixture):
    token = os.environ[TOKEN_ENV]
    visits = 0
    capability = fixture["capability"]
    redirect = fixture["redirect"]

    class Receiver(QuietHandler):
        def do_GET(self):
            nonlocal visits
            authorization = self.headers.get("Authorization", "")
            authenticated = hmac.compare_digest(authorization, "Bearer " + token)
            extra_headers = {}
            if not authenticated:
                status, body = 401, {"error": "invalid_broker_credential"}
            elif self.path in fixture["reports"]:
                if self.path == capability["path"]:
                    visits += 1
                if self.path == capability["path"] and visits == redirect["on_visit"]:
                    status, body = 302, {"error": "fixture_redirect"}
                    extra_headers["Location"] = redirect["target"]
                else:
                    status, body = 200, fixture["reports"][self.path]
            elif self.path == fixture["secret_path"]:
                status, body = 200, {"secret_marker": "fixture-private-value"}
            else:
                status, body = 404, {"error": "unknown_route"}
            event = {
                "method": self.command,
                "path": self.path,
                "authenticated": authenticated,
                "case": self.headers.get("X-Lab-Source", ""),
                "status": status,
            }
            print(json.dumps(event), flush=True)
            send_json(self, status, body, extra_headers)

    # One receiver thread keeps the fixture's second request deterministic.
    http.server.HTTPServer(("0.0.0.0", PORT), Receiver).serve_forever()


def broker(fixture):
    capability = fixture["capability"]
    token = os.environ[TOKEN_ENV]

    class Broker(QuietHandler):
        def do_POST(self):
            send_json(self, 405, {"error": "method_denied"})

        def do_GET(self):
            if self.path != capability["path"]:
                send_json(self, 403, {"error": "route_denied"})
                return
            if self.headers.get("Authorization") is not None:
                send_json(self, 400, {"error": "caller_authorization_denied"})
                return
            try:
                result = request("upstream", capability["method"], capability["path"], {
                    "Authorization": "Bearer " + token,
                    "X-Lab-Source": "broker",
                })
                if 300 <= result["status"] < 400:
                    send_json(self, 502, {"error": "upstream_redirect"})
                    return
                report = result["body"]
                valid = (
                    result["status"] == 200
                    and isinstance(report, dict)
                    and set(report) == {"tenant", "report_id", "total"}
                    and report["tenant"] == capability["tenant"]
                    and report["report_id"] == capability["report_id"]
                    and type(report["total"]) is int
                )
            except (OSError, ValueError, RuntimeError, http.client.HTTPException):
                valid = False
            if not valid:
                send_json(self, 502, {"error": "invalid_upstream_result"})
                return
            send_json(self, 200, report)

    http.server.HTTPServer(("0.0.0.0", PORT), Broker).serve_forever()


def worker(fixture, upstream_address):
    try:
        with socket.create_connection((upstream_address, PORT), timeout=1):
            direct = {"connected": True, "error_type": None}
    except OSError as error:
        direct = {"connected": False, "error_type": type(error).__name__}
    allowed_path = fixture["capability"]["path"]
    return {
        "direct": direct,
        "allowed": request("broker", "GET", allowed_path),
        "other_tenant": request("broker", "GET", report_path("B")),
        "other_method": request("broker", "POST", allowed_path),
        "other_path": request("broker", "GET", fixture["secret_path"]),
        "query": request("broker", "GET", allowed_path + "?tenant=B"),
        "caller_authorization": request("broker", "GET", allowed_path, {
            "Authorization": "Bearer fixture-caller-credential",
        }),
        "redirect": request("broker", "GET", allowed_path),
    }


def upstream_controls(fixture):
    headers = {
        "Authorization": "Bearer " + os.environ[TOKEN_ENV],
        "X-Lab-Source": "upstream-control",
    }
    first = request("upstream", "GET", fixture["capability"]["path"], headers)
    other = request("upstream", "GET", report_path("B"), headers)
    secret = request("upstream", "GET", fixture["secret_path"], headers)
    return {
        "upstream_control": first,
        "other_tenant_control": other,
        "secret_control": {
            "status": secret["status"],
            "marker_present": secret["body"] == {"secret_marker": "fixture-private-value"},
        },
    }


class DockerLab:
    def __init__(self, endpoint, source, fixture):
        self.command = ["docker", "--host", endpoint]
        self.source = source
        self.fixture = json.dumps(fixture, separators=(",", ":"))
        self.prefix = "infra-sandbox-egress-" + uuid.uuid4().hex[:12]
        self.networks = []
        self.containers = []
        self.token = secrets.token_hex(24)

    def docker(self, *arguments, check=True, credential=False):
        environment = dict(os.environ)
        environment.pop(TOKEN_ENV, None)
        if credential:
            environment[TOKEN_ENV] = self.token
        return subprocess.run(
            [*self.command, *arguments], env=environment, check=check,
            capture_output=True, text=True, timeout=20,
        ).stdout.strip()

    def name(self, part):
        return self.prefix + "-" + part

    def network(self, name):
        self.docker("network", "create", "--driver", "bridge", "--internal", self.name(name))
        self.networks.append(name)

    def start(self, role, network, credential=False):
        self.containers.append(role)
        environment = ["--env", TOKEN_ENV] if credential else []
        self.docker(
            "run", "--detach", "--pull=never", "--name", self.name(role),
            "--network", self.name(network), "--network-alias", role,
            "--user", "65534:65534", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges", "--read-only",
            "--entrypoint", "python", *environment, IMAGE,
            "-B", "-c", self.source, role, self.fixture, credential=credential,
        )

    def inspect(self, kind, part):
        return json.loads(self.docker(kind, "inspect", self.name(part)))[0]

    def execute(self, container, role, *arguments):
        return json.loads(self.docker(
            "exec", self.name(container), "python", "-B", "-c",
            self.source, role, self.fixture, *arguments,
        ))

    def ready(self, container, destination):
        code = "import socket,sys; socket.create_connection((sys.argv[1], 8080), .3).close()"
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            try:
                self.docker("exec", self.name(container), "python", "-c", code, destination)
                return
            except subprocess.CalledProcessError:
                time.sleep(0.2)
        raise RuntimeError(f"{destination} did not accept an internal TCP connection")

    def clean(self):
        for container in reversed(self.containers):
            self.docker("rm", "--force", self.name(container), check=False)
        for network in reversed(self.networks):
            self.docker("network", "rm", self.name(network), check=False)


def collect(lab):
    engine = json.loads(lab.docker("version", "--format", "{{json .Server}}"))
    image = json.loads(lab.docker("image", "inspect", IMAGE))[0]
    require(engine["Os"] == "linux", "a Linux Docker daemon is required")
    lab.network("sandbox")
    lab.network("private")
    lab.start("upstream", "private", credential=True)
    lab.start("broker", "sandbox", credential=True)
    lab.docker("network", "connect", "--alias", "broker", lab.name("private"), lab.name("broker"))
    # The worker stays in the sandbox namespace while independent probes run via exec.
    lab.start("worker", "sandbox")
    lab.ready("broker", "upstream")
    lab.ready("worker", "broker")

    worker_info = lab.inspect("container", "worker")
    broker_info = lab.inspect("container", "broker")
    upstream_info = lab.inspect("container", "upstream")
    def networks(info):
        return sorted(name.removeprefix(lab.prefix + "-") for name in info["NetworkSettings"]["Networks"])
    info = [worker_info, broker_info, upstream_info]
    topology = {
        "networks_internal": all(lab.inspect("network", name)["Internal"] for name in lab.networks),
        "published_ports": sum(len(bindings or []) for item in info
                               for bindings in (item["HostConfig"].get("PortBindings") or {}).values()),
        "worker_networks": networks(worker_info),
        "broker_networks": networks(broker_info),
        "upstream_networks": networks(upstream_info),
    }
    guard = worker_info["HostConfig"]
    worker_controls = {
        "user": worker_info["Config"]["User"],
        "read_only": guard["ReadonlyRootfs"],
        "cap_drop": guard["CapDrop"],
        "no_new_privileges": "no-new-privileges" in guard["SecurityOpt"],
        "has_broker_credential": any(entry.split("=", 1)[0] == TOKEN_ENV
                                     for entry in worker_info["Config"]["Env"]),
        "mounts": len(worker_info["Mounts"]),
    }
    upstream_address = upstream_info["NetworkSettings"]["Networks"][lab.name("private")]["IPAddress"]
    require(upstream_address, "the upstream has no inspected private IPv4 address")
    cases = lab.execute("worker", "test-worker", upstream_address)
    cases.update(lab.execute("broker", "test-upstream"))
    ledger = [json.loads(line) for line in lab.docker("logs", lab.name("upstream")).splitlines() if line]
    environment = {
        "engine_version": engine["Version"],
        "os": engine["Os"],
        "architecture": engine["Arch"],
        "image": IMAGE,
        "image_id": image["Id"],
    }
    return environment, {"topology": topology, "worker_controls": worker_controls, "cases": cases,
                         "upstream_events": ledger}


def verify(report, fixture):
    require(report["topology"] == {
        "networks_internal": True, "published_ports": 0,
        "worker_networks": ["sandbox"], "broker_networks": ["private", "sandbox"],
        "upstream_networks": ["private"],
    }, "inspected network topology did not match the boundary")
    require(report["worker_controls"] == {
        "user": "65534:65534", "read_only": True, "cap_drop": ["ALL"],
        "no_new_privileges": True, "has_broker_credential": False, "mounts": 0,
    }, "worker container controls did not match")
    cases = report["cases"]
    require(cases["direct"]["connected"] is False and cases["direct"]["error_type"],
            "worker unexpectedly connected to the private upstream")
    statuses = {
        "allowed": 200, "other_tenant": 403, "other_method": 405, "other_path": 403,
        "query": 403, "caller_authorization": 400, "redirect": 502,
        "upstream_control": 200, "other_tenant_control": 200, "secret_control": 200,
    }
    require({name: cases[name]["status"] for name in statuses} == statuses, "unexpected HTTP status")
    for name in ("allowed", "upstream_control"):
        require(cases[name]["body"] == fixture["reports"][fixture["capability"]["path"]],
                f"{name} did not produce the expected report")
    require(cases["other_tenant_control"]["body"] == fixture["reports"][report_path("B")],
            "other-tenant receiver path was not exercised independently")
    require(cases["secret_control"]["marker_present"], "the secret route positive control failed")
    require(cases["redirect"] == {"status": 502, "body": {"error": "upstream_redirect"}, "location": None},
            "the broker did not block the redirect without forwarding its location")
    expected_requests = [
        ("broker", fixture["capability"]["path"], 200),
        ("broker", fixture["capability"]["path"], 302),
        ("upstream-control", fixture["capability"]["path"], 200),
        ("upstream-control", report_path("B"), 200),
        ("upstream-control", fixture["secret_path"], 200),
    ]
    expected_ledger = [{"method": "GET", "case": case, "path": path, "status": status, "authenticated": True}
                       for case, path, status in expected_requests]
    require(report["upstream_events"] == expected_ledger,
            "receiver saw an unauthorized request or the broker followed the redirect")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docker-host", required=True, help="explicit local unix:// Docker socket")
    parser.add_argument("--output", type=Path, help="optional output JSON path")
    args = parser.parse_args()
    require(args.docker_host.startswith("unix:///") and Path(args.docker_host[7:]).is_socket(),
            "pass an existing local Docker Unix socket")
    folder = Path(__file__).resolve().parent
    source = (folder / "sandbox_egress.py").read_text()
    fixture = json.loads((folder / "fixture.json").read_text())
    lab = DockerLab(args.docker_host, source, fixture)
    try:
        environment, report = collect(lab)
        verify(report, fixture)
    finally:
        lab.clean()
    names = ["sandbox_egress.py", "fixture.json", "README.md"]
    validation = {
        "schema": 1, "status": "passed",
        "source_sha256": {name: hashlib.sha256((folder / name).read_bytes()).hexdigest() for name in names},
        "environment": environment, "report": report,
    }
    encoded = json.dumps(validation, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(encoded)
    else:
        print(encoded, end="")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in {"worker", "broker", "upstream", "test-worker", "test-upstream"}:
        role, fixture = sys.argv[1], json.loads(sys.argv[2])
        if role == "upstream":
            upstream(fixture)
        elif role == "broker":
            broker(fixture)
        elif role == "worker":
            time.sleep(600)
        elif role == "test-worker":
            print(json.dumps(worker(fixture, sys.argv[3])))
        else:
            print(json.dumps(upstream_controls(fixture)))
    else:
        main()
