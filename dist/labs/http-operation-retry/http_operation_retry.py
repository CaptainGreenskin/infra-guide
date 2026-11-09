"""Exercise operation identity with loopback HTTP and a real SQLite transaction."""
from contextlib import closing
import hashlib
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import socket
import sqlite3
import tempfile
from threading import Event, Thread

TENANT = "demo"
READ_TIMEOUT = 0.12
ORIGINAL = {"sku": "book", "quantity": 2}


def initialize(path):
    with closing(sqlite3.connect(path)) as db:
        db.executescript("""
            CREATE TABLE effects (
                id INTEGER PRIMARY KEY, tenant TEXT NOT NULL,
                sku TEXT NOT NULL, quantity INTEGER NOT NULL
            );
            CREATE TABLE receipts (
                tenant TEXT NOT NULL, operation TEXT NOT NULL,
                sku TEXT NOT NULL, quantity INTEGER NOT NULL,
                effect_id INTEGER NOT NULL REFERENCES effects(id),
                PRIMARY KEY (tenant, operation)
            );
        """)


def reserve(path, operation, sku, quantity):
    with closing(sqlite3.connect(path, isolation_level=None, timeout=4)) as db, db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute(
            "SELECT sku, quantity, effect_id FROM receipts WHERE tenant=? AND operation=?",
            (TENANT, operation),
        ).fetchone()
        if previous is not None:
            old_sku, old_quantity, effect_id = previous
            if (sku, quantity) != (old_sku, old_quantity):
                return 409, {"error": "operation_payload_conflict"}
            return 200, {"operation": operation, "effect_id": effect_id, "quantity": quantity}

        cursor = db.execute(
            "INSERT INTO effects(tenant, sku, quantity) VALUES (?, ?, ?)",
            (TENANT, sku, quantity),
        )
        effect_id = cursor.lastrowid
        db.execute("INSERT INTO receipts VALUES (?, ?, ?, ?, ?)",
                   (TENANT, operation, sku, quantity, effect_id))
        db.commit()
        return 201, {"operation": operation, "effect_id": effect_id, "quantity": quantity}


def inspect(path):
    with closing(sqlite3.connect(path)) as db:
        return {
            "effects": db.execute("SELECT id, tenant, sku, quantity FROM effects ORDER BY id").fetchall(),
            "receipts": db.execute("SELECT tenant, operation, sku, quantity, effect_id "
                                   "FROM receipts ORDER BY tenant, operation").fetchall(),
        }


def exercise(path):
    initialize(path)
    initial = inspect(path)
    committed = Event()
    allow_first_to_return = Event()
    first_done = Event()
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_POST(self):
            operation = self.headers.get("X-Operation-Id")
            attempt = self.headers.get("X-Attempt-Id")
            order = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            sku, quantity = order["sku"], order["quantity"]
            requests.append({"operation": operation, "attempt": attempt,
                             "field_order": list(order), "quantity": quantity})
            status, payload = reserve(path, operation, sku, quantity)
            if attempt == "attempt-1":
                assert status == 201
                # reserve() has committed and closed its database connection.
                committed.set()
                try:
                    allow_first_to_return.wait(10)
                finally:
                    first_done.set()
                return  # Deliberately send no headers for this one HTTP response.

            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        serving = Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02})
        serving.start()

        def post(connection, operation, attempt, order):
            connection.request("POST", "/reservations", json.dumps(order), {
                "Content-Type": "application/json",
                "X-Operation-Id": operation,
                "X-Attempt-Id": attempt,
            })

        def reply(operation, attempt, order):
            with closing(HTTPConnection(*server.server_address, timeout=3)) as connection:
                post(connection, operation, attempt, order)
                with connection.getresponse() as response:
                    return {"status": response.status, "body": json.load(response)}

        try:
            with closing(HTTPConnection(*server.server_address, timeout=3)) as first:
                post(first, "reserve-1", "attempt-1", ORIGINAL)
                assert committed.wait(3), "server did not commit"
                before_header_read = inspect(path)
                # Start this clock only after observing the controlled commit boundary.
                first.sock.settimeout(READ_TIMEOUT)
                try:
                    first.getresponse()
                except socket.timeout:
                    client_observed = "response_header_timeout"
                else:
                    raise AssertionError("first response must remain withheld")

            after_timeout = inspect(path)
            retry = reply("reserve-1", "attempt-2", {"quantity": 2, "sku": "book"})
            after_retry = inspect(path)
            first_handler_still_open = not first_done.is_set()
            changed_payload = reply("reserve-1", "attempt-3", {"sku": "book", "quantity": 3})
            after_conflict = inspect(path)
            new_operation = reply("reserve-2", "attempt-4", ORIGINAL)
            final = inspect(path)
        finally:
            allow_first_to_return.set()
            server.shutdown()
            serving.join(3)

        assert first_done.wait(3) and not serving.is_alive()
        return {
            "requests": requests,
            "first_observation": client_observed,
            "first_handler_still_open_after_retry": first_handler_still_open,
            "initial": initial,
            "before_header_read": before_header_read,
            "after_timeout": after_timeout,
            "same_operation": retry,
            "after_retry": after_retry,
            "changed_payload": changed_payload,
            "after_conflict": after_conflict,
            "new_operation": new_operation,
            "final": final,
        }


def main():
    with tempfile.TemporaryDirectory(prefix="http-operation-retry-") as folder:
        result = exercise(Path(folder) / "reservations.sqlite")
    assert result["first_observation"] == "response_header_timeout"
    assert result["first_handler_still_open_after_retry"]
    assert result["before_header_read"] == result["after_timeout"] == result["after_retry"] == result["after_conflict"]
    assert [result[name]["status"] for name in ("same_operation", "changed_payload", "new_operation")] == [200, 409, 201]
    assert result["same_operation"]["body"]["effect_id"] == 1
    assert result["new_operation"]["body"]["effect_id"] == 2
    print(json.dumps({
        "status": "passed",
        "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
        "environment": {"os": platform.system(), "python": platform.python_version(),
                        "sqlite": sqlite3.sqlite_version},
        "header_read_timeout_ms": round(READ_TIMEOUT * 1000),
        **result,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
