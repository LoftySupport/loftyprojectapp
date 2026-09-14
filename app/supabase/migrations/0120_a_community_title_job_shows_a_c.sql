-- =============================================================================
-- 0120 — a community title job carries a c, in the number itself
-- =============================================================================
-- Amber, 14 September: *"Any job that is listed as community title needs a 'c' suffix
-- after the job number eg 1004-001c. Torrens title has no suffix. The jobs remain
-- sequential eg 1004-001c / 1004-002c / 1004-003 / 1004-004 Etc"*.
--
-- Then, when the first draft of this migration put the suffix on a DISPLAY column and left
-- the key alone: *"But the primary key can it be updated that is also linked so it show the
-- c on the end (like the address when updated) but the project 4 digits and 3 digit job
-- code always remains with job too"*.
--
-- **Yes, it can, and this is that.** The first draft is recorded in `schema-plan.md` as a
-- reversed decision rather than deleted, because the reasoning against it is still true and
-- somebody should be able to see what was weighed.
--
-- WHY THE ANSWER CHANGED
--
--   The objection was never that a key cannot be renamed here. It is that renaming one
--   reaches things the database cannot: contracts, emails, SharePoint folder names. That
--   cost is real and Amber has now accepted it knowingly, twice.
--
--   Against it, the machinery for exactly this **already exists and was built on purpose**.
--   `resync_job_id` has rebuilt `job_id` from its parts on every update since 0028, and 16
--   of the 17 tables referencing `jobs(job_id)` were already declared ON UPDATE CASCADE.
--   The schema was designed for a job number that moves. Bolting a parallel display column
--   beside it would have been a second answer to "what is this job called", which is the
--   thing this repository keeps refusing to have.
--
--   Her constraint is honoured exactly: **the 4-digit project and the 3-digit sequence never
--   change.** `job_sequence` stays digits-only under `jobs_job_sequence_check` and
--   `jobs_sequence_is_padded`; only the suffix is appended or removed. 1004-003 becomes
--   1004-003c and back, and can never become 1004-004.
--
-- THE ONE TABLE THAT WOULD HAVE REFUSED
--
--   `report_documents` referenced `jobs(job_id)` with **NO ACTION**, so the very first
--   rename would have been rejected by a table nobody would think to look at, with 6 rows
--   already linked. Fixed here to ON UPDATE CASCADE, matching its sixteen siblings.
--
-- WHAT WAS CHECKED BEFORE COMMITTING TO THIS
--
--   - Nothing embeds the job number inside its own key. `maintenance_request_id` is a uuid,
--     not "1042-01-M3" as the naming might suggest, so no child id goes stale.
--   - No job has a SharePoint folder yet (0 of 83), so no stored URL breaks today.
--   - 9 jobs are community title and get renamed by the backfill below. 7 are torrens and
--     67 have no title type, and none of those move.
--
-- THE COST, STATED PLAINLY
--
--   A bookmarked `/jobs/1004-003` stops resolving once that job is marked community title.
--   Whether the old number should stay findable — the other half of Amber's address analogy,
--   since `address_history` keeps superseded addresses searchable — is open question 0f and
--   is deliberately NOT guessed at here.
-- =============================================================================

-- ------------------------------------------------- the one FK that would refuse
alter table report_documents
  drop constraint if exists report_documents_job_id_fkey;
alter table report_documents
  add constraint report_documents_job_id_fkey
  foreign key (job_id) references jobs(job_id) on update cascade on delete set null;

-- --------------------------------------------------------- one definition
-- Both triggers below build the number from this, so there is exactly one place that
-- knows the shape. The CHECK inlines the same expression rather than calling it: a CHECK
-- built on a function is NOT re-verified when the function changes, so it would go on
-- passing rows it no longer describes. The proof block asserts the two agree, which is
-- what stops them drifting without duplicating the rule unwatched.
create or replace function job_number(the_project integer, the_sequence text, the_title_type text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select the_project::text || '-' || the_sequence
      || case when the_title_type = 'community' then 'c' else '' end;
$$;

comment on function job_number(integer, text, text) is
  'The job number: the project number, a dash, the padded sequence, and a trailing "c" when the job is community title. Torrens and not-yet-decided carry no suffix — a missing title type is the absence of a claim, not a claim that it is torrens. The project and sequence parts never change; only the suffix moves. Amber, 14 September. 0120.';

grant execute on function job_number(integer, text, text) to authenticated;

-- ------------------------------------------------------------ the two triggers
-- At insert. Unchanged except for the suffix on the last line.
create or replace function assign_job_sequence() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_no integer;
begin
  if new.job_sequence is null then
    update projects
       set project_job_seq_high_water = project_job_seq_high_water + 1
     where project_id = new.project_id
    returning project_job_seq_high_water into next_no;

    if next_no is null then
      raise exception 'project % does not exist', new.project_id using errcode = '23503';
    end if;

    -- Pad to three, never truncate. The sequence itself carries no suffix, which is what
    -- keeps Amber's "3 digit job code always remains with job" true: the counter counts
    -- dwellings, not community-title dwellings, so 001c and 002 are consecutive.
    new.job_sequence := case
      when next_no < 1000 then lpad(next_no::text, 3, '0')
      else next_no::text
    end;
  end if;

  new.job_id := job_number(new.project_id, new.job_sequence, new.job_title_type);
  return new;
end $$;

-- On update. `job_title_type` joins the two parts that already rebuilt the number, which
-- is the whole of Amber's "can it be updated … like the address when updated".
create or replace function resync_job_id() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id
     or new.job_sequence is distinct from old.job_sequence
     or new.job_title_type is distinct from old.job_title_type then
    new.job_id := job_number(new.project_id, new.job_sequence, new.job_title_type);
  end if;
  return new;
end $$;

comment on function resync_job_id() is
  'Rebuilds job_id when any part of it changes: the project, the sequence, or — since 0120 — the title type, which appends or removes the community-title "c". The 16 ON UPDATE CASCADE foreign keys carry the rename to every child row; report_documents was made the 17th in 0120 because it would otherwise have refused the first one.';

-- --------------------------------------------------------------- the shape
alter table jobs drop constraint if exists jobs_id_matches_its_parts;
alter table jobs add constraint jobs_id_matches_its_parts
  check (job_id = project_id::text || '-' || job_sequence
                || case when job_title_type = 'community' then 'c' else '' end);

-- ------------------------------------------------------------- the backfill
-- The 9 community title jobs take their suffix. Every child row follows by cascade; no
-- child id embeds the job number, which was checked before this was written.
do $$
declare
  moved integer;
begin
  update jobs
     set job_id = job_number(project_id, job_sequence, job_title_type)
   where job_title_type = 'community'
     and job_id is distinct from job_number(project_id, job_sequence, job_title_type);
  get diagnostics moved = row_count;
  raise notice '0120: % community title jobs took their c.', moved;
end $$;

-- ---------------------------------------------------------------------- proof
-- Watched fail before it was watched pass, each mutation replayed into a fresh database:
-- suffixing every job, suffixing torrens instead of community, an upper-case C, no suffix
-- at all, dropping job_title_type from resync_job_id's test (the c then never appears on
-- an existing job), and leaving report_documents on NO ACTION (the rename is refused).
do $$
declare
  probe_addr uuid; probe_project integer;
  community_job text; torrens_job text; undecided_job text;
  now_called text;
  seqs text;
  probe_template uuid; probe_doc uuid;
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

  -- 1. Born with it. The key itself, not a column beside it.
  if community_job is distinct from probe_project::text || '-001c' then
    raise exception '0120 proof: the community job was created as "%", expected "%-001c"',
      community_job, probe_project;
  end if;

  -- 2. Torrens does not, and neither does a job nobody has decided about. Both read
  --    without a suffix for different reasons, and the second is the one worth stating:
  --    a missing title type is not a claim that the job is torrens.
  if torrens_job is distinct from probe_project::text || '-002' then
    raise exception '0120 proof: the torrens job was created as "%", expected "%-002"',
      torrens_job, probe_project;
  end if;
  if undecided_job is distinct from probe_project::text || '-003' then
    raise exception '0120 proof: the undecided job was created as "%", expected "%-003"',
      undecided_job, probe_project;
  end if;

  -- 3. Amber's own example: the sequence runs straight through both types. 001c, 002, 003
  --    — the counter counts dwellings, so the c never costs a number.
  select string_agg(job_sequence, ',' order by job_sequence) into seqs
    from jobs where project_id = probe_project;
  if seqs is distinct from '001,002,003' then
    raise exception '0120 proof: the sequence reads "%", expected "001,002,003"', seqs;
  end if;

  -- 4. THE ANSWER TO HER QUESTION. Change the title type on a job that already exists and
  --    the key itself moves, carrying its children with it.
  insert into tasks (job_id, task_name) values (undecided_job, 'Probe task 0120');
  update jobs set job_title_type = 'community' where job_id = undecided_job;

  select job_id into now_called from jobs where job_sequence = '003' and project_id = probe_project;
  if now_called is distinct from undecided_job || 'c' then
    raise exception '0120 proof: after being marked community the job is called "%", expected "%"',
      now_called, undecided_job || 'c';
  end if;
  -- The child followed. This is the cascade doing the work the design depends on.
  if not exists (select 1 from tasks where job_id = now_called and task_name = 'Probe task 0120') then
    raise exception '0120 proof: the job was renamed and its task did not follow';
  end if;
  if exists (select 1 from tasks where job_id = undecided_job) then
    raise exception '0120 proof: a task is still pointing at the old job number';
  end if;

  -- 5. And the 4-digit project and 3-digit sequence are untouched by the move, which is
  --    the constraint Amber set on the whole idea.
  if not exists (
    select 1 from jobs
     where job_id = now_called and project_id = probe_project and job_sequence = '003') then
    raise exception '0120 proof: the rename disturbed the project number or the sequence';
  end if;

  -- 6. Not a one-way door: corrected back to torrens, the c goes away again.
  update jobs set job_title_type = 'torrens' where job_id = now_called;
  select job_id into now_called from jobs where job_sequence = '003' and project_id = probe_project;
  if now_called is distinct from undecided_job then
    raise exception '0120 proof: corrected back to torrens the job is still called "%"', now_called;
  end if;

  -- 7. report_documents would have refused the rename before this migration. Prove it
  --    cascades now, on a real row rather than on the constraint's catalogue entry.
  insert into report_templates (report_template_kind, report_template_name, report_template_layout)
  values ('template', 'Probe template 0120', '{"widgets": []}'::jsonb)
  returning report_template_id into probe_template;
  insert into report_documents (report_template_id, job_id, report_document_title, report_document_layout)
  values (probe_template, now_called, 'Probe document 0120', '{"widgets": []}'::jsonb)
  returning report_document_id into probe_doc;

  update jobs set job_title_type = 'community' where job_id = now_called;
  if not exists (
    select 1 from report_documents d join jobs j on j.job_id = d.job_id
     where d.report_document_id = probe_doc and j.job_sequence = '003') then
    raise exception '0120 proof: report_documents did not follow the rename';
  end if;

  -- 8. The CHECK and the function agree. They are written twice on purpose — a CHECK built
  --    on a function is not re-verified when the function changes — so this is what stops
  --    the two drifting apart unnoticed.
  if exists (
    select 1 from jobs
     where job_id is distinct from job_number(project_id, job_sequence, job_title_type)) then
    raise exception '0120 proof: a job exists whose id disagrees with job_number()';
  end if;

  raise notice 'ok  0120 — the c is in the key, it moves both ways, children follow, and the project and sequence never budge';

  delete from report_documents where report_document_id = probe_doc;
  delete from report_templates where report_template_id = probe_template;
  delete from tasks where job_id in (select job_id from jobs where project_id = probe_project);
  delete from jobs where project_id = probe_project;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_addr;
  delete from activity_audit
   where coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'project_id' = probe_project::text
      or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_street_1' = 'Probe Street 0120';
end $$;
