-- =============================================================================
-- 0026 — teams stop being a type and become rows, and membership gets a role
-- =============================================================================
-- 0022 folded `profile_teams` into a `profiles.teams team[]` array. Its stated test
-- was "does the membership row carry attributes of its own?" — `is_primary` was
-- constant, so the array won.
--
-- That test now gives the opposite answer. **Whether someone manages a team is an
-- attribute of the membership**, and Deanna is a member of four teams while managing
-- three. Same rule, new fact, opposite conclusion. Two parallel arrays (`teams` plus
-- `managed_teams`) would be the cheaper change, but they can disagree — someone
-- managing a team they are not in — and a table cannot express that.
--
-- The `team` enum goes at the same time, for a reason 0014 taught the hard way: an
-- enum value can be added but never removed. `Commercial`, `Executive` and `Admin`
-- were added to the type and are not teams; as enum values they are permanent, as
-- rows they can simply be retired.
--
-- ---------------------------------------------------------------- what is seeded
-- Fifteen rows, matching the enum exactly so nothing is lost:
--
--   * twelve active — the eleven from 0004 plus Lofty General
--   * three inactive — Commercial, Executive and Admin
--
-- Four people were sitting in those three: Ben Johnson (Commercial), Gary Patel
-- (Executive), Laoise Kurmelovs and Nicole Carle (Admin). Amber's instruction was that
-- they are all Lofty General, so they are moved rather than left pointing at a retired
-- team — see "the four reassignments" below. After that the three retired teams have no
-- members at all, which is what "not a team" should look like.
--
-- Scheduling and Sales Admin stay active with nobody in them. That is a real state, not
-- an error: the team exists and work will be assigned to it.
--
-- The enum type itself is NOT dropped here. `profiles.teams` is the only column using
-- it, and dropping a type while a column still depends on it fails; the column goes at
-- the end of this migration, so the drop is safe by then. Left in place regardless so
-- 0027 can be reverted independently.
--
-- ------------------------------------- why profile_teams is here and not in Phase C
-- The batch tables in both the plan and the artifact put `profile_teams` with the
-- permission model, in Phase C. The narrative sections of both say the opposite — "the
-- enum-to-table conversion rides along on this migration" — and the narrative is right,
-- because the batch tables do not account for what `profiles.teams` becomes in the
-- meantime.
--
-- The `team` enum cannot be dropped while a column still uses it, and `profiles.teams`
-- is that column. So deferring `profile_teams` leaves exactly two options, and both are
-- worse:
--
--   * convert `profiles.teams` to `text[]` and write a trigger validating it against
--     `teams` — a trigger built only to be deleted when Phase C lands; or
--   * drop `profiles.teams` now and have nobody in a team until Phase C, which throws
--     away the only real data in the database.
--
-- Doing it now costs nothing extra: the 47-row table is the one thing that is expensive
-- to touch, and this way it is touched once rather than twice. What genuinely waits for
-- Phase C is what *reads* this table — private.my_teams(), my_managed_teams(), and the
-- policies built on them. The table can exist without them; they cannot exist without it.
-- =============================================================================

-- moddatetime is a contrib module, already installed on the live project in the
-- `extensions` schema (checked before writing this). It takes the column name as a
-- trigger argument, which the prefix convention needs: `updated_at` has a different
-- name on every table, so one shared plpgsql function cannot maintain it.
--
-- CREATE EXTENSION ... WITH SCHEMA does NOT relocate an already-installed extension —
-- the clause is ignored when it exists — so this establishes it on a fresh database and
-- is inert on live, where it is already where it needs to be.
create extension if not exists moddatetime with schema extensions;

-- ---------------------------------------------------------------------- teams
create table if not exists teams (
  -- A slug, not an integer and not the display name. The name is renameable — "Pre-
  -- Construction Admin" may well become something else — and every row that points at
  -- a team should not have to be rewritten when it does. A slug also reads in a query
  -- result without a join, which an integer id does not.
  team_id        text primary key check (team_id ~ '^[a-z][a-z0-9_]*$'),

  team_name      text not null unique,
  team_position  smallint not null,

  -- Retirement, not deletion. A team that stops existing still owns years of history,
  -- so it is hidden from pickers rather than removed. This is the whole reason the
  -- enum had to go: `alter type ... drop value` does not exist.
  team_is_active boolean not null default true,

  team_created_at timestamptz not null default now(),
  team_created_by uuid references profiles(id),
  team_updated_at timestamptz not null default now(),
  team_updated_by uuid references profiles(id)
);

comment on table teams is
  'The teams work is assigned to and permissions are scoped by. A lookup table rather than a Postgres enum, because the list has already changed twice and an enum value can be added but never removed — retiring a team has to be possible without a type migration.';

insert into teams (team_id, team_name, team_position, team_is_active) values
  ('acquisition_development', 'Acquisition & Development',  1, true),
  ('sales_admin',            'Sales Admin',                 2, true),
  ('design',                 'Design',                      3, true),
  ('pre_construction_admin', 'Pre-Construction Admin',      4, true),
  ('scheduling',             'Scheduling',                  5, true),
  ('selections',             'Selections',                  6, true),
  ('estimating',             'Estimating',                  7, true),
  ('construction',           'Construction',                8, true),
  ('construction_admin',     'Construction Admin',          9, true),
  ('finance',                'Finance',                    10, true),
  ('maintenance',            'Maintenance',                11, true),
  ('lofty_general',          'Lofty General',              12, true),
  -- Retired: added to the enum by 0014, but they are not teams. Seeded anyway so the
  -- memberships that exist right now resolve while they are being reassigned below,
  -- and so the history in activity_audit still has something to point at.
  ('commercial',             'Commercial',                 90, false),
  ('executive',              'Executive',                  91, false),
  ('admin',                  'Admin',                      92, false)
on conflict (team_id) do nothing;

-- ------------------------------------------------------------- profile_teams
create table if not exists profile_teams (
  profile_id uuid not null references profiles(id) on delete cascade,

  -- on update cascade because team_id is a natural key: renaming a slug should not
  -- orphan every membership. It should never fire — slugs are not meant to change —
  -- but the cost of having it is nothing and the cost of not having it is a manual
  -- repair under pressure.
  team_id    text not null references teams(team_id) on update cascade,

  -- The attribute that justifies this table existing at all. A manager has full CRUD
  -- over the work of the teams they manage; a member does not.
  profile_team_role text not null default 'member'
    check (profile_team_role in ('member', 'manager')),

  -- Which team a person is "in" when only one can be shown — a card byline, a default
  -- board filter. Not enforced as at-most-one here: see the partial unique index below.
  profile_team_is_primary boolean not null default false,

  profile_team_created_at timestamptz not null default now(),
  profile_team_created_by uuid references profiles(id),
  profile_team_updated_at timestamptz not null default now(),
  profile_team_updated_by uuid references profiles(id),

  primary key (profile_id, team_id)
);

comment on table profile_teams is
  'Who is in which team, and whether they manage it. Restored from the array 0022 replaced it with: managing a team is an attribute of the membership, and someone can be a member of four teams while managing three, which two parallel arrays cannot express without being able to disagree.';

-- At most one primary team per person. Partial, so the many false rows cost nothing.
create unique index if not exists profile_teams_one_primary
  on profile_teams (profile_id) where profile_team_is_primary;

-- The reverse direction — "everyone in Design" — and the access path for the RLS
-- helpers that will read this table in the permissions batch.
create index if not exists profile_teams_team_idx on profile_teams (team_id);

-- Managers are looked up on their own: "which teams does this person manage".
create index if not exists profile_teams_manager_idx
  on profile_teams (profile_id) where profile_team_role = 'manager';

-- ------------------------------------------------------- carry the 47 people over
-- Every membership currently in the array becomes a row. Nobody is seeded as a
-- manager: who manages what is not recorded anywhere today, so inventing it would be
-- worse than leaving it for a person to set. Every membership lands as 'member'.
insert into profile_teams (profile_id, team_id)
select p.id,
       case t::text
         when 'Acquisition & Development' then 'acquisition_development'
         when 'Sales Admin'               then 'sales_admin'
         when 'Design'                    then 'design'
         when 'Pre-Construction Admin'    then 'pre_construction_admin'
         when 'Scheduling'                then 'scheduling'
         when 'Selections'                then 'selections'
         when 'Estimating'                then 'estimating'
         when 'Construction'              then 'construction'
         when 'Construction Admin'        then 'construction_admin'
         when 'Finance'                   then 'finance'
         when 'Maintenance'               then 'maintenance'
         when 'Lofty General'             then 'lofty_general'
         when 'Commercial'                then 'commercial'
         when 'Executive'                 then 'executive'
         when 'Admin'                     then 'admin'
       end
from profiles p, unnest(p.teams) as t
on conflict (profile_id, team_id) do nothing;

-- Prove nothing was dropped on the floor, before anything is reassigned. If the CASE
-- above ever misses a label the insert writes a null and fails the not-null — loud, and
-- fine. A silent miscount is the failure worth catching, so this aborts the migration
-- rather than leaving somebody quietly teamless.
do $$
declare
  from_array integer;
  from_rows  integer;
begin
  select count(*) into from_array from profiles p, unnest(p.teams) as t;
  select count(*) into from_rows  from profile_teams;
  if from_array <> from_rows then
    raise exception 'team membership lost in migration: % in the array, % in rows',
      from_array, from_rows;
  end if;
end $$;

-- ------------------------------------------------------- the four reassignments
-- Commercial, Executive and Admin are retired above, and these four were the only
-- people in them. Amber: "they are all Lofty General."
--
-- Written as four named moves rather than `where team_id in (...)` on purpose. A rule
-- would silently catch anyone added to those teams between this being written and it
-- being applied; four names cannot. If a row has since changed hands it simply does not
-- match, and the straggler check below fails loudly instead of guessing.
with reassigned as (
  delete from profile_teams pt
  using profiles p
  where pt.profile_id = p.id
    and pt.team_id in ('commercial', 'executive', 'admin')
    and lower(p.email) in (
      'ben@loftygroup.com.au',   -- Ben Johnson, Commercial Development Executive
      'gary@lofty.com.au',       -- Gary Patel, Director
      'reception@lofty.com.au',  -- Laoise Kurmelovs, Reception & Administrative Assistant
      'nicole@lofty.com.au'      -- Nicole Carle, Executive Assistant to the Director
    )
  returning pt.profile_id
)
insert into profile_teams (profile_id, team_id)
select distinct profile_id, 'lofty_general' from reassigned
on conflict (profile_id, team_id) do nothing;

-- Nobody should be left in a retired team. If this fires, someone was added to one
-- after this migration was written and needs a decision, not a default.
do $$
declare
  stragglers integer;
begin
  select count(*) into stragglers
  from profile_teams where team_id in ('commercial', 'executive', 'admin');
  if stragglers > 0 then
    raise exception
      '% membership(s) still point at a retired team. Reassign them explicitly rather than widening the rule above.',
      stragglers;
  end if;
end $$;

-- -------------------------------------------------------------------- the RLS
alter table teams enable row level security;
alter table profile_teams enable row level security;

-- Everyone signed in can see the team list — it is a picker, and the names are on
-- every card already.
create policy "read teams" on teams
  for select to authenticated
  using ((select is_active_user()));

-- INSERT and UPDATE, deliberately NOT DELETE. This table's whole argument is
-- "retirement, not deletion": a deleted team dangles in every job_engaged_teams array
-- that named it, and because that array is validated on every write, the job then
-- becomes permanently un-editable. team_is_active is the supported way to retire one.
create policy "admins add teams" on teams
  for insert to authenticated
  with check ((select current_permission()) >= 'admin');
create policy "admins edit teams" on teams
  for update to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');

-- Who is in which team is not private either — the app shows it on every profile.
create policy "read profile teams" on profile_teams
  for select to authenticated
  using ((select is_active_user()));

-- Writing membership stays admin-only, matching profiles: 0019 made profile writes
-- admin-only, and moving someone between teams changes what they can see once the
-- permissions batch lands. A manager adding people to their own teams is a Phase C
-- change that needs private.my_managed_teams() to exist first.
create policy "admins write profile teams" on profile_teams
  for all to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');

-- --------------------------------------------------------- keeping updated_at honest
-- Both tables declare an updated_at, and a column that is always equal to created_at is
-- worse than no column at all: it will be read as fact. moddatetime maintains them.
create trigger teams_touch before update on teams
  for each row execute function extensions.moddatetime(team_updated_at);
create trigger profile_teams_touch before update on profile_teams
  for each row execute function extensions.moddatetime(profile_team_updated_at);

-- ---------------------------------------------------- retire the array and its trigger
drop trigger if exists profiles_normalise_teams on profiles;
drop function if exists normalise_profile_teams();
drop index if exists profiles_teams_idx;
alter table profiles drop column if exists teams;

-- The `team` enum type is now unused. Left in place deliberately rather than dropped:
-- nothing costs anything to keep an unused type, and 0027 renames every column in the
-- schema — keeping this migration reversible on its own is worth more than tidiness.
-- It is dropped in the batch that adds job_owning_team, which is the first migration
-- that would otherwise be tempted to reach for it.
