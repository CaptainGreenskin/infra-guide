"""SQLite queue reference with a controlled logical clock; not an SQS implementation."""
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile


class Queue:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE messages(id TEXT PRIMARY KEY,event_id TEXT,total INT,visible_at INT,epoch INT,deleted INT)")

    def put(self, message_id, event_id, total):
        self.db.execute("INSERT INTO messages VALUES(?,?,?,0,0,0)", (message_id, event_id, total))
        self.db.commit()

    def receive(self, message_id, now, visibility=30):
        if visibility <= 0:
            raise ValueError("positive visibility required")
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            row = self.db.execute("SELECT event_id,total,visible_at,epoch,deleted FROM messages WHERE id=?", (message_id,)).fetchone()
            if row is None or row[4] or row[2] > now:
                return None
            epoch = row[3] + 1
            self.db.execute("UPDATE messages SET epoch=?,visible_at=? WHERE id=?", (epoch, now+visibility, message_id))
        return {"message_id": message_id, "event_id": row[0], "total": row[1], "epoch": epoch,
                "receipt_handle": message_id+":"+str(epoch), "visible_at": now+visibility}

    def acknowledge(self, receipt, now):
        # This deliberately strict reference rejects expired/stale handles.
        # Real SQS documents that an old handle can return success without deleting.
        with self.db:
            changed = self.db.execute("UPDATE messages SET deleted=1 WHERE id=? AND epoch=? AND visible_at>? AND deleted=0",
                                      (receipt["message_id"], receipt["epoch"], now)).rowcount
        return changed == 1

    def extend(self, receipt, now, visibility):
        if visibility <= 0:
            raise ValueError("positive visibility required")
        with self.db:
            changed = self.db.execute("UPDATE messages SET visible_at=? WHERE id=? AND epoch=? AND visible_at>? AND deleted=0",
                                      (now+visibility, receipt["message_id"], receipt["epoch"], now)).rowcount
        return changed == 1


def apply(db, event_id, total):
    intent = hashlib.sha256(json.dumps({"tenant": "demo", "total": total}, sort_keys=True).encode()).hexdigest()
    with db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT intent,result FROM inbox WHERE tenant='demo' AND event_id=?", (event_id,)).fetchone()
        if row:
            if row[0] != intent:
                raise ValueError("same_business_id_different_intent")
            return {"duplicate": True, "total": row[1]}
        db.execute("INSERT INTO effects VALUES('demo',?,?)", (event_id, total))
        db.execute("INSERT INTO inbox VALUES('demo',?,?,?)", (event_id, intent, total))
    return {"duplicate": False, "total": total}


def main():
    with tempfile.TemporaryDirectory(prefix="infra-visibility-") as temporary:
        root = Path(temporary)
        queue = Queue(root / "queue.db")
        business = sqlite3.connect(root / "business.db")
        business.executescript("CREATE TABLE effects(tenant TEXT,event_id TEXT,total INT,PRIMARY KEY(tenant,event_id));"
                               "CREATE TABLE inbox(tenant TEXT,event_id TEXT,intent TEXT,result INT,PRIMARY KEY(tenant,event_id));")
        queue.put("msg-A", "report-27", 37)
        first = queue.receive("msg-A", 0)
        assert queue.receive("msg-A", 29) is None
        second = queue.receive("msg-A", 31)
        assert first["receipt_handle"] != second["receipt_handle"]
        # The first executor is slow, not stopped: it can still reach the effect service.
        old_worker = apply(business, first["event_id"], first["total"])
        stale_ack = queue.acknowledge(first, 32)
        new_worker = apply(business, second["event_id"], second["total"])
        current_ack = queue.acknowledge(second, 33)
        timeline = [{"at": 0, "event": "receive_first"}, {"at": 31, "event": "receive_second"},
                    {"at": 32, "event": "old_executor_applies_and_stale_ack_is_rejected"},
                    {"at": 33, "event": "new_executor_reuses_and_acknowledges"}]
        assert not stale_ack and current_ack
        assert old_worker == {"duplicate": False, "total": 37}
        assert new_worker == {"duplicate": True, "total": 37}
        assert queue.receive("msg-A", 100) is None

        queue.put("msg-A-republished", "report-27", 37)
        third = queue.receive("msg-A-republished", 100)
        replay = apply(business, third["event_id"], third["total"])
        assert replay["duplicate"] and queue.acknowledge(third, 101)
        conflict = False
        try:
            apply(business, "report-27", 38)
        except ValueError as error:
            conflict = str(error) == "same_business_id_different_intent"
        assert conflict
        effects = business.execute("SELECT event_id,total FROM effects").fetchall()
        assert effects == [("report-27", 37)]

        queue.put("msg-renew", "report-28", 9)
        renewal = queue.receive("msg-renew", 0)
        assert queue.extend(renewal, 20, 30)
        assert queue.receive("msg-renew", 31) is None
        after_renewal = queue.receive("msg-renew", 51)
        assert after_renewal["epoch"] == 2
        assert not queue.extend(renewal, 52, 30)
        queue.db.close()
        business.close()
    print(json.dumps({"clock": "controlled_integer_seconds_not_elapsed_cloud_time",
                      "controlled_timeline": timeline,
                      "first_receive": first, "second_receive": second,
                      "old_worker_can_commit_after_visibility_expiry": old_worker,
                      "new_worker_reuses_business_receipt": new_worker,
                      "stale_ack_accepted": stale_ack, "current_ack_accepted": current_ack,
                      "republished_transport_same_business": replay, "same_id_changed_intent_rejected": conflict,
                      "effects": effects, "renewal": {"extended_at": 20, "new_visible_at": 50,
                                                       "hidden_at_31": True, "next_receive_at": 51,
                                                       "new_epoch": after_renewal["epoch"], "stale_extend_rejected": True},
                      "scope": "actual_SQLite_transactions_bounded_queue_reference_not_SQS_or_Lambda",
                      "limits": ["visibility is not execution cancellation or effect fencing",
                                 "strict stale ACK rejection is this reference contract, not SQS wire behavior",
                                 "business effect and inbox share one local DB transaction; no remote API atomicity claim"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
