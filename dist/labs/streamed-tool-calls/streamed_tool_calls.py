"""Actual local chunked HTTP; declared tool-event fixtures, not a model API.

LF/CRLF data fields and incremental strict UTF-8 are a deliberately small SSE
subset. No reconnect, Last-Event-ID, lone-CR parsing or durable checkpointing.
The admitted read tool is a local callback, not a remote or Kairo integration.
"""
import codecs
import hashlib
from http.client import IncompleteRead
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import platform
from threading import Thread
from urllib.request import build_opener, ProxyHandler


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate_json_key")
            result[key] = value
        return result

    def invalid_constant(value):
        raise ValueError("non_json_constant")

    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_constant)


def event(payload, multiline=False):
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if multiline:
        left, right = text.split(",", 1)
        data = "data: "+left+",\ndata: "+right+"\n\n"
    else:
        data = "data: "+text+"\n\n"
    return (": heartbeat\nevent: tool\n"+data).encode("utf-8")


def start(call_id, name="report.read"):
    return {"type":"start", "call_id":call_id, "name":name}


def delta(call_id, text):
    return {"type":"delta", "call_id":call_id, "text":text}


def done(call_id):
    return {"type":"done", "call_id":call_id}


ARGS = '{"tenant":"A","report":"中国区日报","limit":3}'


def one_call(arguments=ARGS, name="report.read"):
    return event(start("c1", name), True)+event(delta("c1", arguments))+event(done("c1"))


def fixtures():
    interleaved = [start("a"), start("b"), delta("a", '{"tenant":"A",'),
                   delta("b", ARGS.replace('"A"', '"B"')),
                   delta("a", '"report":"中国区'), done("b"),
                   delta("a", '日报","limit":3}'), done("a")]
    good = one_call()
    # Make the invalid byte start a later 7-byte read, after done was delivered.
    aligned = good+b":\n"*((-len(good)*4) % 7)
    assert len(aligned) % 7 == 0
    return {
        "normal": good,
        "interleaved": b"".join(event(p, i==0) for i,p in enumerate(interleaved)),
        "truncated_arguments": event(start("c1"))+event(delta("c1", '{"tenant":"A"')),
        "transport_truncated": event(start("c1"))+event(delta("c1", '{"tenant":"A"')),
        "unfinished_done_event": good[:-2],
        "parseable_then_garbage": (event(start("c1"))+event(delta("c1", ARGS))+
                                   event(delta("c1", "oops"))+event(done("c1"))),
        "duplicate_key": one_call(ARGS.replace('"tenant":"A"', '"tenant":"B","tenant":"A"')),
        "boolean_limit": one_call(ARGS.replace('"limit":3', '"limit":true')),
        "denied_tenant": one_call(ARGS.replace('"A"', '"B"')),
        "unknown_name": one_call(name="report.delete"),
        "arguments_limit": one_call(ARGS+" "*600),
        "invalid_utf8_before_done": event(start("c1"))+b"\xff\n\n",
        "late_stream_error": aligned+b"\xff",
    }


class LFEvents:
    def __init__(self):
        self.decoder = codecs.getincrementaldecoder("utf-8")("strict")
        self.buffer, self.data = "", []

    def feed(self, chunk, final=False):
        self.buffer += self.decoder.decode(chunk, final=final)
        ready = []
        while "\n" in self.buffer:
            line, self.buffer = self.buffer.split("\n", 1)
            if line.endswith("\r"):
                line = line[:-1]
            if line == "":
                if self.data:
                    ready.append("\n".join(self.data))
                self.data = []
            elif line.startswith("data:"):
                value = line[5:]
                self.data.append(value[1:] if value.startswith(" ") else value)
            # Comments and other SSE fields are not application authorization.
        if final:
            # EOF alone does not dispatch a partial last SSE event.
            self.buffer, self.data = "", []
        return ready


def read_report(arguments):
    """Fixed read-only tool callback; no external side effect or remote API."""
    if arguments["tenant"] != "A":
        raise PermissionError("tenant_scope")
    return {"tenant":"A", "values":[10,27][:arguments["limit"]]}


class Calls:
    def __init__(self):
        self.calls, self.received = {}, []
        self.events, self.parseable_prefixes = 0, 0

    def accept(self, data):
        payload = strict_json(data)
        if not isinstance(payload, dict):
            raise ValueError("invalid_envelope")
        kind, ident = payload.get("type"), payload.get("call_id")
        if (not isinstance(ident, str) or not 1 <= len(ident) <= 32
                or not ident.isascii() or not all(c.isalnum() or c in "-_" for c in ident)):
            raise ValueError("invalid_call_id")
        fields = {"start":{"type","call_id","name"},
                  "delta":{"type","call_id","text"}, "done":{"type","call_id"}}
        if not isinstance(kind, str) or kind not in fields or set(payload) != fields[kind]:
            raise ValueError("invalid_envelope")
        self.events += 1
        if kind == "start":
            if ident in self.calls or len(self.calls) >= 4:
                raise ValueError("call_identity_or_limit")
            if not isinstance(payload["name"], str):
                raise ValueError("invalid_name")
            self.calls[ident] = {"name":payload["name"], "text":"", "status":"collecting"}
            return
        if ident not in self.calls:
            raise ValueError("unknown_call")
        call = self.calls[ident]
        if call.get("complete"):
            raise ValueError("event_after_done")
        if kind == "delta":
            if not isinstance(payload["text"], str):
                raise ValueError("invalid_fragment")
            if call["status"] != "collecting":
                return
            appended = call["text"]+payload["text"]
            if len(appended.encode("utf-8")) > 512:
                call.update(status="rejected", reason="arguments_too_large")
                return
            call["text"] = appended
            try:
                strict_json(appended)
                self.parseable_prefixes += 1
            except (ValueError, RecursionError):
                pass
            return  # A parseable prefix still does not dispatch a tool.
        call["complete"] = True
        if call["status"] != "collecting":
            return
        try:
            args = strict_json(call["text"])
        except (ValueError, RecursionError) as error:
            reason = "duplicate_json_key" if str(error)=="duplicate_json_key" else "invalid_arguments_json"
            call.update(status="rejected", reason=reason)
            return
        valid = (isinstance(args, dict) and set(args)=={"tenant","report","limit"}
                 and isinstance(args["tenant"], str) and args["report"]=="中国区日报"
                 and type(args["limit"]) is int and 1 <= args["limit"] <= 3)
        if call["name"] != "report.read" or not valid:
            call.update(status="rejected", reason="name_or_schema")
        elif args["tenant"] != "A":
            call.update(status="denied", reason="tenant_scope")
        else:
            # A real local function call; the input/report data are fixed fixtures.
            observed = read_report(args)
            self.received.append({"call_id":ident, "tool":call["name"],
                                  **observed})
            call.update(status="executed")


def consume(url):
    parser, calls = LFEvents(), Calls()
    byte_count, reads, naive_errors = 0, 0, 0
    stream_error = None
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(url, timeout=5) as response:
            assert response.headers.get_content_type() == "text/event-stream"
            while True:
                chunk = response.read(7)
                if not chunk:
                    for data in parser.feed(b"", final=True):
                        calls.accept(data)
                    break
                byte_count += len(chunk)
                reads += 1
                if byte_count > 65536:
                    raise ValueError("stream_budget")
                try:
                    chunk.decode("utf-8")
                except UnicodeDecodeError:
                    naive_errors += 1
                for data in parser.feed(chunk):
                    calls.accept(data)
    except UnicodeDecodeError:
        stream_error = "invalid_utf8"
    except IncompleteRead:
        stream_error = "http_incomplete"
    except (ValueError, RecursionError) as error:
        stream_error = str(error) or type(error).__name__
    pending = []
    for ident, call in calls.calls.items():
        if not call.get("complete"):
            pending.append(ident)
            if call["status"] == "collecting":
                call["status"] = ("incomplete_at_eof" if stream_error is None
                                  else "incomplete_after_stream_error")
    states = {ident:{key:value for key,value in call.items() if key!="text"}
              for ident,call in calls.calls.items()}
    return {"bytes_read":byte_count, "read_size":7, "reads":reads,
            "naive_chunk_decode_errors":naive_errors, "events":calls.events,
            "parseable_prefixes":calls.parseable_prefixes, "states":states,
            "pending":pending, "stream_error":stream_error,
            "local_tool_calls":len(calls.received), "observations":calls.received}


def main():
    streams = fixtures()
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            body = streams.get(self.path.lstrip("/"))
            if body is None:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            try:
                for offset in range(0, len(body), 11):
                    chunk = body[offset:offset+11]
                    self.wfile.write((hex(len(chunk))[2:]+"\r\n").encode("ascii"))
                    self.wfile.write(chunk+b"\r\n")
                if self.path != "/transport_truncated":
                    self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            self.close_connection = True

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1",0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        results = {name:consume("http://127.0.0.1:"+str(server.server_port)+"/"+name)
                   for name in streams}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(3)
    assert results["normal"]["local_tool_calls"] == 1
    assert results["normal"]["naive_chunk_decode_errors"] > 0
    assert results["interleaved"]["states"]["a"]["status"] == "executed"
    assert results["interleaved"]["states"]["b"]["status"] == "denied"
    assert results["parseable_then_garbage"]["parseable_prefixes"] == 1
    for name in streams:
        assert results[name]["local_tool_calls"] == (1 if name in {
            "normal","interleaved","late_stream_error"} else 0), name
    assert results["late_stream_error"]["stream_error"] == "invalid_utf8"
    assert results["transport_truncated"]["stream_error"] == "http_incomplete"
    print(json.dumps({"status":"passed", "python":platform.python_version(),
                      "fixture_sha256":{name:hashlib.sha256(body).hexdigest()
                                        for name,body in streams.items()},
                      "results":results, "scope":(
                          "Actual loopback chunked HTTP, fixed declared event envelopes, "
                          "local read callback and in-process observations only; "
                          "not a model API, full EventSource client, durable task, remote tool or Kairo.")},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
