"""Move a llama.cpp prompt-cache file between two separate CPU server runs."""

import argparse
from contextlib import contextmanager
import hashlib
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import tempfile
import time

from make_fixture import build


ENGINE_COMMIT = "cd959bae99ff4bed22bef2604f45241c09bbb8c8"
ENGINE_FILES = {
    "llama-server": "e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959",
    "libllama-server-impl.dylib": "f85a52e783abfe603b5d8631ef697e43e383e0d76fd1bb07a8b88461685e5c7b",
    "libllama-common.0.dylib": "7ac3cb04d2f8f1a13faea1221e76aa805739012c0499496f08786c5352868a38",
    "libmtmd.0.dylib": "42b9be2dc7c1f4e2842faa912dfc2358f87a8828355b17736650ca5998a898cb",
    "libllama.0.dylib": "00413f74e567abb23896e1dbf46e156c3029e7e38d76e43f0e29846066853143",
    "libggml.0.dylib": "f2b3b1a494448bb17a7bfe6111873326ba2872bdbc52a95c6f1140c6868261b8",
    "libggml-cpu.0.dylib": "a81c23818a48fb10e306d082428ef5aac4b34077b3143a232b7c39641bb93abd",
    "libggml-blas.0.dylib": "786754ac19bff80ad4ca76d44d3031f32593772f38d9da819b428dc702f63339",
    "libggml-metal.0.dylib": "2b04ec59315ed3bd196ef119e20c2173c094b3cf206d8d0d4ca5b5caf685f8d9",
    "libggml-rpc.0.dylib": "5e8345f15c9d156d84b35ab0bace85cbbdbc929ae3cb0fcb4a00874b00382d5c",
    "libggml-base.0.dylib": "8ceab2debfd7f8289b384c2730d7905f462606f448346ea3d5dc6efef9cff711",
}
FIXTURE_SHA256 = "d0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66"
PROMPT = [1, 4, 5, 6]


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def request(port, path, body=None):
    conn = HTTPConnection("127.0.0.1", port, timeout=8)
    try:
        conn.request("GET" if body is None else "POST", path,
                     None if body is None else json.dumps(body), {"Content-Type": "application/json"})
        with conn.getresponse() as response:
            return {"status": response.status, "body": json.loads(response.read())}
    finally:
        conn.close()


@contextmanager
def engine_run(executable, model, folder, lifecycle):
    folder.mkdir()
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    env = {name: value for name, value in os.environ.items()
           if not name.startswith(("LLAMA_", "GGML_", "DYLD_"))}
    env["LLAMA_BATCH_DEBUG"] = "1"
    args = [str(executable), "--model", str(model), "--host", "127.0.0.1", "--port", str(port),
            "--device", "none", "--n-gpu-layers", "0", "--threads", "1", "--threads-batch", "1",
            "--parallel", "1", "--ctx-size", "128", "--batch-size", "32", "--ubatch-size", "32",
            "--no-context-shift", "--no-warmup", "--cache-ram", "0", "--cache-reuse", "0",
            "--verbose", "--no-ui", "--fit", "off", "--alias", "native-slot-fixture",
            "--slot-save-path", str(folder) + "/"]
    with (folder / "engine.log").open("wb") as log:
        process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log, env=env)
        try:
            deadline = time.monotonic() + 40
            while True:
                require(process.poll() is None, f"{folder.name} exited during startup")
                try:
                    health = request(port, "/health")
                    if health["status"] == 200 and health["body"]["status"] == "ok":
                        break
                except OSError:
                    pass
                require(time.monotonic() < deadline, f"{folder.name} startup timeout")
                time.sleep(0.05)
            lifecycle.append({"event": folder.name + "_ready", "pid": process.pid})
            yield port
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            lifecycle.append({"event": folder.name + "_exited", "pid": process.pid,
                              "returncode": process.returncode})


def completion(port, prompt, length):
    body = {"prompt": prompt, "id_slot": 0, "cache_prompt": True, "n_predict": length,
            "ignore_eos": True, "temperature": 0, "seed": 7, "return_tokens": True}
    return {"request": body, "response": request(port, "/completion", body)}


def slot_action(port, action, filename):
    return request(port, "/slots/0?action=" + action, {"filename": filename})


def log_excerpt(folder):
    markers = ("assigned to device CPU", "CPU KV buffer size", "CPU compute buffer size",
               "new prompt,", "cached n_tokens =", "next token:", "stop processing:",
               "input batch info:", "ubatch_print:", "clearing prompt with",
               "llama_state_seq_load_file", "error loading sequence state")
    return [{"line": line, "text": text}
            for line, text in enumerate((folder / "engine.log").read_text().splitlines(), 1)
            if any(marker in text for marker in markers)]


def collect(executable, workspace):
    model = workspace / "fixture.gguf"
    build(model)
    require(sha(model.read_bytes()) == FIXTURE_SHA256, "fixture differs from the pinned model")
    source_dir = workspace / "source"
    destination_dir = workspace / "destination"
    lifecycle, source, destination = [], {}, {}
    with engine_run(executable, model, source_dir, lifecycle) as port:
        source["initial"] = request(port, "/slots")
        source["completion"] = completion(port, PROMPT, 1)
        source["before_save"] = request(port, "/slots")
        source["save"] = slot_action(port, "save", "prefix.bin")
    state = (source_dir / "prefix.bin").read_bytes()
    first = source["completion"]["response"]["body"]["tokens"]
    require(first == [7], "unexpected source continuation")
    continuation = PROMPT + first
    with engine_run(executable, model, destination_dir, lifecycle) as port:
        destination["initial"] = request(port, "/slots")
        copied = destination_dir / "prefix.bin"
        copied.write_bytes(state)
        truncated = state[:12]
        (destination_dir / "truncated.bin").write_bytes(truncated)
        artifact = {"source_bytes": len(state), "source_sha256": sha(state),
                    "destination_bytes": copied.stat().st_size, "destination_sha256": sha(copied.read_bytes()),
                    "truncated_bytes": len(truncated), "truncated_sha256": sha(truncated)}
        lifecycle.append({"event": "artifact_copied"})
        require(artifact["source_sha256"] == artifact["destination_sha256"], "copy differs")
        destination["restore"] = slot_action(port, "restore", "prefix.bin")
        destination["after_restore"] = request(port, "/slots")
        destination["warm"] = completion(port, continuation, 2)
        destination["before_bad_restore"] = request(port, "/slots")
        destination["bad_restore"] = slot_action(port, "restore", "truncated.bin")
        destination["after_bad_restore"] = request(port, "/slots")
        destination["cold"] = completion(port, continuation, 2)
        destination["after_cold"] = request(port, "/slots")
    source["logs"] = log_excerpt(source_dir)
    destination["logs"] = log_excerpt(destination_dir)
    require(lifecycle[0]["pid"] != lifecycle[2]["pid"], "expected two different server processes")
    require(source["save"]["body"]["n_saved"] == destination["restore"]["body"]["n_restored"] == 4,
            "four positions must survive the handoff")
    require(source["save"]["body"]["n_written"] == destination["restore"]["body"]["n_read"] == len(state),
            "engine byte counts differ from the file")
    for name, expected in (("warm", (4, 1)), ("cold", (0, 5))):
        response = destination[name]["response"]["body"]
        require(response["tokens"] == [8, 9], f"{name} differs from the expected continuation")
        require((response["timings"]["cache_n"], response["timings"]["prompt_n"]) == expected,
                f"{name} reused an unexpected number of positions")
    require(destination["bad_restore"]["status"] == 400, "malformed file should be refused")
    require(destination["after_bad_restore"]["body"][0]["n_prompt_tokens"] == 0,
            "failed restore should clear this slot in the pinned engine")
    return {"lifecycle": lifecycle, "artifact": artifact, "source": source, "destination": destination}, state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path, help="new output directory")
    args = parser.parse_args()
    executable = args.engine.resolve()
    require(platform.system() == "Darwin" and platform.machine() == "arm64", "requires macOS ARM64")
    identities = {name: sha((executable.parent / name).read_bytes()) for name in ENGINE_FILES}
    require(executable.name == "llama-server" and identities == ENGINE_FILES, "expected official b12110 bundle")
    with tempfile.TemporaryDirectory(prefix="infra-native-slot-") as scratch:
        run, state = collect(executable, Path(scratch))
    here = Path(__file__).resolve().parent
    report = {
        "backend": "CPU",
        "platform": {"macos": platform.mac_ver()[0], "arch": platform.machine(), "python": platform.python_version()},
        "engine_commit": ENGINE_COMMIT,
        "engine_file_sha256": identities,
        "fixture_sha256": FIXTURE_SHA256,
        "source_sha256": {name: sha((here / name).read_bytes()) for name in ("slot_handoff.py", "make_fixture.py")},
        "run": run,
    }
    args.output.mkdir()
    (args.output / "prefix.bin").write_bytes(state)
    (args.output / "validation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
