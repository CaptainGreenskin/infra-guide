#!/usr/bin/env python3
"""Run two attested SPIFFE clients against a mutually authenticated loopback service."""

import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import socket
import subprocess
import tarfile
import tempfile
import time

VERSION = "1.16.0"
ARCHIVE_SHA256 = "7bcf5e167151a1fc58293768462b44e155ba8784214582aefa6adf18c633d1d5"
GO_SPIFFE_VERSION = "v2.9.0"
DOMAIN = "infraguide.test"
SOURCE = Path(__file__).resolve().parent
SOURCE_FILES = ("spire_identity_lab.py", "workload.go", "go.mod", "go.sum")
ROLES = ("report-api", "worker-a", "worker-b")
REPORT = {"operation_id": "report-27:publish", "amount": 37}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def identity(role):
    return f"spiffe://{DOMAIN}/{role}"


def command(*args, cwd=None, env=None, timeout=15):
    result = subprocess.run(args, cwd=cwd, env=env, timeout=timeout, text=True,
                            capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"{Path(args[0]).name} {args[1]} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def release_version(binary):
    # SPIRE's CLI emits -version through its help writer, which may be stderr.
    result = subprocess.run((binary, "-version"), stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=15, text=True, check=False)
    reported = result.stdout.strip()
    require(result.returncode == 0 and reported in (VERSION, f"v{VERSION}"),
            f"unexpected {binary.name} release version: {reported!r} (exit {result.returncode})")
    return reported.removeprefix("v")


def wait_for(description, predicate, processes=(), seconds=40):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        for name, process in processes:
            require(process.poll() is None, f"{name} exited with {process.returncode}")
        value = predicate()
        if value:
            return value
        time.sleep(0.2)
    raise RuntimeError(f"timed out waiting for {description}")


def healthy(binary, api_socket):
    if not api_socket.is_socket():
        return False
    result = subprocess.run((binary, "healthcheck", "-socketPath", api_socket), timeout=5,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return result.returncode == 0


@contextlib.contextmanager
def owned_process(name, args, scratch, processes, stopped):
    with (scratch / f"{name}.stdout").open("wb") as stdout, (scratch / f"{name}.stderr").open("wb") as stderr:
        process = subprocess.Popen(args, cwd=scratch, stdout=stdout, stderr=stderr)
        processes.append((name, process))
        try:
            yield process
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            stopped[name] = process.poll() is not None


def temporary_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def unpack_binaries(archive, scratch):
    require(sha256(archive) == ARCHIVE_SHA256, "official SPIRE archive digest mismatch")
    names = ("spire-server", "spire-agent")
    with tarfile.open(archive, "r:gz") as source:
        for member in source:
            location = Path(member.name)
            if not member.isfile() or location.parent.name != "bin" or location.name not in names:
                continue
            with source.extractfile(member) as payload, (scratch / location.name).open("xb") as output:
                shutil.copyfileobj(payload, output)
            (scratch / location.name).chmod(0o700)
    return tuple(scratch / name for name in names)


def server_config(scratch, port, api_socket):
    q = lambda value: json.dumps(str(value))
    return f'''server {{
    bind_address = "127.0.0.1"
    bind_port = "{port}"
    socket_path = {q(api_socket)}
    trust_domain = "{DOMAIN}"
    data_dir = {q(scratch / 'server-state')}
    log_level = "INFO"
}}
plugins {{
    DataStore "sql" {{
        plugin_data {{
            database_type = "sqlite3"
            connection_string = {q(scratch / 'server-state' / 'datastore.sqlite3')}
        }}
    }}
    NodeAttestor "join_token" {{ plugin_data = {{}} }}
    KeyManager "memory" {{ plugin_data = {{}} }}
}}
'''


def agent_config(scratch, port, api_socket, bundle):
    q = lambda value: json.dumps(str(value))
    return f'''agent {{
    data_dir = {q(scratch / 'agent-state')}
    log_level = "INFO"
    server_address = "127.0.0.1"
    server_port = "{port}"
    socket_path = {q(api_socket)}
    trust_bundle_path = {q(bundle)}
    trust_domain = "{DOMAIN}"
}}
plugins {{
    NodeAttestor "join_token" {{ plugin_data = {{}} }}
    KeyManager "disk" {{
        plugin_data {{ directory = {q(scratch / 'agent-state')} }}
    }}
    WorkloadAttestor "unix" {{
        plugin_data {{
            discover_workload_path = true
            workload_size_limit = -1
        }}
    }}
}}
'''


def read_rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def verify_case(ready, denied, accepted, unregistered, before, after_denied, effects, audits):
    worker_a, worker_b, receiver = map(identity, ("worker-a", "worker-b", "report-api"))
    require(ready["server_id"] == receiver and ready["address"].startswith("127.0.0.1:"), "receiver binding")
    require(unregistered == {"grpc_code": "PermissionDenied", "svid_count": 0}, "unregistered workload should have no SVID")
    require(denied == {"http_status": 403, "response": {"status": "denied"},
                       "client_id": worker_b, "server_id": receiver}, "valid B mTLS should reach application denial")
    require(accepted == {"http_status": 201, "response": {"status": "published"},
                         "client_id": worker_a, "server_id": receiver}, "valid A mTLS should publish")
    require(before == after_denied == [], "denied B must not publish")
    require(effects == [{"peer_id": worker_a, "report": REPORT}], "exactly one A effect")
    require(audits == [{"peer_id": peer, "claimed_id": worker_a, "report": REPORT, "decision": decision}
                       for peer, decision in ((worker_b, "denied"), (worker_a, "published"))], "actual certificate identity drives the decision")


def execute(archive, scratch, stopped, redactions):
    spire_server, spire_agent = unpack_binaries(archive, scratch)
    server_version, agent_version = map(release_version, (spire_server, spire_agent))
    binary = scratch / "workload"
    go_env = {**os.environ, "CGO_ENABLED": "0", "GOTOOLCHAIN": "local", "GOWORK": "off", "GOFLAGS": ""}
    command("go", "build", "-mod=readonly", "-trimpath", "-buildvcs=false", "-o", binary, ".",
            cwd=SOURCE, env=go_env, timeout=180)
    go_version = command("go", "version", env=go_env)
    go_spiffe = command("go", "list", "-mod=readonly", "-m", "-f", "{{.Version}}", "github.com/spiffe/go-spiffe/v2",
                        cwd=SOURCE, env=go_env)
    require(go_spiffe == GO_SPIFFE_VERSION, "unexpected go-spiffe module version")
    workloads = {role: scratch / role for role in (*ROLES, "unregistered")}
    for path in workloads.values():
        shutil.copy2(binary, path)

    port = temporary_port()
    server_socket, agent_socket = scratch / "server.sock", scratch / "workload.sock"
    workload_address = f"unix://{agent_socket}"
    server_conf, agent_conf, bundle = (scratch / name for name in ("server.conf", "agent.conf", "bundle.pem"))
    for name in ("server-state", "agent-state"):
        (scratch / name).mkdir(mode=0o700)
    server_conf.write_text(server_config(scratch, port, server_socket))
    agent_conf.write_text(agent_config(scratch, port, agent_socket, bundle))
    processes = []
    with contextlib.ExitStack() as stack:
        stack.enter_context(owned_process("spire-server", (spire_server, "run", "-config", server_conf), scratch, processes, stopped))
        wait_for("SPIRE server", lambda: healthy(spire_server, server_socket), processes)
        agent_id = identity("lab-agent")
        generated = command(spire_server, "token", "generate", "-socketPath", server_socket, "-spiffeID", agent_id)
        token_match = re.search(r"^Token:\s*(\S+)\s*$", generated, re.MULTILINE)
        require(token_match is not None, "SPIRE token generation did not return a token")
        token = token_match.group(1)
        redactions.append(token)
        token_file = scratch / "join-token"
        with os.fdopen(os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
            output.write(token)
        bundle.write_text(command(spire_server, "bundle", "show", "-socketPath", server_socket, "-format", "pem") + "\n")
        require("-----BEGIN CERTIFICATE-----" in bundle.read_text(), "server trust bundle must be PEM")
        registrations = {}
        for role in ROLES:
            selector = f"unix:path:{workloads[role]}"
            result = command(spire_server, "entry", "create", "-socketPath", server_socket,
                             "-parentID", agent_id, "-spiffeID", identity(role), "-selector", selector)
            entry = re.search(r"^Entry ID\s*:\s*(\S+)\s*$", result, re.MULTILINE)
            require(entry is not None and selector in result and identity(role) in result, "SPIRE entry was not created")
            registrations[role] = {"entry_id": entry.group(1), "spiffe_id": identity(role), "selector": selector}
        stack.enter_context(owned_process("spire-agent", (spire_agent, "run", "-config", agent_conf, "-joinTokenFile", token_file),
                                          scratch, processes, stopped))
        wait_for("SPIRE Agent Workload API", lambda: healthy(spire_agent, agent_socket), processes)
        token_file.unlink()
        effects_path, audit_path = scratch / "effects.jsonl", scratch / "audit.jsonl"
        stack.enter_context(owned_process("report-api", (workloads["report-api"], "serve", workload_address, effects_path, audit_path),
                                          scratch, processes, stopped))
        ready = wait_for("attested report receiver", lambda: (scratch / "report-api.stdout").read_text().splitlines(), processes)
        receiver = json.loads(ready[0])
        receiver_pid = processes[-1][1].pid
        require(Path(os.readlink(f"/proc/{receiver_pid}/exe")) == workloads["report-api"], "receiver process executable selector differs")
        unregistered = json.loads(command(workloads["unregistered"], "probe", workload_address))
        before = read_rows(effects_path)
        denied = json.loads(command(workloads["worker-b"], "publish", workload_address, receiver["address"], timeout=50))
        after_denied = read_rows(effects_path)
        accepted = json.loads(command(workloads["worker-a"], "publish", workload_address, receiver["address"], timeout=50))
        effects, audits = read_rows(effects_path), read_rows(audit_path)
        verify_case(receiver, denied, accepted, unregistered, before, after_denied, effects, audits)
    return {
        "schema": "spiffe-workload-identity-v1", "status": "passed",
        "environment": {"system": platform.system(), "machine": platform.machine(), "python": platform.python_version(),
                        "go": go_version, "go_spiffe": go_spiffe, "spire_server": server_version,
                        "spire_agent": agent_version, "archive_sha256": ARCHIVE_SHA256,
                        "server_sha256": sha256(spire_server), "agent_sha256": sha256(spire_agent)},
        "source_sha256": {name: sha256(SOURCE / name) for name in SOURCE_FILES},
        "trust_domain": DOMAIN, "bootstrap_bundle_sha256": sha256(bundle), "agent_id": agent_id,
        "registrations": registrations, "receiver": receiver, "fixture": REPORT,
        "unregistered": unregistered, "worker_b": denied, "worker_a": accepted,
        "effects_before": before, "effects_after_denial": after_denied, "effects": effects, "audit": audits,
    }


def export_logs(scratch, logs, redactions):
    if logs is None:
        return
    logs.mkdir(parents=True, exist_ok=False)
    for path in sorted(scratch.glob("*.std*")):
        contents = path.read_text(errors="replace")
        for secret in redactions:
            contents = contents.replace(secret, "[redacted-join-token]")
        (logs / path.name).write_text(contents)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help=f"official SPIRE {VERSION} linux-amd64-musl archive")
    parser.add_argument("--output", type=Path, required=True, help="write native JSON evidence here")
    parser.add_argument("--log-dir", type=Path, help="copy redacted owned process logs to a new directory")
    args = parser.parse_args()
    require(platform.system() == "Linux" and platform.machine() == "x86_64", "run this fixture on Linux x86_64")
    stopped, redactions = {}, []
    with tempfile.TemporaryDirectory(prefix="ig-spire-", dir="/tmp") as tmp:
        scratch = Path(tmp)
        try:
            result = execute(args.archive.resolve(), scratch, stopped, redactions)
        finally:
            export_logs(scratch, args.log_dir, redactions)
    require(set(stopped) == {"spire-server", "spire-agent", "report-api"} and all(stopped.values()) and not scratch.exists(),
            "all owned processes and scratch directory must be cleaned up")
    result["cleanup"] = {"processes_stopped": stopped, "scratch_removed": True}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print("PASS: real SPIRE X.509-SVID attestation, mTLS, HTTP denial, and one authorized effect")


if __name__ == "__main__":
    main()
