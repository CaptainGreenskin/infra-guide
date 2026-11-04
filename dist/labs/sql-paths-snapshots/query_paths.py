"""Actual SQLite plans and progress callbacks for one fixed order-list query.

Four independent in-memory databases contain the same 240 rows. Progress
callbacks with N=1 are an observation, not exact row/IO counts or a timer.
"""
import json
from contextlib import closing
import platform
import sqlite3

ROWS = [(i, (i-1) % 3, "paid" if i % 4 == 0 else "pending",
         1000+i, i*7, "note-"+str(i)) for i in range(1, 241)]
QUERY = """SELECT id, amount FROM orders
WHERE tenant=? AND status=? AND created>=?
ORDER BY created DESC, id DESC LIMIT 5"""
PARAMS = (1, "paid", 1100)
INDEXES = {
    "no_index": None,
    "tenant_only": "CREATE INDEX feed_tenant ON orders(tenant)",
    "composite": "CREATE INDEX feed_order ON orders(tenant,status,created DESC,id DESC)",
    "covering": "CREATE INDEX feed_cover ON orders(tenant,status,created DESC,id DESC,amount)",
}


def inspect(connection, query):
    plan = [list(row) for row in connection.execute("EXPLAIN QUERY PLAN "+query, PARAMS)]
    # Prepare and execute once before counting; statement caching is left enabled.
    warmed = connection.execute(query, PARAMS).fetchall()
    callbacks = 0

    def progress():
        nonlocal callbacks
        callbacks += 1
        return 0

    connection.set_progress_handler(progress, 1)
    try:
        rows = connection.execute(query, PARAMS).fetchall()
    finally:
        connection.set_progress_handler(None, 0)
    assert rows == warmed and callbacks > 0
    return {"plan": plan, "result": rows, "progress_callbacks_n1": callbacks}


def main():
    expected = [(236, 1652), (224, 1568), (212, 1484), (200, 1400), (188, 1316)]
    cases = {}
    expression_sort = None
    for name, ddl in INDEXES.items():
        with closing(sqlite3.connect(":memory:")) as db:
            db.execute("CREATE TABLE orders(id INTEGER PRIMARY KEY, tenant INT, "
                       "status TEXT, created INT, amount INT, note TEXT)")
            db.executemany("INSERT INTO orders VALUES(?,?,?,?,?,?)", ROWS)
            if ddl:
                db.execute(ddl)
            db.commit()
            cases[name] = {"index_ddl": ddl, **inspect(db, QUERY)}
            assert cases[name]["result"] == expected
            if name == "covering":
                changed = QUERY.replace("created DESC, id DESC", "abs(created) DESC, id DESC")
                expression_sort = {"query": changed, **inspect(db, changed)}
                assert expression_sort["result"] == expected
    counts = {"all_rows": len(ROWS),
              "tenant_rows": sum(r[1] == 1 for r in ROWS),
              "tenant_status_rows": sum(r[1] == 1 and r[2] == "paid" for r in ROWS),
              "all_predicates_rows": sum(r[1] == 1 and r[2] == "paid" and r[3] >= 1100
                                         for r in ROWS), "returned_rows": 5}
    assert counts == {"all_rows":240, "tenant_rows":80, "tenant_status_rows":20,
                      "all_predicates_rows":12, "returned_rows":5}
    print(json.dumps({"status":"passed", "python":platform.python_version(),
                      "sqlite":sqlite3.sqlite_version, "query":QUERY, "parameters":PARAMS,
                      "distribution_counts":counts, "cases":cases,
                      "expression_sort":expression_sort,
                      "metric_scope":(
                          "Progress callbacks at N=1 after warming the statement; "
                          "not exact VM instructions, visited rows, physical IO or elapsed time. "
                          "EXPLAIN text is diagnostic and may change by SQLite version.")}, indent=2))


if __name__ == "__main__":
    main()
