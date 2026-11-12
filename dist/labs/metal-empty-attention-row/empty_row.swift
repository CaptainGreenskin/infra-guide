// Appended to the pinned Metal lab helpers by empty_row.py.
func encoded(_ row: [Float]) -> [Any] {
    row.map { value in
        if value.isNaN { return "nan" }
        if value == -.infinity { return "-inf" }
        if value == .infinity { return "inf" }
        return Double(value)
    }
}

func runEmptyRow(_ kernelPath: String) throws -> [String: Any] {
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
    let source = try String(contentsOfFile: kernelPath, encoding: .utf8)
    let original = "result[i + 4] = weighted.x / denominator;\n    result[i + 5] = weighted.y / denominator;"
    let guarded = "result[i + 4] = denominator == 0.0f ? 0.0f : weighted.x / denominator;\n    result[i + 5] = denominator == 0.0f ? 0.0f : weighted.y / denominator;"
    try check(source.components(separatedBy: original).count == 2, "cannot isolate the original normalization")
    let guardedSource = source.replacingOccurrences(of: original, with: guarded)
    let oldLibrary = try device.makeLibrary(source: source, options: options)
    let newLibrary = try device.makeLibrary(source: guardedSource, options: options)
    let tilesKernel = try device.makeComputePipelineState(function: require(oldLibrary.makeFunction(name: "tile_stats"), "no tile kernel"))
    let oldMerge = try device.makeComputePipelineState(function: require(oldLibrary.makeFunction(name: "merge_tiles"), "no original merge"))
    let newMerge = try device.makeComputePipelineState(function: require(newLibrary.makeFunction(name: "merge_tiles"), "no guarded merge"))

    let (scores, values) = emptyRowFixture()
    let allPrefixes = [UInt32(0)] + prefixes
    let input = try [buffer(device, scores), buffer(device, values), buffer(device, allPrefixes)]
    let rows = allPrefixes.count, outputCount = rows * 6
    var cases = [[String: Any]]()
    for width in widths {
        let tiles = (length + width - 1) / width
        let stats = try buffer(device, Array(repeating: sentinel, count: rows * tiles * 4))
        let oldOutput = try buffer(device, Array(repeating: sentinel, count: outputCount + guardCount))
        let newOutput = try buffer(device, Array(repeating: sentinel, count: outputCount + guardCount))
        let shape = Shape(length: UInt32(length), tileWidth: UInt32(width), tileCount: UInt32(tiles),
                          queryCount: UInt32(rows), omitOldScale: 0)
        try launch(queue, tilesKernel, input + [stats, oldOutput], shape, rows * tiles)
        try launch(queue, oldMerge, input + [stats, oldOutput], shape, rows)
        try launch(queue, newMerge, input + [stats, newOutput], shape, rows)

        let tileData = stats.contents().assumingMemoryBound(to: Float.self)
        let emptyTiles = (0..<tiles).map { tile in (0..<4).map { tileData[4 * tile + $0] } }
        try check(emptyTiles.allSatisfy { $0 == [-.infinity, 0, 0, 0] }, "empty tile has a contribution")
        let oldData = oldOutput.contents().assumingMemoryBound(to: Float.self)
        let newData = newOutput.contents().assumingMemoryBound(to: Float.self)
        let oldEmpty = (0..<6).map { oldData[$0] }
        let newEmpty = (0..<6).map { newData[$0] }
        try check(Array(oldEmpty[0..<4]) == [-.infinity, 0, 0, 0]
                  && oldEmpty[4...5].allSatisfy { $0.isNaN }, "expected two NaNs from zero denominator")
        try check(newEmpty == [-.infinity, 0, 0, 0, 0, 0], "empty query must return zero")
        let oldGuards = (outputCount..<(outputCount + guardCount)).map { oldData[$0] }
        let newGuards = (outputCount..<(outputCount + guardCount)).map { newData[$0] }
        try check((oldGuards + newGuards).allSatisfy { $0 == sentinel }, "output guard was overwritten")

        var positiveRows = [[String: Any]]()
        for (index, prefix) in prefixes.map(Int.init).enumerated() {
            let start = (index + 1) * 6
            let oldRow = (start..<(start + 6)).map { oldData[$0] }
            let newRow = (start..<(start + 6)).map { newData[$0] }
            try check(oldRow.map(\.bitPattern) == newRow.map(\.bitPattern), "guard altered a nonempty row")
            let dense = reference(scores, values, 0..<prefix)
            let expected = dense + dense[2...3].map { $0 / dense[1] }
            try checkStats(newRow.map(Double.init), expected)
            positiveRows.append(["prefix": prefix, "original": encoded(oldRow), "guarded": encoded(newRow),
                                 "dense_reference": expected, "same_bits": true])
        }
        cases.append(["tile_width": width, "tiles_per_query": tiles,
                      "empty_tiles": emptyTiles.map(encoded), "original_empty": encoded(oldEmpty),
                      "guarded_empty": encoded(newEmpty), "original_tail_guards": oldGuards,
                      "guarded_tail_guards": newGuards, "positive_rows": positiveRows])
    }
    let guardedSHA = SHA256.hash(data: Data(guardedSource.utf8)).map { String(format: "%02x", $0) }.joined()
    return ["schema": "infra-metal-empty-attention-row-v1", "status": "passed",
            "environment": ["device": device.name, "os": ProcessInfo.processInfo.operatingSystemVersionString,
                            "metal_language": "3.0", "float_math": "precise"],
            "fixture": ["length": length, "peak_index": peak, "prefixes": allPrefixes,
                        "value_width": 2, "output_guard_count": guardCount, "output_sentinel": sentinel],
            "guarded_kernel_sha256": guardedSHA, "cases": cases]
}

do {
    try check(CommandLine.arguments.count == 2, "pass the pinned kernels.metal path")
    let record = try runEmptyRow(CommandLine.arguments[1])
    let json = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
    print(String(decoding: json, as: UTF8.self))
} catch {
    FileHandle.standardError.write(Data(("\(error)\n").utf8))
    exit(1)
}
