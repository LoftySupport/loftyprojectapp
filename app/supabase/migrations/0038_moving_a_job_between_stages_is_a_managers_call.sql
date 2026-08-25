-- =============================================================================
-- 0038 — moving a job between lifecycle stages is a manager's call
-- =============================================================================
-- Lofty, 25 August, on who may move a job and when to ask:
--
--   "any manager, admin or super admin can move stages with a popup modal asking for
--    confirmation if moving lifecycle stages. in a pipeline no modal popup is require."
--
-- Two rules, and only the first one is the database's business.
--
-- WHO — manager and above.
--
--   `users update jobs` admits `user` and above and covers every column, so today a
--   user can move a job through the lifecycle. That is the rule this migration
--   narrows, and it narrows it for the stage alone: a user still updates the jobs
--   they work on.
--
-- WHY A TRIGGER RATHER THAN A POLICY
--
--   RLS decides which ROWS you may write, not which COLUMNS. "A user may update a job
--   but may not change its stage" is a column rule, and the two ways to express one are
--   column privileges or a trigger.
--
--   Column privileges lose: `authenticated` holds a table-level UPDATE grant, and
--   Postgres cannot revoke a single column out of one. Getting there means revoking the
--   table grant and re-granting every other column by name — a list that silently goes
--   stale the next time somebody adds a column, and fails open, because a column nobody
--   remembered to re-grant is a column nobody can write.
--
--   The trigger states the rule once and keeps stating it as the table grows.
--
-- WHAT THIS DELIBERATELY DOES NOT COVER
--
--   Nested pipelines. `job_pipeline_positions` is where a team's own board lives, and
--   0035 is explicit that the two are different objects: the lifecycle is the five
--   phases everybody shares, and what a team does inside a phase is its own pipeline.
--   Lofty's rule follows that line exactly — the confirmation is for the shared thing,
--   and a team moving a card on its own board is not asking anyone. So this guard names
--   `jobs.job_stage` and nothing else.
--
--   The modal is not here either. A confirmation is a question asked of a person, which
--   makes it the app's job; this is the part that holds when somebody skips the app and
--   posts to PostgREST directly.
-- =============================================================================

create or replace function guard_job_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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
    -- 42501 is insufficient_privilege, which PostgREST renders as a 403 rather than a
    -- 500. The message is the one the person sees, so it says what is needed instead of
    -- naming the trigger.
    raise exception
      'Moving a job between lifecycle stages needs manager permission or above.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Same revokes as the audit function in 0013: a SECURITY DEFINER function that reads
-- permissions is not something an end user should be able to call directly.
revoke execute on function guard_job_stage_change() from public;
revoke execute on function guard_job_stage_change() from anon;
revoke execute on function guard_job_stage_change() from authenticated;

drop trigger if exists jobs_guard_stage_change on jobs;

-- `before update of job_stage` narrows this to statements that mention the column at
-- all; the `is distinct from` above is what narrows it to ones that actually change it.
-- Both, because an UPDATE that sets the stage to its current value is not a move and
-- should not need permission to make.
create trigger jobs_guard_stage_change
  before update of job_stage on jobs
  for each row
  execute function guard_job_stage_change();

comment on function guard_job_stage_change() is
  'Refuses a change to jobs.job_stage below manager. RLS cannot express a column rule, and a column-privilege version goes stale whenever a column is added. Nested pipeline moves are deliberately not covered — see 0035 for why the lifecycle and a team pipeline are different objects.';
