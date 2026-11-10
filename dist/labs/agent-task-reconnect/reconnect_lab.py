"""Run a local read-only task through a lost HTTP acknowledgement and a real MCP call."""

import argparse
from contextlib import closing, contextmanager
import hashlib
from http.client import HTTPConnection, RemoteDisconnected
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import socket
import sqlite3
import subprocess
import sys
from threading import Thread
from uuid import uuid4

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
TARGET = "infra-guide-local-reference/1"
TOOL = "read_report"


def load(path):
    return json.loads(path.read_text(encoding="utf8"))


def fingerprint(value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(data).hexdigest()


def database(path, read_only=False):
    db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) if read_only else sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    return db


def rows(db, query, *json_fields):
    result = [dict(row) for row in db.execute(query)]
    for row in result:
        for field in json_fields:
            row[field] = json.loads(row[field])
    return result


def initialize(directory):
    with closing(database(directory / "tasks.sqlite")) as db, db:
        db.executescript("""
            CREATE TABLE tasks(task_id TEXT PRIMARY KEY, request_id TEXT UNIQUE, args_sha256 TEXT,
                               request TEXT, principal TEXT, status TEXT);
            CREATE TABLE submissions(seq INTEGER PRIMARY KEY, transport_id TEXT, request_id TEXT,
                                     args_sha256 TEXT, task_id TEXT, outcome TEXT);
            CREATE TABLE deliveries(task_id TEXT PRIMARY KEY, channel TEXT, total INTEGER, citations TEXT);
        """)
    with closing(database(directory / "reports.sqlite")) as db, db:
        db.executescript("""
            CREATE TABLE catalog(resource TEXT PRIMARY KEY, tenant TEXT, version TEXT);
            CREATE TABLE bodies(resource TEXT PRIMARY KEY, body TEXT);
            CREATE TABLE business_writes(seq INTEGER PRIMARY KEY, resource TEXT);
        """)
        for name, report in load(HERE / "resources.json").items():
            db.execute("INSERT INTO catalog VALUES(?,?,?)", (name, report["tenant"], json.dumps(report["version"])))
            db.execute("INSERT INTO bodies VALUES(?,?)", (name, json.dumps(report["body"])))
    with closing(database(directory / "resource-audit.sqlite")) as db, db:
        db.executescript("""
            CREATE TABLE decisions(seq INTEGER PRIMARY KEY, task_id TEXT, attempt_id TEXT, rpc_id INTEGER,
                                   principal TEXT, tenant TEXT, action TEXT, resource TEXT, status TEXT,
                                   source_version TEXT, events TEXT);
            CREATE TABLE body_reads(seq INTEGER PRIMARY KEY, task_id TEXT, attempt_id TEXT, resource TEXT);
        """)


def resource_snapshot(directory):
    path = directory / "reports.sqlite"
    with closing(database(path, read_only=True)) as db:
        reports = rows(db, "SELECT resource, version, body FROM catalog JOIN bodies USING(resource) ORDER BY resource", "version", "body")
        writes = rows(db, "SELECT * FROM business_writes ORDER BY seq")
    return {"reports": {r["resource"]: {"version": r["version"], "sha256": fingerprint(r["body"])} for r in reports},
            "business_writes": writes, "file_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def task_snapshot(path):
    with closing(database(path, read_only=True)) as db:
        return {"tasks": rows(db, "SELECT * FROM tasks ORDER BY task_id", "request"),
                "submissions": rows(db, "SELECT * FROM submissions ORDER BY seq"),
                "deliveries": rows(db, "SELECT * FROM deliveries ORDER BY task_id", "citations")}


def submit(path, request, transport, principal):
    digest = fingerprint(request)
    with closing(database(path)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        original = db.execute("SELECT task_id,args_sha256,status FROM tasks WHERE request_id=?", (request["request_id"],)).fetchone()
        if original is None:
            task_id, status, outcome = uuid4().hex, "ACCEPTED", "created"
            db.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?)", (task_id, request["request_id"], digest,
                                                                 json.dumps(request), principal, status))
        else:
            task_id, status = original["task_id"], original["status"]
            outcome = "reused" if original["args_sha256"] == digest else "conflict"
        db.execute("INSERT INTO submissions(transport_id,request_id,args_sha256,task_id,outcome) VALUES(?,?,?,?,?)",
                   (transport, request["request_id"], digest, task_id, outcome))
    return task_id, status, outcome


async def serve_resource(directory, fd):
    principal = load(HERE / "readonly-contract.json")["principal"]
    fields = ("task_id", "attempt_id", "resource")
    input_schema = {"type": "object", "required": list(fields), "additionalProperties": False,
                    "properties": {field: {"type": "string"} for field in fields}}

    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[types.Tool(name=TOOL, input_schema=input_schema)])

    async def call_tool(ctx, params):
        arguments = params.arguments or {}
        assert params.name == TOOL and set(arguments) == set(fields)
        task_id, attempt, resource = (arguments[field] for field in fields)
        with closing(database(directory / "reports.sqlite", read_only=True)) as reports:
            [(tenant, raw_version)] = reports.execute("SELECT tenant,version FROM catalog WHERE resource=?", (resource,)).fetchall()
            allowed = tenant == "A"
            # The server fixes the principal. The request only names the object and the attempt.
            if allowed:
                [(body,)] = reports.execute("SELECT body FROM bodies WHERE resource=?", (resource,)).fetchall()
            else:
                body = "{}"
        status = "success" if allowed else "denied"
        with closing(database(directory / "resource-audit.sqlite")) as audit, audit:
            audit.execute("INSERT INTO decisions(task_id,attempt_id,rpc_id,principal,tenant,action,resource,status,source_version,events)"
                          " VALUES(?,?,?,?,?,?,?,?,?,?)", (task_id, attempt, ctx.request_id, principal, tenant,
                                                         "read", resource, status, raw_version if allowed else "null", body))
            if allowed:
                audit.execute("INSERT INTO body_reads(task_id,attempt_id,resource) VALUES(?,?,?)", (task_id, attempt, resource))
        if not allowed:
            return types.CallToolResult(is_error=True, content=[types.TextContent(type="text", text="Report unavailable.")])
        data = {"resource": resource, "source_version": json.loads(raw_version), "events": json.loads(body)}
        return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(data))], structured_content=data)

    service = Server("infra-guide-read-reports", on_list_tools=list_tools, on_call_tool=call_tool)
    security = TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"], allowed_origins=[])
    manager = StreamableHTTPSessionManager(service, stateless=True, json_response=True, security_settings=security)

    async def asgi(scope, receive, send):
        await manager.handle_request(scope, receive, send)

    server = uvicorn.Server(uvicorn.Config(asgi, log_level="error", lifespan="off"))
    with socket.socket(fileno=fd) as listener, anyio.fail_after(35):
        async with manager.run(), anyio.create_task_group() as tasks:
            tasks.start_soon(server.serve, [listener])
            while not (directory / "resource.stop").exists():
                await anyio.sleep(0.01)
            server.should_exit = True


@contextmanager
def resource_service(directory):
    with (directory / "resource.stderr").open("wb") as log, socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        fd, port = listener.fileno(), listener.getsockname()[1]
        child = subprocess.Popen([sys.executable, "-B", __file__, "--output-dir", str(directory), "--resource-fd", str(fd)],
                                 pass_fds=(fd,), stdout=subprocess.DEVNULL, stderr=log)
        try:
            yield f"http://127.0.0.1:{port}/mcp", child.pid
        finally:
            stop = directory / "resource.stop"
            stop.touch()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
            stop.unlink()
    assert child.returncode == 0


async def read_reports(url, task_id, request, trace):
    async def observe(response):
        await response.aread()
        trace.append({"status": response.status_code, "protocol": response.request.headers["mcp-protocol-version"],
                      "request": json.loads(response.request.content), "response": response.json()})

    async with httpx2.AsyncClient(trust_env=False, timeout=5, event_hooks={"response": [observe]}) as http:
        async with streamable_http_client(url, http_client=http) as (incoming, outgoing):
            async with ClientSession(incoming, outgoing) as client:
                assert PROTOCOL in (await client.discover()).supported_versions
                assert [tool.name for tool in (await client.list_tools()).tools] == [TOOL]
                allowed = await client.call_tool(TOOL, {"task_id": task_id, "attempt_id": "a0", "resource": request["resource"]})
                denied = await client.call_tool(TOOL, {"task_id": task_id, "attempt_id": "a1", "resource": "reports-B"})
    assert denied.is_error and denied.structured_content is None
    assert not allowed.is_error and allowed.structured_content["source_version"] == request["source_version"]
    assert allowed.structured_content["resource"] == request["resource"]
    return allowed.structured_content["events"]


@contextmanager
def task_service(path, contract, mcp_url, mcp_trace):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _format, *args):
            pass

        def reply(self, status, result):
            body = json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path == "/tasks":
                request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                transport = self.headers["X-Lab-Transport"]
                expected = contract["request"]
                if (set(request) != set(expected) or any(not isinstance(value, str) for value in request.values())
                        or any(request[key] != expected[key] for key in expected if key != "source_version")):
                    self.reply(400, {"error": "invalid fixture request"})
                    return
                task_id, status, outcome = submit(path, request, transport, contract["principal"])
                if outcome == "created" and transport == "q0":
                    # The SQLite transaction closed before the socket was closed. No status line is sent.
                    self.close_connection = True
                    self.connection.shutdown(socket.SHUT_RDWR)
                elif outcome == "conflict":
                    self.reply(409, {"error": "request_digest_conflict"})
                else:
                    self.reply(202, {"task_id": task_id, "status": status})
                return

            if not self.path.startswith("/tasks/") or not self.path.endswith("/run"):
                self.reply(404, {})
                return
            task_id = self.path.split("/")[2]
            with closing(database(path)) as db, db:
                claimed = db.execute("UPDATE tasks SET status='RUNNING' WHERE task_id=? AND status='ACCEPTED'", (task_id,))
                if claimed.rowcount != 1:
                    self.reply(409, {"error": "task_not_accepted"})
                    return
                request = json.loads(db.execute("SELECT request FROM tasks WHERE task_id=?", (task_id,)).fetchone()[0])
            try:
                events = anyio.run(read_reports, mcp_url, task_id, request, mcp_trace)
            except Exception:
                with closing(database(path)) as db, db:
                    db.execute("UPDATE tasks SET status='FAILED' WHERE task_id=?", (task_id,))
                raise
            with closing(database(path)) as db, db:
                db.execute("INSERT INTO deliveries VALUES(?,?,?,?)", (task_id, request["delivery"], sum(events.values()),
                                                                     json.dumps(sorted(events))))
                db.execute("UPDATE tasks SET status='SUCCEEDED' WHERE task_id=?", (task_id,))
            self.reply(200, {"task_id": task_id, "status": "SUCCEEDED"})

        def do_GET(self):
            parts = self.path.split("/")
            with closing(database(path, read_only=True)) as db:
                if len(parts) == 3 and parts[1] == "tasks":
                    row = db.execute("SELECT task_id,status FROM tasks WHERE task_id=?", (parts[2],)).fetchone()
                elif len(parts) == 4 and parts[1] == "sessions":
                    row = db.execute("SELECT * FROM deliveries WHERE channel=? AND task_id=?", (parts[2], parts[3])).fetchone()
                else:
                    row = None
            if row is None:
                self.reply(404, {})
            else:
                result = dict(row)
                if "citations" in result:
                    result["citations"] = json.loads(result["citations"])
                self.reply(200, result)

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = Thread(target=server.serve_forever)
        thread.start()
        try:
            yield server.server_port
        finally:
            server.shutdown()
            thread.join(timeout=5)


def request_http(port, method, target, request=None, transport=None):
    headers = {"X-Lab-Transport": transport, "Content-Type": "application/json"} if transport else {}
    with closing(HTTPConnection("127.0.0.1", port, timeout=10)) as connection:
        connection.request(method, target, body=json.dumps(request) if request else None, headers=headers)
        try:
            response = connection.getresponse()
        except RemoteDisconnected:
            return {"method": method, "path": target, "transport_id": transport, "request": request,
                    "status": None, "error": "RemoteDisconnected"}
        return {"method": method, "path": target, "transport_id": transport, "request": request,
                "status": response.status, "response": json.loads(response.read())}


def verify_and_export(record, contract):
    client, task_after_lost, task_final, resource = (record[key] for key in ("client", "task_after_lost", "task_final", "resource"))
    expected = contract["request"]
    [task] = task_after_lost["tasks"]
    task_id, digest = task["task_id"], fingerprint(expected)
    assert len(task_id) == 32 and task_id != expected["request_id"]
    assert task == {"task_id": task_id, "request_id": "R1", "args_sha256": digest, "request": expected,
                    "principal": contract["principal"], "status": "ACCEPTED"}
    assert client[0]["request"] == client[1]["request"] == expected
    assert client[0]["status"] is None and client[0]["error"] == "RemoteDisconnected"
    assert client[1]["status"] == 202 and client[1]["response"] == {"task_id": task_id, "status": "ACCEPTED"}
    assert client[2]["status"] == 409 and client[2]["response"] == {"error": "request_digest_conflict"}
    changed = fingerprint(client[2]["request"])
    assert client[2]["request"] == {**expected, "source_version": "A-v2"} and changed != digest
    submissions = task_final["submissions"]
    assert submissions == [
        {"seq": seq, "transport_id": f"q{seq-1}", "request_id": "R1", "args_sha256": h, "task_id": task_id, "outcome": outcome}
        for seq, (h, outcome) in enumerate(((digest, "created"), (digest, "reused"), (changed, "conflict")), 1)
    ]
    assert task_after_lost["submissions"] == submissions[:1] and task_after_lost["deliveries"] == []
    assert task_final["tasks"] == [{**task, "status": "SUCCEEDED"}]
    [delivery] = task_final["deliveries"]
    assert delivery == {"task_id": task_id, "channel": expected["delivery"], "total": sum(contract["events"].values()),
                        "citations": sorted(contract["events"])}
    assert client[3]["status"] == client[4]["status"] == client[5]["status"] == 200
    assert client[3]["response"] == client[4]["response"] == {"task_id": task_id, "status": "SUCCEEDED"}
    assert client[5]["response"] == delivery and client[6]["status"] == 404

    assert resource["before"] == resource["after"] and resource["after"]["business_writes"] == []
    before_b = resource["before"]["reports"]["reports-B"]
    assert before_b == contract["B_before"]
    assert resource["body_reads"] == [{"seq": 1, "task_id": task_id, "attempt_id": "a0", "resource": "reports-A"}]
    assert [(row["request"]["method"], row["status"], row["protocol"]) for row in record["mcp"]] == [
        (method, 200, PROTOCOL) for method in ("server/discover", "tools/list", "tools/call", "tools/call")]
    allow, deny = record["mcp"][2:]
    for request, resource_id, attempt in ((allow, "reports-A", "a0"), (deny, "reports-B", "a1")):
        params = request["request"]["params"]
        assert params["name"] == TOOL and params["arguments"] == {"task_id": task_id, "attempt_id": attempt, "resource": resource_id}
        assert request["request"]["id"] == request["response"]["id"]
    assert allow["response"]["result"]["structuredContent"] == {
        "resource": "reports-A", "source_version": "A-v1", "events": contract["events"]}
    rejected = deny["response"]["result"]
    assert rejected["isError"] is True and "structuredContent" not in rejected
    assert rejected["content"] == [{"type": "text", "text": "Report unavailable."}]
    assert resource["decisions"] == [
        {"seq": seq, "task_id": task_id, "attempt_id": attempt, "rpc_id": rpc["request"]["id"],
         "principal": contract["principal"], "tenant": tenant, "action": "read", "resource": "reports-" + tenant,
         "status": status, "source_version": source_version, "events": events}
        for seq, (rpc, attempt, tenant, status, source_version, events) in enumerate([
            (allow, "a0", "A", "success", "A-v1", contract["events"]), (deny, "a1", "B", "denied", None, {})], 1)
    ]
    return {"format": "readonly-evidence-v1", "case_id": contract["case_id"], "source": "target_export", "target_version": TARGET,
            "submissions": [{**{key: row[key] for key in ("transport_id", "request_id", "args_sha256", "task_id")},
                             "ack": "lost" if client[index]["status"] is None else "received"}
                            for index, row in enumerate(submissions[:2])],
            "authoritative_task": client[4]["response"], "tool_receipts": resource["decisions"], "B_before": before_b,
            "B_after": resource["after"]["reports"]["reports-B"], "business_writes": resource["after"]["business_writes"], "delivery": delivery}


def run(directory, checker):
    contract = load(HERE / "readonly-contract.json")
    dependencies = {name: version(name) for name in ("mcp", "httpx2", "uvicorn")}
    assert dependencies == {"mcp": "2.3.0", "httpx2": "2.16.0", "uvicorn": "0.54.0"}
    directory.mkdir(parents=True, exist_ok=False)
    initialize(directory)
    path, mcp_trace = directory / "tasks.sqlite", []
    before = resource_snapshot(directory)
    with resource_service(directory) as (url, resource_pid), task_service(path, contract, url, mcp_trace) as port:
        request = contract["request"]
        client = [request_http(port, "POST", "/tasks", request, "q0")]
        task_after_lost = task_snapshot(path)
        client.append(request_http(port, "POST", "/tasks", request, "q1"))
        task_id = client[-1]["response"]["task_id"]
        client.append(request_http(port, "POST", "/tasks", {**request, "source_version": "A-v2"}, "q2"))
        task_url = f"/tasks/{task_id}"
        client.append(request_http(port, "POST", task_url + "/run"))
        client.append(request_http(port, "GET", task_url))
        client.append(request_http(port, "GET", f"/sessions/{request['delivery']}/{task_id}"))
        client.append(request_http(port, "GET", f"/sessions/other-session/{task_id}"))

    with closing(database(directory / "resource-audit.sqlite", read_only=True)) as db:
        resource = {"before": before, "after": resource_snapshot(directory),
                    "decisions": rows(db, "SELECT * FROM decisions ORDER BY seq", "source_version", "events"),
                    "body_reads": rows(db, "SELECT * FROM body_reads ORDER BY seq")}
    source_files = ("reconnect_lab.py", "readonly-contract.json", "resources.json", "requirements.txt", "README.md")
    record = {"schema": "agent-task-reconnect-v1", "status": "passed", "protocol": PROTOCOL,
              "environment": {"python": platform.python_version(), "platform": platform.system(), "architecture": platform.machine(),
                              "sqlite": sqlite3.sqlite_version, **dependencies}, "resource_pid": resource_pid,
              "fixture": {"request_id": request["request_id"], "channel": request["delivery"], "task_label": "T1", "total": 23},
              "client": client, "task_after_lost": task_after_lost, "task_final": task_snapshot(path),
              "mcp": mcp_trace, "resource": resource,
              "source_sha256": {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in source_files}}
    evidence = verify_and_export(record, contract)
    evidence_path = directory / "readonly-evidence.json"
    evidence_path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    record["g10"] = {"evidence": evidence, "checker": None, "checker_sha256": None}
    if checker:
        result = subprocess.run([sys.executable, "-B", str(checker), "--contract", str(HERE / "readonly-contract.json"),
                                 "--evidence", str(evidence_path)], check=True, capture_output=True, text=True, timeout=10)
        checked = json.loads(result.stdout)
        assert checked == {"status": "record_consistent", "errors": [], "provenance_verified": False, "source": "target_export"}
        record["g10"].update(checker=checked, checker_sha256=hashlib.sha256(checker.read_bytes()).hexdigest())
    (directory / "validation.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    print(json.dumps({"http": [row["status"] for row in client], "reports_read": [row["resource"] for row in resource["body_reads"]],
                      "task_id": task_id, "total": client[5]["response"]["total"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--checker", type=Path)
    parser.add_argument("--resource-fd", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.resource_fd is not None:
        anyio.run(serve_resource, args.output_dir.resolve(), args.resource_fd)
    else:
        run(args.output_dir.resolve(), args.checker.resolve() if args.checker else None)
