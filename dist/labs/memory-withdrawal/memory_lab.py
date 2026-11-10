"""Compare deleting a LangGraph Store item with invalidating a staged request."""

import argparse
import hashlib
import http.client
import json
import os
import platform
import sqlite3
import subprocess
import sys
import threading
from contextlib import closing, contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
from pathlib import Path
from typing import TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from langgraph.store.sqlite import SqliteStore

ROOT = Path(__file__).resolve().parent
FIXTURE = json.loads((ROOT / "fixture.json").read_text())
SOURCE_FILES = ["memory_lab.py", "fixture.json", "requirements.txt", "README.md"]
CASES = ["unchecked", "rechecked"]


class State(TypedDict, total=False):
    thread_id: str
    snapshot: dict | None
    delivery: dict


def store_value(store, namespace):
    item = store.get(tuple(namespace), FIXTURE["key"])
    return item.value if item else None


def build_graph(store, saver, case, port):
    def stage(state: State, runtime: Runtime):
        return {"snapshot": store_value(runtime.store, FIXTURE["namespace"])}

    def send(state: State, runtime: Runtime):
        snapshot = state["snapshot"]
        if case == "rechecked" and store_value(runtime.store, FIXTURE["namespace"]) != snapshot:
            snapshot = None
        payload = {
            "thread_id": state["thread_id"],
            "format": snapshot["format"] if snapshot else FIXTURE["fallback"],
            "memory_version": snapshot["version"] if snapshot else None,
        }
        with closing(http.client.HTTPConnection("127.0.0.1", port, timeout=3)) as conn:
            conn.request("POST", "/record", json.dumps(payload), {"Content-Type": "application/json"})
            response = conn.getresponse()
            receipt = json.load(response)
            if response.status != 201 or receipt != {"seq": receipt.get("seq"), "payload": payload}:
                raise RuntimeError(f"collector returned {response.status}: {receipt!r}")
        return {"snapshot": snapshot, "delivery": receipt}

    graph = StateGraph(State)
    graph.add_node("stage", stage)
    graph.add_node("send", send)
    graph.add_edge(START, "stage")
    graph.add_edge("stage", "send")
    graph.add_edge("send", END)
    return graph.compile(checkpointer=saver, store=store, interrupt_before=["send"])


def snapshot(state):
    return {
        "checkpoint_id": state.config["configurable"]["checkpoint_id"],
        "next": list(state.next),
        "values": state.values,
    }


def worker(args):
    with (
        SqliteSaver.from_conn_string(str(args.directory / "checkpoints.sqlite")) as saver,
        SqliteStore.from_conn_string(str(args.directory / "memory.sqlite")) as store,
    ):
        store.setup()
        graph = build_graph(store, saver, args.case, args.port)
        config = {"configurable": {"thread_id": args.thread}}
        if args.action == "stage":
            graph.invoke({"thread_id": args.thread}, config, durability="sync")
            return {"pid": os.getpid(), "paused": snapshot(graph.get_state(config))}
        before = snapshot(graph.get_state(config))
        graph.invoke(None, config, durability="sync")
        return {
            "pid": os.getpid(),
            "before": before,
            "after": snapshot(graph.get_state(config)),
            "history": [snapshot(state) for state in graph.get_state_history(config)],
        }


def child(directory, case, port, thread, action):
    env = dict(os.environ, LANGSMITH_TRACING="false", LANGCHAIN_TRACING="false", LANGCHAIN_TRACING_V2="false")
    result = subprocess.run(
        [sys.executable, "-B", __file__, action, str(directory), case, str(port), thread],
        env=env, check=True, capture_output=True, text=True, timeout=15,
    )
    return json.loads(result.stdout)


@contextmanager
def collector(database):
    with closing(sqlite3.connect(database)) as db:
        db.execute("CREATE TABLE receipts (seq INTEGER PRIMARY KEY, payload TEXT NOT NULL)")
        db.commit()

    class Recorder(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/record":
                self.send_error(404)
                return
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            with closing(sqlite3.connect(database)) as db, db:
                cursor = db.execute("INSERT INTO receipts (payload) VALUES (?)", (json.dumps(payload),))
                receipt = {"seq": cursor.lastrowid, "payload": payload}
            body = json.dumps(receipt).encode()
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Recorder) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_port
        finally:
            server.shutdown()
            thread.join()


def receipts(database):
    with closing(sqlite3.connect(database)) as db:
        return [
            {"seq": seq, "payload": json.loads(body)}
            for seq, body in db.execute("SELECT seq, payload FROM receipts ORDER BY seq")
        ]


def run_case(directory, case):
    directory.mkdir()
    memory = directory / "memory.sqlite"
    effects = directory / "collector.sqlite"
    old, new = FIXTURE["old_thread"], FIXTURE["new_thread"]
    with SqliteStore.from_conn_string(str(memory)) as store:
        store.setup()
        store.put(tuple(FIXTURE["namespace"]), FIXTURE["key"], FIXTURE["preference"])
        store.put(tuple(FIXTURE["other_namespace"]), FIXTURE["key"], FIXTURE["other_preference"])

    with collector(effects) as port:
        stage_old = child(directory, case, port, old, "stage")
        before_send = receipts(effects)
        with SqliteStore.from_conn_string(str(memory)) as store:
            before_delete = store_value(store, FIXTURE["namespace"])
            store.delete(tuple(FIXTURE["namespace"]), FIXTURE["key"])
        with SqliteStore.from_conn_string(str(memory)) as store:
            after_delete = store_value(store, FIXTURE["namespace"])
            other_after_delete = store_value(store, FIXTURE["other_namespace"])
        resume_old = child(directory, case, port, old, "resume")
        stage_new = child(directory, case, port, new, "stage")
        resume_new = child(directory, case, port, new, "resume")

    before_purge = receipts(effects)
    old_config = {"configurable": {"thread_id": old}}
    new_config = {"configurable": {"thread_id": new}}
    with SqliteSaver.from_conn_string(str(directory / "checkpoints.sqlite")) as saver:
        old_count = sum(1 for _ in saver.list(old_config))
        saver.delete_thread(old)
    with SqliteSaver.from_conn_string(str(directory / "checkpoints.sqlite")) as saver:
        purge = {
            "old_count_before": old_count,
            "old_count_after": sum(1 for _ in saver.list(old_config)),
            "new_checkpoint_id_after": saver.get_tuple(new_config).config["configurable"]["checkpoint_id"],
        }
    return {
        "stage_old": stage_old,
        "store": {"before": before_delete, "after": after_delete, "other_after": other_after_delete},
        "resume_old": resume_old,
        "stage_new": stage_new,
        "resume_new": resume_new,
        "history_purge": purge,
        "collector": {"while_paused": before_send, "before_purge": before_purge, "after_purge": receipts(effects)},
    }


def run(directory):
    directory.mkdir(parents=True)
    cases = {case: run_case(directory / case, case) for case in CASES}
    expected = {"unchecked": ["short", "standard"], "rechecked": ["standard", "standard"]}
    for case, result in cases.items():
        assert result["store"]["after"] is None
        assert result["history_purge"]["old_count_after"] == 0
        assert not result["collector"]["while_paused"]
        assert result["collector"]["before_purge"] == result["collector"]["after_purge"]
        assert [row["payload"]["format"] for row in result["collector"]["after_purge"]] == expected[case]
    evidence = {
        "schema": "memory-withdrawal-v1",
        "status": "passed",
        "environment": {
            "python": platform.python_version(),
            "sqlite": sqlite3.sqlite_version,
            "langgraph": version("langgraph"),
            "langgraph-checkpoint-sqlite": version("langgraph-checkpoint-sqlite"),
        },
        "source_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCE_FILES},
        "fixture": FIXTURE,
        "cases": cases,
    }
    (directory / "validation.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(expected, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="action", required=True)
    main = commands.add_parser("run")
    main.add_argument("--output-dir", required=True, type=Path)
    for action in ["stage", "resume"]:
        sub = commands.add_parser(action)
        sub.add_argument("directory", type=Path)
        sub.add_argument("case", choices=CASES)
        sub.add_argument("port", type=int)
        sub.add_argument("thread")
    args = parser.parse_args()
    if args.action == "run":
        run(args.output_dir)
    else:
        print(json.dumps(worker(args)))
