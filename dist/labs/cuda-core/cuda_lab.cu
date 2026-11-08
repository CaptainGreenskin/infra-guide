// Original educational CUDA kernels. Compilation alone is not GPU execution.
#include <cuda_runtime.h>
#include <math_constants.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifndef GUIDE_SOURCE_SHA256
#define GUIDE_SOURCE_SHA256 "unbound"
#endif
constexpr int SUM_THREADS = 256;
constexpr int SOFTMAX_THREADS = 128;
constexpr int TILE = 16;

// One block owns a complete row; inactive lanes contribute the additive identity.
extern "C" __global__ void row_sum_kernel(const float* x, float* y, int cols) {
    __shared__ float partial[SUM_THREADS];
    const int row = blockIdx.x, lane = threadIdx.x;
    float sum = 0.0f;
    for (int col = lane; col < cols; col += SUM_THREADS)
        sum += x[static_cast<size_t>(row) * cols + col];
    partial[lane] = sum;
    __syncthreads();
    for (int stride = SUM_THREADS / 2; stride > 0; stride /= 2) {
        if (lane < stride) partial[lane] += partial[lane + stride];
        __syncthreads();
    }
    if (lane == 0) y[row] = partial[0];
}

// Separate shared arrays retain max until every lane has consumed it.
extern "C" __global__ void row_softmax_kernel(const float* x, float* y,
                                              int cols, bool normalize) {
    __shared__ float maxima[SOFTMAX_THREADS];
    __shared__ float totals[SOFTMAX_THREADS];
    const int row = blockIdx.x, lane = threadIdx.x;
    const size_t offset = static_cast<size_t>(row) * cols;
    float maximum = -CUDART_INF_F;
    for (int col = lane; col < cols; col += SOFTMAX_THREADS)
        maximum = fmaxf(maximum, x[offset + col]);
    maxima[lane] = maximum;
    __syncthreads();
    for (int stride = SOFTMAX_THREADS / 2; stride > 0; stride /= 2) {
        if (lane < stride) maxima[lane] = fmaxf(maxima[lane], maxima[lane + stride]);
        __syncthreads();
    }
    maximum = maxima[0];
    float total = 0.0f;
    for (int col = lane; col < cols; col += SOFTMAX_THREADS)
        total += expf(x[offset + col] - maximum);
    totals[lane] = total;
    __syncthreads();
    for (int stride = SOFTMAX_THREADS / 2; stride > 0; stride /= 2) {
        if (lane < stride) totals[lane] += totals[lane + stride];
        __syncthreads();
    }
    const float denominator = totals[0];
    for (int col = lane; col < cols; col += SOFTMAX_THREADS) {
        const float numerator = expf(x[offset + col] - maximum);
        y[offset + col] = normalize ? numerator / denominator : numerator;
    }
}

// Out-of-range lanes still load zeros and participate in both barriers.
extern "C" __global__ void tiled_matmul_kernel(const float* a, const float* b,
                                               float* c, int m, int k, int n) {
    __shared__ float a_tile[TILE][TILE];
    __shared__ float b_tile[TILE][TILE];
    const int row = blockIdx.y * TILE + threadIdx.y;
    const int col = blockIdx.x * TILE + threadIdx.x;
    float value = 0.0f;
    for (int base = 0; base < k; base += TILE) {
        const int a_col = base + threadIdx.x, b_row = base + threadIdx.y;
        a_tile[threadIdx.y][threadIdx.x] = (row < m && a_col < k)
            ? a[static_cast<size_t>(row) * k + a_col] : 0.0f;
        b_tile[threadIdx.y][threadIdx.x] = (b_row < k && col < n)
            ? b[static_cast<size_t>(b_row) * n + col] : 0.0f;
        __syncthreads();
        for (int inner = 0; inner < TILE; ++inner)
            value = fmaf(a_tile[threadIdx.y][inner], b_tile[inner][threadIdx.x], value);
        __syncthreads();
    }
    if (row < m && col < n) c[static_cast<size_t>(row) * n + col] = value;
}

static void require(bool condition, const std::string& message) {
    if (!condition) throw std::runtime_error(message);
}
static void checked(cudaError_t error, const char* operation) {
    if (error != cudaSuccess)
        throw std::runtime_error(std::string(operation) + ": " + cudaGetErrorString(error));
}
struct Buffer {
    float* data = nullptr;
    explicit Buffer(size_t elements) {
        require(elements > 0 && elements <= std::numeric_limits<size_t>::max() / sizeof(float), "invalid_allocation_size");
        checked(cudaMalloc(reinterpret_cast<void**>(&data), elements * sizeof(float)), "cudaMalloc");
    }
    ~Buffer() { if (data) (void)cudaFree(data); }
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;
};
static std::string quoted(const std::string& value) {
    std::ostringstream out;
    out << '"';
    for (unsigned char ch : value) {
        if (ch == '"' || ch == '\\') out << '\\' << ch;
        else if (ch < 32) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << unsigned(ch) << std::dec;
        else out << ch;
    }
    out << '"';
    return out.str();
}
template <typename T> static std::string array(const std::vector<T>& values) {
    std::ostringstream out;
    out << std::setprecision(17) << '[';
    for (size_t i = 0; i < values.size(); ++i) { if (i) out << ','; out << values[i]; }
    out << ']';
    return out.str();
}
static void emit(const std::string& report, const std::string& filename) {
    if (!filename.empty()) {
        std::ofstream file(filename);
        require(bool(file), "cannot_open_output");
        file << report << '\n';
        require(bool(file), "cannot_write_output");
    }
    std::cout << report << '\n';
}
static std::vector<float> rows(int count, int cols) {
    std::vector<float> x(static_cast<size_t>(count) * cols);
    for (int row = 0; row < count; ++row)
        for (int col = 0; col < cols; ++col)
            x[static_cast<size_t>(row) * cols + col] = (((row + 1) * 11 + col * 7) % 29 - 14) / 4.0f + row * 0.125f;
    return x;
}
static std::vector<double> sum_reference(const std::vector<float>& x, int count, int cols) {
    std::vector<double> y(count, 0.0);
    for (int row = 0; row < count; ++row)
        for (int col = 0; col < cols; ++col) y[row] += double(x[static_cast<size_t>(row) * cols + col]);
    return y;
}
static std::vector<double> softmax_reference(const std::vector<float>& x, int count, int cols) {
    std::vector<double> y(x.size());
    for (int row = 0; row < count; ++row) {
        const size_t base = static_cast<size_t>(row) * cols;
        double maximum = x[base], total = 0;
        for (int col = 1; col < cols; ++col) maximum = std::max(maximum, double(x[base + col]));
        for (int col = 0; col < cols; ++col) { y[base + col] = std::exp(double(x[base + col]) - maximum); total += y[base + col]; }
        for (int col = 0; col < cols; ++col) y[base + col] /= total;
    }
    return y;
}
static double max_error(const std::vector<float>& actual, const std::vector<double>& expected) {
    require(actual.size() == expected.size(), "output_size_mismatch");
    double maximum = 0;
    for (size_t i = 0; i < actual.size(); ++i) {
        require(std::isfinite(actual[i]), "nonfinite_device_output");
        maximum = std::max(maximum, std::abs(double(actual[i]) - expected[i]));
    }
    return maximum;
}
static bool agrees(const std::vector<float>& actual, const std::vector<double>& expected) {
    if (actual.size() != expected.size()) return false;
    for (size_t i = 0; i < actual.size(); ++i)
        if (!std::isfinite(actual[i]) || std::abs(double(actual[i]) - expected[i]) > 1e-5 + 1e-5 * std::abs(expected[i])) return false;
    return true;
}
static std::vector<float> run_rows(const std::vector<float>& x, int count, int cols, bool softmax, bool normalize = true) {
    const size_t size = softmax ? x.size() : static_cast<size_t>(count);
    Buffer input(x.size()), output(size);
    checked(cudaMemcpy(input.data, x.data(), x.size() * sizeof(float), cudaMemcpyHostToDevice), "copy_rows_to_device");
    if (softmax) row_softmax_kernel<<<count, SOFTMAX_THREADS>>>(input.data, output.data, cols, normalize);
    else row_sum_kernel<<<count, SUM_THREADS>>>(input.data, output.data, cols);
    checked(cudaGetLastError(), "row_kernel_launch");
    checked(cudaDeviceSynchronize(), "row_kernel_execution");
    std::vector<float> actual(size);
    checked(cudaMemcpy(actual.data(), output.data, size * sizeof(float), cudaMemcpyDeviceToHost), "copy_rows_to_host");
    return actual;
}
struct MatrixResult { std::vector<float> actual; std::vector<double> expected; };
static MatrixResult run_gemm(int m, int k, int n) {
    std::vector<float> a(static_cast<size_t>(m) * k), b(static_cast<size_t>(k) * n);
    for (int row = 0; row < m; ++row) for (int col = 0; col < k; ++col)
        a[static_cast<size_t>(row) * k + col] = ((row * 3 + col * 5) % 17 - 8) / 8.0f;
    for (int row = 0; row < k; ++row) for (int col = 0; col < n; ++col)
        b[static_cast<size_t>(row) * n + col] = ((row * 7 + col * 2) % 19 - 9) / 16.0f;
    Buffer da(a.size()), db(b.size()), dc(static_cast<size_t>(m) * n);
    checked(cudaMemcpy(da.data, a.data(), a.size() * sizeof(float), cudaMemcpyHostToDevice), "copy_a");
    checked(cudaMemcpy(db.data, b.data(), b.size() * sizeof(float), cudaMemcpyHostToDevice), "copy_b");
    const dim3 block(TILE, TILE), grid((n + TILE - 1) / TILE, (m + TILE - 1) / TILE);
    tiled_matmul_kernel<<<grid, block>>>(da.data, db.data, dc.data, m, k, n);
    checked(cudaGetLastError(), "gemm_launch");
    checked(cudaDeviceSynchronize(), "gemm_execution");
    MatrixResult result{std::vector<float>(static_cast<size_t>(m) * n), std::vector<double>(static_cast<size_t>(m) * n, 0.0)};
    checked(cudaMemcpy(result.actual.data(), dc.data, result.actual.size() * sizeof(float), cudaMemcpyDeviceToHost), "copy_c");
    for (int row = 0; row < m; ++row) for (int col = 0; col < n; ++col)
        for (int inner = 0; inner < k; ++inner)
            result.expected[static_cast<size_t>(row) * n + col] += double(a[static_cast<size_t>(row) * k + inner]) * double(b[static_cast<size_t>(inner) * n + col]);
    return result;
}
static std::string result(const std::string& name, const std::vector<int>& shape,
                          const std::vector<float>& actual, const std::vector<double>& expected,
                          bool include_values = true) {
    require(agrees(actual, expected), "numerical_mismatch:" + name);
    std::ostringstream out;
    out << std::setprecision(17) << "{\"fixture\":" << quoted(name) << ",\"shape\":" << array(shape)
        << ",\"elements\":" << actual.size() << ",\"max_abs_error\":" << max_error(actual, expected)
        << ",\"values\":" << (include_values ? array(actual) : "[]") << '}';
    return out.str();
}
int main(int argc, char** argv) {
    std::string filename;
    bool probe_only = false, profile_gemm = false;
    try {
        for (int i = 1; i < argc; ++i) {
            const std::string arg = argv[i];
            if (arg == "--help") {
                std::cout << "cuda_lab [--json FILE] [--probe-only | --profile-gemm]\n"
                             "Default: 13 small GPU correctness fixtures plus a bad-softmax rejection.\n"
                             "--probe-only queries availability without launching a kernel.\n"
                             "--profile-gemm selects one 512x512 GEMM, not the complete correctness suite.\n";
                return 0;
            } else if (arg == "--json" && i + 1 < argc) filename = argv[++i];
            else if (arg == "--probe-only") probe_only = true;
            else if (arg == "--profile-gemm") profile_gemm = true;
            else throw std::runtime_error("unknown_or_incomplete_argument:" + arg);
        }
        require(!(probe_only && profile_gemm), "choose_probe_or_profile");
        int device_count = 0;
        const auto probe = cudaGetDeviceCount(&device_count);
        if (probe_only || probe != cudaSuccess || device_count == 0) {
            const bool available = probe == cudaSuccess && device_count > 0;
            emit("{\"status\":" + quoted(available ? "device-detected" : "not-run") +
                 ",\"device_execution\":false,\"device_count\":" + std::to_string(device_count) +
                 ",\"source_sha256\":" + quoted(GUIDE_SOURCE_SHA256) +
                 ",\"cuda_probe\":" + quoted(cudaGetErrorString(probe)) + "}", filename);
            return available ? 0 : 2;
        }
        checked(cudaSetDevice(0), "select_device");
        cudaDeviceProp device{};
        checked(cudaGetDeviceProperties(&device, 0), "device_properties");
        require(device.major >= 8, "requires_compute_capability_8_or_newer");
        require(device.maxThreadsPerBlock >= 256 && device.sharedMemPerBlock >= 2048, "insufficient_block_resources");
        int runtime = 0, driver = 0;
        checked(cudaRuntimeGetVersion(&runtime), "runtime_version");
        checked(cudaDriverGetVersion(&driver), "driver_version");
        std::vector<std::string> results;
        std::vector<float> wrong;
        if (profile_gemm) {
            const auto g = run_gemm(512, 512, 512);
            results.push_back(result("profile-gemm-512", {512,512,512}, g.actual, g.expected, false));
        } else {
            for (int cols : {1, 5, 129, 257}) {
                const auto x = rows(3, cols);
                results.push_back(result("sum-" + std::to_string(cols), {3,cols}, run_rows(x,3,cols,false), sum_reference(x,3,cols)));
                results.push_back(result("softmax-" + std::to_string(cols), {3,cols}, run_rows(x,3,cols,true), softmax_reference(x,3,cols)));
            }
            const std::vector<float> extreme{1000,1001,999,-1000,0};
            const auto reference = softmax_reference(extreme,1,5);
            results.push_back(result("softmax-extreme", {1,5}, run_rows(extreme,1,5,true), reference));
            wrong = run_rows(extreme,1,5,true,false);
            require(!agrees(wrong,reference), "negative_control_was_not_rejected");
            for (const std::vector<int> shape : {std::vector<int>{1,1,1}, {17,19,13}, {32,32,32}, {31,33,29}}) {
                const auto g = run_gemm(shape[0],shape[1],shape[2]);
                results.push_back(result("gemm-" + std::to_string(shape[0]) + "-" + std::to_string(shape[1]) + "-" + std::to_string(shape[2]), shape, g.actual, g.expected));
            }
        }
        std::ostringstream report;
        report << "{\"schema_version\":1,\"status\":\"passed\",\"device_execution\":true,\"profile_only\":"
               << (profile_gemm ? "true" : "false") << ",\"source_sha256\":" << quoted(GUIDE_SOURCE_SHA256)
               << ",\"cuda_runtime_version\":" << runtime << ",\"driver_version\":" << driver
               << ",\"device\":{\"name\":" << quoted(device.name) << ",\"compute_capability\":[" << device.major << ',' << device.minor
               << "]},\"atol\":1e-5,\"rtol\":1e-5,\"cases\":[";
        for (size_t i=0;i<results.size();++i) { if (i) report << ','; report << results[i]; }
        report << "],\"negative_control\":{\"kind\":\"skip_normalization\",\"executed\":"
               << (profile_gemm ? "false" : "true") << ",\"observed\":" << array(wrong) << "}}";
        emit(report.str(),filename);
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "cuda_lab: " << error.what() << '\n';
        return 1;
    }
}
