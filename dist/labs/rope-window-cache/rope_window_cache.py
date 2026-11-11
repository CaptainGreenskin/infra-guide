"""Compare logical positions and circular KV storage using CPU SDPA."""

import hashlib
import json
import platform
from pathlib import Path

import torch
from torch.nn import functional as F
from torch.nn.attention import SDPBackend, sdpa_kernel


WINDOW = 4
CHUNKS = [3, 2, 1, 3]
FREQUENCIES = [0.8, 0.3]
HEADS = 2
WIDTH = 4
DTYPE = torch.float64
TOLERANCE = 1e-12


def tensor(multiplier):
    shape = (HEADS, sum(CHUNKS), WIDTH)
    values = torch.arange(HEADS * sum(CHUNKS) * WIDTH).reshape(shape)
    return (((values + 1) * multiplier) % 29 - 14).to(DTYPE) / 8


def rotate(tensor, positions):
    angles = torch.tensor(positions, dtype=DTYPE)[:, None] * torch.tensor(
        FREQUENCIES, dtype=DTYPE
    )
    even, odd = tensor[..., 0::2], tensor[..., 1::2]
    return torch.stack(
        (even * angles.cos() - odd * angles.sin(),
         even * angles.sin() + odd * angles.cos()),
        dim=-1,
    ).flatten(-2)


def attention(query, key, value, query_positions, key_positions):
    distance = torch.tensor(query_positions)[:, None] - torch.tensor(key_positions)
    visible = (distance >= 0) & (distance < WINDOW)
    output = F.scaled_dot_product_attention(
        query[None], key[None], value[None], attn_mask=visible, dropout_p=0.0
    )[0]
    return output, visible


def cached(q, k, v, reference, multiplier=1, offset=0,
           use_slot_phase=False, write_first=False):
    key_slots = torch.empty((HEADS, WINDOW, WIDTH), dtype=DTYPE)
    value_slots = torch.empty_like(key_slots)
    slot_positions = [None] * WINDOW
    trace, outputs = [], []
    start = 0

    def slot(position):
        return (multiplier * position + offset) % WINDOW

    for count in CHUNKS:
        end = start + count
        positions = list(range(start, end))
        before = slot_positions.copy()
        phases = [slot(position) for position in positions] if use_slot_phase else positions
        query = rotate(q[:, start:end], phases)
        new_key = rotate(k[:, start:end], phases)
        new_value = v[:, start:end]

        def commit():
            for index, position in enumerate(positions):
                destination = slot(position)
                key_slots[:, destination] = new_key[:, index]
                value_slots[:, destination] = new_value[:, index]
                slot_positions[destination] = position

        if write_first:
            commit()
        occupied = [i for i, position in enumerate(slot_positions) if position is not None]
        key_positions = [slot_positions[i] for i in occupied]
        key, value = key_slots[:, occupied], value_slots[:, occupied]
        if not write_first:
            key = torch.cat((key, new_key), dim=1)
            value = torch.cat((value, new_value), dim=1)
            key_positions += positions
        output, visible = attention(query, key, value, positions, key_positions)
        outputs.append(output)
        if not write_first:
            commit()
        trace.append({
            "queries": positions,
            "phase_positions": phases,
            "slots_before": before,
            "candidate_keys": key_positions,
            "visible_keys": [[key_position for key_position, allowed in zip(key_positions, row) if allowed]
                             for row in visible.tolist()],
            "slots_after": slot_positions.copy(),
        })
        start = end

    output = torch.cat(outputs, dim=1)
    error = (output - reference).abs().amax(dim=(0, 2)).tolist()
    return {
        "steps": trace,
        "output": output.tolist(),
        "max_abs_error": max(error),
        "first_different_query": next((i for i, n in enumerate(error) if n > TOLERANCE), None),
    }


def main():
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("The recorded run uses PyTorch 2.5.1")
    torch.set_num_threads(1)
    q, k, v = (tensor(multiplier) for multiplier in (7, 11, 13))
    positions = list(range(sum(CHUNKS)))
    with torch.inference_mode(), sdpa_kernel(backends=[SDPBackend.MATH]):
        with torch.profiler.profile(activities=[torch.profiler.ProfilerActivity.CPU]) as profile:
            reference, _ = attention(rotate(q, positions), rotate(k, positions), v, positions, positions)
        runs = {
            "logical": cached(q, k, v, reference),
            "remapped": cached(q, k, v, reference, multiplier=3, offset=1),
            "slot_phase": cached(q, k, v, reference, use_slot_phase=True),
            "write_first": cached(q, k, v, reference, write_first=True),
        }
    assert all(runs[mode]["max_abs_error"] <= TOLERANCE for mode in ("logical", "remapped"))
    assert runs["slot_phase"]["first_different_query"] == 4
    assert runs["write_first"]["first_different_query"] == 3
    events = sorted(event.key for event in profile.key_averages() if "scaled_dot_product" in event.key)
    assert "aten::_scaled_dot_product_attention_math" in events
    source = Path(__file__).parent
    print(json.dumps({
        "schema": "rope-window-cache-v1",
        "status": "passed",
        "environment": {"torch": str(torch.__version__), "device": str(q.device),
                        "dtype": "float64", "system": platform.system(), "architecture": platform.machine(),
                        "profile_events": events},
        "source_sha256": {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                          for name in ("rope_window_cache.py", "requirements.txt", "README.md")},
        "fixture": {"window": WINDOW, "chunks": CHUNKS, "frequencies": FREQUENCIES,
                    "q": q.tolist(), "k": k.tolist(), "v": v.tolist()},
        "reference": reference.tolist(),
        "runs": runs,
    }, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
