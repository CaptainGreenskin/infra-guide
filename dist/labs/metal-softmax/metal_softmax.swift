import CryptoKit
import Foundation
import Metal

struct LabError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

func require<T>(_ value: T?, _ message: String) throws -> T {
    guard let value else { throw LabError(message) }
    return value
}

struct Shape {
    var rows: UInt32
    var width: UInt32
    var count: Int { Int(rows) * Int(width) }
}

let threads = 64
let guardCount = 8
let sentinel: Float = -777
let names = ["serial", "group"]

func inputs(_ shape: Shape) -> [Float] {
    (0..<shape.count).map { index in
        let (row, col) = index.quotientAndRemainder(dividingBy: Int(shape.width))
        let offset: Float = row.isMultiple(of: 2) ? 512 : -512
        let variation = row.isMultiple(of: 5) ? 0 : ((row * 17 + col * 13) % 61) - 30
        return offset + Float(variation) * 0.25
    }
}

func reference(_ input: [Float], width: Int) -> [Double] {
    var output = [Double]()
    output.reserveCapacity(input.count)
    for start in stride(from: 0, to: input.count, by: width) {
        let row = input[start..<(start + width)].map(Double.init)
        let maximum = row.max()!
        let weights = row.map { exp($0 - maximum) }
        let sum = weights.reduce(0, +)
        output.append(contentsOf: weights.map { $0 / sum })
    }
    return output
}

struct Buffers {
    let input: MTLBuffer
    let output: MTLBuffer

    init(_ device: MTLDevice, _ values: [Float]) throws {
        input = try require(values.withUnsafeBytes {
            device.makeBuffer(bytes: $0.baseAddress!, length: $0.count, options: .storageModeShared)
        }, "cannot allocate Metal input")
        output = try require(device.makeBuffer(length: (values.count + guardCount) * MemoryLayout<Float>.stride,
                                              options: .storageModeShared), "cannot allocate Metal output")
    }
}

func launch(_ queue: MTLCommandQueue, _ pipeline: MTLComputePipelineState, _ shape: Shape,
            _ buffers: Buffers, groups: Int, lanes: Int) throws -> Double {
    let command = try require(queue.makeCommandBuffer(), "Metal command buffer unavailable")
    let encoder = try require(command.makeComputeCommandEncoder(), "Metal compute encoder unavailable")
    encoder.setComputePipelineState(pipeline)
    encoder.setBuffer(buffers.input, offset: 0, index: 0)
    encoder.setBuffer(buffers.output, offset: 0, index: 1)
    var dims = shape
    withUnsafeBytes(of: &dims) {
        encoder.setBytes($0.baseAddress!, length: $0.count, index: 2)
    }
    encoder.dispatchThreadgroups(MTLSize(width: groups, height: 1, depth: 1),
                                 threadsPerThreadgroup: MTLSize(width: lanes, height: 1, depth: 1))
    encoder.endEncoding()
    command.commit()
    command.waitUntilCompleted()
    guard command.status == .completed else { throw LabError("Metal command failed: \(String(describing: command.error))") }
    let span = (command.gpuEndTime - command.gpuStartTime) * 1_000_000
    guard span.isFinite, span > 0 else { throw LabError("Metal GPU timestamp unavailable") }
    return span
}

func check(_ output: MTLBuffer, expected: [Double], width: Int) throws -> [String: Any] {
    let actual = output.contents().assumingMemoryBound(to: Float.self)
    var maxError = 0.0
    var maxRowSumError = 0.0
    for start in stride(from: 0, to: expected.count, by: width) {
        var sum = 0.0
        for index in start..<(start + width) {
            let value = Double(actual[index])
            guard value.isFinite, value >= 0, value <= 1 else { throw LabError("invalid probability at \(index)") }
            maxError = max(maxError, abs(value - expected[index]))
            sum += value
        }
        maxRowSumError = max(maxRowSumError, abs(sum - 1))
    }
    guard maxError <= 3e-6, maxRowSumError <= 3e-5 else {
        throw LabError("CPU/GPU mismatch: element error \(maxError), row sum error \(maxRowSumError)")
    }
    let guards = (expected.count..<(expected.count + guardCount)).map { actual[$0] }
    guard guards.allSatisfy({ $0 == sentinel }) else { throw LabError("tail guard changed") }
    let indexes = Array(Set([0, width - 1, width, width + width / 2, 2 * width - 1, expected.count - 1])).sorted()
    let probes = indexes.map { ["index": $0, "value": Double(actual[$0])] as [String: Any] }
    return ["checked": expected.count, "max_abs_error": maxError, "max_row_sum_error": maxRowSumError,
            "tail_guards": guards, "probes": probes]
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
    func pipeline(_ name: String) throws -> MTLComputePipelineState {
        let function = try require(library.makeFunction(name: "softmax_" + name), "missing Metal kernel " + name)
        return try device.makeComputePipelineState(function: function)
    }
    let states = try Dictionary(uniqueKeysWithValues: names.map { ($0, try pipeline($0)) })
    guard states.values.allSatisfy({ $0.maxTotalThreadsPerThreadgroup >= threads }) else {
        throw LabError("device cannot run a 64-thread group")
    }
    let resources = states.mapValues {
        ["thread_execution_width": $0.threadExecutionWidth,
         "max_threads_per_threadgroup": $0.maxTotalThreadsPerThreadgroup,
         "static_threadgroup_bytes": $0.staticThreadgroupMemoryLength]
    }
    let negativeInput: [Float] = [512, 512, 512]
    let negative = try Buffers(device, negativeInput)
    _ = try launch(queue, pipeline("unshifted"), Shape(rows: 1, width: 3), negative, groups: 1, lanes: 1)
    let unstable = negative.output.contents().assumingMemoryBound(to: Float.self)
    let nonFinite = (0..<negativeInput.count).filter { !unstable[$0].isFinite }.count
    guard nonFinite == 3 else { throw LabError("unstable control did not overflow") }

    let sizes: [(UInt32, UInt32)] = [(3, 1), (5, 31), (7, 65), (9, 257), (1024, 64), (1024, 1025)]
    let warmups = 3
    var validation = [[String: Any]]()
    var benchmarks = [[String: Any]]()
    for (rows, width) in sizes {
        let shape = Shape(rows: rows, width: width)
        let values = inputs(shape)
        let buffers = try Buffers(device, values)
        let expected = reference(values, width: Int(width))
        func dispatch(_ name: String) throws -> Double {
            let groups = name == "group" ? Int(rows) : (Int(rows) + threads - 1) / threads
            return try launch(queue, states[name]!, shape, buffers, groups: groups, lanes: threads)
        }
        var results = [String: Any]()
        for name in names {
            let output = buffers.output.contents().assumingMemoryBound(to: Float.self)
            for index in 0..<(shape.count + guardCount) { output[index] = sentinel }
            _ = try dispatch(name)
            results[name] = try check(buffers.output, expected: expected, width: Int(width))
        }
        validation.append(["rows": rows, "width": width, "kernels": results])
        guard rows == 1024 else { continue }
        for _ in 0..<warmups { for name in names { _ = try dispatch(name) } }
        var pairs = [[String: Any]]()
        var spans = ["serial": [Double](), "group": [Double]()]
        for index in 0..<9 {
            let order = index.isMultiple(of: 2) ? names : Array(names.reversed())
            var pair = [String: Double]()
            for name in order {
                let elapsed = try dispatch(name)
                pair[name] = elapsed
                spans[name, default: []].append(elapsed)
            }
            pairs.append(["order": order, "gpu_us": pair])
        }
        _ = try check(buffers.output, expected: expected, width: Int(width))
        benchmarks.append(["rows": rows, "width": width, "warmups_per_kernel": warmups,
                           "dispatches_per_command_buffer": 1, "pairs": pairs,
                           "median_gpu_us": spans.mapValues { $0.sorted()[$0.count / 2] },
                           "range_gpu_us": spans.mapValues { ["min": $0.min()!, "max": $0.max()!] }])
    }

    let hashes = try Dictionary(uniqueKeysWithValues: ["metal_softmax.swift", "kernels.metal", "README.md"].map {
        ($0, try digest($0))
    })
    return ["schema": "infra-metal-softmax-v1", "status": "passed",
            "environment": ["device": device.name, "os": ProcessInfo.processInfo.operatingSystemVersionString,
                            "unified_memory": device.hasUnifiedMemory, "metal_language": "3.0", "float_math": "precise"],
            "fixture": ["dtype": "float32", "threads": threads, "tail_guard_count": guardCount],
            "source_sha256": hashes, "resources": resources, "validation": validation,
            "negative": ["input": negativeInput, "non_finite": nonFinite], "benchmarks": benchmarks]
}

do {
    let json = try JSONSerialization.data(withJSONObject: run(), options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: json, as: UTF8.self))
} catch {
    FileHandle.standardError.write(Data(("\(error)\n").utf8))
    exit(1)
}
