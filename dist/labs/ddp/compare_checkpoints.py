"""Compare model, optimizer, scaler and RNG state after uninterrupted/resumed CPU runs."""
import argparse
import torch


def compare(a, b, path='state'):
    if isinstance(a, torch.Tensor):
        if not isinstance(b, torch.Tensor) or a.dtype != b.dtype or a.shape != b.shape:
            raise AssertionError(f'{path}: tensor metadata differs')
        if not torch.equal(a, b):
            raise AssertionError(f'{path}: tensor values differ')
    elif isinstance(a, dict):
        if a.keys() != b.keys():
            raise AssertionError(f'{path}: keys differ')
        for k in a:
            compare(a[k], b[k], f'{path}.{k}')
    elif isinstance(a, (tuple, list)):
        if len(a) != len(b):
            raise AssertionError(f'{path}: lengths differ')
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, f'{path}[{i}]')
    elif a != b:
        raise AssertionError(f'{path}: {a!r} != {b!r}')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('uninterrupted')
    p.add_argument('resumed')
    args = p.parse_args()
    a = torch.load(args.uninterrupted, map_location='cpu', weights_only=True)
    b = torch.load(args.resumed, map_location='cpu', weights_only=True)
    compare(a, b)
    print('PASS: model, optimizer, scaler, RNG, epoch and configuration are exactly equal.')
