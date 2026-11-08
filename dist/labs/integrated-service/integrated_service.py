"""Local HTTP -> durable task -> CPU Linear -> effect/publication -> authorized read.

The plan and public Bearer tokens are fixtures. No LLM, training, GPU or Kairo.
Only the suite owns child process groups; all network destinations are loopback.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

HERE = Path(__file__).resolve().parent
TOKENS = {"fixture-user-A": ("alice", "A"), "fixture-user-B": ("bob", "B")}
SERVICE = "fixture-service-A"
TASK, TARGET = "task-A", "report-A"


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def file_sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    path = Path(path)
    pending = path.with_suffix(path.suffix + ".tmp")
    pending.write_text(encoded(value) + "\n")
    os.replace(pending, path)


def db(path, readonly=False):
    connection = sqlite3.connect("file:" + str(Path(path).resolve()) + "?mode=ro", uri=True, timeout=5) if readonly else sqlite3.connect(path, timeout=5)
    connection.row_factory = sqlite3.Row
    return connection


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_):
        raise ValueError("redirects are not part of this loopback experiment")


def http_json(url, method="GET", body=None, token=SERVICE):
    parts = urlsplit(url)
    if parts.scheme != "http" or parts.hostname != "127.0.0.1":
        raise ValueError("only this experiment's loopback HTTP services are allowed")
    request = Request(url, data=None if body is None else encoded(body).encode(), method=method,
                      headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        # Ignore HTTP_PROXY/HTTPS_PROXY; fixed local services never redirect.
        with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=5) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        with error:
            return error.code, json.load(error)


def rpc(url, method="GET", body=None, token=SERVICE):
    status, result = http_json(url, method, body, token)
    if status not in (200, 201, 202):
        raise RuntimeError(f"HTTP {status}: {result}")
    return result


def torch_runtime():
    import torch
    if torch.__version__.split("+")[0] != "2.5.1":
        raise RuntimeError("Use the pinned PyTorch 2.5.1 environment")
    torch.set_num_threads(1)
    return torch


def prepare(folder, variant):
    folder.mkdir(parents=True, exist_ok=False)
    for name in ("source.json", "model-contract.json"):
        shutil.copyfile(HERE / name, folder / name)
    contract = load(folder / "model-contract.json")
    torch = torch_runtime()
    approved = folder / "approved"
    approved.mkdir()
    config = {"architecture": contract["architecture"], "input": 2, "output": 1,
              "dtype": contract["dtype"], "runtime": "torch==2.5.1"}
    save(approved / "config.json", config)
    torch.save({"weight": torch.tensor(contract["weight"], dtype=torch.float64),
                "bias": torch.tensor(contract["bias"], dtype=torch.float64)}, approved / "weights.pt")

    def manifest(directory, bundle_id):
        value = {"bundle_id": bundle_id, "config_sha256": file_sha(directory / "config.json"),
                 "weights_sha256": file_sha(directory / "weights.pt")}
        save(directory / "manifest.json", value)

    manifest(approved, contract["bundle_id"])
    selected = approved
    if variant in ("wrong_weights", "wrong_version"):
        selected = folder / "selected-wrong"
        shutil.copytree(approved, selected)
        if variant == "wrong_weights":
            torch.save({"weight": torch.tensor(contract["weight"], dtype=torch.float64),
                        "bias": torch.tensor([1], dtype=torch.float64)}, selected / "weights.pt")
        manifest(selected, contract["bundle_id"] if variant == "wrong_weights" else "linear-sum-v2")
    save(folder / "deployment.json", {"alias": contract["alias"], "bundle_directory": selected.name})
    with db(folder / "tasks.sqlite") as con:
        con.executescript("""
        CREATE TABLE tasks(id TEXT PRIMARY KEY, request_id TEXT UNIQUE, request_digest TEXT,
          actor TEXT,tenant TEXT,target TEXT,source TEXT,source_sha TEXT,bundle TEXT,bundle_sha TEXT,
          stage TEXT,status TEXT,attempts INT,model_result TEXT,receipt TEXT);
        CREATE TABLE grants(actor TEXT PRIMARY KEY,report_read INT);
        INSERT INTO grants VALUES('alice',1),('bob',1);
        CREATE TABLE audit(seq INTEGER PRIMARY KEY,kind TEXT,actor TEXT,allowed INT,details TEXT);
        """)
    with db(folder / "receiver.sqlite") as con:
        con.executescript("""
        CREATE TABLE effects(op TEXT PRIMARY KEY,intent TEXT,artifact TEXT,receipt TEXT);
        CREATE TABLE artifacts(id TEXT PRIMARY KEY,body TEXT,content_sha TEXT);
        CREATE TABLE publications(tenant TEXT,target TEXT,artifact TEXT,PRIMARY KEY(tenant,target));
        CREATE TABLE attempts(seq INTEGER PRIMARY KEY,op TEXT,duplicate INT);
        CREATE TABLE reads(seq INTEGER PRIMARY KEY,artifact TEXT);
        """)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def answer(self, status, value):
        data = encoded(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def handle_request(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > 65536:
                return self.answer(413, {"error": "request_size"})
            body = json.loads(self.rfile.read(size)) if size else None
            token = self.headers.get("Authorization", "").removeprefix("Bearer ")
            status, result = self.server.dispatch(self.command, self.path, body, token)
            self.answer(status, result)
        except (KeyError, TypeError, ValueError) as error:
            self.answer(400, {"error": type(error).__name__})


def api_dispatch(folder, method, path, body, token):
    service = token == SERVICE
    identity = TOKENS.get(token)
    if not service and identity is None:
        return 401, {"error": "unauthenticated"}
    if method == "POST" and path == "/tasks":
        if identity != ("alice", "A"):
            return 403, {"error": "submit_denied"}
        if set(body) != {"request_id", "source_id", "target", "model_alias"}:
            return 400, {"error": "request_schema"}
        if body["source_id"] != "daily-values" or body["target"] != TARGET or body["model_alias"] != "approved-sum":
            return 403, {"error": "delegation_scope"}
        with db(folder / "tasks.sqlite") as con:
            con.execute("BEGIN IMMEDIATE")
            existing = con.execute("SELECT * FROM tasks WHERE request_id=?", (body["request_id"],)).fetchone()
            if existing:
                if existing["request_digest"] != digest(body):
                    return 409, {"error": "request_conflict"}
                return 200, {"task_id": existing["id"], "duplicate": True, "status": existing["status"]}
            source = load(folder / "source.json")
            deployment = load(folder / "deployment.json")
            bundle = load(folder / deployment["bundle_directory"] / "manifest.json")
            con.execute("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (TASK, body["request_id"], digest(body), "alice", "A", TARGET, encoded(source),
                         file_sha(folder / "source.json"), encoded(bundle), digest(bundle), "INPUT_FROZEN", "ACCEPTED", 0, None, None))
            con.execute("INSERT INTO audit(kind,actor,allowed,details) VALUES('accepted','alice',1,?)",
                        (encoded({"task_id": TASK, "at_ns": str(time.time_ns())}),))
        return 202, {"task_id": TASK, "status": "ACCEPTED", "artifact": None}
    if service and path in {"/work/" + TASK + "/" + action for action in ("start", "model", "gate", "complete")}:
        action = path.rsplit("/", 1)[-1]
        with db(folder / "tasks.sqlite") as con:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute("SELECT * FROM tasks WHERE id=?", (TASK,)).fetchone()
            if row is None:
                return 404, {"error": "task_not_found"}
            if method == "POST" and action == "start":
                if row["status"] != "SUCCEEDED":
                    con.execute("UPDATE tasks SET attempts=attempts+1,status='RUNNING' WHERE id=?", (TASK,))
            elif method == "POST" and action == "model":
                con.execute("UPDATE tasks SET model_result=?,stage='MODEL_READY' WHERE id=?", (encoded(body), TASK))
            elif method == "POST" and action == "gate":
                con.execute("INSERT INTO audit(kind,actor,allowed,details) VALUES('release_gate','worker',?,?)",
                            (int(not body["violations"]), encoded(body)))
            elif method == "POST" and action == "complete":
                con.execute("UPDATE tasks SET receipt=?,stage='REPORT_CONFIRMED',status='SUCCEEDED' WHERE id=?", (encoded(body), TASK))
                con.execute("INSERT INTO audit(kind,actor,allowed,details) VALUES('completed','worker',1,?)",
                            (encoded({"task_id": TASK, "at_ns": str(time.time_ns())}),))
            else:
                return 404, {"error": "work_action"}
            updated = dict(con.execute("SELECT * FROM tasks WHERE id=?", (TASK,)).fetchone())
        for key in ("source", "bundle", "model_result", "receipt"):
            updated[key] = json.loads(updated[key]) if updated[key] is not None else None
        return 200, updated
    if method == "GET" and path == "/reports/" + TARGET and identity:
        actor, tenant = identity
        with db(folder / "tasks.sqlite") as con:
            con.execute("BEGIN IMMEDIATE")
            row = con.execute("SELECT tenant FROM tasks WHERE id=?", (TASK,)).fetchone()
            grant = con.execute("SELECT report_read FROM grants WHERE actor=?", (actor,)).fetchone()
            allowed = bool(row and row["tenant"] == tenant and grant and grant[0])
            con.execute("INSERT INTO audit(kind,actor,allowed,details) VALUES('report_read',?,?,?)", (actor, int(allowed), TARGET))
        if not allowed:
            return 403, {"error": "report_read_denied"}
        receiver = load(folder / "endpoints.json")["receiver"]
        return http_json(receiver + "/reports/" + TARGET)
    return 404, {"error": "not_found"}


def receiver_dispatch(folder, method, path, body, token):
    if token != SERVICE:
        return 401, {"error": "service_identity"}
    if method == "POST" and path == "/effects":
        if set(body) != {"operation_id", "report"}:
            return 400, {"error": "effect_schema"}
        report = body["report"]
        if report["tenant"] != "A" or report["target"] != TARGET or report["task_id"] != TASK:
            return 403, {"error": "effect_scope"}
        op, intent = body["operation_id"], digest(report)
        with db(folder / "receiver.sqlite") as con:
            con.execute("BEGIN IMMEDIATE")
            old = con.execute("SELECT * FROM effects WHERE op=?", (op,)).fetchone()
            if old:
                if old["intent"] != intent:
                    return 409, {"error": "operation_conflict"}
                con.execute("INSERT INTO attempts(op,duplicate) VALUES(?,1)", (op,))
                return 200, {"receipt": json.loads(old["receipt"]), "duplicate": True}
            artifact = "artifact-" + hashlib.sha256(op.encode()).hexdigest()[:16]
            receipt = {"operation_id": op, "artifact_id": artifact, "content_sha256": intent}
            con.execute("INSERT INTO artifacts VALUES(?,?,?)", (artifact, encoded(report), intent))
            con.execute("INSERT INTO effects VALUES(?,?,?,?)", (op, intent, artifact, encoded(receipt)))
            con.execute("INSERT INTO publications VALUES(?,?,?) ON CONFLICT(tenant,target) DO UPDATE SET artifact=excluded.artifact",
                        ("A", TARGET, artifact))
            con.execute("INSERT INTO attempts(op,duplicate) VALUES(?,0)", (op,))
        # The report body, effect/receipt and visible pointer have committed together.
        return 201, {"receipt": receipt, "duplicate": False}
    if method == "GET" and path == "/reports/" + TARGET:
        with db(folder / "receiver.sqlite") as con:
            row = con.execute("SELECT a.* FROM publications p JOIN artifacts a ON a.id=p.artifact WHERE p.tenant='A' AND p.target=?", (TARGET,)).fetchone()
            if row is None:
                return 404, {"error": "not_published"}
            con.execute("INSERT INTO reads(artifact) VALUES(?)", (row["id"],))
        return 200, {"artifact_id": row["id"], "content_sha256": row["content_sha"], "report": json.loads(row["body"])}
    return 404, {"error": "not_found"}


def serve(folder, role):
    if role == "model":
        torch = torch_runtime()
        directory = folder / load(folder / "deployment.json")["bundle_directory"]
        manifest = load(directory / "manifest.json")
        if manifest["weights_sha256"] != file_sha(directory / "weights.pt") or manifest["config_sha256"] != file_sha(directory / "config.json"):
            raise ValueError("bundle_digest_mismatch")
        config = load(directory / "config.json")
        model = torch.nn.Linear(config["input"], config["output"], dtype=torch.float64)
        model.load_state_dict(torch.load(directory / "weights.pt", map_location="cpu", weights_only=True))
        model.eval()
        with db(folder / "model.sqlite") as con:
            con.execute("CREATE TABLE calls(seq INTEGER PRIMARY KEY,input TEXT,output REAL,bundle TEXT)")

        def dispatch(method, path, body, token):
            if token != SERVICE:
                return 401, {"error": "service_identity"}
            if method != "POST" or path != "/infer":
                return 404, {"error": "not_found"}
            if body["bundle_sha256"] != digest(manifest):
                return 409, {"error": "bundle_pin_mismatch"}
            values = body["values"]
            if len(values) != 2 or any(type(value) is not int for value in values):
                return 400, {"error": "two_integer_inputs"}
            with torch.no_grad():
                result = model(torch.tensor([values], dtype=torch.float64)).item()
            with db(folder / "model.sqlite") as con:
                con.execute("INSERT INTO calls(input,output,bundle) VALUES(?,?,?)", (encoded(values), result, encoded(manifest)))
            return 200, {"total": result, "bundle": manifest, "bundle_sha256": digest(manifest),
                         "input_sha256": digest(values), "device": "cpu", "dtype": "float64", "torch": torch.__version__}
    else:
        dispatch = lambda method, path, body, token: (api_dispatch if role == "api" else receiver_dispatch)(folder, method, path, body, token)
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.dispatch = dispatch
    save(folder / (role + "-ready.json"), {"url": "http://127.0.0.1:" + str(server.server_port), "pid": os.getpid()})
    try:
        server.serve_forever(poll_interval=0.05)
    finally:
        server.server_close()


def worker(folder, crash=False, fresh_operation=False, bypass_release_gate=False):
    endpoints = load(folder / "endpoints.json")
    task = rpc(endpoints["api"] + "/work/" + TASK + "/start", "POST", {})
    if task["status"] == "SUCCEEDED":
        return {"pid": os.getpid(), "already_complete": True, "task_id": TASK}
    if task["model_result"] is None:
        result = rpc(endpoints["model"] + "/infer", "POST", {"values": task["source"]["values"], "bundle_sha256": task["bundle_sha"]})
        if result["bundle"] != task["bundle"] or result["input_sha256"] != digest(task["source"]["values"]):
            raise ValueError("inference_identity_mismatch")
        task = rpc(endpoints["api"] + "/work/" + TASK + "/model", "POST", result)
    result = task["model_result"]
    # The normal release gate checks the task's frozen input/model and its declared
    # numerical content condition before any effect request is sent.
    authoritative_source = load(folder / "source.json")
    approved_manifest = load(folder / "approved" / "manifest.json")
    violations = []
    if task["source"] != authoritative_source or task["source_sha"] != file_sha(folder / "source.json"):
        violations.append("source_binding")
    if task["bundle"] != approved_manifest or result["bundle"] != approved_manifest:
        violations.append("model_binding")
    if result["input_sha256"] != digest(authoritative_source["values"]):
        violations.append("model_input_binding")
    if not math.isfinite(result["total"]) or result["total"] != sum(authoritative_source["values"]):
        violations.append("content_total")
    gate = {"mode": "bypassed_negative" if bypass_release_gate else "enforced", "violations": violations}
    rpc(endpoints["api"] + "/work/" + TASK + "/gate", "POST", gate)
    if violations and not bypass_release_gate:
        print(encoded({"pid": os.getpid(), "event": "release_gate_rejected", "gate": gate}), flush=True)
        os._exit(24)
    report = {"task_id": TASK, "tenant": task["tenant"], "target": task["target"], "total": result["total"],
              "source": {"id": task["source"]["id"], "version": task["source"]["version"], "sha256": task["source_sha"]},
              "model": task["bundle"], "input_sha256": result["input_sha256"]}
    # Deliberate negative: change the logical identity only when explicitly asked.
    operation = TASK + ":save" + (":retry-" + str(task["attempts"]) if fresh_operation else "")
    response = rpc(endpoints["receiver"] + "/effects", "POST", {"operation_id": operation, "report": report})
    if crash:
        print(encoded({"pid": os.getpid(), "event": "exit_after_receiver_commit_before_task_ack", "operation_id": operation, "receipt": response["receipt"]}), flush=True)
        os._exit(23)
    published = rpc(endpoints["receiver"] + "/reports/" + TARGET)
    if published["artifact_id"] != response["receipt"]["artifact_id"] or published["content_sha256"] != digest(report):
        raise ValueError("published_report_mismatch")
    rpc(endpoints["api"] + "/work/" + TASK + "/complete", "POST", response["receipt"])
    return {"pid": os.getpid(), "task_id": TASK, "operation_id": operation, "duplicate": response["duplicate"], "total": report["total"],
            "release_gate": gate, "operation_identity_bypassed": fresh_operation}


def independent_oracle(folder):
    # Read authoritative files and DB rows directly; no worker return value or trace input.
    source = load(folder / "source.json")
    contract = load(folder / "model-contract.json")
    approved = folder / "approved"
    approved_manifest = load(approved / "manifest.json")
    selected = folder / load(folder / "deployment.json")["bundle_directory"]
    selected_manifest = load(selected / "manifest.json")
    torch = torch_runtime()
    approved_weights = torch.load(approved / "weights.pt", map_location="cpu", weights_only=True)
    expected_total = sum(source["values"])
    with db(folder / "tasks.sqlite", True) as con:
        task = dict(con.execute("SELECT * FROM tasks WHERE id=?", (TASK,)).fetchone())
        audit = [dict(row) for row in con.execute("SELECT * FROM audit ORDER BY seq")]
    with db(folder / "receiver.sqlite", True) as con:
        effects = [dict(row) for row in con.execute("SELECT * FROM effects ORDER BY op")]
        artifacts = [dict(row) for row in con.execute("SELECT * FROM artifacts ORDER BY id")]
        publications = [dict(row) for row in con.execute("SELECT * FROM publications")]
        attempts = [dict(row) for row in con.execute("SELECT * FROM attempts ORDER BY seq")]
    with db(folder / "model.sqlite", True) as con:
        calls = [dict(row) for row in con.execute("SELECT * FROM calls ORDER BY seq")]
    reports = [json.loads(row["body"]) for row in artifacts]
    expected_source = {"id": source["id"], "version": source["version"], "sha256": file_sha(folder / "source.json")}
    artifact_digests = {row["id"]: row["content_sha"] for row in artifacts}
    effect_receipts = [json.loads(row["receipt"]) for row in effects]
    local_receipt = json.loads(task["receipt"]) if task["receipt"] else None
    checks = {
        "source_is_declared_task_input": source["tenant"] == "A" and source["values"] == [10, 27],
        "approved_weights_match_contract": torch.equal(approved_weights["weight"], torch.tensor(contract["weight"], dtype=torch.float64)) and torch.equal(approved_weights["bias"], torch.tensor(contract["bias"], dtype=torch.float64)),
        "approved_artifact_bytes": approved_manifest["weights_sha256"] == file_sha(approved / "weights.pt") and approved_manifest["config_sha256"] == file_sha(approved / "config.json"),
        "approved_config_matches_contract": load(approved / "config.json") == {"architecture": contract["architecture"], "input": 2, "output": 1, "dtype": contract["dtype"], "runtime": "torch==2.5.1"},
        "selected_bundle_is_approved": selected_manifest == approved_manifest and selected_manifest["bundle_id"] == contract["bundle_id"],
        "selected_artifact_bytes": selected_manifest["weights_sha256"] == file_sha(selected / "weights.pt") and selected_manifest["config_sha256"] == file_sha(selected / "config.json"),
        "frozen_task_input_and_model": task["id"] == contract["task_id"] and task["actor"] == "alice" and task["tenant"] == source["tenant"] and task["target"] == contract["target"] and json.loads(task["source"]) == source and task["source_sha"] == expected_source["sha256"] and json.loads(task["bundle"]) == approved_manifest and task["bundle_sha"] == digest(approved_manifest),
        "one_effect_and_artifact": len(effects) == len(artifacts) == contract["required_artifacts"],
        "one_published_target": len(publications) == 1 and publications[0]["tenant"] == "A" and publications[0]["target"] == contract["target"] and publications[0]["artifact"] in {row["id"] for row in artifacts},
        "actual_report_matches_source": bool(reports) and all(report["total"] == expected_total and report["source"] == expected_source and report["input_sha256"] == digest(source["values"]) for report in reports),
        "actual_report_uses_approved_model": bool(reports) and all(report["model"] == approved_manifest for report in reports),
        "task_and_target_match": bool(reports) and all(report["task_id"] == contract["task_id"] and report["target"] == contract["target"] and report["tenant"] == source["tenant"] for report in reports),
        "artifact_and_effect_digests": all(row["content_sha"] == digest(json.loads(row["body"])) for row in artifacts) and all(row["intent"] == artifact_digests.get(row["artifact"]) for row in effects),
        "effect_receipts_match_records": all(json.loads(row["receipt"]) == {"operation_id": row["op"], "artifact_id": row["artifact"], "content_sha256": row["intent"]} for row in effects),
        "local_completion_references_publication": task["status"] == "SUCCEEDED" and isinstance(local_receipt, dict) and local_receipt in effect_receipts and len(publications) == 1 and local_receipt.get("artifact_id") == publications[0]["artifact"],
        "real_model_call_recorded": len(calls) == 1 and json.loads(calls[0]["input"]) == source["values"] and json.loads(calls[0]["bundle"]) == selected_manifest and bool(reports) and all(calls[0]["output"] == report["total"] and json.loads(calls[0]["bundle"]) == report["model"] for report in reports),
    }
    return {"accepted": all(checks.values()), "checks": checks, "expected_total": expected_total,
            "actual_totals": [report["total"] for report in reports], "task_status": task["status"], "task_stage": task["stage"],
            "worker_attempts": task["attempts"], "model_calls": len(calls), "tool_attempts": len(attempts),
            "effect_count": len(effects), "artifact_count": len(artifacts), "publication_count": len(publications),
            "operations": [row["op"] for row in effects], "tool_attempt_records": attempts,
            "approved_model": approved_manifest, "selected_model": selected_manifest, "source": expected_source,
            "api_audit": audit}


class Supervisor:
    def __init__(self):
        self.deadline = time.monotonic() + 90
        self.processes = []
        self.reaped = []
        self.previous_alarm = signal.signal(signal.SIGALRM, self.expired)
        signal.setitimer(signal.ITIMER_REAL, 90)

    @staticmethod
    def expired(*_):
        raise TimeoutError("90 second suite supervision budget exhausted")

    def timeout(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("90 second suite supervision budget exhausted")
        return min(15, remaining)

    def start(self, folder, role):
        process = subprocess.Popen([sys.executable, "-B", str(Path(__file__).resolve()), "serve", "--folder", str(folder), "--role", role],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, start_new_session=True)
        self.processes.append(process)
        ready = folder / (role + "-ready.json")
        limit = time.monotonic() + self.timeout()
        while not ready.exists():
            if process.poll() is not None:
                raise RuntimeError(f"{role} exited: {process.stderr.read()}")
            if time.monotonic() >= limit:
                raise TimeoutError(role + " did not become ready")
            time.sleep(0.02)
        return load(ready)

    def run_worker(self, folder, **flags):
        args = [sys.executable, "-B", str(Path(__file__).resolve()), "worker", "--folder", str(folder)]
        args.extend("--" + name.replace("_", "-") for name, enabled in flags.items() if enabled)
        process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        self.processes.append(process)
        stdout, stderr = process.communicate(timeout=self.timeout())
        if process.returncode not in (0, 23, 24):
            raise RuntimeError(f"worker {process.returncode}: {stderr}")
        return {"exit_code": process.returncode, "result": json.loads(stdout)}

    def stop(self):
        for process in reversed(self.processes):
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=3)
            else:
                process.wait()
            for stream in (process.stdout, process.stderr):
                if stream:
                    stream.close()
            if process.pid not in self.reaped:
                self.reaped.append(process.pid)
        self.processes.clear()

    def close(self):
        # Cleanup is outside the workload alarm, including a timeout raised while
        # a per-case stop was already in progress. Repeated wait/close is safe.
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, self.previous_alarm)
        self.stop()


def case(folder, variant, supervisor):
    prepare(folder, variant)
    try:
        model = supervisor.start(folder, "model")
        receiver = supervisor.start(folder, "receiver")
        save(folder / "endpoints.json", {"model": model["url"], "receiver": receiver["url"]})
        api = supervisor.start(folder, "api")
        endpoints = load(folder / "endpoints.json")
        save(folder / "endpoints.json", {**endpoints, "api": api["url"]})
        submission = {"request_id": "submit-A-001", "source_id": "daily-values", "target": TARGET, "model_alias": "approved-sum"}
        accepted_status, accepted = http_json(api["url"] + "/tasks", "POST", submission, "fixture-user-A")
        assert accepted_status == 202 and accepted["status"] == "ACCEPTED" and accepted["artifact"] is None
        with db(folder / "receiver.sqlite", True) as con:
            effects_at_acceptance = con.execute("SELECT COUNT(*) FROM effects").fetchone()[0]
        assert effects_at_acceptance == 0
        duplicate_status, duplicate = http_json(api["url"] + "/tasks", "POST", submission, "fixture-user-A")
        assert duplicate_status == 200 and duplicate["task_id"] == accepted["task_id"]
        workers = []
        gap = None
        gate_refusal = None
        if variant in ("wrong_weights", "wrong_version"):
            refused = supervisor.run_worker(folder)
            assert refused["exit_code"] == 24
            with db(folder / "receiver.sqlite", True) as con:
                before_bypass = con.execute("SELECT COUNT(*) FROM effects").fetchone()[0]
            assert before_bypass == 0
            gate_refusal = {"worker": refused, "effects_before_bypass": before_bypass}
        if variant in ("recover_same_operation", "unsafe_new_operation"):
            workers.append(supervisor.run_worker(folder, crash_after_tool=True))
            assert workers[-1]["exit_code"] == 23
            with db(folder / "tasks.sqlite", True) as con:
                task = dict(con.execute("SELECT * FROM tasks").fetchone())
            with db(folder / "receiver.sqlite", True) as con:
                gap = {"task_status": task["status"], "task_stage": task["stage"], "local_receipt": task["receipt"],
                       "receiver_effects": con.execute("SELECT COUNT(*) FROM effects").fetchone()[0],
                       "published_reports": con.execute("SELECT COUNT(*) FROM publications").fetchone()[0]}
            assert gap == {"task_status": "RUNNING", "task_stage": "MODEL_READY", "local_receipt": None, "receiver_effects": 1, "published_reports": 1}
        workers.append(supervisor.run_worker(folder, fresh_operation=variant == "unsafe_new_operation",
                                              bypass_release_gate=variant in ("wrong_weights", "wrong_version")))
        assert workers[-1]["exit_code"] == 0
        state = independent_oracle(folder)
        expected_acceptance = variant in ("normal", "recover_same_operation", "read_authorization")
        assert state["accepted"] is expected_acceptance
        if variant == "recover_same_operation":
            assert state["worker_attempts"] == state["tool_attempts"] == 2 and state["effect_count"] == 1
            assert workers[0]["result"]["pid"] != workers[1]["result"]["pid"]
        if variant == "unsafe_new_operation":
            assert state["task_status"] == "SUCCEEDED" and state["effect_count"] == state["artifact_count"] == 2 and state["actual_totals"] == [37.0, 37.0]
        if variant == "wrong_weights":
            assert state["actual_totals"] == [38.0] and not state["checks"]["actual_report_matches_source"]
        if variant == "wrong_version":
            assert state["actual_totals"] == [37.0] and not state["checks"]["selected_bundle_is_approved"]
        read_status, visible = http_json(api["url"] + "/reports/" + TARGET, token="fixture-user-A")
        assert read_status == 200 and visible["report"]["total"] == state["actual_totals"][0]
        authorization = None
        if variant == "read_authorization":
            with db(folder / "receiver.sqlite", True) as con:
                reads_before = con.execute("SELECT COUNT(*) FROM reads").fetchone()[0]
            other_status, other = http_json(api["url"] + "/reports/" + TARGET, token="fixture-user-B")
            with db(folder / "tasks.sqlite") as con:
                con.execute("UPDATE grants SET report_read=0 WHERE actor='alice'")
            revoked_status, revoked = http_json(api["url"] + "/reports/" + TARGET, token="fixture-user-A")
            with db(folder / "receiver.sqlite", True) as con:
                reads_after = con.execute("SELECT COUNT(*) FROM reads").fetchone()[0]
            assert other_status == revoked_status == 403 and other == revoked == {"error": "report_read_denied"}
            assert reads_after == reads_before
            state = independent_oracle(folder)
            denied = [row for row in state["api_audit"] if row["kind"] == "report_read" and not row["allowed"]]
            assert [row["actor"] for row in denied] == ["bob", "alice"]
            authorization = {"initial_read": 200, "other_tenant": other_status, "revoked_actor": revoked_status,
                             "receiver_reads_before": reads_before, "receiver_reads_after": reads_after,
                             "denied_responses": [other, revoked], "artifact_retained": state["artifact_count"] == 1}
        # Completed work is a no-op on another process; no extra inference/effect.
        before_repeat = (state["worker_attempts"], state["model_calls"], state["tool_attempts"], state["effect_count"])
        repeated = supervisor.run_worker(folder)
        after_repeat = independent_oracle(folder)
        assert before_repeat == (after_repeat["worker_attempts"], after_repeat["model_calls"], after_repeat["tool_attempts"], after_repeat["effect_count"])
        return {"accepted_http_status": accepted_status, "accepted_response": accepted, "effects_at_acceptance": effects_at_acceptance,
                "submission_retry": duplicate, "services": {"api": api, "model": model, "receiver": receiver},
                "workers": workers, "commit_gap": gap, "gate_refusal": gate_refusal, "oracle": state, "authorization": authorization,
                "completed_repeat": repeated, "completed_repeat_unchanged": True}
    finally:
        supervisor.stop()


def suite(root):
    supervisor = Supervisor()
    try:
        cases = {name: case(root / name, name, supervisor) for name in
                 ("normal", "recover_same_operation", "unsafe_new_operation", "read_authorization", "wrong_weights", "wrong_version")}
        capacity = {"arrival_and_completion_tasks_per_second": 2, "end_to_end_seconds": 30,
                    "queue_and_other_wait_seconds": 10, "slot_occupancy_seconds_per_task": 20,
                    "mean_in_system": 2 * 30, "mean_busy_slots": 2 * 20,
                    "slots_for_70_percent_target": math.ceil(2 * 20 / 0.7),
                    "utilization_at_64_slots": 2 * 20 / 64, "ideal_slot_capacity_tasks_per_second": 64 / 20,
                    "scope": "independent declared steady-state arithmetic, not measured HTTP/model latency or a load test"}
        return {"schema": "integrated-service-v1", "status": "passed", "environment": {"python": platform.python_version(),
                "torch": torch_runtime().__version__, "sqlite": sqlite3.sqlite_version, "platform": platform.system(), "device": "cpu"},
                "cases": cases, "capacity": capacity, "cleanup": {"all_children_reaped": True, "owned_process_groups_only": True,
                "reaped_count": len(supervisor.reaped), "supervision_seconds": 90},
                "scope": "single host, public identity fixture, fixed plan, CPU Linear inference, loopback HTTP and independent SQLite domains; no LLM/training/GPU/Kairo, production authentication, concurrent workers, fencing or power-loss durability"}
    finally:
        supervisor.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("suite", "serve", "worker", "oracle"), nargs="?", default="suite")
    parser.add_argument("--folder", type=Path)
    parser.add_argument("--role", choices=("api", "model", "receiver"))
    parser.add_argument("--output-dir", type=Path, help="must not exist; keeps only this experiment's files")
    parser.add_argument("--crash-after-tool", action="store_true")
    parser.add_argument("--fresh-operation", action="store_true")
    parser.add_argument("--bypass-release-gate", action="store_true", help="deliberate negative only")
    args = parser.parse_args()
    if args.command == "serve":
        serve(args.folder.resolve(), args.role)
    elif args.command == "worker":
        print(encoded(worker(args.folder.resolve(), args.crash_after_tool, args.fresh_operation, args.bypass_release_gate)))
    elif args.command == "oracle":
        print(encoded(independent_oracle(args.folder.resolve())))
    elif args.output_dir:
        args.output_dir.mkdir(parents=True, exist_ok=False)
        result = suite(args.output_dir.resolve())
        result["cleanup"]["temporary_directories"] = "retained_by_request"
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        with tempfile.TemporaryDirectory(prefix="infra-integrated-service-") as temp:
            result = suite(Path(temp))
        result["cleanup"]["temporary_directories"] = "removed"
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
