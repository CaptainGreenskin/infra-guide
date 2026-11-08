"""Actual tiny CPU attention + KV tensors. Drafts are controlled fixtures, not a trained model."""
import json
import math
import torch

torch.set_num_threads(1)
DTYPE = torch.float64


class TinyAttention:
    def __init__(self):
        g = torch.Generator().manual_seed(19)
        self.emb = torch.randn(8, 8, generator=g, dtype=DTYPE)
        self.pos = torch.randn(32, 8, generator=g, dtype=DTYPE) * .1
        self.weights = [torch.randn(8, 8, generator=g, dtype=DTYPE) / math.sqrt(8) for _ in range(5)]

    def forward(self, tokens, past=None):
        n = 0 if past is None else past[0].shape[0]
        x = self.emb[torch.tensor(tokens)] + self.pos[n:n + len(tokens)]
        wq, wk, wv, wo, wl = self.weights
        q, k, v = x @ wq, x @ wk, x @ wv
        if past is not None:
            k, v = torch.cat((past[0], k)), torch.cat((past[1], v))
        scores = q @ k.T / math.sqrt(8)
        mask = torch.arange(k.shape[0])[None, :] > (n + torch.arange(len(tokens)))[:, None]
        scores = scores.masked_fill(mask, float('-inf'))
        hidden = x + torch.softmax(scores, dim=-1) @ v @ wo
        return hidden @ wl, (k, v)


def max_error(a, b):
    return (a - b).abs().max().item()


def run_case(model, prefix, draft, initial_logits, initial_cache):
    verifier_logits, speculative_cache = model.forward(draft, initial_cache)
    p_logits = [initial_logits[-1]] + list(verifier_logits)
    # Independent serial/full-prefix execution for every conditional distribution.
    conditional_errors = []
    for i in range(len(draft) + 1):
        reference, _ = model.forward(prefix + draft[:i])
        error = max_error(p_logits[i], reference[-1])
        assert error < 1e-12
        conditional_errors.append(error)
    accepted = 0
    for i, y in enumerate(draft):
        if y != int(p_logits[i].argmax()):
            break
        accepted += 1
    correction_or_bonus = int(p_logits[accepted].argmax())
    output = draft[:accepted] + [correction_or_bonus]
    # Keep only committed prefix K/V. Rejected guesses must not survive the cut.
    keep = len(prefix) + accepted
    trimmed = tuple(x[:keep].clone() for x in speculative_cache)
    next_logits, committed_cache = model.forward([correction_or_bonus], trimmed)
    serial_cache = initial_cache
    serial_logits = initial_logits
    serial_output = []
    for _ in output:
        token = int(serial_logits[-1].argmax())
        serial_output.append(token)
        serial_logits, serial_cache = model.forward([token], serial_cache)
    assert output == serial_output
    errors = [max_error(a, b) for a, b in zip(committed_cache, serial_cache)]
    assert max(errors + [max_error(next_logits, serial_logits)]) < 1e-12
    negative = None
    if accepted < len(draft):
        wrong_logits, wrong_cache = model.forward([correction_or_bonus], speculative_cache)
        negative = {'wrong_cache_length': wrong_cache[0].shape[0],
                    'correct_cache_length': committed_cache[0].shape[0],
                    'next_logit_max_error': max_error(wrong_logits, serial_logits)}
        assert negative['wrong_cache_length'] != negative['correct_cache_length']
        assert negative['next_logit_max_error'] > 1e-5
    return {'prefix': prefix, 'draft_fixture': draft, 'accepted': accepted, 'output': output,
            'serial_target_output': serial_output, 'conditional_max_errors': conditional_errors,
            'verified_cache_length': speculative_cache[0].shape[0], 'retained_before_correction': keep,
            'committed_cache_length': committed_cache[0].shape[0], 'cache_max_errors': errors,
            'next_logit_max_error': max_error(next_logits, serial_logits),
            'target_calls_after_prefill': {'verify': 1, 'consume_correction_or_bonus': 1,
                                           'serial_consuming_same_output': len(output)},
            'negative_keep_rejected_cache': negative}


def main():
    model = TinyAttention()
    prefix = [1, 2, 3]
    initial_logits, initial_cache = model.forward(prefix)
    logits, cache = initial_logits, initial_cache
    target_fixture = []
    for _ in range(3):
        token = int(logits[-1].argmax())
        target_fixture.append(token)
        logits, cache = model.forward([token], cache)
    good = run_case(model, prefix, target_fixture, initial_logits, initial_cache)
    assert good['accepted'] == 3 and len(good['output']) == 4
    bad = target_fixture.copy()
    bad[1] = (bad[1] + 1) % 8
    rejected = run_case(model, prefix, bad, initial_logits, initial_cache)
    assert rejected['accepted'] == 1 and len(rejected['output']) == 2
    print(json.dumps({'torch': torch.__version__, 'device': 'cpu', 'dtype': str(DTYPE),
                      'vocabulary': 8, 'hidden_width': 8, 'all_accept': good, 'reject_second': rejected,
                      'scope': 'actual untrained one-layer CPU causal attention/KV verification; '
                               'controlled drafts, no trained draft quality or GPU speedup measurement'}, indent=2))


if __name__ == '__main__':
    with torch.inference_mode():
        main()
