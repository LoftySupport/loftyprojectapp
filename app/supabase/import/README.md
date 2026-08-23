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

## Not in the sheet

Contract values, dates and statuses beyond the job's own — those are property values, and
`property_defs` does not exist. They stay in the staging row until Phase C.
