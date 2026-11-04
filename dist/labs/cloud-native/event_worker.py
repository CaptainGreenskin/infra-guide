"""One-database inbox + report transaction; no remote API or cloud queue."""
import argparse
import hashlib
import json
import os
import sqlite3


def process(database, event, crash_after_commit=False):
    if set(event) != {'event_id', 'tenant', 'report'}:
        raise ValueError('expected event_id, tenant, report')
    if any(not isinstance(event[k], str) or not event[k] for k in event):
        raise ValueError('nonempty strings required')
    intent = json.dumps({'tenant': event['tenant'], 'report': event['report']},
                        sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    digest = hashlib.sha256(intent.encode()).hexdigest()
    connection = sqlite3.connect(database, timeout=5)
    connection.executescript('''
        CREATE TABLE IF NOT EXISTS inbox(
            event_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL,
            result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reports(
            event_id TEXT PRIMARY KEY, tenant TEXT NOT NULL, report TEXT NOT NULL);
    ''')
    try:
        connection.execute('BEGIN IMMEDIATE')
        row = connection.execute(
            'SELECT payload_hash, result FROM inbox WHERE event_id=?',
            (event['event_id'],)).fetchone()
        if row:
            if row[0] != digest:
                raise ValueError('same event_id with different intent')
            result = json.loads(row[1])
            duplicate = True
        else:
            result = {'event_id': event['event_id'], 'saved': True}
            connection.execute('INSERT INTO reports VALUES (?, ?, ?)',
                               (event['event_id'], event['tenant'], event['report']))
            connection.execute('INSERT INTO inbox VALUES (?, ?, ?)',
                               (event['event_id'], digest, json.dumps(result)))
            duplicate = False
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()
    if crash_after_commit:
        os._exit(23)  # Deliberately lose the response after durable local commit.
    return {'result': result, 'duplicate': duplicate}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--event', required=True)
    parser.add_argument('--crash-after-commit', action='store_true')
    args = parser.parse_args()
    with open(args.event, encoding='utf-8') as handle:
        event = json.load(handle)
    print(json.dumps(process(args.db, event, args.crash_after_commit)))

if __name__ == '__main__':
    main()
