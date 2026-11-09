#!/bin/sh
set -eu
export LC_ALL=C
work=$(mktemp -d /tmp/infra-pitr.XXXXXX)
port=55531

cleanup() {
    for name in source named latest missing; do
        if [ -f "$work/$name/postmaster.pid" ]; then
            pg_ctl -D "$work/$name" -m immediate -w stop >&2 || true
        fi
    done
    rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

meta() { printf 'META\t%s\t%s\n' "$1" "$2"; }

sql() {
    node=$1
    shift
    psql -X -A -t -v ON_ERROR_STOP=1 -h "$work/sock-$node" -p "$port" -d postgres "$@"
}

start() {
    node=$1
    extra=$2
    mkdir "$work/sock-$node"
    pg_ctl -D "$work/$node" -l "$work/$node.log" -t 20 \
        -o "-k $work/sock-$node -p $port -c listen_addresses='' $extra" -w start >/dev/null
}

wait_writable() {
    for _ in $(seq 1 75); do
        if [ "$(sql "$1" -c 'SELECT NOT pg_is_in_recovery();' 2>/dev/null || true)" = t ]; then
            return 0
        fi
        sleep 0.2
    done
    cat "$work/$1.log" >&2
    return 1
}

state() {
    node=$1
    label=$2
    sql "$node" -c 'CHECKPOINT;' >/dev/null
    value=$(sql "$node" -c "
        SELECT json_build_object(
            'balance', a.balance,
            'ledger', (SELECT COALESCE(json_agg(seq ORDER BY seq), '[]'::json) FROM ledger),
            'deltas', (SELECT COALESCE(json_agg(amount ORDER BY seq), '[]'::json) FROM ledger),
            'in_recovery', pg_is_in_recovery(),
            'timeline', (pg_control_checkpoint()).timeline_id,
            'system_identifier', (pg_control_system()).system_identifier::text
        ) FROM account a WHERE a.id=1;")
    printf 'STATE\t%s\t%s\n' "$label" "$value"
}

restore() {
    mode=$1
    archive=$2
    cp -R "$work/base" "$work/$mode"
    touch "$work/$mode/recovery.signal"
    {
        printf "restore_command = 'cp %s/%%f %%p'\n" "$archive"
        printf "recovery_target_timeline = '1'\n"
        if [ "$mode" != latest ]; then
            printf "recovery_target_name = 'after_t103'\nrecovery_target_action = 'promote'\n"
        fi
    } >> "$work/$mode/postgresql.auto.conf"
}

mkdir "$work/archive"
initdb -D "$work/source" --wal-segsize=1 --no-locale -A trust >/dev/null
start source "-c archive_mode=on -c archive_command='cp %p $work/archive/%f'"
meta postgres_version "$(sql source -c 'SHOW server_version;')"
sql source -c '
    CREATE TABLE account (id int PRIMARY KEY, balance int NOT NULL);
    CREATE TABLE ledger (seq int PRIMARY KEY, amount int NOT NULL);
    INSERT INTO account VALUES (1,100);' >/dev/null
state source base

pg_basebackup -h "$work/sock-source" -p "$port" -D "$work/base" -Fp -X stream
pg_verifybackup "$work/base" >/dev/null
meta backup_verified true
sql source -c 'SELECT pg_switch_wal();' >/dev/null
for delta in '101 10' '102 20' '103 -5'; do
    seq=${delta% *}
    change=${delta#* }
    sql source -c "
        BEGIN;
        UPDATE account SET balance=balance+($change) WHERE id=1;
        INSERT INTO ledger VALUES($seq,$change);
        COMMIT;" >/dev/null
done
point=$(sql source -c "SELECT pg_create_restore_point('after_t103');")
meta point_lsn "$point"
target=$(sql source -c "SELECT pg_walfile_name('$point'::pg_lsn);")
meta target_segment "$target"
sql source -c '
    BEGIN;
    UPDATE account SET balance=0 WHERE id=1;
    INSERT INTO ledger VALUES(104,-125);
    COMMIT;' >/dev/null
tail_wal=$(sql source -c 'SELECT pg_walfile_name(pg_current_wal_lsn());')
meta last_segment "$tail_wal"
sql source -c 'SELECT pg_switch_wal();' >/dev/null
for _ in $(seq 1 75); do
    if [ -s "$work/archive/$target" ] && [ -s "$work/archive/$tail_wal" ]; then
        break
    fi
    sleep 0.2
done
test -s "$work/archive/$target" && test -s "$work/archive/$tail_wal"
meta target_segment_bytes "$(wc -c < "$work/archive/$target" | tr -d ' ')"
meta target_segment_sha256 "$(sha256sum "$work/archive/$target" | cut -d ' ' -f1)"
meta last_segment_sha256 "$(sha256sum "$work/archive/$tail_wal" | cut -d ' ' -f1)"
state source primary

for mode in named latest; do
    restore "$mode" "$work/archive"
    start "$mode" "-c archive_mode=off -c hot_standby=off"
    wait_writable "$mode"
    state "$mode" "$mode"
    history="$work/$mode/pg_wal/00000002.history"
    meta "${mode}_fork_lsn" "$(awk '$1 == 1 { print $2; exit }' "$history")"
    if [ "$mode" = named ]; then
        sql named -c '
            BEGIN;
            UPDATE account SET balance=balance+5 WHERE id=1;
            INSERT INTO ledger VALUES(105,5);
            COMMIT;' >/dev/null
        state named named_after_write
    fi
    pg_ctl -D "$work/$mode" -m fast -w stop >/dev/null
done
state source primary_after

cp -R "$work/archive" "$work/gap"
rm "$work/gap/$target"
test ! -e "$work/gap/$target"
test ! -e "$work/base/pg_wal/$target"
restore missing "$work/gap"
start missing "-c archive_mode=off -c hot_standby=off" 2>/dev/null || true
error='recovery ended before configured recovery target was reached'
for _ in $(seq 1 75); do
    if grep -q "$error" "$work/missing.log"; then
        break
    fi
    if sql missing -c 'SELECT 1;' >/dev/null 2>&1; then
        echo "The missing-WAL restore unexpectedly accepted SQL connections." >&2
        exit 1
    fi
    sleep 0.2
done
grep -q "$error" "$work/missing.log"
if sql missing -c 'SELECT 1;' >/dev/null 2>&1; then
    exit 1
fi
meta missing_error "$error"
