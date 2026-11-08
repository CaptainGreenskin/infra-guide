"""Read-only MCP server: official mcp==2.3.0, real stdio, no model or HTTP.

stdout belongs to the protocol. Evidence is written to an explicit JSONL file.
This teaching server trusts its local launcher; it implements no authentication.
"""
import argparse
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path

import anyio
from jsonschema import validate, ValidationError
from mcp import MCPError, types
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--events", type=Path, required=True)
    parser.add_argument("--wrong-total", action="store_true", help="Intentional semantic error for the independent oracle")
    args = parser.parse_args()
    fixture = json.loads(args.fixture.read_text())

    def event(kind, **body):
        with args.events.open("a", encoding="utf8") as output:
            output.write(json.dumps({"event": kind, **body}, ensure_ascii=False) + "\n")

    batch_schema = {"type": "object", "properties": {"task_id": {"type": "string"}, "batch_id": {"type": "string"}},
                    "required": ["task_id", "batch_id"], "additionalProperties": False}
    scan_schema = {"type": "object", "properties": {"task_id": {"type": "string"}, "batch_ids": {"type": "array", "items": {"type": "string"}, "minItems": 1}},
                   "required": ["task_id", "batch_ids"], "additionalProperties": False}
    schemas = {"read_batch": batch_schema, "scan_batches": scan_schema, "watch_batch": batch_schema}
    descriptions = {"read_batch": "Read one fixed order batch.", "scan_batches": "Read several batches with progress.",
                    "watch_batch": "Open a local source and wait until cancelled; demonstration only."}
    output_schema = {"type": "object", "properties": {
        "task_id": {"type": "string"}, "version": {"type": "integer"},
        "batch_ids": {"type": "array", "items": {"type": "string"}},
        "values": {"type": "array", "items": {"type": "integer"}}, "total": {"type": "integer"}},
        "required": ["task_id", "version", "batch_ids", "values", "total"], "additionalProperties": False}

    def result(data=None, error=None):
        return types.CallToolResult(content=[types.TextContent(type="text", text=error or json.dumps(data, ensure_ascii=False))],
                                    structured_content=data, is_error=error is not None)

    @asynccontextmanager
    async def lifespan(server):
        event("server_started", pid=os.getpid())
        try:
            yield None
        finally:
            event("server_stopped")

    async def list_tools(ctx: ServerRequestContext, params):
        event("list_tools", request_id=ctx.request_id, protocol=ctx.protocol_version)
        return types.ListToolsResult(tools=[types.Tool(name=name, description=descriptions[name], input_schema=schema,
                                                      output_schema=output_schema)
                                           for name, schema in schemas.items()])

    async def call_tool(ctx: ServerRequestContext, params):
        name, arguments = params.name, params.arguments or {}
        event("call_received", name=name, request_id=ctx.request_id, protocol=ctx.protocol_version)
        if name not in schemas:
            raise MCPError(-32602, "Unknown tool: " + name)
        try:
            validate(arguments, schemas[name])
        except ValidationError:
            event("input_rejected", name=name)
            return result(error="Arguments do not match the advertised JSON Schema")
        if arguments["task_id"] != fixture["task_id"]:
            event("business_rejected", name=name)
            return result(error="The requested task does not exist")
        batch_ids = arguments.get("batch_ids", [arguments.get("batch_id")])
        if any(batch not in fixture["batches"] for batch in batch_ids):
            event("business_rejected", name=name)
            return result(error="The requested batch does not exist")
        if name == "watch_batch":
            try:
                with args.fixture.open("rb") as resource:
                    resource.read(1)
                    event("watch_opened", request_id=ctx.request_id)
                    try:
                        await ctx.session.report_progress(1, total=2, message="local source opened")
                        await anyio.sleep_forever()
                    except anyio.get_cancelled_exc_class():
                        event("watch_cancelled", request_id=ctx.request_id)
                        raise
            finally:
                event("watch_cleanup", request_id=ctx.request_id, file_closed=resource.closed)
        values = []
        for index, batch in enumerate(batch_ids, 1):
            values.extend(fixture["batches"][batch])
            if name == "scan_batches":
                await ctx.session.report_progress(index, total=len(batch_ids), message="read " + batch)
        event("tool_completed", name=name, request_id=ctx.request_id)
        return result({"task_id": fixture["task_id"], "version": fixture["version"],
                       "batch_ids": batch_ids, "values": values,
                       "total": sum(values) - int(args.wrong_total and name == "scan_batches")})

    server = Server("infra-guide-orders", version="1.0.0", lifespan=lifespan,
                    on_list_tools=list_tools, on_call_tool=call_tool)

    async def run():
        async with stdio_server() as streams:
            await server.run(*streams, server.create_initialization_options())

    anyio.run(run)


if __name__ == "__main__":
    main()
