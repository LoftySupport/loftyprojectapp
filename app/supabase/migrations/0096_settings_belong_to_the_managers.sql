-- 0096 — Settings belong to the managers
--
-- Amber, 4 September: *"Change the sidebar 'Setup' to 'Settings' and grant permissions
-- for managers and above to view this page. The purpose of 'settings' is to allow
-- managers and above update properties, processes, contact settings, maintenance tabs,
-- SLAs and automations."*
--
-- Properties, processes, contacts and maintenance already accept a manager's write —
-- 0077, 0078, 0082 and 0084 each set that floor. Two things on that list did not, and
-- without this migration the rename would have been the worst kind of half-change: a
-- screen a manager may open, with controls a manager may use, over two tables that
-- refuse them.
--
--   1. THE SLAs. `pipeline_stages` takes writes only from superadmin (0029), and 0047
--      said so in as many words: *"Editing stays superadmin's… the SLA is part of what
--      the stages ARE."* That reasoning still holds for what a stage IS — its name, its
--      position, whether it is external, which team owns it. It does not hold for how
--      long the stage should take, which is the number Amber has just handed to
--      managers. **This migration reverses that half of 0047 and keeps the other half.**
--
--      RLS cannot express a column rule, so the split is the 0060 shape: a policy that
--      lets a manager UPDATE the row, and a trigger that refuses every column but the
--      two SLA ones below superadmin. Insert and delete are untouched — a manager still
--      cannot add or remove a stage, which is probe 3 in verify/rls.sql.
--
--   2. THE NOTIFICATION RULES. `notification_types` and `notification_rules` were
--      admin's (0083). They live on Settings → Automations, because "overdue 5 days →
--      the managers" is an automation, and a manager who can set the SLA that decides
--      when overdue starts and not who hears about it has half a feature.
--
-- What did NOT move down: the permission model, the dictionary's status ladder, the
-- wiring, users and teams. Those went the other way on the same day — to Admin, behind
-- the header cog — and their policies are already where they should be.

-- ============================================================================
-- 1. A manager may set an SLA, and nothing else about a stage
-- ============================================================================

-- The columns a manager may change. One place, named once, so the trigger below and the
-- comment above cannot drift apart.
create or replace function stage_sla_columns() returns text[]
language sql
immutable
as $$ select array['pipeline_stage_expected_days', 'pipeline_stage_at_risk_lead_days'] $$;

comment on function stage_sla_columns() is
  'The pipeline_stages columns a manager may update (0096). Read by guard_stage_shape_change(); here rather than inline so the rule is stated once.';

create or replace function guard_stage_shape_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No JWT: a migration, a seed or the service role. Same stance as 0018, 0038 and 0060.
  if auth.uid() is null then
    return new;
  end if;

  if current_permission() >= 'superadmin'::permission_level then
    return new;
  end if;

  -- Everything a stage IS, as opposed to how long it should take. `pipeline_stage_id`
  -- and the created_* pair are in here too: a repointed primary key or a rewritten
  -- author is not an SLA edit either, and leaving them out would make this a list of the
  -- columns somebody remembered.
  if new.pipeline_stage_id       is distinct from old.pipeline_stage_id
     or new.pipeline_id          is distinct from old.pipeline_id
     or new.pipeline_stage_name  is distinct from old.pipeline_stage_name
     or new.pipeline_stage_position is distinct from old.pipeline_stage_position
     or new.pipeline_stage_type  is distinct from old.pipeline_stage_type
     or new.pipeline_stage_owning_team is distinct from old.pipeline_stage_owning_team
     or new.pipeline_stage_is_external is distinct from old.pipeline_stage_is_external
     or new.pipeline_stage_created_at  is distinct from old.pipeline_stage_created_at
     or new.pipeline_stage_created_by  is distinct from old.pipeline_stage_created_by
  then
    raise exception
      'Changing what a stage is needs superadmin permission. A manager may set its SLA (%).',
      array_to_string(stage_sla_columns(), ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Nobody calls this directly; it runs as a trigger. Same revokes as 0060's guard.
revoke execute on function guard_stage_shape_change() from public;
revoke execute on function guard_stage_shape_change() from anon;
revoke execute on function guard_stage_shape_change() from authenticated;

-- Named to sort BEFORE pipeline_stages_touch, so the shape is checked against the row
-- the caller sent rather than after moddatetime has been over it. Not that it matters —
-- the guard ignores pipeline_stage_updated_at on purpose, because the touch trigger
-- writes it on every update and a guard that refused that would refuse everything.
create trigger pipeline_stages_guard_shape
  before update on pipeline_stages
  for each row execute function guard_stage_shape_change();

comment on function guard_stage_shape_change() is
  'Refuses a change to any pipeline_stages column except the SLA pair below superadmin (Amber, 4 Sep). A trigger because RLS cannot express a column rule, and managers must hold the UPDATE policy to set an SLA at all.';

create policy "managers set stage slas" on pipeline_stages
  for update to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');

comment on table pipeline_stages is
  'A position within a pipeline. Not a column on the job: a job sits in several pipelines at once at different levels of detail, and a single stage column can only hold one of those answers. Superadmin owns what a stage IS; a manager may set its SLA (0096), which guard_stage_shape_change() is the other half of.';

-- ============================================================================
-- 2. Who hears what is a manager's automation
-- ============================================================================
drop policy "admins write notification types" on notification_types;
drop policy "admins write notification rules" on notification_rules;

create policy "managers write notification types" on notification_types
  for all to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');
create policy "managers write notification rules" on notification_rules
  for all to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');

comment on table notification_rules is
  'Who hears a notification type, and after how long. A manager''s to set (0096) — it sits on Settings → Automations beside the SLA that decides when overdue starts. Reading stays open: what will happen to you is not a secret.';

-- ---------------------------------------------------------------------- proof
-- WHAT THIS BLOCK MAY AND MAY NOT ASSERT, because the first version got it wrong.
--
-- It used to sign in as a manager and try the writes: insert an `auth.users` row and a
-- `profiles` row, set request.jwt.claim.sub, set an SLA, be refused a rename. That works
-- perfectly on verify/'s throwaway replay database and is the wrong thing to run on the
-- live one — **it is the only migration in this set that would ever have written to
-- `auth.users`**, production carries `trg_login_activity_auth_users` on that table (0008,
-- which is why no migration here can create it), and the audit trail would record a
-- person who never existed being created and deleted. A proof that dirties production to
-- prove something about a test database is not a proof, it is a side effect.
--
-- The guard also cannot be exercised from here on principle: it returns early when
-- `auth.uid()` is null, which is exactly what a migration is. Reaching it needs a signed-in
-- identity, and the only honest ways to get one are to invent a person or to impersonate a
-- real employee.
--
-- So the behaviour is proved where the harness already builds a test identity for every
-- policy in the app — `verify/rls.sql`, manager block, probes 4, 5 and 6 — and all three
-- were watched failing before they were kept: drop the trigger and the rename goes
-- through, drop either policy and the write it allows stops. What is left here is the
-- structural half: that the four objects this migration is made of exist, named as the
-- rest of the file names them. Cheap, and it catches a rename or a botched replay.
do $$
declare
  missing text[] := '{}';
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'pipeline_stages'
       and policyname = 'managers set stage slas' and cmd = 'UPDATE'
  ) then missing := missing || 'policy "managers set stage slas" on pipeline_stages'::text; end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.pipeline_stages'::regclass
       and tgname = 'pipeline_stages_guard_shape'
       and not tgisinternal
  ) then missing := missing || 'trigger pipeline_stages_guard_shape'::text; end if;

  if not exists (select 1 from pg_proc where proname = 'guard_stage_shape_change')
  then missing := missing || 'function guard_stage_shape_change()'::text; end if;

  -- Both halves of the notification move, and the absence of what they replaced: a
  -- replay that created the manager policy without dropping the admin one would leave
  -- the floor where it was and read as a pass.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'notification_types'
       and policyname = 'managers write notification types'
  ) then missing := missing || 'policy "managers write notification types"'::text; end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'notification_rules'
       and policyname = 'managers write notification rules'
  ) then missing := missing || 'policy "managers write notification rules"'::text; end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and policyname in ('admins write notification types', 'admins write notification rules')
  ) then missing := missing || 'the admin-era notification policies are still there'::text; end if;

  if array_length(missing, 1) is not null then
    raise exception '0096 did not finish: % missing', array_to_string(missing, '; ');
  end if;

  raise notice 'ok  0096: the SLA policy, the shape guard and the manager notification policies are in place';
end $$;
