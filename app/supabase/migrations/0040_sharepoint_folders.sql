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
