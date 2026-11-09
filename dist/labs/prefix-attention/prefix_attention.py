"""Four positions through PyTorch's CPU SDPA math backend."""
from hashlib import sha256
import json
from pathlib import Path

import torch
from torch.nn.attention import SDPBackend, sdpa_kernel
from torch.nn.functional import scaled_dot_product_attention


def visible_mask(query_positions, key_positions, prefix_length):
    query = torch.tensor(query_positions)[:, None]
    key = torch.tensor(key_positions)[None, :]
    return (key <= query) | ((query < prefix_length) & (key < prefix_length))


def read_values(values, mask):
    query_count, key_count = mask.shape
    query = torch.zeros((1, 1, query_count, 1), dtype=torch.float64)
    key = torch.zeros((1, 1, key_count, 1), dtype=torch.float64)
    value = torch.tensor(values, dtype=torch.float64).view(1, 1, key_count, 1)
    with sdpa_kernel(SDPBackend.MATH):
        result = scaled_dot_product_attention(
            query, key, value, attn_mask=mask, dropout_p=0.0, is_causal=False
        )
    return result.reshape(-1)


def main():
    torch.set_num_threads(1)
    positions = list(range(4))
    values = [2, 6, 10, 14]
    changed_prefix = [2, 14, 10, 14]
    changed_suffix = [2, 6, 10, 30]
    causal = visible_mask(positions, positions, 0)
    prefix = visible_mask(positions, positions, 2)
    shifted = torch.ones((4, 4), dtype=torch.bool).tril(diagonal=1)

    normal = read_values(values, causal)
    prompt = read_values(values, prefix)
    causal_new_prefix = read_values(changed_prefix, causal)
    prefix_new_prefix = read_values(changed_prefix, prefix)
    prefix_new_suffix = read_values(changed_suffix, prefix)
    shifted_normal = read_values(values, shifted)
    shifted_new_suffix = read_values(changed_suffix, shifted)

    prefill = read_values(values[:2], visible_mask([0, 1], [0, 1], 2))
    decode2 = read_values(values[:3], visible_mask([2], [0, 1, 2], 2))
    decode3 = read_values(values, visible_mask([3], positions, 2))
    partial_prefix = read_values(values[:1], visible_mask([0], [0], 2))
    split = torch.cat([prefill, decode2, decode3])
    assert torch.allclose(split, prompt, atol=1e-12, rtol=0)
    assert normal[0] == causal_new_prefix[0] == 2
    assert prompt[0] == 4 and prefix_new_prefix[0] == 8
    assert torch.allclose(prompt[:3], prefix_new_suffix[:3], atol=1e-12, rtol=0)
    assert shifted_normal[2] == 8 and shifted_new_suffix[2] == 12
    assert partial_prefix[0] == 2 and prefill[0] == 4

    print(json.dumps({
        "status": "passed",
        "source_sha256": {Path(__file__).name: sha256(Path(__file__).read_bytes()).hexdigest()},
        "environment": {
            "torch": str(torch.__version__), "device": "cpu",
            "dtype": "float64", "backend": "SDPBackend.MATH"
        },
        "values": {
            "base": values, "changed_prefix_position_1": changed_prefix,
            "changed_suffix_position_3": changed_suffix,
        },
        "allowed": {"causal": causal.tolist(), "prefix": prefix.tolist(), "shifted": shifted.tolist()},
        "output": {
            "causal": normal.tolist(), "prefix": prompt.tolist(),
            "causal_after_prefix_change": causal_new_prefix.tolist(),
            "prefix_after_prefix_change": prefix_new_prefix.tolist(),
            "prefix_after_suffix_change": prefix_new_suffix.tolist(),
            "shifted": shifted_normal.tolist(),
            "shifted_after_suffix_change": shifted_new_suffix.tolist(),
        },
        "stages": {
            "prefill": prefill.tolist(), "decode_position_2": decode2.tolist(),
            "decode_position_3": decode3.tolist(), "early_prefix_row_0": partial_prefix.tolist(),
            "split_vs_full_max_abs_error": (split - prompt).abs().max().item(),
        },
    }, indent=2))


if __name__ == "__main__":
    main()
