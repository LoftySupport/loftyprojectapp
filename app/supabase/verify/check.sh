#!/usr/bin/env bash
#
# Replay every migration into a throwaway database, then prove the schema BEHAVES.
#
# replay.sh only proves the DDL applies. That is not the same as it being right: a
# constraint that rejects nothing, a trigger that stamps the wrong column and a view
# that reads the wrong join all apply perfectly cleanly.
#
# behaviour.sql   — the things that must work: keys, sequences, renumbering, triggers
# constraints.sql — the things that must be refused. Each one reports "ok" when the
#                   database rejects it and "FAIL" when it does not, so a constraint
#                   that has quietly stopped biting shows up as a line of output rather
#                   than as silence.
#
# Usage:  ./check.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${LOFTY_PG_PORT:-5433}"
HOST="${LOFTY_PG_HOST:-/var/tmp}"

"$HERE/replay.sh" || exit 1

PSQL="psql -h $HOST -p $PORT -U postgres -d lofty_verify -q"
echo
$PSQL -f "$HERE/behaviour.sql"   || { echo "BEHAVIOUR CHECKS FAILED"; exit 1; }
echo
$PSQL -f "$HERE/constraints.sql" 2>&1 | grep -E "NOTICE|WARNING|^---" | sed 's/^psql.*NOTICE:  //; s/^psql.*WARNING:  //'

OUT=$($PSQL -f "$HERE/constraints.sql" 2>&1)
if grep -q "FAIL:" <<<"$OUT"; then
  echo; echo "A CONSTRAINT DID NOT BITE — see the FAIL line above."; exit 1
fi

# Count them. An unhandled exception inside the DO block aborts every remaining probe,
# and the output simply stops — which read as success until it was noticed that three of
# seventeen checks had run. A harness that can quietly test less than it claims is worse
# than no harness, because it is trusted.
# Count PROBES, not messages: a probe reports either "ok" or "note", and two of them
# carry both strings (one per branch), so counting messages in the source double-counts.
EXPECTED=$(grep -c "^  BEGIN$" "$HERE/constraints.sql")
# $OUT still carries psql's "psql:file:line: NOTICE:  " prefix; strip it the same way
# the display line above does before counting.
ACTUAL=$(sed 's/^psql.*NOTICE:  //; s/^psql.*WARNING:  //' <<<"$OUT" | grep -cE "^(ok |note:)")
if [ "$ACTUAL" -lt "$EXPECTED" ]; then
  echo; echo "ONLY $ACTUAL OF $EXPECTED CONSTRAINT CHECKS RAN — the block aborted early."
  echo "$OUT" | tail -5
  exit 1
fi
# The layer above Postgres. replay.sh, behaviour.sql and rls.sql all talk to the
# database directly, and the outage on 2026-08-21 lived in PostgREST resolving an
# embedded select — a correct schema that the API could not query. This is the only check
# here that looks at that seam.
"$HERE/embeds.sh" || { echo; echo "EMBEDS WOULD FAIL AT RUNTIME — see above."; exit 1; }

# The layer above that again: lists the app holds in TypeScript that must agree with lists
# the database holds in rows. Five property definitions named a stage that does not exist
# and simply did not render — no error, no empty state, a heading that counted eleven above
# a table of six. Nothing here talks to Postgres about DDL; it compares two sets of strings
# that have no reason to stay equal except that somebody remembered.
echo
"$HERE/seeds.sh" || { echo; echo "A SEEDED LOOKUP DISAGREES WITH THE DATABASE — see above."; exit 1; }

# The security boundary, as a real signed-in user rather than as the owner.
echo
RLS=$($PSQL -f "$HERE/rls.sql" 2>&1 | sed 's/^psql.*NOTICE:  //; s/^psql.*WARNING:  //')
echo "$RLS" | grep -vE "^(SET|RESET|UPDATE|GRANT|INSERT)"
# ERROR as well as FAIL: rls.sql runs with ON_ERROR_STOP, so a broken probe aborts the
# file rather than reporting — and an abort carries no "FAIL:" line, which read as a pass
# until it was noticed the output had simply stopped early.
if grep -qE "FAIL:|ERROR:" <<<"$RLS"; then
  echo; echo "AN RLS PROBE FAILED OR ABORTED — see the FAIL/ERROR line above."; exit 1
fi

echo; echo "SCHEMA APPLIES AND BEHAVES ($ACTUAL constraint checks, all biting; RLS holds; embeds resolve; seeds agree)"
