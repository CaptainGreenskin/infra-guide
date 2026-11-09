"""Run exact vLLM V1 allocator class nodes on CPU metadata, not a model or scheduler."""
import argparse
import ast
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
import hashlib
import json
import logging
from pathlib import Path
import platform
from types import SimpleNamespace
from typing import NewType, Optional, Union
from fetch_upstream import manifest, verify

SELECTED = {
    'kv_cache_utils.py': ['BlockHash', 'BlockHashWithGroupId', 'ExternalBlockHash',
                         'make_block_hash_with_group_id', 'get_block_hash', 'get_group_id',
                         'KVCacheBlock', 'FreeKVCacheBlockQueue'],
    'block_pool.py': ['BlockPool'],
}


def load_allocator(source_dir):
    # The only changed execution context is postponed type annotation evaluation.
    # No allocator node or function body is patched, replaced, or reconstructed.
    namespace = {'__name__': __name__, 'defaultdict': defaultdict, 'Iterable': Iterable,
                 'dataclass': dataclass, 'NewType': NewType, 'Optional': Optional,
                 'Union': Union, 'logger': logging.getLogger('vllm-block-lifecycle')}
    sources = []
    for entry in manifest()['files'][::-1]:  # utilities must be defined before BlockPool
        file = entry['name']
        raw = (source_dir / file).read_bytes()
        verify(raw, entry)
        source = raw.decode()
        tree = ast.parse(source)
        nodes, spans = [], []
        for node in tree.body:
            name = getattr(node, 'name', None)
            if isinstance(node, ast.Assign):
                name = node.targets[0].id if isinstance(node.targets[0], ast.Name) else None
            if name not in SELECTED[file]:
                continue
            nodes.append(node)
            first = min([node.lineno] + [d.lineno for d in getattr(node, 'decorator_list', [])])
            piece = '\n'.join(source.splitlines()[first - 1:node.end_lineno]) + '\n'
            spans.append({'name': name, 'first_line': first, 'last_line': node.end_lineno,
                          'sha256': hashlib.sha256(piece.encode()).hexdigest()})
        if [x['name'] for x in spans] != SELECTED[file]:
            raise ValueError('upstream node inventory differs')
        postponed = ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0)
        module = ast.Module(body=[postponed, *nodes], type_ignores=[])
        ast.fix_missing_locations(module)
        exec(compile(module, str(source_dir / file), 'exec'), namespace)
        sources.append({'file': file, 'sha256': hashlib.sha256(raw).hexdigest(), 'slices': spans})
    return namespace, sources


def run(namespace):
    pool = namespace['BlockPool'](num_gpu_blocks=4, enable_caching=True, enable_kv_cache_events=False)
    # A precomputed test key, not a claim about Request/token hashing or model computation.
    key = namespace['BlockHash'](hashlib.sha256(b'fixed-prefix-A').digest())
    rows = []

    def snapshot(stage):
        hit = pool.get_cached_block(key, [0])
        blocks = pool.blocks
        rows.append({'stage': stage, 'free_ids': [b.block_id for b in pool.free_block_queue.get_all_free_blocks()],
                     'free_count': pool.get_num_free_blocks(), 'usage': pool.get_usage(),
                     'refcounts': [b.ref_cnt for b in blocks], 'is_null': [b.is_null for b in blocks],
                     'hit_ids': None if hit is None else [b.block_id for b in hit],
                     'hashes': [None if b.block_hash is None else b.block_hash.hex() for b in blocks]})

    snapshot('initial')
    a = pool.get_new_blocks(1)
    # Supplying the smallest request data fixture is deliberate; full Request is not imported.
    pool.cache_full_blocks(SimpleNamespace(block_hashes=[key]), a, 0, 1, 4, 0)
    snapshot('A_cache_full_block')
    b = pool.get_cached_block(key, [0])
    pool.touch((b,))
    snapshot('B_touch_same_key')
    pool.free_blocks(a)
    snapshot('A_free')
    pool.free_blocks(b)
    snapshot('B_free')
    c = pool.get_cached_block(key, [0])
    snapshot('C_lookup_only')
    pool.touch((c,))
    snapshot('C_touch_idle_block')
    pool.free_blocks(c)
    snapshot('C_free')
    group_miss = pool.get_cached_block(key, [1]) is None
    other = pool.get_new_blocks(2)
    snapshot('allocate_preceding_free_ids')
    reused = pool.get_new_blocks(1)
    snapshot('reuse_cached_id_and_evict_hash')
    try:
        pool.get_new_blocks(1)
    except ValueError as error:
        rejection = {'type': type(error).__name__, 'message': str(error)}
    else:
        raise AssertionError('exhaustion must be rejected')
    snapshot('exhaustion_rejected')
    pool.free_blocks(other + reused)
    snapshot('final_cleanup')
    assert [b.block_id for b in reused] == [1] and group_miss
    assert rows[2]['refcounts'][1] == 2 and rows[3]['refcounts'][1] == 1
    assert rows[4]['hit_ids'] == [1] and rows[4]['free_ids'] == [2, 3, 1]
    assert rows[5]['free_ids'] == rows[4]['free_ids'] and rows[6]['free_ids'] == [2, 3]
    assert rows[9]['hit_ids'] is None and rows[9]['hashes'][1] is None
    return {'pool_slots': 4, 'usable_blocks': 3, 'null_block_id': 0, 'block_size_positions': 4,
            'key': key.hex(), 'group_id': 0, 'other_group_misses': group_miss,
            'events_enabled': False, 'trace': rows, 'exhaustion': rejection}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    namespace, upstream = load_allocator(args.source_dir.resolve())
    result = run(namespace)
    source = Path(__file__).resolve().parent
    record = {'status': 'passed', 'scope': 'exact upstream allocator AST; CPU metadata only',
              'full_vllm_import': False, 'scheduler_execution': False, 'device_kv_tensors': False,
              'engine_version': 'v0.10.2', 'upstream_commit': manifest()['commit'],
              'python': platform.python_version(), 'system': platform.system(), 'machine': platform.machine(),
              'source_sha256': {f: hashlib.sha256((source / f).read_bytes()).hexdigest()
                                for f in ['block_lifecycle.py', 'fetch_upstream.py', 'source-manifest.json']},
              'upstream': upstream, 'result': result}
    rendered = json.dumps(record, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered)


if __name__ == '__main__':
    main()
