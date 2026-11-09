"""Re-enter one report operation from independent MCP HTTP callers."""

import argparse
import asyncio
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
import time

import anyio
import httpx2
import uvicorn
from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client
from mcp.server import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from opentelemetry.context import Context
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.sampling import ALWAYS_ON
from opentelemetry.trace import Link, SpanKind, get_current_span
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

HERE = Path(__file__).resolve().parent
TASK = "report-A"
OP = "report-A/v3:publish"
TOTAL = sum([10, 27, 5])
CASES = ("first", "resume-linked", "resume-unlinked")
PROPAGATOR = TraceContextTextMapPropagator()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf8")


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def trace_recorder(service):
    exporter = InMemorySpanExporter()
    provider = TracerProvider(sampler=ALWAYS_ON, resource=Resource.create({"service.name": service}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    return provider.get_tracer("infra-guide.mcp-trace-reentry"), exporter


def spans(exporter):
    return [json.loads(span.to_json()) for span in exporter.get_finished_spans()]


def create_ledger(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            CREATE TABLE reports(op TEXT PRIMARY KEY, task TEXT NOT NULL, total INTEGER NOT NULL,
                                 receipt TEXT NOT NULL UNIQUE);
            CREATE TABLE attempts(number INTEGER PRIMARY KEY, op TEXT NOT NULL REFERENCES reports(op),
                                  trace_id TEXT NOT NULL, outcome TEXT NOT NULL);
        """)


def publish(path, arguments, trace_id):
    assert arguments == {"task": TASK, "op": OP, "total": TOTAL}
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("PRAGMA foreign_keys=ON")
        inserted = db.execute("INSERT INTO reports VALUES(?,?,?,?) ON CONFLICT(op) DO NOTHING",
                              (OP, TASK, TOTAL, "receipt-report-A-v3")).rowcount
        task, total, receipt = db.execute("SELECT task, total, receipt FROM reports WHERE op=?", (OP,)).fetchone()
        assert (task, total) == (arguments["task"], arguments["total"])
        outcome = "committed" if inserted else "reused"
        db.execute("INSERT INTO attempts(op, trace_id, outcome) VALUES(?,?,?)", (OP, trace_id, outcome))
    return {"task": task, "op": OP, "total": total, "receipt": receipt, "outcome": outcome}


async def serve(directory):
    path = directory / "ledger.sqlite"
    create_ledger(path)
    tracer, exporter = trace_recorder("report-tool")
    requests = []
    schema = {"type": "object", "properties": {
        "task": {"const": TASK}, "op": {"const": OP}, "total": {"const": TOTAL}},
        "required": ["task", "op", "total"], "additionalProperties": False}

    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[types.Tool(name="publish_report", input_schema=schema)])

    async def call_tool(_ctx, params):
        assert params.name == "publish_report"
        span = get_current_span()
        trace_id = format(span.get_span_context().trace_id, "032x")
        result = publish(path, params.arguments, trace_id)
        return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(result))],
                                    structured_content=result)

    server = Server("infra-guide-report", on_list_tools=list_tools, on_call_tool=call_tool)
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"], allowed_origins=[])
    manager = StreamableHTTPSessionManager(server, stateless=True, json_response=True, security_settings=security)

    async def asgi(scope, receive, send):
        headers = {key.decode(): value.decode() for key, value in scope["headers"]}
        if headers.get("mcp-method") != "tools/call":
            await manager.handle_request(scope, receive, send)
            return
        remote = PROPAGATOR.extract(headers, context=Context())
        remote_span = get_current_span(remote).get_span_context()
        assert remote_span.is_valid and remote_span.is_remote
        request = {"method": scope["method"], "path": scope["path"], "mcp_method": headers["mcp-method"],
                   "traceparent": headers["traceparent"], "parent_is_remote": remote_span.is_remote,
                   "protocol": headers["mcp-protocol-version"]}
        requests.append(request)

        async def record_status(message):
            if message["type"] == "http.response.start":
                request["status"] = message["status"]
            await send(message)

        with tracer.start_as_current_span("mcp.tools/call.receive", context=remote, kind=SpanKind.SERVER,
                                          attributes={"app.op": OP}):
            await manager.handle_request(scope, receive, record_status)

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        uvicorn_server = uvicorn.Server(uvicorn.Config(asgi, log_level="error", lifespan="off"))
        async with manager.run(), anyio.create_task_group() as tasks:
            tasks.start_soon(uvicorn_server.serve, [listener])
            with anyio.fail_after(20):
                while not uvicorn_server.started:
                    await anyio.sleep(0.01)
            ready = directory / "port"
            ready.with_suffix(".tmp").write_text(str(port), encoding="ascii")
            ready.with_suffix(".tmp").replace(ready)
            while not (directory / "stop").exists():
                await anyio.sleep(0.01)
            uvicorn_server.should_exit = True
    write_json(directory / "server.json", {"pid": os.getpid(), "requests": requests, "spans": spans(exporter)})


async def run_client(directory, case, url):
    tracer, exporter = trace_recorder("report-runner")
    checkpoint = directory / "checkpoint.json"
    links = []
    if case != "first":
        saved = read_json(checkpoint)
        assert (saved["task"], saved["op"], saved["total"]) == (TASK, OP, TOTAL)
        origin = PROPAGATOR.extract(saved["origin"], context=Context())
        origin_span = get_current_span(origin).get_span_context()
        assert origin_span.is_valid
        if case == "resume-linked":
            links = [Link(origin_span, {"app.relation": "resumes"})]

    with tracer.start_as_current_span("agent.report.run", context=Context(), links=links,
                                      attributes={"app.case": case, "app.op": OP}):
        if case == "first":
            carrier = {}
            PROPAGATOR.inject(carrier)
            write_json(checkpoint, {"task": TASK, "op": OP, "total": TOTAL, "origin": carrier})
        with tracer.start_as_current_span("mcp.tools/call.send", kind=SpanKind.CLIENT,
                                          attributes={"app.op": OP}):
            call_headers = {}
            PROPAGATOR.inject(call_headers)

            async def attach_traceparent(request):
                if request.headers.get("mcp-method") == "tools/call":
                    request.headers.update(call_headers)

            async with httpx2.AsyncClient(trust_env=False, timeout=5,
                                          event_hooks={"request": [attach_traceparent]}) as http:
                async with streamable_http_client(url, http_client=http) as (incoming, outgoing):
                    async with ClientSession(incoming, outgoing) as client:
                        await client.discover()
                        assert [tool.name for tool in (await client.list_tools()).tools] == ["publish_report"]
                        result = await client.call_tool("publish_report", {"task": TASK, "op": OP, "total": TOTAL})
                        assert not result.is_error
    write_json(directory / f"{case}.json", {"pid": os.getpid(), "result": result.structured_content,
                                            "spans": spans(exporter)})


def run(directory):
    directory.mkdir()
    command = [sys.executable, "-B", str(Path(__file__).resolve())]
    server = subprocess.Popen(command + [str(directory), "--serve"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        ready = directory / "port"
        until = time.monotonic() + 20
        while not ready.exists():
            if server.poll() is not None:
                raise RuntimeError(server.communicate()[1].decode())
            if time.monotonic() > until:
                raise TimeoutError("MCP server startup")
            time.sleep(0.01)
        url = f"http://127.0.0.1:{ready.read_text(encoding='ascii')}/mcp"
        for case in CASES:
            subprocess.run(command + [str(directory), "--client", case, "--url", url], check=True, timeout=20)
        (directory / "stop").touch()
        _, errors = server.communicate(timeout=20)
        if server.returncode:
            raise RuntimeError(errors.decode())
    finally:
        if server.poll() is None:
            server.kill()
            server.communicate()
    clients = {case: read_json(directory / f"{case}.json") for case in CASES}
    raw = {"checkpoint": read_json(directory / "checkpoint.json"), "clients": clients,
           "server": read_json(directory / "server.json")}
    write_json(directory / "trace-record.json", raw)
    with closing(sqlite3.connect(directory / "ledger.sqlite")) as db:
        reports = db.execute("SELECT op, task, total, receipt FROM reports").fetchall()
        attempts = db.execute("SELECT outcome FROM attempts ORDER BY number").fetchall()
    assert reports == [(OP, TASK, TOTAL, "receipt-report-A-v3")]
    assert attempts == [("committed",), ("reused",), ("reused",)]
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    record = {"environment": {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
                              **{name: version(name) for name in ("mcp", "httpx2", "uvicorn", "opentelemetry-sdk")}},
              "source_sha256": {name: sha(HERE / name) for name in ("trace_reentry.py", "README.md", "requirements.txt")},
              "artifact_sha256": {name: sha(directory / name) for name in ("trace-record.json", "ledger.sqlite")},
              "results": {"traces": len(clients), "links": sum(len(span["links"]) for client in clients.values()
                                                                for span in client["spans"]),
                          "effects": len(reports), "attempts": len(attempts), "receipts": [row[3] for row in reports]}}
    write_json(directory / "validation.json", record)
    print(json.dumps(record["results"]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_dir", type=Path, help="new directory for the experiment")
    parser.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--client", choices=CASES, help=argparse.SUPPRESS)
    parser.add_argument("--url", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.serve:
        asyncio.run(serve(args.output_dir))
    elif args.client:
        asyncio.run(run_client(args.output_dir, args.client, args.url))
    else:
        run(args.output_dir)
