import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

with TemporaryDirectory() as directory:
    path = Path(directory) / "orders.db"
    a = sqlite3.connect(path, isolation_level=None)
    b = sqlite3.connect(path, isolation_level=None, timeout=0)
    try:
        a.execute("CREATE TABLE orders(id INTEGER PRIMARY KEY, tenant INT, status INT, created INT)")
        a.execute("BEGIN")
        a.executemany("INSERT INTO orders VALUES(?,?,?,?)",
                      [(i, i % 10, (i // 10) % 2, i // 3) for i in range(1000)])
        a.execute("COMMIT")
        query = "SELECT id FROM orders WHERE tenant=? AND status=? ORDER BY created DESC,id DESC LIMIT 10"
        args = (4, 1)
        def inspect():
            print(a.execute("EXPLAIN QUERY PLAN " + query, args).fetchall())
            return a.execute(query, args).fetchall()
        before = inspect()
        a.execute("CREATE INDEX order_feed ON orders(tenant,status,created,id)")
        assert len(before) == 10 and inspect() == before
        a.execute("BEGIN IMMEDIATE")
        try:
            b.execute("BEGIN IMMEDIATE")
        except sqlite3.OperationalError as error:
            assert "locked" in str(error).lower(), error
        else:
            raise AssertionError("expected the second writer to wait or fail")
        a.execute("ROLLBACK")
        b.execute("BEGIN IMMEDIATE")
        b.execute("UPDATE orders SET status=1 WHERE id=0")
        b.execute("COMMIT")
        assert a.execute("SELECT status FROM orders WHERE id=0").fetchone() == (1,)
    finally:
        b.close()
        a.close()
