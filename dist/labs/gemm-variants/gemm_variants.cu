// InfraGuide teaching kernels. All variants compute row-major FP32 C=A*B.
#include <cuda_runtime.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifndef GEMM_SOURCE_SHA256
#define GEMM_SOURCE_SHA256 "unbound"
#endif

constexpr int TILE = 16;
constexpr double ATOL = 1e-5, RTOL = 1e-5;
constexpr int WARMUP = 3, GROUPS = 9, REPEATS = 20;
constexpr std::array<const char*, 3> NAMES{"naive", "tiled", "reuse"};

extern "C" __global__ void gemm_naive_kernel(const float* a, const float* b,
                                             float* c, int m, int k, int n) {
    const int row = blockIdx.y * TILE + threadIdx.y;
    const int col = blockIdx.x * TILE + threadIdx.x;
    if (row >= m || col >= n) return;
    float value = 0.0f;
    for (int inner = 0; inner < k; ++inner)
        value = fmaf(a[row * k + inner], b[inner * n + col], value);
    c[row * n + col] = value;
}

extern "C" __global__ void gemm_tiled_kernel(const float* a, const float* b,
                                             float* c, int m, int k, int n) {
    __shared__ float a_tile[TILE][TILE], b_tile[TILE][TILE];
    const int y = threadIdx.y, x = threadIdx.x;
    const int row = blockIdx.y * TILE + y, col = blockIdx.x * TILE + x;
    float value = 0.0f;
    for (int base = 0; base < k; base += TILE) {
        a_tile[y][x] = row < m && base + x < k ? a[row * k + base + x] : 0.0f;
        b_tile[y][x] = base + y < k && col < n ? b[(base + y) * n + col] : 0.0f;
        __syncthreads();
        for (int inner = 0; inner < TILE; ++inner)
            value = fmaf(a_tile[y][inner], b_tile[inner][x], value);
        __syncthreads();
    }
    if (row < m && col < n) c[row * n + col] = value;
}

extern "C" __global__ void gemm_reuse_kernel(const float* a, const float* b,
                                             float* c, int m, int k, int n) {
    __shared__ float a_tile[2 * TILE][TILE], b_tile[TILE][TILE];
    const int y = threadIdx.y, x = threadIdx.x;
    const int row0 = blockIdx.y * (2 * TILE) + y, row1 = row0 + TILE;
    const int col = blockIdx.x * TILE + x;
    float value0 = 0.0f, value1 = 0.0f;
    for (int base = 0; base < k; base += TILE) {
        a_tile[y][x] = row0 < m && base + x < k ? a[row0 * k + base + x] : 0.0f;
        a_tile[y + TILE][x] = row1 < m && base + x < k ? a[row1 * k + base + x] : 0.0f;
        b_tile[y][x] = base + y < k && col < n ? b[(base + y) * n + col] : 0.0f;
        __syncthreads();
        for (int inner = 0; inner < TILE; ++inner) {
            const float weight = b_tile[inner][x];
            value0 = fmaf(a_tile[y][inner], weight, value0);
            value1 = fmaf(a_tile[y + TILE][inner], weight, value1);
        }
        __syncthreads();
    }
    if (row0 < m && col < n) c[row0 * n + col] = value0;
    if (row1 < m && col < n) c[row1 * n + col] = value1;
}

namespace {
void require(bool ok, const std::string& message) {
    if (!ok) throw std::runtime_error(message);
}
void checked(cudaError_t result, const char* action) {
    if (result != cudaSuccess)
        throw std::runtime_error(std::string(action) + ": " + cudaGetErrorString(result));
}

struct Shape { int m, k, n; };
constexpr std::array<Shape, 5> FIXTURES{{{1, 1, 1}, {17, 19, 13}, {32, 32, 32},
                                        {31, 33, 29}, {35, 67, 19}}};
constexpr Shape BENCH{512, 512, 512};

struct Stream {
    cudaStream_t handle{};
    Stream() { checked(cudaStreamCreateWithFlags(&handle, cudaStreamNonBlocking), "create stream"); }
    ~Stream() { cudaStreamDestroy(handle); }
    Stream(const Stream&) = delete;
    Stream& operator=(const Stream&) = delete;
};
struct Event {
    cudaEvent_t handle{};
    Event() { checked(cudaEventCreate(&handle), "create event"); }
    ~Event() { cudaEventDestroy(handle); }
    Event(const Event&) = delete;
    Event& operator=(const Event&) = delete;
};
struct Buffer {
    float* data{};
    explicit Buffer(size_t count) {
        checked(cudaMalloc(reinterpret_cast<void**>(&data), count * sizeof(float)), "allocate buffer");
    }
    ~Buffer() { cudaFree(data); }
    Buffer(const Buffer&) = delete;
    Buffer& operator=(const Buffer&) = delete;
};

struct Fixture {
    Shape shape;
    std::vector<float> a, b;
    std::vector<double> expected;
    explicit Fixture(Shape s) : shape(s), a(s.m * s.k), b(s.k * s.n), expected(s.m * s.n) {
        for (int row = 0; row < s.m; ++row)
            for (int col = 0; col < s.k; ++col)
                a[row * s.k + col] = ((row * 3 + col * 5) % 17 - 8) / 8.0f;
        for (int row = 0; row < s.k; ++row)
            for (int col = 0; col < s.n; ++col)
                b[row * s.n + col] = ((row * 7 + col * 2) % 19 - 9) / 16.0f;
        // Independent host computation. The device never receives the answer.
        for (int row = 0; row < s.m; ++row)
            for (int col = 0; col < s.n; ++col)
                for (int inner = 0; inner < s.k; ++inner)
                    expected[row * s.n + col] += double(a[row * s.k + inner]) * double(b[inner * s.n + col]);
    }
};

void upload(const Fixture& f, const Buffer& a, const Buffer& b, cudaStream_t stream) {
    checked(cudaMemcpyAsync(a.data, f.a.data(), f.a.size() * sizeof(float), cudaMemcpyHostToDevice, stream), "copy A");
    checked(cudaMemcpyAsync(b.data, f.b.data(), f.b.size() * sizeof(float), cudaMemcpyHostToDevice, stream), "copy B");
    checked(cudaStreamSynchronize(stream), "complete input copies");
}

void launch(int variant, Shape s, const Buffer& a, const Buffer& b, const Buffer& c, cudaStream_t stream) {
    const int rows = variant == 2 ? 2 * TILE : TILE;
    const dim3 grid((s.n + TILE - 1) / TILE, (s.m + rows - 1) / rows), block(TILE, TILE);
    if (variant == 0)
        gemm_naive_kernel<<<grid, block, 0, stream>>>(a.data, b.data, c.data, s.m, s.k, s.n);
    else if (variant == 1)
        gemm_tiled_kernel<<<grid, block, 0, stream>>>(a.data, b.data, c.data, s.m, s.k, s.n);
    else
        gemm_reuse_kernel<<<grid, block, 0, stream>>>(a.data, b.data, c.data, s.m, s.k, s.n);
    checked(cudaGetLastError(), NAMES[variant]);
}

struct Readback { std::vector<float> values; double max_abs_error = 0.0; };

Readback readback(const Fixture& f, const Buffer& c, int variant, cudaStream_t stream) {
    Readback result{std::vector<float>(f.expected.size())};
    checked(cudaMemcpyAsync(result.values.data(), c.data, result.values.size() * sizeof(float),
                            cudaMemcpyDeviceToHost, stream), "copy C back");
    checked(cudaStreamSynchronize(stream), "complete kernel and readback");
    for (size_t i = 0; i < f.expected.size(); ++i) {
        const double want = f.expected[i], got = result.values[i];
        const double error = std::abs(got - want);
        if (!std::isfinite(got) || error > ATOL + RTOL * std::abs(want))
            throw std::runtime_error(std::string(NAMES[variant]) + " numerical mismatch at output " + std::to_string(i));
        result.max_abs_error = std::max(result.max_abs_error, error);
    }
    return result;
}

Readback check_launch(const Fixture& f, const Buffer& a, const Buffer& b, const Buffer& c,
                     int variant, cudaStream_t stream) {
    // All-bits-one is a FP32 NaN. An unwritten output must fail validation.
    checked(cudaMemsetAsync(c.data, 0xff, f.expected.size() * sizeof(float), stream), "poison C");
    launch(variant, f.shape, a, b, c, stream);
    return readback(f, c, variant, stream);
}

std::string quote(const std::string& value) {
    std::ostringstream out;
    out << '"';
    for (unsigned char ch : value) {
        if (ch == '"' || ch == '\\') out << '\\' << ch;
        else if (ch < 32) out << "\\u00" << std::hex << std::setw(2) << std::setfill('0') << int(ch) << std::dec;
        else out << ch;
    }
    out << '"';
    return out.str();
}

void shape_json(std::ostream& out, Shape s) { out << '[' << s.m << ',' << s.k << ',' << s.n << ']'; }

void case_json(std::ostream& out, Shape s, int variant, const Readback& result, bool include_values) {
    out << "{\"variant\":" << quote(NAMES[variant]) << ",\"shape_mkn\":";
    shape_json(out, s);
    out << ",\"elements\":" << result.values.size() << ",\"max_abs_error\":" << result.max_abs_error;
    if (include_values) {
        out << ",\"values\":[";
        for (size_t i = 0; i < result.values.size(); ++i) {
            if (i) out << ',';
            out << result.values[i];
        }
        out << ']';
    }
    out << '}';
}

void validate_cases(std::ostream& out, cudaStream_t stream) {
    bool first = true;
    for (Shape shape : FIXTURES) {
        const Fixture f(shape);
        const Buffer a(f.a.size()), b(f.b.size()), c(f.expected.size());
        upload(f, a, b, stream);
        for (int variant = 0; variant < 3; ++variant) {
            if (!first) out << ',';
            first = false;
            case_json(out, shape, variant, check_launch(f, a, b, c, variant, stream), true);
        }
    }
}

void benchmark(std::ostream& out, cudaStream_t stream) {
    const Fixture f(BENCH);
    const Buffer a(f.a.size()), b(f.b.size());
    const std::array<Buffer, 3> c{Buffer(f.expected.size()), Buffer(f.expected.size()), Buffer(f.expected.size())};
    upload(f, a, b, stream);
    for (int variant = 0; variant < 3; ++variant) {
        check_launch(f, a, b, c[variant], variant, stream);
        for (int i = 0; i < WARMUP; ++i) launch(variant, BENCH, a, b, c[variant], stream);
    }
    checked(cudaStreamSynchronize(stream), "complete warmups");
    const Event start, stop;
    std::array<std::array<double, GROUPS>, 3> samples{};
    for (int group = 0; group < GROUPS; ++group) {
        for (int order = 0; order < 3; ++order) {
            const int variant = (group + order) % 3;
            checked(cudaEventRecord(start.handle, stream), "record start");
            for (int repeat = 0; repeat < REPEATS; ++repeat)
                launch(variant, BENCH, a, b, c[variant], stream);
            checked(cudaEventRecord(stop.handle, stream), "record stop");
            checked(cudaEventSynchronize(stop.handle), "wait for timed launches");
            float ms = 0.0f;
            checked(cudaEventElapsedTime(&ms, start.handle, stop.handle), "read event elapsed time");
            require(std::isfinite(ms) && ms > 0.0f, "invalid event elapsed time");
            samples[variant][group] = double(ms) / REPEATS;
        }
    }
    out << ",\"benchmark\":{\"shape_mkn\":";
    shape_json(out, BENCH);
    out << ",\"useful_flop_per_launch\":" << 2LL * BENCH.m * BENCH.k * BENCH.n
        << ",\"warmup_per_variant\":" << WARMUP << ",\"groups\":" << GROUPS
        << ",\"launches_per_group\":" << REPEATS << ",\"order_per_group\":[";
    for (int group = 0; group < GROUPS; ++group) {
        if (group) out << ',';
        out << '[' << quote(NAMES[group % 3]) << ',' << quote(NAMES[(group + 1) % 3])
            << ',' << quote(NAMES[(group + 2) % 3]) << ']';
    }
    out << "],\"variants\":[";
    for (int variant = 0; variant < 3; ++variant) {
        const auto timed_output = readback(f, c[variant], variant, stream);
        auto sorted = samples[variant];
        std::sort(sorted.begin(), sorted.end());
        if (variant) out << ',';
        out << "{\"variant\":" << quote(NAMES[variant]) << ",\"event_ms_per_launch\":[";
        for (int group = 0; group < GROUPS; ++group) {
            if (group) out << ',';
            out << samples[variant][group];
        }
        out << "],\"median_event_ms_per_launch\":" << sorted[GROUPS / 2]
            << ",\"elements_checked_after_timing\":" << timed_output.values.size()
            << ",\"max_abs_error_after_timing\":" << timed_output.max_abs_error << '}';
    }
    out << "]}";
}

void header(std::ostream& out, const std::string& mode) {
    out << std::setprecision(17) << "{\"schema_version\":1,\"mode\":" << quote(mode)
        << ",\"source_sha256\":" << quote(GEMM_SOURCE_SHA256) << ",\"nvcc_version\":["
        << __CUDACC_VER_MAJOR__ << ',' << __CUDACC_VER_MINOR__ << ',' << __CUDACC_VER_BUILD__ << ']';
}

void device_json(std::ostream& out, const cudaDeviceProp& device, int runtime, int driver) {
    out << ",\"cuda_runtime_version\":" << runtime << ",\"cuda_driver_version\":" << driver
        << ",\"device\":{\"ordinal\":0,\"name\":" << quote(device.name) << ",\"compute_capability\":["
        << device.major << ',' << device.minor << "],\"sm_count\":" << device.multiProcessorCount
        << ",\"warp_size\":" << device.warpSize << '}';
}
}  // namespace

int main(int argc, char** argv) {
    try {
        const std::string arg = argc > 1 ? argv[1] : "--validate";
        if (argc == 2 && arg == "--help") {
            std::cout << "gemm_variants [--validate | --benchmark | --profile naive|tiled|reuse | --probe-only]\n";
            return 0;
        }
        const bool profile = arg == "--profile", timing = arg == "--benchmark", probe = arg == "--probe-only";
        require(profile ? argc == 3 : argc <= 2 && (timing || probe || arg == "--validate"), "invalid arguments; see --help");
        int variant = -1;
        if (profile) {
            for (int i = 0; i < 3; ++i) if (std::string(argv[2]) == NAMES[i]) variant = i;
            require(variant >= 0, "profile variant must be naive, tiled or reuse");
        }
        std::ostringstream out;
        header(out, profile ? "profile" : timing ? "benchmark" : probe ? "probe" : "validate");
        int count = 0;
        const cudaError_t availability = cudaGetDeviceCount(&count);
        if (availability != cudaSuccess || count == 0) {
            out << ",\"status\":\"not-run\",\"device_execution\":false,\"device_count\":" << count
                << ",\"reason\":" << quote(availability == cudaSuccess ? "no CUDA device" : cudaGetErrorString(availability)) << '}';
            std::cout << out.str() << '\n';
            return 2;
        }
        checked(cudaSetDevice(0), "select CUDA device 0");
        cudaDeviceProp device{};
        checked(cudaGetDeviceProperties(&device, 0), "get device properties");
        int runtime = 0, driver = 0;
        checked(cudaRuntimeGetVersion(&runtime), "get CUDA runtime version");
        checked(cudaDriverGetVersion(&driver), "get CUDA driver version");
        device_json(out, device, runtime, driver);
        if (device.major < 8 || device.maxThreadsPerBlock < TILE * TILE || device.sharedMemPerBlock < 3072) {
            out << ",\"status\":\"not-run\",\"device_execution\":false,\"reason\":\"requires CC 8.0+ and block resources\"}";
            std::cout << out.str() << '\n';
            return 2;
        }
        if (probe) {
            std::cout << out.str() << ",\"status\":\"device-detected\",\"device_execution\":false}\n";
            return 0;
        }
        const Stream stream;
        out << ",\"status\":\"passed\",\"device_execution\":true,\"dtype\":\"float32\",\"layout\":\"row-major\""
            << ",\"atol\":" << ATOL << ",\"rtol\":" << RTOL << ",\"cases\":[";
        if (profile) {
            const Fixture f(BENCH);
            const Buffer a(f.a.size()), b(f.b.size()), c(f.expected.size());
            upload(f, a, b, stream.handle);
            case_json(out, BENCH, variant, check_launch(f, a, b, c, variant, stream.handle), false);
        } else {
            validate_cases(out, stream.handle);
        }
        out << ']';
        if (timing) benchmark(out, stream.handle);
        std::cout << out.str() << "}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "gemm_variants: " << error.what() << '\n';
        return 1;
    }
}
