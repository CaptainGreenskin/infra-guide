"""Numerical demonstrations of online softmax and tensor-parallel layouts.
Python 3 standard library only. No CUDA kernel or timing benchmark.
"""
import hashlib
import json
import math
from pathlib import Path


def dense(scores, values):
    m = max(scores)
    weights = [math.exp(x - m) for x in scores]
    den = sum(weights)
    return [sum(p * v[j] for p, v in zip(weights, values)) / den
            for j in range(len(values[0]))]


def online(scores, values, tile):
    if len(scores) != len(values) or not scores or tile < 1:
        raise ValueError("nonempty matching inputs and positive tile required")
    m, den = -math.inf, 0.0
    numerator = [0.0] * len(values[0])
    history = []
    for start in range(0, len(scores), tile):
        part = scores[start:start + tile]
        block_values = values[start:start + tile]
        new_m = max(m, max(part))
        old_scale = math.exp(m - new_m)
        exp_part = [math.exp(x - new_m) for x in part]
        numerator = [old_scale * old + sum(p * v[j] for p, v in zip(exp_part, block_values))
                     for j, old in enumerate(numerator)]
        den = old_scale * den + sum(exp_part)
        m = new_m
        history.append({"m": m, "denominator": den, "numerator": numerator.copy()})
    return [v / den for v in numerator], history


def matmul(a, b):
    return [[sum(x * y for x, y in zip(row, column)) for column in zip(*b)] for row in a]


def exercise():
    values = [[0.0], [0.0], [10.0], [10.0]]
    scores = [0.0, 0.0, math.log(3), math.log(3)]
    reference = dense(scores, values)
    answer, history = online(scores, values, 2)
    naive = sum(dense(scores[i:i+2], values[i:i+2])[0] for i in (0, 2)) / 2
    assert abs(reference[0] - 7.5) < 1e-12 and abs(answer[0] - 7.5) < 1e-12
    assert abs(naive - 5.0) < 1e-12
    cases = 0
    for length in range(1, 9):
        # Values above 1000 test the rescaling, without overflowing exp(score).
        s = [1000.0 + (i % 5) for i in range(length)]
        v = [[float(i), float(i * i - 3)] for i in range(length)]
        expected = dense(s, v)
        for tile in range(1, length + 2):
            observed, _ = online(s, v, tile)
            assert max(abs(x-y) for x, y in zip(expected, observed)) < 1e-10
            cases += 1

    x = [[1, 2]]
    w = [[1, 0, 2, 0], [0, 1, 0, 2]]
    u = [[1, 0], [0, 1], [1, 1], [2, 0]]
    hidden = [[max(0, z) for z in row] for row in matmul(x, w)]
    unsharded = matmul(hidden, u)
    parts = []
    for start in (0, 2):
        local_w = [row[start:start+2] for row in w]
        local_h = [[max(0, z) for z in row] for row in matmul(x, local_w)]
        parts.append(matmul(local_h, u[start:start+2]))
    reduced = [[sum(part[0][j] for part in parts) for j in range(2)]]
    assert unsharded == reduced == [[11, 4]]
    return {
        "status": "passed", "stable_softmax_cases": cases,
        "online_example": {"reference": reference, "tiled": answer, "wrong_tile_average": naive, "history": history},
        "tensor_parallel": {"partial_outputs": parts, "reduced": reduced, "reference": unsharded},
        "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "scope": "scalar CPU numerics, no GPU performance or distributed communication"
    }


if __name__ == "__main__":
    print(json.dumps(exercise(), ensure_ascii=False, indent=2))
