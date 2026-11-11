"""Use the pinned vLLM scheduler to compare cache reuse at the same token input."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import sys
from types import SimpleNamespace

import msgspec

ROOT = Path(__file__).resolve().parent
PROMPT = tuple(range(1, 9))
PREFIX_SEED = "0"
FIXTURE_SALTS = {"A": "demo-A", "B": "demo-B"}
SCHEDULER_PACK = {
    "scheduler_lab.py": "9cc9e16c9a27a49f57d8c4324e7c45e1c04cf206ee2f4cb1a874e6a30cca5232",
    "upstream.py": "23e59417b1af2fb871826f9cf14ad4773eaa30bde8d5310d79ae79ee746e811b",
    "source-manifest.json": "b481dadd67779b7435817c2b519f9d0ae877811f851782d5a04a753f75696c2a",
    "requirements.txt": "e55a96a133b05411e0882e8d607bc4191dd8f5250b992e1a12f97a2bf123e27a",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_dependency(scheduler_dir):
    path = scheduler_dir.resolve()
    for name, expected in SCHEDULER_PACK.items():
        if digest(path / name) != expected:
            raise ValueError(f"scheduler pack does not match the pinned dependency: {name}")

    # The previous lab imports its loader by the local module name "upstream".
    sys.path.insert(0, str(path))
    try:
        from upstream import COMMIT, load_pinned
        from scheduler_lab import BLOCK_SIZE, new_scheduler
    finally:
        sys.path.pop(0)
    return COMMIT, BLOCK_SIZE, load_pinned, new_scheduler


def request(upstream, request_id, salt, block_hasher):
    sampling = SimpleNamespace(
        max_tokens=1, guided_decoding=None, extra_args=None, logprobs=None,
        prompt_logprobs=None, ignore_eos=False, stop_token_ids=[],
    )
    envelope = upstream.EngineCoreRequest(
        request_id=request_id, prompt_token_ids=list(PROMPT), sampling_params=sampling,
        mm_features=None, pooling_params=None, eos_token_id=None, arrival_time=0.0,
        lora_request=None, cache_salt=salt, data_parallel_rank=None,
    )
    return upstream.Request.from_engine_core_request(envelope, block_hasher)


def available_prefix(pool, item):
    ids = []
    for key in item.block_hashes:
        hit = pool.get_cached_block(key, [0])
        ids.append(None if hit is None else hit[0].block_id)
    return ids


def process(upstream, scheduler, item, block_size):
    manager = scheduler.kv_cache_manager
    scheduler.add_request(item)
    rounds = []
    for _ in range(len(PROMPT) // block_size):
        schedule = scheduler.schedule()
        count = schedule.num_scheduled_tokens[item.request_id]
        end = item.num_computed_tokens
        positions = list(range(end - count, end))
        blocks = manager.get_blocks(item.request_id).get_block_ids()[0]
        cached_tokens = item.num_cached_tokens
        # The reply is a fixture. The experiment measures work assignment.
        samples = [90] if end == len(PROMPT) else []
        reply = upstream.ModelRunnerOutput(
            req_ids=[item.request_id], req_id_to_index={item.request_id: 0},
            sampled_token_ids=[samples], logprobs=None,
            prompt_logprobs_dict={}, pooler_output=[],
        )
        outputs = scheduler.update_from_output(schedule, reply)
        rounds.append({
            "positions": positions, "blocks": blocks, "cached_tokens": cached_tokens,
            "fixture_reply": samples,
            "outputs": [
                {"request": row.request_id, "tokens": row.new_token_ids,
                 "cached_tokens": row.num_cached_tokens, "finish": str(row.finish_reason)}
                for group in outputs.values() for row in group.outputs
            ],
            "free_after_reply": manager.block_pool.get_num_free_blocks(),
        })
        if item.request_id not in scheduler.requests:
            return rounds
    raise AssertionError("fixture did not finish within two scheduling rounds")


def run(upstream, block_size, new_scheduler):
    if os.environ.get("PYTHONHASHSEED") != PREFIX_SEED or msgspec.__version__ != "0.19.0":
        raise ValueError("use PYTHONHASHSEED=0 and the scheduler pack's pinned msgspec version")
    upstream.init_none_hash(upstream.sha256)
    block_hasher = upstream.get_request_block_hasher(block_size, upstream.sha256)
    cases = []
    for label, subject, forward_client_salt in (
        ("same_scope", "A", False),
        ("different_scope", "B", False),
        ("unsafe_passthrough", "B", True),
    ):
        presented = FIXTURE_SALTS["A"]
        effective = presented if forward_client_salt else FIXTURE_SALTS[subject]
        scheduler = new_scheduler(upstream)
        try:
            prime = request(upstream, "prime", FIXTURE_SALTS["A"], block_hasher)
            prime_rounds = process(upstream, scheduler, prime, block_size)
            follow = request(upstream, "follow", effective, block_hasher)
            pool = scheduler.kv_cache_manager.block_pool
            before = available_prefix(pool, follow)
            follow_rounds = process(upstream, scheduler, follow, block_size)
            cases.append({
                "case": label, "fixture_subject": subject,
                "client_supplied_salt": presented, "engine_cache_salt": follow.cache_salt,
                "policy": "unsafe_passthrough" if forward_client_salt else "trusted_scope",
                "prime_hashes": [key.hex() for key in prime.block_hashes],
                "follow_hashes": [key.hex() for key in follow.block_hashes],
                "key_matches": [a == b for a, b in zip(prime.block_hashes, follow.block_hashes)],
                "matching_blocks_before_schedule": before,
                "prime_rounds": prime_rounds, "follow_rounds": follow_rounds,
            })
        finally:
            scheduler.shutdown()
    return {"prompt": list(PROMPT), "block_size": block_size, "prefix_seed": PREFIX_SEED, "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scheduler-dir", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    commit, block_size, load_pinned, new_scheduler = load_dependency(args.scheduler_dir)
    upstream, loaded = load_pinned(args.source_dir)
    result = run(upstream, block_size, new_scheduler)
    record = {
        "scope": "pinned vLLM V1 scheduler and KV metadata on local CPU",
        "upstream_commit": commit, "engine_version": "v0.10.2",
        "scheduler_execution": True, "actual_model_runner": False,
        "production_authentication": False, "device_kv_tensors": False,
        "system": platform.system(), "machine": platform.machine(),
        "python": platform.python_version(), "msgspec": msgspec.__version__,
        "source_sha256": {name: digest(ROOT / name) for name in ("cache_scope.py", "README.md")},
        "scheduler_dependency_sha256": SCHEDULER_PACK,
        "upstream_files": len(loaded),
        "result": result,
    }
    text = json.dumps(record, indent=2) + "\n"
    if args.output:
        args.output.write_text(text)
    print(text, end="")


if __name__ == "__main__":
    main()
