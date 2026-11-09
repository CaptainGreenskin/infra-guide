"""Observe the real MCP HTTP cancellation boundary on the same report in two databases."""

import argparse
import base64
from contextlib import closing
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import socket
import sqlite3
import subprocess
import sys

import anyio
import httpx2
import uvicorn
from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client
from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings


HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "orders.json"
SOURCE = json.loads(FIXTURE.read_text())
TASK = SOURCE["task_id"]
VERSION = SOURCE["version"]
OPERATION = f"{TASK}/v{VERSION}:publish"
TOTAL = sum(value for batch in SOURCE["batches"].values() for value in batch)
PROTOCOL = "2026-07-28"
CASES = ("before", "after")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def emit(path, event, **fields):
    with path.open("a", encoding="utf8") as out:
        out.write(json.dumps({"event": event, **fields}, ensure_ascii=False) + "\n")


def events(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines(keepends=True) if line.endswith("\n")]


def make_database(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            CREATE TABLE reports(op TEXT PRIMARY KEY, task_id TEXT, version INTEGER, total INTEGER);
            CREATE TABLE receipts(op TEXT PRIMARY KEY REFERENCES reports(op), total INTEGER);
        """)


def commit_report(path):
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("INSERT INTO reports VALUES(?,?,?,?)", (OPERATION, TASK, VERSION, TOTAL))
        db.execute("INSERT INTO receipts VALUES(?,?)", (OPERATION, TOTAL))


def receipt(path):
    with closing(sqlite3.connect(path)) as db:
        row = db.execute("SELECT total FROM receipts WHERE op=?", (OPERATION,)).fetchone()
    return {"op": OPERATION, "total": row[0] if row else None}


async def serve(case, directory):
    log = directory / f"{case}-server.jsonl"
    database = directory / f"{case}.sqlite"
    make_database(database)
    input_schema = {"type": "object", "properties": {"task_id": {"const": TASK}, "op": {"const": OPERATION}},
                    "required": ["task_id", "op"], "additionalProperties": False}

    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[types.Tool(name=name, input_schema=input_schema)
                                           for name in ("watch_publish", "read_receipt")])

    async def call_tool(ctx, params):
        assert params.arguments == {"task_id": TASK, "op": OPERATION}
        if params.name == "read_receipt":
            result = receipt(database)
            emit(log, "receipt_read", request_id=ctx.request_id, result=result)
            return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(result))],
                                        structured_content=result)
        assert params.name == "watch_publish"
        handle = FIXTURE.open("rb")
        try:
            with handle:
                handle.read(1)
                emit(log, "source_opened", request_id=ctx.request_id, op=OPERATION)
                if case == "after":
                    commit_report(database)
                    emit(log, "receiver_committed", request_id=ctx.request_id, op=OPERATION, total=TOTAL)
                await ctx.session.report_progress(1, total=2, message="waiting with source open")
                await anyio.sleep_forever()
        except anyio.get_cancelled_exc_class():
            emit(log, "handler_cancelled", request_id=ctx.request_id)
            raise
        finally:
            emit(log, "handler_cleaned", request_id=ctx.request_id, file_closed=handle.closed)

    server = Server("infra-guide-report", on_list_tools=list_tools, on_call_tool=call_tool)
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"], allowed_origins=[])
    manager = StreamableHTTPSessionManager(server, stateless=True, json_response=False, security_settings=security)

    async def asgi(scope, receive, send):
        emit(log, "http_started", method=scope["method"], endpoint=scope["path"])
        request_bytes = bytearray()
        request_id = None

        async def receive_tap():
            nonlocal request_id
            message = await receive()
            if message["type"] == "http.request":
                request_bytes.extend(message.get("body", b""))
                if not message.get("more_body") and request_bytes:
                    request = json.loads(request_bytes)
                    request_id = request.get("id")
                    headers = dict(scope["headers"])
                    emit(log, "http_request", request_id=request_id, request=request, http_method=scope["method"],
                         protocol_header=headers.get(b"mcp-protocol-version", b"").decode(),
                         method_header=headers.get(b"mcp-method", b"").decode())
            elif message["type"] == "http.disconnect":
                emit(log, "http_disconnect", request_id=request_id)
            return message

        async def send_tap(message):
            await send(message)
            if message["type"] == "http.response.start":
                headers = dict(message["headers"])
                emit(log, "http_response", request_id=request_id, status=message["status"],
                     content_type=headers.get(b"content-type", b"").decode(),
                     session_header_present=b"mcp-session-id" in headers)
            elif message["type"] == "http.response.body" and message.get("body"):
                body = base64.b64encode(message["body"]).decode("ascii")
                emit(log, "response_bytes", request_id=request_id, body_base64=body)

        await manager.handle_request(scope, receive_tap, send_tap)

    ready = directory / f"{case}-port"
    stop = directory / f"{case}-stop"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        uvicorn_server = uvicorn.Server(uvicorn.Config(asgi, log_level="error", lifespan="off"))
        async with manager.run():
            async with anyio.create_task_group() as tasks:
                tasks.start_soon(uvicorn_server.serve, [listener])
                with anyio.fail_after(20):
                    while not uvicorn_server.started:
                        await anyio.sleep(0.01)
                    emit(log, "server_ready", pid=os.getpid(), port=port)
                    ready_stage = ready.with_suffix(".tmp")
                    ready_stage.write_text(str(port))
                    ready_stage.replace(ready)
                    while not stop.exists():
                        await anyio.sleep(0.01)
                    uvicorn_server.should_exit = True
    emit(log, "server_stopped", pid=os.getpid())


async def call_and_cancel(url, client_log, server_log):
    arguments = {"task_id": TASK, "op": OPERATION}
    async with httpx2.AsyncClient(trust_env=False, timeout=5) as http:
        async with streamable_http_client(url, http_client=http) as (incoming, outgoing):
            async with ClientSession(incoming, outgoing) as client:
                await client.discover()
                assert {tool.name for tool in (await client.list_tools()).tools} == {"watch_publish", "read_receipt"}
                progress_arrived = anyio.Event()
                cancel = anyio.CancelScope()

                async def on_progress(progress, total, message):
                    emit(client_log, "progress_received", progress=progress, total=total, message=message)
                    progress_arrived.set()

                async def watch():
                    with cancel:
                        await client.call_tool("watch_publish", arguments, progress_callback=on_progress)
                        raise AssertionError("watch unexpectedly returned a final result")
                    emit(client_log, "caller_cancelled")

                async with anyio.create_task_group() as tasks:
                    tasks.start_soon(watch)
                    await progress_arrived.wait()
                    emit(client_log, "cancel_requested")
                    cancel.cancel()
                while not any(row["event"] == "handler_cleaned" for row in events(server_log)):
                    await anyio.sleep(0.01)
                result = await client.call_tool("read_receipt", arguments)
                assert not result.is_error
                emit(client_log, "receipt_received", result=result.model_dump(by_alias=True, exclude_none=False))
                return result.structured_content


async def run_case(case, directory):
    ready = directory / f"{case}-port"
    stop = directory / f"{case}-stop"
    server_log = directory / f"{case}-server.jsonl"
    client_log = directory / f"{case}-client.jsonl"
    with (directory / f"{case}-server.stderr").open("wb") as stderr:
        child = subprocess.Popen([sys.executable, "-B", str(Path(__file__).resolve()), "--serve", case,
                                  "--output-dir", str(directory)], stdout=subprocess.DEVNULL, stderr=stderr)
        try:
            with anyio.fail_after(12):
                while not ready.exists():
                    if child.poll() is not None:
                        raise RuntimeError(f"server exited early: {child.returncode}")
                    await anyio.sleep(0.01)
                port = int(ready.read_text())
                returned = await call_and_cancel(f"http://127.0.0.1:{port}/mcp", client_log, server_log)
        finally:
            stop.touch()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
        assert child.returncode == 0
    ready.unlink()
    stop.unlink()
    raw = events(server_log)
    watch = next(row for row in raw if row["event"] == "source_opened")
    watch_id = watch["request_id"]
    assert any(row["event"] == "http_disconnect" and row["request_id"] == watch_id for row in raw)
    assert any(row["event"] == "handler_cleaned" and row["file_closed"] for row in raw)
    assert all(row.get("request", {}).get("method") != "notifications/cancelled" for row in raw)
    expected_total = TOTAL if case == "after" else None
    database = directory / f"{case}.sqlite"
    assert returned == receipt(database) == {"op": OPERATION, "total": expected_total}
    with closing(sqlite3.connect(database)) as db:
        report_count = db.execute("SELECT count(*) FROM reports").fetchone()[0]
        receipt_count = db.execute("SELECT count(*) FROM receipts").fetchone()[0]
    assert report_count == receipt_count == int(case == "after")
    return {"watch_request_id": watch_id, "reports": report_count, "receipts": receipt_count,
            "receipt_total": expected_total, "file_closed": True, "server_pid": child.pid, "server_exit": child.returncode}


async def run(directory):
    assert version("mcp") == "2.3.0" and version("uvicorn") == "0.54.0" and version("httpx2") == "2.16.0"
    directory.mkdir(parents=True, exist_ok=False)
    observations = {case: await run_case(case, directory) for case in CASES}
    source_files = ("cancellation_lab.py", "orders.json", "requirements.txt", "README.md")
    artifacts = [f"{case}{suffix}" for case in CASES for suffix in ("-server.jsonl", "-client.jsonl", ".sqlite")]
    record = {"schema": "mcp-http-cancellation-v1", "status": "passed", "protocol": PROTOCOL, "client_pid": os.getpid(),
              "environment": {"python": platform.python_version(), "platform": platform.system(), "sqlite": sqlite3.sqlite_version,
                              **{name: version(name) for name in ("mcp", "uvicorn", "httpx2", "anyio")}},
              "source": {"task_id": TASK, "version": VERSION, "op": OPERATION, "expected_total": TOTAL},
              "cases": observations, "source_sha256": {name: digest(HERE / name) for name in source_files},
              "artifact_sha256": {name: digest(directory / name) for name in artifacts}}
    (directory / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(observations, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--serve", choices=CASES, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve:
        anyio.run(serve, args.serve, args.output_dir.resolve())
    else:
        anyio.run(run, args.output_dir.resolve())
