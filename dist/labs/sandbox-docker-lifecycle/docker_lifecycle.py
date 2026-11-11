"""Measure reuse and concurrent stopping in three owned Linux Docker containers."""
import argparse
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import subprocess
import time


HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixture.py"
IMAGE = "docker.io/library/python:3.13-alpine3.22@sha256:7f7ee17311e0273954ffe76a7b84a2d8c8ecf16f9992e780e4d46c86175df431"
CGROUP = Path("/sys/fs/cgroup")
SCOPE = "single_linux_docker_host_fixed_synthetic_jobs"
STOP_GRACE = 1


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def docker(*args):
    env = {key: value for key, value in os.environ.items() if key not in {"DOCKER_HOST", "DOCKER_CONTEXT"}}
    command = ["docker", "--host", "unix:///var/run/docker.sock", *args]
    result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=35)
    require(result.returncode == 0, f"docker {args[0]} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def execute(container, *args):
    return docker("exec", container, "python", "-I", "-B", "/fixture.py", *args)


def elapsed(started):
    return round((time.monotonic_ns() - started) / 1_000_000, 3)


def wait_for(predicate, detail):
    deadline = time.monotonic() + 6
    while not predicate():
        if time.monotonic() >= deadline:
            raise TimeoutError(detail)
        time.sleep(0.03)


def configuration(container):
    row = json.loads(docker("container", "inspect", container))[0]
    require(row["Id"] == container, "container ID changed")
    return row


def identity(container):
    row = configuration(container)
    state = row["State"]
    return {"id": row["Id"], "pid": state["Pid"], "started_at": state["StartedAt"],
            "running": state["Running"], "restart_count": row["RestartCount"]}


@contextmanager
def running(*fixture_args):
    started = time.monotonic_ns()
    container = docker(
        "create", "--pull", "never", "--user", "65534:65534", "--read-only", "--network", "none",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges=true",
        "--memory", "96m", "--pids-limit", "24", "--cpus", "0.5",
        "--tmpfs", "/work:rw,noexec,nosuid,nodev,uid=65534,gid=65534,mode=0700",
        "--mount", f"type=bind,src={FIXTURE},dst=/fixture.py,readonly",
        IMAGE, "python", "-I", "-B", "/fixture.py", "serve", *fixture_args,
    )
    require(re.fullmatch(r"[0-9a-f]{64}", container), "invalid owned container ID")
    try:
        docker("start", container)
        wait_for(lambda: json.loads(execute(container, "ready")), "worker did not become ready")
        yield container, elapsed(started)
    finally:
        docker("rm", "-f", container)
        remaining = docker("container", "ls", "--all", "--quiet", "--no-trunc", "--filter", "id=" + container)
        require(remaining == "", "owned container remained in Docker")


def read_report(container):
    return json.loads(execute(container, "read"))


def run_job(container, task):
    started = time.monotonic_ns()
    row = json.loads(execute(container, "work", task))
    exec_ms = elapsed(started)
    artifact = read_report(container)
    return {"exec_ms": exec_ms, "request_to_readback_ms": elapsed(started), "worker": row,
            "independent_report": artifact}


def reuse():
    cold_started = time.monotonic_ns()
    with running() as (container, ready_ms):
        row = configuration(container)
        before = identity(container)
        first = run_job(container, "first")
        cold_request_ms = elapsed(cold_started)
        without_reset = run_job(container, "second")
        execute(container, "reset")
        after_reset = read_report(container)
        second = run_job(container, "second")
        config = row["HostConfig"]
        return {"cold_create_to_ready_ms": ready_ms, "cold_create_to_first_readback_ms": cold_request_ms,
                "before": before, "after": identity(container),
                "image_id": row["Image"], "container_user": row["Config"]["User"],
                "readonly_root": config["ReadonlyRootfs"], "network": config["NetworkMode"],
                "work_tmpfs": config["Tmpfs"]["/work"], "first": first, "without_reset": without_reset,
                "report_after_reset": after_reset, "second": second}


def host_process(pid):
    directory = Path("/proc") / str(pid)
    try:
        fields = (directory / "stat").read_text().rsplit(")", 1)[1].split()
        groups = (directory / "cgroup").read_text().splitlines()
    except (FileNotFoundError, ProcessLookupError):
        return None
    group = next(line[3:] for line in groups if line.startswith("0::"))
    return {"pid": pid, "ppid": int(fields[1]), "start_ticks": int(fields[19]),
            "state": fields[0], "cgroup": group}


def group_status(group):
    path = PurePosixPath(group)
    require(path.is_absolute() and len(path.parts) > 1 and ".." not in path.parts, "invalid cgroup path")
    events = CGROUP.joinpath(*path.parts[1:], "cgroup.events")
    try:
        return int(dict(line.split() for line in events.read_text().splitlines())["populated"])
    except FileNotFoundError:
        return None


def snapshot(container):
    current = identity(container)
    rows = docker("top", container, "-eo", "pid,ppid").splitlines()[1:]
    pids = {int(line.split()[0]) for line in rows}
    parent = host_process(current["pid"])
    require(current["running"] and parent is not None and current["pid"] in pids, "missing host PID")
    children = [host_process(pid) for pid in pids - {parent["pid"]}]
    require(len(children) == 1 and children[0] is not None, "expected one fixture child")
    child = children[0]
    group = parent["cgroup"]
    require(child["ppid"] == parent["pid"] and child["cgroup"] == group and container in group,
            "fixture processes are not in the owned container cgroup")
    return {"identity": current, "members": [parent, child], "populated": group_status(group)}


def retired(member):
    after = host_process(member["pid"])
    return after is None or after["start_ticks"] != member["start_ticks"] or after["state"] == "Z"


def concurrent():
    with running("A") as (a, _), running("B") as (b, _):
        a_before, b_before = snapshot(a), snapshot(b)
        require(read_report(a) is None and read_report(b) is None, "unexpected early report")
        started = time.monotonic_ns()
        docker("stop", "--signal", "SIGTERM", "--timeout", str(STOP_GRACE), a)
        stop_ms = elapsed(started)
        state = configuration(a)["State"]
        members = a_before["members"]
        group = members[0]["cgroup"]
        wait_for(lambda: all(retired(member) for member in members) and group_status(group) in (0, None),
                 "A still has active members or a populated cgroup")
        a_after = {"running": state["Running"], "pid": state["Pid"], "exit_code": state["ExitCode"],
                   "populated": group_status(group), "members_retired": [retired(member) for member in members]}
        b_after = snapshot(b)
        execute(b, "finish")
        wait_for(lambda: read_report(b) is not None, "B did not finish the report")
        result = {"a_before": a_before, "a_after": a_after, "b_before": b_before,
                  "b_after": b_after, "b_report": read_report(b), "stop_ms": stop_ms, "grace_seconds": STOP_GRACE}
    return result


def expected_report(task):
    return {"task": task, "amount": 10 + 27, "input_sha256": sha256(b"[10,27]").hexdigest()}


def source_hashes():
    return {path.name: sha256(path.read_bytes()).hexdigest() for path in (Path(__file__), FIXTURE)}


def verify(record):
    require(record["status"] == "passed" and record["scope"] == SCOPE and record["image"] == IMAGE,
            "wrong experiment scope")
    require(record["source_sha256"] == source_hashes(), "source bytes changed")
    env, warm, overlap = (record[key] for key in ("environment", "reuse", "concurrent"))
    require(env["platform"] == "linux/amd64" and bool(env["docker_server"])
            and re.fullmatch(r"sha256:[0-9a-f]{64}", warm["image_id"]), "unexpected environment")
    require(warm["before"] == warm["after"] and warm["before"]["running"] and warm["before"]["pid"] > 0
            and warm["before"]["restart_count"] == 0, "container was recreated or restarted")
    require(warm["container_user"] == "65534:65534" and warm["readonly_root"] is True
            and warm["network"] == "none" and "uid=65534" in warm["work_tmpfs"], "effective configuration changed")
    for name in ("first", "second"):
        row = warm[name]
        require(0 < row["exec_ms"] <= row["request_to_readback_ms"] and row["worker"] == {"accepted": True, "previous": None}
                and row["independent_report"] == expected_report(name), f"{name}: unexpected task result")
    require(0 < warm["cold_create_to_ready_ms"] < warm["cold_create_to_first_readback_ms"] and warm["without_reset"]["worker"] ==
            {"accepted": False, "previous": "first"} and warm["without_reset"]["independent_report"] ==
            expected_report("first") and warm["report_after_reset"] is None, "stale state control failed")
    before_a, before_b, after_b = (overlap[key] for key in ("a_before", "b_before", "b_after"))
    ids = [item["id"] for item in (warm["before"], before_a["identity"], before_b["identity"])]
    require(len(set(ids)) == 3 and all(re.fullmatch(r"[0-9a-f]{64}", item) for item in ids), "container identities overlap")
    require(record["removed_ids"] == ids, "container cleanup record is incomplete")
    for observation in (before_a, before_b, after_b):
        main, child = observation["members"]
        owner = observation["identity"]
        require(observation["populated"] == 1 and owner["running"] and main["pid"] == owner["pid"]
                and child["ppid"] == main["pid"] and child["pid"] != main["pid"]
                and owner["id"] in main["cgroup"] and main["cgroup"] == child["cgroup"], "invalid group ownership")
    after_a = overlap["a_after"]
    require(overlap["grace_seconds"] == STOP_GRACE and overlap["stop_ms"] >= 900 and after_a["running"] is False
            and after_a["pid"] == 0 and after_a["exit_code"] == 137 and after_a["populated"] in (0, None)
            and after_a["members_retired"] == [True, True], "A did not terminate cleanly")
    stable = lambda row: [{key: value for key, value in member.items() if key != "state"} for member in row["members"]]
    require(before_b["identity"] == after_b["identity"] and stable(before_b) == stable(after_b)
            and overlap["b_report"] == expected_report("B"), "B changed identity or failed to produce the report")


def run():
    require(platform.system() == "Linux" and (CGROUP / "cgroup.controllers").is_file(),
            "run from the Linux Docker host with cgroup v2")
    server = json.loads(docker("version", "--format", "{{json .Server}}"))
    require((server["Os"], server["Arch"]) == ("linux", "amd64"), "Linux/amd64 Docker daemon required")
    warm, overlap = reuse(), concurrent()
    ids = [warm["before"]["id"], overlap["a_before"]["identity"]["id"], overlap["b_before"]["identity"]["id"]]
    removed = [container for container in ids if not docker(
        "container", "ls", "--all", "--quiet", "--no-trunc", "--filter", "id=" + container)]
    record = {"status": "passed", "scope": SCOPE, "image": IMAGE, "source_sha256": source_hashes(),
              "environment": {"platform": "linux/amd64", "docker_server": server["Version"], "kernel": platform.release()},
              "reuse": warm, "concurrent": overlap, "removed_ids": removed}
    verify(record)
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--output", type=Path)
    mode.add_argument("--check-record", type=Path)
    args = parser.parse_args()
    if args.check_record:
        verify(json.loads(args.check_record.read_text()))
        print("verified saved Docker lifecycle record")
    else:
        record = run()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
