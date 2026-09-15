-- 0122 — THE IMPORTER ASKS THE DATABASE WHAT IT JUST NAMED THE JOB
--
-- WHAT IS BROKEN, AND IT IS BROKEN ON `main` RIGHT NOW
--
--   `app/supabase/verify/check.sh` fails on `main`:
--
--       ERROR: insert or update on table "import_staging_jobs" violates foreign key
--              constraint "import_staging_jobs_import_staging_job_job_id_fkey"
--
--   It is not a check being fussy. **The whole workbook load falls over** — 796 jobs
--   across 116 projects, which is Phase B, which is the import Lofty is waiting on.
--
-- HOW IT GOT THERE
--
--   `0120` (the community-title one) made `job_number()` the single source of a job's id
--   and taught `jobs_set_job_id` to call it, so a community-title job is `1004-003c` and a
--   torrens one is `1004-003`. That was right.
--
--   `import_spine` never got the message. It inserts the job — the trigger names it
--   `1004-003c` — and then, three lines later, writes the id it *expected* into the
--   staging row:
--
--       import_staging_job_job_id = project_no::text || '-' || seq
--
--   `1004-003`. That column has a foreign key to `jobs`, and there is no such job. Nine
--   community-title jobs in the live workbook, and the load stops at the first one.
--
-- THE FIX IS NOT THE ONE FIRST PROPOSED, AND THE DIFFERENCE MATTERS
--
--   The obvious repair is to call `job_number(project_no, seq, sp ->> 'title_type')` here
--   too. That works today and rebuilds the same failure the next time the rule changes:
--   it is still a SECOND place computing a job's name, agreeing with the first only as
--   long as somebody keeps them in step. That is what went wrong in the first place.
--
--   So the importer stops computing the id at all and asks for it:
--
--       insert into jobs (…) values (…) returning job_id into made_job;
--
--   The trigger is the one authority on what a job is called, and now there is no second
--   opinion to disagree with it. A future suffix, a changed padding, a rule nobody has
--   thought of yet — the importer follows without being touched.
--
--   NOTHING ELSE IN THE FUNCTION CHANGES. The body below is `0109`'s, verbatim, with one
--   declared variable, `returning job_id into made_job` on the insert, and `made_job` in
--   the update. Rewriting more of it while fixing a broken import would be the wrong kind
--   of brave.

create or replace function import_spine(
  p_source              text,
  p_owning_team         text,
  p_stage               text,
  p_project_base        integer default null,
  p_status_map          jsonb   default null,
  p_stage_map           jsonb   default null,
  p_person_key          text    default null,
  p_shared_old_numbers  text    default 'refuse'
) returns table (projects_made integer, jobs_made integer, rows_skipped integer, jobs_cancelled integer, teams_from_people integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  sp jsonb;
  wb_project integer; project_no integer; seq text;
  -- 0122: the id the INSERT actually produced, rather than one rebuilt by hand.
  made_job text;
  addr uuid; proj_addr uuid;
  old_no text; status text; stage text; team text; person text;
  n_projects integer := 0; n_jobs integer := 0; n_skipped integer := 0; n_cancelled integer := 0; n_people integer := 0;
  dups text;
begin
  if p_owning_team is null or p_stage is null then
    raise exception 'import_spine: the owning team and the stage are decisions, not defaults — pass both' using errcode = '22023';
  end if;
  if not exists (select 1 from teams where team_id = p_owning_team) then
    raise exception 'import_spine: % is not a team', p_owning_team using errcode = '23503';
  end if;
  if p_shared_old_numbers not in ('refuse', 'label', 'omit') then
    raise exception 'import_spine: p_shared_old_numbers is refuse, label or omit — not %', p_shared_old_numbers using errcode = '22023';
  end if;
  if not exists (select 1 from import_staging_jobs where import_staging_job_source = p_source) then
    raise exception 'import_spine: no staging rows for source %', p_source using errcode = 'P0002';
  end if;
  if exists (select 1 from import_staging_jobs where import_staging_job_source = p_source and import_staging_job_loaded_at is not null) then
    raise exception 'import_spine: source % is already loaded — unimport_spine() first', p_source using errcode = '23505';
  end if;

  -- An old number that several sheet rows share cannot be several jobs' unique key. The
  -- caller says what to do about it — or the load stops here and names them.
  select string_agg(import_staging_job_number_old || ' ×' || c, ', ' order by import_staging_job_number_old) into dups
    from (select import_staging_job_number_old, count(*) c from import_staging_jobs
           where import_staging_job_source = p_source and import_staging_job_number_old is not null
             and import_staging_job_spine ->> 'skip_reason' is null
           group by 1 having count(*) > 1) d;
  if dups is not null and p_shared_old_numbers = 'refuse' then
    raise exception 'import_spine: old job numbers shared by more than one row: % — pass p_shared_old_numbers => ''label'' to append the lot label, ''omit'' to carry none, or fix the sheet', dups
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
    --
    -- THE ONE CHANGED LINE (0109): the lot number is cast. `address_lot_number` has been
    -- an integer since 0106 and `->>` hands back text, which no INSERT will coerce on
    -- its own. Blank becomes null; anything else non-numeric raises, and should.
    insert into addresses (address_lot_number, address_street_number, address_street_1, address_street_2,
                           address_suburb, address_postcode, address_council)
    values (nullif(trim(sp ->> 'lot_number'), '')::integer, sp ->> 'street_number', sp ->> 'street', sp ->> 'street_2',
            sp ->> 'suburb', sp ->> 'postcode', (sp ->> 'council')::sa_council)
    returning address_id into addr;

    if not exists (select 1 from projects where project_id = project_no) then
      -- The project's address is the site: the street and number without the lot. The
      -- project starts in the caller's stage; 0041's trigger moves it up if its live jobs
      -- are ahead, and a project whose every job is cancelled simply stays where it began.
      insert into addresses (address_street_number, address_street_1, address_suburb, address_postcode, address_council)
      values (sp ->> 'street_number', sp ->> 'street', sp ->> 'suburb', sp ->> 'postcode', (sp ->> 'council')::sa_council)
      returning address_id into proj_addr;
      insert into projects (project_id, project_type, project_original_address_id, project_current_address_id, project_stage)
      values (project_no, sp ->> 'project_type', proj_addr, proj_addr, p_stage);
      n_projects := n_projects + 1;
    end if;

    -- The sequence follows the sheet's lot order, padded to the app's three digits.
    seq := lpad((sp ->> 'job_sequence')::integer::text, 3, '0');

    -- The old number: as the sheet has it, unless several rows share it.
    old_no := r.import_staging_job_number_old;
    if old_no is not null and coalesce((sp ->> 'old_number_shared')::boolean, false) then
      if p_shared_old_numbers = 'omit' then
        old_no := null;
      else
        old_no := old_no || ' · ' || coalesce(sp ->> 'lot_label', 'job ' || seq);
        -- The sheet labels two of project 1025's rows "Res 8". When the lot label itself
        -- repeats, the job's own sequence is the only thing left that is certainly unique.
        if exists (select 1 from jobs where job_number_old = old_no) then
          old_no := r.import_staging_job_number_old || ' · job ' || seq;
        end if;
      end if;
    end if;

    -- The status word: a job status through one map, a stage through the other.
    status := coalesce(p_status_map ->> lower(coalesce(sp ->> 'source_stage', '')), 'on_track');
    stage  := coalesce(p_stage_map  ->> lower(coalesce(sp ->> 'source_stage', '')), p_stage);
    if stage = 'Cancelled' then n_cancelled := n_cancelled + 1; end if;

    -- The team: the named person's, when they are a user in one team; else the caller's.
    person := case when p_person_key is null then null else r.import_staging_job_row ->> p_person_key end;
    team := private.import_team_for_person(person, p_owning_team);
    if team <> p_owning_team then n_people := n_people + 1; end if;

    insert into jobs (project_id, job_sequence, job_number_old, job_original_address_id, job_current_address_id,
                      job_owning_team, job_stage, job_status, job_title_type)
    values (project_no, seq, old_no, addr, addr, team, stage, status, sp ->> 'title_type')
    returning job_id into made_job;
    n_jobs := n_jobs + 1;

    update import_staging_jobs
       set import_staging_job_loaded_at = now(),
           import_staging_job_job_id = made_job,
           import_staging_job_address_id = addr
     where import_staging_job_id = r.import_staging_job_id;
  end loop;

  perform set_config('app.sync_origin', '', true);
  return query select n_projects, n_jobs, n_skipped, n_cancelled, n_people;
end $$;
comment on function import_spine(text, text, text, integer, jsonb, jsonb, text, text) is
  'Loads the staged workbook into projects and jobs (0086, decisions in 0088, types in 0109, and since 0122 it reads the job id back off the insert rather than rebuilding it). The rebuild broke the moment 0120 gave community-title jobs a trailing c: the importer wrote 1004-003 into a staging column whose foreign key points at a job actually called 1004-003c, and the whole 796-job load stopped at the first one.';

-- ====================== and the delete rule 0120 changed without meaning to
--
-- FOUND BECAUSE THE FIX ABOVE UNMASKED IT. `check.sh` used to abort at the workbook load, so
-- every assertion after line 988 had not run in days. With the import working again, the next
-- one along failed: *FAIL: 1 documents survived their job*.
--
-- `0094` created the reference as `on delete cascade` — a progress report or a client letter
-- about a job that no longer exists is about nothing, and `behaviour.sql` says so in those
-- words. `0120` needed to add `on update cascade` so a job renamed to `1004-003c` carried its
-- documents along, and rebuilt the constraint to get it:
--
--     foreign key (job_id) references jobs (job_id) on update cascade on delete set null
--
-- The update half was the point and is right. **The delete half changed at the same time and
-- nobody said so** — not in the migration's header, not in its comment, not in the changelog.
-- Its four siblings on `jobs` (`comments`, `document_links`, `tasks`, `variations`) are all
-- still `on delete cascade`; this one alone became the odd one out.
--
-- Restored, keeping the update cascade `0120` correctly added. The effect of leaving it: a
-- deleted job would strand its documents in the library, attached to nothing, visible to
-- nobody looking for them and impossible to find by the job they were about.
alter table report_documents
  drop constraint if exists report_documents_job_id_fkey;
alter table report_documents
  add constraint report_documents_job_id_fkey
  foreign key (job_id) references jobs (job_id) on update cascade on delete cascade;

-- ==================================================================== proof
--
-- A COMMUNITY-TITLE JOB IS THE WHOLE POINT. A torrens job passes either way — the hand-built
-- id and the real one agree — which is exactly why this went unnoticed until a check that
-- loads the real workbook ran. So the fixture is one of each, and the torrens row is there to
-- prove the fix did not break the case that already worked.
do $$
declare
  addr uuid; proj integer;
  -- bigint, not uuid. `import_staging_jobs` keys on a bigint, and the first draft of this
  -- block declared these as uuid and failed with *invalid input syntax for type uuid: "811"*.
  -- The same slip 0121 made on activity_event_id: not every id in this schema is a uuid, and
  -- the declaration is where that assumption gets caught.
  staged_c bigint; staged_t bigint;
  made record; got_c text; got_t text;
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values (122, 'Probe Street 0122', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into addr;

  -- Two staging rows on one project: lot 1 community title, lot 2 torrens.
  insert into import_staging_jobs (import_staging_job_source, import_staging_job_source_row,
                                   import_staging_job_row, import_staging_job_spine)
  values ('0122 probe', 1, '{}'::jsonb,
          jsonb_build_object('project_number', 9122, 'job_sequence', 1, 'title_type', 'community',
                             'street', 'Probe Street 0122', 'suburb', 'Golden Grove', 'project_type', 'residential',
                             'postcode', '5125', 'council', 'City of Tea Tree Gully', 'lot_number', 1))
  returning import_staging_job_id into staged_c;

  insert into import_staging_jobs (import_staging_job_source, import_staging_job_source_row,
                                   import_staging_job_row, import_staging_job_spine)
  values ('0122 probe', 2, '{}'::jsonb,
          jsonb_build_object('project_number', 9122, 'job_sequence', 2, 'title_type', 'torrens',
                             'street', 'Probe Street 0122', 'suburb', 'Golden Grove', 'project_type', 'residential',
                             'postcode', '5125', 'council', 'City of Tea Tree Gully', 'lot_number', 2))
  returning import_staging_job_id into staged_t;

  -- THE LOAD. Before 0122 this raised the foreign key violation and never returned.
  select * into made from import_spine('0122 probe', 'construction', 'Construction', 9122,
                                       '{}'::jsonb, '{}'::jsonb, null, 'omit');

  if made.jobs_made <> 2 then
    raise exception '0122 proof: the load made % jobs, expected 2', made.jobs_made;
  end if;

  select import_staging_job_job_id into got_c from import_staging_jobs where import_staging_job_id = staged_c;
  select import_staging_job_job_id into got_t from import_staging_jobs where import_staging_job_id = staged_t;

  -- 1. THE FOREIGN KEY ITSELF. The staging row must name a job that exists — that is the
  --    constraint the bug violated, and asserting it directly means this cannot be fooled by
  --    however the project happened to be numbered. (The 9122 above is a numbering BASE, not
  --    a project number: the first draft of this block looked up `project_id = 9122`, found
  --    nothing, and reported a <NULL> job. The assertion was wrong, not the fix.)
  if not exists (select 1 from jobs where job_id = got_c) then
    raise exception '0122 proof: the community-title staging row says %, and no such job exists', got_c;
  end if;
  if not exists (select 1 from jobs where job_id = got_t) then
    raise exception '0122 proof: the torrens staging row says %, and no such job exists', got_t;
  end if;

  -- 2. And it really did take the c, so this is not passing because the suffix quietly
  --    stopped being applied — which would make both sides agree on the wrong thing.
  if got_c not like '%c' then
    raise exception '0122 proof: the community-title job is called % — 0120 is not doing its job', got_c;
  end if;

  -- 3. The torrens case, which worked before the fix, still works and gains no suffix.
  if got_t like '%c' then
    raise exception '0122 proof: the torrens job took a c: %', got_t;
  end if;

  raise notice '0122 proof: the staging rows point at % and %, which are the jobs that exist.', got_c, got_t;

  -- The fixtures go. The project id is read back off a job rather than assumed, for the same
  -- reason the assertions above stopped assuming it.
  select j.project_id into proj from jobs j where j.job_id = got_c;
  delete from import_staging_jobs where import_staging_job_source = '0122 probe';
  delete from jobs where project_id = proj;
  delete from projects where project_id = proj;
  delete from addresses where address_id = addr;
  execute format('select setval(%L, %s, %L)', seq, seq_last, seq_called);
end
$$;
