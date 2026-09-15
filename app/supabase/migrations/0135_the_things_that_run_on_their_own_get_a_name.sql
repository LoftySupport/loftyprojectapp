-- =============================================================================
-- 0135 — the things that run on their own get a name, and a log
--
-- Audit finding 6: *"Twelve things change data without a person, and the Automations tab says
-- 'Not built yet'."* None of them had a name in the app, an on/off, or a log. Amber, audit
-- decision 4, 15 September: **the registry first, then step effects, and a rule builder
-- later** — *"the ability to create addiontal automations like hubspot monday style when
-- needed. processes can pick from either list"*. One table with a kind column, so a process
-- picks from one list rather than two.
--
-- WHAT IS REGISTERED, AND WHAT IS NOT
--
--   **An automation changes a record because something happened, not because somebody asked.**
--   That is the test, and it is why the plumbing is not here: `moddatetime`, the audit
--   trigger, `stamp_created_by`, the sequence assigners and every `guard_*` are machinery that
--   makes a write correct, not decisions taken on the business's behalf. Registering them
--   would bury the twelve that matter in forty that do not.
--
--   **Eighteen rows, not twelve.** The audit counted twelve on 15 September; Stages 2 and 3
--   added four more the same day — a run makes its own tasks, a run closes itself, a job
--   moves itself, a job re-reads who it is with — and the working-drawings prefix turned out
--   to be two triggers rather than one. Every row names the object that IS it, so the count
--   can be checked against the schema rather than believed.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
--   **Nothing is gated yet.** `automation_is_active` exists and every row is true; no trigger
--   or cron job reads it and none writes a run. That is the next migration, and it has to be
--   its own, because switching off eighteen live mechanisms is a change to watch rather than
--   a change to skim. **Until then `is_active` is a promise, and the screen must say so** —
--   a switch that looks like it works and does nothing is worse than no switch.
--
--   **No step effects.** `process_steps` already has an `automation` kind carrying a note.
--   Giving it a vocabulary — set a property, create the tasks, notify an audience, request a
--   folder — is decision 4's second half, and it needs the registry to point at first.
-- =============================================================================
set lock_timeout = '5s';

-- ===================================================================== the registry
create table if not exists automations (
  automation_id            uuid primary key default gen_random_uuid(),
  automation_key           text not null unique
    constraint automations_key_is_a_slug check (automation_key ~ '^[a-z][a-z0-9_]*$'),
  automation_name          text not null
    constraint automations_name_is_not_blank check (length(trim(automation_name)) > 0),
  automation_kind          text not null default 'system'
    constraint automations_kind_is_known check (automation_kind in ('system', 'step_effect', 'rule')),
  /* What makes it happen, in the words somebody at Lofty would use. */
  automation_trigger       text not null
    constraint automations_trigger_is_not_blank check (length(trim(automation_trigger)) > 0),
  /* What it changes. Also in words: the vocabulary of effects is decision 4's second half. */
  automation_effect        text not null
    constraint automations_effect_is_not_blank check (length(trim(automation_effect)) > 0),
  /* The database object that IS this automation — a trigger, a function, a cron job. The
     registry is a description of the schema, so every row points at the thing it describes
     and a row that points at nothing is a row nobody can check. */
  automation_implemented_by text not null
    constraint automations_names_what_it_is check (length(trim(automation_implemented_by)) > 0),
  automation_is_active     boolean not null default true,
  automation_last_run_at   timestamptz,
  automation_description   text,
  automation_created_at    timestamptz not null default now(),
  automation_created_by    uuid references profiles (profile_id),
  automation_updated_at    timestamptz not null default now(),
  automation_updated_by    uuid references profiles (profile_id)
);

comment on table automations is
  'Everything that changes a record because something happened rather than because somebody asked (0135). One row per mechanism, each naming the trigger, function or cron job that IS it, so the list can be checked against the schema. The plumbing — timestamps, audit rows, sequence assigners, guards — is deliberately absent: it makes a write correct rather than taking a decision. Nothing reads automation_is_active yet; gating is the next migration.';
comment on column automations.automation_kind is
  'system — something the database already does; step_effect — an automation step inside a process (decision 4''s second half); rule — one somebody built in the app (decision 4''s third, recorded and not sized). One table so a process picks from one list.';
comment on column automations.automation_is_active is
  'Whether it should run. NOT YET READ BY ANYTHING (0135). The screen must say so until the migration that gates the eighteen mechanisms lands — a switch that looks like it works and does nothing is worse than no switch.';
comment on column automations.automation_implemented_by is
  'The database object that is this automation: "trigger jobs.jobs_notify_stage_changed", "cron notify_scan", "function push_project_properties(integer, text[])". Not null, because a registry row that names nothing cannot be verified against the schema.';

create index if not exists automations_kind_idx on automations (automation_kind, automation_key);

-- ========================================================================= the log
create table if not exists automation_runs (
  automation_run_id        uuid primary key default gen_random_uuid(),
  automation_id            uuid not null references automations (automation_id) on delete cascade,
  automation_run_at        timestamptz not null default now(),
  /* What it acted on. All four nullable and none exclusive: the archive acts on a job and a
     project at once, and a scan acts on nothing in particular. */
  job_id                   text references jobs (job_id) on update cascade on delete cascade,
  project_id               integer references projects (project_id) on delete cascade,
  maintenance_request_id   uuid references maintenance_requests (maintenance_request_id) on delete cascade,
  process_run_id           uuid references process_runs (process_run_id) on delete cascade,
  automation_run_outcome   text not null
    constraint automation_runs_outcome_is_known
      check (automation_run_outcome in ('changed', 'nothing_to_do', 'held', 'failed')),
  /* What it did, or why it did not. Free text on purpose: an effect vocabulary is decision
     4's second half, and a made-up one here would be quoted back as though it were agreed. */
  automation_run_detail    text,
  /* Whoever was in the session when it fired, where there was one. Null for a cron job, which
     is the honest answer rather than a service account standing in for a person. */
  automation_run_by        uuid references profiles (profile_id)
);

comment on table automation_runs is
  'What each automation did, and when (0135). Written by nothing yet — the mechanisms start writing here in the migration that gates them. held is the outcome for "switched off", so turning one off leaves a trail rather than silence.';
comment on column automation_runs.automation_run_by is
  'Whoever was in the session when it fired. Null for a cron job — the honest answer, rather than a service account standing in for a person.';

create index if not exists automation_runs_automation_idx on automation_runs (automation_id, automation_run_at desc);
create index if not exists automation_runs_job_idx on automation_runs (job_id) where job_id is not null;
create index if not exists automation_runs_project_idx on automation_runs (project_id) where project_id is not null;

-- ================================================================== who may do what
alter table automations enable row level security;
alter table automation_runs enable row level security;

drop policy if exists "everyone active reads the automations" on automations;
create policy "everyone active reads the automations" on automations
  for select to authenticated using (is_active_user());

drop policy if exists "managers write the automations" on automations;
create policy "managers write the automations" on automations
  for all to authenticated
  using (current_permission() >= 'manager'::permission_level)
  with check (current_permission() >= 'manager'::permission_level);

drop policy if exists "everyone active reads the automation log" on automation_runs;
create policy "everyone active reads the automation log" on automation_runs
  for select to authenticated using (is_active_user());

-- No INSERT, UPDATE or DELETE policy at all, which is the point: the log is written by the
-- mechanisms themselves through a SECURITY DEFINER helper, and a person who could write it
-- could write a history that did not happen. Same stance as job_stage_events (0039).

drop trigger if exists automations_touch on automations;
create trigger automations_touch before update on automations
  for each row execute function extensions.moddatetime('automation_updated_at');

drop trigger if exists automations_stamp_created_by on automations;
create trigger automations_stamp_created_by before insert on automations
  for each row execute function stamp_created_by('automation_created_by');

drop trigger if exists trg_activity_audit_row on automations;
create trigger trg_activity_audit_row after insert or update or delete on automations
  for each row execute function log_activity_audit();

-- `automations` carries the audit trigger because people edit it. `automation_runs` does not,
-- and joins the nine tables already exempt: it IS a log, and an audit trail of an audit trail
-- writes two rows every time an automation does one thing. Same company as job_stage_events,
-- address_history and the notification outbox. behaviour.sql's "every table" check reads this
-- list, so the exemption is stated here rather than by the check quietly passing.
create or replace function private.audit_exempt_tables()
returns text[]
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select array['activity_audit', 'login_activity', 'activity_events',
               'property_value_history', 'job_stage_events', 'address_history',
               'notifications', 'notification_deliveries', 'maintenance_message_secrets',
               'import_staging_jobs', 'automation_runs']
$$;

-- ============================================================== the eighteen, by name
--
-- Seeded idempotently on the key. Descriptions are read off what each object actually does,
-- not written from the audit's summary of it — the audit is a document and the schema is the
-- fact, and where they disagreed (the working-drawings prefix is two triggers, not one) the
-- schema won.
insert into automations (automation_key, automation_name, automation_kind, automation_trigger,
                         automation_effect, automation_implemented_by, automation_description)
values
  ('project_follows_slowest_job', 'A project follows its slowest job', 'system',
   'A job''s stage changes, or a job is added to or removed from a project',
   'Sets the project''s stage to the earliest stage any of its jobs is in',
   'trigger jobs.jobs_keep_project_stage_in_step → jobs_refresh_project_stage()',
   'From 0041. Forwards only. A project with no jobs keeps the stage it had.'),

  ('project_move_carries_its_jobs', 'Moving a project carries its jobs', 'system',
   'Somebody moves a project to another lifecycle stage',
   'Moves every job in it that is behind the project''s new stage',
   'trigger projects.projects_cascade_stage_to_jobs → projects_cascade_stage_to_jobs()',
   'From 0046. The other half of the pair above: the project follows its slowest job, and moving the project drags the stragglers.'),

  ('lifecycle_archive', 'Completed and cancelled records archive themselves', 'system',
   'Every day at 03:17',
   'Moves a record that has been Completed or Cancelled for twelve months to Closed',
   'cron lifecycle_archive (17 3 * * *) → lifecycle_archive()',
   'From 0045. The only path into Closed: nothing moves out of the archive, and nothing else puts anything in it.'),

  ('notify_scan', 'The notification outbox is swept', 'system',
   'Every fifteen minutes',
   'Queues the digests that are due and retries deliveries that failed',
   'cron notify_scan (*/15 * * * *) → notify_scan()',
   'From 0083. Since 0125 nothing external is sent before the switch-on date, and every row written before it is skipped.'),

  ('maintenance_scan', 'Maintenance SLAs are checked', 'system',
   'At 7, 22, 37 and 52 minutes past every hour',
   'Raises the alerts a maintenance request''s SLA is due or overdue',
   'cron maintenance_scan (7,22,37,52 * * * *) → maintenance_scan()',
   'From 0084. It has run over an empty table since it was written, which the audit counted as a cost with no reader.'),

  ('notify_stage_changed', 'Moving a job tells the people on it', 'system',
   'A job''s stage changes, by hand or by derivation',
   'Notifies the job''s owning team and whoever asked to hear about the stage',
   'trigger jobs.jobs_notify_stage_changed → notify_stage_changed()',
   'From 0083. Since 0132 a job can move itself, so this fires for the database''s own decisions as well as a manager''s.'),

  ('notify_task_assigned', 'Being given a task tells you', 'system',
   'A task is assigned to somebody, or reassigned',
   'Notifies the person it landed on',
   'trigger tasks.tasks_notify_assigned → notify_task_assigned()',
   'From 0083.'),

  ('notify_comment_mention', 'Being mentioned tells you', 'system',
   'A comment naming somebody is posted',
   'Notifies each person named',
   'trigger comment_mentions.comment_mentions_notify → notify_comment_mention()',
   'From 0083.'),

  ('notify_maintenance_request', 'A new maintenance request tells the team', 'system',
   'A maintenance request is created',
   'Notifies whoever the notification rules put on it',
   'trigger maintenance_requests.maintenance_requests_notify_new → notify_maintenance_request()',
   'From 0084.'),

  ('notify_working_drawings', 'Working drawings changing tells the people on the job', 'system',
   'A value a Working Drawings process collects is recorded, changed or cleared, or one of those runs changes status',
   'Notifies the job''s team and whoever asked to hear about working drawings',
   'triggers property_values.property_values_notify_working_drawings and process_runs.process_runs_notify_working_drawings',
   'From 0083. TWO triggers, not one — the audit counted it as a single prefix rule. Since 0131 it asks the process''s property steps rather than a dropped table.'),

  ('jobs_follow_project_address', 'A project moving site moves its jobs', 'system',
   'A project''s current address is repointed',
   'Moves every job standing at the project''s address, keeping any lot or res number of its own',
   'trigger projects.projects_jobs_follow_address → jobs_follow_project_address()',
   'From 0118. A job re-addressed on its own since its title issued keeps what it was given.'),

  ('resync_job_id', 'A job''s number follows its title type', 'system',
   'A job''s title type changes, or its project''s number does',
   'Rewrites the job number and cascades it to every row that names it',
   'trigger jobs.jobs_resync_job_id → resync_job_id()',
   'From 0120. The community-title c is part of the key rather than a column beside it, so correcting the title type renumbers the job.'),

  ('push_project_properties', 'A project''s values reach its jobs', 'system',
   'Somebody pushes a project property down from the project record',
   'Copies the chosen values onto every job in the project',
   'function push_project_properties(integer, text[])',
   'From 0077. Asked for rather than automatic, which is why it is the one row here a person starts.'),

  ('job_completion_forecast', 'A job forecasts its own completion', 'system',
   'Any read of the job record or the board',
   'Computes the longest path through the remaining processes in calendar days',
   'function job_completion_forecast(text), read by job_display',
   'From 0119. It changes nothing — registered because it is a calculation nobody set and would otherwise be invisible. Null with a count when the SLAs are not in, which is the signal it refuses to guess past.'),

  ('make_tasks_when_a_run_starts', 'Starting a process hands out its tasks', 'system',
   'A process run reaches a status that means work has begun',
   'Creates the run''s tasks from its process''s task steps, with their tick boxes, nesting and order',
   'trigger process_runs.process_runs_make_tasks_on_start → make_tasks_when_a_run_starts()',
   'From 0130, answering Amber''s walk-through steps 2 and 6. Idempotent: a run that already has tasks makes none.'),

  ('close_run_if_its_steps_are_done', 'A process closes itself when its work is answered', 'system',
   'A property is recorded, a task finished, a tick box ticked, or a step marked not applicable',
   'Marks the run complete once every required step is answered',
   'function close_run_if_its_steps_are_done(uuid), from four triggers',
   'From 0130, answering walk-through step 9. It never reopens a run, and never closes a process with no required steps.'),

  ('move_job_to_its_derived_stage', 'A job moves itself as its processes finish', 'system',
   'Any change to the status of a run on the job',
   'Moves the job to the stage its processes put it in, unless it is pinned',
   'trigger process_runs.process_runs_move_the_job → move_job_to_its_derived_stage(text)',
   'From 0132, reversing 24 August on audit decision 3. Forwards only, and a Cancelled or Closed job is left alone.'),

  ('refresh_job_derivations', 'A job re-reads who it is with, and whether it has finished', 'system',
   'A task is assigned, finished or removed, or a run changes status',
   'Sets the job''s assignee from its active process, and stamps the end date when nothing required is left open',
   'triggers tasks.tasks_refresh_job and process_runs.process_runs_refresh_job → refresh_job_derivations(text)',
   'From 0134. The end date is stamped once and never cleared here.')
on conflict (automation_key) do nothing;

-- ========================================================================= the proof
do $$
declare n integer; bad text;
begin
  select count(*) into n from automations;
  if n < 18 then
    raise exception '0135 proof: only % automations registered, expected at least 18', n;
  end if;

  -- Every row names an object that exists. A registry that describes the schema and cannot be
  -- checked against it is a document, and documents drift.
  select string_agg(a.automation_key, ', ') into bad
    from automations a
   where a.automation_implemented_by like 'trigger %'
     and not exists (
       select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal
          and a.automation_implemented_by like '%' || c.relname || '.' || t.tgname || '%');
  if bad is not null then
    raise exception '0135 proof: these name a trigger that is not there: %', bad;
  end if;

  select string_agg(a.automation_key, ', ') into bad
    from automations a
   where a.automation_implemented_by like 'function %'
     and not exists (
       select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public'
          and a.automation_implemented_by like '%' || p.proname || '%');
  if bad is not null then
    raise exception '0135 proof: these name a function that is not there: %', bad;
  end if;

  -- And nothing reads the switch yet, which is the thing the screen has to say.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'private') and p.prosrc ~ 'automation_is_active';
  if bad is not null then
    raise exception '0135 proof: % already reads automation_is_active, so this migration is not the no-op it says it is', bad;
  end if;

  raise notice '0135: % things that run on their own now have a name. None is gated yet.', n;
end $$;
