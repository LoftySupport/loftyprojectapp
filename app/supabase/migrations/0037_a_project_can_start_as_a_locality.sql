-- =============================================================================
-- 0037 — a project can start as a locality, a job cannot
-- =============================================================================
-- Lofty, 23 August, asked whether a project is ever created without knowing the
-- address:
--
--   "No — but only the suburb and postcode and state will be known for sure. The
--    project name may be something general like the 'Mt Gambier division'."
--
-- Which the schema makes impossible. Reproduced against production before writing this:
--
--   insert into addresses (address_suburb, address_state, address_postcode, address_council)
--   values ('Mount Gambier', 'SA', '5290', 'City of Mount Gambier');
--
--   ERROR:  null value in column "address_street_1" violates not-null constraint
--
-- Three things block it, and `addresses_has_a_number` would have blocked it next.
--
-- THIS IS THE CONFLICT WORTH NAMING
--
--   "A project must always have an address" is a good rule and it stays. What was wrong
--   is the assumption underneath it — that every address is a street address. Lofty buys
--   land before it has a street number, and a development is named after its locality
--   long before any lot has a frontage. The old constraint said that state cannot exist.
--
--   The guarantee it was protecting is real, but it belongs to JOBS, not to addresses.
--   A job is one dwelling somebody pours a slab for; "somewhere in Mount Gambier" is not
--   a place you can build. So the requirement moves down to where it is true.
--
-- WHY PRECISION IS DERIVED AND NOT STORED
--
--   A stored `address_precision` is a second source of truth for something the columns
--   already say, and the failure mode is a row that claims to be a street address while
--   having no street. Generated always, so it cannot be set, cannot drift, and needs no
--   backfill.
-- =============================================================================

-- ------------------------------------------------------------- the relaxation
-- Suburb, state and postcode stay NOT NULL: they are what Lofty says is known for sure,
-- and an address with none of them is not an address.
alter table addresses alter column address_street_1 drop not null;

-- Required only once a street is named. A street with no number is a street nobody can
-- find; a locality with no street needs neither.
alter table addresses drop constraint if exists addresses_has_a_number;
alter table addresses add constraint addresses_street_needs_a_number
  check (address_street_1 is null
         or num_nonnulls(address_lot_number, address_street_number) >= 1);

-- And the other way round: a lot or a street number with no street is a fragment, not a
-- place. This is the constraint that stops "locality" quietly becoming "half an address".
alter table addresses add constraint addresses_numbers_need_a_street
  check (address_street_1 is not null
         or num_nonnulls(address_lot_number, address_street_number) = 0);

-- ---------------------------------------------------------------- precision
alter table addresses add column address_precision text
  generated always as (
    case when address_street_1 is not null then 'street' else 'locality' end
  ) stored;

comment on column addresses.address_precision is
  'How exact this address is. `locality` — suburb, state and postcode only, which is all Lofty knows when a development is bought and is enough for a project. `street` — a street and at least one number, which is what a job needs before anybody can build on it. Generated, so it can never disagree with the columns it describes.';

-- --------------------------------------------------- the consolidated address
-- Without this the whole concatenation is NULL the moment street_1 is, and
-- address_consolidated is NOT NULL — so a locality address would still be refused, just
-- with a less obvious error. Same shape as 0034 otherwise.
create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.address_lot_number :=
    nullif(trim(regexp_replace(coalesce(new.address_lot_number, ''), '^\s*lot[\s.:#-]*', '', 'i')), '');

  new.address_consolidated :=
    coalesce(new.address_street_2 || ', ', '') ||
    coalesce('Lot ' || new.address_lot_number || ', ', '') ||
    coalesce(new.address_street_number || ' ', '') ||
    -- The one change: coalesced, so a locality address reads "Mount Gambier SA 5290, AU"
    -- rather than evaluating to null and taking the whole row with it.
    coalesce(new.address_street_1 || ', ', '') ||
    new.address_suburb || ' ' || new.address_state::text || ' ' ||
    new.address_postcode || ', ' || new.address_country::text;
  return new;
end $$;

comment on function build_consolidated_address() is
  'Composes addresses.address_consolidated, which is what pg_trgm indexes and every address search reads — so this is a search concern, not a display one. A lot number is prefixed "Lot " because an unlabelled one is indistinguishable from a street number. Every part above the suburb is optional, because a project may be known only by its locality.';

-- ------------------------------------------------------- a job needs a street
-- A trigger rather than a CHECK: the rule spans two tables and a CHECK cannot see
-- another row. SECURITY DEFINER is deliberately NOT used — this reads `addresses`, which
-- every signed-in person can already read, so running as the caller is enough.
create or replace function guard_job_address_is_a_street() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  bad text;
begin
  select string_agg(which, ' and ') into bad
  from (
    select 'current' as which where exists (
      select 1 from addresses a
      where a.address_id = new.job_current_address_id and a.address_precision <> 'street')
    union all
    select 'original' where new.job_original_address_id is not null and exists (
      select 1 from addresses a
      where a.address_id = new.job_original_address_id and a.address_precision <> 'street')
  ) s;

  if bad is not null then
    raise exception
      'a job needs a street address, not a locality — the % address of % has no street',
      bad, new.job_id
      using hint = 'Set the street and a lot or street number on the address first. A project may sit at a locality; a job is a dwelling and cannot.';
  end if;
  return new;
end $$;

drop trigger if exists trg_job_address_is_a_street on jobs;
create trigger trg_job_address_is_a_street
  before insert or update of job_current_address_id, job_original_address_id on jobs
  for each row execute function guard_job_address_is_a_street();

comment on function guard_job_address_is_a_street() is
  'A job must sit at a street address. 0037 relaxed `addresses` so a project can be created knowing only its suburb, state and postcode — which is how Lofty buys land — and this is where the old guarantee went: it was never true of addresses in general, only of the ones you build on.';

-- ---------------------------------------------------------------------- proof
do $$
declare
  a_locality uuid;
  a_street   uuid;
  got        text;
  refused    boolean := false;
begin
  -- 1. The case Lofty described, which used to be impossible.
  insert into addresses (address_suburb, address_state, address_postcode, address_council)
  values ('Mount Gambier', 'SA', '5290', 'City of Mount Gambier')
  returning address_id, address_consolidated into a_locality, got;

  if got is distinct from 'Mount Gambier SA 5290, AU' then
    raise exception 'a locality address reads wrong: %', coalesce(got, '(null)');
  end if;

  if (select address_precision from addresses where address_id = a_locality) <> 'locality' then
    raise exception 'a street-less address was not classed as a locality';
  end if;

  -- 2. And a street address still behaves exactly as it did.
  insert into addresses (address_lot_number, address_street_number, address_street_1,
                         address_suburb, address_state, address_postcode, address_council)
  values ('3', '28', 'Corner Street', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully')
  returning address_id, address_consolidated into a_street, got;

  if got is distinct from 'Lot 3, 28 Corner Street, Golden Grove SA 5125, AU' then
    raise exception 'a street address reads wrong: %', coalesce(got, '(null)');
  end if;

  if (select address_precision from addresses where address_id = a_street) <> 'street' then
    raise exception 'a street address was not classed as one';
  end if;

  -- 3. The fragment the second constraint exists to refuse: a lot number nobody can find.
  begin
    insert into addresses (address_lot_number, address_suburb, address_state,
                           address_postcode, address_council)
    values ('7', 'Mount Gambier', 'SA', '5290', 'City of Mount Gambier');
  exception when check_violation then refused := true;
  end;
  if not refused then
    raise exception 'a lot number with no street was accepted';
  end if;

  -- Left behind on purpose is nothing: both probe rows go.
  delete from addresses where address_id in (a_locality, a_street);

  raise notice 'ok  a locality address is accepted and reads "Mount Gambier SA 5290, AU"; a street one is unchanged';
end $$;
