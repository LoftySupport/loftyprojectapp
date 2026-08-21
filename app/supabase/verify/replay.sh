#!/usr/bin/env bash
#
# Rebuild the database from migrations, in file order, and stop at the first failure.
#
# Why this exists: `supabase db reset` needs Docker, which is not always available, and
# a migration set that cannot replay from nothing is one nobody can rebuild from. This
# runs the same check against a throwaway local Postgres instead.
#
# It is NOT a substitute for Supabase. supabase-shim.sql stands in for what Supabase
# provides before 0001 runs — the auth schema, auth.uid(), and the anon/authenticated/
# service_role roles — so what is verified here is that the DDL applies in order, not
# that RLS behaves as it will in production.
#
# Usage:  ./replay.sh            (expects a local postgres on the port below)
#
set -uo pipefail
PORT="${LOFTY_PG_PORT:-5433}"
HOST="${LOFTY_PG_HOST:-/var/tmp}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL="psql -h $HOST -p $PORT -U postgres -q -v ON_ERROR_STOP=1"

$PSQL -c "drop database if exists lofty_verify;" -c "create database lofty_verify;" >/dev/null 2>&1 || {
  echo "Could not reach postgres at $HOST:$PORT — start one first."; exit 1; }
$PSQL -d lofty_verify -f "$HERE/supabase-shim.sql" >/dev/null 2>&1
$PSQL -d lofty_verify -c "create extension if not exists pgcrypto; create extension if not exists pg_trgm;" >/dev/null 2>&1

cd "$HERE/../migrations" || exit 1
for f in $(ls *.sql | sort); do
  if ! out=$($PSQL -d lofty_verify -f "$f" 2>&1); then
    echo "FAILED: $f"
    echo "$out" | grep -E "ERROR|DETAIL" | head -4
    exit 1
  fi
done
echo "ALL MIGRATIONS APPLIED CLEANLY"
