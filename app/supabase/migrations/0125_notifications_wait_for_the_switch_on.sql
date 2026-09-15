-- 0125 — NOTIFICATIONS WAIT FOR THE SWITCH-ON
--
-- Amber, 15 September, when the audit asked whether the undeployed email worker should stay:
--
--   "i am connecting microsoft teams and email and sharepont now so keep it in but don't
--    send any previous notifications until they are all switched on. All notificatoins
--    should be turned off in users settings by default until app is ready for testing but
--    the functionality should exist"
--
-- Three things follow, and this file is all three. The third, the defaults, waited on one
-- question: does "all off" include in-app? Amber, 15 September, given the choice: **"External
-- off, in-app stays on."** So every type keeps in-app as its default and loses email; a person
-- opts in to an external channel in User settings, and a manager can put one back on a type's
-- defaults in Setup.
--
-- 1 · A SWITCH-ON MOMENT, IN ONE ROW
--
--   `notification_settings` has one row and one fact: `notification_setting_switch_on_at`.
--   Null means not switched on. Everyone reads it; an admin sets it, by SQL for now, when
--   Microsoft is connected and the worker is deployed with its secrets. Setup → Notifications
--   shows the state so "notifications are on" is never a claim the table cannot back.
--
-- 2 · NOTHING QUEUED BEFORE IT IS EVER SENT
--
--   Two places enforce it, because they are two different failure modes:
--
--   `private.notify` writes an external row (email, teams, sms) as `skipped`, with the reason
--   in the error column, whenever the switch-on is null or still ahead. In-app is untouched:
--   it is sent as it is written, inside the app, and was never "sending" anything anywhere.
--
--   `claim_notification_deliveries` claims only rows created at or after the switch-on. So
--   a row that reached the outbox as queued or held by any path — a preference set before
--   this ran, a scan, a hand-written insert — still does not leave once the worker exists.
--   With the switch-on null the comparison is null and nothing is claimed at all.
--
--   The four rows already waiting (a task_assigned of 12 September and one task_overdue
--   digest a day since, all to Gary, all email) are marked skipped here, with the same
--   reason, so the outbox says what happened to them rather than holding them forever.
--   Their in-app twins were delivered on the day and stay as they are.
--
--   NOT gated: the maintenance thread's own outbox (`maintenance_messages`, 0084). Those are
--   the offer to a contractor and the closing email to a homeowner, not notifications a
--   person can switch off, and the table is empty. The worker's Graph secrets being unset
--   keeps that path inert too; when they are set, that is the moment to decide.
--
-- WHY A TABLE AND NOT A SECRET OR A COLUMN ON notification_types
--
--   The worker's DELIVER_SECRET already makes a deploy inert until it is set — but it is a
--   fact about the function, invisible to the database and to the app, and it says nothing
--   about rows written before it. The rule Amber stated is about WHEN a row was written, so
--   it has to be a timestamp the database can compare against, in a place the app can read.
--   `maintenance_settings` (0084) is the pattern: one row, a CHECK pinning the key to 1.

-- ================================================================== 1 · the row
create table if not exists notification_settings (
  notification_setting_id           smallint primary key default 1
    constraint notification_settings_is_one_row check (notification_setting_id = 1),
  notification_setting_switch_on_at timestamptz,
  notification_setting_updated_at   timestamptz not null default now(),
  notification_setting_updated_by   uuid references profiles (profile_id)
);
insert into notification_settings (notification_setting_id) values (1) on conflict do nothing;

comment on table notification_settings is
  'One row (0125): the moment notifications were switched on. Null until they are. private.notify writes every email, teams and sms row created before it as skipped, and claim_notification_deliveries never claims a row created before it, so nothing queued before the switch-on is sent (Amber, 15 September). In-app rows are not gated: they are delivered inside the app as they are written. Everyone reads; an admin sets it.';
comment on column notification_settings.notification_setting_switch_on_at is
  'When external delivery was switched on. Null: not yet. Set by an admin once Microsoft is connected and the worker is deployed; rows created before this moment are skipped, never sent.';

alter table notification_settings enable row level security;
drop policy if exists "read notification_settings" on notification_settings;
drop policy if exists "admins set notification_settings" on notification_settings;
create policy "read notification_settings" on notification_settings
  for select to authenticated using ((select is_active_user()));
create policy "admins set notification_settings" on notification_settings
  for update to authenticated
  using ((select current_permission()) >= 'admin') with check ((select current_permission()) >= 'admin');

drop trigger if exists notification_settings_touch on notification_settings;
create trigger notification_settings_touch before update on notification_settings
  for each row execute function extensions.moddatetime(notification_setting_updated_at);
drop trigger if exists trg_activity_audit_row on notification_settings;
create trigger trg_activity_audit_row after insert or update or delete on notification_settings
  for each row execute function log_activity_audit();

-- ================================================================== 2 · the writer
-- 0083's function with one addition: an external row written before the switch-on is
-- `skipped`, and says why. Everything else, including the digest arithmetic, is as it was.
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
  switch_on timestamptz;
  live boolean;
begin
  select * into ty from notification_types where notification_type_id = p_type and notification_type_is_active;
  if ty.notification_type_id is null then return 0; end if;

  select s.notification_setting_switch_on_at into switch_on from notification_settings s where s.notification_setting_id = 1;
  live := switch_on is not null and switch_on <= now();

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
      timing := coalesce(timing, ty.notification_type_default_timing);
      digest_at := coalesce(digest_at, time '07:30');
      addr := case ch
                when 'email' then (select coalesce(p.profile_login_email, p.profile_email) from profiles p where p.profile_id = who)
                when 'teams' then (select coalesce(p.profile_login_email, p.profile_email) from profiles p where p.profile_id = who)
                else null end;
      if ch = 'in_app' then
        insert into notification_deliveries (notification_id, notification_delivery_channel, notification_delivery_status, notification_delivery_sent_at)
        values (nid, ch, 'sent', now());
      elsif not live then
        -- Before the switch-on: the row exists, so the person's choice is recorded and the
        -- outbox panel can count it, and it is already in its final state.
        insert into notification_deliveries (notification_id, notification_delivery_channel, notification_delivery_status, notification_delivery_address, notification_delivery_error)
        values (nid, ch, 'skipped', addr, 'not sent: written before the switch-on (0125)');
      elsif timing = 'digest' then
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

-- ================================================================== 3 · the claim
-- 0083's function with one more condition in `due`: created at or after the switch-on.
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
       -- Null switch-on compares as null, so nothing is due until it is set.
       and d.notification_delivery_created_at >= (select s.notification_setting_switch_on_at
                                                    from notification_settings s where s.notification_setting_id = 1)
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

-- ================================================================== 4 · the rows already waiting
-- Four on the live database on 15 September: 3 held, 1 queued, all email, all Gary's. None on
-- a rebuild, where this is a no-op. In-app rows are not external and are not touched.
update notification_deliveries
   set notification_delivery_status = 'skipped',
       notification_delivery_error = 'not sent: written before the switch-on (0125)'
 where notification_delivery_channel <> 'in_app'
   and notification_delivery_status in ('queued', 'held');

-- ================================================================== 5 · the defaults
-- Amber, 15 September: "External off, in-app stays on." Every type keeps in-app where it had
-- it (all fifteen do) and loses email, teams and sms from its defaults. On the day eight of
-- fifteen carried email. A person's own preference rows are untouched: a choice already made
-- is not a default. The column default stays array['in_app'], so a type added later starts
-- the same way.
update notification_types
   set notification_type_default_channels = array_remove(array_remove(array_remove(
         notification_type_default_channels, 'email'), 'teams'), 'sms')
 where notification_type_default_channels && array['email', 'teams', 'sms'];

-- ---------------------------------------------------------------------- proof
-- Watched failing live, in a rolled-back transaction, against 0083's notify with only the
-- settings row present: the email row came back `queued`, which is the thing this forbids.
-- The defaults assertion was watched failing the same way: eight types carried email.
do $$
declare
  someone uuid; n integer; st text;
begin
  if (select count(*) from notification_settings) <> 1 then
    raise exception '0125 proof: the settings row is missing';
  end if;
  if (select notification_setting_switch_on_at from notification_settings) is not null then
    raise exception '0125 proof: the switch-on is already set on a database this has just run on';
  end if;
  if exists (select 1 from notification_deliveries
              where notification_delivery_channel <> 'in_app' and notification_delivery_status in ('queued', 'held')) then
    raise exception '0125 proof: an external row is still queued or held';
  end if;
  if exists (select 1 from notification_types where notification_type_default_channels && array['email', 'teams', 'sms']) then
    raise exception '0125 proof: a type still has an external channel in its defaults: %',
      (select string_agg(notification_type_id, ', ') from notification_types where notification_type_default_channels && array['email', 'teams', 'sms']);
  end if;
  if exists (select 1 from notification_types where notification_type_is_active and not ('in_app' = any (notification_type_default_channels))) then
    raise exception '0125 proof: an active type lost in-app from its defaults: %',
      (select string_agg(notification_type_id, ', ') from notification_types where notification_type_is_active and not ('in_app' = any (notification_type_default_channels)));
  end if;

  -- A person with no preferences of their own, opted in to email for one type, so nothing
  -- here depends on what the defaults are.
  select p.profile_id into someone from profiles p
   where p.profile_is_active and not p.profile_is_demo
     and not exists (select 1 from notification_preferences np where np.profile_id = p.profile_id)
   order by p.profile_created_at limit 1;
  if someone is null then
    raise notice '0125 proof skipped: no active profile without preferences to notify';
    return;
  end if;
  insert into notification_preferences (profile_id, notification_type_id, notification_preference_channel, notification_preference_is_enabled)
  values (someone, 'task_assigned', 'email', true);

  -- Before the switch-on: skipped, with the reason.
  perform private.notify('task_assigned', array[someone], 'probe 0125', 'probe', null, 'probe-0125-before');
  select d.notification_delivery_status into st
    from notification_deliveries d join notifications x using (notification_id)
   where x.profile_id = someone and x.notification_dedupe_key = 'probe-0125-before' and d.notification_delivery_channel = 'email';
  if st is distinct from 'skipped' then
    raise exception '0125 proof: before the switch-on the email row is %, expected skipped', coalesce(st, 'missing');
  end if;

  -- After it: queued, as 0083 always did.
  update notification_settings set notification_setting_switch_on_at = now() - interval '1 minute' where notification_setting_id = 1;
  perform private.notify('task_assigned', array[someone], 'probe 0125', 'probe', null, 'probe-0125-after');
  select d.notification_delivery_status into st
    from notification_deliveries d join notifications x using (notification_id)
   where x.profile_id = someone and x.notification_dedupe_key = 'probe-0125-after' and d.notification_delivery_channel = 'email';
  if st is distinct from 'queued' then
    raise exception '0125 proof: after the switch-on the email row is %, expected queued', coalesce(st, 'missing');
  end if;

  -- The claim respects the moment both ways: moved ahead of the row, nothing; behind it, the one.
  update notification_settings set notification_setting_switch_on_at = now() + interval '1 hour' where notification_setting_id = 1;
  select count(*) into n from claim_notification_deliveries('email', 100) c
    join notifications x on x.notification_id = c.notification_id
   where x.profile_id = someone and x.notification_dedupe_key like 'probe-0125-%';
  if n <> 0 then raise exception '0125 proof: the worker claimed % row(s) written before the switch-on', n; end if;
  update notification_settings set notification_setting_switch_on_at = now() - interval '1 minute' where notification_setting_id = 1;
  select count(*) into n from claim_notification_deliveries('email', 100) c
    join notifications x on x.notification_id = c.notification_id
   where x.profile_id = someone and x.notification_dedupe_key like 'probe-0125-%';
  if n <> 1 then raise exception '0125 proof: the worker claimed % row(s) after the switch-on, expected the one queued', n; end if;

  -- Left as found: switched off, the opt-in gone, the probe's rows and their audit gone.
  delete from notification_deliveries d using notifications x
   where d.notification_id = x.notification_id and x.profile_id = someone and x.notification_dedupe_key like 'probe-0125-%';
  delete from notifications where profile_id = someone and notification_dedupe_key like 'probe-0125-%';
  delete from notification_preferences where profile_id = someone and notification_type_id = 'task_assigned' and notification_preference_channel = 'email';
  update notification_settings set notification_setting_switch_on_at = null, notification_setting_updated_by = null where notification_setting_id = 1;
  delete from activity_audit
   where activity_audit_table = 'notification_settings'
      or (activity_audit_table = 'notification_preferences'
          and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'profile_id' = someone::text
          and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'notification_type_id' = 'task_assigned')
      or (activity_audit_table in ('notifications', 'notification_deliveries')
          and coalesce(activity_audit_new_row, activity_audit_old_row)::text like '%probe-0125-%');
  raise notice '0125 proof: skipped before the switch-on, queued after it, the worker claims only rows written after it, and no type defaults to an external channel.';
end $$;
