"""Run an actual Qdrant collection and a separate authoritative SQLite source."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import platform
import socket
import sqlite3
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

VERSION = "1.19.1"
COLLECTION = "/collections/evidence"
HERE = Path(__file__).resolve().parent
OPENER = build_opener(ProxyHandler({}))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class Index:
    def __init__(self, port):
        self.base = f"http://127.0.0.1:{port}"
        self.exchanges = []

    def request(self, label, method, path, body=None):
        if body is not None:
            body_bytes = json.dumps(body, separators=(",", ":")).encode()
        else:
            body_bytes = None
        req = Request(self.base + path, method=method, data=body_bytes,
                      headers={"Content-Type": "application/json"})
        try:
            with OPENER.open(req, timeout=3) as response:
                result = json.load(response)
                self.exchanges.append({"label": label, "method": method, "path": path,
                                       "request": body, "http_status": response.status, "response": result})
        except HTTPError as error:
            raise RuntimeError(f"{method} {path}: HTTP {error.code} {error.read().decode()}") from error
        return result

    def wait_ready(self, process, log_path):
        for _ in range(150):
            if process.poll() is not None:
                raise RuntimeError(log_path.read_text(encoding="utf-8"))
            try:
                result = self.request("engine", "GET", "/")
                if result.get("version") != VERSION:
                    raise ValueError(f"expected Qdrant {VERSION}, got {result}")
                return result
            except (URLError, TimeoutError):
                time.sleep(0.1)
        raise RuntimeError(log_path.read_text(encoding="utf-8"))

    def upsert(self, label, sources):
        points = [{"id": row["id"], "vector": row["vector"],
                   "payload": {"tenant": row["tenant"], "eligible": row["eligible"],
                               "source_version": row["version"]}} for row in sources]
        self.request(label, "PUT", COLLECTION + "/points?wait=true", {"points": points})

    def query(self, label, vector, limit, tenant=None, eligible=False):
        body = {"query": vector, "limit": limit, "params": {"exact": True},
                "with_vector": False, "with_payload": ["tenant", "eligible", "source_version"]}
        conditions = []
        if tenant is not None:
            conditions.append({"key": "tenant", "match": {"value": tenant}})
        if eligible:
            conditions.append({"key": "eligible", "match": {"value": True}})
        if conditions:
            body["filter"] = {"must": conditions}
        return self.request(label, "POST", COLLECTION + "/points/query", body)["result"]["points"]


def source_open(path, sources):
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE sources (
          id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, eligible INTEGER NOT NULL,
          version INTEGER NOT NULL, amount INTEGER NOT NULL
        );
        CREATE TABLE body_reads (
          ordinal INTEGER PRIMARY KEY, scenario TEXT NOT NULL, source_id INTEGER NOT NULL,
          source_version INTEGER NOT NULL, amount INTEGER NOT NULL
        );
    """)
    with db:
        db.executemany("INSERT INTO sources VALUES (:id,:tenant,:eligible,:version,:amount)", sources)
    return db


def assemble(db, scenario, hits, tenant, needed):
    audit, evidence = [], []
    with db:
        db.execute("BEGIN IMMEDIATE")
        for hit in hits:
            key = hit["id"]
            indexed = hit["payload"]
            header = db.execute("SELECT tenant,eligible,version FROM sources WHERE id=?", (key,)).fetchone()
            current = None
            if header:
                current = {"tenant": header[0], "eligible": bool(header[1]), "version": header[2]}
            if current is None:
                decision = "missing"
            elif current["tenant"] != tenant:
                decision = "wrong_tenant"
            elif not current["eligible"]:
                decision = "revoked"
            elif current["version"] != indexed["source_version"]:
                decision = "stale_version"
            else:
                decision = "delivered"
                amount, = db.execute("SELECT amount FROM sources WHERE id=?", (key,)).fetchone()
                proof = {"id": key, "version": current["version"], "amount": amount}
                evidence.append(proof)
                db.execute("INSERT INTO body_reads(scenario,source_id,source_version,amount) VALUES (?,?,?,?)",
                           (scenario, key, current["version"], amount))
            audit.append({"id": key, "index_version": indexed["source_version"],
                          "authoritative_header": current, "decision": decision})
            if len(evidence) == needed:
                break
    return {"candidate_ids": [hit["id"] for hit in hits], "decisions": audit,
            "evidence": evidence, "status": "ready" if len(evidence) == needed else "insufficient"}


def execute(index, db, fixture):
    index.request("collection", "PUT", COLLECTION, {"vectors": {"size": 2, "distance": "Dot"}})
    for field, schema in (("tenant", "keyword"), ("eligible", "bool")):
        index.request("payload_index_" + field, "PUT", COLLECTION + "/index?wait=true",
                      {"field_name": field, "field_schema": schema})
    index.upsert("initial_index", fixture["sources"])
    index.request("collection_info", "GET", COLLECTION)
    vector, tenant, needed = fixture["query"], fixture["tenant"], fixture["required_evidence"]
    global_hits = index.query("global_k2", vector, 2)
    tenant_hits = index.query("tenant_k2", vector, 2, tenant)
    cases = {}
    initial = index.query("baseline_k2", vector, 2, tenant, eligible=True)
    cases["baseline_k2"] = assemble(db, "baseline_k2", initial, tenant, needed)
    # Keep the already returned hits, then change only the authority before they are used again.
    retained = index.query("retained_k2", vector, 2, tenant, eligible=True)
    change = fixture["authority_change"]
    revised = change["revise"]
    with db:
        db.execute("UPDATE sources SET eligible=0 WHERE id=?", (change["revoke"],))
        db.execute("UPDATE sources SET version=?, amount=? WHERE id=?",
                   (revised["version"], revised["amount"], revised["id"]))
    cases["retained_k2"] = assemble(db, "retained_k2", retained, tenant, needed)
    widened = index.query("stale_k4", vector, 4, tenant, eligible=True)
    cases["stale_k4"] = assemble(db, "stale_k4", widened, tenant, needed)
    revoked, old = [next(row for row in fixture["sources"] if row["id"] == key)
                    for key in (change["revoke"], revised["id"])]
    index.upsert("refresh_index", [{**revoked, "eligible": False}, {**old, **revised}])
    refreshed = index.query("refreshed_k2", vector, 2, tenant, eligible=True)
    cases["refreshed_k2"] = assemble(db, "refreshed_k2", refreshed, tenant, needed)
    filtered_global = [hit["id"] for hit in global_hits
                       if hit["payload"]["tenant"] == tenant and hit["payload"]["eligible"]]
    observed = [[(row["id"], row["version"], row["amount"]) for row in case["evidence"]]
                for case in cases.values()]
    expected = [[(101, 1, 10), (102, 1, 27)], [(101, 1, 10)],
                [(101, 1, 10), (104, 1, 7)], [(101, 1, 10), (103, 2, 42)]]
    if observed != expected or filtered_global:
        raise RuntimeError(f"unexpected delivery results: {observed}; global postfilter: {filtered_global}")
    return {"global_top2": [hit["id"] for hit in global_hits], "postfiltered_global_top2": filtered_global,
            "tenant_only_top2": [hit["id"] for hit in tenant_hits], "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qdrant", type=Path, required=True, help="fixed official Qdrant executable")
    parser.add_argument("--output", type=Path, required=True, help="new output directory")
    args = parser.parse_args()
    binary = args.qdrant.resolve(strict=True)
    fixture = json.loads((HERE / "source.json").read_text(encoding="utf-8"))
    out = args.output.resolve()
    out.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix="qdrant-evidence-") as folder:
        temp = Path(folder)
        port = free_port()
        config = temp / "config.yaml"
        config.write_text(
            "cluster:\n  enabled: false\n"
            "service:\n  host: 127.0.0.1\n"
            f"  http_port: {port}\n  grpc_port: null\n  max_workers: 1\n"
            f"storage:\n  storage_path: {json.dumps(str(temp / 'storage'))}\n"
            f"  snapshots_path: {json.dumps(str(temp / 'snapshots'))}\n",
            encoding="utf-8",
        )
        log_path = temp / "engine.log"
        # Keep the loopback listener and telemetry settings explicit at process startup.
        env = {k: v for k, v in os.environ.items() if not k.startswith("QDRANT__")}
        env.update({"QDRANT__SERVICE__HOST": "127.0.0.1", "QDRANT__SERVICE__HTTP_PORT": str(port)})
        with log_path.open("wb") as log:
            process = subprocess.Popen([binary, "--disable-telemetry", "--config-path", config],
                                       cwd=temp, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                index = Index(port)
                identity = index.wait_ready(process, log_path)
                with closing(source_open(out / "authority.sqlite", fixture["sources"])) as db:
                    result = execute(index, db, fixture)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=10)
    write_json(out / "exchanges.json", index.exchanges)
    write_json(out / "validation.json", {
        "status": "passed",
        "scope": "native local exact vector query, indexed payload filters, source-level version and authorization gate",
        "environment": {"system": platform.system(), "machine": platform.machine(), "python": platform.python_version(),
                        "sqlite": sqlite3.sqlite_version, "qdrant": identity, "qdrant_binary_sha256": digest(binary)},
        "source_sha256": {name: digest(HERE / name) for name in ("qdrant_retrieval.py", "source.json")},
        "raw_sha256": {name: digest(out / name) for name in ("exchanges.json", "authority.sqlite")},
        **result,
    })


if __name__ == "__main__":
    main()
