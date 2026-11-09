"""Use the pinned MCP SDK on stdio, with a separate SQLite effect transaction."""

import argparse
from contextlib import closing
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import sqlite3
import sys

import anyio
from jsonschema import validate
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server


TOOL = "publish_report"
INPUT = {
    "type": "object",
    "properties": {
        "operation_id": {"type": "string", "minLength": 1},
        "task_id": {"type": "string", "minLength": 1},
        "source_version": {"type": "string", "minLength": 1},
        "amount": {"type": "integer"},
    },
    "required": ["operation_id", "task_id", "source_version", "amount"],
    "additionalProperties": False,
}


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def commit(db_path, arguments, context):
    """An append-only receiver: receipt and report commit in one transaction."""
    operation = arguments["operation_id"]
    body = {name: arguments[name] for name in ("task_id", "source_version", "amount")}
    digest = hashlib.sha256(encode(body).encode()).hexdigest()
    with closing(sqlite3.connect(db_path)) as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS reports (
                revision INTEGER PRIMARY KEY, operation_id TEXT UNIQUE NOT NULL,
                task_id TEXT NOT NULL, source_version TEXT NOT NULL, amount INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS receipts (
                operation_id TEXT PRIMARY KEY, body_digest TEXT NOT NULL, body TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY, operation_id TEXT NOT NULL, server_pid INTEGER NOT NULL,
                rpc_request_id TEXT NOT NULL, protocol TEXT NOT NULL, outcome TEXT NOT NULL
            );
        """)
        with db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute(
                "SELECT body_digest,body FROM receipts WHERE operation_id=?", (operation,)
            ).fetchone()
            if old is None:
                revision = db.execute(
                    "INSERT INTO reports(operation_id,task_id,source_version,amount) VALUES(?,?,?,?)",
                    (operation, body["task_id"], body["source_version"], body["amount"]),
                ).lastrowid
                receipt = dict(body, operation_id=operation, revision=revision, body_digest=digest)
                db.execute("INSERT INTO receipts VALUES(?,?,?)", (operation, digest, encode(receipt)))
                outcome = "committed"
            elif old[0] == digest:
                receipt = json.loads(old[1])
                outcome = "replayed"
            else:
                receipt = None
                outcome = "conflict"
            db.execute(
                "INSERT INTO attempts(operation_id,server_pid,rpc_request_id,protocol,outcome) "
                "VALUES(?,?,?,?,?)",
                (operation, os.getpid(), str(context.request_id), context.protocol_version, outcome),
            )
    return receipt


async def serve(db_path):
    async def list_tools(context, params):
        return types.ListToolsResult(tools=[
            types.Tool(name=TOOL, description="Append a local synthetic report.", input_schema=INPUT)
        ])

    async def call_tool(context: ServerRequestContext, params):
        if params.name != TOOL:
            return types.CallToolResult(
                content=[types.TextContent(type="text", text="unknown tool")], is_error=True
            )
        validate(params.arguments, INPUT)
        receipt = commit(db_path, params.arguments, context)
        text = encode(receipt) if receipt is not None else "operation ID has different payload"
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=text)],
            structured_content=receipt,
            is_error=receipt is None,
        )

    server = Server("mcp-recovery-receiver", version="1", on_list_tools=list_tools, on_call_tool=call_tool)
    async with stdio_server() as streams:
        await server.run(*streams, server.create_initialization_options())


async def call(db_path, arguments):
    server = StdioServerParameters(
        command=sys.executable,
        args=["-B", str(Path(__file__).resolve()), "serve", "--db", str(db_path)],
    )
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=5) as session:
            await session.discover()
            advertised = [tool.name for tool in (await session.list_tools()).tools]
            if advertised != [TOOL]:
                raise RuntimeError("unexpected advertised tools")
            response = await session.call_tool(TOOL, arguments)
            observed = {
                "mcp_version": version("mcp"),
                "python": sys.version.split()[0],
                "advertised_tools": advertised,
                "is_error": response.is_error,
                "receipt": response.structured_content,
            }
    if observed["is_error"] or observed["receipt"] is None:
        raise RuntimeError("tool did not return a successful receipt")
    return observed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["serve", "call"])
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--arguments", type=json.loads)
    args = parser.parse_args()
    if args.mode == "serve":
        anyio.run(serve, args.db)
    else:
        if args.arguments is None:
            parser.error("call requires --arguments")
        print(encode(anyio.run(call, args.db, args.arguments)))


if __name__ == "__main__":
    main()
