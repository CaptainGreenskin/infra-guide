"""Resume a model-planned report after its independent MCP receiver committed."""

import argparse
from contextlib import closing
import hashlib
from importlib.metadata import version
from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
import platform
import signal
import socket
import sqlite3
import subprocess
import sys
import time

import anyio
import httpx2
from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client
from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
import uvicorn


HERE = Path(__file__).resolve().parent
PROTOCOL = "2026-07-28"
OPERATION = "report-A/v3:publish"
PUBLISH = "publish_report"
LOOKUP = "lookup_receipt"
PLANNING_FILES = {
    "assets.json": "bed077a9de71d9a01890c5adc14d7f4ca8882615227ab936a82ae4a2eb3fa79e",
    "fixture.json": "7c26a41a55193eb24e5e0166753cc9d16500ec8ac6ec77839a23ee0a28f82fab",
    "model_plan_lab.py": "976e38c4013db65dad83bf66f134691b20aacb2c2ab4260c6be0ec9a2c873d6d",
}


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def compact(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def draft_digest(draft):
    return hashlib.sha256(compact(draft).encode()).hexdigest()


def read_json(path):
    return json.loads(path.read_text())


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def write_event(directory, kind, **fields):
    with (directory / "server.jsonl").open("a") as log:
        log.write(compact({"event": kind, **fields}) + "\n")


def connect(directory, name, readonly=False):
    path = directory / name
    if readonly:
        return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    return sqlite3.connect(path)


def host_state(directory):
    with closing(connect(directory, "task.sqlite", readonly=True)) as db:
        state, draft = db.execute("SELECT status,draft FROM task").fetchone()
        intent = db.execute("SELECT operation,draft_sha256,receipt FROM dispatch").fetchone()
        return {"state": state, "draft": json.loads(draft),
                "operation_id": intent[0] if intent else None,
                "draft_sha256": intent[1] if intent else None,
                "receipt": json.loads(intent[2]) if intent and intent[2] else None,
                "local_reports": db.execute("SELECT count(*) FROM reports").fetchone()[0]}


def receiver_state(directory):
    with closing(connect(directory, "receiver.sqlite", readonly=True)) as db:
        return {table: [json.loads(row[0]) for row in db.execute(f"SELECT body FROM {table}")]
                for table in ("reports", "receipts")}


def expected_from_source(source):
    return {"task_id": source["task_id"], "target": source["target"], "revision": 2,
            "total": sum(source["base_values"] + source["extra_values"]),
            "sources": [source["base_source"], source["extra_batch"]]}


def expected_approval(source, draft):
    return {"operator": source["operator"], "decision": "approve", "task_id": draft["task_id"],
            "target": draft["target"], "revision": draft["revision"], "draft_sha256": draft_digest(draft)}


def receipt_for(draft):
    return {"operation_id": OPERATION, "receipt_id": "receipt-report-A-v3", "draft_sha256": draft_digest(draft),
            "draft": draft}


async def serve(directory, source, listen_fd):
    expected = expected_from_source(source)
    expected_receipt = receipt_for(expected)
    with closing(connect(directory, "receiver.sqlite")) as db:
        db.executescript("""
            CREATE TABLE reports(operation TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE receipts(operation TEXT PRIMARY KEY REFERENCES reports(operation), body TEXT NOT NULL);
        """)
    operation = {"operation_id": {"const": OPERATION}}
    properties = {PUBLISH: {**operation, "draft": {"type": "object"}, "draft_sha256": {"type": "string"}},
                  LOOKUP: operation}

    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[types.Tool(name=name, input_schema={
            "type": "object", "properties": fields, "required": list(fields), "additionalProperties": False,
        }) for name, fields in properties.items()])

    async def call_tool(_ctx, params):
        arguments = params.arguments
        if params.name == PUBLISH:
            receipt = expected_receipt
            assert arguments == {"operation_id": OPERATION, "draft": expected, "draft_sha256": draft_digest(expected)}
            with closing(connect(directory, "receiver.sqlite")) as db, db:
                db.execute("PRAGMA foreign_keys=ON")
                db.execute("INSERT INTO reports VALUES (?,?) ON CONFLICT DO NOTHING", (OPERATION, compact(expected)))
                db.execute("INSERT INTO receipts VALUES (?,?) ON CONFLICT DO NOTHING", (OPERATION, compact(receipt)))
            write_event(directory, "receiver_commit", operation_id=OPERATION)
            (directory / "committed").touch()
            # The supervisor releases the reply only after terminating the first worker.
            with anyio.fail_after(20):
                while not (directory / "release-reply").exists():
                    await anyio.sleep(0.01)
        else:
            assert params.name == LOOKUP and arguments == {"operation_id": OPERATION}
            with closing(connect(directory, "receiver.sqlite", readonly=True)) as db:
                row = db.execute("SELECT body FROM receipts WHERE operation=?", (arguments["operation_id"],)).fetchone()
            assert row is not None
            receipt = json.loads(row[0])
            write_event(directory, "receiver_lookup", operation_id=OPERATION)
        return types.CallToolResult(content=[types.TextContent(type="text", text=compact(receipt))],
                                    structured_content=receipt)

    server = Server("infra-guide-model-recovery", on_list_tools=list_tools, on_call_tool=call_tool)
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"], allowed_origins=[])
    manager = StreamableHTTPSessionManager(server, stateless=True, json_response=True, security_settings=security)

    async def asgi(scope, receive, send):
        body = bytearray()
        request = None
        headers = dict(scope.get("headers", []))

        async def receive_and_record():
            nonlocal request
            message = await receive()
            if message["type"] == "http.request":
                body.extend(message.get("body", b""))
                if not message.get("more_body") and headers.get(b"mcp-method") == b"tools/call":
                    request = json.loads(body)
                    write_event(directory, "request", wire=request, protocol=headers[b"mcp-protocol-version"].decode())
            return message

        async def send_and_record(message):
            if request and message["type"] == "http.response.start":
                write_event(directory, "response_start", tool=request["params"]["name"],
                            request_id=request["id"], status=message["status"])
            await send(message)

        await manager.handle_request(scope, receive_and_record, send_and_record)

    http_server = uvicorn.Server(uvicorn.Config(asgi, log_level="error", lifespan="off", timeout_graceful_shutdown=2))
    with socket.socket(fileno=listen_fd) as listener:
        async with manager.run():
            async with anyio.create_task_group() as tasks:
                tasks.start_soon(http_server.serve, [listener])
                (directory / "ready").touch()
                with anyio.fail_after(45):
                    while not (directory / "stop").exists():
                        await anyio.sleep(0.01)
                http_server.should_exit = True


async def call_mcp(url, name, arguments):
    wire = []

    async def observe(response):
        if response.request.headers.get("mcp-method") == "tools/call":
            await response.aread()
            wire.append({"status": response.status_code, "request": json.loads(response.request.content),
                         "response": response.json()})

    async with httpx2.AsyncClient(trust_env=False, timeout=20, event_hooks={"response": [observe]}) as http:
        async with streamable_http_client(url, http_client=http) as (incoming, outgoing):
            async with ClientSession(incoming, outgoing) as client:
                await client.discover()
                assert {tool.name for tool in (await client.list_tools()).tools} == {PUBLISH, LOOKUP}
                result = await client.call_tool(name, arguments)
    assert not result.is_error and len(wire) == 1
    return result.structured_content, wire[0]


async def worker(directory, source, port, action, approval):
    before = host_state(directory)
    draft = before["draft"]
    if action == "publish":
        assert before["state"] == "WAITING_APPROVAL" and before["operation_id"] is None
        if approval != expected_approval(source, draft):
            return {"pid": os.getpid(), "decision": "approval_mismatch", "approval": approval,
                    "before": before, "after": host_state(directory)}
        with closing(connect(directory, "task.sqlite")) as db, db:
            db.execute("INSERT INTO dispatch VALUES (?,?,NULL)", (OPERATION, draft_digest(draft)))
            db.execute("UPDATE task SET status='PUBLISH_PENDING'")
        await call_mcp(f"http://127.0.0.1:{port}/mcp", PUBLISH,
                       {"operation_id": OPERATION, "draft": draft, "draft_sha256": draft_digest(draft)})
        raise RuntimeError("expected supervisor to terminate the publisher before the response")
    assert before["state"] == "PUBLISH_PENDING" and before["receipt"] is None
    operation = before["operation_id"]
    result, wire = await call_mcp(f"http://127.0.0.1:{port}/mcp", LOOKUP, {"operation_id": operation})
    assert result == receipt_for(draft) and result["draft_sha256"] == before["draft_sha256"]
    with closing(connect(directory, "task.sqlite")) as db, db:
        db.execute("UPDATE dispatch SET receipt=? WHERE operation=?", (compact(result), operation))
        db.execute("UPDATE task SET status='DONE'")
    return {"pid": os.getpid(), "tool": LOOKUP, "before": before, "after": host_state(directory), "wire": wire}


def await_marker(path, process, seconds=10):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if path.exists():
            return
        if process.poll() is not None:
            raise RuntimeError(f"process exited before {path.name}: {process.returncode}")
        time.sleep(0.01)
    raise TimeoutError(path.name)


def stop(process):
    if process.poll() is None:
        process.kill()
    return process.wait(timeout=5)


def run(directory, planning_pack, engine, weights):
    assert version("mcp") == "2.3.0"
    assert {name: digest(planning_pack / name) for name in PLANNING_FILES} == PLANNING_FILES
    spec = spec_from_file_location("planning_lab", planning_pack / "model_plan_lab.py")
    planning = module_from_spec(spec)
    spec.loader.exec_module(planning)
    assert digest(engine) == planning.ASSETS["engine"]["binary_sha256"]
    assert weights.stat().st_size == planning.ASSETS["model"]["bytes"] and digest(weights) == planning.ASSETS["model"]["sha256"]
    source_file = planning_pack / "fixture.json"
    source = read_json(source_file)
    directory.mkdir(parents=True)
    planning.initialize(directory)
    with planning.engine_service(directory, engine, weights) as (port, engine_pid):
        paused = planning.child(directory, "stage", str(port))
    with closing(connect(directory, "task.sqlite")) as db, db:
        db.execute("CREATE TABLE dispatch(operation TEXT PRIMARY KEY,draft_sha256 TEXT NOT NULL,receipt TEXT)")
    draft = host_state(directory)["draft"]
    old = {**draft, "revision": 1, "total": sum(source["base_values"]), "sources": [source["base_source"]]}
    good, stale_approval = expected_approval(source, draft), expected_approval(source, old)
    command = [sys.executable, "-B", __file__]
    args = [str(directory), str(source_file)]
    with (directory / "receiver.stderr").open("wb") as log, socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port, fd = listener.getsockname()[1], listener.fileno()
        receiver = subprocess.Popen([*command, "serve", *args, str(fd)], pass_fds=(fd,), stderr=log)
    publisher = None
    try:
        await_marker(directory / "ready", receiver)
        worker_args = [*command, "worker", *args, str(port)]
        stale = json.loads(subprocess.check_output([*worker_args, "publish", compact(stale_approval)], timeout=6))
        stale.update(receiver=receiver_state(directory), receiver_events=rows(directory / "server.jsonl"))
        assert stale["decision"] == "approval_mismatch" and stale["before"] == stale["after"]
        assert stale["receiver"] == {"reports": [], "receipts": []} and stale["receiver_events"] == []
        with (directory / "publisher.stderr").open("wb") as log:
            publisher = subprocess.Popen([*worker_args, "publish", compact(good)], stderr=log)
        await_marker(directory / "committed", publisher)
        cut = {"pid": publisher.pid, "approval": good, "host": host_state(directory),
               "receiver": receiver_state(directory), "receiver_events": rows(directory / "server.jsonl")}
        assert [row["event"] for row in cut["receiver_events"]] == ["request", "receiver_commit"]
        assert cut["host"]["state"] == "PUBLISH_PENDING" and cut["host"]["receipt"] is None
        cut["exit"] = stop(publisher)
        assert cut["exit"] == -signal.SIGKILL and receiver.poll() is None
        cut["receiver_events_after_exit"] = rows(directory / "server.jsonl")
        assert cut["receiver_events_after_exit"] == cut["receiver_events"]
        (directory / "release-reply").touch()
        recovery = json.loads(subprocess.check_output([*worker_args, "recover", "null"], timeout=12))
        final = receiver_state(directory)
    finally:
        if publisher is not None:
            stop(publisher)
        (directory / "release-reply").touch()
        (directory / "stop").touch()
        try:
            receiver.wait(timeout=6)
        except subprocess.TimeoutExpired:
            stop(receiver)
    assert receiver.returncode == 0
    # Recompute from the original inputs and read both stores after all workers exit.
    expected = expected_from_source(read_json(source_file))
    assert draft == expected and expected["total"] == 42
    assert cut["receiver"] == final == {"reports": [expected], "receipts": [receipt_for(expected)]}
    assert recovery["before"] == cut["host"] and recovery["after"] == host_state(directory)
    assert recovery["after"]["state"] == "DONE" and recovery["after"]["local_reports"] == 0
    assert recovery["after"]["receipt"] == final["receipts"][0]
    files = ("model_mcp_recovery.py", "requirements.txt", "README.md")
    record = {"schema": "model-mcp-recovery-v1", "status": "passed", "protocol": PROTOCOL,
              "environment": {"python": platform.python_version(), "os": platform.system(), "arch": platform.machine(),
                              "sqlite": sqlite3.sqlite_version, "mcp": version("mcp"), "uvicorn": version("uvicorn")},
              "planning_source_sha256": PLANNING_FILES, "assets": planning.ASSETS, "engine_pid": engine_pid,
              "model_turns": rows(directory / "model-turns.jsonl"), "paused": paused, "stale": stale, "cut": cut,
              "recovery": recovery, "receiver_pid": receiver.pid, "receiver_exit": receiver.returncode,
              "receiver_events": rows(directory / "server.jsonl"), "receiver_final": final,
              "source_sha256": {name: digest(HERE / name) for name in files}}
    (directory / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(compact({"model_turns": len(record["model_turns"]), "stale": stale["decision"],
                   "cut_exit": cut["exit"], "resumed_via": recovery["tool"], "report_count": len(final["reports"]),
                   "receipt_count": len(final["receipts"]), "total": expected["total"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest="mode", required=True)
    command = modes.add_parser("run")
    for flag in ("planning-pack", "server", "model", "output-dir"):
        command.add_argument("--" + flag, type=Path, required=True)
    service = modes.add_parser("serve")
    child = modes.add_parser("worker")
    for internal in (service, child):
        internal.add_argument("directory", type=Path)
        internal.add_argument("source", type=Path)
    service.add_argument("fd", type=int)
    child.add_argument("port", type=int)
    child.add_argument("action", choices=("publish", "recover"))
    child.add_argument("approval", type=json.loads)
    options = parser.parse_args()
    if options.mode == "serve":
        anyio.run(serve, options.directory, read_json(options.source), options.fd)
    elif options.mode == "worker":
        print(compact(anyio.run(worker, options.directory, read_json(options.source), options.port, options.action, options.approval)))
    else:
        run(options.output_dir.resolve(), options.planning_pack.resolve(), options.server.resolve(), options.model.resolve())
