-- 0120 — A MAINTENANCE ISSUE IS A RECORD YOU CAN WORK ON
--
-- WHAT WAS ASKED FOR
--
--   Amber, 14 September: *"when you click on a maintenance job to edit it you have same
--   type of format that is when you add a new job but at the additional fields for status
--   booked in and they tasks activity comments documents that are the same format as on the
--   bottom of a job or project drawer"*.
--
--   Four panels. One of them already worked — `document_links.maintenance_request_id` has
--   existed since `0084`. The other three could not: `comments`, `activity_events` and
--   `tasks` take a project, a job, a task or a variation, and a maintenance request is none
--   of those. **The drawer was not the missing piece; the parent column was.**
--
-- THE FORK, AND AMBER'S ANSWER
--
--   A maintenance issue already has its own versions of two of these — `maintenance_items`
--   is its work list and `maintenance_messages` is its thread. So the choice was to render
--   those in the panels' shape and change no schema, or to let the general tables take a
--   maintenance request so an issue is a record like any other.
--
--   Put to her with the cost of each, she took the second: **"Join the general tables."**
--   The reason is the Tasks board — a repair booked for Tuesday should appear beside
--   everything else a supervisor is planning, and a row in `maintenance_items` never will.
--
--   **The duplication that choice creates is real and is NOT resolved here.** An issue can
--   now carry both `maintenance_items` (the defect broken down by trade, with cost and a
--   done-stamp) and `tasks` (scheduled work that shows on the board). They are different
--   things and this migration treats them as different things, but nothing stops somebody
--   recording one repair as both. Amber has been told that a rule is needed and has not
--   given one, so none is invented here — see *Never fill a gap with a plausible value*.
--
-- WHY `tasks` IS SHAPED DIFFERENTLY FROM THE OTHER TWO
--
--   For `comments` and `activity_events`, a maintenance request is a genuine PARENT: the
--   thread is about the issue, not about the job, and `one_parent` grows by one the way it
--   grew for `feedback_id` in `0064`.
--
--   For `tasks` it is a QUALIFIER, not a parent, and that is what makes the Tasks board
--   work. The board reads tasks by job. A task whose only parent was a maintenance request
--   would vanish from it — which is the exact thing Amber chose this option to get. So a
--   maintenance task keeps its `job_id` and `tasks_one_parent` is left alone; the request id
--   is extra.
--
--   That leaves one way to be wrong: a task on job 1042-01 pointing at an issue on job
--   1055-01, which would put a repair to one house on another house's board. A composite
--   foreign key refuses it outright — the two columns must name a row that really exists in
--   `maintenance_requests` with that pairing. A trigger could do the same and would be a
--   trigger somebody can forget to fire.
--
-- RLS IS UNCHANGED, AND THAT WAS CHECKED RATHER THAN ASSUMED
--
--   Every policy on these three tables is parent-agnostic: they test `is_active_user()` and
--   `current_permission()`, never which record a row hangs off. So a comment on a
--   maintenance issue reads and writes under exactly the same rule as a comment on a job,
--   and no policy needs to change. Written down because "no policy change" in a migration
--   that adds a parent column is normally a red flag, and here it is a finding.

-- ============================================ comments: a sixth parent, as 0064 made a fifth
alter table comments
  add column maintenance_request_id uuid references maintenance_requests(maintenance_request_id) on delete cascade;

alter table comments drop constraint comments_one_parent;
alter table comments
  add constraint comments_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id, feedback_id, maintenance_request_id) = 1);

comment on column comments.maintenance_request_id is
  'The maintenance issue this comment is on (0120). The sixth parent — a comment has exactly one, and comments_one_parent is what enforces it. Separate from maintenance_messages, which stays what it is: the record of what was SENT to a contractor or a homeowner, with its channel and its delivery. This is Lofty talking to itself about the defect, with @mentions, the bell and the edited marker the general thread already has.';

create index comments_maintenance_idx on comments (maintenance_request_id)
  where maintenance_request_id is not null;

-- ================================================ activity: the panel that had no source
alter table activity_events
  add column maintenance_request_id uuid references maintenance_requests(maintenance_request_id) on delete cascade;

alter table activity_events drop constraint activity_events_one_parent;
alter table activity_events
  add constraint activity_events_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id, maintenance_request_id) = 1);

comment on column activity_events.maintenance_request_id is
  'The maintenance issue this event is about (0120). Until now an issue kept no history of who changed what: a repair that changed hands, or a booking date that moved twice, left nothing behind, and that is the thing people argue about afterwards. The audit tables recorded the row change but read as a database log rather than as a feed.';

create index activity_events_maintenance_idx on activity_events (maintenance_request_id)
  where maintenance_request_id is not null;

-- ==================================== tasks: a qualifier, and the pairing that must hold
--
-- The composite foreign key below needs something to point AT. A primary key on
-- maintenance_request_id alone cannot express "and its job is this one", so the pair gets a
-- unique constraint of its own. It is redundant against the primary key by design — that
-- redundancy is what makes the reference checkable.
alter table maintenance_requests
  add constraint maintenance_requests_id_job_key unique (maintenance_request_id, job_id);

alter table tasks
  add column maintenance_request_id uuid;

alter table tasks
  add constraint tasks_maintenance_request_is_on_this_job
    foreign key (maintenance_request_id, job_id)
    references maintenance_requests (maintenance_request_id, job_id)
    on delete cascade;

comment on column tasks.maintenance_request_id is
  'The maintenance issue this task is the work for (0120). NOT a parent — tasks_one_parent still requires exactly one of job_id and project_id, because the Tasks board reads by job and a task whose only parent was an issue would disappear from it. Amber chose this option to get repairs onto that board, so the job stays. The composite foreign key tasks_maintenance_request_is_on_this_job makes the pairing checkable: a task on 1042-01 cannot point at an issue on 1055-01, which would otherwise put a repair to one house on another house''s board. Distinct from maintenance_items, which remains the defect broken down by trade with its cost and done-stamp; no rule yet says which of the two is the truth when somebody records a repair as both.';

create index tasks_maintenance_idx on tasks (maintenance_request_id)
  where maintenance_request_id is not null;

-- ============================================ and the view the board actually reads
--
-- `task_display` names its columns one by one rather than selecting `t.*`, so a column
-- added to `tasks` does not appear in it and the board would never see a repair. Rebuilt
-- verbatim from `0102` with one column added beside `project_id`.
--
-- DROPPED AND RECREATED rather than replaced, and not by preference: `create or replace
-- view` can only APPEND columns, and refuses with *cannot change name of view column
-- "task_name" to "maintenance_request_id"* when one is inserted in the middle. The column
-- belongs beside `project_id`, where the other parents are, so the view goes and comes back
-- — the same thing `0116` did to `maintenance_request_display`.
--
-- `security_invoker` is re-applied, because a bare recreate silently drops it — that is
-- `0055`, which returned all 60 jobs to an account held at the demo gate. The sweep in
-- `behaviour.sql` catches it now, and catching it here first is cheaper.
drop view if exists task_display;
create view task_display with (security_invoker = true) as
  select t.task_id, t.job_id, t.project_id, t.maintenance_request_id, t.task_name, t.task_description, t.parent_task_id,
         t.task_position, t.task_owning_team, t.task_assignee_id, t.task_status, t.task_due_date,
         t.task_scheduled_date,
         t.task_completed_at, t.task_completed_by, t.task_is_external, t.process_run_id, t.process_task_id,
         t.task_started_at, t.task_expected_days, t.task_at_risk_lead_days,
         t.task_created_at, t.task_created_by, t.task_updated_at, t.task_updated_by,
         a.profile_full_name as task_assignee_name,
         f.profile_full_name as task_completed_by_name,
         c.profile_full_name as task_created_by_name,
         pr.process_id as task_process_id,
         p.process_name as task_process_name,
         coalesce(jd.job_current_address, pj.project_name) as task_record_name,
         coalesce(jd.job_stage, pj.project_stage) as task_record_stage,
         coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))         as task_due_effective,
         coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))
           - t.task_at_risk_lead_days                                                        as task_at_risk_date,
         case
           when t.task_status = 'done'      then 'done'
           when t.task_status = 'cancelled' then 'cancelled'
           when coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days)) is null
                                            then 'no_due_date'
           when current_date > coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))
                                            then 'overdue'
           when t.task_at_risk_lead_days is not null
                and current_date >= coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))
                                    - t.task_at_risk_lead_days
                                            then 'at_risk'
           else 'on_track'
         end as task_health,
         (select count(*) from task_checklist_items c2 where c2.task_id = t.task_id)::integer as task_checklist_total,
         (select count(*) from task_checklist_items c2 where c2.task_id = t.task_id and c2.task_checklist_item_is_done)::integer as task_checklist_done,
         (select count(*) from tasks s where s.parent_task_id = t.task_id)::integer as task_subtask_total,
         (select count(*) from tasks s where s.parent_task_id = t.task_id and s.task_status = 'done')::integer as task_subtask_done
  from tasks t
  left join profiles a on a.profile_id = t.task_assignee_id
  left join profiles f on f.profile_id = t.task_completed_by
  left join profiles c on c.profile_id = t.task_created_by
  left join process_runs pr on pr.process_run_id = t.process_run_id
  left join processes p on p.process_id = pr.process_id
  left join job_display jd on jd.job_id = t.job_id
  left join projects pj on pj.project_id = t.project_id;

comment on view task_display is
  'A task as the board reads it (0102, widened in 0120 with the maintenance issue it is the work for).';

-- ==================================================================== proof
--
-- THE FIRST VERSION OF THIS BLOCK PROVED NOTHING, and that is worth recording. It looked
-- for two jobs already carrying issues and, finding none on the replay database, printed a
-- notice and skipped every assertion — while `replay.sh` reported ALL MIGRATIONS APPLIED
-- CLEANLY. A proof that stands down when the data is absent is a proof that stands down
-- exactly where nobody is watching.
--
-- So it builds its own fixtures: two jobs on one project, an issue on each. The projects
-- identity sequence is captured and restored the way `0114` does it — a probe that quietly
-- advances the number the next real project will take is a probe that changed production.
do $$
declare
  addr uuid; proj integer; job_a text; job_b text;
  issue_a uuid; issue_b uuid; probe uuid; probe_task uuid;
  -- activity_event_id is a bigint, not a uuid. The first draft reused `probe` for it and
  -- the migration failed on `invalid input syntax for type uuid: "1"` — which is the proof
  -- block earning its keep before it proved anything else.
  probe_event bigint;
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('120', 'Probe Street 0120', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into addr;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (addr, addr, 'residential') returning project_id into proj;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (proj, addr, addr, 'construction') returning job_id into job_a;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (proj, addr, addr, 'construction') returning job_id into job_b;

  insert into maintenance_requests (job_id, maintenance_request_summary)
  values (job_a, 'Probe issue A 0120') returning maintenance_request_id into issue_a;
  insert into maintenance_requests (job_id, maintenance_request_summary)
  values (job_b, 'Probe issue B 0120') returning maintenance_request_id into issue_b;

  -- ---- 1. a comment hangs off an issue, and off exactly one thing ---------------------
  insert into comments (comment_body, maintenance_request_id)
  values ('0120 probe', issue_a) returning comment_id into probe;
  begin
    update comments set job_id = job_a where comment_id = probe;
    raise exception '0120 proof: comments_one_parent allowed an issue and a job at once';
  exception when check_violation then null; end;
  delete from comments where comment_id = probe;

  -- And the five parents it already had still work — this widens the check, it does not
  -- replace it, which is the mistake 0119 watched itself make on a different constraint.
  insert into comments (comment_body, job_id) values ('0120 probe', job_a) returning comment_id into probe;
  delete from comments where comment_id = probe;

  -- ---- 2. activity the same, which is the panel that had no source at all -------------
  insert into activity_events (activity_event_kind, maintenance_request_id)
  values ('note', issue_a) returning activity_event_id into probe_event;
  begin
    update activity_events set job_id = job_a where activity_event_id = probe_event;
    raise exception '0120 proof: activity_events_one_parent allowed two parents at once';
  exception when check_violation then null; end;
  delete from activity_events where activity_event_id = probe_event;

  -- ---- 3. a task keeps its job AND names its issue ------------------------------------
  -- This is the pairing that puts a repair on the right house's board.
  insert into tasks (task_name, job_id, maintenance_request_id)
  values ('0120 probe', job_a, issue_a) returning task_id into probe_task;

  -- The wrong pairing is refused outright. Without the composite key this inserts happily
  -- and a repair to one house appears on another house's board, looking entirely normal.
  begin
    insert into tasks (task_name, job_id, maintenance_request_id)
    values ('0120 probe wrong house', job_a, issue_b);
    raise exception '0120 proof: a task on the first job took the second job''s issue';
  exception when foreign_key_violation then null; end;

  -- A task with no issue at all is still an ordinary task: this column is a qualifier and
  -- tasks_one_parent is untouched.
  insert into tasks (task_name, job_id) values ('0120 probe plain', job_a) returning task_id into probe;
  delete from tasks where task_id = probe;
  delete from tasks where task_id = probe_task;

  raise notice '0120 proof: an issue parents comments and activity, a task carries its own issue and refuses another job''s.';

  -- The fixtures go, and the project number they took goes back.
  delete from maintenance_requests where maintenance_request_id in (issue_a, issue_b);
  delete from jobs where job_id in (job_a, job_b);
  delete from projects where project_id = proj;
  delete from addresses where address_id = addr;
  execute format('select setval(%L, %s, %L)', seq, seq_last, seq_called);
end
$$;
