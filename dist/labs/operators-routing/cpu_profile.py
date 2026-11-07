"""Collect actual PyTorch CPU ranges and operator events; this is not a latency benchmark."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import torch
from torch.profiler import ProfilerActivity, profile, record_function


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path, default=Path('cpu-profile.json'))
    parser.add_argument('--trace', type=Path, default=Path('cpu-trace.json'))
    args = parser.parse_args()
    torch.set_num_threads(1)
    # Fixed inputs; no training, network requests, or data files.
    x = ((torch.arange(32*64, dtype=torch.float32) % 17)-8).reshape(32,64) / 8
    w = ((torch.arange(64*32, dtype=torch.float32) % 11)-5).reshape(64,32) / 8

    def step(named=False):
        if named:
            with record_function('lesson_linear'): logits = x @ w
            with record_function('lesson_softmax'): probabilities = torch.softmax(logits, dim=-1)
            with record_function('lesson_reduce'): totals = probabilities.sum(dim=-1)
        else:
            logits = x @ w
            probabilities = torch.softmax(logits, dim=-1)
            totals = probabilities.sum(dim=-1)
        assert torch.allclose(totals, torch.ones(32), atol=1e-6, rtol=0)
        return probabilities

    with torch.no_grad():
        for _ in range(3): expected = step()
        with profile(activities=[ProfilerActivity.CPU], record_shapes=True, profile_memory=True) as prof:
            for _ in range(5): actual = step(True)
        assert torch.equal(actual, expected)
    prof.export_chrome_trace(str(args.trace))
    events = []
    for event in prof.key_averages(group_by_input_shape=True):
        events.append({'name': event.key, 'calls': event.count, 'input_shapes': event.input_shapes,
                       'self_cpu_us': event.self_cpu_time_total, 'inclusive_cpu_us': event.cpu_time_total})
    raw = json.loads(args.trace.read_text())
    # Exporter records an absolute output path; retain only its filename for a public teaching artifact.
    raw['traceName'] = args.trace.name
    args.trace.write_text(json.dumps(raw, ensure_ascii=False, indent=2)+'\n')
    ranges = [e for e in raw['traceEvents'] if e.get('ph')=='X' and e.get('name','').startswith('lesson_')]
    assert len(ranges)==15 and {e['name'] for e in ranges} == {'lesson_linear','lesson_softmax','lesson_reduce'}
    first = min(e['ts'] for e in ranges)
    named = [{'name': e['name'], 'start_us': e['ts']-first, 'duration_us': e['dur']} for e in ranges]
    result = {'status': 'passed', 'system': platform.system(), 'python': platform.python_version(),
              'torch': torch.__version__, 'device': str(x.device), 'threads': torch.get_num_threads(),
              'source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'trace_metadata_normalized': ['traceName: filename only'],
              'trace_sha256': hashlib.sha256(args.trace.read_bytes()).hexdigest(),
              'shapes': {'x': list(x.shape), 'w': list(w.shape), 'probabilities': list(actual.shape)},
              'warmup_calls': 3, 'profiled_calls': 5, 'row_sums': actual.sum(-1).tolist(),
              'events': events, 'named_ranges': named,
              'scope': 'Actual CPU PyTorch profiler with instrumentation overhead and shape/memory collection; not CUDA/kernel latency/production benchmark.'}
    args.report.write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({'status':result['status'],'torch':result['torch'],'device':result['device'],
                      'events':len(events),'named_ranges':len(named),'report':str(args.report)},ensure_ascii=False))


if __name__ == '__main__': main()
