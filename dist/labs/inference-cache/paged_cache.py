"""A real CPU block pool and deterministic two-layer causal attention.

Python 3.9+ standard library. No vLLM, model weights, GPU kernel or speed claim.
The independent full-prefix oracle does not call the incremental implementation.
"""
from collections import Counter, deque
from dataclasses import dataclass, field
import argparse
import json
import math


DOMAIN = ('toy-v1', 'position-v1', 'adapter-0', 'tenant-A')


def weighted(query, keys, values):
    scores = [query*k for k in keys]
    peak = max(scores)
    weights = [math.exp(s-peak) for s in scores]
    return sum(w*v for w, v in zip(weights, values))/sum(weights)


def step(token, position, history, domain):
    shift = .4 if domain[2] == 'adapter-1' else 0.
    k1, v1 = token*.13+position*.03+shift, token*.17-position*.02
    z = weighted(token*.11, [c[0] for c in history]+[k1],
                 [c[1] for c in history]+[v1])
    k2, v2 = z*.7+position*.05, z*.9+token*.02
    output = weighted(z*.8, [c[2] for c in history]+[k2],
                      [c[3] for c in history]+[v2])
    return (k1, v1, k2, v2), output


def reference(tokens, domain=DOMAIN):
    """Full two-layer causal recomputation, with its own loops and softmax."""
    shift = .4 if domain[2] == 'adapter-1' else 0.
    keys = [t*.13+i*.03+shift for i, t in enumerate(tokens)]
    values = [t*.17-i*.02 for i, t in enumerate(tokens)]
    hidden = []
    for i, token in enumerate(tokens):
        scores = [token*.11*keys[j] for j in range(i+1)]
        maximum = max(scores)
        exp = [math.exp(s-maximum) for s in scores]
        hidden.append(sum(exp[j]*values[j] for j in range(i+1))/sum(exp))
    keys2 = [.7*h+.05*i for i, h in enumerate(hidden)]
    values2 = [.9*h+.02*t for h, t in zip(hidden, tokens)]
    outputs = []
    for i, h in enumerate(hidden):
        scores = [.8*h*keys2[j] for j in range(i+1)]
        maximum = max(scores)
        weights = [math.exp(s-maximum) for s in scores]
        outputs.append(sum(weights[j]*values2[j] for j in range(i+1))/sum(weights))
    cells = list(zip(keys, values, keys2, values2))
    return cells, outputs


@dataclass(frozen=True)
class Handle:
    slot: int
    generation: int


@dataclass
class Block:
    generation: int = 0
    refs: int = 0
    cells: list = field(default_factory=list)
    key: object = None
    touched: int = 0


@dataclass
class Sequence:
    name: str
    domain: tuple
    tokens: list = field(default_factory=list)
    blocks: list = field(default_factory=list)
    last_output: object = None


class Pool:
    def __init__(self, blocks=4, size=4, unsafe_shared_write=False):
        self.size = size
        self.blocks = [Block() for _ in range(blocks)]
        self.prefixes, self.sequences = {}, {}
        self.clock = self.computed = self.reused = self.copies = 0
        self.evictions = 0
        self.unsafe_shared_write = unsafe_shared_write

    def resolve(self, handle):
        block = self.blocks[handle.slot]
        if block.generation != handle.generation:
            raise ValueError('stale_generation')
        return block

    def allocate(self):
        available = [(bool(b.key), b.touched, i) for i, b in enumerate(self.blocks) if b.refs == 0]
        if not available:
            raise MemoryError('all_blocks_referenced')
        _, _, slot = min(available)
        block = self.blocks[slot]
        old = Handle(slot, block.generation)
        if block.key:
            if self.prefixes.get(block.key) == old:
                del self.prefixes[block.key]
            self.evictions += 1
        block.generation += 1
        block.refs, block.cells, block.key = 1, [], None
        self.clock += 1
        block.touched = self.clock
        return Handle(slot, block.generation)

    def release(self, handle):
        block = self.resolve(handle)
        assert block.refs > 0
        block.refs -= 1
        if not block.refs and not block.key:
            block.cells = []

    def cells(self, seq):
        result = []
        for handle in seq.blocks:
            result.extend(self.resolve(handle).cells)
        return result[:len(seq.tokens)]

    def append(self, name, token):
        seq = self.sequences[name]
        position = len(seq.tokens)
        history = self.cells(seq)
        if position % self.size == 0:
            handle = self.allocate()
            seq.blocks.append(handle)
        else:
            handle = seq.blocks[-1]
            old = self.resolve(handle)
            if old.refs > 1 and not self.unsafe_shared_write:
                fresh = self.allocate()  # allocate before changing ownership
                self.resolve(fresh).cells = list(old.cells)
                self.release(handle)
                seq.blocks[-1] = fresh
                handle = fresh
                self.copies += 1
        block = self.resolve(handle)
        cell, output = step(token, position, history, seq.domain)
        block.cells.append(cell)
        seq.tokens.append(token)
        seq.last_output = output
        self.computed += 1
        self.clock += 1
        block.touched = self.clock
        if len(seq.tokens) % self.size == 0:
            block.key = (seq.domain, tuple(seq.tokens))
            self.prefixes[block.key] = handle
        return output

    def open(self, name, prompt, domain=DOMAIN):
        if name in self.sequences or not prompt:
            raise ValueError('bad_request')
        seq = self.sequences[name] = Sequence(name, tuple(domain))
        before = self.computed
        try:
            # A cached KV block is not the final next-token score. Leave at
            # least the last input to compute; block granularity may leave more.
            for end in range(self.size, len(prompt), self.size):
                handle = self.prefixes.get((seq.domain, tuple(prompt[:end])))
                if handle is None:
                    break
                block = self.resolve(handle)
                assert len(block.cells) == self.size
                block.refs += 1
                self.clock += 1
                block.touched = self.clock
                seq.blocks.append(handle)
                seq.tokens.extend(prompt[end-self.size:end])
                self.reused += self.size
            for token in prompt[len(seq.tokens):]:
                self.append(name, token)
        except Exception:
            self.close(name)
            raise
        return self.computed-before

    def fork(self, name, child):
        if child in self.sequences:
            raise ValueError('duplicate_child')
        parent = self.sequences[name]
        self.sequences[child] = Sequence(child, parent.domain, list(parent.tokens),
                                         list(parent.blocks), parent.last_output)
        for handle in parent.blocks:
            self.resolve(handle).refs += 1

    def close(self, name):
        seq = self.sequences.pop(name)
        for handle in seq.blocks:
            self.release(handle)
        return list(seq.tokens), seq.domain

    def audit(self):
        owners = Counter(h for seq in self.sequences.values() for h in seq.blocks)
        max_error = 0.
        for i, block in enumerate(self.blocks):
            assert block.refs == owners[Handle(i, block.generation)]
            assert 0 <= len(block.cells) <= self.size
        for seq in self.sequences.values():
            actual = self.cells(seq)
            expected, outputs = reference(seq.tokens, seq.domain)
            assert len(actual) == len(expected)
            for a, b in zip(actual, expected):
                error = max(abs(x-y) for x, y in zip(a, b))
                max_error = max(max_error, error)
                assert error < 1e-12, 'cached_cell_differs_from_full_prefix'
            if seq.last_output is not None:
                assert abs(seq.last_output-outputs[-1]) < 1e-12, 'output_differs_from_full_prefix'
        for key, handle in self.prefixes.items():
            block = self.resolve(handle)
            assert block.key == key and len(block.cells) == self.size
        return max_error

    def snapshot(self, label):
        self.audit()
        return {'event': label,
                'requests': {n: {'tokens': s.tokens[:], 'output': s.last_output,
                                 'blocks': [[h.slot, h.generation] for h in s.blocks]}
                             for n, s in self.sequences.items()},
                'physical': [{'slot': i, 'generation': b.generation, 'refs': b.refs,
                              'positions': len(b.cells), 'cached': b.key is not None}
                             for i, b in enumerate(self.blocks)],
                'computed_positions': self.computed, 'reused_positions': self.reused,
                'copies': self.copies, 'evicted_cached_blocks': self.evictions}


def pressure_case(unsafe=False):
    pool, trace = Pool(unsafe_shared_write=unsafe), []
    pool.open('A', [1, 2, 3, 4, 5, 6])
    pool.open('B', [1, 2, 3, 4, 7, 8])
    trace.append(pool.snapshot('A与B共享完整前缀'))
    stale = pool.sequences['B'].blocks[-1]
    pool.fork('A', 'C')
    pool.append('C', 9)
    if unsafe:
        pool.append('A', 8)  # exposes the overwritten shared tail to the oracle
    trace.append(pool.snapshot('C追加前先复制共享尾块'))
    before = [(b.refs, b.generation) for b in pool.blocks]
    try:
        pool.open('D', [9, 9, 9, 9])
    except MemoryError:
        rejected = 'all_blocks_referenced'
    else:
        raise AssertionError('overwrote a live block')
    assert before == [(b.refs, b.generation) for b in pool.blocks]
    pool.close('B')
    pool.open('D', [9, 9, 9, 9])
    try:
        pool.resolve(stale)
    except ValueError as error:
        stale_result = str(error)
    else:
        raise AssertionError('old generation read was accepted')
    trace.append(pool.snapshot('B释放后物理槽重用，旧句柄失效'))
    saved_a = pool.close('A')
    pool.close('C')
    for token in [9, 9, 9, 9]:
        pool.append('D', token)
    pool.open('E', [8]*8)
    assert (DOMAIN, (1, 2, 3, 4)) not in pool.prefixes
    trace.append(pool.snapshot('缓存引用归零后才可逐出'))
    pool.close('D')
    recomputed = pool.open('A-restored', *saved_a)
    assert recomputed == 6
    trace.append(pool.snapshot('恢复A需要重算已逐出的前缀'))
    for name in list(pool.sequences):
        pool.close(name)
    trace.append(pool.snapshot('全部完成后没有活动引用'))
    return {'block_size': 4, 'pool_blocks': 4, 'trace': trace,
            'rejected': rejected, 'stale_handle': stale_result,
            'restored_computed_positions': recomputed,
            'final_active_references': sum(b.refs for b in pool.blocks)}


def choose(output):
    return int(abs(output)*1000) % 10+1


def scheduler(policy):
    specs = [('A', 0, [1], 4)]+[(f'B{i}{j}', i, [2+j], 1)
                                for i in range(1, 9) for j in range(2)]
    pool, active, ready, completed, trace = Pool(32), {}, deque(), {}, []
    now = 0
    while len(completed) < len(specs):
        for name, arrival, prompt, count in specs:
            if arrival == now:
                pool.sequences[name] = Sequence(name, DOMAIN)
                active[name] = {'arrival': arrival, 'prompt': prompt, 'count': count,
                                'outputs': [], 'events': []}
                if policy == 'round-robin':
                    ready.append(name)
        if policy == 'prefill-first':
            chosen = sorted(active, key=lambda name: (bool(active[name]['outputs']),
                                                      active[name]['arrival'], name))[:2]
        else:
            chosen = [ready.popleft() for _ in range(min(2, len(ready)))]
        events = []
        for name in chosen:
            row, seq = active[name], pool.sequences[name]
            if not row['outputs']:
                token = row['prompt'][len(seq.tokens)]
            else:
                token = row['outputs'][-1]
            output = pool.append(name, token)
            if len(seq.tokens) >= len(row['prompt']):
                row['outputs'].append(choose(output))
                row['events'].append(now)
                events.append(name)
            if len(row['outputs']) == row['count']:
                pool.close(name)
                completed[name] = active.pop(name)
            elif policy == 'round-robin':
                ready.append(name)
        pool.audit()
        trace.append({'iteration': now, 'processed': chosen, 'emitted': events})
        now += 1
        assert now < 100
    for name, _, prompt, count in specs:
        tokens, outputs = list(prompt), []
        for _ in range(count):
            _, values = reference(tokens)
            token = choose(values[-1])
            outputs.append(token)
            tokens.append(token)
        assert completed[name]['outputs'] == outputs
    a = completed['A']['events']
    return {'policy': policy, 'work_positions': pool.computed, 'iterations': now,
            'A_output_iterations': a, 'A_max_output_gap': max(b-a for a, b in zip(a, a[1:])),
            'B81_first_output_wait': completed['B81']['events'][0]-8,
            'requests': {name: {'outputs': row['outputs'], 'events': row['events']}
                         for name, row in completed.items()},
            'completed_requests': len(completed), 'trace': trace}


def wrong_identity_probes():
    left, _ = reference([1, 2, 3, 4, 5, 6, 7, 8])
    right, expected = reference([9, 9, 9, 9, 5, 6, 7, 8])
    wrong = right[:4]+left[4:]
    q = (right[-1][2]-.05*7)/.7*.8
    wrong_output = weighted(q, [c[2] for c in wrong], [c[3] for c in wrong])
    assert abs(wrong_output-expected[-1]) > .01
    pool = Pool(8)
    pool.open('base', [1, 2, 3, 4, 5])
    alternate = (DOMAIN[0], DOMAIN[1], 'adapter-1', DOMAIN[3])
    before = pool.reused
    computed = pool.open('alternate', [1, 2, 3, 4, 5], alternate)
    assert pool.reused == before and computed == 5
    pool.audit()
    return {'wrong_block_tokens_only_output_error': abs(wrong_output-expected[-1]),
            'adapter_changed_reused_positions': pool.reused-before,
            'adapter_changed_computed_positions': computed}


def cow_exhaustion_probe():
    pool = Pool(1)
    pool.open('A', [1, 2])
    pool.fork('A', 'C')
    before = pool.snapshot('before')
    try:
        pool.append('C', 3)
    except MemoryError as error:
        result = str(error)
    else:
        raise AssertionError('shared tail was modified without free space')
    after = pool.snapshot('before')
    assert before == after, 'failed COW changed ownership or values'
    for name in list(pool.sequences):
        pool.close(name)
    pool.audit()
    return {'error': result, 'unchanged_snapshot': before,
            'final_active_references': sum(b.refs for b in pool.blocks)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--unsafe-shared-write', action='store_true')
    args = parser.parse_args()
    result = {'pressure': pressure_case(args.unsafe_shared_write),
              'identities': wrong_identity_probes(),
              'cow_exhaustion': cow_exhaustion_probe(),
              'schedulers': [scheduler('prefill-first'), scheduler('round-robin')],
              'scope': 'actual scalar CPU attention and block allocation; iterations are not GPU time'}
    assert result['schedulers'][0]['A_max_output_gap'] > result['schedulers'][1]['A_max_output_gap']
    assert all(s['work_positions'] == 20 and s['completed_requests'] == 17 for s in result['schedulers'])
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
