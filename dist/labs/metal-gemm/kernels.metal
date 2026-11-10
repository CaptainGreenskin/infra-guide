#include <metal_stdlib>
using namespace metal;

struct Dimensions {
    uint m;
    uint n;
    uint k;
};

kernel void gemm_naive(device const float *a [[buffer(0)]],
                       device const float *b [[buffer(1)]],
                       device float *c [[buffer(2)]],
                       constant Dimensions &shape [[buffer(3)]],
                       uint2 position [[thread_position_in_grid]]) {
    const uint row = position.y, col = position.x;
    if (row >= shape.m || col >= shape.n) return;
    float sum = 0.0f;
    for (uint k = 0; k < shape.k; ++k) {
        sum += a[row * shape.k + k] * b[k * shape.n + col];
    }
    c[row * shape.n + col] = sum;
}

#define TILE 16

kernel void gemm_tiled(device const float *a [[buffer(0)]],
                       device const float *b [[buffer(1)]],
                       device float *c [[buffer(2)]],
                       constant Dimensions &shape [[buffer(3)]],
                       uint2 group [[threadgroup_position_in_grid]],
                       uint2 lane [[thread_position_in_threadgroup]]) {
    threadgroup float a_tile[TILE][TILE];
    threadgroup float b_tile[TILE][TILE];
    const uint row = group.y * TILE + lane.y;
    const uint col = group.x * TILE + lane.x;
    float sum = 0.0f;
    for (uint base = 0; base < shape.k; base += TILE) {
        const uint ak = base + lane.x, bk = base + lane.y;
        a_tile[lane.y][lane.x] = row < shape.m && ak < shape.k ? a[row * shape.k + ak] : 0.0f;
        b_tile[lane.y][lane.x] = bk < shape.k && col < shape.n ? b[bk * shape.n + col] : 0.0f;
        // Even threads outside the output matrix take both barriers.
        threadgroup_barrier(mem_flags::mem_threadgroup);
        for (uint k = 0; k < TILE; ++k) {
            sum += a_tile[lane.y][k] * b_tile[k][lane.x];
        }
        threadgroup_barrier(mem_flags::mem_threadgroup);
    }
    if (row < shape.m && col < shape.n) c[row * shape.n + col] = sum;
}
