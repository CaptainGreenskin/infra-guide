#!/usr/bin/env python3
"""Independent standard-library oracle for cuda_lab.cu readback reports.

This program never invokes CUDA. Its self-test uses synthetic host records and
therefore never provides evidence of device execution.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

ATOL = RTOL = 1e-5
HERE = Path(__file__).resolve().parent


def source_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def softmax(values):
    maximum = max(values)
    numerators = [math.exp(value - maximum) for value in values]
    denominator = math.fsum(numerators)
    return [value / denominator for value in numerators]


def fixtures():
    """Reconstruct inputs and answers without using the C++ reported answers."""
    cases = {}
    for cols in (1, 5, 129, 257):
        rows = [[(((row + 1) * 11 + col * 7) % 29 - 14) / 4.0
                 + row * 0.125 for col in range(cols)] for row in range(3)]
        cases['sum-' + str(cols)] = ([3, cols], [math.fsum(row) for row in rows])
        cases['softmax-' + str(cols)] = ([3, cols],
                                        [value for row in rows for value in softmax(row)])
    cases['softmax-extreme'] = ([1, 5], softmax([1000., 1001., 999., -1000., 0.]))
    for m, k, n in ((1, 1, 1), (17, 19, 13), (32, 32, 32), (31, 33, 29)):
        a = [[((row * 3 + col * 5) % 17 - 8) / 8.0 for col in range(k)] for row in range(m)]
        b = [[((row * 7 + col * 2) % 19 - 9) / 16.0 for col in range(n)] for row in range(k)]
        answer = [math.fsum(a[row][inner] * b[inner][col] for inner in range(k))
                  for row in range(m) for col in range(n)]
        cases['gemm-%d-%d-%d' % (m, k, n)] = ([m, k, n], answer)
    return cases


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, label):
    require(type(value) in (int, float) and math.isfinite(value), 'nonfinite_or_invalid:' + label)
    return float(value)


def vector(actual, expected, label):
    require(type(actual) is list and len(actual) == len(expected), 'wrong_output_size:' + label)
    errors = []
    for index, (got, wanted) in enumerate(zip(actual, expected)):
        got = number(got, '%s[%d]' % (label, index))
        error = abs(got - wanted)
        require(error <= ATOL + RTOL * abs(wanted), 'wrong_value:%s[%d]' % (label, index))
        errors.append(error)
    return max(errors, default=0.)


def validate(report, expected_source):
    require(type(report) is dict, 'report_not_object')
    require(type(report.get('schema_version')) is int and report['schema_version'] == 1, 'wrong_schema')
    require(report.get('status') == 'passed', 'report_not_passed')
    require(report.get('device_execution') is True, 'device_execution_not_reported')
    require(report.get('profile_only') is False, 'profile_only_or_unspecified')
    require(report.get('source_sha256') == expected_source and len(expected_source) == 64, 'source_mismatch')
    require(number(report.get('atol'), 'atol') == ATOL and number(report.get('rtol'), 'rtol') == RTOL,
            'wrong_tolerance')
    for field in ('cuda_runtime_version', 'driver_version'):
        require(type(report.get(field)) is int and report[field] > 0, 'invalid_' + field)
    device = report.get('device')
    require(type(device) is dict and type(device.get('name')) is str and bool(device['name']), 'invalid_device')
    cc = device.get('compute_capability')
    require(type(cc) is list and len(cc) == 2 and all(type(x) is int and x >= 0 for x in cc)
            and cc[0] >= 8, 'invalid_compute_capability')
    expected = fixtures()
    cases = report.get('cases')
    require(type(cases) is list and len(cases) == len(expected) == 13, 'wrong_case_count')
    seen, checked_values, maximum_error = set(), 0, 0.
    for case in cases:
        require(type(case) is dict, 'case_not_object')
        name = case.get('fixture')
        require(type(name) is str and name in expected and name not in seen, 'unknown_or_duplicate_case')
        seen.add(name)
        shape, answer = expected[name]
        require(type(case.get('shape')) is list and all(type(x) is int for x in case['shape'])
                and case['shape'] == shape, 'wrong_shape:' + name)
        require(type(case.get('elements')) is int and case['elements'] == len(answer), 'wrong_elements:' + name)
        error = vector(case.get('values'), answer, name)
        declared = number(case.get('max_abs_error'), name + '.max_abs_error')
        require(declared >= 0 and math.isclose(declared, error, rel_tol=1e-6, abs_tol=1e-12),
                'wrong_error_summary:' + name)
        maximum_error = max(maximum_error, error)
        checked_values += len(answer)
    require(seen == set(expected), 'missing_case')
    negative = report.get('negative_control')
    require(type(negative) is dict and negative.get('kind') == 'skip_normalization'
            and negative.get('executed') is True, 'negative_control_not_executed')
    unnormalized = [math.exp(value - 1001.) for value in (1000., 1001., 999., -1000., 0.)]
    vector(negative.get('observed'), unnormalized, 'negative_control')
    correct = expected['softmax-extreme'][1]
    require(any(abs(got - wanted) > ATOL + RTOL * abs(wanted)
                for got, wanted in zip(negative['observed'], correct)), 'negative_control_not_rejected')
    return {'status': 'passed', 'source_sha256': expected_source, 'fixtures': len(seen),
            'readback_values_checked': checked_values, 'negative_values_checked': len(correct),
            'max_abs_error': maximum_error, 'device_execution': True,
            'scope': 'Independent host validation of supplied complete device readbacks; no kernels launched by this validator.'}


def float32(value):
    return struct.unpack('<f', struct.pack('<f', value))[0]


def synthetic_record(expected_source):
    cases = []
    for name, (shape, expected) in fixtures().items():
        actual = [float32(value) for value in expected]
        cases.append({'fixture': name, 'shape': shape, 'elements': len(actual), 'values': actual,
                      'max_abs_error': max(abs(x - y) for x, y in zip(actual, expected))})
    return {'schema_version': 1, 'status': 'passed', 'device_execution': True, 'profile_only': False,
            'source_sha256': expected_source, 'cuda_runtime_version': 12090, 'driver_version': 12090,
            'device': {'name': 'SYNTHETIC HOST RECORD, NOT A DEVICE', 'compute_capability': [8, 0]},
            'atol': ATOL, 'rtol': RTOL, 'cases': cases,
            'negative_control': {'kind': 'skip_normalization', 'executed': True,
                                 'observed': [float32(math.exp(x - 1001.))
                                              for x in (1000., 1001., 999., -1000., 0.)]}}


def selftest(expected_source):
    good = synthetic_record(expected_source)
    summary = validate(good, expected_source)
    mutations = {
        'wrong_shape': lambda r: r['cases'][0]['shape'].__setitem__(0, 2),
        'wrong_value': lambda r: r['cases'][0]['values'].__setitem__(0, 12345.),
        'missing_case': lambda r: r['cases'].pop(),
        'duplicate_case': lambda r: r['cases'].__setitem__(1, copy.deepcopy(r['cases'][0])),
        'profile_only': lambda r: r.__setitem__('profile_only', True),
        'source_mismatch': lambda r: r.__setitem__('source_sha256', '0' * 64),
        'nonfinite_value': lambda r: r['cases'][0]['values'].__setitem__(0, float('nan')),
        'empty_readbacks': lambda r: r['cases'][0].__setitem__('values', []),
        'wrong_elements': lambda r: r['cases'][0].__setitem__('elements', 100),
        'wrong_error_summary': lambda r: r['cases'][0].__setitem__('max_abs_error', 1.),
        'loosened_tolerance': lambda r: r.__setitem__('atol', 10.),
        'no_device_execution': lambda r: r.__setitem__('device_execution', False),
        'negative_not_executed': lambda r: r['negative_control'].__setitem__('executed', False),
        'negative_normalized': lambda r: r['negative_control'].__setitem__('observed', fixtures()['softmax-extreme'][1]),
        'negative_wrong_value': lambda r: r['negative_control']['observed'].__setitem__(0, 5.),
        'negative_nonfinite': lambda r: r['negative_control']['observed'].__setitem__(0, float('inf')),
    }
    rejected = []
    for name, mutate in mutations.items():
        bad = copy.deepcopy(good)
        mutate(bad)
        try:
            validate(bad, expected_source)
        except ValueError:
            rejected.append(name)
        else:
            raise AssertionError('validator accepted mutation: ' + name)
    return {'status': 'passed', 'device_execution': False, 'source_sha256': expected_source,
            'synthetic_fixtures': summary['fixtures'], 'synthetic_values_checked': summary['readback_values_checked'],
            'mutations_rejected': rejected, 'scope': 'CPU-only synthetic-record validator self-test; no GPU execution.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=HERE / 'cuda_lab.cu')
    parser.add_argument('--check-gpu', '--report', dest='report', type=Path,
                        help='Full default CUDA run report to validate, not a probe or profile report')
    parser.add_argument('--self-test', '--selftest', dest='selftest', action='store_true')
    parser.add_argument('--json', type=Path, help='Write validator summary as JSON')
    args = parser.parse_args()
    if args.selftest == bool(args.report):
        parser.error('choose exactly one of --self-test or --check-gpu FILE')
    try:
        expected_source = source_sha256(args.source)
        if args.selftest:
            summary = selftest(expected_source)
        else:
            summary = validate(json.loads(args.report.read_text()), expected_source)
        text = json.dumps(summary, indent=2, allow_nan=False) + '\n'
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(text)
        print(text, end='')
        return 0
    except (ValueError, OSError, AssertionError) as error:
        print('reference: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
