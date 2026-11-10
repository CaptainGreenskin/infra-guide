"""Run actual FTS5 retrieval and local generation against a separate current-source oracle."""

import argparse
from contextlib import closing, contextmanager
import hashlib
from http.client import HTTPConnection, HTTPException
import json
from pathlib import Path
import platform
import socket
import sqlite3
import subprocess
import time


HERE = Path(__file__).resolve().parent
FIXTURE = json.loads((HERE / "fixture.json").read_text(encoding="utf8"))
ASSETS = json.loads((HERE / "assets.json").read_text(encoding="utf8"))
ALIAS = "local-qwen"
FLAGS = ["--n-gpu-layers", "0", "--threads", "4", "--ctx-size", "2048", "--parallel", "1", "--jinja",
         "--reasoning-budget", "0", "--chat-template-kwargs", '{"enable_thinking":false}', "--alias", ALIAS]
SCHEMA = {"type": "object", "properties": {"status": {"type": "string", "enum": ["ok", "insufficient_evidence"]},
          "total": {"type": ["integer", "null"]}, "citations": {"type": "array", "items": {"type": "string"}}},
          "required": ["status", "total", "citations"], "additionalProperties": False}
CASES = [("fresh", "fresh", True), ("stale-unchecked", "stale", False), ("stale-guarded", "stale", True)]


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def connect(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    return db


def current(source):
    return {row["source_id"]: row["version"] for row in source.execute("SELECT * FROM current ORDER BY source_id")}


def to_body(row):
    return {"reference": row["source_id"] + "/" + row["version"], "category": row["category"], "amount": row["amount"]}


def snapshot(index, source, name):
    documents = source.execute("SELECT d.* FROM documents d JOIN current c USING(source_id,version) ORDER BY d.source_id")
    with index:
        index.executemany("INSERT INTO search VALUES(?,?,?,?,?,?)", ((name, row["source_id"], row["version"], row["tenant"],
                           row["search_text"], json.dumps(to_body(row), ensure_ascii=False)) for row in documents))


def prepare(source, index):
    with source:
        source.executescript("""
            CREATE TABLE documents(source_id TEXT,version TEXT,tenant TEXT,category TEXT,amount INTEGER,search_text TEXT,
                                   PRIMARY KEY(source_id,version));
            CREATE TABLE current(source_id TEXT PRIMARY KEY,version TEXT);
        """)
        source.executemany("INSERT INTO documents VALUES(:source_id,:version,:tenant,:category,:amount,:search_text)", FIXTURE["documents"])
        source.executemany("INSERT INTO current VALUES(?,?)", FIXTURE["initial_current"].items())
    index.execute("CREATE VIRTUAL TABLE search USING fts5(snapshot UNINDEXED,source_id UNINDEXED,version UNINDEXED,"
                  "tenant UNINDEXED,search_text,body UNINDEXED,tokenize='unicode61')")
    before = current(source)
    snapshot(index, source, "stale")
    with source:
        source.execute("UPDATE current SET version=:version WHERE source_id=:source_id", FIXTURE["source_update"])
    snapshot(index, source, "fresh")
    return {"before": before, "after": current(source)}


def retrieve(index, snapshot_name, tenant=None):
    sql = "SELECT rowid,source_id,version,tenant,bm25(search) AS score FROM search WHERE search MATCH ? AND snapshot=?"
    arguments = [FIXTURE["query"], snapshot_name]
    if tenant is not None:
        sql += " AND tenant=?"
        arguments.append(tenant)
    return [dict(row) for row in index.execute(sql + " ORDER BY score,source_id", arguments)]


def collect(source, index, candidates, checked):
    supplied, excluded = [], []
    for candidate in candidates:
        if checked:
            current_row = source.execute("SELECT d.* FROM documents d JOIN current c USING(source_id,version)"
                                         " WHERE d.source_id=? AND d.tenant=?",
                                         (candidate["source_id"], FIXTURE["tenant"])).fetchone()
            if current_row is None or current_row["version"] != candidate["version"]:
                excluded.append({"reference": candidate["source_id"] + "/" + candidate["version"],
                                 "reason": "source_version_changed" if current_row else "source_not_visible",
                                 "current_version": current_row["version"] if current_row else None})
                continue
            supplied.append(to_body(current_row))
        else:
            [(body,)] = index.execute("SELECT body FROM search WHERE rowid=?", (candidate["rowid"],)).fetchall()
            supplied.append(json.loads(body))
    supplied.sort(key=lambda row: FIXTURE["required_categories"].index(row["category"]))
    return supplied, excluded


def http(port, method, path, body=None):
    with closing(HTTPConnection("127.0.0.1", port, timeout=15)) as connection:
        payload = json.dumps(body, ensure_ascii=False).encode() if body else None
        connection.request(method, path, payload, {"Content-Type": "application/json"})
        response = connection.getresponse()
        return {"status": response.status, "response": json.loads(response.read())}


@contextmanager
def engine(server, model, directory):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    with (directory / "engine.log").open("wb") as log:
        process = subprocess.Popen([str(server), "--model", str(model), "--host", "127.0.0.1", "--port", str(port), *FLAGS],
                                   stdout=log, stderr=log)
        try:
            for _ in range(180):
                if process.poll() is not None:
                    raise RuntimeError(f"llama-server exited before ready: {process.returncode}")
                try:
                    if http(port, "GET", "/health")["status"] == 200:
                        break
                except (OSError, HTTPException):
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("llama-server did not become ready")
            yield port, process.pid
        finally:
            process.terminate()
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def generate(port, docs):
    prompt = FIXTURE["question"] + "\n资料：\n" + json.dumps(docs, ensure_ascii=False, separators=(",", ":"))
    body = {"model": ALIAS, "messages": [{"role": "system", "content": FIXTURE["system_prompt"]},
                                        {"role": "user", "content": prompt}],
            "temperature": 0, "seed": 17, "max_tokens": 96,
            "response_format": {"type": "json_schema", "json_schema": {"name": "report_answer", "strict": True, "schema": SCHEMA}}}
    response = http(port, "POST", "/v1/chat/completions", body)
    if response["status"] != 200:
        raise RuntimeError(response)
    assert response["response"]["system_fingerprint"] == "b12110-cd959bae9"
    [choice] = response["response"]["choices"]
    return {"request": body, **response}, json.loads(choice["message"]["content"])


def expected_from_source(source):
    rows = source.execute("SELECT d.* FROM documents d JOIN current c USING(source_id,version)"
                          " WHERE d.tenant=? ORDER BY d.source_id", (FIXTURE["tenant"],))
    docs = [to_body(row) for row in rows]
    return {"total": sum(doc["amount"] for doc in docs), "citations": sorted(doc["reference"] for doc in docs)}


def grade(answer, supplied, authority):
    errors = []
    if answer["status"] != "ok" or answer["total"] != authority["total"]:
        errors.append("wrong_total_or_status")
    if sorted(answer["citations"]) != authority["citations"]:
        errors.append("citation_not_current")
    if not set(answer["citations"]) <= {doc["reference"] for doc in supplied}:
        errors.append("citation_not_supplied")
    return {"status": "rejected" if errors else "accepted", "errors": errors}


def execute(source, index, port):
    result = {}
    for name, snapshot_name, checked in CASES:
        candidates = retrieve(index, snapshot_name, FIXTURE["tenant"])
        docs, excluded = collect(source, index, candidates, checked)
        if {row["category"] for row in docs} == set(FIXTURE["required_categories"]):
            model_http, answer = generate(port, docs)
            oracle = grade(answer, docs, expected_from_source(source))
        else:
            model_http, answer = None, {"status": "insufficient_evidence", "total": None, "citations": []}
            oracle = {"status": "withheld", "errors": []}
        result[name] = {"snapshot": snapshot_name, "checked_source": checked, "candidates": candidates, "supplied": docs,
                        "excluded": excluded, "model_http": model_http, "answer": answer, "oracle": oracle}
    return result


def verify(record):
    cases = record["cases"]
    assert record["versions"]["before"]["a-adjust"] == "v2" and record["versions"]["after"]["a-adjust"] == "v3"
    assert record["authority"] == {"total": 37, "citations": ["a-adjust/v3", "a-base/v1"]}
    assert all(any(row["tenant"] == "B" for row in rows) for rows in record["unscoped_candidates"].values())
    for row in cases.values():
        assert [candidate["tenant"] for candidate in row["candidates"]] == ["A", "A"]
    for label, version in (("fresh", "v3"), ("stale-unchecked", "v2")):
        row = cases[label]
        assert row["answer"]["status"] == "ok" and row["answer"]["total"] == 37
        assert sorted(row["answer"]["citations"]) == [f"a-adjust/{version}", "a-base/v1"]
        assert row["model_http"]["status"] == 200 and row["excluded"] == []
        exchange = row["model_http"]
        material = json.dumps([exchange["request"], exchange["response"]["choices"][0]["message"]])
        assert all(marker not in material for marker in ("b-private", "999"))
    assert cases["fresh"]["oracle"] == {"status": "accepted", "errors": []}
    assert cases["stale-unchecked"]["oracle"] == {"status": "rejected", "errors": ["citation_not_current"]}
    guarded = cases["stale-guarded"]
    assert guarded["excluded"] == [{"reference": "a-adjust/v2", "reason": "source_version_changed", "current_version": "v3"}]
    assert guarded["supplied"] == [{"reference": "a-base/v1", "category": "基础", "amount": 10}]
    assert guarded["model_http"] is None and guarded["answer"] == {"status": "insufficient_evidence", "total": None, "citations": []}
    assert guarded["oracle"] == {"status": "withheld", "errors": []}
    assert record["model_request_count"] == 2


def run(directory, server, model):
    assert model.stat().st_size == ASSETS["model"]["bytes"] and digest(model) == ASSETS["model"]["sha256"]
    assert digest(server) == ASSETS["engine"]["binary_sha256"]
    directory.mkdir(parents=True, exist_ok=False)
    with closing(connect(directory / "sources.sqlite")) as source, closing(connect(directory / "index.sqlite")) as index:
        versions = prepare(source, index)
        unscoped = {name: retrieve(index, name) for name in ("stale", "fresh")}
        with engine(server, model, directory) as (port, engine_pid):
            cases = execute(source, index, port)
        authority = expected_from_source(source)
    files = ("rag_lab.py", "fixture.json", "assets.json", "README.md")
    record = {"schema": "rag-citation-oracle-v1", "status": "passed", "assets": ASSETS, "engine_flags": FLAGS,
              "environment": {"python": platform.python_version(), "platform": platform.system(),
                              "architecture": platform.machine(), "sqlite": sqlite3.sqlite_version}, "engine_pid": engine_pid,
              "versions": versions, "unscoped_candidates": unscoped, "authority": authority, "cases": cases,
              "model_request_count": sum(case["model_http"] is not None for case in cases.values()),
              "source_sha256": {name: digest(HERE / name) for name in files}}
    observed = directory / "observed.json"
    observed.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    verify(record)
    observed.replace(directory / "validation.json")
    print(json.dumps({label: row["oracle"]["status"] for label, row in cases.items()}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--server", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    args = parser.parse_args()
    run(args.output_dir.resolve(), args.server.resolve(), args.model.resolve())
