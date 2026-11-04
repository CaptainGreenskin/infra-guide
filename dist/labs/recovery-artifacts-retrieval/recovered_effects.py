"""Actual SQLite outbox restore and HTTP effect receipts, with receiver-owned generation checks."""
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener


@contextmanager
def connect(path):
    db = sqlite3.connect(path)
    try:
        with db:
            yield db
    finally:
        db.close()


def copy_database(source, target):
    with connect(source) as old, connect(target) as new:
        old.backup(new)


def apply(path, payload):
    with connect(path) as db:
        db.execute("BEGIN IMMEDIATE")
        epoch = db.execute("SELECT epoch FROM owner").fetchone()[0]
        if payload["epoch"] != epoch:
            return 409, {"error": "stale_owner_generation"}
        row = db.execute("SELECT total FROM effects WHERE event_id=?", (payload["event_id"],)).fetchone()
        if row is not None:
            if row[0] != payload["total"]:
                return 409, {"error": "intent_conflict"}
            return 200, {"duplicate": True, "event_id": payload["event_id"], "total": row[0]}
        db.execute("INSERT INTO effects VALUES(?,?)", (payload["event_id"], payload["total"]))
    return 200, {"duplicate": False, "event_id": payload["event_id"], "total": payload["total"]}


def main():
    with tempfile.TemporaryDirectory(prefix="infra-recovered-effects-") as temporary:
        root = Path(temporary)
        receiver, application = root / "receiver.db", root / "application.db"
        backup, restored = root / "application-backup.db", root / "application-restored.db"
        with connect(receiver) as db:
            db.executescript("CREATE TABLE owner(epoch INT); INSERT INTO owner VALUES(1);"
                             "CREATE TABLE effects(event_id TEXT PRIMARY KEY,total INT);")
        with connect(application) as db:
            db.executescript("CREATE TABLE outbox(event_id TEXT PRIMARY KEY,total INT,state TEXT);"
                             "INSERT INTO outbox VALUES('notify-R27',37,'PENDING');")
        copy_database(application, backup)
        state = {"lose_first_response": True}

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                assert set(value) == {"event_id", "total", "epoch"}
                assert type(value["event_id"]) is str and all(type(value[k]) is int for k in ["total", "epoch"])
                status, body = apply(receiver, value)
                if status == 200 and not body["duplicate"] and state["lose_first_response"]:
                    state["lose_first_response"] = False
                    status, body = 503, {"error": "injected_after_commit"}
                payload = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": .01})
        thread.start()
        opener = build_opener(ProxyHandler({}))

        def request(identity, total, epoch):
            payload = json.dumps({"event_id": identity, "total": total, "epoch": epoch}).encode()
            req = Request("http://127.0.0.1:"+str(server.server_port)+"/effects", payload, {"Content-Type": "application/json"})
            try:
                with opener.open(req, timeout=3) as response:
                    return response.status, json.load(response)
            except HTTPError as error:
                return error.code, json.load(error)

        try:
            lost_status, _ = request("notify-R27", 37, 1)
            assert lost_status == 503
            confirmed_status, confirmation = request("notify-R27", 37, 1)
            assert confirmed_status == 200 and confirmation["duplicate"]
            with connect(application) as db:
                db.execute("UPDATE outbox SET state='DONE'")
            copy_database(backup, restored)
            with connect(restored) as db:
                before = db.execute("SELECT state FROM outbox").fetchone()[0]
            assert before == "PENDING"
            # Trusted fixture controller changes the receiver's authority, outside the restored application DB.
            with connect(receiver) as db:
                db.execute("UPDATE owner SET epoch=2")
            stale_status, stale_body = request("late-old-owner", 9, 1)
            replay_status, replay = request("notify-R27", 37, 2)
            conflict_status, conflict_body = request("notify-R27", 38, 2)
            assert stale_status == 409 and stale_body["error"] == "stale_owner_generation"
            assert replay_status == 200 and replay["duplicate"] and replay["total"] == 37
            assert conflict_status == 409 and conflict_body["error"] == "intent_conflict"
            with connect(restored) as db:
                db.execute("UPDATE outbox SET state='DONE' WHERE event_id=?", (replay["event_id"],))
                after = db.execute("SELECT state FROM outbox").fetchone()[0]
            with connect(receiver) as db:
                effects = db.execute("SELECT event_id,total FROM effects ORDER BY event_id").fetchall()
            assert effects == [("notify-R27", 37)] and after == "DONE"
            negative = root / "negative-receiver.db"
            copy_database(receiver, negative)
            naive_status, naive_receipt = apply(negative, {"event_id": "notify-R27-new-key", "total": 37, "epoch": 2})
            with connect(negative) as db:
                negative_count = db.execute("SELECT COUNT(*) FROM effects").fetchone()[0]
            assert naive_status == 200 and not naive_receipt["duplicate"] and negative_count == 2
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            assert not thread.is_alive()
    print(json.dumps({"first_http_after_effect_commit": lost_status,
                      "confirmed_before_restore": confirmation, "restored_outbox_before": before,
                      "receiver_generation_after_promotion": 2, "old_owner_request": {"status": stale_status, **stale_body},
                      "recovered_replay": {"status": replay_status, **replay},
                      "same_id_changed_intent": {"status": conflict_status, **conflict_body},
                      "restored_outbox_after": after, "positive_effects": effects,
                      "new_key_negative_effect_count": negative_count,
                      "scope": "actual_local_HTTP_and_SQLite_restore_receipts_generation_not_cloud_failover_or_production_auth",
                      "limits": ["owner generation and effect mutation are checked in the receiver's one DB transaction",
                                 "authority DB is not restored with the application; promotion is a trusted fixture action",
                                 "an epoch number is not a credential; real authentication and authorized promotion are outside this fixture",
                                 "restoring application state does not undo the receiver's existing external effect"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
