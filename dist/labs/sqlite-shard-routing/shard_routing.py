#!/usr/bin/env python3
"""Compare placement, SQL access paths and traffic skew on real SQLite files."""

import argparse
from contextlib import ExitStack, closing
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import tempfile


TENANT_BUCKET = {"A": 0, "B": 1, "C": 1}
ROWS = [(tenant, order_id, order_id % 100) for tenant, first, last in
        [("A", 101, 112), ("B", 201, 202), ("C", 301, 302)]
        for order_id in range(first, last + 1)]
SCHEMA = """CREATE TABLE orders (
    tenant TEXT NOT NULL, order_id INTEGER NOT NULL, amount INTEGER NOT NULL,
    PRIMARY KEY (tenant, order_id)
) WITHOUT ROWID"""
POINT = "SELECT amount FROM orders WHERE tenant = ? AND order_id = ?"
SUMMARY = "SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM orders WHERE tenant = ?"


def require(actual, expected):
    if actual != expected:
        raise RuntimeError(f"expected {expected!r}, got {actual!r}")
    return actual


def tenant_only(tenant, _order_id):
    return TENANT_BUCKET[tenant]


def tenant_order(tenant, order_id):
    return (TENANT_BUCKET[tenant] + order_id) % 2


def connect(stack, file, rows):
    connection = stack.enter_context(closing(sqlite3.connect(str(file))))
    with connection:
        connection.execute(SCHEMA)
        connection.executemany("INSERT INTO orders VALUES (?, ?, ?)", rows)
    name = Path(connection.execute("PRAGMA database_list").fetchone()[2]).resolve()
    require(name, file.resolve())
    return connection


def summarize(connection, tenant):
    return list(connection.execute(SUMMARY, (tenant,)).fetchone())


def run_placement(stack, root, oracle, name, route, summary_shards):
    shards = [connect(stack, root / f"{name}-{index}.sqlite", (row for row in ROWS if route(*row[:2]) == index))
              for index in range(2)]
    placed = [shard.execute("SELECT tenant, order_id, amount FROM orders ORDER BY tenant, order_id").fetchall()
              for shard in shards]
    require(sorted(placed[0] + placed[1]), ROWS)
    traces = []
    for index, shard in enumerate(shards):
        shard.set_trace_callback(lambda sql, index=index: traces.append({"shard": index, "sql": sql}))

    def point_workload(order_ids):
        start = len(traces)
        amounts = []
        for order_id in order_ids:
            key = ("A", order_id)
            index = route(*key)
            actual = shards[index].execute(POINT, key).fetchone()
            require(actual, oracle.execute(POINT, key).fetchone())
            amounts.append(actual[0])
        statements = traces[start:]
        require(len(statements), len(order_ids))
        return {"orders": list(order_ids), "amounts": amounts, "sql_trace": statements,
                "queries_by_shard": [sum(row["shard"] == index for row in statements) for index in range(2)]}

    distinct = point_workload(range(101, 113))
    hot = point_workload([104] * 12)
    start = len(traces)
    partials = [{"shard": index, "count_sum": summarize(shards[index], "A")} for index in summary_shards]
    summary_trace = traces[start:]
    require(len(summary_trace), len(summary_shards))
    merged = [sum(row["count_sum"][column] for row in partials) for column in range(2)]
    require(merged, summarize(oracle, "A"))
    plans = {"point": shards[route("A", 104)].execute("EXPLAIN QUERY PLAN " + POINT, ("A", 104)).fetchall(),
             "tenant_summary": shards[summary_shards[0]].execute("EXPLAIN QUERY PLAN " + SUMMARY, ("A",)).fetchall()}
    return {"files": [f"{name}-{i}.sqlite" for i in range(2)], "rows_by_shard": [len(rows) for rows in placed],
            "placement_rows": placed, "distinct_orders": distinct, "hot_order": hot, "query_plans": plans,
            "tenant_summary": {"partials": partials, "merged": merged, "sql_trace": summary_trace,
                               "shard_zero_only": summarize(shards[0], "A")}}


def run(root):
    with ExitStack() as stack:
        oracle = connect(stack, root / "oracle.sqlite", ROWS)
        expected = {"tenant_a_count_sum": summarize(oracle, "A"),
                    "order_a104_amount": oracle.execute(POINT, ("A", 104)).fetchone()[0]}
        cases = {"tenant_only": run_placement(stack, root, oracle, "tenant-only", tenant_only, [0]),
                 "tenant_order": run_placement(stack, root, oracle, "tenant-order", tenant_order, [0, 1])}
    for name, rows, distinct, summary, first in [
        ("tenant_only", [12, 4], [12, 0], [12, 78], [12, 78]),
        ("tenant_order", [8, 8], [6, 6], [12, 78], [6, 42]),
    ]:
        observed = cases[name]
        require(observed["rows_by_shard"], rows)
        require(observed["distinct_orders"]["queries_by_shard"], distinct)
        require(observed["hot_order"]["queries_by_shard"], [12, 0])
        require(observed["tenant_summary"]["merged"], summary)
        require(observed["tenant_summary"]["shard_zero_only"], first)
    return {"tenant_buckets": TENANT_BUCKET, "fixture_rows": ROWS, "oracle": expected, "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="infra-sqlite-shards-") as directory:
        root = Path(directory)
        observations = run(root)
    require(root.exists(), False)
    report = {"schema": 1, "source_sha256": {Path(__file__).name: hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
              "environment": {"sqlite": sqlite3.sqlite_version, "python": platform.python_version(),
                              "platform": platform.system(), "machine": platform.machine()},
              "observations": observations, "temporary_workspace_removed": True}
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
