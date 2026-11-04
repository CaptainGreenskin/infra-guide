"""作业依赖排序。运行本文件自测，或使用 --check 检验本地实现。"""

import argparse
from collections import deque
from itertools import permutations
from pathlib import Path
import runpy
import sys


def plan_jobs(n, dependencies):
    """返回任一完整拓扑序。存在环返回 None，输入非法抛出 ValueError。"""
    if type(n) is not int or n < 0:
        raise ValueError("n must be a nonnegative integer")
    if not isinstance(dependencies, (list, tuple)):
        raise ValueError("dependencies must be a list or tuple of pairs")

    successors = [set() for _ in range(n)]
    indegree = [0] * n
    for pair in dependencies:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValueError("each dependency must contain two task IDs")
        before, after = pair
        for job in pair:
            if type(job) is not int or not 0 <= job < n:
                raise ValueError("task ID outside 0..n-1 or not an integer")
        if after not in successors[before]:
            successors[before].add(after)
            indegree[after] += 1

    ready = deque(job for job in range(n) if indegree[job] == 0)
    order = []
    while ready:
        job = ready.popleft()
        order.append(job)
        for successor in successors[job]:
            indegree[successor] -= 1
            if indegree[successor] == 0:
                ready.append(successor)
    return order if len(order) == n else None


def respects_dependencies(order, edges):
    position = {job: index for index, job in enumerate(order)}
    return all(position[a] < position[b] for a, b in edges)


def check_graph(solver, name, n, edges):
    # 小图直接枚举排列判断解是否存在，独立于参考解的入度算法。
    possible = any(respects_dependencies(p, edges) for p in permutations(range(n)))
    result = solver(n, list(edges))
    if not possible:
        if result is not None:
            raise AssertionError(f"{name}: cyclic graph, expected None, got {result!r}")
        return
    if not isinstance(result, list) or any(type(job) is not int for job in result):
        raise AssertionError(f"{name}: expected a list of integer IDs, got {result!r}")
    if sorted(result) != list(range(n)) or not respects_dependencies(result, edges):
        raise AssertionError(f"{name}: invalid order {result!r} for {edges!r}")


def self_test(solver):
    cases = [
        ("empty", 0, []),
        ("isolated jobs", 4, []),
        ("duplicate dependency", 3, [(2, 0), (2, 0), (0, 1)]),
        ("diamond, two valid orders", 4, [(0, 1), (0, 2), (1, 3), (2, 3)]),
        ("disconnected DAG with an isolated job", 5, [(4, 2), (1, 3)]),
        ("cycle plus runnable jobs", 4, [(0, 1), (2, 3), (3, 2)]),
        ("self-dependency", 1, [(0, 0)]),
    ]
    for name, n, edges in cases:
        check_graph(solver, name, n, edges)

    invalid = [
        (-1, []), (True, []), (3, None), (3, [(0,)]), (3, [(0, 1, 2)]),
        (3, [(-1, 1)]), (3, [(1, 3)]), (3, [(False, 1)]), (3, [(1.0, 2)]),
        (3, [(0, 0), (1, 4)]),  # 先检查整份输入，不能让环遮住非法 ID。
    ]
    for n, edges in invalid:
        try:
            solver(n, edges)
        except ValueError:
            continue
        raise AssertionError(f"invalid input: expected ValueError for {(n, edges)!r}")

    arcs = [(a, b) for a in range(3) for b in range(3)]
    graph_count = 1 << len(arcs)
    for mask in range(graph_count):
        edges = [edge for index, edge in enumerate(arcs) if mask & (1 << index)]
        check_graph(solver, f"three-job graph {mask}", 3, edges)
    print(f"PASS: {len(cases)} named graphs, {len(invalid)} invalid inputs, "
          f"{graph_count} exhaustive three-job graphs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", metavar="FILE", type=Path,
                        help="本地 .py 文件，须定义 plan_jobs(n, dependencies)")
    args = parser.parse_args()
    solver = plan_jobs
    if args.check is not None:
        if not args.check.is_file() or args.check.suffix != ".py":
            parser.error("--check requires a local .py file")
        solver = runpy.run_path(str(args.check)).get("plan_jobs")
        if not callable(solver):
            parser.error("the specified file must define plan_jobs(n, dependencies)")
    try:
        self_test(solver)
    except Exception as error:
        sys.exit(f"FAIL: {type(error).__name__}: {error}")


if __name__ == "__main__":
    main()
