import CryptoKit
import Foundation
import Metal

struct LabError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func require<T>(_ value: T?, _ description: String) throws -> T {
    guard let value else { throw LabError(description) }
    return value
}

struct Dimensions {
    var m: UInt32, n: UInt32, k: UInt32
}

struct Shape {
    let m: Int, n: Int, k: Int
    init(_ m: Int, _ n: Int, _ k: Int) { self.m = m; self.n = n; self.k = k }
    var fields: [String: Int] { ["m": m, "n": n, "k": k] }
    var label: String { "\(m)x\(n)x\(k)" }
    var elements: Int { m * n }
}

struct Buffers {
    let a: MTLBuffer, b: MTLBuffer, c: MTLBuffer
}

let tile = 16
let guardCount = 8
let sentinel: Float = -777
let implementations = ["naive", "tiled"]

func inputs(_ shape: Shape) -> ([Float], [Float]) {
    let a = (0..<(shape.m * shape.k)).map { index -> Float in
        let row = index / shape.k, k = index % shape.k
        return Float((row * 3 + k * 7 + 1) % 17 - 8) / 16
    }
    let b = (0..<(shape.k * shape.n)).map { index -> Float in
        let k = index / shape.n, col = index % shape.n
        return Float((k * 5 + col * 11 + 2) % 19 - 9) / 16
    }
    return (a, b)
}

func reference(_ shape: Shape, _ a: [Float], _ b: [Float]) -> [Double] {
    // Direct Double dot products, independent of both GPU kernels' tile layout.
    var result = [Double](repeating: 0, count: shape.elements)
    for row in 0..<shape.m {
        for col in 0..<shape.n {
            var sum = 0.0
            for k in 0..<shape.k {
                sum += Double(a[row * shape.k + k]) * Double(b[k * shape.n + col])
            }
            result[row * shape.n + col] = sum
        }
    }
    return result
}

func buffer(_ device: MTLDevice, _ values: [Float]) throws -> MTLBuffer {
    try require(values.withUnsafeBytes { bytes in
        device.makeBuffer(bytes: bytes.baseAddress!, length: bytes.count, options: .storageModeShared)
    }, "Metal input buffer allocation failed")
}

func allocate(_ device: MTLDevice, _ shape: Shape, _ a: [Float], _ b: [Float]) throws -> Buffers {
    let c = try require(device.makeBuffer(length: (shape.elements + guardCount) * MemoryLayout<Float>.stride,
                                          options: .storageModeShared), "Metal output buffer allocation failed")
    return try Buffers(a: buffer(device, a), b: buffer(device, b), c: c)
}

func launch(_ queue: MTLCommandQueue, _ pipeline: MTLComputePipelineState, _ shape: Shape,
            _ buffers: Buffers) throws -> Double {
    let command = try require(queue.makeCommandBuffer(), "Metal command buffer unavailable")
    let encoder = try require(command.makeComputeCommandEncoder(), "Metal compute encoder unavailable")
    encoder.setComputePipelineState(pipeline)
    encoder.setBuffer(buffers.a, offset: 0, index: 0)
    encoder.setBuffer(buffers.b, offset: 0, index: 1)
    encoder.setBuffer(buffers.c, offset: 0, index: 2)
    var dims = Dimensions(m: UInt32(shape.m), n: UInt32(shape.n), k: UInt32(shape.k))
    withUnsafeBytes(of: &dims) { bytes in encoder.setBytes(bytes.baseAddress!, length: bytes.count, index: 3) }
    encoder.dispatchThreadgroups(MTLSize(width: (shape.n + tile - 1) / tile,
                                         height: (shape.m + tile - 1) / tile, depth: 1),
                                 threadsPerThreadgroup: MTLSize(width: tile, height: tile, depth: 1))
    encoder.endEncoding()
    command.commit()
    command.waitUntilCompleted()
    guard command.status == .completed else { throw LabError("Metal command failed: \(String(describing: command.error))") }
    let span = (command.gpuEndTime - command.gpuStartTime) * 1_000_000
    guard span.isFinite, span > 0 else { throw LabError("Metal GPU timestamp unavailable") }
    return span
}

func checkOutput(_ output: MTLBuffer, _ expected: [Double]) throws -> [String: Any] {
    let actual = output.contents().assumingMemoryBound(to: Float.self)
    var maxError = 0.0
    for (index, wanted) in expected.enumerated() {
        let got = Double(actual[index])
        guard got.isFinite, got == wanted else { throw LabError("output[\(index)] expected \(wanted), got \(got)") }
        maxError = max(maxError, abs(got - wanted))
    }
    let guards = (expected.count..<(expected.count + guardCount)).map { actual[$0] }
    guard guards.allSatisfy({ $0 == sentinel }) else { throw LabError("Metal wrote beyond the logical output") }
    let indexes = Array(Set([0, expected.count / 2, expected.count - 1])).sorted()
    return ["checked": expected.count, "max_abs_error": maxError, "tail_guard_values": guards,
            "probes": indexes.map { ["index": $0, "value": Double(actual[$0])] as [String: Any] }]
}

func validate(_ queue: MTLCommandQueue, _ states: [String: MTLComputePipelineState],
              _ shape: Shape, _ buffers: Buffers, _ expected: [Double]) throws -> [String: Any] {
    var results = [String: Any]()
    for name in implementations {
        let output = buffers.c.contents().assumingMemoryBound(to: Float.self)
        for i in 0..<(shape.elements + guardCount) { output[i] = sentinel }
        _ = try launch(queue, states[name]!, shape, buffers)
        results[name] = try checkOutput(buffers.c, expected)
    }
    return ["shape": shape.fields, "kernels": results]
}

func digest(_ file: String) throws -> String {
    SHA256.hash(data: try Data(contentsOf: URL(fileURLWithPath: file))).map { String(format: "%02x", $0) }.joined()
}

func run() throws -> [String: Any] {
    let device = try require(MTLCreateSystemDefaultDevice(), "no available Metal GPU")
    let queue = try require(device.makeCommandQueue(), "Metal command queue unavailable")
    let options = MTLCompileOptions()
    options.languageVersion = .version3_0
    if #available(macOS 15.0, *) {
        options.mathMode = .safe
        options.mathFloatingPointFunctions = .precise
    } else {
        options.fastMathEnabled = false
    }
    let source = try String(contentsOfFile: "kernels.metal", encoding: .utf8)
    let library = try device.makeLibrary(source: source, options: options)
    var states = [String: MTLComputePipelineState]()
    for name in implementations {
        let function = try require(library.makeFunction(name: "gemm_" + name), "missing Metal kernel: " + name)
        let state = try device.makeComputePipelineState(function: function)
        guard state.maxTotalThreadsPerThreadgroup >= tile * tile else { throw LabError("device cannot run a 16x16 threadgroup") }
        states[name] = state
    }

    let shapes = [Shape(1, 1, 1), Shape(17, 19, 13), Shape(32, 32, 32), Shape(31, 33, 29), Shape(35, 67, 19)]
    var validation = [String: Any]()
    for shape in shapes {
        let (a, b) = inputs(shape)
        let buffers = try allocate(device, shape, a, b)
        validation[shape.label] = try validate(queue, states, shape, buffers, reference(shape, a, b))
    }

    let shape = Shape(512, 512, 512)
    let (a, b) = inputs(shape)
    let buffers = try allocate(device, shape, a, b)
    let expected = reference(shape, a, b)
    validation[shape.label] = try validate(queue, states, shape, buffers, expected)
    let warmup = 3, count = 9
    for _ in 0..<warmup {
        for name in implementations { _ = try launch(queue, states[name]!, shape, buffers) }
    }
    var pairs = [[String: Any]]()
    var samples = ["naive": [Double](), "tiled": [Double]()]
    for index in 0..<count {
        let order = index % 2 == 0 ? implementations : Array(implementations.reversed())
        var spans = [String: Double]()
        for name in order {
            let span = try launch(queue, states[name]!, shape, buffers)
            spans[name] = span
            samples[name, default: []].append(span)
        }
        pairs.append(["sample": index + 1, "order": order, "gpu_us": spans])
    }
    _ = try checkOutput(buffers.c, expected)

    let resources = states.mapValues { ["thread_execution_width": $0.threadExecutionWidth,
                                        "max_threads_per_threadgroup": $0.maxTotalThreadsPerThreadgroup,
                                        "static_threadgroup_bytes": $0.staticThreadgroupMemoryLength] }
    let medians = samples.mapValues { $0.sorted()[$0.count / 2] }
    let ranges = samples.mapValues { ["min": $0.min()!, "max": $0.max()!] }
    let ratios = zip(samples["naive"]!, samples["tiled"]!).map { pair in pair.0 / pair.1 }.sorted()
    let hashes = try Dictionary(uniqueKeysWithValues: ["metal_gemm.swift", "kernels.metal", "README.md"].map { ($0, try digest($0)) })
    return ["status": "passed", "environment": ["device": device.name, "unified_memory": device.hasUnifiedMemory,
                                                 "os": ProcessInfo.processInfo.operatingSystemVersionString,
                                                 "metal_language": "3.0", "float_math": "precise"],
            "fixture": ["dtype": "float32", "threadgroup": [tile, tile], "tail_guard_count": guardCount],
            "resources": resources, "validation": validation,
            "benchmark": ["shape": shape.fields, "warmups_per_kernel": warmup, "pairs": pairs,
                          "median_gpu_us": medians, "range_gpu_us": ranges,
                          "median_paired_naive_over_tiled": ratios[ratios.count / 2],
                          "dispatches_per_command_buffer": 1],
            "source_sha256": hashes,
            "scope": "Same Apple Metal device and shared buffers, row-major synthetic FP32, exact Double oracle. Measured GPU command-buffer spans for one dispatch. End-to-end timing, CUDA and Nsight require separate measurements."]
}

do {
    let json = try JSONSerialization.data(withJSONObject: run(), options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: json, as: UTF8.self))
} catch {
    FileHandle.standardError.write(Data(("\(error)\n").utf8))
    exit(1)
}
