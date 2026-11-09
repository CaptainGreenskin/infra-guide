"""Locate a held SQLite connection with one real query and a gated HTTP call."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
import hashlib
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
from queue import Empty, Queue
import sqlite3
from tempfile import TemporaryDirectory
from threading import Event, Lock, Thread
import time

LIMIT = 6
QUERY = "SELECT total FROM orders WHERE id = ?"


def require_signal(event, label):
    if not event.wait(LIMIT):
        raise TimeoutError(label)


def locked_query(db):
    try:
        db.execute(QUERY, ("A",)).fetchone()
    except sqlite3.OperationalError as error:
        if str(error) != "database is locked":
            raise
        return {"message": str(error), "sqlite_errorcode": getattr(error, "sqlite_errorcode", None)}
    raise AssertionError("the lock probe unexpectedly read the database")


def exercise(path, mode):
    trace_lock = Lock()
    events = []
    start = time.monotonic_ns()
    a_blocked, b_waiting, release = Event(), Event(), Event()

    def mark(task, event, **details):
        with trace_lock:
            events.append({"task": task, "event": event, "at_ns": time.monotonic_ns() - start, **details})

    class ExternalService(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_GET(self):
            assert self.path == "/lookup/A"
            mark("A", "external_received")
            a_blocked.set()
            require_signal(release, "external reply not released")
            response = b'{"receipt":"external-a"}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

    with closing(sqlite3.connect(path, timeout=0, check_same_thread=False)) as db, \
            closing(sqlite3.connect(path, timeout=0)) as locker, \
            ThreadingHTTPServer(("127.0.0.1", 0), ExternalService) as external:
        journal = db.execute("PRAGMA journal_mode=DELETE").fetchone()[0]
        db.executescript("""
            CREATE TABLE orders(id TEXT PRIMARY KEY, total INTEGER NOT NULL);
            INSERT INTO orders VALUES ('A', 42), ('B', 37);
        """)
        pool = Queue(maxsize=1)
        pool.put_nowait(db)
        http_thread = Thread(target=external.serve_forever, kwargs={"poll_interval": 0.02})
        http_thread.start()

        def external_receipt():
            mark("A", "external_begin")
            with closing(HTTPConnection(*external.server_address, timeout=LIMIT)) as conn:
                conn.request("GET", "/lookup/A")
                with conn.getresponse() as response:
                    assert response.status == 200
                    receipt = json.load(response)["receipt"]
            mark("A", "external_end", receipt=receipt)
            return receipt

        def request(task):
            mark(task, "arrival")
            try:
                connection = pool.get_nowait()
            except Empty:
                mark(task, "pool_wait")
                assert task == "B"
                b_waiting.set()
                connection = pool.get(timeout=LIMIT)
            mark(task, "pool_acquired")
            receipt = None
            try:
                if task == "A" and mode == "external_inside":
                    receipt = external_receipt()
                mark(task, "sql_begin")
                if task == "A" and mode == "sqlite_lock":
                    mark(task, "sql_busy", **locked_query(connection))
                    a_blocked.set()
                    # The test retries one query after releasing the known lock.
                    require_signal(release, "SQLite lock not released")
                    mark(task, "sql_retry")
                (total,) = connection.execute(QUERY, (task,)).fetchone()
                mark(task, "sql_end", total=total)
            finally:
                mark(task, "pool_returned")
                pool.put_nowait(connection)
            if task == "A" and mode == "external_outside":
                receipt = external_receipt()
            result = {"total": total, "receipt": receipt}
            mark(task, "complete", result=result)
            return result

        with ThreadPoolExecutor(max_workers=2) as threads:
            try:
                if mode == "sqlite_lock":
                    locker.execute("BEGIN EXCLUSIVE")
                    with closing(sqlite3.connect(path, timeout=0)) as probe:
                        mark(None, "independent_lock_probe", **locked_query(probe))

                first = threads.submit(request, "A")
                require_signal(a_blocked, "A did not reach its controlled boundary")
                second = threads.submit(request, "B")
                if mode == "external_outside":
                    second.result(timeout=LIMIT)
                else:
                    require_signal(b_waiting, "B did not attempt to acquire the connection")
                assert not first.done()
                snapshot = {"free_connections": pool.qsize(), "b_waiting": b_waiting.is_set(),
                            "b_complete": second.done(), "a_complete": first.done()}
                mark(None, "snapshot")
            finally:
                if locker.in_transaction:
                    locker.rollback()
                mark(None, "release_gate")
                release.set()
                external.shutdown()
                http_thread.join(LIMIT)

        assert not http_thread.is_alive()
        return {"sqlite_journal": journal, "snapshot": snapshot, "events": events,
                "results": {"A": first.result(), "B": second.result()}}


def main():
    with TemporaryDirectory(prefix="incident-connection-lease-") as folder:
        cases = {mode: exercise(Path(folder) / (mode + ".sqlite"), mode)
                 for mode in ("sqlite_lock", "external_inside", "external_outside")}
    for mode, row in cases.items():
        fixed = mode == "external_outside"
        assert row["snapshot"] == {"free_connections": int(fixed), "b_waiting": not fixed,
                                   "b_complete": fixed, "a_complete": False}
        assert row["results"] == {"A": {"total": 42, "receipt": None if mode == "sqlite_lock" else "external-a"},
                                  "B": {"total": 37, "receipt": None}}
    print(json.dumps({
        "status": "passed",
        "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "environment": {"os": platform.system(), "python": platform.python_version(), "sqlite": sqlite3.sqlite_version},
        "pool_capacity": 1,
        "cases": cases,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
