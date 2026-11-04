"""Finite placement search over declared slots, then actual two-process SQLite group reservation."""
from dataclasses import dataclass
import json
import multiprocessing as mp
from pathlib import Path
import sqlite3
import tempfile


@dataclass(frozen=True)
class Node:
    name: str
    gpu: int
    cpu: int = 64
    memory_gib: int = 256
    flavor: str = "A100-fixture"
    rack: str = "rack-a"


def place(nodes, workers, same_rack=False, first_fit=False):
    remaining = [[n.gpu, n.cpu, n.memory_gib] for n in nodes]
    assigned = []

    def search(index):
        if index == len(workers):
            return list(assigned)
        gpu = workers[index]
        for i, node in enumerate(nodes):
            if node.flavor != "A100-fixture" or any(a < b for a, b in zip(remaining[i], [gpu, 4, 8])):
                continue
            if same_rack and assigned and node.rack != nodes[assigned[0]].rack:
                continue
            remaining[i] = [a-b for a, b in zip(remaining[i], [gpu, 4, 8])]
            assigned.append(i)
            result = search(index+1)
            if result is not None:
                return result
            assigned.pop()
            remaining[i] = [a+b for a, b in zip(remaining[i], [gpu, 4, 8])]
            if first_fit:
                return None
        return None

    result = search(0)
    return None if result is None else [nodes[i].name for i in result]


def quota(borrowing_limit):
    used, nominal, request, available_lending = 12, 16, 16, 12
    borrowed = max(0, used+request-nominal)
    return {"used_after": used+request, "borrow_required": borrowed,
            "borrowing_limit": borrowing_limit, "lending_available": available_lending,
            "quota_allowed": borrowed <= min(borrowing_limit, available_lending)}


class InjectedFailure(Exception):
    pass


def reserve(path, job, expected, inject=False):
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    try:
        db.execute("BEGIN IMMEDIATE")
        current = dict(db.execute("SELECT name,version FROM nodes"))
        if current != expected:
            db.rollback()
            return "stale_snapshot"
        if db.execute("SELECT used FROM quota").fetchone()[0] + 16 > 16:
            db.rollback()
            return "quota_blocked"
        for number, name in enumerate(["node-1", "node-2"]):
            changed = db.execute("UPDATE nodes SET free=free-8,version=version+1 WHERE name=? AND free>=8 AND version=?",
                                 (name, expected[name])).rowcount
            if changed != 1:
                db.rollback()
                return "capacity_changed"
            if inject and number == 0:
                raise InjectedFailure()
            db.execute("INSERT INTO allocations VALUES(?,?,8)", (job, name))
        db.execute("UPDATE quota SET used=used+16")
        db.commit()
        return "admitted"
    except InjectedFailure:
        db.rollback()
        return "injected_rollback"
    finally:
        db.close()


def contender(path, job, expected, barrier, output):
    try:
        barrier.wait(timeout=10)
        output.put({"job": job, "result": reserve(path, job, expected)})
    except Exception as error:
        output.put({"job": job, "error": type(error).__name__})


def inspect(path):
    with sqlite3.connect(path) as db:
        return {"nodes": [{"name": name, "free": free, "version": version}
                          for name, free, version in db.execute("SELECT * FROM nodes ORDER BY name")],
                "quota_used": db.execute("SELECT used FROM quota").fetchone()[0],
                "allocations": [{"job": job, "node": node, "gpu_slots": slots}
                                for job, node, slots in db.execute("SELECT * FROM allocations ORDER BY job,node")]}


def main():
    nodes = [Node("n1", 8), Node("n2", 4), Node("n3", 4), Node("n4", 0)]
    finite = {"free_gpu_slots": [8, 4, 4, 0], "workers_8_8": place(nodes, [8, 8]),
              "workers_8_4_4": place(nodes, [8, 4, 4]),
              "quota_borrow_8": quota(8), "quota_borrow_12": quota(12),
              "greedy_4_then_8": place([Node("n1", 8), Node("n2", 4)], [4, 8], first_fit=True),
              "search_4_then_8": place([Node("n1", 8), Node("n2", 4)], [4, 8]),
              "rack_required": place([Node("n1", 8), Node("n2", 8, rack="rack-b")], [8, 8], same_rack=True),
              "rack_unconstrained": place([Node("n1", 8), Node("n2", 8, rack="rack-b")], [8, 8]),
              "wrong_flavor": place([Node("n1", 8, flavor="T4-fixture")], [8]),
              "cpu_short": place([Node("n1", 8, cpu=2)], [8]),
              "memory_short": place([Node("n1", 8, memory_gib=4)], [8])}
    assert finite["workers_8_8"] is None and finite["workers_8_4_4"] == ["n1", "n2", "n3"]
    assert not finite["quota_borrow_8"]["quota_allowed"] and finite["quota_borrow_12"]["quota_allowed"]
    assert finite["greedy_4_then_8"] is None and finite["search_4_then_8"] == ["n2", "n1"]
    assert finite["rack_required"] is None and finite["rack_unconstrained"] == ["n1", "n2"]
    assert all(finite[k] is None for k in ["wrong_flavor", "cpu_short", "memory_short"])
    with tempfile.TemporaryDirectory(prefix="infra-reservation-") as temporary:
        path = str(Path(temporary) / "reservations.db")
        with sqlite3.connect(path) as db:
            db.executescript("CREATE TABLE nodes(name TEXT PRIMARY KEY,free INT CHECK(free>=0),version INT);"
                             "INSERT INTO nodes VALUES('node-1',8,0),('node-2',8,0);"
                             "CREATE TABLE allocations(job TEXT,node TEXT,gpu_slots INT,PRIMARY KEY(job,node));"
                             "CREATE TABLE quota(used INT CHECK(used BETWEEN 0 AND 16)); INSERT INTO quota VALUES(0);")
        expected = {"node-1": 0, "node-2": 0}
        before = inspect(path)
        rollback = reserve(path, "injected", expected, True)
        assert rollback == "injected_rollback" and inspect(path) == before
        context = mp.get_context("spawn")
        barrier, output = context.Barrier(2), context.Queue()
        processes = [context.Process(target=contender, args=(path, job, expected, barrier, output))
                     for job in ["job-X", "job-Y"]]
        try:
            for process in processes:
                process.start()
            results = sorted([output.get(timeout=15) for _ in processes], key=lambda r: r["job"])
            for process in processes:
                process.join(timeout=10)
                assert not process.is_alive() and process.exitcode == 0
        finally:
            for process in processes:
                if process.is_alive():
                    process.terminate()
                    process.join(timeout=5)
            output.close()
            output.join_thread()
        after = inspect(path)
        assert sorted(row["result"] for row in results) == ["admitted", "stale_snapshot"]
        assert [n["free"] for n in after["nodes"]] == [0, 0] and after["quota_used"] == 16
        assert len(after["allocations"]) == 2 and len({a["job"] for a in after["allocations"]}) == 1
    print(json.dumps({"resource_kind": "declared_integer_gpu_slots_not_devices", "finite_search": finite,
                      "group_reservation": {"injected_after_first_node": rollback, "rollback_state": before,
                                            "contenders": results, "committed_state": after},
                      "scope": "finite_reference_search_and_real_two_process_SQLite_transactions_not_Kueue_or_Kubernetes",
                      "limits": ["search models only declared scalar resources, flavor and optional rack constraint",
                                 "one DB transaction is not a multi-object Kubernetes API transaction",
                                 "reservation does not prove device health, pod readiness or first training update"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
