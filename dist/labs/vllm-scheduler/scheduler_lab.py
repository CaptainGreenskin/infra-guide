"""Run upstream vLLM Scheduler, Request hashing and cache allocation on CPU metadata."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
from types import SimpleNamespace as Config

import msgspec

from upstream import COMMIT, ROOT, load_pinned

BLOCK_SIZE = 4
BLOCKS = 4
TOKEN_BUDGET = 4
MAX_SEQUENCES = 2
MAX_MODEL_LEN = 12
SEED = "0"
PROMPT = [1, 2, 3, 4, 5, 6, 7, 8]


class TextOnly:
    def supports_multimodal_inputs(self, model_config):
        if model_config.is_encoder_decoder:
            raise ValueError("the lab accepts decoder-only text")
        return False


class NoStructuredOutput:
    def should_advance(self, request):
        if request.use_structured_output:
            raise ValueError("structured output is outside the fixture")
        return False


def new_scheduler(upstream):
    settings = Config(
        scheduler_config=Config(
            max_num_seqs=MAX_SEQUENCES, max_num_batched_tokens=TOKEN_BUDGET,
            max_model_len=MAX_MODEL_LEN,
            policy="fcfs", long_prefill_token_threshold=0, chunked_prefill_enabled=True,
        ),
        cache_config=Config(num_gpu_blocks=BLOCKS, block_size=BLOCK_SIZE, enable_prefix_caching=True),
        parallel_config=Config(data_parallel_rank=0, decode_context_parallel_size=1, pipeline_parallel_size=1),
        model_config=Config(is_encoder_decoder=False),
        kv_transfer_config=None, kv_events_config=None, speculative_config=None, lora_config=None,
    )
    cache = upstream.KVCacheConfig(
        num_blocks=BLOCKS,
        kv_cache_tensors=[],
        kv_cache_groups=[upstream.KVCacheGroupSpec(
            layer_names=["one_layer"],
            kv_cache_spec=upstream.FullAttentionSpec(
                block_size=BLOCK_SIZE, num_kv_heads=1, head_size=1, dtype=None, use_mla=False,
            ),
        )],
    )
    return upstream.Scheduler(settings, cache, NoStructuredOutput(), mm_registry=TextOnly())


def make_request(upstream, request_id, prompt, limit):
    sampling = Config(
        max_tokens=limit, guided_decoding=None, extra_args=None, logprobs=None,
        prompt_logprobs=None, ignore_eos=False, stop_token_ids=[],
    )
    envelope = upstream.EngineCoreRequest(
        request_id=request_id, prompt_token_ids=prompt, sampling_params=sampling,
        mm_features=None, pooling_params=None, eos_token_id=None, arrival_time=0.0,
        lora_request=None, cache_salt=None, data_parallel_rank=None,
    )
    return upstream.Request.from_engine_core_request(
        envelope, upstream.get_request_block_hasher(BLOCK_SIZE, upstream.sha256),
    )


def run(upstream):
    if os.environ.get("PYTHONHASHSEED") != SEED:
        raise ValueError("run with PYTHONHASHSEED=0 for stable request hash bytes")
    upstream.init_none_hash(upstream.sha256)
    scheduler = new_scheduler(upstream)
    manager = scheduler.kv_cache_manager
    pool = manager.block_pool
    a = make_request(upstream, "A", PROMPT, 1)
    b = make_request(upstream, "B", PROMPT.copy(), 2)
    c = make_request(upstream, "C", [9, 2, 3, 4], 1)
    requests = [a, b, c]

    def state():
        return {
            "waiting": [r.request_id for r in scheduler.waiting],
            "running": [r.request_id for r in scheduler.running],
            "request_ids": sorted(scheduler.requests),
            "free": [block.block_id for block in pool.free_block_queue.get_all_free_blocks()],
            "refcounts": [block.ref_cnt for block in pool.blocks],
            "blocks": {rid: manager.get_blocks(rid).get_block_ids()[0]
                       for rid in sorted(scheduler.requests)},
            "cached_prefix_blocks": {
                r.request_id: [None if (hit := pool.get_cached_block(key, [0])) is None
                               else hit[0].block_id for key in r.block_hashes]
                for r in requests
            },
        }

    def capture_outputs(schedule, tokens_by_request):
        ids = list(schedule.num_scheduled_tokens)
        if set(tokens_by_request) != set(ids):
            raise AssertionError("output fixture must name each scheduled request exactly once")
        replies = upstream.ModelRunnerOutput(
            req_ids=ids, req_id_to_index={req_id: index for index, req_id in enumerate(ids)},
            sampled_token_ids=[tokens_by_request[req_id] for req_id in ids],
            logprobs=None, prompt_logprobs_dict={}, pooler_output=[],
        )
        actual = scheduler.update_from_output(schedule, replies)
        return {
            "model_runner_ids": replies.req_ids,
            "sampled_token_ids": replies.sampled_token_ids,
            "engine_outputs": [
                {"request": entry.request_id, "tokens": entry.new_token_ids,
                 "cached_tokens": entry.num_cached_tokens,
                 "finish": None if entry.finish_reason is None else str(entry.finish_reason)}
                for group in actual.values() for entry in group.outputs
            ],
        }

    def run_round(label, tokens_by_request):
        before = state()
        schedule = scheduler.schedule()
        starts = {request.req_id: request.num_computed_tokens for request in schedule.scheduled_new_reqs}
        cached = schedule.scheduled_cached_reqs
        starts.update(zip(cached.req_ids, cached.num_computed_tokens))
        computed = {rid: scheduler.requests[rid].num_computed_tokens for rid in starts}
        scheduled = {
            "positions": {rid: list(range(starts[rid], computed[rid])) for rid in starts},
            "counts": schedule.num_scheduled_tokens,
            "new": [request.req_id for request in schedule.scheduled_new_reqs],
            "continued": cached.req_ids,
            "computed_after_schedule": computed,
            "finished_notices": sorted(schedule.finished_req_ids),
            "unused_positions": TOKEN_BUDGET - schedule.total_num_scheduled_tokens,
        }
        assert all(len(scheduled["positions"][rid]) == count for rid, count in scheduled["counts"].items())
        after_schedule = state()
        reply = capture_outputs(schedule, tokens_by_request)
        after_reply = state()
        return dict(round=label, before=before, scheduled=scheduled,
                    after_schedule=after_schedule, reply=reply, after_reply=after_reply), schedule

    scheduler.add_request(a)
    first, _ = run_round("cold_first_half", {"A": []})
    second, _ = run_round("cold_finish", {"A": [90]})
    scheduler.add_request(b)
    third, _ = run_round("warm_first_output", {"B": [90]})
    scheduler.add_request(c)
    fourth, completed = run_round("cache_pressure", {"B": [91]})
    before_late_reply = state()
    late_reply = capture_outputs(completed, {"B": [92]})
    after_late_reply = state()
    fifth, _ = run_round("admit_after_free", {"C": [99]})
    empty, _ = run_round("final_notice", {})
    scheduler.shutdown()

    assert third["scheduled"]["positions"] == {"B": [4, 5, 6, 7]}
    assert fourth["scheduled"]["positions"] == {"B": [8]}
    assert fourth["scheduled"]["unused_positions"] == 3
    assert fourth["after_schedule"]["waiting"] == ["C"] and fourth["after_schedule"]["free"] == []
    assert before_late_reply == after_late_reply and late_reply["engine_outputs"] == []
    assert fifth["scheduled"]["positions"] == {"C": [0, 1, 2, 3]}
    assert empty["after_reply"]["request_ids"] == []
    return {
        "block_size": BLOCK_SIZE, "blocks_including_null": BLOCKS, "usable_blocks": BLOCKS - 1,
        "token_budget": TOKEN_BUDGET, "prefix_seed": SEED, "null_block_id": pool.null_block.block_id,
        "settings": {"policy": "fcfs", "max_num_seqs": MAX_SEQUENCES, "max_model_len": MAX_MODEL_LEN,
                     "prefix_caching": True, "chunked_prefill": True, "kv_groups": 1},
        "requests": {r.request_id: {"prompt": r.prompt_token_ids, "max_output": r.max_tokens,
                                   "prefix_hashes": [h.hex() for h in r.block_hashes]}
                     for r in requests},
        "rounds": [first, second, third, fourth, fifth, empty],
        "late_reply": {"before": before_late_reply, "reply": late_reply, "after": after_late_reply},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    upstream, loaded = load_pinned(args.source_dir)
    result = run(upstream)
    files = ("scheduler_lab.py", "upstream.py", "source-manifest.json", "requirements.txt", "README.md")
    record = {
        "scope": "vLLM V1 upstream scheduler and KV metadata execution on local CPU",
        "engine_version": "v0.10.2", "upstream_commit": COMMIT,
        "scheduler_execution": True, "actual_model_runner": False, "device_kv_tensors": False,
        "python": platform.python_version(), "msgspec": msgspec.__version__,
        "system": platform.system(), "machine": platform.machine(),
        "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in files},
        "loaded": loaded, "result": result,
    }
    rendered = json.dumps(record, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered)
    print(rendered, end="")


if __name__ == "__main__":
    main()
