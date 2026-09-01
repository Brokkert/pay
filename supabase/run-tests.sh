#!/usr/bin/env bash
# Runs schema.sql + test.sql against a throwaway PostgreSQL, so you can check the
# security model without touching your real Supabase project. Needs a local
# PostgreSQL installation (postgresql-16 or newer).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="${PAY_PGDATA:-/var/tmp/pay-testdb}"
PORT="${PAY_PGPORT:-55433}"
SOCK=/tmp

cleanup() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$DATA"
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK" -l /tmp/pay-pg.log start >/dev/null
until psql -h "$SOCK" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1; do sleep 0.5; done

psql -h "$SOCK" -p "$PORT" -U postgres -q -c 'create database pay'
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d pay -v ON_ERROR_STOP=1 -q)

# client_min_messages=warning silences the "does not exist, skipping" noise from
# the drop-policy lines, while real errors still fail hard.
"${PSQL[@]}" -f "$HERE/local-stub.sql"
"${PSQL[@]}" -c 'set client_min_messages = warning' -f "$HERE/schema.sql"
"${PSQL[@]}" -f "$HERE/test.sql"

echo
echo "Done: schema loaded and every hard check passed."
