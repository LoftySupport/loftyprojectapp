-- =============================================================================
-- 0069 — only the locality is required
-- =============================================================================
-- Amber, 31 August, on the new-project form:
--
--   "the only thing required is suburb, state, postcode and project type. the rest are
--    optional."
--
-- Four of those five are already the rule. Three constraints stand in the way of the
-- fifth word — "optional" — and each of them refuses a shape somebody typing a project
-- into this form legitimately has:
--
--   addresses_council_required_in_sa  (0025)  an SA address must name its council
--   addresses_street_needs_a_number   (0037)  a street must carry a lot or street number
--   addresses_numbers_need_a_street   (0037)  a number must carry a street
--
-- The form checks all three itself so the Create button greys out instead of the insert
-- coming back with a constraint name. Relaxing only the form would move the refusal from
-- a disabled button to a Postgres error, which is worse — so the rule moves here.
--
-- WHY EACH ONE GOES
--
--   Council. The form fills it in from the suburb, off the LGA list, and gets it right
--   everywhere the list is unambiguous. Where it cannot — the four suburbs that sit in
--   two councils — it clears the field and says so, which is 0025's own reasoning
--   ("a council on a lodged application is not worth being confidently wrong about")
--   arriving at the opposite conclusion about what to do next. Requiring it there means
--   the person either guesses or cannot create the project. Blank is the honest answer
--   and it is now allowed to be given.
--
--   A street with no number. "The Mt Gambier division, Penola Road" is what Lofty knows
--   before any lot has a frontage. 0037 already accepted that a project may be nothing
--   but a suburb; a suburb and a road is strictly more than that, and it was the one
--   shape between the two that the schema refused.
--
--   A number with no street. This is the one 0037 called "half an address", and it is
--   the correction that matters most: on a plan of division, "Lot 7" is the whole
--   address. The lots are numbered before the roads are named, and the plan is the
--   document everything else is filed against. What 0037 was protecting against — a
--   fragment nobody can find — is a real failure, but it belongs to jobs, in exactly
--   the way that migration argued the street requirement did.
--
-- WHAT DOES NOT MOVE
--
--   `address_suburb`, `address_state` and `address_postcode` stay NOT NULL and the
--   postcode still has to be four digits. Those are the four Amber named, and an
--   address with none of them is not an address.
--
--   `addresses_council_is_sa` stays: the enum is SA-only, so an interstate address may
--   not carry a council at all. Optional is not the same as unconstrained.
--
--   A job still cannot sit somewhere nobody can build. That guarantee was being carried
--   by two things at once — the trigger from 0037 and `addresses_street_needs_a_number`
--   underneath it — and dropping the check would have quietly halved it, because
--   `address_precision` only looks at the street. So the trigger takes over the whole
--   rule, which is where 0037 said it belonged.
-- =============================================================================

-- ------------------------------------------------------------- the relaxation
alter table addresses drop constraint if exists addresses_council_required_in_sa;
alter table addresses drop constraint if exists addresses_street_needs_a_number;
alter table addresses drop constraint if exists addresses_numbers_need_a_street;

comment on column addresses.address_council is
  'The local government area the address sits in. Filled in from the suburb off the LGA list where that list is unambiguous, and left blank where it is not — optional since 0069, because the four suburbs that span two councils would otherwise be a guess somebody had to make to save the form. Still SA-only: addresses_council_is_sa refuses one on an interstate address, where the enum has no valid value to give.';

comment on column addresses.address_lot_number is
  'The lot as it appears on the plan of division. Text, not a number — "12A", "5-7" and "Lot 3" are as common as 12. Optional and independent of the street since 0069: on a plan of division the lot number is often the whole address, because the lots are numbered before the roads are named.';

comment on column addresses.address_precision is
  'How exact this address is. `locality` — no street named, which is all Lofty knows when a development is bought and is enough for a project. `street` — a street is named. Generated, so it can never disagree with the column it describes. NOTE since 0069: `street` no longer implies a number, because addresses_street_needs_a_number is gone; what a job needs is both, and guard_job_address_is_a_street is what enforces that.';

-- ------------------------------------------------- a job needs somewhere to build
-- Same trigger, same message shape, one word more of rule: a street AND a number. It
-- read `address_precision <> 'street'`, which was enough only while the dropped CHECK
-- guaranteed the rest. Every job address today already satisfies this — the CHECK saw
-- to that — so nothing existing becomes unwritable.
create or replace function guard_job_address_is_a_street() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  bad text;
begin
  select string_agg(which, ' and ') into bad
  from (
    select 'current' as which where exists (
      select 1 from addresses a
      where a.address_id = new.job_current_address_id
        and (a.address_street_1 is null
             or num_nonnulls(a.address_lot_number, a.address_street_number) = 0))
    union all
    select 'original' where new.job_original_address_id is not null and exists (
      select 1 from addresses a
      where a.address_id = new.job_original_address_id
        and (a.address_street_1 is null
             or num_nonnulls(a.address_lot_number, a.address_street_number) = 0))
  ) s;

  if bad is not null then
    raise exception
      'a job needs a street address with a number, not a locality — the % address of % has no street or no number on it',
      bad, new.job_id
      using hint = 'Set the street and a lot or street number on the address first. A project may sit at a locality, or at a lot number with no road named yet; a job is a dwelling and cannot.';
  end if;
  return new;
end $$;

comment on function guard_job_address_is_a_street() is
  'A job must sit at an address somebody can build on: a street and a lot or street number. 0037 relaxed `addresses` so a project could be created knowing only its suburb, and 0069 relaxed the rest of the shape for the same reason — which leaves this trigger holding the whole of the old guarantee rather than half of it. It was never true of addresses in general, only of the ones you build on.';

-- ---------------------------------------------------------------------- proof
-- One block, because the fixtures have to outlive the probes that use them: a
-- BEGIN…EXCEPTION opens a subtransaction, and anything set up *inside* one is rolled
-- back with it the moment the probe is correctly refused. Fixtures out here, probes in
-- their own blocks, and the three probe rows are deleted by id at the end.
do $$
declare
  a_no_council uuid;
  a_no_number  uuid;
  a_lot_only   uuid;
  got          text;
  probe_job    text;
  refused      boolean;
begin
  -- 1. An SA address with no council. Refused by 0025 until today.
  insert into addresses (address_suburb, address_state, address_postcode)
  values ('Mount Gambier', 'SA', '5290')
  returning address_id into a_no_council;

  -- 2. A street with no number on it — "the Mt Gambier division, Penola Road".
  insert into addresses (address_street_1, address_suburb, address_state, address_postcode)
  values ('Penola Road', 'Mount Gambier', 'SA', '5290')
  returning address_id, address_consolidated into a_no_number, got;
  if got is distinct from 'Penola Road, Mount Gambier SA 5290, AU' then
    raise exception 'a street with no number reads wrong: %', coalesce(got, '(null)');
  end if;
  if (select address_precision from addresses where address_id = a_no_number) <> 'street' then
    raise exception 'a street with no number stopped being classed as a street';
  end if;

  -- 3. A lot number with no street — "Lot 7" on the plan of division, which is the exact
  --    shape 0037's own proof watched being refused.
  insert into addresses (address_lot_number, address_suburb, address_state, address_postcode)
  values ('7', 'Mount Gambier', 'SA', '5290')
  returning address_id, address_consolidated into a_lot_only, got;
  if got is distinct from 'Lot 7, Mount Gambier SA 5290, AU' then
    raise exception 'a lot-only address reads wrong: %', coalesce(got, '(null)');
  end if;
  if (select address_precision from addresses where address_id = a_lot_only) <> 'locality' then
    raise exception 'a lot number with no street was classed as a street address';
  end if;

  -- 4. What still bites: the enum is SA-only, so an interstate address may carry no
  --    council at all. "Optional" is not "unconstrained".
  refused := false;
  begin
    insert into addresses (address_suburb, address_state, address_postcode, address_council)
    values ('Ballarat', 'VIC', '3350', 'City of Burnside');
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'a council outside SA was accepted';
  end if;

  -- 5. And the half of 0037 that is now the trigger's alone: a job cannot be moved to a
  --    street address with no number, which the dropped CHECK used to make impossible.
  select job_id into probe_job from jobs limit 1;
  if probe_job is null then
    raise notice 'no job to probe the address guard with — skipped';
  else
    refused := false;
    begin
      update jobs set job_current_address_id = a_no_number where job_id = probe_job;
    exception when raise_exception then refused := true;
    end;
    if not refused then
      raise exception 'a job was moved to a street address with no number on it';
    end if;
  end if;

  -- Left behind on purpose is nothing: all three probe rows go, by id.
  delete from addresses where address_id in (a_no_council, a_no_number, a_lot_only);

  raise notice 'ok  council, street and the numbers are optional; a job still needs a street and a number on it';
end $$;
