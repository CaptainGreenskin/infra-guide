"""Check a HAProxy failover record without starting HAProxy or trusting runner summaries."""
import argparse
import hashlib
import json
from pathlib import Path
import re


REPORT = {
    "tenant": "A", "report": "R3", "commit_seq": 102, "database_seq": 103,
    "object": "object-v3", "sha256": "77a43a9c8bde8f64206a686aa1f97d4ea9772c8bcca9a132d202058be44dbf32",
}
ATTACHMENT = b"A report 3"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def valid_metadata(row, backend):
    return (
        row["status"] == 200 and row["backend"] == backend and row["echo"] == row["request_id"]
        and json.loads(row["body"]) == REPORT
    )


def complete(row, backend):
    report, attachment = row["report"], row["attachment"]
    return (
        valid_metadata(report, backend) and attachment["status"] == 200
        and attachment["backend"] == backend and attachment["echo"] == attachment["request_id"]
        and attachment["body"].encode() == ATTACHMENT
        and attachment["sha256"] == digest(ATTACHMENT) == REPORT["sha256"]
    )


def normalized_config(case):
    config = case["config"]
    endpoints = case["backend_endpoints"]
    assert set(endpoints) == {"backend-a", "backend-b"}
    addresses = [case["frontend"], endpoints["backend-a"], endpoints["backend-b"]]
    assert len(set(addresses)) == 3 and all(re.fullmatch(r"127\.0\.0\.1:[1-9]\d*", address) for address in addresses)
    assert f"bind {case['frontend']}\n" in config
    assert f"server backend-a {endpoints['backend-a']} check\n" in config
    assert f"server backend-b {endpoints['backend-b']} check backup\n" in config
    assert "http-check expect status 200\n" in config
    assert "inter 80ms fall 2 rise 2 init-state fully-down\n" in config
    config = re.sub(r"stats socket /tmp/hap-r3-[^/]+/stats\.sock mode 600 level user", "stats socket <private>", config)
    assert "stats socket <private>\n" in config
    for index, address in enumerate(addresses):
        config = config.replace(address, f"<address-{index}>")
    assert f"http-check send meth GET uri {case['health_path']} ver" in config
    return config.replace(case["health_path"], "<health-path>")


def validate_case(mode, case):
    ordinary = mode == "ordinary"
    assert case["health_path"] == ("/healthz" if ordinary else "/readyz")
    initial, b_state = case["initial_proxy"], "UP" if ordinary else "DOWN"
    assert (initial["backend-a"]["status"], initial["backend-a"]["check_code"]) == ("UP", "200")
    assert (initial["backend-b"]["status"], initial["backend-b"]["check_code"]) == (b_state, "200" if ordinary else "503")
    pre = case["preflight"]
    assert pre["backend_b_health"]["status"] == 200
    assert pre["backend_b_ready"]["status"] == 503
    assert valid_metadata(pre["backend_b_report"], "backend-b")
    assert (pre["backend_b_attachment"]["status"], pre["backend_b_attachment"]["backend"]) == (404, "backend-b")

    rows = case["reads"]
    assert [row["trial"] for row in rows] == list(range(1, len(rows) + 1))
    assert rows[0]["stage"] == "before_fault" and complete(rows[0], "backend-a")
    assert (case["wrong_tenant"]["status"], case["wrong_tenant"]["backend"]) == (403, "backend-a")
    assert (case["stopped_backend_a"]["status"], case["stopped_backend_a"]["error"]) == (None, "ConnectionRefusedError")
    assert rows[0]["attachment"]["ended_ms"] <= case["fault_ms"] <= case["a_closed_ms"]
    assert case["a_closed_ms"] <= case["stopped_backend_a"]["started_ms"]

    previous_end = 0
    for row in rows:
        for kind in ("report", "attachment"):
            response = row[kind]
            request_id = f"{row['trial']}-{kind}"
            assert response["request_id"] == request_id
            assert previous_end <= response["started_ms"] <= response["ended_ms"]
            previous_end = response["ended_ms"]
            if response.get("backend"):
                assert response["echo"] == request_id

    incomplete = rows[case["incomplete_trial"] - 1]
    assert incomplete["stage"] == "after_fault"
    assert incomplete["proxy"]["backend-a"]["status"] == "DOWN"
    assert incomplete["proxy"]["backend-b"]["status"] == b_state
    assert case["a_closed_ms"] <= incomplete["report"]["started_ms"]
    assert incomplete["attachment"]["ended_ms"] <= case["repaired_ms"]
    if ordinary:
        assert valid_metadata(incomplete["report"], "backend-b")
        assert (incomplete["attachment"]["status"], incomplete["attachment"]["backend"]) == (404, "backend-b")
    else:
        for kind in ("report", "attachment"):
            assert (incomplete[kind]["status"], incomplete[kind]["backend"], incomplete[kind]["echo"]) == (503, None, None)

    tail = []
    for row in rows[case["incomplete_trial"]:]:
        assert row["stage"] == "after_repair" and row["report"]["started_ms"] >= case["repaired_ms"]
        if complete(row, "backend-b"):
            tail.append(row["trial"])
        else:
            tail.clear()
        if len(tail) == 3:
            assert row is rows[-1] and row["proxy"]["backend-b"]["status"] == "UP"
            break
    assert len(tail) == 3 and tail == case["stable_trials"]
    assert case["stable_ms"] == rows[-1]["attachment"]["ended_ms"]
    assert case["elapsed_ms_from_fault"] == case["stable_ms"] - case["fault_ms"] >= 0
    assert case["proxy_exit"] in (0, -15, 143)
    return incomplete["report"]["status"], incomplete["attachment"]["status"]


def validate_reference(path):
    result = json.loads(path.read_text())["programs"]["consistent_recovery_cut.py"]["result"]
    [r3] = [row for row in result["commits"] if row["report"] == REPORT["report"]]
    assert (r3["seq"], r3["object"]) == (REPORT["commit_seq"], REPORT["object"])
    current = result["naive_latest_database"]
    assert current["seq"] == REPORT["database_seq"]
    assert current["business_problems"] == [
        {"report": REPORT["report"], "object": REPORT["object"], "reason": "missing_object_version"}
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    parser.add_argument("--reference", type=Path, help="optionally check the original C9.4 SQLite record")
    args = parser.parse_args()
    record = json.loads(args.record.read_text())
    assert (record["schema"], record["status"], record["stable_read_count"]) == (1, "observed", 3)
    assert record["fixture"] == REPORT
    assert record["source_sha256"] == digest(Path(__file__).with_name("failover_lab.py").read_bytes())
    assert re.match(r"^HAProxy version 3\.2\.26(?:[-+ ]|$)", record["environment"]["haproxy_version"])
    assert re.fullmatch(r"[a-f0-9]{64}", record["environment"]["haproxy_sha256"])
    assert set(record["cases"]) == {"ordinary", "material"}
    assert normalized_config(record["cases"]["ordinary"]) == normalized_config(record["cases"]["material"])
    if args.reference:
        validate_reference(args.reference)
    for name, case in record["cases"].items():
        report_status, attachment_status = validate_case(name, case)
        print(f"{name}: report={report_status} attachment={attachment_status}, "
              f"then 3 complete B readbacks in {case['elapsed_ms_from_fault']} ms locally")


if __name__ == "__main__":
    main()
