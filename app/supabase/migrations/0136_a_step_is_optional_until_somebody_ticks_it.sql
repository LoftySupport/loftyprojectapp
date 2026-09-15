-- =============================================================================
-- 0136 — a step is optional until somebody ticks it, and a run waits for all of them
--
-- Open question 0j, answered by Amber on 15 September: **tasks are optional unless ticked
-- required**. Chosen over *every task is required* (what `0128` built) and over *required only
-- where the schedule has a claim*. So the reading `0128`'s header set out is reversed here
-- rather than argued with:
--
--   *"a task in the list is work that has to be done. So task steps arrive required"*
--
-- That was a reading of her step 9, not a copy of anything: `process_tasks` never had a
-- required flag, so the backfill had to choose a value and chose the strict one. She has now
-- said which she wants, and this is one UPDATE while no run of a task process exists.
--
-- WHAT CHANGES
--
--   **The default becomes false**, for every kind. A step somebody adds in Setup → Processes
--   arrives optional and the tick box beside it is how a step becomes required. `0128` set the
--   column default to true, which is what made adding a property to a live process block every
--   run of it until somebody filled the value in — fixed at the call site then, and fixed in
--   the column now.
--
--   **The 107 task steps and any checklist line become optional.** Property steps are NOT
--   touched: their flags are real data, carried across from `process_properties`, where 6 of
--   140 rows were marked required by somebody at Lofty. Overwriting those would be this
--   migration inventing a value in exactly the place the answer says not to.
--
--   **A run now closes itself when every step is answered, not when every REQUIRED step is.**
--   This is the half of her answer that does not fit on its own, and it is the reason this
--   migration is more than an UPDATE. `0130` reads *"when all process steps are completed mark
--   this process complete"* as *no required step is open*, and refuses to close a run that has
--   no required step at all. With tasks optional, Footings has no required step, so the
--   sentence that asked for the rule would have switched the rule off for the seven processes
--   it was written about. Read literally — **all** process steps — it keeps working, and the
--   two halves then say different things on purpose:
--
--     the gate (0129)      refuses a MANUAL complete only while a REQUIRED step is open
--     the forward rule     completes the run by itself only when NO step is open
--
--   So a person may close a process early over optional work, which is what *optional* means,
--   and the system never closes one over work nobody has answered. `0078`'s *"complete with a
--   gap is sometimes the truth"* is the person's call to make, and it is recorded as theirs.
--
--   **A run whose steps are all automations still does not close itself.** `0129`'s state view
--   returns `not_tracked` for an automation step, which is neither open nor done, so counting
--   "no step is open" alone would complete such a run the instant it started. The rule counts
--   steps that HAVE a state, and a run with none of those is left to a person, exactly as
--   `0130` left a run with no required step.
--
-- WHAT THIS DOES NOT DO
--
--   **It does not touch the tick box.** Setup → Processes already draws *required to complete*
--   on property, task and checklist steps, so the control her answer needs is there; only the
--   value it starts at moves.
--
--   **It does not change what the drawer counts.** *"2 required missing"* still counts required
--   steps, and after this it will read 0 on most processes, which is the honest number.
-- =============================================================================

set local lock_timeout = '5s';

-- ============================================================== the default, and the backfill
alter table process_steps alter column process_step_is_required set default false;

update process_steps
   set process_step_is_required = false
 where process_step_kind in ('task', 'checklist')
   and process_step_is_required;

comment on column process_steps.process_step_is_required is
  'A run cannot be MARKED complete while a required step is open, and it does not complete itself while ANY step is open (0129, 0130, 0136). False by default: a step is optional until somebody ticks it in Setup → Processes (Amber, 15 September, question 0j). Property steps carry the flag process_properties held, which is real data and was not overwritten; task and checklist steps were set false here, because the value 0128 gave them was a reading of "when all process steps are completed" rather than a copy of anything.';

comment on table process_steps is
  'What a process is made of (0128): one ordered list of steps per process, each of one kind — a property to record, a task to do, a checklist line to tick, an automation to fire. Replaces the separate process_properties, process_tasks and process_task_checklist_items lists, which 0131 dropped. A run completes itself when every step that has a state is answered (0136); a person may mark it complete while only optional steps are open (0129''s gate).';

-- ============================================================== the forward rule, re-read
create or replace function close_run_if_its_steps_are_done(p_process_run_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  run       process_runs%rowtype;
  trackable integer;
  open_now  integer;
begin
  select * into run from process_runs where process_run_id = p_process_run_id;
  if run.process_run_id is null then return false; end if;
  -- Never reopen, and never close what is not running.
  if run.process_run_status not in ('in_progress', 'waiting') then return false; end if;

  -- Every step, not every required step (0136). `not_tracked` is an automation step, which has
  -- no state until Stage 4 gives it one: it is not counted as work outstanding, and a run made
  -- only of them has nothing this rule can read.
  select count(*) filter (where st.process_run_step_state <> 'not_tracked'),
         count(*) filter (where st.process_run_step_state = 'open')
    into trackable, open_now
    from process_run_step_state st
   where st.process_run_id = p_process_run_id;

  -- A run with no step that has a state does not complete itself: that would be a no-op with a
  -- timestamp rather than a run. It closes by hand, and 0129's gate lets it.
  if trackable = 0 or open_now > 0 then return false; end if;

  update process_runs
     set process_run_status = 'complete'
   where process_run_id = p_process_run_id;
  return true;
end $$;
revoke execute on function close_run_if_its_steps_are_done(uuid) from public, anon, authenticated;

comment on function close_run_if_its_steps_are_done(uuid) is
  'Amber''s step 9, read literally (0130, rewritten by 0136): when no step of a run is open, the run marks itself complete. Every step, not every required one — with tasks optional (question 0j, 15 September) a required-only rule would never fire on the seven Construction processes the sentence was written about. It never reopens a completed run, and it never closes a run whose only steps are automations, which have no state until Stage 4.';

-- ========================================================================= the proof
do $$
declare
  still_required integer;
  props_required integer;
  col_default    text;
  reads_required text;
begin
  select count(*) into still_required from process_steps
   where process_step_kind in ('task', 'checklist') and process_step_is_required;
  if still_required > 0 then
    raise exception '0136 proof: % task or checklist steps are still required', still_required;
  end if;

  -- The property flags are the thing this migration must NOT have touched. 6 of 140 rows were
  -- marked required on the live database on 15 September; a replay of an empty database has
  -- none, so the assertion is that some survive wherever any existed, not a fixed number.
  select count(*) into props_required from process_steps
   where process_step_kind = 'property' and process_step_is_required;
  raise notice '0136: % property steps are still required, which is whatever Lofty had marked.', props_required;

  select pg_get_expr(d.adbin, d.adrelid) into col_default
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'process_steps'::regclass and a.attname = 'process_step_is_required';
  if col_default is null or col_default !~ 'false' then
    raise exception '0136 proof: the column default is %, expected false', coalesce(col_default, 'nothing');
  end if;

  -- The forward rule must no longer ask whether a step is required. This is the assertion that
  -- would have caught the change being half-made: an UPDATE with the old function still there
  -- reads as a success and switches auto-completion off everywhere.
  select p.prosrc into reads_required
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'close_run_if_its_steps_are_done';
  if reads_required is null then
    raise exception '0136 proof: close_run_if_its_steps_are_done is not there';
  end if;
  if reads_required ~ 'process_step_is_required' then
    raise exception '0136 proof: the forward rule still reads process_step_is_required, so tasks going optional switches it off';
  end if;

  raise notice '0136: a step is optional until somebody ticks it, and a run waits for all of them.';
end $$;
