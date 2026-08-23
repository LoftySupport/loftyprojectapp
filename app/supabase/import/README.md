# Phase B — importing the live jobs

`lofty-job-import-template.xlsx` is the sheet Lofty fills in. `build_template.py`
generates it; edit the script, not the workbook, so the dropdowns stay the database's
own lists rather than a copy that drifted.

```
python3 build_template.py
```

## What the sheet is for

Reconstructing **projects**. That is the whole difficulty of this import and it is not a
technical one: the old system has no project key, its job numbers are a flat sequence,
and nothing in them says which jobs share a site — they are not even contiguous. A person
who knows the sites has to group them, and the `site_group` column is where that judgement
goes.

Two traps, both spelled out on the sheet's first tab:

- **A job in the wrong group is not a cosmetic error.** Project properties read through to
  every job, so it silently inherits the wrong council, the wrong developer and the wrong
  site facts, and nothing complains.
- **`lot_sequence` follows lot order, not old-number order.** Lofty's own example has them
  scrambled — Lot 3 is 12367, Lot 4 is 12356 — and the sequence becomes the job number,
  which goes on contracts.

Where a grouping is not confidently known, each job gets its own `site_group` and becomes a
single-job project. That asserts nothing nobody verified.

## What happens to it

The rows land in `import_staging_jobs` **verbatim**, as jsonb, before anything is created
from them. Phase B builds the spine from those rows; Phase C reads the *same* rows again
for property values once `property_defs` exists. Nobody re-exports anything, and the raw
source stays in the database as the record of what was imported.

`import_staging_jobs` is not built yet — it is specified in `schema-plan.md` under
"Loading jobs before properties exist".

## Checking it

Two things are checked rather than assumed, because both had already gone wrong once.

**The dropdowns are checked against the database** by `verify/seeds.sh`, which reads this
script's `STAGES`, `STATES`, `STATUSES`, `PROJECT_TYPES`, `TEAMS` and `COUNCILS` and
compares each with the live list — the lifecycle's stages, the `au_state` and `sa_council`
enums, the check constraints on `job_status` and `project_type`, and the active teams.
It exists because the sheet went on offering the nine lifecycle stages after `0035`
replaced them with five, so seven of its stage values were ones the database would refuse
on insert and the example row shipped with one of them. A wrong dropdown is worse than a
free-text box: it reads as the list of permitted answers.

**The `jobs_on_site` formula is checked by filling the sheet in and reading the result** —
four rows sharing a `site_group` read 4, two sharing another read 2, blank rows stay blank.
That matters because the column's whole job is to catch a miscoded group: a site you know
has four lots showing 3 is the error it is there to surface, and a formula that quietly
returned nothing would have removed the check while looking like it was there.

## Not in the sheet

Contract values, dates and statuses beyond the job's own — those are property values, and
`property_defs` does not exist. They stay in the staging row until Phase C.
