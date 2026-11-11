"""Show a native Metal decode batch carrying two independent llama.cpp slots."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import socket
import subprocess
import tempfile
import threading
import time

import make_fixture
import queue_client as cpu


METAL_SHA = "2b04ec59315ed3bd196ef119e20c2173c094b3cf206d8d0d4ca5b5caf685f8d9"
DEBUG = {"LLAMA_BATCH_DEBUG": "1", "GGML_METAL_GRAPH_DEBUG": "1"}
OPTIONS = [
    "--device", "MTL0", "--n-gpu-layers", "99", "--threads", "1", "--threads-batch", "1",
    "--batch-size", "32", "--ubatch-size", "32", "--no-context-shift", "--no-warmup",
    "--cache-ram", "0", "--cache-reuse", "0", "--metrics", "--verbose", "--no-ui",
    "--fit", "off", "--flash-attn", "off", "--alias", "synthetic-concurrency-fixture",
]
ROW = re.compile(r"ubatch_print:\s+\d+: id =\s+(\d+) \(.*?\), pos =\s+(\d+), n_seq_id =\s+1, seq_id = \[([.01]+)\], output = ([01])")
COUNT = re.compile(r"ubatch_print:\s+n_tokens\s+=\s+(\d+)")
NODE = re.compile(r"ggml_metal_op_encode_impl: node\[\s*\d+\] - (\S+)\s+(\S+)")
REQUIRED = {("MUL_MAT", "kq-0"), ("SOFT_MAX", "kq_soft_max-0"),
            ("MUL_MAT", "kqv-0"), ("MUL_MAT", "result_output")}
PLACEMENT = ("assigned to device MTL0", "MTL0_Mapped model buffer size",
             "MTL0 KV buffer size", "MTL0 compute buffer size")
SOURCE = ("README.md", "metal_queue.py", "make_fixture.py", "queue_client.py")
ARTIFACTS = ("native-responses.json", "native-stderr.log")


@contextmanager
def launch(server, fixture, slots, log_path):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    env = {name: value for name, value in os.environ.items() if not name.startswith(("LLAMA_", "GGML_"))}
    env.update(DEBUG)
    command = [str(server), "--model", str(fixture), "--host", "127.0.0.1", "--port", str(port),
               "--parallel", str(slots), "--ctx-size", str(128 * slots), *OPTIONS]
    with log_path.open("wb") as log:
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=log, env=env)
        try:
            deadline = time.monotonic() + 45
            while True:
                cpu.require(process.poll() is None, "llama-server exited during startup")
                try:
                    if json.loads(cpu.get(port, "/health"))["status"] == "ok":
                        break
                except (OSError, ValueError):
                    pass
                cpu.require(time.monotonic() < deadline, "llama-server did not become ready")
                time.sleep(0.05)
            yield port
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


def capture_http(port, slots):
    origin = time.monotonic_ns()

    def now():
        return time.monotonic_ns() - origin

    before = json.loads(cpu.get(port, "/slots"))
    metrics_before = cpu.metric_sample(port, now)["values"]
    start, first, connected = [threading.Event() for _ in range(3)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        b = pool.submit(cpu.stream_request, port, "B", now, start, first, connected)
        a = pool.submit(cpu.stream_request, port, "A", now, start, first, connected)
        cpu.require(connected.wait(8), "request B did not connect")
        start.set()
        requests = {"A": a.result(timeout=20), "B": b.result(timeout=20)}
    after = json.loads(cpu.get(port, "/slots"))
    for snapshot in (before, after):
        cpu.require(len(snapshot) == slots and all(item["n_ctx"] == 128 and not item["is_processing"]
                                                  for item in snapshot), "unexpected slot state")
    return {"requests": requests, "slots_before": before, "slots_after": after,
            "metrics_before": metrics_before, "metrics_after": cpu.metric_sample(port, now)["values"]}


def excerpt(raw):
    selected = []
    for line in raw.splitlines():
        line = re.sub(r"^\d+\.\d{2}\.\d{3}\.\d{3} ", "", line).rstrip()
        if (any(marker in line for marker in (*PLACEMENT, "added ubatch to split:", "input batch info:"))
                or any(pattern.search(line) for pattern in (cpu.START, cpu.STOP, cpu.DEFER, cpu.SAMPLE, ROW, COUNT))
                or (node := NODE.search(line)) and node.groups() in REQUIRED):
            selected.append(line)
    return "\n".join(selected) + "\n"


def shared_decodes(log, requests):
    # The row masks [0.] and [.1] identify two sequences in the same split batch.
    log = log[cpu.START.search(log).start():]
    shared = []
    slots = {value["trace"]["start"]["slot"]: name for name, value in requests.items()}
    if len(slots) != 2:
        return shared
    for ordinal, chunk in enumerate(log.split("added ubatch to split:")[1:], 1):
        header = chunk.split("input batch info:", 1)[0]
        count = COUNT.search(header)
        if count is None or int(count[1]) != 2:
            continue
        rows = [{"token_id": int(token), "position": int(position), "seq_id": int(seq.replace(".", "")),
                 "output": output == "1"} for token, position, seq, output in ROW.findall(header)]
        if len(rows) != 2 or {row["seq_id"] for row in rows} != set(slots):
            continue
        if not all(row["output"] and row["position"] >= len(cpu.PROMPTS[slots[row["seq_id"]]]) for row in rows):
            continue
        nodes = NODE.findall(chunk)
        samples = {int(slot): int(token) for slot, _, token in cpu.SAMPLE.findall(chunk)}
        if not REQUIRED.issubset(nodes) or set(samples) != set(slots):
            continue
        for row in rows:
            seq = row["seq_id"]
            name = slots[seq]
            output = requests[name]["output_ids"]
            offset = row["position"] - len(cpu.PROMPTS[name])
            cpu.require(output[offset:offset+2] == [row["token_id"], samples[seq]], "batch row or next token crossed slots")
        shared.append({"batch_ordinal": ordinal, "rows": rows,
                       "metal_nodes": [{"op": op, "tensor": tensor} for op, tensor in nodes],
                       "sampled": [{"slot": slot, "token_id": samples[slot]} for slot in sorted(samples)]})
    return shared


def summarize(slots, response, native, traces):
    for marker in PLACEMENT:
        cpu.require(marker in native, "missing Metal placement: " + marker)
    requests = {name: cpu.summarize_request(name, response["requests"][name], traces[name]) for name in ("A", "B")}
    a, b = requests["A"], requests["B"]
    a_start, a_stop = traces["A"]["start"], traces["A"]["stop"]
    b_start, b_stop = traces["B"]["start"], traces["B"]["stop"]
    cpu.require(a["first_token_ns"] <= b["sent_ns"] < a["stop_ns"], "B was not sent during A's stream")
    if slots == 1:
        defers = traces["B"]["defer_lines"]
        cpu.require(defers and a_start["line"] < defers[0] < a_stop["line"] < b_start["line"], "missing single-slot queue")
        cpu.require(a_start["slot"] == b_start["slot"] == 0, "expected one native slot")
    else:
        cpu.require(a_start["line"] < b_start["line"] < min(a_stop["line"], b_stop["line"]), "missing two active slots")
        cpu.require(a_start["slot"] != b_start["slot"] and not traces["B"]["defer_lines"], "unexpected two-slot state")
    batches = shared_decodes(native, requests)
    cpu.require(bool(batches) == (slots == 2), "did not observe the requested shared decode")
    delta = {key: response["metrics_after"][key] - response["metrics_before"][key]
             for key in ("prompt_tokens_total", "tokens_predicted_total", "n_decode_total")}
    cpu.require(delta["prompt_tokens_total"] == 9 and delta["tokens_predicted_total"] == 142, "unexpected request counters")
    outputs = {}
    for name, request in requests.items():
        encoded = json.dumps(request["output_ids"], separators=(",", ":")).encode()
        outputs[name] = {"slot": request["trace"]["start"]["slot"], "counts": request["counts"],
                         "first_three_ids": request["output_ids"][:3], "output_ids_sha256": hashlib.sha256(encoded).hexdigest()}
    return {"slots": slots, "per_slot_context": 128, "requests": outputs, "metric_counter_deltas": delta,
            "shared_decode_count": len(batches), "first_shared_decode": batches[0] if batches else None}


def run(server, out):
    server = server.resolve(strict=True)
    cpu.require(cpu.digest(server) == cpu.ENGINE_SHA256, "use fixed llama-server b12110")
    cpu.require(cpu.digest(server.with_name("libggml-metal.dylib")) == METAL_SHA, "wrong Metal library")
    devices = subprocess.run([str(server), "--list-devices"], check=True, capture_output=True, text=True, timeout=15)
    gpu = re.search(r"(?m)^\s*MTL0: (.+?) \(\d+ MiB", devices.stdout + devices.stderr)
    cpu.require(gpu is not None, "no MTL0 device found")
    responses, runs, logs = {}, [], []
    with tempfile.TemporaryDirectory(prefix="metal-queue-") as temporary:
        directory = Path(temporary)
        fixture = directory / "fixture.gguf"
        make_fixture.build(fixture)
        cpu.require(cpu.digest(fixture) == cpu.FIXTURE_SHA256, "wrong synthetic model")
        for slots in (1, 2):
            log_path = directory / f"slots-{slots}.log"
            with launch(server, fixture, slots, log_path) as port:
                response = capture_http(port, slots)
            raw = log_path.read_text()
            cpu.require(not re.search(r"ggml_metal.*(?:failed|error:)|Flash Attention is assigned to device CPU", raw),
                        "Metal backend failure")
            log = excerpt(raw)
            traces, _ = cpu.parse_log(log_path)
            runs.append(summarize(slots, response, log, traces))
            logs.append(f"[slots={slots}]\n{log}")
            responses[str(slots)] = response
    for name in ("A", "B"):
        cpu.require(runs[0]["requests"][name]["output_ids_sha256"] == runs[1]["requests"][name]["output_ids_sha256"],
                    "output changed between slot configurations")
    out.mkdir(parents=True, exist_ok=False)
    cpu.save(out / ARTIFACTS[0], responses)
    (out / ARTIFACTS[1]).write_text("".join(logs))
    here = Path(__file__).resolve().parent
    cpu.save(out / "validation.json", {
        "schema": "infra-native-metal-queue-v1", "status": "passed",
        "engine": {"version": cpu.VERSION, "binary_sha256": cpu.ENGINE_SHA256,
                   "metal_library_sha256": METAL_SHA, "common_options": OPTIONS, "debug_env": DEBUG},
        "fixture_sha256": cpu.FIXTURE_SHA256,
        "environment": {"platform": f"{platform.system()} {platform.machine()}",
                        "macos": platform.mac_ver()[0], "metal_device": gpu.group(1)},
        "source_sha256": {name: cpu.digest(here / name) for name in SOURCE},
        "artifact_sha256": {name: cpu.digest(out / name) for name in ARTIFACTS},
        "runs": runs,
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    run(args.server, args.output_dir)
