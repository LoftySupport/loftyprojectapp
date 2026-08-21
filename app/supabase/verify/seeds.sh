#!/usr/bin/env bash
#
# The app's seeded lookups against the database's.
#
# WHY THIS EXISTS
# ---------------
# Five of the eleven seeded property definitions named a stage that does not exist —
# "Sales & acquisition" with a lowercase a, "Preconstruction" without the hyphen,
# "Construction & execution". `groupByStage` intersects definitions against the live stage
# list, so those five matched nothing and rendered nowhere. Setup → Properties counted
# eleven in its heading and listed six beneath it. Nothing failed; the fields just were
# not there, and site address was one of them.
#
# That is the shape of the whole class: two lists that must agree, written in two files,
# with nothing that notices when they stop agreeing. The intersect is correct and should
# stay — a definition pointing at a stage that does not exist must not render under one
# that does — so the check has to live outside it.
#
# The same argument applies one level out. `listStages()` and `listTeams()` are still
# answered from TypeScript constants while `pipeline_stages` and `teams` hold the real
# rows. Today the two match exactly. Nothing enforces that, so this compares them against
# the replayed database and fails when they drift.
#
# Usage:  ./seeds.sh          (expects replay.sh to have run)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${LOFTY_SRC_DIR:-$HERE/../../src/data}"
PORT="${LOFTY_PG_PORT:-5433}"
HOST="${LOFTY_PG_HOST:-/var/tmp}"
PSQL="psql -h $HOST -p $PORT -U postgres -d lofty_verify -tAq"

echo "--- seeded lookups vs the database ---"

DB_STAGES=$($PSQL -c "select pipeline_stage_name from pipeline_stages ps
                      join pipelines p using (pipeline_id)
                      where p.pipeline_key = 'build_lifecycle'
                      order by ps.pipeline_stage_position;")
DB_TEAMS=$($PSQL -c "select team_id from teams order by team_position;")

if [ -z "$DB_STAGES" ] || [ -z "$DB_TEAMS" ]; then
  echo "FAIL: the database returned no stages or no teams — is replay.sh run?"
  exit 1
fi

DB_COLUMNS=$($PSQL -c "select table_name || '.' || column_name
                       from information_schema.columns
                       where table_schema = 'public'
                         and table_name in ('projects', 'jobs', 'profiles');")

DB_STAGES="$DB_STAGES" DB_TEAMS="$DB_TEAMS" DB_COLUMNS="$DB_COLUMNS" python3 - "$SRC" <<'PY'
import os, re, sys

src = sys.argv[1]
stub = open(os.path.join(src, "stubRepository.ts")).read()
types = open(os.path.join(src, "types.ts")).read()

def block(text, marker):
    """The literal that follows `marker`, up to whichever closer comes first.

    The four declarations this reads close four different ways — `];`, `] as const;` and
    `};` — so taking the earliest match is the only version that does not need a table of
    special cases that would itself go stale."""
    i = text.index(marker)
    ends = [text.find(c, i) for c in ("\n];", "\n] as const;", "\n};")]
    end = min(e for e in ends if e != -1)
    return text[i:end]

# SEED_STAGES — name in pipeline order, as written.
seed_stages = re.findall(r'name:\s*"([^"]+)"', block(stub, "export const SEED_STAGES"))

# TEAM_SEED — the slug, which is the foreign key.
seed_teams = re.findall(r'id:\s*"([^"]+)"', block(types, "export const TEAM_SEED"))

# Every stage a property definition claims to be captured at.
defs = block(stub, "export const SEED_PROPERTY_DEFS")
prop_pairs = re.findall(r'key:\s*"([^"]+)"[^}]*?stageName:\s*"([^"]+)"', defs)

# Every stage a template phase and a checkpoint claim.
phase_stages = re.findall(r'\[\s*"([^"]+)",\s*\[', block(stub, "const PHASES"))
checkpoint_stages = re.findall(r'^\s*"([^"]+)":\s*\[', block(stub, "const CHECKPOINTS"), re.M)

db_stages = [s for s in os.environ["DB_STAGES"].splitlines() if s]
db_teams = [t for t in os.environ["DB_TEAMS"].splitlines() if t]

failed = False

def check(label, ok, detail=""):
    global failed
    if ok:
        print(f"ok  {label}")
    else:
        print(f"FAIL: {label}")
        if detail:
            for line in detail.splitlines():
                print(f"      {line}")
        failed = True

# 1 — the seeds agree with the database, in order.
check(
    f"{len(seed_stages)} seeded stages match pipeline_stages, in position order",
    seed_stages == db_stages,
    "seed: " + " | ".join(seed_stages) + "\ndb:   " + " | ".join(db_stages),
)
check(
    f"{len(seed_teams)} seeded team slugs match teams, in position order",
    seed_teams == db_teams,
    "seed: " + " | ".join(seed_teams) + "\ndb:   " + " | ".join(db_teams),
)

# 2 — everything that names a stage names one that exists. This is the one that was
#     failing silently, and it is checked against the DATABASE's list rather than the
#     seed's, so it stays honest even if both TypeScript lists drift together.
known = set(db_stages)

for label, named in (
    ("property definitions", [(k, s) for k, s in prop_pairs]),
    ("template phases", [(s, s) for s in phase_stages]),
    ("checkpoint groups", [(s, s) for s in checkpoint_stages]),
):
    bad = [f"{who} → {stage!r}" for who, stage in named if stage not in known]
    check(
        f"all {len(named)} {label} name a stage that exists",
        not bad,
        "\n".join(bad),
    )

# 3 — every column the repository asks PostgREST for is a column that exists.
#
#     `listProjects` carried a commented-out query for months naming `id`, `project_no`,
#     `current_address_id`, `status` and `created_at` — every one of them a pre-0028 name.
#     It read as the obvious next step and would have returned 42703 on the first request.
#     A select list is a string, so nothing type-checks it; this is what does.
repo = open(os.path.join(src, "supabaseRepository.ts")).read()
db_columns = set(c for c in os.environ["DB_COLUMNS"].splitlines() if c)

for const, table in (("PROJECT_COLUMNS", "projects"),
                     ("JOB_COLUMNS", "jobs"),
                     ("PROFILE_COLUMNS", "profiles")):
    m = re.search(r'const %s =\s*\n\s*"([^"]+)"' % const, repo)
    if not m:
        check(f"{const} is a single string literal postgrest-js can read", False)
        continue
    # Strip embeds — `profile_teams!fk(team_id, ...)` names another table's columns, and
    # embed resolution is embeds.sh's job, not this one.
    select = re.sub(r'[a-z_]+![a-z_]+\([^)]*\)', '', m.group(1))
    names = [n.strip() for n in select.split(",") if n.strip()]
    missing = [n for n in names if f"{table}.{n}" not in db_columns]
    check(
        f"all {len(names)} columns in {const} exist on {table}",
        not missing,
        "\n".join(f"{table}.{n} does not exist" for n in missing),
    )

sys.exit(1 if failed else 0)
PY
