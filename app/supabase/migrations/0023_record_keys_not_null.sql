-- 0023_record_keys_not_null.sql
--
-- Make the things that identify a record actually required, and give `created_by` an
-- answer it can always give.
--
-- Both tables are empty as this is written — zero projects, zero jobs — which is the only
-- comfortable moment to do this. Every constraint below would otherwise need a backfill
-- and a decision about what the old rows should have said.
--
-- Two of the four things asked for were already true, and are left alone rather than
-- restated:
--
--   `projects.project_no` is `integer not null unique default nextval('project_no_seq')`
--   with a check of >= 1000 and a trigger that pushes the sequence past a hand-typed
--   override. Sequential and unique since 0001.
--
--   `jobs.job_number` already carries `unique (job_number)`, alongside
--   `unique (project_id, job_sequence)`. So 1001-01 and 1001-02 cannot collide, and the
--   sequence within a project cannot be reused.
--
-- What was missing is nullability, and an author.

-- ------------------------------------------------------------- the system author first
-- `created_by` has to point at a profile, and the row it defaults to has to exist before
-- anything can default to it.
--
-- `active = false`, deliberately. This is an attribution, not a person: the FK does not
-- care about `active`, but `is_active_user()` does, so a row that can be named as the
-- author of a record cannot also be used to get into the app. The mailbox is real and can
-- complete a Microsoft sign-in — there is a signup for it in login_activity already — and
-- without this it would link to this profile and inherit whatever permission it carries.
-- An admin can flip `active` if support ever needs real access; until then the safe state
-- is the one where signing in as it gets you nothing.
insert into profiles (first_name, last_name, email, login_email, job_title, permission, active)
values ('Lofty', 'Support', 'support@lofty.com.au', null,
        'System account', 'viewer'::permission_level, false)
on conflict do nothing;

-- Resolved once, by email, rather than by hard-coding the uuid: the row above is created
-- here on a fresh database and may already exist on this one, so its id is not knowable
-- from the migration text.
create or replace function support_profile_id() returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from profiles where lower(email) = 'support@lofty.com.au' limit 1
$$;

/** The signed-in person's profile, or null when there is no JWT — a migration or a seed. */
create or replace function current_profile_id() returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from profiles where auth_user_id = auth.uid() limit 1
$$;

-- --------------------------------------------------------------------- stamping the author
-- Nothing set `created_by` before this. Not the app, not a trigger — it was nullable and
-- every insert left it null, so "who made this" had no answer on any row that had ever
-- been written. Making the column NOT NULL without this would have turned that silence
-- into a failed insert on the first project somebody created.
--
-- Three sources, in order: what the caller supplied, who is signed in, and support. The
-- last is what makes NOT NULL safe for migrations, seeds and service-role tooling, none
-- of which have an `auth.uid()` to resolve.
create or replace function stamp_created_by() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.created_by is null then
    new.created_by := coalesce(current_profile_id(), support_profile_id());
  end if;
  return new;
end $$;

create trigger projects_stamp_created_by
  before insert on projects
  for each row execute function stamp_created_by();

create trigger jobs_stamp_created_by
  before insert on jobs
  for each row execute function stamp_created_by();

-- ------------------------------------------------------------------------ the constraints
-- Order matters: the stamping trigger above must exist before created_by is required,
-- and `default_current_address` (0001) already fills each address from the other on both
-- tables, so requiring `original_address_id` does not mean every caller must now supply
-- two addresses — it means a record cannot end up with neither.
alter table projects alter column original_address_id set not null;
alter table projects alter column created_by          set not null;

alter table jobs     alter column original_address_id set not null;
alter table jobs     alter column created_by          set not null;

-- Generated from project_no and job_sequence, both of which are already NOT NULL, so this
-- cannot fail and never could have been null. Declared anyway: a business key that is
-- guaranteed non-null only as a consequence of two other columns is a guarantee the next
-- person has to derive. This one is readable.
alter table jobs     alter column job_number          set not null;

-- ------------------------------------------------------------------ the numbering gap
-- Project numbers were not sequential. They went 1000, 1002, 1004 — every project burned
-- two values.
--
-- `bump_project_no_seq` guards against a hand-typed project_no colliding with the sequence
-- later, which is a real hazard and worth keeping. The fault is that it asked the question
-- with `nextval`, and nextval is not a question — it consumes. So every insert took one
-- value for the row through the column default and a second to compare against, and the
-- second was thrown away.
--
-- `pg_sequence_last_value` reads the same number without advancing it. Null means the
-- sequence has never been called, which has to force the setval: otherwise the very first
-- project, inserted with an explicit 1000, would leave the sequence uncalled and the next
-- default would hand out 1000 again and fail the unique index.
--
-- `>=` rather than `>` for the same reason — after a default-supplied insert the two are
-- equal, and the setval is what marks the value as used.
create or replace function bump_project_no_seq() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if pg_sequence_last_value('project_no_seq'::regclass) is null
     or new.project_no >= pg_sequence_last_value('project_no_seq'::regclass) then
    perform setval('project_no_seq', new.project_no);
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------- old job numbers
-- Jobs that existed before projects did. Their numbers were not `1001-01` — there was no
-- project to be the first half of it — so the generated `job_number` cannot represent
-- them, and rebuilding history to fit the new format would be inventing project numbers
-- that never existed.
--
-- Nullable because it only applies to the ones that came across: a job created in this
-- app has never had another number, and a blank here means exactly that.
--
-- Not unique. It could be, and it is not, because this is data arriving from a system
-- that did not enforce it — a duplicate in the source should land and be visible rather
-- than fail an import and be argued about at 5pm.
alter table jobs add column if not exists old_job_number text;

create index if not exists jobs_old_job_number_idx on jobs (old_job_number)
  where old_job_number is not null;

comment on column jobs.old_job_number is
  'Job number created before projects were introduced. Null for anything created in this app. Kept so a job can still be found by the number people used to quote for it; the current business key is job_number.';

comment on column projects.created_by is
  'Who created the record. Stamped by stamp_created_by() from the signed-in profile, falling back to the Lofty Support system account when there is no JWT — a migration, a seed, or service-role tooling.';

comment on column jobs.created_by is
  'Who created the record. Stamped by stamp_created_by() from the signed-in profile, falling back to the Lofty Support system account when there is no JWT — a migration, a seed, or service-role tooling.';
