-- =============================================================================
-- 0106 — a lot number is a number; a street number is not
-- =============================================================================
-- Amber, 10 September, correcting `0105` and, behind it, `0034`:
--
--   "a lot number or res number is only a number not a number and digitl.
--    however a street number can be something like 100-105 (as text) or 12B"
--
-- `0105` gave the res number the type the lot number had, and justified it by
-- quoting `0034`:
--
--   "Text, not a number — \"12A\", \"5-7\" and \"Lot 3\" are as common as 12"
--
-- and the split dialog says the same thing on screen: *"A lot number can be anything
-- on the plan — 2B as readily as 2."* That was wrong about which of the three numbers
-- carries the letters, and it has been wrong since August.
--
-- THE LIVE DATA SAYS SO PLAINLY, which is how it was settled rather than argued:
--
--     lot numbers        13 of 13 are digits only
--     street numbers     12 of 178 are NOT — and they are exactly Amber's examples:
--                        2-4 · 42-44 · 60-62 · 84-88 · 337-339 · 3&5 · 4-11/9
--                        1a · 2A · 4a · 83a
--
-- Not one lot number in the database has ever had a letter in it. Every ranged and
-- suffixed number is a street number. So:
--
--     address_lot_number   text -> integer
--     address_res_number   text -> integer   (added yesterday in 0105, no data)
--     address_street_number                  stays text, and now has a reason on file
--                                            rather than an inherited assumption
--
-- WHAT AN INTEGER COLUMN COSTS, AND WHERE THE COST WENT
--
--   `0034` taught the trigger to strip a typed label — "Lot 3" stored as 3 — after a
--   fixture typed one and produced "Lot Lot 3, Corner Street". An integer column cannot
--   do that: the cast happens when the INSERT is parsed, before any BEFORE trigger
--   runs, so 'Lot 3' is rejected outright rather than cleaned.
--
--   That tolerance is not dropped, it MOVES to the app, which is where input tolerance
--   belongs: `AddressFields` and the split rows strip a leading "Lot"/"Res" and refuse
--   anything that is not digits, with a message, before the value is sent. The database
--   is now the thing that cannot be talked into holding "2B", which is the point.
--
-- AND ONE UX CORRECTION, SAME DAY
--
--   `0105` offered the res number on a job's address only, and said the app was where
--   that line lived. Amber: *"it just needs to not have the option of only adding a res
--   to jobs not projects which is a ux thing... however on a project you might update
--   the res number there as well."* So the line goes: every address form offers it. The
--   database never forbade it, which turns out to have been the right call for the
--   wrong reason.
--
--   She also confirmed the two things `0105` guessed at and flagged: addresses being
--   their own table displayed on a job or project is *"correct"*, and the street_2 line
--   *"is important"* — so it stays where it is, leading the address.
--
-- ONE DATA FIX, FOUND WHILE COUNTING
--
--   One street number is stored as '13 ' with a trailing space, and renders as
--   "13  Awoonga Road" — two spaces, in the column every address search reads. Trimmed
--   here, and the trigger trims from now on, so it cannot come back.
-- =============================================================================

-- ---------------------------------------------------------------- the two casts
-- `using` does the work: strip a label if one is stored, then cast. This FAILS LOUDLY
-- if any row disagrees with Amber, which is the behaviour worth having — a silent
-- coalesce to null would throw away the one row that proved the rule wrong.
alter table addresses
  alter column address_lot_number type integer
  using nullif(trim(regexp_replace(coalesce(address_lot_number, ''), '^\s*lot[\s.:#-]*', '', 'i')), '')::integer;

alter table addresses
  alter column address_res_number type integer
  using nullif(trim(regexp_replace(coalesce(address_res_number, ''), '^\s*(res(idence)?)?[\s.:#-]*', '', 'i')), '')::integer;

comment on column addresses.address_lot_number is
  'The lot as it appears on the plan of division. INTEGER since 0106 — Amber, 10 Sep: '
  '"a lot number or res number is only a number". All 13 in the database were digits '
  'when that was checked; every ranged or suffixed number ("2-4", "83a") turned out to '
  'be a street number. Typing "Lot 3" still works: the app strips the label now, '
  'because an integer column rejects the cast before any trigger could.';

comment on column addresses.address_res_number is
  'The residence number on the plan. INTEGER since 0106, for the same reason and by '
  'the same instruction as the lot number. Leads the consolidated address when set '
  '(0105). Offered on EVERY address form, a project''s included — 0105 gated it to '
  'jobs and Amber corrected that the same day: "it just needs to not have the option '
  'of only adding a res to jobs not projects which is a ux thing... however on a '
  'project you might update the res number there as well." Usually null on a project, '
  'never forbidden on one.';

comment on column addresses.address_street_number is
  'The number on the street. TEXT, and 0106 is where that stopped being an inherited '
  'assumption and became a measured fact: 12 of 178 are not numbers — 2-4, 42-44, '
  '337-339, 3&5, 4-11/9, 1a, 2A, 4a, 83a. Amber: "a street number can be something '
  'like 100-105 (as text) or 12B". Trimmed on write since 0106.';

-- ------------------------------------------------------- the trigger, simplified
-- The two normalisations are gone because they cannot fire: the columns are integers
-- and a label would have been rejected before this runs. The street number keeps one,
-- because it is still text and still arrives with whitespace on it.
create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.address_street_number := nullif(trim(new.address_street_number), '');

  new.address_consolidated :=
    coalesce(new.address_street_2 || ', ', '') ||
    coalesce('Res ' || new.address_res_number || ', ', '') ||
    coalesce('Lot ' || new.address_lot_number || ', ', '') ||
    coalesce(new.address_street_number || ' ', '') ||
    coalesce(new.address_street_1 || ', ', '') ||
    new.address_suburb || ', ' || new.address_state::text || ', ' || new.address_postcode;
  return new;
end $$;

-- ONLY NOW is any DML safe, and the order is the whole lesson of this migration.
--
-- The first run put the street-number trim ABOVE the function replacement and failed:
--
--     ERROR: 22P02: invalid input syntax for type integer: ""
--     QUERY: new.address_lot_number := nullif(trim(regexp_replace(
--              coalesce(new.address_lot_number, ''), '^\s*lot[\s.:#-]*', '', 'i')), '')
--     CONTEXT: PL/pgSQL function build_consolidated_address() line 3 at assignment
--
-- `alter table ... type` does not fire row triggers, so the casts are fine on their
-- own. The trim is an UPDATE, and it fired the OLD trigger — whose first act was
-- `coalesce(new.address_lot_number, '')` on a column that had just become an integer.
-- The whole migration rolled back, which is why the columns were still text afterwards
-- and nothing was left half-done.
--
-- So: cast, replace the function, and only then touch a row.
update addresses
   set address_street_number = nullif(trim(address_street_number), '')
 where address_street_number is distinct from nullif(trim(address_street_number), '');

-- Rebuild every consolidated address: a derived column has no other way to recompute,
-- and the trimmed street numbers change what it renders.
update addresses set address_lot_number = address_lot_number;

-- =============================================================================
-- Prove it. Sub-transaction per probe, rolled back by raising — 0034's pattern, and
-- the plpgsql variable survives the rollback, which is why it works.
--
-- WATCHED FAILING BEFORE TRUSTED. Each guarded thing was broken in turn against the
-- live database and the probe that catches it named below:
--
--   lot column left as text, "2B" accepted     -> probe 5 raises (it expects a refusal)
--   street number cast to integer too          -> probe 3 cannot even insert "42-44"
--   street trim removed                        -> probe 4 gets "13  Tester Street"
--   Res dropped from the format                -> probe 1
-- =============================================================================
do $$
declare
  probe text;
  ok    boolean;
begin
  -- 1. Amber's worked example still holds, now with integer inputs.
  begin
    insert into addresses (address_res_number, address_lot_number, address_street_number,
                           address_street_1, address_suburb, address_state, address_postcode,
                           address_council)
    values (1, 3, '13', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from 'Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000' then
    raise exception '0106: the worked example broke: %', coalesce(probe, '(null)');
  end if;

  -- 2. No res number — the ordering Amber gave first.
  begin
    insert into addresses (address_lot_number, address_street_number, address_street_1,
                           address_suburb, address_state, address_postcode, address_council)
    values (3, '13', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from 'Lot 3, 13 Tester Street, Testville, SA, 5000' then
    raise exception '0106: the no-res format broke: %', coalesce(probe, '(null)');
  end if;

  -- 3. A RANGED street number — the case that decided the type. "42-44" must survive
  --    whole; an integer column could not hold it at all.
  begin
    insert into addresses (address_street_number, address_street_1, address_suburb,
                           address_state, address_postcode, address_council)
    values ('42-44', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from '42-44 Tester Street, Testville, SA, 5000' then
    raise exception '0106: a ranged street number did not survive: %', coalesce(probe, '(null)');
  end if;

  -- 4. A street number with whitespace on it — the '13 ' found in the live data.
  begin
    insert into addresses (address_street_number, address_street_1, address_suburb,
                           address_state, address_postcode, address_council)
    values ('13 ', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from '13 Tester Street, Testville, SA, 5000' then
    raise exception '0106: a padded street number was not trimmed: %', coalesce(probe, '(null)');
  end if;

  -- 5. The negative, and the whole point of the change: the database must REFUSE a lot
  --    number with a letter in it. A probe set that only proved the happy path would
  --    pass just as happily with the column still text.
  ok := false;
  begin
    insert into addresses (address_lot_number, address_street_1, address_suburb,
                           address_state, address_postcode, address_council)
    values ('2B', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully');
    raise exception 'undo_probe';
  exception
    when invalid_text_representation then ok := true;   -- refused, which is correct
    when others then
      if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if not ok then
    raise exception '0106: the lot number accepted "2B" — the column is still text';
  end if;

  raise notice '0106: lot and res are integers, a street number is not, and "2B" is refused.';
end $$;
