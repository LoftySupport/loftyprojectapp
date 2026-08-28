-- 0055 — job_display carries the title type
--
-- 0054 put `job_title_type` on `jobs`; this puts it in the view every job screen
-- actually reads.
--
-- Worth its own migration, and worth writing down why: **a view's column list is frozen
-- at creation**. `job_display` is not `select *` — it names its columns — so a new
-- column on `jobs` is invisible to it until the view is recreated. Add a column and stop
-- there and the failure is silent: the write succeeds, the value is in the table, and
-- every screen shows the field empty. That is a bad afternoon, and it is the shape of
-- fault this repo has already lost time to once (the address ids that never resolved).
--
-- `create or replace` rather than drop-and-create: replace keeps the grants and any
-- dependent objects, and refuses outright if the existing columns are reordered or
-- retyped — which is exactly the mistake worth being refused for. New columns may only
-- be appended, so `job_title_type` goes at the end.

create or replace view job_display as
 SELECT j.job_id,
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
    is_current(j.job_status) AS job_is_current,
    j.job_stage,
    j.job_stage_entered_at,
    j.job_owning_team,
    j.job_engaged_teams,
    j.job_assignee_id,
    j.job_sharepoint_url,
    cur.address_consolidated AS job_current_address,
    orig.address_consolidated AS job_original_address,
    cur.address_suburb AS job_suburb,
    pcur.address_consolidated AS project_current_address,
    p.project_sharepoint_url,
    j.job_title_type
   FROM jobs j
     JOIN projects p USING (project_id)
     JOIN addresses cur ON cur.address_id = j.job_current_address_id
     LEFT JOIN addresses orig ON orig.address_id = j.job_original_address_id
     JOIN addresses pcur ON pcur.address_id = p.project_current_address_id;

-- ---------------------------------------------------------------------------- proof
-- (applied, then the column read back through the view for a job set to 'community' —
-- the value arrives, where before the recreate the view had no such column at all.)
