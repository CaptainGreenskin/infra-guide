"""Declared A/B/C outcomes under bounded batch policies; no cloud function is invoked."""
import json


def reference(partial_enabled=True, fifo=False, raises=False):
    ids = ["msg-A", "msg-B", "msg-C"]
    effects, failures, processed = [], [], []
    stop = False
    for identity in ids:
        if stop:
            failures.append(identity)
            continue
        processed.append(identity)
        if identity == "msg-B":
            failures.append(identity)
            stop = fifo
        else:
            effects.append(identity)
    response = {"batchItemFailures": [{"itemIdentifier": value} for value in failures]}
    retries = ids if raises else failures if partial_enabled else []
    acknowledged = [identity for identity in ids if identity not in retries]
    return {"partial_enabled": partial_enabled, "fifo_stop_after_failure": fifo,
            "handler_raises_after_processing": raises, "processed": processed,
            "effects": effects, "normal_response_if_returned": response,
            "transport_retries": retries, "acknowledged": acknowledged,
            "acknowledged_without_effect": [identity for identity in acknowledged if identity not in effects]}


def main():
    cases = {"standard_partial": reference(), "partial_not_enabled": reference(False),
             "handler_raises": reference(raises=True), "fifo_stop": reference(fifo=True)}
    assert cases["standard_partial"]["transport_retries"] == ["msg-B"]
    assert cases["standard_partial"]["effects"] == ["msg-A", "msg-C"]
    assert cases["partial_not_enabled"]["acknowledged_without_effect"] == ["msg-B"]
    assert cases["handler_raises"]["transport_retries"] == ["msg-A", "msg-B", "msg-C"]
    assert cases["fifo_stop"]["processed"] == ["msg-A", "msg-B"]
    assert cases["fifo_stop"]["transport_retries"] == ["msg-B", "msg-C"]
    assert cases["fifo_stop"]["effects"] == ["msg-A"]
    print(json.dumps({"fixture": "declared_A_success_B_failure_C_success_or_unprocessed",
                      "cases": cases, "scope": "bounded_policy_reference_not_Lambda_or_SQS_execution",
                      "note": "Only the enabled mapping interprets the normal partial response; an exception fails the whole batch."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
