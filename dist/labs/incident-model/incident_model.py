"""Deterministic teaching queue; no HTTP server or real database benchmark.

1000 requests, arrival interval 10 ms, four exclusive connections.
All times are integer milliseconds; no random input or wall-clock sampling.
"""
import hashlib
import heapq
import json
from pathlib import Path


def simulate(sql_ms, inside_wait_ms, outside_wait_ms):
    available = [(0, i) for i in range(4)]
    heapq.heapify(available)
    requests = []
    for i in range(1000):
        arrival = i * 10
        free_at, connection = heapq.heappop(available)
        acquired = max(arrival, free_at)
        released = acquired + inside_wait_ms + sql_ms
        done = released + outside_wait_ms + 10  # Same post-release application work.
        heapq.heappush(available, (released, connection))
        requests.append(dict(id=i + 1, arrival_ms=arrival, acquired_ms=acquired,
                             released_ms=released, done_ms=done,
                             pool_wait_ms=acquired - arrival, sql_ms=sql_ms,
                             inside_wait_ms=inside_wait_ms,
                             outside_wait_ms=outside_wait_ms, latency_ms=done - arrival))
    ordered = sorted(r['latency_ms'] for r in requests)
    at = 10000
    # At t, completions/releases at exactly t have already happened.
    snapshot = dict(completed=sum(r['done_ms'] <= at for r in requests),
                    queued=sum(r['arrival_ms'] <= at < r['acquired_ms'] for r in requests),
                    holding=sum(r['acquired_ms'] <= at < r['released_ms'] for r in requests),
                    after_release=sum(r['released_ms'] <= at < r['done_ms'] for r in requests))
    assert sum(snapshot.values()) == 1000
    return dict(summary=dict(mean_ms=sum(ordered) / len(ordered),
                             p95_ms=ordered[949], max_ms=ordered[-1],
                             last_completion_ms=max(r['done_ms'] for r in requests)),
                at_10000_ms=snapshot, request_201=requests[200], requests=requests)


def experiment():
    runs = dict(baseline=simulate(20, 0, 0),
                holding_external_wait=simulate(20, 30, 0),
                competing_slow_sql=simulate(50, 0, 0),
                fixed=simulate(20, 0, 30))
    bad, other, fixed = (runs[k] for k in
                          ('holding_external_wait', 'competing_slow_sql', 'fixed'))
    assert bad['summary'] == other['summary']
    assert [r['latency_ms'] for r in bad['requests']] == [r['latency_ms'] for r in other['requests']]
    assert bad['summary']['p95_ms'] == 2430 and bad['request_201']['latency_ms'] == 560
    assert bad['at_10000_ms'] == dict(completed=796, queued=199, holding=4, after_release=1)
    assert fixed['summary']['p95_ms'] == 60 and fixed['at_10000_ms']['queued'] == 0
    assert runs['baseline']['summary']['p95_ms'] == 30
    return dict(scope='Deterministic queue teaching model; not production telemetry or a performance benchmark.',
                input=dict(requests=1000, arrival_interval_ms=10, connections=4,
                           fixed_post_release_work_ms=10, percentile='nearest-rank: ceil(0.95 * 1000)'),
                source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                assertions='PASS', runs=runs)


if __name__ == '__main__':
    # Full per-request rows let readers recompute every statistic and boundary.
    Path('report.json').write_text(json.dumps(experiment(), ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: {'summary': v['summary'], 'at_10000_ms': v['at_10000_ms']}
                      for k, v in experiment()['runs'].items()}, ensure_ascii=False, indent=2))
