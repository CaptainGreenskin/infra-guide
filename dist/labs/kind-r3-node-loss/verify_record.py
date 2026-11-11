"""Validate the kind node-loss record with independent fixture, topology and readback checks."""
import argparse
import hashlib
import json
from pathlib import Path
import re


ATTACHMENT = b"A report 3"
REPORT = {
    "tenant": "A", "report": "R3", "commit_seq": 102, "database_seq": 103,
    "object": "object-v3", "sha256": "77a43a9c8bde8f64206a686aa1f97d4ea9772c8bcca9a132d202058be44dbf32",
}


def digest(contents):
    return hashlib.sha256(contents).hexdigest()


def complete(row, pod):
    report, attachment = row["report"], row["attachment"]
    for reply in (report, attachment):
        if (reply["status"], reply.get("node"), reply.get("pod_uid"), reply.get("echo")) != (
                200, pod["node"], pod["uid"], reply["request_id"]):
            return False
    return (
        json.loads(report["body"]) == REPORT
        and attachment["body"].encode() == ATTACHMENT
        and attachment["sha256"] == digest(ATTACHMENT) == REPORT["sha256"]
    )


def first_complete_window(rows, pod, since):
    consecutive = []
    for row in rows:
        if row["report"]["started_ms"] < since:
            continue
        if complete(row, pod):
            consecutive.append(row)
        else:
            consecutive.clear()
        if len(consecutive) == 3:
            return consecutive
    raise AssertionError("no three consecutive qualifying report readbacks")


def validate_snapshot(snapshot, worker, claim_name):
    assert snapshot["pod"]["node"] == worker and snapshot["pod"]["phase"] == "Running"
    assert snapshot["claim"]["phase"] == "Bound" and snapshot["claim"]["volume"] == claim_name
    assert snapshot["pv"]["local_path"] == "/var/local/infra-guide-r3"
    assert snapshot["pv"]["node_affinity"] == {"required": {"nodeSelectorTerms": [{"matchExpressions": [{
        "key": "kubernetes.io/hostname", "operator": "In", "values": [worker],
    }]}]}}
    ready = [(endpoint["uid"], endpoint["node"]) for endpoint in snapshot["endpoints"] if endpoint["ready"]]
    assert ready == [(snapshot["pod"]["uid"], worker)]


def verify(record, source):
    assert (record["schema"], record["status"], record["stable_count"]) == (1, "observed", 3)
    assert record["fixture"] == REPORT
    assert record["source_sha256"] == digest(source.read_bytes())
    assert record["cleanup"] == {"owned_kind_nodes_remaining": 0}
    assert record["toolchain"]["kind"] == "v0.33.0" and record["toolchain"]["kubectl"] == "v1.35.8"
    assert record["toolchain"]["platform"].startswith("Linux-")
    observed = record["observation"]
    nodes = observed["nodes"]
    assert set(nodes) == {"a", "b", "control-plane"} and len(set(nodes.values())) == 3
    assert re.fullmatch(r"http://127\.0\.0\.1:[1-9]\d*", observed["entry"])
    before, after = observed["before"], observed["after"]
    validate_snapshot(before, nodes["a"], "r3-a")
    validate_snapshot(after, nodes["b"], "r3-b")
    assert before["service"] == after["service"]
    assert after["service"]["node_port"] == 30950 and after["service"]["external_traffic_policy"] == "Cluster"
    assert before["claim"]["uid"] != after["claim"]["uid"]
    assert before["pv"]["uid"] != after["pv"]["uid"]
    assert before["pod"]["uid"] != after["pod"]["uid"]

    loss, blocked = observed["loss"], observed["blocked"]
    assert loss["node"] == nodes["a"] and loss["docker_running"] is False and loss["node_ready"] in {"Unknown", "False"}
    assert (blocked["phase"], blocked["node"], blocked["reason"], blocked["claim"]) == ("Pending", None, "Unschedulable", "r3-a")
    assert blocked["selector"] == {"infra-guide.test/worker": "b"}
    assert any(re.search(r"volume node affinity|persistentvolume.*node affinity", msg, re.I) for msg in blocked["messages"])
    assert observed["fault_ms"] <= loss["stopped_ms"] <= blocked["at_ms"] <= observed["restored_ms"]
    assert observed["restored_ms"] <= loss["node_not_ready_ms"] <= observed["b_route_ms"]

    backup = observed["backup_files"]
    assert backup["a"] == backup["b"] and set(backup["a"]) == {"reports.db", REPORT["object"]}
    assert re.fullmatch(r"[a-f0-9]{64}", backup["b"]["reports.db"])
    assert backup["b"][REPORT["object"]] == REPORT["sha256"]
    forbidden = observed["wrong_tenant"]
    assert (forbidden["status"], forbidden["node"], forbidden["pod_uid"], forbidden["echo"]) == (
        403, nodes["a"], before["pod"]["uid"], "wrong-tenant",
    )

    rows = observed["reads"]
    assert [row["trial"] for row in rows] == list(range(1, len(rows) + 1))
    last_end = 0
    for row in rows:
        for member in ("report", "attachment"):
            reply = row[member]
            assert reply["request_id"] == f"{row['trial']}-{member}"
            assert last_end <= reply["started_ms"] <= reply["ended_ms"]
            last_end = reply["ended_ms"]
            if reply.get("echo"):
                assert reply["echo"] == reply["request_id"]
    first = first_complete_window(rows, before["pod"], 0)
    assert [row["trial"] for row in first] == observed["before_trials"]
    assert first[-1]["attachment"]["ended_ms"] <= observed["fault_ms"]
    failed_trials = [row for row in rows if
                     loss["stopped_ms"] <= row["report"]["started_ms"] <= row["attachment"]["ended_ms"] <= observed["b_route_ms"]
                     and (row["report"]["status"], row["attachment"]["status"]) != (200, 200)]
    assert failed_trials, "no client readback failed between worker loss and confirmed route convergence"
    final = first_complete_window(rows, after["pod"], observed["b_route_ms"])
    assert [row["trial"] for row in final] == observed["stable_trials"]
    assert observed["local_elapsed_ms"] == final[-1]["attachment"]["ended_ms"] - observed["fault_ms"]
    return len(failed_trials), [row["trial"] for row in final], observed["local_elapsed_ms"]


def verify_reference(path):
    record = json.loads(path.read_text())["programs"]["consistent_recovery_cut.py"]["result"]
    [original] = [row for row in record["commits"] if row["report"] == "R3"]
    assert (original["seq"], original["object"]) == (REPORT["commit_seq"], REPORT["object"])
    assert record["all_materials_present"]["seq"] == REPORT["database_seq"]
    assert "R3" in record["all_materials_present"]["A_readable_reports"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    parser.add_argument("--reference", type=Path)
    args = parser.parse_args()
    if args.reference:
        verify_reference(args.reference)
    failures, trials, elapsed = verify(json.loads(args.record.read_text()), Path(__file__).with_name("node_loss_lab.py"))
    print(f"PASS: owned node stopped, old PVC blocked, {failures} failed readbacks, "
          f"new B claim and same NodePort delivered R3 at trials {trials}, {elapsed} ms in this local drill")


if __name__ == "__main__":
    main()
