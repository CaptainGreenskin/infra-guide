"""Two independent SQLite/WAL connections, interleaved in one local process.

Both cases restock 10 and intend to remove 5 from initial stock 100.
Reusing the old computed absolute value after rollback loses the restock.
"""
import json
from pathlib import Path
import platform
import sqlite3
from tempfile import TemporaryDirectory


def scenario(path, reuse_stale_value):
    reader = sqlite3.connect(path, isolation_level=None, timeout=0)
    writer = sqlite3.connect(path, isolation_level=None, timeout=0)
    events = []
    try:
        assert reader.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        reader.execute("CREATE TABLE stock(id INTEGER PRIMARY KEY, units INT NOT NULL)")
        reader.execute("INSERT INTO stock VALUES(1,100)")
        reader.execute("BEGIN")
        old = reader.execute("SELECT units FROM stock WHERE id=1").fetchone()[0]
        events.append({"step":1, "connection":"R", "event":"read_snapshot", "units":old})
        writer.execute("BEGIN IMMEDIATE")
        writer.execute("UPDATE stock SET units=units+10 WHERE id=1")
        writer.execute("COMMIT")
        current = writer.execute("SELECT units FROM stock WHERE id=1").fetchone()[0]
        events.append({"step":2, "connection":"W", "event":"restock_committed", "units":current})
        still_old = reader.execute("SELECT units FROM stock WHERE id=1").fetchone()[0]
        events.append({"step":3, "connection":"R", "event":"same_snapshot", "units":still_old})
        assert old == still_old == 100 and current == 110
        try:
            reader.execute("UPDATE stock SET units=units-5 WHERE id=1 AND units>=5")
        except sqlite3.OperationalError as error:
            rejected = {
                "message":str(error),
                "sqlite_errorcode":getattr(error,"sqlite_errorcode",None),
                "sqlite_errorname":getattr(error,"sqlite_errorname",None)}
            assert "locked" in str(error).lower()
            assert rejected["sqlite_errorcode"] in (None,517)
        else:
            raise AssertionError("stale WAL read transaction unexpectedly became a writer")
        events.append({"step":4, "connection":"R", "event":"write_upgrade_rejected", **rejected})
        assert reader.in_transaction
        reader.execute("ROLLBACK")
        events.append({"step":5, "connection":"R", "event":"rollback_old_snapshot"})
        reader.execute("BEGIN IMMEDIATE")
        if reuse_stale_value:
            reader.execute("UPDATE stock SET units=? WHERE id=1", (old-5,))
            events.append({"step":6, "connection":"R",
                           "event":"reuse_old_absolute_value", "units":old-5})
        else:
            fresh = reader.execute("SELECT units FROM stock WHERE id=1").fetchone()[0]
            assert fresh == 110
            changed = reader.execute(
                "UPDATE stock SET units=units-5 WHERE id=1 AND units>=5").rowcount
            assert changed == 1
            events.append({"step":6, "connection":"R", "event":"revalidate_and_remove",
                           "fresh_units":fresh, "removed":5})
        reader.execute("COMMIT")
        final = writer.execute("SELECT units FROM stock WHERE id=1").fetchone()[0]
        expected = 100+10-5
        events.append({"step":7, "connection":"W", "event":"observe_final_commit", "units":final})
        assert final == (95 if reuse_stale_value else expected)
        return {"events":events, "final_units":final, "business_expected_units":expected,
                "conserves_business_changes":final==expected}
    finally:
        reader.close()
        writer.close()


def main():
    with TemporaryDirectory(prefix="infra-snapshot-") as directory:
        root=Path(directory)
        correct=scenario(root/"fresh.db", False)
        wrong=scenario(root/"stale.db", True)
    print(json.dumps({"status":"passed", "python":platform.python_version(),
                      "sqlite":sqlite3.sqlite_version, "revalidate":correct,
                      "reuse_stale_absolute_value":wrong,
                      "scope":(
                          "Actual local WAL transactions on two separate connections "
                          "interleaved in one process; no threads, external service, "
                          "InnoDB or cloud database tested.")}, indent=2))


if __name__ == "__main__":
    main()
