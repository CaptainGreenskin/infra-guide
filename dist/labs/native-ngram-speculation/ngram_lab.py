"""Observe native llama.cpp greedy speculation over fixed synthetic inputs."""

import argparse
import hashlib
import json
import os
import platform
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, Request, build_opener

import make_fixture


ENGINE_SHA = "e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959"
MODEL_SHA = "d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66"
COMMIT = "cd959bae99ff4bed22bef2604f45241c09bbb8c8"
CASES = {
    "all_match": ([1, 4, 5, 6, 7, 8, 9, 10, 11, 4, 5, 6], 4),
    "late_mismatch": ([1, 4, 5, 6, 7, 8, 9, 10, 4, 5, 6], 3),
    "early_mismatch": ([1, 4, 5, 6, 7, 8, 3, 10, 4, 5, 6], 1),
    "no_match": ([1, 11, 5, 6], 0),
}
SPEC = ["--spec-ngram-simple-size-n", "2", "--spec-ngram-simple-size-m", "4",
        "--spec-ngram-simple-min-hits", "1"]
OPTIONS = ["--device", "none", "--n-gpu-layers", "0", "--parallel", "1",
           "--ctx-size", "128", "--threads", "1", "--threads-batch", "1",
           "--batch-size", "32", "--ubatch-size", "32", "--no-warmup",
           "--cache-ram", "0", "--cache-reuse", "0", "--verbose", "--no-ui",
           "--fit", "off", "--flash-attn", "off", "--alias", "synthetic-ngram"]
HTTP = build_opener(ProxyHandler({}))
TIMESTAMP = re.compile(r"^\d+\.\d{2}\.\d{3}\.\d{3} ")
NATIVE_ROW = re.compile(r"ubatch_print:\s+\d+: id =\s+\d+ .*pos =")


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def request(port, route, body=None):
    data = None if body is None else json.dumps(body).encode()
    return HTTP.open(Request(f"http://127.0.0.1:{port}{route}", data,
                             {"Content-Type": "application/json"}), timeout=15)


def wait_ready(process, port):
    deadline = time.monotonic() + 20
    while process.poll() is None and time.monotonic() < deadline:
        try:
            with request(port, "/health") as response:
                if json.load(response)["status"] == "ok":
                    return
        except URLError:
            time.sleep(0.05)
    raise RuntimeError("Pinned server did not become ready")


def log_excerpt(raw):
    lines = []
    in_request = in_batch = False
    for line in raw.splitlines():
        line = TIMESTAMP.sub("", line).rstrip()
        if " | new prompt," in line:
            in_request, in_batch = True, False
        if not in_request:
            continue
        if "added ubatch to split:" in line:
            in_batch = True
        if "input batch info:" in line:
            in_batch = False
        if (any(text in line for text in (
            " | new prompt,", "added ubatch to split:", "generate_draft:",
            "found matching pattern at pos", "add accepted tokens:", " draft acceptance = ",
            " draft tokens, new n_tokens =", "next token:", "stop processing:",
        )) or (in_batch and NATIVE_ROW.search(line))):
            lines.append(line)
        if "stop processing:" in line:
            in_request, in_batch = False, False
    return "\n".join(lines) + "\n"


def run(server, fixture, mode):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    args = [str(server), "--model", str(fixture), "--host", "127.0.0.1", "--port", str(port),
            *OPTIONS, "--spec-type", mode]
    if mode == "ngram-simple":
        args.extend(SPEC)
    responses, summary = {}, {}
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log,
                                   env=dict(os.environ, LLAMA_BATCH_DEBUG="1"))
        try:
            wait_ready(process, port)
            for name, (prompt, accepted) in CASES.items():
                body = {"prompt": prompt, "cache_prompt": False, "stream": True,
                        "return_tokens": True, "temperature": 0.0, "n_predict": 6,
                        "id_slot": 0, "seed": 7}
                with request(port, "/completion", body) as response:
                    events = [json.loads(line[6:]) for line in response
                              if line.startswith(b"data: ") and line[6:].strip() != b"[DONE]"]
                    responses[name] = {"request": body, "status": response.status, "events": events}
                final = events[-1]
                selected = [event["tokens"][0] for event in events[:-1] if not event["stop"]]
                timing = final["timings"]
                drafted = timing.get("draft_n", 0)
                kept = timing.get("draft_n_accepted", 0)
                expected_kept = accepted if mode == "ngram-simple" else 0
                assert final["stop"] and selected == list(range(7, 13)), (mode, name, selected)
                assert (drafted, kept) == (4 if expected_kept else 0, expected_kept)
                assert final["tokens_cached"] == len(prompt) + len(selected) - 1
                summary[name] = {"selected": selected, "drafted": drafted, "accepted": kept,
                                 "retained": final["tokens_cached"]}
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        log.seek(0)
        excerpt = log_excerpt(log.read().decode())
    return responses, summary, excerpt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    server = args.server.resolve()
    assert digest(server) == ENGINE_SHA, "Use the pinned macOS arm64 llama.cpp b12110 binary"
    raw, summaries, logs = {}, {}, []
    with tempfile.TemporaryDirectory(prefix="ngram-fixture-") as temp:
        fixture = Path(temp) / "fixture.gguf"
        make_fixture.build(fixture)
        assert digest(fixture) == MODEL_SHA
        for mode in ("none", "ngram-simple"):
            raw[mode], summaries[mode], excerpt = run(server, fixture, mode)
            logs.append(f"[{mode}]\n{excerpt}")
    output = args.output_dir
    output.mkdir()
    raw_files = ["native-responses.json", "native-stderr.log"]
    write_json(output / raw_files[0], raw)
    (output / raw_files[1]).write_text("\n".join(logs), encoding="utf-8")
    source = Path(__file__).parent
    write_json(output / "validation.json", {
        "schema": "native-ngram-speculation-v1", "status": "passed",
        "engine": {"version": "b12110", "commit": COMMIT, "sha256": ENGINE_SHA},
        "fixture_sha256": MODEL_SHA,
        "environment": {"system": platform.system(), "architecture": platform.machine(), "device": "CPU"},
        "lookup": {"suffix": 2, "draft": 4, "min_hits": 1},
        "source_sha256": {name: digest(source / name)
                          for name in ("README.md", "make_fixture.py", "ngram_lab.py")},
        "artifact_sha256": {name: digest(output / name) for name in raw_files},
        "modes": summaries,
    })


if __name__ == "__main__":
    main()
