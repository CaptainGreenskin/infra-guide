"""Inspect a real CPU decoder forward pass and four shape-compatible wiring faults."""
import copy
import json
import math
import torch
from torch.nn import functional as F
from tiny_decoder import TinyDecoder


def trace(model, ids, fault=None):
    batch, length = ids.shape
    x = model.token(ids) + model.position(torch.arange(length))
    if fault == 'normalize_time':
        n1 = x / (x.square().mean(dim=1, keepdim=True) + 1e-6).sqrt() * model.norm1.weight
    else:
        n1 = model.norm1(x)
    q, k, v = (a.reshape(batch, length, 2, 4).transpose(1, 2)
               for a in model.qkv(n1).chunk(3, dim=-1))
    z = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=0.0)
    attn = model.out(z.transpose(1, 2).reshape(batch, length, 8))
    h1 = x + attn
    n2 = model.norm2(x if fault == 'stale_input' else h1)
    gate, up = model.gate(n2), model.up(n2)
    product = F.silu(up) * gate if fault == 'swap_gate' else F.silu(gate) * up
    ffn = model.down(product)
    h2 = ffn if fault == 'skip_residual' else h1 + ffn
    logits = F.linear(model.norm_out(h2), model.token.weight)
    return {'x': x, 'n1': n1, 'attn': attn, 'h1': h1, 'n2': n2,
            'gate_product': product, 'ffn': ffn, 'h2': h2, 'logits': logits}


def first_difference(left, right):
    return next((key for key in left if not torch.allclose(left[key], right[key],
                                                         atol=1e-12, rtol=1e-12)), None)


def main():
    torch.manual_seed(7)
    torch.set_num_threads(1)
    model = TinyDecoder().double()
    ids = torch.tensor([[0, 1, 2, 3], [4, 5, 6, 7]])
    with torch.no_grad():
        good = trace(model, ids)
        torch.testing.assert_close(good['logits'], model(ids), atol=1e-12, rtol=1e-12)
        expected = {'stale_input': 'n2', 'swap_gate': 'gate_product',
                    'skip_residual': 'h2', 'normalize_time': 'n1'}
        faults = {}
        for fault, first in expected.items():
            bad = trace(model, ids, fault)
            actual_first = first_difference(good, bad)
            assert actual_first == first
            faults[fault] = {'first_difference': first,
                             'logit_max_difference': (good['logits']-bad['logits']).abs().max().item()}
        future = ids.clone(); future[:, 3] = (future[:, 3] + 1) % 8
        correct_prefix_error = (trace(model, future)['logits'][:, :3]-good['logits'][:, :3]).abs().max().item()
        wrong_prefix_error = (trace(model, future, 'normalize_time')['logits'][:, :3]
                              - trace(model, ids, 'normalize_time')['logits'][:, :3]).abs().max().item()
        assert correct_prefix_error < 1e-12 and wrong_prefix_error > 1e-4
        zero = copy.deepcopy(model)
        zero.out.weight.zero_(); zero.down.weight.zero_()
        zero_good = trace(zero, ids)
        torch.testing.assert_close(zero_good['h2'], zero_good['x'])
        assert trace(zero, ids, 'skip_residual')['h2'].count_nonzero().item() == 0
        x = torch.tensor([[1., 3.], [3., 5.]], dtype=torch.float64)
        layer = F.layer_norm(x, (2,), eps=1e-6)
        rms = F.rms_norm(x, (2,), eps=1e-6)
        expected_layer = torch.tensor([[-1., 1.], [-1., 1.]], dtype=x.dtype) / (1+1e-6)**.5
        expected_rms = torch.tensor([[1/(5+1e-6)**.5, 3/(5+1e-6)**.5],
                                     [3/(17+1e-6)**.5, 5/(17+1e-6)**.5]], dtype=x.dtype)
        torch.testing.assert_close(layer, expected_layer, atol=1e-12, rtol=1e-12)
        torch.testing.assert_close(rms, expected_rms, atol=1e-12, rtol=1e-12)
        gate = torch.tensor([0., math.log(3)], dtype=torch.float64)
        up = torch.tensor([5., 2.], dtype=torch.float64)
        down = torch.tensor([[1., -1.], [2., 1.]], dtype=torch.float64)
        hand_gate_output = (F.silu(gate) * up) @ down
        torch.testing.assert_close(hand_gate_output, torch.tensor([3*math.log(3), 1.5*math.log(3)], dtype=torch.float64))
    scalar = torch.tensor(2., requires_grad=True)
    (scalar + .5*scalar).backward()
    assert scalar.grad.item() == 1.5
    print(json.dumps({'torch': str(torch.__version__), 'device': 'cpu', 'parameters': sum(p.numel() for p in model.parameters()),
                      'shapes': {key: list(value.shape) for key, value in good.items()},
                      'first_position': {key: value[0, 0].tolist() for key, value in good.items()},
                      'forward_max_error': (good['logits']-model(ids)).abs().max().item(),
                      'faults': faults, 'future_prefix_error': correct_prefix_error,
                      'time_normalized_future_prefix_error': wrong_prefix_error,
                      'zero_branches_keep_input': True, 'layer_norm': layer.tolist(),
                      'rms_norm': rms.tolist(), 'swiglu_hand_output': hand_gate_output.tolist(),
                      'residual_scalar_gradient': scalar.grad.item()}, indent=2))


if __name__ == '__main__':
    main()
