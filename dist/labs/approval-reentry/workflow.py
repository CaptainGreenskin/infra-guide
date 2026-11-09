"""Persist an approval wait, then authorize native MCP effects at the receiver.

Two isolated Python environments run native LangGraph and MCP. The supervisor
uses synthetic identities, controls local policy changes and independently
checks receiver.sqlite. No LLM, real IdP, remote service or Kairo is used.
"""

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from typing import TypedDict

os.environ["LANGGRAPH_STRICT_MSGPACK"] = "true"
os.environ["LANGSMITH_TRACING"] = "false"

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


ROOT = Path(__file__).resolve().parent
THREAD_ID = "report-A-history"
CONFIG = {"configurable": {"thread_id": THREAD_ID}}
CASES = ("normal", "revoked_before_resume", "changed_arguments",
         "committed_then_write_revoked", "committed_then_all_revoked", "unsafe_approval_snapshot")
SOURCE_FILES = ("workflow.py", "mcp_bridge.py", "source.json")


class ReportState(TypedDict, total=False):
    intent: dict
    approval_id: str
    status: str
    observations: list
    receipt: dict


def load(path):
    return json.loads(path.read_text())


def bridge(folder, mcp_python, mode, *arguments):
    result = subprocess.run(
        [str(mcp_python), "-B", str(ROOT / "mcp_bridge.py"), mode,
         "--db", str(folder / "receiver.sqlite"), *arguments],
        text=True, capture_output=True, timeout=20,
    )
    if result.returncode:
        raise RuntimeError(f"MCP bridge {mode} failed: {result.stderr}")
    return json.loads(result.stdout)


def atomic_barrier(folder, value):
    pending = folder / "cut.tmp"
    pending.write_text(json.dumps(value))
    pending.replace(folder / "cut.json")


def build_graph(saver, folder, mcp_python, case, cut_after_commit=False):
    def prepare(state):
        source = load(folder / "source.json")
        return {"intent": {
            "operation_id": source["operation_id"], "task_id": source["task_id"],
            "source_version": source["source_version"], "resource": source["resource"],
            "amount": sum(value for batch in source["batches"].values() for value in batch),
        }, "status": "waiting_approval", "observations": []}

    def approval(state):
        signal_value = interrupt({"kind": "approval_required", "intent": state["intent"]})
        # This value identifies an operator record; it cannot grant permission.
        if (not isinstance(signal_value, dict) or set(signal_value) != {"approval_id"}
                or not isinstance(signal_value["approval_id"], str)):
            raise ValueError("invalid approval reference")
        return {"approval_id": signal_value["approval_id"], "status": "ready_to_attempt"}

    def execute(state):
        observations = list(state["observations"])

        def invoke(tool, arguments):
            options = ["--tool", tool, "--arguments", json.dumps(arguments)]
            if case == "unsafe_approval_snapshot":
                options.append("--unsafe-snapshot")
            observed = bridge(folder, mcp_python, "call", *options)
            observations.append(observed)
            return observed["result"]

        intent = state["intent"]
        found = invoke("get_receipt", {"operation_id": intent["operation_id"]})
        if found["status"] == "denied":
            # Return this update before entering the separate interrupt node.
            return {"status": "pending_confirmation", "observations": observations}
        if found["status"] == "found":
            receipt = found["receipt"]
        elif found["status"] == "absent":
            arguments = {**intent, "approval_id": state["approval_id"]}
            if case == "changed_arguments":
                arguments["amount"] -= 1
            response = invoke("publish_report", arguments)
            if response["status"] not in {"committed", "replayed"}:
                return {"status": response["status"], "observations": observations}
            receipt = response["receipt"]
            if cut_after_commit:
                atomic_barrier(folder, {"worker_pid": os.getpid(), "observations": observations})
                while True:
                    signal.pause()
        else:
            raise RuntimeError("unexpected receipt lookup outcome")
        if any(receipt.get(key) != value for key, value in intent.items()):
            raise ValueError("receipt does not match durable intent")
        return {"status": "succeeded", "receipt": receipt, "observations": observations}

    def confirmation_wait(state):
        interrupt({"kind": "receipt_access_required", "operation_id": state["intent"]["operation_id"]})
        return {}

    graph = StateGraph(ReportState)
    for name, function in (("prepare", prepare), ("approval", approval), ("execute", execute),
                           ("confirmation_wait", confirmation_wait)):
        graph.add_node(name, function)
    graph.add_edge(START, "prepare")
    graph.add_edge("prepare", "approval")
    graph.add_edge("approval", "execute")
    graph.add_conditional_edges("execute", lambda state: (
        "confirmation_wait" if state["status"] == "pending_confirmation" else END))
    graph.add_edge("confirmation_wait", "execute")
    return graph.compile(checkpointer=saver)


def snapshot(graph):
    state = graph.get_state(CONFIG)
    return {"next": list(state.next), "values": state.values,
            "checkpoint_id": state.config["configurable"]["checkpoint_id"],
            "tasks": [{"name": task.name,
                       "interrupts": [{"id": item.id, "value": item.value} for item in task.interrupts]}
                      for task in state.tasks]}


def worker(folder, mcp_python, case, action):
    with SqliteSaver.from_conn_string(str(folder / "checkpoints.sqlite")) as saver:
        cut = action == "resume" and case.startswith("committed_then_")
        graph = build_graph(saver, folder, mcp_python, case, cut_after_commit=cut)
        if action == "start":
            graph.invoke({}, CONFIG, durability="sync")
        elif action == "resume":
            source = load(folder / "source.json")
            graph.invoke(Command(resume={"approval_id": source["approval_id"]}), CONFIG, durability="sync")
        elif action == "recover":
            graph.invoke(None, CONFIG, durability="sync")
        return {"worker_pid": os.getpid(), "checkpoint": snapshot(graph)}


def reopen(folder, mcp_python, case):
    with SqliteSaver.from_conn_string(str(folder / "checkpoints.sqlite")) as saver:
        return snapshot(build_graph(saver, folder, mcp_python, case))


def receiver(folder):
    uri = (folder / "receiver.sqlite").resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        db.row_factory = sqlite3.Row
        result = {"policy": dict(db.execute("SELECT * FROM policy").fetchone())}
        for name, order in (("approvals", "approval_id"), ("reports", "revision"), ("events", "seq")):
            result[name] = [dict(row) for row in db.execute(f"SELECT * FROM {name} ORDER BY {order}")]
        result["receipts"] = [json.loads(row[0]) for row in db.execute("SELECT body FROM receipts ORDER BY operation_id")]
        return result


def oracle(folder, expected_effects):
    """The host compares full receiver state to source, never to graph claims."""
    source = load(folder / "source.json")
    expected_amount = sum(number for batch in source["batches"].values() for number in batch)
    expected = {**source["fixture_principal"], "tool": "publish_report",
                "operation_id": source["operation_id"], "task_id": source["task_id"],
                "resource": source["resource"], "source_version": source["source_version"],
                "amount": expected_amount}
    encoded = json.dumps(expected, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    expected_digest = hashlib.sha256(encoded.encode()).hexdigest()
    expected_receipt = {**expected, "revision": 1, "intent_digest": expected_digest}
    expected_report = {key: value for key, value in expected_receipt.items() if key != "tool"}
    actual = receiver(folder)
    committed = [event for event in actual["events"]
                 if event["tool"] == "publish_report" and event["outcome"] == "committed"]
    approval = actual["approvals"]
    conditions = {
        "exact_reports": actual["reports"] == ([expected_report] if expected_effects else []),
        "exact_receipts": actual["receipts"] == ([expected_receipt] if expected_effects else []),
        "current_permission_at_commit": all(event["can_write"] == 1 for event in committed),
        "one_approval_bound_to_intent": len(approval) == 1 and approval[0]["intent_digest"] == expected_digest,
        "approval_consumption": len(approval) == 1 and approval[0]["used_by"] ==
                                (source["operation_id"] if expected_effects else None),
        "commits_match_effects": len(committed) == len(actual["reports"]),
    }
    return {"accepted": all(conditions.values()), "conditions": conditions,
            "expected_amount": expected_amount, "effect_count": len(actual["reports"]),
            "amounts": [row["amount"] for row in actual["reports"]]}


def spawn_worker(folder, mcp_python, case, action):
    return subprocess.Popen(
        [sys.executable, "-B", str(ROOT / "workflow.py"), "worker", "--output-dir", str(folder),
         "--mcp-python", str(mcp_python), "--case", case, "--action", action],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True,
    )


def stop(worker_process):
    if worker_process.poll() is None:
        try:
            os.killpg(worker_process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    return worker_process.communicate(timeout=10)


def run_worker(folder, mcp_python, case, action):
    process = spawn_worker(folder, mcp_python, case, action)
    try:
        stdout, stderr = process.communicate(timeout=35)
        if process.returncode:
            raise RuntimeError(f"worker {case}/{action} failed: {stderr}")
        return json.loads(stdout)
    finally:
        if process.poll() is None:
            stop(process)


def crash_worker(folder, mcp_python, case):
    process = spawn_worker(folder, mcp_python, case, "resume")
    try:
        deadline = time.monotonic() + 35
        while not (folder / "cut.json").exists():
            if process.poll() is not None:
                _, stderr = process.communicate()
                raise RuntimeError(f"worker exited before barrier: {stderr}")
            if time.monotonic() > deadline:
                raise TimeoutError("worker did not reach the post-commit barrier")
            time.sleep(0.02)
        cut = load(folder / "cut.json")
        cut["checkpoint"] = reopen(folder, mcp_python, case)
        cut["receiver"] = receiver(folder)
        assert cut["worker_pid"] == process.pid
        assert cut["checkpoint"]["next"] == ["execute"]
        assert "receipt" not in cut["checkpoint"]["values"]
        assert len(cut["receiver"]["reports"]) == 1
        assert cut["observations"][-1]["result"]["status"] == "committed"
    finally:
        stop(process)
    assert process.returncode == -signal.SIGKILL
    assert reopen(folder, mcp_python, case) == cut["checkpoint"]
    cut["exit_signal"] = "SIGKILL"
    return cut


def is_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def run_case(folder, mcp_python, case):
    folder.mkdir()
    (folder / "source.json").write_bytes((ROOT / "source.json").read_bytes())
    bridge(folder, mcp_python, "init", "--source", str(folder / "source.json"))
    waiting = run_worker(folder, mcp_python, case, "start")
    assert waiting["checkpoint"]["next"] == ["approval"]
    assert waiting["checkpoint"]["values"]["status"] == "waiting_approval"
    assert waiting["checkpoint"]["tasks"][0]["interrupts"]
    waiting_reopened = reopen(folder, mcp_python, case)
    waiting_receiver = receiver(folder)
    assert waiting_reopened == waiting["checkpoint"]
    assert all(not waiting_receiver[name] for name in ("approvals", "reports", "receipts", "events"))
    approval = bridge(folder, mcp_python, "approve", "--source", str(folder / "source.json"))
    record = {"thread_id": THREAD_ID, "waiting": waiting,
              "waiting_reopened_checkpoint": waiting_reopened, "waiting_receiver": waiting_receiver,
              "approval": approval}
    if case in {"revoked_before_resume", "unsafe_approval_snapshot"}:
        record["policy_change"] = bridge(folder, mcp_python, "revoke")
    if case.startswith("committed_then_"):
        record["cut"] = crash_worker(folder, mcp_python, case)
        read_allowed = case == "committed_then_write_revoked"
        record["policy_change"] = bridge(folder, mcp_python, "revoke", "--read", str(int(read_allowed)))
        record["recovery"] = run_worker(folder, mcp_python, case, "recover")
        assert record["recovery"]["worker_pid"] != record["cut"]["worker_pid"]
        final = record["recovery"]
    else:
        record["resume"] = run_worker(folder, mcp_python, case, "resume")
        final = record["resume"]
    assert final["worker_pid"] != waiting["worker_pid"]
    record["reopened_checkpoint"] = reopen(folder, mcp_python, case)
    assert record["reopened_checkpoint"] == final["checkpoint"]
    record["receiver"] = receiver(folder)
    expected_effects = 0 if case in {"revoked_before_resume", "changed_arguments"} else 1
    record["oracle"] = oracle(folder, expected_effects)
    assert record["oracle"]["accepted"] == (case != "unsafe_approval_snapshot")
    values = final["checkpoint"]["values"]
    expected_status = {"revoked_before_resume": "denied", "changed_arguments": "approval_mismatch",
                       "committed_then_all_revoked": "pending_confirmation"}.get(case, "succeeded")
    assert values["status"] == expected_status
    if case == "committed_then_all_revoked":
        assert final["checkpoint"]["next"] == ["confirmation_wait"]
        assert "receipt" not in values
        assert values["observations"][-1]["result"] == {"status": "denied"}
        assert values["observations"][-1]["text_content"] == '{"status":"denied"}'
        pending = final["checkpoint"]["tasks"][0]["interrupts"]
        assert len(pending) == 1 and pending[0]["value"]["kind"] == "receipt_access_required"
    else:
        assert final["checkpoint"]["next"] == []
    events = record["receiver"]["events"]
    tools = [event for event in events if event["kind"] == "tool"]
    if case.startswith("committed_then_"):
        revoked_at = next(event["seq"] for event in events if event["kind"] == "policy_change")
        after_revoke = [event for event in tools if event["seq"] > revoked_at]
        assert len(after_revoke) == 1 and after_revoke[0]["tool"] == "get_receipt"
        assert after_revoke[0]["outcome"] == ("found" if case.endswith("write_revoked") else "denied")
        record["post_revoke_tools"] = [event["tool"] for event in after_revoke]
    if case == "unsafe_approval_snapshot":
        assert record["oracle"]["conditions"]["current_permission_at_commit"] is False
        assert sum(not value for value in record["oracle"]["conditions"].values()) == 1
    server_pids = sorted({event["server_pid"] for event in tools})
    assert all(not is_alive(pid) for pid in server_pids)
    record["cleanup"] = {"observed_mcp_server_pids": server_pids, "all_exited": True}
    return record


def suite(folder, mcp_python):
    if os.name != "posix":
        raise RuntimeError("this experiment requires POSIX process groups and SIGKILL")
    cases = {case: run_case(folder / case, mcp_python, case) for case in CASES}
    observation = cases["normal"]["resume"]["checkpoint"]["values"]["observations"][0]
    return {"schema": "approval-reentry-validation-v1", "status": "passed",
            "verified_at_utc": datetime.now(timezone.utc).isoformat(),
            "environment": {"graph_python": sys.version.split()[0], "mcp_python": observation["python"],
                            "langgraph": version("langgraph"), "mcp": observation["mcp_version"],
                            "langgraph_checkpoint_sqlite": version("langgraph-checkpoint-sqlite"),
                            "sqlite": sqlite3.sqlite_version},
            "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCE_FILES},
            "cases": cases,
            "scope": "Local native SDKs, file checkpoints, synthetic trusted principal and logical time, "
                     "receiver-local atomic authorization, owned processes. No OAuth, LLM, remote tool or Kairo."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["suite", "worker"], default="suite", nargs="?")
    parser.add_argument("--mcp-python", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--case", choices=CASES)
    parser.add_argument("--action", choices=["start", "resume", "recover", "inspect"])
    args = parser.parse_args()
    mcp_python = args.mcp_python.absolute()
    if args.mode == "worker":
        if args.output_dir is None or args.case is None or args.action is None:
            parser.error("worker requires --output-dir, --case and --action")
        result = worker(args.output_dir, mcp_python, args.case, args.action)
    elif args.output_dir:
        args.output_dir.mkdir(exist_ok=False)
        result = suite(args.output_dir, mcp_python)
    else:
        with TemporaryDirectory(prefix="approval-reentry-") as directory:
            result = suite(Path(directory), mcp_python)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
