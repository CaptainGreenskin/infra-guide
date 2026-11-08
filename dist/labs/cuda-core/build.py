#!/usr/bin/env python3
"""Build the pinned Linux x86_64 CUDA lab and probe without launching kernels."""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

HERE = Path(__file__).resolve().parent
REDIST = 'https://developer.download.nvidia.com/compute/cuda/redist/'
CORE = ('cuda_lab.cu', 'reference.py', 'build.py', 'toolchain-lock.json')
COMPONENTS = {'cuda_nvcc', 'cuda_cudart', 'cuda_cccl'}
ENTRIES = {'row_sum_kernel', 'row_softmax_kernel', 'tiled_matmul_kernel'}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def core_hashes():
    return {name: sha256(HERE / name) for name in CORE}


def download(url, destination, expected_sha, expected_size=None, allow_network=True):
    """Every cached or downloaded byte is checked before use."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and sha256(destination) == expected_sha:
        if expected_size is None or destination.stat().st_size == expected_size:
            return destination
    require(allow_network, 'verified_archive_not_cached; use --fetch-toolkit:' + str(destination))
    partial = destination.with_name(destination.name + '.part')
    limit = expected_size if expected_size is not None else 5 * 1024 * 1024
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'InfraGuide-CUDA-pinned-build/1'})
            digest, size = hashlib.sha256(), 0
            with urllib.request.urlopen(request, timeout=90) as response, partial.open('wb') as output:
                for block in iter(lambda: response.read(1024 * 1024), b''):
                    size += len(block)
                    require(size <= limit, 'download_exceeds_locked_size:' + url)
                    digest.update(block)
                    output.write(block)
            require(expected_size is None or size == expected_size, 'download_size_mismatch:' + url)
            require(digest.hexdigest() == expected_sha, 'download_sha256_mismatch:' + url)
            partial.replace(destination)
            return destination
        except (OSError, ValueError):
            partial.unlink(missing_ok=True)
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def safe_extract(archive, destination, expected_root):
    """Inspect all paths first; allow only contained regular files and links.

    The inspected NVIDIA archives have one *-archive root and include/, lib/,
    bin/, nvvm/ trees. Their four library symlinks name same-directory basenames.
    No tarfile extraction method is used, and no write traverses a symlink.
    """
    destination = Path(destination)
    require(not destination.exists(), 'extraction_destination_exists')
    with tarfile.open(archive, 'r:xz') as tar:
        members = tar.getmembers()
        by_path, total = {}, 0
        for member in members:
            path = PurePosixPath(member.name)
            require(not path.is_absolute() and path.parts and path.parts[0] == expected_root
                    and '..' not in path.parts and '\\' not in member.name, 'unsafe_archive_path:' + member.name)
            require(path not in by_path, 'duplicate_archive_path:' + member.name)
            require(member.isdir() or member.isfile() or member.issym(), 'unsupported_archive_member:' + member.name)
            by_path[path] = member
            total += member.size
            require(total <= 2 * 1024 ** 3 and len(by_path) <= 100000, 'archive_expansion_limit')
            if member.issym():
                target = PurePosixPath(member.linkname)
                require(bool(member.linkname) and len(target.parts) == 1 and member.linkname not in ('.', '..')
                        and '/' not in member.linkname and '\\' not in member.linkname,
                        'archive_link_must_name_same_directory_file')
        for path, member in by_path.items():
            require(all(not by_path[parent].issym() for parent in path.parents if parent in by_path),
                    'archive_symlink_parent:' + str(path))
            if member.issym():
                visited, current = set(), path
                while by_path[current].issym():
                    require(current not in visited, 'cyclic_archive_link:' + str(path))
                    visited.add(current)
                    current = current.parent / by_path[current].linkname
                    require(current in by_path, 'dangling_archive_link:' + str(path))
                require(by_path[current].isfile(), 'archive_link_target_not_regular_file:' + str(path))
        destination.mkdir(parents=True)
        for path, member in by_path.items():
            target = destination.joinpath(*path.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(member.mode & 0o777)
        for path, member in by_path.items():
            if member.issym():
                target = destination.joinpath(*path.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(member.linkname)
    return {'archive_root': expected_root, 'members': len(members), 'regular_file_bytes': total,
            'relative_symlinks': sum(member.issym() for member in members)}


def archive_selftest():
    """Exercise the link graph, including a lexical-normalization escape."""
    rejected = []
    cases = {
        'linked_parent_escape': [('r/d/up', '..'), ('r/d/escape', 'up/../..')],
        'link_cycle': [('r/a', 'b'), ('r/b', 'a')],
        'dangling_link': [('r/a', 'missing')],
        'absolute_link': [('r/a', '/tmp/outside')],
    }
    with tempfile.TemporaryDirectory(prefix='cuda-archive-selftest-') as temporary:
        root = Path(temporary)
        for name, links in cases.items():
            archive = root / (name + '.tar.xz')
            with tarfile.open(archive, 'w:xz') as tar:
                for path, target in links:
                    member = tarfile.TarInfo(path)
                    member.type, member.linkname = tarfile.SYMTYPE, target
                    tar.addfile(member)
            try:
                safe_extract(archive, root / name, 'r')
            except ValueError:
                rejected.append(name)
            else:
                raise ValueError('archive_selftest_accepted:' + name)
        archive = root / 'valid-chain.tar.xz'
        with tarfile.open(archive, 'w:xz') as tar:
            member = tarfile.TarInfo('r/lib.so.1.0')
            member.size = 1
            tar.addfile(member, io.BytesIO(b'x'))
            for path, target in [('r/lib.so.1', 'lib.so.1.0'), ('r/lib.so', 'lib.so.1')]:
                member = tarfile.TarInfo(path)
                member.type, member.linkname = tarfile.SYMTYPE, target
                tar.addfile(member)
        safe_extract(archive, root / 'valid-chain', 'r')
        require((root / 'valid-chain/r/lib.so').read_bytes() == b'x', 'archive_selftest_valid_chain_failed')
    return {'status': 'passed', 'device_execution': False, 'mutations_rejected': rejected,
            'same_directory_chain_accepted': True}


def merge_tree(source, destination):
    """Merge the verified include/lib trees without replacing different files."""
    destination.mkdir(parents=True, exist_ok=True)
    for child in source.iterdir():
        target = destination / child.name
        if child.is_symlink():
            if target.is_symlink():
                require(os.readlink(target) == os.readlink(child), 'merge_symlink_collision:' + str(target))
            else:
                require(not target.exists(), 'merge_path_collision:' + str(target))
                target.symlink_to(os.readlink(child))
        elif child.is_dir():
            require(not target.is_symlink() and (not target.exists() or target.is_dir()), 'merge_directory_collision')
            merge_tree(child, target)
        else:
            require(not target.is_symlink(), 'merge_file_symlink_collision')
            if target.exists():
                require(target.is_file() and sha256(target) == sha256(child), 'merge_file_collision:' + str(target))
            else:
                shutil.copy2(child, target)


def command(argv, record, output_dir, label, accepted=(0,), env=None):
    entry = {'label': label, 'argv': [str(x) for x in argv], 'shell_display': shlex.join([str(x) for x in argv])}
    record['commands'].append(entry)
    result = subprocess.run(entry['argv'], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=600, env=env)
    entry.update({'returncode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    (output_dir / (label + '.log')).write_text(result.stdout + result.stderr)
    require(result.returncode in accepted, 'command_failed:' + label + ':' + str(result.returncode))
    return result


def build(args, record, output_dir):
    record['archive_safety_selftest'] = archive_selftest()
    cpu_path = output_dir / 'cpu-selftest.json'
    command([sys.executable, '-B', HERE / 'reference.py', '--self-test', '--json', cpu_path],
            record, output_dir, 'cpu-selftest')
    record['cpu_selftest'] = json.loads(cpu_path.read_text())
    require(record['cpu_selftest']['device_execution'] is False, 'selftest_claimed_device_execution')
    if args.host_selftest:
        record.update(status='host-selftest-passed', compilation={'status': 'not-run', 'reason': 'host-selftest option'})
        return 0
    if platform.system() != 'Linux' or platform.machine().lower() not in ('x86_64', 'amd64'):
        record.update(status='not-run', compilation={'status': 'not-run', 'reason': 'requires Linux x86_64'})
        return 2
    lock = json.loads((HERE / 'toolchain-lock.json').read_text())
    require(lock['cuda_release'] == '12.9.1' and lock['target'] == 'linux-x86_64', 'unexpected_toolchain_target')
    require(set(lock['components']) == COMPONENTS, 'unexpected_toolkit_components')
    require(lock['manifest_url'] == REDIST + 'redistrib_12.9.1.json', 'unexpected_manifest_url')
    cache = args.cache_dir.resolve()
    manifest_path = download(lock['manifest_url'], cache / 'redistrib_12.9.1.json', lock['manifest_sha256'],
                             allow_network=args.fetch_toolkit)
    manifest = json.loads(manifest_path.read_text())
    require(manifest['release_label'] == '12.9.1', 'manifest_release_mismatch')
    toolkit = cache / ('toolkit-' + record['core_sha256']['toolchain-lock.json'])
    record['toolkit'] = {'release': lock['cuda_release'], 'target': lock['target'],
                         'manifest_url': lock['manifest_url'], 'manifest_sha256': sha256(manifest_path),
                         'components': {}}
    # A new staging directory avoids trusting a pre-existing extracted toolchain.
    with tempfile.TemporaryDirectory(prefix='cuda-stage-', dir=cache) as temporary:
        stage = Path(temporary)
        merged = stage / 'merged'
        merged.mkdir()
        for name in sorted(COMPONENTS):
            component = lock['components'][name]
            official = manifest[name][lock['target']]
            require(all(str(component[key]) == str(official[key]) for key in ('relative_path', 'sha256', 'size')),
                    'component_manifest_mismatch:' + name)
            relative = PurePosixPath(component['relative_path'])
            require(not relative.is_absolute() and '..' not in relative.parts
                    and relative.parts[:2] == (name, lock['target']) and relative.name.endswith('.tar.xz'),
                    'unsafe_component_url:' + name)
            archive = download(REDIST + str(relative), cache / relative.name,
                               component['sha256'], int(component['size']), allow_network=args.fetch_toolkit)
            root_name = relative.name[:-len('.tar.xz')]
            extracted = stage / name
            layout = safe_extract(archive, extracted, root_name)
            root = extracted / root_name
            licenses = merged / 'licenses' / name
            licenses.mkdir(parents=True)
            for child in list(root.iterdir()):
                if child.name.upper().startswith('LICENSE'):
                    child.rename(licenses / child.name)
            merge_tree(root, merged)
            record['toolkit']['components'][name] = dict(component, version=manifest[name]['version'], **layout)
        if toolkit.exists():
            shutil.rmtree(toolkit)
        merged.rename(toolkit)
    for relative in ('bin/nvcc', 'bin/ptxas', 'nvvm/bin/cicc', 'nvvm/libdevice/libdevice.10.bc',
                     'include/cuda_runtime.h', 'lib/libcudart_static.a', 'lib/libcudadevrt.a'):
        require((toolkit / relative).is_file(), 'toolkit_missing:' + relative)
    nvcc = toolkit / 'bin/nvcc'
    gxx = shutil.which(args.host_compiler)
    require(gxx is not None, 'missing_host_compiler:' + args.host_compiler)
    env = dict(os.environ)
    env['PATH'] = str(toolkit / 'bin') + os.pathsep + env.get('PATH', '')
    record['nvcc_version'] = command([nvcc, '--version'], record, output_dir, 'nvcc-version', env=env).stdout
    require('release 12.9' in record['nvcc_version'] and 'V12.9.86' in record['nvcc_version'], 'nvcc_version_mismatch')
    record['gcc_version'] = command([gxx, '--version'], record, output_dir, 'gcc-version', env=env).stdout
    source = HERE / 'cuda_lab.cu'
    common = [nvcc, '-std=c++17', '-O2', '-lineinfo', '--compiler-bindir', gxx,
              '-I' + str(toolkit / 'include'), '-L' + str(toolkit / 'lib'),
              '-DGUIDE_SOURCE_SHA256="' + record['core_sha256']['cuda_lab.cu'] + '"']
    binary, ptx = output_dir / 'cuda_lab', output_dir / 'cuda_lab.ptx'
    command(common + ['--cudart=static', '-gencode=arch=compute_80,code=sm_80',
                      '-gencode=arch=compute_80,code=compute_80', source, '-o', binary],
            record, output_dir, 'compile-binary', env=env)
    command(common + ['--ptx', '-arch=compute_80', source, '-o', ptx],
            record, output_dir, 'compile-ptx', env=env)
    entries = set(re.findall(r'\.entry\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(', ptx.read_text()))
    require(ENTRIES <= entries, 'missing_ptx_kernel_entry')
    require(all(name.encode() in binary.read_bytes() for name in ENTRIES), 'missing_binary_kernel_name')
    record['compilation'] = {'status': 'passed', 'binary': {'path': binary.name, 'sha256': sha256(binary),
                              'bytes': binary.stat().st_size, 'targets': ['sm_80', 'compute_80']},
                             'ptx': {'path': ptx.name, 'sha256': sha256(ptx), 'bytes': ptx.stat().st_size,
                                     'target': 'compute_80', 'verified_entries': sorted(ENTRIES)}}
    help_result = command([binary, '--help'], record, output_dir, 'binary-help', env=env)
    require('--probe-only' in help_result.stdout and '13 small GPU correctness fixtures' in help_result.stdout,
            'binary_help_mismatch')
    probe_path = output_dir / 'device-probe.json'
    probe_result = command([binary, '--probe-only', '--json', probe_path], record, output_dir,
                           'device-probe', accepted=(0, 2), env=env)
    probe = json.loads(probe_path.read_text())
    require(probe.get('device_execution') is False, 'probe_claimed_kernel_execution')
    require(probe.get('source_sha256') == record['core_sha256']['cuda_lab.cu'], 'probe_source_mismatch')
    require(type(probe.get('device_count')) is int and probe['device_count'] >= 0, 'invalid_probe_count')
    require((probe_result.returncode == 0 and probe.get('status') == 'device-detected' and probe['device_count'] > 0)
            or (probe_result.returncode == 2 and probe.get('status') == 'not-run'), 'invalid_probe_result')
    record['device_probe'] = dict(probe, returncode=probe_result.returncode)
    record['status'] = 'passed'
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=Path('build'))
    parser.add_argument('--cache-dir', type=Path, default=Path.home() / '.cache/infra-guide/cuda-core')
    parser.add_argument('--host-compiler', default='g++')
    parser.add_argument('--fetch-toolkit', action='store_true', help='Download locked official components if not already cached')
    parser.add_argument('--host-selftest', action='store_true', help='Run only the CPU oracle self-test on any host')
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    record = {'schema_version': 1, 'status': 'started', 'device_execution': False,
              'started_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'host': {'system': platform.system(), 'machine': platform.machine(), 'python': platform.python_version()},
              'core_sha256': core_hashes(), 'commands': [],
              'scope': 'Pinned CUDA compilation, CPU oracle self-test, executable help and availability probe only; no kernels launched.'}
    try:
        exit_code = build(args, record, output_dir)
        require(core_hashes() == record['core_sha256'], 'core_files_changed_during_build')
    except (OSError, ValueError, subprocess.SubprocessError, KeyError, tarfile.TarError) as error:
        record.update(status='failed', error=type(error).__name__ + ': ' + str(error))
        exit_code = 1
    record['finished_at_utc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    destination = output_dir / 'build-record.json'
    destination.write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'status': record['status'], 'device_execution': False, 'record': str(destination)}))
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
