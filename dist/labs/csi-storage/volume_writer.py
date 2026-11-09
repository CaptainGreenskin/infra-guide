"""One mounted-path writer used unchanged in local checks and Kubernetes Jobs.

Run without flags for a temporary local test, or --db PATH --op STABLE_ID.
This verifies only this SQLite effect protocol; cluster storage needs its own run.
"""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile


def write_once(path, op):
    with closing(sqlite3.connect(str(path), isolation_level=None, timeout=10)) as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("CREATE TABLE IF NOT EXISTS counter(id INTEGER PRIMARY KEY, value INTEGER)")
        db.execute("CREATE TABLE IF NOT EXISTS receipt(op TEXT PRIMARY KEY, before INTEGER, after INTEGER)")
        db.execute("INSERT OR IGNORE INTO counter VALUES(1,0)")
        receipt = db.execute("SELECT before,after FROM receipt WHERE op=?", (op,)).fetchone()
        duplicate = receipt is not None
        if receipt is None:
            before = db.execute("SELECT value FROM counter WHERE id=1").fetchone()[0]
            receipt = (before, before + 1)
            db.execute("UPDATE counter SET value=? WHERE id=1", (receipt[1],))
            db.execute("INSERT INTO receipt VALUES(?,?,?)", (op, *receipt))
        current = db.execute("SELECT value FROM counter WHERE id=1").fetchone()[0]
        db.commit()
        return {"op":op,"before":receipt[0],"after":receipt[1],
                "duplicate":duplicate,"current_counter":current}


def local_test():
    with tempfile.TemporaryDirectory(prefix="volume-writer-") as folder:
        path=Path(folder,'counter.sqlite')
        results=[write_once(path,op) for op in ('write-1','write-2','write-1')]
        assert [r['after'] for r in results] == [1,2,1]
        assert [r['duplicate'] for r in results] == [False,False,True]
        assert [r['current_counter'] for r in results] == [1,2,2]
        return {'sequence':results,'final_counter':2,'cluster_executed':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--db',type=Path)
    parser.add_argument('--op')
    args=parser.parse_args()
    if bool(args.db) != bool(args.op):
        parser.error('--db and --op must be supplied together')
    result=write_once(args.db,args.op) if args.db else local_test()
    print(json.dumps(result,ensure_ascii=False,indent=2))
