#!/usr/bin/env python3
"""Read native Redis RESP3 replies and pushes over private Unix sockets."""

import argparse
from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
import platform
import re
import socket
import subprocess
import tempfile
import time


VERSION = "8.2.6"
TARBALL_SHA256 = "78dd7326c5c959202c6c3849d3ea9c61896d78d647c20f6542b52c0917f96eac"
KEY = "order:104"
V7 = "v7/pending"
V8 = "v8/shipped"
V9 = "v9/delivered"


def require(actual, expected):
    if actual != expected:
        raise RuntimeError(f"expected {expected!r}, got {actual!r}")
    return actual


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Connection:
    def __init__(self, path, label, wire, stack):
        self.label = label
        self.wire = wire
        self.socket = stack.enter_context(socket.socket(socket.AF_UNIX, socket.SOCK_STREAM))
        self.socket.settimeout(3)
        self.socket.connect(str(path))
        self.stream = stack.enter_context(self.socket.makefile("rb"))
        greeting = self.command(f"{label}-hello", "HELLO", "3")
        require(greeting["version"], VERSION)
        require(greeting["proto"], 3)
        self.id = greeting["id"]

    def observe(self, step, direction, raw):
        self.wire.append({"step": step, "connection": self.label,
                          "direction": direction, "raw": raw.decode("ascii")})

    def send(self, step, *args):
        parts = [arg.encode("ascii") for arg in args]
        raw = f"*{len(parts)}\r\n".encode("ascii")
        raw += b"".join(f"${len(part)}\r\n".encode("ascii") + part + b"\r\n" for part in parts)
        self.socket.sendall(raw)
        self.observe(step, "sent", raw)

    def receive(self, step):
        raw = bytearray()

        def frame():
            line = self.stream.readline()
            if not line:
                raise EOFError("socket closed")
            require(line[-2:], b"\r\n")
            raw.extend(line)
            prefix, field = line[:1], line[1:-2].decode("ascii")
            if prefix == b"+":
                return field
            if prefix == b"-":
                raise RuntimeError(field)
            if prefix == b":":
                return int(field)
            if prefix == b"_":
                return None
            if prefix in (b"$", b"="):
                count = int(field)
                require(count >= 0, True)
                payload = self.stream.read(count + 2)
                require(len(payload), count + 2)
                require(payload[-2:], b"\r\n")
                raw.extend(payload)
                if prefix == b"=":
                    require(payload[:4], b"txt:")
                    payload = payload[4:]
                return payload[:-2].decode("ascii")
            if prefix == b"%":
                return {frame(): frame() for _ in range(int(field))}
            if prefix in (b"*", b">"):
                return [frame() for _ in range(int(field))]
            raise RuntimeError(f"unexpected RESP3 prefix {prefix!r}")

        result = frame()
        self.observe(step, "received", raw)
        return result

    def expect_eof(self, step):
        require(self.stream.read(1), b"")
        self.observe(step, "eof", b"")

    def command(self, step, *args):
        self.send(step, *args)
        return self.receive(step)


class NearCache:
    """Serial application state. A ticket identifies one pending fill for a key."""

    def __init__(self):
        self.values = {}
        self.pending = {}
        self.sequence = 0

    def begin(self, key):
        self.sequence += 1
        self.pending[key] = self.sequence
        return self.sequence

    def finish(self, key, ticket, value):
        if self.pending.get(key) != ticket:
            return False
        self.values[key] = value
        del self.pending[key]
        return True

    def invalidate(self, key):
        self.values.pop(key, None)
        self.pending.pop(key, None)

    def disconnected(self):
        self.values.clear()
        self.pending.clear()


def get_calls(connection, step):
    info = connection.command(step, "INFO", "commandstats")
    counter = re.search(r"^cmdstat_get:calls=(\d+),", info, re.MULTILINE)
    return int(counter[1]) if counter else 0


def observe_get_completed(connection, baseline, label):
    # The lab sends exactly one GET between these counts. The other connection
    # serves as a server-side processing fence without reading the old reply.
    for attempt in range(50):
        observed = get_calls(connection, f"{label}-get-fence-{attempt}")
        if observed == baseline + 1:
            return observed
        require(observed, baseline)
        time.sleep(0.002)
    raise TimeoutError("GET never appeared in Redis commandstats")


def update(writer, step, value, key=KEY):
    require(writer.command(step, "SET", key, value), "OK")


def track(reader, redirect=None):
    args = ("CLIENT", "TRACKING", "ON")
    if redirect is not None:
        args += ("REDIRECT", str(redirect.id))
    require(reader.command(f"{reader.label}-track", *args), "OK")


def single_connection(writer, connect):
    update(writer, "single-start", V7)
    reader = connect("single-D")
    track(reader)
    baseline = get_calls(writer, "single-get-baseline")
    reader.send("single-old-get", "GET", KEY)
    observed = observe_get_completed(writer, baseline, "single")
    update(writer, "single-untracked-write", V8, "order:105")
    update(writer, "single-tracked-write", V8)
    reader.send("single-barrier", "ECHO", "single-done")
    old = require(reader.receive("single-old-reply"), V7)
    push = require(reader.receive("single-invalidate"), ["invalidate", [KEY]])
    require(reader.receive("single-barrier"), "single-done")
    fresh = require(reader.command("single-fresh-get", "GET", KEY), V8)
    return {"get_calls": [baseline, observed], "ordered_delivery": [old, push],
            "fresh_value": fresh, "push_before_barrier": 1}


def split_connection(writer, connect):
    update(writer, "split-start", V7)
    reader, invalidations = connect("split-D"), connect("split-I")
    track(reader, invalidations)
    guarded = NearCache()
    first_ticket = guarded.begin(KEY)
    baseline = get_calls(writer, "split-get-baseline")
    reader.send("split-old-get", "GET", KEY)
    observed = observe_get_completed(writer, baseline, "split")
    update(writer, "split-tracked-write", V8)
    require(invalidations.receive("split-invalidate"), ["invalidate", [KEY]])
    guarded.invalidate(KEY)

    # A new load can exist when the old reply is dispatched. A boolean
    # "loading" flag cannot distinguish these two completions.
    second_ticket = guarded.begin(KEY)
    reader.send("split-fresh-get", "GET", KEY)
    old = require(reader.receive("split-old-reply"), V7)
    naive = {KEY: old}
    old_accepted = require(guarded.finish(KEY, first_ticket, old), False)
    fresh = require(reader.receive("split-fresh-reply"), V8)
    new_accepted = require(guarded.finish(KEY, second_ticket, fresh), True)
    return {"get_calls": [baseline, observed], "tickets": [first_ticket, second_ticket],
            "naive_after_old_reply": naive[KEY], "old_fill_accepted": old_accepted,
            "fresh_fill_accepted": new_accepted, "guarded_value": guarded.values[KEY]}


def disconnected_channel(writer, connect):
    update(writer, "drop-start", V8)
    reader, invalidations = connect("drop-D"), connect("drop-I")
    track(reader, invalidations)
    guarded = NearCache()
    initial = guarded.begin(KEY)
    cached = require(reader.command("drop-warm-get", "GET", KEY), V8)
    require(guarded.finish(KEY, initial, cached), True)
    before = get_calls(writer, "drop-get-baseline")
    old_ticket = guarded.begin(KEY)
    reader.send("drop-pending-get", "GET", KEY)
    observed = observe_get_completed(writer, before, "drop")
    require(writer.command("drop-kill-invalidation-socket", "CLIENT", "KILL", "ID", str(invalidations.id)), 1)
    invalidations.expect_eof("drop-observe-eof")
    guarded.disconnected()
    update(writer, "drop-write-during-gap", V9)
    old = require(reader.receive("drop-pending-reply"), V8)
    require(reader.receive("drop-redis-redirect-broken"), ["tracking-redir-broken", invalidations.id])
    old_accepted = require(guarded.finish(KEY, old_ticket, old), False)
    after_disconnect = require(guarded.values.get(KEY), None)

    new_reader, new_invalidations = connect("recover-D"), connect("recover-I")
    track(new_reader, new_invalidations)
    new_ticket = guarded.begin(KEY)
    fresh = require(new_reader.command("recover-fresh-get", "GET", KEY), V9)
    require(guarded.finish(KEY, new_ticket, fresh), True)
    return {"get_calls": [before, observed], "eof": True,
            "redirect_ids": [invalidations.id, new_invalidations.id],
            "naive_retained_value": cached, "guarded_value_during_gap": after_disconnect,
            "old_fill_accepted": old_accepted, "guarded_value_after_reconnect": guarded.values[KEY]}


def run_cases(path):
    wire = []
    with ExitStack() as writer_stack:
        writer = Connection(path, "writer", wire, writer_stack)
        cases = {}
        for name, exercise in (("single", single_connection), ("split", split_connection),
                               ("disconnect", disconnected_channel)):
            with ExitStack() as case_stack:
                def connect(label):
                    return Connection(path, label, wire, case_stack)

                cases[name] = exercise(writer, connect)
    return cases, wire


def run_isolated(binary):
    with tempfile.TemporaryDirectory(prefix="redis-tracking-", dir="/tmp") as tmp:
        directory = Path(tmp)
        path = directory / "private.sock"
        with (directory / "redis.log").open("w+b") as log:
            process = subprocess.Popen([str(binary), "--port", "0", "--unixsocket", str(path),
                                        "--unixsocketperm", "700", "--save", "", "--appendonly", "no",
                                        "--dir", str(directory)], stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 4
                while not path.exists():
                    if process.poll() is not None or time.monotonic() >= deadline:
                        log.seek(0)
                        raise RuntimeError(log.read().decode("utf-8", "replace"))
                    time.sleep(0.01)
                cases, wire = run_cases(path)
            finally:
                if process.poll() is None:
                    process.terminate()
                try:
                    exit_code = process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    raise
            require(exit_code, 0)
    return cases, wire, exit_code, not directory.exists()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--redis-server", required=True, type=Path)
    parser.add_argument("--source-archive", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    binary = args.redis_server.resolve(strict=True)
    require(digest(args.source_archive), TARBALL_SHA256)
    version = subprocess.check_output([str(binary), "--version"], text=True, timeout=3).strip()
    require(re.match(r"^Redis server v=(\S+)", version)[1], VERSION)
    cases, wire, exit_code, scratch_removed = run_isolated(binary)
    require(scratch_removed, True)
    record = {"schema": "redis-client-tracking-v1", "status": "passed",
              "source_sha256": {"tracking_lab.py": digest(Path(__file__))},
              "environment": {"system": platform.system(), "machine": platform.machine(),
                              "python": platform.python_version(), "redis": version,
                              "redis_binary_sha256": digest(binary), "redis_archive_sha256": TARBALL_SHA256},
              "cases": cases, "wire": wire,
              "cleanup": {"redis_exit_code": exit_code, "scratch_removed": scratch_removed}}
    args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
