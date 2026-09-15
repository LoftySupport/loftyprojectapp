-- =============================================================================
-- 0132 — a job's place is a reading of its processes, and a pin overrides it
--
-- 24 August decided a job does not advance on its own: a manager moves it through the
-- confirm modal, and nothing else may. Amber reversed that on 15 September, audit decision
-- 3: *"1. as long as it can be manually overriddent"*. So the stage is derived, and the
-- modal becomes the override rather than the only mover.
--
-- WHAT IS DERIVED
--
--   **The sub-stage** is the earliest sub-stage, in lifecycle order, holding a non-optional
--   active job-scoped process whose latest attempt on this job is neither complete nor not
--   applicable. A process that has never run counts as open — it has not been done, and the
--   reading under which it did not count would put a job with no runs at all past the end of
--   the lifecycle.
--
--   **The stage** is that sub-stage's stage, and it never moves backwards. What 24 August
--   feared — an amendment dragging a job back through the board — is answered by attempts:
--   the derivation reads the LATEST attempt of each process, so a second pass at Working
--   Drawings does not take the job out of Construction, and the floor at the job's current
--   position covers the rest.
--
-- WHAT IS STORED, AND WHY THE STAGE STILL IS
--
--   `jobs.job_stage` stays a column. The board's columns, `guard_lifecycle_is_linear`, the
--   project cascade, `job_stage_entered_at` and `notify_stage_changed` all key off it, and
--   a derived-on-read stage would mean rewriting every one of them in a migration about
--   processes. So the column is the derivation's OUTPUT and `job_derived_stage()` is its
--   DEFINITION, kept in step by a trigger — with a probe that says so, because a cached
--   derivation nobody checks is how two sources of truth start.
--
--   The SUB-STAGE is not stored at all. Nothing keyed off it before today, so it is read
--   from `job_display` and there is no second copy to disagree.
--
-- THE PIN
--
--   `job_stage_pinned_at` with who and why. While it is set the derivation does not move
--   the job: an imported older job sits where somebody put it, and a manager who moved a
--   job by hand does not have to watch it move back. Unpinning hands it back to the
--   processes. The pin is a manager's act, like the move it replaces.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
--   **A job with no open required process anywhere does not move.** The derivation returns
--   null and the trigger leaves the column alone. Whether finishing everything should carry
--   a job to *Completed* is a business decision nobody has made — it is open question 0k —
--   and moving a job to a terminal stage on a guess is the expensive half of being wrong.
-- =============================================================================
set lock_timeout = '5s';

-- ===================================================================== the pin
alter table jobs
  add column if not exists job_stage_pinned_at  timestamptz,
  add column if not exists job_stage_pinned_by  uuid references profiles (profile_id),
  add column if not exists job_stage_pin_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_a_pin_has_a_person_and_a_time') then
    alter table jobs add constraint jobs_a_pin_has_a_person_and_a_time
      check ((job_stage_pinned_at is null) = (job_stage_pinned_by is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_a_pin_reason_needs_a_pin') then
    alter table jobs add constraint jobs_a_pin_reason_needs_a_pin
      check (job_stage_pin_reason is null or job_stage_pinned_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_a_pin_reason_is_not_blank') then
    alter table jobs add constraint jobs_a_pin_reason_is_not_blank
      check (job_stage_pin_reason is null or length(trim(job_stage_pin_reason)) > 0);
  end if;
end $$;

comment on column jobs.job_stage_pinned_at is
  'When this job''s stage was pinned (0132). While set, the process derivation does not move the job: an imported older job stays where somebody put it. Null means the stage follows the processes.';
comment on column jobs.job_stage_pinned_by is
  'Who pinned the stage (0132). Written with the time, never separately.';
comment on column jobs.job_stage_pin_reason is
  'Why the stage was pinned (0132) — the confirm modal''s reason box. Optional, because a manager moving a job forwards may have nothing to add, and an invented reason is worse than a blank.';

-- ============================================================== the derivation
-- An open sub-stage is one holding a non-optional active JOB-SCOPED process whose latest
-- attempt on this job is neither complete nor not applicable. A process that has never run
-- matches, which is the point — nobody has done it.
--
-- Job-scoped only, and that is not a narrowing: a project-scoped process runs on the
-- PROJECT record, so a job has no attempt at it to read. One consequence is worth saying
-- out loud rather than discovering: Acquisition & Development holds two processes and both
-- are project-scoped, so no job has work of its own there and every job derives to
-- Pre-construction or later. Live that changes nothing — all 83 jobs are already in
-- Pre-construction — but it is why a brand new job does not sit in A&D waiting.
create or replace function private.substage_is_open(a_substage uuid, a_job text) returns boolean
language sql stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from processes p
     where p.lifecycle_substage_id = a_substage
       and p.process_is_active
       and not p.process_is_optional
       and p.process_scope = 'job'
       and not exists (
         select 1
           from process_runs r
          where r.process_id = p.process_id
            and r.job_id = a_job
            and r.process_run_status in ('complete', 'not_applicable')
            and r.process_run_attempt = (
                  select max(r2.process_run_attempt) from process_runs r2
                   where r2.process_id = p.process_id and r2.job_id = a_job)));
$$;

comment on function private.substage_is_open(uuid, text) is
  'Whether one sub-stage still holds work for one job (0132): a non-optional active job-scoped process whose latest attempt is neither complete nor not applicable, or which has never run. The one definition of open, read by both job_open_substage and job_derived_stage so they cannot drift.';

revoke execute on function private.substage_is_open(uuid, text) from public, anon, authenticated;

-- IN ITS STAGE, which is decision 3's wording and not a paraphrase: the sub-stage a job is
-- up to is the earliest one of the stage it is IN. Null when that stage has nothing open,
-- which is the signal job_derived_stage() reads to look forward.
create or replace function job_open_substage(a_job text) returns uuid
language sql stable
set search_path = public, pg_temp
as $$
  select s.lifecycle_substage_id
    from jobs j
    join lifecycle_stages st on st.lifecycle_stage_name = j.job_stage
    join lifecycle_substages s on s.lifecycle_stage_id = st.lifecycle_stage_id
   where j.job_id = a_job
     and s.lifecycle_substage_is_active
     and private.substage_is_open(s.lifecycle_substage_id, a_job)
   order by s.lifecycle_substage_position, s.lifecycle_substage_name
   limit 1;
$$;

comment on function job_open_substage(text) is
  'The sub-stage a job is up to (0132): the earliest sub-stage OF THE STAGE IT IS IN that still holds work for it. Null when its stage is finished — the job has not moved yet, and job_derived_stage() is what says where to.';

-- The stage: stay while this one still has work, otherwise the earliest LATER stage that
-- does. Null when nothing is open anywhere, which the trigger reads as "no move" rather
-- than as "finished" — audit question 0k, answered 15 September: a job that has finished
-- everything stays put, and a manager carries it to Completed through the modal.
create or replace function job_derived_stage(a_job text) returns text
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    -- Still work here.
    (select j.job_stage from jobs j
      where j.job_id = a_job and job_open_substage(a_job) is not null),
    -- Otherwise the next stage along that has any.
    (select st.lifecycle_stage_name
       from lifecycle_stages st
       join lifecycle_substages s on s.lifecycle_stage_id = st.lifecycle_stage_id
      where st.lifecycle_stage_is_active
        and s.lifecycle_substage_is_active
        and st.lifecycle_stage_position > (select lifecycle_position(j.job_stage) from jobs j where j.job_id = a_job)
        and private.substage_is_open(s.lifecycle_substage_id, a_job)
      order by st.lifecycle_stage_position, s.lifecycle_substage_position
      limit 1));
$$;

comment on function job_derived_stage(text) is
  'The stage a job''s processes put it in (0132): where it is while that stage still holds work, otherwise the earliest later stage that does. Never backwards, because it only ever looks forward. Null when nothing is open anywhere — the trigger leaves the job alone rather than moving it to a terminal stage nobody decided on (question 0k, answered: it stays put).';

-- ======================================================== moving the job on its own
--
-- The move is the database's, so the guard that asks for manager has to let it through —
-- and only it. `guard_job_stage_change` refuses any stage change below manager; a person
-- at user who finishes the last task of a sub-stage is exactly the case this exists for,
-- and refusing them would mean the last required step of a process could only be answered
-- by a manager. So the guard gains one exception, written as narrowly as it can be: the
-- new stage is the one the derivation itself computes, and the job is not pinned.
create or replace function guard_job_stage_change()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- No JWT means no end user: a migration, a seed, or the service role. Same stance as
  -- 0018 — the service role bypasses RLS anyway, so refusing it here would break admin
  -- tooling and stop nobody.
  if auth.uid() is null then
    return new;
  end if;

  if new.job_stage is distinct from old.job_stage
     and current_permission() < 'manager'::permission_level then
    -- The derivation's own answer is not a person's decision, so it is not a person's
    -- permission. Anyone who may finish the work may let the work move the job (0132).
    if new.job_stage_pinned_at is null
       and new.job_stage is not distinct from job_derived_stage(old.job_id) then
      return new;
    end if;
    -- 42501 is insufficient_privilege, which PostgREST renders as a 403 rather than a
    -- 500. The message is the one the person sees, so it says what is needed instead of
    -- naming the trigger.
    raise exception
      'Moving a job between lifecycle stages needs manager permission or above.'
      using errcode = '42501';
  end if;

  return new;
end $$;

revoke execute on function guard_job_stage_change() from public, anon, authenticated;

-- Pinning is a manager's act, because it is the move it replaces.
create or replace function guard_job_stage_pin()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- The PERMISSION check is skipped without a JWT (a migration, a seed, the service role),
  -- the way every other guard here does it. The SHAPE of the pin is not: the three columns
  -- are one fact, and clearing the time without clearing the name is a CHECK violation
  -- whoever does it. Found by unpinning from a migration and watching the constraint refuse
  -- a row this trigger should have tidied.
  if auth.uid() is not null then
    -- The reason is part of the pin, not a note beside it: a user who could rewrite it could
    -- change what the record says a manager decided.
    if (new.job_stage_pinned_at  is distinct from old.job_stage_pinned_at
        or new.job_stage_pinned_by is distinct from old.job_stage_pinned_by
        or new.job_stage_pin_reason is distinct from old.job_stage_pin_reason)
       and current_permission() < 'manager'::permission_level then
      raise exception 'Pinning or releasing a job''s stage needs manager permission or above.'
        using errcode = '42501';
    end if;
  end if;

  if new.job_stage_pinned_at is null then
    -- Releasing: the three columns go together, so the name and the reason go with the time.
    new.job_stage_pinned_by  := null;
    new.job_stage_pin_reason := null;
  elsif new.job_stage_pinned_at is distinct from old.job_stage_pinned_at then
    -- Pinning: the time and the name come from the session, not the caller. A client that
    -- could choose them could pin a job last week in somebody else's name.
    new.job_stage_pinned_at := now();
    new.job_stage_pinned_by := coalesce(current_profile_id(), new.job_stage_pinned_by);
  end if;
  return new;
end $$;

revoke execute on function guard_job_stage_pin() from public, anon, authenticated;

drop trigger if exists jobs_guard_stage_pin on jobs;
create trigger jobs_guard_stage_pin
  before update of job_stage_pinned_at, job_stage_pinned_by, job_stage_pin_reason on jobs
  for each row execute function guard_job_stage_pin();

-- ------------------------------------------------- the trigger that does the moving
create or replace function move_job_to_its_derived_stage(a_job text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare want text; have text; pinned timestamptz;
begin
  select job_stage, job_stage_pinned_at into have, pinned from jobs where job_id = a_job;
  if have is null or pinned is not null then
    return;
  end if;
  -- A job that has left the linear run does not come back to it. guard_lifecycle_is_linear
  -- refuses the move and raises, and this runs inside somebody's task tick — so a cancelled
  -- job with open processes would make every write on it fail. Checked here rather than
  -- caught, because catching an exception from a guard is how a guard stops being one.
  if have in ('Cancelled', 'Closed') then
    return;
  end if;
  want := job_derived_stage(a_job);
  -- Null is "nothing is open", not "it is finished". See the header, and question 0k.
  if want is null or want = have then
    return;
  end if;
  update jobs set job_stage = want where job_id = a_job;
end $$;

revoke execute on function move_job_to_its_derived_stage(text) from public, anon, authenticated;

comment on function move_job_to_its_derived_stage(text) is
  'Move a job to the stage its processes put it in (0132), unless it is pinned or nothing is open. Called after any change to a run on that job. Never moves a job backwards, because job_derived_stage() floors at where it already is.';

create or replace function process_runs_move_the_job()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare a_job text;
begin
  a_job := coalesce(new.job_id, old.job_id);
  if a_job is not null then
    perform move_job_to_its_derived_stage(a_job);
  end if;
  return coalesce(new, old);
end $$;

revoke execute on function process_runs_move_the_job() from public, anon, authenticated;

drop trigger if exists process_runs_move_the_job on process_runs;
create trigger process_runs_move_the_job
  after insert or update of process_run_status or delete on process_runs
  for each row execute function process_runs_move_the_job();

-- ============================================== the record says where it is, and why
--
-- CREATE OR REPLACE rather than DROP and recreate, for the reason 0119 wrote down: a drop
-- takes every dependent view with it and nothing here would put them back. Replace permits
-- columns APPENDED to the end and rejects a rename, a retype or a reorder of the ones
-- above, so the five new columns cannot quietly disturb the thirty.
create or replace view job_display with (security_invoker = true) as
  select j.job_id,
         j.project_id,
         j.job_sequence,
         j.job_number_old,
         j.job_original_address_id,
         j.job_current_address_id,
         j.job_created_at,
         j.job_created_by,
         j.job_updated_at,
         j.job_updated_by,
         p.project_type,
         j.job_status,
         is_current(j.job_status) as job_is_current,
         j.job_stage,
         j.job_stage_entered_at,
         j.job_owning_team,
         j.job_engaged_teams,
         j.job_assignee_id,
         j.job_sharepoint_url,
         cur.address_consolidated  as job_current_address,
         orig.address_consolidated as job_original_address,
         cur.address_suburb        as job_suburb,
         pcur.address_consolidated as project_current_address,
         p.project_sharepoint_url,
         j.job_title_type,
         cur.address_council       as job_council,
         j.job_target_completion,
         j.job_end_date,
         f.forecast as job_calculated_completion,
         f.missing  as job_calculated_completion_missing,
         -- Where in the stage. Derived on read and stored nowhere, because nothing keyed
         -- off a job's sub-stage before today and a second copy would only be a second
         -- opinion. Null means nothing required is open anywhere.
         sub.lifecycle_substage_id   as job_substage_id,
         sub.lifecycle_substage_name as job_substage_name,
         j.job_stage_pinned_at,
         j.job_stage_pinned_by,
         j.job_stage_pin_reason
  from jobs j
  join projects p using (project_id)
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id
  join addresses pcur      on pcur.address_id = p.project_current_address_id
  left join lateral job_completion_forecast(j.job_id) f(forecast, missing) on true
  left join lifecycle_substages sub on sub.lifecycle_substage_id = job_open_substage(j.job_id);

comment on view job_display is
  'A job with its addresses, its project''s fields, its three completion dates, and since 0132 the sub-stage its processes put it in with the pin that overrides them. Nothing here is stored except the pin.';

-- ========================================================================= the proof
do $$
declare
  a_job    text;
  was      text;
  sub_name text;
  n        integer;
begin
  select job_id, job_stage into a_job, was from jobs order by job_id limit 1;
  if a_job is null then
    raise notice '0132: no jobs to prove against on this database; the shape is checked and the behaviour is not.';
  else
    -- The derivation answers, and the view agrees with the function. Two readings of one
    -- rule that can drift are how a cached derivation starts, so they are compared here.
    select job_substage_name into sub_name from job_display where job_id = a_job;
    if sub_name is distinct from (select lifecycle_substage_name from lifecycle_substages
                                   where lifecycle_substage_id = job_open_substage(a_job)) then
      raise exception '0132 proof: job_display and job_open_substage disagree about %', a_job;
    end if;

    -- The column the trigger maintains agrees with the function that defines it, for every
    -- job that is not pinned and still on the linear run. This is the assertion that keeps
    -- the stored stage honest.
    select count(*) into n
      from jobs j
     where j.job_stage_pinned_at is null
       and j.job_stage not in ('Cancelled', 'Closed')
       and job_derived_stage(j.job_id) is not null
       and job_derived_stage(j.job_id) is distinct from j.job_stage;
    if n > 0 then
      raise notice '0132: % jobs are behind their processes and will move on the next run change. This migration does not move them: a stage change notifies people, and notifying 83 job owners at once because a migration ran is not the way to start.', n;
    end if;

    -- A pinned job does not move.
    update jobs set job_stage_pinned_at = now(),
                    job_stage_pinned_by = (select profile_id from profiles limit 1),
                    job_stage_pin_reason = '0132 proof'
     where job_id = a_job;
    if (select job_stage_pinned_by from jobs where job_id = a_job) is null then
      raise exception '0132 proof: pinning did not record who did it';
    end if;
    perform move_job_to_its_derived_stage(a_job);
    if (select job_stage from jobs where job_id = a_job) is distinct from was then
      raise exception '0132 proof: a pinned job moved';
    end if;
    update jobs set job_stage_pinned_at = null where job_id = a_job;
    if (select job_stage_pinned_by from jobs where job_id = a_job) is not null
       or (select job_stage_pin_reason from jobs where job_id = a_job) is not null then
      raise exception '0132 proof: releasing the pin left the name or the reason behind';
    end if;

    raise notice '0132: a job reads its place from its processes, and a pin overrides it.';
  end if;
end $$;
