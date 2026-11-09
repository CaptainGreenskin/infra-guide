"""Real LangGraph parallel writes, checkpoint replay, and a SQLite receiver."""
from __future__ import annotations

import argparse
from contextlib import closing
import hashlib
from importlib.metadata import version
import json
import operator
import os
from pathlib import Path
import platform
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
from typing import Annotated, TypedDict

os.environ["LANGGRAPH_STRICT_MSGPACK"] = "true"
os.environ["LANGSMITH_TRACING"] = "false"

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.errors import InvalidUpdateError
from langgraph.graph import END, START, StateGraph

HERE = Path(__file__).resolve().parent
DRAFTS = ("draft_a", "draft_b")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def merge_candidates(left, right):
    grouped = {}
    for batch in (left, right):
        for operation, variants in batch.items():
            group = grouped.setdefault(operation, {})
            for payload, origins in variants.items():
                group[payload] = sorted(set(group.get(payload, [])) | set(origins))
    return {operation: dict(sorted(variants.items()))
            for operation, variants in sorted(grouped.items())}


class BaseState(TypedDict, total=False):
    operation_id: str
    decision: str
    receipt: str


class DefaultState(BaseState):
    proposals: list[dict]


class ListState(BaseState):
    proposals: Annotated[list[dict], operator.add]


class MergeState(BaseState):
    proposals: Annotated[dict[str, dict[str, list[str]]], merge_candidates]


def setup_receiver(path):
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.executescript("""
            CREATE TABLE effects (
              case_id TEXT, operation_id TEXT, payload TEXT, receipt TEXT,
              PRIMARY KEY(case_id, operation_id)
            );
            CREATE TABLE requests (
              seq INTEGER PRIMARY KEY, case_id TEXT, operation_id TEXT, payload TEXT,
              result TEXT, receipt TEXT, pid INTEGER
            );
            CREATE TABLE visits (
              seq INTEGER PRIMARY KEY, case_id TEXT, node TEXT, stage TEXT,
              pid INTEGER, tid INTEGER
            );
        """)


def visit(path, case_id, node, stage):
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute("INSERT INTO visits(case_id,node,stage,pid,tid) VALUES(?,?,?,?,?)",
                     (case_id, node, stage, os.getpid(), threading.get_ident()))


def receive(path, case_id, operation, payload):
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        old = conn.execute(
            "SELECT payload,receipt FROM effects WHERE case_id=? AND operation_id=?",
            (case_id, operation),
        ).fetchone()
        if old is None:
            receipt = f"{operation}:receipt-1"
            conn.execute("INSERT INTO effects VALUES(?,?,?,?)",
                         (case_id, operation, payload, receipt))
            result = "committed"
        elif old[0] == payload:
            result, receipt = "duplicate", old[1]
        else:
            result, receipt = "payload_conflict", None
        conn.execute("""
            INSERT INTO requests(case_id,operation_id,payload,result,receipt,pid)
            VALUES(?,?,?,?,?,?)
        """, (case_id, operation, payload, result, receipt, os.getpid()))
    return result, receipt


def build_graph(case, fixture, receiver_path, saver):
    schema = {"default": DefaultState, "list": ListState, "merge": MergeState}[case["channel"]]
    graph = StateGraph(schema)
    ready = threading.Barrier(2, timeout=10)
    first_emitted = threading.Event()
    name = case["name"]

    def draft(branch):
        def run(state):
            visit(receiver_path, name, branch, "entered")
            ready.wait()
            if branch != case["first"] and not first_emitted.wait(10):
                raise RuntimeError("Missing first branch emission")
            operation = state["operation_id"]
            payload = {"report": fixture["report"], "total": case["totals"][branch]}
            if case["channel"] == "merge":
                proposals = {operation: {canonical(payload): [branch]}}
            else:
                proposals = [{"operation_id": operation, "payload": payload, "origin": branch}]
            visit(receiver_path, name, branch, "emitted")
            if branch == case["first"]:
                first_emitted.set()
            return {"proposals": proposals}
        return run

    def decide(state):
        visit(receiver_path, name, "decide", "entered")
        if case["channel"] != "merge":
            return {"decision": "list_observed"}
        variants = state["proposals"][state["operation_id"]]
        return {"decision": "publish" if len(variants) == 1 else "review_required"}

    def publish(state):
        visit(receiver_path, name, "publish", "entered")
        operation = state["operation_id"]
        payload, = state["proposals"][operation]
        result, receipt = receive(receiver_path, name, operation, payload)
        if result == "payload_conflict":
            raise RuntimeError("Receiver rejected changed payload")
        return {"receipt": receipt}

    for branch in DRAFTS:
        graph.add_node(branch, draft(branch))
        graph.add_edge(START, branch)
    graph.add_node("decide", decide)
    graph.add_node("publish", publish)
    graph.add_edge(list(DRAFTS), "decide")
    graph.add_conditional_edges(
        "decide",
        lambda state: state["decision"],
        {"publish": "publish", "review_required": END, "list_observed": END},
    )
    graph.add_edge("publish", END)
    return graph.compile(checkpointer=saver)


def replay(work):
    fixture = json.loads((HERE / "fixture.json").read_text())
    same = next(case for case in fixture["cases"] if case["name"] == "canonical_same")
    before_publish = json.loads((work / "replay-config.json").read_text())
    with SqliteSaver.from_conn_string(str(work / "checkpoints.sqlite")) as saver:
        graph = build_graph(same, fixture, work / "receiver.sqlite", saver)
        assert graph.get_state(before_publish).next == ("publish",)
        result = graph.invoke(None, before_publish, durability="sync")
    print(canonical({"receipt": result["receipt"], "decision": result["decision"]}))


def observe(work, fixture):
    receiver = work / "receiver.sqlite"
    setup_receiver(receiver)
    runs = {}
    with SqliteSaver.from_conn_string(str(work / "checkpoints.sqlite")) as saver:
        for case in fixture["cases"]:
            name = case["name"]
            graph = build_graph(case, fixture, receiver, saver)
            config = {"configurable": {"thread_id": name}}
            try:
                state = graph.invoke({"operation_id": fixture["operation_id"]}, config, durability="sync")
            except InvalidUpdateError as error:
                if case["channel"] != "default":
                    raise
                runs[name] = {"error_type": type(error).__name__, "error": str(error)}
                continue
            runs[name] = {key: state[key] for key in ("proposals", "decision", "receipt") if key in state}
            if name == "canonical_same":
                before_publish = next(snapshot for snapshot in graph.get_state_history(config)
                                      if snapshot.next == ("publish",))
                (work / "replay-config.json").write_text(canonical(before_publish.config))
                runs[name]["replay_checkpoint_next"] = list(before_publish.next)
                runs[name]["replay_checkpoint_id"] = before_publish.config["configurable"]["checkpoint_id"]

    child = subprocess.run([sys.executable, "-B", str(Path(__file__).resolve()), "--replay", str(work)],
                           check=True, capture_output=True, text=True, timeout=30)
    runs["canonical_same"]["replay"] = json.loads(child.stdout)
    with closing(sqlite3.connect(receiver)) as conn:
        conn.row_factory = sqlite3.Row
        for case in fixture["cases"]:
            name = case["name"]
            for table in ("visits", "requests", "effects"):
                ordering = "operation_id" if table == "effects" else "seq"
                rows = conn.execute(f"SELECT * FROM {table} WHERE case_id=? ORDER BY {ordering}", (name,))
                runs[name][table] = [dict(row) for row in rows]
    return runs


def check_results(runs):
    same = runs["canonical_same"]
    conflict = runs["canonical_conflict"]
    reversed_conflict = runs["canonical_conflict_reverse"]
    expected = (
        runs["default_channel"].get("error_type") == "InvalidUpdateError",
        len(runs["append_only"]["proposals"]) == 2,
        [request["result"] for request in same["requests"]] == ["committed", "duplicate"],
        len(same["effects"]) == 1 and same["replay"]["receipt"] == same["receipt"],
        conflict["decision"] == reversed_conflict["decision"] == "review_required",
        conflict["proposals"] == reversed_conflict["proposals"],
        not any(run["requests"] for name, run in runs.items() if name != "canonical_same"),
    )
    if not all(expected):
        raise RuntimeError("Observed results disagree with the teaching fixture")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    mode = cli.add_mutually_exclusive_group(required=True)
    mode.add_argument("--output", type=Path, help="new directory for the JSON record and raw receiver")
    mode.add_argument("--replay", type=Path, help=argparse.SUPPRESS)
    args = cli.parse_args()
    if args.replay is not None:
        replay(args.replay)
        return

    fixture = json.loads((HERE / "fixture.json").read_text())
    with tempfile.TemporaryDirectory(prefix="lg-parallel-") as directory:
        work = Path(directory)
        runs = observe(work, fixture)
        check_results(runs)
        args.output.mkdir()
        raw_names = ("receiver.sqlite", "checkpoints.sqlite")
        for name in raw_names:
            shutil.copyfile(work / name, args.output / name)
    record = {
        "status": "passed",
        "environment": {
            "system": platform.system(), "machine": platform.machine(),
            "python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
            "langgraph": version("langgraph"),
            "langgraph_checkpoint_sqlite": version("langgraph-checkpoint-sqlite"),
        },
        "scope": "native LangGraph 2-thread branches and a new-process checkpoint replay with a local SQLite receiver",
        "source_sha256": {name: digest(HERE / name) for name in ("parallel_merge.py", "fixture.json", "requirements.txt")},
        "raw_sha256": {name: digest(args.output / name) for name in raw_names},
        "cases": runs,
    }
    (args.output / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
