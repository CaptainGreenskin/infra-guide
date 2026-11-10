"""Drive one report through model-selected tools and a host-owned approval gate."""

import argparse
import hashlib
import json
import os
import platform
import socket
import sqlite3
import subprocess
import sys
import time
from contextlib import closing, contextmanager
from http.client import HTTPConnection, HTTPException
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURE = json.loads((ROOT / "fixture.json").read_text())
ASSETS = json.loads((ROOT / "assets.json").read_text())
MODEL = "local-qwen"
SETTINGS = {"tool_choice": "auto", "temperature": 0, "seed": 17, "max_tokens": 96}
ENGINE_FLAGS = [
    "--n-gpu-layers", "0", "--threads", "4", "--ctx-size", "2048", "--parallel", "1", "--jinja",
    "--reasoning-budget", "0", "--chat-template-kwargs", '{"enable_thinking":false}', "--alias", MODEL,
]
INITIAL_PLAN = ["read_order_manifest", "request_draft"]
REVISED_PLAN = ["read_order_manifest", "read_extra_batch", "request_draft"]


def tool(name, description, key, argument):
    parameters = {"type": "object", "properties": {key: {"type": "string", "description": argument}},
                  "required": [key], "additionalProperties": False}
    return {"type": "function", "function": {"name": name, "description": description, "parameters": parameters}}


TOOLS = [
    tool("read_order_manifest", "Read the source order manifest before building a report. It can return a supplemental batch reference.",
         "report_id", "Report ID, e.g. report-A."),
    tool("revise_plan", "Add a supplemental batch to the current plan if the manifest says extra_batch and the plan does not yet include it. Call before reading that batch.",
         "extra_batch", "Exact extra_batch returned by manifest."),
    tool("read_extra_batch", "Read a supplemental batch only after revise_plan accepted it.",
         "extra_batch", "Exact extra_batch approved by revise_plan."),
    tool("request_draft", "Request the host to compute the draft after all source rows have been read.",
         "report_id", "The original report ID."),
]


def compact(value, **kwargs):
    return json.dumps(value, separators=(",", ":"), **kwargs)


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def fingerprint(value):
    return hashlib.sha256(compact(value, sort_keys=True).encode()).hexdigest()


def engine_request(port, method, path, payload=None):
    with closing(HTTPConnection("127.0.0.1", port, timeout=15)) as conn:
        conn.request(method, path, compact(payload) if payload else None, {"Content-Type": "application/json"})
        response = conn.getresponse()
        return {"status": response.status, "response": json.load(response)}


@contextmanager
def engine_service(directory, server, model):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    with (directory / "engine.log").open("wb") as log:
        process = subprocess.Popen([str(server), "--model", str(model), "--host", "127.0.0.1", "--port", str(port), *ENGINE_FLAGS],
                                   stdout=log, stderr=log)
        try:
            for _ in range(180):
                if process.poll() is not None:
                    raise RuntimeError(f"llama-server exited before ready: {process.returncode}")
                try:
                    if engine_request(port, "GET", "/health")["status"] == 200:
                        break
                except (OSError, HTTPException):
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("llama-server did not become ready")
            yield port, process.pid
        finally:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def connect(directory, read_only=False):
    path = directory / "task.sqlite"
    if read_only:
        return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    return sqlite3.connect(path)


def initialize(directory):
    with closing(connect(directory)) as db, db:
        db.executescript("""
            CREATE TABLE task (id TEXT PRIMARY KEY, status TEXT NOT NULL, revision INTEGER NOT NULL, draft TEXT);
            CREATE TABLE plans (revision INTEGER PRIMARY KEY, steps TEXT NOT NULL, added_source TEXT);
            CREATE TABLE facts (source TEXT PRIMARY KEY, amounts TEXT NOT NULL);
            CREATE TABLE events (seq INTEGER PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE reports (target TEXT PRIMARY KEY, draft TEXT NOT NULL);
        """)
        db.execute("INSERT INTO task VALUES (?, 'READ_MANIFEST', 1, NULL)", (FIXTURE["task_id"],))
        db.execute("INSERT INTO plans VALUES (1, ?, NULL)", (compact(INITIAL_PLAN),))


def event(db, kind, payload):
    db.execute("INSERT INTO events(kind,payload) VALUES(?,?)", (kind, compact(payload)))


def readback(db):
    task, status, revision, draft = db.execute("SELECT * FROM task").fetchone()
    return {
        "task": {"id": task, "status": status, "revision": revision, "draft": json.loads(draft) if draft else None},
        "plans": [{"revision": rev, "steps": json.loads(steps), "added_source": extra}
                  for rev, steps, extra in db.execute("SELECT * FROM plans ORDER BY revision")],
        "facts": [{"source": source, "amounts": json.loads(amounts)} for source, amounts in db.execute("SELECT * FROM facts ORDER BY rowid")],
        "events": [{"seq": seq, "kind": kind, "payload": json.loads(payload)}
                   for seq, kind, payload in db.execute("SELECT * FROM events ORDER BY seq")],
        "reports": [{"target": target, "draft": json.loads(body)} for target, body in db.execute("SELECT * FROM reports")],
    }


def snapshot(directory):
    with closing(connect(directory, read_only=True)) as db:
        return readback(db)


def perform_tool(directory, name, args):
    with closing(connect(directory)) as db, db:
        _, status, revision, _ = db.execute("SELECT * FROM task").fetchone()
        task_id, extra = FIXTURE["task_id"], FIXTURE["extra_batch"]
        if name == "read_order_manifest" and args == {"report_id": task_id} and status == "READ_MANIFEST":
            values, source = FIXTURE["base_values"], FIXTURE["base_source"]
            db.execute("INSERT INTO facts VALUES (?, ?)", (source, compact(values)))
            db.execute("UPDATE task SET status='NEEDS_REPLAN'")
            result = {"report_id": task_id, "base_source": source, "values": values, "extra_batch": extra, "plan_has_extra": False}
        elif name == "revise_plan" and args == {"extra_batch": extra} and status == "NEEDS_REPLAN":
            db.execute("INSERT INTO plans VALUES (?, ?, ?)", (revision + 1, compact(REVISED_PLAN), extra))
            db.execute("UPDATE task SET revision=?, status='READ_EXTRA'", (revision + 1,))
            result = {"revision": revision + 1, "accepted": True, "extra_batch": extra,
                      "plan_has_extra": True, "extra_batch_read": False}
        elif name == "read_extra_batch" and args == {"extra_batch": extra} and status == "READ_EXTRA":
            values = FIXTURE["extra_values"]
            db.execute("INSERT INTO facts VALUES (?, ?)", (extra, compact(values)))
            db.execute("UPDATE task SET status='BUILD_DRAFT'")
            result = {"extra_batch": extra, "values": values, "all_sources_read": True}
        elif name == "request_draft" and args == {"report_id": task_id} and status == "BUILD_DRAFT":
            facts = readback(db)["facts"]
            draft = {"task_id": task_id, "target": FIXTURE["target"], "revision": revision,
                     "total": sum(amount for fact in facts for amount in fact["amounts"]), "sources": [fact["source"] for fact in facts]}
            db.execute("UPDATE task SET status='WAITING_APPROVAL', draft=?", (compact(draft),))
            result = {"state": "WAITING_APPROVAL", "draft": draft}
        else:
            raise RuntimeError(f"host refused proposal {name} {args!r} while {status}")
        event(db, "tool", {"name": name, "arguments": args, "result": result})
        return result


def stage(directory, port):
    messages = [{"role": "system", "content": FIXTURE["system_prompt"]}, {"role": "user", "content": FIXTURE["question"]}]
    names = {item["function"]["name"] for item in TOOLS}
    with (directory / "model-turns.jsonl").open("w") as raw:
        for _ in range(4):
            request = {"model": MODEL, "messages": messages, "tools": TOOLS, **SETTINGS}
            response = engine_request(port, "POST", "/v1/chat/completions", request)
            raw.write(compact({"request": request, **response}) + "\n")
            raw.flush()
            if response["status"] != 200 or response["response"]["system_fingerprint"] != "b12110-cd959bae9":
                raise RuntimeError(f"unexpected local model response: {response!r}")
            choice, = response["response"]["choices"]
            message = choice["message"]
            calls = message.get("tool_calls", [])
            if choice["finish_reason"] != "tool_calls" or len(calls) != 1:
                raise RuntimeError(f"model did not propose exactly one tool: {message!r}")
            call = calls[0]
            proposal = call["function"]
            name, args = proposal["name"], json.loads(proposal["arguments"])
            if call["type"] != "function" or name not in names:
                raise RuntimeError(f"unknown model tool: {call!r}")
            result = perform_tool(directory, name, args)
            messages = [*messages, message, {"role": "tool", "tool_call_id": call["id"], "content": compact(result)}]
    result = snapshot(directory)
    if result["task"]["status"] != "WAITING_APPROVAL":
        raise RuntimeError(f"tool budget exhausted before a complete draft: {result['task']!r}")
    return {"pid": os.getpid(), "state": result}


def expected_approval(draft):
    return {"operator": FIXTURE["operator"], "decision": "approve", "task_id": draft["task_id"],
            "target": draft["target"], "revision": draft["revision"], "draft_sha256": fingerprint(draft)}


def resume(directory, approval):
    with closing(connect(directory)) as db, db:
        state = readback(db)
        task = state["task"]
        if task["status"] == "DONE":
            decision = "already_done"
        elif task["status"] != "WAITING_APPROVAL":
            raise RuntimeError(f"cannot resume status {task['status']}")
        elif approval is None:
            decision = "waiting_approval"
        elif approval != expected_approval(task["draft"]):
            decision = "approval_mismatch"
        else:
            decision = "published"
            db.execute("INSERT INTO reports VALUES (?, ?)", (task["draft"]["target"], compact(task["draft"])))
            db.execute("UPDATE task SET status='DONE'")
        event(db, "resume", {"approval": approval, "decision": decision})
    return {"pid": os.getpid(), "before": state["task"], "decision": decision, "after": snapshot(directory)}


def child(directory, action, *args):
    result = subprocess.run([sys.executable, "-B", __file__, action, str(directory), *args],
                            check=True, capture_output=True, text=True, timeout=75)
    return json.loads(result.stdout)


def run(directory, server, model):
    assert digest(server) == ASSETS["engine"]["binary_sha256"]
    assert model.stat().st_size == ASSETS["model"]["bytes"] and digest(model) == ASSETS["model"]["sha256"]
    directory.mkdir(parents=True)
    initialize(directory)
    with engine_service(directory, server, model) as (port, engine_pid):
        paused = child(directory, "stage", str(port))
    actual_draft = paused["state"]["task"]["draft"]
    old_draft = {**actual_draft, "revision": 1, "total": sum(FIXTURE["base_values"]), "sources": [FIXTURE["base_source"]]}
    approvals = [None, expected_approval(old_draft), expected_approval(actual_draft), expected_approval(actual_draft)]
    resumes = [child(directory, "resume", compact(approval)) for approval in approvals]
    record = {
        "schema": "model-plan-revision-v1",
        "status": "passed",
        "environment": {"python": platform.python_version(), "platform": platform.system(), "architecture": platform.machine(),
                        "sqlite": sqlite3.sqlite_version},
        "assets": ASSETS,
        "engine_flags": ENGINE_FLAGS,
        "engine_pid": engine_pid,
        "fixture": FIXTURE,
        "model_turns": [json.loads(row) for row in (directory / "model-turns.jsonl").read_text().splitlines()],
        "paused": paused,
        "resumes": resumes,
        "readback": snapshot(directory),
        "source_sha256": {name: digest(ROOT / name) for name in ("model_plan_lab.py", "assets.json", "fixture.json", "README.md")},
    }
    (directory / "observed.json").write_text(json.dumps(record, indent=2) + "\n")
    assert [step["decision"] for step in resumes] == ["waiting_approval", "approval_mismatch", "published", "already_done"]
    assert [len(step["after"]["reports"]) for step in resumes] == [0, 0, 1, 1]
    assert record["readback"]["reports"] == [{"target": FIXTURE["target"], "draft": actual_draft}]
    assert actual_draft["total"] == sum(FIXTURE["base_values"] + FIXTURE["extra_values"]) == 42
    (directory / "observed.json").replace(directory / "validation.json")
    print(compact({"draft": actual_draft, "decisions": [step["decision"] for step in resumes]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    main = commands.add_parser("run")
    main.add_argument("--output-dir", type=Path, required=True)
    main.add_argument("--server", type=Path, required=True)
    main.add_argument("--model", type=Path, required=True)
    worker = commands.add_parser("stage")
    worker.add_argument("directory", type=Path)
    worker.add_argument("port", type=int)
    recovery = commands.add_parser("resume")
    recovery.add_argument("directory", type=Path)
    recovery.add_argument("approval", type=json.loads)
    args = parser.parse_args()
    if args.action == "run":
        run(args.output_dir.resolve(), args.server.resolve(), args.model.resolve())
    elif args.action == "stage":
        print(compact(stage(args.directory, args.port)))
    else:
        print(compact(resume(args.directory, args.approval)))
