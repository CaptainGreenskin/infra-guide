"""Length-prefixed messages and half-close over an actual loopback TCP connection.

Python 3.9+, standard library. No external endpoint or privileged port.
"""
import json
import queue
import socket
import struct
import threading

LIMIT = 4096


def frame(text):
    body = text.encode("utf-8")
    if len(body) > LIMIT:
        raise ValueError("frame_too_large")
    return struct.pack("!I", len(body)) + body


class Decoder:
    def __init__(self):
        self.buffer = bytearray()

    def feed(self, chunk):
        self.buffer.extend(chunk)
        messages = []
        while len(self.buffer) >= 4:
            size = struct.unpack("!I", self.buffer[:4])[0]
            if size > LIMIT:
                raise ValueError("frame_too_large")
            if len(self.buffer) < 4 + size:
                break
            body = bytes(self.buffer[4:4 + size])
            del self.buffer[:4 + size]
            messages.append(body.decode("utf-8"))
        return messages

    def finish(self):
        if self.buffer:
            raise ValueError("truncated_frame")


def parser_probes(wire, expected):
    # Segmentation is controlled here, independent of the TCP implementation.
    patterns = [[wire], [wire[i:i + 1] for i in range(len(wire))],
                [wire[:2], wire[2:7], wire[7:]]]
    for chunks in patterns:
        parser, actual = Decoder(), []
        for chunk in chunks:
            actual.extend(parser.feed(chunk))
        parser.finish()
        assert actual == expected
    outcomes = {}
    for name, bad in [("oversized", struct.pack("!I", LIMIT + 1)),
                      ("truncated_header", wire[:2]),
                      ("truncated_body", wire[:-1])]:
        parser = Decoder()
        try:
            parser.feed(bad)
            parser.finish()
        except ValueError as error:
            outcomes[name] = str(error)
        else:
            raise AssertionError("invalid input was accepted: " + name)
    assert outcomes == {"oversized": "frame_too_large",
                        "truncated_header": "truncated_frame",
                        "truncated_body": "truncated_frame"}
    return {"segmentation_patterns_passed": len(patterns), **outcomes}


def main():
    expected = ["云上训练", "恢复完成"]
    wire = b"".join(frame(text) for text in expected)
    probes = parser_probes(wire, expected)
    result = queue.Queue()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(5)

        def serve():
            try:
                with listener.accept()[0] as conn:
                    conn.settimeout(5)
                    parser, messages, reads = Decoder(), [], []
                    while True:
                        chunk = conn.recv(7)  # A limit, not a message boundary.
                        if not chunk:
                            parser.finish()
                            break
                        reads.append(len(chunk))
                        messages.extend(parser.feed(chunk))
                    assert messages == expected
                    # The peer closed its sending direction, not its receiving one.
                    conn.sendall(frame("已接收2条"))
                    conn.shutdown(socket.SHUT_WR)
                    result.put({"messages": messages, "recv_chunk_bytes": reads,
                                "server_saw_eof_before_reply": True})
            except Exception as error:
                result.put(error)

        worker = threading.Thread(target=serve, daemon=True)
        worker.start()
        with socket.create_connection(listener.getsockname(), timeout=5) as client:
            for text in expected:
                client.sendall(frame(text))
            client.shutdown(socket.SHUT_WR)
            parser, replies = Decoder(), []
            while True:
                chunk = client.recv(7)
                if not chunk:
                    parser.finish()
                    break
                replies.extend(parser.feed(chunk))
        worker.join(timeout=5)
        assert not worker.is_alive(), "server did not terminate"
        server = result.get(timeout=1)
        if isinstance(server, Exception):
            raise server
    assert replies == ["已接收2条"]
    assert sum(server["recv_chunk_bytes"]) == len(wire)
    assert len(server["recv_chunk_bytes"]) > 2
    print(json.dumps({"transport": "AF_INET / 127.0.0.1 / TCP",
                      "sendall_calls": 2, "wire_bytes": len(wire),
                      "payload_bytes": [len(x.encode("utf-8")) for x in expected],
                      "payload_characters": [len(x) for x in expected],
                      "parser_probes": probes, "server": server,
                      "reply_after_half_close": replies,
                      "scope": "loopback TCP and parser; no epoll, loss injection or business commit"},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
