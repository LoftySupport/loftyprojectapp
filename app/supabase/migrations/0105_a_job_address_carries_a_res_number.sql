-- =============================================================================
-- 0105 — a job's address carries a Res number, and the format Amber wrote out
-- =============================================================================
-- Amber, 10 September, giving the shape of an address at each level:
--
--   "A project needs to record the following address details at a project level:
--    Lot # / Street Number / Street Name / Suburb / Postcode / State / Council.
--    A Job needs to record all of that information PLUS Res #.
--
--    when formatting the address, it should show Lot #, Street Number, Street Name,
--    Suburb, State, Postcode. Only after a Res # is added to the job, does the It go
--    Res #, Lot #, Street Number, Suburb, State, Postcode
--
--    e.g Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000"
--
-- Two changes, and the worked example pins both.
--
-- WHY THE COLUMN IS ON `addresses` AND NOT ON `jobs`
--
--   Amber describes it as one of the address details a job records — "all of that
--   information PLUS Res #" — and the seven it joins are all on `addresses`. Putting it
--   on `jobs` instead would split one address across two tables and, worse, would take
--   the rendering away from `build_consolidated_address()`: the app would have to
--   compose "Res 1, " in front of a string the database built, in every place an
--   address is shown, exported or searched. The generated column exists so there is one
--   answer to "what is this address", and this keeps it that way.
--
--   The database does NOT forbid a res number on a project's address, and that is
--   deliberate rather than an omission. An address row is not owned by one record —
--   `address_history` exists because addresses move between records and through time —
--   so there is no row to hang "this one belongs to a job" off. The APP is where the
--   distinction lives: the field is offered on a job's address and not on a project's,
--   which is exactly what Amber asked for.
--
-- WHY IT IS TEXT, WHEN SHE WROTE "(number)"
--
--   She wrote "(number)" against Lot # too, and `address_lot_number` is text on purpose:
--   Lofty's own example of a lot number is "2B" (0034, and the split dialog says so on
--   screen). A res number is the same kind of thing — a label off a plan that is usually
--   a numeral and is not arithmetic — so it takes the same type as the two numbers
--   either side of it. Nothing is lost: "1" stored as text is still "1". If a res number
--   must be strictly numeric, that is a CHECK to add, not a type to change back.
--
--   Not made unique, either per project or globally. Res numbers repeat across sites by
--   definition, and whether they may repeat WITHIN one is a rule nobody has stated.
--
-- WHAT THE FORMAT NOW PRODUCES
--     lot only              Lot 3, Tester Street, Testville, SA, 5000
--     street only           13 Tester Street, Testville, SA, 5000
--     lot + street          Lot 3, 13 Tester Street, Testville, SA, 5000
--     res + lot + street    Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000
--     with a unit           Unit 2, Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000
--
-- Three differences from what 0034 produced, all of them read off Amber's example:
--
--   1. `Res N, ` leads when there is one. It sits after `address_street_2` — the unit
--      line — because a unit is the outermost container of the three and that is where
--      0034 already put it. Amber did not mention street_2 and it is not dropped: it
--      holds real data on real rows, and hiding a populated column would be a worse
--      answer than placing it by the rule already in force.
--   2. Suburb, state and postcode are comma-separated. They were space-separated
--      ("Testville SA 5000"); her example writes "Testville, SA, 5000".
--   3. The country is gone. Every address in this system is Australian, `, AU` was on
--      the end of all 197 of them, and her example does not carry it. The COLUMN stays —
--      this changes what is rendered, not what is recorded.
--
-- THIS IS NOT A DISPLAY CHANGE, which 0034 made the point of saying and is worth
-- repeating: `address_consolidated` is the column `pg_trgm` indexes and every address
-- search reads. Changing the punctuation changes what people match against. Dropping
-- ", AU" removes a token nobody searches for; the commas sit between tokens rather than
-- inside them, so trigram matching on a suburb or a street is unaffected; and `Res 1`
-- becomes newly findable, which is the point of adding it.
-- =============================================================================

alter table addresses add column if not exists address_res_number text;

comment on column addresses.address_res_number is
  'The residence number on the plan, for a job''s address. Null on a project''s — the '
  'app offers the field on one and not the other; the database does not forbid it, '
  'because an address row is not owned by one record. Text for the same reason '
  'address_lot_number is: "2B" is a real lot number and a res number is the same kind '
  'of label. Leads the consolidated address when present (0105).';

create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Normalise the lot number before composing anything — 0034's rule, unchanged.
  --
  -- The column is free text and people type the label with it: "Lot 3" as often as "3".
  -- Normalising the STORED value rather than only the display, because the column is
  -- compared as well as read — the project split numbers its lots 1, 2, 3, and a row
  -- holding "Lot 3" does not sort or match against those.
  new.address_lot_number :=
    nullif(trim(regexp_replace(coalesce(new.address_lot_number, ''), '^\s*lot[\s.:#-]*', '', 'i')), '');

  -- And the res number the same way, for the same reason and before it has a chance to
  -- become "Res Res 1". "Res", "Residence" and "#" are all things somebody types in
  -- front of the number they mean.
  new.address_res_number :=
    nullif(trim(regexp_replace(coalesce(new.address_res_number, ''), '^\s*(res(idence)?)?[\s.:#-]*', '', 'i')), '');

  new.address_consolidated :=
    coalesce(new.address_street_2 || ', ', '') ||
    coalesce('Res ' || new.address_res_number || ', ', '') ||
    -- "Lot " spelled out. Without it the number is just a number, and the one thing a
    -- consolidated address has to do is say which place it means.
    coalesce('Lot ' || new.address_lot_number || ', ', '') ||
    coalesce(new.address_street_number || ' ', '') ||
    coalesce(new.address_street_1 || ', ', '') ||
    new.address_suburb || ', ' || new.address_state::text || ', ' || new.address_postcode;
  return new;
end $$;

-- Rebuild what already exists. A no-op UPDATE fires the trigger, which is the only way
-- to recompute a derived column. 197 rows today; it also normalises any res number that
-- arrives with its label, the same way 0034's rebuild normalised lot numbers.
update addresses set address_lot_number = address_lot_number;

-- =============================================================================
-- Prove it, on rows the table would actually accept.
--
-- Each probe inserts inside a sub-transaction and raises to roll it back, so nothing is
-- left behind — no address and no activity_audit pair. The plpgsql variable survives the
-- rollback, which is the only reason this shape works. Copied from 0034, which is where
-- it was worked out.
--
-- WATCHED FAILING BEFORE THEY WERE TRUSTED. The composition was evaluated against the
-- live database with each guarded thing broken in turn:
--
--   broke                        1 (bare res)  4 (typed label)  5 (unit line)
--   no res normalisation         passes        FAILS            passes
--   Res placed after Lot         FAILS         FAILS            FAILS
--   old space-separated tail     FAILS         FAILS            FAILS
--
-- The first row is the reason probe 4 exists and is not decoration: with the res
-- normalisation removed, probes 1 and 5 pass happily — their res number is already a
-- bare "1" — and only the probe that types "Res 1" catches "Res Res 1". A probe set
-- that omitted it would have reported green on a real bug.
-- =============================================================================
do $$
declare
  probe text;

  -- One helper would be neater and is not worth a function that outlives the migration.
  procedure_note text := 'see 0105';
begin
  -- 1. Amber's example, exactly as she wrote it.
  begin
    insert into addresses (address_res_number, address_lot_number, address_street_number,
                           address_street_1, address_suburb, address_state, address_postcode,
                           address_council)
    values ('1', '3', '13', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from 'Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000' then
    raise exception 'the res-number format is wrong: % (%)', coalesce(probe, '(null)'), procedure_note;
  end if;

  -- 2. The same address before a res number is added — Amber's first ordering.
  begin
    insert into addresses (address_lot_number, address_street_number, address_street_1,
                           address_suburb, address_state, address_postcode, address_council)
    values ('3', '13', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from 'Lot 3, 13 Tester Street, Testville, SA, 5000' then
    raise exception 'the no-res format is wrong: % (%)', coalesce(probe, '(null)'), procedure_note;
  end if;

  -- 3. Titles issued, no lot left — the street number alone still reads as an address.
  begin
    insert into addresses (address_street_number, address_street_1, address_suburb,
                           address_state, address_postcode, address_council)
    values ('13', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from '13 Tester Street, Testville, SA, 5000' then
    raise exception 'the street-only format is wrong: % (%)', coalesce(probe, '(null)'), procedure_note;
  end if;

  -- 4. The label typed in front of the number, which is how people actually enter both.
  --    "Res 1" and "Lot 3" must not become "Res Res 1" and "Lot Lot 3".
  begin
    insert into addresses (address_res_number, address_lot_number, address_street_1,
                           address_suburb, address_state, address_postcode, address_council)
    values ('Res 1', 'Lot 3', 'Tester Street', 'Testville', 'SA', '5000', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from 'Res 1, Lot 3, Tester Street, Testville, SA, 5000' then
    raise exception 'a typed-in label was not normalised: % (%)', coalesce(probe, '(null)'), procedure_note;
  end if;

  -- 5. The unit line still leads, and a res number does not displace it.
  begin
    insert into addresses (address_street_2, address_res_number, address_lot_number,
                           address_street_number, address_street_1, address_suburb,
                           address_state, address_postcode, address_council)
    values ('Unit 2', '1', '3', '13', 'Tester Street', 'Testville', 'SA', '5000',
            'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;
  if probe is distinct from 'Unit 2, Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000' then
    raise exception 'the unit line moved: % (%)', coalesce(probe, '(null)'), procedure_note;
  end if;

  raise notice '0105: five address formats hold, including Amber''s worked example.';
end $$;
