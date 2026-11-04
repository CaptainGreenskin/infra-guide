"""SQLite authority versus stale text; deterministic fixtures, no model calls."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile


def connect(path):
    return sqlite3.connect(str(path), isolation_level=None)


def setup(path):
    with closing(connect(path)) as db:
        db.executescript("""
        CREATE TABLE task(id TEXT PRIMARY KEY, tenant TEXT, version INTEGER,
                          state TEXT, original_op TEXT);
        CREATE TABLE effect(op TEXT PRIMARY KEY, value INTEGER);
        CREATE TABLE source(id TEXT PRIMARY KEY, version INTEGER, value INTEGER);
        CREATE TABLE memory(id TEXT PRIMARY KEY, subject TEXT, source_id TEXT,
                            source_version INTEGER, expires INTEGER, retracted INTEGER);
        INSERT INTO task VALUES('R17','A',1,'RUNNING','R17:publish');
        INSERT INTO source VALUES('pool-limit',2,10);
        INSERT INTO memory VALUES('old','user-A','pool-limit',1,1000,0);
        INSERT INTO memory VALUES('current','user-A','pool-limit',2,1000,0);
        INSERT INTO memory VALUES('other-user','user-B','pool-limit',2,1000,0);
        INSERT INTO memory VALUES('expired','user-A','pool-limit',2,10,0);
        """)


def receiver(db, op):
    db.execute("INSERT OR IGNORE INTO effect VALUES(?,13)", (op,))


def complete_task(db):
    db.execute("BEGIN IMMEDIATE")
    task = db.execute("SELECT state,original_op FROM task WHERE id='R17'").fetchone()
    assert task[0] == "RUNNING"
    receiver(db, task[1])
    db.execute("UPDATE task SET state='SUCCEEDED',version=version+1 WHERE id='R17'")
    db.commit()


def lookup_memory(db, identity, now, references=None):
    rows = db.execute("""
        SELECT m.id,m.source_version,s.version,s.value
        FROM memory m JOIN source s ON s.id=m.source_id
        WHERE m.subject=? AND m.expires>? AND m.retracted=0
        ORDER BY m.id
    """, (identity, now)).fetchall()
    accepted, stale = [], []
    for memory_id, recorded, current, value in rows:
        if references is not None and memory_id not in references:
            continue
        if recorded != current:
            stale.append(memory_id)
        else:
            accepted.append({"memory_id": memory_id, "source_version": current, "value": value})
    return {"accepted": accepted, "stale_for_current_fact": stale}


def run():
    with tempfile.TemporaryDirectory(prefix="context-state-") as folder:
        path = Path(folder, "good.sqlite")
        setup(path)
        stale_summary = {"task": "R17", "task_version": 1, "state": "RUNNING",
                         "original_op": "R17:publish", "text": "报告尚未保存"}
        with closing(connect(path)) as db:
            complete_task(db)
            # Recover without conversation text: authority still has the actual result.
            state, version, op = db.execute("SELECT state,version,original_op FROM task WHERE id='R17'").fetchone()
            assert state == "SUCCEEDED"
            receipt = db.execute("SELECT value FROM effect WHERE op=?", (op,)).fetchone()[0]
            effects_after_recovery = db.execute("SELECT COUNT(*) FROM effect").fetchone()[0]
            assert receipt == 13 and effects_after_recovery == 1

            # An old model view cannot overwrite newer task state using a guarded update.
            changed = db.execute("UPDATE task SET state='RUNNING',version=version+1 WHERE id='R17' AND version=?",
                                 (stale_summary["task_version"],)).rowcount
            assert changed == 0
            assert db.execute("SELECT state,version FROM task").fetchone() == ("SUCCEEDED",2)

            selected = lookup_memory(db, "user-A", 100)
            assert selected == {"accepted": [{"memory_id":"current","source_version":2,"value":10}],
                                "stale_for_current_fact": ["old"]}
            # A cached reference exists, but assembly rechecks its current status.
            cached_reference = ["current"]
            db.execute("UPDATE memory SET retracted=1 WHERE id='current'")
            after_retract = lookup_memory(db, "user-A", 100, cached_reference)
            assert after_retract["accepted"] == []

        bad_path = Path(folder, "bad-policy.sqlite")
        setup(bad_path)
        with closing(connect(bad_path)) as db:
            complete_task(db)
            # Deliberately wrong recovery policy: trust old text and invent a new op.
            if stale_summary["state"] == "RUNNING":
                receiver(db, "R17:new-op-from-stale-summary")
            bad_effects = db.execute("SELECT COUNT(*) FROM effect").fetchone()[0]
            assert bad_effects == 2

        original = {"claim": "driver_timeout", "status": "hypothesis",
                    "applies_to": "driver-v1", "window": "10:00-10:05",
                    "latency": 120, "unit": "ms", "evidence_ref": "trace-8:v1"}
        compressed = {key: original[key] for key in original}
        bad_compressed = dict(compressed, status="confirmed", applies_to="all_versions")
        # Fixed semantic slots are checked; no claim of general natural-language equivalence.
        def preserves_slots(summary):
            return all(summary.get(key) == value for key,value in original.items())
        assert preserves_slots(compressed) and not preserves_slots(bad_compressed)
        return {"correct_recovery": {"authority_state":state,"authority_version":version,
                                     "original_op":op,"receipt":receipt,"effects":effects_after_recovery,
                                     "stale_update_rows":changed,"needs_chat_history":False},
                "negative_summary_recovery": {"effects":bad_effects,"created_new_op":True},
                "memory_selection":selected,"after_retraction":after_retract,
                "summary_slot_checks": {"qualified_summary":True,"changed_certainty_rejected":True},
                "execution":"local_sqlite_fixed_facts_no_llm_or_kairo"}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
