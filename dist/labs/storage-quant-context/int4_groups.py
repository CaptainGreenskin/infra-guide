"""Original INT4 packing and numerical oracle, standard library only.

This is a CPU reference implementation, not a GPU kernel or engine benchmark.
Weights use symmetric [-7,7], zero-point 0, float32 scales, round-to-even.
"""
import json
import math
from pathlib import Path
import struct
import tempfile


W = [[12, .12, -.18, .09, .24, -.30, .06, -.12],
     [.08, -.16, .24, -.32, .40, -.48, .56, -.64],
     [.03, .06, -.09, .12, -.15, .18, -.21, .24],
     [-.20, .10, .30, -.40, .50, -.60, .70, -.80]]
INPUTS = [[1, -1, .5, .25, -.5, .75, -1, 1],
          [.1, .2, .3, .4, .5, .6, .7, .8]]
BIAS = [.1, -.2, .3, -.4]
HEADER = struct.Struct("<4sHHHH")


def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def pack(values):
    assert all(type(q) is int and -7 <= q <= 7 for q in values)
    payload = bytearray((len(values) + 1) // 2)
    for i, q in enumerate(values):
        payload[i // 2] |= (q & 15) << (4 * (i % 2))
    return bytes(payload)


def unpack(payload, count):
    if len(payload) != (count + 1) // 2:
        raise ValueError("payload_length")
    values = []
    for i in range(count):
        nibble = (payload[i // 2] >> (4 * (i % 2))) & 15
        q = nibble - 16 if nibble >= 8 else nibble
        if q == -8:
            raise ValueError("unused_symmetric_code")
        values.append(q)
    return values


def group_ranges(size, group_size):
    return [(i, min(i + group_size, size)) for i in range(0, size, group_size)]


def quantize(flat, group_size):
    q, scales = [], []
    for begin, end in group_ranges(len(flat), group_size):
        values = flat[begin:end]
        maximum = max(abs(x) for x in values)
        scale = f32(maximum / 7) if maximum else 1.0
        scales.append(scale)
        q.extend(max(-7, min(7, round(x / scale))) for x in values)
    return q, scales


def dequantize(q, scales, group_size):
    return [value * scales[i // group_size] for i, value in enumerate(q)]


def forward(flat, x):
    return [sum(flat[j * 8 + i] * x[i] for i in range(8)) + BIAS[j] for j in range(4)]


def integer_group_forward(qw, scales, group_size, qx, sx):
    # A different weight scale requires a separate partial sum before rescaling.
    output = []
    for row in range(4):
        value = BIAS[row]
        for begin in range(0, 8, group_size):
            end = min(begin + group_size, 8)
            accumulator = sum(qx[i] * qw[row * 8 + i] for i in range(begin, end))
            value += accumulator * sx * scales[(row * 8 + begin) // group_size]
        output.append(value)
    return output


def activation(x, maximum):
    scale = maximum / 127
    q = [max(-127, min(127, round(v / scale))) for v in x]
    return q, scale, sum(abs(v) > maximum for v in x)


def run():
    flat = [v for row in W for v in row]
    reference = [forward(flat, x) for x in INPUTS]
    # Independently expanded decimal dot products (including BIAS).
    assert all(abs(a-b) < 1e-12 for a,b in zip(reference[0], [11.3875, -1.68, .915, -2.85]))
    schemes = {}
    with tempfile.TemporaryDirectory(prefix="int4-groups-") as folder:
        for label, group_size in (("per_tensor", 32), ("per_channel", 8),
                                  ("group_4", 4), ("group_2", 2)):
            q, scales = quantize(flat, group_size)
            payload = pack(q)
            header = HEADER.pack(b"IGQ1", 4, 8, group_size, len(scales))
            encoded = header + struct.pack("<" + "f" * len(scales), *scales) + payload
            path = Path(folder, label + ".igq")
            path.write_bytes(encoded)
            data = path.read_bytes()
            magic, rows, cols, group, count = HEADER.unpack(data[:HEADER.size])
            assert (magic, rows, cols, group, count) == (b"IGQ1", 4, 8, group_size, len(scales))
            split = HEADER.size + 4 * count
            loaded_scales = list(struct.unpack("<" + "f" * count, data[HEADER.size:split]))
            loaded_q = unpack(data[split:], rows * cols)
            assert loaded_scales == scales and loaded_q == q
            decoded = dequantize(loaded_q, loaded_scales, group)
            outputs = [forward(decoded, x) for x in INPUTS]
            error = max(abs(y - target) for a,b in zip(outputs, reference) for y,target in zip(a,b))
            schemes[label] = {"group_size": group_size, "scales": scales, "integers": q,
                              "payload_hex": payload.hex(), "integer_bytes": len(payload),
                              "scale_bytes": 4 * count, "header_bytes": HEADER.size,
                              "file_bytes": len(data), "tensor_bytes": len(payload) + 4 * count,
                              "weight_mae": sum(abs(a-b) for a,b in zip(flat, decoded))/len(flat),
                              "max_output_error": error, "outputs": outputs}
    assert schemes["group_4"]["max_output_error"] < schemes["per_tensor"]["max_output_error"]
    assert schemes["group_2"]["tensor_bytes"] > len(flat) * 2
    assert unpack(pack([-7, -1, 0, 7, 3]), 5) == [-7, -1, 0, 7, 3]
    zero_q, zero_scales = quantize([0.0] * 3, 2)
    assert dequantize(zero_q, zero_scales, 2) == [0.0] * 3

    qw, sw = quantize(flat, 4)
    held_out = [.1, -.2, .3, -.4, .5, -.1, .2, 3.0]
    static_q, static_s, clipped = activation(held_out, .5)
    dynamic_q, dynamic_s, _ = activation(held_out, max(abs(x) for x in held_out))
    deq_w = dequantize(qw, sw, 4)
    target = forward(deq_w, held_out)  # Isolate activation error from weight error.
    static_out = integer_group_forward(qw, sw, 4, static_q, static_s)
    dynamic_out = integer_group_forward(qw, sw, 4, dynamic_q, dynamic_s)
    dq_x = [q * dynamic_s for q in dynamic_q]
    assert max(abs(a-b) for a,b in zip(dynamic_out, forward(deq_w, dq_x))) < 1e-12
    wrong = [sum(dynamic_q[i] * qw[row * 8+i] for i in range(8)) * dynamic_s * sw[0] + BIAS[row]
             for row in range(4)]
    static_error = max(abs(a-b) for a,b in zip(static_out, target))
    dynamic_error = max(abs(a-b) for a,b in zip(dynamic_out, target))
    assert clipped == 1 and static_error > dynamic_error
    assert max(abs(a-b) for a,b in zip(wrong, dynamic_out)) > 1
    return {"shape": [4,8], "fp16_weight_bytes": 64, "reference_outputs": reference,
            "schemes": schemes,
            "activation_probe": {"calibration_max": .5, "held_out_max": 3.0,
                                 "clipped_values": clipped, "static_max_error": static_error,
                                 "dynamic_max_error": dynamic_error,
                                 "group_rescale_matches_dequantized_dot": True,
                                 "single_scale_wrong_output": wrong},
            "edge_checks": {"signed_odd_roundtrip": True, "all_zero_group": True},
            "execution": "stdlib_cpu_reference_no_quantized_kernel"}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
