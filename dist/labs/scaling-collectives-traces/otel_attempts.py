"""Actual OpenTelemetry SDK, W3C headers, two HTTP attempts and one SQLite effect."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from importlib.metadata import version
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.sdk.trace.sampling import ALWAYS_ON
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator


def main():
    exporter = InMemorySpanExporter()
    traces = TracerProvider(sampler=ALWAYS_ON, resource=Resource.create({"service.name": "infra-guide-runner"}))
    traces.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = traces.get_tracer("infra-guide.local-trace", "1")
    tool_traces = TracerProvider(sampler=ALWAYS_ON, resource=Resource.create({"service.name": "infra-guide-tool"}))
    tool_traces.add_span_processor(SimpleSpanProcessor(exporter))
    tool_tracer = tool_traces.get_tracer("infra-guide.local-trace", "1")
    reader = InMemoryMetricReader()
    meters = MeterProvider(metric_readers=[reader], resource=Resource.create({"service.name": "infra-guide-fixture"}))
    meter = meters.get_meter("infra-guide.local-trace", "1")
    attempts = meter.create_counter("lab.tool.attempts", unit="{attempt}")
    effects = meter.create_counter("lab.tool.effects", unit="{effect}")
    successes = meter.create_counter("lab.task.successes", unit="{task}")
    cost = meter.create_counter("lab.teaching.cost", unit="{unit}")
    duration = meter.create_histogram("lab.tool.duration", unit="ms")
    propagator = TraceContextTextMapPropagator()
    received_headers, ledger = [], []

    with tempfile.TemporaryDirectory(prefix="infra-otel-") as folder:
        db = sqlite3.connect(str(Path(folder) / "tool.sqlite"), check_same_thread=False)
        db.execute("CREATE TABLE effect(op TEXT PRIMARY KEY, total INTEGER)")
        server_calls = 0

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                nonlocal server_calls
                server_calls += 1
                received_headers.append(self.headers["traceparent"])
                remote = propagator.extract(self.headers)
                with tool_tracer.start_as_current_span("tool.execute", context=remote,
                                                   kind=SpanKind.SERVER) as span:
                    data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                    assert data == {"op_id": "R27:publish", "total": 37}
                    span.set_attribute("app.op_id", data["op_id"])
                    with db:
                        old = db.execute("SELECT total FROM effect WHERE op=?", (data["op_id"],)).fetchone()
                        if old:
                            assert old[0] == data["total"]
                            duplicate = True
                        else:
                            db.execute("INSERT INTO effect VALUES(?,?)", (data["op_id"], data["total"]))
                            duplicate = False
                    # Emit the committed event/counter only after the transaction context committed.
                    span.add_event("receipt_reused" if duplicate else "effect_committed")
                    if not duplicate:
                        effects.add(1, {"tool": "report.write"})
                    span.set_attribute("app.duplicate", duplicate)
                    if server_calls == 1:
                        # The effect has committed; now inject a failing HTTP response.
                        span.set_attribute("http.response.status_code", 503)
                        span.set_status(Status(StatusCode.ERROR, "injected_after_commit"))
                        self.send_response(503)
                        self.send_header("Content-Length", "0")
                        self.end_headers()
                        return
                    body = json.dumps({"op_id": data["op_id"], "receipt": "receipt-1",
                                       "total": 37, "duplicate": duplicate}).encode()
                    span.set_attribute("http.response.status_code", 200)
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
        thread.start()
        opener = build_opener(ProxyHandler({}))
        endpoint = "http://127.0.0.1:" + str(server.server_port) + "/reports"
        response_body = None
        try:
            with tracer.start_as_current_span("agent.task") as task:
                task.set_attribute("app.task_id", "R27")
                for number in [1, 2]:
                    with tracer.start_as_current_span("tool.attempt", kind=SpanKind.CLIENT) as span:
                        span.set_attribute("app.task_id", "R27")
                        span.set_attribute("app.op_id", "R27:publish")
                        span.set_attribute("app.attempt", number)
                        headers = {"Content-Type": "application/json"}
                        propagator.inject(headers)
                        payload = json.dumps({"op_id": "R27:publish", "total": 37}).encode()
                        started = time.perf_counter_ns()
                        outcome = "http_error"
                        try:
                            request = Request(endpoint, payload, headers)
                            with opener.open(request, timeout=3) as reply:
                                response_body = json.load(reply)
                            outcome = "ok"
                            span.set_attribute("http.response.status_code", 200)
                        except HTTPError as error:
                            assert error.code == 503 and number == 1
                            span.set_attribute("http.response.status_code", error.code)
                            span.set_status(Status(StatusCode.ERROR, "http_503_result_unknown"))
                            span.add_event("result_unknown", {"app.same_operation_retry": True})
                        finally:
                            duration.record((time.perf_counter_ns() - started) / 1e6,
                                            {"tool": "report.write"})
                            attempts.add(1, {"tool": "report.write", "outcome": outcome})
                            cost.add(2, {"category": "tool_attempt"})
                            ledger.append({"attempt": number, "teaching_cost_units": 2, "outcome": outcome})
                        if outcome == "ok":
                            break
                artifact = db.execute("SELECT op,total FROM effect").fetchall()
                assert artifact == [("R27:publish", 37)]
                assert response_body["duplicate"] and response_body["receipt"] == "receipt-1"
                task.add_event("artifact_checked", {"app.accepted": True})
                task.set_attribute("app.outcome", "verified_success")
                task.set_status(Status(StatusCode.OK))
                successes.add(1, {"task_type": "report"})
                cost.add(1, {"category": "verification"})
                ledger.append({"stage": "verification", "teaching_cost_units": 1})
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            assert not thread.is_alive()
            db.close()

    spans = []
    for span in sorted(exporter.get_finished_spans(), key=lambda s: s.start_time):
        context = span.get_span_context()
        spans.append({"name": span.name, "kind": span.kind.name,
                      "service": span.resource.attributes["service.name"],
                      "trace_id": format(context.trace_id, "032x"), "span_id": format(context.span_id, "016x"),
                      "parent_id": format(span.parent.span_id, "016x") if span.parent else None,
                      "parent_remote": span.parent.is_remote if span.parent else False,
                      "status": span.status.status_code.name,
                      "start_unix_ns": str(span.start_time), "end_unix_ns": str(span.end_time),
                      "duration_ms": (span.end_time - span.start_time) / 1e6,
                      "attributes": dict(span.attributes),
                      "events": [event.name for event in span.events]})
    root = next(s for s in spans if s["name"] == "agent.task")
    clients = [s for s in spans if s["kind"] == "CLIENT"]
    servers = [s for s in spans if s["kind"] == "SERVER"]
    assert len(spans) == 5 and len(clients) == len(servers) == 2
    assert len({s["trace_id"] for s in spans}) == 1
    assert all(s["parent_id"] == root["span_id"] for s in clients)
    assert all(s["service"] == "infra-guide-runner" for s in clients)
    assert all(s["service"] == "infra-guide-tool" for s in servers)
    for client, remote, header in zip(clients, servers, received_headers):
        assert remote["parent_id"] == client["span_id"] and remote["parent_remote"]
        assert header.split("-")[1:3] == [client["trace_id"], client["span_id"]]
    assert clients[0]["status"] == "ERROR" and root["status"] == "OK"
    metrics = []
    data = reader.get_metrics_data()
    for resource in data.resource_metrics:
        for scope in resource.scope_metrics:
            for metric in scope.metrics:
                points = []
                for point in metric.data.data_points:
                    entry = {"attributes": dict(point.attributes)}
                    if hasattr(point, "value"):
                        entry["value"] = point.value
                    else:
                        entry.update({"count": point.count, "sum_ms": point.sum})
                    assert "app.task_id" not in entry["attributes"] and "app.op_id" not in entry["attributes"]
                    points.append(entry)
                metrics.append({"name": metric.name, "unit": metric.unit, "points": points})
    sums = {m["name"]: sum(p.get("value", 0) for p in m["points"]) for m in metrics}
    assert sums["lab.tool.attempts"] == 2
    assert sums["lab.tool.effects"] == sums["lab.task.successes"] == 1
    assert sums["lab.teaching.cost"] == 5
    result = {"sdk": version("opentelemetry-sdk"), "api": version("opentelemetry-api"),
              "spans": spans, "received_traceparent": received_headers, "metrics": metrics,
              "http_attempts": server_calls, "effects": 1, "unique_verified_tasks": 1,
              "cost_ledger": ledger, "all_attempt_cost_per_success": 5,
              "success_http_attempt_only_cost": 2,
              "pricing": "fixed_teaching_units_not_real_model_or_cloud_billing",
              "scope": "actual_sdk_and_http_no_collector_backend_llm_kairo_or_real_auth"}
    meters.shutdown()
    traces.shutdown()
    tool_traces.shutdown()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

