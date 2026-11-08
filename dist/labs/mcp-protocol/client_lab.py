"""Actual official-SDK stdio requests and cancellation, with independent source checks.

Python 3.12 + requirements.txt. Every connection launches its own read-only server.
Modern discovery and legacy initialize are exercised as separate connections.
"""
import argparse
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import sys
import tempfile

import anyio
from mcp import MCPError, types
from mcp.client import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


ROOT = Path(__file__).resolve().parent


class Tap:
    """Observe actual messages on the SDK transport; never synthesize messages."""
    def __init__(self, stream, trace, direction):
        self.stream, self.trace, self.direction = stream, trace, direction

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


def events(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


async def event_arrives(path, name):
    with anyio.fail_after(5):
        while True:
            found = [row for row in events(path) if row["event"] == name]
            if found:
                return found[-1]
            await anyio.sleep(.01)


def value(result):
    assert not result.is_error
    assert json.loads(result.content[0].text) == result.structured_content
    return result.structured_content


def matches_source(data, source, batch_ids):
    expected = [number for batch in batch_ids for number in source["batches"][batch]]
    return (data.get("task_id") == source["task_id"] and data.get("version") == source["version"]
            and data.get("batch_ids") == batch_ids and data.get("values") == expected
            and data.get("total") == sum(expected))


async def connection(folder, legacy=False, wrong_total=False):
    trace, progress = [], []
    label = "wrong-total" if wrong_total else "legacy" if legacy else "modern"
    log = folder / (label + ".jsonl")
    server = StdioServerParameters(command=sys.executable,
                                  args=[str(ROOT / "server.py"), "--fixture", str(ROOT / "orders.json"), "--events", str(log)])
    if wrong_total:
        server.args.append("--wrong-total")
    with (folder / (label + ".stderr")).open("w") as stderr:
        async with stdio_client(server, errlog=stderr) as (read, write):
            async with ClientSession(Tap(read, trace, "server_to_client"), Tap(write, trace, "client_to_server"),
                                     read_timeout_seconds=5, client_info=types.Implementation(name="infra-guide-host", version="1.0.0")) as session:
                initial = await session.initialize() if legacy else await session.discover()
                metadata = initial.model_dump(by_alias=True, exclude_none=True)
                tools = await session.list_tools()
                advertised = {tool.name: tool.input_schema for tool in tools.tools}
                assert set(advertised) == {"read_batch", "scan_batches", "watch_batch"}
                base = value(await session.call_tool("read_batch", {"task_id": "report-A", "batch_id": "base"}))
                assert base["total"] == 37
                if wrong_total:
                    wrong = await session.call_tool("scan_batches", {"task_id": "report-A", "batch_ids": ["base", "late"]})
                    data = value(wrong)
                    source = json.loads((ROOT / "orders.json").read_text())
                    expected = sum(sum(v) for v in source["batches"].values())
                    rejected = not matches_source(data, source, ["base", "late"])
                    assert not wrong.is_error and rejected
                    result = {"metadata": metadata, "scan": data, "is_error": wrong.is_error,
                              "independent_expected": expected, "semantic_error_rejected": rejected}
                elif legacy:
                    result = {"metadata": metadata, "base": base}
                else:
                    invalid = await session.call_tool("read_batch", {"task_id": "report-A", "batch_id": 27})
                    missing = await session.call_tool("read_batch", {"task_id": "report-A", "batch_id": "missing"})
                    assert invalid.is_error and missing.is_error
                    try:
                        await session.call_tool("unknown_tool", {})
                    except MCPError as error:
                        protocol_error = {"code": error.code, "message": str(error)}
                    else:
                        raise AssertionError("unknown tool should produce a protocol error")
                    progress_ready = anyio.Event()

                    async def on_progress(done, total, message):
                        progress.append({"done": done, "total": total, "message": message})
                        if done == 2:
                            progress_ready.set()

                    scan = value(await session.call_tool("scan_batches", {"task_id": "report-A", "batch_ids": ["base", "late"]},
                                                         progress_callback=on_progress))
                    with anyio.fail_after(5):
                        await progress_ready.wait()
                    cancellation_started, cancellation_finished = anyio.Event(), anyio.Event()
                    pending = {}

                    async def watch_progress(done, total, message):
                        pending["progress"] = {"done": done, "total": total, "message": message}
                        cancellation_started.set()

                    async def waiting_call():
                        try:
                            with anyio.CancelScope() as scope:
                                pending["scope"] = scope
                                try:
                                    await session.call_tool("watch_batch", {"task_id": "report-A", "batch_id": "base"},
                                                            progress_callback=watch_progress)
                                except anyio.get_cancelled_exc_class():
                                    pending["cancelled"] = True
                                    raise
                        finally:
                            cancellation_finished.set()

                    async with anyio.create_task_group() as group:
                        group.start_soon(waiting_call)
                        with anyio.fail_after(5):
                            await cancellation_started.wait()
                            pending["scope"].cancel()
                            await cancellation_finished.wait()
                        cleanup = await event_arrives(log, "watch_cleanup")
                        assert cleanup["file_closed"] and pending["cancelled"]
                    after_cancel = value(await session.call_tool("read_batch", {"task_id": "report-A", "batch_id": "late"}))
                    result = {"metadata": metadata, "base": base, "invalid_is_error": invalid.is_error,
                              "missing_is_error": missing.is_error, "protocol_error": protocol_error,
                              "scan": scan, "progress": progress, "cancel_progress": pending["progress"],
                              "cancelled_waiter": pending["cancelled"], "server_cleanup": cleanup,
                              "after_cancel": after_cancel}
    rows = events(log)
    pid = next(row["pid"] for row in rows if row["event"] == "server_started")
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        reaped = True
    else:
        reaped = False
    assert reaped and rows[-1]["event"] == "server_stopped"
    result.update(trace=trace, events=[{k: v for k, v in row.items() if k != "pid"} for row in rows],
                  server_exit_event=True, server_process_reaped=reaped, tools=advertised)
    return result


def independent_oracle(result):
    source = json.loads((ROOT / "orders.json").read_text())
    modern, legacy = result["modern"], result["legacy"]
    expected_values = source["batches"]["base"] + source["batches"]["late"]
    assert matches_source(modern["scan"], source, ["base", "late"])
    assert sum(expected_values) == 42
    assert legacy["base"] == modern["base"]
    outgoing = [row["message"] for row in modern["trace"] if row["direction"] == "client_to_server"]
    incoming = [row["message"] for row in modern["trace"] if row["direction"] == "server_to_client"]
    watch = next(row for row in outgoing if row.get("method") == "tools/call" and row["params"]["name"] == "watch_batch")
    cancel = next(row for row in outgoing if row.get("method") == "notifications/cancelled")
    assert cancel["params"]["requestId"] == watch["id"]
    assert not any(row.get("id") == watch["id"] for row in incoming)
    assert modern["server_cleanup"]["request_id"] == watch["id"]
    assert modern["after_cancel"]["total"] == sum(source["batches"]["late"])
    assert [row["done"] for row in modern["progress"]] == [1, 2]
    assert outgoing[0]["method"] == "server/discover"
    assert not any(row.get("method") == "initialize" for row in outgoing)
    requests = [row for row in outgoing if "id" in row]
    assert len({row["id"] for row in requests}) == len(requests)
    for request in requests:
        metadata = request["params"]["_meta"]
        assert metadata["io.modelcontextprotocol/protocolVersion"] == "2026-07-28"
        assert metadata["io.modelcontextprotocol/clientInfo"]["name"] == "infra-guide-host"
        assert "io.modelcontextprotocol/clientCapabilities" in metadata
    legacy_out = [row["message"] for row in legacy["trace"] if row["direction"] == "client_to_server"]
    assert legacy_out[0]["method"] == "initialize"
    assert legacy_out[1]["method"] == "notifications/initialized"
    assert legacy["metadata"]["protocolVersion"] == "2025-11-25"
    assert result["wrong_total"]["scan"]["total"] == 41
    assert result["wrong_total"]["semantic_error_rejected"] and not result["wrong_total"]["is_error"]
    return {"expected_total": 42, "cancel_request_id": watch["id"], "cancelled_response_absent": True,
            "all_modern_requests_carry_metadata": True,
            "modern_first_method": outgoing[0]["method"], "legacy_first_method": legacy_out[0]["method"]}


async def run(folder):
    result = {"sdk": version("mcp"), "python": platform.python_version(),
              "modern": await connection(folder), "legacy": await connection(folder, legacy=True),
              "wrong_total": await connection(folder, wrong_total=True)}
    result["independent_oracle"] = independent_oracle(result)
    result["status"] = "passed"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=False)
        result = anyio.run(run, args.output_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="infra-mcp-") as temporary:
            result = anyio.run(run, Path(temporary))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
