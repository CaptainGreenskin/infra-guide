#!/usr/bin/env python3
"""Read an acknowledged write on both sides of a Redis replica promotion."""

import argparse
from contextlib import ExitStack, contextmanager, suppress
import hashlib
import json
from pathlib import Path
import platform
import select
import socket
import socketserver
import subprocess
import tempfile
import threading
import time


VERSION = "8.2.6"
TARBALL_SHA256 = "78dd7326c5c959202c6c3849d3ea9c61896d78d647c20f6542b52c0917f96eac"
KEY = "order:104"
BEFORE = "v7/pending"
AFTER = "v8/shipped"
WAIT_MS = 500
REPLICA_LOG_MARKERS = ("MASTER <-> REPLICA sync: Finished with success",
                       "Connection with master lost.", "MASTER MODE enabled")


def require(actual, expected):
    if actual != expected:
        raise RuntimeError(f"expected {expected!r}, got {actual!r}")
    return actual


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def eventually(observe, accepts):
    deadline = time.monotonic() + 12
    while True:
        try:
            observed = observe()
        except OSError as error:
            observed = str(error)
        if accepts(observed):
            return observed
        if time.monotonic() >= deadline:
            raise RuntimeError(f"condition not reached; last observation: {observed!r}")
        time.sleep(0.05)


@contextmanager
def connect(path):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as channel:
        channel.settimeout(3)
        channel.connect(str(path))
        with channel.makefile("rb") as stream:
            def command(*args):
                parts = [str(arg).encode("ascii") for arg in args]
                request = f"*{len(parts)}\r\n".encode("ascii")
                request += b"".join(f"${len(part)}\r\n".encode("ascii") + part + b"\r\n" for part in parts)
                channel.sendall(request)
                line = stream.readline()
                require(line[-2:], b"\r\n")
                kind, value = line[:1], line[1:-2]
                if kind == b"+":
                    return value.decode("ascii")
                if kind == b":":
                    return int(value)
                if kind == b"$":
                    count = int(value)
                    if count == -1:
                        return None
                    body = stream.read(count + 2)
                    require(len(body), count + 2)
                    require(body[-2:], b"\r\n")
                    return body[:-2].decode("ascii")
                raise RuntimeError(f"unexpected Redis reply: {line!r}")
            yield command


def call(path, *args):
    with connect(path) as command:
        return command(*args)


class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        # Only this relay crosses the replica link. Clients use Unix sockets.
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as primary:
            pair = (self.request, primary)
            with self.server.lock:
                if self.server.blocked:
                    return
                try:
                    primary.connect(str(self.server.primary))
                except (ConnectionRefusedError, FileNotFoundError):
                    # A reconnect can arrive while the old primary is shutting down.
                    return
                self.server.pairs.add(pair)
            try:
                while True:
                    ready, _, _ = select.select(pair, [], [], 1)
                    for source in ready:
                        data = source.recv(65536)
                        if not data:
                            return
                        destination = primary if source is self.request else self.request
                        destination.sendall(data)
            except OSError:
                # The link cut and either Redis shutdown both close live sockets.
                pass
            finally:
                with self.server.lock:
                    self.server.pairs.remove(pair)


class Link(socketserver.ThreadingTCPServer):
    daemon_threads = True

    def __init__(self, primary):
        self.primary = primary
        self.lock = threading.Lock()
        self.blocked = False
        self.pairs = set()
        super().__init__(("127.0.0.1", 0), Relay)

    def cut(self):
        with self.lock:
            self.blocked = True
            for pair in self.pairs:
                for end in pair:
                    with suppress(OSError):
                        end.shutdown(socket.SHUT_RDWR)
            return len(self.pairs)


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
    return process.returncode


def redis(binary, root, name, stack, source_port=None):
    path = root / (name + ".sock")
    log = root / (name + ".log")
    args = [str(binary), "--port", "0", "--unixsocket", str(path), "--unixsocketperm", "700",
            "--save", "", "--appendonly", "no", "--dir", str(root), "--logfile", str(log),
            "--repl-diskless-sync-delay", "0", "--repl-diskless-load", "swapdb"]
    if source_port is not None:
        args += ["--replicaof", "127.0.0.1", str(source_port)]
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    stack.callback(stop, process)
    try:
        eventually(lambda: call(path, "PING"), lambda result: result == "PONG")
    except RuntimeError as error:
        raise RuntimeError(log.read_text() if log.exists() else "Redis did not start") from error
    return process, path, log


def info(path, section):
    return dict(line.split(":", 1) for line in call(path, "INFO", section).splitlines() if ":" in line)


def replication(primary, replica):
    primary_info, replica_info = info(primary, "replication"), info(replica, "replication")
    return {"primary_role": primary_info["role"], "connected_replicas": int(primary_info["connected_slaves"]),
            "replica_role": replica_info["role"], "master_link_status": replica_info["master_link_status"]}


def master_link(primary, replica, is_up):
    target = {"primary_role": "master", "connected_replicas": int(is_up),
              "replica_role": "slave", "master_link_status": "up" if is_up else "down"}
    return eventually(lambda: replication(primary, replica), lambda value: value == target)


def dial(address, family):
    with socket.socket(family, socket.SOCK_STREAM) as channel:
        channel.settimeout(0.5)
        return channel.connect_ex(address) == 0


def run_branch(binary, disconnected):
    # A short private directory also leaves room for macOS Unix socket limits.
    with tempfile.TemporaryDirectory(prefix="redis-promotion-", dir="/tmp") as directory, ExitStack() as stack:
        root = Path(directory)
        primary_process, primary, _ = redis(binary, root, "primary", stack)
        require(info(primary, "server")["redis_version"], VERSION)
        require(call(primary, "SET", KEY, BEFORE), "OK")
        link = stack.enter_context(Link(primary))
        worker = threading.Thread(target=link.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        worker.start()
        stack.callback(link.shutdown)
        address = link.server_address
        replica_process, replica, replica_log = redis(binary, root, "replica", stack, address[1])
        require(info(replica, "server")["redis_version"], VERSION)
        initial_link = master_link(primary, replica, True)
        initial_replica_value = require(call(replica, "GET", KEY), BEFORE)

        # WAIT is defined for writes on this same client connection.
        severed_links = require(link.cut(), 1) if disconnected else 0
        before_write = master_link(primary, replica, not disconnected)
        with connect(primary) as writer:
            client_id = writer("CLIENT", "ID")
            write_reply = require(writer("SET", KEY, AFTER), "OK")
            replicas = require(writer("WAIT", 1, WAIT_MS), 0 if disconnected else 1)
            require(writer("CLIENT", "ID"), client_id)
        old_primary_value = require(call(primary, "GET", KEY), AFTER)
        candidate_value = require(call(replica, "GET", KEY), BEFORE if disconnected else AFTER)

        primary_exit = require(stop(primary_process), 0)
        require(dial(str(primary), socket.AF_UNIX), False)
        eventually(lambda: info(replica, "replication")["master_link_status"], lambda status: status == "down")
        promotion = require(call(replica, "REPLICAOF", "NO", "ONE"), "OK")
        role = require(info(replica, "replication")["role"], "master")
        promoted_value = require(call(replica, "GET", KEY), candidate_value)
        replica_exit = require(stop(replica_process), 0)
        require(dial(str(replica), socket.AF_UNIX), False)
        link.shutdown()
        link.server_close()
        worker.join(timeout=2)
        require(worker.is_alive(), False)
        require(dial(address, socket.AF_INET), False)
        messages = [line.partition(" * ")[2] for line in replica_log.read_text().splitlines()]
        log_markers = [marker for message in messages for marker in REPLICA_LOG_MARKERS if message.startswith(marker)]
        require(log_markers, list(REPLICA_LOG_MARKERS))
        return {
            "initial_replication": initial_link, "initial_replica_value": initial_replica_value,
            "severed_links": severed_links, "replication": before_write,
            "primary_write": {"client_id": client_id, "value": AFTER, "set_reply": write_reply,
                              "wait_replicas": replicas},
            "replica_value_before_promotion": candidate_value,
            "after_promotion": {"reply": promotion, "role": role, "old_primary_value": old_primary_value,
                                "promoted_value": promoted_value},
            "replica_log": log_markers,
            "cleanup": {"primary_exit": primary_exit, "replica_exit": replica_exit,
                        "primary_stopped_before_promotion": True, "unix_sockets_closed": True,
                        "relay_bind_host": address[0], "relay_closed": True},
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--redis-server", type=Path, required=True)
    parser.add_argument("--source-archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    binary = args.redis_server.resolve(strict=True)
    archive_digest = require(sha256(args.source_archive), TARBALL_SHA256)
    version = subprocess.check_output([str(binary), "--version"], text=True).strip()
    if not version.startswith(f"Redis server v={VERSION} "):
        raise RuntimeError(f"expected Redis {VERSION}, got {version!r}")
    report = {
        "schema": 1, "scope": "local Redis asynchronous replication and manual promotion",
        "runtime": {"redis": VERSION, "redis_version_output": version, "binary_sha256": sha256(binary),
                    "source_archive_sha256": archive_digest, "platform": platform.system(),
                    "machine": platform.machine(), "python": platform.python_version()},
        "source_sha256": {Path(__file__).name: sha256(Path(__file__))},
        "fixture": {"key": KEY, "before": BEFORE, "after": AFTER, "wait_replicas": 1, "wait_ms": WAIT_MS},
        "branches": {"healthy": run_branch(binary, False), "disconnected": run_branch(binary, True)},
    }
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
