"""Synthetic canaries: inherited authority, same-UID access, and single-leaf no-follow opening."""
import errno
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def child(descriptor, path):
    try:
        os.read(descriptor, 128)
        inherited = True
    except OSError as error:
        if error.errno != errno.EBADF:
            raise
        inherited = False
    # Explicitly demonstrate that launch hygiene does not isolate the filesystem.
    by_path = Path(path).read_text() == "FAKE-CANARY-no-production-permission"
    print(json.dumps({"fixture_environment_present": "LAB_DEMO_SECRET" in os.environ,
                      "inherited_descriptor_readable": inherited,
                      "same_uid_fixture_still_readable_by_path": by_path}))


def main():
    if os.name != "posix" or os.open not in os.supports_dir_fd or not hasattr(os, "O_NOFOLLOW"):
        raise RuntimeError("POSIX openat/dir_fd and O_NOFOLLOW required")
    with tempfile.TemporaryDirectory(prefix="infra-descriptors-") as temporary:
        root = Path(temporary)
        canary = root / "canary.txt"
        canary.write_text("FAKE-CANARY-no-production-permission")
        descriptor = os.open(str(canary), os.O_RDONLY)
        os.set_inheritable(descriptor, True)  # Deliberately undo the safe default for the counterexample.
        try:
            outputs = {}
            for name, close_fds, env in [
                    ("explicit_unsafe_inheritance", False, {"LAB_DEMO_SECRET": "FAKE", "PYTHONIOENCODING": "utf-8"}),
                    ("minimal_launch", True, {"PYTHONIOENCODING": "utf-8"})]:
                os.lseek(descriptor, 0, os.SEEK_SET)
                result = subprocess.run([sys.executable, "-B", str(Path(__file__).resolve()), "--child", str(descriptor), str(canary)],
                                        env=env, cwd=root, close_fds=close_fds,
                                        capture_output=True, text=True, timeout=5, check=True)
                outputs[name] = json.loads(result.stdout)
        finally:
            os.close(descriptor)
        assert outputs["explicit_unsafe_inheritance"] == {"fixture_environment_present": True,
                 "inherited_descriptor_readable": True, "same_uid_fixture_still_readable_by_path": True}
        assert outputs["minimal_launch"] == {"fixture_environment_present": False,
                 "inherited_descriptor_readable": False, "same_uid_fixture_still_readable_by_path": True}

        allowed = root / "work"
        allowed.mkdir()
        outside = root / "outside.txt"
        outside.write_text("fixture-B")
        leaf = allowed / "report.txt"
        leaf.write_text("fixture-A")
        # Deterministic interleaving: check, replace, then use. No live race is required.
        prefix_check = str(leaf).startswith(str(allowed))
        leaf.unlink()
        leaf.symlink_to(outside)
        vulnerable_read = leaf.read_text()
        directory_fd = os.open(str(allowed), os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        refused = False
        try:
            try:
                file_fd = os.open("report.txt", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
            except OSError as error:
                refused = error.errno in {errno.ELOOP, errno.EMLINK}
            else:
                os.close(file_fd)
            leaf.unlink()
            leaf.write_text("fixture-A")
            file_fd = os.open("report.txt", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
            try:
                safe_value = os.read(file_fd, 128).decode()
            finally:
                os.close(file_fd)
        finally:
            os.close(directory_fd)
        assert prefix_check and vulnerable_read == "fixture-B" and refused and safe_value == "fixture-A"
    print(json.dumps({"launch": outputs, "single_leaf_path": {"prefix_check_passed": prefix_check,
                      "after_check_symlink_read": vulnerable_read, "no_follow_rejected_symlink": refused,
                      "normal_leaf_read": safe_value},
                      "scope": "actual_POSIX_children_and_fixture_files_not_a_security_sandbox",
                      "limits": ["Python defaults already make new FDs non-inheritable and Popen close_fds=True; unsafe case explicitly changes them",
                                 "no-follow example accepts only one fixed leaf under a trusted already-open directory",
                                 "does not secure arbitrary multi-component paths, hard links, untrusted mounts or directory permissions",
                                 "same-UID child still reads fixture by path; no filesystem or network isolation claim"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--child":
        child(int(sys.argv[2]), sys.argv[3])
    else:
        main()
