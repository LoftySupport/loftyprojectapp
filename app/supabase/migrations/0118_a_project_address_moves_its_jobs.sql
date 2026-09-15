-- =============================================================================
-- 0118 — a project's new address moves the jobs that were still standing on it
-- =============================================================================
-- Amber, 14 September: *"when a new address is added and updated to current project
-- address this address needs to push to jobs so that the job address shown on the job
-- drawer and project drawer is the current address"*.
--
-- WHAT WAS ACTUALLY BROKEN
--
--   A job's address is its OWN row in `addresses`, not a pointer at the project's.
--   `createJobsFromSplit` copies the project's address per lot and stamps the lot number
--   on the copy — that copy is what makes "Lot 1, 14 Brodie Road" a thing a job can say
--   while the project says "14 Brodie Road", and it is what `job_original_address_id`
--   means.
--
--   `setProjectCurrentAddress` then repoints the PROJECT and nothing else. So a project
--   corrected to 28 Corner Street kept twelve jobs sitting at 14 Brodie Road, the job
--   drawer and the jobs list inside the project drawer both read the old street, and
--   the only way back was editing twelve job addresses by hand.
--
-- THE RULE, WHICH IS AMBER'S AND NOT THIS FILE'S
--
--   Asked on 14 September with three options, she took the conservative one: **a job
--   follows the project when it is still standing where the project was standing.**
--
--   - The job's street number, street, street line 2, suburb, state and postcode match
--     the project's OUTGOING address → it never moved on its own, so it moves now. It
--     keeps its own lot and res numbers, which is the whole point: "Lot 1, 14 Brodie
--     Road" becomes "Lot 1, 28 Corner Street", not "28 Corner Street".
--   - The job has been re-addressed since — titles issued and it became 13 Tester
--     Street — → it is left exactly alone. Its address is a fact about that dwelling
--     now, not an inheritance, and overwriting it would be the silent data loss this
--     repository keeps refusing to ship.
--   - Closed and cancelled jobs are left alone, the same line `pushProjectProperties`
--     draws (0045, 0057). Their data does not change.
--
-- "ITS OWN LOT NUMBER" IS A COMPARISON, NOT A FIELD
--
--   A lot number is only the job's own when it DIFFERS from the project's outgoing one.
--   A job sharing the project's address row carries the project's lot number, and
--   keeping it would strand "Lot 100" on a project that has just been given a street
--   number instead. So each of res and lot is kept when it differs from the address the
--   project is leaving, and taken from the new address when it does not. Both cases fall
--   out of one line each, and the split case and the shared case are then the same rule.
--
-- WHY THIS IS A TRIGGER
--
--   Because the repository is not the only writer. The import writes jobs and projects
--   directly, `0107`-shaped corrections are plain SQL, and a rule implemented in
--   TypeScript is a second opinion that can disagree with the database — the reason
--   `setJobCurrentAddress` deliberately leaves every one of its guarantees to a trigger.
--
--   SECURITY DEFINER, matching `log_address_history`. Not to widen anybody's reach: a
--   person who may repoint the project may already edit its jobs. It is so that a job
--   RLS hides from the caller cannot be left silently behind at the old street — an
--   UPDATE that matches no rows is not an error in Postgres, and half a move is worse
--   than none.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   - It does not touch `job_original_address_id`. That is what the job was created as,
--     `guard_original_address` says only an admin moves it, and this is not that.
--   - It does not move a job to a locality. `guard_job_address_is_a_street` refuses a
--     job with no street on it, and a project may legitimately sit at one — so when the
--     project moves to a locality, nothing follows and the project's own move still
--     succeeds. Blocking the project because a job cannot follow would be the tail
--     wagging the dog.
--   - It writes no history of its own. `jobs_log_address_history` is already on `jobs`
--     and files each job's outgoing address as it goes, so every old address stays on
--     the record and stays searchable — which is the promise `0042` made.
-- =============================================================================

create or replace function jobs_follow_project_address() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  moving_to   addresses%rowtype;
  moving_from addresses%rowtype;
  standing    record;
  kept_res    integer;
  kept_lot    integer;
  lands_on    uuid;
begin
  -- `update of <column>` fires when the column is in the SET list, changed or not. A
  -- re-save of the same id must do nothing at all: without this, every job standing
  -- there would be handed a byte-identical copy of the address it already has.
  if new.project_current_address_id is not distinct from old.project_current_address_id then
    return null;
  end if;

  select * into moving_to   from addresses where address_id = new.project_current_address_id;
  select * into moving_from from addresses where address_id = old.project_current_address_id;

  -- Either end missing means there is nothing to compare against. Not an error: the
  -- outgoing id is not null today, and a future shape where it is should do nothing
  -- rather than guess which jobs were standing on it.
  if moving_to.address_id is null or moving_from.address_id is null then
    return null;
  end if;

  -- A job is a dwelling and needs a street (guard_job_address_is_a_street). The project
  -- has just moved to a locality, so no job can follow it there.
  if moving_to.address_street_1 is null then
    return null;
  end if;

  for standing in
    select j.job_id,
           ja.address_res_number,
           ja.address_lot_number
      from jobs j
      join addresses ja on ja.address_id = j.job_current_address_id
     where j.project_id = new.project_id
       and is_current(j.job_status)
       -- Where it stands, field by field. `is not distinct from` rather than `=`,
       -- because street_2 and street_number are nullable and `null = null` is null —
       -- which would quietly exclude every job on a project with no unit line.
       and ja.address_street_number is not distinct from moving_from.address_street_number
       and ja.address_street_1      is not distinct from moving_from.address_street_1
       and ja.address_street_2      is not distinct from moving_from.address_street_2
       and ja.address_suburb        is not distinct from moving_from.address_suburb
       and ja.address_state         is not distinct from moving_from.address_state
       and ja.address_postcode      is not distinct from moving_from.address_postcode
  loop
    -- Its own, or the project's. See the note above: a value that matches the address
    -- the project is leaving was inherited, and follows; one that differs is the job's.
    kept_res := case when standing.address_res_number is not distinct from moving_from.address_res_number
                     then moving_to.address_res_number else standing.address_res_number end;
    kept_lot := case when standing.address_lot_number is not distinct from moving_from.address_lot_number
                     then moving_to.address_lot_number else standing.address_lot_number end;

    if kept_res is not distinct from moving_to.address_res_number
       and kept_lot is not distinct from moving_to.address_lot_number then
      -- Nothing of its own to keep, so it points AT the project's address rather than at
      -- a byte-identical copy of it. That is the relationship a job created without an
      -- address of its own already had, and duplicating the row here would break it.
      lands_on := moving_to.address_id;
    else
      insert into addresses (address_res_number, address_lot_number, address_street_number,
                             address_street_1, address_street_2, address_suburb,
                             address_state, address_postcode, address_country, address_council)
      values (kept_res, kept_lot, moving_to.address_street_number,
              moving_to.address_street_1, moving_to.address_street_2, moving_to.address_suburb,
              moving_to.address_state, moving_to.address_postcode, moving_to.address_country,
              moving_to.address_council)
      returning address_id into lands_on;
    end if;

    update jobs set job_current_address_id = lands_on where job_id = standing.job_id;
  end loop;

  return null;  -- AFTER trigger; the return value is not used.
end $$;

revoke execute on function jobs_follow_project_address() from public;
revoke execute on function jobs_follow_project_address() from anon;
revoke execute on function jobs_follow_project_address() from authenticated;

comment on function jobs_follow_project_address() is
  'When a project''s current address repoints, every live job still standing at the project''s outgoing address follows it, keeping any res and lot number of its own. A job re-addressed since — titles issued, its own street — is left alone, as are closed and cancelled jobs. Amber, 14 September; the rule is hers, asked with three options and answered "only jobs still at the project''s address".';

drop trigger if exists projects_jobs_follow_address on projects;
create trigger projects_jobs_follow_address
  after update of project_current_address_id on projects
  for each row execute function jobs_follow_project_address();

-- ---------------------------------------------------------------------- proof
-- Watched fail before it was watched pass, fifteen times: the function was mutated one
-- line at a time — each of the six comparisons deleted in turn, `is_current` deleted,
-- both guards deleted, the UPDATE deleted, the point-at-the-project branch disabled,
-- and each of `kept_res` and `kept_lot` forced to the job's value and then to the
-- project's — and every one of the fifteen was reported by a named assertion below.
-- That is what the per-field jobs are for: with only the four-field re-addressed job,
-- dropping the street comparison alone still read green.
do $$
declare
  brodie   uuid; corner uuid; tester uuid;
  a_split  uuid; a_moved uuid; a_stopped uuid;
  project  integer;
  split_job text; shared_job text; moved_job text; stopped_job text;
  -- One job per field of the match, each differing from the project in that field
  -- ALONE. Without these the comparison could lose a line and the probe would still
  -- read green: the re-addressed job below differs in four fields at once, so any
  -- three of them are enough to keep it standing still.
  labels   text[] := array['street number', 'street', 'street line 2', 'suburb', 'state', 'postcode'];
  variants uuid[] := '{}';
  var_jobs text[] := '{}';
  one_off  uuid; one_job text; i integer;
  reads    text;
  lands    uuid;
  filed    integer;
begin
  -- The project carries a res and a lot of its own. Both matter: they are what a job
  -- with no address of its own INHERITS, and therefore what it has to let go of when
  -- the project moves. Amber, 10 September, on the res number: *"on a project you might
  -- update the res number there as well"*.
  insert into addresses (address_res_number, address_lot_number, address_street_number,
                         address_street_1, address_suburb, address_postcode)
  values (1, 100, '14', 'Brodie Road 0118', 'Reynella', '5161') returning address_id into brodie;

  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (brodie, brodie, 'residential') returning project_id into project;

  -- 1. The split job: the project's street, its own lot. What 0107 left on the live data.
  insert into addresses (address_res_number, address_lot_number, address_street_number,
                         address_street_1, address_suburb, address_postcode)
  values (9, 1, '14', 'Brodie Road 0118', 'Reynella', '5161') returning address_id into a_split;
  insert into jobs (project_id, job_current_address_id, job_owning_team)
  values (project, a_split, 'construction') returning job_id into split_job;

  -- 2. The job with no address of its own: it points at the project's row.
  insert into jobs (project_id, job_current_address_id, job_owning_team)
  values (project, brodie, 'construction') returning job_id into shared_job;

  -- 3. Re-addressed since, which is the one that must not move.
  insert into addresses (address_street_number, address_street_1, address_suburb, address_postcode)
  values ('13', 'Tester Street 0118', 'Testville', '5000') returning address_id into a_moved;
  insert into jobs (project_id, job_current_address_id, job_owning_team)
  values (project, a_moved, 'construction') returning job_id into moved_job;

  -- 4. Standing where the project was, but cancelled. Its data does not change.
  insert into addresses (address_lot_number, address_street_number, address_street_1,
                         address_suburb, address_postcode)
  values (4, '14', 'Brodie Road 0118', 'Reynella', '5161') returning address_id into a_stopped;
  insert into jobs (project_id, job_current_address_id, job_owning_team, job_status)
  values (project, a_stopped, 'construction', 'cancelled') returning job_id into stopped_job;

  -- One job per field. Lot numbers 11..16 so each is unmistakably its own address.
  for i in 1 .. array_length(labels, 1) loop
    insert into addresses (address_lot_number, address_street_number, address_street_1,
                           address_street_2, address_suburb, address_state, address_postcode)
    values (10 + i,
            case when i = 1 then '16'                else '14'              end,
            case when i = 2 then 'Other Road 0118'   else 'Brodie Road 0118' end,
            case when i = 3 then 'Unit 2'            else null               end,
            case when i = 4 then 'Morphett Vale'     else 'Reynella'         end,
            case when i = 5 then 'NSW'               else 'SA'               end::au_state,
            case when i = 6 then '5162'              else '5161'             end)
    returning address_id into one_off;
    insert into jobs (project_id, job_current_address_id, job_owning_team)
    values (project, one_off, 'construction') returning job_id into one_job;
    variants := variants || one_off;
    var_jobs := var_jobs || one_job;
  end loop;

  -- The move.
  insert into addresses (address_street_number, address_street_1, address_suburb, address_postcode)
  values ('28', 'Corner Street 0118', 'Reynella', '5161') returning address_id into corner;
  update projects set project_current_address_id = corner where project_id = project;

  -- 1. The job's OWN res and lot survive the street change. Both differ from the
  --    project's, which is what makes them the job's rather than an inheritance.
  select a.address_consolidated into reads
    from jobs j join addresses a on a.address_id = j.job_current_address_id
   where j.job_id = split_job;
  if reads is distinct from 'Res 9, Lot 1, 28 Corner Street 0118, Reynella, SA, 5161' then
    raise exception '0118 proof: the split job reads "%", expected "Res 9, Lot 1, 28 Corner Street 0118, Reynella, SA, 5161"', coalesce(reads, '<null>');
  end if;

  -- 2. The other direction: this job's res and lot were the PROJECT's, so it lets both
  --    go and lands on the project's own row rather than on a copy carrying Res 1,
  --    Lot 100 to a street that has neither.
  select j.job_current_address_id into lands from jobs j where j.job_id = shared_job;
  if lands is distinct from corner then
    raise exception '0118 proof: the job with no address of its own did not land on the project''s row';
  end if;

  -- 3. The one that moved on its own stays where it is.
  select j.job_current_address_id into lands from jobs j where j.job_id = moved_job;
  if lands is distinct from a_moved then
    raise exception '0118 proof: a job re-addressed on its own was overwritten by the project''s address';
  end if;

  -- 4. Cancelled is left alone.
  select j.job_current_address_id into lands from jobs j where j.job_id = stopped_job;
  if lands is distinct from a_stopped then
    raise exception '0118 proof: a cancelled job followed the project';
  end if;

  -- Differing in one field is enough to be standing somewhere else.
  for i in 1 .. array_length(labels, 1) loop
    select j.job_current_address_id into lands from jobs j where j.job_id = var_jobs[i];
    if lands is distinct from variants[i] then
      raise exception '0118 proof: a job differing from the project only in its % followed it', labels[i];
    end if;
  end loop;

  -- Every job that moved filed its outgoing address, which is what keeps the old one
  -- searchable. Two moved, so two rows.
  select count(*) into filed from address_history
   where address_history_job_id in (split_job, shared_job)
     and address_history_role = 'current';
  if filed <> 2 then
    raise exception '0118 proof: % address_history rows for the two jobs that moved, expected 2', filed;
  end if;

  -- Re-saving the same address id changes nothing and creates nothing. `update of`
  -- fires on the SET list, not on a change, so this is the probe for that guard.
  select count(*) into filed from addresses where address_street_1 = 'Corner Street 0118';
  update projects set project_current_address_id = corner where project_id = project;
  if (select count(*) from addresses where address_street_1 = 'Corner Street 0118') <> filed then
    raise exception '0118 proof: re-saving the same address id made a duplicate address row';
  end if;

  -- And the project's own move still succeeds when no job can follow it to a locality.
  insert into addresses (address_suburb, address_postcode) values ('Reynella', '5161') returning address_id into tester;
  update projects set project_current_address_id = tester where project_id = project;
  select j.job_current_address_id into lands from jobs j where j.job_id = shared_job;
  if lands is distinct from corner then
    raise exception '0118 proof: a job was dragged to a locality it cannot stand on';
  end if;

  raise notice 'ok  0118 — jobs standing at the project''s old address followed it; the rest did not';

  delete from address_history where address_history_job_id in (split_job, shared_job, moved_job, stopped_job)
     or address_history_job_id = any (var_jobs)
     or address_history_project_id = project;
  delete from jobs where project_id = project;
  delete from projects where project_id = project;
  delete from addresses where address_id in (brodie, corner, tester, a_split, a_moved, a_stopped)
     or address_id = any (variants)
     or address_street_1 = 'Corner Street 0118';
  delete from activity_audit
   where activity_audit_table in ('jobs', 'projects', 'addresses')
     and (coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'project_id' = project::text
          or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'job_id'
               in (split_job, shared_job, moved_job, stopped_job)
          or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'job_id' = any (var_jobs)
          or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_street_1'
               in ('Brodie Road 0118', 'Corner Street 0118', 'Tester Street 0118'));
end $$;
