"""Trusted approval, a signed runner statement, and an actual tool receipt.

Fixture-only identities and local HMAC; not OAuth, remote MCP or Kairo.
"""
from contextlib import closing
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile

TEST_SIGNING_KEY = b"public-teaching-fixture-not-a-production-key"
INTENT = {"tool": "replace_draft:v1", "tenant": "A", "object": "draft",
          "expected_version": 7, "amount": 37}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def fingerprint(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def signed_statement():
    claim = {"op": "K1", "tenant": "A", "status": "success"}
    signature = hmac.new(TEST_SIGNING_KEY, canonical(claim), hashlib.sha256).hexdigest()
    return claim, signature


def check_statement(claim, signature):
    expected = hmac.new(TEST_SIGNING_KEY, canonical(claim), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def connect(path):
    return closing(sqlite3.connect(path, isolation_level=None))


def initialize(path):
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE grants(actor TEXT, tenant TEXT, can_read INT, can_write INT,
                            PRIMARY KEY(actor, tenant));
        CREATE TABLE draft(tenant TEXT, object TEXT, version INT, amount INT,
                           PRIMARY KEY(tenant, object));
        CREATE TABLE approval(id TEXT PRIMARY KEY, actor TEXT, tenant TEXT,
                              op TEXT, digest TEXT, expires INT, consumed INT);
        CREATE TABLE receipt(tenant TEXT, op TEXT, digest TEXT, version INT,
                             amount INT, PRIMARY KEY(tenant, op));
        INSERT INTO grants VALUES('user-A','A',1,1),('user-B','B',1,1);
        INSERT INTO draft VALUES('A','draft',7,0);
        """)
        db.execute("INSERT INTO approval VALUES(?,?,?,?,?,?,0)",
                   ("R18", "user-A", "A", "K1", fingerprint(INTENT), 100))


def authorized(db, actor, tenant, action):
    row = db.execute("SELECT can_read,can_write FROM grants WHERE actor=? AND tenant=?",
                     (actor, tenant)).fetchone()
    return bool(row and row[0 if action == "read" else 1])


def apply(path, actor, op, intent, approval_id, now):
    tenant, value_digest = intent["tenant"], fingerprint(intent)
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        if not authorized(db, actor, tenant, "write"):
            db.rollback()
            return "denied"
        existing = db.execute("SELECT digest FROM receipt WHERE tenant=? AND op=?",
                              (tenant, op)).fetchone()
        if existing:
            db.rollback()
            return "duplicate" if existing[0] == value_digest else "conflict"
        approval = db.execute("SELECT actor,tenant,op,digest,expires,consumed FROM approval WHERE id=?",
                              (approval_id,)).fetchone()
        if (not approval or approval[:4] != (actor, tenant, op, value_digest)
                or approval[4] < now or approval[5]):
            db.rollback()
            return "approval_mismatch"
        if intent["tool"] != "replace_draft:v1":
            db.rollback()
            return "unsupported_tool"
        updated = db.execute("UPDATE draft SET version=version+1,amount=? "
                             "WHERE tenant=? AND object=? AND version=?",
                             (intent["amount"], tenant, intent["object"], intent["expected_version"]))
        if updated.rowcount != 1:
            db.rollback()
            return "version_conflict"
        db.execute("UPDATE approval SET consumed=1 WHERE id=?", (approval_id,))
        db.execute("INSERT INTO receipt VALUES(?,?,?,?,?)",
                   (tenant, op, value_digest, intent["expected_version"] + 1, intent["amount"]))
        db.commit()  # Effect, receipt and approval consumption share this local transaction.
        return "committed"


def lookup(path, actor, tenant, op, injected_timeout=False):
    with connect(path) as db:
        if not authorized(db, actor, tenant, "read"):
            return {"status": "denied"}
        if injected_timeout:
            return {"status": "unknown"}  # Injected adapter failure, not a real network.
        row = db.execute("SELECT digest,version,amount FROM receipt WHERE tenant=? AND op=?",
                         (tenant, op)).fetchone()
        return {"status": "found", "version": row[1], "amount": row[2]} if row else {"status": "absent_now"}


def main():
    with tempfile.TemporaryDirectory() as directory:
        path = str(Path(directory) / "tool.sqlite")
        initialize(path)
        altered = {**INTENT, "amount": 99}
        wrong = apply(path, "user-A", "K1", altered, "R18", now=10)
        assert wrong == "approval_mismatch"
        claim, signature = signed_statement()
        assert check_statement(claim, signature)
        assert not check_statement({**claim, "status": "failed"}, signature)
        unknown = lookup(path, "user-A", "A", "K1", injected_timeout=True)
        assert unknown == {"status": "unknown"}
        with connect(path) as db:
            assert db.execute("SELECT count(*) FROM receipt").fetchone()[0] == 0
        # Commit in a real subprocess, then exit before returning a receipt to its caller.
        child = subprocess.run([sys.executable, str(Path(__file__).resolve()), "--crash", path],
                               capture_output=True, text=True, timeout=10)
        assert child.returncode == 23, child.stderr
        found = lookup(path, "user-A", "A", "K1")
        assert found == {"status": "found", "version": 8, "amount": 37}
        duplicate = apply(path, "user-A", "K1", INTENT, "R18", now=110)
        assert duplicate == "duplicate"  # Current write permission + existing identical receipt.
        conflict = apply(path, "user-A", "K1", altered, "R18", now=110)
        assert conflict == "conflict"
        cross_tenant = lookup(path, "user-B", "A", "K1")
        assert cross_tenant == {"status": "denied"}
        with connect(path) as db:
            db.execute("UPDATE grants SET can_read=0,can_write=0 WHERE actor='user-A'")
        revoked = lookup(path, "user-A", "A", "K1")
        assert revoked == {"status": "denied"}
        assert apply(path, "user-A", "K1", INTENT, "R18", now=110) == "denied"
        with connect(path) as db:
            effects = db.execute("SELECT count(*) FROM receipt").fetchone()[0]
            final = db.execute("SELECT version,amount FROM draft").fetchone()
        assert effects == 1 and final == (8, 37)
    print(json.dumps({"changed_parameter": wrong,
                      "signed_claim_valid_before_effect": True,
                      "tampered_claim_rejected": True,
                      "unavailable_receipt": unknown["status"],
                      "commit_then_exit_code": child.returncode,
                      "authorized_receipt": found, "same_intent_retry": duplicate,
                      "same_key_changed_intent": conflict,
                      "cross_tenant_receipt": cross_tenant["status"],
                      "revoked_receipt": revoked["status"],
                      "effects": effects, "final_version": final[0], "final_amount": final[1],
                      "scope": "trusted fixture, local HMAC, SQLite and process exit; no remote OAuth/MCP/Kairo"}))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--crash":
        import os
        if apply(sys.argv[2], "user-A", "K1", INTENT, "R18", now=10) != "committed":
            raise RuntimeError("child did not commit")
        os._exit(23)
    main()
