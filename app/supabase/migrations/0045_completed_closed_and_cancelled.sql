-- =============================================================================
-- 0045 — the lifecycle grows Completed, Closed and Cancelled
-- =============================================================================
-- Amber, 25 August:
--
--   "on lifecycle stages there will need to be a sixth stage and seventh which is
--    closed and cancelled. A job and project can be completed and after 12 months in
--    completed (or cancelled) it moves to closed (not visible by default but visible
--    by filter). similarly a job can be cancelled but it isn't complete.
--
--    Cancelled is the only exception to the never move back in pipeline stages as a
--    job may be cancelled and then for some reason revived. So this will need to move
--    backwards at that point. Once a job is cancelled data doesn't change or delete
--    however any notifications or automations or health status alerts don't fire."
--
-- THIS REVERSES A RECORDED DECISION, ON PURPOSE
--
--    0035 wrote: "A job that stops for a bad reason is cancelled, which is a status:
--    position says where it got to, status says how it is going, and collapsing them
--    would make 'cancelled during construction' unrepresentable."
--
--    Amber's rule makes Cancelled a position after all — because it needs position
--    *behaviour*: a 12-month clock that moves it to the archive, an exemption from
--    every alert, and a revival path back onto the board. A status cannot carry a
--    clock or an exception to the direction rule; a position can. What 0035 protected
--    is not lost: "cancelled during Construction" stays representable, because
--    `job_stage_entered_at` keeps when it was cancelled and the audit trail keeps
--    where it was cancelled *from*. The reversal is logged in schema-plan.md with
--    this reasoning, per the house rule that a decision without its reasoning gets
--    simplified back into a bug.
--
-- THE SEVEN POSITIONS
--
--    1  Acquisition & Development   open
--    2  Pre-construction            open
--    3  Construction                open
--    4  Handover & Maintenance      open
--    5  Completed                   won        <- what 0035 called "Closed"
--    6  Closed                      archived   <- the archive: reached 12 months after
--                                                Completed or Cancelled; hidden by
--                                                default, visible by filter
--    7  Cancelled                   lost       <- stopped without completing; the one
--                                                stage a record may leave backwards
--
--    "Closed" is RENAMED to "Completed" rather than kept: 0035's Closed meant "done,
--    won", which is exactly Amber's Completed. The new Closed means something 0035
--    had no word for — archived, off the board, still filterable.
--
-- THE DIRECTION RULE, REVISED
--
--    Forwards-only survives for positions 1→6. Two carve-outs, both Amber's:
--      - anything live may move TO Cancelled (cancelling is not a forward step, it is
--        a sideways exit — position 7 so it sorts after everything, but entry is
--        allowed from any live stage);
--      - anything may move OUT of Cancelled (revival backwards onto the board, or
--        onwards to Closed when the 12-month clock runs out).
--    Closed stays terminal for people: the archive is left through the service role
--    or not at all.
--
-- CANCELLED RECORDS ARE EXEMPT FROM SIGNALS
--
--    "any notifications or automations or health status alerts don't fire." Nothing
--    fires today — notifications are unbuilt — so this is recorded here and in the
--    column comments as the standing rule every future alert must honour, rather
--    than as code with no consumer. The one automation that DOES touch cancelled
--    records is the archive clock itself, which Amber's sentence defines.
--
-- WHY NOW: zero jobs, zero projects. Same reasoning as 0035 — the stage vocabulary
-- is a spine decision and this is the last moment it costs nothing.
-- =============================================================================

-- ------------------------------------------------- rename Closed to Completed
-- The CHECKs go first: they still name the old five and would refuse 'Completed'.
alter table jobs     drop constraint if exists jobs_stage_is_a_lifecycle_stage;
alter table projects drop constraint if exists projects_stage_is_a_lifecycle_stage;

-- Zero rows today, written anyway: a migration has to produce the same database
-- whenever it runs. auth.uid() is null here, so the direction guards stand aside.
update jobs     set job_stage     = 'Completed' where job_stage     = 'Closed';
update projects set project_stage = 'Completed' where project_stage = 'Closed';

alter table jobs add constraint jobs_stage_is_a_lifecycle_stage
  check (job_stage in ('Acquisition & Development', 'Pre-construction', 'Construction',
                       'Handover & Maintenance', 'Completed', 'Closed', 'Cancelled'));

alter table projects add constraint projects_stage_is_a_lifecycle_stage
  check (project_stage in ('Acquisition & Development', 'Pre-construction', 'Construction',
                           'Handover & Maintenance', 'Completed', 'Closed', 'Cancelled'));

comment on column jobs.job_stage is
  'Where the job sits in the lifecycle everybody shares: four working phases, then Completed (done), Closed (the archive — reached 12 months after Completed or Cancelled, hidden by default and visible by filter) and Cancelled (stopped without completing). Forwards-only, with Cancelled the one exception: a cancelled job may be revived backwards onto the board. Cancelled records keep their data but fire no notifications, automations or health alerts. Text with a check rather than an enum — 0035''s reasoning, proved right by this very change.';

comment on column projects.project_stage is
  'Where the project sits in the lifecycle — same seven positions and the same rules as jobs.job_stage. Follows its slowest non-cancelled job upwards (0041), archives on its own 12-month clock, and fires nothing while Cancelled.';

-- ------------------------------------------------------------------ the order
create or replace function lifecycle_position(stage text)
returns integer
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case stage
    when 'Acquisition & Development' then 1
    when 'Pre-construction'          then 2
    when 'Construction'              then 3
    when 'Handover & Maintenance'    then 4
    when 'Completed'                 then 5
    when 'Closed'                    then 6
    when 'Cancelled'                 then 7
  end
$$;

comment on function lifecycle_position(text) is
  'Where a lifecycle stage sits in the seven-position order. The single source of that order. Cancelled is 7 so it sorts after everything, but it is not "furthest along" — it sits outside the forwards-only run, which is why the direction guard and project_stage_from_jobs() both treat it specially rather than by position.';

-- --------------------------------------------------------- the direction rule
create or replace function guard_lifecycle_is_linear()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_stage text;
  new_stage text;
  label     text;
begin
  if tg_table_name = 'projects' then
    old_stage := old.project_stage; new_stage := new.project_stage; label := 'project';
  else
    old_stage := old.job_stage;     new_stage := new.job_stage;     label := 'job';
  end if;

  if new_stage is not distinct from old_stage then
    return new;
  end if;

  -- No JWT is a migration, the import, the archive clock or the service role. None of
  -- them is held to a rule written for people clicking in the app.
  if auth.uid() is null then
    return new;
  end if;

  -- The archive is terminal for people. Nothing in Amber's rules leaves Closed, and a
  -- silent path out of the archive is how a hidden record reappears unexplained.
  if old_stage = 'Closed' then
    raise exception
      'A % in Closed is archived — nothing moves out of the archive.', label
      using errcode = '23514';
  end if;

  -- Revival, the one backward exception: "a job may be cancelled and then for some
  -- reason revived. So this will need to move backwards at that point." Also covers
  -- Cancelled -> Closed when a person archives early rather than waiting the year.
  if old_stage = 'Cancelled' then
    return new;
  end if;

  -- Cancelling. Not a forward step and not held to one: any live stage may stop badly.
  if new_stage = 'Cancelled' then
    return new;
  end if;

  if lifecycle_position(new_stage) < lifecycle_position(old_stage) then
    raise exception
      'A % cannot go back to %. The lifecycle only moves forwards, and this one is at %. (Cancelled is the one stage a record may leave backwards.)',
      label, new_stage, old_stage
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function guard_lifecycle_is_linear() from public;
revoke execute on function guard_lifecycle_is_linear() from anon;
revoke execute on function guard_lifecycle_is_linear() from authenticated;

-- The triggers from 0039 already point at this function; replacing the body is enough.

-- ------------------------------------------------- the lifecycle pipeline rows
-- 'archived' joins the stage-type vocabulary: Closed is neither won nor lost — it is
-- where both end up a year later.
alter table pipeline_stages drop constraint if exists pipeline_stages_pipeline_stage_type_check;
alter table pipeline_stages add constraint pipeline_stages_pipeline_stage_type_check
  check (pipeline_stage_type in ('open', 'won', 'lost', 'archived'));

-- Replaced rather than edited, exactly as 0035 did, with the same guards: deleting a
-- stage a job is parked in or an event points at should fail loudly, not cascade.
do $$
declare
  lifecycle uuid;
  parked    integer;
  eventful  integer;
begin
  select pipeline_id into lifecycle from pipelines where pipeline_key = 'build_lifecycle';
  if lifecycle is null then
    raise exception 'no build_lifecycle pipeline to extend';
  end if;

  select count(*) into parked from job_pipeline_positions where pipeline_id = lifecycle;
  if parked > 0 then
    raise exception
      '% job(s) are parked in a lifecycle stage. Re-point them before changing the vocabulary.', parked;
  end if;

  select count(*) into eventful
  from job_stage_events e
  where exists (select 1 from pipeline_stages ps
                where ps.pipeline_id = lifecycle
                  and ps.pipeline_stage_id in (e.job_stage_event_from_stage_id,
                                               e.job_stage_event_to_stage_id));
  if eventful > 0 then
    raise exception
      '% stage event(s) reference a lifecycle stage. History must not be orphaned by a vocabulary change.', eventful;
  end if;

  delete from pipeline_stages where pipeline_id = lifecycle;

  insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                               pipeline_stage_type, pipeline_stage_owning_team)
  select lifecycle, s.name, s.position, s.stage_type, null
  from (values
    ('Acquisition & Development', 1::smallint, 'open'),
    ('Pre-construction',          2,           'open'),
    ('Construction',              3,           'open'),
    ('Handover & Maintenance',    4,           'open'),
    -- What 0035 called Closed. Done, won, still on the board.
    ('Completed',                 5,           'won'),
    -- The archive. Entered 12 months after Completed or Cancelled, by the clock below.
    -- Hidden by default in the app; the Closed saved view is the filter that shows it.
    ('Closed',                    6,           'archived'),
    -- Stopped without completing. Enterable from any live stage, leavable backwards
    -- (revival) — the one exception to forwards-only. Fires no alerts while here.
    ('Cancelled',                 7,           'lost')
  ) as s(name, position, stage_type);
end $$;

-- --------------------------------------- a project follows its live jobs only
-- A cancelled job is out of the race: position 7 would otherwise read as "furthest
-- along" and drag the minimum upward — a project whose jobs all cancelled would march
-- itself to Cancelled. Excluded instead: a project with only cancelled jobs inherits
-- nothing, and a person decides what becomes of it.
create or replace function project_stage_from_jobs(p_project_id integer)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select j.job_stage
  from jobs j
  where j.project_id = p_project_id
    and j.job_stage <> 'Cancelled'
  order by lifecycle_position(j.job_stage)
  limit 1
$$;

comment on function project_stage_from_jobs(integer) is
  'The lowest phase any of the project''s LIVE jobs is at — cancelled jobs are out of the race, neither holding a project back nor dragging it to Cancelled. The trigger in 0041 moves the project up to this when it is ahead, and leaves it alone when it is not. Null when every job is cancelled or there are none: nothing to inherit, a person decides.';

-- ------------------------------------------------------- the 12-month clock
-- "after 12 months in completed (or cancelled) it moves to closed."
--
-- A function first, so the rule exists and is testable whether or not pg_cron does —
-- the local replay database has no cron, and a migration that fails there is a broken
-- replay forever (0007 already taught that lesson). Runs as definer with no JWT, so
-- the guards stand aside — which is correct: the clock is Amber's rule, not a person.
create or replace function lifecycle_archive()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update jobs
     set job_stage = 'Closed'
   where job_stage in ('Completed', 'Cancelled')
     and job_stage_entered_at < now() - interval '12 months';

  update projects
     set project_stage = 'Closed'
   where project_stage in ('Completed', 'Cancelled')
     and project_stage_entered_at < now() - interval '12 months';
end;
$$;

revoke execute on function lifecycle_archive() from public;
revoke execute on function lifecycle_archive() from anon;
revoke execute on function lifecycle_archive() from authenticated;

comment on function lifecycle_archive() is
  'Moves anything 12 months into Completed or Cancelled on to Closed, the archive. Scheduled daily by pg_cron where the extension exists (job name: lifecycle_archive). The touch triggers stamp the arrival, so "when was this archived" is job_stage_entered_at. This is the first real automation, and the one automation that touches cancelled records — everything else is barred from them by Amber''s rule.';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- schedule() with a job name upserts on pg_cron >= 1.4 (the project runs 1.6),
    -- so replaying this migration moves the schedule rather than stacking a second.
    perform cron.schedule('lifecycle_archive', '17 3 * * *', 'select lifecycle_archive()');
  end if;
end $$;

-- ---------------------------------------------------------------------- proof
do $$
declare
  names     text;
  jobs_def  text;
  proj_def  text;
  guard_def text;
  n         text;
  prev      integer := 0;
  pos       integer;
begin
  -- The pipeline holds the seven, in order, typed as stated.
  select string_agg(pipeline_stage_name || '/' || pipeline_stage_type,
                    ' > ' order by pipeline_stage_position)
    into names
  from pipeline_stages ps join pipelines p using (pipeline_id)
  where p.pipeline_key = 'build_lifecycle';

  if names is distinct from
     'Acquisition & Development/open > Pre-construction/open > Construction/open > '
     || 'Handover & Maintenance/open > Completed/won > Closed/archived > Cancelled/lost'
  then
    raise exception 'lifecycle is wrong: %', coalesce(names, '(none)');
  end if;

  -- lifecycle_position() agrees with the pipeline, strictly increasing, no gaps.
  foreach n in array array['Acquisition & Development', 'Pre-construction', 'Construction',
                           'Handover & Maintenance', 'Completed', 'Closed', 'Cancelled'] loop
    pos := lifecycle_position(n);
    if pos is null or pos <> prev + 1 then
      raise exception 'lifecycle_position(%) = %, expected %', n, pos, prev + 1;
    end if;
    prev := pos;
  end loop;

  -- Both CHECKs admit all seven — as installed, not as typed above.
  select pg_get_constraintdef(oid) into strict jobs_def
  from pg_constraint
  where conrelid = 'jobs'::regclass and conname = 'jobs_stage_is_a_lifecycle_stage';

  select pg_get_constraintdef(oid) into strict proj_def
  from pg_constraint
  where conrelid = 'projects'::regclass and conname = 'projects_stage_is_a_lifecycle_stage';

  foreach n in array array['Acquisition & Development', 'Pre-construction', 'Construction',
                           'Handover & Maintenance', 'Completed', 'Closed', 'Cancelled'] loop
    if jobs_def not like '%''' || n || '''::text%' then
      raise exception 'the jobs stage check does not admit %', n;
    end if;
    if proj_def not like '%''' || n || '''::text%' then
      raise exception 'the projects stage check does not admit %', n;
    end if;
  end loop;

  -- The guard carries both carve-outs. Proving it BITES needs rows and a JWT, which is
  -- behaviour.sql's job — what belongs here is that the installed function is this one.
  select pg_get_functiondef(oid) into strict guard_def
  from pg_proc where proname = 'guard_lifecycle_is_linear';

  if guard_def not like '%Cancelled%' or guard_def not like '%archived — nothing moves out%' then
    raise exception 'guard_lifecycle_is_linear does not carry the 0045 carve-outs';
  end if;

  -- No cancelled job can set a project''s inherited stage.
  select pg_get_functiondef(oid) into strict guard_def
  from pg_proc where proname = 'project_stage_from_jobs';
  if guard_def not like '%<> ''Cancelled''%' then
    raise exception 'project_stage_from_jobs still counts cancelled jobs';
  end if;

  raise notice 'ok  %', names;
end $$;
