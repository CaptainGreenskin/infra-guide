"""Real loopback HTTP rotation; fixture keys and independent in-memory sessions, not production auth."""
import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, ProxyHandler, build_opener

KEYS = {"v1": "lab-only-fixture-A", "v2": "lab-only-fixture-B", "bad": "lab-only-invalid"}


class Service:
    def __init__(self):
        self.accepted = {"v1"}
        self.sessions = {}
        self.events = []
        self.lock = threading.Lock()

    def accept(self, *versions):
        with self.lock:
            self.accepted = set(versions)

    def revoke_session(self, token):
        with self.lock:
            self.sessions.pop(token, None)


def scenario(early_revoke=False):
    service = Service()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            self.respond(False)

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            self.rfile.read(length)
            self.respond(True)

        def respond(self, create_session):
            authorization = self.headers.get("Authorization", "")
            version = next((name for name, key in KEYS.items()
                            if authorization == "LabKey " + key), None)
            token = authorization[len("LabSession "):] if authorization.startswith("LabSession ") else None
            with service.lock:
                if create_session:
                    valid = self.path == "/session" and version in service.accepted
                else:
                    valid = self.path == "/data" and (version in service.accepted or token in service.sessions)
                if valid and create_session:
                    new_token = secrets.token_urlsafe(16)
                    service.sessions[new_token] = version
                    body = {"session": new_token}
                elif valid:
                    body = {"total": 37, "authenticated_as": version or service.sessions[token]}
                else:
                    body = {"error": "not_authenticated"}
                status = 200 if valid else 401
                service.events.append({"path": self.path, "mode": "session" if token else "key",
                                       "credential_version": version or "not_supplied", "status": status})
            payload = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    server = HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01})
    thread.start()
    opener = build_opener(ProxyHandler({}))
    base = "http://127.0.0.1:" + str(server.server_port)

    def request(version=None, session=None, create=False):
        header = "LabSession " + session if session else "LabKey " + KEYS[version]
        req = Request(base + ("/session" if create else "/data"),
                      b"{}" if create else None,
                      {"Authorization": header, "Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=3) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    active = "v1"

    def reload(candidate):
        nonlocal active
        status, _ = request(version=candidate)
        if status == 200:
            active = candidate
            return True
        return False

    try:
        initial, _ = request(version=active)
        assert initial == 200
        if early_revoke:
            service.accept("v2")
            before = active
            interrupted, _ = request(version=active)
            assert interrupted == 401 and reload("v2")
            recovered, _ = request(version=active)
            assert recovered == 200
            return {"client_before_reload": before, "server_accepts": ["v2"],
                    "status_before_reload": interrupted, "client_after_reload": active,
                    "status_after_reload": recovered, "events": service.events}

        _, login = request(version="v1", create=True)
        session = login["session"]
        service.accept("v1", "v2")
        new_probe, _ = request(version="v2")
        desired = "v2"
        cached_status, _ = request(version=active)
        cached = active
        assert cached_status == new_probe == 200 and cached == "v1"
        assert reload(desired)
        assert not reload("bad") and active == "v2"
        service.accept("v2")
        old_key_status, _ = request(version="v1")
        new_key_status, _ = request(version=active)
        old_session_status, _ = request(session=session)
        service.revoke_session(session)
        revoked_session_status, _ = request(session=session)
        assert [old_key_status, new_key_status, old_session_status, revoked_session_status] == [401, 200, 200, 401]
        return {"new_credential_probe": new_probe, "desired_version_before_reload": desired,
                "cached_client_before_reload": cached, "cached_request_status": cached_status,
                "active_after_reload": active, "invalid_candidate_kept": active,
                "old_key_after_revoke": old_key_status, "new_key_after_revoke": new_key_status,
                "preexisting_session_after_key_revoke": old_session_status,
                "session_after_explicit_revoke": revoked_session_status,
                "events": service.events}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()


if __name__ == "__main__":
    result = {"normal_overlap": scenario(), "early_revoke_counterexample": scenario(True),
              "scope": "actual_local_http_fixture_keys_and_sessions_not_kubernetes_or_real_identity_provider",
              "session_contract": "This fixture checks sessions independently; real providers may use different revocation semantics."}
    print(json.dumps(result, ensure_ascii=False, indent=2))

