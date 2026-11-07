/* Small contiguous float64 CPU kernels. Caller owns sizes, storage and non-aliasing. */
#include <math.h>
#include <stddef.h>

int row_softmax(const double *x, double *y, size_t rows, size_t cols) {
    if (!x || !y || !rows || !cols) return 1;
    /* Validate the complete input before changing output. Non-finite inputs are outside this contract. */
    for (size_t i = 0; i < rows * cols; ++i) if (!isfinite(x[i])) return 2;
    for (size_t r = 0; r < rows; ++r) {
        const double *row = x + r * cols;
        double maximum = row[0];
        for (size_t c = 1; c < cols; ++c) if (row[c] > maximum) maximum = row[c];
        double total = 0.0;
        for (size_t c = 0; c < cols; ++c) {
            y[r * cols + c] = exp(row[c] - maximum);
            total += y[r * cols + c];
        }
        for (size_t c = 0; c < cols; ++c) y[r * cols + c] /= total;
    }
    return 0;
}

double sum_tree(const double *x, size_t n, double *scratch) {
    /* scratch has n doubles and does not overlap x; n=0 returns the additive identity. */
    for (size_t i = 0; i < n; ++i) scratch[i] = x[i];
    while (n > 1) {
        size_t next = (n + 1) / 2;
        for (size_t i = 0; i < n / 2; ++i) scratch[i] = scratch[2 * i] + scratch[2 * i + 1];
        if (n % 2) scratch[next - 1] = scratch[n - 1];
        n = next;
    }
    return n ? scratch[0] : 0.0;
}

void gemm_ijk(const double *a, const double *b, double *c, size_t m, size_t k, size_t n) {
    for (size_t i = 0; i < m; ++i)
        for (size_t j = 0; j < n; ++j) {
            double total = 0.0;
            for (size_t t = 0; t < k; ++t) total += a[i * k + t] * b[t * n + j];
            c[i * n + j] = total;
        }
}

void gemm_tiled(const double *a, const double *b, double *c, size_t m, size_t k, size_t n, size_t tile) {
    /* tile must be positive. Zero first; then preserve ascending k accumulation for every output. */
    for (size_t i = 0; i < m * n; ++i) c[i] = 0.0;
    for (size_t ii = 0; ii < m; ii += tile)
        for (size_t tt = 0; tt < k; tt += tile)
            for (size_t jj = 0; jj < n; jj += tile)
                for (size_t i = ii; i < m && i < ii + tile; ++i)
                    for (size_t t = tt; t < k && t < tt + tile; ++t) {
                        const double at = a[i * k + t];
                        for (size_t j = jj; j < n && j < jj + tile; ++j)
                            c[i * n + j] += at * b[t * n + j];
                    }
}
