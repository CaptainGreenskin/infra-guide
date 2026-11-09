"""Native MCP stdio tools backed by one authoritative SQLite transaction.

The supervisor owns the synthetic identity, policy and approval records. They
are not model arguments. The operator CLI is a fixture bootstrap, not an
authentication service. --unsafe-snapshot is only a deliberate negative case.
"""

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
from jsonschema import ValidationError, validate
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.stdio import stdio_client
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server


PUBLISH = "publish_report"
LOOKUP = "get_receipt"
INTENT_KEYS = ("operation_id", "task_id", "resource", "source_version", "amount")
PROPERTIES = {name: {"type": "string", "minLength": 1, "maxLength": 80}
              for name in (*INTENT_KEYS[:-1], "approval_id")}
PROPERTIES["amount"] = {"type": "integer", "minimum": 0, "maximum": 1000}
SCHEMAS = {
    PUBLISH: {"type": "object", "properties": PROPERTIES,
              "required": list(PROPERTIES), "additionalProperties": False},
    LOOKUP: {"type": "object", "properties": {"operation_id": PROPERTIES["operation_id"]},
             "required": ["operation_id"], "additionalProperties": False},
}


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def connect(path):
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    return db


def intent_body(principal, arguments):
    return {**principal, "tool": PUBLISH, **{name: arguments[name] for name in INTENT_KEYS}}


def setup(db_path, source_path):
    if db_path.exists():
        raise FileExistsError("receiver already exists")
    source = json.loads(source_path.read_text())
    principal = source["fixture_principal"]
    with closing(connect(db_path)) as db:
        db.executescript("""
            PRAGMA journal_mode=WAL;
            CREATE TABLE trusted_context (
                subject TEXT, tenant TEXT, task_id TEXT, resource TEXT, source_version TEXT,
                logical_now INTEGER
            );
            CREATE TABLE policy (id INTEGER PRIMARY KEY, can_write INTEGER, can_read INTEGER, epoch INTEGER);
            CREATE TABLE approvals (
                approval_id TEXT PRIMARY KEY, intent_digest TEXT, expires INTEGER,
                write_at_approval INTEGER, approval_epoch INTEGER, used_by TEXT
            );
            CREATE TABLE reports (
                revision INTEGER PRIMARY KEY, operation_id TEXT UNIQUE, subject TEXT, tenant TEXT,
                task_id TEXT, resource TEXT, source_version TEXT, amount INTEGER, intent_digest TEXT
            );
            CREATE TABLE receipts (operation_id TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE events (
                seq INTEGER PRIMARY KEY, kind TEXT, tool TEXT, operation_id TEXT,
                policy_epoch INTEGER, can_write INTEGER, can_read INTEGER, outcome TEXT,
                server_pid INTEGER, rpc_request_id TEXT, arguments TEXT
            );
            INSERT INTO policy VALUES(1,1,1,1);
        """)
        db.execute("INSERT INTO trusted_context VALUES(?,?,?,?,?,?)",
                   (principal["subject"], principal["tenant"], source["task_id"],
                    source["resource"], source["source_version"], source["logical_now"]))
    return {"status": "initialized"}


def log_event(db, kind, tool, operation, policy, outcome, arguments, request_id=""):
    db.execute("INSERT INTO events(kind,tool,operation_id,policy_epoch,can_write,can_read,"
               "outcome,server_pid,rpc_request_id,arguments) VALUES(?,?,?,?,?,?,?,?,?,?)",
               (kind, tool, operation, policy["epoch"], policy["can_write"], policy["can_read"],
                outcome, os.getpid(), str(request_id), encoded(arguments)))


def approve(db_path, source_path):
    """The test operator approves exactly the authoritative synthetic input."""
    source = json.loads(source_path.read_text())
    arguments = {name: source[name] for name in INTENT_KEYS if name != "amount"}
    arguments["amount"] = sum(value for batch in source["batches"].values() for value in batch)
    value_digest = digest(intent_body(source["fixture_principal"], arguments))
    with closing(connect(db_path)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        policy = db.execute("SELECT * FROM policy").fetchone()
        if not policy["can_write"]:
            raise PermissionError("operator fixture cannot approve a disabled write")
        db.execute("INSERT INTO approvals VALUES(?,?,?,?,?,NULL)",
                   (source["approval_id"], value_digest, source["approval_expires"],
                    policy["can_write"], policy["epoch"]))
        log_event(db, "approval", "", arguments["operation_id"], policy, "approved", arguments)
    return {"approval_id": source["approval_id"], "intent_digest": value_digest}


def revoke(db_path, can_read):
    with closing(connect(db_path)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("UPDATE policy SET can_write=0,can_read=?,epoch=epoch+1", (int(can_read),))
        policy = db.execute("SELECT * FROM policy").fetchone()
        log_event(db, "policy_change", "", "", policy, "revoked", {})
        return dict(policy)


def publish(db, arguments, context, policy, unsafe_snapshot):
    principal = {key: context[key] for key in ("subject", "tenant")}
    value_digest = digest(intent_body(principal, arguments))
    approval = db.execute("SELECT * FROM approvals WHERE approval_id=?",
                          (arguments["approval_id"],)).fetchone()
    # The unsafe branch trusts a real old approval snapshot, after policy changed.
    may_write = (bool(approval and approval["write_at_approval"])
                 if unsafe_snapshot else bool(policy["can_write"]))
    if not may_write:
        return {"status": "denied"}
    if any(arguments[key] != context[key] for key in ("task_id", "resource", "source_version")):
        return {"status": "denied"}
    if (not approval or approval["intent_digest"] != value_digest
            or approval["expires"] < context["logical_now"]):
        return {"status": "approval_mismatch"}
    operation = arguments["operation_id"]
    existing = db.execute("SELECT body FROM receipts WHERE operation_id=?", (operation,)).fetchone()
    if existing:
        receipt = json.loads(existing[0])
        if receipt["intent_digest"] != value_digest:
            return {"status": "conflict"}
        return {"status": "replayed", "receipt": receipt}
    if approval["used_by"] is not None:
        return {"status": "approval_consumed"}
    revision = db.execute(
        "INSERT INTO reports(operation_id,subject,tenant,task_id,resource,source_version,amount,intent_digest) "
        "VALUES(?,?,?,?,?,?,?,?)",
        (operation, context["subject"], context["tenant"], arguments["task_id"], arguments["resource"],
         arguments["source_version"], arguments["amount"], value_digest),
    ).lastrowid
    receipt = {**intent_body(principal, arguments), "revision": revision, "intent_digest": value_digest}
    db.execute("INSERT INTO receipts VALUES(?,?)", (operation, encoded(receipt)))
    db.execute("UPDATE approvals SET used_by=? WHERE approval_id=?", (operation, arguments["approval_id"]))
    return {"status": "committed", "receipt": receipt}


def lookup(db, arguments, context, policy):
    # Check read permission before looking for a receipt; denial reveals no receipt.
    if not policy["can_read"]:
        return {"status": "denied"}
    row = db.execute("SELECT body FROM receipts WHERE operation_id=?", (arguments["operation_id"],)).fetchone()
    if row is None:
        return {"status": "absent"}
    receipt = json.loads(row[0])
    if any(receipt[key] != context[key] for key in ("subject", "tenant", "task_id", "resource")):
        return {"status": "denied"}
    return {"status": "found", "receipt": receipt}


def execute(db_path, tool, arguments, request_context, unsafe_snapshot):
    with closing(connect(db_path)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        context = db.execute("SELECT * FROM trusted_context").fetchone()
        policy = db.execute("SELECT * FROM policy").fetchone()
        result = (lookup(db, arguments, context, policy) if tool == LOOKUP
                  else publish(db, arguments, context, policy, unsafe_snapshot))
        log_event(db, "tool", tool, arguments["operation_id"], policy, result["status"],
                  arguments, request_context.request_id)
        # Approval consumption, effect, receipt and audit commit together here.
    return result


async def serve(db_path, unsafe_snapshot):
    async def list_tools(context, params):
        return types.ListToolsResult(tools=[
            types.Tool(name=name, description=description, input_schema=SCHEMAS[name])
            for name, description in ((PUBLISH, "Publish one synthetic report with current permission."),
                                      (LOOKUP, "Read an existing receipt with independent read permission."))
        ])

    async def call_tool(context: ServerRequestContext, params):
        if params.name not in SCHEMAS:
            result = {"status": "unknown_tool"}
        else:
            try:
                validate(params.arguments, SCHEMAS[params.name])
            except ValidationError:
                result = {"status": "invalid_arguments"}
            else:
                result = execute(db_path, params.name, params.arguments, context, unsafe_snapshot)
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=encoded(result))], structured_content=result,
            is_error=result["status"] not in {"committed", "replayed", "found", "absent"},
        )

    server = Server("approval-reentry-receiver", version="1", on_list_tools=list_tools, on_call_tool=call_tool)
    async with stdio_server() as streams:
        await server.run(*streams, server.create_initialization_options())


async def call(db_path, tool, arguments, unsafe_snapshot):
    args = ["-B", str(Path(__file__).resolve()), "serve", "--db", str(db_path)]
    if unsafe_snapshot:
        args.append("--unsafe-snapshot")
    server = StdioServerParameters(command=sys.executable, args=args)
    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write, read_timeout_seconds=8) as session:
            await session.discover()
            advertised = [item.name for item in (await session.list_tools()).tools]
            if advertised != [PUBLISH, LOOKUP]:
                raise RuntimeError("unexpected tool contract")
            response = await session.call_tool(tool, arguments)
            result = response.structured_content
            if result is None or len(response.content) != 1 or response.content[0].text != encoded(result):
                raise RuntimeError("inconsistent tool representations")
            observed = {"mcp_version": version("mcp"), "python": sys.version.split()[0],
                        "tool": tool, "is_error": response.is_error,
                        "text_content": response.content[0].text, "result": result}
    return observed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["init", "approve", "revoke", "serve", "call"])
    parser.add_argument("--db", required=True, type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--tool", choices=[PUBLISH, LOOKUP])
    parser.add_argument("--arguments", type=json.loads)
    parser.add_argument("--read", type=int, choices=[0, 1], default=1)
    parser.add_argument("--unsafe-snapshot", action="store_true")
    args = parser.parse_args()
    if args.mode in {"init", "approve"} and args.source is None:
        parser.error("operator bootstrap requires --source")
    if args.mode == "serve":
        anyio.run(serve, args.db, args.unsafe_snapshot)
        return
    if args.mode == "init":
        result = setup(args.db, args.source)
    elif args.mode == "approve":
        result = approve(args.db, args.source)
    elif args.mode == "revoke":
        result = revoke(args.db, args.read)
    else:
        if args.tool is None or args.arguments is None:
            parser.error("call requires --tool and --arguments")
        result = anyio.run(call, args.db, args.tool, args.arguments, args.unsafe_snapshot)
    print(encoded(result))


if __name__ == "__main__":
    main()
