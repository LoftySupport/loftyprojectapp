-- =============================================================================
-- 0040 — a project has a SharePoint folder, and each job has a subfolder in it
-- =============================================================================
-- Lofty, 25 August:
--
--   "a project has a sharepoint folder. a job has a subfolder in that project sharepoint
--    folder. so a project with 3 jobs will have 4 links in total (project folder, 3 job
--    folders that are linked to it). jobs will also display project folder on their job
--    details/record page as well as their own job folder. they will not show other
--    related job folders."
--
-- TWO COLUMNS, NOT A TABLE
--
--   The counting in that sentence is the tell: four links for a project with three jobs
--   is exactly one per record. A `documents`-style table would model many folders per
--   record and none of the four is a second folder for anything. So the link lives on the
--   record it belongs to, and the "4 links" a project shows is its own plus its jobs' —
--   a join that already exists, not a stored list.
--
--   A job showing its project's folder is the same join read the other way, which is why
--   nothing here copies the project's URL onto the job. A copy would be a second place
--   for it to be wrong the day a site is moved.
--
-- WHY A CHECK RATHER THAN A URL TYPE
--
--   Postgres has no url type. The check is deliberately loose — https, and not blank —
--   because SharePoint tenants, personal sites and shortened links all look different and
--   a pattern tight enough to be meaningful would reject somebody's real folder. What it
--   does catch is the two things that are always wrong: a bare path pasted without a
--   scheme, and an http link to a tenant that only serves https.
-- =============================================================================

alter table projects
  add column if not exists project_sharepoint_url text;

alter table jobs
  add column if not exists job_sharepoint_url text;

alter table projects drop constraint if exists projects_sharepoint_url_is_https;
alter table projects add constraint projects_sharepoint_url_is_https
  check (project_sharepoint_url is null or project_sharepoint_url ~ '^https://\S+$');

alter table jobs drop constraint if exists jobs_sharepoint_url_is_https;
alter table jobs add constraint jobs_sharepoint_url_is_https
  check (job_sharepoint_url is null or job_sharepoint_url ~ '^https://\S+$');

comment on column projects.project_sharepoint_url is
  'The project''s SharePoint folder. Its jobs'' folders are subfolders of it and are held on the jobs, not listed here — a project with three jobs shows four links, which is one per record rather than a list on one of them.';

comment on column jobs.job_sharepoint_url is
  'This job''s own subfolder inside its project''s SharePoint folder. The job''s record page shows this and the project''s; it does not show its siblings''.';

-- ------------------------------------------- and the view the app actually reads
-- The repository reads jobs through `job_display`, not the table — 0036 is the story of
-- what happened when it read the table instead. A column added to `jobs` that the view
-- does not carry is invisible to the app, and the seeds check fails on exactly that.
--
-- `project_sharepoint_url` rides along read-through, not copied — Lofty: "jobs will also
-- display project folder on their job details/record page as well as their own job
-- folder". Same rule as `project_current_address` two lines above it: a join, so a moved
-- site has one place to be right.

drop view if exists job_display;

create view job_display with (security_invoker = true) as
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
         p.project_sharepoint_url
  from jobs j
  join projects p using (project_id)
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id
  join addresses pcur      on pcur.address_id = p.project_current_address_id;

comment on view job_display is
  'A job with the things a card needs joined on: its project type, its own two addresses, its project''s current address, both SharePoint folders, and whether it is still live. Carries every column of `jobs` that the repository maps, so it can be read in place of the table rather than beside it. security_invoker so RLS on jobs decides who sees what.';

do $$
declare
  missing text;
  invoker boolean;
begin
  select string_agg(c, ', ') into missing
  from unnest(array[
    'job_id','project_id','job_sequence','job_number_old',
    'job_original_address_id','job_current_address_id','job_status','job_stage',
    'job_stage_entered_at','job_owning_team','job_engaged_teams','job_assignee_id',
    'job_sharepoint_url','job_created_at','job_created_by','job_updated_at',
    'job_updated_by','job_current_address','job_original_address',
    'project_current_address','project_sharepoint_url'
  ]) as c
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_display' and column_name = c);

  if missing is not null then
    raise exception 'job_display is missing: %', missing;
  end if;

  select exists (
    select 1 from pg_class c, unnest(c.reloptions) o
    where c.relname = 'job_display' and c.relkind = 'v' and o like 'security_invoker=%'
  ) into invoker;
  if not coalesce(invoker, false) then
    raise exception 'job_display is not security_invoker — it would bypass RLS on jobs';
  end if;

  raise notice 'ok  job_display carries both folders and still runs as the caller';
end $$;
