"""Actual bounded loopback send/receive backpressure; no packet trace or congestion-control benchmark."""
import hashlib
import json
import platform
import selectors
import socket
from threading import Event, Thread
import time


def main():
    payload = b"infra-local-byte-stream\n" * 32768
    allow_read = Event()
    received = {}
    errors = []
    with socket.socket() as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 16384)
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(5)
        def receiver():
            try:
                with listener.accept()[0] as connection:
                    connection.settimeout(8)
                    received["receive_buffer_setting"] = connection.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
                    if not allow_read.wait(5):
                        raise TimeoutError("sender_never_released_reader")
                    digest = hashlib.sha256()
                    total = 0
                    while True:
                        block = connection.recv(16384)
                        if not block:
                            break
                        total += len(block)
                        digest.update(block)
                    received.update(bytes=total, sha256=digest.hexdigest(), saw_eof=True)
                    connection.sendall(json.dumps({"bytes": total, "sha256": digest.hexdigest()}).encode())
            except BaseException as error:
                errors.append(type(error).__name__+": "+str(error))
        thread = Thread(target=receiver, daemon=True)
        thread.start()
        try:
            with socket.create_connection(listener.getsockname(), timeout=5) as sender:
                sender.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 16384)
                send_buffer = sender.getsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF)
                sender.setblocking(False)
                offset, calls, short_writes = 0, 0, 0
                blocked_before_read = False
                while offset < len(payload):
                    part = memoryview(payload)[offset:offset+16384]
                    try:
                        count = sender.send(part)
                    except BlockingIOError:
                        blocked_before_read = True
                        break
                    assert count > 0
                    calls += 1
                    short_writes += count < len(part)
                    offset += count
                accepted_before_read = offset
                allow_read.set()  # The application reader begins only after this controlled boundary.
                deadline = time.monotonic()+8
                with selectors.DefaultSelector() as selector:
                    selector.register(sender, selectors.EVENT_WRITE)
                    while offset < len(payload):
                        if time.monotonic() >= deadline:
                            raise TimeoutError("bounded_transfer_deadline")
                        if not selector.select(.1):
                            continue
                        part = memoryview(payload)[offset:offset+16384]
                        try:
                            count = sender.send(part)
                        except BlockingIOError:
                            continue
                        assert count > 0
                        calls += 1
                        short_writes += count < len(part)
                        offset += count
                sender.setblocking(True)
                sender.settimeout(8)
                sender.shutdown(socket.SHUT_WR)
                reply = bytearray()
                while True:
                    block = sender.recv(1024)
                    if not block:
                        break
                    reply.extend(block)
                    if len(reply) > 1024:
                        raise ValueError("unexpected_fixture_reply")
                receipt = json.loads(reply)
        finally:
            allow_read.set()
            thread.join(10)
        assert not thread.is_alive() and not errors, errors
    expected = hashlib.sha256(payload).hexdigest()
    assert offset == received["bytes"] == receipt["bytes"] == len(payload)
    assert expected == received["sha256"] == receipt["sha256"]
    assert received["saw_eof"]
    print(json.dumps({"python": platform.python_version(), "system": platform.system(),
                      "payload_bytes": len(payload), "send_buffer_setting": send_buffer,
                      "receive_buffer_setting": received["receive_buffer_setting"],
                      "blocked_before_application_read": blocked_before_read,
                      "accepted_before_application_read": accepted_before_read,
                      "successful_send_calls": calls, "short_writes_observed": short_writes,
                      "received_bytes": receipt["bytes"], "sha256": expected,
                      "read_reply_after_write_shutdown": True,
                      "scope": "actual_loopback_nonblocking_send_and_application_drain_not_packet_or_cwnd_measurement",
                      "limits": ["send accepted bytes into a local socket path, not proof that receiver application read them",
                                 "paused application may still have bytes received/acknowledged by its kernel",
                                 "buffer settings and partial-write boundaries depend on the OS; cap does not force a block on every stack",
                                 "receiver JSON is this fixture's explicit application receipt, not TCP ACK"]}, indent=2))


if __name__ == "__main__":
    main()
