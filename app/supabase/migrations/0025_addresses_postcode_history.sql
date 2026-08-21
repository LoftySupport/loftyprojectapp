-- =============================================================================
-- 0025 — postcode, the rules an address must satisfy, and where old names go
-- =============================================================================
-- Lofty's requirements, from the schema plan:
--
--   * street, suburb, state, postcode and country are never null
--   * a lot number is needed, because a subdivided site often has no street number
--     yet — so the rule is "at least one of lot or street number", not both
--   * council is required, but Lofty only builds in South Australia
--   * every name a site has ever had stays searchable
--
-- `addresses` is empty (0 rows, checked before writing this), so NOT NULL and CHECK
-- go on without a backfill or a default. That is only true today.
--
-- Column names stay as they are. The prefix convention (address_postcode rather than
-- postcode) lands in the next migration for every table at once — renaming one table
-- at a time would leave the schema half-converted for as long as it takes to finish,
-- and the views and the repository would have to be edited twice.
-- =============================================================================

-- ---------------------------------------------------------------------- postcode
alter table addresses add column if not exists postcode text;

-- Four digits. Australian postcodes are not numbers: 0800 is Darwin, and an integer
-- would silently make it 800.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'addresses_postcode_shape') then
    alter table addresses add constraint addresses_postcode_shape
      check (postcode ~ '^[0-9]{4}$');
  end if;
end $$;

update addresses set postcode = '5000' where postcode is null;   -- no rows today
alter table addresses alter column postcode set not null;

-- ------------------------------------------------------- the rules on an address
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, hence the DO blocks.

do $$
begin
  -- A site is identified by a lot number, a street number, or both — never neither.
  -- Before titles are issued there is only "Lot 3"; afterwards there is "28".
  if not exists (select 1 from pg_constraint where conname = 'addresses_has_a_number') then
    alter table addresses add constraint addresses_has_a_number
      check (num_nonnulls(lot_number, street_number) >= 1);
  end if;

  -- Council is required — conditionally, which is the honest form of the rule.
  --
  -- `council` is an enum of the 68 SA councils, and 0003 already forbids one outside
  -- SA. A flat NOT NULL would therefore make an interstate address impossible to
  -- enter at all: there would be no valid value for it. This says what is actually
  -- true — a South Australian address must name its council — so every address today
  -- has one, and the day Lofty builds in Victoria that row simply has none.
  if not exists (select 1 from pg_constraint where conname = 'addresses_council_required_in_sa') then
    alter table addresses add constraint addresses_council_required_in_sa
      check (state <> 'SA' or council is not null);
  end if;
end $$;

-- --------------------------------------------- postcode joins the searchable string
-- consolidated_address is what the trigram index covers and what every card, export
-- and search reads. A postcode nobody can search for is a postcode nobody will trust.
create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.consolidated_address :=
    coalesce(new.street_2 || ', ', '') ||
    coalesce(new.lot_number || ' ', '') ||
    coalesce(new.street_number || ' ', '') ||
    new.street_1 || ', ' ||
    new.suburb || ' ' || new.state::text || ' ' || new.postcode || ', ' ||
    new.country::text;
  return new;
end $$;

-- The lot number is in the string now too. "Lot 3 Corner Street" is what the job is
-- called for months before it becomes "28 Corner Street", and it is what people type
-- into search long after.

-- ============================================================================
-- address_history — every name a record has had, and when it stopped applying
-- ============================================================================
-- Holds superseded assignments only: the link and the period, never a copy of the
-- address. The text lives once, in `addresses`.
--
-- Why the two columns on projects and jobs are not enough on their own: when
-- current_address_id repoints from "20 Corner Street" to "20A Corner Street", the
-- 20 Corner Street row is orphaned. It still exists and search finds the text, but
-- nothing can say whose it was.
--
-- And why activity_audit cannot stand in, though it does record the change: it is
-- admin-only so nobody else could see the history; the old value sits inside a jsonb
-- blob so "which project was ever at 20 Corner Street" is an unindexed scan; and it
-- is a forensic log rather than a queryable relationship.
create table if not exists address_history (
  -- bigint identity, not a random uuid: this table only grows, is never referenced
  -- by anything, and sequential keys keep the index dense.
  id            bigint generated always as identity primary key,

  -- Exactly one parent. Two real foreign keys rather than a subject_type text
  -- discriminator, so the reference is enforced and the delete cascades.
  project_id    uuid references projects(id) on delete cascade,
  job_id        uuid references jobs(id)     on delete cascade,

  address_id    uuid not null references addresses(id),
  role          text not null check (role in ('original', 'current')),

  valid_from    timestamptz not null,
  valid_to      timestamptz not null,        -- a row only exists once superseded
  changed_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),

  constraint address_history_one_parent check (num_nonnulls(project_id, job_id) = 1),
  constraint address_history_period      check (valid_to >= valid_from)
);

comment on table address_history is
  'Addresses a project or job used to have, with the period each applied. Superseded assignments only — the current and original addresses live in columns on the record itself, so no fact is stored twice. This is what makes "12 Test Street" still find project 1042 years after it became "20 Corner Street".';

-- Foreign keys are not indexed automatically, and both are also the access path:
-- "the history for this record". Partial, because only one of the two is ever set,
-- so a full index would be half dead entries.
create index if not exists address_history_project_idx
  on address_history (project_id, valid_to desc) where project_id is not null;
create index if not exists address_history_job_idx
  on address_history (job_id, valid_to desc) where job_id is not null;

-- The other direction: "which record was ever at this address", used by search.
create index if not exists address_history_address_idx on address_history (address_id);

-- ------------------------------------------------------------------------- RLS
alter table address_history enable row level security;

-- Readable by anyone the app lets in, like the addresses themselves. Writing is the
-- trigger's job when a record's address changes, so there is no insert policy — the
-- same posture as activity_audit and job_stage_events.
--
-- is_active_user() is wrapped in a select so the planner evaluates it once per
-- statement rather than once per row.
create policy "read address history" on address_history
  for select to authenticated
  using ((select is_active_user()));

-- Correcting history is an admin act, and rare enough to be worth noticing.
create policy "admins correct address history" on address_history
  for update to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');

create policy "admins delete address history" on address_history
  for delete to authenticated
  using ((select current_permission()) >= 'admin');
