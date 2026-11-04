"""Bounded local HTTP: complete shards versus indexed byte ranges.

This is a teaching HTTP subset, not an S3 client/server or a storage benchmark.
"""
import argparse
from copy import deepcopy
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import platform
import re
import threading
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build_inputs():
    samples = [("sample-%02d:" % i).encode().ljust(64, b".") for i in range(20)]
    objects = {"shard-%d" % i: b"".join(samples[i*4:i*4+4]) for i in range(5)}
    manifest = {"version": "data-v1", "samples": {}}
    for i, value in enumerate(samples):
        key = "shard-%d" % (i // 4)
        manifest["samples"][i] = {"key": key, "offset": (i % 4)*64,
            "length": 64, "object_length": 256,
            "object_sha256": digest(objects[key]), "sample_sha256": digest(value)}
    return samples, objects, manifest


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_):
        pass

    def do_GET(self):
        key = self.path.removeprefix("/")
        with self.server.lock:
            payload = self.server.objects.get(key)
            self.server.requests.append({"key": key, "range": self.headers.get("Range")})
        if payload is None:
            self.send_error(404)
            return
        etag = '"' + digest(payload) + '"'  # This fixture's rule, not an S3 ETag rule.
        if self.headers.get("If-Match") not in (None, etag):
            self.send_error(412)
            return
        status, body, content_range = 200, payload, None
        requested = self.headers.get("Range")
        if requested is not None:
            match = re.fullmatch(r"bytes=(\d+)-(\d+)", requested)
            if not match:
                self.send_error(400)
                return
            start, end = map(int, match.groups())
            if not 0 <= start <= end < len(payload):
                self.send_error(416)
                return
            status, body = 206, payload[start:end+1]
            content_range = "bytes %d-%d/%d" % (start, end, len(payload))
        self.send_response(status)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", etag)
        if content_range:
            self.send_header("Content-Range", content_range)
        self.end_headers()
        self.wfile.write(body)


def fetch(base, entry, ranged):
    start, end = entry["offset"], entry["offset"] + entry["length"] - 1
    headers = {"If-Match": '"' + entry["object_sha256"] + '"'}
    if ranged:
        headers["Range"] = "bytes=%d-%d" % (start, end)
    with urlopen(Request(base + "/" + entry["key"], headers=headers), timeout=3) as response:
        expected = entry["length"] if ranged else entry["object_length"]
        body = response.read(expected + 1)
        assert len(body) == expected and int(response.headers["Content-Length"]) == expected
        assert response.status == (206 if ranged else 200)
        if ranged:
            assert response.headers["Content-Range"] == "bytes %d-%d/%d" % (start, end, entry["object_length"])
        else:
            assert digest(body) == entry["object_sha256"]
        return body


def select_samples(base, manifest, selected, ranged):
    cache, output, requests, transferred = {}, [], 0, 0
    for sample_id in selected:
        entry = manifest["samples"][sample_id]
        if ranged:
            sample = fetch(base, entry, True)
            requests += 1
            transferred += len(sample)
        else:
            key = entry["key"]
            if key not in cache:
                cache[key] = fetch(base, entry, False)
                requests += 1
                transferred += len(cache[key])
            sample = cache[key][entry["offset"]:entry["offset"]+entry["length"]]
        if len(sample) != entry["length"] or digest(sample) != entry["sample_sha256"]:
            raise ValueError("sample_digest_mismatch")
        output.append(sample)
    return output, {"requests": requests, "body_bytes": transferred,
        "useful_sample_bytes": sum(map(len, output))}


def exercise():
    samples, objects, manifest = build_inputs()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.objects, server.lock, server.requests = objects, threading.Lock(), []
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    base = "http://127.0.0.1:%d" % server.server_port
    selected = [0, 1, 6, 7, 17]
    try:
        full, full_metrics = select_samples(base, manifest, selected, False)
        ranged, range_metrics = select_samples(base, manifest, selected, True)
        assert full == ranged == [samples[i] for i in selected]
        assert full_metrics == {"requests": 3, "body_bytes": 768, "useful_sample_bytes": 320}
        assert range_metrics == {"requests": 5, "body_bytes": 320, "useful_sample_bytes": 320}
        with server.lock:
            positive_requests = deepcopy(server.requests)
        assert len(positive_requests) == 8
        assert all(row["range"] is None for row in positive_requests[:3])
        assert all(row["range"] is not None for row in positive_requests[3:])

        # Keep the old manifest, then replace one object's bytes.
        with server.lock:
            original = server.objects["shard-0"]
            server.objects["shard-0"] = b"!" + original[1:]
        try:
            select_samples(base, manifest, [0], True)
            raise AssertionError("changed object accepted")
        except HTTPError as error:
            assert error.code == 412
            error.close()
        with server.lock:
            server.objects["shard-0"] = original

        wrong_index = deepcopy(manifest)
        wrong_index["samples"][0]["offset"] = 64
        try:
            select_samples(base, wrong_index, [0], True)
            raise AssertionError("wrong index accepted")
        except ValueError as error:
            assert str(error) == "sample_digest_mismatch"

        invalid = dict(manifest["samples"][0], offset=250, length=64)
        try:
            fetch(base, invalid, True)
            raise AssertionError("out-of-range read accepted")
        except HTTPError as error:
            assert error.code == 416
            error.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(2)
        assert not thread.is_alive()

    # Independent input model from the chapter, not timings measured by this server.
    total_bytes = 10000 * 64 * 1024
    bandwidth = 125 * 1024 * 1024
    transfer_s = total_bytes / bandwidth
    separate_s = 10000 * 0.005 + transfer_s
    shard_s = 100 * 0.005 + transfer_s
    assert total_bytes == 625 * 1024 * 1024
    assert (transfer_s, separate_s, shard_s) == (5, 55, 5.5)
    return {"status": "passed", "python": platform.python_version(),
        "source_sha256": digest(Path(__file__).read_bytes()),
        "input": {"samples": 20, "sample_bytes": 64, "samples_per_shard": 4, "selected_ids": selected},
        "full_shards_with_request_cache": full_metrics, "indexed_ranges": range_metrics,
        "server_positive_requests": positive_requests,
        "negative_probes": {"object_changed": 412, "wrong_offset": "sample_digest_mismatch", "out_of_bounds": 416},
        "declared_serial_cost_model": {"samples": 10000, "sample_kib": 64,
            "total_mib": 625, "bandwidth_mib_s": 125, "request_ms": 5,
            "separate_s": separate_s, "shards_s": shard_s},
        "scope": "Actual bounded loopback HTTP and byte checks; cost seconds are declared serial arithmetic, not measured latency. No S3, cloud storage, compression or GPU executed."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = exercise()
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.write_text(text)
    print(text, end="")
