"""Crash and restart a native LangGraph worker after a real MCP stdio receipt."""

import argparse
from contextlib import closing
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

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph


ROOT = Path(__file__).resolve().parent
THREAD_ID = "report-A-history"
CONFIG = {"configurable": {"thread_id": THREAD_ID}}
START_FILES = ("workflow.py", "mcp_bridge.py", "source.json", "README.md")


class ReportState(TypedDict, total=False):
    intent: dict
    receipt: dict
    observed_mcp: dict


def read_json(path):
    return json.loads(path.read_text())


def durable_intent(_state):
    source = read_json(ROOT / "source.json")
    return {"intent": {
        "task_id": source["task_id"],
        "source_version": source["source_version"],
        "amount": sum(sum(batch) for batch in source["batches"].values()),
        "operation_id": source["task_id"] + ":publish",
    }}


def write_barrier(folder, value):
    pending = folder / "cut.tmp"
    pending.write_text(json.dumps(value))
    pending.replace(folder / "cut.json")


def build_graph(saver, folder, mcp_python, case, attempt):
    def publish(state):
        arguments = dict(state["intent"])
        if case == "attempt_derived_id":
            arguments["operation_id"] += f":attempt-{attempt}"
        child = subprocess.run(
            [str(mcp_python), "-B", str(ROOT / "mcp_bridge.py"), "call",
             "--db", str(folder / "receiver.sqlite"), "--arguments", json.dumps(arguments)],
            text=True, capture_output=True, timeout=15, check=True,
        )
        observed = json.loads(child.stdout)
        if attempt == 1:
            write_barrier(folder, {"worker_pid": os.getpid(), "arguments": arguments,
                                   "observed_mcp": observed})
            while True:
                signal.pause()
        return {"receipt": observed["receipt"], "observed_mcp": observed}

    graph = StateGraph(ReportState)
    graph.add_node("intent", durable_intent)
    graph.add_node("publish", publish)
    graph.add_edge(START, "intent")
    graph.add_edge("intent", "publish")
    graph.add_edge("publish", END)
    return graph.compile(checkpointer=saver)


def snapshot(graph):
    state = graph.get_state(CONFIG)
    return {
        "next": list(state.next),
        "checkpoint_id": state.config["configurable"]["checkpoint_id"],
        "values": state.values,
    }


def worker(folder, mcp_python, case, attempt):
    with SqliteSaver.from_conn_string(str(folder / "checkpoints.sqlite")) as saver:
        graph = build_graph(saver, folder, mcp_python, case, attempt)
        graph.invoke({} if attempt == 1 else None, CONFIG, durability="sync")
        return {"worker_pid": os.getpid(), "checkpoint": snapshot(graph)}


def checkpoint(folder, mcp_python, case):
    with SqliteSaver.from_conn_string(str(folder / "checkpoints.sqlite")) as saver:
        return snapshot(build_graph(saver, folder, mcp_python, case, 0))


def receiver(folder):
    path = (folder / "receiver.sqlite").resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(path, uri=True)) as db:
        db.row_factory = sqlite3.Row
        return {
            "reports": [dict(row) for row in db.execute("SELECT * FROM reports ORDER BY revision")],
            "receipts": [json.loads(row[0]) for row in db.execute("SELECT body FROM receipts ORDER BY operation_id")],
            "attempts": [dict(row) for row in db.execute("SELECT * FROM attempts ORDER BY id")],
        }


def oracle(folder):
    """Read authoritative source and receiver storage, independent of graph output."""
    source = read_json(ROOT / "source.json")
    expected = sum(number for batch in source["batches"].values() for number in batch)
    actual = receiver(folder)
    reports = actual["reports"]
    receipts = actual["receipts"]
    bindings = {
        (row["revision"], row["operation_id"], row["task_id"], row["source_version"], row["amount"])
        for row in reports
    }
    receipt_bindings = {
        (row["revision"], row["operation_id"], row["task_id"], row["source_version"], row["amount"])
        for row in receipts
    }
    conditions = {
        "one_report_and_receipt": len(reports) == len(receipts) == 1,
        "correct_source_and_amount": bool(reports) and all(
            (row["task_id"], row["source_version"], row["amount"]) ==
            (source["task_id"], source["source_version"], expected) for row in reports
        ),
        "receipt_matches_report": bindings == receipt_bindings,
    }
    return {"accepted": all(conditions.values()), "conditions": conditions,
            "expected_amount": expected, "effect_count": len(reports),
            "amounts": [row["amount"] for row in reports]}


def spawn_worker(folder, mcp_python, case, attempt):
    return subprocess.Popen(
        [sys.executable, "-B", str(Path(__file__).resolve()), "worker",
         "--output-dir", str(folder), "--mcp-python", str(mcp_python),
         "--case", case, "--attempt", str(attempt)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True,
    )


def stop_worker(worker_process):
    if worker_process.poll() is None:
        try:
            os.killpg(worker_process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    return worker_process.communicate(timeout=10)


def run_case(folder, mcp_python, case):
    folder.mkdir()
    first = spawn_worker(folder, mcp_python, case, 1)
    try:
        deadline = time.monotonic() + 22
        while not (folder / "cut.json").exists():
            if first.poll() is not None:
                _, stderr = first.communicate()
                raise RuntimeError(f"worker exited before the commit barrier: {stderr}")
            if time.monotonic() > deadline:
                raise TimeoutError("worker did not reach the commit barrier")
            time.sleep(0.02)
        cut = read_json(folder / "cut.json")
        cut["checkpoint"] = checkpoint(folder, mcp_python, case)
        cut["receiver"] = receiver(folder)
        assert cut["worker_pid"] == first.pid
        assert cut["checkpoint"]["next"] == ["publish"]
        assert "receipt" not in cut["checkpoint"]["values"]
        assert len(cut["receiver"]["reports"]) == len(cut["receiver"]["attempts"]) == 1
        assert cut["receiver"]["receipts"] == [cut["observed_mcp"]["receipt"]]
        assert cut["receiver"]["attempts"][0]["outcome"] == "committed"
    finally:
        stop_worker(first)
    assert first.returncode == -signal.SIGKILL
    cut["exit_signal"] = "SIGKILL"
    assert checkpoint(folder, mcp_python, case) == cut["checkpoint"]

    second = spawn_worker(folder, mcp_python, case, 2)
    try:
        stdout, stderr = second.communicate(timeout=22)
        if second.returncode != 0:
            raise RuntimeError(f"resumed worker failed: {stderr}")
        resumed = json.loads(stdout)
    finally:
        if second.poll() is None:
            stop_worker(second)
    resumed["receiver"] = receiver(folder)
    assert resumed["worker_pid"] == second.pid != first.pid
    assert not resumed["checkpoint"]["next"]
    assert resumed["checkpoint"]["checkpoint_id"] != cut["checkpoint"]["checkpoint_id"]
    receipts = resumed["receiver"]["receipts"]
    attempts = resumed["receiver"]["attempts"]
    assert len(attempts) == 2 and attempts[0]["server_pid"] != attempts[1]["server_pid"]
    final_receipt = resumed["checkpoint"]["values"]["receipt"]
    assert final_receipt in receipts
    verdict = oracle(folder)
    if case == "stable":
        assert attempts[0]["operation_id"] == attempts[1]["operation_id"]
        assert [row["outcome"] for row in attempts] == ["committed", "replayed"]
        assert cut["observed_mcp"]["receipt"] == final_receipt
        assert verdict["accepted"] and verdict["amounts"] == [42]
    else:
        assert attempts[0]["operation_id"] != attempts[1]["operation_id"]
        assert [row["outcome"] for row in attempts] == ["committed", "committed"]
        assert not verdict["accepted"] and verdict["amounts"] == [42, 42]
    return {"thread_id": THREAD_ID, "cut": cut, "resume": resumed, "oracle": verdict}


def suite(folder, mcp_python):
    cases = {name: run_case(folder / name, mcp_python, name)
             for name in ("stable", "attempt_derived_id")}
    mcp = cases["stable"]["cut"]["observed_mcp"]
    return {
        "schema": 1, "status": "passed",
        "scope": "Post-MCP-response, pre-LangGraph-node-return SIGKILL; native local stdio and two SQLite domains.",
        "environment": {
            "graph_python": sys.version.split()[0], "mcp_python": mcp["python"],
            "langgraph": version("langgraph"), "mcp": mcp["mcp_version"],
            "langgraph_checkpoint_sqlite": version("langgraph-checkpoint-sqlite"),
            "sqlite": sqlite3.sqlite_version,
        },
        "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                          for name in START_FILES},
        "cases": cases,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["suite", "worker"], default="suite", nargs="?")
    parser.add_argument("--mcp-python", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--case", choices=["stable", "attempt_derived_id"])
    parser.add_argument("--attempt", type=int, choices=[1, 2])
    args = parser.parse_args()
    mcp_python = args.mcp_python.absolute()
    if args.mode == "worker":
        result = worker(args.output_dir, mcp_python, args.case, args.attempt)
    elif args.output_dir:
        args.output_dir.mkdir(exist_ok=False)
        result = suite(args.output_dir, mcp_python)
    else:
        with TemporaryDirectory(prefix="v79-mcp-recovery-") as folder:
            result = suite(Path(folder), mcp_python)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
