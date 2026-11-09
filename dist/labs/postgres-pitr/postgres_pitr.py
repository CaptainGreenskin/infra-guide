#!/usr/bin/env python3
"""Capture one PostgreSQL point-in-time recovery experiment in isolated Docker."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from uuid import uuid4


ROOT = Path(__file__).resolve().parent


def run_experiment(image):
    image_details = json.loads(
        subprocess.check_output(["docker", "image", "inspect", image], text=True)
    )[0]
    container = f"infraguide-pitr-{uuid4().hex}"
    command = [
        "docker", "run", "--rm", "--pull=never", "--network", "none", "--name", container,
        "--user", "postgres", "-i", "--entrypoint", "/bin/sh", image_details["Id"], "-s",
    ]
    try:
        output = subprocess.check_output(
            command, input=(ROOT / "pitr.sh").read_text(), text=True, timeout=150,
        )
    finally:
        subprocess.run(
            ["docker", "rm", "-f", container], stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, timeout=15, check=False,
        )

    states = {}
    meta = {}
    for line in output.splitlines():
        kind, key, value = line.split("\t", 2)
        if kind == "STATE" and key not in states:
            states[key] = json.loads(value)
        elif kind == "META" and key not in meta:
            meta[key] = value
        else:
            raise ValueError(f"Unexpected evidence row: {kind} {key}")

    expected = {
        "base": (100, [], [], 1),
        "primary": (0, [101, 102, 103, 104], [10, 20, -5, -125], 1),
        "named": (125, [101, 102, 103], [10, 20, -5], 2),
        "latest": (0, [101, 102, 103, 104], [10, 20, -5, -125], 2),
        "named_after_write": (130, [101, 102, 103, 105], [10, 20, -5, 5], 2),
        "primary_after": (0, [101, 102, 103, 104], [10, 20, -5, -125], 1),
    }
    if states.keys() != expected.keys():
        raise ValueError("The server did not produce all expected SQL observations")
    for name, fields in expected.items():
        row = states[name]
        actual = (row["balance"], row["ledger"], row["deltas"], row["timeline"])
        if actual != fields or row["in_recovery"] is not False:
            raise ValueError(f"Unexpected server state: {name}: {row}")
        if row["system_identifier"] != states["base"]["system_identifier"]:
            raise ValueError(f"The recovered database has a different system identifier: {name}")

    error = "recovery ended before configured recovery target was reached"
    if meta["missing_error"] != error or meta["backup_verified"] != "true":
        raise ValueError("Backup verification or missing-WAL negative control failed")
    if meta["point_lsn"] != meta["named_fork_lsn"] or meta["named_fork_lsn"] == meta["latest_fork_lsn"]:
        raise ValueError("The promoted clones did not fork at the expected WAL positions")

    sources = ("postgres_pitr.py", "pitr.sh")
    return {
        "schema": 1,
        "status": "passed",
        "source_sha256": {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sources
        },
        "environment": {
            "engine": "Docker",
            "image": image,
            "image_id": image_details["Id"],
            "repo_digests": image_details["RepoDigests"],
            "os": image_details["Os"],
            "architecture": image_details["Architecture"],
            "postgres_version": meta["postgres_version"],
            "network": "none",
        },
        "report": {
            "base": states["base"],
            "backup_verified": True,
            "primary": states["primary"],
            "primary_after": states["primary_after"],
            "archive": {
                "restore_point": "after_t103",
                "point_lsn": meta["point_lsn"],
                "target_segment": meta["target_segment"],
                "target_segment_bytes": int(meta["target_segment_bytes"]),
                "target_segment_sha256": meta["target_segment_sha256"],
                "last_segment": meta["last_segment"],
                "last_segment_sha256": meta["last_segment_sha256"],
            },
            "restores": {
                mode: {**states[mode], "fork_lsn": meta[f"{mode}_fork_lsn"]}
                for mode in ("named", "latest")
            },
            "named_after_write": states["named_after_write"],
            "missing_wal": {"started": False, "omitted_segment": meta["target_segment"], "error": error},
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="postgres:17-alpine", help="a locally available PostgreSQL 17 image")
    parser.add_argument("--output", type=Path, help="write a record to this path")
    args = parser.parse_args()
    result = json.dumps(run_experiment(args.image), indent=2) + "\n"
    if args.output:
        args.output.write_text(result, encoding="utf-8")
    else:
        print(result, end="")


if __name__ == "__main__":
    main()
