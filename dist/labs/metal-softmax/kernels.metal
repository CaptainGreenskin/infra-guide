#include <metal_stdlib>
using namespace metal;

struct Shape {
    uint rows;
    uint width;
};

kernel void softmax_serial(device const float* input [[buffer(0)]],
                           device float* output [[buffer(1)]],
                           constant Shape& shape [[buffer(2)]],
                           uint row [[thread_position_in_grid]]) {
    if (row >= shape.rows) return;
    const uint start = row * shape.width;
    float maximum = -INFINITY;
    for (uint col = 0; col < shape.width; ++col) {
        maximum = max(maximum, input[start + col]);
    }
    float sum = 0.0f;
    for (uint col = 0; col < shape.width; ++col) {
        sum += exp(input[start + col] - maximum);
    }
    for (uint col = 0; col < shape.width; ++col) {
        output[start + col] = exp(input[start + col] - maximum) / sum;
    }
}

kernel void softmax_group(device const float* input [[buffer(0)]],
                          device float* output [[buffer(1)]],
                          constant Shape& shape [[buffer(2)]],
                          uint row [[threadgroup_position_in_grid]],
                          uint lane [[thread_index_in_threadgroup]]) {
    constexpr uint lanes = 64;
    const uint start = row * shape.width;
    threadgroup float maxima[lanes];
    threadgroup float sums[lanes];

    float local_max = -INFINITY;
    for (uint col = lane; col < shape.width; col += lanes) {
        local_max = max(local_max, input[start + col]);
    }
    maxima[lane] = local_max;
    threadgroup_barrier(mem_flags::mem_threadgroup);
    for (uint step = lanes / 2; step > 0; step /= 2) {
        if (lane < step) maxima[lane] = max(maxima[lane], maxima[lane + step]);
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    const float maximum = maxima[0];

    float local_sum = 0.0f;
    for (uint col = lane; col < shape.width; col += lanes) {
        local_sum += exp(input[start + col] - maximum);
    }
    sums[lane] = local_sum;
    threadgroup_barrier(mem_flags::mem_threadgroup);
    for (uint step = lanes / 2; step > 0; step /= 2) {
        if (lane < step) sums[lane] += sums[lane + step];
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    for (uint col = lane; col < shape.width; col += lanes) {
        output[start + col] = exp(input[start + col] - maximum) / sums[0];
    }
}

// Deliberately unstable. The host only dispatches this control for a single row.
kernel void softmax_unshifted(device const float* input [[buffer(0)]],
                              device float* output [[buffer(1)]],
                              constant Shape& shape [[buffer(2)]]) {
    float sum = 0.0f;
    for (uint col = 0; col < shape.width; ++col) sum += exp(input[col]);
    for (uint col = 0; col < shape.width; ++col) output[col] = exp(input[col]) / sum;
}
