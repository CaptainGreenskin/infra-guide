"""Exercise two independent authorization checks on actual MCP Streamable HTTP."""

import argparse
from contextlib import closing
import hashlib
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
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import httpx2
import jwt
import uvicorn
from mcp import ClientSession, types
from mcp.client.streamable_http import streamable_http_client
from mcp.server import Server
from mcp.server.auth.middleware.auth_context import AuthContextMiddleware, get_access_token
from mcp.server.auth.middleware.bearer_auth import BearerAuthBackend, RequireAuthMiddleware
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.routes import create_protected_resource_routes
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl
from starlette.applications import Starlette
from starlette.middleware.authentication import AuthenticationMiddleware
from starlette.routing import Route


HERE = Path(__file__).resolve().parent
SOURCE = json.loads((HERE / "orders.json").read_text())
REPORT_A = SOURCE["task_id"]
REPORT_B = "report-B"
OWNERS = {REPORT_A: "tenant-A", REPORT_B: "tenant-B"}
SUBJECT = "learner-A"
ISSUER = "https://fixture-issuer.invalid"
SCOPE = "report.read"
PROTOCOL = "2026-07-28"
TOOL = "read_order_report"
ARTIFACTS = ("server.jsonl", "client.jsonl", "reports.sqlite")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def emit(log_path, event, **fields):
    with log_path.open("a", encoding="utf-8") as out:
        out.write(json.dumps({"event": event, **fields}, ensure_ascii=False) + "\n")


def initialize_reports(path):
    with closing(sqlite3.connect(path)) as db, db:
        db.execute("CREATE TABLE reports(report_id TEXT PRIMARY KEY, tenant TEXT, version INTEGER, source_json TEXT)")
        db.executemany("INSERT INTO reports VALUES(?,?,?,?)", [
            (REPORT_A, OWNERS[REPORT_A], SOURCE["version"], json.dumps(SOURCE["batches"])),
            (REPORT_B, OWNERS[REPORT_B], 1, json.dumps({"base": [9999]})),
        ])


class FixtureTokenVerifier:
    def __init__(self, public_key, log):
        self.public_key = public_key
        self.log = log

    async def verify_token(self, token):
        try:
            # The SDK backend performs the audience check after the signature and issuer checks.
            claims = jwt.decode(token, self.public_key, algorithms=["RS256"], issuer=ISSUER,
                                options={"verify_aud": False, "require": ["iss", "sub", "aud", "exp", "scope", "client_id"]})
        except jwt.InvalidTokenError:
            emit(self.log, "token_rejected")
            return None
        emit(self.log, "token_verified", issuer=claims["iss"], audience=claims["aud"],
             subject=claims["sub"], scopes=claims["scope"].split())
        return AccessToken(token=token, client_id=claims["client_id"], scopes=claims["scope"].split(),
                           expires_at=claims["exp"], resource=claims["aud"], subject=claims["sub"])


async def serve(output):
    log, database = output / "server.jsonl", output / "reports.sqlite"
    initialize_reports(database)
    before_sha = digest(database)
    public_key = (output / "fixture-public.pem").read_bytes()

    async def list_tools(_ctx, _params):
        return types.ListToolsResult(tools=[types.Tool(
            name=TOOL,
            description="Read one order report by ID when the verified principal is allowed to read it.",
            input_schema={"type": "object", "properties": {"report_id": {"type": "string"}},
                          "required": ["report_id"], "additionalProperties": False},
            output_schema={"type": "object", "properties": {"report_id": {"type": "string"},
                           "source_version": {"type": "integer"}, "total": {"type": "integer"}},
                           "required": ["report_id", "source_version", "total"], "additionalProperties": False},
            annotations=types.ToolAnnotations(read_only_hint=True, destructive_hint=False, open_world_hint=False))])

    async def call_tool(ctx, params):
        arguments = params.arguments or {}
        report = arguments.get("report_id")
        if params.name != TOOL or set(arguments) != {"report_id"} or not isinstance(report, str):
            return types.CallToolResult(is_error=True, content=[types.TextContent(type="text", text="Provide a report ID.")])
        subject = get_access_token().subject
        tenant = {SUBJECT: "tenant-A"}.get(subject)
        if tenant is None or OWNERS.get(report) != tenant:
            # The request names the report. Tenant membership comes from the verified subject.
            emit(log, "object_denied", request_id=ctx.request_id, subject=subject, report_id=report)
            return types.CallToolResult(is_error=True, content=[types.TextContent(type="text", text="Report unavailable.")])

        with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as db:
            source_version, raw = db.execute(
                "SELECT version, source_json FROM reports WHERE report_id=? AND tenant=?", (report, tenant)
            ).fetchone()
        batches = json.loads(raw)
        result = {"report_id": report, "source_version": source_version,
                  "total": sum(value for batch in batches.values() for value in batch)}
        emit(log, "body_read", request_id=ctx.request_id, subject=subject, tenant=tenant, batches=list(batches), **result)
        return types.CallToolResult(content=[types.TextContent(type="text", text=json.dumps(result))],
                                    structured_content=result)

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        base = f"http://127.0.0.1:{listener.getsockname()[1]}"
        resource = AnyHttpUrl(base + "/mcp")
        metadata = AnyHttpUrl(base + "/.well-known/oauth-protected-resource/mcp")
        rpc = Server("order_report_mcp", on_list_tools=list_tools, on_call_tool=call_tool)
        manager = StreamableHTTPSessionManager(
            rpc, stateless=True, json_response=True,
            security_settings=TransportSecuritySettings(allowed_hosts=["127.0.0.1:*"]))
        verifier = FixtureTokenVerifier(public_key, log)
        endpoint = AuthenticationMiddleware(
            AuthContextMiddleware(RequireAuthMiddleware(manager.handle_request, [SCOPE], metadata)),
            BearerAuthBackend(verifier, resource_server_url=resource))
        app = Starlette(routes=[
            *create_protected_resource_routes(resource, [AnyHttpUrl(ISSUER)], [SCOPE]),
            Route("/mcp", endpoint=endpoint, methods=["POST"]),
        ])

        async def observed_http(scope, receive, send):
            headers = dict(scope["headers"])
            case = headers.get(b"x-lab-case", b"").decode()
            emit(log, "http_request", case=case, method=scope["method"], path=scope["path"],
                 credential_present=b"authorization" in headers, protocol=headers.get(b"mcp-protocol-version", b"").decode(),
                 rpc_method=headers.get(b"mcp-method", b"").decode())

            request_bytes = bytearray()

            async def observed_receive():
                message = await receive()
                if message["type"] == "http.request":
                    request_bytes.extend(message.get("body", b""))
                    if request_bytes and not message.get("more_body"):
                        emit(log, "rpc_request_body", case=case, body=json.loads(request_bytes))
                return message

            async def observed_send(message):
                await send(message)
                if message["type"] == "http.response.start":
                    response_headers = dict(message["headers"])
                    emit(log, "http_response", case=case, status=message["status"],
                         challenge=response_headers.get(b"www-authenticate", b"").decode(),
                         content_type=response_headers.get(b"content-type", b"").decode())
                elif message["type"] == "http.response.body" and message.get("body"):
                    emit(log, "http_response_body", case=case, body=message["body"].decode("utf-8"))

            await app(scope, observed_receive, observed_send)

        server = uvicorn.Server(uvicorn.Config(observed_http, lifespan="off", log_level="error"))
        async with manager.run(), anyio.create_task_group() as tasks:
            tasks.start_soon(server.serve, [listener])
            with anyio.fail_after(20):
                while not server.started:
                    await anyio.sleep(0.01)
                emit(log, "server_ready", pid=os.getpid(), resource=str(resource), reports_sha256=before_sha)
                ready = output / "resource.tmp"
                ready.write_text(str(resource))
                ready.replace(output / "resource")
                while not (output / "stop").exists():
                    await anyio.sleep(0.01)
                server.should_exit = True
    emit(log, "server_stopped", pid=os.getpid(), reports_sha256=digest(database))


def make_token(private_key, audience, scope):
    return jwt.encode({"iss": ISSUER, "aud": audience, "scope": scope, "sub": SUBJECT,
                       "client_id": "fixture-host", "exp": int(time.time()) + 90}, private_key, algorithm="RS256")


async def exercise(resource, key, log):
    ready_token = make_token(key, resource, SCOPE)
    cases = [
        ("missing_token", None, 401, "invalid_token"),
        ("wrong_audience", make_token(key, "https://wrong-audience.invalid/mcp", SCOPE), 401, "invalid_token"),
        ("wrong_scope", make_token(key, resource, "report.write"), 403, "insufficient_scope"),
    ]
    raw_request = {"jsonrpc": "2.0", "id": 1, "method": "server/discover", "params": {"_meta": {
        "io.modelcontextprotocol/protocolVersion": PROTOCOL,
        "io.modelcontextprotocol/clientInfo": {"name": "fixture-host", "version": "1"},
        "io.modelcontextprotocol/clientCapabilities": {},
    }}}
    async with httpx2.AsyncClient(trust_env=False, timeout=5) as http:
        for case, token, status, code in cases:
            headers = {"X-Lab-Case": case, "Mcp-Protocol-Version": PROTOCOL,
                       "Mcp-Method": "server/discover", "Accept": "application/json, text/event-stream"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            response = await http.post(resource, headers=headers, json=raw_request)
            challenge = response.headers["www-authenticate"]
            emit(log, "ingress_result", case=case, status=response.status_code, challenge=challenge, body=response.json())
            assert response.status_code == status and response.json()["error"] == code
            if case == "missing_token":
                metadata_url = re.search(r'resource_metadata="([^"]+)"', challenge)[1]
                assert metadata_url == resource.removesuffix("/mcp") + "/.well-known/oauth-protected-resource/mcp"
                metadata = await http.get(metadata_url, headers={"X-Lab-Case": "metadata"})
                emit(log, "metadata_result", status=metadata.status_code, body=metadata.json())
                assert metadata.status_code == 200 and metadata.json()["resource"] == resource

    for case, report in (("wrong_tenant", REPORT_B), ("allowed", REPORT_A)):
        headers = {"X-Lab-Case": case, "Authorization": f"Bearer {ready_token}"}
        async with httpx2.AsyncClient(headers=headers, trust_env=False, timeout=5) as http:
            async with streamable_http_client(resource, http_client=http) as (incoming, outgoing):
                async with ClientSession(incoming, outgoing) as client:
                    assert PROTOCOL in (await client.discover()).supported_versions
                    assert [tool.name for tool in (await client.list_tools()).tools] == [TOOL]
                    result = await client.call_tool(TOOL, {"report_id": report})
                    observed = result.model_dump(by_alias=True, exclude_none=True)
                    emit(log, "tool_result", case=case, report_id=report, result=observed)
                    if case == "wrong_tenant":
                        assert result.is_error and result.structured_content is None
                    else:
                        total = sum(value for batch in SOURCE["batches"].values() for value in batch)
                        assert not result.is_error and result.structured_content == {
                            "report_id": report, "source_version": SOURCE["version"], "total": total}


async def run(output):
    output.mkdir(parents=True, exist_ok=False)
    dependencies = {name: version(name) for name in ("mcp", "uvicorn", "httpx2", "PyJWT", "cryptography")}
    assert dependencies == {"mcp": "2.3.0", "uvicorn": "0.54.0", "httpx2": "2.16.0",
                            "PyJWT": "2.15.1", "cryptography": "50.0.2"}
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_path = output / "fixture-public.pem"
    public_path.write_bytes(private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
    ready = output / "resource"
    stop = output / "stop"
    with (output / "server.stderr").open("wb") as stderr:
        child = subprocess.Popen([sys.executable, "-B", __file__, "--serve", "--output-dir", str(output)],
                                 stdout=subprocess.DEVNULL, stderr=stderr)
        try:
            with anyio.fail_after(12):
                while not ready.exists():
                    if child.poll() is not None:
                        raise RuntimeError(f"server exited early: {child.returncode}")
                    await anyio.sleep(0.01)
                await exercise(ready.read_text(), private, output / "client.jsonl")
        finally:
            stop.touch()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)
            public_path.unlink()
            ready.unlink(missing_ok=True)
            stop.unlink()
    assert child.returncode == 0
    server = [json.loads(line) for line in (output / "server.jsonl").read_text().splitlines()]
    assert server[0]["pid"] == server[-1]["pid"] == child.pid
    assert server[0]["reports_sha256"] == server[-1]["reports_sha256"] == digest(output / "reports.sqlite")
    assert [row["report_id"] for row in server if row["event"] == "body_read"] == [REPORT_A]
    summary = {"metadata": 200, "missing_token": 401, "wrong_audience": 401, "wrong_scope": 403,
               "wrong_tenant": "tool_denied", "allowed_total": 42, "body_reads": 1}
    sources = ("authorization_lab.py", "orders.json", "requirements.txt", "README.md")
    record = {"schema": "mcp-http-authorization-v1", "status": "passed", "protocol": PROTOCOL,
              "environment": {"python": platform.python_version(), "platform": platform.system(), **dependencies},
              "client_pid": os.getpid(), "server_pid": child.pid, "server_exit": child.returncode, "summary": summary,
              "source_sha256": {name: digest(HERE / name) for name in sources},
              "artifact_sha256": {name: digest(output / name) for name in ARTIFACTS}}
    (output / "validation.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--serve", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    anyio.run(serve if args.serve else run, args.output_dir.resolve())
