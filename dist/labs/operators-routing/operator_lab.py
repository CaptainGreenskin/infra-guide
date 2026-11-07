"""Compile real float64 CPU kernels; independent math oracles precede bounded timing."""
import argparse
import ctypes as ct
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shlex
import shutil
import statistics
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
PTR = ct.POINTER(ct.c_double)


def buffer(values):
    return (ct.c_double * len(values))(*values)


def softmax_reference(row):
    maximum = max(row)
    terms = [math.exp(x - maximum) for x in row]
    total = math.fsum(terms)
    return [x / total for x in terms]


def left_fold(values):
    total = 0.0
    for value in values:
        total = total + value
    return total


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    compiler = shlex.split(os.environ.get('CC', 'cc'))
    if not compiler or not shutil.which(compiler[0]):
        raise SystemExit('A local C11 compiler is required; no dependency is installed by this program.')
    version = subprocess.check_output(compiler + ['--version'], text=True).splitlines()[0]
    source = HERE / 'cpu_ops.c'
    with tempfile.TemporaryDirectory(prefix='infra-operators-') as directory:
        target = Path(directory) / ('ops.dylib' if platform.system() == 'Darwin' else 'ops.so')
        flags = ['-O3', '-std=c11', '-fPIC', '-dynamiclib' if platform.system() == 'Darwin' else '-shared']
        subprocess.run(compiler + flags + [str(source), '-lm', '-o', str(target)], check=True)
        lib = ct.CDLL(str(target))
        lib.row_softmax.argtypes = [PTR, PTR, ct.c_size_t, ct.c_size_t]
        lib.row_softmax.restype = ct.c_int
        lib.sum_tree.argtypes = [PTR, ct.c_size_t, PTR]
        lib.sum_tree.restype = ct.c_double
        common = [PTR, PTR, PTR, ct.c_size_t, ct.c_size_t, ct.c_size_t]
        lib.gemm_ijk.argtypes = common
        lib.gemm_tiled.argtypes = common + [ct.c_size_t]
        lib.gemm_ijk.restype = lib.gemm_tiled.restype = None
        rows = [[1000.0, 1001.0, 1002.0], [-1002.0, -1001.0, -1000.0], [0.0, 0.0, 0.0]]
        x, y = buffer([v for row in rows for v in row]), buffer([0.0] * 9)
        assert lib.row_softmax(x, y, 3, 3) == 0
        reference = [v for row in rows for v in softmax_reference(row)]
        assert max(abs(a-b) for a, b in zip(y, reference)) < 1e-14
        for i in range(3):
            assert abs(math.fsum(y[3*i:3*i+3])-1.0) < 1e-14
        before = list(y)
        assert lib.row_softmax(buffer([math.nan]), y, 1, 1) == 2 and list(y) == before
        assert lib.row_softmax(x, y, 3, 0) == 1
        try:
            math.exp(1000.0)
        except OverflowError:
            naive_overflow = True
        else:
            raise AssertionError('negative reference must overflow')
        cancellation = [1e16, 1.0, -1e16, 1.0]
        tree = lib.sum_tree(buffer(cancellation), 4, buffer([0.0]*4))
        odd = lib.sum_tree(buffer([1.0, 2.0, 3.0, 4.0, 5.0]), 5, buffer([0.0]*5))
        assert tree == 0.0 and left_fold(cancellation) == 1.0 and math.fsum(cancellation) == 2.0
        assert odd == 15.0
        assert lib.sum_tree(buffer([]), 0, buffer([])) == 0.0
        shape_checks = []
        for m, k, n, tile in [(2, 3, 4, 2), (5, 7, 3, 4), (1, 1, 1, 8)]:
            av = [float((i*7)%11-5) / 4 for i in range(m*k)]
            bv = [float((i*3)%7-3) / 2 for i in range(k*n)]
            a, b = buffer(av), buffer(bv)
            first, second = buffer([0.0]*(m*n)), buffer([0.0]*(m*n))
            lib.gemm_ijk(a, b, first, m, k, n)
            lib.gemm_tiled(a, b, second, m, k, n, tile)
            expected = [math.fsum(av[i*k+t]*bv[t*n+j] for t in range(k)) for i in range(m) for j in range(n)]
            assert list(first) == list(second) == expected
            shape_checks.append({'m': m, 'k': k, 'n': n, 'tile': tile, 'output': list(first)})
        # All arrays and the library exist before timing; ctypes overhead remains part of each call.
        m = k = n = 96
        a, b = buffer([float(i%7-3)/8 for i in range(m*k)]), buffer([float(i%5-2)/4 for i in range(k*n)])
        first, second = buffer([0.0]*(m*n)), buffer([0.0]*(m*n))
        durations = {}
        for name, fn, tail in [('ijk', lib.gemm_ijk, []), ('tiled', lib.gemm_tiled, [16])]:
            output = first if name == 'ijk' else second
            for _ in range(3): fn(a, b, output, m, k, n, *tail)
            samples = []
            for _ in range(7):
                started = time.perf_counter_ns()
                for _ in range(3): fn(a, b, output, m, k, n, *tail)
                samples.append((time.perf_counter_ns()-started)/3/1000)
            durations[name] = {'samples_us_per_call': samples, 'median_us': statistics.median(samples)}
        assert list(first) == list(second)
    result = {'status': 'passed', 'system': platform.system(), 'machine': platform.machine(),
              'python': platform.python_version(), 'compiler': version, 'flags': flags,
              'source_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [source, Path(__file__)]},
              'softmax': {'input': rows, 'output': [list(y[i*3:i*3+3]) for i in range(3)],
                          'naive_exp_overflow': naive_overflow, 'nonfinite_rejected_without_output_change': True},
              'reduce': {'input': cancellation, 'left_fold': left_fold(cancellation), 'python_builtin_sum': sum(cancellation), 'tree': tree,
                         'high_accuracy_reference': math.fsum(cancellation), 'odd_five_sum': odd, 'empty_sum': 0.0},
              'gemm_shapes': shape_checks, 'timing': {'shape': [m,k,n], 'dtype': 'float64', 'tile': 16,
                        'warmup_calls': 3, 'calls_per_sample': 3, 'samples': 7, 'implementations': durations},
              'scope': 'Real CPU C11/ctypes execution. Timings include call overhead; not CUDA, GPU bandwidth, BLAS or universal speedup.'}
    if args.report: args.report.write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
