"""Let a pinned local model choose a tool, then run it against an actual MCP service."""

import argparse
from contextlib import closing, contextmanager
import hashlib
from http.client import HTTPConnection, HTTPException
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import re
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


HERE = Path(__file__).resolve().parent
FIXTURE = json.loads((HERE / "fixture.json").read_text(encoding="utf8"))
ASSETS = json.loads((HERE / "assets.json").read_text(encoding="utf8"))
PROTOCOL = "2026-07-28"
MODEL_ALIAS = "local-qwen"
SETTINGS = {"tool_choice": "auto", "temperature": 0, "seed": 17, "max_tokens": 96}
ENGINE_FLAGS = ["--n-gpu-layers", "0", "--threads", "4", "--ctx-size", "2048", "--parallel", "1", "--jinja",
                "--reasoning-budget", "0", "--chat-template-kwargs", '{"enable_thinking":false}', "--alias", MODEL_ALIAS]
INPUT = {"type": "object", "properties": {"report_id": {"type": "string", "description": "The report ID to read."}},
         "required": ["report_id"], "additionalProperties": False}
OUTPUT = {"type": "object", "properties": {"value": {"type": "integer"}, "evidence_id": {"type": "string"}},
          "required": ["value", "evidence_id"], "additionalProperties": False}
DENIAL = {"error": "Report unavailable."}


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def db(path, read_only=False):
    if read_only:
        return sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    return sqlite3.connect(path)


def initialize(directory):
    with closing(db(directory / "reports.sqlite")) as reports, reports:
        reports.executescript("""
            CREATE TABLE catalog(report_id TEXT PRIMARY KEY, tenant TEXT);
            CREATE TABLE bodies(report_id TEXT, tool TEXT, body TEXT, PRIMARY KEY(report_id,tool));
        """)
        for report_id, item in FIXTURE["reports"].items():
            reports.execute("INSERT INTO catalog VALUES(?,?)", (report_id, item["tenant"]))
            for tool, body in item["bodies"].items():
                reports.execute("INSERT INTO bodies VALUES(?,?,?)", (report_id, tool, json.dumps(body)))
    with closing(db(directory / "resource-audit.sqlite")) as audit, audit:
        audit.executescript("""
            CREATE TABLE decisions(seq INTEGER PRIMARY KEY,rpc_id INTEGER,principal TEXT,tool TEXT,report_id TEXT,outcome TEXT);
            CREATE TABLE body_reads(seq INTEGER PRIMARY KEY,rpc_id INTEGER,tool TEXT,report_id TEXT);
        """)


async def serve_resource(directory, fd):
    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[types.Tool(**tool, input_schema=INPUT, output_schema=OUTPUT)
                                           for tool in FIXTURE["tools"]])

    async def call_tool(ctx, params):
        assert params.name in {tool["name"] for tool in FIXTURE["tools"]}
        assert set(params.arguments or {}) == {"report_id"}
        report_id = params.arguments["report_id"]
        with closing(db(directory / "reports.sqlite", read_only=True)) as reports:
            owner = reports.execute("SELECT tenant FROM catalog WHERE report_id=?", (report_id,)).fetchone()
            allowed = owner == (FIXTURE["tenant"],)
            if allowed:
                [(body,)] = reports.execute("SELECT body FROM bodies WHERE report_id=? AND tool=?",
                                            (report_id, params.name)).fetchall()
        with closing(db(directory / "resource-audit.sqlite")) as audit, audit:
            audit.execute("INSERT INTO decisions(rpc_id,principal,tool,report_id,outcome) VALUES(?,?,?,?,?)",
                          (ctx.request_id, FIXTURE["principal"], params.name, report_id, "allowed" if allowed else "denied"))
            if allowed:
                audit.execute("INSERT INTO body_reads(rpc_id,tool,report_id) VALUES(?,?,?)", (ctx.request_id, params.name, report_id))
        if allowed:
            return types.CallToolResult(content=[types.TextContent(type="text", text=body)], structured_content=json.loads(body))
        return types.CallToolResult(is_error=True, content=[types.TextContent(type="text", text=json.dumps(DENIAL))])

    service = Server("infra-guide-model-tools", on_list_tools=list_tools, on_call_tool=call_tool)
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"], allowed_origins=[])
    manager = StreamableHTTPSessionManager(service, stateless=True, json_response=True, security_settings=security)

    async def asgi(scope, receive, send):
        await manager.handle_request(scope, receive, send)

    http = uvicorn.Server(uvicorn.Config(asgi, log_level="error", lifespan="off"))
    with socket.socket(fileno=fd) as listener, anyio.fail_after(100):
        async with manager.run(), anyio.create_task_group() as tasks:
            tasks.start_soon(http.serve, [listener])
            while not (directory / "resource.stop").exists():
                await anyio.sleep(0.01)
            http.should_exit = True


@contextmanager
def resource_service(directory):
    with (directory / "resource.stderr").open("wb") as log, socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        fd, port = listener.fileno(), listener.getsockname()[1]
        process = subprocess.Popen([sys.executable, "-B", __file__, "--output-dir", str(directory), "--resource-fd", str(fd)],
                                   pass_fds=(fd,), stdout=subprocess.DEVNULL, stderr=log)
        try:
            yield f"http://127.0.0.1:{port}/mcp", process.pid
        finally:
            stop = directory / "resource.stop"
            stop.touch()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            stop.unlink()
    assert process.returncode == 0


def engine_request(port, method, path, payload=None):
    with closing(HTTPConnection("127.0.0.1", port, timeout=15)) as conn:
        conn.request(method, path, json.dumps(payload) if payload else None, {"Content-Type": "application/json"})
        response = conn.getresponse()
        return {"status": response.status, "response": json.loads(response.read())}


@contextmanager
def engine_service(server, model, directory):
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


def model_turn(port, messages, tools):
    payload = {"model": MODEL_ALIAS, "messages": messages, "tools": tools, **SETTINGS}
    result = engine_request(port, "POST", "/v1/chat/completions", payload)
    if result["status"] != 200:
        raise RuntimeError(result)
    assert result["response"]["system_fingerprint"] == "b12110-cd959bae9"
    return {"request": payload, **result}


async def run_cases(port, url):
    mcp = []

    async def capture(response):
        await response.aread()
        mcp.append({"status": response.status_code, "protocol": response.request.headers["mcp-protocol-version"],
                    "request": json.loads(response.request.content), "response": response.json()})

    async with httpx2.AsyncClient(trust_env=False, timeout=5, event_hooks={"response": [capture]}) as http:
        async with streamable_http_client(url, http_client=http) as (incoming, outgoing):
            async with ClientSession(incoming, outgoing) as client:
                assert PROTOCOL in (await client.discover()).supported_versions
                catalog = (await client.list_tools()).tools
                tools = [{"type": "function", "function": {"name": tool.name, "description": tool.description,
                                                          "parameters": tool.input_schema}} for tool in catalog]
                tool_names = {tool.name for tool in catalog}
                assert tool_names == {tool["name"] for tool in FIXTURE["tools"]}
                cases = {}
                for label, question in FIXTURE["questions"].items():
                    messages = [{"role": "system", "content": FIXTURE["system_prompt"]}, {"role": "user", "content": question}]
                    first = model_turn(port, messages, tools)
                    [choice] = first["response"]["choices"]
                    assistant = choice["message"]
                    calls = assistant.get("tool_calls", [])
                    if choice["finish_reason"] != "tool_calls" or len(calls) != 1:
                        raise RuntimeError(f"{label}: model did not choose exactly one tool: {assistant}")
                    call = calls[0]
                    proposed = call["function"]
                    name, arguments = proposed["name"], json.loads(proposed["arguments"])
                    if (call["type"] != "function" or name not in tool_names or not isinstance(arguments, dict)
                            or set(arguments) != {"report_id"} or not isinstance(arguments["report_id"], str)):
                        raise RuntimeError(f"{label}: invalid model proposal: {call}")
                    result = await client.call_tool(name, arguments)
                    [block] = result.content
                    assert block.type == "text"
                    tool_message = {"role": "tool", "tool_call_id": call["id"], "content": block.text}
                    final = model_turn(port, [*messages, assistant, tool_message], tools)
                    cases[label] = {"first_model_turn": first, "mcp_call": mcp[-1], "final_model_turn": final}
                return {"mcp_discovery": mcp[:2], "cases": cases}


def read_audit(path):
    with closing(db(path, read_only=True)) as connection:
        connection.row_factory = sqlite3.Row
        return {table: [dict(row) for row in connection.execute("SELECT * FROM " + table + " ORDER BY seq")]
                for table in ("decisions", "body_reads")}


def verify(record):
    assert record["reports_db_sha256"]["before"] == record["reports_db_sha256"]["after"]
    assert [(row["status"], row["protocol"], row["request"]["method"]) for row in record["mcp_discovery"]] == [
        (200, PROTOCOL, "server/discover"), (200, PROTOCOL, "tools/list")]
    expected = [("sales-a", "read_sales_report", "A"), ("incident-a", "read_incident_report", "A"), ("sales-b", "read_sales_report", "B")]
    decisions, reads = [], []
    for index, (label, name, report_id) in enumerate(expected, 3):
        case = record["cases"][label]
        first, mcp, final = (case[key] for key in ("first_model_turn", "mcp_call", "final_model_turn"))
        assert first["request"]["tool_choice"] == final["request"]["tool_choice"] == "auto"
        assert [row["function"]["name"] for row in first["request"]["tools"]] == ["read_sales_report", "read_incident_report"]
        [proposal] = first["response"]["choices"][0]["message"]["tool_calls"]
        assert proposal["function"]["name"] == name
        assert json.loads(proposal["function"]["arguments"]) == {"report_id": report_id}
        assert mcp["status"] == 200 and mcp["protocol"] == PROTOCOL
        assert mcp["request"]["method"] == "tools/call" and mcp["request"]["params"]["name"] == name
        assert mcp["request"]["params"]["arguments"] == {"report_id": report_id}
        assert mcp["request"]["id"] == mcp["response"]["id"] == index
        result = mcp["response"]["result"]
        assert final["request"]["messages"][-2] == first["response"]["choices"][0]["message"]
        assert final["request"]["messages"][-1] == {"role": "tool", "tool_call_id": proposal["id"],
                                                     "content": result["content"][0]["text"]}
        [answer] = final["response"]["choices"]
        assert answer["finish_reason"] == "stop" and not answer["message"].get("tool_calls")
        content = answer["message"]["content"]
        allowed = report_id == "A"
        assert result["isError"] == (not allowed)
        decisions.append({"seq": index-2, "rpc_id": index, "principal": FIXTURE["principal"], "tool": name,
                          "report_id": report_id, "outcome": "allowed" if allowed else "denied"})
        if allowed:
            row = FIXTURE["reports"][report_id]["bodies"][name]
            assert result["structuredContent"] == json.loads(result["content"][0]["text"]) == row
            assert row["evidence_id"] not in json.dumps(first["request"])
            assert row["evidence_id"] in content and re.search(r"\b" + str(row["value"]) + r"\b", content)
            reads.append({"seq": len(reads)+1, "rpc_id": index, "tool": name, "report_id": report_id})
        else:
            assert "structuredContent" not in result and json.loads(result["content"][0]["text"]) == DENIAL
            assert "unavailable" in content.lower()
            assert FIXTURE["reports"]["B"]["bodies"][name]["evidence_id"] not in json.dumps(case)
    assert record["receiver"] == {"decisions": decisions, "body_reads": reads}


def run(directory, server, model):
    dependencies = {package: version(package) for package in ("mcp", "httpx2", "uvicorn")}
    assert dependencies == {"mcp": "2.3.0", "httpx2": "2.16.0", "uvicorn": "0.54.0"}
    assert model.stat().st_size == ASSETS["model"]["bytes"] and digest(model) == ASSETS["model"]["sha256"]
    assert digest(server) == ASSETS["engine"]["binary_sha256"]
    runtime = subprocess.run([str(server), "--version"], capture_output=True, text=True, check=True, timeout=10)
    runtime_version = (runtime.stdout + runtime.stderr).splitlines()
    assert any("build 12110, commit cd959bae9" in line for line in runtime_version)
    directory.mkdir(parents=True, exist_ok=False)
    initialize(directory)
    reports = directory / "reports.sqlite"
    before = digest(reports)
    with resource_service(directory) as (url, resource_pid), engine_service(server, model, directory) as (port, engine_pid):
        observed = anyio.run(run_cases, port, url)
    assert resource_pid != engine_pid and os.getpid() not in {resource_pid, engine_pid}
    sources = ("model_tool_lab.py", "fixture.json", "assets.json", "requirements.txt", "README.md")
    record = {"schema": "model-mcp-tool-choice-v1", "status": "passed", "protocol": PROTOCOL,
              "environment": {"python": platform.python_version(), "platform": platform.system(),
                              "architecture": platform.machine(), "sqlite": sqlite3.sqlite_version, **dependencies},
              "assets": ASSETS, "engine_flags": ENGINE_FLAGS, "driver_pid": os.getpid(),
              "resource_pid": resource_pid, "engine_pid": engine_pid,
              "reports_db_sha256": {"before": before, "after": digest(reports)},
              "receiver": read_audit(directory / "resource-audit.sqlite"), **observed,
              "source_sha256": {name: digest(HERE / name) for name in sources}}
    (directory / "observed.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    verify(record)
    (directory / "observed.json").replace(directory / "validation.json")
    print(json.dumps({key: value["final_model_turn"]["response"]["choices"][0]["message"]["content"]
                      for key, value in record["cases"].items()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--server", type=Path)
    parser.add_argument("--model", type=Path)
    parser.add_argument("--resource-fd", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.resource_fd is not None:
        anyio.run(serve_resource, args.output_dir.resolve(), args.resource_fd)
    elif args.server and args.model:
        run(args.output_dir.resolve(), args.server.resolve(), args.model.resolve())
    else:
        parser.error("--server and --model are required")
