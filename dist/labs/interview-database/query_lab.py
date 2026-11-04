"""Reproduce the job-list query plans and the two-connection WAL exercise.

Run with Python 3: python3 query_lab.py
The database is created in a temporary directory and removed on exit.
"""
from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory

QUERY = """SELECT id, created_at FROM jobs
           WHERE tenant_id = ? AND state = ?
           ORDER BY created_at DESC, id DESC LIMIT 5"""
TENANT = 7
PARAMS = (TENANT, "queued")


def sample_rows():
    # Duplicate timestamps make the id tie-break observable.
    for job_id in range(1, 16001):
        yield (job_id, job_id % 32,
               "done" if job_id % 3 == 0 else "queued", job_id // 100)


def read_plan(db, label, expected):
    details = [row[3] for row in db.execute("EXPLAIN QUERY PLAN " + QUERY, PARAMS)]
    rows = list(db.execute(QUERY, PARAMS))
    if rows != expected:
        raise AssertionError((label, rows, expected))
    return {"stage": label, "plan": details, "result_ids": [row[0] for row in rows]}


def snapshot_observations(writer, reader, job_id):
    def state(conn):
        return conn.execute("SELECT state FROM jobs WHERE id = ?", (job_id,)).fetchone()[0]

    reader.execute("BEGIN")
    first = state(reader)  # Pin a snapshot before the other connection commits.
    writer.execute("BEGIN IMMEDIATE")
    writer.execute("UPDATE jobs SET state='running' WHERE id=?", (job_id,))
    writer.execute("COMMIT")
    same_transaction = state(reader)
    reader.execute("COMMIT")
    reader.execute("BEGIN")
    next_transaction = state(reader)
    reader.execute("COMMIT")
    observed = [first, same_transaction, next_transaction]
    if observed != ["queued", "queued", "running"]:
        raise AssertionError(observed)
    return observed


def experiment():
    with TemporaryDirectory(prefix="infraguide-sql-") as temp:
        path = Path(temp) / "jobs.sqlite"
        with closing(sqlite3.connect(path, isolation_level=None, cached_statements=0)) as writer:
            mode = writer.execute("PRAGMA journal_mode=WAL").fetchone()[0]
            if mode != "wal":
                raise RuntimeError("This exercise needs a local filesystem with SQLite WAL support.")
            writer.execute("""CREATE TABLE jobs(
                id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL,
                state TEXT NOT NULL, created_at INTEGER NOT NULL)""")
            rows = list(sample_rows())
            writer.execute("BEGIN")
            writer.executemany("INSERT INTO jobs VALUES (?, ?, ?, ?)", rows)
            writer.execute("COMMIT")
            matches = [(job_id, created) for job_id, tenant, status, created in rows
                       if tenant == TENANT and status == "queued"]
            expected = sorted(matches, key=lambda pair: (pair[1], pair[0]), reverse=True)[:5]

            plans = [read_plan(writer, "no_secondary_index", expected)]
            writer.execute("CREATE INDEX jobs_tenant ON jobs(tenant_id)")
            plans.append(read_plan(writer, "tenant_only", expected))
            writer.execute("""CREATE INDEX jobs_list
                              ON jobs(tenant_id, state, created_at DESC, id DESC)""")
            plans.append(read_plan(writer, "query_index", expected))
            with closing(sqlite3.connect(path, isolation_level=None)) as reader:
                observations = snapshot_observations(writer, reader, expected[0][0])

    return {"status": "passed", "sqlite": sqlite3.sqlite_version, "rows": len(rows),
            "tenant_rows": sum(row[1] == TENANT for row in rows), "matched_rows": len(matches),
            "plans": plans, "snapshot_reads": observations, "journal_mode": mode,
            "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


if __name__ == "__main__":
    print(json.dumps(experiment(), ensure_ascii=False, indent=2))
