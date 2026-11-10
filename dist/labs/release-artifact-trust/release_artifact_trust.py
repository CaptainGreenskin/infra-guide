#!/usr/bin/env python3
"""Verify a release commit and the exact artifact bytes it approves."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile


ALLOWED = "release-ci@infraguide.test"
OTHER = "other-ci@infraguide.test"
MEMBER = "report-version.txt"
RELEASE = "release.json"


def require(actual, expected):
    if actual != expected:
        raise RuntimeError(f"expected {expected!r}, got {actual!r}")
    return actual


def sha(data):
    return hashlib.sha256(data).hexdigest()


def execute(argv, env):
    result = subprocess.run(argv, env=env, capture_output=True, text=True, timeout=12)
    return {"returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


def successful(argv, env):
    result = execute(argv, env)
    if result["returncode"]:
        raise RuntimeError(f"{argv[:2]}: {result['stdout']}{result['stderr']}")
    return result["stdout"]


def artifact(version):
    payload = (version + "\n").encode("ascii")
    member = tarfile.TarInfo(MEMBER)
    member.size = len(payload)
    member.mode = 0o644
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        archive.addfile(member, io.BytesIO(payload))
    return stream.getvalue()


def artifact_version(payload):
    # Read the one expected member without extracting any files to disk.
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
        require(archive.getnames(), [MEMBER])
        with archive.extractfile(MEMBER) as member:
            return member.read().decode("ascii").strip()


def active_release(path):
    if not path.exists():
        return None
    data = path.read_bytes()
    return {"sha256": sha(data), "version": artifact_version(data)}


def promote(git, env, signer_file, revision, artifact_path, active_path):
    raw_manifest = successful(git + ["show", revision + ":" + RELEASE], env)
    manifest = json.loads(raw_manifest)
    verification = execute(git + ["-c", "gpg.ssh.allowedSignersFile=" + str(signer_file),
                                  "verify-commit", revision], env)
    received = artifact_path.read_bytes()
    received_digest = sha(received)
    content_matches = received_digest == manifest["artifact_sha256"]
    approved = verification["returncode"] == 0 and content_matches
    if approved:
        staged = active_path.with_suffix(".verified")
        staged.write_bytes(received)
        staged.replace(active_path)
    return {"revision": revision, "manifest": manifest, "signature": verification,
            "candidate_sha256": received_digest, "candidate_version": artifact_version(received),
            "content_matches": content_matches, "approved": approved,
            "active_readback": active_release(active_path)}


def run(root, git_binary, keygen, env):
    repo = root / "release"
    successful([git_binary, "init", "-q", "--template=", "--object-format=sha1", "--initial-branch=main", str(repo)], env)
    git = [git_binary, "-C", str(repo)]
    # Keep the Git author identical. The SSH key is the verified distinction.
    for name, value in {"user.name": "Report Release", "user.email": "author@infraguide.test",
                        "gpg.format": "ssh", "gpg.ssh.program": keygen}.items():
        successful(git + ["config", "--local", name, value], env)

    signers = {}
    for name, principal in [("release-ci", ALLOWED), ("other-ci", OTHER)]:
        key = root / name
        successful([keygen, "-q", "-t", "ed25519", "-N", "", "-C", principal, "-f", str(key)], env)
        signer_file = root / (name + ".allowed")
        public_key = key.with_suffix(".pub").read_text(encoding="ascii").split()[:2]
        signer_file.write_text(principal + ' namespaces="git" ' + " ".join(public_key) + "\n", encoding="ascii")
        signers[name] = (key, signer_file)

    candidates = {}
    for name in ("report-v1", "report-v2"):
        data = artifact(name)
        filename = root / (name + ".tar")
        filename.write_bytes(data)
        candidates[name] = {"path": filename, "sha256": sha(data)}

    def signed_release(version, signer):
        manifest = {"service": "reports", "version": version, "artifact_sha256": candidates[version]["sha256"]}
        (repo / RELEASE).write_text(json.dumps(manifest, sort_keys=True) + "\n", encoding="ascii")
        successful(git + ["add", "--", RELEASE], env)
        successful(git + ["-c", "user.signingKey=" + str(signers[signer][0]),
                          "commit", "-q", "-S", "-m", "release " + version], env)
        return successful(git + ["rev-parse", "HEAD"], env).strip()

    v1 = signed_release("report-v1", "release-ci")
    v2 = signed_release("report-v2", "other-ci")
    approved_signers = signers["release-ci"][1]
    active = root / "active.tar"
    require(active_release(active), None)

    # The alias emulates a name which can point to different artifact bytes.
    alias = root / "candidate.tar"
    alias.symlink_to(candidates["report-v1"]["path"].name)
    baseline = promote(git, env, approved_signers, v1, alias, active)
    alias.unlink()
    alias.symlink_to(candidates["report-v2"]["path"].name)
    moved = promote(git, env, approved_signers, v1, alias, active)
    untrusted = promote(git, env, approved_signers, v2, alias, active)
    # Diagnostic only: this second allowlist recognizes the other signature.
    alternate_check = execute(git + ["-c", "gpg.ssh.allowedSignersFile=" + str(signers["other-ci"][1]),
                                     "verify-commit", v2], env)
    require(alternate_check["returncode"], 0)
    paths_by_digest = {data["sha256"]: data["path"] for data in candidates.values()}
    pinned = promote(git, env, approved_signers, v1, paths_by_digest[baseline["manifest"]["artifact_sha256"]], active)
    cases = {"trusted_match": baseline, "alias_moved": moved, "other_signer": untrusted, "pinned_match": pinned}
    for result, (valid_signer, matched, accepted) in zip(cases.values(), [(True, True, True), (True, False, False),
                                                                         (False, True, False), (True, True, True)]):
        require(result["signature"]["returncode"] == 0, valid_signer)
        require(result["content_matches"], matched)
        require(result["approved"], accepted)
        require(result["active_readback"], {"sha256": candidates["report-v1"]["sha256"], "version": "report-v1"})
    require(successful(git + ["remote"], env), "")
    return {"trusted_principal": ALLOWED, "other_principal": OTHER,
            "other_signer_check": alternate_check, "cases": cases,
            "artifact_digests": {name: data["sha256"] for name, data in candidates.items()},
            "no_git_remotes": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    git_binary = shutil.which("git")
    keygen = shutil.which("ssh-keygen")
    if not git_binary or not keygen:
        parser.error("git and ssh-keygen are required")
    env = {name: value for name, value in os.environ.items() if not name.startswith("GIT_")}
    env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"})
    git_version = successful([git_binary, "--version"], env).strip()
    ssh = shutil.which("ssh")
    if not ssh:
        parser.error("ssh is required for the OpenSSH version receipt")
    ssh_version = execute([ssh, "-V"], env)
    require(ssh_version["returncode"], 0)
    with tempfile.TemporaryDirectory(prefix="infra-release-trust-") as directory:
        scratch = Path(directory)
        observations = run(scratch, git_binary, keygen, env)
    require(scratch.exists(), False)
    report = {"schema": 1, "source_sha256": {Path(__file__).name: sha(Path(__file__).read_bytes())},
              "environment": {"platform": platform.system(), "machine": platform.machine(), "python": platform.python_version(),
                              "git": git_version, "openssh": (ssh_version["stdout"] + ssh_version["stderr"]).strip()},
              "observations": observations, "temporary_workspace_removed": True}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
