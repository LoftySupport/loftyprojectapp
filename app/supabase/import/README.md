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
and `docs/schema/schema-plan.md` → *3 September — the decisions*); the live call is:

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

## What stopped the live load, 3 September

The staging rows are on the live database and byte-identical to the replay (801 rows,
md5 `851f4495f40477395daf0f9d8a536a7d`), `0088` is applied, and its proof passed there.
The load itself has **not** run. It stopped on its first write, and rolled back whole:

```
duplicate key value violates unique constraint "jobs_job_number_old_key"
DETAIL: Key (job_number_old)=(1216 - D3) already exists.
```

The workbook holds seven of the nine hand-made projects again. They were entered in the
app before the workbook was grouped, and base 1011 was chosen to keep their numbers — but
nobody checked whether the sheet also contained them. It does:

| in the app | site | its jobs | in the workbook | its jobs | would land as |
| --- | --- | --- | --- | --- | --- |
| 1002 | 14 Brodie Road, Reynella | 3 | 1120 | 3 | 1129 |
| 1003 | 2A Launceston Ave, Warradale | 3 | 1121 | 3 | 1130 |
| 1004 | 27 Howard Street, Windsor Gardens | 4 | 1119 | 4 | 1128 |
| 1005 | 9 Riders Street, Seacombe Gardens | 4 | 1118 | 3 | 1127 |
| 1006 | 83A Awoonga Road, Hope Valley | 30 | 1117 | 30 | 1126 |
| 1009 | 3 Ross Street, Brighton | 3 | 1112 | 3 | 1121 |
| 1010 | 30 Luprena Avenue, Ingle Farm | 3 | 1005 | 3 | 1014 |

Project 1007 (2007 St Clair Ave, 16 jobs) and the empty 1008 are **not** in the workbook.

Two of the seven collide on the old job number — the app already carries `1216 - D1/D2/D3`
and `2347/2348/2349` — and that unique key is what stopped the load. The other five would
have gone in quietly as a second copy of the same site.

What the seven hold, beyond the jobs themselves: two comments (*"Job cancelled"* on 1010,
*"here is a test update"* on job 1002-001). No tasks, parties, staff roles, documents,
property values, process runs, variations or maintenance requests.

**This is Amber's decision, and the load waits on it.** Three ways:

1. **The workbook is the record.** Delete the seven hand-made projects, then load all 801
   rows: 116 projects, 796 jobs, one source for every site. Costs the two test comments
   and 50 hand-entered jobs that the sheet also holds.
2. **The app is the record for those seven.** Load everything except their rows: 109
   projects and about 747 jobs. Nothing is deleted; the seven staging groups stay unloaded
   for Phase C to read, and `import_spine()` gains a "skip these workbook projects"
   parameter.
3. **Keep both.** Load all 801 rows and let the seven sites exist twice, which needs the
   six colliding old numbers changed by hand first. Not recommended: nothing downstream
   would know which copy is the real one.

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
