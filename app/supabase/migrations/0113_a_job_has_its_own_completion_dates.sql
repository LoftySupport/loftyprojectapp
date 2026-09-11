-- 0113 — a job has its own completion dates
--
-- The sixth key property on the job record, and the only schema change the design
-- handoff needs. Amber, 11 September, over two turns:
--
--   *"each job has its own completion date. and completion date is at a job level…
--   there is also a project completion level which is when all jobs in the project are
--   completed"*, then *"you can change handover date to completion date"*,
--
-- and, asked which of the two dates it is:
--
--   *"project date and job dates are separate and [it] depends [on] each other.
--   [Both] are needed and relevant"*.
--
-- So a job gets the pair `projects` has carried since `0028`, and the two pairs are
-- separate columns on separate tables that relate rather than one deriving the other.
--
-- WHY BOTH, AND NOT THE OBVIOUS ONE
--
--   `job_target_completion` is the date being worked towards. It is set in advance — the
--   handoff draws an empty `dd/mm/yyyy` box on a job still in Pre-construction — and it
--   is what an overdue calculation needs something to compare against. Without it a job
--   cannot be late, only finished or not.
--
--   `job_end_date` is when the job actually finished. It is what 6b reads under
--   *Complete*: *"Job completed (or Target completion)"* — the actual once there is one,
--   the target until then.
--
--   Collapsing them into one column loses the distinction the moment a job finishes on a
--   different day from the one planned, which is most jobs. `projects` learned this in
--   `0028` and the comment there still says it: *"actual, as opposed to target"*.
--
-- THE SEEDING VARIANT WAS OFFERED AND NOT TAKEN
--
--   The alternative on the table was pre-filling a new job's target from
--   `project_target_completion`. Amber took the plain version, so a job with no target
--   says so rather than inheriting a date nobody set for it — which is the house rule
--   about plausible values, applied to a date.
--
-- WHAT THIS IS NOT
--
--   It is NOT a rename of anything. "Handover date" was a label in a mockup for a field
--   that existed on neither table; there is nothing to migrate, no data to move, and no
--   column anywhere called handover. `job_stage_entered_at` stays exactly what it is.
--
--   A PROJECT'S completion is still DERIVED — *"when all jobs in the project are
--   completed"* — and this migration deliberately adds no trigger to write it. Deriving
--   it on read cannot go stale; a trigger that writes it can, and the day it disagrees
--   with the jobs is the day nobody can tell which is right.

alter table jobs
  add column job_target_completion date,
  add column job_end_date          date;   -- actual, as opposed to target

comment on column jobs.job_target_completion is
  'The date this job is being worked towards. Set in advance and changeable; the job record shows it as "Completion date" until the job is finished. Mirrors projects.project_target_completion — the two are separate columns that relate, not one deriving the other (Amber, 11 September).';
comment on column jobs.job_end_date is
  'When the job actually finished, as opposed to the target. Null until it has. A project''s completion stays DERIVED from all of its jobs being completed and is deliberately not written anywhere.';

-- The date worked towards cannot fall before the job began, and the day it finished
-- cannot either. `job_stage_entered_at` is when the CURRENT stay began rather than when
-- the job started, so it is the wrong thing to compare against — the honest available
-- floor is the job's creation, which is what this uses.
alter table jobs
  add constraint jobs_end_date_is_not_before_the_job
    check (job_end_date is null or job_end_date >= (job_created_at at time zone 'UTC')::date);

-- ------------------------------------------------------------------ the read
-- `job_display` is what the board and the drawer read, so the two columns have to reach
-- it or the record cannot show them. Appended LAST, because `create or replace view`
-- refuses a reordering of existing columns and that refusal is the guardrail: it is why
-- 0108 added `job_council` at the end and said so.
--
-- `with (security_invoker = true)` is not decoration. 0069 records what happens without
-- it: the view executes as its owner and hands every reader rows the policies on `jobs`
-- would refuse, including an account held at the demo gate.
create or replace view job_display with (security_invoker = true) as
 SELECT j.job_id,
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
    is_current(j.job_status) AS job_is_current,
    j.job_stage,
    j.job_stage_entered_at,
    j.job_owning_team,
    j.job_engaged_teams,
    j.job_assignee_id,
    j.job_sharepoint_url,
    cur.address_consolidated AS job_current_address,
    orig.address_consolidated AS job_original_address,
    cur.address_suburb AS job_suburb,
    pcur.address_consolidated AS project_current_address,
    p.project_sharepoint_url,
    j.job_title_type,
    cur.address_council AS job_council,
    -- New, and last, for the reason above.
    j.job_target_completion,
    j.job_end_date
   FROM jobs j
     JOIN projects p USING (project_id)
     JOIN addresses cur ON cur.address_id = j.job_current_address_id
     LEFT JOIN addresses orig ON orig.address_id = j.job_original_address_id
     JOIN addresses pcur ON pcur.address_id = p.project_current_address_id;

comment on view job_display is
  'The job board''s read. security_invoker = true, restored in 0069 after 0055''s '
  'create-or-replace dropped it: without it the view executes as its owner and hands '
  'every reader rows the policies on jobs would refuse, including an account held at '
  'the demo gate. Asserted in verify/behaviour.sql for every view, not just this one. '
  'Carries job_council since 0108 and the job''s own two completion dates since 0113 — '
  'the target being worked towards and the day it actually finished.';

-- ---------------------------------------------------------------------- proof
-- Each rule watched biting. The accepted rows are put back as they were, so the
-- migration leaves every job exactly as it found it.
--
-- THE COLUMN PROBE HERE IS GUARDED, AND THAT IS WHY IT IS NOT THE EVIDENCE.
--   A replay from empty has no jobs, so `if a_job is null` skips it and prints a notice.
--   Broken deliberately, this block therefore reported ALL MIGRATIONS APPLIED CLEANLY —
--   a probe that quietly tests nothing, which is the failure `verify/` exists to prevent.
--   The real proof of the CHECK lives in `verify/constraints.sql`, which runs after
--   behaviour.sql has made job 9106-002, and was watched reporting
--   `A CONSTRAINT DID NOT BITE` with the constraint removed. This block is kept because
--   it DOES bite on production, where there are 79 jobs, and it is the last thing to run
--   before the columns are live there.
--
--   The two view assertions below are not guarded and were both watched failing:
--   dropping `job_target_completion` from the select raised, and removing
--   `security_invoker` raised — the 0069 hole, reproduced and caught.
do $$
declare
  a_job   text;
  made_on date;
  opts    text[];
begin
  select job_id, (job_created_at at time zone 'UTC')::date
    into a_job, made_on
    from jobs limit 1;

  if a_job is null then
    raise notice 'no jobs yet — the column probes are skipped, the view probe is not';
  else
    -- A finish date before the job existed is refused.
    begin
      update jobs set job_end_date = made_on - 1 where job_id = a_job;
      raise exception 'a job finished before it was created';
    exception
      when check_violation then null;
    end;

    -- The same date the job was made is fine: a one-day job is a real thing.
    update jobs set job_end_date = made_on where job_id = a_job;
    -- And so is a target in the future, which is the ordinary case.
    update jobs set job_target_completion = made_on + 400 where job_id = a_job;
    -- Put it back. Both columns were null a moment ago and must be null again.
    update jobs set job_end_date = null, job_target_completion = null where job_id = a_job;
  end if;

  -- The view carries both, and still executes as the invoker. Without the second half
  -- this migration would be the 0069 hole reopened, silently, on a create-or-replace —
  -- which is exactly how that hole was made the first time.
  perform 1 from information_schema.columns
   where table_name = 'job_display' and column_name = 'job_target_completion';
  if not found then raise exception 'job_display does not carry job_target_completion'; end if;

  perform 1 from information_schema.columns
   where table_name = 'job_display' and column_name = 'job_end_date';
  if not found then raise exception 'job_display does not carry job_end_date'; end if;

  select c.reloptions into opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'job_display';
  if opts is null or not (array_to_string(opts, ',') like '%security_invoker=%') then
    raise exception 'job_display lost security_invoker — see 0069';
  end if;
end $$;
