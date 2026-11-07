"""Observe real Linux epoll readiness; no simulation or throughput benchmark."""
import hashlib
import json
import os
from pathlib import Path
import platform
import select
import socket
import sys


def pipe_case(edge):
    reader, writer = os.pipe()
    os.set_blocking(reader, False)
    os.set_blocking(writer, False)
    try:
        with select.epoll() as poller:
            poller.register(reader, select.EPOLLIN | (select.EPOLLET if edge else 0))
            os.write(writer, b'abcdef')
            first = poller.poll(1)
            assert len(first) == 1 and first[0][1] & select.EPOLLIN
            prefix = os.read(reader, 2)
            second = poller.poll(0)
            # No new write has occurred. Four unread bytes are still in the pipe.
            assert bool(second) == (not edge)
            suffix = os.read(reader, 64)
            assert prefix == b'ab' and suffix == b'cdef'
            try:
                os.read(reader, 64)
            except BlockingIOError:
                eagain = True
            else:
                raise AssertionError('empty, open pipe must report EAGAIN')
            os.write(writer, b'gh')
            third = poller.poll(1)
            assert third and third[0][1] & select.EPOLLIN
            after_write = os.read(reader, 64)
            os.close(writer)
            writer = None
            hangup = poller.poll(1)
            eof = os.read(reader, 64)
            assert hangup and hangup[0][1] & select.EPOLLHUP and eof == b''
            return {'mode': 'ET' if edge else 'LT', 'first_notification': True,
                    'first_read': prefix.decode(), 'notification_without_new_write': bool(second),
                    'unread_then_drained': suffix.decode(), 'eagain_after_drain': eagain,
                    'new_write_notifies': after_write.decode(), 'eof_after_writer_close': True}
    finally:
        os.close(reader)
        if writer is not None:
            os.close(writer)


def application_ready_queue():
    reader, writer = os.pipe()
    os.set_blocking(reader, False)
    try:
        with select.epoll() as poller:
            poller.register(reader, select.EPOLLIN | select.EPOLLET)
            os.write(writer, b'abcdef')
            assert poller.poll(1)
            # Retain application ownership until EAGAIN. Each turn reads at most two bytes.
            ready = [reader]
            turns = []
            while ready:
                fd = ready.pop(0)
                try:
                    chunk = os.read(fd, 2)
                except BlockingIOError:
                    turns.append('EAGAIN')
                    continue
                assert chunk
                turns.append(chunk.decode())
                ready.append(fd)
                assert poller.poll(0) == [], 'there was no new write/edge'
            assert turns == ['ab', 'cd', 'ef', 'EAGAIN']
            return {'kernel_notifications': 1, 'application_turns': turns,
                    'payload': ''.join(turns[:-1]), 'per_turn_read_budget': 2}
    finally:
        os.close(reader)
        os.close(writer)


def writable_interest():
    left, right = socket.socketpair()
    left.setblocking(False)
    try:
        with select.epoll() as poller:
            poller.register(left, select.EPOLLIN | select.EPOLLOUT)
            seen = [any(mask & select.EPOLLOUT for _, mask in poller.poll(0)) for _ in range(3)]
            assert seen == [True, True, True]
            poller.modify(left, select.EPOLLIN)
            assert poller.poll(0) == []
            return {'no_output_queued': True, 'write_notifications_in_three_polls': sum(seen),
                    'notifications_after_removing_write_interest': 0}
    finally:
        left.close()
        right.close()


def main():
    result = {'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'python': platform.python_version(), 'system': platform.system(),
              'scope': 'Actual local pipe/socket epoll calls; no TCP packet trace, load test or cloud network.'}
    if not hasattr(select, 'epoll'):
        result.update(status='unsupported', reason='select.epoll requires Linux')
    else:
        result.update(status='passed', cases={'lt': pipe_case(False), 'et': pipe_case(True),
                      'application_queue': application_ready_queue(), 'writable_interest': writable_interest()})
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
