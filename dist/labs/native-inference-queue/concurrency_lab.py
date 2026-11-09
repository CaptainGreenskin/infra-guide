"""Observe two overlapping native llama.cpp CPU requests on one and two slots."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import platform
import re
import socket
import subprocess
import tempfile
import threading
import time


VERSION = '0.9.0-dev (build 12110, commit cd959bae9)'
ENGINE_SHA256 = 'e7e3c60a5e612460d095bfd219047040d6bb9d0b56466aae30a480980b676959'
FIXTURE_SHA256 = 'd0a1a3cdf9e6517b20e60099e9f7b46d4c45dd7432512c0b15b95bf06410ed66'
PROMPTS = {'A': [1, 4, 5, 6], 'B': [1, 4, 5, 5, 10]}
OUTPUT_LIMITS = {'A': 110, 'B': 32}
EXPECTED_PREFIXES = {'A': [7, 8, 9], 'B': [11, 12, 13]}
METRICS = ('requests_processing', 'requests_deferred', 'prompt_tokens_total', 'tokens_predicted_total', 'n_decode_total')
START = re.compile(r'id\s+(\d+) \| task (\d+) \| new prompt,.*?task\.n_tokens = (\d+)')
STOP = re.compile(r'id\s+(\d+) \| task (\d+) \| stop processing: n_tokens = (\d+), truncated = (\d+)')
DEFER = re.compile(r'no slot is available, defer task, id_task = (\d+)')
SAMPLE = re.compile(r'id\s+(\d+) \| task (\d+) \| n_gen = \d+, n_remaining = \d+, next token:\s+(\d+)')


def require(value, message):
    if not value:
        raise ValueError(message)


def save(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def get(port, path):
    connection = HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        connection.request('GET', path)
        with connection.getresponse() as response:
            require(response.status == 200, f'{path}: HTTP {response.status}')
            return response.read().decode()
    finally:
        connection.close()


@contextmanager
def launch(server, fixture, parallel, log_path):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    env = {name: value for name, value in os.environ.items()
           if not name.startswith(('LLAMA_ARG_', 'LLAMA_SERVER_'))}
    env['LLAMA_BATCH_DEBUG'] = '1'
    arguments = [
        str(server), '--model', str(fixture), '--host', '127.0.0.1', '--port', str(port),
        '--device', 'none', '--n-gpu-layers', '0', '--threads', '1', '--threads-batch', '1',
        '--parallel', str(parallel), '--ctx-size', str(128 * parallel),
        '--batch-size', '32', '--ubatch-size', '32', '--no-context-shift',
        '--no-warmup', '--cache-ram', '0', '--cache-reuse', '0', '--metrics',
        '--verbose', '--no-ui', '--fit', 'off', '--alias', 'synthetic-concurrency-fixture',
    ]
    with log_path.open('wb') as log:
        proc = subprocess.Popen(arguments, stdout=subprocess.DEVNULL, stderr=log, env=env)
        try:
            deadline = time.monotonic() + 45
            while True:
                require(proc.poll() is None, f'engine exited during startup: {log_path}')
                try:
                    ready = json.loads(get(port, '/health'))['status'] == 'ok'
                except (OSError, ValueError, KeyError):
                    ready = False
                if ready:
                    break
                require(time.monotonic() < deadline, f'engine not ready: {log_path}')
                time.sleep(0.05)
            yield port, arguments
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()


def visible_tokens(event):
    if not event.get('stop') and 'prompt_progress' not in event:
        return event.get('tokens', [])
    return []


def stream_request(port, name, now, start_a, first_a, b_connected):
    body = {
        'prompt': PROMPTS[name], 'n_predict': OUTPUT_LIMITS[name], 'temperature': 0.0, 'seed': 7,
        'stream': True, 'return_tokens': True, 'return_progress': True,
        'cache_prompt': False, 'ignore_eos': True,
    }
    connection = HTTPConnection('127.0.0.1', port, timeout=12)
    try:
        connection.connect()
        if name == 'A':
            require(start_a.wait(8), 'A did not receive the start signal')
        else:
            b_connected.set()
            require(first_a.wait(8), 'B did not observe A’s first token')
        sent = now()
        connection.request('POST', '/completion', json.dumps(body),
                           {'Content-Type': 'application/json', 'Connection': 'close'})
        with connection.getresponse() as response:
            headers = now()
            require(response.status == 200, f'{name}: HTTP {response.status}')
            events = []
            for line in response:
                observed = now()
                if not line.startswith(b'data: '):
                    continue
                payload = line[6:].strip().decode()
                events.append({'observed_ns': observed, 'data': payload})
                if name == 'A' and not first_a.is_set() and payload != '[DONE]':
                    if visible_tokens(json.loads(payload)):
                        first_a.set()
            return {'body': body, 'http_status': response.status, 'sent_ns': sent,
                    'headers_ns': headers, 'stream_closed_ns': now(), 'events': events}
    finally:
        connection.close()


def metric_sample(port, now):
    begin = now()
    raw = get(port, '/metrics')
    end = now()
    values = {name: float(value) for name, value in re.findall(
        r'^llamacpp:(\w+) ([-+0-9.eE]+)$', raw, re.MULTILINE) if name in METRICS}
    require(set(values) == set(METRICS), 'unexpected /metrics schema')
    return {'begin_ns': begin, 'observed_ns': end, 'values': values}


def poll_metrics(port, now, ready, done):
    samples = [metric_sample(port, now)]
    ready.set()
    while not done.wait(0.0005):
        samples.append(metric_sample(port, now))
    samples.append(metric_sample(port, now))
    return samples


def parse_log(path):
    starts, stops, defers, sampled, relevant = [], {}, {}, {}, []
    for number, line in enumerate(path.read_text(encoding='utf-8', errors='replace').splitlines(), 1):
        if (any(pattern.search(line) for pattern in (START, STOP, DEFER, SAMPLE))
                or any(marker in line for marker in ('initializing, n_slots = ',
                                                     'assigned to device CPU',
                                                     'CPU KV buffer size', 'CPU compute buffer size'))):
            relevant.append({'line': number, 'text': line})
        if m := START.search(line):
            slot, task, prompt_size = map(int, m.groups())
            starts.append({'line': number, 'slot': slot, 'task': task, 'prompt_tokens': prompt_size})
        if m := STOP.search(line):
            slot, task, tokens, truncated = map(int, m.groups())
            require(truncated == 0, f'task {task} truncated')
            stops[task] = {'line': number, 'slot': slot, 'cached_tokens': tokens}
        if m := DEFER.search(line):
            defers.setdefault(int(m[1]), []).append(number)
        if m := SAMPLE.search(line):
            sampled.setdefault(int(m[2]), []).append(int(m[3]))
    require(len(starts) == 2, 'expected two native prompt start records')
    trace = {}
    for name, prompt in PROMPTS.items():
        begin = next(row for row in starts if row['prompt_tokens'] == len(prompt))
        task = begin['task']
        trace[name] = {'start': begin, 'stop': stops[task], 'defer_lines': defers.get(task, []),
                       'sampled_ids': sampled.get(task, [])}
    return trace, relevant


def summarize_request(name, raw, trace):
    parsed = [(row['observed_ns'], json.loads(row['data'])) for row in raw['events'] if row['data'] != '[DONE]']
    token_events = [(when, visible_tokens(event)) for when, event in parsed if visible_tokens(event)]
    require(all(len(ids) == 1 for _, ids in token_events), f'{name}: more than one token in an SSE event')
    output = [ids[0] for _, ids in token_events]
    require(len(output) == OUTPUT_LIMITS[name], f'{name}: emitted {len(output)} tokens, expected {OUTPUT_LIMITS[name]}')
    require(output[:3] == EXPECTED_PREFIXES[name], f'{name}: wrong first three token IDs: {output[:3]}')
    require(output == trace['sampled_ids'], f'{name}: SSE and native sample order differ')
    when, final = parsed[-1]
    require(final['stop'] and final['stop_type'] == 'limit', f'{name}: unexpected end of output')
    require(final['id_slot'] == trace['start']['slot'] == trace['stop']['slot'], f'{name}: slot ID mismatch')
    counts = {k: final['timings'][k] for k in ('cache_n', 'prompt_n', 'predicted_n')}
    require(counts == {'cache_n': 0, 'prompt_n': len(PROMPTS[name]), 'predicted_n': len(output)},
            f'{name}: unexpected token counts: {counts}')
    require(final['tokens_cached'] == trace['stop']['cached_tokens'] == len(PROMPTS[name]) + len(output) - 1,
            f'{name}: incorrect last consumed position')
    first, last = token_events[0][0], token_events[-1][0]
    require(raw['sent_ns'] <= raw['headers_ns'] <= first <= last <= when <= raw['stream_closed_ns'],
            f'{name}: event time order')
    return {'output_ids': output, 'sent_ns': raw['sent_ns'], 'first_token_ns': first, 'last_token_ns': last,
            'stop_ns': when, 'ttft_ns': first - raw['sent_ns'],
            'tpot_ns': (last - first) / (len(output) - 1), 'counts': counts, 'trace': trace}


def run(server, fixture, parallel, scratch, index):
    stem = f'{parallel}-slot-{index}'
    log_path = scratch / f'{stem}.stderr.log'
    with launch(server, fixture, parallel, log_path) as (port, _):
        origin = time.monotonic_ns()
        now = lambda: time.monotonic_ns() - origin
        slots_before = json.loads(get(port, '/slots'))
        require(len(slots_before) == parallel and all(slot['n_ctx'] == 128 for slot in slots_before),
                f'{stem}: slot count or per-slot context differed: {slots_before}')
        require(all(not slot['is_processing'] for slot in slots_before), f'{stem}: server not idle')
        metrics_ready, metrics_done = threading.Event(), threading.Event()
        start_a, first_a, b_connected = threading.Event(), threading.Event(), threading.Event()
        with ThreadPoolExecutor(max_workers=3) as pool:
            metrics_future = pool.submit(poll_metrics, port, now, metrics_ready, metrics_done)
            try:
                require(metrics_ready.wait(8), 'metrics sampler did not start')
                b = pool.submit(stream_request, port, 'B', now, start_a, first_a, b_connected)
                a = pool.submit(stream_request, port, 'A', now, start_a, first_a, b_connected)
                require(b_connected.wait(8), 'B did not connect')
                start_a.set()
                requests = {'A': a.result(timeout=15), 'B': b.result(timeout=15)}
            finally:
                metrics_done.set()
            samples = metrics_future.result(timeout=8)
        slots_after = json.loads(get(port, '/slots'))
    trace, relevant = parse_log(log_path)
    require(all(not slot['is_processing'] for slot in slots_after), f'{stem}: a slot remained active')
    summary = {name: summarize_request(name, requests[name], trace[name]) for name in PROMPTS}
    a, b = summary['A'], summary['B']
    require(a['first_token_ns'] <= b['sent_ns'] < a['stop_ns'], f'{stem}: B was not sent during A’s stream')
    first, last = samples[0]['values'], samples[-1]['values']
    deltas = {key: last[key] - first[key] for key in ('prompt_tokens_total', 'tokens_predicted_total', 'n_decode_total')}
    require(deltas['prompt_tokens_total'] == sum(map(len, PROMPTS.values())), f'{stem}: bad prompt counter delta')
    require(deltas['tokens_predicted_total'] == sum(OUTPUT_LIMITS.values()), f'{stem}: bad generated counter delta')
    require(last['requests_processing'] == last['requests_deferred'] == 0, f'{stem}: server not idle at end')
    maxima = {key: max(sample['values'][key] for sample in samples)
              for key in ('requests_processing', 'requests_deferred')}
    metric_states = {(sample['values']['requests_processing'], sample['values']['requests_deferred'])
                     for sample in samples}
    if parallel == 1:
        require(b['trace']['defer_lines'], f'{stem}: no native defer event for B')
        require(a['trace']['start']['line'] < b['trace']['defer_lines'][0] < a['trace']['stop']['line'] < b['trace']['start']['line'],
                f'{stem}: did not observe B deferred while A held the only slot, then B started')
        require(a['trace']['start']['slot'] == b['trace']['start']['slot'] == 0, f'{stem}: unexpected single-slot assignment')
        require((1, 1) in metric_states, f'{stem}: missing metrics observation of single-slot queue')
    else:
        require(not b['trace']['defer_lines'], f'{stem}: B was deferred with two slots')
        require(a['trace']['start']['line'] < b['trace']['start']['line']
                < min(a['trace']['stop']['line'], b['trace']['stop']['line']),
                f'{stem}: did not observe both active slots before the first release')
        require(a['trace']['start']['slot'] != b['trace']['start']['slot'], f'{stem}: requests did not occupy different slots')
    records = [
        {'kind': 'slot_snapshot', 'stage': stage, 'slots': [
            {key: slot[key] for key in ('id', 'n_ctx', 'is_processing')} for slot in slots]}
        for stage, slots in (('before', slots_before), ('after', slots_after))
    ]
    for name, request in requests.items():
        records.append({'kind': 'request', 'name': name, **{k: v for k, v in request.items() if k != 'events'}})
        records.extend({'kind': 'sse', 'name': name, **frame} for frame in request['events'])
    records.extend({'kind': 'metrics', **sample} for sample in samples)
    records.extend({'kind': 'native_log', **line} for line in relevant)
    return {'id': stem, 'slots': parallel, 'per_slot_context': slots_before[0]['n_ctx'],
            'requests': summary, 'metric_samples': len(samples), 'metric_maxima': maxima,
            'metric_counter_deltas': deltas, 'observed_two_active_gauge': (2, 0) in metric_states}, records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--server', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repeat', type=int, default=1)
    args = parser.parse_args()
    require(args.repeat > 0, 'repeat must be positive')
    server, fixture = args.server.resolve(strict=True), args.fixture.resolve(strict=True)
    require(digest(server) == ENGINE_SHA256, 'server differs from the pinned macOS arm64 release binary')
    require(digest(fixture) == FIXTURE_SHA256, 'fixture differs from the pinned 22 KiB synthetic GGUF')
    version = subprocess.run([str(server), '--version'], check=True, capture_output=True, text=True)
    require(VERSION in version.stdout + version.stderr, 'unexpected server version')
    args.output.mkdir(parents=True, exist_ok=True)
    runs, records = [], []
    with tempfile.TemporaryDirectory(prefix='llama-concurrency-') as directory:
        for i in range(1, args.repeat + 1):
            pair = [run(server, fixture, slots, Path(directory), i) for slots in (1, 2)]
            for name in PROMPTS:
                require(pair[0][0]['requests'][name]['output_ids'] == pair[1][0]['requests'][name]['output_ids'],
                        f'{name}: token outputs changed under concurrency')
            for summary, run_records in pair:
                first = len(records) + 1
                for record in run_records:
                    records.append({'index': len(records) + 1, 'run_id': summary['id'], **record})
                summary['record_range'] = [first, len(records)]
                for request in summary['requests'].values():
                    ids = request.pop('output_ids')
                    request['output_count'] = len(ids)
                    request['first_three_ids'] = ids[:3]
                    request['output_ids_sha256'] = hashlib.sha256(
                        json.dumps(ids, separators=(',', ':')).encode()).hexdigest()
                    request['trace'].pop('sampled_ids')
                runs.append(summary)
            print(f'PASS repetition {i}: one-slot defer→resume and two-slot overlap', flush=True)
    record_path = args.output / 'events.jsonl'
    record_text = ''.join(json.dumps(row, separators=(',', ':'), ensure_ascii=False) + '\n' for row in records)
    require(not re.search(r'/(?:Users|home|private|var/folders)/|[\\/]\.cache[\\/]', record_text),
            'a local path appeared in the selected records')
    record_path.write_text(record_text, encoding='utf-8')
    generator = Path(__file__).with_name('make_fixture.py')
    source_sha256 = {Path(__file__).name: digest(Path(__file__))}
    if generator.is_file():
        source_sha256[generator.name] = digest(generator)
    save(args.output / 'validation.json', {
        'schema': 1, 'status': 'passed', 'platform': platform.platform(), 'python': platform.python_version(),
        'llama_cpp': VERSION, 'engine_binary_sha256': ENGINE_SHA256, 'fixture_sha256': FIXTURE_SHA256,
        'source_sha256': source_sha256, 'records_sha256': {record_path.name: digest(record_path)}, 'runs': runs,
        'clock': 'SSE and metrics use client time.monotonic_ns relative to one origin per run. Native timestamps belong to the engine process.',
        'scope': 'loopback native CPU, tiny synthetic model, fixed prompts, metrics and verbose logging enabled; no GPU, vLLM, or performance benchmark',
    })


if __name__ == '__main__':
    main()
