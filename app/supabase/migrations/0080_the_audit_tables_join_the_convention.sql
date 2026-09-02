-- =============================================================================
-- 0080 — the audit tables join the convention, and every table joins the audit
-- =============================================================================
-- Amber, 1 September, evening: *"every change to a job or project is audited and
-- recorded and you can see user activity and what changed and by who and when… activity
-- audit needs to be visible on front end as read only so everyone can see who made what
-- changes and when from what to what… record history is viewable for everything and
-- everyone except for restricted fields."* And, via the best-practices skill: every
-- attribute is `tablename_attribute`.
--
-- Two of the oldest tables predate that rule. `activity_audit` carried `id`,
-- `changed_at`, `old_row`; `login_activity` carried `user_id`, `occurred_at`. And
-- `user_preferences` (0050) prefixed its columns with the PLURAL. Measured, not
-- asserted: all 79 migrations replayed and every column in `public` checked — these
-- three tables were the only misses. Renamed here, while two repository methods are the
-- only readers.
--
-- THE ALLOWLIST GOES
--
--   log_activity_audit() ignored any table not named in a list inside its own body. So
--   attaching the trigger to a new table did nothing until somebody also edited the
--   function — and twice nobody did (0043's property_defs; 0077 says so). 12 of 45 tables
--   were audited. The function now logs whatever fires it, the trigger is attached to
--   every table in `public` except the six that ARE logs, and a verify check asserts that
--   the set stays complete. A new table cannot be silently unaudited again.
--
--   The six exceptions, each already a history of something else: activity_audit and
--   login_activity (the logs themselves), activity_events, property_value_history,
--   job_stage_events, address_history (append-only, trigger-written).
--
-- FOUR COLUMNS EXTRACTED AT WRITE TIME
--
--   activity_audit_profile_id   who, as a profile — jwt_sub is an auth uid, and every
--                               reader had to join it back through profiles
--   activity_audit_job_id       which job the change was on, resolved from the row —
--   activity_audit_project_id   directly when the row carries the id, through the task,
--                               variation, process run or comment when it does not
--   activity_audit_origin       'app' unless a sync worker set `app.sync_origin`; the
--                               loop guard the sync design (schema-plan) depends on
--
--   With the first three, a record's history is an index lookup across EVERY table —
--   the task renamed, the property recorded, the process started, the comment edited —
--   instead of two jsonb-path scans over projects and jobs. No FK on job or project:
--   the history must survive the record's deletion, the same reasoning as
--   property_value_history.
--
-- WHO MAY READ
--
--   0058 let an active user read the projects and jobs slice; 0009 let admins read all.
--   Amber's rule is everything and everyone except restricted fields, so: an active user
--   reads every row EXCEPT a property value they may not read (the same
--   private.property_keys('read') the value policy uses), an internal comment (0064's
--   admin lane), and the two personal tables (saved_views, user_preferences). Admins
--   read all. Profiles rows are readable — every active user already reads every profile
--   column live, so its history leaks nothing new — and that is noted as a decision, not
--   slipped in.
-- =============================================================================

-- ---------------------------------------------------------- the renames
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'activity_audit' and column_name = 'id') then
    alter table activity_audit rename column id          to activity_audit_id;
    alter table activity_audit rename column schema_name to activity_audit_schema;
    alter table activity_audit rename column table_name  to activity_audit_table;
    alter table activity_audit rename column operation   to activity_audit_operation;
    alter table activity_audit rename column changed_at  to activity_audit_at;
    alter table activity_audit rename column txid        to activity_audit_txid;
    alter table activity_audit rename column changed_by  to activity_audit_role;
    alter table activity_audit rename column jwt_sub     to activity_audit_jwt_sub;
    alter table activity_audit rename column old_row     to activity_audit_old_row;
    alter table activity_audit rename column new_row     to activity_audit_new_row;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'login_activity' and column_name = 'id') then
    alter table login_activity rename column id          to login_activity_id;
    alter table login_activity rename column user_id     to login_activity_user_id;
    alter table login_activity rename column email       to login_activity_email;
    alter table login_activity rename column event_type  to login_activity_event_type;
    alter table login_activity rename column occurred_at to login_activity_at;
    alter table login_activity rename column metadata    to login_activity_metadata;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_preferences' and column_name = 'user_preferences_payload') then
    alter table user_preferences rename column user_preferences_payload    to user_preference_payload;
    alter table user_preferences rename column user_preferences_created_at to user_preference_created_at;
    alter table user_preferences rename column user_preferences_updated_at to user_preference_updated_at;
    alter table user_preferences rename constraint user_preferences_payload_is_an_object to user_preferences_payload_is_an_object_renamed;
    alter table user_preferences rename constraint user_preferences_payload_is_an_object_renamed to user_preference_payload_is_an_object;
  end if;
end $$;

-- moddatetime takes the column NAME as a trigger argument — a string, which a rename does
-- not follow. Left alone, the first preference saved after this migration would fail with
-- "column user_preferences_updated_at does not exist". Policies and indexes are parsed
-- trees and followed the rename on their own.
drop trigger if exists user_preferences_touch on user_preferences;
create trigger user_preferences_touch before update on user_preferences
  for each row execute function extensions.moddatetime(user_preference_updated_at);

-- ---------------------------------------------------------- the new columns
alter table activity_audit
  add column if not exists activity_audit_profile_id uuid,
  add column if not exists activity_audit_job_id     text,
  add column if not exists activity_audit_project_id integer,
  add column if not exists activity_audit_origin     text not null default 'app';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activity_audit_origin_is_a_slug') then
    alter table activity_audit add constraint activity_audit_origin_is_a_slug
      check (activity_audit_origin ~ '^[a-z][a-z0-9_]{0,39}$');
  end if;
end $$;

comment on column activity_audit.activity_audit_id         is 'One row per insert, update or delete on any table in public except the six logs. Identity.';
comment on column activity_audit.activity_audit_schema     is 'Always public — the function refuses anything else.';
comment on column activity_audit.activity_audit_table      is 'Which table changed.';
comment on column activity_audit.activity_audit_operation  is 'INSERT, UPDATE or DELETE.';
comment on column activity_audit.activity_audit_at         is 'When. The timestamp every reconstruction of time-in-stage measures between.';
comment on column activity_audit.activity_audit_txid       is 'The transaction, so the rows of one save can be grouped.';
comment on column activity_audit.activity_audit_role       is 'The database role that made the change (authenticated, postgres…). Who the PERSON was is activity_audit_profile_id.';
comment on column activity_audit.activity_audit_jwt_sub    is 'auth.uid() as text at write time. Kept for rows older than activity_audit_profile_id and for the people-activity report, which reads it directly.';
comment on column activity_audit.activity_audit_old_row    is 'The whole row as it was, redacted of credentials. Null on insert.';
comment on column activity_audit.activity_audit_new_row    is 'The whole row as it became, redacted. Null on delete.';
comment on column activity_audit.activity_audit_profile_id is 'Who, as a profile. Resolved from auth.uid() at write time; null for a migration, a seed or a trigger with nobody behind it. No FK — the history outlives the account.';
comment on column activity_audit.activity_audit_job_id     is 'The job the change was on, resolved from the row: directly, or through its task, variation, process run or comment. Null when the change was not about a job. No FK — history outlives the record.';
comment on column activity_audit.activity_audit_project_id is 'The project, the same way; a job''s change carries its project too, so a project''s history includes its jobs''. No FK.';
comment on column activity_audit.activity_audit_origin     is 'Where the write came from: app, or the slug of the sync worker that set app.sync_origin. The loop guard: a system''s own changes are never sent back to it.';

comment on column login_activity.login_activity_id         is 'One row per authentication event, written from auth.users by log_login_activity_from_auth_users().';
comment on column login_activity.login_activity_user_id    is 'Who signed in (auth.users.id).';
comment on column login_activity.login_activity_email      is 'Denormalised beside the id so the row survives the account''s deletion.';
comment on column login_activity.login_activity_event_type is 'SIGNUP or LOGIN.';
comment on column login_activity.login_activity_at         is 'When.';
comment on column login_activity.login_activity_metadata   is 'The provider and nothing else (0008).';

comment on column user_preferences.user_preference_payload is 'The bag: landing page, default view. One row per person, owner-only by RLS.';

-- ---------------------------------------------------------- which record a row is about
-- Resolves a job and a project from the audited row. Direct when the row carries the id;
-- one hop through tasks, variations, process_runs or comments when it does not. Every
-- cast is guarded: a row whose `task_id` is not a uuid yields nulls, never an error, because
-- an error here would roll back the write it was recording.
create or replace function private.audit_record_ids(p_table text, r jsonb, out job_id text, out project_id integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t text;
begin
  job_id := null; project_id := null;
  if r is null then return; end if;

  job_id := nullif(r ->> 'job_id', '');
  t := r ->> 'project_id';
  if t ~ '^[0-9]+$' then project_id := t::integer; end if;

  begin
    if job_id is null and project_id is null then
      if r ? 'task_id' and p_table <> 'tasks' then
        select tk.job_id, tk.project_id into job_id, project_id
          from tasks tk where tk.task_id = (r ->> 'task_id')::uuid;
      elsif r ? 'variation_id' and p_table <> 'variations' then
        select v.job_id into job_id from variations v where v.variation_id = (r ->> 'variation_id')::uuid;
      elsif r ? 'process_run_id' and p_table <> 'process_runs' then
        select pr.job_id, pr.project_id into job_id, project_id
          from process_runs pr where pr.process_run_id = (r ->> 'process_run_id')::uuid;
      elsif r ? 'comment_id' and p_table <> 'comments' then
        select c.job_id, c.project_id into job_id, project_id
          from comments c where c.comment_id = (r ->> 'comment_id')::uuid;
        if job_id is null and project_id is null then
          select ids.job_id, ids.project_id into job_id, project_id
            from comments c, private.audit_record_ids('comments', to_jsonb(c)) ids
           where c.comment_id = (r ->> 'comment_id')::uuid;
        end if;
      end if;
    end if;
    if project_id is null and job_id is not null then
      select j.project_id into project_id from jobs j where j.job_id = audit_record_ids.job_id;
    end if;
  exception when others then
    -- A malformed id, a parent already cascaded away: the row is still logged, with what
    -- could be resolved.
    null;
  end;
end $$;

revoke execute on function private.audit_record_ids(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------- the function, without its list
create or replace function log_activity_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  snapshot jsonb;
  rec record;
  who uuid;
  origin text;
begin
  if tg_table_schema <> 'public' then
    return null;
  end if;

  snapshot := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select ids.job_id, ids.project_id into rec from private.audit_record_ids(tg_table_name, snapshot) ids;
  select profile_id into who from profiles where profile_auth_user_id = auth.uid() limit 1;
  origin := coalesce(nullif(current_setting('app.sync_origin', true), ''), 'app');

  insert into public.activity_audit
    (activity_audit_schema, activity_audit_table, activity_audit_operation,
     activity_audit_old_row, activity_audit_new_row,
     activity_audit_profile_id, activity_audit_job_id, activity_audit_project_id, activity_audit_origin)
  values
    (tg_table_schema, tg_table_name, tg_op,
     case when tg_op = 'INSERT' then null else redact_audit_row(to_jsonb(old)) end,
     case when tg_op = 'DELETE' then null else redact_audit_row(to_jsonb(new)) end,
     who, rec.job_id, rec.project_id, origin);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke execute on function log_activity_audit() from public, anon, authenticated;

-- ---------------------------------------------------------- the trigger, everywhere
-- Attached to every table in public that is not itself a log. Written as a loop rather than
-- a list, so the table added next month is covered the day it is created — provided this
-- block is re-run, which is what the verify check is for: it FAILs the moment a table is
-- missing the trigger, and the fix is one line here.
create or replace function private.audit_exempt_tables() returns text[]
language sql immutable as $$
  select array['activity_audit', 'login_activity', 'activity_events',
               'property_value_history', 'job_stage_events', 'address_history']
$$;

do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname <> all (private.audit_exempt_tables())
  loop
    execute format('drop trigger if exists trg_activity_audit_row on %I', t.relname);
    execute format('create trigger trg_activity_audit_row after insert or update or delete on %I
                      for each row execute function log_activity_audit()', t.relname);
  end loop;
end $$;

-- ---------------------------------------------------------- backfill
-- The rows already written get their record and their person, from what they already hold.
update activity_audit a
   set activity_audit_job_id     = s.job_id,
       activity_audit_project_id = s.project_id
  from (select x.activity_audit_id, ids.job_id, ids.project_id
          from activity_audit x
          cross join lateral private.audit_record_ids(x.activity_audit_table, coalesce(x.activity_audit_new_row, x.activity_audit_old_row)) ids
         where x.activity_audit_job_id is null and x.activity_audit_project_id is null) s
 where s.activity_audit_id = a.activity_audit_id
   and (s.job_id is not null or s.project_id is not null);

update activity_audit a
   set activity_audit_profile_id = p.profile_id
  from profiles p
 where a.activity_audit_profile_id is null
   and a.activity_audit_jwt_sub is not null
   and p.profile_auth_user_id::text = a.activity_audit_jwt_sub;

-- ---------------------------------------------------------- indexes
-- A record's history is (record, newest first). Partial: most rows about a job also
-- carry the project, and the index only needs the rows that have one.
create index if not exists activity_audit_job_at_idx
  on activity_audit (activity_audit_job_id, activity_audit_at desc) where activity_audit_job_id is not null;
create index if not exists activity_audit_project_at_idx
  on activity_audit (activity_audit_project_id, activity_audit_at desc) where activity_audit_project_id is not null;
create index if not exists activity_audit_profile_at_idx
  on activity_audit (activity_audit_profile_id, activity_audit_at desc) where activity_audit_profile_id is not null;
-- The sync cursors read forward by id from a watermark; the primary key serves that.

-- ---------------------------------------------------------- who may read
drop policy if exists "read activity_audit" on activity_audit;
drop policy if exists "read activity on projects and jobs" on activity_audit;
drop policy if exists "admins read all activity" on activity_audit;
drop policy if exists "read activity except restricted" on activity_audit;

create policy "admins read all activity" on activity_audit
  for select to authenticated
  using ((select current_permission()) >= 'admin');

create policy "read activity except restricted" on activity_audit
  for select to authenticated
  using (
    (select is_active_user())
    and activity_audit_table <> all (array['saved_views', 'user_preferences'])
    and (activity_audit_table <> 'property_values'
         or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'property_def_key'
            = any ((select private.property_keys('read'))::text[]))
    and (activity_audit_table <> 'comments'
         or not coalesce((coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'comment_is_internal')::boolean, false))
  );

comment on table activity_audit is
  'The change log: one row per insert, update and delete on every table in public except the six that are themselves logs, whole rows before and after as jsonb, with the person, the job and the project extracted at write time so a record''s history is an index lookup. Readable by every active user except restricted property values, internal comments and the two personal tables (0080, Amber: "everything and everyone except for restricted fields"); admins read all. Also the change feed the sync cursors read.';

-- ---------------------------------------------------------- the login trigger learns the names
-- plpgsql is text; the rename does not reach inside it. This is the exact write that broke
-- sign-in for an hour after 0028 (0033), so it is rewritten here and proved in
-- behaviour.sql §35, which simulates a sign-in end to end.
create or replace function public.log_login_activity_from_auth_users()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.login_activity (login_activity_user_id, login_activity_email, login_activity_event_type, login_activity_at, login_activity_metadata)
    values (new.id, new.email, 'SIGNUP', coalesce(new.created_at, now()),
            jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));

    update public.profiles
       set profile_last_login_at = coalesce(new.last_sign_in_at, new.created_at, now())
     where profile_auth_user_id = new.id;

    return new;

  elsif tg_op = 'UPDATE' then
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      insert into public.login_activity (login_activity_user_id, login_activity_email, login_activity_event_type, login_activity_at, login_activity_metadata)
      values (new.id, new.email, 'LOGIN', new.last_sign_in_at,
              jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));

      update public.profiles
         set profile_last_login_at = new.last_sign_in_at
       where profile_auth_user_id = new.id;
    end if;
    return new;
  end if;
  return null;
end $function$;

-- ---------------------------------------------------------------------- proof
-- Watched here as the owner: coverage is complete, and a change to a task lands in the
-- audit with the job AND the project it belongs to, resolved through the task. Brings its
-- own record, restores the project sequence, leaves nothing behind (0077's pattern).
do $$
declare
  missing text;
  probe_address uuid; probe_project integer; probe_job text; probe_task uuid;
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
  n integer;
begin
  select string_agg(c.relname, ', ' order by c.relname) into missing
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and c.relname <> all (private.audit_exempt_tables())
     and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_activity_audit_row');
  if missing is not null then
    raise exception '0080 proof: tables without the audit trigger: %', missing;
  end if;

  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0080', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully')
  returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design') returning job_id into probe_job;
  insert into tasks (job_id, task_name) values (probe_job, 'probe 0080') returning task_id into probe_task;
  update tasks set task_status = 'in_progress' where task_id = probe_task;

  select count(*) into n from activity_audit
   where activity_audit_table = 'tasks' and activity_audit_operation = 'UPDATE'
     and activity_audit_job_id = probe_job and activity_audit_project_id = probe_project
     and activity_audit_origin = 'app'
     and activity_audit_old_row ->> 'task_status' = 'open'
     and activity_audit_new_row ->> 'task_status' = 'in_progress';
  if n <> 1 then
    raise exception '0080 proof: expected one task audit row carrying its job and project, found %', n;
  end if;

  -- The origin follows the GUC a sync worker would set.
  perform set_config('app.sync_origin', 'probe_sync', true);
  update tasks set task_name = 'probe 0080 renamed' where task_id = probe_task;
  perform set_config('app.sync_origin', '', true);
  select count(*) into n from activity_audit
   where activity_audit_table = 'tasks' and activity_audit_job_id = probe_job and activity_audit_origin = 'probe_sync';
  if n <> 1 then
    raise exception '0080 proof: expected the sync origin on one row, found %', n;
  end if;

  -- Left as found: the probe rows go, and so do their audit rows — a probe is not history.
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from activity_audit where activity_audit_project_id = probe_project
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_id' = probe_address::text);
  perform setval(seq, seq_last, seq_called);
end $$;
