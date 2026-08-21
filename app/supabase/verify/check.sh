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

if $PSQL -f "$HERE/constraints.sql" 2>&1 | grep -q "FAIL:"; then
  echo; echo "A CONSTRAINT DID NOT BITE — see the FAIL line above."; exit 1
fi
echo; echo "SCHEMA APPLIES AND BEHAVES"
