-- =============================================================================
-- 0097 — Creating a notification TYPE is admin's again; the rules stay a manager's
-- =============================================================================
-- Amber, 7 September, answering the last of the three questions 0096 left open:
-- creating a notification type goes back to admin. The rules do not move.
--
-- THE DISTINCTION, because it is the whole migration and it is easy to lose:
--
--   A RULE says WHO HEARS a thing. "Overdue 5 days -> the managers." That is an
--   automation, it sits on Settings -> Automations beside the SLA that decides when
--   overdue starts, and 0096's reasoning holds exactly: a manager who can set the SLA
--   and not who finds out has half a feature. Untouched here.
--
--   A TYPE says WHETHER THAT KIND OF NOTIFICATION EXISTS AT ALL. It is a row four other
--   tables point at -- notification_rules, notification_preferences, notifications and
--   notification_deliveries all carry notification_type_id as a foreign key -- so it is
--   nearer to "what the app IS" than to "the dials of the work", which is the line Admin
--   and Settings were split on in the first place (0096's own words). 0096 moved it down
--   as a side effect of moving the rules, not on an argument of its own.
--
-- WHY THIS IS THREE POLICIES AND NOT ONE, which is the part worth reading:
--
--   The obvious change is to swap 0096's `for all ... >= 'manager'` for `for all ...
--   >= 'admin'`. That would be wrong, and not subtly. `for all` covers UPDATE, and a
--   manager's ONLY type write today is an update: `saveNotificationType()` in
--   supabaseNotificationRepository.ts sets default channels, default timing and the
--   active flag on an EXISTING row, and that is what Settings -> Automations is made of.
--   One `for all` policy would have silently broken that screen for every manager.
--
--   Amber was asked about CREATING a type and answered about creating a type. So:
--
--     INSERT   admin   -- inventing a kind of notification is defining the vocabulary
--     DELETE   admin   -- you cannot sensibly gate creation and leave destruction open
--     UPDATE   manager -- changing an existing type's defaults is configuring it
--     SELECT   open    -- 0083, untouched: what will happen to you is not a secret
--
--   Deactivating a type via that UPDATE stays a manager's. That is deliberate and is the
--   one edge worth flagging: `notification_type_is_active` is close to "does this exist",
--   so if Amber wants it admin's too, it needs a column guard like 0096's
--   guard_stage_shape_change(), not a policy. It is not assumed here.
--
-- NO APP CHANGE ACCOMPANIES THIS. There is no create-a-type or delete-a-type control in
-- the app -- no repository method for either, so today the only way a type is created is
-- a migration. This tightens the DATABASE boundary so that stays true when somebody
-- builds the screen. `can('manager')` on the Automations page still matches what a
-- manager may actually do, so it is not decoration.
--
-- REVERSING 0096 IN PART IS THE POINT. 0096 is not wrong and is not being corrected: it
-- bundled two tables under one argument, and only one of them was load-bearing for that
-- argument. The bundling is the thing being undone.

-- ============================================================================
-- 1. The policies
-- ============================================================================
drop policy if exists "managers write notification types" on notification_types;
drop policy if exists "admins write notification types" on notification_types;
drop policy if exists "admins create notification types" on notification_types;
drop policy if exists "admins delete notification types" on notification_types;
drop policy if exists "managers set notification type defaults" on notification_types;

create policy "admins create notification types" on notification_types
  for insert to authenticated
  with check ((select current_permission()) >= 'admin');

create policy "admins delete notification types" on notification_types
  for delete to authenticated
  using ((select current_permission()) >= 'admin');

create policy "managers set notification type defaults" on notification_types
  for update to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');

comment on table notification_types is
  'What can be said: the kinds of notification the app raises, and their defaults. Admin''s to CREATE or REMOVE (0097) -- a type is a row every other notification table points at, so the vocabulary is what the app IS rather than a dial on the work. A manager may still change an existing type''s default channels, timing and active flag, which is what Settings -> Automations edits. Who HEARS each type is notification_rules, and that stayed a manager''s (0096). Reading is open to every active user.';

-- ---------------------------------------------------------------------- proof
-- The same limits as 0096's proof block, for the same reasons: a migration has no
-- auth.uid(), so `current_permission()` cannot be exercised from here, and inventing a
-- person to sign in as would write to auth.users on the live database -- which carries
-- trg_login_activity_auth_users (0008) and would record a person who never existed.
--
-- So the BEHAVIOUR is proved in verify/rls.sql, where the harness already builds a test
-- identity. The manager block now runs three probes that together are this migration's
-- entire claim: a manager writes a RULE (probe 6, from 0096, which must keep passing),
-- is REFUSED a new TYPE (probe 7), and can still UPDATE an existing type's defaults
-- (probe 8). Probe 8 is the one that catches the `for all` mistake described above --
-- it fails loudly against a single admin-only policy, which is exactly how that error
-- would reach a manager otherwise.
--
-- What is left here is structural, and it is worth more than it looks: it asserts the
-- three new policies exist AND that both policies they replace are gone. A replay that
-- created these without dropping 0096's would leave the manager `for all` attached, and
-- because PostgreSQL ORs permissive policies together, a manager could still insert.
-- The migration would look applied and change nothing.
do $$
declare
  missing text[] := '{}';
  expected text;
begin
  foreach expected in array array[
    'admins create notification types',
    'admins delete notification types',
    'managers set notification type defaults'
  ] loop
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'notification_types' and policyname = expected
    ) then missing := missing || format('policy %L on notification_types', expected); end if;
  end loop;

  foreach expected in array array[
    'managers write notification types',
    'admins write notification types'
  ] loop
    if exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'notification_types' and policyname = expected
    ) then
      missing := missing || format(
        'superseded policy %L is STILL ATTACHED — permissive policies OR together, so the write it allows would survive', expected);
    end if;
  end loop;

  -- The rules did NOT move. If this is missing, something dropped more than it meant to.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'notification_rules'
       and policyname = 'managers write notification rules'
  ) then missing := missing || 'policy "managers write notification rules" on notification_rules went missing — 0097 must not touch the rules'::text; end if;

  if array_length(missing, 1) is not null then
    raise exception '0097 did not take: %', array_to_string(missing, '; ');
  end if;
  raise notice 'ok  0097: creating a notification type is admin''s; its defaults and its rules are still a manager''s';
end $$;
