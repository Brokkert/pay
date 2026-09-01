#!/usr/bin/env bash
# Draait schema.sql + test.sql tegen een wegwerp-PostgreSQL, zodat je het
# beveiligingsmodel kunt controleren zonder je echte Supabase-project aan te
# raken. Vereist een lokale PostgreSQL-installatie (postgresql-16 of nieuwer).
set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="${PAY_PGDATA:-/var/tmp/pay-testdb}"
PORT="${PAY_PGPORT:-55433}"
SOCK=/tmp

opruimen() { "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; }
trap opruimen EXIT

rm -rf "$DATA"
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK" -l /tmp/pay-pg.log start >/dev/null
until psql -h "$SOCK" -p "$PORT" -U postgres -c 'select 1' >/dev/null 2>&1; do sleep 0.5; done

psql -h "$SOCK" -p "$PORT" -U postgres -q -c 'create database pay'
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -d pay -v ON_ERROR_STOP=1 -q)

# client_min_messages=warning onderdrukt de "does not exist, skipping"-ruis van
# de drop-policy-regels, maar laat echte fouten wel hard falen.
"${PSQL[@]}" -f "$HIER/local-stub.sql"
"${PSQL[@]}" -c 'set client_min_messages = warning' -f "$HIER/schema.sql"
"${PSQL[@]}" -f "$HIER/test.sql"

echo
echo "Klaar: schema geladen en alle harde controles geslaagd."
