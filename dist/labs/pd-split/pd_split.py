#!/usr/bin/env python3
"""Run a tiny, exact CPU prefill/decode comparison over local worker processes."""

import argparse
import hashlib
import hmac
import json
import math
import multiprocessing as mp
import os
import platform
import socket
import struct
import time
from pathlib import Path
from queue import Empty


VOCAB = 257
WAIT_SECONDS = 10
PREFIX = struct.Struct("!I")
HEADER = struct.Struct("!4scHH")
PAIR = struct.Struct("!HH")
DIGEST_SIZE = hashlib.sha256().digest_size
MAGIC = b"PDS1"
PROMPTS = {"A": (3, 1, 4, 1), "B": tuple((17 * i + 11) % VOCAB for i in range(8192))}
OUTPUT_COUNTS = {"A": 4, "B": 2}


def now_ns():
    return time.clock_gettime_ns(time.CLOCK_MONOTONIC)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def key_value(token, position):
    return (token + position) % VOCAB, (3 * token + 2 * position) % VOCAB


def predict(cache, previous):
    query = (previous % 11) + 1
    weighted_sum = 0
    total_weight = 0
    for key, value in cache:
        weight = 1 + (query * key) % 19
        weighted_sum += weight * value
        total_weight += weight
    return (weighted_sum // total_weight + len(cache)) % VOCAB


def frame_for(request_id, cache, first_token, corrupt):
    body = HEADER.pack(MAGIC, request_id.encode("ascii"), len(cache), first_token)
    body += b"".join(PAIR.pack(key, value) for key, value in cache)
    digest = hashlib.sha256(body).digest()
    if corrupt:
        digest = digest[:-1] + bytes([digest[-1] ^ 1])
    return PREFIX.pack(len(body) + len(digest)) + body + digest


def read_exact(endpoint, length):
    data = bytearray()
    while len(data) < length:
        chunk = endpoint.recv(length - len(data))
        if not chunk:
            raise EOFError("local socket closed inside a KV frame")
        data.extend(chunk)
    return bytes(data)


def read_frame(endpoint, request_id):
    prefix = read_exact(endpoint, PREFIX.size)
    length = PREFIX.unpack(prefix)[0]
    expected = HEADER.size + len(PROMPTS[request_id]) * PAIR.size + DIGEST_SIZE
    if length != expected:
        raise ValueError("unexpected_frame_length")
    return prefix + read_exact(endpoint, length)


def validate_frame(frame, request_id):
    body = frame[PREFIX.size:-DIGEST_SIZE]
    if not hmac.compare_digest(hashlib.sha256(body).digest(), frame[-DIGEST_SIZE:]):
        raise ValueError("checksum_mismatch")
    magic, request, prompt_length, first_token = HEADER.unpack_from(body)
    if (magic != MAGIC or request != request_id.encode("ascii")
            or prompt_length != len(PROMPTS[request_id]) or first_token >= VOCAB):
        raise ValueError("unexpected_cache_identity")
    cache = list(PAIR.iter_unpack(body[HEADER.size:]))
    if any(max(pair) >= VOCAB for pair in cache):
        raise ValueError("invalid_cache_pair")
    return cache, first_token


def event(origin, worker, request_id, name, **fields):
    return {
        "request_id": request_id, "event": name, "ns": now_ns() - origin,
        "pid": os.getpid(), "worker": worker, **fields,
    }


def run_worker(name, commands, events, endpoint, gate, ready, origin):
    resident = {}

    def emit(request_id, name_of_event, **fields):
        events.put(event(origin, name, request_id, name_of_event, **fields))

    try:
        if endpoint is not None:
            endpoint.settimeout(WAIT_SECONDS)
        ready.set()
        for operation, request_id, corrupt in iter(commands.get, ("stop", "", False)):
            if operation == "prefill":
                emit(request_id, "prefill_start")
                prompt = PROMPTS[request_id]
                cache = [key_value(token, i) for i, token in enumerate(prompt)]
                if request_id == "B" and gate is not None:
                    emit(request_id, "prefill_gate_wait")
                    if not gate.wait(WAIT_SECONDS):
                        raise TimeoutError("B prefill gate was not released")
                first_token = predict(cache, prompt[-1])
                emit(request_id, "token", index=0, value=first_token)
                emit(request_id, "prefill_end")
                if name == "prefill":
                    frame = frame_for(request_id, cache, first_token, corrupt)
                    emit(request_id, "kv_send_start")
                    endpoint.sendall(frame)
                    emit(request_id, "kv_send_end", frame_bytes=len(frame), frame_sha256=sha256(frame))
                else:
                    resident[request_id] = (cache, first_token)
                    emit(request_id, "kv_ready")
            elif operation == "receive":
                emit(request_id, "kv_receive_start")
                try:
                    frame = read_frame(endpoint, request_id)
                    emit(request_id, "kv_receive_end", frame_bytes=len(frame), frame_sha256=sha256(frame))
                    resident[request_id] = validate_frame(frame, request_id)
                except ValueError as error:
                    emit(request_id, "kv_rejected", reason=str(error))
                else:
                    emit(request_id, "kv_ready")
            elif operation == "decode":
                if request_id not in resident:
                    emit(request_id, "decode_rejected", reason="cache_not_ready")
                    continue
                cache, previous = resident.pop(request_id)
                emit(request_id, "decode_start")
                for index in range(1, OUTPUT_COUNTS[request_id]):
                    cache.append(key_value(previous, len(cache)))
                    previous = predict(cache, previous)
                    emit(request_id, "token", index=index, value=previous)
                emit(request_id, "decode_end")
            else:
                raise ValueError("unexpected worker command")
    except Exception as error:
        emit("", "worker_error", reason=f"{type(error).__name__}: {error}")
        raise
    finally:
        if endpoint is not None:
            endpoint.close()


class Workers:
    """Start processes, drive one fixed admission order, and collect timed events."""

    def __init__(self, topology):
        self.ctx = mp.get_context("spawn")
        self.topology = topology
        self.origin = now_ns()
        self.incoming = self.ctx.Queue()
        self.gate = self.ctx.Event()
        self.events = []
        self.commands = {}
        self.processes = {}
        self.ready = {}

    def __enter__(self):
        try:
            if self.topology == "split":
                producer, consumer = socket.socketpair()
                try:
                    self.start("prefill", producer)
                    self.start("decode", consumer)
                finally:
                    producer.close()
                    consumer.close()
            elif self.topology == "colocated_two_workers":
                self.start("shared_A")
                self.start("shared_B")
            else:
                self.start("shared")
            for name, ready in self.ready.items():
                if not ready.wait(WAIT_SECONDS):
                    raise TimeoutError(f"{name} worker did not become ready")
        except Exception as error:
            self.__exit__(type(error), error, error.__traceback__)
            raise
        return self

    def start(self, name, endpoint=None):
        commands = self.ctx.Queue()
        ready = self.ctx.Event()
        worker_gate = self.gate if name in ("prefill", "shared", "shared_B") else None
        process = self.ctx.Process(
            target=run_worker, args=(name, commands, self.incoming, endpoint, worker_gate, ready, self.origin),
        )
        process.start()
        self.commands[name] = commands
        self.processes[name] = process
        self.ready[name] = ready

    def __exit__(self, error_type, error, traceback):
        self.gate.set()
        for commands in self.commands.values():
            commands.put(("stop", "", False))
        for process in self.processes.values():
            process.join(WAIT_SECONDS)
            if process.is_alive():
                process.terminate()
                process.join()
        for commands in self.commands.values():
            commands.close()
        self.incoming.close()
        if error_type is None and any(process.exitcode != 0 for process in self.processes.values()):
            raise RuntimeError("worker did not exit normally")

    def push(self, worker, operation, request_id, corrupt=False):
        self.commands[worker].put((operation, request_id, corrupt))

    def mark(self, request_id, name):
        self.events.append(event(self.origin, "coordinator", request_id, name))

    def wait(self, request_id, name, **fields):
        def matches(item):
            return (item["request_id"] == request_id and item["event"] == name
                    and all(item.get(key) == value for key, value in fields.items()))

        for item in self.events:
            if matches(item):
                return item
        deadline = now_ns() + WAIT_SECONDS * 1_000_000_000
        while True:
            try:
                item = self.incoming.get(timeout=max(0, (deadline - now_ns()) / 1_000_000_000))
            except Empty as error:
                raise TimeoutError(f"did not receive {request_id}.{name}") from error
            if item["event"] == "worker_error":
                raise RuntimeError(item["reason"])
            self.events.append(item)
            if matches(item):
                return item

    def prefill(self, request_id, corrupt=False):
        self.mark(request_id, "arrival")
        self.mark(request_id, "prefill_queued")
        if self.topology == "split":
            if request_id == "A":
                self.push("decode", "receive", request_id)
            worker = "prefill"
        elif self.topology == "colocated_two_workers":
            worker = "shared_" + request_id
        else:
            worker = "shared"
        self.push(worker, "prefill", request_id, corrupt)

    def decode(self, request_id):
        self.mark(request_id, "decode_queued")
        if self.topology == "split":
            worker = "decode"
        elif self.topology == "colocated_two_workers":
            worker = "shared_" + request_id
        else:
            worker = "shared"
        self.push(worker, "decode", request_id)

    def timeline(self):
        return sorted(self.events, key=lambda item: item["ns"])

    def worker_pids(self):
        return {name: process.pid for name, process in self.processes.items()}

    def release_long_prefill(self):
        self.mark("B", "prefill_gate_release")
        self.gate.set()


def request_metrics(events, request_id, slo):
    relevant = [item for item in events if item["request_id"] == request_id]
    timed = {item["event"]: item["ns"] for item in relevant if item["event"] != "token"}
    tokens = [item for item in relevant if item["event"] == "token"]
    intervals = [right["ns"] - left["ns"] for left, right in zip(tokens, tokens[1:])]
    send = next((item for item in relevant if item["event"] == "kv_send_end"), None)
    ttft = tokens[0]["ns"] - timed["arrival"]
    tpot = sum(intervals) / len(intervals)
    return {
        "outputs": [item["value"] for item in tokens],
        "ttft_ns": ttft,
        "tpot_ns": tpot,
        "token_intervals_ns": intervals,
        "decode_queue_ns": timed["decode_start"] - timed["decode_queued"],
        "decode_ready_queue_ns": timed["decode_start"] - max(timed["decode_queued"], timed["kv_ready"]),
        "kv_cache_bytes": len(PROMPTS[request_id]) * PAIR.size,
        "wire_bytes": send["frame_bytes"] if send else 0,
        "kv_handoff_ns": timed["kv_ready"] - timed["kv_send_start"] if send else None,
        "within_slo": ttft <= slo["ttft_ns"] and tpot <= slo["tpot_ns"],
    }


def run_topology(topology, slo):
    with Workers(topology) as workers:
        workers.prefill("A")
        workers.wait("A", "token", index=0)
        # B arrives after A's first token in all modes. Queue A after B takes a worker.
        workers.prefill("B")
        workers.wait("B", "prefill_start")
        workers.decode("A")
        if topology == "colocated":
            workers.release_long_prefill()
        workers.wait("A", "decode_end")
        if topology != "colocated":
            workers.release_long_prefill()
        if topology == "split":
            # Arm B's blocking receive after A has used the same decode worker.
            workers.push("decode", "receive", "B")
        workers.wait("B", "token", index=0)
        workers.decode("B")
        workers.wait("B", "decode_end")
        if topology == "split":
            for request_id in PROMPTS:
                workers.wait(request_id, "kv_send_end")
        timeline = workers.timeline()
        worker_pids = workers.worker_pids()
    per_request = {request_id: request_metrics(timeline, request_id, slo) for request_id in PROMPTS}
    first_arrival = min(item["ns"] for item in timeline if item["event"] == "arrival")
    last_completion = max(item["ns"] for item in timeline if item["event"] == "decode_end")
    window = last_completion - first_arrival
    qualified = sum(row["within_slo"] for row in per_request.values())
    return {
        "worker_pids": worker_pids, "events": timeline, "per_request": per_request,
        "cohort": {
            "completed_count": len(per_request),
            "slo_met_count": qualified,
            "window_ns": window,
            "goodput_requests_per_second": qualified * 1_000_000_000 / window,
        },
    }


def run_corruption():
    with Workers("split") as workers:
        workers.prefill("A", corrupt=True)
        kv_rejection = workers.wait("A", "kv_rejected")
        workers.decode("A")
        decode_rejection = workers.wait("A", "decode_rejected")
        workers.wait("A", "kv_send_end")
        timeline = workers.timeline()
    return {
        "fault": "checksum_corruption",
        "events": timeline,
        "outputs": [item["value"] for item in timeline if item["event"] == "token"],
        "kv_rejection": kv_rejection["reason"],
        "decode_rejection": decode_rejection["reason"],
    }


def requests():
    recipes = {
        "A": {"kind": "literal", "tokens": list(PROMPTS["A"])},
        "B": {"kind": "linear_mod", "count": len(PROMPTS["B"]), "multiplier": 17, "offset": 11, "modulus": VOCAB},
    }
    return [
        {
            "request_id": request_id,
            "prompt_tokens": len(prompt),
            "output_tokens": OUTPUT_COUNTS[request_id],
            "prompt_recipe": recipes[request_id],
            "prompt_sha256": sha256(struct.pack(f"!{len(prompt)}H", *prompt)),
        }
        for request_id, prompt in PROMPTS.items()
    ]


def milliseconds_to_ns(value):
    nanoseconds = float(value) * 1_000_000
    if not math.isfinite(nanoseconds) or nanoseconds < 1_000:
        raise argparse.ArgumentTypeError("the latency budget must be finite and at least 0.001 ms")
    return round(nanoseconds)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ttft-ms", type=milliseconds_to_ns, default=30_000_000)
    parser.add_argument("--tpot-ms", type=milliseconds_to_ns, default=1_500_000)
    parser.add_argument("--write-record", type=Path, help="write the report to this path")
    args = parser.parse_args()
    slo = {"ttft_ns": args.ttft_ms, "tpot_ns": args.tpot_ms}
    report = {"requests": requests(), "slo": slo}
    for topology in ("colocated", "split", "colocated_two_workers"):
        report[topology] = run_topology(topology, slo)
    report["negative"] = run_corruption()
    for request_id in PROMPTS:
        expected = report["colocated"]["per_request"][request_id]["outputs"]
        for topology in ("split", "colocated_two_workers"):
            if report[topology]["per_request"][request_id]["outputs"] != expected:
                raise RuntimeError(f"{topology}: different output for {request_id}")
    first = report["colocated"]["per_request"]["A"]["outputs"][0]
    negative = report["negative"]
    if (negative["outputs"] != [first] or negative["kv_rejection"] != "checksum_mismatch"
            or negative["decode_rejection"] != "cache_not_ready"):
        raise RuntimeError("corrupted cache did not stop continuation")
    recorded = {
        "schema": 1,
        "status": "passed",
        "source_sha256": sha256(Path(__file__).read_bytes()),
        "environment": {
            "system": platform.system(), "machine": platform.machine(),
            "python": platform.python_version(), "clock": "CLOCK_MONOTONIC",
            "transport": "socketpair", "scope": "single_host_cpu",
        },
        "report": report,
    }
    output = json.dumps(recorded, ensure_ascii=False, indent=2) + "\n"
    if args.write_record:
        args.write_record.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()
