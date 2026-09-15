-- =============================================================================
-- 0137 — the August position model goes
--
-- Stage 5 of the 15 September audit. Audit finding 1: **three generations of "how a job moves"
-- coexist**, and this is the oldest of them. `0029` built a nested pipeline: a pipeline holding
-- stages, a job holding a position in one, and an event row per move. `0078`'s own header, six
-- weeks later, says what happened to it:
--
--   *"Removing the two tables is its own change once the lifecycle has another home."*
--
-- Stage 1 gave it that home. `0126` made `lifecycle_stages` the seven rows with their SLA
-- columns and repointed the four CHECKs at it; `0127` made the blocks inside a stage rows of
-- their own. Nothing has read the August tables since, and the app never wrote three of them.
--
-- WHAT GOES, AND WHAT EACH ONE HELD
--
--   `pipelines`                1 row, saying "build_lifecycle". Two lookups by key, both gone.
--   `pipeline_stages`          7 rows, superseded one for one by `lifecycle_stages`.
--   `job_pipeline_positions`   0 rows, ever. The per-team board that was never built.
--   `job_stage_events`         0 rows, ever. Stage history is read from `activity_audit`.
--
--   With them: `guard_pipeline_nesting` and `log_job_stage_event`, which have nothing left to
--   guard or log, and `touch_position_entered_at` if it is there.
--
-- WHY `pipeline_stages` GOES TOO, WHERE THE AUDIT SAID IT WOULD BE UPDATED
--
--   The catalogue's row for it reads *"Becomes `lifecycle_stages`, keeping its SLA columns"*,
--   written before Stage 1 chose to CREATE the new table and seed it rather than rename the
--   old one — which was the right call, because a rename cannot change a primary key from a
--   uuid to a slug. So the update happened, and what is left is the husk. Checked rather than
--   assumed, on the live database on 15 September: seven rows against seven, same names, same
--   positions, every SLA and lead column null on both sides, no owning team set on any row.
--   Nothing is lost, and the migration below re-checks it rather than trusting this paragraph.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   **`activity_events`, tags, releases and the rest of Stage 5.** One table group per change,
--   which is what `CLAUDE.md` asks for and what makes a drop reviewable.
--
--   **No data is kept anywhere.** `pipelines` and `pipeline_stages` hold eight rows between
--   them that say what `lifecycle_stages` already says, and the other two are empty. There is
--   nothing to export, which is the difference between this and `import_staging_jobs`.
-- =============================================================================

set lock_timeout = '5s';

-- ============================================== nothing is lost, checked rather than asserted
do $$
declare mismatched text;
begin
  if to_regclass('public.pipeline_stages') is null then
    raise notice '0137: pipeline_stages is already gone.';
  else
    -- Every pipeline stage has a lifecycle stage of the same name, position, expectation and
    -- lead. A FULL join, so a row on either side with no partner is a mismatch too.
    select string_agg(coalesce(ps.pipeline_stage_name, ls.lifecycle_stage_name), ', ')
      into mismatched
      from pipeline_stages ps
      full join lifecycle_stages ls on ls.lifecycle_stage_name = ps.pipeline_stage_name
     where ps.pipeline_stage_name is null
        or ls.lifecycle_stage_name is null
        or ps.pipeline_stage_position is distinct from ls.lifecycle_stage_position
        or ps.pipeline_stage_expected_days is distinct from ls.lifecycle_stage_expected_days
        or ps.pipeline_stage_at_risk_lead_days is distinct from ls.lifecycle_stage_at_risk_lead_days;
    if mismatched is not null then
      raise exception '0137: these stages do not match between pipeline_stages and lifecycle_stages, so dropping the old table would lose something: %', mismatched;
    end if;

    -- An owning team on a pipeline stage is a fact lifecycle_stages has no column for. None is
    -- set live; if one ever is, this stops rather than dropping it silently.
    select string_agg(ps.pipeline_stage_name, ', ') into mismatched
      from pipeline_stages ps where ps.pipeline_stage_owning_team is not null;
    if mismatched is not null then
      raise exception '0137: these pipeline stages carry an owning team, which lifecycle_stages has nowhere to put: %', mismatched;
    end if;
  end if;

  -- And the two tables that should never have had a row still have none. A row here would mean
  -- something started writing them after the audit read them, which is worth stopping for.
  if to_regclass('public.job_pipeline_positions') is not null then
    if (select count(*) from job_pipeline_positions) > 0 then
      raise exception '0137: job_pipeline_positions has % rows, where the audit found none. Something writes it.',
        (select count(*) from job_pipeline_positions);
    end if;
  end if;
  if to_regclass('public.job_stage_events') is not null then
    if (select count(*) from job_stage_events) > 0 then
      raise exception '0137: job_stage_events has % rows, where the audit found none. Something writes it.',
        (select count(*) from job_stage_events);
    end if;
  end if;
end $$;

-- ============================================== the audit exemption for a table that is going
--
-- REBUILT FROM WHAT IT CURRENTLY RETURNS, not written out as a literal. The list has gained
-- entries twice this month and `0135` adds another on a branch that may merge before or after
-- this one; a literal here would silently undo whichever landed first.
do $$
declare keep text[];
begin
  select array(select t from unnest(private.audit_exempt_tables()) t where t <> 'job_stage_events')
    into keep;
  execute format(
    'create or replace function private.audit_exempt_tables() returns text[] language sql immutable set search_path to ''pg_catalog'', ''pg_temp'' as $f$ select %L::text[] $f$',
    keep);
end $$;

comment on function private.audit_exempt_tables() is
  'Tables the row audit trigger does not write a row for: the logs themselves, and the tables whose history is the point. job_stage_events left the list in 0137 when the table went.';

-- ============================================================================= the tables go
drop table if exists job_stage_events;
drop table if exists job_pipeline_positions;
-- The last two go in ONE statement, because they point at each other: a pipeline names the
-- stage it elaborates and a stage names the pipeline it belongs to, which is how the nesting
-- worked. Dropped one at a time Postgres refuses, correctly, and `cascade` would be a way of
-- not reading the error — it is also how a drop takes something nobody meant it to.
drop table if exists pipeline_stages, pipelines;

drop function if exists guard_pipeline_nesting();
drop function if exists log_job_stage_event();
drop function if exists touch_position_entered_at();

-- ========================================================================= the proof
do $$
declare bad text;
begin
  -- A BACKSTOP RATHER THAN THE GUARANTEE, and worth saying which. The four point at each
  -- other, so leaving any one of them out of the drops makes POSTGRES refuse — watched, by
  -- commenting out the `job_stage_events` drop and getting "cannot drop desired object(s)
  -- because other objects depend on them". That is the better check and it is not this one.
  -- This one catches the case Postgres cannot: `drop table if exists` accepts a name that
  -- does not exist and says nothing, so a typo here would drop three tables and report success.
  select string_agg(table_name, ', ') into bad
    from information_schema.tables
   where table_schema = 'public'
     and table_name in ('pipelines', 'pipeline_stages', 'job_pipeline_positions', 'job_stage_events');
  if bad is not null then
    raise exception '0137 proof: these are still there: %', bad;
  end if;

  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.proname in ('guard_pipeline_nesting', 'log_job_stage_event', 'touch_position_entered_at');
  if bad is not null then
    raise exception '0137 proof: these functions are still there: %', bad;
  end if;

  if 'job_stage_events' = any (private.audit_exempt_tables()) then
    raise exception '0137 proof: the audit exemption still names job_stage_events';
  end if;

  -- Nothing left in the database names them. A view or a function that does would be broken
  -- rather than stale, and Postgres would have refused the drop for a view — but not for a
  -- function body, which is text.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and p.prosrc ~ '\mjob_pipeline_positions\M|\mjob_stage_events\M|\mpipeline_stages\M|\mpipelines\M';
  if bad is not null then
    raise exception '0137 proof: these functions still name a table that is gone: %', bad;
  end if;

  -- What replaced them is still whole. The seven stages are what every screen reads.
  if (select count(*) from lifecycle_stages) <> 7 then
    raise exception '0137 proof: lifecycle_stages has % rows, not the seven', (select count(*) from lifecycle_stages);
  end if;

  raise notice '0137: the August position model is gone. The lifecycle is lifecycle_stages and its sub-stages.';
end $$;
