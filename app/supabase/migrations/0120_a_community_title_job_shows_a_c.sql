-- =============================================================================
-- 0120 — a community title job shows a c, and the key does not move
-- =============================================================================
-- Amber, 14 September: *"Any job that is listed as community title needs a 'c' suffix
-- after the job number eg 1004-001c. Torrens title has no suffix. The jobs remain
-- sequential eg 1004-001c / 1004-002c / 1004-003 / 1004-004 Etc"*.
--
-- The sequence half needs no code at all: `assign_job_sequence()` already numbers jobs
-- in one run per project regardless of their title type, which is exactly what her
-- example shows. Only the suffix is new.
--
-- WHY THIS IS A DISPLAY COLUMN AND NOT A CHANGE TO THE KEY
--
--   `job_id` IS the job number here — `jobs_id_matches_its_parts` pins it to
--   `project_id || '-' || job_sequence`, and `jobs_job_sequence_check` allows digits
--   only. Putting a `c` in it means changing the primary key's shape.
--
--   Seventeen tables point at `jobs(job_id)`. Sixteen cascade on update; **report_documents
--   does not**, so a renumber would be refused outright by a table nobody would think to
--   look at. That is survivable — one FK to change — and it is not the real problem.
--
--   The real problem is that Amber settled this morning that the title type *"might be
--   updated later during the build so it needs to be editable"*, and **67 of the 83 live
--   jobs have no title type set at all**. So under a key-carried suffix, most jobs would be
--   renumbered LONG AFTER creation, by somebody changing a dropdown — and a job number is
--   what goes in contracts, emails, SharePoint folder names and SiteBook. A cascade fixes
--   the database and reaches none of those.
--
--   Put the choice to her with the numbers, she took **the suffix on the displayed number,
--   with the key left alone**. So:
--
--     job_id              1004-003     the key. Never moves. Routes, foreign keys, URLs.
--     job_number_display  1004-003c    what a person reads. Follows the title type.
--
--   The `c` therefore appears the moment a job is marked community title and disappears if
--   that is corrected, with nothing to migrate and nothing to renumber. A job whose title
--   type nobody has set yet reads without a suffix, which is honest: it is not a claim that
--   the job is Torrens, it is the absence of a claim either way.
--
-- A GENERATED COLUMN, NOT A VIEW COLUMN
--
--   `address_consolidated` set this precedent in 0001 and its comment still says why:
--   *"Assembled once, in the database, so every card, export and search reads the same
--   string."* The same argument holds here and is stronger, because a job number appears in
--   documents and reports that never go near `job_display`.
--
--   STORED and `generated always`, so it cannot be written to by hand and cannot drift
--   from the two columns it is built from. `address_consolidated` had to be a trigger
--   because casting an enum to text is not immutable; this expression is plain text
--   concatenation and a CASE, so the real generated column is available.
-- =============================================================================

alter table jobs
  add column if not exists job_number_display text
  generated always as (job_id || case when job_title_type = 'community' then 'c' else '' end) stored;

comment on column jobs.job_number_display is
  'The job number as a person reads it: the job_id, with a trailing "c" when the job is community title. Torrens and not-yet-decided read without one. Generated and STORED, so it follows job_title_type automatically and cannot be written to by hand. The KEY is job_id and does not carry the suffix — Amber, 14 September, chose the suffix on the displayed number over a suffix in the key, because the title type stays editable and a job number that changes under an edit is one that no longer matches the contract, the email or the SharePoint folder. 0120.';

-- The view hands it to every screen that already reads job_display. Appended, so
-- CREATE OR REPLACE keeps `task_display` and the twenty-eight columns above it intact.
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
         j.job_number_display
  from jobs j
  join projects p using (project_id)
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id
  join addresses pcur      on pcur.address_id = p.project_current_address_id
  left join lateral job_completion_forecast(j.job_id) f on true;

-- ---------------------------------------------------------------------- proof
-- Watched fail before it was watched pass: dropping the `= 'community'` test suffixed
-- every job including the Torrens one and assertion 2 reported; changing the literal to
-- 'C' reported on assertion 1; and making the column plain instead of generated let the
-- update in assertion 3 leave it stale, which assertion 3 is there to catch.
do $$
declare
  probe_addr uuid; probe_project integer;
  community_job text; torrens_job text; undecided_job text;
  reads text;
  seqs text;
begin
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode)
  values (120, 'Probe Street 0120', 'Golden Grove', '5125') returning address_id into probe_addr;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_addr, probe_addr, 'residential') returning project_id into probe_project;

  insert into jobs (project_id, job_current_address_id, job_owning_team, job_title_type)
  values (probe_project, probe_addr, 'construction', 'community') returning job_id into community_job;
  insert into jobs (project_id, job_current_address_id, job_owning_team, job_title_type)
  values (probe_project, probe_addr, 'construction', 'torrens') returning job_id into torrens_job;
  insert into jobs (project_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_addr, 'construction') returning job_id into undecided_job;

  -- 1. Community gets the c, appended to the key rather than replacing anything in it.
  select job_number_display into reads from jobs where job_id = community_job;
  if reads is distinct from community_job || 'c' then
    raise exception '0120 proof: the community job reads "%", expected "%"', reads, community_job || 'c';
  end if;

  -- 2. Torrens does not, and neither does a job nobody has decided about. The second is
  --    the one worth stating: a missing title type is not a claim that it is Torrens, and
  --    both correctly read without a suffix for different reasons.
  select job_number_display into reads from jobs where job_id = torrens_job;
  if reads is distinct from torrens_job then
    raise exception '0120 proof: the torrens job reads "%", expected "%"', reads, torrens_job;
  end if;
  select job_number_display into reads from jobs where job_id = undecided_job;
  if reads is distinct from undecided_job then
    raise exception '0120 proof: the undecided job reads "%", expected "%"', reads, undecided_job;
  end if;

  -- 3. It FOLLOWS the title type, which is the whole reason it is generated rather than
  --    written once. Amber: the type "might be updated later during the build".
  update jobs set job_title_type = 'community' where job_id = undecided_job;
  select job_number_display into reads from jobs where job_id = undecided_job;
  if reads is distinct from undecided_job || 'c' then
    raise exception '0120 proof: after being marked community the job reads "%", expected "%"',
      reads, undecided_job || 'c';
  end if;
  -- And back again, so the suffix is not a one-way door.
  update jobs set job_title_type = 'torrens' where job_id = undecided_job;
  select job_number_display into reads from jobs where job_id = undecided_job;
  if reads is distinct from undecided_job then
    raise exception '0120 proof: after being corrected to torrens the job still reads "%"', reads;
  end if;

  -- 4. The KEY never moved. This is the point of the whole design.
  if not exists (select 1 from jobs where job_id = community_job) then
    raise exception '0120 proof: the community job''s key changed';
  end if;

  -- 5. The sequence runs across both types without restarting — Amber's own example is
  --    001c, 002c, 003, 004. Nothing here implements that; the assertion exists so that
  --    a future change to assign_job_sequence cannot quietly break it.
  select string_agg(job_sequence, ',' order by job_sequence) into seqs
    from jobs where project_id = probe_project;
  if seqs is distinct from '001,002,003' then
    raise exception '0120 proof: the sequence reads "%", expected "001,002,003" — it must not restart per title type', seqs;
  end if;

  -- 6. The view carries it.
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'job_display' and column_name = 'job_number_display';
  if not found then
    raise exception '0120 proof: job_display does not carry job_number_display';
  end if;

  raise notice 'ok  0120 — community reads with a c, torrens and undecided without, and the key never moves';

  delete from jobs where project_id = probe_project;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_addr;
  delete from activity_audit
   where coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'project_id' = probe_project::text
      or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'job_id'
           in (community_job, torrens_job, undecided_job)
      or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_street_1' = 'Probe Street 0120';
end $$;
