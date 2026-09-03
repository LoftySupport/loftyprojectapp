# Phase B — importing the jobs

Two generations of tooling live here. The first (the template) was built before Amber
grouped the jobs herself; the second (the generator) reads her grouping. Both are kept:
the template is still the right shape for a *future* batch nobody has grouped yet.

## The generator — `generate-jobs-import.py`

```
python3 generate-jobs-import.py --report   # what it decided and refused; writes nothing
python3 generate-jobs-import.py            # writes ../migrations/0087_the_jobs_workbook_of_31_august.sql
```

Source: `lofty-jobs-grouped-by-project-2026-08-31.xlsx` — Amber's grouping of the old
system's CERTIFICATION tab: 801 job rows, 121 projects numbered 1001–1121, sequences
`01, 02…` inside each, the old job number beside every row, and a Method tab saying how the
grouping was done. The generator regroups nothing.

It emits one `import_staging_jobs` row (0086) per sheet row, carrying the sheet row
**verbatim** as jsonb and, beside it, a **spine** jsonb of what the row means for
addresses, projects and jobs — with the original beside anything it normalised, and a
`skip_reason` where it refused. The rules are at the top of the script; the short version:

- project number and sequence from the sheet; `project_type` is `residential` for every
  row (Amber, 2 Sep: *retail* is residential with an external client, *development* is
  residential) — the client type is kept for Phase C;
- `#61` → `61`; a suburb is resolved against the SA postcode list (`Happy valley` → `Happy
  Valley`, one explicit alias `Mitchel Park` → `Mitchell Park`); a suburb the sheet failed
  to split off (`Grandview Grove Sturt`) is recognised from the street cell's tail;
- `Lot 12` → the address's lot number; `Res 3` → the address's second line; a lot only in
  the site cell (`Res 1 , Lot 311 (portion of lot 232) Dankie Rd`) is read from there;
- postcode from the SA list; council from the same list the app uses (`saSuburbs.ts`),
  none for a suburb the app treats as ambiguous;
- `OTR - Community Title = Yes` → `title_type community`; `No` → nothing, because *not
  community* is not the same statement as *torrens*;
- five rows with no address at all are staged with a `skip_reason` and make no job.

It does **not** load anything. `import_spine()` does, and takes the decisions the sheet
cannot make as parameters with no defaults. Amber made them on 2–3 September (`0088`,
and `schema-plan.md` → *3 September — the decisions*); the live call is:

```sql
select * from import_spine(
  'Lofty_Jobs_Grouped_by_Project.xlsx · project import',
  'acquisition_development',            -- the team when the named person is not a user in one team
  'Acquisition & Development',          -- the stage, unless the stage map says otherwise
  1011,                                 -- workbook 1001 → 1011; the nine hand-made projects stay
  '{"cancelling": "cancelled", "on hold": "on_hold"}',   -- the status word → job status
  '{"cancelling": "Cancelled"}',        -- the status word → lifecycle stage
  'S · Sales Consultant',               -- the sheet column naming the person whose team owns the job
  'omit');                              -- shared old numbers: carried by no job, kept on the row
```

`private.import_team_for_person()` is the team rule on its own: the one active user whose
first name and surname initial match, when they are in exactly one team; otherwise the
fallback. Seven old numbers are shared by several rows; `'refuse'` (the default) stops the
load and names them, `'label'` appends the sheet's lot label (`1288 · Lot 1`), `'omit'`
carries none.

`unimport_spine()` removes exactly what a load made — jobs and their children, their
addresses, and the projects the audit shows the import inserted — and clears the stamps.
The staging rows stay; Phase C reads them again for property values.

The migration is 1.2 MB. That is 801 rows × 194 columns of source kept verbatim, and it is
the record of what was imported; nothing is trimmed to make the file smaller.

## The template — `lofty-job-import-template.xlsx`

`build_template.py` generates it; edit the script, not the workbook, so the dropdowns stay
the database's own lists rather than a copy that drifted.

```
python3 build_template.py
```

It is for reconstructing **projects** by hand. The old system has no project key, its job
numbers are a flat sequence, and nothing in them says which jobs share a site — a person
who knows the sites has to group them, and the `site_group` column is where that judgement
goes. Two traps, both spelled out on the sheet's first tab: a job in the wrong group
silently inherits the wrong council, the wrong developer and the wrong site facts; and
`lot_sequence` follows lot order, not old-number order, because the sequence becomes the
job number, which goes on contracts.

Its dropdowns are checked against the database by `verify/seeds.sh`, because the sheet
once went on offering nine lifecycle stages after `0035` replaced them with five.

## Not in the spine

Contract values, dates and statuses beyond the job's own, client names, the CMA and sales
consultant — those are property values and parties, and they stay in the staging row's
verbatim jsonb until Phase C.
