"""Toy vocabulary -> shifted next-token loss. Python standard library only."""
import math

TOKENS = ["<PAD>", "<BOS>", "<EOS>", "云", "端", "云端", "算", "<UNK>"]
E = [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0), (2, 0), (0, 2), (0, 0)]
PAD, BOS, EOS, UNK, IGNORE = 0, 1, 2, 7, -100


def encode(text):
    ids = [BOS]
    pos = 0
    while pos < len(text):
        if text.startswith("云端", pos):
            ids.append(5)
            pos += 2
        else:
            c = text[pos]
            ids.append({"云": 3, "端": 4, "算": 6}.get(c, UNK))
            pos += 1
    return ids + [EOS]


def log_probs(logits):
    m = max(logits)
    log_z = m + math.log(sum(math.exp(x - m) for x in logits))
    return [x - log_z for x in logits]


def main():
    full = [encode("云端云端算"), encode("云")]
    width = max(map(len, full))
    inputs, targets, key_masks = [], [], []
    for row in full:
        present = [True] * len(row) + [False] * (width - len(row))
        padded = row + [PAD] * (width - len(row))
        inputs.append(padded[:-1])
        targets.append([v if present[i] else IGNORE
                        for i, v in enumerate(padded[1:], start=1)])
        key_masks.append(present[:-1])
    assert inputs == [[1, 5, 5, 6], [1, 3, 2, 0]]
    assert targets == [[5, 5, 6, 2], [3, 2, IGNORE, IGNORE]]
    assert key_masks == [[True] * 4, [True, True, True, False]]
    assert encode("云?") == [BOS, 3, UNK, EOS]

    losses = []
    for b, row in enumerate(inputs):
        for t, token in enumerate(row):
            # Toy transform H=E/2; no attention block or position encoding.
            h = [x / 2 for x in E[token]]
            logits = [sum(x * y for x, y in zip(h, out)) for out in E]
            lp = log_probs(logits)
            assert math.isclose(sum(math.exp(x) for x in lp), 1.0)
            if b == 0 and t == 1:
                assert logits == [0, 0, 0, 1, -1, 2, 0, 0]
                expected = math.exp(2)/(5 + math.e + math.exp(-1) + math.exp(2))
                assert math.isclose(math.exp(lp[5]), expected)
                print("target_probability", round(expected, 6))
            y = targets[b][t]
            if y != IGNORE:
                losses.append(-lp[y])
    assert len(losses) == 6
    print("inputs", inputs, "targets", targets)
    print("valid_targets", len(losses), "mean_nll", round(sum(losses)/len(losses), 6))

    # Independent lookup-path example with two supplied upstream gradients.
    row_grad = [0.0, 0.0]
    for token, grad in [(5, [0.2, -0.4]), (5, [0.3, 0.1])]:
        assert token == 5
        row_grad = [old + add for old, add in zip(row_grad, grad)]
    assert all(math.isclose(x, y) for x, y in zip(row_grad, [0.5, -0.3]))
    print("lookup_row5_gradient", [round(x, 2) for x in row_grad])


if __name__ == "__main__":
    main()
