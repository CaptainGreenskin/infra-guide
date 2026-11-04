"""Two local SQLite stores: source/outbox and a version-fenced cache receiver.

The source writer really exits after commit. Event delivery order is controlled.
This is not a Redis or MySQL implementation, nor a distributed atomic commit.
"""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


def connect(path):
    return closing(sqlite3.connect(path, isolation_level=None))


def initialize_source(path):
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE orders(tenant TEXT, id TEXT, version INT, state TEXT,
                            PRIMARY KEY(tenant,id));
        CREATE TABLE outbox(event TEXT PRIMARY KEY, tenant TEXT, id TEXT,
                            version INT, delivered INT DEFAULT 0);
        INSERT INTO orders VALUES('A','O-104',7,'pending');
        """)


def initialize_cache(path):
    with connect(path) as db:
        db.executescript("""
        CREATE TABLE floor(tenant TEXT,id TEXT,version INT,PRIMARY KEY(tenant,id));
        CREATE TABLE entry(tenant TEXT,id TEXT,version INT,state TEXT,PRIMARY KEY(tenant,id));
        CREATE TABLE receipt(event TEXT PRIMARY KEY,tenant TEXT,id TEXT,version INT);
        """)


def source_read(path):
    with connect(path) as db:
        return db.execute("SELECT version,state FROM orders WHERE tenant='A' AND id='O-104'").fetchone()


def source_update(path, state, rollback=False):
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("SELECT version FROM orders WHERE tenant='A' AND id='O-104'").fetchone()[0] + 1
        db.execute("UPDATE orders SET version=?,state=? WHERE tenant='A' AND id='O-104'", (version,state))
        db.execute("INSERT INTO outbox(event,tenant,id,version) VALUES(?, 'A','O-104',?)",
                   ("A:O-104:v" + str(version), version))
        if rollback:
            db.rollback()
            return "rolled_back"
        db.commit()
        return version


def cache_fill(path, snapshot):
    version, state = snapshot
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        floor = db.execute("SELECT version FROM floor WHERE tenant='A' AND id='O-104'").fetchone()
        current = db.execute("SELECT version FROM entry WHERE tenant='A' AND id='O-104'").fetchone()
        minimum = max(floor[0] if floor else 0, current[0] if current else 0)
        if version < minimum:
            db.rollback()
            return "stale_fill_rejected"
        db.execute("INSERT INTO entry VALUES('A','O-104',?,?) "
                   "ON CONFLICT(tenant,id) DO UPDATE SET version=excluded.version,state=excluded.state",
                   (version,state))
        db.commit()
        return "filled"


def cache_read(path, minimum=0):
    with connect(path) as db:
        return db.execute("SELECT e.version,e.state FROM entry e LEFT JOIN floor f "
                          "ON e.tenant=f.tenant AND e.id=f.id WHERE e.tenant='A' AND e.id='O-104' "
                          "AND e.version>=MAX(COALESCE(f.version,0),?)", (minimum,)).fetchone()


def deliver(cache, event):
    event_id, tenant, key, version = event
    with connect(cache) as db:
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute("SELECT tenant,id,version FROM receipt WHERE event=?", (event_id,)).fetchone()
        if previous:
            db.rollback()
            if previous != (tenant,key,version):
                raise ValueError("event_identity_conflict")
            return "duplicate"
        db.execute("INSERT INTO floor VALUES(?,?,?) ON CONFLICT(tenant,id) DO UPDATE "
                   "SET version=MAX(floor.version,excluded.version)", (tenant,key,version))
        db.execute("DELETE FROM entry WHERE tenant=? AND id=? AND version < "
                   "(SELECT version FROM floor WHERE tenant=? AND id=?)", (tenant,key,tenant,key))
        db.execute("INSERT INTO receipt VALUES(?,?,?,?)", event)
        db.commit()
        return "applied"


def main():
    with tempfile.TemporaryDirectory() as folder:
        source, cache = (str(Path(folder)/name) for name in ("source.sqlite","cache.sqlite"))
        initialize_source(source)
        initialize_cache(cache)
        slow_snapshot = source_read(source)
        assert cache_fill(cache, slow_snapshot) == "filled"
        child = subprocess.run([sys.executable,str(Path(__file__).resolve()),"--crash-writer",source],
                               capture_output=True,text=True,timeout=10)
        assert child.returncode == 23, child.stderr
        gap_cache, gap_source = cache_read(cache), source_read(source)
        assert gap_cache == (7,"pending") and gap_source == (8,"shipped")
        assert cache_read(cache, minimum=8) is None
        minimum_version_result = source_read(source)
        assert minimum_version_result[0] >= 8
        assert source_update(source,"bad",rollback=True) == "rolled_back"
        with connect(source) as db:
            assert db.execute("SELECT count(*) FROM outbox").fetchone()[0] == 1
        assert source_read(source) == (8,"shipped")
        assert source_update(source,"delivered") == 9
        with connect(source) as db:
            events = {row[3]:row for row in db.execute("SELECT event,tenant,id,version FROM outbox")}
        assert deliver(cache,events[9]) == "applied"
        late_fill = cache_fill(cache,slow_snapshot)
        assert late_fill == "stale_fill_rejected" and cache_read(cache) is None
        assert cache_fill(cache,source_read(source)) == "filled"
        assert deliver(cache,events[8]) == "applied"  # Old event must not lower the floor.
        duplicate = deliver(cache,events[9])  # Simulate lost source-side acknowledgement.
        assert duplicate == "duplicate" and cache_read(cache) == (9,"delivered")
        try:
            deliver(cache,(events[9][0],"A","O-104",8))
        except ValueError as error:
            identity_conflict=str(error)
        else:
            raise AssertionError("event identity was reused with another version")
        assert identity_conflict == "event_identity_conflict"
        with connect(source) as db:
            db.execute("UPDATE outbox SET delivered=1 WHERE version IN (8,9)")
        with connect(cache) as db:
            db.execute("DELETE FROM entry")  # Eviction does not delete the version floor.
        assert cache_fill(cache,slow_snapshot) == "stale_fill_rejected"
        assert cache_fill(cache,source_read(source)) == "filled"
        with connect(cache) as db:
            final_floor = db.execute("SELECT version FROM floor").fetchone()[0]
        assert final_floor == 9
        # Independent negative fixture: a cold cache lost both entries and historical floors.
        reset = str(Path(folder)/"lost-floor.sqlite")
        initialize_cache(reset)
        assert deliver(reset,events[9]) == "applied"
        with connect(reset) as db:
            db.execute("DELETE FROM floor")
            db.execute("DELETE FROM entry")
        replay_after_floor_loss = deliver(reset,events[9])
        assert replay_after_floor_loss == "duplicate"
        with connect(reset) as db:
            assert db.execute("SELECT count(*) FROM floor").fetchone()[0] == 0
        assert cache_fill(reset,slow_snapshot) == "filled"
        lost_floor = cache_read(reset)
        assert lost_floor == (7,"pending")
        with connect(source) as db:
            pending = db.execute("SELECT count(*) FROM outbox WHERE delivered=0").fetchone()[0]
        assert pending == 0
        print(json.dumps({"writer_commit_then_exit":child.returncode,
                          "event_gap":{"cache":gap_cache,"source":gap_source},
                          "minimum_version_8_read":minimum_version_result,
                          "rollback_created_event":False,"delivery_order":[9,8,9],
                          "late_fill":late_fill,"duplicate_delivery":duplicate,
                          "event_identity_conflict":identity_conflict,
                          "eviction_kept_floor":True,"final_floor":final_floor,
                          "final_cache":cache_read(cache),"pending_outbox":pending,
                          "lost_floor_negative":lost_floor,
                          "replay_after_floor_loss":replay_after_floor_loss,
                          "scope":"two local SQLite stores, controlled delivery; not Redis/MySQL or linearizable cache"}))


if __name__ == "__main__":
    if len(sys.argv)==3 and sys.argv[1]=="--crash-writer":
        import os
        assert source_update(sys.argv[2],"shipped") == 8
        os._exit(23)
    main()
