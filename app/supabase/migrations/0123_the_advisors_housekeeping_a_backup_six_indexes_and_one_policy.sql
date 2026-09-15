-- 0123 — THE ADVISORS' HOUSEKEEPING: A BACKUP GOES, SIX KEYS GET INDEXES, ONE POLICY ASKS ONCE
--
-- Finding 11 of the 15 September audit (docs/schema/architecture-audit-2026-09-15.md) and
-- Stage 0 of its plan. Three things the Supabase advisors had been reporting, each small,
-- none of them a change to the data model. The only one that needed a decision got it the
-- same day (open-questions.md, decision 10). Amber: *"Yes, drop it"*.
--
-- 1 · private.profiles_backup_pre_batch3 IS DROPPED
--
--   A copy of `profiles` taken by hand on 16 August, before the third batch of column
--   renames, in the old column names (id, first_name, permission, auth_user_id, login_email,
--   teams …). 47 rows then; `profiles` has 47 rows now. No view reads it, no key points at
--   it, and it was never in a migration, so a rebuild from empty has never had it. RLS is
--   off. `private` is not reachable through the API, so the advisor's "critical" is about
--   what the table IS — every person's row, permission level and login email included, in a
--   table nothing guards — rather than about who could reach it today. `if exists`, because
--   the replay has nothing to drop.
--
-- 2 · SIX FOREIGN KEYS GET INDEXES
--
--   The performance advisor lists 142 foreign keys without a covering index. Most are on
--   tables with no rows, and they stay as they are. These six are on the tables the process
--   rebuild (Stages 1 to 3) writes into, and each is a column rows are looked UP BY rather
--   than merely stamped with:
--
--     notifications.notification_type_id                       a type's rows, when its switch is turned
--     process_runs.process_run_waiting_on                       "what is waiting on my team"
--     property_values.property_value_profile_id                 a person's own values
--     report_documents.report_template_id                       a template's documents
--     report_documents.report_document_published_document_id   the published copy, when the document goes
--     tasks.process_task_id                                     the tasks one step created
--
--   Row counts on the day: notifications 4, process_runs 11, property_values 32,
--   report_documents 8, tasks 1. Nothing here is slow today, and none of these can be watched
--   making anything faster. They are here because the FK check that runs when the parent row
--   is deleted or re-keyed scans the child table without one, and because an index on an
--   empty table costs nothing where the same index on a full table later takes a lock the
--   app would notice.
--
--   NOT indexed, on purpose: the `*_created_by`, `*_updated_by`, `*_completed_by`, `*_set_by`
--   and `*_published_by` columns to `profiles`, which are most of the 142. They are stamped
--   with the row and read with the row; nothing lists "everything one person ever created",
--   and a profile is deactivated rather than deleted, so the FK check they would speed up
--   does not run. An index on each would be a write on every insert for a lookup nobody makes.
--
-- 3 · "read own login_activity" ASKS WHO YOU ARE ONCE, NOT ONCE PER ROW
--
--   0009 wrote `user_id = auth.uid() or current_permission() >= 'admin'`. A bare function
--   call in a policy is evaluated for every row the query considers; wrapped in
--   `(select …)` it is an initplan, evaluated once. `login_activity` has 101 rows and a
--   person reads only their own, so this is not slow today either. It is the advisor's
--   `auth_rls_initplan` lint, and this is the one policy in the schema still in the old form:
--   0049 already writes `(select auth.uid())` on `profiles`. Same rows to the same people,
--   and rls.sql now proves the boundary did not move.

-- ================================================================== 1 · the backup
drop table if exists private.profiles_backup_pre_batch3;

-- ================================================================== 2 · the indexes
create index if not exists notifications_type_idx
  on notifications (notification_type_id);
create index if not exists process_runs_waiting_on_idx
  on process_runs (process_run_waiting_on);
create index if not exists property_values_profile_idx
  on property_values (property_value_profile_id);
create index if not exists report_documents_template_idx
  on report_documents (report_template_id);
create index if not exists report_documents_published_document_idx
  on report_documents (report_document_published_document_id);
create index if not exists tasks_process_task_idx
  on tasks (process_task_id);

-- ================================================================== 3 · the policy
drop policy if exists "read own login_activity" on login_activity;
create policy "read own login_activity" on login_activity for select to authenticated
  using (login_activity_user_id = (select auth.uid())
         or (select current_permission()) >= 'admin');

-- ---------------------------------------------------------------------- proof
-- Each of the three was watched failing against the live database before this file was
-- applied: the backup was there, none of the six indexes existed, and the policy's
-- expression carried the bare auth.uid(). Each failure names its thing.
do $$
declare
  missing text;
  expr text;
begin
  if to_regclass('private.profiles_backup_pre_batch3') is not null then
    raise exception '0123 proof: private.profiles_backup_pre_batch3 is still there';
  end if;

  select string_agg(n, ', ') into missing
  from unnest(array['notifications_type_idx', 'process_runs_waiting_on_idx',
                    'property_values_profile_idx', 'report_documents_template_idx',
                    'report_documents_published_document_idx', 'tasks_process_task_idx']) n
  where to_regclass('public.' || n) is null;
  if missing is not null then
    raise exception '0123 proof: index missing: %', missing;
  end if;

  select qual into expr from pg_policies
  where schemaname = 'public' and tablename = 'login_activity'
    and policyname = 'read own login_activity';
  if expr is null then
    raise exception '0123 proof: "read own login_activity" is gone';
  end if;
  if expr not like '%SELECT auth.uid()%' or expr not like '%SELECT current_permission()%' then
    raise exception '0123 proof: the policy still evaluates per row: %', expr;
  end if;

  raise notice '0123 proof: the backup is gone, the six indexes exist, and the policy asks once.';
end $$;
