-- =============================================================================
-- 0088 — the import takes Amber's decisions
-- =============================================================================
-- 0086 built import_spine() to refuse to run without four decisions, and named them in
-- schema-plan.md under "What the load will not decide". Amber decided, 2–3 September, in
-- these words:
--
--   "project numbers can start at whatever you recommend. job numbers number be three
--    digits. people are users and users are in teams. if in doubt ask a question.
--    cancelling moves to lifecycle stage cancelled and onhold or in doubt leave in
--    aqueiosint and development. ignore the seven old job numbers"
--
--   "all jobs imported should just be aquistion and development if in doubt.
--    ignore ben.. if he isn't in the app assign to aquisitions and development"
--
-- WHAT THAT MEANS FOR THE LOAD
--
--   Owning team   "people are users and users are in teams": the sheet names a sales
--                 consultant on 587 of the 796 rows (Brenton G, Mitch G, Paul, Gary P,
--                 Olivia, Michael B). When that person is a user of the app in exactly one
--                 team, the job belongs to that team. Anyone not in the app, anyone in
--                 several teams, and the 209 rows naming nobody: Acquisition & Development.
--                 The lookup is by first name and surname initial, because that is what
--                 the sheet holds; two users sharing both is "in doubt", so the fallback.
--   Stage         Acquisition & Development for every job — except a row whose status word
--                 is "cancelling", which lands in Cancelled. On Hold and In Doubt stay in
--                 A&D; the word is kept as the job's status (on_hold) or left on the row.
--   Old numbers   "ignore the seven old job numbers": a shared old number is not carried
--                 onto any job. The staging row still holds it, so nothing is lost.
--   Numbering     start at 1011 and keep the nine hand-made projects (the caller's
--                 p_project_base; recorded here, decided in the call).
--
-- WHAT CHANGES
--
--   import_spine() gains three parameters and loses one:
--     p_stage_map           jsonb  source status word → job_stage  ({"cancelling": "Cancelled"})
--     p_person_key          text   the header of the sheet column naming the person
--     p_shared_old_numbers  text   'refuse' (stop and name them — the default, as 0086),
--                                  'label' (0086's lot-label rule), 'omit' (carry none)
--   p_disambiguate_old_numbers is gone: it was one of the three answers, spelt as a boolean.
--   The result gains jobs_cancelled and teams_from_people, so the load reports what the
--   decisions did to the rows, not only how many rows there were.
--
--   private.import_team_for_person(name, fallback) is the lookup, on its own so the verify
--   suite can call it with names and see what it answers.
--
-- Nothing in 0086 or 0087 is applied live yet, so this could have been an edit to 0086.
-- It is not, because 0086 is on main and its proof block is the record of what the first
-- version refused; this file is the record of what Amber decided. Both stay readable.
-- =============================================================================

-- ------------------------------------------------------ who owns a job the sheet names
create or replace function private.import_team_for_person(p_name text, p_fallback text)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cleaned text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  first_name text; initial text;
  n_people integer; n_teams integer; the_team text;
begin
  if cleaned = '' then return p_fallback; end if;
  first_name := lower(split_part(cleaned, ' ', 1));
  initial    := lower(left(split_part(cleaned, ' ', 2), 1));

  -- The people the sheet could mean: same first name, and the same surname initial when
  -- the sheet gave one. Inactive accounts are not "in the app".
  with people as (
    select p.profile_id
      from profiles p
     where p.profile_is_active
       and lower(split_part(p.profile_full_name, ' ', 1)) = first_name
       and (initial = '' or lower(left(split_part(p.profile_full_name, ' ', 2), 1)) = initial)
  )
  select count(distinct pe.profile_id), count(distinct pt.team_id), min(pt.team_id)
    into n_people, n_teams, the_team
    from people pe left join profile_teams pt on pt.profile_id = pe.profile_id;

  -- Exactly one person, in exactly one team. Anything else is "in doubt".
  if n_people = 1 and n_teams = 1 then return the_team; end if;
  return p_fallback;
end $$;
revoke execute on function private.import_team_for_person(text, text) from public, anon, authenticated;
comment on function private.import_team_for_person(text, text) is
  'The import''s owning-team rule (0088, Amber: "people are users and users are in teams… if in doubt A&D"). A first name and optional surname initial, as the sheet writes them; the team of the one active user it matches when that user is in exactly one team; otherwise the fallback the caller passes.';

-- ------------------------------------------------------ the load, with the decisions in
drop function if exists import_spine(text, text, text, integer, jsonb, boolean);

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
    insert into addresses (address_lot_number, address_street_number, address_street_1, address_street_2,
                           address_suburb, address_postcode, address_council)
    values (sp ->> 'lot_number', sp ->> 'street_number', sp ->> 'street', sp ->> 'street_2',
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
  'Builds projects, jobs and addresses from one staged source (0086, decisions in 0088). The team is the named person''s when they are a user in one team, else p_owning_team; the stage is p_stage unless p_stage_map says otherwise for the row''s status word; a shared old number is refused, labelled with the lot, or omitted as p_shared_old_numbers says. Logged with origin import; unimport_spine() takes it back out. Service role only.';

-- ---------------------------------------------------------------------- proof
-- Watched here as the owner, on rows this block plants and removes: the default still
-- refuses a shared old number; a bad mode word is refused; Paul's job goes to his team,
-- a stranger's and a several-team user's go to the fallback; "Cancelling" lands in
-- Cancelled with the cancelled status while "In Doubt" stays put; the shared old number is
-- carried by no job; the way back is clean.
do $$
declare
  src text := 'probe 0088';
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
  made record; undone record;
  paul_team text;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  -- The rule on its own, before any row is touched.
  select pt.team_id into paul_team from profiles p join profile_teams pt using (profile_id) where p.profile_full_name = 'Paul Ferka';
  if paul_team is null then raise exception '0088 proof: Paul Ferka is not seeded in one team — the proof needs him'; end if;
  if private.import_team_for_person('Paul', 'acquisition_development') <> paul_team then
    raise exception '0088 proof: "Paul" did not resolve to Paul Ferka''s team %', paul_team;
  end if;
  if private.import_team_for_person('paul ferka', 'acquisition_development') <> paul_team then
    raise exception '0088 proof: a full lowercase name did not resolve';
  end if;
  if private.import_team_for_person('Michael B', 'acquisition_development') <> 'acquisition_development' then
    raise exception '0088 proof: a name not in the app did not fall back';
  end if;
  if private.import_team_for_person(null, 'acquisition_development') <> 'acquisition_development'
     or private.import_team_for_person('  ', 'acquisition_development') <> 'acquisition_development' then
    raise exception '0088 proof: an empty name did not fall back';
  end if;

  insert into import_staging_jobs (import_staging_job_source, import_staging_job_source_row, import_staging_job_number_old, import_staging_job_row, import_staging_job_spine) values
    (src, 1, '1288', '{"A · Project Number": 1950, "S · Sales Consultant": "Paul"}',
      '{"project_number": 1950, "job_sequence": 1, "project_type": "residential", "street_number": "13", "street": "Probe Road", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "lot_number": "1", "lot_label": "Lot 1", "old_number_shared": true}'),
    (src, 2, '1288', '{"A · Project Number": 1950, "S · Sales Consultant": "Nobody X"}',
      '{"project_number": 1950, "job_sequence": 2, "project_type": "residential", "street_number": "13", "street": "Probe Road", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "lot_number": "2", "lot_label": "Lot 2", "old_number_shared": true, "source_stage": "Cancelling"}'),
    (src, 3, '1399', '{"A · Project Number": 1951, "S · Sales Consultant": "Olivia"}',
      '{"project_number": 1951, "job_sequence": 1, "project_type": "residential", "street_number": "9", "street": "Probe Avenue", "suburb": "Golden Grove", "postcode": "5125", "council": "City of Tea Tree Gully", "street_2": "Res 1", "lot_label": "Res 1", "source_stage": "In Doubt"}');

  -- The default still stops on a shared old number; a made-up mode word is refused.
  begin
    perform import_spine(src, 'acquisition_development', 'Acquisition & Development');
    raise exception '0088 proof: the load ran over a shared old number by default';
  exception when unique_violation then
    if sqlerrm not like '%1288 ×2%' then raise; end if;
  end;
  begin
    perform import_spine(src, 'acquisition_development', 'Acquisition & Development', null, null, null, null, 'ignore');
    raise exception '0088 proof: an unknown p_shared_old_numbers word was accepted';
  exception when sqlstate '22023' then null; end;

  select * into made from import_spine(src, 'acquisition_development', 'Acquisition & Development', null,
    '{"cancelling": "cancelled", "on hold": "on_hold"}'::jsonb, '{"cancelling": "Cancelled"}'::jsonb, 'S · Sales Consultant', 'omit');
  if made.projects_made <> 2 or made.jobs_made <> 3 or made.rows_skipped <> 0 then
    raise exception '0088 proof: expected 2 projects, 3 jobs, 0 skipped; got % % %', made.projects_made, made.jobs_made, made.rows_skipped;
  end if;
  if made.jobs_cancelled <> 1 then raise exception '0088 proof: % jobs cancelled, expected 1', made.jobs_cancelled; end if;
  if made.teams_from_people <> 1 then raise exception '0088 proof: % teams from people, expected 1 (Paul)', made.teams_from_people; end if;

  -- Paul's job is his team's; the stranger's and Olivia's are the fallback. (Olivia is in
  -- one team on the replay and three on the live database — the answer is the same
  -- because the fallback is her one team, which is the point of the rule.)
  if (select job_owning_team from jobs where job_id = '1950-001') <> paul_team then
    raise exception '0088 proof: 1950-001 is owned by % not %', (select job_owning_team from jobs where job_id = '1950-001'), paul_team;
  end if;
  if (select job_owning_team from jobs where job_id = '1950-002') <> 'acquisition_development'
     or (select job_owning_team from jobs where job_id = '1951-001') <> 'acquisition_development' then
    raise exception '0088 proof: a job named to nobody in the app did not fall back to Acquisition & Development';
  end if;
  -- Cancelling → Cancelled + cancelled; In Doubt → stays in A&D, on track.
  if (select job_stage || '/' || job_status from jobs where job_id = '1950-002') <> 'Cancelled/cancelled' then
    raise exception '0088 proof: "Cancelling" landed as %', (select job_stage || '/' || job_status from jobs where job_id = '1950-002');
  end if;
  if (select job_stage || '/' || job_status from jobs where job_id = '1951-001') <> 'Acquisition & Development/on_track' then
    raise exception '0088 proof: "In Doubt" landed as %', (select job_stage || '/' || job_status from jobs where job_id = '1951-001');
  end if;
  -- The project with one live job stays in A&D (cancelled jobs are out of the race, 0045).
  if (select project_stage from projects where project_id = 1950) <> 'Acquisition & Development' then
    raise exception '0088 proof: project 1950 moved to %', (select project_stage from projects where project_id = 1950);
  end if;
  -- The shared old number is on no job; the unshared one is carried; the staging rows keep both.
  if exists (select 1 from jobs where job_id in ('1950-001', '1950-002') and job_number_old is not null) then
    raise exception '0088 proof: a shared old number was carried onto a job under omit';
  end if;
  if (select job_number_old from jobs where job_id = '1951-001') <> '1399' then
    raise exception '0088 proof: the unshared old number 1399 was not carried';
  end if;
  if (select count(*) from import_staging_jobs where import_staging_job_source = src and import_staging_job_number_old = '1288') <> 2 then
    raise exception '0088 proof: the staging rows lost their old number';
  end if;

  -- The way back.
  select * into undone from unimport_spine(src);
  if undone.jobs_removed <> 3 or undone.projects_removed <> 2 then
    raise exception '0088 proof: unimport removed % jobs and % projects, expected 3 and 2', undone.jobs_removed, undone.projects_removed;
  end if;
  if exists (select 1 from projects where project_id in (1950, 1951)) then raise exception '0088 proof: a probe project survived unimport'; end if;

  -- Left as found.
  delete from import_staging_jobs where import_staging_job_source = src;
  delete from activity_audit where activity_audit_project_id in (1950, 1951);
  delete from activity_audit where activity_audit_table = 'addresses'
     and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_street_1' in ('Probe Road', 'Probe Avenue');
  perform setval(seq, seq_last, seq_called);
end $$;
