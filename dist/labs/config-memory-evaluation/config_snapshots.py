"""Real POSIX path replacement, startup environment and validated application snapshots."""
from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


@dataclass(frozen=True)
class Config:
    version: int
    pool: int
    timeout_ms: int


def swap_link(root, version):
    pending = root / "next"
    if pending.is_symlink():
        pending.unlink()
    pending.symlink_to(root / version, target_is_directory=True)
    os.replace(str(pending), str(root / "current"))


def read_candidate(path, active):
    value = json.loads(path.read_text())
    if type(value) is not dict or set(value) != {"version", "pool", "timeout_ms"}:
        raise ValueError("fields")
    if any(type(value[key]) is not int for key in value):
        raise ValueError("integer_types")
    candidate = Config(**value)
    if candidate.version <= active.version:
        raise ValueError("stale_generation")
    if not 1 <= candidate.pool <= 12 or not 1 <= candidate.timeout_ms <= 500:
        raise ValueError("range")
    if 4 * candidate.pool > 32:
        raise ValueError("global_connection_budget")
    return candidate


def environment_probe():
    child_code = ("import os,sys; print(os.environ['LAB_POOL_LIMIT'],flush=True); "
                  "sys.stdin.readline(); print(os.environ['LAB_POOL_LIMIT'],flush=True)")
    child_env = os.environ.copy()
    child_env["LAB_POOL_LIMIT"] = "4"
    child = subprocess.Popen([sys.executable, "-c", child_code], env=child_env,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True)
    before = child.stdout.readline().strip()
    child_env["LAB_POOL_LIMIT"] = "6"
    rest, error = child.communicate("continue\n", timeout=5)
    if child.returncode:
        raise RuntimeError(error)
    fresh = subprocess.check_output(
        [sys.executable, "-c", "import os; print(os.environ['LAB_POOL_LIMIT'])"],
        env=child_env, text=True, timeout=5).strip()
    assert [before, rest.strip(), fresh] == ["4", "4", "6"]
    return {"running_before": before, "running_after_parent_template_change": rest.strip(),
            "new_child": fresh}


def main():
    if os.name != "posix":
        raise RuntimeError("This path/symlink fixture requires a POSIX filesystem (Linux/macOS).")
    old = Config(1, 4, 100)
    new = Config(2, 6, 50)
    with tempfile.TemporaryDirectory(prefix="infra-config-") as temporary:
        root = Path(temporary)
        for name, config in [("v1", old), ("v2", new)]:
            folder = root / name
            folder.mkdir()
            (folder / "pool").write_text(str(config.pool))
            (folder / "timeout_ms").write_text(str(config.timeout_ms))
            (folder / "config.json").write_text(json.dumps(asdict(config)))
        swap_link(root, "v1")
        pool = int((root / "current/pool").read_text())
        swap_link(root, "v2")
        timeout = int((root / "current/timeout_ms").read_text())
        mixed = {"pool": pool, "timeout_ms": timeout}
        assert mixed == {"pool": 4, "timeout_ms": 50}
        assert mixed not in [{"pool": 4, "timeout_ms": 100}, {"pool": 6, "timeout_ms": 50}]

        swap_link(root, "v1")
        with (root / "current/config.json").open() as held:
            swap_link(root, "v2")
            old_fd = json.load(held)
        new_path = json.loads((root / "current/config.json").read_text())
        assert old_fd == asdict(old) and new_path == asdict(new)

        active = old
        in_flight = active
        active = read_candidate(root / "current/config.json", active)
        assert active == new and in_flight == old
        candidate_file = root / "candidate.json"
        rejected = []
        bad_candidates = [
            ("missing_field", json.dumps({"version": 3, "pool": 6})),
            ("bool_pool", json.dumps({"version": 4, "pool": True, "timeout_ms": 50})),
            ("global_budget", json.dumps({"version": 5, "pool": 9, "timeout_ms": 50})),
            ("invalid_json", "{"),
            ("old_generation", json.dumps(asdict(old))),
        ]
        for name, body in bad_candidates:
            candidate_file.write_text(body)
            try:
                proposed = read_candidate(candidate_file, active)
            except (ValueError, json.JSONDecodeError) as error:
                rejected.append({"case": name, "kept_version": active.version,
                                 "reason": "invalid_json" if isinstance(error, json.JSONDecodeError) else str(error)})
            else:
                active = proposed
                raise AssertionError("invalid candidate accepted")
        candidate_file.write_text(json.dumps({"version": 7, "pool": 4, "timeout_ms": 100}))
        active = read_candidate(candidate_file, active)
        assert active == Config(7, 4, 100)
    print(json.dumps({"mixed_separate_reads": mixed, "mixed_was_published": False,
                      "held_descriptor_after_path_switch": old_fd, "new_path": new_path,
                      "in_flight_snapshot": asdict(in_flight), "new_request_snapshot": asdict(new),
                      "rejected_candidates": rejected, "rollback_values_new_generation": asdict(active),
                      "environment": environment_probe(),
                      "scope": "actual_local_files_and_processes_not_kubernetes_projection_or_watch_events",
                      "retention_note": "Both fixture version directories remain present; no claim about old-volume garbage collection."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

