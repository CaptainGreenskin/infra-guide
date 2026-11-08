"""Persistent planning, re-planning and approval; Python 3.9+ standard library.

Every command runs in a new process. A scripted proposal source replaces an LLM.
All sources, task state and report rows share one local SQLite transactional
domain: this does not implement an external-effect recovery or framework SDK.
"""
import argparse
from contextlib import nullcontext
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def connect(path):
    connection = sqlite3.connect(path, timeout=10)
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def event(db, kind, body):
    db.execute("INSERT INTO events(kind,body) VALUES (?,?)", (kind, canonical(body)))


def load(db):
    return json.loads(db.execute("SELECT body FROM runtime WHERE id=1").fetchone()[0])


def save(db, state):
    db.execute("UPDATE runtime SET body=? WHERE id=1", (canonical(state),))


def plan(db, revision):
    return json.loads(db.execute("SELECT body FROM plans WHERE revision=?", (revision,)).fetchone()[0])


def source(db, version):
    return json.loads(db.execute("SELECT body FROM sources WHERE version=?", (version,)).fetchone()[0])


def fact(db, name, key, operation):
    old = db.execute("SELECT body FROM facts WHERE name=? AND input_key=?", (name, key)).fetchone()
    if old:
        return json.loads(old[0])
    result = operation()
    db.execute("INSERT INTO facts(name,input_key,body) VALUES (?,?,?)", (name, key, canonical(result)))
    event(db, "fact_recorded", {"name": name, "input_key": key})
    return result


def initialize(path, mode, has_extra, budget):
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE sources(version INTEGER PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE batches(resource TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,
                             PRIMARY KEY(resource,version));
        CREATE TABLE source_head(id INTEGER PRIMARY KEY, version INTEGER NOT NULL);
        CREATE TABLE plans(revision INTEGER PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE runtime(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE facts(name TEXT NOT NULL,input_key TEXT NOT NULL,body TEXT NOT NULL,
                           PRIMARY KEY(name,input_key));
        CREATE TABLE signals(id TEXT PRIMARY KEY,body TEXT NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE reports(id TEXT PRIMARY KEY,body TEXT NOT NULL);
        CREATE TABLE events(seq INTEGER PRIMARY KEY,kind TEXT NOT NULL,body TEXT NOT NULL);
        """)
        base = {"resource": "orders-A", "version": 3, "values": [10, 27],
                "extra": {"resource": "late-A", "version": 1} if has_extra else None}
        db.execute("INSERT INTO sources VALUES (?,?)", (3, canonical(base)))
        db.execute("INSERT INTO batches VALUES ('late-A',1,?)", (canonical({"resource": "late-A", "version": 1, "values": [5]}),))
        db.execute("INSERT INTO source_head VALUES (1,3)")
        steps = ["read_base", "read_extra", "sum", "publish"] if mode == "fixed" else ["read_base", "sum", "publish"]
        db.execute("INSERT INTO plans VALUES (1,?)", (canonical(steps),))
        state = {"task": "report-task-A", "target": "report-A", "goal": "sum all batches in the observed order manifest",
                 "phase": "RUNNING", "revision": 1, "mode": mode, "proposal_budget": budget,
                 "no_progress": 0, "last_proposal": None, "base": None, "draft": None}
        db.execute("INSERT INTO runtime VALUES (1,?)", (canonical(state),))
        event(db, "started", {"revision": 1, "mode": mode})


def read_base(db, state):
    version = db.execute("SELECT version FROM source_head WHERE id=1").fetchone()[0]
    current = fact(db, "read_base", str(version), lambda: source(db, version))
    if state["base"] and state["base"]["version"] != version:
        state["draft"] = None
        state["phase"] = "NEEDS_REPLAN"
        event(db, "input_changed", {"from": state["base"]["version"], "to": version})
    state["base"] = current


def advance(db, stop_after_draft=False, bad_cache_key=False):
    state = load(db)
    if state["phase"] == "DONE" or state["phase"].startswith("STOPPED_"):
        return state
    read_base(db, state)
    steps = plan(db, state["revision"])
    if state["base"]["extra"] and "read_extra" not in steps:
        if state["phase"] != "NEEDS_REPLAN":
            event(db, "replan_required", {"reason": "manifest includes another batch"})
        state["phase"] = "NEEDS_REPLAN"
    if state["phase"] == "NEEDS_REPLAN":
        save(db, state)
        return state
    base = state["base"]
    batches = [{"resource": base["resource"], "version": base["version"], "values": base["values"]}]
    if base["extra"]:
        extra = base["extra"]
        def fetch_extra():
            row = db.execute("SELECT body FROM batches WHERE resource=? AND version=?",
                             (extra["resource"], extra["version"])).fetchone()
            return json.loads(row[0])
        batches.append(fact(db, "read_extra", digest(extra), fetch_extra))
    manifest = [{"resource": b["resource"], "version": b["version"], "sha256": digest(b["values"])} for b in batches]
    input_digest = digest({"task": state["task"], "target": state["target"], "manifest": manifest})
    total = fact(db, "sum", "sum" if bad_cache_key else input_digest,
                 lambda: sum(sum(b["values"]) for b in batches))
    draft = {"report": state["target"], "total": total, "manifest": manifest}
    state["draft"] = {"body": draft, "input_digest": input_digest, "draft_digest": digest(draft)}
    if stop_after_draft:
        state["phase"] = "DRAFT_READY"
        save(db, state)
        return state
    if state["phase"] != "WAITING_APPROVAL":
        event(db, "waiting", {"revision": state["revision"], "draft_digest": digest(draft)})
    state["phase"] = "WAITING_APPROVAL"
    accepted = None
    for signal_id, body in db.execute("SELECT id,body FROM signals WHERE consumed=0 ORDER BY rowid"):
        message = json.loads(body)
        if approval_matches(state, message):
            accepted = signal_id
            break
    if accepted:
        # Source validation, report, consumed input and DONE share this one DB
        # transaction. It is deliberately not an arbitrary remote API.
        db.execute("INSERT INTO reports(id,body) VALUES (?,?)", (state["target"], canonical(draft)))
        db.execute("UPDATE signals SET consumed=1 WHERE id=?", (accepted,))
        state["phase"] = "DONE"
        event(db, "report_committed", {"approval": accepted, "revision": state["revision"], "total": total})
    save(db, state)
    return state


def propose(db, behavior):
    state = load(db)
    if state["phase"] != "NEEDS_REPLAN":
        return {"accepted": False, "reason": "not_replanning", "state": state}
    if state["proposal_budget"] == 0:
        state["phase"] = "STOPPED_BUDGET"
        event(db, "stopped", {"reason": "proposal_budget"})
        save(db, state)
        return {"accepted": False, "reason": "proposal_budget", "state": state}
    state["proposal_budget"] -= 1
    candidate = ["read_base", "read_extra", "sum", "publish"] if behavior == "good" else plan(db, state["revision"])
    if behavior == "bad_order":
        candidate = ["read_base", "publish", "read_extra", "sum"]
    signature = digest({"observation": state["base"], "steps": candidate})
    same = state["last_proposal"] == signature
    state["last_proposal"] = signature
    state["no_progress"] = state["no_progress"] + 1 if same else 1
    required = ["read_base", "read_extra", "sum", "publish"]
    valid = candidate == required
    # Wording/reasons are not part of the semantic signature. This proposal
    # source is a fixed fixture, not a model or a framework planner.
    event(db, "proposal", {"steps": candidate, "valid": valid,
                           "reason_text": "try again " + str(state["proposal_budget"])})
    if valid:
        state["revision"] += 1
        db.execute("INSERT INTO plans VALUES (?,?)", (state["revision"], canonical(candidate)))
        state["phase"] = "RUNNING"
        state["draft"] = None
        state["no_progress"] = 0
        event(db, "plan_accepted", {"revision": state["revision"]})
    elif state["no_progress"] >= 2:
        state["phase"] = "STOPPED_NO_PROGRESS"
        event(db, "stopped", {"reason": "no_progress"})
    save(db, state)
    return {"accepted": valid, "reason": "accepted" if valid else "invalid_dependencies", "state": state}


def approval_matches(state, message):
    draft = state.get("draft")
    return bool(draft and message.get("task") == state["task"] and message.get("target") == state["target"]
                and message.get("actor") == "operator-A" and message.get("decision") == "approve"
                and type(message.get("revision")) is int and message["revision"] == state["revision"]
                and message.get("input_digest") == draft["input_digest"]
                and message.get("draft_digest") == draft["draft_digest"])


def approve(db, message):
    state = load(db)
    existing = db.execute("SELECT body FROM signals WHERE id=?", (message["id"],)).fetchone()
    if existing:
        if existing[0] != canonical(message):
            return {"accepted": False, "reason": "signal_id_conflict"}
        return {"accepted": True, "reason": "duplicate_signal", "applies_current": approval_matches(state, message)}
    if state["phase"] not in ["DRAFT_READY", "WAITING_APPROVAL"] or not approval_matches(state, message):
        return {"accepted": False, "reason": "stale_or_unbound_approval"}
    db.execute("INSERT INTO signals(id,body) VALUES (?,?)", (message["id"], canonical(message)))
    event(db, "approval_received", {"id": message["id"], "revision": message["revision"]})
    return {"accepted": True, "reason": "recorded"}


def update_source(db):
    changed = {"resource": "orders-A", "version": 4, "values": [10, 27],
               "extra": {"resource": "late-A", "version": 1}}
    db.execute("INSERT INTO sources VALUES (4,?)", (canonical(changed),))
    db.execute("UPDATE source_head SET version=4 WHERE id=1")
    return {"source_version": 4}


def inspect(path):
    with connect(path) as db:
        state = load(db)
        return {"state": state, "plans": [{"revision": r, "steps": json.loads(b)} for r, b in db.execute("SELECT * FROM plans ORDER BY revision")],
                "facts": [{"name": n, "key": k, "value": json.loads(b)} for n, k, b in db.execute("SELECT * FROM facts ORDER BY rowid")],
                "signals": [{"id": i, "body": json.loads(b), "consumed": bool(c)} for i, b, c in db.execute("SELECT * FROM signals ORDER BY rowid")],
                "reports": [json.loads(b) for (b,) in db.execute("SELECT body FROM reports")],
                "events": [{"kind": k, "body": json.loads(b)} for k, b in db.execute("SELECT kind,body FROM events ORDER BY seq")]}


def independent_oracle(path):
    # Read authoritative input and actual report directly, never state.draft.
    with connect(path) as db:
        version = db.execute("SELECT version FROM source_head").fetchone()[0]
        base = source(db, version)
        batches = [{"resource": base["resource"], "version": base["version"], "values": base["values"]}]
        if base["extra"]:
            ref = base["extra"]
            batches.append(json.loads(db.execute("SELECT body FROM batches WHERE resource=? AND version=?",
                                                 (ref["resource"], ref["version"])).fetchone()[0]))
        values = [value for batch in batches for value in batch["values"]]
        manifest = [{"resource": batch["resource"], "version": batch["version"], "sha256": digest(batch["values"])} for batch in batches]
        reports = [json.loads(r[0]) for r in db.execute("SELECT body FROM reports")]
        expected = sum(values)
        return {"expected_total": expected, "actual_total": reports[0]["total"] if reports else None,
                "report_count": len(reports), "accepted": len(reports) == 1 and reports[0]["total"] == expected
                and reports[0]["report"] == "report-A" and reports[0]["manifest"] == manifest}


def invoke(path, command, **options):
    args = [sys.executable, "-B", str(Path(__file__).resolve()), command, "--db", str(path)]
    for key, value in options.items():
        args += ["--" + key.replace("_", "-"), canonical(value) if isinstance(value, dict) else str(value)]
    completed = subprocess.run(args, capture_output=True, text=True, check=True, timeout=15)
    return json.loads(completed.stdout)


def message(snapshot, signal_id):
    state = snapshot["state"]
    return {"id": signal_id, "task": state["task"], "target": state["target"], "actor": "operator-A",
            "decision": "approve", "revision": state["revision"],
            "input_digest": state["draft"]["input_digest"], "draft_digest": state["draft"]["draft_digest"]}


def run_scenarios(output_dir=None):
    result = {}
    if output_dir:
        Path(output_dir).mkdir(parents=True, exist_ok=False)
    manager = nullcontext(output_dir) if output_dir else tempfile.TemporaryDirectory(prefix="infra-planning-")
    with manager as directory:
        root = Path(directory)
        for mode in ["adaptive", "fixed"]:
            path = root/(mode + ".sqlite")
            initialize(path, mode, True, 3 if mode == "adaptive" else 0)
            first = invoke(path, "advance")
            if mode == "adaptive":
                assert first["phase"] == "NEEDS_REPLAN"
                assert invoke(path, "propose", behavior="good")["accepted"]
                invoke(path, "advance")
            waiting = inspect(path)
            assert waiting["state"]["phase"] == "WAITING_APPROVAL" and not waiting["reports"]
            valid = message(waiting, "approve-current")
            rejected = dict(valid, id="old-plan", revision=0)
            assert not invoke(path, "approve", message=rejected)["accepted"]
            assert invoke(path, "approve", message=valid)["accepted"]
            assert invoke(path, "approve", message=valid)["reason"] == "duplicate_signal"
            invoke(path, "advance")
            done = inspect(path)
            invoke(path, "advance")
            assert done == inspect(path), "DONE resume created another fact/event/effect"
            assert independent_oracle(path)["accepted"]
            result[mode] = {"first_phase": first["phase"], "waiting": waiting, "done": done,
                            "oracle": independent_oracle(path), "duplicate_resume_unchanged": True}
        # A genuine earlier approval becomes obsolete when a new batch arrives.
        path = root/"changed-input.sqlite"
        initialize(path, "adaptive", False, 3)
        invoke(path, "advance")
        before = inspect(path)
        old_message = message(before, "approve-v1")
        assert invoke(path, "approve", message=old_message)["accepted"]
        invoke(path, "update_source")
        assert invoke(path, "advance")["phase"] == "NEEDS_REPLAN"
        invoke(path, "propose", behavior="good")
        invoke(path, "advance")
        changed = inspect(path)
        assert not invoke(path, "approve", message=dict(old_message, id="late-copy"))["accepted"]
        duplicate = invoke(path, "approve", message=old_message)
        assert duplicate["reason"] == "duplicate_signal" and not duplicate["applies_current"]
        assert not inspect(path)["reports"]
        invoke(path, "approve", message=message(changed, "approve-v2"))
        invoke(path, "advance")
        result["changed_input"] = {"old_draft_total": before["state"]["draft"]["body"]["total"],
                                   "new_draft_total": changed["state"]["draft"]["body"]["total"],
                                   "old_duplicate": duplicate, "done": inspect(path), "oracle": independent_oracle(path)}
        # External input is durable even if it arrives before the waiting state.
        path = root/"early-signal.sqlite"
        initialize(path, "fixed", True, 0)
        assert invoke(path, "advance", stop_after_draft=1)["phase"] == "DRAFT_READY"
        invoke(path, "approve", message=message(inspect(path), "early"))
        invoke(path, "advance")
        result["early_signal"] = {"done": inspect(path), "oracle": independent_oracle(path)}
        for case, budget, attempts in [("no_progress", 3, 2), ("budget", 1, 2)]:
            path = root/(case + ".sqlite")
            initialize(path, "adaptive", True, budget)
            invoke(path, "advance")
            for _ in range(attempts):
                invoke(path, "propose", behavior="repeat")
            snapshot = inspect(path)
            assert snapshot["state"]["phase"] == ("STOPPED_NO_PROGRESS" if case == "no_progress" else "STOPPED_BUDGET")
            assert not snapshot["reports"]
            result[case] = snapshot
        path = root/"invalid-plan.sqlite"
        initialize(path, "adaptive", True, 3)
        invoke(path, "advance")
        bad = invoke(path, "propose", behavior="bad_order")
        assert not bad["accepted"] and bad["state"]["revision"] == 1
        result["invalid_plan"] = {"outcome": bad, "snapshot": inspect(path)}
        # Deliberately key the aggregate by step name alone. A valid new plan
        # then reuses 37 from the older input and writes a wrong actual report.
        path = root/"wrong-cache.sqlite"
        initialize(path, "adaptive", False, 3)
        invoke(path, "advance", bad_cache_key=1)
        invoke(path, "update_source")
        invoke(path, "advance", bad_cache_key=1)
        invoke(path, "propose", behavior="good")
        invoke(path, "advance", bad_cache_key=1)
        invoke(path, "approve", message=message(inspect(path), "approve-wrong-draft"))
        invoke(path, "advance", bad_cache_key=1)
        wrong = inspect(path)
        result["wrong_cache_key"] = {"done": wrong, "oracle": independent_oracle(path)}
        assert wrong["state"]["phase"] == "DONE" and not independent_oracle(path)["accepted"]
        assert independent_oracle(path)["actual_total"] == 37
        # An independent check must also reject a changed source manifest.
        original = root/"adaptive.sqlite"
        path = root/"corrupt-artifact.sqlite"
        with connect(original) as old, connect(path) as copied:
            old.backup(copied)
        with connect(path) as db:
            report = json.loads(db.execute("SELECT body FROM reports").fetchone()[0])
            report["manifest"][1]["sha256"] = "0"*64
            db.execute("UPDATE reports SET body=?", (canonical(report),))
        result["corrupt_artifact"] = independent_oracle(path)
        assert not result["corrupt_artifact"]["accepted"]
    return {"status": "passed", "sqlite": sqlite3.sqlite_version, "cases": result,
            "scope": "fresh real subprocesses and SQLite; scripted proposals; one transactional domain; no LLM, authentication service or framework SDK"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", default="run", choices=["run", "init", "inspect", "approval_message", "advance", "propose", "approve", "update_source"])
    parser.add_argument("--db")
    parser.add_argument("--behavior", default="good", choices=["good", "repeat", "bad_order"])
    parser.add_argument("--message", type=json.loads)
    parser.add_argument("--stop-after-draft", type=int, default=0)
    parser.add_argument("--bad-cache-key", type=int, default=0)
    parser.add_argument("--mode", default="adaptive", choices=["adaptive", "fixed"])
    parser.add_argument("--has-extra", type=int, default=1)
    parser.add_argument("--budget", type=int, default=3)
    parser.add_argument("--signal-id", default="approval-1")
    parser.add_argument("--output-dir")
    args = parser.parse_args()
    if args.command == "run":
        output = run_scenarios(args.output_dir)
    elif args.command == "init":
        initialize(args.db, args.mode, bool(args.has_extra), args.budget)
        output = inspect(args.db)
    elif args.command in ["inspect", "approval_message"]:
        snapshot = inspect(args.db)
        output = snapshot if args.command == "inspect" else message(snapshot, args.signal_id)
    else:
        with connect(args.db) as db:
            db.execute("BEGIN IMMEDIATE")
            if args.command == "advance":
                output = advance(db, bool(args.stop_after_draft), bool(args.bad_cache_key))
            elif args.command == "propose":
                output = propose(db, args.behavior)
            elif args.command == "approve":
                output = approve(db, args.message)
            else:
                output = update_source(db)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
