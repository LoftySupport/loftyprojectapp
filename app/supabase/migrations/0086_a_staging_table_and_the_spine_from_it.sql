-- =============================================================================
-- 0086 — Phase B: a staging table for the old system's rows, and the spine built from it
-- =============================================================================
-- Amber, 2 September: *"the jobs and projects that were attached earlier have not been
-- added."* The attachment is `Lofty_Jobs_Grouped_by_Project.xlsx` — 801 job rows from the
-- old system's CERTIFICATION tab, grouped into 121 projects by site address and numbered,
-- with the old job number kept beside each. This is the Phase B import schema-plan.md has
-- been pointing at since 21 August (*Loading jobs before properties exist*).
--
-- TWO LAYERS, ON PURPOSE
--
--   import_staging_jobs holds every source row VERBATIM as jsonb — 194 columns, dates and
--   all — beside a second jsonb of what the generator decided the row means for the spine
--   (which project, which sequence, the address split, the postcode looked up, the council
--   looked up) and why it refused where it refused. Nothing is lost and nothing is silently
--   corrected: a value the generator changed (a suburb respelled, a "#" stripped) is in the
--   spine jsonb with the original beside it in the row jsonb.
--
--   import_spine() reads the spine layer and creates addresses, projects and jobs through
--   the ordinary tables and triggers — job ids are assigned by assign_job_sequence(), the
--   audit trigger logs every insert with activity_audit_origin = 'import', the project
--   sequence follows bump_project_no_seq(). It stamps job_id back onto the staging row, so
--   every job is traceable to the sheet row it came from, and every sheet row to the job.
--
--   unimport_spine() is the way back: it deletes exactly the jobs, projects and addresses
--   that import_spine() made for a source (checked against the audit's origin, not against
--   a guess about what looks imported) and clears the stamps. Phase C reads the SAME staging
--   rows again for property values, so the rows stay.
--
-- WHAT THE FUNCTION WILL NOT DECIDE
--
--   Four things are not in the workbook and are Amber's, so import_spine() takes them as
--   parameters with no defaults and refuses to run without them:
--     p_owning_team   the team every imported job is handed to (jobs.job_owning_team is
--                     not null, and the sheet names people, not teams);
--     p_stage         the lifecycle stage the jobs land in;
--     p_project_base  where numbering starts — the workbook says 1001–1121 and the live
--                     database already holds 1002–1010 made by hand on 25–31 August;
--                     null keeps the workbook's numbers, an integer shifts them all;
--     p_status_map    what the sheet's "Cancelling" / "On Hold" / "In Doubt" mean as a
--                     job_status — null leaves every job on_track and keeps the word in
--                     the staging row for Phase C.
-- =============================================================================

create table if not exists import_staging_jobs (
  import_staging_job_id          bigint generated always as identity primary key,
  -- Which file and sheet the row came from — 'Lofty_Jobs_Grouped_by_Project.xlsx · project import'.
  import_staging_job_source      text not null
    constraint import_staging_jobs_source_is_not_blank check (length(trim(import_staging_job_source)) > 0),
  -- The sheet row (1 = the first data row under the header), so a question can go back to it.
  import_staging_job_source_row  integer not null
    constraint import_staging_jobs_source_row_is_positive check (import_staging_job_source_row > 0),
  -- The old system's job number as the sheet gives it. Nullable: five rows have none.
  import_staging_job_number_old  text,
  -- The whole sheet row, verbatim, keyed "<column letter> · <header>" because the sheet
  -- repeats headers ("Received (14 Days)" appears eleven times). Dates as ISO strings.
  import_staging_job_row         jsonb not null
    constraint import_staging_jobs_row_is_an_object check (jsonb_typeof(import_staging_job_row) = 'object'),
  -- What the generator decided the row means for the spine, and what it refused. See the
  -- generator (app/supabase/import/generate-jobs-import.py) for the keys.
  import_staging_job_spine       jsonb not null
    constraint import_staging_jobs_spine_is_an_object check (jsonb_typeof(import_staging_job_spine) = 'object'),
  import_staging_job_loaded_at   timestamptz,
  import_staging_job_job_id      text references jobs (job_id) on update cascade on delete set null,
  import_staging_job_address_id  uuid references addresses (address_id) on delete set null,
  import_staging_job_created_at  timestamptz not null default now(),
  unique (import_staging_job_source, import_staging_job_source_row)
  -- Deliberately NO check that loaded_at and job_id are set together. The job FK is ON
  -- DELETE SET NULL, so a job somebody deletes by hand leaves "loaded at …, job gone" on its
  -- row — which is the truth, and the trace an admin will want. (A pair check was tried and
  -- refused unimport_spine() itself, whose job deletes fire that SET NULL.)
);

create index if not exists import_staging_jobs_number_old_idx on import_staging_jobs (import_staging_job_number_old) where import_staging_job_number_old is not null;
create index if not exists import_staging_jobs_job_idx on import_staging_jobs (import_staging_job_job_id) where import_staging_job_job_id is not null;

comment on table import_staging_jobs is
  'Phase B (0086): every row of the old system''s job list, verbatim as jsonb, beside what the generator decided it means for the spine. import_spine() creates the addresses, projects and jobs from the spine layer and stamps job_id back; unimport_spine() removes exactly what it made. Phase C reads the same rows again for property values. Admins read; nothing writes from the app.';
comment on column import_staging_jobs.import_staging_job_row is 'The sheet row as it was, keyed "<column letter> · <header>". The record of what was imported — never edited.';
comment on column import_staging_jobs.import_staging_job_spine is 'The generator''s reading of the row for the spine: project number, sequence, address parts, postcode and council looked up, respellings with the original beside them, and skip_reason where it refused.';
comment on column import_staging_jobs.import_staging_job_job_id is 'The job import_spine() made from this row. Null until loaded, and again after unimport_spine(). Null WITH a loaded_at means the job has since been deleted by hand — the FK sets it null and the time stays.';
comment on column import_staging_jobs.import_staging_job_loaded_at is 'When import_spine() made the job. Cleared by unimport_spine(); left standing when the job is deleted any other way.';

alter table import_staging_jobs enable row level security;
drop policy if exists "admins read import staging" on import_staging_jobs;
create policy "admins read import staging" on import_staging_jobs
  for select to authenticated using ((select current_permission()) >= 'admin');
-- No insert, update or delete policy: the rows arrive by migration and leave by nothing.

-- The staging table is source evidence, not a record people change; its 801 rows of 194
-- columns would double in the audit for no reader. Exempt, like the other logs.
create or replace function private.audit_exempt_tables() returns text[]
language sql immutable as $$
  select array['activity_audit', 'login_activity', 'activity_events',
               'property_value_history', 'job_stage_events', 'address_history',
               'notifications', 'notification_deliveries', 'maintenance_message_secrets',
               'import_staging_jobs']
$$;
drop trigger if exists trg_activity_audit_row on import_staging_jobs;

-- ---------------------------------------------------------- the load
create or replace function import_spine(
  p_source        text,
  p_owning_team   text,
  p_stage         text,
  p_project_base  integer default null,
  p_status_map    jsonb   default null,
  p_disambiguate_old_numbers boolean default false
) returns table (projects_made integer, jobs_made integer, rows_skipped integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  sp jsonb;
  wb_project integer; project_no integer; seq text;
  addr uuid; proj_addr uuid;
  old_no text; status text;
  n_projects integer := 0; n_jobs integer := 0; n_skipped integer := 0;
  dups text;
begin
  if p_owning_team is null or p_stage is null then
    raise exception 'import_spine: the owning team and the stage are decisions, not defaults — pass both' using errcode = '22023';
  end if;
  if not exists (select 1 from teams where team_id = p_owning_team) then
    raise exception 'import_spine: % is not a team', p_owning_team using errcode = '23503';
  end if;
  if not exists (select 1 from import_staging_jobs where import_staging_job_source = p_source) then
    raise exception 'import_spine: no staging rows for source %', p_source using errcode = 'P0002';
  end if;
  if exists (select 1 from import_staging_jobs where import_staging_job_source = p_source and import_staging_job_loaded_at is not null) then
    raise exception 'import_spine: source % is already loaded — unimport_spine() first', p_source using errcode = '23505';
  end if;

  -- An old number that several sheet rows share cannot be several jobs' unique key. Either
  -- the caller has agreed the disambiguation rule (append the sheet's lot or residence
  -- label) or the load stops here and names them.
  select string_agg(import_staging_job_number_old || ' ×' || c, ', ' order by import_staging_job_number_old) into dups
    from (select import_staging_job_number_old, count(*) c from import_staging_jobs
           where import_staging_job_source = p_source and import_staging_job_number_old is not null
             and import_staging_job_spine ->> 'skip_reason' is null
           group by 1 having count(*) > 1) d;
  if dups is not null and not p_disambiguate_old_numbers then
    raise exception 'import_spine: old job numbers shared by more than one row: % — pass p_disambiguate_old_numbers => true to append the lot label, or fix the sheet', dups
      using errcode = '23505';
  end if;

  perform set_config('app.sync_origin', 'import', true);

  for r in
    select * from import_staging_jobs
     where import_staging_job_source = p_source
     order by (import_staging_job_spine ->> 'project_number')::integer, (import_staging_job_spine ->> 'job_sequence')::integer, import_staging_job_source_row
  loop
    sp := r.import_staging_job_spine;
    if sp ->> 'skip_reason' is not null then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    wb_project := (sp ->> 'project_number')::integer;
    project_no := case when p_project_base is null then wb_project else p_project_base + (wb_project - 1001) end;

    -- The job's own address, one row per job: the lot on the plan or the residence line.
    insert into addresses (address_lot_number, address_street_number, address_street_1, address_street_2,
                           address_suburb, address_postcode, address_council)
    values (sp ->> 'lot_number', sp ->> 'street_number', sp ->> 'street', sp ->> 'street_2',
            sp ->> 'suburb', sp ->> 'postcode', (sp ->> 'council')::sa_council)
    returning address_id into addr;

    if not exists (select 1 from projects where project_id = project_no) then
      -- The project's address is the site: the street and number without the lot.
      insert into addresses (address_street_number, address_street_1, address_suburb, address_postcode, address_council)
      values (sp ->> 'street_number', sp ->> 'street', sp ->> 'suburb', sp ->> 'postcode', (sp ->> 'council')::sa_council)
      returning address_id into proj_addr;
      insert into projects (project_id, project_type, project_original_address_id, project_current_address_id, project_stage)
      values (project_no, sp ->> 'project_type', proj_addr, proj_addr, p_stage);
      n_projects := n_projects + 1;
    end if;

    -- The sequence follows the sheet's lot order, padded to the app's three digits.
    seq := lpad((sp ->> 'job_sequence')::integer::text, 3, '0');
    old_no := r.import_staging_job_number_old;
    if old_no is not null and p_disambiguate_old_numbers and coalesce((sp ->> 'old_number_shared')::boolean, false) then
      old_no := old_no || ' · ' || coalesce(sp ->> 'lot_label', 'job ' || seq);
      -- The sheet labels two of project 1025's rows "Res 8". When the lot label itself
      -- repeats, the job's own sequence is the only thing left that is certainly unique —
      -- and the staging row still says which "Res 8" this was.
      if exists (select 1 from jobs where job_number_old = old_no) then
        old_no := r.import_staging_job_number_old || ' · job ' || seq;
      end if;
    end if;
    status := coalesce(p_status_map ->> lower(coalesce(sp ->> 'source_stage', '')), 'on_track');

    insert into jobs (project_id, job_sequence, job_number_old, job_original_address_id, job_current_address_id,
                      job_owning_team, job_stage, job_status, job_title_type)
    values (project_no, seq, old_no, addr, addr, p_owning_team, p_stage, status, sp ->> 'title_type');
    n_jobs := n_jobs + 1;

    update import_staging_jobs
       set import_staging_job_loaded_at = now(),
           import_staging_job_job_id = project_no::text || '-' || seq,
           import_staging_job_address_id = addr
     where import_staging_job_id = r.import_staging_job_id;
  end loop;

  perform set_config('app.sync_origin', '', true);
  return query select n_projects, n_jobs, n_skipped;
end $$;

revoke execute on function import_spine(text, text, text, integer, jsonb, boolean) from public, anon, authenticated;
comment on function import_spine(text, text, text, integer, jsonb, boolean) is
  'Phase B (0086): creates the addresses, projects and jobs the staging rows of one source describe, through the ordinary tables and triggers, with activity_audit_origin = import, and stamps each job back onto its row. The owning team, the stage, the numbering base and the status words are parameters because the sheet does not carry them. Not callable from the app.';

-- ---------------------------------------------------------- the way back
create or replace function unimport_spine(p_source text)
returns table (projects_removed integer, jobs_removed integer, addresses_removed integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n_projects integer; n_jobs integer; n_addr integer;
  proj_ids integer[];
begin
  if not exists (select 1 from import_staging_jobs where import_staging_job_source = p_source and import_staging_job_loaded_at is not null) then
    raise exception 'unimport_spine: nothing loaded from source %', p_source using errcode = 'P0002';
  end if;
  perform set_config('app.sync_origin', 'import', true);

  select array_agg(distinct j.project_id) into proj_ids
    from import_staging_jobs s join jobs j on j.job_id = s.import_staging_job_job_id
   where s.import_staging_job_source = p_source;

  -- The jobs first, with everything that hangs off them (tasks, runs, parties: cascade).
  with gone as (
    delete from jobs j using import_staging_jobs s
     where s.import_staging_job_source = p_source and j.job_id = s.import_staging_job_job_id
    returning j.job_id)
  select count(*) into n_jobs from gone;

  -- Then the job addresses the load made.
  with gone as (
    delete from addresses a using import_staging_jobs s
     where s.import_staging_job_source = p_source and a.address_id = s.import_staging_job_address_id
    returning a.address_id)
  select count(*) into n_addr from gone;

  -- Then the projects — but ONLY those the import inserted (the audit says so) and that now
  -- have no jobs. A project somebody made by hand under a colliding number is left standing.
  with mine as (
    select p.project_id, p.project_original_address_id, p.project_current_address_id
      from projects p
     where p.project_id = any (proj_ids)
       and not exists (select 1 from jobs j where j.project_id = p.project_id)
       and exists (select 1 from activity_audit a
                    where a.activity_audit_table = 'projects' and a.activity_audit_operation = 'INSERT'
                      and a.activity_audit_origin = 'import' and a.activity_audit_project_id = p.project_id)
  ), gone as (
    delete from projects p using mine where p.project_id = mine.project_id returning mine.project_original_address_id, mine.project_current_address_id
  ), addr_gone as (
    delete from addresses a where a.address_id in (select project_original_address_id from gone union select project_current_address_id from gone) returning a.address_id
  )
  select (select count(*) from gone), n_addr + (select count(*) from addr_gone) into n_projects, n_addr;

  update import_staging_jobs
     set import_staging_job_loaded_at = null, import_staging_job_job_id = null, import_staging_job_address_id = null
   where import_staging_job_source = p_source;

  perform set_config('app.sync_origin', '', true);
  return query select n_projects, n_jobs, n_addr;
end $$;

revoke execute on function unimport_spine(text) from public, anon, authenticated;
comment on function unimport_spine(text) is
  'Phase B (0086): removes exactly what import_spine() made for a source — its jobs and their children, their addresses, and the projects the audit shows the import inserted and that have no jobs left — and clears the stamps. The staging rows stay for Phase C. Not callable from the app.';

-- ---------------------------------------------------------------------- proof
-- Watched here as the owner, on rows this block plants and removes: the load refuses to run
-- without its decisions, refuses a shared old number until told the rule, makes the spine
-- with the sequence the sheet says (not the order the rows arrive in), logs it as import,
-- and the way back leaves nothing — not even the projects — while a project made by hand
-- under the same number survives.
do $$
declare
  src text := 'probe 0086';
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
  made record; undone record;
  hand_addr uuid; hand_project integer := 1901;
  n integer; s text;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  -- A project somebody made by hand, at the number the second probe project would take.
  insert into addresses (address_street_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('1', 'Hand Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into hand_addr;
  insert into projects (project_id, project_type, project_original_address_id, project_current_address_id)
  values (hand_project, 'residential', hand_addr, hand_addr);

  -- Three rows: one project of two jobs arriving out of lot order, one single-job project
  -- whose number collides with the hand-made one, and one row with no address (skipped).
  insert into import_staging_jobs (import_staging_job_source, import_staging_job_source_row, import_staging_job_number_old, import_staging_job_row, import_staging_job_spine) values
    (src, 1, '1288', '{"A · Project Number": 1900}',
      '{"project_number": 1900, "job_sequence": 2, "project_type": "residential", "street_number": "13", "street": "Probe Road", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "lot_number": "2", "lot_label": "Lot 2", "old_number_shared": true, "source_stage": "On Hold"}'),
    (src, 2, '1288', '{"A · Project Number": 1900}',
      '{"project_number": 1900, "job_sequence": 1, "project_type": "residential", "street_number": "13", "street": "Probe Road", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "lot_number": "1", "lot_label": "Lot 1", "old_number_shared": true}'),
    (src, 3, '1399', '{"A · Project Number": 1901}',
      '{"project_number": 1901, "job_sequence": 1, "project_type": "residential", "street_number": "9", "street": "Probe Avenue", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "street_2": "Res 1", "lot_label": "Res 1"}'),
    (src, 4, null, '{"A · Project Number": 1902}',
      '{"project_number": 1902, "job_sequence": 1, "skip_reason": "no site address in the source"}');

  -- No decisions, no load.
  begin
    perform import_spine(src, null, null);
    raise exception '0086 proof: the load ran without an owning team or a stage';
  exception when sqlstate '22023' then null; end;
  -- A shared old number stops the load until the rule is agreed.
  begin
    perform import_spine(src, 'pre_construction_admin', 'Pre-construction');
    raise exception '0086 proof: the load ran over a shared old number without the rule';
  exception when unique_violation then
    if sqlerrm not like '%1288 ×2%' then raise; end if;
  end;

  select * into made from import_spine(src, 'pre_construction_admin', 'Pre-construction', null, '{"on hold": "on_hold"}'::jsonb, true);
  if made.projects_made <> 1 or made.jobs_made <> 3 or made.rows_skipped <> 1 then
    raise exception '0086 proof: expected 1 project, 3 jobs, 1 skipped; got % % %', made.projects_made, made.jobs_made, made.rows_skipped;
  end if;
  -- Lot order, not arrival order: sheet row 2 is Lot 1 and became -001.
  select import_staging_job_job_id into s from import_staging_jobs where import_staging_job_source = src and import_staging_job_source_row = 2;
  if s <> '1900-001' then raise exception '0086 proof: Lot 1 became %, expected 1900-001', s; end if;
  if (select job_number_old from jobs where job_id = '1900-001') <> '1288 · Lot 1' then
    raise exception '0086 proof: the shared old number was not disambiguated with the lot label';
  end if;
  if (select job_status from jobs where job_id = '1900-002') <> 'on_hold' then
    raise exception '0086 proof: "On Hold" did not map to on_hold through p_status_map';
  end if;
  -- The colliding project was reused, not recreated: 1901 is still the hand-made one.
  if (select address_street_1 from addresses a join projects p on p.project_current_address_id = a.address_id where p.project_id = hand_project) <> 'Hand Street' then
    raise exception '0086 proof: the import overwrote the hand-made project 1901';
  end if;
  if (select address_consolidated from addresses a join jobs j on j.job_current_address_id = a.address_id where j.job_id = '1901-001') not like 'Res 1, 9 Probe Avenue, Golden Grove SA 5125%' then
    raise exception '0086 proof: the residence line did not land as the address''s second line';
  end if;
  -- Logged as import.
  select count(*) into n from activity_audit where activity_audit_table = 'jobs' and activity_audit_operation = 'INSERT'
     and activity_audit_origin = 'import' and activity_audit_project_id in (1900, 1901);
  if n <> 3 then raise exception '0086 proof: expected 3 job inserts logged with origin import, found %', n; end if;
  -- Loading twice is refused.
  begin
    perform import_spine(src, 'pre_construction_admin', 'Pre-construction', null, null, true);
    raise exception '0086 proof: the same source loaded twice';
  exception when unique_violation then null; end;

  -- The way back: the import's project goes, the hand-made one stays.
  select * into undone from unimport_spine(src);
  if undone.jobs_removed <> 3 or undone.projects_removed <> 1 then
    raise exception '0086 proof: unimport removed % jobs and % projects, expected 3 and 1', undone.jobs_removed, undone.projects_removed;
  end if;
  if exists (select 1 from projects where project_id = 1900) then raise exception '0086 proof: project 1900 survived unimport'; end if;
  if not exists (select 1 from projects where project_id = hand_project) then raise exception '0086 proof: unimport took the hand-made project 1901'; end if;
  if exists (select 1 from import_staging_jobs where import_staging_job_source = src and import_staging_job_job_id is not null) then
    raise exception '0086 proof: a staging row kept its stamp after unimport';
  end if;
  if exists (select 1 from addresses where address_street_1 in ('Probe Road', 'Probe Avenue')) then
    raise exception '0086 proof: an imported address survived unimport';
  end if;

  -- Left as found.
  delete from import_staging_jobs where import_staging_job_source = src;
  delete from projects where project_id = hand_project;
  delete from addresses where address_id = hand_addr;
  delete from activity_audit where activity_audit_project_id in (1900, 1901, 1902)
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_street_1' in ('Hand Street', 'Probe Road', 'Probe Avenue'));
  perform setval(seq, seq_last, seq_called);
end $$;
