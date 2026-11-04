"""Real child processes, cancellation requests and authoritative SQLite receipts.

The parent uses barriers, never timing sleeps. One local database is the commit
authority; this does not make arbitrary remote tools transactionally cancellable.
"""
import json
import multiprocessing as mp
from pathlib import Path
import sqlite3
import tempfile


def connect(path):
    db = sqlite3.connect(path, timeout=5, isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    return db


def initialize(path):
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE task(id TEXT PRIMARY KEY, state TEXT NOT NULL);
        CREATE TABLE receipt(task_id TEXT PRIMARY KEY REFERENCES task(id),
                             op_id TEXT UNIQUE NOT NULL, value INTEGER NOT NULL);
        INSERT INTO task VALUES('report-42','PENDING');
        """)


def snapshot(path):
    with connect(path) as db:
        return {"state": db.execute("SELECT state FROM task").fetchone()[0],
                "effects": db.execute("SELECT COUNT(*) FROM receipt").fetchone()[0]}


def request_cancel(path):
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        state = db.execute("SELECT state FROM task").fetchone()[0]
        if state == "PENDING":
            db.execute("UPDATE task SET state='CANCELLED'")
            answer = "cancelled_before_dispatch"
        elif state == "RUNNING":
            db.execute("UPDATE task SET state='CANCEL_REQUESTED'")
            answer = "requested"
        elif state == "SUCCEEDED":
            answer = "too_late_committed"
        else:
            answer = state.lower()
        db.commit()
        return answer


def start_task(path):
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        changed = db.execute("UPDATE task SET state='RUNNING' WHERE state='PENDING'").rowcount
        db.commit()
        return changed == 1


def commit_or_cancel(path):
    with connect(path) as db:
        # The cancel decision, effect and receipt share this authority/transaction.
        db.execute("BEGIN IMMEDIATE")
        state = db.execute("SELECT state FROM task").fetchone()[0]
        if state == "CANCEL_REQUESTED":
            db.execute("UPDATE task SET state='CANCELLED'")
        elif state == "RUNNING":
            db.execute("INSERT INTO receipt VALUES('report-42','report-42:publish',13)")
            db.execute("UPDATE task SET state='SUCCEEDED'")
        else:
            raise RuntimeError("invalid commit state: " + state)
        db.commit()


def worker(path, mode, reached, release):
    if not start_task(path):
        return
    if mode == "committed":
        commit_or_cancel(path)
    reached.set()
    if not release.wait(12):
        raise RuntimeError("parent barrier not released")
    if mode == "cooperative":
        commit_or_cancel(path)
    # A noncooperative worker does not poll cancellation while blocked.


def joined(child):
    child.join(6)
    if child.is_alive():
        raise RuntimeError("own child did not exit")


def scenario(folder, mode):
    path = str(Path(folder, mode + ".sqlite"))
    initialize(path)
    ctx = mp.get_context("spawn")
    reached, release = ctx.Event(), ctx.Event()
    child = ctx.Process(target=worker, args=(path, mode, reached, release))
    child.start()
    try:
        assert reached.wait(8), "child did not reach the controlled boundary"
        before = snapshot(path)
        reply = request_cancel(path)
        after_request = snapshot(path)
        alive = child.is_alive()
        assert alive
        if mode == "cooperative":
            assert after_request == {"state": "CANCEL_REQUESTED", "effects": 0}
            release.set()
            joined(child)
            assert child.exitcode == 0
        else:
            # Terminate only the direct child created by THIS scenario.
            child.terminate()
            joined(child)
            assert child.exitcode != 0
            if mode == "noncooperative":
                # Confirm local process exit AND reconcile this local effect authority.
                assert snapshot(path) == {"state": "CANCEL_REQUESTED", "effects": 0}
                with connect(path) as db:
                    db.execute("UPDATE task SET state='CANCELLED' WHERE state='CANCEL_REQUESTED'")
        final = snapshot(path)
        if mode == "committed":
            assert reply == "too_late_committed"
            assert before == after_request == final == {"state": "SUCCEEDED", "effects": 1}
        else:
            assert reply == "requested"
            assert final == {"state": "CANCELLED", "effects": 0}
        return {"before_cancel": before, "cancel_reply": reply,
                "after_request": after_request, "child_alive_after_request": alive,
                "exit": "normal" if child.exitcode == 0 else "terminated",
                "child_joined": True, "final": final}
    finally:
        if child.is_alive():
            child.terminate()
        child.join(6)
        child.close()


def run():
    with tempfile.TemporaryDirectory(prefix="cancel-receipts-") as folder:
        pending = str(Path(folder, "pending.sqlite"))
        initialize(pending)
        assert request_cancel(pending) == "cancelled_before_dispatch"
        assert not start_task(pending)
        results = {"pending": {"worker_started": False, "final": snapshot(pending)}}
        for mode in ("cooperative", "noncooperative", "committed"):
            results[mode] = scenario(folder, mode)
        return {"authority": "one_local_sqlite", "start_method": "spawn", "cases": results}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
