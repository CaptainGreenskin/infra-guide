"""Observe a rejected MCP tool result after an actual receiver commit."""

import argparse
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
PROTOCOL = "2026-07-28"
CASES = ("valid", "malformed", "wrong-operation")
PUBLISH = "publish_report"
LOOKUP = "lookup_receipt"
FIELDS = ("operation_id", "report_id", "version", "total")
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "operation_id": {"type": "string"}, "report_id": {"type": "string"},
        "version": {"type": "integer"}, "total": {"type": "integer"},
    },
    "required": list(FIELDS),
    "additionalProperties": False,
}


def read_source():
    return json.loads((HERE / "orders.json").read_text(encoding="utf8"))


def operation_id(source):
    return f"{source['task_id']}/v{source['version']}:publish"


def receiver_snapshot(path):
    with closing(sqlite3.connect(path)) as db:
        reports = db.execute("SELECT operation_id, report_id, version, total FROM reports").fetchall()
        receipts = db.execute("SELECT operation_id, report_id, version, total FROM receipts").fetchall()
    return {"reports": [dict(zip(FIELDS, row)) for row in reports],
            "receipts": [dict(zip(FIELDS, row)) for row in receipts]}


def host_snapshot(path):
    with closing(sqlite3.connect(path)) as db:
        [(operation, state, payload)] = db.execute("SELECT operation_id, state, receipt FROM intent").fetchall()
    return {"operation_id": operation, "state": state, "receipt": json.loads(payload) if payload else None}


def accept_receipt(host, result, expected):
    if result.is_error or result.structured_content != expected:
        return False
    with closing(sqlite3.connect(host)) as db, db:
        changed = db.execute("UPDATE intent SET state='accepted', receipt=? WHERE operation_id=? AND state='pending'",
                             (json.dumps(result.structured_content), expected["operation_id"]))
        assert changed.rowcount == 1
    return True


async def serve(case, database, fd):
    source = read_source()
    operation = operation_id(source)
    receipt = {
        "operation_id": operation, "report_id": source["task_id"], "version": source["version"],
        "total": sum(amount for batch in source["batches"].values() for amount in batch),
    }
    with closing(sqlite3.connect(database)) as db:
        db.executescript("""
            CREATE TABLE reports(operation_id TEXT PRIMARY KEY, report_id TEXT, version INTEGER, total INTEGER);
            CREATE TABLE receipts(operation_id TEXT PRIMARY KEY REFERENCES reports(operation_id),
                                  report_id TEXT, version INTEGER, total INTEGER);
        """)

    input_schema = {"type": "object", "properties": {"operation_id": {"const": operation}},
                    "required": ["operation_id"], "additionalProperties": False}

    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[
            types.Tool(name=name, input_schema=input_schema, output_schema=OUTPUT_SCHEMA)
            for name in (PUBLISH, LOOKUP)
        ])

    async def call_tool(_ctx, params):
        assert params.arguments == {"operation_id": operation}
        if params.name == PUBLISH:
            row = tuple(receipt[field] for field in FIELDS)
            with closing(sqlite3.connect(database)) as db, db:
                db.execute("PRAGMA foreign_keys=ON")
                db.execute("INSERT INTO reports VALUES(?,?,?,?)", row)
                db.execute("INSERT INTO receipts VALUES(?,?,?,?)", row)
            # The write is already committed. Change only the outbound response.
            displayed = receipt.copy()
            if case == "wrong-operation":
                displayed["operation_id"] = "report-A/v2:publish"
            structured = displayed.copy()
            if case == "malformed":
                structured["total"] = str(structured["total"])
        else:
            assert params.name == LOOKUP
            with closing(sqlite3.connect(database)) as db:
                row = db.execute("SELECT operation_id, report_id, version, total FROM receipts WHERE operation_id=?",
                                 (params.arguments["operation_id"],)).fetchone()
            assert row is not None
            displayed = structured = dict(zip(FIELDS, row))
        return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(displayed))],
                                    structured_content=structured)

    server = Server("infra-guide-receipt", on_list_tools=list_tools, on_call_tool=call_tool)
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"], allowed_origins=[])
    manager = StreamableHTTPSessionManager(server, stateless=True, json_response=True, security_settings=security)

    async def asgi(scope, receive, send):
        await manager.handle_request(scope, receive, send)

    config = uvicorn.Config(asgi, log_level="error", lifespan="off")
    http_server = uvicorn.Server(config)
    stop = database.with_suffix(".stop")
    with socket.socket(fileno=fd) as listener:
        async with manager.run():
            async with anyio.create_task_group() as tasks:
                tasks.start_soon(http_server.serve, [listener])
                with anyio.fail_after(20):
                    while not stop.exists():
                        await anyio.sleep(0.01)
                http_server.should_exit = True


async def observe(url, host, receiver, expected):
    http_records = []

    async def observe_response(response):
        await response.aread()
        assert response.headers["content-type"].startswith("application/json"), response.status_code
        http_records.append({
            "status": response.status_code, "content_type": response.headers["content-type"],
            "protocol": response.request.headers["mcp-protocol-version"],
            "request": json.loads(response.request.content), "response": response.json(),
        })

    arguments = {"operation_id": expected["operation_id"]}
    async with httpx2.AsyncClient(trust_env=False, timeout=5, event_hooks={"response": [observe_response]}) as http:
        async with streamable_http_client(url, http_client=http) as (incoming, outgoing):
            async with ClientSession(incoming, outgoing) as client:
                await client.discover()
                tools = await client.list_tools()
                assert {tool.name: tool.output_schema for tool in tools.tools} == {PUBLISH: OUTPUT_SCHEMA, LOOKUP: OUTPUT_SCHEMA}
                try:
                    returned = await client.call_tool(PUBLISH, arguments)
                except RuntimeError as error:
                    if not str(error).startswith(f"Invalid structured content returned by tool {PUBLISH}:"):
                        raise
                    outcome = {"status": "sdk_rejected", "detail": str(error)}
                else:
                    if accept_receipt(host, returned, expected):
                        outcome = {"status": "accepted", "detail": "receipt matches the original intent"}
                    else:
                        assert not returned.is_error and returned.structured_content["operation_id"] != arguments["operation_id"]
                        outcome = {"status": "host_rejected", "detail": "receipt operation does not match the original intent"}
                after_publish = {"host": host_snapshot(host), "receiver": receiver_snapshot(receiver)}
                accepted_via = PUBLISH
                if outcome["status"] != "accepted":
                    recovered = await client.call_tool(LOOKUP, arguments)
                    assert accept_receipt(host, recovered, expected)
                    accepted_via = LOOKUP

    return {"http": http_records, "after_publish": after_publish, "publish_outcome": outcome,
            "accepted_via": accepted_via, "final": {"host": host_snapshot(host), "receiver": receiver_snapshot(receiver)}}


def check_case(case, result, expected):
    records = result["http"]
    methods = [record["request"]["method"] for record in records]
    assert methods == ["server/discover", "tools/list", "tools/call"] + ([] if case == "valid" else ["tools/call"])
    for record in records:
        assert record["status"] == 200 and record["content_type"].startswith("application/json")
        assert record["protocol"] == PROTOCOL and record["request"]["id"] == record["response"]["id"]
        assert "result" in record["response"] and "error" not in record["response"]
    original_call = records[2]["request"]["params"]
    assert original_call["name"] == PUBLISH and original_call["arguments"] == {"operation_id": expected["operation_id"]}
    wire = records[2]["response"]["result"]
    assert wire["resultType"] == "complete" and not wire.get("isError", False)
    displayed = json.loads(wire["content"][0]["text"])
    structured = wire["structuredContent"]
    status, state = "accepted", "accepted"
    if case == "malformed":
        assert displayed == expected and structured == {**expected, "total": "42"}
        status, state = "sdk_rejected", "pending"
    elif case == "wrong-operation":
        assert displayed == structured == {**expected, "operation_id": "report-A/v2:publish"}
        status, state = "host_rejected", "pending"
    else:
        assert displayed == structured == expected
    assert result["publish_outcome"]["status"] == status
    assert result["after_publish"]["host"] == {"operation_id": expected["operation_id"], "state": state,
                                                "receipt": expected if state == "accepted" else None}
    assert result["after_publish"]["receiver"] == result["final"]["receiver"] == {"reports": [expected], "receipts": [expected]}
    assert result["final"]["host"] == {"operation_id": expected["operation_id"], "state": "accepted", "receipt": expected}
    assert result["accepted_via"] == (PUBLISH if case == "valid" else LOOKUP)
    if case != "valid":
        lookup = records[3]["request"]["params"]
        assert lookup["name"] == LOOKUP and lookup["arguments"] == original_call["arguments"]
        assert records[3]["response"]["result"]["structuredContent"] == expected


async def run_case(case, directory, expected):
    host = directory / f"{case}-host.sqlite"
    receiver = directory / f"{case}-receiver.sqlite"
    stop = receiver.with_suffix(".stop")
    with closing(sqlite3.connect(host)) as db, db:
        db.execute("CREATE TABLE intent(operation_id TEXT PRIMARY KEY, state TEXT, receipt TEXT)")
        db.execute("INSERT INTO intent VALUES(?, 'pending', NULL)", (expected["operation_id"],))
    with (directory / f"{case}-server.stderr").open("wb") as stderr:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port, fd = listener.getsockname()[1], listener.fileno()
            child = subprocess.Popen([sys.executable, "-B", __file__, "--serve", case, "--receiver", str(receiver),
                                      "--listen-fd", str(fd)], stdout=subprocess.DEVNULL, stderr=stderr, pass_fds=(fd,))
        try:
            with anyio.fail_after(12):
                result = await observe(f"http://127.0.0.1:{port}/mcp", host, receiver, expected)
        finally:
            stop.touch()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
            finally:
                stop.unlink()
    assert child.returncode == 0
    check_case(case, result, expected)
    return {**result, "receiver_pid": child.pid, "receiver_exit": child.returncode}


async def run(directory):
    assert version("mcp") == "2.3.0"
    directory.mkdir(parents=True, exist_ok=False)
    source = read_source()
    expected = {"operation_id": operation_id(source), "report_id": source["task_id"], "version": source["version"],
                "total": sum(map(sum, source["batches"].values()))}
    assert expected["total"] == 42
    cases = {case: await run_case(case, directory, expected) for case in CASES}
    source_files = ("receipt_lab.py", "orders.json", "requirements.txt", "README.md")
    record = {"schema": "mcp-result-receipt-v1", "status": "passed", "protocol": PROTOCOL,
              "host_pid": os.getpid(), "environment": {"python": platform.python_version(),
              "platform": platform.system(), "architecture": platform.machine(), "sqlite": sqlite3.sqlite_version,
              **{name: version(name) for name in ("mcp", "httpx2", "uvicorn", "jsonschema")}},
              "fixture": expected, "cases": cases,
              "source_sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in source_files}}
    (directory / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({case: result["publish_outcome"]["status"] for case, result in cases.items()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--serve", choices=CASES, help=argparse.SUPPRESS)
    parser.add_argument("--receiver", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--listen-fd", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve:
        anyio.run(serve, args.serve, args.receiver, args.listen_fd)
    elif args.output_dir:
        anyio.run(run, args.output_dir.resolve())
    else:
        parser.error("--output-dir is required")
