"""Observe real SQLite WAL/snapshots/backup; NOT a CSI or power-loss test."""
from contextlib import ExitStack, closing
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile


def connect(path):
    return sqlite3.connect(str(path), isolation_level=None, timeout=5)


def view(db):
    balance, version = db.execute("SELECT balance, version FROM account WHERE id=1").fetchone()
    total, last = db.execute("SELECT SUM(delta), MAX(version) FROM ledger").fetchone()
    return {"balance": balance, "version": version, "ledger_sum": total,
            "last_ledger_version": last,
            "integrity": db.execute("PRAGMA integrity_check").fetchone()[0]}


def commit_value(db, balance, version):
    old = db.execute("SELECT balance, version FROM account WHERE id=1").fetchone()
    assert version == old[1] + 1
    db.execute("BEGIN IMMEDIATE")
    db.execute("UPDATE account SET balance=?, version=? WHERE id=1", (balance, version))
    db.execute("INSERT INTO ledger VALUES(?, ?)", (version, balance - old[0]))
    db.commit()


def can_serve(record, minimum_version):
    return (record["integrity"] == "ok" and record["version"] >= minimum_version
            and record["balance"] == record["ledger_sum"]
            and record["version"] == record["last_ledger_version"])


def run():
    with tempfile.TemporaryDirectory(prefix="wal-backup-") as folder, ExitStack() as stack:
        root = Path(folder)
        source = root / "source.sqlite"
        writer = stack.enter_context(closing(connect(source)))
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.executescript("""
        CREATE TABLE account(id INTEGER PRIMARY KEY, balance INTEGER, version INTEGER);
        CREATE TABLE ledger(version INTEGER PRIMARY KEY, delta INTEGER);
        BEGIN;
        INSERT INTO account VALUES(1,100,1);
        INSERT INTO ledger VALUES(1,100);
        COMMIT;
        """)
        # Make version 1 present in the main file before the controlled WAL writes.
        writer.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        commit_value(writer, 120, 2)
        assert (root / "source.sqlite-wal").stat().st_size > 0

        # No concurrent write occurs during this copy. It is deliberately incomplete:
        # committed version 2 remains in WAL, which this main-file-only copy omits.
        raw_path = root / "main-only.sqlite"
        shutil.copyfile(source, raw_path)
        raw = stack.enter_context(closing(connect(raw_path)))
        raw_record = view(raw)
        assert raw_record["version"] == 1

        reader = stack.enter_context(closing(connect(source)))
        reader.execute("BEGIN")
        before = view(reader)  # First SELECT establishes this read snapshot.
        commit_value(writer, 130, 3)
        after = view(reader)
        assert before == after and after["version"] == 2
        assert view(writer)["version"] == 3

        frozen = stack.enter_context(closing(connect(root / "snapshot-2.sqlite")))
        reader.backup(frozen)
        snapshot_2 = view(frozen)
        assert snapshot_2 == after
        reader.rollback()

        fresh = stack.enter_context(closing(connect(source)))
        backup = stack.enter_context(closing(connect(root / "backup-3.sqlite")))
        fresh.backup(backup)
        backup_3 = view(backup)
        assert backup_3["version"] == 3
        assert not can_serve(snapshot_2, 3) and can_serve(backup_3, 3)

        # Retaining the live volume also retains a later, logically mistaken write.
        commit_value(writer, 999, 4)
        retained = view(writer)
        assert retained["balance"] == 999

        # Restore through the database API into a separate location, then resume work.
        restored = stack.enter_context(closing(connect(root / "isolated-restore.sqlite")))
        backup.backup(restored)
        restore_before = view(restored)
        assert restore_before == backup_3 and can_serve(restore_before, 3)
        commit_value(restored, 131, 4)
        resumed = view(restored)
        assert resumed["balance"] == resumed["ledger_sum"] == 131
        return {"sqlite": sqlite3.sqlite_version,
                "main_file_only": raw_record,
                "reader_snapshot_before_writer": before,
                "same_reader_after_writer": after,
                "backup_from_snapshot": snapshot_2,
                "backup_from_fresh_connection": backup_3,
                "retained_after_bad_write": retained,
                "isolated_restore": restore_before, "consumer_continued": resumed,
                "checks": {"wal_contains_committed_change": True,
                           "old_but_consistent_backup_rejected_for_minimum_3": True,
                           "fresh_backup_passes_minimum_3": True}}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
