-- 0091 — who last changed a process
--
-- Amber, 3 September, on Setup → Processes: processes "need to show in processes when
-- they were last updated and by who and what happened".
--
-- WHEN was already there. `processes_touch` has run moddatetime on `process_updated_at`
-- since 0078, so every edit moves that timestamp.
--
-- WHO was not, and had never been on any table. Every table in this schema carries the
-- audit quartet — created_at, created_by, updated_at, updated_by — and 0023 wrote a
-- trigger for created_by, but nothing anywhere has ever written an `updated_by`. The
-- column existed, was nullable, and was null on every row of every table. Reading it
-- back and putting a name on screen would have printed a blank for a row three people
-- had edited that morning.
--
-- So this adds the missing half of the pair, and applies it to `processes` — the table
-- Amber asked about. The function takes the column name as an argument for exactly the
-- reason `stamp_created_by` does (0028: the columns are `process_updated_by`,
-- `job_updated_by`, `task_updated_by`…, so one trigger function cannot name a column),
-- which means any other table can adopt it with one line when its screen needs it.
--
-- WHY IT OVERWRITES, AND WHY IT WILL HAPPILY WRITE NULL
--
--   `stamp_created_by` fills only when the column is null: an author, once recorded, is
--   the answer forever. "Last updated by" is the opposite question — it is about the
--   most recent write, so it is set on every write, and a value already sitting in the
--   column is precisely what must not survive.
--
--   And when nobody is signed in — a migration, a seed, the service role, a script —
--   it writes NULL rather than falling back to support the way `stamp_created_by`
--   does. A machine write is not support editing a process, and naming a person who did
--   not do it is worse than admitting the row has no author: a blank invites the
--   question, an invented name closes it with the wrong answer.
--
--   The consequence, said plainly: a reorder on the Processes page renumbers every
--   process it moved past, and each of those rows gets a fresh `updated_by`. That is
--   true — they were changed, by that person, at that moment — and the audit rows say
--   which field moved, so "what happened" reads as "Number in the stage 5 → 7" rather
--   than as a mystery edit.

create or replace function stamp_updated_by() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_column text := tg_argv[0];
begin
  -- jsonb_populate_record ignores a key matching no column, so a typo in the trigger
  -- argument would leave updated_by null forever with no error anywhere. Same assertion,
  -- and the same reasoning, as stamp_created_by.
  if not (to_jsonb(new) ? target_column) then
    raise exception 'stamp_updated_by: % is not a column of %', target_column, tg_table_name;
  end if;

  new := jsonb_populate_record(new, jsonb_build_object(target_column, current_profile_id()));
  return new;
end $$;

comment on function stamp_updated_by() is
  'BEFORE UPDATE trigger: sets the named *_updated_by column to whoever is signed in, on every update, including to null when nobody is. The column name is tg_argv[0]. Companion to stamp_created_by, which fills once and never overwrites.';

-- The same posture 0024 took for every other trigger helper: nothing calls these over
-- the API, so nothing over the API may.
revoke execute on function stamp_updated_by() from public, anon, authenticated;

drop trigger if exists processes_stamp_updated_by on processes;
create trigger processes_stamp_updated_by before update on processes
  for each row execute function stamp_updated_by('process_updated_by');

-- ============================================================================ proof
--
-- Both halves were watched failing before they were trusted:
--
--   * with the trigger dropped, the stale-author probe below reported
--     FAIL: process_updated_by kept a stale author (…) through an update
--   * with `jsonb_build_object(target_column, current_profile_id())` changed to fill
--     only when null (the stamp_created_by rule), the same probe reported the same
--     failure — which is the point of testing the overwrite separately from the write.
--
-- The POSITIVE half — a signed-in manager's edit stamps that manager — cannot be proved
-- here: `current_profile_id()` resolves `auth.uid()`, and a migration has no JWT to
-- resolve. It is proved in `verify/rls.sql`, which signs a real test person in and edits
-- a real process as them. Asserting it here would have meant faking an auth identity
-- inside a migration that runs against production.
do $$
declare
  probe_id     uuid;
  stale_author uuid;
  after_author uuid;
  moved        boolean;
  stamped_at   timestamptz;
begin
  if not exists (select 1 from pg_trigger where tgname = 'processes_stamp_updated_by'
                   and tgrelid = 'processes'::regclass) then
    raise exception 'processes_stamp_updated_by is not on processes';
  end if;

  select profile_id into stale_author from profiles order by profile_created_at limit 1;
  if stale_author is null then
    raise notice 'skip  no profiles yet, so there is no stale author to plant';
    return;
  end if;

  -- Planted, not found: the row arrives already carrying an author, which is the state
  -- the trigger has to clear. Inserting it is the only way to get one, because the
  -- trigger clears it on any update.
  insert into processes (process_key, process_name, process_stage, process_scope,
                         process_position, process_updated_by)
  values ('probe_0091_stamp', 'Probe: who last changed a process', 'Construction', 'job',
          9999, stale_author)
  returning process_id into probe_id;

  update processes set process_name = 'Probe: renamed with nobody signed in'
   where process_id = probe_id;

  select process_updated_by, process_updated_at into after_author, stamped_at
    from processes where process_id = probe_id;

  if after_author is not null then
    raise exception 'process_updated_by kept a stale author (%) through an update', after_author;
  end if;
  raise notice 'ok  an update with nobody signed in clears the author rather than keeping a stale one';

  -- moddatetime has run since 0078; this is here so the WHEN half of Amber's question is
  -- covered by a check and not by a memory of reading the trigger.
  moved := stamped_at > (now() - interval '1 minute');
  if not moved then
    raise exception 'process_updated_at did not move on an update (%)', stamped_at;
  end if;
  raise notice 'ok  process_updated_at moves on an update';

  -- The audit row is what "what happened" is read from, so the probe checks one exists
  -- and that it carries both sides of the change.
  if not exists (
    select 1 from activity_audit
     where activity_audit_table = 'processes'
       and activity_audit_operation = 'UPDATE'
       and activity_audit_new_row ->> 'process_id' = probe_id::text
       and activity_audit_old_row ->> 'process_name' = 'Probe: who last changed a process'
       and activity_audit_new_row ->> 'process_name' = 'Probe: renamed with nobody signed in'
  ) then
    raise exception 'the update wrote no activity_audit row carrying both names';
  end if;
  raise notice 'ok  the edit is in activity_audit with the old and the new name';

  -- Left as found. The audit rows stay: they are the history of a row that existed.
  delete from processes where process_id = probe_id;
  raise notice 'ok  0091: who last changed a process is recorded, and a stale author never survives';
end $$;
