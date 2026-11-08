"""Real local HTTP/1.1 proxy, two backends and independent SQLite effects.

Python 3.9+ standard library. All listeners bind 127.0.0.1 on temporary ports.
No TLS, DNS changes, Kubernetes or production proxy performance is exercised.
The driver controls backend eligibility and uses events rather than guessed
sleep durations to observe draining. Not a general-purpose reverse proxy.
"""
import contextlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import sqlite3
import tempfile
import threading
import time


PUBLIC_HOST = 'orders.lab.test'
BACKEND_HOST = 'orders.internal.test'


class Journal:
    def __init__(self):
        self.lock = threading.Lock()
        self.events = []

    def add(self, kind, **values):
        with self.lock:
            event = dict(seq=len(self.events)+1, kind=kind, **values)
            self.events.append(event)
            return event


class Server(ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True

    def __init__(self, handler, label, journal):
        self.label, self.journal = label, journal
        self.sequence, self.sequence_lock = 0, threading.Lock()
        super().__init__(('127.0.0.1', 0), handler)

    def connection_id(self):
        with self.sequence_lock:
            self.sequence += 1
            return '%s-c%d' % (self.label, self.sequence)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def setup(self):
        super().setup()
        self.connection.settimeout(3)
        self.connection_id = self.server.connection_id()
        self.server.journal.add('accepted', server=self.server.label,
                                connection=self.connection_id,
                                local=list(self.connection.getsockname()),
                                peer=list(self.connection.getpeername()))

    def log_message(self, *args):
        pass

    def reply(self, status, body, headers=None):
        data = json.dumps(body, sort_keys=True).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        for key, value in (headers or {}).items():
            self.send_header(key, str(value))
        self.end_headers()
        try:
            self.wfile.write(data)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def read_small_body(self):
        if self.headers.get('Transfer-Encoding'):
            raise ValueError('this fixture only supports Content-Length')
        length = int(self.headers.get('Content-Length', '0'))
        if not 0 <= length <= 4096:
            raise ValueError('body too large')
        return self.rfile.read(length)


def backend_handler(fixture, name):
    class Backend(Handler):
        def do_GET(self):
            self.process(b'')

        def do_POST(self):
            self.process(self.read_small_body())

        def process(self, payload):
            rid = self.headers.get('X-Request-ID', '')
            attempt = int(self.headers.get('X-Upstream-Attempt', '0'))
            fixture.journal.add('backend_request', backend=name,
                                connection=self.connection_id, rid=rid,
                                method=self.command, path=self.path, attempt=attempt,
                                host=self.headers.get('Host'))
            if self.headers.get('Host') != BACKEND_HOST:
                self.reply(421, {'error': 'backend_virtual_host'})
                return
            if self.path == '/hold' and name == 'B':
                fixture.hold_started.set()
                if not fixture.release_hold.wait(3):
                    raise AssertionError('test driver did not release held request')
            if self.path == '/slow-first' and name == 'B':
                fixture.slow_started.set()
                if not fixture.release_slow.wait(3):
                    raise AssertionError('test driver did not release slow request')
            if self.command == 'POST' and self.path == '/publish':
                value = json.loads(payload)['total']
                if type(value) is not int:
                    self.reply(400, {'error': 'total_must_be_integer'})
                    return
                with contextlib.closing(sqlite3.connect(fixture.database)) as db:
                    with db:
                        db.execute('INSERT INTO effects(rid, backend, total) VALUES(?,?,?)',
                                   (rid, name, value))
                fixture.journal.add('effect_committed', backend=name, rid=rid, total=value)
                # Actual committed write, followed by an actual lost response.
                self.close_connection = True
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            busy = self.path == '/always-busy' or (name == 'B' and self.path == '/transient')
            status = 503 if busy else 200
            body = ({'error': 'busy', 'backend': name} if busy else
                    {'order': 'O-104', 'total': 37, 'status': 'paid', 'backend': name})
            self.reply(status, body, {'X-Backend-Connection': self.connection_id})
            fixture.journal.add('backend_finished', backend=name, rid=rid,
                                connection=self.connection_id, status=status)
    return Backend


class Pool:
    """One sequential HTTP/1.1 connection per backend, protected through read()."""
    def __init__(self, addresses, journal):
        self.addresses, self.journal = addresses, journal
        self.connections = dict.fromkeys(addresses)
        self.locks = {name: threading.Lock() for name in addresses}

    def close(self, name):
        with self.locks[name]:
            if self.connections[name]:
                self.connections[name].close()
                self.connections[name] = None

    def exchange(self, name, method, path, payload, rid, attempt, deadline):
        remaining = deadline-time.monotonic()
        if remaining <= 0 or not self.locks[name].acquire(timeout=remaining):
            raise TimeoutError('pool wait exhausted the same upstream budget')
        timer, timer_lock, active = None, threading.Lock(), [True]
        expired = threading.Event()
        try:
            remaining = deadline-time.monotonic()
            if remaining <= 0:
                raise TimeoutError('upstream budget exhausted')
            connection = self.connections[name]
            if connection is None:
                connection = http.client.HTTPConnection(*self.addresses[name], timeout=remaining)
                self.connections[name] = connection
            if connection.sock is None:
                connection.timeout = remaining
                connection.connect()
            target = connection.sock
            def interrupt_at_deadline():
                with timer_lock:
                    if active[0]:
                        expired.set()
                        try:
                            target.shutdown(socket.SHUT_RDWR)
                        except OSError:
                            pass
            # Socket timeout alone is an idle-I/O timeout: a peer could keep
            # sending bytes. This watchdog also bounds headers/body as a whole.
            timer = threading.Timer(max(0.001, deadline-time.monotonic()), interrupt_at_deadline)
            timer.daemon = True
            timer.start()
            connection.sock.settimeout(max(0.001, deadline-time.monotonic()))
            self.journal.add('upstream_attempt', backend=name, rid=rid, attempt=attempt,
                             local=list(connection.sock.getsockname()),
                             peer=list(connection.sock.getpeername()))
            connection.request(method, path, body=payload, headers={
                'Host': BACKEND_HOST, 'Content-Length': str(len(payload)),
                'X-Request-ID': rid, 'X-Upstream-Attempt': str(attempt)})
            # The remaining budget is recalculated for the response, not reset.
            connection.sock.settimeout(max(0.001, deadline-time.monotonic()))
            response = connection.getresponse()
            length = int(response.getheader('Content-Length', '-1'))
            if response.getheader('Transfer-Encoding') or not 0 <= length <= 4096:
                raise http.client.HTTPException('fixture requires a bounded Content-Length response')
            body = response.read()  # Must be consumed before this connection is reused.
            if time.monotonic() > deadline:
                raise TimeoutError('upstream response exceeded the shared budget')
            self.journal.add('upstream_response', backend=name, rid=rid,
                             attempt=attempt, status=response.status)
            return response.status, json.loads(body), response.getheader('X-Backend-Connection')
        except (OSError, http.client.HTTPException) as error:
            if self.connections[name]:
                self.connections[name].close()
                self.connections[name] = None
            if expired.is_set() or time.monotonic() >= deadline:
                raise TimeoutError('shared upstream deadline reached') from error
            raise
        finally:
            with timer_lock:
                active[0] = False
            if timer:
                timer.cancel()
            self.locks[name].release()


class Control:
    def __init__(self, pool, journal, both_ready=False):
        self.pool, self.journal = pool, journal
        self.lock, self.cursor = threading.Lock(), 0
        self.ready = {'A': True, 'B': both_ready}
        self.draining = {'A': False, 'B': False}
        self.active = {'A': 0, 'B': 0}

    def reserve(self, tried):
        with self.lock:
            for offset in range(2):
                index = (self.cursor+offset) % 2
                name = ('A', 'B')[index]
                if name not in tried and self.ready[name] and not self.draining[name]:
                    self.cursor = (index+1) % 2
                    self.active[name] += 1
                    return name
            return None

    def release(self, name):
        with self.lock:
            self.active[name] -= 1
            close = self.draining[name] and self.active[name] == 0
        if close:
            self.pool.close(name)
            self.journal.add('drain_finished', backend=name)

    def enable_b(self):
        with self.lock:
            self.ready['B'], self.draining['B'] = True, False

    def drain_b(self):
        with self.lock:
            self.draining['B'] = True
            snapshot = dict(active=self.active['B'], new_assignments_allowed=False)
        self.journal.add('drain_started', backend='B', **snapshot)
        if snapshot['active'] == 0:
            self.pool.close('B')
        return snapshot


def proxy_handler(fixture, unsafe_write_retry):
    class Proxy(Handler):
        def do_GET(self):
            self.process()

        def do_POST(self):
            self.process()

        def process(self):
            rid = self.headers.get('X-Request-ID', '')
            try:
                payload = self.read_small_body()
            except ValueError:
                self.close_connection = True
                self.reply(400, {'error': 'unsupported_fixture_request'})
                return
            fixture.journal.add('front_request', rid=rid, method=self.command, path=self.path,
                                connection=self.connection_id, host=self.headers.get('Host'))
            headers = {'X-Proxy-Connection': self.connection_id, 'X-Proxy-Attempts': 0}
            if self.headers.get('Host') != PUBLIC_HOST:
                self.reply(421, {'error': 'unknown_virtual_host'}, headers)
                return
            # Budget begins after ingress/body validation; it is not client TTFT.
            budget = 0.25 if self.path == '/slow-first' else 2.0
            deadline = time.monotonic()+budget
            retryable = self.command == 'GET' or unsafe_write_retry
            tries, tried, result = 0, set(), None
            while tries < 2 and time.monotonic() < deadline:
                name = fixture.control.reserve(tried)
                if name is None:
                    break
                tries += 1
                tried.add(name)
                headers['X-Proxy-Attempts'] = tries
                headers.pop('X-Backend-Connection', None)
                try:
                    status, body, upstream_id = fixture.pool.exchange(
                        name, self.command, self.path, payload, rid, tries, deadline)
                    result = (status, body)
                    if upstream_id:
                        headers['X-Backend-Connection'] = upstream_id
                    if status != 503 or not retryable:
                        break
                except (TimeoutError, socket.timeout):
                    result = (504, {'error': 'upstream_budget_exhausted'})
                    break  # The same request has no fresh budget for another attempt.
                except (OSError, http.client.HTTPException):
                    result = (502, {'error': 'upstream_response_lost',
                                    'write_result_unknown': self.command == 'POST'})
                    if not retryable:
                        break
                finally:
                    fixture.control.release(name)
            if result is None:
                result = (503, {'error': 'no_eligible_backend'})
            self.reply(*result, headers=headers)
    return Proxy


class Fixture:
    def __init__(self, unsafe_write_retry=False):
        self.unsafe_write_retry = unsafe_write_retry
        self.journal = Journal()
        self.hold_started, self.release_hold = threading.Event(), threading.Event()
        self.slow_started, self.release_slow = threading.Event(), threading.Event()
        self.servers, self.threads = [], []

    def start(self, handler, name):
        server = Server(handler, name, self.journal)
        thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': 0.01})
        thread.start()
        self.servers.append(server)
        self.threads.append(thread)
        return server.server_address

    def __enter__(self):
        self.folder = tempfile.TemporaryDirectory(prefix='infra-proxy-')
        self.database = str(Path(self.folder.name)/'effects.sqlite')
        with contextlib.closing(sqlite3.connect(self.database)) as db:
            db.execute('CREATE TABLE effects(rid TEXT, backend TEXT, total INTEGER)')
            db.commit()
        addresses = {name: self.start(backend_handler(self, name), name) for name in ['A', 'B']}
        self.pool = Pool(addresses, self.journal)
        self.control = Control(self.pool, self.journal, both_ready=self.unsafe_write_retry)
        self.front = self.start(proxy_handler(self, self.unsafe_write_retry), 'P')
        return self

    def effects(self):
        with contextlib.closing(sqlite3.connect(self.database)) as db:
            return [dict(rid=rid, backend=backend, total=total)
                    for rid, backend, total in db.execute('SELECT rid,backend,total FROM effects ORDER BY rowid')]

    def __exit__(self, *args):
        self.release_hold.set()
        self.release_slow.set()
        for name in ['A', 'B']:
            self.pool.close(name)
        for server in reversed(self.servers):
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(3)
            assert not thread.is_alive()
        self.folder.cleanup()


def call(fixture, connection, rid, path='/orders/O-104', method='GET', host=PUBLIC_HOST):
    payload = b'{"total":37}' if method == 'POST' else b''
    connection.request(method, path, body=payload, headers={
        'Host': host, 'X-Request-ID': rid, 'Content-Length': str(len(payload))})
    response = connection.getresponse()
    result = dict(status=response.status, body=json.loads(response.read()),
                  attempts=int(response.getheader('X-Proxy-Attempts')),
                  front_connection=response.getheader('X-Proxy-Connection'),
                  backend_connection=response.getheader('X-Backend-Connection'))
    fixture.journal.add('client_received', rid=rid, status=result['status'],
                        attempts=result['attempts'])
    return result


def run():
    with Fixture() as f:
        client = http.client.HTTPConnection(*f.front, timeout=3)
        wrong_host = call(f, client, 'wrong-host', host='other.lab.test')
        reuse = [call(f, client, 'reuse-1'), call(f, client, 'reuse-2')]
        with contextlib.closing(http.client.HTTPConnection(*f.front, timeout=3)) as other:
            reuse.append(call(f, other, 'reuse-other-front'))
        assert wrong_host['status'] == 421 and wrong_host['attempts'] == 0
        assert len({r['backend_connection'] for r in reuse}) == 1
        assert reuse[0]['front_connection'] == reuse[1]['front_connection']
        assert reuse[2]['front_connection'] != reuse[0]['front_connection']
        f.control.enable_b()
        held = {}
        def hold():
            with contextlib.closing(http.client.HTTPConnection(*f.front, timeout=3)) as c:
                held.update(call(f, c, 'drain-held', path='/hold'))
        thread = threading.Thread(target=hold)
        thread.start()
        assert f.hold_started.wait(3)
        drain = f.control.drain_b()
        during_drain = call(f, client, 'drain-new')
        assert drain == {'active': 1, 'new_assignments_allowed': False}
        assert during_drain['body']['backend'] == 'A' and thread.is_alive()
        f.release_hold.set()
        thread.join(3)
        assert not thread.is_alive() and held['status'] == 200
        assert f.control.active['B'] == 0
        f.control.enable_b()
        retried = call(f, client, 'transient', path='/transient')
        exhausted = call(f, client, 'always-busy', path='/always-busy')
        assert retried['status'] == 200 and retried['attempts'] == 2
        assert exhausted['status'] == 503 and exhausted['attempts'] == 2
        timed_out = call(f, client, 'slow-first', path='/slow-first')
        assert f.slow_started.is_set()
        assert timed_out['status'] == 504 and timed_out['attempts'] == 1
        f.release_slow.set()
        unknown = call(f, client, 'write-unknown', path='/publish', method='POST')
        assert unknown['status'] == 502 and unknown['attempts'] == 1
        assert unknown['body']['write_result_unknown']
        effects = f.effects()
        assert effects == [{'rid': 'write-unknown', 'backend': 'A', 'total': 37}]
        client.close()
        positive = dict(wrong_host=wrong_host, reuse=reuse, drain_start=drain,
                        during_drain=during_drain, held_completed=held,
                        get_retry=retried, retry_exhausted=exhausted,
                        shared_budget_timeout=timed_out, write_unknown=unknown,
                        effects=effects, events=f.journal.events)
    with Fixture(unsafe_write_retry=True) as f:
        with contextlib.closing(http.client.HTTPConnection(*f.front, timeout=3)) as client:
            duplicated = call(f, client, 'write-unsafe', path='/publish', method='POST')
        effects = f.effects()
        assert duplicated['status'] == 502 and duplicated['attempts'] == 2
        assert len(effects) == 2 and sum(row['total'] for row in effects) == 74
        negative = dict(response=duplicated, effects=effects, events=f.journal.events)
    return dict(positive=positive, unsafe_write_retry=negative,
                scope='real_loopback_http1_proxy_two_backends_and_sqlite_no_tls_or_cloud')


if __name__ == '__main__':
    print(json.dumps(run(), ensure_ascii=False, indent=2))
