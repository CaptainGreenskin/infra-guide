"""Math examples, not a Kubernetes controller or a cloud simulator."""
import json
from decimal import Decimal, ROUND_CEILING


def hpa_base(replicas, usage_m, request_m, target_percent):
    if replicas < 1 or min(usage_m, request_m, target_percent) <= 0:
        raise ValueError('positive inputs required')
    # Equal request and usage per Pod; no missing metrics/tolerance/rate limits.
    ratio = Decimal(str(usage_m)) / Decimal(str(request_m))
    desired = Decimal(replicas) * ratio * 100 / Decimal(str(target_percent))
    return int(desired.to_integral_value(rounding=ROUND_CEILING))


def example():
    return {
        'hpa_base_200m': hpa_base(4, 180, 200, 60),
        'hpa_base_400m': hpa_base(4, 180, 400, 60),
        'simplified_downscale_window_max': max([6, 5, 3]),
        'backlog_after_75s': (180 - 120) * 75,
        'drain_seconds_at_240_per_s': 4500 / (240 - 180),
        'mean_concurrency_150_per_s_200ms': 150 * 0.2,
        'execution_GB_seconds': 100000 * 0.5 * 0.2,
        'provisioned_GB_seconds': 12 * 0.5 * 3600,
    }

if __name__ == '__main__':
    print(json.dumps(example(), indent=2))
