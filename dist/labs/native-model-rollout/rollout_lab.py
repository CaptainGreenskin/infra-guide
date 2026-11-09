"""Real native CPU model gates and request target pinning under a single-owner controller."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager, ExitStack
import hashlib
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import tempfile
import threading
import time
from make_fixture import build

COMMIT = 'cd959bae99ff4bed22bef2604f45241c09bbb8c8'
ENGINE_SHA256 = 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959'
VARIANTS = {'stable': (1, 2), 'bad': (2, 2), 'good': (1, 3)}
PROMPT = [1, 4, 5, 6]
EXPECTED = [7, 8, 9]


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def request_body(count=3, stream=False):
    return {'prompt': PROMPT, 'n_predict': count, 'temperature': 0.0, 'seed': 7,
            'ignore_eos': True, 'return_tokens': True, 'cache_prompt': False, 'stream': stream}


def exchange(port, path, body=None):
    connection = HTTPConnection('127.0.0.1', port, timeout=8)
    try:
        connection.request('GET' if body is None else 'POST', path,
                           None if body is None else json.dumps(body), {'Content-Type': 'application/json'})
        with connection.getresponse() as response:
            raw = response.read()
            require(response.status == 200, f'HTTP status {response.status}')
            return json.loads(raw)
    finally:
        connection.close()


@contextmanager
def launch(engine, model, alias, log_path):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    env = {k: v for k, v in os.environ.items() if not k.startswith(('LLAMA_ARG_', 'LLAMA_SERVER_'))}
    arguments = [str(engine), '--model', str(model), '--host', '127.0.0.1', '--port', str(port),
                 '--device', 'none', '--n-gpu-layers', '0', '--threads', '1', '--threads-batch', '1',
                 '--parallel', '1', '--ctx-size', '128', '--batch-size', '32', '--ubatch-size', '32',
                 '--no-context-shift', '--no-warmup', '--cache-ram', '0', '--cache-reuse', '0',
                 '--verbose', '--no-ui', '--fit', 'off', '--alias', alias]
    with log_path.open('wb') as log:
        process = subprocess.Popen(arguments, stdout=subprocess.DEVNULL, stderr=log, env=env)
        try:
            deadline = time.monotonic() + 45
            while True:
                require(process.poll() is None, 'engine exited during load')
                try:
                    if exchange(port, '/health') == {'status': 'ok'}:
                        break
                except (OSError, ValueError):
                    pass
                require(time.monotonic() < deadline, 'engine load timeout')
                time.sleep(0.05)
            yield port
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


class Controller:
    """One owner changes this local route; captured bindings are never re-resolved mid-request."""
    def __init__(self, models, probes, now):
        self.models = models
        self.approved = {p['version'] for p in probes if p['response']['tokens'] == EXPECTED}
        require('stable' in self.approved, 'stable model failed its fixed semantic contract')
        self.version, self.generation = 'stable', 1
        self.now, self.events = now, []
        self.event('initial')

    def event(self, kind, **extra):
        self.events.append({'kind': kind, 'at_ns': self.now(), 'route_version': self.version,
                            'generation': self.generation, **extra})

    def publish(self, target, expected_generation):
        if target not in self.approved:
            self.event('rejected_semantics', target=target, expected_generation=expected_generation)
            return False
        if self.generation != expected_generation:
            self.event('rejected_stale_generation', target=target, expected_generation=expected_generation)
            return False
        self.version, self.generation = target, self.generation + 1
        self.event('published', target=target, expected_generation=expected_generation)
        return True

    def admit(self, name):
        model = self.models[self.version]
        binding = {'version': self.version, 'generation': self.generation,
                   'model_sha256': model['sha256'], 'alias': model['alias']}
        self.event('admitted', name=name, binding=binding)
        return binding


def stream(port, binding, count, now, paused=None, resume=None):
    body = request_body(count, True)
    record = {'binding': binding, 'request': body, 'sent_ns': now(), 'frames': []}
    connection = HTTPConnection('127.0.0.1', port, timeout=8)
    try:
        connection.request('POST', '/completion', json.dumps(body), {'Content-Type': 'application/json'})
        with connection.getresponse() as response:
            record['http_status'] = response.status
            require(response.status == 200, 'native stream request failed')
            did_pause = False
            for line in response:
                if not line.startswith(b'data: '):
                    continue
                data = line[6:].strip().decode()
                record['frames'].append({'at_ns': now(), 'data': data})
                payload = None if data == '[DONE]' else json.loads(data)
                if paused is not None and not did_pause and payload and not payload.get('stop') and payload.get('tokens'):
                    did_pause = True
                    record['reader_paused_ns'] = now()
                    paused.set()
                    require(resume.wait(8), 'controller did not resume old stream reader')
                    record['reader_resumed_ns'] = now()
            record['closed_ns'] = now()
    finally:
        connection.close()
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('rollout-results'))
    args = parser.parse_args()
    engine = args.engine.resolve()
    require(digest(engine) == ENGINE_SHA256, 'requires pinned macOS ARM64 b12110 llama-server')
    args.output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic_ns()
    now = lambda: time.monotonic_ns() - started
    models, probes, requests, logs = {}, [], {}, {}
    with tempfile.TemporaryDirectory(prefix='native-rollout-') as directory:
        work = Path(directory)
        with ExitStack() as stack:
            ports = {}
            for version, (shift, scale) in VARIANTS.items():
                model = work / (version + '.gguf')
                build(model, output_shift=shift, output_scale=scale)
                models[version] = {'sha256': digest(model), 'output_shift': shift, 'output_scale': scale,
                                   'alias': 'rollout-' + version}
                ports[version] = stack.enter_context(launch(engine, model, models[version]['alias'], work / (version + '.log')))
                body = request_body()
                probes.append({'version': version, 'health': exchange(ports[version], '/health'),
                               'request': body, 'response': exchange(ports[version], '/completion', body)})
            controller = Controller(models, probes, now)
            require(not controller.publish('bad', 1), 'bad candidate must not receive the public route')
            binding = controller.admit('after_rejection')
            requests['after_rejection'] = stream(ports[binding['version']], binding, 3, now)
            paused, resume = threading.Event(), threading.Event()
            with ThreadPoolExecutor(max_workers=1) as executor:
                binding = controller.admit('old_stream')
                old = executor.submit(stream, ports[binding['version']], binding, 32, now, paused, resume)
                try:
                    require(paused.wait(8), 'no first token from the admitted old stream')
                    controller.event('old_reader_paused')
                    require(controller.publish('good', 1), 'good publication failed')
                    binding = controller.admit('after_switch')
                    requests['after_switch'] = stream(ports[binding['version']], binding, 3, now)
                    require(controller.publish('stable', 2), 'rollback failed')
                    require(not controller.publish('good', 1), 'stale publisher overwrote rollback')
                    controller.event('resume_old_reader')
                finally:
                    resume.set()
                requests['old_stream'] = old.result(timeout=8)
            binding = controller.admit('after_rollback')
            requests['after_rollback'] = stream(ports[binding['version']], binding, 3, now)
            controller.event('finished')
        for version in VARIANTS:
            markers = ('new prompt,', 'next token:', 'stop processing:', 'assigned to device CPU',
                       'CPU KV buffer size', 'CPU compute buffer size', 'initializing, n_slots =')
            logs[version] = [{'line': i, 'text': line} for i, line in enumerate((work/(version+'.log')).read_text().splitlines(), 1)
                             if any(marker in line for marker in markers)]
    require([p['response']['tokens'] for p in probes] == [[7, 8, 9], [8, 10, 12], [7, 8, 9]], 'unexpected semantic probes')
    raw = {'models': models, 'probes': probes, 'route_events': controller.events, 'requests': requests, 'native_logs': logs}
    (args.output/'observations.json').write_text(json.dumps(raw, indent=2)+'\n')
    source = Path(__file__).resolve().parent
    validation = {'status': 'passed', 'backend': 'CPU', 'engine_commit': COMMIT,
                  'engine_sha256': digest(engine), 'python': platform.python_version(),
                  'system': platform.system(), 'machine': platform.machine(),
                  'source_sha256': {f: digest(source/f) for f in ['rollout_lab.py', 'make_fixture.py']},
                  'observations_sha256': digest(args.output/'observations.json'),
                  'expected_probe_tokens': EXPECTED, 'bad_candidate_tokens': [8, 10, 12],
                  'route_generations': [1, 2, 3], 'old_stream_tokens': 32,
                  'scope': 'single-owner local route controller with actual native CPU HTTP/SSE; artificial reader barrier, not a production load balancer or GPU benchmark'}
    (args.output/'validation.json').write_text(json.dumps(validation, indent=2)+'\n')
    print(json.dumps(validation, indent=2))


if __name__ == '__main__':
    main()
