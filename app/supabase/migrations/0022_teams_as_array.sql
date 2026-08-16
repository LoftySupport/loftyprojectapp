-- 0022_teams_as_array.sql
--
-- Fold `profile_teams` into `profiles.teams`, an array of the `team` enum.
--
-- The join table was built for a many-to-many that has never had a many: forty-five
-- people, forty-five rows, nobody on two teams, and `is_primary` true on every one of
-- them — a column whose value is constant is not carrying information. Meanwhile the app
-- has always treated membership as a list: `Profile.teams` is a string array, the picker
-- is a multi-select, and `replaceTeams()` existed only to explode that array into rows and
-- read it back. The array was the real shape; the table was the storage.
--
-- An array of an enum keeps the thing the join table was actually earning its place with.
-- `team` is still an enum, so 'Desgin' is as impossible in `teams` as it was in
-- `profile_teams.team` — this trades a foreign key for a type, not for nothing.
--
-- Three things it buys beyond the join:
--
--   Writes consolidate. 0019 left nothing on `profiles` a non-admin may write, and team
--   membership is an admin decision for the same reason. As a column it inherits that
--   guard automatically instead of being a second policy — "admins write profile_teams" —
--   that somebody has to remember to keep in step with the first.
--
--   The audit reads straight. activity_audit captures whole rows as jsonb, so a team
--   change used to land as a profile_teams row you had to correlate back to a person. It
--   now appears in that person's own before/after.
--
--   The read loses a join. Every profile read embedded profile_teams to flatten it again.
--
-- What it gives up, stated plainly: an array cannot hold per-membership attributes. If a
-- start date or a primary flag that genuinely varies is ever needed, this comes back as a
-- table. `is_primary` was the only such attribute and it was constant, so nothing real is
-- lost today.

-- ------------------------------------------------------------------------- the column
alter table profiles add column if not exists teams team[] not null default '{}';

-- ------------------------------------------------------------------------- the backfill
-- `is_primary` first so that, if a primary ever did vary, it would lead the array. It
-- does not vary today; ordering on it costs nothing and means the array is not silently
-- reordered relative to what the old table said was first.
update profiles p
   set teams = coalesce(sub.teams, '{}')
  from (
    select profile_id, array_agg(team order by is_primary desc, team) as teams
      from profile_teams
     group by profile_id
  ) sub
 where sub.profile_id = p.id;

-- ------------------------------------------------------------------------- normalising
-- An array will happily store {Design, Design}, which a join table's primary key made
-- impossible. A trigger rather than a CHECK because deduplicating needs a subquery and
-- CHECK constraints may not contain one.
--
-- Nulls are stripped rather than rejected: a multi-select that emits a trailing null is a
-- UI bug, and failing the whole write over it would lose the four teams the user did pick.
-- A duplicate or a null in the input is not a disagreement worth raising to a person.
create or replace function normalise_profile_teams()
returns trigger
language plpgsql
as $$
begin
  if new.teams is null then
    new.teams := '{}';
  else
    select coalesce(array_agg(distinct t order by t), '{}')
      into new.teams
      from unnest(new.teams) as t
     where t is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_normalise_teams on profiles;
create trigger profiles_normalise_teams
  before insert or update of teams on profiles
  for each row execute function normalise_profile_teams();

-- ------------------------------------------------------------------------------ reading
-- GIN, because the question asked of this column is "who is in this team" — `teams &&
-- array['Design']::team[]`, which is a containment test a b-tree cannot serve. Forty-five
-- rows do not need an index; the permission scopes that will read it do.
create index if not exists profiles_teams_idx on profiles using gin (teams);

-- ------------------------------------------------------------------- the audit's scope
-- Repeated in full rather than altered in place, the same way 0013 and 0017 did it: the
-- list of audited tables should be readable in one piece, and `profile_teams` must come
-- out of it before the table does — a guard naming a relation that no longer exists reads
-- as an oversight to the next person, and invites them to recreate it.
create or replace function log_activity_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('profiles', 'addresses', 'projects', 'jobs') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, null, redact_audit_row(to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op,
            redact_audit_row(to_jsonb(old)), redact_audit_row(to_jsonb(new)));
    return new;
  else
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, redact_audit_row(to_jsonb(old)), null);
    return old;
  end if;
end;
$$;

-- --------------------------------------------------------------------------- the table
-- The history of who was in which team is not lost with it: activity_audit holds every
-- insert and delete profile_teams ever took, as whole rows. Dropping the table does not
-- touch that log.
--
-- CASCADE because the table owns dependents that must go with it — its policies, its two
-- indexes and its audit trigger — and each is meaningless once the table is gone. Nothing
-- outside it references the table: the app's only reader was the embed removed alongside
-- this migration.
drop table if exists profile_teams cascade;

comment on column profiles.teams is
  'Teams this person sits in. An array of the team enum since 0022, which folded in the profile_teams join table — that table had forty-five rows for forty-five people and an is_primary that was true on all of them. Normalised on write: sorted, deduplicated, nulls stripped. Admin-set, like every other column here.';

comment on table activity_audit is
  'Row-level change log for the four business tables — profiles, addresses, projects, jobs. trg_activity_audit_row fires after every insert, update and delete and log_activity_audit writes the before and after rows as jsonb, redacted. Because it captures whole rows it is also where stage history lives now that job_stages is gone: an update changing jobs.stage leaves old_row->>''stage'', new_row->>''stage'' and changed_at. Append-only — the trigger is SECURITY DEFINER and there is no insert policy, so nothing but the database can write to it. profile_teams was the fifth table until 0022 folded it into profiles.teams; the rows it wrote before then are still here.';
