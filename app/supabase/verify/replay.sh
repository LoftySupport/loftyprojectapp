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
# ---------------------------------------------- what production has and the repo cannot
# `trg_login_activity_auth_users` lives on auth.users, which belongs to
# supabase_auth_admin — 0008 explains why no migration here can create it, and says
# outright that on a rebuild from empty it will not exist.
#
# That gap is exactly where sign-in broke after the 0028 rename: the trigger fires on
# every sign-in, its function still named two pre-rename columns, and nothing in this
# harness ran it. Every table-level check passed while nobody could get a session.
#
# So the shim creates it here, after the migrations have defined the function. Locally we
# are superuser and may; the point is that this throwaway database should differ from
# production as little as possible, and least of all in the auth path.
$PSQL -d lofty_verify -c "
  drop trigger if exists trg_login_activity_auth_users on auth.users;
  create trigger trg_login_activity_auth_users
    after insert or update on auth.users
    for each row execute function log_login_activity_from_auth_users();" >/dev/null 2>&1

echo "ALL MIGRATIONS APPLIED CLEANLY"
