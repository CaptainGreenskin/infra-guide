"""Resume one saved LangGraph interrupt under three graph upgrade policies."""

import argparse
from contextlib import closing
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
from typing import TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


HERE = Path(__file__).resolve().parent
CASES = ("unsafe", "bound", "version-routed")
SOURCE = json.loads((HERE / "fixture.json").read_text(encoding="utf8"))
APPROVAL_ID = SOURCE["approval_id"]
THREAD_ID = SOURCE["thread_id"]


class ReportState(TypedDict):
    workflow_version: int
    draft_total: int
    status: str


def intent(gate, total):
    return {**SOURCE[gate], "source_version": SOURCE["source_version"], "amount": total}


def initialize_receiver(database, total):
    with closing(sqlite3.connect(database)) as db, db:
        db.executescript("""
            CREATE TABLE approvals(id TEXT PRIMARY KEY, intent TEXT NOT NULL);
            CREATE TABLE decisions(seq INTEGER PRIMARY KEY, approval_id TEXT NOT NULL,
                                   requested TEXT NOT NULL, approved TEXT NOT NULL, outcome TEXT NOT NULL);
            CREATE TABLE writes(seq INTEGER PRIMARY KEY, approval_id TEXT NOT NULL, intent TEXT NOT NULL);
        """)
        db.execute("INSERT INTO approvals VALUES(?,?)", (APPROVAL_ID, json.dumps(intent("original_gate", total))))


def receiver_write(database, requested, approval_id, enforce_binding):
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        [(raw_approval,)] = db.execute("SELECT intent FROM approvals WHERE id=?", (approval_id,)).fetchall()
        approved = json.loads(raw_approval)
        outcome = "approval_mismatch" if enforce_binding and approved != requested else "committed"
        db.execute("INSERT INTO decisions(approval_id,requested,approved,outcome) VALUES(?,?,?,?)",
                   (approval_id, json.dumps(requested), raw_approval, outcome))
        if outcome == "committed":
            db.execute("INSERT INTO writes(approval_id,intent) VALUES(?,?)", (approval_id, json.dumps(requested)))
    return outcome


def read_receiver(database):
    with closing(sqlite3.connect(database)) as db:
        decisions = [{"seq": seq, "approval_id": approval, "requested": json.loads(requested),
                      "approved": json.loads(approved), "outcome": outcome}
                     for seq, approval, requested, approved, outcome in db.execute("SELECT * FROM decisions ORDER BY seq")]
        writes = [{"seq": seq, "approval_id": approval, "intent": json.loads(payload)}
                  for seq, approval, payload in db.execute("SELECT * FROM writes ORDER BY seq")]
    return {"decisions": decisions, "writes": writes,
            "a_effects": sum(write["intent"]["target"] == "A/daily" for write in writes),
            "b_effects": sum(write["intent"]["target"] == "B/daily" for write in writes)}


def build_graph(checkpointer, receiver, graph_version, enforce_binding):
    def approval_node(state):
        def visit_gate(gate):
            requested = intent(gate, state["draft_total"])
            reply = interrupt(requested)
            assert set(reply) == {"approval_id"}
            return receiver_write(receiver, requested, reply["approval_id"], enforce_binding)

        # The new implementation inserted a different question at index 0.
        if graph_version == 2:
            outcome = visit_gate("inserted_gate")
            if outcome != "committed":
                return {"status": outcome}
        return {"status": visit_gate("original_gate")}

    graph = StateGraph(ReportState)
    graph.add_node("approval", approval_node)
    graph.add_edge(START, "approval")
    graph.add_edge("approval", END)
    return graph.compile(checkpointer=checkpointer)


def config(thread_id):
    return {"configurable": {"thread_id": thread_id}}


def read_checkpoint(graph, thread_id):
    checkpoint = graph.get_state(config(thread_id))
    return {"thread_id": thread_id, "checkpoint_id": checkpoint.config["configurable"]["checkpoint_id"],
            "next": list(checkpoint.next), "state": checkpoint.values,
            "interrupts": [{"id": item.id, "intent": item.value}
                           for task in checkpoint.tasks for item in task.interrupts]}


def worker(directory, case, phase, interrupt_id):
    receiver = directory / "receiver.sqlite"
    with SqliteSaver.from_conn_string(str(directory / "checkpoints.sqlite")) as saver:
        old_graph = build_graph(saver, receiver, graph_version=1, enforce_binding=True)
        if phase == "start":
            total = sum(sum(batch) for batch in SOURCE["batches"].values())
            old_graph.invoke({"workflow_version": 1, "draft_total": total, "status": "waiting"}, config(THREAD_ID),
                             durability="sync")
            return {"pid": os.getpid(), "waiting_v1": read_checkpoint(old_graph, THREAD_ID)}

        before = read_checkpoint(old_graph, THREAD_ID)
        assert before["interrupts"][0]["id"] == interrupt_id
        new_graph = build_graph(saver, receiver, graph_version=2, enforce_binding=case != "unsafe")
        fresh_thread = "fresh-v2"
        new_graph.invoke({"workflow_version": 2, "draft_total": before["state"]["draft_total"], "status": "waiting"},
                         config(fresh_thread), durability="sync")
        fresh_v2_pause = read_checkpoint(new_graph, fresh_thread)

        selected_version = before["state"]["workflow_version"] if case == "version-routed" else 2
        selected_graph = {1: old_graph, 2: new_graph}[selected_version]
        reply = {"approval_id": APPROVAL_ID}
        selected_graph.invoke(Command(resume={interrupt_id: reply}), config(THREAD_ID), durability="sync")
        return {"pid": os.getpid(), "requested_graph_version": 2, "selected_graph_version": selected_version,
                "before": before, "fresh_v2_pause": fresh_v2_pause,
                "resume_interrupt_id": interrupt_id, "resume_value": reply,
                "after": read_checkpoint(selected_graph, THREAD_ID)}


def run_worker(directory, case, phase, interrupt_id=None):
    cmd = [sys.executable, "-B", str(HERE / "resume_lab.py"), "--output-dir", str(directory), "--case", case, "--worker", phase]
    if interrupt_id is not None:
        cmd.extend(["--interrupt-id", interrupt_id])
    environment = {**os.environ, "LANGSMITH_TRACING": "false", "LANGCHAIN_TRACING_V2": "false", "LANGCHAIN_TRACING": "false"}
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20, env=environment)
    if proc.returncode != 0:
        raise RuntimeError(f"{case}/{phase} failed with exit code {proc.returncode}\n{proc.stderr}")
    return json.loads(proc.stdout)


def verify_case(case, record, total):
    old, resume = record["waiting_v1"], record["resume"]
    final = record["receiver_final"]
    original = intent("original_gate", total)
    inserted = intent("inserted_gate", total)
    assert old["state"] == {"workflow_version": 1, "draft_total": total, "status": "waiting"}
    assert old["next"] == ["approval"] and [entry["intent"] for entry in old["interrupts"]] == [original]
    assert resume["before"] == old and resume["pid"] != record["start_pid"]
    assert resume["requested_graph_version"] == 2 and resume["resume_interrupt_id"] == old["interrupts"][0]["id"]
    assert resume["resume_value"] == {"approval_id": APPROVAL_ID}
    fresh = resume["fresh_v2_pause"]
    assert fresh["state"]["workflow_version"] == 2 and fresh["next"] == ["approval"]
    assert [entry["intent"] for entry in fresh["interrupts"]] == [inserted]
    assert record["receiver_while_waiting"] == {"decisions": [], "writes": [], "a_effects": 0, "b_effects": 0}
    [decision] = final["decisions"]
    assert decision["approval_id"] == APPROVAL_ID and decision["approved"] == original
    after = resume["after"]
    assert after["thread_id"] == THREAD_ID
    if case == "unsafe":
        assert resume["selected_graph_version"] == 2
        assert decision["requested"] == inserted and decision["outcome"] == "committed"
        assert final["writes"] == [{"seq": 1, "approval_id": APPROVAL_ID, "intent": inserted}]
        assert (final["a_effects"], final["b_effects"]) == (0, 1)
        assert after["next"] == ["approval"] and [entry["intent"] for entry in after["interrupts"]] == [original]
    elif case == "bound":
        assert resume["selected_graph_version"] == 2
        assert decision["requested"] == inserted and decision["outcome"] == "approval_mismatch"
        assert final["writes"] == [] and (final["a_effects"], final["b_effects"]) == (0, 0)
        assert after["state"]["status"] == "approval_mismatch" and after["next"] == [] and not after["interrupts"]
    else:
        assert resume["selected_graph_version"] == 1
        assert decision["requested"] == original and decision["outcome"] == "committed"
        assert final["writes"] == [{"seq": 1, "approval_id": APPROVAL_ID, "intent": original}]
        assert (final["a_effects"], final["b_effects"]) == (1, 0)
        assert after["state"]["status"] == "committed" and after["next"] == [] and not after["interrupts"]


def run(directory):
    dependencies = {package: version(package) for package in ("langgraph", "langgraph-checkpoint-sqlite")}
    assert dependencies == {"langgraph": "1.2.20", "langgraph-checkpoint-sqlite": "3.1.3"}
    directory.mkdir(parents=True, exist_ok=False)
    total = sum(amount for batch in SOURCE["batches"].values() for amount in batch)
    assert total == 42
    cases = {}
    for case in CASES:
        folder = directory / case
        folder.mkdir()
        receiver = folder / "receiver.sqlite"
        initialize_receiver(receiver, total)
        start = run_worker(folder, case, "start")
        waiting = start["waiting_v1"]
        waiting_receiver = read_receiver(receiver)
        resumed = run_worker(folder, case, "resume", waiting["interrupts"][0]["id"])
        cases[case] = {"start_pid": start["pid"], "waiting_v1": waiting, "receiver_while_waiting": waiting_receiver,
                       "resume": resumed, "receiver_final": read_receiver(receiver)}
        verify_case(case, cases[case], total)

    sources = ("resume_lab.py", "fixture.json", "requirements.txt", "README.md")
    record = {"schema": "workflow-version-resume-v1", "status": "passed",
              "environment": {"python": platform.python_version(), "platform": platform.system(),
                              "architecture": platform.machine(), "sqlite": sqlite3.sqlite_version, **dependencies},
              "fixture": {"thread_id": THREAD_ID, "amount": total, "approval_id": APPROVAL_ID,
                          "original_intent": intent("original_gate", total), "inserted_intent": intent("inserted_gate", total)},
              "cases": cases, "source_sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in sources}}
    (directory / "validation.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(json.dumps({case: [row["receiver_final"]["a_effects"], row["receiver_final"]["b_effects"]]
                      for case, row in cases.items()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--worker", choices=("start", "resume"), help=argparse.SUPPRESS)
    parser.add_argument("--case", choices=CASES, help=argparse.SUPPRESS)
    parser.add_argument("--interrupt-id", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        print(json.dumps(worker(args.output_dir.resolve(), args.case, args.worker, args.interrupt_id)))
    else:
        run(args.output_dir.resolve())
