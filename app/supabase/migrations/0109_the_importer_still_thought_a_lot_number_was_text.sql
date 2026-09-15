-- =============================================================================
-- 0109 — the importer still thought a lot number was text
-- =============================================================================
-- `0106` made `addresses.address_lot_number` an integer. `import_spine()` — the Phase B
-- loader, 0086 and 0088 — inserts the lot straight out of the staged spine JSON:
--
--     values (sp ->> 'lot_number', …)
--
-- and `->>` returns text. Postgres does not implicitly cast text to integer in an
-- INSERT, so from 0106 onwards the loader could not insert a single row:
--
--     ERROR: column "address_lot_number" is of type integer but expression is of type text
--     CONTEXT: PL/pgSQL function import_spine(...) line 56 at SQL statement
--
-- FOUND BY `verify/check.sh`, NOT BY READING. Step 44 of `behaviour.sql` loads the whole
-- staged workbook — 796 jobs across 116 projects — and it is the thing that failed. The
-- migration set replayed cleanly on its own; a schema that applies is not a schema that
-- works, which is the entire reason that file exists.
--
-- WHAT IS AND IS NOT AT STAKE. **No data is affected and no load was pending.** Amber
-- closed the import on 7 September — *"i don't need any jobs imported from spreadsheets.
-- all jobs that need to be created from now on will be created from the projects in the
-- app"* — and said what happens to the machinery: *"everything that is in supabase now
-- is correct. If I need to import other areas I will let you know as properties may
-- change"*. So the staging table, its 801 rows and these functions stay applied and
-- INERT. This fixes an inert function rather than unblocking a load.
--
-- It is still worth its own migration for two reasons. A function that contradicts its
-- own table is a trap set for whoever calls it next — and "if I need to import other
-- areas I will let you know" is exactly that call. And the verify suite exercises it on
-- every run, so leaving it broken means leaving `check.sh` red, which is the check that
-- found this in the first place.
--
-- WHAT THIS CHANGES: one expression.
--
--     (sp ->> 'lot_number')                ->    nullif(trim(sp ->> 'lot_number'), '')::integer
--
-- `nullif(trim(…), '')` because a blank cell in a spreadsheet arrives as "" and "" is
-- not a lot number; an empty string cast to integer is an error rather than a null, and
-- that error would be about the wrong thing. Anything else non-numeric still FAILS the
-- load loudly, which is correct: all 181 staged lot numbers are digits today —
--
--     select count(*) filter (where spine->>'lot_number' ~ '^\d+$') from import_staging_jobs
--       ->  181 of 181
--
-- — so a workbook that disagrees with Amber's "a lot number is only a number" is news,
-- not something to coalesce away.
--
-- The rest of the function is `0088`'s, unchanged and re-stated in full because that is
-- what `create or replace function` requires. Diffing this against 0088 should show the
-- one line.
-- =============================================================================

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
    values (project_no, seq, old_no, addr, addr, team, stage, status, sp ->> 'title_type');
    n_jobs := n_jobs + 1;

    update import_staging_jobs
       set import_staging_job_loaded_at = now(),
           import_staging_job_job_id = project_no::text || '-' || seq,
           import_staging_job_address_id = addr
     where import_staging_job_id = r.import_staging_job_id;
  end loop;

  perform set_config('app.sync_origin', '', true);
  return query select n_projects, n_jobs, n_skipped, n_cancelled, n_people;
end $$;

revoke execute on function import_spine(text, text, text, integer, jsonb, jsonb, text, text) from public, anon, authenticated;

comment on function import_spine(text, text, text, integer, jsonb, jsonb, text, text) is
  'Loads a staged source into projects, jobs and addresses. 0088''s function; 0109 casts '
  'the lot number, which has been an integer on addresses since 0106 — before that cast '
  'the loader could not insert a single row. Not grantable to the API roles.';

-- =============================================================================
-- Prove it, on a source of its own, rolled back.
--
-- WATCHED FAILING BEFORE TRUSTED: `verify/check.sh` step 44 is where the fault surfaced
-- in the first place, on the real 801-row workbook. This probe was then run with the
-- cast removed again and raises at the insert with the same 42804, so it catches the
-- thing it claims to.
-- =============================================================================
do $$
declare
  src  text := '__0109_probe__';
  made record;
  lot  integer;
  line text;
begin
  begin
    insert into import_staging_jobs (import_staging_job_source, import_staging_job_source_row,
                                     import_staging_job_number_old, import_staging_job_row,
                                     import_staging_job_spine)
    values
      -- A lot number as the sheet gives it: a string of digits.
      (src, 1, '9101', '{"A · Project Number": 1990}',
        '{"project_number": 1990, "job_sequence": 1, "project_type": "residential", "street_number": "13", "street": "Cast Road", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "lot_number": "7", "lot_label": "Lot 7"}'),
      -- And a blank one, which is what an empty spreadsheet cell becomes. It must be a
      -- null lot, not an error, and not a zero.
      (src, 2, '9102', '{"A · Project Number": 1990}',
        '{"project_number": 1990, "job_sequence": 2, "project_type": "residential", "street_number": "13", "street": "Cast Road", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "lot_number": ""}');

    select * into made from import_spine(src, 'pre_construction_admin', 'Pre-construction');
    if made.jobs_made <> 2 then
      raise exception '0109: expected 2 jobs, got %', made.jobs_made;
    end if;

    select a.address_lot_number, a.address_consolidated into lot, line
      from jobs j join addresses a on a.address_id = j.job_current_address_id
     where j.job_id = '1990-001';
    if lot is distinct from 7 then
      raise exception '0109: the lot number landed as % rather than 7', coalesce(lot::text, '(null)');
    end if;
    if line not like 'Lot 7, 13 Cast Road,%' then
      raise exception '0109: the address reads "%"', line;
    end if;

    select a.address_lot_number into lot
      from jobs j join addresses a on a.address_id = j.job_current_address_id
     where j.job_id = '1990-002';
    if lot is not null then
      raise exception '0109: a blank lot number became %, not null', lot;
    end if;

    raise exception 'undo_probe';
  exception when others then
    if sqlerrm <> 'undo_probe' then raise; end if;
  end;

  raise notice '0109: the importer casts the lot number, and a blank one stays blank.';
end $$;
