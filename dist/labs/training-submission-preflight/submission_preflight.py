"""Run local admission and one real child update from pinned input bytes."""
import base64
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import tempfile


SOURCE = Path(__file__).resolve()
DATA_V1 = b"[[1,3],[2,6]]\n"
DATA_V2 = b"[[1,4],[2,8]]\n"
BASE_V1 = b'{"weight":1}\n'
BASE_V2 = b'{"weight":9}\n'
FILES = {"data_sha256": "dataset.json", "base_sha256": "base.json"}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def manifest(data):
    return {
        "format": "local-run-v1", "code_sha256": sha(SOURCE.read_bytes()),
        "data_sha256": sha(data), "base_sha256": sha(BASE_V1), "learning_rate": "1/8",
    }


def init_db(db):
    db.execute("""
        CREATE TABLE runs(
            id INTEGER PRIMARY KEY,
            tenant TEXT NOT NULL,
            idem_key TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            state TEXT NOT NULL,
            worker_result TEXT,
            UNIQUE(tenant, idem_key)
        )
    """)


def as_run_id(row_id):
    return f"run-{row_id:03d}"


def submit(db, root, tenant, key, manifest_path):
    raw = manifest_path.read_bytes()
    contract = json.loads(raw)
    fingerprint = sha(canonical(contract))
    identity = {"manifest_raw_sha256": sha(raw), "contract_sha256": fingerprint}
    if (type(contract) is not dict or set(contract) != set(manifest(DATA_V1))
            or contract["format"] != "local-run-v1" or contract["learning_rate"] != "1/8"):
        return {**identity, "outcome": "contract_invalid"}

    with db:
        # Serialize the lookup and claim for this key in the local database.
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT id,fingerprint,state FROM runs WHERE tenant=? AND idem_key=?",
                              (tenant, key)).fetchone()
        if existing:
            row_id, prior_fingerprint, state = existing
            if fingerprint != prior_fingerprint:
                return {**identity, "outcome": "intent_conflict", "run_id": as_run_id(row_id)}
            return {**identity, "outcome": "reused", "run_id": as_run_id(row_id), "state": state}

        actual_code = sha(SOURCE.read_bytes())
        if actual_code != contract["code_sha256"]:
            return {**identity, "outcome": "code_digest_mismatch",
                    "actual_sha256": actual_code, "expected_sha256": contract["code_sha256"]}

        verified = {}
        for field, filename in FILES.items():
            data = (root / filename).read_bytes()
            actual = sha(data)
            if actual != contract[field]:
                return {**identity, "outcome": "input_digest_mismatch", "file": filename,
                        "actual_sha256": actual, "expected_sha256": contract[field], "size": len(data)}
            verified[filename] = base64.b64encode(data).decode("ascii")
        cursor = db.execute("INSERT INTO runs(tenant,idem_key,fingerprint,state) VALUES(?,?,?,'accepted')",
                            (tenant, key, fingerprint))
        row_id = cursor.lastrowid

    run_id = as_run_id(row_id)
    # The worker receives the exact bytes already verified. It never reopens the input paths.
    payload = {"run_id": run_id, "contract": contract, "verified": verified}
    worker = subprocess.run(
        [sys.executable, "-B", str(SOURCE), "--worker", str(root / "worker.jsonl")],
        input=canonical(payload), capture_output=True, check=False, timeout=10,
    )
    with db:
        db.execute("UPDATE runs SET state=?,worker_result=? WHERE id=?",
                   ("completed" if worker.returncode == 0 else "worker_failed",
                    worker.stdout.decode() if worker.returncode == 0 else None, row_id))
    worker.check_returncode()
    return {**identity, "outcome": "launched", "run_id": run_id,
            "attempt_id": run_id + "/attempt-1", "worker": json.loads(worker.stdout)}


def worker_main(witness):
    payload = json.load(sys.stdin)
    attempt = payload["run_id"] + "/attempt-1"
    with witness.open("a", encoding="utf-8") as log:
        log.write(json.dumps({"attempt_id": attempt}) + "\n")
    contract = payload["contract"]
    data = {name: base64.b64decode(raw, validate=True) for name, raw in payload["verified"].items()}
    observed = {field: sha(data[name]) for field, name in FILES.items()}
    assert all(contract[field] == value for field, value in observed.items())
    assert contract["code_sha256"] == sha(SOURCE.read_bytes())

    weight = Fraction(json.loads(data["base.json"])["weight"])
    samples = json.loads(data["dataset.json"])
    # Derivative of mean((weight * x - target) ** 2 / 2).
    gradient = sum((weight * x - target) * x for x, target in samples) / len(samples)
    updated = weight - Fraction(contract["learning_rate"]) * gradient
    print(json.dumps({"observed": observed, "samples": len(samples), "initial_weight": str(weight),
                      "gradient": str(gradient), "updated_weight": str(updated)}))


def demo():
    with tempfile.TemporaryDirectory(prefix="training-submission-") as temp:
        root = Path(temp)
        witness = root / "worker.jsonl"
        data_file = root / "dataset.json"
        model_file = root / "base.json"
        request = root / "manifest.json"
        request.write_bytes(canonical(manifest(DATA_V1)))
        data_file.write_bytes(DATA_V1)
        model_file.write_bytes(BASE_V1)
        db = sqlite3.connect(root / "runs.sqlite")
        init_db(db)
        cases = {}

        def run(name, key):
            result = submit(db, root, "team-a", key, request)
            launches = witness.read_text().splitlines() if witness.exists() else []
            cases[name] = {**result, "worker_starts_total": len(launches)}

        run("initial", "train-daily")
        run("identical_retry", "train-daily")
        request.write_text(json.dumps(manifest(DATA_V1), indent=2) + "\n", encoding="utf-8")
        run("formatted_retry", "train-daily")
        data_file.write_bytes(DATA_V2)
        run("stale_data", "next-key")
        data_file.write_bytes(DATA_V1)
        model_file.write_bytes(BASE_V2)
        run("stale_base", "next-key")
        model_file.write_bytes(BASE_V1)
        wrong_code = {**manifest(DATA_V1), "code_sha256": "0" * 64}
        request.write_bytes(canonical(wrong_code))
        run("stale_code", "next-key")
        data_file.write_bytes(DATA_V2)
        request.write_bytes(canonical(manifest(DATA_V2)))
        run("changed_manifest_old_key", "train-daily")
        run("changed_manifest_new_key", "next-key")
        run("new_run_retry", "next-key")

        ledger = [
            {"run_id": as_run_id(row_id), "tenant": tenant, "key": key, "contract_sha256": fingerprint,
             "state": state, "worker": json.loads(worker)}
            for row_id, tenant, key, fingerprint, state, worker in db.execute(
                "SELECT id,tenant,idem_key,fingerprint,state,worker_result FROM runs ORDER BY id")
        ]
        db.close()
        starts = [json.loads(line) for line in witness.read_text().splitlines()]

    assert [case["outcome"] for case in cases.values()] == [
        "launched", "reused", "reused", "input_digest_mismatch", "input_digest_mismatch",
        "code_digest_mismatch", "intent_conflict", "launched", "reused",
    ]
    assert [case["worker_starts_total"] for case in cases.values()] == [1, 1, 1, 1, 1, 1, 1, 2, 2]
    assert [row["worker"]["updated_weight"] for row in ledger] == ["13/8", "31/16"]
    print(json.dumps({
        "status": "passed", "source_sha256": {SOURCE.name: sha(SOURCE.read_bytes())},
        "environment": {"python": platform.python_version(), "system": platform.system(),
                        "machine": platform.machine(), "sqlite": sqlite3.sqlite_version},
        "cases": cases, "ledger": ledger, "worker_starts": starts,
    }, indent=2))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--worker":
        worker_main(Path(sys.argv[2]))
    else:
        demo()
