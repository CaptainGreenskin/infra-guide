"""Local durable-history exercise with real process exits, not a Temporal SDK clone.

The interpreter matches activity id/name/order. Its rules are explicitly local.
Activities only read a fixture and render text. No model or remote write is called.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile


class ReplayMismatch(Exception):
    pass


class Runner:
    def __init__(self, database, source, stop='none'):
        self.db = sqlite3.connect(database)
        self.db.execute('CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, kind TEXT, payload TEXT)')
        self.audit = sqlite3.connect(str(database)+'.calls')
        self.audit.execute('CREATE TABLE IF NOT EXISTS calls(name TEXT)')
        self.source, self.stop, self.cursor = source, stop, 0
        if not self.events():
            self.append('started', {'definition_version': 1})

    def events(self):
        return [(seq, kind, json.loads(payload)) for seq, kind, payload
                in self.db.execute('SELECT seq,kind,payload FROM events ORDER BY seq')]

    def append(self, kind, payload):
        self.db.execute('INSERT INTO events(kind,payload) VALUES(?,?)',
                        (kind, json.dumps(payload, ensure_ascii=False)))
        self.db.commit()

    def activity(self, ident, name, args):
        history = self.events()
        commands = [p for _, k, p in history if k == 'scheduled']
        finished = any(k == 'finished' for _, k, _ in history)
        if self.cursor < len(commands):
            saved = commands[self.cursor]
            if (saved['id'], saved['name']) != (ident, name):
                raise ReplayMismatch('activity id/name/order differs from recorded command')
        else:
            if finished:
                raise ReplayMismatch('new command after a completed history')
            saved = {'id': ident, 'name': name, 'args': args}
            self.append('scheduled', saved)
        self.cursor += 1
        completed = [p for _, kind, p in history if kind == 'completed' and p['id'] == ident]
        if completed:
            return completed[0]['result']
        # This separate audit counts calls even if result recording later fails.
        self.audit.execute('INSERT INTO calls VALUES(?)', (name,)); self.audit.commit()
        if name == 'read_metrics':
            result = json.loads(Path(self.source).read_text(encoding='utf-8'))
        elif name == 'render_draft':
            result = 'A日报：总数'+str(saved['args']['total'])
        else:
            raise ValueError('unknown local activity')
        if self.stop == 'read-result' and name == 'read_metrics':
            os._exit(24)  # Call happened, but COMPLETED is not committed.
        self.append('completed', {'id': ident, 'result': result})
        if self.stop == 'read-completed' and name == 'read_metrics':
            os._exit(23)  # Recorded result survives this process exit.
        return result

    def run(self, incompatible=False, extra=False):
        result = self.activity('read-1', 'render_draft' if incompatible else 'read_metrics', {})
        draft = self.activity('draft-1', 'render_draft', {'total': result['total']})
        if extra:
            self.activity('draft-extra', 'render_draft', {'total': 0})
        commands = [p for _, kind, p in self.events() if kind == 'scheduled']
        if self.cursor != len(commands):
            raise ReplayMismatch('recorded commands were omitted by new code')
        if not any(kind == 'finished' for _, kind, _ in self.events()):
            self.append('finished', {'draft': draft})
        return draft


def observe(database):
    with sqlite3.connect(database) as db:
        events = [{'seq': seq, 'kind': kind, 'payload': json.loads(p)}
                  for seq, kind, p in db.execute('SELECT seq,kind,payload FROM events ORDER BY seq')]
    with sqlite3.connect(str(database)+'.calls') as db:
        calls = [name for (name,) in db.execute('SELECT name FROM calls')]
    return {'events': events, 'calls': calls}


def child(database, source, *flags):
    return subprocess.run([sys.executable, str(Path(__file__).resolve()), '--worker',
                           str(database), str(source), *flags], capture_output=True, text=True)


def main():
    with tempfile.TemporaryDirectory() as directory:
        directory = Path(directory)
        source, db = directory/'metrics.json', directory/'history.sqlite3'
        source.write_text('{"version":"v1","total":23}', encoding='utf-8')
        crashed = child(db, source, '--stop', 'read-completed')
        assert crashed.returncode == 23
        after_crash = observe(db)
        assert [e['kind'] for e in after_crash['events']] == ['started', 'scheduled', 'completed']
        source.write_text('{"version":"v2","total":999}', encoding='utf-8')
        resumed = child(db, source); assert resumed.returncode == 0, resumed.stderr
        assert json.loads(resumed.stdout)['draft'] == 'A日报：总数23'
        after_resume = observe(db)
        assert after_resume['calls'] == ['read_metrics', 'render_draft']
        replay = child(db, source); assert replay.returncode == 0, replay.stderr
        assert observe(db) == after_resume
        incompatible = child(db, source, '--incompatible')
        extra = child(db, source, '--extra')
        assert incompatible.returncode == extra.returncode == 4
        assert observe(db) == after_resume
        gap_db = directory/'gap.sqlite3'
        source.write_text('{"version":"v1","total":23}', encoding='utf-8')
        gap_crash = child(gap_db, source, '--stop', 'read-result')
        assert gap_crash.returncode == 24
        before_gap_resume = observe(gap_db)
        assert len(before_gap_resume['events']) == 2 and before_gap_resume['calls'] == ['read_metrics']
        source.write_text('{"version":"v2","total":999}', encoding='utf-8')
        gap_resume = child(gap_db, source); assert gap_resume.returncode == 0, gap_resume.stderr
        assert json.loads(gap_resume.stdout)['draft'] == 'A日报：总数999'
        gap = observe(gap_db)
        assert gap['calls'] == ['read_metrics', 'read_metrics', 'render_draft']
        print(json.dumps({'scope': 'local interpreter; no Temporal/LLM/remote side effect',
                          'recorded_result_exit_code': crashed.returncode, 'after_crash': after_crash,
                          'after_resume': after_resume, 'replay_added_events': 0, 'replay_added_calls': 0,
                          'incompatible_code_exit': incompatible.returncode, 'extra_command_exit': extra.returncode,
                          'unrecorded_result_exit_code': gap_crash.returncode,
                          'before_gap_resume': before_gap_resume, 'after_gap_resume': gap}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', nargs=2)
    parser.add_argument('--stop', choices=['none', 'read-result', 'read-completed'], default='none')
    parser.add_argument('--incompatible', action='store_true')
    parser.add_argument('--extra', action='store_true')
    args = parser.parse_args()
    if args.worker:
        try:
            runner = Runner(Path(args.worker[0]), Path(args.worker[1]), args.stop)
            print(json.dumps({'draft': runner.run(args.incompatible, args.extra)}, ensure_ascii=False))
        except ReplayMismatch as error:
            print(json.dumps({'error': str(error)})); sys.exit(4)
    else:
        main()
