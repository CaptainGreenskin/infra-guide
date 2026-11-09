"""Generate a tiny synthetic one-layer Llama GGUF without downloading weights."""

import argparse
from pathlib import Path
import struct


WIDTH = 16
FF_WIDTH = 32
ALIGNMENT = 32
UINT32, INT32, FLOAT32, BOOL, STRING, ARRAY = 4, 5, 6, 7, 8, 9


def string(value):
    data = value.encode("utf-8")
    return struct.pack("<Q", len(data)) + data


def value_bytes(kind, value):
    if kind == STRING:
        return string(value)
    if kind == ARRAY:
        element_kind, items = value
        return struct.pack("<IQ", element_kind, len(items)) + b"".join(
            value_bytes(element_kind, item) for item in items
        )
    return struct.pack({UINT32: "<I", INT32: "<i", FLOAT32: "<f", BOOL: "<?"}[kind], value)


def aligned(data):
    return data + b"\0" * (-len(data) % ALIGNMENT)


def write_gguf(path, metadata, tensors):
    """Write just the GGUF v3 field types and F32 tensors used by this fixture."""
    header = b"GGUF" + struct.pack("<IQQ", 3, len(tensors), len(metadata))
    for key, kind, value in metadata:
        header += string(key) + struct.pack("<I", kind) + value_bytes(kind, value)

    payload = bytearray()
    for name, shape, elements in tensors:
        header += string(name) + struct.pack("<I", len(shape))
        # GGML stores dimensions from the innermost axis to the outermost.
        header += b"".join(struct.pack("<Q", size) for size in reversed(shape))
        header += struct.pack("<IQ", 0, len(payload))  # GGML_TYPE_F32 and byte offset
        payload += aligned(struct.pack(f"<{len(elements)}f", *elements))
    path.write_bytes(aligned(header) + payload)


def matrix(name, rows, cols, element):
    return name, (rows, cols), [element(row, col) for row in range(rows) for col in range(cols)]


def diagonal(name, rows, cols, scale):
    return matrix(name, rows, cols, lambda row, col: scale if row == col else 0)


def build(path, output_shift=1, output_scale=2):
    words = ["red", "green", "blue", "one", "two", "three", "four", "five", "six", "seven", "black", "white"]
    pieces = ["▁" + word for word in words]
    main_tokens = ["<unk>", "<s>", "</s>", "▁", *pieces]
    # Prefix fragments let the native tokenizer merge single characters into words.
    fragments = {piece[:end] for piece in pieces for end in range(2, len(piece))}
    fragments.update("".join(words))
    tokens = main_tokens + sorted(fragments - set(main_tokens))
    vocab_size = len(tokens)
    metadata = [
        ("general.architecture", STRING, "llama"),
        ("general.name", STRING, "Synthetic Cache Walkthrough"),
        ("general.file_type", UINT32, 0),
        ("llama.context_length", UINT32, 128),
        ("llama.embedding_length", UINT32, WIDTH),
        ("llama.block_count", UINT32, 1),
        ("llama.feed_forward_length", UINT32, FF_WIDTH),
        ("llama.rope.dimension_count", UINT32, WIDTH // 2),
        ("llama.attention.head_count", UINT32, 2),
        ("llama.attention.head_count_kv", UINT32, 2),
        ("llama.attention.layer_norm_rms_epsilon", FLOAT32, 1e-5),
        ("tokenizer.ggml.model", STRING, "llama"),
        ("tokenizer.ggml.tokens", ARRAY, (STRING, tokens)),
        ("tokenizer.ggml.scores", ARRAY, (FLOAT32, [float(len(token)) for token in tokens])),
        ("tokenizer.ggml.token_type", ARRAY, (INT32, [2, 3, 3] + [1] * (vocab_size - 3))),
        ("tokenizer.ggml.unknown_token_id", UINT32, 0),
        ("tokenizer.ggml.bos_token_id", UINT32, 1),
        ("tokenizer.ggml.eos_token_id", UINT32, 2),
        ("tokenizer.ggml.add_bos_token", BOOL, True),
        ("tokenizer.ggml.add_eos_token", BOOL, False),
        ("tokenizer.ggml.add_space_prefix", BOOL, True),
    ]

    # Every main token has its own basis vector. An engineered output head makes
    # the next word easy to predict by hand; attention and FFN remain nonzero.
    tensors = [
        diagonal("token_embd.weight", vocab_size, WIDTH, 1),
        ("output_norm.weight", (WIDTH,), [1] * WIDTH),
        matrix("output.weight", vocab_size, WIDTH, lambda token, feature: output_scale if token == feature + output_shift else 0),
        ("blk.0.attn_norm.weight", (WIDTH,), [1] * WIDTH),
        diagonal("blk.0.attn_q.weight", WIDTH, WIDTH, 0.25),
        diagonal("blk.0.attn_k.weight", WIDTH, WIDTH, 0.25),
        diagonal("blk.0.attn_v.weight", WIDTH, WIDTH, 0.25),
        diagonal("blk.0.attn_output.weight", WIDTH, WIDTH, 0.25),
        ("blk.0.ffn_norm.weight", (WIDTH,), [1] * WIDTH),
        diagonal("blk.0.ffn_gate.weight", FF_WIDTH, WIDTH, 0.125),
        diagonal("blk.0.ffn_up.weight", FF_WIDTH, WIDTH, 0.125),
        diagonal("blk.0.ffn_down.weight", WIDTH, FF_WIDTH, 0.125),
    ]
    write_gguf(path, metadata, tensors)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
