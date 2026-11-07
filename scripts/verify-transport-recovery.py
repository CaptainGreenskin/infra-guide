"""Bind actual local TCP execution and downloaded, verified CI environment results."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'dist/labs/transport-recovery'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--native-dir', required=True, type=Path)
    parser.add_argument('--ci-run', required=True, type=int)
    args = parser.parse_args()
    run = json.loads(subprocess.check_output([
        'gh', 'api', 'repos/CaptainGreenskin/infra-guide/actions/runs/' + str(args.ci_run)], text=True))
    assert run['conclusion'] == 'success' and run['status'] == 'completed'
    commit = run['head_sha']
    names = ['epoll_ready.py', 'mysql_restore.py', 'tcp_framing.py', 'socket_backpressure.py', 'Dockerfile.tools']
    for name in names:
        at_commit = subprocess.check_output(['git', 'show', commit + ':dist/labs/transport-recovery/' + name], cwd=ROOT)
        assert at_commit == (FOLDER / name).read_bytes(), name + ': changed after CI execution'
    native = {name: json.loads((args.native_dir / (name + '.json')).read_text()) for name in ['epoll', 'mysql']}
    for kind, source in [('epoll', 'epoll_ready.py'), ('mysql', 'mysql_restore.py')]:
        assert native[kind]['status'] == 'passed' and native[kind]['system'] == 'Linux'
        assert native[kind]['source_sha256'] == digest((FOLDER / source).read_bytes())
    assert native['mysql']['tools_dockerfile_sha256'] == digest((FOLDER / 'Dockerfile.tools').read_bytes())
    cases = native['epoll']['cases']
    assert cases['lt']['notification_without_new_write'] is True
    assert cases['et']['notification_without_new_write'] is False
    assert cases['et']['first_read'] + cases['et']['unread_then_drained'] == 'abcdef'
    assert cases['application_queue']['application_turns'] == ['ab', 'cd', 'ef', 'EAGAIN']
    assert cases['writable_interest']['write_notifications_in_three_polls'] == 3
    mysql = native['mysql']
    expected = {'baseline_only': 100, 'full_replay': 100 + 10 + 20 - 5 - 125 + 7,
                'missing_first_log': 125, 'point_in_time_recovery': 100 + 10 + 20 - 5,
                'post_restore_write': 100 + 10 + 20 - 5 + 3}
    for kind, balance in expected.items():
        assert mysql[kind]['balance'] == balance, kind
        if kind != 'missing_first_log':
            assert 100 + sum(delta for _, delta in mysql[kind]['operations']) == balance
    assert mysql['missing_first_log']['operations'] == [['T102', 20], ['T103', -5]]
    assert mysql['missing_first_log']['balance'] - (100 + 20 - 5) == mysql['missing_history_reconciliation_gap'] == 10
    assert mysql['point_in_time_recovery']['operations'] == [['T101', 10], ['T102', 20], ['T103', -5]]
    assert mysql['process_crash']['state_after_restart'] == mysql['full_replay']
    assert mysql['process_crash']['uncommitted_value'] == 999
    assert len(mysql['required_files']) == 2 and mysql['image_digests']
    local = {}
    for name in ['tcp_framing.py', 'socket_backpressure.py']:
        result = subprocess.run([sys.executable, '-B', str(FOLDER / name)], capture_output=True,
                                text=True, check=True, timeout=30)
        local[name] = json.loads(result.stdout)
    tcp = local['tcp_framing.py']
    assert tcp['wire_bytes'] == 2 * (4 + len('云上训练'.encode('utf-8'))) == 32
    assert tcp['server']['messages'] == ['云上训练', '恢复完成']
    assert sum(tcp['server']['recv_chunk_bytes']) == 32 and max(tcp['server']['recv_chunk_bytes']) <= 7
    assert tcp['server']['server_saw_eof_before_reply'] and tcp['reply_after_half_close'] == ['已接收2条']
    pressure = local['socket_backpressure.py']
    assert pressure['payload_bytes'] == pressure['received_bytes'] == 24 * 32768
    assert pressure['sha256'] == digest(b'infra-local-byte-stream\n' * 32768)
    files = {name: (FOLDER / name).read_text() for name in names + ['README.md']}
    record = {'status': 'passed', 'verified_at': '2026-11-07',
              'source_sha256': {name: digest(text.encode()) for name, text in files.items()},
              'ci': {'run_id': args.ci_run, 'url': run['html_url'], 'source_commit': commit,
                     'conclusion': run['conclusion'], 'workflow_path': run['path']},
              'local': {'system': platform.system(), 'python': platform.python_version(), 'results': local},
              'native': native,
              'scope': 'Actual local TCP and verified Linux CI epoll/MySQL. No packet-level TCP trace, '
                       'host power failure, replication, cloud database, throughput or production recovery claim.'}
    (FOLDER / 'validation.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    generated = 'const transportRecoveryFiles=' + json.dumps(files, ensure_ascii=False) + ';\n'
    generated += 'const transportRecoveryValidation=' + json.dumps(record, ensure_ascii=False) + ';\n'
    (ROOT / 'dist/transport-recovery-data.js').write_text(generated)
    archive = FOLDER.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as zipper:
        for name in sorted(files) + ['validation.json']:
            info = zipfile.ZipInfo(name, (2026, 11, 7, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zipper.writestr(info, (FOLDER / name).read_bytes())
    print('Bound four programs, one tool image recipe and README to verified executions; packaged exact bytes.')


if __name__ == '__main__':
    main()
