"""Check the public, normalized record of the local Kairo receipt exercise."""
import argparse
from hashlib import sha256
import json
from pathlib import Path


def require(condition, detail):
    if not condition:
        raise ValueError(detail)


def verify(record):
    require(record["schema"] == 1 and record["status"] == "passed", "unexpected record")
    require(record["scope"] == "local_kairo_runtime_synthetic_commit_gap", "unexpected execution scope")
    require(record["verification_source_sha256"] == sha256(Path(__file__).read_bytes()).hexdigest(),
            "verifier source changed")
    require(record["boundary"] == {"public_view": "normalized_observations", "model": "scripted",
                                    "receiver": "local_h2", "public_provenance_verified": False},
            "record claims more than the public evidence supports")
    fixture, phases = record["fixture"], record["phases"]
    require(fixture == {"base": [10, 27], "supplement": [5], "saved_source_version": 3,
                        "mismatch_expected_version": 4}, "unexpected input fixture")
    reports = [{"amount": sum(fixture["base"]) + sum(fixture["supplement"]),
                "source_version": fixture["saved_source_version"]}]
    reads = ["base", "late"]

    require(phases["prepare"] == {"receiver": {"reports": [], "body_reads": reads},
                                   "saved_history_messages": 6}, "preparation or receiver baseline changed")
    require(phases["after_commit_exit"] == {"receiver": {"reports": reports, "body_reads": reads},
                                             "jvm_exit_code": 23, "local_receipt_saved": False},
            "the commit-before-receipt boundary is missing")
    for case, match, conclusion in [("matched", True, "RECEIPT_CONFIRMED"),
                                    ("version_mismatch", False, "NEEDS_VERIFICATION")]:
        result = phases[case]
        require(result == {"receiver": {"reports": reports, "body_reads": reads},
                           "lookup_same_original_operation": True, "receipt_match": match,
                           "write_handler_entries": 0, "runtime_state": "COMPLETED",
                           "business_result": conclusion}, case + ": receiver or conclusion changed")
    require(record["observations"] == {"distinct_jvms": 4, "independent_receiver_readbacks": 4},
            "missing process or independent receiver observations")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path)
    args = parser.parse_args()
    verify(json.loads(args.record.read_text()))
    print("passed: normalized observations are consistent; public provenance is unverified")
