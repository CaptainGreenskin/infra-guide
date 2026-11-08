"""Native SDPA MATH cache adaptation of the unchanged 664-parameter TinyDecoder.

The full-prefix oracle is tiny_decoder.py's original forward, not this adapter.
Only contiguous unpadded prefixes, the existing four learned positions and CPU
float64 are supported. There are no model downloads or GPU performance claims.
"""
import json
import math

import torch
from torch.nn import functional as F
from torch.nn.attention import sdpa_kernel, SDPBackend

from tiny_decoder import TinyDecoder, update


class CachedTinyDecoder(TinyDecoder):
    def forward_cached(self, ids, cache=None, wrong_causal=False):
        batch, length = ids.shape
        past = 0 if cache is None else cache[0].shape[-2]
        if length < 1 or past + length > 4:
            raise ValueError("outside_four_position_contract")
        pos = past + torch.arange(length, device=ids.device)
        x = self.token(ids) + self.position(pos)
        q, new_k, new_v = (t.reshape(batch, length, 2, 4).transpose(1, 2)
                           for t in self.qkv(self.norm1(x)).chunk(3, dim=-1))
        k = new_k if cache is None else torch.cat((cache[0], new_k), dim=-2)
        v = new_v if cache is None else torch.cat((cache[1], new_v), dim=-2)
        q_pos = past + torch.arange(length, device=ids.device)
        k_pos = torch.arange(k.shape[-2], device=ids.device)
        visible = k_pos[None, :] <= q_pos[:, None]
        if wrong_causal:
            # Deliberate bug: SDPA aligns the local non-square triangle at upper left.
            z = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=0.0)
        else:
            z = F.scaled_dot_product_attention(q, k, v, attn_mask=visible,
                                              is_causal=False, dropout_p=0.0)
        joined = z.transpose(1, 2).reshape(batch, length, 8)
        x = x + self.out(joined)
        u = self.norm2(x)
        x = x + self.down(F.silu(self.gate(u)) * self.up(u))
        logits = F.linear(self.norm_out(x), self.token.weight)
        used_visible = (torch.ones(length, k.shape[-2], dtype=torch.bool).tril()
                        if wrong_causal else visible)
        return logits, (k, v), {"input_shape": list(ids.shape), "q_shape": list(q.shape),
                               "kv_shape": list(k.shape), "query_positions": q_pos.tolist(),
                               "visible": used_visible.tolist(), "required_visible": visible.tolist(),
                               "mask_mode": "upper_left_causal" if wrong_causal else "explicit_positions",
                               "cache_length": k.shape[-2]}


def max_error(a, b):
    assert a.shape == b.shape
    return float((a - b).abs().max())


def chunks(model, ids, sizes, wrong=False):
    cache, results, trace, start = None, [], [], 0
    for size in sizes:
        output, cache, event = model.forward_cached(ids[:, start:start+size], cache,
                                                   wrong_causal=wrong)
        results.append(output)
        trace.append(event)
        start += size
    assert start == ids.shape[1]
    return torch.cat(results, dim=1), trace


def paper_api_case():
    # Exact same three-row Q/K/V table as attention-mechanics, not new random data.
    q = torch.tensor([[0., 0.], [math.sqrt(2), 0.], [0., math.sqrt(2)]], dtype=torch.float64)[None, None]
    k = torch.tensor([[0., 0.], [math.log(3), 0.], [0., math.log(2)]], dtype=torch.float64)[None, None]
    v = torch.tensor([[2., 0.], [0., 4.], [6., 2.]], dtype=torch.float64)[None, None]
    expected = torch.tensor([[2., 0.], [.5, 3.], [3.5, 2.]], dtype=torch.float64)[None, None]
    full = F.scaled_dot_product_attention(q, k, v, is_causal=True, dropout_p=0.)
    last = F.scaled_dot_product_attention(q[:, :, 2:], k, v, is_causal=False, dropout_p=0.)
    wrong = F.scaled_dot_product_attention(q[:, :, 2:], k, v, is_causal=True, dropout_p=0.)
    torch.testing.assert_close(full, expected, atol=1e-12, rtol=1e-12)
    torch.testing.assert_close(last, expected[:, :, 2:], atol=1e-12, rtol=1e-12)
    assert max_error(wrong, last) > 1
    return {"expected_full": expected[0, 0].tolist(), "native_full": full[0, 0].tolist(),
            "native_last": last[0, 0, 0].tolist(), "wrong_is_causal_last": wrong[0, 0, 0].tolist(),
            "last_visible": [True, True, True], "wrong_visible": [True, False, False]}


def greedy(reference, cached):
    prefix, cache, trace, generated = [0, 1], None, [], []
    next_input = prefix[:]
    for i in range(3):
        full = reference(torch.tensor([prefix]))[:, -1]
        logits, cache, event = cached.forward_cached(torch.tensor([next_input]), cache)
        error = max_error(full, logits[:, -1])
        torch.testing.assert_close(full, logits[:, -1], atol=1e-10, rtol=1e-10)
        chosen, expected = int(logits[0, -1].argmax()), int(full[0].argmax())
        assert chosen == expected
        generated.append(chosen)
        trace.append({"phase": "prefill" if i == 0 else "decode", "input_ids": next_input[:],
                      "selected_id": chosen, "cache_length": event["cache_length"],
                      "query_positions": event["query_positions"], "visible": event["visible"],
                      "logits_max_error": error})
        prefix.append(chosen)
        next_input = [chosen]
    assert [e["cache_length"] for e in trace] == [2, 3, 4]
    assert len(prefix) == 5 and cache[0].shape[-2] == 2 + 3 - 1 == 4
    return {"prompt": [0, 1], "output_count": 3, "generated_ids": generated,
            "logical_sequence_including_last_output": prefix, "trace": trace,
            "final_cached_positions": 4, "last_output_not_forwarded": generated[-1]}


def main():
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("This record and API are pinned to torch 2.5.1")
    torch.manual_seed(7)
    torch.set_num_threads(1)
    reference = TinyDecoder().double()
    rows = torch.tensor([[0, 1, 2, 3, 4], [4, 5, 6, 7, 0]])
    ids, labels = rows[:, :-1], rows[:, 1:].clone()
    labels[0, 1:] = -100
    labels[1, 3:] = -100
    # Perform the exact old example's single update, then use its learned weights.
    with sdpa_kernel(backends=[SDPBackend.MATH]):
        loss_before = update(reference, ids, labels, micro_size=2)
        model = CachedTinyDecoder().double()
        model.load_state_dict(reference.state_dict(), strict=True)
        reference.eval()
        model.eval()
        assert sum(p.numel() for p in model.parameters()) == 664
        assert reference.state_dict().keys() == model.state_dict().keys()
        for key, tensor in reference.state_dict().items():
            assert torch.equal(tensor, model.state_dict()[key])
        with torch.inference_mode():
            api = paper_api_case()
            expected = reference(ids)
            cases = {}
            for name, sizes in [("single", [1, 1, 1, 1]), ("two_position", [2, 2]),
                                ("prefill_then_decode", [2, 1, 1])]:
                result, trace = chunks(model, ids, sizes)
                torch.testing.assert_close(result, expected, atol=1e-10, rtol=1e-10)
                cases[name] = {"chunks": sizes, "logits_max_error": max_error(result, expected), "trace": trace}
            wrong, wrong_trace = chunks(model, ids, [2, 1, 1], wrong=True)
            wrong_error = max_error(wrong, expected)
            assert wrong_error > 1e-5
            try:
                torch.testing.assert_close(wrong, expected, atol=1e-10, rtol=1e-10)
            except AssertionError:
                rejected = True
            else:
                raise AssertionError("wrong_non_square_causal_not_detected")
            generation = greedy(reference, model)
            # Observe the actual backend dispatch, without publishing its timing.
            with torch.profiler.profile(activities=[torch.profiler.ProfilerActivity.CPU]) as prof:
                reference(ids)
            keys = sorted({e.key for e in prof.key_averages() if "scaled_dot_product" in e.key})
            assert "aten::_scaled_dot_product_attention_math" in keys
    print(json.dumps({"status": "passed", "torch": torch.__version__, "device": "cpu", "dtype": "float64",
                      "backend": "SDPBackend.MATH", "observed_backend_events": keys,
                      "model_parameters": 664, "vocab_size": 8, "max_positions": 4,
                      "weights": "same state_dict after original example's one SGD update",
                      "training_loss_before": loss_before, "paper_api": api, "cases": cases,
                      "negative_is_causal": {"assertion_rejected": rejected, "logits_max_error": wrong_error,
                                             "actual_first_decode_qk_lengths": [1, 3], "trace": wrong_trace},
                      "generation": generation,
                      "scope": "actual PyTorch SDPA CPU MATH calls; unchanged full-prefix TinyDecoder oracle; no FlashAttention GPU, tokenizer, trained language quality or speed claim"},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
