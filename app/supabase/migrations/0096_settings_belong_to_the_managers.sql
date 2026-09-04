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
-- Watched biting, both ways, as `authenticated` at manager — the level the whole
-- migration is about. The RLS-level probes live in verify/rls.sql where the harness runs
-- them on every check; this block is the one that proves the policy and the trigger the
-- moment the migration applies, because a migration whose own claim is only tested
-- somewhere else is a claim nobody has watched.
do $$
declare
  probe_uid uuid := gen_random_uuid();
  probe_profile uuid;
  stage uuid;
  before_days smallint;
begin
  insert into auth.users (id, email) values (probe_uid, '0096-probe@lofty.com.au');
  insert into profiles (profile_email, profile_first_name, profile_last_name,
                        profile_permission, profile_auth_user_id)
  values ('0096-probe@lofty.com.au', 'Sla', 'Probe', 'manager', probe_uid)
  returning profile_id into probe_profile;

  select ps.pipeline_stage_id, ps.pipeline_stage_expected_days into stage, before_days
  from pipeline_stages ps
  join pipelines p using (pipeline_id)
  where p.pipeline_key = 'build_lifecycle'
  order by ps.pipeline_stage_position
  limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', probe_uid::text, true);

  -- The SLA goes through.
  update pipeline_stages set pipeline_stage_expected_days = 21
   where pipeline_stage_id = stage;
  if not found then
    raise exception 'a manager could not set an SLA — the policy is missing';
  end if;

  -- The shape does not.
  begin
    update pipeline_stages set pipeline_stage_name = pipeline_stage_name || ' (renamed)'
     where pipeline_stage_id = stage;
    raise exception 'a manager renamed a stage';
  exception
    when insufficient_privilege then null;
  end;

  -- Neither does adding one: the manager policy is FOR UPDATE, and insert stays 0029's.
  begin
    insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position)
    values ((select pipeline_id from pipelines where pipeline_key = 'build_lifecycle'),
            '__0096_probe__', 98);
    raise exception 'a manager added a stage';
  exception
    when insufficient_privilege then null;
  end;

  -- And the rules a manager is now meant to write.
  insert into notification_rules (notification_type_id, notification_rule_audience)
  values ('task_overdue', 'managers');

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  -- Left exactly as found, plus the policies and the trigger.
  delete from notification_rules
   where notification_type_id = 'task_overdue' and notification_rule_audience = 'managers';
  update pipeline_stages set pipeline_stage_expected_days = before_days
   where pipeline_stage_id = stage;
  delete from profiles where profile_id = probe_profile;
  delete from auth.users where id = probe_uid;

  raise notice 'ok  a manager sets an SLA and a notification rule, and still cannot rename or add a stage';
end $$;
