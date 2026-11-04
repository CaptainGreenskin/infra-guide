"""GQA/RoPE cache equivalence, KV units and synthetic serving measurements."""
from fractions import Fraction
import json
import math


def rotate(vector, position):
    a, b = vector
    return [a*math.cos(position)-b*math.sin(position),
            a*math.sin(position)+b*math.cos(position)]


def attention(query, keys, values):
    scores = [sum(a*b for a, b in zip(query, key))/math.sqrt(2) for key in keys]
    weights = [math.exp(s-max(scores)) for s in scores]
    denominator = sum(weights)
    return [sum(w*value[d] for w, value in zip(weights, values))/denominator for d in range(2)]


def gqa(tokens, incremental, wrong_group=False, wrong_offset=False):
    # Four query heads share two independent K/V heads, two adjacent Q heads per group.
    cache_k, cache_v = [[], []], [[], []]
    result = []
    for position, token in enumerate(tokens):
        raw_k = [[token, 1.0], [-token/2, 2.0]]
        raw_v = [[token, token+1], [-token, 2*token]]
        if incremental:
            for group in range(2):
                cache_k[group].append(rotate(raw_k[group], position))
                cache_v[group].append(raw_v[group])
            keys, values = cache_k, cache_v
        else:
            # Full causal reference independently rebuilds every visible prefix.
            keys = [[rotate(([x, 1.] if group == 0 else [-x/2, 2.]), i)
                     for i, x in enumerate(tokens[:position+1])] for group in range(2)]
            values = [[[x, x+1] if group == 0 else [-x, 2*x]
                       for x in tokens[:position+1]] for group in range(2)]
        heads = []
        for head in range(4):
            group = head % 2 if wrong_group else head//2
            q = rotate([token+head/3, 1-head/5], 0 if wrong_offset else position)
            heads.append(attention(q, keys[group], values[group]))
        result.append(heads)
    return result


def difference(left, right):
    assert len(left) == len(right)
    assert all(len(ls) == len(rs) and all(len(lh) == len(rh) for lh, rh in zip(ls, rs))
               for ls, rs in zip(left, right))
    return max(abs(a-b) for ls, rs in zip(left, right)
               for lh, rh in zip(ls, rs) for a, b in zip(lh, rh))


def validate_shape(output, positions):
    # Absolute contract: equal-but-wrong reference/cached shapes must also fail.
    assert len(output) == positions
    assert all(len(heads) == 4 for heads in output)
    assert all(len(vector) == 2 and all(math.isfinite(x) for x in vector)
               for heads in output for vector in heads)


def measure(arrival, token_times, success=True):
    if not success or not token_times:
        return {'complete': False, 'ttft_ms': None, 'tpot_ms': None}
    assert arrival <= token_times[0] and token_times == sorted(token_times)
    return {'complete': True, 'ttft_ms': token_times[0]-arrival,
            'tpot_ms': Fraction(token_times[-1]-token_times[0], len(token_times)-1)
            if len(token_times) > 1 else None}


def main():
    tokens = [1., 2., -1., 3.]
    reference = gqa(tokens, False)
    cached = gqa(tokens, True)
    wrong_mapping = gqa(tokens, True, wrong_group=True)
    wrong_offset = gqa(tokens, True, wrong_offset=True)
    for output in (reference, cached, wrong_mapping, wrong_offset):
        validate_shape(output, len(tokens))
    # Independent exact/closed-form anchors; these do not call the attention helper.
    assert reference[0] == [[1., 2.], [1., 2.], [-1., 2.], [-1., 2.]]
    probability_second = 1/(1+math.exp((3*math.cos(1)+math.sin(1)-5)/math.sqrt(2)))
    assert abs(reference[1][0][0]-(1+probability_second)) < 1e-12
    assert abs(reference[1][0][1]-(2+probability_second)) < 1e-12
    error = difference(reference, cached)
    wrong_head = difference(reference, wrong_mapping)
    wrong_position = difference(reference, wrong_offset)
    assert error < 1e-12 and wrong_head > .1 and wrong_position > .1
    # Causal prefix outputs cannot change after appending future tokens.
    assert difference(reference[:2], gqa(tokens[:2], False)) < 1e-12
    bytes_per_token = 2*32*8*128*2
    sequence_bytes = bytes_per_token*8192
    assert bytes_per_token == 131072 and sequence_bytes == 1024**3
    assert 2*32*32*128*2*8192 == 4*1024**3
    # 8193-token sequences need 513 blocks of 16, so 8 GiB fits only 7, not 8.
    block_bytes = 16*bytes_per_token
    blocks = math.ceil(8193/16)
    assert blocks == 513 and (8*1024**3)//(blocks*block_bytes) == 7
    events = [(0, [40, 50, 60]), (20, [80, 100])]
    window_ms = 100
    a, b = [measure(arrival, times) for arrival, times in events]
    assert a['ttft_ms'] == 40 and a['tpot_ms'] == 10
    assert b['ttft_ms'] == 60 and b['tpot_ms'] == 20
    good = sum(m['complete'] and m['ttft_ms'] <= 50 and m['tpot_ms'] is not None
               and m['tpot_ms'] <= 15 for m in (a, b))
    assert good == 1
    output_tokens = sum(len(times) for _, times in events)
    output_rate = Fraction(output_tokens*1000, window_ms)
    goodput = Fraction(good*1000, window_ms)
    assert output_rate == 50 and goodput == 10
    assert measure(0, [10])['tpot_ms'] is None  # No inter-token interval to estimate.
    assert measure(0, [], False)['ttft_ms'] is None
    report = {'gqa_heads': [4, 2], 'full_incremental_max_error': error,
              'wrong_head_mapping_max_error': wrong_head, 'wrong_query_offset_max_error': wrong_position,
              'kv_bytes_per_token': bytes_per_token, 'kv_bytes_per_8192_sequence': sequence_bytes,
              'blocks_per_8193_sequence': blocks, '8193_sequence_capacity_in_8gib': 7,
              'requests': {'A': a, 'B': b}, 'synthetic_window_ms': window_ms,
              'total_output_tokens': output_tokens, 'output_tokens_per_second': output_rate,
              'latency_qualified_requests_per_second': goodput,
              'scope': 'standard-library semantic experiment and fixed synthetic timing, not GPU/vLLM load'}
    print(json.dumps(report, default=lambda x: float(x) if isinstance(x, Fraction) else str(x), indent=2))


if __name__ == '__main__':
    main()
