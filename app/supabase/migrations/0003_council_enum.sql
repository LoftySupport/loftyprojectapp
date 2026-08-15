-- =============================================================================
-- 0003 — councils become an enum on addresses
-- =============================================================================
-- 0001 made councils a table, on the reasoning that SA alone has 68, that they
-- amalgamate, and that the picker filters by state. That call is reversed here by
-- decision: a council is now a value on the address, not a row it points at.
--
-- What the table was buying, and where each piece went:
--
--   the state filter   -> a CHECK on addresses. The enum is SA-only, so an address
--                         carrying a council must be an SA address. Stricter than the
--                         table was, which let any council sit against any state.
--   `active`           -> gone. Postgres has no ALTER TYPE ... DROP VALUE, in 17 or
--                         anywhere, so an amalgamated council cannot be retired. It
--                         can be renamed (ALTER TYPE ... RENAME VALUE) and that is
--                         the whole toolkit. Accepted going in.
--   picker ordering    -> free. Enums sort by declaration order, and the values below
--                         are declared in the LGA's own listing order, so
--                         `order by council` returns the list as lga.sa.gov.au
--                         publishes it. That is why the order looks odd in places:
--                         "District Council of Ceduna" sits under C, not D.
--   future attributes  -> nowhere. Approval turnaround, e-lodgement portal and
--                         contact details have no home on an enum. If one is needed,
--                         it goes in a new table keyed by the enum value.
--
-- Adding a council later is two migrations, not one: ALTER TYPE ... ADD VALUE cannot
-- be *used* in the transaction that adds it. Use BEFORE/AFTER to slot it into the
-- alphabetical run rather than appending, or the ordering above stops holding.
--
-- Source: https://www.lga.sa.gov.au/sa-councils/councils-listing
-- 68 councils, current as at August 2026.
-- =============================================================================

-- ------------------------------------------------------------------ sa_council
-- Labels are the councils as they are written on letterhead — "City of Burnside",
-- not "burnside" — because with the table gone there is nowhere else for a display
-- name to live. A slug here would only move the display strings into the frontend,
-- which is the same lookup somewhere worse.
create type sa_council as enum (
  'City of Adelaide',
  'Adelaide Hills Council',
  'Adelaide Plains Council',
  'Alexandrina Council',
  'The Barossa Council',
  'Barunga West Council',
  'Berri Barmera Council',
  'City of Burnside',
  'Campbelltown City Council',
  'District Council of Ceduna',
  'City of Charles Sturt',
  'Clare and Gilbert Valleys Council',
  'District Council of Cleve',
  'District Council of Coober Pedy',
  'Coorong District Council',
  'Copper Coast Council',
  'District Council of Elliston',
  'The Flinders Ranges Council',
  'District Council of Franklin Harbour',
  'Town of Gawler',
  'Regional Council of Goyder',
  'City of Holdfast Bay',
  'Kangaroo Island Council',
  'District Council of Karoonda East Murray',
  'District Council of Kimba',
  'Kingston District Council',
  'Light Regional Council',
  'Lower Eyre Council',
  'District Council of Loxton Waikerie',
  'City of Marion',
  'Mid Murray Council',
  'City of Mitcham',
  'Mount Barker District Council',
  'City of Mount Gambier',
  'District Council of Mount Remarkable',
  'Rural City of Murray Bridge',
  'Naracoorte Lucindale Council',
  'Northern Areas Council',
  'City of Norwood Payneham & St Peters',
  'City of Onkaparinga',
  'District Council of Orroroo Carrieton',
  'District Council of Peterborough',
  'City of Playford',
  'City of Port Adelaide Enfield',
  'Port Augusta City Council',
  'City of Port Lincoln',
  'Port Pirie Regional Council',
  'City of Prospect',
  'Renmark Paringa Council',
  'District Council of Robe',
  'Municipal Council of Roxby Downs',
  'City of Salisbury',
  'Southern Limestone Coast Council',
  'Southern Mallee District Council',
  'District Council of Streaky Bay',
  'Tatiara District Council',
  'City of Tea Tree Gully',
  'District Council of Tumby Bay',
  'City of Unley',
  'City of Victor Harbor',
  'Wakefield Regional Council',
  'Town of Walkerville',
  'Wattle Range Council',
  'City of West Torrens',
  'City of Whyalla',
  'Wudinna District Council',
  'District Council of Yankalilla',
  'Yorke Peninsula Council'
);

-- ------------------------------------------------------------------- the views
-- A column cannot change type underneath a view, so the three that expose council_id
-- come down first and go back up at the bottom. job_display never carried council and
-- is left alone.
drop view if exists job_address_search;
drop view if exists project_address_search;
drop view if exists project_display;

-- --------------------------------------------------------------- addresses
-- council_id was a uuid pointing at a row. council is the value itself. Renamed
-- rather than kept, because `_id` on a column that is not an id is the kind of
-- small lie that costs an afternoon in six months.
alter table addresses drop column council_id;
alter table addresses add column council sa_council;

-- The state filter the table used to give us, now enforced instead of merely
-- available. The enum is SA-only; an address in another state has no council it
-- could legally carry, so it must carry none. Adding a council from another state
-- means dropping this constraint deliberately — which is the conversation you want
-- to be forced into, not one to have by accident.
alter table addresses add constraint addresses_council_is_sa
  check (council is null or state = 'SA');

create index addresses_council_idx on addresses (council);

comment on column addresses.council is
  'Local government area. SA only — see addresses_council_is_sa. Enum values are ordered as lga.sa.gov.au lists them, so `order by council` is picker order.';

-- ------------------------------------------------------------ council_regions
-- Nothing references it now. The trigger, policy and indexes go with it.
drop table if exists council_regions;

-- ------------------------------------------------------------- views, rebuilt
-- Identical to 0001 except council_id is council, and the type is sa_council rather
-- than uuid — so consumers get the council's name without the join that used to be
-- required to turn the uuid into something a human reads.
create view project_display with (security_invoker = on) as
  select p.id,
         p.project_no,
         p.project_type,
         p.status,
         cur.consolidated_address  as current_address,
         orig.consolidated_address as original_address,
         cur.suburb,
         cur.council
    from projects p
    join addresses cur       on cur.id  = p.current_address_id
    left join addresses orig on orig.id = p.original_address_id;

create view project_address_search with (security_invoker = on) as
  select p.id as project_id,
         p.project_no,
         a.id as address_id,
         a.consolidated_address,
         a.suburb,
         a.council,
         case when a.id = p.current_address_id then 'current' else 'original' end as role
    from projects p
    join addresses a on a.id = p.current_address_id
                     or a.id = p.original_address_id;

create view job_address_search with (security_invoker = on) as
  select j.id as job_id,
         j.project_id,
         j.job_number,
         a.id as address_id,
         a.consolidated_address,
         a.suburb,
         a.council,
         case when a.id = j.current_address_id then 'current' else 'original' end as role
    from jobs j
    join addresses a on a.id = j.current_address_id
                     or a.id = j.original_address_id;
