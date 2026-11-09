"""Run real SDK services and an official Collector with an independent SQLite ledger."""

import argparse
from contextlib import closing, contextmanager
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
from importlib.metadata import version
import json
from pathlib import Path
import platform
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.sampling import ALWAYS_ON
from opentelemetry.trace import SpanKind, Status, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from requests import Session


HERE = Path(__file__).resolve().parent
SOURCE = json.loads((HERE / "source.json").read_text())
LOCK = json.loads((HERE / "collector-lock.json").read_text())
OPENER = build_opener(ProxyHandler({}))
PROPAGATOR = TraceContextTextMapPropagator()


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def tracer_provider(name, endpoint):
    session = Session()
    session.trust_env = False
    exporter = OTLPSpanExporter(endpoint=endpoint, session=session, timeout=2)
    provider = TracerProvider(sampler=ALWAYS_ON, resource=Resource.create({"service.name": name}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    return provider


def prepare_ledger(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            CREATE TABLE tasks(task_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, outcome TEXT NOT NULL);
            CREATE TABLE attempts(task_id TEXT, attempt INTEGER, op TEXT, http_status INTEGER,
                                  written INTEGER, duplicate INTEGER, PRIMARY KEY(task_id,attempt));
            CREATE TABLE effects(op TEXT PRIMARY KEY, task_id TEXT UNIQUE, total INTEGER);
        """)


def serve_tool(db_path, endpoint, ready):
    provider = tracer_provider("report-tool", endpoint)
    tracer = provider.get_tracer("infra-guide.otel-tail-ledger")
    fixtures = {row["task_id"]: row for row in SOURCE["cases"]}

    class Tool(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path == "/health":
                self.send_response(204)
                self.end_headers()
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path != "/publish":
                self.send_error(404)
                return
            data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            task_id, op, total = data["task_id"], data["op"], data["total"]
            fixture = fixtures[task_id]
            assert op == task_id + ":publish" and total == SOURCE["report_total"]
            with tracer.start_as_current_span("tool.execute", context=PROPAGATOR.extract(self.headers),
                                              kind=SpanKind.SERVER) as span:
                with closing(sqlite3.connect(db_path)) as db, db:
                    attempt = db.execute("SELECT count(*)+1 FROM attempts WHERE task_id=?", (task_id,)).fetchone()[0]
                    assert attempt == 1 or (attempt == 2 and fixture["retry"])
                    status = fixture["first_response"] if attempt == 1 else 200
                    old = db.execute("SELECT total FROM effects WHERE op=?", (op,)).fetchone()
                    duplicate = old is not None
                    if duplicate:
                        assert old == (total,)
                    written = not duplicate and (status == 200 or fixture["effect_before_first_response"])
                    if written:
                        db.execute("INSERT INTO effects VALUES(?,?,?)", (op, task_id, total))
                    db.execute("INSERT INTO attempts VALUES(?,?,?,?,?,?)",
                               (task_id, attempt, op, status, int(written), int(duplicate)))
                span.set_attributes({"app.task_id": task_id, "app.op": op, "app.attempt": attempt,
                                     "app.effect_written": written, "app.duplicate": duplicate,
                                     "http.response.status_code": status})
                span.set_status(Status(StatusCode.ERROR if status >= 500 else StatusCode.OK))
                if written or duplicate:
                    span.add_event("effect_committed" if written else "receipt_reused")
                body = json.dumps({"op": op, "total": total, "duplicate": duplicate}).encode() if status == 200 else b""
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

    with HTTPServer(("127.0.0.1", 0), Tool) as server:
        ready.write_text(str(server.server_port))
        try:
            server.serve_forever()
        finally:
            provider.shutdown()


def run_tasks(db_path, tool_url, endpoint):
    provider = tracer_provider("report-runner", endpoint)
    tracer = provider.get_tracer("infra-guide.otel-tail-ledger")
    try:
        for fixture in SOURCE["cases"]:
            task_id = fixture["task_id"]
            op = task_id + ":publish"
            payload = json.dumps({"task_id": task_id, "op": op, "total": SOURCE["report_total"]}).encode()
            with tracer.start_as_current_span("agent.task", attributes={"app.task_id": task_id}) as root:
                receipt = None
                for attempt in range(1, 2 + int(fixture["retry"])):
                    with tracer.start_as_current_span("tool.attempt", kind=SpanKind.CLIENT) as span:
                        span.set_attributes({"app.task_id": task_id, "app.op": op, "app.attempt": attempt})
                        headers = {"Content-Type": "application/json"}
                        PROPAGATOR.inject(headers)
                        try:
                            with OPENER.open(Request(tool_url + "/publish", payload, headers), timeout=3) as reply:
                                status, receipt = reply.status, json.load(reply)
                        except HTTPError as error:
                            status = error.code
                            error.close()
                        span.set_attribute("http.response.status_code", status)
                        span.set_status(Status(StatusCode.ERROR if status >= 500 else StatusCode.OK))
                    if status == 200:
                        break
                with closing(sqlite3.connect(db_path)) as db, db:
                    effect = db.execute("SELECT total FROM effects WHERE op=?", (op,)).fetchone()
                    if receipt:
                        assert receipt == {"op": op, "total": SOURCE["report_total"], "duplicate": attempt > 1}
                        assert effect == (SOURCE["report_total"],)
                    else:
                        assert effect is None
                    outcome = "verified_success" if receipt else "failed"
                    trace_id = f"{root.get_span_context().trace_id:032x}"
                    db.execute("INSERT INTO tasks VALUES(?,?,?)", (task_id, trace_id, outcome))
                root.set_attribute("app.outcome", outcome)
                root.set_status(Status(StatusCode.OK if receipt else StatusCode.ERROR))
                root.add_event("artifact_checked" if receipt else "no_effect_checked")
        with OPENER.open(tool_url + "/health", timeout=3) as reply:
            assert reply.status == 204
    finally:
        provider.shutdown()


def available_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@contextmanager
def child(command, directory, logfile):
    with (directory / logfile).open("wb") as log:
        process = subprocess.Popen(command, cwd=directory, stdout=log, stderr=subprocess.STDOUT)
        try:
            yield process
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)


def wait_for(probe, process, description, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"{description}: child exited with code {process.returncode}")
        try:
            result = probe()
            if result:
                return result
        except (OSError, URLError, ValueError):
            pass
        time.sleep(0.05)
    raise TimeoutError(description)


def metrics_snapshot(url):
    with OPENER.open(url, timeout=1) as reply:
        return reply.read().decode()


def sampling_decisions(metrics):
    counts = {"true": 0, "false": 0}
    for line in metrics.splitlines():
        match = re.fullmatch(r'otelcol_processor_tail_sampling_count_traces_sampled__traces__total\{([^}]+)\}\s+([0-9.e+]+)', line)
        if match:
            sampled = re.search(r'\bsampled="(true|false)"', match[1])
            if sampled:
                counts[sampled[1]] += int(float(match[2]))
    return counts


def count_traces(path):
    identifiers = set()
    for line in path.read_text().splitlines():
        for resource in json.loads(line)["resourceSpans"]:
            for scope in resource["scopeSpans"]:
                identifiers.update(span["traceId"] for span in scope["spans"])
    return len(identifiers)


def run(archive_path, output):
    target = platform.system() + "-" + platform.machine()
    asset = LOCK["assets"][target]
    assert digest(archive_path) == asset["sha256"], "Collector archive differs from pinned official release"
    assert version("opentelemetry-sdk") == version("opentelemetry-exporter-otlp-proto-http") == "1.44.0"
    output.mkdir(parents=True, exist_ok=False)
    db_path = output / "ledger.sqlite"
    prepare_ledger(db_path)
    with tempfile.TemporaryDirectory(prefix="infra-otel-bin-") as folder:
        binary = Path(folder) / LOCK["distribution"]
        with tarfile.open(archive_path) as archive:
            member = next(member for member in archive.getmembers() if Path(member.name).name == binary.name and member.isfile())
            with archive.extractfile(member) as source, binary.open("wb") as destination:
                shutil.copyfileobj(source, destination)
        binary.chmod(0o700)
        version_text = subprocess.check_output([binary, "--version"], text=True, timeout=45).strip()
        assert LOCK["version"] in version_text
        binary_hash = digest(binary)
        otlp_port, metrics_port = available_port(), available_port()
        while otlp_port == metrics_port:
            metrics_port = available_port()
        config = (HERE / "collector.yaml").read_text().replace("@@OTLP_PORT@@", str(otlp_port)).replace("@@METRICS_PORT@@", str(metrics_port))
        (output / "collector-effective.yaml").write_text(config)
        endpoint = f"http://127.0.0.1:{otlp_port}/v1/traces"
        metrics_url = f"http://127.0.0.1:{metrics_port}/metrics"
        with child([binary, "--config=collector-effective.yaml"], output, "collector.log") as collector:
            wait_for(lambda: metrics_snapshot(metrics_url), collector, "Collector readiness")
            ready = output / "tool-port"
            with child([sys.executable, "-B", str(Path(__file__).resolve()), "tool", str(db_path), endpoint, str(ready)],
                       output, "tool.log") as tool:
                port = wait_for(lambda: int(ready.read_text()), tool, "tool readiness")
                run_tasks(db_path, f"http://127.0.0.1:{port}", endpoint)

                def settled():
                    metrics = metrics_snapshot(metrics_url)
                    if (sampling_decisions(metrics) == {"true": 2, "false": 1}
                            and count_traces(output / "full-traces.jsonl") == 3
                            and count_traces(output / "sampled-traces.jsonl") == 2):
                        return metrics
                    return None

                metrics = wait_for(settled, collector, "three tail decisions and both trace exports")
                (output / "collector-metrics.txt").write_text(metrics)
            ready.unlink()
        assert collector.returncode == 0

    with closing(sqlite3.connect(db_path)) as db:
        tasks = db.execute("SELECT count(*) FROM tasks").fetchone()[0]
        successes = db.execute("SELECT count(*) FROM tasks WHERE outcome='verified_success'").fetchone()[0]
        attempts = db.execute("SELECT count(*) FROM attempts").fetchone()[0]
        effects = db.execute("SELECT count(*) FROM effects").fetchone()[0]
    assert (tasks, successes, attempts, effects) == (3, 2, 4, 2)
    sources = ("tail_ledger.py", "collector.yaml", "collector-lock.json", "source.json", "requirements.txt", "README.md", "official-assets.json")
    artifacts = ("collector-effective.yaml", "collector.log", "collector-metrics.txt", "full-traces.jsonl", "sampled-traces.jsonl", "ledger.sqlite")
    record = {
        "schema": "otel-tail-ledger-v1",
        "status": "passed",
        "collector": {"target": target, "version_output": version_text, "archive_name": asset["name"],
                      "archive_sha256": asset["sha256"], "binary_sha256": binary_hash},
        "environment": {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version, "sdk": version("opentelemetry-sdk"),
                        "otlp_http_exporter": version("opentelemetry-exporter-otlp-proto-http")},
        "observed": {"tasks": tasks, "verified_successes": successes, "attempts": attempts, "effects": effects,
                     "full_trace_count": count_traces(output / "full-traces.jsonl"),
                     "sampled_trace_count": count_traces(output / "sampled-traces.jsonl"), "sampling_decisions": sampling_decisions(metrics)},
        "source_sha256": {name: digest(HERE / name) for name in sources},
        "artifact_sha256": {name: digest(output / name) for name in artifacts},
        "scope": "local real SDK, HTTP, Collector and SQLite on fixed synthetic tasks",
    }
    (output / "validation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(record["observed"], ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "tool":
        serve_tool(Path(sys.argv[2]), sys.argv[3], Path(sys.argv[4]))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--collector-archive", type=Path, required=True)
        parser.add_argument("--output-dir", type=Path, required=True)
        args = parser.parse_args()
        run(args.collector_archive.resolve(), args.output_dir.resolve())
