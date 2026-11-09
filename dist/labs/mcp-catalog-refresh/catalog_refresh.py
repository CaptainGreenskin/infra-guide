"""Compare stale and refreshed MCP tool catalogs using stdio and SQLite."""
import argparse
from contextlib import closing
from hashlib import sha256
from importlib.metadata import version
import json
from pathlib import Path
import platform
import sqlite3
import sys
from tempfile import TemporaryDirectory

import anyio
from jsonschema import ValidationError, validate
from mcp import types
from mcp.client import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.subscriptions import listen
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.server.subscriptions import InMemorySubscriptionBus, ListenHandler, ToolsListChanged

ROOT = Path(__file__).resolve().parent
PUBLISH = "publish_report"
PREVIEW = "preview_report"
SWITCH = "lab_switch_catalog"
META = "guide.example/expectedContract"
REPORT = {"report_id": "report-A"}
TOTAL = 42


def schema(properties, required=()):
    return {"type": "object", "properties": properties, "required": list(required),
            "additionalProperties": False}


def publish_tool(revision):
    default = "archive" if revision == 1 else "shared"
    fields = {"report_id": {"const": REPORT["report_id"]}}
    if revision == 2:
        fields["destination"] = {"enum": ["archive", "shared"], "default": default}
    return types.Tool(name=PUBLISH, description=f"Publish a report. Default destination: {default}.",
                      input_schema=schema(fields, ["report_id"]),
                      output_schema=schema({"destination": {"type": "string"}, "total": {"type": "integer"}},
                                           ["destination", "total"]))


def contract(tool):
    return tool.model_dump(by_alias=True, exclude_none=True,
                           include={"name", "description", "input_schema", "output_schema"})


def fingerprint(payload):
    return sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def approval(tool, arguments):
    return {"contract": fingerprint(contract(tool)), "arguments": dict(arguments)}


async def dispatch_approved(session, current_tool, approved):
    current_contract = fingerprint(contract(current_tool))
    if approved["contract"] != current_contract:
        return None
    return await session.call_tool(current_tool.name, approved["arguments"], meta={META: current_contract})


def result(data=None, error=None):
    return types.CallToolResult(content=[types.TextContent(type="text", text=error or json.dumps(data))],
                                structured_content=data, is_error=error is not None)


async def serve(ledger, mode):
    bus = InMemorySubscriptionBus()
    revision = 1
    with closing(sqlite3.connect(ledger)) as db:
        db.execute("CREATE TABLE writes (report_id TEXT, destination TEXT, total INTEGER, revision INTEGER)")

        async def list_tools(context, params):
            tools = [publish_tool(revision), types.Tool(name=SWITCH, input_schema=schema({}))]
            if revision == 2:
                tools.append(types.Tool(name=PREVIEW, input_schema=schema({"report_id": {"const": "report-A"}}, ["report_id"])))
            return types.ListToolsResult(tools=tools)

        async def call_tool(context, params):
            nonlocal revision
            if params.name == SWITCH and not params.arguments and revision == 1:
                revision = 2
                await bus.publish(ToolsListChanged())
                return result({"revision": revision})
            arguments = params.arguments or {}
            if params.name == PREVIEW and revision == 2 and arguments == REPORT:
                return result({"destination": "shared", "total": TOTAL})
            if params.name != PUBLISH:
                return result(error="unknown or invalid tool")
            current = publish_tool(revision)
            try:
                validate(arguments, current.input_schema)
            except ValidationError:
                return result(error="invalid arguments")
            current_hash = fingerprint(contract(current))
            if mode == "guarded" and (params.meta or {}).get(META) != current_hash:
                return result(error="stale contract")
            destination = arguments.get("destination", "archive" if revision == 1 else "shared")
            with db:
                db.execute("INSERT INTO writes VALUES (?, ?, ?, ?)", (arguments["report_id"], destination, TOTAL, revision))
            return result({"destination": destination, "total": TOTAL})

        server = Server("infra-guide-catalog", on_list_tools=list_tools, on_call_tool=call_tool,
                        on_subscriptions_listen=ListenHandler(bus))
        async with stdio_server() as streams:
            await server.run(*streams, server.create_initialization_options())


class Observe:
    """Record the protocol envelopes received or sent through the actual SDK stream."""
    def __init__(self, stream, trace, direction):
        self.stream = stream
        self.trace = trace
        self.direction = direction

    @property
    def last_context(self):
        return getattr(self.stream, "last_context", None)

    def record(self, item):
        if hasattr(item, "message"):
            self.trace.append({"direction": self.direction,
                               "message": item.message.model_dump(by_alias=True, exclude_none=True)})

    async def send(self, item):
        self.record(item)
        await self.stream.send(item)

    async def receive(self):
        item = await self.stream.receive()
        self.record(item)
        return item

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return await self.receive()
        except anyio.EndOfStream:
            raise StopAsyncIteration

    async def aclose(self):
        await self.stream.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        await self.aclose()


def writes(ledger):
    with closing(sqlite3.connect(ledger)) as db:
        return db.execute("SELECT report_id, destination, total, revision FROM writes ORDER BY rowid").fetchall()


async def run_case(folder, mode):
    ledger = folder / f"{mode}.sqlite"
    trace = []
    parameters = StdioServerParameters(command=sys.executable,
                                      args=[str(Path(__file__).resolve()), "--serve", str(ledger), "--mode", mode])
    async with stdio_client(parameters) as (incoming, outgoing):
        async with ClientSession(Observe(incoming, trace, "in"), Observe(outgoing, trace, "out"),
                                 read_timeout_seconds=5) as session:
            discovery = await session.discover()
            assert discovery.capabilities.tools.list_changed
            async with listen(session, tools_list_changed=True) as subscription:
                assert subscription.honored.tools_list_changed
                listed = {tool.name: tool for tool in (await session.list_tools()).tools}
                assert set(listed) == {PUBLISH, SWITCH}
                approved_v1 = approval(listed[PUBLISH], REPORT)
                switched = await session.call_tool(SWITCH, {})
                assert switched.structured_content == {"revision": 2}
                with anyio.fail_after(5):
                    changed = await anext(subscription)
                assert isinstance(changed, ToolsListChanged)

                if mode == "unsafe":
                    unsafe = await session.call_tool(PUBLISH, approved_v1["arguments"])
                    assert not unsafe.is_error
                    assert unsafe.structured_content == {"destination": "shared", "total": TOTAL}
                    assert writes(ledger) == [("report-A", "shared", TOTAL, 2)]
                    return {"approval_v1": approved_v1, "writes": writes(ledger), "trace": trace}

                refreshed = {tool.name: tool for tool in (await session.list_tools()).tools}
                assert set(refreshed) == {PUBLISH, SWITCH, PREVIEW}
                host_rejected = await dispatch_approved(session, refreshed[PUBLISH], approved_v1) is None
                assert host_rejected and writes(ledger) == []
                outgoing_before_bypass = sum(row["direction"] == "out"
                    and row["message"].get("params", {}).get("name") == PUBLISH for row in trace)
                stale = await session.call_tool(PUBLISH, approved_v1["arguments"],
                                                meta={META: approved_v1["contract"]})
                assert stale.is_error and stale.content[0].text == "stale contract" and writes(ledger) == []
                preview = await session.call_tool(PREVIEW, REPORT)
                assert preview.structured_content == {"destination": "shared", "total": TOTAL} and writes(ledger) == []
                # Fixed test approval after preview, with the destination made explicit.
                approved_v2 = approval(refreshed[PUBLISH], {**REPORT, "destination": "shared"})
                final = await dispatch_approved(session, refreshed[PUBLISH], approved_v2)
                assert not final.is_error and final.structured_content == preview.structured_content
                assert writes(ledger) == [("report-A", "shared", TOTAL, 2)]
                return {"approval_v1": approved_v1, "approval_v2": approved_v2,
                        "host_rejected": host_rejected, "outgoing_before_bypass": outgoing_before_bypass,
                        "writes": writes(ledger), "trace": trace}


async def observe(folder):
    return {mode: await run_case(folder, mode) for mode in ("unsafe", "guarded")}


def record(folder):
    cases = anyio.run(observe, folder)
    return {"status": "passed", "environment": {"python": platform.python_version(),
            "mcp": version("mcp"), "sqlite": sqlite3.sqlite_version},
            "source_sha256": {name: sha256((ROOT / name).read_bytes()).hexdigest()
                              for name in ("catalog_refresh.py", "requirements.txt")},
            "artifact_sha256": {f"{mode}.sqlite": sha256((folder / f"{mode}.sqlite").read_bytes()).hexdigest()
                                for mode in cases},
            "cases": cases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--serve", type=Path)
    parser.add_argument("--mode", choices=["unsafe", "guarded"])
    parser.add_argument("--output-dir", type=Path, help="Save the SQLite effects in a new directory.")
    args = parser.parse_args()
    if args.serve is not None:
        anyio.run(serve, args.serve, args.mode)
    else:
        if args.output_dir:
            args.output_dir.mkdir()
            evidence = record(args.output_dir)
        else:
            with TemporaryDirectory() as tmp:
                evidence = record(Path(tmp))
        print(json.dumps(evidence, indent=2))
