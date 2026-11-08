"""Real LangGraph + file SqliteSaver + separate HTTP receiver; no model or key.

The graph is the framework implementation. The tiny receiver is our teaching
business API, whose independent SQLite transaction demonstrates effect dedup.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import operator
import os
import platform
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Annotated, TypedDict
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# Only built-in JSON-compatible state is used, with strict checkpoint decoding.
os.environ["LANGGRAPH_STRICT_MSGPACK"] = "true"
os.environ["LANGSMITH_TRACING"] = "false"

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

HERE = Path(__file__).resolve().parent


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def source_part(row):
    return {"resource": row["resource"], "version": row["version"],
            "values_sha256": digest(row["values"])}


def post_effect(url, phase, op, payload):
    request = Request(url + "/effect", data=encoded({"phase": phase, "op": op, "draft": payload}).encode(),
                      headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(request, timeout=10) as response:
        return json.load(response)


def record_event(folder, node, kind):
    # An independent diagnostic counter makes re-entry observable. It is not
    # graph state and cannot be used as a recovery authority.
    with sqlite3.connect(folder / "attempts.sqlite", timeout=15) as con:
        con.execute("CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, node TEXT, kind TEXT, pid INTEGER, tid INTEGER)")
        con.execute("INSERT INTO events(node,kind,pid,tid) VALUES(?,?,?,?)",
                    (node, kind, os.getpid(), threading.get_ident()))


def events(folder):
    path = folder / "attempts.sqlite"
    if not path.exists():
        return []
    with sqlite3.connect(path) as con:
        return [{"seq": r[0], "node": r[1], "kind": r[2], "pid": r[3], "tid": r[4]}
                for r in con.execute("SELECT seq,node,kind,pid,tid FROM events ORDER BY seq")]


def receiver(folder):
    db = folder / "receiver.sqlite"
    with sqlite3.connect(db) as con:
        con.executescript("""
          CREATE TABLE effects(op TEXT PRIMARY KEY, request_hash TEXT, phase TEXT, draft TEXT);
          CREATE TABLE attempts(seq INTEGER PRIMARY KEY, op TEXT, phase TEXT, duplicate INTEGER);
          CREATE TABLE reports(op TEXT PRIMARY KEY, target TEXT, draft TEXT);
        """)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != "/effect":
                self.send_error(404)
                return
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            op, phase, draft = request["op"], request["phase"], request["draft"]
            if phase not in {"stage", "publish"} or not isinstance(op, str):
                self.send_error(400)
                return
            request_hash = digest(request)
            with sqlite3.connect(db, timeout=15) as con:
                con.execute("BEGIN IMMEDIATE")
                old = con.execute("SELECT request_hash FROM effects WHERE op=?", (op,)).fetchone()
                if old and old[0] != request_hash:
                    self.send_error(409, "operation_conflict")
                    return
                duplicate = old is not None
                if not duplicate:
                    con.execute("INSERT INTO effects VALUES(?,?,?,?)", (op, request_hash, phase, encoded(draft)))
                    if phase == "publish":
                        con.execute("INSERT INTO reports VALUES(?,?,?)", (op, draft["target"], encoded(draft)))
                con.execute("INSERT INTO attempts(op,phase,duplicate) VALUES(?,?,?)", (op, phase, int(duplicate)))
            # Business effect and receipt identity committed before HTTP reply.
            response = encoded({"op": op, "phase": phase, "draft_digest": digest(draft), "duplicate": duplicate}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    (folder / "ready.json").write_text(encoded({"url": f"http://127.0.0.1:{server.server_port}"}))
    try:
        server.serve_forever(poll_interval=0.05)
    finally:
        server.server_close()


class ReportState(TypedDict):
    task_id: str
    stage_op: str
    publish_op: str
    unsafe: bool
    base_total: int
    extra_ref: str
    extra_total: int
    manifest: list[dict]
    draft: dict
    checks: Annotated[list[str], operator.add]
    stage_receipt: dict
    publish_receipt: dict


def build_graph(folder, saver, rendezvous):
    gate = threading.Barrier(2, timeout=10) if rendezvous else None

    def read_base(state):
        record_event(folder, "read_base", "enter")
        row = load(folder / "orders.json")["base"]
        return {"base_total": sum(row["values"]), "extra_ref": row["extra_ref"], "manifest": [source_part(row)]}

    def read_extra(state):
        record_event(folder, "read_extra", "enter")
        row = load(folder / "orders.json")["extra"]
        assert state["extra_ref"] == f"{row['resource']}/v{row['version']}"
        return {"extra_total": sum(row["values"]), "manifest": state["manifest"] + [source_part(row)]}

    def draft(state):
        record_event(folder, "draft", "enter")
        return {"draft": {"target": state["task_id"], "total": state["base_total"] + state["extra_total"],
                          "sources": state["manifest"]}}

    def branch_enter(name):
        record_event(folder, name, "enter")
        if gate is not None:
            gate.wait()  # Both real executor threads must enter before either finishes.

    def check_total(state):
        branch_enter("check_total")
        assert state["draft"]["total"] == state["base_total"] + state["extra_total"]
        record_event(folder, "check_total", "finish")
        return {"checks": ["total"]}

    def check_sources(state):
        branch_enter("check_sources")
        flag = folder / "fail-source-once"
        if flag.exists():
            flag.unlink()
            record_event(folder, "check_sources", "injected_failure")
            raise RuntimeError("injected_source_check")
        assert len(state["draft"]["sources"]) == 2
        record_event(folder, "check_sources", "finish")
        return {"checks": ["sources"]}

    def effect(phase, op, payload):
        return post_effect(load(folder / "ready.json")["url"], phase, op, payload)

    def approval_publish(state):
        record_event(folder, "approval_publish", "enter")
        assert sorted(state["checks"]) == ["sources", "total"]
        # Staging is an allowed preparation effect before human approval.
        # A fresh key on node re-entry is the deliberate negative example.
        stage_op = str(uuid.uuid4()) if state["unsafe"] else state["stage_op"]
        stage_receipt = effect("stage", stage_op, state["draft"])
        decision = interrupt({"task_id": state["task_id"], "total": state["draft"]["total"],
                              "draft_digest": digest(state["draft"])})
        if decision != {"approved": True, "draft_digest": digest(state["draft"])}:
            raise ValueError("approval_mismatch")
        publish_receipt = effect("publish", state["publish_op"], state["draft"])
        return {"stage_receipt": stage_receipt, "publish_receipt": publish_receipt}

    builder = StateGraph(ReportState)
    for name, function in [("read_base", read_base), ("read_extra", read_extra), ("draft", draft),
                           ("check_total", check_total), ("check_sources", check_sources),
                           ("approval_publish", approval_publish)]:
        builder.add_node(name, function)
    builder.add_edge(START, "read_base")
    builder.add_edge("read_base", "read_extra")
    builder.add_edge("read_extra", "draft")
    builder.add_edge("draft", "check_total")
    builder.add_edge("draft", "check_sources")
    builder.add_edge(["check_total", "check_sources"], "approval_publish")
    builder.add_edge("approval_publish", END)
    return builder.compile(checkpointer=saver)


def snapshot(graph, config):
    state = graph.get_state(config)
    return {"values": state.values, "next": list(state.next),
            "tasks": [{"name": task.name, "error": task.error,
                       "interrupts": [{"id": item.id, "value": item.value} for item in task.interrupts]}
                      for task in state.tasks],
            "checkpoint_count": len(list(graph.get_state_history(config)))}


def worker(folder, action, thread_id, unsafe):
    config = {"configurable": {"thread_id": thread_id}}
    with SqliteSaver.from_conn_string(str(folder / "checkpoints.sqlite")) as saver:
        graph = build_graph(folder, saver, action == "start")
        error = None
        try:
            if action == "start":
                initial = {"task_id": "report-A", "stage_op": "report-A:stage", "publish_op": "report-A:publish",
                           "unsafe": unsafe, "checks": []}
                graph.invoke(initial, config, durability="sync")
            elif action == "resume":
                pending = snapshot(graph, config)
                payloads = [i["value"] for t in pending["tasks"] for i in t["interrupts"]]
                if len(payloads) != 1:
                    raise ValueError("expected_one_pending_approval")
                graph.invoke(Command(resume={"approved": True, "draft_digest": payloads[0]["draft_digest"]}),
                             config, durability="sync")
            elif action == "continue":
                graph.invoke(None, config, durability="sync")
        except RuntimeError as exc:
            if str(exc) != "injected_source_check":
                raise
            error = str(exc)
        return {"pid": os.getpid(), "error": error, "state": snapshot(graph, config)}


def receiver_snapshot(folder):
    with sqlite3.connect(folder / "receiver.sqlite") as con:
        return {"effects": [{"op": r[0], "phase": r[1], "draft": json.loads(r[2])}
                            for r in con.execute("SELECT op,phase,draft FROM effects ORDER BY op")],
                "attempts": [{"op": r[0], "phase": r[1], "duplicate": bool(r[2])}
                             for r in con.execute("SELECT op,phase,duplicate FROM attempts ORDER BY seq")],
                "reports": [{"op": r[0], "target": r[1], "draft": json.loads(r[2])}
                            for r in con.execute("SELECT op,target,draft FROM reports ORDER BY op")]}


def independent_oracle(folder):
    # Read original source and actual receiver data. Do not trust graph values,
    # graph completion, returned receipts, or the node's checks reducer.
    original = load(folder / "orders.json")
    expected = {"target": original["target"],
                "total": sum(original["base"]["values"]) + sum(original["extra"]["values"]),
                "sources": [source_part(original["base"]), source_part(original["extra"])]}
    actual = receiver_snapshot(folder)
    staged = [row for row in actual["effects"] if row["phase"] == "stage"]
    published = [row for row in actual["effects"] if row["phase"] == "publish"]
    checks = {"one_staged_draft": len(staged) == 1, "one_publish_effect": len(published) == 1,
              "one_report": len(actual["reports"]) == 1,
              "all_effect_contents_match_source": bool(actual["effects"]) and all(row["draft"] == expected for row in actual["effects"]),
              "report_matches_source": len(actual["reports"]) == 1 and actual["reports"][0]["target"] == expected["target"] and actual["reports"][0]["draft"] == expected}
    return {"accepted": all(checks.values()), "expected_total": expected["total"], "checks": checks,
            "staged_effects": len(staged), "published_effects": len(published), "report_count": len(actual["reports"])}


def run_child(folder, action, unsafe=False, thread_id="report-A"):
    command = [sys.executable, "-B", str(HERE / "workflow_lab.py"), "worker", "--folder", str(folder),
               "--action", action, "--thread-id", thread_id]
    if unsafe:
        command.append("--unsafe")
    result = subprocess.run(command, text=True, capture_output=True, timeout=45, check=True)
    return json.loads(result.stdout)


def case(folder, unsafe=False, fail_once=False):
    folder.mkdir()
    (folder / "orders.json").write_bytes((HERE / "orders.json").read_bytes())
    if fail_once:
        (folder / "fail-source-once").touch()
    service = subprocess.Popen([sys.executable, "-B", str(HERE / "workflow_lab.py"), "receiver", "--folder", str(folder)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        deadline = time.monotonic() + 10
        while not (folder / "ready.json").exists():
            if service.poll() is not None:
                raise RuntimeError("receiver_start_failed: " + service.stderr.read())
            if time.monotonic() >= deadline:
                raise TimeoutError("receiver startup")
            time.sleep(0.02)
        started = run_child(folder, "start", unsafe=unsafe)
        failure = None
        if fail_once:
            assert started["error"] == "injected_source_check"
            failure = started
            started = run_child(folder, "continue")
        assert started["error"] is None
        assert started["state"]["next"] == ["approval_publish"]
        assert len([i for t in started["state"]["tasks"] for i in t["interrupts"]]) == 1
        assert sorted(started["state"]["values"]["checks"]) == ["sources", "total"]
        before = receiver_snapshot(folder)
        assert len(before["effects"]) == 1 and before["reports"] == []
        wrong_thread = run_child(folder, "inspect", thread_id="another-task")
        assert wrong_thread["state"]["values"] == {} and wrong_thread["state"]["next"] == []
        resumed = run_child(folder, "resume")
        assert resumed["pid"] != started["pid"]
        assert resumed["state"]["next"] == []
        assert resumed["state"]["values"]["publish_receipt"]["phase"] == "publish"
        end = receiver_snapshot(folder)
        before_repeat = {"events": events(folder), "receiver": end}
        repeated = run_child(folder, "continue")
        assert {"events": events(folder), "receiver": receiver_snapshot(folder)} == before_repeat
        changed = dict(resumed["state"]["values"]["draft"], total=41)
        try:
            post_effect(load(folder / "ready.json")["url"], "publish", "report-A:publish", changed)
        except HTTPError as exc:
            assert exc.code == 409
            exc.close()
        else:
            raise AssertionError("same operation with changed content must conflict")
        assert receiver_snapshot(folder) == end
        log = events(folder)
        counts = {name: sum(e["node"] == name and e["kind"] == "enter" for e in log)
                  for name in ["read_base", "read_extra", "draft", "check_total", "check_sources", "approval_publish"]}
        assert counts == {"read_base": 1, "read_extra": 1, "draft": 1, "check_total": 1,
                          "check_sources": 2 if fail_once else 1, "approval_publish": 2}
        branch_starts = [e for e in log if e["node"].startswith("check_") and e["kind"] == "enter"][:2]
        assert len({e["tid"] for e in branch_starts}) == 2
        earliest_finish = min(e["seq"] for e in log if e["node"].startswith("check_") and e["kind"] in {"finish", "injected_failure"})
        assert max(e["seq"] for e in branch_starts) < earliest_finish
        oracle = independent_oracle(folder)
        assert oracle["accepted"] is (not unsafe)
        assert oracle["staged_effects"] == (2 if unsafe else 1)
        assert oracle["expected_total"] == 42
        return {"waiting": started, "after_parallel_failure": failure, "before_resume_receiver": before,
                "resumed": resumed, "completed_again": repeated, "wrong_thread": wrong_thread,
                "counts": counts, "parallel_overlap_proven": True, "events": log,
                "same_operation_changed_content": "operation_conflict_409", "receiver": end, "oracle": oracle}
    finally:
        service.terminate()
        try:
            service.wait(timeout=5)
        except subprocess.TimeoutExpired:
            service.kill()
            service.wait(timeout=5)
        service.stderr.close()


def suite(root):
    cases = {"stable": case(root / "stable"),
             "new_id_on_reentry": case(root / "new-id", unsafe=True),
             "parallel_failure": case(root / "parallel-failure", fail_once=True)}
    # Keep graph completion untouched; corrupt only a copy of the real report.
    corrupt = root / "corrupt"
    corrupt.mkdir()
    (corrupt / "orders.json").write_bytes((HERE / "orders.json").read_bytes())
    with sqlite3.connect(root / "stable" / "receiver.sqlite") as source, sqlite3.connect(corrupt / "receiver.sqlite") as target:
        source.backup(target)
        row = target.execute("SELECT op,draft FROM reports").fetchone()
        body = json.loads(row[1])
        body["total"] = 41
        target.execute("UPDATE reports SET draft=? WHERE op=?", (encoded(body), row[0]))
    corrupted = independent_oracle(corrupt)
    assert corrupted["accepted"] is False and corrupted["checks"]["report_matches_source"] is False
    cases["corrupt_report"] = corrupted
    return {"schema": "langgraph-workflow-v1", "status": "passed",
            "environment": {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
                            "platform": platform.system(),
                            "packages": {name: importlib.metadata.version(name) for name in ["langgraph", "langgraph-checkpoint", "langgraph-checkpoint-sqlite"]}},
            "cases": cases, "cleanup": {"receiver_children_reaped": True, "worker_children_reaped": True}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["suite", "worker", "receiver"], nargs="?", default="suite")
    parser.add_argument("--folder", type=Path)
    parser.add_argument("--output-dir", type=Path, help="must not exist; keeps databases for inspection")
    parser.add_argument("--action", choices=["start", "resume", "continue", "inspect"], default="start")
    parser.add_argument("--thread-id", default="report-A")
    parser.add_argument("--unsafe", action="store_true")
    args = parser.parse_args()
    if args.command == "receiver":
        receiver(args.folder)
        return
    if args.command == "worker":
        print(encoded(worker(args.folder, args.action, args.thread_id, args.unsafe)))
        return
    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=False)
        result = suite(args.output_dir.resolve())
        result["cleanup"]["case_directories"] = "retained_by_request"
    else:
        with tempfile.TemporaryDirectory(prefix="langgraph-workflow-") as temp:
            result = suite(Path(temp))
        result["cleanup"]["case_directories"] = "removed"
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
