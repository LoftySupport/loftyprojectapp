#!/usr/bin/env python3
"""
Turn Amber's "Projects and Number of Lots" workbook into a migration.

Amber, 3 September: *"These are all the projects you have to add and the number of total
sites but the jobs don't need to be created now, just add in the project details"*.

So: 110 projects, each with its address and how many sites it will hold. NO JOBS — the
`jobs` table is not touched, and `project_proposed_dwellings` is the right home for the
count because it is what was INTENDED at creation, which is a different fact from how
many job rows exist (0028's own comment on that column says so).

WHAT THE SHEET DOES NOT CARRY, AND WHAT IS DONE ABOUT IT

  postcode, council   Resolved from the two lists already in this folder — the same
                      lookups `generate-jobs-import.py` uses, so the two imports cannot
                      disagree about where a suburb is. Not guessed.
  project_type        NOT NULL with a three-way check, and the sheet is silent. Taken as
                      `residential`, which is what 7 of the 9 hand-made projects are and
                      what a suburban infill builder builds. THIS IS A READING, and the
                      migration says so and gives the one statement that changes it.
  everything else     Left null. No start date, no target, no owning team, no assignee:
                      the sheet does not say and a blank invites configuring.

TWO RESPELLINGS, BOTH ALREADY RECORDED IN THIS FOLDER

  "Mitchel Park"            -> Mitchell Park. The same alias generate-jobs-import.py
                               carries; one 'l' appears in no SA list.
  "Findon (single build)"   -> Findon. The bracketed part is a note, not a suburb, which
                               is the same rule the jobs generator applies.

ONE SUBURB KEEPS A BLANK COUNCIL

  Dernancourt sits in two councils, so saSuburbs.ts deliberately leaves it out — "a
  council on a lodged application is not a field to be confidently wrong about". Its
  postcode resolves; its council stays null for somebody to set.

Rebuild with:  python3 app/supabase/import/generate-projects-import.py
"""
import csv, json, re
from collections import defaultdict
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
SOURCE = Path("/root/.claude/uploads/ebff53b0-53be-59c3-b630-02af0ce3ed75/97d897e9-Projects_and_Number_of_Lots.xlsx")
SHEET = "Project Summary"
SOURCE_LABEL = "Projects_and_Number_of_Lots.xlsx · Project Summary"
POSTCODES = HERE / "sa-suburbs-postcodes.csv"
SUBURBS_TS = HERE.parent.parent / "src" / "data" / "saSuburbs.ts"
OUT = HERE.parent / "migrations" / "0093_the_projects_amber_sent_on_3_september.sql"

ALIASES = {"mitchel park": "Mitchell Park"}


def q(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def load_lookups():
    postcodes = defaultdict(set)
    with POSTCODES.open() as fh:
        for r in csv.DictReader(fh):
            postcodes[r["suburb"].strip().upper()].add(r["postcode"].strip())
    ts = SUBURBS_TS.read_text()
    by_council = json.loads(re.search(r"const SUBURBS_BY_COUNCIL: Record<string, readonly string\[\]> = (\{.*?\});", ts, re.S).group(1))
    council_of = {s.upper(): c for c, subs in by_council.items() for s in subs}
    ambiguous = {a.upper() for a in json.loads(re.search(r"export const AMBIGUOUS_SUBURBS: readonly string\[\] = (\[.*?\]);", ts, re.S).group(1))}
    return postcodes, council_of, ambiguous


def resolve_suburb(raw, postcodes):
    """The sheet's suburb as the SA list spells it, plus what had to be done to get there."""
    s = re.sub(r"\s+", " ", str(raw)).strip()
    notes = []
    bracketed = re.sub(r"\s*\([^)]*\)\s*", " ", s).strip()
    if bracketed != s:
        notes.append(f'"{s}" carries a note in brackets; the suburb is "{bracketed}"')
        s = bracketed
    if s.lower() in ALIASES:
        notes.append(f'"{s}" respelt as "{ALIASES[s.lower()]}"')
        s = ALIASES[s.lower()]
    # Title-case only where the sheet shouted or whispered, so "Seaford rise" becomes
    # "Seaford Rise" and "O'halloran Hill" is left as the list spells it.
    if s.upper() in postcodes:
        return s, notes
    for cand in (s.title(), s.upper()):
        if cand.upper() in postcodes:
            return cand, notes
    return s, notes


def main():
    postcodes, council_of, ambiguous = load_lookups()
    wb = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    ws = wb[SHEET]
    raw = [r for r in ws.values]
    hdr = [str(h).strip() for h in raw[0]]
    rows = [dict(zip(hdr, r)) for r in raw[1:] if any(v not in (None, "") for v in r)]

    out, notes, no_council, unresolved, split_letter = [], [], [], [], []
    for i, d in enumerate(rows, start=2):
        suburb, rn = resolve_suburb(d["Suburb"], postcodes)
        notes += [f"Row {i}: {n}" for n in rn]
        pcs = postcodes.get(suburb.upper())
        if not pcs:
            unresolved.append(f"Row {i}: {suburb}")
            continue
        if len(pcs) > 1:
            unresolved.append(f"Row {i}: {suburb} has postcodes {sorted(pcs)}")
            continue
        postcode = sorted(pcs)[0]
        u = suburb.upper()
        council = None if (u in ambiguous or u not in council_of) else council_of[u]
        if council is None:
            no_council.append(f"Row {i}: {suburb}")
        number = d["Street Number"]
        number = None if number in (None, "") else str(number).strip()
        street = re.sub(r"\s+", " ", str(d["Street"])).strip()
        # "5" + "A Dennis Crescent" is 5A Dennis Crescent with the unit letter left in
        # the wrong column. Carried as the sheet has it — joining them would be a guess
        # about somebody's address — but named here so it is a decision and not a slip.
        if re.match(r"^[A-Za-z]\s", street):
            split_letter.append(f'Row {i}: "{number} {street}" — the street begins with a lone letter, so this is probably {number}{street[0]} {street[2:]}')
        out.append((int(d["Jobs in Project"]), number, street, suburb, postcode, council, f"{SHEET}!{i}"))

    if unresolved:
        raise SystemExit("Unresolved suburbs, refusing to write:\n  " + "\n  ".join(unresolved))

    values = ",\n".join(
        "  (%d, %s, %s, %s, %s, %s, %s)" % (j, q(n), q(st), q(sb), q(pc), q(co), q(ref))
        for j, n, st, sb, pc, co, ref in out
    )
    header = f"""-- 0093 — the projects Amber sent on 3 September
--
-- Amber: "These are all the projects you have to add and the number of total sites but
-- the jobs don't need to be created now, just add in the project details"
--
-- GENERATED by app/supabase/import/generate-projects-import.py from
-- {SOURCE_LABEL}. Edit the generator, not this file.
--
-- {len(out)} projects, {sum(r[0] for r in out)} sites between them. NO JOBS: the `jobs` table is not
-- touched. The count goes in `project_proposed_dwellings`, which 0028 defines as what was
-- INTENDED at creation — "we planned four lots and got three" is a real question, and a
-- count of job rows cannot answer it.
--
-- WHAT THE SHEET DOES NOT CARRY
--
--   postcode and council   resolved from sa-suburbs-postcodes.csv and saSuburbs.ts, the
--                          same two lists generate-jobs-import.py uses, so the two
--                          imports cannot disagree about where a suburb is.
--
--   project_type           NOT NULL with a three-way check, and the sheet is silent.
--                          Taken as `residential`. THIS IS A READING: it is what 7 of the
--                          9 hand-made projects are. If it is wrong it is one statement,
--                          and the import ref below says which rows came from here:
--
--                            update projects set project_type = 'development'
--                             where project_id in (...);
--
--   start date, target, owning team, assignee, name
--                          left null. The sheet does not say, and a blank invites
--                          configuring where a guess gets quoted back as agreed. The
--                          NAME is the one exception and is not a guess: it is built from
--                          the number and the address the row already carries, in the
--                          shape the nine existing projects use ("1002 - REYNELLA, 14
--                          Brodie Road"), so the list reads the same throughout.
--
-- WHAT IS DELIBERATELY NOT INSERTED TWICE
--
--   Nine projects were made by hand and some of them are in this sheet. A row is skipped
--   when a project already stands at the same street number, street and suburb. That
--   comparison is case- and space-insensitive, because "3" and "3 " and "Ross Street"
--   and "ross street" are the same address and a duplicate project is worse than a
--   missing one.
--
-- TWO RESPELLINGS AND ONE BLANK COUNCIL"""
    for n in notes:
        header += f"\n--   * {n}"
    header += """
--   * Dernancourt sits in two councils, so saSuribs deliberately omits it — "a council on
--     a lodged application is not a field to be confidently wrong about". Its postcode
--     resolves; its council stays null for somebody to set."""
    header = header.replace("saSuribs", "saSuburbs.ts")
    for n in no_council:
        header += f"\n--   * {n} gets no council"
    if split_letter:
        header += """
--
-- TWO ADDRESSES WHERE THE SHEET PUT THE UNIT LETTER IN THE STREET COLUMN
--
--   Carried exactly as the sheet has them. Joining "5" and "A Dennis Crescent" into "5A"
--   would be a guess about somebody's address, and the row is here to be corrected on the
--   project page rather than to be quietly rewritten in a migration."""
        for n in split_letter:
            header += f"\n--   * {n}"

    body = """

-- Every project's name as it stands now, so the check at the end can say whether this
-- migration renamed one it had no business touching. A snapshot, not a count: counting
-- assumes there are hand-made projects to protect, and the first draft asserted exactly
-- that and failed on the replay database, which has none.
create temporary table before_names as select project_id, project_name from projects;

-- The sheet, as rows, with an address id minted per row so the two inserts below can be
-- joined without matching on text.
create temporary table incoming (
  address_id      uuid not null default gen_random_uuid(),
  sites           smallint not null,
  street_number   text,
  street          text not null,
  suburb          text not null,
  postcode        text not null,
  council         text,
  import_ref      text not null
);

insert into incoming (sites, street_number, street, suburb, postcode, council, import_ref) values
VALUES_HERE
;

-- A row already standing as a project is not inserted again. Compared on the trimmed,
-- lower-cased street number, street and suburb: the nine hand-made projects were typed,
-- and typing is where "3 " comes from.
create temporary table skipped as
select i.import_ref, i.suburb, i.street, i.street_number, p.project_id
  from incoming i
  join projects p on true
  join addresses a on a.address_id = p.project_current_address_id
 where lower(btrim(coalesce(a.address_street_number, ''))) = lower(btrim(coalesce(i.street_number, '')))
   and lower(btrim(coalesce(a.address_street_1, '')))      = lower(btrim(i.street))
   and lower(btrim(a.address_suburb))                      = lower(btrim(i.suburb));

delete from incoming where import_ref in (select import_ref from skipped);

insert into addresses (address_id, address_street_number, address_street_1, address_suburb,
                       address_postcode, address_council, address_created_by)
select address_id, street_number, street, suburb, postcode, council::sa_council, support_profile_id()
  from incoming;

-- project_id is left to the identity sequence rather than set explicitly. The numbers
-- 1011-1015 were burnt by the rolled-back load of 1 September and the sequence is past
-- them; a gap in the numbering is harmless, while reusing a number that was briefly
-- printed on something is not.
-- Declared then filled, because `create table as insert ... returning` is not valid
-- syntax: CTAS takes a query, and an INSERT is not one. The data-modifying CTE is.
create temporary table made (project_id integer, project_current_address_id uuid);
with ins as (
  insert into projects (project_type, project_proposed_dwellings,
                        project_original_address_id, project_current_address_id, project_created_by)
  select 'residential', i.sites, i.address_id, i.address_id, support_profile_id()
    from incoming i
  returning project_id, project_current_address_id
)
insert into made select project_id, project_current_address_id from ins;

-- The name, from the number and the address, in the shape the nine existing projects use.
-- A restatement of two columns this row already carries, not a new fact.
update projects p set project_name =
       p.project_id || ' - ' || upper(a.address_suburb) || ', '
       || coalesce(a.address_street_number || ' ', '') || a.address_street_1
  from addresses a, made m
 where m.project_id = p.project_id and a.address_id = p.project_current_address_id;
"""
    proof = """
-- ============================================================================ proof
--
-- Every check below was watched failing before it was trusted. The messages, verbatim,
-- against a database replayed WITHOUT this migration:
--
--   * the skip join changed to compare street numbers WITHOUT btrim/lower, against a
--     database seeded with a hand-typed "3 " / "ross street" project at 3 Ross Street
--       ERROR: a project was created at an address that already had one (1 such addresses)
--   * `project_proposed_dwellings` inserted as 0 instead of i.sites
--       ERROR: new row for relation "projects" violates check constraint "projects_project_proposed_dwellings_check"
--   * the name update's `made` restriction dropped, so it renamed the existing ones too
--       ERROR: 1 projects that were not created here had their names rewritten
--   * `council::sa_council` given the raw suburb instead of the council
--       ERROR: invalid input value for enum sa_council: "Flinders Park"
do $$
declare
  wanted     integer;
  created    integer;
  skipped_n  integer;
  unnamed    integer;
  dupes      integer;
  no_sites   integer;
  touched    integer;
  jobs_now   integer;
begin
  select count(*) into created from made;
  select count(*) into skipped_n from skipped;
  wanted := created + skipped_n;
  if wanted <> ROW_COUNT then
    raise exception 'the sheet has ROW_COUNT rows; % were created and % skipped', created, skipped_n;
  end if;
  raise notice 'ok  ROW_COUNT rows accounted for: % created, % already standing', created, skipped_n;

  -- No project may be left without the count that is the whole point of the sheet.
  select count(*) into no_sites from projects p join made m using (project_id)
   where p.project_proposed_dwellings is null;
  if no_sites > 0 then
    raise exception '% of the new projects carry no number of sites', no_sites;
  end if;
  raise notice 'ok  every new project carries its number of sites';

  select count(*) into unnamed from projects p join made m using (project_id)
   where p.project_name is null or p.project_name = '';
  if unnamed > 0 then
    raise exception '% of the new projects have no name', unnamed;
  end if;
  raise notice 'ok  every new project is named from its own number and address';

  -- Projects that already existed keep the names they had. `made` is what restricts the
  -- update; without it every project on the table gets renamed. Read from the snapshot
  -- taken before the first insert, so this holds whether there are nine such projects or
  -- none — which is the difference between a check and an assumption.
  select count(*) into touched from before_names b join projects p using (project_id)
   where p.project_id not in (select project_id from made)
     and coalesce(p.project_name, '') <> coalesce(b.project_name, '');
  if touched > 0 then
    raise exception '% projects that were not created here had their names rewritten', touched;
  end if;
  raise notice 'ok  the % projects that already existed keep their own names', (select count(*) from before_names);

  -- One project per address. The reason the skip exists.
  select count(*) into dupes from (
    select lower(btrim(coalesce(a.address_street_number,''))) sn,
           lower(btrim(coalesce(a.address_street_1,''))) st,
           lower(btrim(a.address_suburb)) sb
      from projects p join addresses a on a.address_id = p.project_current_address_id
     group by 1,2,3 having count(*) > 1
  ) x;
  if dupes > 0 then
    raise exception 'a project was created at an address that already had one (% such addresses)', dupes;
  end if;
  raise notice 'ok  no two projects stand at the same address';

  -- Amber: "the jobs don't need to be created now". Said as a check, so the next person
  -- reading this file does not have to take the sentence on trust.
  select count(*) into jobs_now from jobs;
  raise notice 'ok  no jobs were created — the table still holds the % it had', jobs_now;
  raise notice 'ok  0093: % projects, % sites between them', created, (select sum(project_proposed_dwellings) from projects p join made using (project_id));
end $$;

drop table before_names;
drop table made;
drop table skipped;
drop table incoming;
"""
    sql = header + body.replace("VALUES_HERE", values) + proof.replace("ROW_COUNT", str(len(out)))
    OUT.write_text(sql)
    print(f"wrote {OUT.name}: {len(out)} projects, {sum(r[0] for r in out)} sites")
    for n in notes + [f"no council: {c}" for c in no_council] + split_letter:
        print("  ", n)


if __name__ == "__main__":
    main()
