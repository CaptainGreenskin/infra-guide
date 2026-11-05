"""Actual PyTorch CPU trace for the chapter's three-position attention example."""
import json
import math
import torch
from torch.nn import functional as F


def reference(q, k, v, allowed):
    if not bool(allowed.any(dim=-1).all()):
        raise ValueError('this reference requires at least one allowed key per query')
    scores = q @ k.T / math.sqrt(q.shape[-1])
    weights = scores.masked_fill(~allowed, -torch.inf).softmax(dim=-1)
    return scores, weights, weights @ v


def main():
    torch.set_num_threads(1)
    q = torch.tensor([[0., 0.], [math.sqrt(2), 0.], [0., math.sqrt(2)]], dtype=torch.float64)
    k = torch.tensor([[0., 0.], [math.log(3), 0.], [0., math.log(2)]], dtype=torch.float64)
    v = torch.tensor([[2., 0.], [0., 4.], [6., 2.]], dtype=torch.float64)
    causal = torch.ones(3, 3, dtype=torch.bool).tril()
    scores, weights, out = reference(q, k, v, causal)
    expected_weights = torch.tensor([[1, 0, 0], [.25, .75, 0], [.25, .25, .5]], dtype=q.dtype)
    expected_out = torch.tensor([[2, 0], [.5, 3], [3.5, 2]], dtype=q.dtype)
    torch.testing.assert_close(weights, expected_weights, atol=1e-12, rtol=1e-12)
    torch.testing.assert_close(out, expected_out, atol=1e-12, rtol=1e-12)
    actual = F.scaled_dot_product_attention(q, k, v, attn_mask=causal, dropout_p=0.0)
    torch.testing.assert_close(actual, expected_out, atol=1e-12, rtol=1e-12)
    changed = v.clone(); changed[2, 0] = 60
    changed_out = reference(q, k, changed, causal)[2]
    torch.testing.assert_close(changed_out[:2], out[:2])
    assert abs(changed_out[2, 0].item() - 30.5) < 1e-12
    # Multiplication by zero leaves forbidden positions in the softmax denominator.
    zero_mask_out = (scores * causal).softmax(-1) @ v
    torch.testing.assert_close(zero_mask_out[1], torch.tensor([1.6, 2.8], dtype=q.dtype))
    valid_keys = torch.tensor([True, False, True])
    padded = reference(q, k, v, causal & valid_keys[None, :])[2]
    torch.testing.assert_close(padded[2], torch.tensor([14/3, 4/3], dtype=q.dtype))
    # A new query at absolute position 2 may read all three stored keys.
    cached = F.scaled_dot_product_attention(q[2:], k, v, dropout_p=0.0)
    wrong_offset = F.scaled_dot_product_attention(q[2:], k, v, is_causal=True, dropout_p=0.0)
    torch.testing.assert_close(cached[0], out[2])
    torch.testing.assert_close(wrong_offset[0], v[0])
    explicit = torch.arange(3)[None, :] <= torch.tensor([1, 2])[:, None]
    chunked = F.scaled_dot_product_attention(q[1:], k, v, attn_mask=explicit, dropout_p=0.0)
    torch.testing.assert_close(chunked, out[1:])
    # The main fixture's scores are symmetric; a separate asymmetric fixture is essential.
    asymmetric_k = k.clone(); asymmetric_k[0] = torch.tensor([.7, -.2], dtype=q.dtype)
    good_asym = reference(q, asymmetric_k, v, causal)[2]
    swapped_asym = reference(asymmetric_k, q, v, causal)[2]
    asym_error = (good_asym - swapped_asym).abs().max().item()
    assert asym_error > .1
    packed = torch.tensor([[[0, 1, 2, 3], [10, 11, 12, 13]]])
    heads = packed.reshape(1, 2, 2, 2).transpose(1, 2)
    wrong_heads = packed.reshape(1, 2, 2, 2)
    assert heads[0, 0].tolist() == [[0, 1], [10, 11]]
    assert wrong_heads[0, 0].tolist() == [[0, 1], [2, 3]]
    torch.testing.assert_close(heads.transpose(1, 2).reshape(1, 2, 4), packed)
    empty = causal.clone(); empty[0] = False
    try:
        reference(q, k, v, empty)
    except ValueError:
        empty_rejected = True
    else:
        raise AssertionError('undefined all-masked row accepted')
    print(json.dumps({'torch': str(torch.__version__), 'device': 'cpu', 'dtype': str(q.dtype),
                      'scaled_scores': scores.tolist(), 'weights': weights.tolist(),
                      'output': out.tolist(), 'sdpa_max_error': (actual-out).abs().max().item(),
                      'future_changed_output': changed_out.tolist(),
                      'zero_mask_row_1': zero_mask_out[1].tolist(),
                      'padding_last_row': padded[2].tolist(),
                      'cached_last_row': cached[0].tolist(), 'wrong_offset_row': wrong_offset[0].tolist(),
                      'chunk_max_error': (chunked-out[1:]).abs().max().item(),
                      'asymmetric_transpose_error': asym_error,
                      'head_0_correct': heads[0, 0].tolist(), 'head_0_wrong': wrong_heads[0, 0].tolist(),
                      'empty_row_rejected': empty_rejected}, indent=2))


if __name__ == '__main__':
    main()
