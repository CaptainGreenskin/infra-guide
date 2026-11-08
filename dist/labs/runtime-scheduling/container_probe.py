"""Run inside an owned Linux container; never writes host cgroup settings."""
import json
import os
from pathlib import Path
import sys
import threading
import time

CG = Path('/sys/fs/cgroup')


def counters(name):
    return {k: int(v) for k, v in (line.split() for line in (CG / name).read_text().splitlines())}


mode = sys.argv[1]
if mode == 'oom':
    # Touch all pages: an address reservation alone does not exercise the limit.
    blocks = []
    for _ in range(256):
        blocks.append(bytearray(b'x' * (1024 * 1024)))
    raise AssertionError('Expected the 96 MiB cgroup limit to stop this process')

row = {'mode': mode, 'pid': os.getpid(),
       'namespaces': {n: os.readlink('/proc/self/ns/' + n) for n in ('pid', 'mnt', 'net')},
       'cpu_max': (CG / 'cpu.max').read_text().strip(),
       'memory_max': int((CG / 'memory.max').read_text()),
       'pids_max': int((CG / 'pids.max').read_text())}
if mode == 'cpu':
    before = counters('cpu.stat')
    start = time.monotonic()
    x = 1
    while time.monotonic() - start < 2.5:
        x = (x * 17 + 3) % 1000003
    after = counters('cpu.stat')
    row.update(wall_seconds=time.monotonic() - start,
               cpu_stat_delta={k: after[k] - before[k] for k in before}, checksum=x)
elif mode == 'pids':
    before = counters('pids.events')
    stop = threading.Event()
    threads = []
    error = None
    try:
        for _ in range(32):
            t = threading.Thread(target=stop.wait)
            try:
                t.start()
                threads.append(t)
            except RuntimeError as exc:
                error = str(exc)
                break
        row.update(created_threads=len(threads), refusal=error,
                   pids_current=int((CG / 'pids.current').read_text()),
                   pids_max_events_delta=counters('pids.events')['max'] - before['max'])
    finally:
        stop.set()
        for t in threads:
            t.join()
else:
    raise ValueError(mode)
print(json.dumps(row, sort_keys=True))
