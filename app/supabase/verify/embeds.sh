#!/usr/bin/env bash
#
# Catch PostgREST embed ambiguity before it reaches production.
#
# WHY THIS EXISTS
# ---------------
# Sign-in broke in production and neither replay.sh nor rls.sql could have caught it.
# Both talk to Postgres directly; this failure lives one layer up, in PostgREST resolving
# an embedded select.
#
# `profile_teams` has THREE foreign keys back to `profiles` — profile_id, plus created_by
# and updated_by from the audit quartet every table carries. PostgREST refuses to guess
# which one `profile_teams(...)` means and returns PGRST201. The query that decides
# whether somebody is signed in went through that embed, so nobody could sign in.
#
# The schema was correct throughout. Every database-level check passed. That is exactly
# what makes this class worth a check of its own: the tests that exist cannot see it.
#
# WHAT IT CHECKS
# --------------
# Two foreign keys from one table to the same parent make every unqualified embed of that
# table ambiguous. The audit quartet guarantees at least two — created_by and updated_by —
# on every table that has it, so this is not a rare shape here. It is the default one.
#
# So: find every ambiguous pair in the schema, then find every embed in the repository,
# and fail if an embed of an ambiguous table does not name its constraint.
#
# Usage:  ./embeds.sh          (expects replay.sh to have run)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# Overridable so the check can be pointed at a deliberately-broken copy and
# watched to FAIL. A check nobody has seen fail is not evidence of anything.
REPO="${LOFTY_REPO_FILE:-$HERE/../../src/data/supabaseRepository.ts}"
PORT="${LOFTY_PG_PORT:-5433}"
HOST="${LOFTY_PG_HOST:-/var/tmp}"
PSQL="psql -h $HOST -p $PORT -U postgres -d lofty_verify -tAq"

echo "--- PostgREST embed ambiguity ---"

# Strip // line comments and /* */ blocks, so an embed named in prose is not mistaken for
# one the app actually issues. Naive on purpose: a `//` inside a string literal would be
# stripped too, which can only ever produce a MISSED warning in this file's usage, never
# a false one — and a false alarm is what makes a check get ignored.
CODE=$(python3 -c "
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
s = re.sub(r'^\s*//.*$', '', s, flags=re.M)
s = re.sub(r'^\s*\*.*$', '', s, flags=re.M)
print(s)
" "$REPO")

# Every (child, parent) pair joined by more than one foreign key. An embed of such a
# child, from that parent, must name which constraint it means.
AMBIGUOUS=$($PSQL -c "
  select c.conrelid::regclass::text
  from pg_constraint c
  join pg_class p on p.oid = c.confrelid
  join pg_namespace n on n.oid = p.relnamespace
  where c.contype = 'f' and n.nspname = 'public'
  group by c.conrelid, c.confrelid
  having count(*) > 1
  order by 1;" | sort -u)

if [ -z "$AMBIGUOUS" ]; then
  echo "ok  no table has two foreign keys to the same parent"
  exit 0
fi

echo "tables reachable by more than one foreign key from a single parent:"
echo "$AMBIGUOUS" | sed 's/^/      /'
echo

FAILED=0
for tbl in $AMBIGUOUS; do
  # An embed looks like `tbl(` inside a select string. A SAFE one is `tbl!constraint(`
  # or `tbl!constraint!inner(`. Anything else is PostgREST guessing, which it will not do.
  #
  # Scanned against CODE, not the raw file. The first version of this check flagged two
  # false positives — the comment above explaining this very bug, and a commented-out
  # query — which is how a checker starts being ignored. Comments are stripped first.
  #
  # `[^!_a-zA-Z]` before the name so a qualified `tbl!fk(` is not counted as bare, and so
  # `profile_teams(` does not match inside a longer identifier ending in the same word.
  BARE=$(echo "$CODE" | grep -oE "[^!_a-zA-Z]${tbl}\(" 2>/dev/null | wc -l | tr -d ' ')
  QUALIFIED=$(echo "$CODE" | grep -oE "${tbl}![a-z_]+" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$BARE" -gt 0 ]; then
    echo "FAIL: ${tbl} is embedded $BARE time(s) without naming a foreign key."
    echo "      PostgREST will return PGRST201 and the query will fail at runtime."
    $PSQL -c "
      select '        candidates: ' || string_agg(conname, ' | ' order by conname)
      from pg_constraint
      where conrelid = '${tbl}'::regclass and contype = 'f';"
    FAILED=1
  elif [ "$QUALIFIED" -gt 0 ]; then
    echo "ok  ${tbl} is embedded $QUALIFIED time(s), each naming its foreign key"
  fi
done

# ---------------------------------------------------------------------------
# And the names themselves. Naming a foreign key is only protection if the name is
# real — `profiles!comments_comment_createdby_fkey` (one underscore short) passes the
# count above and returns PGRST200 at runtime. Every name written after a `!` has to
# be a constraint the database actually has.
NAMED=$(echo "$CODE" | grep -oE '[a-z_]+![a-z_]+' | grep -v '!inner' | cut -d'!' -f2 | sort -u)
for con in $NAMED; do
  FOUND=$($PSQL -c "select count(*) from pg_constraint where conname = '${con}';" | tr -d ' ')
  if [ "$FOUND" = "0" ]; then
    echo "FAIL: the embed names constraint '${con}', which does not exist."
    FAILED=1
  fi
done
if [ -n "$NAMED" ] && [ "$FAILED" -eq 0 ]; then
  echo "ok  every named constraint in an embed exists ($(echo "$NAMED" | wc -l | tr -d ' ') checked)"
fi

if [ "$FAILED" -ne 0 ]; then
  echo
  echo "An embed of a table with several foreign keys to the same parent must say which"
  echo "one it means:  profile_teams!profile_teams_profile_id_fkey(...)"
  exit 1
fi

echo "ok  every embed of an ambiguous table names its foreign key"
