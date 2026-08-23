#!/usr/bin/env bash
#
# The app's seeded lookups against the database's.
#
# WHY THIS EXISTS
# ---------------
# Two lists that must agree, written in two places, with nothing that notices when they
# stop agreeing. Three of those got past review in a week:
#
#   Five of eleven seeded property definitions named a stage that does not exist —
#   "Sales & acquisition" with a lowercase a, "Preconstruction" without the hyphen. They
#   matched nothing and rendered nowhere, so Setup → Properties counted eleven in its
#   heading and listed six beneath it. Nothing failed. Site address was one of the five.
#
#   `listProjects` carried a commented-out query naming five pre-0028 column names. A
#   select list is a string; nothing type-checks it.
#
#   Eight data-dictionary entries marked `created` named view columns renamed by 0028 —
#   the reference document was wrong about the thing it exists to be right about.
#
#   The import spreadsheet's stage dropdown still offered the nine phases 0035 replaced
#   with five, and its example row used one of the seven the database now refuses. A wrong
#   dropdown is worse than a free-text box, because it reads as the list of permitted
#   answers.
#
# `listStages()` and `listTeams()` read the real tables now, but the stub still carries
# copies for a run with no backend, and `import/build_template.py` carries its own so the
# sheet builds without a database. None of those copies has a reason to stay correct except
# that somebody remembers. Everything below compares one of these pairs.
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
                       where table_schema = 'public';")

# The lists the import spreadsheet offers as dropdowns. Same pairs-that-must-agree problem
# as the stub's, one layer further out: build_template.py holds them as literals so the
# sheet can be built without a database, and nothing noticed when 0035 cut the lifecycle to
# five and left nine in the spreadsheet.
DB_ACTIVE_TEAMS=$($PSQL -c "select team_id || '|' || team_name from teams
                            where team_is_active order by team_position;")
DB_STATES=$($PSQL -c "select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
                      where t.typname = 'au_state' order by e.enumsortorder;")
DB_COUNCILS=$($PSQL -c "select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
                        where t.typname = 'sa_council' order by e.enumsortorder;")
# Anonymous inline checks, so they are found by what they mention rather than by name.
DB_JOB_STATUS_DEF=$($PSQL -c "select pg_get_constraintdef(oid) from pg_constraint
                              where conrelid = 'jobs'::regclass and contype = 'c'
                                and pg_get_constraintdef(oid) like '%job_status%';")
DB_PROJECT_TYPE_DEF=$($PSQL -c "select pg_get_constraintdef(oid) from pg_constraint
                                where conrelid = 'projects'::regclass and contype = 'c'
                                  and pg_get_constraintdef(oid) like '%project_type%';")

DB_STAGES="$DB_STAGES" DB_TEAMS="$DB_TEAMS" DB_COLUMNS="$DB_COLUMNS" \
DB_ACTIVE_TEAMS="$DB_ACTIVE_TEAMS" DB_STATES="$DB_STATES" DB_COUNCILS="$DB_COUNCILS" \
DB_JOB_STATUS_DEF="$DB_JOB_STATUS_DEF" DB_PROJECT_TYPE_DEF="$DB_PROJECT_TYPE_DEF" \
python3 - "$SRC" "$HERE/../import/build_template.py" <<'PY'
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

# 2 — the seeded lookups no longer name a stage at all.
#
#     There were three checks here: every property definition, template phase and
#     checkpoint group had to name a stage that exists, and the first of them was what
#     caught five definitions naming `"Sales & acquisition"` with a lowercase a. All three
#     are gone because their content is: the invented process was removed from the stub,
#     and the two lookups behind it now answer [] to match the database. Nothing is left to
#     drift. When `property_defs` becomes a real table the same rule returns as a foreign
#     key, enforced by Postgres rather than by a script.

# 3 — every column the repository asks PostgREST for is a column that exists.
#
#     `listProjects` carried a commented-out query for months naming `id`, `project_no`,
#     `current_address_id`, `status` and `created_at` — every one of them a pre-0028 name.
#     It read as the obvious next step and would have returned 42703 on the first request.
#     A select list is a string, so nothing type-checks it; this is what does.
repo = open(os.path.join(src, "supabaseRepository.ts")).read()
db_columns = set(c for c in os.environ["DB_COLUMNS"].splitlines() if c)

for const, table in (("PROJECT_COLUMNS", "projects"),
                     # job_display, not jobs: 0036 pointed the job reads at the view so a
                     # card could show its address, and three of the names in this list
                     # exist only there. Checked against what the repository actually
                     # queries — checking it against the table would pass for the wrong
                     # reason today and fail for the wrong reason tomorrow.
                     ("JOB_COLUMNS", "job_display"),
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

# 4 — the data dictionary against the schema it claims to describe.
#
#     The dictionary is partly a design document: an entry marked `to_do` describes a
#     column nobody has built, and that is the point of the status. An entry marked
#     `created` is an assertion that the column is there right now, and eight of them
#     were wrong — every one a view column renamed by 0028's prefix convention, so the
#     dictionary told you to select `job_display.job_number` from a view whose column is
#     `job_display.job_id`. Nothing failed; the reference was simply wrong, on the page
#     whose entire job is to be right about this.
dictionary = open(os.path.join(src, "dictionary.ts")).read()
dict_body = dictionary[dictionary.index("export const DICTIONARY: DictionaryEntry[] = ["):]

# Digits matter: addresses.address_street_1 and _2 are real columns, and a pattern of
# [a-z_] alone silently drops them — which reads as "fewer entries" rather than as a bug.
ID = r'[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*'
claims = re.findall(r'(?<![A-Za-z_])e\(\s*"(%s)"(.*?)\),\s*(?=\n)' % ID, dict_body, re.S)

created = []
for eid, rest in claims:
    quoted = re.findall(r'"((?:[^"\\]|\\.)*)"', rest)
    if quoted and quoted[-1] == "created":
        created.append(eid)

absent = [c for c in created if c not in db_columns]
check(
    f"all {len(created)} dictionary entries marked 'created' name a column that exists",
    not absent,
    "\n".join(f"{c} is documented as created and is not in the schema" for c in absent),
)

# Coverage is reported, not enforced. Writing a definition for a column is authoring work
# that needs somebody who knows what the column means, so a bare count failing the build
# would only ever be silenced. Printed so the number is visible rather than discovered.
documented = {eid for eid, _ in claims}
undocumented = sorted(c for c in db_columns if c not in documented)
print(
    f"note: {len(documented)} columns documented, {len(undocumented)} in the schema with "
    f"no entry (mostly tasks, variations, documents and comments, from 0030-0032)"
)


# 5 — the import spreadsheet's dropdowns against the database.
#
#     build_template.py holds its lists as literals so the sheet builds with no database
#     connection, and its own docstring says "verify/seeds.sh is what catches them
#     drifting" — which it did not, until this. 0035 cut the lifecycle from nine phases to
#     five and retyped job_stage to text with a check; the spreadsheet went on offering the
#     old nine, so seven of its stage values were ones the database would refuse, and the
#     example row shipped with one of them. A dropdown is worse than a free-text box when
#     it is wrong: it reads as the list of permitted answers.
tpl = open(sys.argv[2]).read()

def literals(name):
    """The quoted strings in a `NAME = [...]` list, in order.

    Brackets are counted rather than matched with a regex: STAGES and TEAMS close with a
    `]` in column 1 and STATUSES, STATES and PROJECT_TYPES close at the end of their one
    line, and a pattern anchored to either shape returns None for the other — which this
    reports as "cannot read the list" rather than as a mismatch, and would be read as a
    broken check rather than as a broken sheet."""
    m = re.search(r'^%s = \[' % name, tpl, re.M)
    if m is None:
        return None
    i, depth = m.end() - 1, 0
    for j in range(i, len(tpl)):
        if tpl[j] == "[":
            depth += 1
        elif tpl[j] == "]":
            depth -= 1
            if depth == 0:
                return re.findall(r'"((?:[^"\\]|\\.)*)"', tpl[i:j])
    return None

def constraint_values(env):
    """The quoted literals of an `x in (...)` check, in the order Postgres renders them."""
    return re.findall(r"'((?:[^']|'')*)'::text", os.environ[env])

# TEAMS is a list of (slug, label) pairs; the pairs flatten in order, so zip them back.
team_pairs = literals("TEAMS")
tpl_teams = list(zip(team_pairs[0::2], team_pairs[1::2])) if team_pairs else []
db_active_teams = [tuple(l.split("|", 1)) for l in os.environ["DB_ACTIVE_TEAMS"].splitlines() if l]

def env_lines(name):
    return [l for l in os.environ[name].splitlines() if l]

# Councils compare as sets: the enum's order is declaration order and a dropdown's is a
# presentation choice, so requiring them to agree would fail on a difference that is not
# a defect. Membership is the thing that decides whether a typed council is accepted.
tpl_councils = re.search(r'^COUNCILS = """(.*?)"""', tpl, re.S | re.M)
tpl_councils = tpl_councils.group(1).split("|") if tpl_councils else []
db_councils = env_lines("DB_COUNCILS")

for label, got, want, ordered in (
    ("stage",        literals("STAGES"),        env_lines("DB_STAGES"),                    True),
    ("state",        literals("STATES"),        env_lines("DB_STATES"),                    True),
    ("job_status",   literals("STATUSES"),      constraint_values("DB_JOB_STATUS_DEF"),    True),
    ("project_type", literals("PROJECT_TYPES"), constraint_values("DB_PROJECT_TYPE_DEF"),  True),
    ("owning_team",  tpl_teams,                 db_active_teams,                           True),
    ("council",      sorted(tpl_councils),      sorted(db_councils),                       False),
):
    if got is None:
        check(f"build_template.py declares a {label} list this can read", False)
        continue
    fmt = lambda xs: " | ".join(x if isinstance(x, str) else "=".join(x) for x in xs)
    # Long lists report the difference, not both sides. The councils are 68 each way, and
    # a one-council drift printed as two 68-item lines is a diff the reader has to do by
    # eye — which is how a failure gets skimmed past.
    if len(got) > 12 or len(want) > 12:
        # Only the councils take this path, and they are compared as sets — so a
        # difference here is always a membership difference and never an order one.
        detail = ("only in the sheet: " + (fmt(sorted(set(got) - set(want))) or "—")
                  + "\nonly in the database: " + (fmt(sorted(set(want) - set(got))) or "—"))
    else:
        detail = "sheet: " + fmt(got) + "\ndb:    " + fmt(want)
    check(
        f"the sheet's {len(got)} {label} values match the database"
        + (", in order" if ordered else " (as a set)"),
        got == want,
        detail,
    )

sys.exit(1 if failed else 0)
PY
