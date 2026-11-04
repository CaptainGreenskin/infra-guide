"""Run local transactional and arithmetic checks; no Docker/Kubernetes required."""
import hashlib
import json
from pathlib import Path
import platform
import sqlite3
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from capacity import example, hpa_base
from event_worker import process

ROOT = Path(__file__).parent
checks = []

server = subprocess.Popen([sys.executable, str(ROOT / 'app.py'), '--port', '0'],
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
try:
    port = json.loads(server.stdout.readline())['port']
    for path in ('/', '/healthz', '/readyz'):
        with urllib.request.urlopen('http://127.0.0.1:' + str(port) + path, timeout=5) as response:
            assert response.status == 200 and json.load(response)['ready'] is True
    try:
        urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/missing', timeout=5)
        raise AssertionError('unknown route accepted')
    except urllib.error.HTTPError as error:
        assert error.code == 404
finally:
    server.terminate()
    server.wait(timeout=5)
assert server.returncode == 0
checks.append({'case': 'local_http_endpoints_and_sigterm', 'status': 'passed'})

with tempfile.TemporaryDirectory() as folder:
    folder = Path(folder)
    database = folder / 'crash.sqlite'
    command = [sys.executable, str(ROOT / 'event_worker.py'), '--db', str(database),
               '--event', str(ROOT / 'sample-event.json'), '--crash-after-commit']
    failed = subprocess.run(command, capture_output=True, text=True)
    assert failed.returncode == 23, failed.stderr
    checks.append({'case': 'commit_then_exit_before_response', 'exit_code': 23})
    resumed = subprocess.run(command[:-1], capture_output=True, text=True, check=True)
    replay = json.loads(resumed.stdout)
    assert replay['duplicate'] is True and replay['result']['saved'] is True
    connection = sqlite3.connect(database)
    assert connection.execute('SELECT count(*) FROM reports').fetchone()[0] == 1
    assert connection.execute('SELECT count(*) FROM inbox').fetchone()[0] == 1
    connection.close()
    checks.append({'case': 'redelivery_after_crash', 'reports': 1, 'inbox': 1})
    event = json.loads((ROOT / 'sample-event.json').read_text())
    event['report'] = 'changed intent'
    try:
        process(database, event)
        raise AssertionError('conflict accepted')
    except ValueError as error:
        assert 'different intent' in str(error)
    checks.append({'case': 'same_id_different_intent', 'result': 'rejected'})
    event['event_id'] = 'second-event'
    assert process(database, event)['duplicate'] is False
    checks.append({'case': 'new_id_new_business_action', 'result': 'saved'})
    connection = sqlite3.connect(database)
    assert connection.execute('SELECT count(*) FROM reports').fetchone()[0] == 2
    assert connection.execute('SELECT count(*) FROM inbox').fetchone()[0] == 2
    connection.close()

values = example()
assert values == {
    'hpa_base_200m': 6, 'hpa_base_400m': 3,
    'simplified_downscale_window_max': 6, 'backlog_after_75s': 4500,
    'drain_seconds_at_240_per_s': 75, 'mean_concurrency_150_per_s_200ms': 30,
    'execution_GB_seconds': 10000, 'provisioned_GB_seconds': 21600,
}
checks.append({'case': 'arithmetic_against_hand_calculation', 'values': values})
try:
    hpa_base(4, 180, 0, 60)
    raise AssertionError('zero denominator accepted')
except ValueError:
    checks.append({'case': 'invalid_request_denominator', 'result': 'rejected'})

record = {
    'status': 'passed', 'python': platform.python_version(), 'sqlite': sqlite3.sqlite_version,
    'scope': 'Local HTTP/SIGTERM, SQLite transactions, real subprocess exit, arithmetic examples. No cloud queue, power-loss durability, Docker or Kubernetes run.',
    'checks': checks,
    'source_sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                      for path in sorted(ROOT.iterdir())
                      if path.is_file() and path.suffix in ('.py', '.yaml', '.json')
                      and path.name != 'validation.json'},
}
print(json.dumps(record, ensure_ascii=False, indent=2))
