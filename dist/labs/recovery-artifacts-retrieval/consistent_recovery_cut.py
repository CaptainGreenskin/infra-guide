"""Actual SQLite backup/replay and immutable fixture objects; application journal, not database WAL."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile


@contextmanager
def connect(path):
    db = sqlite3.connect(path)
    try:
        with db:
            yield db
    finally:
        db.close()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def clone(source, destination):
    with connect(source) as old, connect(destination) as new:
        old.backup(new)


def problems(db, objects):
    errors = []
    for identity, key, expected in db.execute("SELECT id,object_key,sha256 FROM reports ORDER BY id"):
        path = objects / key
        if not path.is_file():
            errors.append({"report": identity, "object": key, "reason": "missing_object_version"})
        elif digest(path.read_bytes()) != expected:
            errors.append({"report": identity, "object": key, "reason": "object_hash_mismatch"})
    return errors


def insert_event(db, event):
    db.execute("INSERT INTO reports VALUES(?,?,?,?,?)", (event["report"], "A", event["seq"], event["object"], event["sha256"]))
    db.execute("UPDATE progress SET seq=?,minute=?", (event["seq"], event["minute"]))


def recover(backup, target, events, objects, require_objects=True):
    clone(backup, target)
    stopped = None
    with connect(target) as db:
        if problems(db, objects):
            raise ValueError("baseline_not_usable")
        for event in events:
            seq = db.execute("SELECT seq FROM progress").fetchone()[0]
            if event["seq"] != seq+1:
                stopped = {"expected_seq": seq+1, "received_seq": event["seq"], "reason": "journal_gap"}
                break
            try:
                with db:
                    insert_event(db, event)
                    errors = problems(db, objects)
                    if require_objects and errors:
                        raise ValueError(json.dumps(errors))
            except ValueError as error:
                stopped = {"at_seq": event["seq"], "reason": "business_state_incomplete", "details": json.loads(str(error))}
                break
        seq, minute = db.execute("SELECT seq,minute FROM progress").fetchone()
        issues = problems(db, objects)
        report_ids = [row[0] for row in db.execute("SELECT id FROM reports WHERE tenant='A' ORDER BY id")]
        unreadable = {issue["report"] for issue in issues}
        readable_ids = [identity for identity in report_ids if identity not in unreadable]
        forbidden = db.execute("SELECT object_key FROM reports WHERE tenant=? AND id=?", ("A", "B-report")).fetchone()
        physical = db.execute("PRAGMA integrity_check").fetchone()[0]
    return {"seq": seq, "minute": minute, "gap_minutes_at_noon": 720-minute,
            "database_point_within_15_minutes": 720-minute <= 15,
            "business_RPO_pass": not issues and 720-minute <= 15, "physical_integrity": physical,
            "business_problems": issues, "A_report_rows": report_ids, "A_readable_reports": readable_ids,
            "A_cannot_query_B_report": forbidden is None, "stopped": stopped}


def main():
    with tempfile.TemporaryDirectory(prefix="infra-recovery-cut-") as temporary:
        root = Path(temporary)
        source_objects = root / "source-objects"
        source_objects.mkdir()
        contents = {"object-v1": b"A report 1", "object-v2": b"A report 2",
                    "object-v3": b"A report 3", "object-v4": b"A report 4", "object-B": b"fixture B"}
        for name, content in contents.items():
            (source_objects / name).write_bytes(content)
        source, backup = root / "source.db", root / "baseline.db"
        with connect(source) as db:
            db.executescript("CREATE TABLE reports(id TEXT PRIMARY KEY,tenant TEXT,revision INT,object_key TEXT,sha256 TEXT);"
                             "CREATE TABLE progress(seq INT,minute INT); INSERT INTO progress VALUES(100,690);")
            db.executemany("INSERT INTO reports VALUES(?,?,?,?,?)", [
                ("R1", "A", 100, "object-v1", digest(contents["object-v1"])),
                ("B-report", "B", 100, "object-B", digest(contents["object-B"]))])
        clone(source, backup)
        events = [{"seq": seq, "minute": minute, "report": identity, "object": key, "sha256": digest(contents[key])}
                  for seq, minute, identity, key in [(101, 702, "R2", "object-v2"), (102, 714, "R3", "object-v3"), (103, 717, "R4", "object-v4")]]
        journal = root / "application-journal.jsonl"
        with connect(source) as db, journal.open("w") as log:
            for event in events:
                with db:
                    insert_event(db, event)
                log.write(json.dumps(event)+"\n")
        events = [json.loads(line) for line in journal.read_text().splitlines()]

        partial_objects = root / "partial-objects"
        shutil.copytree(source_objects, partial_objects)
        (partial_objects / "object-v3").unlink()  # Declared recovery-material failure in a disposable fixture.
        naive = recover(backup, root / "naive.db", events, partial_objects, False)
        cut = recover(backup, root / "cut.db", events, partial_objects)
        complete = recover(backup, root / "complete.db", events, source_objects)
        missing_log = recover(backup, root / "log-gap.db", [events[0], events[2]], source_objects)
        corrupt_objects = root / "corrupt-objects"
        shutil.copytree(source_objects, corrupt_objects)
        (corrupt_objects / "object-v2").write_bytes(b"changed fixture bytes")
        corrupt = recover(backup, root / "corrupt.db", events, corrupt_objects)
        assert naive["seq"] == 103 and naive["physical_integrity"] == "ok"
        assert naive["business_problems"] == [{"report": "R3", "object": "object-v3", "reason": "missing_object_version"}]
        assert cut["seq"] == 101 and cut["gap_minutes_at_noon"] == 18 and not cut["business_RPO_pass"]
        assert cut["A_readable_reports"] == ["R1", "R2"] and not cut["business_problems"]
        assert naive["A_report_rows"] == ["R1", "R2", "R3", "R4"]
        assert naive["A_readable_reports"] == ["R1", "R2", "R4"]
        assert complete["seq"] == 103 and complete["gap_minutes_at_noon"] == 3 and complete["business_RPO_pass"]
        assert naive["database_point_within_15_minutes"] and not naive["business_RPO_pass"]
        assert missing_log["seq"] == 101 and missing_log["stopped"]["reason"] == "journal_gap"
        assert corrupt["seq"] == 100 and corrupt["gap_minutes_at_noon"] == 30
        assert all(case["A_cannot_query_B_report"] for case in [naive, cut, complete, missing_log, corrupt])
    print(json.dumps({"sqlite": sqlite3.sqlite_version, "failure_minute": 720, "baseline_minute": 690,
                      "commits": [{k: e[k] for k in ["seq", "minute", "report", "object"]} for e in events],
                      "naive_latest_database": naive, "last_complete_business_prefix": cut,
                      "all_materials_present": complete, "missing_log_segment": missing_log,
                      "corrupt_object": corrupt,
                      "scope": "actual_SQLite_backup_and_fixture_object_validation_with_application_log_not_PostgreSQL_WAL_or_cloud_DR",
                      "limits": ["minute values are declared teaching times, not measured restore durations",
                                 "application journal is constructed in the fixture; no power-loss durability claim",
                                 "recovery-point age is not a count of lost reports; row presence alone does not prove readable content",
                                 "tenant predicate tests this consumer query, not a deployed IAM system"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
