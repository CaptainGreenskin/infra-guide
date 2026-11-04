"""A bounded HPA resource-calculation reference and fluid queue; not a Kubernetes controller."""
from fractions import Fraction
import json
import math


def utilization(usage, requests):
    # The examined Kubernetes v1.34.1 function uses the matching request sum,
    # then integer percentage. Ready/missing classification happens elsewhere.
    observed = [i for i, value in enumerate(usage) if value is not None]
    if not observed or any(requests[i] <= 0 for i in observed):
        raise ValueError("usage needs matching positive CPU requests")
    percent = sum(usage[i] for i in observed) * 100 // sum(requests[i] for i in observed)
    return percent


def recommendation(usage, requests, target=60, current=None, tolerance=Fraction(1, 10)):
    if current is None:
        current = len(requests)
    if len(usage) != len(requests) or not usage:
        raise ValueError("matching nonempty Pod lists required")
    if target <= 0 or any(request <= 0 for request in requests):
        raise ValueError("positive target and all Pod CPU requests required")
    known_percent = utilization(usage, requests)
    before = Fraction(known_percent, target)
    missing = [i for i, value in enumerate(usage) if value is None]
    adjusted = list(usage)
    if missing:
        fill_percent = max(100, target) if before < 1 else 0
        for i in missing:
            adjusted[i] = requests[i] * fill_percent // 100
        after_percent = utilization(adjusted, requests)
    else:
        after_percent = known_percent
    after = Fraction(after_percent, target)
    if abs(after - 1) <= tolerance:
        proposed, reason = current, "within_tolerance"
    elif (before < 1 < after) or (before > 1 > after):
        proposed, reason = current, "direction_reversed"
    else:
        proposed = math.ceil(after * len(adjusted))
        if (after < 1 and proposed > current) or (after > 1 and proposed < current):
            proposed, reason = current, "replica_direction_reversed"
        else:
            reason = "ratio_recommendation"
    return {"observed_percent": known_percent, "adjusted_percent": after_percent,
            "missing_pods": len(missing), "pre_policy_replicas": proposed, "reason": reason}


def queue_model(new_capacity, limit=None, duration=150):
    queue = dropped = completed = 0
    rows = []
    for second in range(duration):
        capacity = 120 if second < 75 else new_capacity
        available = queue + 180
        done = min(available, capacity)
        remaining = available - done
        loss = max(0, remaining - limit) if limit is not None else 0
        queue = remaining - loss
        completed += done
        dropped += loss
        rows.append({"end_second": second + 1, "capacity_per_second": capacity,
                     "queue": queue, "completed_total": completed, "rejected_total": dropped})
    drained = next((row["end_second"] for row in rows if row["end_second"] > 75 and row["queue"] == 0), None)
    assert completed + dropped + queue == 180 * duration
    return {"peak_queue": max(row["queue"] for row in rows), "final_queue": queue,
            "completed": completed, "rejected": dropped, "drained_at_second": drained,
            "samples": [row for row in rows if row["end_second"] in [1, 20, 35, 75, 76, 84, 100, 150]]}


def main():
    cases = {
        "four_ready": recommendation([180] * 4, [200] * 4),
        "requests_doubled": recommendation([180] * 4, [400] * 4),
        "heterogeneous_requests": recommendation([90, 90], [100, 900]),
        "missing_scale_up": recommendation([180, 180, 180, None], [200] * 4),
        "missing_within_tolerance": recommendation([170, 170, 170, None], [200] * 4),
        "missing_scale_down": recommendation([60, 60, 60, None], [200] * 4),
        "missing_reverses_direction": recommendation([20, None, None, None], [200] * 4),
    }
    assert [v["pre_policy_replicas"] for v in cases.values()] == [6, 3, 1, 5, 4, 4, 4]
    assert cases["missing_scale_down"]["adjusted_percent"] == 47
    # Wrong reference: arithmetic mean of each Pod's own percentage.
    wrong = (Fraction(90, 100) + Fraction(90, 900)) / 2 * 100
    assert wrong == 50 and cases["heterogeneous_requests"]["observed_percent"] == 18
    missing_request_rejected = False
    try:
        recommendation([180, None], [200, 0])
    except ValueError:
        missing_request_rejected = True
    assert missing_request_rejected
    history = [(0, 6), (60, 3), (180, 4), (301, 3), (481, 3)]
    windows = [{"now": now, "highest_in_last_300s": max(value for time, value in history if now - 300 <= time <= now)}
               for now in [60, 301, 481]]
    assert [row["highest_in_last_300s"] for row in windows] == [6, 4, 3]
    queues = {"only_match_arrival": queue_model(180), "extra_capacity": queue_model(240),
              "bounded_queue": queue_model(240, limit=500)}
    assert queues["only_match_arrival"]["final_queue"] == 4500
    assert queues["extra_capacity"]["peak_queue"] == 4500
    assert queues["extra_capacity"]["drained_at_second"] == 150
    assert queues["bounded_queue"]["peak_queue"] == 500
    assert queues["bounded_queue"]["rejected"] == 4000
    assert queues["bounded_queue"]["drained_at_second"] == 84
    connection_budget = {"database_limit": 200, "other_clients": 80,
                         "connections_per_pod": 40, "max_pods": (200 - 80) // 40,
                         "four_pods_max_each": (200 - 80) // 4}
    print(json.dumps({"basis": "Kubernetes v1.34.1 resource-utilization calculation examined",
                      "model_limits": ["all listed Pods treated as ready except missing metric",
                                       "no real metrics API, controller loop, policy history or cluster",
                                       "queue uses fixed fluid rates and one-second steps, not request latency"],
                      "recommendations": cases, "wrong_mean_pod_percent": float(wrong),
                      "missing_request_rejected": missing_request_rejected,
                      "scale_down_window": windows, "queues": queues,
                      "connection_budget": connection_budget}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

