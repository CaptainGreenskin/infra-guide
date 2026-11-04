"""Actual loopback JSON-RPC tool calls; scripted proposals, not an LLM or full MCP server."""
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener


def obj(properties):
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


S = {"type": "string", "minLength": 1}
I = {"type": "integer"}
N = {"type": "integer", "minimum": 0}
READ_INPUT = obj({"resource": S})
READ_OUTPUT = obj({"resource": S, "version": N,
                   "values": {"type": "array", "items": I}})
WRITE_INPUT = obj({"resource": S, "op": S, "total": I,
                   "source_version": N, "expected_version": N})
WRITE_OUTPUT = obj({"resource": S, "version": N, "total": I, "op": S,
                    "duplicate": {"type": "boolean"}})
TOOLS = [
    {"name": "read_values", "inputSchema": READ_INPUT, "outputSchema": READ_OUTPUT},
    {"name": "write_report", "inputSchema": WRITE_INPUT, "outputSchema": WRITE_OUTPUT},
]
SOURCES = {"orders-A": {"version": 3, "values": [10, 27]},
           "orders-B": {"version": 8, "values": [999]}}


def validate(value, schema):
    """Only the explicit schema subset above; not a general JSON Schema implementation."""
    kind = schema["type"]
    if kind == "object":
        return (type(value) is dict and set(value) == set(schema["required"])
                and all(validate(value[k], s) for k, s in schema["properties"].items()))
    if kind == "array":
        return type(value) is list and all(validate(v, schema["items"]) for v in value)
    if kind == "integer":
        return type(value) is int and value >= schema.get("minimum", float("-inf"))
    if kind == "boolean":
        return type(value) is bool
    return type(value) is str and len(value) >= schema.get("minLength", 0)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


class Store:
    def __init__(self, path):
        self.db = sqlite3.connect(str(path), check_same_thread=False)
        self.db.executescript("""
            CREATE TABLE report(resource TEXT PRIMARY KEY, version INTEGER,
                                total INTEGER, source_version INTEGER);
            CREATE TABLE receipt(op TEXT PRIMARY KEY, digest TEXT, body TEXT);
            CREATE TABLE effects(op TEXT);
        """)

    def call(self, name, arguments, principal):
        resource = arguments["resource"]
        # Test fixture principal; real authentication / credential verification is not implemented.
        if principal != "principal-A" or resource not in {"orders-A", "report-A"}:
            return {"code": "denied"}, True
        if name == "read_values":
            if resource not in SOURCES:
                return {"code": "not_found"}, True
            return {"resource": resource, **SOURCES[resource]}, False
        if resource != "report-A":
            return {"code": "not_found"}, True
        digest = hashlib.sha256(canonical(arguments).encode()).hexdigest()
        with self.db:
            old = self.db.execute("SELECT digest, body FROM receipt WHERE op=?",
                                  (arguments["op"],)).fetchone()
            if old:
                if old[0] != digest:
                    return {"code": "operation_conflict"}, True
                body = json.loads(old[1])
                body["duplicate"] = True
                return body, False
            prior = self.db.execute("SELECT version FROM report WHERE resource=?",
                                    (resource,)).fetchone()
            version = prior[0] if prior else 0
            if version != arguments["expected_version"]:
                return {"code": "version_conflict"}, True
            version += 1
            self.db.execute("INSERT OR REPLACE INTO report VALUES(?,?,?,?)",
                            (resource, version, arguments["total"], arguments["source_version"]))
            body = {"resource": resource, "version": version, "total": arguments["total"],
                    "op": arguments["op"], "duplicate": False}
            self.db.execute("INSERT INTO receipt VALUES(?,?,?)",
                            (arguments["op"], digest, canonical(body)))
            self.db.execute("INSERT INTO effects VALUES(?)", (arguments["op"],))
        return body, False

    def artifact(self):
        row = self.db.execute("SELECT resource,version,total,source_version FROM report").fetchone()
        return dict(zip(["resource", "version", "total", "source_version"], row)) if row else None

    def effect_count(self):
        return self.db.execute("SELECT COUNT(*) FROM effects").fetchone()[0]


def tool(name, **arguments):
    return {"kind": "tool", "name": name, "arguments": arguments}


def read(resource="orders-A"):
    return tool("read_values", resource=resource)


def write(total=37, op="R17:publish"):
    return tool("write_report", resource="report-A", op=op, total=total,
                source_version=3, expected_version=0)


FINISH = {"kind": "finish"}


def run_case(directory, name, proposals, fault=None):
    store = Store(directory / (name + ".sqlite"))
    observed_wire = []
    requests = {"rpc": 0, "calls": 0, "transient_sent": False}
    catalog = {item["name"]: item for item in TOOLS}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests["rpc"] += 1
            method, request_id = request.get("method"), request.get("id")
            if method == "tools/list":
                reply = {"result": {"tools": TOOLS}}
            elif method != "tools/call":
                reply = {"error": {"code": -32601, "message": "Unknown method"}}
            else:
                requests["calls"] += 1
                params = request.get("params", {})
                call_name, arguments = params.get("name"), params.get("arguments")
                if call_name not in catalog:
                    reply = {"error": {"code": -32602, "message": "Unknown tool"}}
                elif not validate(arguments, catalog[call_name]["inputSchema"]):
                    reply = {"result": {"isError": True,
                                         "content": [{"type": "text", "text": "invalid_arguments"}]}}
                elif fault == "transient_read" and not requests["transient_sent"]:
                    requests["transient_sent"] = True
                    self.send_response(503)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                else:
                    body, is_error = store.call(call_name, arguments, "principal-A")
                    if fault == "broken_output" and call_name == "read_values" and not is_error:
                        body["values"] = "10,27"
                    reply = {"result": {"isError": is_error,
                                         "content": [{"type": "text", "text": canonical(body)}],
                                         "structuredContent": body}}
            payload = json.dumps({"jsonrpc": "2.0", "id": request_id, **reply}).encode()
            observed_wire.append(payload.decode())
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    opener = build_opener(ProxyHandler({}))
    address = "http://127.0.0.1:" + str(server.server_port) + "/rpc"
    serial = 0

    def rpc(method, params):
        nonlocal serial
        serial += 1
        payload = json.dumps({"jsonrpc": "2.0", "id": serial, "method": method, "params": params})
        request = Request(address, payload.encode(), {"Content-Type": "application/json"})
        with opener.open(request, timeout=3) as response:
            reply = json.load(response)
        assert reply["jsonrpc"] == "2.0" and reply["id"] == serial
        return reply

    max_calls, max_proposals = 3, 4
    calls = proposal_count = validation_errors = transport_errors = 0
    observations, trace = [], []
    state = "INCOMPLETE"
    try:
        discovered = rpc("tools/list", {})["result"]["tools"]
        assert discovered == TOOLS
        for proposal in proposals:
            if proposal_count >= max_proposals:
                state = "BUDGET_EXCEEDED"
                break
            proposal_count += 1
            if proposal.get("kind") == "finish":
                artifact = store.artifact()
                valid = (artifact == {"resource": "report-A", "version": 1, "total": 37,
                                      "source_version": 3}
                         and any(o.get("resource") == "orders-A" and o.get("version") == 3
                                 for o in observations))
                state = "SUCCEEDED" if valid else "INCOMPLETE"
                trace.append({"proposal": proposal_count, "event": "artifact_checked", "valid": valid})
                break
            call_name, arguments = proposal.get("name"), proposal.get("arguments")
            if call_name not in catalog or not validate(arguments, catalog[call_name]["inputSchema"]):
                validation_errors += 1
                trace.append({"proposal": proposal_count, "event": "rejected_before_dispatch"})
                continue
            # Task policy allows these two tools. Object authorization remains on the server.
            retries = 0
            while True:
                if calls >= max_calls:
                    state = "BUDGET_EXCEEDED"
                    break
                calls += 1
                try:
                    reply = rpc("tools/call", {"name": call_name, "arguments": arguments})
                except HTTPError as error:
                    transport_errors += 1
                    trace.append({"proposal": proposal_count, "attempt": calls,
                                  "event": "http_error", "status": error.code})
                    if error.code == 503 and call_name == "read_values" and retries == 0:
                        retries += 1
                        continue
                    state = "UNKNOWN" if call_name == "write_report" else "TRANSPORT_ERROR"
                    break
                if "error" in reply:
                    state = "PROTOCOL_ERROR"
                    break
                result = reply["result"]
                if result.get("isError"):
                    error_code = result.get("structuredContent", {}).get("code", "invalid_arguments")
                    state = "DENIED" if error_code == "denied" else "TOOL_ERROR"
                    trace.append({"proposal": proposal_count, "attempt": calls,
                                  "event": "tool_error", "code": error_code})
                    break
                body = result.get("structuredContent")
                if not validate(body, catalog[call_name]["outputSchema"]):
                    state = "FAILED_RESULT_SCHEMA"
                    break
                observations.append(body)
                trace.append({"proposal": proposal_count, "attempt": calls, "event": "accepted",
                              "tool": call_name, "duplicate": body.get("duplicate", False)})
                state = "RUNNING"
                break
            if state != "RUNNING":
                break
        return {"state": state, "proposals": proposal_count, "tool_attempts": calls,
                "rpc_requests": requests["rpc"], "validation_errors": validation_errors,
                "transport_errors": transport_errors, "observations": observations,
                "effects": store.effect_count(), "artifact": store.artifact(), "trace": trace,
                "foreign_value_leaked": any("999" in item for item in observed_wire)}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()
        store.db.close()


def main():
    cases = {
        "normal": ([read(), write(), FINISH], None),
        "duplicate_same_operation": ([read(), write(), write(), FINISH], None),
        "invalid_bool_then_repair": ([read(), write(True), write(), FINISH], None),
        "foreign_resource": ([read("orders-B"), FINISH], None),
        "broken_output": ([read(), FINISH], "broken_output"),
        "finish_without_work": ([FINISH], None),
        "repeating_reads": ([read()] * 6, None),
        "transient_read": ([read(), write(), FINISH], "transient_read"),
        "valid_schema_wrong_total": ([read(), write(38), FINISH], None),
        "same_operation_changed_arguments": ([read(), write(), write(38), FINISH], None),
    }
    with tempfile.TemporaryDirectory(prefix="infra-tool-loop-") as folder:
        results = {name: run_case(Path(folder), name, *case) for name, case in cases.items()}
    for name in ["normal", "duplicate_same_operation", "invalid_bool_then_repair", "transient_read"]:
        assert results[name]["state"] == "SUCCEEDED" and results[name]["effects"] == 1
    assert results["duplicate_same_operation"]["observations"][-1]["duplicate"] is True
    assert results["invalid_bool_then_repair"]["validation_errors"] == 1
    assert results["invalid_bool_then_repair"]["tool_attempts"] == 2
    assert results["foreign_resource"]["state"] == "DENIED"
    assert results["foreign_resource"]["foreign_value_leaked"] is False
    assert results["broken_output"]["state"] == "FAILED_RESULT_SCHEMA"
    assert results["broken_output"]["observations"] == []
    assert results["finish_without_work"]["state"] == "INCOMPLETE"
    assert results["repeating_reads"]["state"] == "BUDGET_EXCEEDED"
    assert results["repeating_reads"]["tool_attempts"] == 3
    assert results["transient_read"]["transport_errors"] == 1
    assert results["valid_schema_wrong_total"]["state"] == "INCOMPLETE"
    assert results["valid_schema_wrong_total"]["effects"] == 1
    assert results["same_operation_changed_arguments"]["state"] == "TOOL_ERROR"
    assert results["same_operation_changed_arguments"]["effects"] == 1
    print(json.dumps({"proposal_source": "deterministic_script_no_llm",
                      "transport": "actual_loopback_http_jsonrpc", "catalog": TOOLS, "cases": results,
                      "max_proposals": 4, "max_tool_attempts": 3,
                      "scope": "tool_contract_and_control_loop_not_full_mcp_auth_or_kairo"},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

