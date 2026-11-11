"""Compare the same four llama.cpp HTTP requests on CPU and Apple Metal."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import socket
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, Request, build_opener

import make_fixture


ENGINE_VERSION = "0.9.0-dev (build 12110, commit cd959bae9)"
ENGINE_COMMIT = "cd959bae99ff4bed22bef2604f45241c09bbb8c8"
ENGINE_SHA = "e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959"
METAL_SHA = "2b04ec59315ed3bd196ef119e20c2173c094b3cf206d8d0d4ca5b5caf685f8d9"
MODEL_SHA = "d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66"
OPTIONS = [
    "--ctx-size", "128", "--parallel", "1", "--threads", "1", "--threads-batch", "1",
    "--batch-size", "32", "--ubatch-size", "32", "--no-warmup", "--cache-ram", "0",
    "--cache-reuse", "0", "--verbose", "--no-ui", "--fit", "off",
    "--flash-attn", "off", "--alias", "synthetic-cache-walkthrough",
]
DEBUG = {"LLAMA_BATCH_DEBUG": "1", "GGML_METAL_GRAPH_DEBUG": "1"}
PROMPTS = {"red green blue": [1, 4, 5, 6], "red green four": [1, 4, 5, 10]}
CASES = [
    ("cold", "red green blue", True, 0, [7, 8, 9]),
    ("repeat", "red green blue", True, 3, [7, 8, 9]),
    ("changed_suffix", "red green four", True, 3, [11, 12, 13]),
    ("cache_disabled", "red green four", False, 0, [11, 12, 13]),
]
COMPUTE_NODES = {
    ("MUL_MAT", "Qcur-0"), ("MUL_MAT", "Kcur-0"), ("MUL_MAT", "Vcur-0"),
    ("MUL_MAT", "kq-0"), ("SOFT_MAX", "kq_soft_max-0"),
    ("MUL_MAT", "kqv-0"), ("MUL_MAT", "result_output"),
}
LAYER = re.compile(r"load_tensors: layer\s+(\d+) assigned to device (\S+),")
BUFFER = re.compile(r"(?:load_tensors|llama_kv_cache|sched_reserve):\s+(\S+) (model|KV|compute) buffer size =\s+([\d.]+) MiB")
SLOT_START = re.compile(r"id\s+0 \| task (\d+) \| new prompt,")
BATCH_ROW = re.compile(r"ubatch_print:\s+\d+: id =\s+(\d+) \(.*\), pos =\s+(\d+), .*seq_id = \[0\], output = ([01])")
METAL_NODE = re.compile(r"ggml_metal_op_encode_impl: node\[\s*\d+\] - (\S+)\s+(\S+)")
TIMESTAMP = re.compile(r"^\d+\.\d{2}\.\d{3}\.\d{3} ")
HTTP = build_opener(ProxyHandler({}))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def request(port, route, body=None):
    data = None if body is None else json.dumps(body).encode()
    return HTTP.open(Request(f"http://127.0.0.1:{port}{route}", data,
                             {"Content-Type": "application/json"}), timeout=15)


def wait_ready(process, port):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        require(process.poll() is None, "llama-server exited before loading the model")
        try:
            with request(port, "/health") as response:
                if json.load(response)["status"] == "ok":
                    return
        except URLError:
            time.sleep(0.1)
    raise TimeoutError("llama-server did not become ready")


def http_requests(port):
    tokenizations, completions = {}, {}
    for text, expected_ids in PROMPTS.items():
        body = {"content": text, "add_special": True, "with_pieces": True}
        with request(port, "/tokenize", body) as response:
            reply = json.load(response)
        require([token["id"] for token in reply["tokens"]] == expected_ids, text)
        tokenizations[text] = {"request": body, "response": reply}
    for name, text, cache, _, _ in CASES:
        prompt = [token["id"] for token in tokenizations[text]["response"]["tokens"]]
        body = {"prompt": prompt, "id_slot": 0, "cache_prompt": cache, "stream": True,
                "return_tokens": True, "return_progress": True, "n_predict": 3,
                "temperature": 0.0, "seed": 7}
        with request(port, "/completion", body) as response:
            events = [json.loads(line[6:]) for line in response
                      if line.startswith(b"data: ") and line[6:].strip() != b"[DONE]"]
            completions[name] = {"request": body, "http_status": response.status, "events": events}
    return {"tokenizations": tokenizations, "completions": completions}


def run_backend(server, fixture, env, device, layers):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    args = [str(server), "--model", str(fixture), "--host", "127.0.0.1", "--port", str(port),
            "--device", device, "--n-gpu-layers", str(layers), *OPTIONS]
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log, env=env)
        try:
            wait_ready(process, port)
            responses = http_requests(port)
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        log.seek(0)
        native = log.read().decode()
    return responses, native


def native_excerpt(native):
    # Keep the native fields, without wall time, trailing padding or temporary paths.
    lines, active, batch_rows = [], False, False
    for line in native.splitlines():
        line = TIMESTAMP.sub("", line).rstrip()
        if LAYER.search(line) or BUFFER.search(line):
            lines.append(line)
            continue
        if SLOT_START.search(line):
            active, batch_rows = True, False
        if not active:
            continue
        if "added ubatch to split:" in line:
            batch_rows = True
        if "input batch info:" in line:
            batch_rows = False
        if (SLOT_START.search(line) or "added ubatch to split:" in line
                or "next token:" in line or "stop processing:" in line
                or METAL_NODE.search(line) or (batch_rows and BATCH_ROW.search(line))):
            lines.append(line)
        if "stop processing:" in line:
            active = False
    return "\n".join(lines) + "\n"


def parse_native(log, expected_device, use_metal):
    placement = {
        "layers": [{"index": int(index), "device": device} for index, device in LAYER.findall(log)],
        "buffers": [{"device": device, "kind": kind, "mib": float(size)}
                    for device, kind, size in BUFFER.findall(log)],
    }
    require(placement["layers"] == [{"index": i, "device": expected_device} for i in range(2)], "model layers")
    buffers = {(row["device"], row["kind"]) for row in placement["buffers"]}
    require({(expected_device, "KV"), (expected_device, "compute"),
             (expected_device + "_Mapped", "model")}.issubset(buffers), "model, KV and compute buffers")
    spans = SLOT_START.split(log)
    require(len(spans) == 1 + 2 * len(CASES), "native prompt count")
    native = []
    for index in range(1, len(spans), 2):
        task, segment = int(spans[index]), spans[index + 1]
        prefix = rf"id\s+0 \| task {task} \| "
        retained = re.findall(prefix + r"stop processing: n_tokens = (\d+), truncated = 0", segment)
        require(len(retained) == 1, "missing native slot completion")
        sampled = re.findall(prefix + r"n_gen = \d+, n_remaining = \d+, next token:\s+(\d+)", segment)
        batches = []
        for chunk in segment.split("added ubatch to split:")[1:]:
            rows = [{"token_id": int(token), "position": int(position), "logits_requested": output == "1"}
                    for token, position, output in BATCH_ROW.findall(chunk)]
            nodes = METAL_NODE.findall(chunk)
            require(COMPUTE_NODES.issubset(nodes) if use_metal else not nodes, "Metal nodes in native batch")
            batches.append({"rows": rows, "metal_nodes": [{"op": op, "tensor": tensor} for op, tensor in nodes]})
        native.append({"retained": int(retained[0]), "sampled": [int(value) for value in sampled], "batches": batches})
    return placement, native


def validate_requests(responses, traces):
    results = []
    for (name, text, cache, reused, expected), trace in zip(CASES, traces):
        completion = responses["completions"][name]
        events = completion["events"]
        final = events[-1]
        outputs = [event["tokens"][0] for event in events if not event["stop"] and "prompt_progress" not in event]
        counts = {key: final["timings"][key] for key in ("cache_n", "prompt_n", "predicted_n")}
        prompt = PROMPTS[text]
        require(completion["http_status"] == 200 and final["stop"] and final["id_slot"] == 0, name)
        require(counts == {"cache_n": reused, "prompt_n": len(prompt) - reused, "predicted_n": len(expected)}, name)
        require(outputs == trace["sampled"] == expected, name)
        require(final["tokens_cached"] == trace["retained"] == len(prompt) + len(expected) - 1, name)
        batches = trace["batches"]
        require([[row["token_id"] for row in batch["rows"]] for batch in batches] ==
                [prompt[reused:], [expected[0]], [expected[1]]], name)
        rows = [row for batch in batches for row in batch["rows"]]
        require([row["position"] for row in rows] == list(range(reused, trace["retained"])), name)
        require([row["position"] for row in rows if row["logits_requested"]] == [3, 4, 5], name)
        results.append({"name": name, "prompt_ids": prompt, "cache_prompt": cache,
                        "api": {**counts, "output_ids": outputs, "tokens_cached": final["tokens_cached"]},
                        "batches": batches})
    return results


def main(server, output_dir):
    server = server.resolve(strict=True)
    require(digest(server) == ENGINE_SHA, "use the fixed official macOS arm64 llama-server")
    metal_library = server.with_name("libggml-metal.dylib")
    require(digest(metal_library) == METAL_SHA, "use the fixed official Metal backend beside the server")
    env = {key: value for key, value in os.environ.items() if not key.startswith(("LLAMA_ARG_", "GGML_"))}
    env.update(DEBUG)
    version = subprocess.run([str(server), "--version"], env=env, text=True, capture_output=True, check=True, timeout=20)
    require(ENGINE_VERSION in version.stdout + version.stderr, "wrong llama.cpp version")
    devices = subprocess.run([str(server), "--list-devices"], env=env, text=True, capture_output=True,
                             check=True, timeout=20)
    device = re.search(r"(?m)^\s*MTL0: (.+?) \(\d+ MiB", devices.stdout + devices.stderr)
    require(device is not None, "no MTL0 device found")

    results, responses, excerpts = {}, {}, []
    with tempfile.TemporaryDirectory(prefix="metal-inference-") as directory:
        fixture = Path(directory) / "fixture.gguf"
        make_fixture.build(fixture)
        require(digest(fixture) == MODEL_SHA, "unexpected synthetic model")
        model = {"bytes": fixture.stat().st_size, "gguf_sha256": MODEL_SHA}
        for name, requested, device_name, layers in [("cpu", "none", "CPU", 0), ("metal", "MTL0", "MTL0", 99)]:
            response, native = run_backend(server, fixture, env, requested, layers)
            require(not re.search(r"ggml_metal.*(?:failed|error:)|Flash Attention is assigned to device CPU", native),
                    f"backend failure or unexpected Flash Attention fallback in {name}")
            log = native_excerpt(native)
            placement, traces = parse_native(log, device_name, name == "metal")
            results[name] = {"device": requested, "n_gpu_layers": layers, "placement": placement,
                             "cases": validate_requests(response, traces)}
            responses[name] = response
            excerpts.append(f"[{name}]\n{log}")

    output_dir.mkdir(parents=True, exist_ok=False)
    response_file, log_file = output_dir / "native-responses.json", output_dir / "native-stderr.log"
    write_json(response_file, responses)
    log_file.write_text("".join(excerpts), encoding="utf-8")
    directory = Path(__file__).resolve().parent
    write_json(output_dir / "validation.json", {
        "schema": "infra-native-metal-inference-v1",
        "status": "passed",
        "engine": {"version": ENGINE_VERSION, "commit": ENGINE_COMMIT, "binary_sha256": ENGINE_SHA,
                   "metal_library_sha256": METAL_SHA, "common_options": OPTIONS, "debug_env": DEBUG},
        "model": model,
        "environment": {"platform": f"{platform.system()} {platform.machine()}",
                        "macos": platform.mac_ver()[0], "metal_device": device.group(1)},
        "source_sha256": {name: digest(directory / name) for name in ("README.md", "make_fixture.py", "metal_inference.py")},
        "artifact_sha256": {file.name: digest(file) for file in (response_file, log_file)},
        "backends": results,
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    arguments = parser.parse_args()
    main(arguments.server, arguments.output_dir)
