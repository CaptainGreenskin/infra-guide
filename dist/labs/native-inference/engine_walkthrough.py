"""Replay four native llama.cpp requests and check their CPU input batches."""

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
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

import make_fixture


ENGINE_COMMIT = "cd959bae99ff4bed22bef2604f45241c09bbb8c8"
ENGINE_VERSION = "0.9.0-dev (build 12110, commit cd959bae9)"
SERVER_OPTIONS = [
    "--ctx-size", "128", "--parallel", "1", "--device", "none", "--n-gpu-layers", "0",
    "--threads", "1", "--threads-batch", "1", "--batch-size", "32", "--ubatch-size", "32",
    "--no-warmup", "--cache-ram", "0", "--cache-reuse", "0", "--verbose", "--no-ui",
    "--fit", "off", "--alias", "synthetic-cache-walkthrough",
]
PROMPTS = {"red green blue": [1, 4, 5, 6], "red green four": [1, 4, 5, 10]}
CASES = [
    ("cold", "red green blue", True, 0, [7, 8, 9]),
    ("repeat", "red green blue", True, 3, [7, 8, 9]),
    ("changed_suffix", "red green four", True, 3, [11, 12, 13]),
    ("cache_disabled", "red green four", False, 0, [11, 12, 13]),
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def loopback_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def call_engine(port, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = Request(f"http://127.0.0.1:{port}{path}", data, {"Content-Type": "application/json"})
    return build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=15)


def wait_for_model(process, port):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        require(process.poll() is None, "llama-server exited before loading the model")
        try:
            with call_engine(port, "/health") as response:
                if json.load(response)["status"] == "ok":
                    return
        except URLError:
            pass
        time.sleep(0.1)
    raise TimeoutError("llama-server did not become ready")


def run_requests(port):
    tokenizations = {}
    for text, expected_ids in PROMPTS.items():
        request = {"content": text, "add_special": True, "with_pieces": True}
        with call_engine(port, "/tokenize", request) as response:
            tokenization = json.load(response)
        require([token["id"] for token in tokenization["tokens"]] == expected_ids, text)
        tokenizations[text] = {"request": request, "response": tokenization}

    completions = {}
    for name, text, reuse, _, _ in CASES:
        ids = [token["id"] for token in tokenizations[text]["response"]["tokens"]]
        request = {
            "prompt": ids, "id_slot": 0, "cache_prompt": reuse, "stream": True,
            "return_tokens": True, "return_progress": True, "n_predict": 3,
            "temperature": 0.0, "seed": 7,
        }
        with call_engine(port, "/completion", request) as response:
            events = [json.loads(line[6:]) for line in response
                      if line.startswith(b"data: ") and line[6:].strip() != b"[DONE]"]
            completions[name] = {"request": request, "http_status": response.status, "events": events}
    return {"tokenizations": tokenizations, "completions": completions}


def stop_server(process):
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


SLOT_START = re.compile(r"id\s+(\d+) \| task (\d+) \| new prompt,.*?task\.n_tokens = (\d+)")
BATCH_TOKEN = re.compile(r"ubatch_print:\s+\d+: id =\s+(\d+) \(.*\), pos =\s+(\d+), .*?seq_id = \[(\d+)\], output = ([01])")


def read_native_trace(stderr):
    # Use the engine's split microbatch rows. The 'effective n_batch' log is a limit.
    starts = list(SLOT_START.finditer(stderr))
    require(len(starts) == len(CASES), "wrong number of native prompt starts")
    require(set(re.findall(r"layer\s+\d+ assigned to device ([^,\s]+)", stderr)) == {"CPU"},
            "CPU model placement was not observed")
    require("CPU KV buffer size" in stderr and "CPU compute buffer size" in stderr,
            "CPU KV and compute buffers were not observed")

    traces = []
    for index, start in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(stderr)
        segment = stderr[start.start():end]
        slot_id, task_id, prompt_count = map(int, start.groups())
        slot = rf"id\s+{slot_id} \| task {task_id} \| "
        kept = re.findall(slot + r"cached n_tokens = (\d+), memory_seq_rm \[(\d+), end\)", segment)
        retained = re.findall(slot + r"stop processing: n_tokens = (\d+), truncated = 0", segment)
        require(len(kept) == len(retained) == 1, "missing native slot-cache boundary")
        samples = [int(token) for token in re.findall(slot + r"n_gen = \d+, n_remaining = \d+, next token:\s+(\d+)", segment)]
        rebuild = re.findall(slot + r"need to evaluate at least 1 token .*?\(n_past = (\d+), task.n_tokens\(\) = (\d+)\)", segment)
        batches = []
        batch = None
        for line in segment.splitlines():
            if "added ubatch to split:" in line:
                batch = {"rows": []}
                batches.append(batch)
            elif "input batch info:" in line:
                batch = None
            elif batch is not None:
                count = re.search(r"ubatch_print:\s+n_tokens\s+= (\d+)", line)
                token = BATCH_TOKEN.search(line)
                if count:
                    batch["n_tokens"] = int(count[1])
                if token:
                    token_id, position, sequence, output = map(int, token.groups())
                    batch["rows"].append({"token_id": token_id, "position": position, "sequence": sequence, "logits_requested": bool(output)})
        require(all(batch.get("n_tokens") == len(batch["rows"]) for batch in batches), "native batch rows are incomplete")
        traces.append({
            "slot_id": slot_id, "prompt_tokens": prompt_count,
            "kept_prefix_tokens": int(kept[0][0]), "removed_from_position": int(kept[0][1]),
            "slot_tokens_at_finish": int(retained[0]), "sampled_ids": samples,
            "all_match_before_last_token_recheck": int(rebuild[0][0]) if rebuild else None,
            "batches": batches,
        })
    return traces


def check_case(spec, response, trace, previous_prompt):
    name, text, reuse, expected_cache, expected_ids = spec
    prompt = response["request"]["prompt"]
    require(prompt == PROMPTS[text] and response["request"]["cache_prompt"] == reuse, name)
    events = response["events"]
    require(response["http_status"] == 200 and events[-1]["stop"] is True, name)
    final = events[-1]
    progress = [{k: event["prompt_progress"][k] for k in ("total", "cache", "processed")}
                for event in events if "prompt_progress" in event]
    # Progress events carry a placeholder token; only normal generation events are sampled.
    token_events = [event for event in events if not event["stop"] and "prompt_progress" not in event]
    emitted = [event["tokens"] for event in token_events]
    content = "".join(event["content"] for event in token_events)
    counts = {k: final["timings"][k] for k in ("cache_n", "prompt_n", "predicted_n")}
    require(counts == {"cache_n": expected_cache, "prompt_n": len(prompt) - expected_cache, "predicted_n": 3}, name)
    require(progress == [{"total": 4, "cache": expected_cache, "processed": pos} for pos in (expected_cache, 4)], name)
    require(emitted == [[token] for token in expected_ids] and trace["sampled_ids"] == expected_ids, name)
    require(final["id_slot"] == trace["slot_id"] == 0 and final["stop_type"] == "limit", name)
    require(final["tokens_evaluated"] == trace["prompt_tokens"] == len(prompt), name)
    require(final["tokens_cached"] == trace["slot_tokens_at_finish"] == len(prompt) + len(expected_ids) - 1, name)
    require(trace["kept_prefix_tokens"] == trace["removed_from_position"] == expected_cache, name)
    require(trace["all_match_before_last_token_recheck"] == (len(prompt) if name == "repeat" else None), name)

    expected_batches = [prompt[expected_cache:], [expected_ids[0]], [expected_ids[1]]]
    require([[row["token_id"] for row in batch["rows"]] for batch in trace["batches"]] == expected_batches, name)
    rows = [row for batch in trace["batches"] for row in batch["rows"]]
    require([row["position"] for row in rows] == list(range(expected_cache, final["tokens_cached"])), name)
    require(all(row["sequence"] == 0 for row in rows), name)
    require([row["position"] for row in rows if row["logits_requested"]] == [3, 4, 5], name)

    matching_prefix = []
    for old, new in zip(previous_prompt, prompt):
        if old != new:
            break
        matching_prefix.append(new)
    return {
        "name": name, "text": text, "prompt_ids": prompt, "cache_prompt": reuse,
        "api": {**counts, "tokens_evaluated": final["tokens_evaluated"], "tokens_cached": final["tokens_cached"],
                "output_ids": [token for event in emitted for token in event],
                "content": content, "prompt_progress": progress},
        "native": trace,
        "matching_previous_prompt_prefix_ids": matching_prefix,
    }


def excerpt(stderr):
    # Native excerpts omit timestamps, startup probes, pointers and paths.
    markers = (
        "assigned to device CPU", "CPU KV buffer size", "CPU compute buffer size",
        "new prompt,", "cached n_tokens =", "need to evaluate at least 1 token",
        "n_past was set to", "added ubatch to split:", "next token:", "stop processing:",
    )
    lines = []
    in_request = False
    in_split = False
    for line in stderr.splitlines():
        if "new prompt," in line:
            in_request = True
        if "input batch info:" in line:
            in_split = False
        if "added ubatch to split:" in line:
            in_split = in_request
        if "stop processing:" in line:
            in_request = False
        is_batch_row = in_split and (BATCH_TOKEN.search(line) or "ubatch_print:   n_tokens" in line)
        if is_batch_row or any(marker in line for marker in markers[:3]) or (
            (in_request or "stop processing:" in line) and any(marker in line for marker in markers[3:])
        ):
            pieces = re.split(r"\d+\.\d{2}\.\d{3}\.\d{3} (?=[A-Z] )", line)
            lines.append(pieces[-1].strip())
    return "\n".join(lines) + "\n"


def main(server, output_dir):
    server = server.resolve(strict=True)
    env = {key: value for key, value in os.environ.items() if not key.startswith("LLAMA_ARG_")}
    env["LLAMA_BATCH_DEBUG"] = "1"
    version = subprocess.run([str(server), "--version"], env=env, text=True, capture_output=True, check=True, timeout=30)
    require(ENGINE_VERSION in version.stdout + version.stderr, "use the pinned llama.cpp b12110 server")
    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="engine-walkthrough-") as directory:
        fixture = Path(directory) / "fixture.gguf"
        stderr_path = Path(directory) / "stderr.log"
        make_fixture.build(fixture)
        model = {"architecture": "llama", "kind": "synthetic", "bytes": fixture.stat().st_size,
                 "gguf_sha256": sha256(fixture)}
        port = loopback_port()
        args = [str(server), "--model", str(fixture), "--host", "127.0.0.1", "--port", str(port), *SERVER_OPTIONS]
        with stderr_path.open("wb") as log:
            process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log, env=env)
            try:
                wait_for_model(process, port)
                responses = run_requests(port)
            finally:
                stop_server(process)
        stderr = stderr_path.read_text(encoding="utf-8")

    traces = read_native_trace(stderr)
    cases = []
    previous_prompt = []
    for spec, trace in zip(CASES, traces):
        result = check_case(spec, responses["completions"][spec[0]], trace, previous_prompt)
        cases.append(result)
        previous_prompt = result["prompt_ids"]

    scripts = [Path(__file__), Path(make_fixture.__file__)]
    record = {
        "status": "passed", "scope": "one native loopback server, one CPU slot, synthetic weights, greedy generation",
        "engine": {"version": ENGINE_VERSION, "commit": ENGINE_COMMIT, "binary_sha256": sha256(server),
                   "platform": f"{platform.system()} {platform.machine()}", "args": SERVER_OPTIONS,
                   "batch_debug_env": {"LLAMA_BATCH_DEBUG": "1"}, "backend": "CPU"},
        "model": model, "source_sha256": {script.name: sha256(script) for script in scripts},
        "cases": cases,
    }
    save_json(output_dir / "native-responses.json", responses)
    (output_dir / "native-stderr.log").write_text(excerpt(stderr), encoding="utf-8")
    save_json(output_dir / "validation.json", record)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    arguments = parser.parse_args()
    main(arguments.server, arguments.output_dir)
