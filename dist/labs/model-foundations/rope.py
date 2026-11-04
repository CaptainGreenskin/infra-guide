"""Fixed-vector RoPE checks; Python 3 standard library, no model weights."""
import json
import math


def rotate(vector, position, frequencies, layout="adjacent"):
    pairs = len(frequencies)
    if len(vector) != 2 * pairs or layout not in {"adjacent", "halves"}:
        raise ValueError("this experiment requires a complete paired vector")
    out = [0.0] * len(vector)
    for i, frequency in enumerate(frequencies):
        a, b = (2 * i, 2 * i + 1) if layout == "adjacent" else (i, i + pairs)
        theta = position * frequency
        c, s = math.cos(theta), math.sin(theta)
        out[a] = c * vector[a] - s * vector[b]
        out[b] = s * vector[a] + c * vector[b]
    return out


def score(q, k, m, n, frequencies, layout="adjacent"):
    # Algebraic Q·K score before attention's 1/sqrt(head_dim) scaling.
    left = rotate(q, m, frequencies, layout)
    right = rotate(k, n, frequencies, layout)
    return sum(a * b for a, b in zip(left, right))


def check(number, expected):
    assert math.isclose(number, expected, rel_tol=1e-12, abs_tol=1e-12), (number, expected)


def main():
    q, k, omega = [1, 2], [3, 2], [math.pi / 2]
    original = score(q, k, 2, 1, omega)
    shifted = score(q, k, 4, 3, omega)
    wrong_query_offset = score(q, k, 0, 1, omega)
    check(original, -4)
    check(shifted, -4)
    check(wrong_query_offset, 4)

    q2 = k2 = [1, 0]
    second = score(q2, k2, 3, 1, [math.pi / 3])
    check(second, -0.5)
    check(score(q2, k2, 6, 4, [math.pi / 3]), -0.5)

    q4, k4, freqs = [1, 2, 3, 4], [4, 3, 2, 1], [math.pi / 2, math.pi]
    adjacent = score(q4, k4, 1, 0, freqs, "adjacent")
    wrong_layout = score(q4, k4, 1, 0, freqs, "halves")
    check(adjacent, -15)
    check(wrong_layout, -20)
    # Permute both projections into the half-pair basis; dot products agree.
    q_half = q4[::2] + q4[1::2]
    k_half = k4[::2] + k4[1::2]
    remapped = score(q_half, k_half, 1, 0, freqs, "halves")
    check(remapped, adjacent)
    print(json.dumps({"original": original, "translated": shifted,
                      "wrong_query_offset": wrong_query_offset, "second_pair": second,
                      "adjacent_pairs": adjacent, "unconverted_halves": wrong_layout,
                      "converted_halves": remapped}, indent=2))


if __name__ == "__main__":
    main()
