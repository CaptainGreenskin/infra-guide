#include <metal_stdlib>
using namespace metal;

struct Shape {
    uint length, tile_width, tile_count, query_count, omit_old_scale;
};

// Store one local (maximum, denominator, weighted value x/y) per query and tile.
kernel void tile_stats(device const float *scores [[buffer(0)]],
                       device const float2 *values [[buffer(1)]],
                       device const uint *prefixes [[buffer(2)]],
                       device float4 *stats [[buffer(3)]],
                       constant Shape &shape [[buffer(5)]],
                       uint index [[thread_position_in_grid]]) {
    const uint query = index / shape.tile_count;
    if (query >= shape.query_count) return;
    const uint first = (index % shape.tile_count) * shape.tile_width;
    const uint end = min(min(first + shape.tile_width, shape.length), prefixes[query]);
    float maximum = -INFINITY;
    for (uint i = first; i < end; ++i) maximum = max(maximum, scores[i]);
    float denominator = 0.0f;
    float2 weighted = float2(0.0f);
    for (uint i = first; i < end; ++i) {
        const float weight = exp(scores[i] - maximum);
        denominator += weight;
        weighted += weight * values[i];
    }
    stats[index] = float4(maximum, denominator, weighted);
}

kernel void merge_tiles(device const float4 *stats [[buffer(3)]],
                        device float *result [[buffer(4)]],
                        constant Shape &shape [[buffer(5)]],
                        uint query [[thread_position_in_grid]]) {
    if (query >= shape.query_count) return;
    float maximum = -INFINITY;
    float denominator = 0.0f;
    float2 weighted = float2(0.0f);
    for (uint tile = 0; tile < shape.tile_count; ++tile) {
        const float4 part = stats[query * shape.tile_count + tile];
        if (part.y == 0.0f) continue;
        const float next_maximum = max(maximum, part.x);
        const float old_scale = shape.omit_old_scale ? 1.0f : exp(maximum - next_maximum);
        const float new_scale = exp(part.x - next_maximum);
        denominator = denominator * old_scale + part.y * new_scale;
        weighted = weighted * old_scale + part.zw * new_scale;
        maximum = next_maximum;
    }
    const uint i = 6 * query;
    result[i] = maximum;
    result[i + 1] = denominator;
    result[i + 2] = weighted.x;
    result[i + 3] = weighted.y;
    result[i + 4] = weighted.x / denominator;
    result[i + 5] = weighted.y / denominator;
}
