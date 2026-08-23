-- =============================================================================
-- 0034 — a lot number is not a street number
-- =============================================================================
-- Found while building the project→job split, by making four jobs and reading what
-- came out:
--
--     1000-01   "1 Corner Street, Golden Grove SA 5125, AU"
--     1000-02   "2 Corner Street, Golden Grove SA 5125, AU"
--
-- Those are lots 1 to 4 of a subdivision at 20 Corner Street. They render as houses
-- numbered 1 to 4 on Corner Street, which is a different place — and on a street where
-- number 2 actually exists, it is somebody else's.
--
-- build_consolidated_address() concatenated the lot number bare:
--
--     coalesce(new.address_lot_number || ' ', '') ||
--     coalesce(new.address_street_number || ' ', '') ||
--
-- so a lot is indistinguishable from a street number, and a row carrying both — which is
-- the normal state of a subdivided lot once titles issue — came out as "3 28 Corner
-- Street". Two numbers, no explanation, in the field the whole app searches.
--
-- This matters more than a formatting nit because `address_consolidated` is not a
-- display concern. It is the column `pg_trgm` indexes and every address search reads, so
-- somebody typing "Lot 3" found nothing, and somebody typing "3 Corner Street" found a
-- lot that is not that address.
--
-- WHAT IT NOW PRODUCES
--     lot only        Lot 1, Corner Street, Golden Grove SA 5125, AU
--     street only     28 Corner Street, Golden Grove SA 5125, AU
--     both            Lot 3, 28 Corner Street, Golden Grove SA 5125, AU
--     with a unit     Unit 2, Lot 3, 28 Corner Street, Golden Grove SA 5125, AU
--
-- "Both" is the important one and it is not a rare shape: `addresses_has_a_number`
-- requires at least one and permits either, precisely because a lot gets its street
-- number later. Carrying both is how a job stays findable by the number on the old
-- contract and the number on the new one.
-- =============================================================================

create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Normalise the lot number before composing anything.
  --
  -- The column is free text and people type the label with it — "Lot 3" as often as "3".
  -- One of this harness's own fixtures does, which is how this was found: prefixing a
  -- value that already said "Lot" produced "Lot Lot 3, Corner Street".
  --
  -- Normalising the STORED value rather than only the display, because the column is
  -- compared as well as read: the project split numbers its lots 1, 2, 3, and a row
  -- holding "Lot 3" does not sort or match against those. Two spellings of one number is
  -- the bug, not the rendering of it.
  --
  -- "Lot" on its own normalises to null, which is right — it is a label with no number —
  -- and addresses_has_a_number then insists on a street number instead.
  new.address_lot_number :=
    nullif(trim(regexp_replace(coalesce(new.address_lot_number, ''), '^\s*lot[\s.:#-]*', '', 'i')), '');

  new.address_consolidated :=
    coalesce(new.address_street_2 || ', ', '') ||
    -- "Lot " spelled out. Without it the number is just a number, and the one thing a
    -- consolidated address has to do is say which place it means.
    coalesce('Lot ' || new.address_lot_number || ', ', '') ||
    coalesce(new.address_street_number || ' ', '') ||
    new.address_street_1 || ', ' ||
    new.address_suburb || ' ' || new.address_state::text || ' ' ||
    new.address_postcode || ', ' || new.address_country::text;
  return new;
end $$;

-- Rebuild what already exists. Zero rows today, and written anyway: this migration has
-- to produce the same database whenever it runs, and "there were none at the time" is
-- not a property of the migration.
--
-- A no-op UPDATE fires the trigger, which is the whole mechanism — the column is derived
-- and there is no other way to recompute it. It also normalises any lot number already
-- stored with its label ("Lot 3" becomes "3"), which is a write, not just a recompute.
update addresses set address_lot_number = address_lot_number;

do $$
declare
  probe text;
  acl   text;
begin
  -- Prove the format on a row carrying BOTH numbers, which is the case that was worst
  -- and the case a lot-only probe would have passed before this migration too.
  --
  -- The insert runs in a sub-transaction and is rolled back, so it leaves no address and
  -- no activity_audit pair behind. `probe` survives the rollback because a plpgsql
  -- variable is not transactional — which is the only reason this shape works.
  begin
    -- A council, because addresses_council_required_in_sa insists on one and the probe
    -- has to be a row the table would actually accept.
    insert into addresses (address_lot_number, address_street_number, address_street_1,
                           address_suburb, address_state, address_postcode, address_council)
    values ('3', '28', 'Corner Street', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception
    when others then
      if sqlerrm <> 'undo_probe' then raise; end if;
  end;

  if probe is distinct from 'Lot 3, 28 Corner Street, Golden Grove SA 5125, AU' then
    raise exception 'consolidated address is wrong: %', coalesce(probe, '(null)');
  end if;

  -- And again with the label typed in, which is how people actually enter it.
  begin
    insert into addresses (address_lot_number, address_street_1, address_suburb,
                           address_state, address_postcode, address_council)
    values ('Lot 3', 'Corner Street', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully')
    returning address_consolidated into probe;
    raise exception 'undo_probe';
  exception
    when others then
      if sqlerrm <> 'undo_probe' then raise; end if;
  end;

  if probe is distinct from 'Lot 3, Corner Street, Golden Grove SA 5125, AU' then
    raise exception 'a typed "Lot 3" did not normalise: %', coalesce(probe, '(null)');
  end if;

  -- create-or-replace keeps the existing ACL, and 0024 revoked this from public, anon
  -- and authenticated. Asserted rather than assumed: 0013 learned that a revoke can look
  -- applied and not be, and a null proacl means PUBLIC still has EXECUTE.
  select array_to_string(proacl, ' ') into acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'build_consolidated_address';

  if acl is null                       -- no ACL at all: PUBLIC has EXECUTE by default
     or acl like 'anon=%'  or acl like '% anon=%'
     or acl like 'authenticated=%' or acl like '% authenticated=%'
     or acl like '=%'      or acl like '% =%'   -- an empty grantee IS public
  then
    raise exception 'build_consolidated_address is executable by an API role: %',
      coalesce(acl, '(default: PUBLIC)');
  end if;

  raise notice 'ok  "Lot 3, 28 Corner Street" renders correctly; acl is %', acl;
end $$;

comment on function build_consolidated_address() is
  'Composes addresses.address_consolidated, which is what pg_trgm indexes and every address search reads — so this is a search concern, not a display one. A lot number is prefixed "Lot " because an unlabelled one is indistinguishable from a street number, and a subdivided lot legitimately carries both.';
