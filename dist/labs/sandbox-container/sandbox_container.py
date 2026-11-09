#!/usr/bin/env python3
"""Observe read-only input and writable output in two owned Linux Docker containers."""
import argparse
from functools import partial
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid


HERE = Path(__file__).resolve().parent
IMAGE = "docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431"
IDENTITY = "65534:65534"
MARKER = b"sandbox-input-modified\n"
CANARY = b"unmounted-fixture-canary\n"
SCOPE = "Two fresh single-host Linux Docker containers; synthetic filesystem fixture and local interface observations."

PROBE = r"""
import errno
import hashlib
import json
import os
from pathlib import Path
import socket
import sys

def result(operation):
    try:
        operation()
    except OSError as error:
        return errno.errorcode.get(error.errno, str(error.errno))
    return "ok"

path = Path("/input/source.json")
source = path.read_bytes()
data = json.loads(source)
report = {"task_id": data["task_id"], "amount": sum(data["values"]),
          "source_sha256": hashlib.sha256(source).hexdigest()}
Path("/output/report.json").write_text(json.dumps(report))

def append_input():
    with path.open("ab") as stream:
        stream.write(b"sandbox-input-modified\n")

status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines())
print(json.dumps({
    "uid": os.geteuid(), "gid": os.getegid(), "pid": os.getpid(),
    "no_new_privs": int(status["NoNewPrivs"]), "cap_effective": status["CapEff"].strip(),
    "python": sys.version.split()[0],
    "interfaces": [name for _, name in socket.if_nameindex()],
    "input_write": result(append_input),
    "rootfs_write": result(lambda: Path("/tmp/sandbox-rootfs-probe").write_text("fixture")),
    "unmounted_read": result(lambda: Path(sys.argv[1]).read_bytes()),
}))
"""


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def fixture():
    data = (HERE / "source.json").read_bytes()
    require(json.loads(data) == {"task_id": "R27-lab", "values": [10, 27]}, "fixture changed")
    return data


def source_hashes(data):
    return {"sandbox_container.py": digest(Path(__file__).read_bytes()), "source.json": digest(data)}


def docker_command(*arguments, endpoint=None):
    command, env = ["docker"], None
    if endpoint:
        command.extend(("--host", endpoint))
        env = dict(os.environ)
        env.pop("DOCKER_CONTEXT", None)
    return subprocess.run([*command, *arguments], env=env, check=True, timeout=40, text=True, capture_output=True)


def inspect_environment():
    require(not os.environ.get("DOCKER_HOST"), "Use a local Unix-socket Docker context")
    contexts = json.loads(docker_command("context", "inspect").stdout)
    endpoint = contexts[0]["Endpoints"]["docker"]["Host"]
    require(endpoint.startswith("unix:///"), "Use a local Unix-socket Docker context")
    command = partial(docker_command, endpoint=endpoint)
    server = json.loads(command("version", "--format", "{{json .Server}}").stdout)
    require((server["Os"], server["Arch"]) == ("linux", "amd64"), "Pinned image requires a Linux/amd64 daemon")
    image = json.loads(command("image", "inspect", IMAGE).stdout)[0]
    require((image["Os"], image["Architecture"]) == ("linux", "amd64"), "Unexpected local image platform")
    return command, {"os": server["Os"], "arch": server["Arch"], "docker_server": server["Version"], "image_id": image["Id"]}


def check_artifact(source_bytes, report):
    source = json.loads(source_bytes)
    return report == {"task_id": source["task_id"], "amount": sum(source["values"]),
                      "source_sha256": digest(source_bytes)}


def observe_host(input_file, output, canary):
    return {"input_after": input_file.read_bytes().decode("utf-8"),
            "report": json.loads((output / "report.json").read_bytes()),
            "output_files": sorted(path.name for path in output.iterdir()),
            "unmounted_canary_sha256": digest(canary.read_bytes())}


def verdict(data, host):
    matches = check_artifact(data, host["report"]) and host["output_files"] == ["report.json"]
    unchanged = host["input_after"].encode() == data
    return {"report_matches_source": matches, "input_unchanged": unchanged, "accepted": matches and unchanged}


def read_configuration(inspection):
    host = inspection["HostConfig"]
    return {"user": inspection["Config"]["User"], "read_only_rootfs": host["ReadonlyRootfs"],
            "network": host["NetworkMode"], "cap_drop": host["CapDrop"], "security_opt": host["SecurityOpt"],
            "memory_bytes": host["Memory"], "nano_cpus": host["NanoCpus"], "pids_limit": host["PidsLimit"],
            "mounts": {row["Destination"]: {"type": row["Type"], "rw": row["RW"]} for row in inspection["Mounts"]}}


def run_case(command, parent, data, read_only):
    name = "infra-sandbox-" + uuid.uuid4().hex[:12]
    root = parent / name
    incoming, output, sibling = (root / key for key in ("input", "output", "sibling"))
    for folder in (incoming, output, sibling):
        folder.mkdir(parents=True)
        folder.chmod(0o755)
    output.chmod(0o777)
    source_file = incoming / "source.json"
    source_file.write_bytes(data)
    # The control case must be able to write with the same non-root UID.
    source_file.chmod(0o666)
    canary = sibling / "canary.txt"
    canary.write_bytes(CANARY)
    input_mount = f"type=bind,src={incoming},dst=/input" + (",readonly" if read_only else "")
    output_mount = f"type=bind,src={output},dst=/output"
    container = command("create", "--name", name, "--pull", "never",
                        "--user", IDENTITY, "--read-only", "--network", "none",
                        "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true",
                        "--memory", "96m", "--pids-limit", "16", "--cpus", "0.5",
                        "--mount", input_mount, "--mount", output_mount,
                        IMAGE, "python", "-I", "-B", "-c", PROBE, str(canary)).stdout.strip()
    require(re.fullmatch(r"[0-9a-f]{64}", container), "Docker create did not return an owned container ID")
    try:
        result = command("start", "-a", container)
        inspection = json.loads(command("container", "inspect", container).stdout)[0]
        require(inspection["Id"] == container, "Container identity changed")
        host = observe_host(source_file, output, canary)
        row = {"container_id": container, "image_id": inspection["Image"], "exit_code": inspection["State"]["ExitCode"],
               "configuration": read_configuration(inspection), "worker": json.loads(result.stdout),
               "host": host, "verdict": verdict(data, host)}
    finally:
        command("rm", "-f", container)
    remaining = command("container", "ls", "--all", "--quiet", "--no-trunc", "--filter", "id=" + container)
    row["removed"] = remaining.stdout.strip() == ""
    return row


def verify_record(record, data):
    require(record["schema"] == 1 and record["status"] == "passed" and record["scope"] == SCOPE,
            "unexpected sandbox record")
    require(record["image"] == IMAGE and record["source_sha256"] == source_hashes(data), "source or image binding changed")
    env = record["environment"]
    require((env["os"], env["arch"]) == ("linux", "amd64") and bool(env["docker_server"])
            and re.fullmatch(r"sha256:[0-9a-f]{64}", env["image_id"]), "unexpected runtime")
    cases = record["cases"]
    require(set(cases) == {"readonly_input", "writable_input_control"}, "two cases required")
    require(len({row["container_id"] for row in cases.values()}) == 2, "containers must be distinct")
    for case, read_only in (("readonly_input", True), ("writable_input_control", False)):
        row = cases[case]
        require(re.fullmatch(r"[0-9a-f]{64}", row["container_id"]) and row["image_id"] == env["image_id"]
                and row["removed"] is True and row["exit_code"] == 0, f"{case}: execution or cleanup")
        expected = {"user": IDENTITY, "read_only_rootfs": True, "network": "none", "cap_drop": ["ALL"],
                    "security_opt": ["no-new-privileges=true"],
                    "memory_bytes": 96 * 1024**2, "nano_cpus": 500000000, "pids_limit": 16,
                    "mounts": {"/input": {"type": "bind", "rw": not read_only},
                               "/output": {"type": "bind", "rw": True}}}
        require(row["configuration"] == expected, f"{case}: effective Docker settings")
        python = row["worker"]["python"]
        require(re.fullmatch(r"3\.13\.\d+", python), f"{case}: unexpected interpreter")
        expected_worker = {"uid": 65534, "gid": 65534, "pid": 1, "no_new_privs": 1, "cap_effective": "0" * 16, "python": python,
                           "interfaces": ["lo"], "input_write": "EROFS" if read_only else "ok",
                           "rootfs_write": "EROFS", "unmounted_read": "ENOENT"}
        require(row["worker"] == expected_worker, f"{case}: actual process probes")
        host = row["host"]
        require(host["input_after"].encode() == (data if read_only else data + MARKER)
                and host["unmounted_canary_sha256"] == digest(CANARY), f"{case}: host fixture mutation")
        expected_verdict = {"report_matches_source": True, "input_unchanged": read_only, "accepted": read_only}
        require(verdict(data, host) == row["verdict"] == expected_verdict, f"{case}: independent artifact verdict")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--output", type=Path, help="run Docker and save the observed record")
    mode.add_argument("--check-record", type=Path, help="verify a saved record offline")
    args = parser.parse_args()
    data = fixture()
    if args.check_record:
        verify_record(json.loads(args.check_record.read_bytes()), data)
        print("PASS: source binding, runtime settings, observed file checks and independent verdicts")
        return
    command, env = inspect_environment()
    with tempfile.TemporaryDirectory(prefix="infra-sandbox-") as temporary:
        parent = Path(temporary).resolve()
        cases = {"readonly_input": run_case(command, parent, data, True),
                 "writable_input_control": run_case(command, parent, data, False)}
    record = {"schema": 1, "status": "passed", "scope": SCOPE, "environment": env,
              "image": IMAGE, "source_sha256": source_hashes(data), "cases": cases}
    verify_record(record, data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
    print("PASS: native read-only input blocks mutation; single-change control modifies its owned fixture")


if __name__ == "__main__":
    main()
