"""Observe same-slot prefix reuse, idle retention and explicit erase on native CPU."""
import argparse
from contextlib import contextmanager
import hashlib
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import platform
import socket
import subprocess
import tempfile
import time
from make_fixture import build

COMMIT = 'cd959bae99ff4bed22bef2604f45241c09bbb8c8'
ENGINE_SHA256 = 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959'
FIXTURE_SHA256 = 'd0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66'
PROMPTS = {'cold_a': [1, 4, 5, 6], 'warm_b': [1, 4, 5, 5, 10], 'cold_b': [1, 4, 5, 5, 10]}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def exchange(port, path, body=None):
    conn = HTTPConnection('127.0.0.1', port, timeout=8)
    try:
        conn.request('GET' if body is None else 'POST', path,
                     None if body is None else json.dumps(body), {'Content-Type': 'application/json'})
        with conn.getresponse() as response:
            raw = response.read()
            require(response.status == 200, f'{path}: HTTP {response.status}')
            return json.loads(raw)
    finally:
        conn.close()


@contextmanager
def launch(engine, model, log_path):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    env = {k: v for k, v in os.environ.items() if not k.startswith(('LLAMA_ARG_', 'LLAMA_SERVER_'))}
    env['LLAMA_BATCH_DEBUG'] = '1'
    args = [str(engine), '--model', str(model), '--host', '127.0.0.1', '--port', str(port),
            '--device', 'none', '--n-gpu-layers', '0', '--threads', '1', '--threads-batch', '1',
            '--parallel', '1', '--ctx-size', '128', '--batch-size', '32', '--ubatch-size', '32',
            '--no-context-shift', '--no-warmup', '--cache-ram', '0', '--cache-reuse', '0',
            '--verbose', '--no-ui', '--fit', 'off', '--alias', 'synthetic-concurrency-fixture',
            '--slot-save-path', str(log_path.parent) + '/']
    with log_path.open('wb') as log:
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log, env=env)
        try:
            deadline = time.monotonic() + 45
            while True:
                require(proc.poll() is None, 'engine exited during startup')
                try:
                    if exchange(port, '/health')['status'] == 'ok':
                        break
                except (OSError, ValueError, KeyError):
                    pass
                require(time.monotonic() < deadline, 'engine startup timeout')
                time.sleep(0.05)
            yield port
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()


def capture(engine, scratch, repeat):
    model = scratch / 'fixture.gguf'
    build(model)
    require(digest(model) == FIXTURE_SHA256, 'fixture hash mismatch')
    log_path = scratch / f'engine-{repeat}.log'
    run = {'repeat': repeat, 'requests': {}}
    with launch(engine, model, log_path) as port:
        run['initial'] = exchange(port, '/slots')
        for name, prompt in PROMPTS.items():
            if name == 'cold_b':
                run['erase'] = exchange(port, '/slots/0?action=erase', {})
                run['after_erase'] = exchange(port, '/slots')
            body = {'prompt': prompt, 'id_slot': 0, 'cache_prompt': True, 'n_predict': 3,
                    'ignore_eos': True, 'temperature': 0.0, 'seed': 7, 'return_tokens': True}
            run['requests'][name] = {'body': body, 'response': exchange(port, '/completion', body)}
            run['after_' + name] = exchange(port, '/slots')
    markers = ('new prompt,', 'cached n_tokens =', 'stop processing:', 'next token:',
               'clearing prompt with', 'all slots are idle', 'initializing, n_slots =',
               'assigned to device CPU', 'CPU KV buffer size', 'CPU compute buffer size',
               'input batch info:', 'ubatch_print:', 'ubatch_add:')
    logs = [{'line': i, 'text': text} for i, text in enumerate(log_path.read_text().splitlines(), 1)
            if any(marker in text for marker in markers)]
    for name, expected in [('cold_a', (0, 4, [7, 8, 9])), ('warm_b', (3, 2, [11, 12, 13])),
                           ('cold_b', (0, 5, [11, 12, 13]))]:
        response = run['requests'][name]['response']
        require((response['timings']['cache_n'], response['timings']['prompt_n'], response['tokens']) == expected,
                f'{name}: unexpected native output')
    require(run['erase'] == {'id_slot': 0, 'n_erased': 7}, 'unexpected erase count')
    return run, {'repeat': repeat, 'lines': logs}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engine', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=Path('prefix-results'))
    args = parser.parse_args()
    engine = args.engine.resolve()
    require(digest(engine) == ENGINE_SHA256, 'requires the pinned macOS ARM64 b12110 server binary')
    version = subprocess.run([str(engine), '--version'], capture_output=True, text=True, check=True)
    require('build 12110' in version.stdout + version.stderr and 'cd959bae9' in version.stdout + version.stderr,
            'engine version mismatch')
    args.output.mkdir(parents=True, exist_ok=True)
    runs, logs = [], []
    with tempfile.TemporaryDirectory(prefix='native-prefix-') as directory:
        for repeat in range(1, 4):
            run, trace = capture(engine, Path(directory), repeat)
            runs.append(run)
            logs.append(trace)
    write = lambda name, obj: (args.output / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    write('responses.json', runs)
    write('native-logs.json', logs)
    source = Path(__file__).resolve().parent
    summary = {'status': 'passed', 'backend': 'CPU', 'engine_commit': COMMIT,
               'engine_sha256': digest(engine), 'fixture_sha256': FIXTURE_SHA256,
               'host': {'system': platform.system(), 'machine': platform.machine()},
               'source_sha256': {f: digest(source / f) for f in ['prefix_lab.py', 'make_fixture.py']},
               'evidence_sha256': {f: digest(args.output / f) for f in ['responses.json', 'native-logs.json']},
               'repetitions': 3, 'warm_hit_positions': 3, 'warm_new_prompt_positions': 2,
               'cold_new_prompt_positions': 5, 'erased_positions': 7, 'output_ids': [11, 12, 13],
               'scope': 'native CPU control path; synthetic weights; no GPU or capacity/performance claim'}
    write('validation.json', summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
