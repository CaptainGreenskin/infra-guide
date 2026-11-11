import CryptoKit
import Foundation
import Metal

struct LabError: Error, CustomStringConvertible {
    let description: String
}

func require<T>(_ value: T?, _ message: String) throws -> T {
    guard let value else { throw LabError(description: message) }
    return value
}

func check(_ condition: Bool, _ message: String) throws {
    guard condition else { throw LabError(description: message) }
}

struct Shape {
    var length, tileWidth, tileCount, queryCount, omitOldScale: UInt32
}

let length = 2053, peak = 1537
let prefixes: [UInt32] = [1025, 2053]
let widths = [128, 257]
let sentinel: Float = -777
let guardCount = 4
let threads = 32

func buffer<T>(_ device: MTLDevice, _ values: [T]) throws -> MTLBuffer {
    try require(values.withUnsafeBytes {
        device.makeBuffer(bytes: $0.baseAddress!, length: $0.count, options: .storageModeShared)
    }, "cannot allocate input buffer")
}

func launch(_ queue: MTLCommandQueue, _ pipeline: MTLComputePipelineState,
            _ buffers: [MTLBuffer], _ input: Shape, _ count: Int) throws {
    let command = try require(queue.makeCommandBuffer(), "missing command buffer")
    let encoder = try require(command.makeComputeCommandEncoder(), "missing compute encoder")
    encoder.setComputePipelineState(pipeline)
    for (index, value) in buffers.enumerated() { encoder.setBuffer(value, offset: 0, index: index) }
    var shape = input
    withUnsafeBytes(of: &shape) { encoder.setBytes($0.baseAddress!, length: $0.count, index: buffers.count) }
    encoder.dispatchThreads(MTLSize(width: count, height: 1, depth: 1),
                            threadsPerThreadgroup: MTLSize(width: threads, height: 1, depth: 1))
    encoder.endEncoding()
    command.commit()
    command.waitUntilCompleted()
    try check(command.status == .completed && command.gpuEndTime > command.gpuStartTime,
              "Metal did not complete: \(String(describing: command.error))")
}

func reference(_ scores: [Float], _ values: [Float], _ range: Range<Int>) -> [Double] {
    // Direct dense Float64 oracle: use the maximum of the whole allowed range.
    let maximum = Double(scores[range].max()!)
    var denominator = 0.0, x = 0.0, y = 0.0
    for index in range {
        let weight = exp(Double(scores[index]) - maximum)
        denominator += weight
        x += weight * Double(values[2 * index])
        y += weight * Double(values[2 * index + 1])
    }
    return [maximum, denominator, x, y]
}

func checkStats(_ actual: [Double], _ expected: [Double]) throws {
    for (value, ref) in zip(actual, expected) {
        try check(value.isFinite && abs(value - ref) <= 1e-5 * max(abs(ref), 1), "GPU and Double oracle disagree")
    }
}

func digest(_ name: String) throws -> String {
    SHA256.hash(data: try Data(contentsOf: URL(fileURLWithPath: name))).map { String(format: "%02x", $0) }.joined()
}

func run() throws -> [String: Any] {
    let device = try require(MTLCreateSystemDefaultDevice(), "no available Metal GPU")
    let queue = try require(device.makeCommandQueue(), "no Metal queue")
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
    let tilePipeline = try device.makeComputePipelineState(function: require(library.makeFunction(name: "tile_stats"), "no tile kernel"))
    let mergePipeline = try device.makeComputePipelineState(function: require(library.makeFunction(name: "merge_tiles"), "no merge kernel"))

    let scores = (0..<length).map { $0 == peak ? Float(36) : Float(($0 * 13) % 19 - 9) / 4 }
    let values = (0..<length).flatMap { i -> [Float] in
        if i == peak { return [7, -3] }
        return [Float((i * 5) % 23 - 11) / 8, Float((i * 7) % 29 - 14) / 8]
    }
    let input = try [buffer(device, scores), buffer(device, values), buffer(device, prefixes)]
    let rows = prefixes.count, outputCount = rows * 6
    var cases = [[String: Any]]()
    for width in widths {
        let tiles = (length + width - 1) / width
        let stats = try buffer(device, Array(repeating: sentinel, count: rows * tiles * 4))
        let output = try buffer(device, Array(repeating: sentinel, count: outputCount + guardCount))
        let buffers = input + [stats, output]
        var shape = Shape(length: UInt32(length), tileWidth: UInt32(width), tileCount: UInt32(tiles),
                          queryCount: UInt32(rows), omitOldScale: 0)
        try launch(queue, tilePipeline, buffers, shape, rows * tiles)
        try launch(queue, mergePipeline, buffers, shape, rows)
        let tileData = stats.contents().assumingMemoryBound(to: Float.self)
        let result = output.contents().assumingMemoryBound(to: Float.self)
        let positive = (0..<outputCount).map { Double(result[$0]) }
        let positiveGuards = (outputCount..<(outputCount + guardCount)).map { result[$0] }
        shape.omitOldScale = 1
        try launch(queue, mergePipeline, buffers, shape, rows)
        let negativeGuards = (outputCount..<(outputCount + guardCount)).map { result[$0] }
        try check((positiveGuards + negativeGuards).allSatisfy { $0 == sentinel }, "output guard was overwritten")

        var queries = [[String: Any]]()
        for (row, prefix) in prefixes.map(Int.init).enumerated() {
            let active = (prefix + width - 1) / width
            var blockProbes = [[String: Any]]()
            for tile in 0..<tiles {
                let begin = tile * width, end = min(begin + width, prefix)
                let index = 4 * (row * tiles + tile)
                let got = (index..<(index + 4)).map { Double(tileData[$0]) }
                if begin >= end {
                    try check(got[0] == -.infinity && Array(got.dropFirst()) == [0,0,0], "masked tile contributed")
                } else {
                    try checkStats(got, reference(scores, values, begin..<end))
                    if tile == 0 || tile == active - 1 || (prefix > peak && tile == peak / width) {
                        blockProbes.append(["tile":tile, "positions":end-begin, "maximum":got[0],
                                            "denominator":got[1], "weighted_sum":Array(got[2...3])])
                    }
                }
            }
            let dense = reference(scores, values, 0..<prefix)
            let denseOutput = dense[2...3].map { $0 / dense[1] }
            let start = row * 6
            let got = Array(positive[start..<(start + 6)])
            try checkStats(got, dense + denseOutput)
            let bad = [Double(result[start + 4]), Double(result[start + 5])]
            let error = zip(got[4...5], denseOutput).map { abs($0 - $1) }.max()!
            let badError = zip(bad, denseOutput).map { abs($0 - $1) }.max()!
            try check(prefix > peak ? badError > 1 : badError < 1e-5, "unexpected missing-rescale control")
            queries.append(["prefix":prefix, "active_tiles":active, "masked_tiles":tiles-active,
                            "maximum":got[0], "denominator":got[1], "weighted_sum":Array(got[2...3]),
                            "output":Array(got[4...5]), "dense_reference":denseOutput, "max_abs_error":error,
                            "no_old_rescale_output":bad, "no_old_rescale_max_abs_error":badError, "tile_probes":blockProbes])
        }
        cases.append(["tile_width":width, "tiles_per_query":tiles, "scratch_bytes":stats.length,
                      "positive_tail_guards":positiveGuards, "negative_tail_guards":negativeGuards, "queries":queries])
    }
    let files = ["README.md", "kernels.metal", "online_attention.swift"]
    return ["schema":"infra-metal-online-attention-v1", "status":"passed",
            "environment":["device":device.name, "os":ProcessInfo.processInfo.operatingSystemVersionString,
                           "metal_language":"3.0", "float_math":"precise"],
            "fixture":["length":length, "peak_index":peak, "prefixes":prefixes, "value_width":2, "threads":threads],
            "source_sha256":try Dictionary(uniqueKeysWithValues:files.map { ($0, try digest($0)) }),
            "cases":cases]
}

do {
    let json = try JSONSerialization.data(withJSONObject: run(), options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: json, as: UTF8.self))
} catch {
    FileHandle.standardError.write(Data(("\(error)\n").utf8))
    exit(1)
}
