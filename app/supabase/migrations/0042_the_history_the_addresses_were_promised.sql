-- =============================================================================
-- 0042 — the history the addresses were promised
-- =============================================================================
-- 0025 built `address_history` and wrote, in the note above its policies:
--
--   "Writing is the trigger's job when a record's address changes, so there is no
--    insert policy"
--
-- The trigger was never written. Repointing a project's current address orphaned the
-- old row exactly as 0025 described — the text survives and search finds it, but
-- nothing can say whose it was. The table has been empty since it was created, and the
-- absence of an insert policy meant nothing else could fill it either.
--
-- This is that trigger. It fires on both tables, for both roles, and inserts the
-- SUPERSEDED assignment only — the live one is the column itself, which is 0025's
-- design: the link and the period, never a copy of the address.
--
-- WHEN THE PERIOD STARTED
--
--   `valid_from` is when the outgoing address became the record's answer: the end of
--   the previous stint if the record has one in the history, else the record's own
--   created_at. Derived at write time from what the history already holds, so the
--   periods tile without gaps whether the record moved once or five times.
--
-- WHO CAN CAUSE THIS
--
--   Nobody directly — there is still no INSERT policy, which is the point. The
--   function is SECURITY DEFINER so the write happens with the table owner's rights,
--   the same posture as activity_audit and job_stage_events. Moving a current address
--   is any user's edit under "users update projects"; moving an original is admin+,
--   enforced by guard_original_address since long before this. Amber, 25 August: "the
--   original address will not be able to be overwritten … the current address is
--   updateable but all addresses should be in the project history".
-- =============================================================================

create or replace function log_address_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec_project integer;
  rec_job     text;
  rec_created timestamptz;
  old_current uuid;
  new_current uuid;
  old_orig    uuid;
  new_orig    uuid;
  started     timestamptz;
begin
  if tg_table_name = 'projects' then
    rec_project := old.project_id;
    rec_created := old.project_created_at;
    old_current := old.project_current_address_id;  new_current := new.project_current_address_id;
    old_orig    := old.project_original_address_id; new_orig    := new.project_original_address_id;
  else
    rec_job     := old.job_id;
    rec_created := old.job_created_at;
    old_current := old.job_current_address_id;  new_current := new.job_current_address_id;
    old_orig    := old.job_original_address_id; new_orig    := new.job_original_address_id;
  end if;

  if new_current is distinct from old_current and old_current is not null then
    select coalesce(max(h.address_history_valid_to), rec_created) into started
    from address_history h
    where h.address_history_role = 'current'
      and (h.address_history_project_id = rec_project or h.address_history_job_id = rec_job);

    insert into address_history
      (address_history_project_id, address_history_job_id, address_history_address_id,
       address_history_role, address_history_valid_from, address_history_valid_to,
       address_history_changed_by)
    values
      (rec_project, rec_job, old_current, 'current', started, now(), current_profile_id());
  end if;

  -- An original moving at all is an admin correcting a mistake — rare, and exactly the
  -- kind of change that must not be silent.
  if new_orig is distinct from old_orig and old_orig is not null then
    select coalesce(max(h.address_history_valid_to), rec_created) into started
    from address_history h
    where h.address_history_role = 'original'
      and (h.address_history_project_id = rec_project or h.address_history_job_id = rec_job);

    insert into address_history
      (address_history_project_id, address_history_job_id, address_history_address_id,
       address_history_role, address_history_valid_from, address_history_valid_to,
       address_history_changed_by)
    values
      (rec_project, rec_job, old_orig, 'original', started, now(), current_profile_id());
  end if;

  return null;  -- AFTER trigger; the return value is not used.
end;
$$;

revoke execute on function log_address_history() from public;
revoke execute on function log_address_history() from anon;
revoke execute on function log_address_history() from authenticated;

comment on function log_address_history() is
  'Writes the superseded assignment into address_history when a project''s or job''s address repoints — the trigger 0025 said would exist. valid_from is the end of the previous stint, or the record''s creation when there is none, so the periods tile.';

drop trigger if exists projects_log_address_history on projects;
create trigger projects_log_address_history
  after update of project_current_address_id, project_original_address_id on projects
  for each row execute function log_address_history();

drop trigger if exists jobs_log_address_history on jobs;
create trigger jobs_log_address_history
  after update of job_current_address_id, job_original_address_id on jobs
  for each row execute function log_address_history();
