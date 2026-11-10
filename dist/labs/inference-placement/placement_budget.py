"""Compute a per-rank KV budget and route one request from fixed snapshots."""
import json

GIB = 2**30
CARDS = 8
PARAMETERS = 70_000_000_000
LAYERS = 80
KV_HEADS = 8
HEAD_WIDTH = 128
BF16_BYTES = 2
RESERVE_GIB = 4
BLOCK_TOKENS = 16
PROMPT = 7168
OUTPUT_LIMIT = 1024
CACHED_PREFIX = 6144


def blocks_for(positions):
    return (positions + BLOCK_TOKENS - 1) // BLOCK_TOKENS


def placement(tp, card_gib):
    replicas = CARDS // tp
    weight_bytes = PARAMETERS * BF16_BYTES // tp
    heads = KV_HEADS // tp
    bytes_per_position = 2 * LAYERS * heads * HEAD_WIDTH * BF16_BYTES
    bytes_per_block = BLOCK_TOKENS * bytes_per_position
    kv_bytes = card_gib * GIB - RESERVE_GIB * GIB - weight_bytes
    blocks_per_rank = max(0, kv_bytes // bytes_per_block)
    request_blocks = blocks_for(PROMPT + OUTPUT_LIMIT - 1)
    slots = blocks_per_rank // request_blocks
    return {
        "tp": tp,
        "replicas": replicas,
        "weight_bytes_per_rank": weight_bytes,
        "kv_heads_per_rank": heads,
        "kv_bytes_per_position": bytes_per_position,
        "kv_bytes_per_block": bytes_per_block,
        "remaining_bytes_per_rank": kv_bytes,
        "weights_and_reserve_fit": kv_bytes >= 0,
        "kv_blocks_per_rank": blocks_per_rank,
        "cold_requests_per_replica": slots,
        "cold_requests_total": replicas * slots,
    }


def candidate(name, free_blocks, queued_prefill, prefix_positions):
    # free_blocks excludes the resident prefix. Only full matching blocks count.
    shared_blocks = prefix_positions // BLOCK_TOKENS
    new_blocks = blocks_for(PROMPT + OUTPUT_LIMIT - 1) - shared_blocks
    new_prefill = PROMPT - shared_blocks * BLOCK_TOKENS
    return {
        "replica": name,
        "free_blocks": free_blocks,
        "shared_blocks": shared_blocks,
        "new_blocks": new_blocks,
        "new_prefill_positions": new_prefill,
        "queued_prefill_positions": queued_prefill,
        "eligible": free_blocks >= new_blocks,
    }


def decision(free_a, free_b, queue_a=0, deadline_open=True):
    replicas = [
        candidate("A", free_a, queue_a, CACHED_PREFIX),
        candidate("B", free_b, 0, 0),
    ]
    eligible = [entry for entry in replicas if entry["eligible"]]
    chosen = None
    if eligible and deadline_open:
        chosen = min(eligible, key=lambda entry: (
            entry["queued_prefill_positions"] + entry["new_prefill_positions"],
            entry["replica"],
        ))["replica"]
    action = "route" if chosen else ("wait" if deadline_open else "reject")
    return {"replicas": replicas, "action": action, "selected": chosen}


def report():
    return {
        "fixture": {
            "cards": CARDS, "card_gib": 48, "parameters": PARAMETERS,
            "layers": LAYERS, "kv_heads": KV_HEADS, "head_width": HEAD_WIDTH,
            "weight_bytes_per_element": BF16_BYTES, "kv_bytes_per_element": BF16_BYTES,
            "reserve_gib_per_rank": RESERVE_GIB, "block_tokens": BLOCK_TOKENS,
            "prompt_positions": PROMPT, "max_output_tokens": OUTPUT_LIMIT,
            "reserved_positions": PROMPT + OUTPUT_LIMIT - 1,
            "cold_request_blocks": blocks_for(PROMPT + OUTPUT_LIMIT - 1),
            "prefix_positions_on_a": CACHED_PREFIX,
        },
        "placements": {"tp8": placement(8, 48), "tp4_x2": placement(4, 48)},
        "smaller_card_control": placement(4, 32),
        "routing": {
            "cold_only": decision(96, 640),
            "warm_only": decision(160, 480),
            "neither_fits": decision(100, 500),
            "deadline_exceeded": decision(100, 500, deadline_open=False),
            "prefer_warm": decision(160, 640),
            "warm_queue_longer": decision(160, 640, queue_a=8192),
        },
    }


if __name__ == "__main__":
    print(json.dumps(report(), indent=2))
