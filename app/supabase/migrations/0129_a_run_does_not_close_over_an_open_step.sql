-- 0129 — A RUN DOES NOT CLOSE OVER AN OPEN STEP
--
-- Stage 2 of the 15 September audit, its second migration. `0128` gave a process one ordered
-- list of steps; this gives a RUN of that process a state per step, and makes completing it
-- mean something.
--
-- WHAT COMPLETING MEANT UNTIL NOW
--
--   Nothing. `0078`'s finding, in the audit's own words: ticking a process complete sets
--   `process_run_status` and stamps a time, and changes nothing else. *"2 required missing"* is
--   a chip in a subtitle the screen draws (`ProcessesPanel.tsx`), which is to say a person can
--   read it and the database cannot. 1002-001's *Invoice* run is in progress with both its
--   properties blank and nothing will ever say so.
--
--   Amber, 15 September, asked where the completion rule should live and chose the database
--   over the screen: a run cannot be complete while a required step is open, and the honest way
--   past a step that does not apply is marking **that step** not applicable — a recorded fact,
--   which is what `0078`'s *"complete with a gap is sometimes the truth"* becomes when the gap
--   has to be explained rather than assumed.
--
-- WHERE A STEP'S STATE LIVES, AND WHY IT IS NOT A COLUMN
--
--   It is derived, not stored, because every kind of step already has a home for its truth:
--
--     property   the value on the record (`property_values`)
--     task       the instantiated task's status (`tasks`, which carries the step's id)
--     checklist  the tick on that task's checklist line (`task_checklist_items`)
--     automation nothing yet — Stage 4 gives automations a registry and a run log
--
--   Storing a second copy per run would be two sources for one fact, which is the failure
--   `0078` wrote in capitals about properties and the audit found in three other places. So
--   `process_run_step_state` is a view, and the only thing this migration stores is the one
--   thing nowhere else holds: **that somebody decided a step does not apply on this run.**
--
-- WHAT A PROPERTY STEP READS ON A SECOND ATTEMPT
--
--   The value belongs to the record, not to the attempt, so a process run a second time
--   (a variation reopening Working Drawings, decision 7) starts with its property steps already
--   reading done. That is the truth about the house: the date IS recorded. What a second attempt
--   is for is recording it again with a new value, and the run's own dates say when that
--   happened. Named here rather than engineered around, because the alternative — a value per
--   attempt — is the two-sources failure again.
--
-- WHAT THIS DOES
--
--   `process_run_step_exemptions`: run, step, reason, who, when. A step marked not applicable.
--   `process_run_step_state`: one row per (run, step) with `done`, `open`, `not_applicable` or
--   `not_tracked`, and the completion gate reads it.
--   `guard_process_run_completion`: a run cannot be marked complete while a required step is
--   open. It says which steps, by name, because "cannot complete" without them is a dead end.
--   `task_checklist_items.process_step_id`: the provenance column that lets a checklist tick be
--   matched back to its step. Nothing writes it until the next migration instantiates from
--   steps; every existing row is null and there are none.

-- ================================================================== a run names its process
-- A composite key needs something to point at: this makes (run, process) unique so an exemption
-- can be held to a step of the run's OWN process by key rather than by trigger.
alter table process_runs drop constraint if exists process_runs_id_with_its_process;
alter table process_runs add constraint process_runs_id_with_its_process
  unique (process_run_id, process_id);

-- ================================================================== not applicable, recorded
create table if not exists process_run_step_exemptions (
  process_run_id   uuid not null,
  process_step_id  uuid not null,
  process_id       uuid not null,
  process_run_step_exemption_reason text,
  process_run_step_exemption_created_at timestamptz not null default now(),
  process_run_step_exemption_created_by uuid references profiles (profile_id),
  primary key (process_run_id, process_step_id),
  constraint process_run_step_exemptions_run_is_of_that_process
    foreign key (process_run_id, process_id) references process_runs (process_run_id, process_id) on delete cascade,
  constraint process_run_step_exemptions_step_is_of_that_process
    foreign key (process_id, process_step_id) references process_steps (process_id, process_step_id) on delete cascade
);
create index if not exists process_run_step_exemptions_step_idx
  on process_run_step_exemptions (process_step_id);

comment on table process_run_step_exemptions is
  'A step marked not applicable on one run (0129): the honest way past a step that does not apply to this house, and the only part of a step''s state that is not already recorded somewhere else. Amber, 15 September, on where the completion rule lives: in the database, with not applicable as the recorded way past. The two composite keys hold the run and the step to the same process.';
comment on column process_run_step_exemptions.process_id is 'Not redundant: it is the half of both keys that makes exempting another process''s step impossible.';
comment on column process_run_step_exemptions.process_run_step_exemption_reason is 'Why it does not apply — "no retaining wall on this block". Optional, and worth asking for: the reason is what makes the gap a decision rather than a silence.';

-- ================================================================== the checklist's provenance
-- A checklist line instantiated from a step has to be matchable back to it, or its tick can
-- never count towards the gate. Nullable and unwritten until the next migration instantiates
-- from steps; there are no checklist items on any database today.
alter table task_checklist_items add column if not exists process_step_id uuid
  references process_steps (process_step_id) on delete set null;
create index if not exists task_checklist_items_step_idx on task_checklist_items (process_step_id);
comment on column task_checklist_items.process_step_id is
  'The checklist step this tick came from (0129), so it can count towards its run''s completion. Written by the instantiation from steps; null on anything made before that.';

-- ================================================================== the state of every step
create or replace view process_run_step_state with (security_invoker = true) as
select
  r.process_run_id,
  r.process_id,
  s.process_step_id,
  s.process_step_position,
  s.process_step_kind,
  s.process_step_is_required,
  coalesce(s.process_step_name, d.property_def_label, s.property_def_key) as process_step_label,
  case
    -- Somebody said it does not apply. That answer wins over anything derived.
    when x.process_run_id is not null then 'not_applicable'
    -- A property step is done when the record carries the value.
    when s.process_step_kind = 'property' then
      case when exists (
        select 1 from property_values v
         where v.property_def_key = s.property_def_key
           and (v.job_id is not distinct from r.job_id)
           and (v.project_id is not distinct from r.project_id)
      ) then 'done' else 'open' end
    -- A task step is done when the task instantiated from it is done. Cancelled is not done,
    -- and it is not an exemption either: cancelling a task says nothing about whether the step
    -- applies, so the step stays open and somebody has to say which it is.
    when s.process_step_kind = 'task' then
      case when exists (
        select 1 from tasks t
         where t.process_run_id = r.process_run_id
           and t.process_task_id = s.process_step_id
           and t.task_status = 'done'
      ) then 'done' else 'open' end
    -- A checklist line is done when its tick is ticked.
    when s.process_step_kind = 'checklist' then
      case when exists (
        select 1 from task_checklist_items c
          join tasks t on t.task_id = c.task_id
         where c.process_step_id = s.process_step_id
           and t.process_run_id = r.process_run_id
           and c.task_checklist_item_is_done
      ) then 'done' else 'open' end
    -- An automation has no state until Stage 4 gives it one. It is not 'done' and it is not
    -- 'open': calling it either would be an answer this schema cannot support yet, and an
    -- automation step holding a run open would be a gate nobody could pass.
    else 'not_tracked'
  end as process_run_step_state
from process_runs r
join process_steps s on s.process_id = r.process_id
left join property_defs d on d.property_def_key = s.property_def_key
left join process_run_step_exemptions x
       on x.process_run_id = r.process_run_id and x.process_step_id = s.process_step_id;

comment on view process_run_step_state is
  'One row per step of every run, with the state derived from wherever that kind of step keeps its truth (0129): a property value on the record, a task''s status, a checklist tick, or an exemption somebody recorded. Nothing is stored twice. security_invoker, so a person sees the states of the runs they can see.';
grant select on process_run_step_state to authenticated, service_role;

-- ================================================================== the gate
create or replace function guard_process_run_completion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  open_steps text;
begin
  if new.process_run_status is distinct from 'complete' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.process_run_status = 'complete' then
    return new;  -- already complete; this update is about something else
  end if;

  select string_agg(st.process_step_label, ', ' order by st.process_step_position)
    into open_steps
    from process_run_step_state st
   where st.process_run_id = new.process_run_id
     and st.process_step_is_required
     and st.process_run_step_state = 'open';

  if open_steps is not null then
    raise exception
      'This process still needs: %. Finish them, or mark the ones that do not apply to this record as not applicable.',
      open_steps
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function guard_process_run_completion() from public, anon, authenticated;

drop trigger if exists process_runs_guard_completion on process_runs;
create trigger process_runs_guard_completion
  before insert or update of process_run_status on process_runs
  for each row execute function guard_process_run_completion();

-- ================================================================== who may do what
alter table process_run_step_exemptions enable row level security;
drop policy if exists "read process run step exemptions" on process_run_step_exemptions;
drop policy if exists "users write process run step exemptions" on process_run_step_exemptions;
create policy "read process run step exemptions" on process_run_step_exemptions
  for select to authenticated using ((select is_active_user()));
-- Marking a step not applicable is ordinary work, the same rung as running the process: the
-- person doing the job is the one who knows the house has no retaining wall. It is recorded
-- with their name and their reason, which is what makes that safe.
create policy "users write process run step exemptions" on process_run_step_exemptions
  for all to authenticated
  using ((select current_permission()) >= 'user') with check ((select current_permission()) >= 'user');

drop trigger if exists process_run_step_exemptions_stamp_created_by on process_run_step_exemptions;
create trigger process_run_step_exemptions_stamp_created_by before insert on process_run_step_exemptions
  for each row execute function stamp_created_by('process_run_step_exemption_created_by');
drop trigger if exists trg_activity_audit_row on process_run_step_exemptions;
create trigger trg_activity_audit_row after insert or update or delete on process_run_step_exemptions
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- Watched failing with the trigger dropped: a run with two open required property steps was
-- marked complete and the database said nothing.
do $$
declare
  a_job     text;
  a_process uuid;
  a_step    uuid;
  a_run     uuid;
  n         integer;
  state     text;
begin
  -- A process with required property steps, on a job that exists.
  select job_id into a_job from jobs order by job_id limit 1;
  if a_job is null then
    raise notice '0129 proof: no jobs on this database, so the gate could not be exercised here.';
    return;
  end if;

  select s.process_id, s.process_step_id into a_process, a_step
    from process_steps s
    join processes p using (process_id)
   where s.process_step_kind = 'property' and p.process_scope = 'job'
   order by p.process_key, s.process_step_position
   limit 1;

  update process_steps set process_step_is_required = true where process_step_id = a_step;

  insert into process_runs (process_id, job_id, process_run_status)
  values (a_process, a_job, 'in_progress')
  returning process_run_id into a_run;

  -- The view answers for every step of that run.
  select count(*) into n from process_run_step_state where process_run_id = a_run;
  if n <> (select count(*) from process_steps where process_id = a_process) then
    raise exception '0129 proof: the state view has % rows for a process with % steps',
      n, (select count(*) from process_steps where process_id = a_process);
  end if;

  select process_run_step_state into state
    from process_run_step_state where process_run_id = a_run and process_step_id = a_step;
  if state <> 'open' then
    raise exception '0129 proof: a property step with no value read %, not open', state;
  end if;

  -- The gate refuses.
  begin
    update process_runs set process_run_status = 'complete' where process_run_id = a_run;
    raise exception '0129 proof: a run with an open required step was marked complete';
  exception when check_violation then null;
  end;

  -- Marked not applicable, it is not open any more, and the run closes.
  insert into process_run_step_exemptions (process_run_id, process_step_id, process_id,
                                           process_run_step_exemption_reason)
  values (a_run, a_step, a_process, '0129 proof: it does not apply to this record');
  select process_run_step_state into state
    from process_run_step_state where process_run_id = a_run and process_step_id = a_step;
  if state <> 'not_applicable' then
    raise exception '0129 proof: an exempted step read %, not not_applicable', state;
  end if;

  select string_agg(process_run_step_label, ', ') into state
    from (select st.process_step_label as process_run_step_label from process_run_step_state st
           where st.process_run_id = a_run and st.process_step_is_required
             and st.process_run_step_state = 'open') q;
  if state is not null then
    -- Other required steps of the same process are still open, which is the honest state of
    -- this fixture rather than a failure: exempt them too, so the gate itself can be proved.
    insert into process_run_step_exemptions (process_run_id, process_step_id, process_id,
                                             process_run_step_exemption_reason)
    select a_run, st.process_step_id, a_process, '0129 proof'
      from process_run_step_state st
     where st.process_run_id = a_run and st.process_step_is_required
       and st.process_run_step_state = 'open'
    on conflict do nothing;
  end if;

  update process_runs set process_run_status = 'complete' where process_run_id = a_run;
  if (select process_run_status from process_runs where process_run_id = a_run) <> 'complete' then
    raise exception '0129 proof: a run with every required step answered would not close';
  end if;

  -- An exemption cannot name a step of another process.
  begin
    insert into process_run_step_exemptions (process_run_id, process_step_id, process_id)
    select a_run, s.process_step_id, a_process from process_steps s
     where s.process_id <> a_process limit 1;
    raise exception '0129 proof: a step of another process was exempted on this run';
  exception when foreign_key_violation then null;
  end;

  -- Clean up: the fixture run, its exemptions (cascade) and the flag this proof set.
  delete from process_runs where process_run_id = a_run;
  update process_steps set process_step_is_required = false
   where process_step_id = a_step
     and exists (select 1 from process_properties pp
                  where pp.process_id = a_process
                    and pp.property_def_key = (select property_def_key from process_steps where process_step_id = a_step)
                    and not pp.process_property_required);

  raise notice '0129 proof: the state view answers for every step, a run with an open required step is refused, and one marked not applicable lets it close.';
end $$;
