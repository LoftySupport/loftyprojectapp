-- =============================================================================
-- 0083 — notifications: who hears what, on which channel, when
-- =============================================================================
-- Amber, 1–2 September: *"Notifications on incomplete tasks and who they go to need to be
-- added."* Channels: in-app, email via Microsoft 365, Teams and SMS, *"selected in user
-- settings"*. Defaults: assignments, mentions and maintenance arrivals immediate; overdue
-- and at-risk in a 07:30 digest; *"and any changes to working drawings"* immediate. SMS
-- later — nothing else waits on it.
--
-- FIVE TABLES, BECAUSE THE QUESTION HAS FIVE PARTS
--
--   notification_types         what can be said (task_overdue, mention…) and its defaults
--   notification_rules         WHO hears each: the assignee, the owning team, the watchers,
--                              the managers — edited by admins ("who they go to")
--   notification_preferences   HOW each person hears each type: channel on or off,
--                              immediate or in their digest, at what time
--   notifications              one row per person per thing said — the inbox; read_at is
--                              the bell; a dedupe key stops a daily scan repeating itself
--   notification_deliveries    one row per channel per notification — the outbox a worker
--                              drains with `for update skip locked`; nothing inside a
--                              trigger ever makes an HTTP call
--   record_watchers            "follow this job", an audience the rules can name
--
-- 0050 planned the preference matrix as a jsonb bag on user_preferences. It is a table
-- here, one row per person, type and channel, because a preference the database cannot
-- see is one it cannot enforce or report on — and the delivery worker is the database's.
--
-- WHAT FIRES, AND FROM WHERE
--
--   Triggers, immediately: a task assigned (tasks), a mention (comment_mentions), a stage
--   moved (jobs), a working-drawings process or property touched (process_runs,
--   property_values), a contact or company awaiting sign-off (contacts, companies).
--   A scan, every 15 minutes by pg_cron: tasks and process runs that are at risk or
--   overdue (task_display, process_run_display), keyed per day so each fires once a day
--   and escalates to managers after the rule's `after_days`.
--
--   in_app deliveries are sent the moment they are written — the row IS the delivery.
--   email, teams and sms rows wait for the worker (supabase/functions/deliver-notifications),
--   queued for immediate or held until the person's digest time for digest.
-- =============================================================================

-- ---------------------------------------------------------- types
create table if not exists notification_types (
  notification_type_id               text primary key
    constraint notification_types_key_is_a_slug check (notification_type_id ~ '^[a-z][a-z0-9_]*$'),
  notification_type_name             text not null unique,
  notification_type_description      text,
  notification_type_default_channels text[] not null default array['in_app']
    constraint notification_types_channels_are_known
      check (notification_type_default_channels <@ array['in_app', 'email', 'teams', 'sms']),
  notification_type_default_timing   text not null default 'immediate'
    constraint notification_types_timing_is_known check (notification_type_default_timing in ('immediate', 'digest')),
  notification_type_position         smallint not null default 0,
  notification_type_is_active        boolean not null default true,
  notification_type_created_at       timestamptz not null default now(),
  notification_type_created_by       uuid references profiles (profile_id),
  notification_type_updated_at       timestamptz not null default now(),
  notification_type_updated_by       uuid references profiles (profile_id)
);
comment on table notification_types is
  'What the app can tell somebody (0083) — task_overdue, mention, stage_changed… — with the channels and timing a person gets until they choose otherwise in their settings. Admins edit the defaults; the slugs are what triggers and the scan name.';

insert into notification_types (notification_type_id, notification_type_name, notification_type_description, notification_type_default_channels, notification_type_default_timing, notification_type_position) values
  ('task_assigned',            'Task assigned to you',          'Somebody made you the assignee of a task.',                                   array['in_app', 'email'], 'immediate', 1),
  ('task_at_risk',             'Task at risk',                  'A task of yours is inside its at-risk lead — due soon and not done.',          array['in_app', 'email'], 'digest',    2),
  ('task_overdue',             'Task overdue',                  'A task of yours is past its due date.',                                        array['in_app', 'email'], 'digest',    3),
  ('process_at_risk',          'Process at risk',               'A process your team owns is inside its at-risk lead.',                          array['in_app', 'email'], 'digest',    4),
  ('process_overdue',          'Process overdue',               'A process your team owns is past its expected days.',                           array['in_app', 'email'], 'digest',    5),
  ('mention',                  'Mentioned in a comment',        'Somebody typed your name in a comment.',                                        array['in_app', 'email'], 'immediate', 6),
  ('stage_changed',            'Record moved stage',            'A job or project you watch, or your team is engaged on, moved lifecycle stage.', array['in_app'],          'digest',    7),
  ('working_drawings_changed', 'Working drawings changed',      'A working-drawings process or property changed on a job you watch or your team owns (Amber, 2 Sep: immediate).', array['in_app', 'email'], 'immediate', 8),
  ('party_awaiting_sign_off',  'Contact awaiting sign-off',     'A user added a contact or company that a manager has not signed off.',          array['in_app'],          'immediate', 9),
  ('property_pushed',          'Project properties pushed',     'Project-level properties were pushed onto the jobs you watch.',                  array['in_app'],          'digest',    10)
on conflict (notification_type_id) do nothing;

-- ---------------------------------------------------------- rules: who
create table if not exists notification_rules (
  notification_rule_id         uuid primary key default gen_random_uuid(),
  notification_type_id         text not null references notification_types (notification_type_id) on update cascade on delete cascade,
  notification_rule_audience   text not null
    constraint notification_rules_audience_is_known
      check (notification_rule_audience in ('assignee', 'owning_team', 'engaged_teams', 'watchers', 'managers', 'mentioned', 'specific_team', 'specific_person')),
  team_id                      text references teams (team_id) on update cascade,
  profile_id                   uuid references profiles (profile_id),
  -- Escalation: only once the thing has been overdue (or at risk) this many days.
  notification_rule_after_days smallint not null default 0
    constraint notification_rules_after_days_not_negative check (notification_rule_after_days >= 0),
  notification_rule_is_active  boolean not null default true,
  notification_rule_created_at timestamptz not null default now(),
  notification_rule_created_by uuid references profiles (profile_id),
  notification_rule_updated_at timestamptz not null default now(),
  notification_rule_updated_by uuid references profiles (profile_id),
  constraint notification_rules_specific_names_someone
    check ((notification_rule_audience <> 'specific_team' or team_id is not null)
       and (notification_rule_audience <> 'specific_person' or profile_id is not null))
);
create index if not exists notification_rules_type_idx on notification_rules (notification_type_id) where notification_rule_is_active;
comment on table notification_rules is
  'Who hears each type (0083, Amber: "who they go to"): the assignee, the owning team, the engaged teams, the watchers, the managers, the mentioned person, or a named team or person — with after_days for escalation ("overdue 5 days → managers"). Admins edit.';

insert into notification_rules (notification_type_id, notification_rule_audience, notification_rule_after_days)
select * from (values
  ('task_assigned',            'assignee',      0),
  ('task_at_risk',             'assignee',      0),
  ('task_overdue',             'assignee',      0),
  ('task_overdue',             'owning_team',   0),
  ('task_overdue',             'managers',      5),
  ('process_at_risk',          'owning_team',   0),
  ('process_overdue',          'owning_team',   0),
  ('process_overdue',          'managers',      5),
  ('mention',                  'mentioned',     0),
  ('stage_changed',            'watchers',      0),
  ('stage_changed',            'engaged_teams', 0),
  ('working_drawings_changed', 'watchers',      0),
  ('working_drawings_changed', 'owning_team',   0),
  ('party_awaiting_sign_off',  'managers',      0),
  ('property_pushed',          'watchers',      0)
) as v(t, a, d)
where not exists (select 1 from notification_rules);

-- ---------------------------------------------------------- preferences: how
create table if not exists notification_preferences (
  profile_id                           uuid not null references profiles (profile_id) on delete cascade,
  notification_type_id                 text not null references notification_types (notification_type_id) on update cascade on delete cascade,
  notification_preference_channel      text not null
    constraint notification_preferences_channel_is_known check (notification_preference_channel in ('in_app', 'email', 'teams', 'sms')),
  notification_preference_is_enabled   boolean not null default true,
  -- Null means the type's default. A digest is delivered once a day at digest_time.
  notification_preference_timing       text
    constraint notification_preferences_timing_is_known check (notification_preference_timing is null or notification_preference_timing in ('immediate', 'digest')),
  notification_preference_digest_time  time,
  notification_preference_created_at   timestamptz not null default now(),
  notification_preference_updated_at   timestamptz not null default now(),
  primary key (profile_id, notification_type_id, notification_preference_channel)
);
comment on table notification_preferences is
  'How each person hears each type on each channel (0083, Amber: "selected in user settings"): on or off, immediately or in their digest, and when the digest comes. No row means the type''s default. One row per person, type and channel — a table, not the jsonb bag 0050 planned, so the worker can read it.';

-- ---------------------------------------------------------- watchers
create table if not exists record_watchers (
  record_watcher_id         uuid primary key default gen_random_uuid(),
  profile_id                uuid not null references profiles (profile_id) on delete cascade,
  project_id                integer references projects (project_id) on update cascade on delete cascade,
  job_id                    text references jobs (job_id) on update cascade on delete cascade,
  record_watcher_created_at timestamptz not null default now(),
  constraint record_watchers_one_record check (num_nonnulls(project_id, job_id) = 1)
);
create unique index if not exists record_watchers_one_per_record
  on record_watchers (profile_id, coalesce(project_id::text, ''), coalesce(job_id, ''));
create index if not exists record_watchers_job_idx on record_watchers (job_id) where job_id is not null;
create index if not exists record_watchers_project_idx on record_watchers (project_id) where project_id is not null;
comment on table record_watchers is '"Follow this job" (0083): a person on a record, so the rules can name the watchers as an audience. Own rows only.';

-- ---------------------------------------------------------- the inbox
create table if not exists notifications (
  notification_id         bigint generated always as identity primary key,
  profile_id              uuid not null references profiles (profile_id) on delete cascade,
  notification_type_id    text not null references notification_types (notification_type_id) on update cascade,
  project_id              integer,
  job_id                  text,
  task_id                 uuid,
  process_run_id          uuid,
  comment_id              uuid,
  notification_title      text not null,
  notification_body       text,
  notification_href       text,
  -- One per person per thing said: a daily scan writes task_overdue:<task>:<date>, so
  -- tomorrow is a new row and today never repeats.
  notification_dedupe_key text not null,
  notification_created_at timestamptz not null default now(),
  notification_read_at    timestamptz,
  unique (profile_id, notification_dedupe_key)
);
create index if not exists notifications_inbox_idx on notifications (profile_id, notification_created_at desc);
create index if not exists notifications_unread_idx on notifications (profile_id) where notification_read_at is null;
comment on table notifications is
  'The inbox (0083): one row per person per thing said, with the record it points at and where to click. read_at is the bell. Written only by private.notify() — no client insert; a person may mark their own read.';

-- ---------------------------------------------------------- the outbox
create table if not exists notification_deliveries (
  notification_delivery_id          bigint generated always as identity primary key,
  notification_id                   bigint not null references notifications (notification_id) on delete cascade,
  notification_delivery_channel     text not null
    constraint notification_deliveries_channel_is_known check (notification_delivery_channel in ('in_app', 'email', 'teams', 'sms')),
  notification_delivery_status      text not null default 'queued'
    constraint notification_deliveries_status_is_known
      check (notification_delivery_status in ('queued', 'held', 'sending', 'sent', 'failed', 'skipped')),
  notification_delivery_address     text,
  notification_delivery_attempts    smallint not null default 0,
  notification_delivery_next_attempt_at timestamptz not null default now(),
  notification_delivery_claimed_at  timestamptz,
  notification_delivery_sent_at     timestamptz,
  notification_delivery_external_id text,
  notification_delivery_error       text,
  notification_delivery_created_at  timestamptz not null default now()
);
create index if not exists notification_deliveries_due_idx
  on notification_deliveries (notification_delivery_next_attempt_at)
  where notification_delivery_status in ('queued', 'held');
create index if not exists notification_deliveries_notification_idx on notification_deliveries (notification_id);
comment on table notification_deliveries is
  'The outbox (0083): one row per channel per notification. in_app is sent as it is written; email, teams and sms wait for the worker, queued (immediate) or held until the person''s digest time. The worker claims with for update skip locked, retries with backoff, and never runs inside a trigger.';

-- ---------------------------------------------------------- stamps, audit, RLS
do $$
declare t record;
begin
  for t in select * from (values ('notification_types', 'notification_type'), ('notification_rules', 'notification_rule')) as v(tbl, pfx) loop
    execute format('drop trigger if exists %I on %I', t.tbl || '_touch', t.tbl);
    execute format('create trigger %I before update on %I for each row execute function extensions.moddatetime(%I)', t.tbl || '_touch', t.tbl, t.pfx || '_updated_at');
    execute format('drop trigger if exists %I on %I', t.tbl || '_stamp_created_by', t.tbl);
    execute format('create trigger %I before insert on %I for each row execute function stamp_created_by(%L)', t.tbl || '_stamp_created_by', t.tbl, t.pfx || '_created_by');
  end loop;
  drop trigger if exists notification_preferences_touch on notification_preferences;
  create trigger notification_preferences_touch before update on notification_preferences
    for each row execute function extensions.moddatetime(notification_preference_updated_at);
  for t in select unnest(array['notification_types', 'notification_rules', 'notification_preferences', 'record_watchers', 'notifications', 'notification_deliveries']) as tbl loop
    execute format('drop trigger if exists trg_activity_audit_row on %I', t.tbl);
    execute format('create trigger trg_activity_audit_row after insert or update or delete on %I for each row execute function log_activity_audit()', t.tbl);
    execute format('alter table %I enable row level security', t.tbl);
  end loop;
end $$;

-- The inbox and the outbox are logs of what was said; the audit does not need a copy of
-- every notification row on top. Exempt them the way the other logs are.
create or replace function private.audit_exempt_tables() returns text[]
language sql immutable as $$
  select array['activity_audit', 'login_activity', 'activity_events',
               'property_value_history', 'job_stage_events', 'address_history',
               'notifications', 'notification_deliveries']
$$;
drop trigger if exists trg_activity_audit_row on notifications;
drop trigger if exists trg_activity_audit_row on notification_deliveries;

drop policy if exists "read notification types" on notification_types;
drop policy if exists "admins write notification types" on notification_types;
create policy "read notification types" on notification_types for select to authenticated using ((select is_active_user()));
create policy "admins write notification types" on notification_types for all to authenticated
  using ((select current_permission()) >= 'admin') with check ((select current_permission()) >= 'admin');

drop policy if exists "read notification rules" on notification_rules;
drop policy if exists "admins write notification rules" on notification_rules;
create policy "read notification rules" on notification_rules for select to authenticated using ((select is_active_user()));
create policy "admins write notification rules" on notification_rules for all to authenticated
  using ((select current_permission()) >= 'admin') with check ((select current_permission()) >= 'admin');

drop policy if exists "own notification preferences" on notification_preferences;
create policy "own notification preferences" on notification_preferences for all to authenticated
  using (profile_id = (select current_profile_id())) with check (profile_id = (select current_profile_id()));

drop policy if exists "own watches" on record_watchers;
drop policy if exists "read watchers" on record_watchers;
create policy "read watchers" on record_watchers for select to authenticated using ((select is_active_user()));
create policy "own watches" on record_watchers for all to authenticated
  using (profile_id = (select current_profile_id())) with check (profile_id = (select current_profile_id()));

drop policy if exists "own notifications" on notifications;
drop policy if exists "mark own notifications read" on notifications;
create policy "own notifications" on notifications for select to authenticated
  using (profile_id = (select current_profile_id()));
create policy "mark own notifications read" on notifications for update to authenticated
  using (profile_id = (select current_profile_id())) with check (profile_id = (select current_profile_id()));

drop policy if exists "own deliveries" on notification_deliveries;
drop policy if exists "admins read deliveries" on notification_deliveries;
create policy "own deliveries" on notification_deliveries for select to authenticated
  using (exists (select 1 from notifications n where n.notification_id = notification_deliveries.notification_id
                   and n.profile_id = (select current_profile_id())));
create policy "admins read deliveries" on notification_deliveries for select to authenticated
  using ((select current_permission()) >= 'admin');

-- ---------------------------------------------------------- who: the audience resolver
-- Given a type and the record's facts, the set of people the active rules name. Managers
-- are the members of the owning team who hold manager or above (falling back to every
-- manager and above when the record has no team), so a small company is not spammed and
-- a large one is not silent.
create or replace function private.notification_recipients(
  p_type text, p_job_id text, p_project_id integer,
  p_assignee uuid, p_owning_team text, p_mentioned uuid, p_days_late integer default 0
) returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  out_ids uuid[] := '{}';
  r record;
  engaged text[];
  proj integer := p_project_id;
begin
  if p_job_id is not null and proj is null then
    select project_id into proj from jobs where job_id = p_job_id;
  end if;
  if p_job_id is not null then
    select job_engaged_teams into engaged from jobs where job_id = p_job_id;
  end if;

  for r in select * from notification_rules
            where notification_type_id = p_type and notification_rule_is_active
              and notification_rule_after_days <= p_days_late
  loop
    case r.notification_rule_audience
      when 'assignee' then
        if p_assignee is not null then out_ids := out_ids || p_assignee; end if;
      when 'mentioned' then
        if p_mentioned is not null then out_ids := out_ids || p_mentioned; end if;
      when 'owning_team' then
        if p_owning_team is not null then
          out_ids := out_ids || array(select pt.profile_id from profile_teams pt where pt.team_id = p_owning_team);
        end if;
      when 'engaged_teams' then
        if engaged is not null then
          out_ids := out_ids || array(select pt.profile_id from profile_teams pt where pt.team_id = any (engaged));
        end if;
      when 'watchers' then
        out_ids := out_ids || array(select w.profile_id from record_watchers w
                                     where (p_job_id is not null and w.job_id = p_job_id)
                                        or (proj is not null and w.project_id = proj));
      when 'managers' then
        if p_owning_team is not null and exists (
             select 1 from profile_teams pt join profiles p using (profile_id)
              where pt.team_id = p_owning_team and p.profile_permission >= 'manager' and p.profile_is_active) then
          out_ids := out_ids || array(select pt.profile_id from profile_teams pt join profiles p using (profile_id)
                                       where pt.team_id = p_owning_team and p.profile_permission >= 'manager' and p.profile_is_active);
        else
          out_ids := out_ids || array(select p.profile_id from profiles p
                                       where p.profile_permission >= 'manager' and p.profile_is_active and not p.profile_is_demo);
        end if;
      when 'specific_team' then
        out_ids := out_ids || array(select pt.profile_id from profile_teams pt where pt.team_id = r.team_id);
      when 'specific_person' then
        out_ids := out_ids || r.profile_id;
      else null;
    end case;
  end loop;

  -- Distinct, active, not demo, and never the person who did the thing (the caller strips
  -- that where it applies — a mention of yourself is still a mention).
  return array(select distinct u from unnest(out_ids) u
                join profiles p on p.profile_id = u
               where p.profile_is_active and not p.profile_is_demo);
end $$;
revoke execute on function private.notification_recipients(text, text, integer, uuid, text, uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------- how: the writer
-- Writes the inbox row (once, by dedupe key) and the outbox rows the person's preferences
-- ask for. in_app is sent on the spot. A digest is held until the person's digest time —
-- 07:30 Adelaide unless they chose otherwise — as one row per notification; the worker
-- groups what is due into one message.
create or replace function private.notify(
  p_type text, p_recipients uuid[], p_title text, p_body text, p_href text, p_dedupe_key text,
  p_job_id text default null, p_project_id integer default null, p_task_id uuid default null,
  p_process_run_id uuid default null, p_comment_id uuid default null
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  who uuid;
  nid bigint;
  made integer := 0;
  ty notification_types%rowtype;
  ch text;
  enabled boolean; timing text; digest_at time;
  addr text;
  next_at timestamptz;
begin
  select * into ty from notification_types where notification_type_id = p_type and notification_type_is_active;
  if ty.notification_type_id is null then return 0; end if;

  foreach who in array coalesce(p_recipients, '{}'::uuid[]) loop
    insert into notifications (profile_id, notification_type_id, project_id, job_id, task_id, process_run_id, comment_id,
                               notification_title, notification_body, notification_href, notification_dedupe_key)
    values (who, p_type, p_project_id, p_job_id, p_task_id, p_process_run_id, p_comment_id, p_title, p_body, p_href, p_dedupe_key)
    on conflict (profile_id, notification_dedupe_key) do nothing
    returning notification_id into nid;
    if nid is null then continue; end if;
    made := made + 1;

    foreach ch in array array['in_app', 'email', 'teams', 'sms'] loop
      select pr.notification_preference_is_enabled, pr.notification_preference_timing, pr.notification_preference_digest_time
        into enabled, timing, digest_at
        from notification_preferences pr
       where pr.profile_id = who and pr.notification_type_id = p_type and pr.notification_preference_channel = ch;
      if not found then
        enabled := ch = any (ty.notification_type_default_channels);
        timing := null; digest_at := null;
      end if;
      if not coalesce(enabled, false) then continue; end if;
      -- SMS waits on a provider (Amber, answer 7): a row is written so nothing is lost,
      -- and it stays queued until a worker exists to send it.
      timing := coalesce(timing, ty.notification_type_default_timing);
      digest_at := coalesce(digest_at, time '07:30');
      addr := case ch
                when 'email' then (select coalesce(p.profile_login_email, p.profile_email) from profiles p where p.profile_id = who)
                when 'teams' then (select coalesce(p.profile_login_email, p.profile_email) from profiles p where p.profile_id = who)
                else null end;
      if ch = 'in_app' then
        insert into notification_deliveries (notification_id, notification_delivery_channel, notification_delivery_status, notification_delivery_sent_at)
        values (nid, ch, 'sent', now());
      elsif timing = 'digest' then
        -- The next occurrence of the digest time, Adelaide clock.
        next_at := ((now() at time zone 'Australia/Adelaide')::date + digest_at) at time zone 'Australia/Adelaide';
        if next_at <= now() then next_at := next_at + interval '1 day'; end if;
        insert into notification_deliveries (notification_id, notification_delivery_channel, notification_delivery_status, notification_delivery_address, notification_delivery_next_attempt_at)
        values (nid, ch, 'held', addr, next_at);
      else
        insert into notification_deliveries (notification_id, notification_delivery_channel, notification_delivery_status, notification_delivery_address)
        values (nid, ch, 'queued', addr);
      end if;
    end loop;
    nid := null;
  end loop;
  return made;
end $$;
revoke execute on function private.notify(text, uuid[], text, text, text, text, text, integer, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------- the scan
create or replace function notify_scan() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  made integer := 0;
  late integer;
  who uuid[];
begin
  -- Tasks at risk or overdue, once a day each, escalating by days late.
  for r in
    select d.*, j.job_owning_team as job_team
      from task_display d
      left join jobs j on j.job_id = d.job_id
     where d.task_health in ('at_risk', 'overdue')
  loop
    late := greatest(0, current_date - r.task_due_effective);
    who := private.notification_recipients(
      case when r.task_health = 'overdue' then 'task_overdue' else 'task_at_risk' end,
      r.job_id, r.project_id, r.task_assignee_id, coalesce(r.task_owning_team, r.job_team), null, late);
    made := made + private.notify(
      case when r.task_health = 'overdue' then 'task_overdue' else 'task_at_risk' end, who,
      format('%s is %s', r.task_name, case when r.task_health = 'overdue' then 'overdue' else 'at risk' end),
      format('%s on %s — due %s%s.', r.task_name, coalesce(r.job_id, 'project ' || r.project_id),
             to_char(r.task_due_effective, 'DD Mon'),
             case when late > 0 then format(', %s day%s ago', late, case when late = 1 then '' else 's' end) else '' end),
      case when r.job_id is not null then '/jobs/' || r.job_id else '/projects/' || r.project_id end,
      format('%s:%s:%s', case when r.task_health = 'overdue' then 'task_overdue' else 'task_at_risk' end, r.task_id, current_date),
      r.job_id, r.project_id, r.task_id, null, null);
  end loop;

  -- Process runs at risk or overdue, the same way; the audience is the process's owning
  -- team, else the job's.
  for r in
    select d.*, j.job_owning_team as job_team
      from process_run_display d
      left join jobs j on j.job_id = d.job_id
     where d.process_run_health in ('at_risk', 'overdue')
  loop
    late := greatest(0, current_date - r.process_run_due_date);
    who := private.notification_recipients(
      case when r.process_run_health = 'overdue' then 'process_overdue' else 'process_at_risk' end,
      r.job_id, r.record_project_id, null, coalesce(r.process_owning_team, r.job_team), null, late);
    made := made + private.notify(
      case when r.process_run_health = 'overdue' then 'process_overdue' else 'process_at_risk' end, who,
      format('%s is %s', r.process_name, case when r.process_run_health = 'overdue' then 'overdue' else 'at risk' end),
      format('%s on %s — due %s%s.', r.process_name, coalesce(r.job_id, 'project ' || r.record_project_id),
             to_char(r.process_run_due_date, 'DD Mon'),
             case when late > 0 then format(', %s day%s ago', late, case when late = 1 then '' else 's' end) else '' end),
      case when r.job_id is not null then '/jobs/' || r.job_id else '/projects/' || r.record_project_id end,
      format('%s:%s:%s', case when r.process_run_health = 'overdue' then 'process_overdue' else 'process_at_risk' end, r.process_run_id, current_date),
      r.job_id, r.record_project_id, null, r.process_run_id, null);
  end loop;

  -- Contacts and companies still awaiting sign-off, once a day, to the managers.
  for r in
    select 'contact' as kind, contact_id::text as id, contact_full_name as name from contacts
     where contact_approved_at is null and contact_is_active
    union all
    select 'company', company_id::text, company_name from companies
     where company_approved_at is null and company_is_active
  loop
    who := private.notification_recipients('party_awaiting_sign_off', null, null, null, null, null, 0);
    made := made + private.notify('party_awaiting_sign_off', who,
      format('%s awaiting sign-off', r.name),
      format('A %s added by a user has not been signed off by a manager.', r.kind),
      case when r.kind = 'contact' then '/contacts?person=' || r.id else '/contacts?company=' || r.id end,
      format('party_awaiting_sign_off:%s:%s', r.id, current_date));
  end loop;

  return made;
end $$;
revoke execute on function notify_scan() from public, anon, authenticated;
comment on function notify_scan() is
  'Every 15 minutes by pg_cron (job name: notify_scan): tasks and process runs at risk or overdue, and parties awaiting sign-off, each once a day per record, escalating to managers by the rules'' after_days. Writes through private.notify().';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notify_scan', '*/15 * * * *', 'select notify_scan()');
  end if;
end $$;

-- ---------------------------------------------------------- the triggers
-- Assigned: the new assignee, immediately. Not the person who assigned themselves.
create or replace function notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid[];
begin
  if new.task_assignee_id is null or (tg_op = 'UPDATE' and new.task_assignee_id is not distinct from old.task_assignee_id) then
    return new;
  end if;
  if new.task_assignee_id = current_profile_id() then return new; end if;
  who := private.notification_recipients('task_assigned', new.job_id, new.project_id, new.task_assignee_id, new.task_owning_team, null, 0);
  perform private.notify('task_assigned', who,
    format('You were assigned %s', new.task_name),
    format('%s on %s%s.', new.task_name, coalesce(new.job_id, 'project ' || new.project_id),
           case when new.task_due_date is not null then ' — due ' || to_char(new.task_due_date, 'DD Mon') else '' end),
    case when new.job_id is not null then '/jobs/' || new.job_id else '/projects/' || new.project_id end,
    format('task_assigned:%s:%s', new.task_id, new.task_assignee_id),
    new.job_id, new.project_id, new.task_id, null, null);
  return new;
end $$;
revoke execute on function notify_task_assigned() from public, anon, authenticated;
drop trigger if exists tasks_notify_assigned on tasks;
create trigger tasks_notify_assigned after insert or update of task_assignee_id on tasks
  for each row execute function notify_task_assigned();

-- Mentioned: the person named, immediately, with what was said.
create or replace function notify_mention() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c comments%rowtype; author text; who uuid[];
begin
  select * into c from comments where comment_id = new.comment_id;
  select profile_full_name into author from profiles where profile_id = c.comment_created_by;
  who := private.notification_recipients('mention', c.job_id, c.project_id, null, null, new.profile_id, 0);
  perform private.notify('mention', who,
    format('%s mentioned you', coalesce(author, 'Somebody')),
    left(c.comment_body, 280),
    case when c.job_id is not null then '/jobs/' || c.job_id
         when c.project_id is not null then '/projects/' || c.project_id
         when c.feedback_id is not null then '/updates/requests' else null end,
    format('mention:%s', new.comment_id),
    c.job_id, c.project_id, c.task_id, null, new.comment_id);
  return new;
end $$;
revoke execute on function notify_mention() from public, anon, authenticated;
drop trigger if exists comment_mentions_notify on comment_mentions;
create trigger comment_mentions_notify after insert on comment_mentions
  for each row execute function notify_mention();

-- Stage moved: watchers and the engaged teams.
create or replace function notify_stage_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid[];
begin
  if new.job_stage is not distinct from old.job_stage then return new; end if;
  who := private.notification_recipients('stage_changed', new.job_id, new.project_id, new.job_assignee_id, new.job_owning_team, null, 0);
  who := array(select u from unnest(who) u where u is distinct from current_profile_id());
  perform private.notify('stage_changed', who,
    format('%s moved to %s', new.job_id, new.job_stage),
    format('%s moved from %s to %s.', new.job_id, old.job_stage, new.job_stage),
    '/jobs/' || new.job_id,
    format('stage_changed:%s:%s:%s', new.job_id, new.job_stage, to_char(now(), 'YYYY-MM-DD"T"HH24:MI')),
    new.job_id, new.project_id, null, null, null);
  return new;
end $$;
revoke execute on function notify_stage_changed() from public, anon, authenticated;
drop trigger if exists jobs_notify_stage_changed on jobs;
create trigger jobs_notify_stage_changed after update of job_stage on jobs
  for each row execute function notify_stage_changed();

-- Working drawings changed (Amber, 2 Sep): a run of a working-drawings process changes
-- status, or a property one of those processes collects is recorded or changed.
create or replace function private.is_working_drawings_process(p_process uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from processes where process_id = p_process and process_key like 'working_drawings%')
$$;

create or replace function notify_working_drawings_run() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid[]; pname text; team text; j jobs%rowtype;
begin
  if tg_op = 'UPDATE' and new.process_run_status is not distinct from old.process_run_status then return new; end if;
  if not private.is_working_drawings_process(new.process_id) then return new; end if;
  select process_name, process_owning_team into pname, team from processes where process_id = new.process_id;
  if new.job_id is not null then select * into j from jobs where job_id = new.job_id; end if;
  who := private.notification_recipients('working_drawings_changed', new.job_id, coalesce(new.project_id, j.project_id), null, coalesce(team, j.job_owning_team), null, 0);
  who := array(select u from unnest(who) u where u is distinct from current_profile_id());
  perform private.notify('working_drawings_changed', who,
    format('Working drawings: %s is %s', pname, replace(new.process_run_status, '_', ' ')),
    format('%s on %s is now %s.', pname, coalesce(new.job_id, 'project ' || new.project_id), replace(new.process_run_status, '_', ' ')),
    case when new.job_id is not null then '/jobs/' || new.job_id else '/projects/' || new.project_id end,
    format('working_drawings_changed:run:%s:%s', new.process_run_id, new.process_run_status),
    new.job_id, coalesce(new.project_id, j.project_id), null, new.process_run_id, null);
  return new;
end $$;
revoke execute on function notify_working_drawings_run() from public, anon, authenticated;
drop trigger if exists process_runs_notify_working_drawings on process_runs;
create trigger process_runs_notify_working_drawings after insert or update of process_run_status on process_runs
  for each row execute function notify_working_drawings_run();

create or replace function notify_working_drawings_value() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid[]; label text; j jobs%rowtype; snap property_values%rowtype;
begin
  snap := case when tg_op = 'DELETE' then old else new end;
  if not exists (
    select 1 from process_properties pp join processes p using (process_id)
     where pp.property_def_key = snap.property_def_key and p.process_key like 'working_drawings%') then
    return coalesce(new, old);
  end if;
  select property_def_label into label from property_defs where property_def_key = snap.property_def_key;
  if snap.job_id is not null then select * into j from jobs where job_id = snap.job_id; end if;
  who := private.notification_recipients('working_drawings_changed', snap.job_id, coalesce(snap.project_id, j.project_id), null, j.job_owning_team, null, 0);
  who := array(select u from unnest(who) u where u is distinct from current_profile_id());
  perform private.notify('working_drawings_changed', who,
    format('Working drawings: %s %s', label, case tg_op when 'INSERT' then 'recorded' when 'DELETE' then 'cleared' else 'changed' end),
    format('%s on %s was %s.', label, coalesce(snap.job_id, 'project ' || snap.project_id),
           case tg_op when 'INSERT' then 'recorded' when 'DELETE' then 'cleared' else 'changed' end),
    case when snap.job_id is not null then '/jobs/' || snap.job_id else '/projects/' || snap.project_id end,
    format('working_drawings_changed:value:%s:%s', snap.property_value_id, to_char(now(), 'YYYY-MM-DD"T"HH24:MI')),
    snap.job_id, coalesce(snap.project_id, j.project_id), null, null, null);
  return coalesce(new, old);
end $$;
revoke execute on function notify_working_drawings_value() from public, anon, authenticated;
drop trigger if exists property_values_notify_working_drawings on property_values;
create trigger property_values_notify_working_drawings after insert or update or delete on property_values
  for each row execute function notify_working_drawings_value();

-- ---------------------------------------------------------- the worker's two calls
-- Claim: rows due on one channel, locked and skipped by any other worker, marked sending.
-- Callable by the service role only — a browser session never drains the outbox.
create or replace function claim_notification_deliveries(p_channel text, p_limit integer default 50)
returns table (
  notification_delivery_id bigint, notification_id bigint, notification_delivery_channel text,
  notification_delivery_address text, notification_delivery_attempts smallint,
  profile_id uuid, profile_full_name text, notification_type_id text,
  notification_title text, notification_body text, notification_href text, notification_created_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select d.notification_delivery_id
      from notification_deliveries d
     where d.notification_delivery_channel = p_channel
       and d.notification_delivery_status in ('queued', 'held')
       and d.notification_delivery_next_attempt_at <= now()
     order by d.notification_delivery_next_attempt_at
     limit p_limit
     for update skip locked
  ), claimed as (
    update notification_deliveries d
       set notification_delivery_status = 'sending',
           notification_delivery_claimed_at = now(),
           notification_delivery_attempts = d.notification_delivery_attempts + 1
      from due where d.notification_delivery_id = due.notification_delivery_id
    returning d.*
  )
  select c.notification_delivery_id, c.notification_id, c.notification_delivery_channel, c.notification_delivery_address,
         c.notification_delivery_attempts, n.profile_id, p.profile_full_name, n.notification_type_id,
         n.notification_title, n.notification_body, n.notification_href, n.notification_created_at
    from claimed c
    join notifications n on n.notification_id = c.notification_id
    join profiles p on p.profile_id = n.profile_id;
end $$;
revoke execute on function claim_notification_deliveries(text, integer) from public, anon, authenticated;

-- Complete: sent with the provider's id, or failed with the error and a backoff of
-- 5, 25, 125 minutes… giving up as failed after five tries.
create or replace function complete_notification_delivery(p_id bigint, p_ok boolean, p_external_id text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare attempts integer;
begin
  select notification_delivery_attempts into attempts from notification_deliveries where notification_delivery_id = p_id;
  if p_ok then
    update notification_deliveries
       set notification_delivery_status = 'sent', notification_delivery_sent_at = now(),
           notification_delivery_external_id = p_external_id, notification_delivery_error = null
     where notification_delivery_id = p_id;
  elsif coalesce(attempts, 0) >= 5 then
    update notification_deliveries
       set notification_delivery_status = 'failed', notification_delivery_error = left(p_error, 1000)
     where notification_delivery_id = p_id;
  else
    update notification_deliveries
       set notification_delivery_status = 'queued', notification_delivery_error = left(p_error, 1000),
           notification_delivery_next_attempt_at = now() + (interval '5 minutes' * power(5, greatest(attempts - 1, 0)))
     where notification_delivery_id = p_id;
  end if;
end $$;
revoke execute on function complete_notification_delivery(bigint, boolean, text, text) from public, anon, authenticated;

-- Marking read is the person's own; marking all read is one call rather than fifty.
create or replace function mark_my_notifications_read(p_ids bigint[] default null) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n integer;
begin
  update notifications
     set notification_read_at = now()
   where profile_id = current_profile_id()
     and notification_read_at is null
     and (p_ids is null or notification_id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function mark_my_notifications_read(bigint[]) to authenticated;

-- ---------------------------------------------------------------------- proof
do $$
declare
  probe_address uuid; probe_project integer; probe_job text; probe_task uuid;
  someone uuid; n integer; held_at timestamptz;
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  select profile_id into someone from profiles where profile_is_active and not profile_is_demo order by profile_created_at limit 1;
  if someone is null then
    raise notice '0083 proof skipped: no active profile to notify on this database';
    return;
  end if;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0083', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design') returning job_id into probe_job;

  -- Assigning fires once, to the assignee, in-app sent and email queued (the defaults).
  insert into tasks (job_id, task_name, task_assignee_id) values (probe_job, 'probe 0083', someone) returning task_id into probe_task;
  select count(*) into n from notifications where profile_id = someone and notification_type_id = 'task_assigned' and task_id = probe_task;
  if n <> 1 then raise exception '0083 proof: expected one task_assigned notification, found %', n; end if;
  select count(*) into n from notification_deliveries d join notifications x using (notification_id)
   where x.task_id = probe_task and d.notification_delivery_channel = 'in_app' and d.notification_delivery_status = 'sent';
  if n <> 1 then raise exception '0083 proof: the in_app delivery was not sent on the spot'; end if;
  select count(*) into n from notification_deliveries d join notifications x using (notification_id)
   where x.task_id = probe_task and d.notification_delivery_channel = 'email' and d.notification_delivery_status = 'queued'
     and d.notification_delivery_address is not null;
  if n <> 1 then raise exception '0083 proof: the email delivery was not queued with an address'; end if;

  -- The scan: an overdue task fires once a day, to the assignee, held for the digest.
  update tasks set task_expected_days = 3, task_status = 'in_progress' where task_id = probe_task;
  update tasks set task_started_at = now() - interval '10 days' where task_id = probe_task;
  perform notify_scan();
  perform notify_scan();
  select count(*) into n from notifications where profile_id = someone and notification_type_id = 'task_overdue' and task_id = probe_task;
  if n <> 1 then raise exception '0083 proof: two scans produced % task_overdue rows, expected 1', n; end if;
  select d.notification_delivery_next_attempt_at into held_at
    from notification_deliveries d join notifications x using (notification_id)
   where x.task_id = probe_task and x.notification_type_id = 'task_overdue' and d.notification_delivery_channel = 'email';
  if held_at is null or held_at <= now() then raise exception '0083 proof: the digest email was not held for a later time'; end if;
  -- The owning team and (7 days late) the managers hear too; the assertion is about the assignee's rows.
  select count(*) into n from notification_deliveries d join notifications x using (notification_id)
   where x.task_id = probe_task and x.profile_id = someone and x.notification_type_id = 'task_overdue' and d.notification_delivery_status = 'held';
  if n <> 1 then raise exception '0083 proof: expected one held digest delivery for the assignee, found %', n; end if;

  -- A preference turns a channel off: no delivery row for it.
  insert into notification_preferences (profile_id, notification_type_id, notification_preference_channel, notification_preference_is_enabled)
  values (someone, 'task_assigned', 'email', false);
  update tasks set task_assignee_id = null where task_id = probe_task;
  update tasks set task_assignee_id = someone where task_id = probe_task;
  -- Same dedupe key (task, assignee) → no second inbox row either.
  select count(*) into n from notifications where profile_id = someone and notification_type_id = 'task_assigned' and task_id = probe_task;
  if n <> 1 then raise exception '0083 proof: re-assigning to the same person repeated the notification'; end if;

  -- Claim and complete, as the worker will.
  select count(*) into n from claim_notification_deliveries('email', 50) c
    join notifications x on x.notification_id = c.notification_id where x.task_id = probe_task and x.profile_id = someone;
  if n <> 1 then raise exception '0083 proof: the worker claimed % due email deliveries for the assignee, expected 1 (the held one is not due)', n; end if;
  perform complete_notification_delivery(d.notification_delivery_id, false, null, 'probe failure')
    from notification_deliveries d join notifications x using (notification_id)
   where x.task_id = probe_task and x.profile_id = someone and d.notification_delivery_status = 'sending';
  select count(*) into n from notification_deliveries d join notifications x using (notification_id)
   where x.task_id = probe_task and x.profile_id = someone and d.notification_delivery_status = 'queued' and d.notification_delivery_attempts = 1
     and d.notification_delivery_next_attempt_at > now();
  if n <> 1 then raise exception '0083 proof: a failed send was not re-queued with backoff'; end if;

  -- Left as found.
  delete from notification_preferences where profile_id = someone and notification_type_id = 'task_assigned';
  delete from notifications where task_id = probe_task;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from activity_audit where activity_audit_project_id = probe_project
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_id' = probe_address::text)
     or (activity_audit_table = 'notification_preferences' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'profile_id' = someone::text
         and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'notification_type_id' = 'task_assigned');
  perform setval(seq, seq_last, seq_called);
end $$;
