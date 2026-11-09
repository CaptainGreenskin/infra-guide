"""Train and verify one tiny encoder-decoder Transformer on CPU."""

import hashlib
import json
import math
from pathlib import Path
import sys

import torch
from torch import nn
from torch.nn import functional as F


PAD, BOS, EOS = 0, 1, 2
WIDTH, HEADS = 32, 4
STEPS, SEED, RATE = 400, 2026, 0.01
TOLERANCE = {"atol": 1e-10, "rtol": 0.0}


def position_table():
    position = torch.arange(4, dtype=torch.float64)[:, None]
    rate = 10000.0 ** (-torch.arange(0, WIDTH, 2, dtype=torch.float64) / WIDTH)
    angle = position * rate
    return torch.stack((angle.sin(), angle.cos()), dim=-1).reshape(4, WIDTH)


def ffn():
    return nn.Sequential(nn.Linear(WIDTH, 2 * WIDTH), nn.ReLU(), nn.Linear(2 * WIDTH, WIDTH))


class TinyTranslator(nn.Module):
    def __init__(self, source_size, target_size):
        super().__init__()
        self.source_embedding = nn.Embedding(source_size, WIDTH, padding_idx=PAD)
        self.target_embedding = nn.Embedding(target_size, WIDTH, padding_idx=PAD)
        self.register_buffer("position", position_table())
        self.encoder_attention = nn.MultiheadAttention(WIDTH, HEADS, batch_first=True)
        self.decoder_attention = nn.MultiheadAttention(WIDTH, HEADS, batch_first=True)
        self.cross_attention = nn.MultiheadAttention(WIDTH, HEADS, batch_first=True)
        self.encoder_norm = nn.ModuleList(nn.LayerNorm(WIDTH) for _ in range(2))
        self.decoder_norm = nn.ModuleList(nn.LayerNorm(WIDTH) for _ in range(3))
        self.encoder_ffn, self.decoder_ffn = ffn(), ffn()
        self.to_logits = nn.Linear(WIDTH, target_size)

    def embed(self, ids, table):
        return table(ids) * math.sqrt(WIDTH) + self.position[:ids.shape[1]]

    def encode(self, source, source_padding):
        x = self.embed(source, self.source_embedding)
        read, _ = self.encoder_attention(x, x, x, key_padding_mask=source_padding, need_weights=False)
        x = self.encoder_norm[0](x + read)
        return self.encoder_norm[1](x + self.encoder_ffn(x))

    def target_context(self, target, target_padding, causal=True):
        x = self.embed(target, self.target_embedding)
        length = target.shape[1]
        future = torch.ones(length, length, dtype=torch.bool).triu(1) if causal else None
        read, _ = self.decoder_attention(
            x, x, x, attn_mask=future, key_padding_mask=target_padding, need_weights=False
        )
        return self.decoder_norm[0](x + read)

    def decode(self, target, memory, source_padding, target_padding, causal=True):
        x = self.target_context(target, target_padding, causal)
        read, _ = self.cross_attention(x, memory, memory, key_padding_mask=source_padding, need_weights=False)
        x = self.decoder_norm[1](x + read)
        return self.to_logits(self.decoder_norm[2](x + self.decoder_ffn(x)))

    def forward(self, source, target):
        source_padding = source.eq(PAD)
        return self.decode(target, self.encode(source, source_padding), source_padding, target.eq(PAD))


def pad(ids, length):
    return ids + [PAD] * (length - len(ids))


def training_batch(examples, lexicon, source_ids, target_ids):
    sources, decoder_inputs, labels = [], [], []
    for words in examples:
        source = [source_ids[word] for word in words]
        target = [target_ids[lexicon[word]] for word in words]
        sources.append(pad(source, 2))
        decoder_inputs.append(pad([BOS, *target], 3))
        labels.append(pad([*target, EOS], 3))
    return tuple(torch.tensor(rows) for rows in (sources, decoder_inputs, labels))


def token_loss(logits, labels):
    return F.cross_entropy(logits.flatten(0, 1), labels.flatten(), ignore_index=PAD)


def train(model, source, target, labels):
    optimizer = torch.optim.Adam(model.parameters(), lr=RATE)
    model.train()
    with torch.no_grad():
        initial = token_loss(model(source, target), labels).item()
    for _ in range(STEPS):
        optimizer.zero_grad(set_to_none=True)
        token_loss(model(source, target), labels).backward()
        optimizer.step()
    model.eval()
    with torch.no_grad():
        final = token_loss(model(source, target), labels).item()
    assert final < 0.01 and final < initial
    return {"optimizer": "Adam", "learning_rate": RATE, "updates": STEPS, "initial_loss": initial, "final_loss": final}


def cross_oracle(layer, decoder_rows, source_memory, source_padding):
    # nn.MultiheadAttention stores Wq, Wk and Wv as stacked weight rows.
    def project(rows, weight, bias):
        return F.linear(rows, weight, bias).unflatten(-1, (HEADS, WIDTH // HEADS)).transpose(1, 2)

    q, k, v = (project(rows, weight, bias) for rows, weight, bias in zip(
        (decoder_rows, source_memory, source_memory),
        layer.in_proj_weight.chunk(3), layer.in_proj_bias.chunk(3),
    ))
    scores = q @ k.transpose(-2, -1) / math.sqrt(WIDTH // HEADS)
    weights = scores.masked_fill(source_padding[:, None, None, :], -torch.inf).softmax(-1)
    joined = (weights @ v).transpose(1, 2).flatten(-2)
    output = F.linear(joined, layer.out_proj.weight, layer.out_proj.bias)
    return output, weights, [list(rows.shape) for rows in (q, k, v)]


def max_error(a, b):
    return (a - b).abs().max().item()


def compare_paths(correct, perturbed, broken, broken_perturbed):
    torch.testing.assert_close(correct, perturbed, **TOLERANCE)
    error = max_error(broken, broken_perturbed)
    assert error > 1e-3
    return {"masked_max_abs_delta": max_error(correct, perturbed), "without_mask_max_abs_delta": error}


@torch.no_grad()
def mask_checks(model, source, target, labels):
    source_padding, target_padding = source.eq(PAD), target.eq(PAD)
    assert source.tolist() == [[1, 0], [1, 6]]
    assert target.tolist() == [[BOS, 3, PAD], [BOS, 3, 8]]
    assert labels.tolist() == [[3, EOS, PAD], [3, 8, EOS]]

    memory = model.encode(source, source_padding)
    changed_source = source.masked_fill(source_padding, 6)
    encoder = compare_paths(
        memory[~source_padding], model.encode(changed_source, source_padding)[~source_padding],
        model.encode(source, None)[~source_padding], model.encode(changed_source, None)[~source_padding],
    )

    def decode(target_ids, memory_rows, source_mask=source_padding, causal=True):
        return model.decode(target_ids, memory_rows, source_mask, target_padding, causal)

    logits = decode(target, memory)
    changed_memory = memory.clone()
    changed_memory[source_padding] += torch.linspace(-20, 20, WIDTH, dtype=memory.dtype)
    cross_padding = compare_paths(
        logits, decode(target, changed_memory),
        decode(target, memory, source_mask=None), decode(target, changed_memory, source_mask=None),
    )

    changed_future = target.clone()
    changed_future[1, 2] = 10
    causal = compare_paths(
        logits[1, :2], decode(changed_future, memory)[1, :2],
        decode(target, memory, causal=False)[1, :2], decode(changed_future, memory, causal=False)[1, :2],
    )

    # Right padding is already in the future of valid training queries.
    # To isolate target key padding, make an earlier masked slot in this probe.
    padded_history = torch.tensor([[BOS, PAD, 8]])  # [BOS, PAD, square]
    history_mask = padded_history.eq(PAD)
    changed_history = padded_history.masked_fill(history_mask, 3)  # red in the masked slot
    target_keys = compare_paths(
        model.target_context(padded_history, history_mask)[:, -1],
        model.target_context(changed_history, history_mask)[:, -1],
        model.target_context(padded_history, None)[:, -1],
        model.target_context(changed_history, None)[:, -1],
    )

    supervised = labels.ne(PAD)
    expected_loss = F.cross_entropy(logits[supervised], labels[supervised])
    changed_logits = logits.clone()
    changed_logits[~supervised] = -100
    changed_logits[..., PAD][~supervised] = 100
    torch.testing.assert_close(token_loss(logits, labels), expected_loss, **TOLERANCE)
    torch.testing.assert_close(token_loss(changed_logits, labels), expected_loss, **TOLERANCE)
    unmasked_loss_delta = abs(
        F.cross_entropy(logits.flatten(0, 1), labels.flatten()).item()
        - F.cross_entropy(changed_logits.flatten(0, 1), labels.flatten()).item()
    )
    assert unmasked_loss_delta > 1e-3

    decoder_rows = model.target_context(target, target_padding)
    native, weights = model.cross_attention(decoder_rows, memory, memory,
                                            key_padding_mask=source_padding, average_attn_weights=False)
    manual, manual_weights, shapes = cross_oracle(model.cross_attention, decoder_rows, memory, source_padding)
    torch.testing.assert_close(weights, manual_weights, **TOLERANCE)
    torch.testing.assert_close(native, manual, **TOLERANCE)
    assert list(weights.shape) == [2, HEADS, 3, 2] and weights[0, :, :, 1].count_nonzero() == 0
    return {
        "batch": {"source": source.tolist(), "decoder_input": target.tolist(), "labels": labels.tolist(),
                  "source_padding": source_padding.tolist(), "target_padding": target_padding.tolist(),
                  "valid_labels": supervised.sum().item()},
        "cross_attention": {"q_k_v_shapes": shapes, "weight_shape": list(weights.shape),
                            "short_source_head0": weights[0, 0].tolist(),
                            "manual_weight_max_abs_error": max_error(weights, manual_weights),
                            "manual_output_max_abs_error": max_error(native, manual)},
        "encoder_source_padding": encoder, "cross_source_padding": cross_padding,
        "decoder_causal": causal, "decoder_target_key_padding": target_keys,
        "loss_ignore_pad": {"valid_only": expected_loss.item(), "padded_logits_invariant": True,
                            "without_ignore_max_abs_delta": unmasked_loss_delta},
    }


@torch.no_grad()
def generate(model, source):
    source_padding = source.eq(PAD)
    memory = model.encode(source, source_padding)
    prefix, events = [BOS], []
    for _ in range(4):
        target = torch.tensor([prefix])
        logits = model.decode(target, memory, source_padding, target.eq(PAD))
        token = int(logits[0, -1].argmax())
        events.append({"decoder_input": prefix.copy(), "selected": token})
        if token == EOS:
            return prefix[1:], events
        prefix.append(token)
    raise AssertionError("greedy generation did not stop at EOS")


def main():
    assert str(torch.__version__).split("+", 1)[0] == "2.5.1", "this record uses PyTorch 2.5.1"
    torch.set_num_threads(1)
    torch.manual_seed(SEED)
    torch.use_deterministic_algorithms(True)

    folder = Path(__file__).resolve().parent
    manifest = json.loads((folder / "source.json").read_text(encoding="utf-8"))
    lexicon = manifest["lexicon"]
    source_vocab = ["<pad>", *lexicon]
    target_vocab = ["<pad>", "<bos>", "<eos>", *lexicon.values()]
    source_ids = {word: i for i, word in enumerate(source_vocab)}
    target_ids = {word: i for i, word in enumerate(target_vocab)}
    train_sources = [[word] for word in lexicon] + manifest["train_pairs"]
    assert len({tuple(words) for words in train_sources}) == len(train_sources) == 20
    assert all(example["source"] not in train_sources for example in manifest["held_out"])

    source, target, labels = training_batch(train_sources, lexicon, source_ids, target_ids)
    model = TinyTranslator(len(source_vocab), len(target_vocab)).double()
    training = train(model, source, target, labels)
    probe_rows = [0, len(lexicon)]
    checks = mask_checks(model, source[probe_rows], target[probe_rows], labels[probe_rows])

    held_out = []
    for example in manifest["held_out"]:
        encoded = torch.tensor([[source_ids[word] for word in example["source"]]])
        ids, events = generate(model, encoded)
        decoded = [target_vocab[token] for token in ids]
        assert decoded == example["expected"]
        held_out.append({**example, "source_ids": encoded[0].tolist(), "decoded": decoded, "events": events})

    # Same prefix [BOS, red], different source shape; compare next-token choice.
    with torch.no_grad():
        probe_sources = torch.tensor([[source_ids["红"], source_ids["圆"]], [source_ids["红"], source_ids["方"]]])
        same_prefix = torch.tensor([[BOS, target_ids["red"]]] * 2)
        chosen = model(probe_sources, same_prefix)[:, -1].argmax(-1).tolist()
    assert [target_vocab[token] for token in chosen] == ["circle", "square"]

    source_files = [Path(__file__), folder / "source.json"]
    result = {
        "status": "passed", "scope": "fixed CPU synthetic word mapping; four held-out compositions",
        "environment": {"python": sys.version.split()[0], "torch": str(torch.__version__), "device": "cpu",
                        "dtype": str(next(model.parameters()).dtype), "seed": SEED, "threads": 1},
        "source_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in source_files},
        "model": {"encoder_layers": 1, "decoder_layers": 1, "width": WIDTH, "heads": HEADS,
                  "parameters": sum(p.numel() for p in model.parameters()),
                  "positions": "fixed sinusoidal", "normalization": "post-norm"},
        "vocab": {"source": source_vocab, "target": target_vocab},
        "training": {**training, "examples": len(train_sources), "valid_labels": labels.ne(PAD).sum().item()},
        "checks": checks, "held_out": held_out,
        "same_target_prefix": {"prefix": same_prefix[0].tolist(), "source_ids": probe_sources.tolist(),
                               "next_ids": chosen, "next_tokens": [target_vocab[token] for token in chosen]},
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
