-- =============================================================================
-- 0138 — a milestone process is never optional
--
-- Amber, 15 September: *"Some entire processes need to be marked as optional and they can be
-- skipped. A milestone process can never be optional."*
--
-- Both flags already exist and neither has ever said anything about the other.
-- `process_is_milestone` is `0078`'s, and its comment says what a milestone is FOR:
--
--   *"Whether passing this process is a milestone of the stage. A count of these is the only
--   progress figure this app reports — never a percentage."*
--
-- `process_is_optional` is `0127`'s, added for Stage 2's completion gate and read by Stage 3's
-- derivation, which looks only at non-optional processes when it asks what a job is up to.
--
-- WHY THE TWO CANNOT BOTH BE TRUE
--
--   A milestone is what the app counts: *"4 of 7 milestones passed"*, `0078`'s rule, and a
--   count is only honest if the denominator is fixed. An optional milestone makes 7 a number
--   that depends on which processes somebody skipped on this job, so two jobs in the same
--   stage report progress against different totals and neither figure means what it says.
--
--   Read the other way round it is the same rule: **skipping is what optional means**, and a
--   milestone is the thing a stage is measured by. A stage whose milestones can be skipped is
--   not measured.
--
-- A CHECK RATHER THAN A TRIGGER, AND THE SCREEN RATHER THAN THE ERROR
--
--   This is a two-column rule on one row, which is exactly what a CHECK is for: it cannot be
--   bypassed, it needs no function, and it holds for an import and a manual UPDATE as well as
--   for the screen. What a CHECK cannot do is explain itself, so Setup → Processes does the
--   explaining: the Optional box on a milestone process is disabled and says why, and so is the
--   Milestone box on an optional one. The database is the rule; the screen is the sentence.
--
-- WHAT THIS DOES NOT DO
--
--   **It does not decide what "skipped" means at run time.** A process marked optional is
--   already left out of Stage 3's sub-stage derivation, and a RUN can already be marked not
--   applicable (`0078`). Neither of those is changed here.
--
--   **It does not make any process optional.** Which ones are is Amber's to say, one at a time
--   in Setup, and inventing a list would be exactly the plausible value this repository keeps
--   warning about.
-- =============================================================================

set lock_timeout = '5s';

-- ============================================== nothing is already in the state being refused
do $$
declare offenders text;
begin
  select string_agg(process_key, ', ' order by process_key) into offenders
    from processes
   where process_is_optional and process_is_milestone;
  if offenders is not null then
    raise exception '0138: these processes are marked both optional and a milestone, and the rule cannot be added over them. Decide which each one is first: %', offenders;
  end if;
end $$;

alter table processes drop constraint if exists processes_a_milestone_is_never_optional;
alter table processes add constraint processes_a_milestone_is_never_optional
  check (not (process_is_optional and process_is_milestone));

comment on column processes.process_is_milestone is
  'Whether passing this process is a milestone of the stage. A count of these is the only progress figure this app reports — never a percentage. A milestone is never optional (0138): the count is only honest if the denominator is the same on every job in the stage.';
comment on column processes.process_is_optional is
  'A process that may be skipped on a job: Stage 3''s derivation does not hold a sub-stage open for one, and it never counts towards what the job is up to. Never true on a milestone (0138). Amber, 15 September: "Some entire processes need to be marked as optional and they can be skipped. A milestone process can never be optional."';

-- ========================================================================= the proof
do $$
declare a_process uuid;
begin
  if not exists (select 1 from pg_constraint where conname = 'processes_a_milestone_is_never_optional') then
    raise exception '0138 proof: the constraint is not there';
  end if;

  select process_id into a_process from processes order by process_key limit 1;
  if a_process is null then
    raise notice '0138 proof: no processes on this database, so the rule was not exercised here.';
    return;
  end if;

  -- BOTH DIRECTIONS, because there are two ways in and a CHECK that only ever gets tested one
  -- way is a CHECK somebody can walk around. The row is put back either way: a probe that
  -- leaves a real process reconfigured is a side effect, not a test.
  declare
    was_milestone boolean;
    was_optional  boolean;
  begin
    select process_is_milestone, process_is_optional into was_milestone, was_optional
      from processes where process_id = a_process;

    update processes set process_is_milestone = true, process_is_optional = false
     where process_id = a_process;
    begin
      update processes set process_is_optional = true where process_id = a_process;
      raise exception '0138 proof: a milestone process was made optional';
    exception when check_violation then null;
    end;

    update processes set process_is_milestone = false, process_is_optional = true
     where process_id = a_process;
    begin
      update processes set process_is_milestone = true where process_id = a_process;
      raise exception '0138 proof: an optional process was made a milestone';
    exception when check_violation then null;
    end;

    update processes set process_is_milestone = was_milestone, process_is_optional = was_optional
     where process_id = a_process;
    if (select process_is_milestone from processes where process_id = a_process) is distinct from was_milestone
       or (select process_is_optional from processes where process_id = a_process) is distinct from was_optional then
      raise exception '0138 proof: the flags were not put back as they were found';
    end if;
  end;

  raise notice '0138: a milestone process is never optional, refused both ways in.';
end $$;
