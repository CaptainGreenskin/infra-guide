"""Replay the existing Metal attention kernels with one empty query row."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory


HERE = Path(__file__).resolve().parent
BASE_SHA256 = {
    "online_attention.swift": "7ed0cf2fb8c675ad0dbd3745ebe2928fc3830f2d00b54b9c038f414ac54670b1",
    "kernels.metal": "3d99be69b943a9235686a5d498135e6c01220e4c9c44eb5c84f76aa5747ea849",
    "validation.json": "e92361ecf20f0e0a063801913c17b1ec88eaf45ae4b4dd26a7fc0ac67a2f7285",
}


def digest(data):
    return sha256(data).hexdigest()


def build_driver(base_driver, extension):
    helpers, run = base_driver.split("func run() throws -> [String: Any] {", 1)
    start = run.index("    let scores = ")
    end = run.index("    let input = try", start)
    fixture = run[start:end]
    return (helpers + "func emptyRowFixture() -> ([Float], [Float]) {\n" + fixture
            + "    return (scores, values)\n}\n\n" + extension)


def record(base_dir):
    base = {name: (base_dir / name).read_bytes() for name in BASE_SHA256}
    for name, data in base.items():
        if digest(data) != BASE_SHA256[name]:
            raise ValueError(f"{name}: expected the published Metal online attention asset")
    extension = (HERE / "empty_row.swift").read_bytes()
    driver = build_driver(base["online_attention.swift"].decode(), extension.decode()).encode()
    with TemporaryDirectory(prefix="metal-empty-query-") as directory:
        executable = Path(directory) / "empty_row.swift"
        executable.write_bytes(driver)
        output = subprocess.run(
            ["swift", "-O", str(executable), str(base_dir / "kernels.metal")],
            check=True, stdout=subprocess.PIPE, timeout=90,
        ).stdout
    result = json.loads(output)
    original = {row["tile_width"]: row["queries"] for row in json.loads(base["validation.json"])["cases"]}
    for case in result["cases"]:
        references = {row["prefix"]: row["output"] for row in original[case["tile_width"]]}
        for row in case["positive_rows"]:
            error = max(abs(a - b) for a, b in zip(row["guarded"][4:], references[row["prefix"]]))
            if error > 1e-5:
                raise ValueError("nonempty row differs from the published output")
            row["published_max_abs_difference"] = error
    result["base_sha256"] = BASE_SHA256
    result["source_sha256"] = {"empty_row.py": digest(Path(__file__).read_bytes()),
                               "empty_row.swift": digest(extension)}
    result["composed_swift_sha256"] = digest(driver)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", type=Path, default=HERE.parent / "metal-online-attention")
    args = parser.parse_args()
    print(json.dumps(record(args.base_dir.resolve()), ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
