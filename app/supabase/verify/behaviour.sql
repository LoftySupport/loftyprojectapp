\set ON_ERROR_STOP on
-- a person to own the rows (the seed migrations already put people here)
insert into profiles (profile_first_name, profile_last_name, profile_email, profile_permission)
values ('Behaviour','Test','behaviour-test@lofty.com.au','admin')
on conflict (profile_email) do nothing;

-- an address
--
-- EVERY `from addresses` below names it. They used to say bare `from addresses`, which
-- worked only because this file ran against a database where this was the ONLY address —
-- an assumption nothing stated and nothing checked. 0093 loads 110 project addresses from
-- Amber's workbook, five of which are a suburb with no street number, and the bare selects
-- promptly tried to hang two jobs off one of those and hit
-- guard_job_address_is_a_street: "a job needs a street address with a number, not a
-- locality". The guard was right; the fixture was the thing that was wrong.
insert into addresses (address_lot_number, address_street_1, address_suburb,
                       address_postcode, address_council, address_created_by)
select 'Lot 3','Corner Street','Golden Grove','5125','City of Tea Tree Gully', profile_id from profiles where profile_email='behaviour-test@lofty.com.au';

\echo '--- 1. consolidated address includes lot number and postcode'
select address_consolidated from addresses where address_street_1 = 'Corner Street';

\echo '--- 2. project_id is a four-digit number and IS the key'
--
-- CAPTURED, not assumed to be 1000. This said `1000` in eight places and worked only
-- because the projects table was empty when it ran — 0093 loads 110 of Amber's projects
-- from the identity sequence, so the first number this fixture gets is well past 1000 and
-- every literal below it was wrong. The number the database actually assigned is the only
-- number this file is entitled to use.
insert into projects (project_original_address_id, project_current_address_id, project_type, project_created_by)
select address_id, address_id, 'residential', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses where address_street_1 = 'Corner Street'
returning project_id as proj \gset
select project_id, project_status, project_proposed_dwellings from projects where project_id = :proj;

\echo '--- 3. default_current_address filled the pair from one side'
insert into projects (project_original_address_id, project_type, project_created_by)
select address_id, 'development', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses where address_street_1 = 'Corner Street'
returning project_id as proj_pair \gset
-- The fixture's own two rows. It used to print every project on the table, which was two
-- lines when the table was empty and 111 once 0093 loaded Amber's — and a check whose
-- output nobody will read is a check nobody will notice failing.
select project_id, (project_original_address_id = project_current_address_id) as pair_matches
from projects where project_id in (:proj, :proj_pair) order by project_id;

\echo '--- 4. job_id is stamped <project>-001, -002 and the FK IS the project number'
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select :proj, address_id, address_id, 'design', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses where address_street_1 = 'Corner Street';
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select :proj, address_id, address_id, 'design', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses where address_street_1 = 'Corner Street';
select job_id, project_id, job_sequence, job_owning_team, job_stage from jobs where project_id = :proj order by job_id;

\echo '--- 5. gaps are permanent: delete -001, next job is -003 not -002'
delete from jobs where job_id = :'proj' || '-001';
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select :proj, address_id, address_id, 'design', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses where address_street_1 = 'Corner Street';
select job_id from jobs where project_id = :proj order by job_id;

\echo '--- 6. RENUMBER to 9106. on update cascade moves the FK, resync moves job_id'
-- 9106 rather than the 1106 this used: 1106 is inside the band the identity sequence
-- hands out, and 0093 now owns it. A fixture number has to be one no data will ever take.
update projects set project_id = 9106 where project_id = :proj;
select job_id, project_id from jobs order by job_id;

\echo '--- 7. bump_project_no_seq: next generated number is above the hand-set one'
insert into projects (project_original_address_id, project_type, project_created_by)
select address_id, 'development', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses where address_street_1 = 'Corner Street';
select max(project_id) as next_number from projects;

\echo '--- 8. moddatetime maintains the prefixed updated_at column'
-- Compared against its own previous value, not against created_at: step 6's renumber
-- already fired this trigger through the cascade, so created_at is not a live baseline.
select max(job_updated_at) as before_update from jobs where job_id like '9106-%' \gset
update jobs set job_status = 'at_risk' where job_id like '9106-%';
select bool_and(job_updated_at > :'before_update'::timestamptz) as touched_on_update
from jobs where job_id like '9106-%';

\echo '--- 9. job_engaged_teams accepts real teams'
update jobs set job_engaged_teams = array['design','estimating'] where job_id like '9106-%';
select job_id, job_engaged_teams from jobs order by job_id limit 1;

\echo '--- 10. address_history follows the new key types'
insert into address_history (address_history_project_id, address_history_address_id,
  address_history_role, address_history_valid_from, address_history_valid_to)
select 9106, address_id, 'current', now() - interval '1 day', now() from addresses where address_street_1 = 'Corner Street';
select address_history_project_id, address_history_role from address_history;

\echo '--- 11. views read'
select project_id, project_current_address, project_is_current from project_display;
select job_id, project_id, job_is_current, job_suburb from job_display order by job_id limit 2;

\echo '--- 12. the lifecycle pipeline holds its stages, in order'
select pipeline_stage_position, pipeline_stage_name, pipeline_stage_type, pipeline_stage_owning_team
from pipeline_stages ps join pipelines p using (pipeline_id)
where p.pipeline_key = 'build_lifecycle' order by pipeline_stage_position;

\echo '--- 13. a nested pipeline hangs off a stage of its parent'
insert into pipelines (pipeline_key, pipeline_name, pipeline_scope, pipeline_position,
                       pipeline_parent_stage_id)
select 'preconstruction', 'Pre-construction', 'job', 1, ps.pipeline_stage_id
from pipeline_stages ps join pipelines p using (pipeline_id)
where p.pipeline_key = 'build_lifecycle' and ps.pipeline_stage_name = 'Pre-construction';

insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position, pipeline_stage_owning_team)
select pipeline_id, n, r::smallint, 'design'
from pipelines, (values ('Planning Approval',1),('Working Drawings',2),('Development Approval',3)) v(n,r)
where pipeline_key = 'preconstruction';

select child.pipeline_name as nested_pipeline, parent_stage.pipeline_stage_name as hangs_off,
       parent.pipeline_name as parent_pipeline
from pipelines child
join pipeline_stages parent_stage on parent_stage.pipeline_stage_id = child.pipeline_parent_stage_id
join pipelines parent on parent.pipeline_id = parent_stage.pipeline_id
where child.pipeline_key = 'preconstruction';

\echo '--- 14. ONE job sits in TWO pipelines at once, with no contradiction'
insert into job_pipeline_positions (job_id, pipeline_id, pipeline_stage_id)
select '9106-002', p.pipeline_id, ps.pipeline_stage_id
from pipelines p join pipeline_stages ps using (pipeline_id)
where p.pipeline_key = 'build_lifecycle' and ps.pipeline_stage_name = 'Pre-construction';

insert into job_pipeline_positions (job_id, pipeline_id, pipeline_stage_id)
select '9106-002', p.pipeline_id, ps.pipeline_stage_id
from pipelines p join pipeline_stages ps using (pipeline_id)
where p.pipeline_key = 'preconstruction' and ps.pipeline_stage_name = 'Working Drawings';

select p.pipeline_name, ps.pipeline_stage_name, jpp.job_pipeline_position_state
from job_pipeline_positions jpp
join pipelines p using (pipeline_id)
join pipeline_stages ps on ps.pipeline_stage_id = jpp.pipeline_stage_id
where jpp.job_id = '9106-002' order by p.pipeline_position, p.pipeline_name;

\echo '--- 15. moving a stage writes history and resets the clock; a state change does not'
update job_pipeline_positions set pipeline_stage_id = (
  select ps.pipeline_stage_id from pipeline_stages ps join pipelines p using (pipeline_id)
  where p.pipeline_key = 'preconstruction' and ps.pipeline_stage_name = 'Development Approval')
where job_id = '9106-002'
  and pipeline_id = (select pipeline_id from pipelines where pipeline_key = 'preconstruction');

select count(*) as stage_events_logged from job_stage_events where job_id = '9106-002';
select coalesce(f.pipeline_stage_name,'(none)') as moved_from, t.pipeline_stage_name as moved_to
from job_stage_events e
left join pipeline_stages f on f.pipeline_stage_id = e.job_stage_event_from_stage_id
join pipeline_stages t on t.pipeline_stage_id = e.job_stage_event_to_stage_id
where e.job_id = '9106-002' order by e.job_stage_event_id;

\echo '--- 16. blocked is a state: the job keeps its real stage'
update job_pipeline_positions
   set job_pipeline_position_state = 'waiting', job_pipeline_position_waiting_on = 'estimating'
 where job_id = '9106-002'
   and pipeline_id = (select pipeline_id from pipelines where pipeline_key = 'preconstruction');
select ps.pipeline_stage_name as still_at, jpp.job_pipeline_position_state, jpp.job_pipeline_position_waiting_on
from job_pipeline_positions jpp join pipeline_stages ps on ps.pipeline_stage_id = jpp.pipeline_stage_id
where jpp.job_id = '9106-002'
  and jpp.pipeline_id = (select pipeline_id from pipelines where pipeline_key = 'preconstruction');
select (select count(*) from job_stage_events where job_id='9106-002') as events_unchanged_by_state_move;

\echo '--- 17. deleting the HIGHEST job does not reissue its number'
select job_id as highest from jobs where project_id = 9106 order by job_id desc limit 1 \gset
delete from jobs where job_id = :'highest';
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select 9106, address_id, address_id, 'design',
       (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses where address_street_1 = 'Corner Street';
select :'highest' as deleted, (select max(job_id) from jobs where project_id=9106) as next_issued,
       (select max(job_id) from jobs where project_id=9106) <> :'highest' as number_not_reused;

\echo '--- 18. renaming a team slug reaches job_engaged_teams too'
update jobs set job_engaged_teams = array['design','estimating'] where project_id = 9106;
update teams set team_id = 'design_team' where team_id = 'design';
select job_id, job_engaged_teams from jobs where project_id = 9106 order by job_id limit 1;
-- and the job is still editable afterwards, which is the part that actually bites
update jobs set job_status = 'on_track' where project_id = 9106;
select 'job still editable after the rename' as check;
update teams set team_id = 'design' where team_id = 'design_team';

\echo '--- 19. the array is normalised: duplicates and nulls do not survive'
update jobs set job_engaged_teams = array['estimating','design','estimating'] where project_id = 9106;
select distinct job_engaged_teams as sorted_and_deduplicated from jobs where project_id = 9106;

\echo '--- 20. tasks: a fan-out, and what is ready to start'
insert into tasks (job_id, task_name, task_owning_team, task_position)
select '9106-002', n, 'design', r::smallint
from (values ('Contract Deposit Paid',1),('Order Soil Test',2),('Order Prelim FCR',3),
             ('Working Drawings',4),('Released to Construction',5)) v(n,r);

-- Deposit releases three things at once; the release waits on all three.
insert into task_dependencies (task_id, depends_on_task_id, task_dependency_lag_days)
select t.task_id, d.task_id, 14
from tasks t, tasks d
where t.job_id='9106-002' and d.job_id='9106-002'
  and d.task_name='Contract Deposit Paid'
  and t.task_name in ('Order Soil Test','Order Prelim FCR','Working Drawings');

insert into task_dependencies (task_id, depends_on_task_id)
select t.task_id, d.task_id
from tasks t, tasks d
where t.job_id='9106-002' and d.job_id='9106-002'
  and t.task_name='Released to Construction'
  and d.task_name in ('Order Soil Test','Order Prelim FCR','Working Drawings');

select task_name as ready_now from tasks_ready where job_id='9106-002' order by task_name;

-- A task on a DIFFERENT job, so the cross-record dependency probe in constraints.sql has
-- something real to aim at. Without it that insert matches no rows, does nothing, raises
-- nothing, and reports the guard as broken.
insert into tasks (job_id, task_name, task_owning_team)
select max(job_id), 'A task on another job', 'design' from jobs where project_id=9106
  and job_id <> '9106-002';

\echo '--- 21. finishing the root releases exactly the three that waited on it'
update tasks set task_status='done' where job_id='9106-002' and task_name='Contract Deposit Paid';
select task_name as ready_now from tasks_ready where job_id='9106-002' order by task_name;

\echo '--- 22. completion is stamped by the database, and reopening clears it'
-- has_person is false here and that is correct: this runs as postgres with no JWT, so
-- current_profile_id() has nobody to return. The point of the check is has_time, which
-- the database fills in whether or not it knows who did it.
select task_name, task_completed_at is not null as has_time,
       task_completed_by is not null as has_person_no_jwt_so_false
from tasks where job_id='9106-002' and task_name='Contract Deposit Paid';
update tasks set task_status='open' where job_id='9106-002' and task_name='Contract Deposit Paid';
select task_name, task_completed_at is null as time_cleared
from tasks where job_id='9106-002' and task_name='Contract Deposit Paid';

\echo '--- 23. a cancelled predecessor does not freeze what is behind it'
update tasks set task_status='done' where job_id='9106-002' and task_name='Contract Deposit Paid';
update tasks set task_status='cancelled' where job_id='9106-002' and task_name='Order Prelim FCR';
update tasks set task_status='done' where job_id='9106-002'
  and task_name in ('Order Soil Test','Working Drawings');
select task_name as ready_now from tasks_ready where job_id='9106-002' order by task_name;

\echo '--- 24. THREE variations on one job at once, each with its own team'
insert into variations (job_id, variation_title, variation_reason, variation_origin,
                        variation_status, variation_current_team)
values ('9106-002','Tiles unavailable','Supplier discontinued the range','supplier',
        'with_us','selections'),
       ('9106-002','Client wants a wider driveway','Requested at the site walk','client',
        'waiting_on_client','estimating'),
       ('9106-002','Beam size correction','Engineer revised the span','consultant',
        'with_us','design');
select variation_number, variation_current_team, variation_status, variation_origin
from variations where job_id='9106-002' order by variation_sequence;

\echo '--- 25. the job badge is derived, so it cannot go stale'
select variations_open, variations_with_client, variations_completed
from job_variation_summary where job_id='9106-002';

\echo '--- 26. a deleted variation number is never reissued'
delete from variations where variation_number='9106-002-V3';
insert into variations (job_id, variation_title) values ('9106-002','Raised after the delete');
select variation_number as next_issued from variations
where job_id='9106-002' order by variation_sequence desc limit 1;

\echo '--- 27. REWORK: the variation reopens finished work, and it is counted'
-- Contract Deposit Paid and Working Drawings are done from step 23.
insert into variation_reopened_tasks (variation_id, task_id)
select v.variation_id, t.task_id
from variations v, tasks t
where v.variation_number='9106-002-V1' and t.job_id='9106-002'
  and t.task_name in ('Contract Deposit Paid','Working Drawings','Order Soil Test');

select variation_number, tasks_reopened, tasks_that_were_finished
from variation_rework where variation_number='9106-002-V1';

\echo '--- 28. the snapshot survives the task being reopened afterwards'
update tasks set task_status='open'
 where job_id='9106-002' and task_name in ('Contract Deposit Paid','Working Drawings');
select 'task completed_at now cleared: ' ||
       (select count(*) from tasks where job_id='9106-002'
         and task_name='Working Drawings' and task_completed_at is null)::text;
select variation_number, tasks_that_were_finished as still_counted_as_rework
from variation_rework where variation_number='9106-002-V1';

\echo '--- 29. approving a variation stamps it and it lands in the cost'
update variations set variation_status='completed', variation_cost=4250.00,
       variation_days_impact=7
 where variation_number='9106-002-V1';
select variation_approved_at is not null as stamped,
       variation_cost, variation_days_impact
from variations where variation_number='9106-002-V1';
select variations_open, variations_approved_cost, variations_approved_days
from job_variation_summary where job_id='9106-002';

\echo '--- 30. ONE document, attached to the project AND both its jobs'
insert into documents (document_name, document_category, document_storage_path)
values ('Soil report — bore logs','report','projects/9106/soil-report.pdf');

insert into document_links (document_id, project_id)
select document_id, 9106 from documents where document_name like 'Soil report%';
insert into document_links (document_id, job_id)
select d.document_id, j.job_id from documents d, jobs j
where d.document_name like 'Soil report%' and j.project_id = 9106;

select d.document_name,
       count(*) filter (where l.project_id is not null) as on_projects,
       count(*) filter (where l.job_id is not null) as on_jobs,
       (select count(*) from documents where document_name like 'Soil report%') as stored_copies
from documents d join document_links l using (document_id)
where d.document_name like 'Soil report%' group by d.document_name;

\echo '--- 30b. a document can be a URL, and one URL is one document (0102)'
-- The other shape of document row: no bytes in Storage, an https address instead.
insert into documents (document_name, document_category, document_url)
values ('Contract — 9106','contract','https://lofty.sharepoint.com/sites/projects/9106/contract.pdf');
insert into document_links (document_id, project_id)
select document_id, 9106 from documents where document_name = 'Contract — 9106';

-- Filing the SAME address against the job as well is a second ATTACHMENT rather than a
-- second document. That is the whole premise of "held once" and it is what the unique
-- index on the URL enforces — without it, filing the project's contract on its job would
-- make two rows that then disagree about the name the day somebody corrects one.
insert into document_links (document_id, job_id)
select document_id, '9106-002' from documents where document_name = 'Contract — 9106';
select case when count(*) = 1 then 'ok  one SharePoint address is one document, on two records'
  else 'FAIL: ' || count(*) || ' document rows for one URL' end
from documents where document_url like '%9106/contract.pdf';

\echo '--- 30c. the reaper: a pointer goes with its last link, an upload does not'
-- Off the job. It is still on the project, so nothing should be reaped — the probe that
-- stops the reaper passing its own test by deleting on every detach.
delete from document_links l using documents d
 where l.document_id = d.document_id and d.document_name = 'Contract — 9106' and l.job_id = '9106-002';
select case when count(*) = 1 then 'ok  a pointer survives a detach while a link is left'
  else 'FAIL: a pointer was reaped while another link still pointed at it' end
from documents where document_name = 'Contract — 9106';

-- Off the project too. That was the last one, and a pointer nothing points at is
-- reachable from nowhere — nobody below admin could list it, open it or remove it.
delete from document_links l using documents d
 where l.document_id = d.document_id and d.document_name = 'Contract — 9106';
select case when count(*) = 0 then 'ok  a pointer is reaped when its last link goes'
  else 'FAIL: an unreachable pointer survived losing every link' end
from documents where document_name = 'Contract — 9106';

-- And the soil report, which HAS a storage path, does not go: 0032's rule that detaching
-- is not deleting. This is the half that makes the reaper's guard mean something —
-- without it the reaper would pass the probe above by deleting everything.
--
-- INSIDE a transaction that rolls back, for the reason the report_documents block at the
-- foot of this file records at length: a check that destroys the fixture the next check
-- needs turns one assertion into a page of false alarms.
begin;
delete from document_links l using documents d
 where l.document_id = d.document_id and d.document_name like 'Soil report%';
select case when count(*) = 1 then 'ok  an uploaded document survives losing every link'
  else 'FAIL: an upload was reaped when it was merely detached' end
from documents where document_name like 'Soil report%';
rollback;

\echo '--- 31. superseding a drawing: the chain says which is current'
insert into documents (document_name, document_category) values ('Working drawing rev A','drawing');
insert into documents (document_name, document_category, document_supersedes_id)
select 'Working drawing rev B','drawing', document_id from documents where document_name='Working drawing rev A';
select document_name from documents_current where document_category='drawing';

\echo '--- 32. a comment records that it was edited, but only when the body changes'
insert into comments (job_id, comment_body) values ('9106-002','Client asked about the tiles today.');
select comment_edited_at is null as not_edited_yet from comments where job_id='9106-002';
update comments set comment_body='Client asked about the tiles this morning.' where job_id='9106-002';
select comment_edited_at is not null as marked_edited from comments where job_id='9106-002';

\echo '--- 33. tags, and the same tag twice is a double-click not a fact'
insert into tags (tag_id, tag_name, tag_colour) values ('urgent','Urgent','#d9534f');
insert into taggings (tag_id, job_id) values ('urgent','9106-002');
select t.tag_name, count(*) as times_applied from taggings tg join tags t using (tag_id)
where tg.job_id='9106-002' group by t.tag_name;

\echo '--- 34. the job timeline reads comments and events as one stream'
insert into activity_events (job_id, activity_event_kind, activity_event_detail)
values ('9106-002','stage_changed','{"from":"Working Drawings","to":"Development Approval"}');
select entry_kind, entry_text, entry_was_edited from job_timeline
where job_id='9106-002' order by entry_at;

\echo '--- 35. SIGNING IN: both auth.users triggers, end to end'
-- This is the check that was missing. Sign-in was broken for an hour after the rename
-- because log_login_activity_from_auth_users() still wrote `profiles.last_login_at` and
-- matched on `auth_user_id`. It is a trigger on auth.users, so nothing in this harness
-- touched it — every table-level check passed while nobody could get a session.
--
-- Simulated rather than reasoned about: create the auth user, then move last_sign_in_at
-- the way Supabase Auth does, and assert what the two triggers are supposed to have done.
insert into profiles (profile_first_name, profile_last_name, profile_email, profile_permission)
values ('Signin','Test','signin-test@lofty.com.au','user')
on conflict (profile_email) do nothing;

-- SIGNUP: on_auth_user_created fires link_profile_to_auth_user + the SIGNUP log row.
insert into auth.users (email, raw_app_meta_data)
values ('signin-test@lofty.com.au', '{"provider":"azure"}');

select 'profile linked to auth: ' ||
       (select (profile_auth_user_id is not null)::text
          from profiles where profile_email='signin-test@lofty.com.au');

-- SIGNING IN: this is the exact write that was failing.
update auth.users set last_sign_in_at = now()
 where email = 'signin-test@lofty.com.au';

select 'last_login_at recorded on the profile: ' ||
       (select (profile_last_login_at is not null)::text
          from profiles where profile_email='signin-test@lofty.com.au');

select login_activity_event_type, (login_activity_at is not null) as has_time
from login_activity
where login_activity_email = 'signin-test@lofty.com.au'
order by login_activity_event_type;

-- ---------------------------------------------------------------------------
-- 36. An address says which place it means
--
-- `address_consolidated` is what pg_trgm indexes and what every address search reads, so
-- its format is a search concern rather than a display one. Lot numbers used to be
-- concatenated bare, which made "Lot 1, Corner Street" render as "1 Corner Street" —
-- a different house — and a subdivided lot carrying both numbers render as "3 28 Corner
-- Street". Found by splitting a project into four jobs and reading the result.
--
-- 0034 asserts this too, at the moment it changes the function. This asserts it of the
-- FINAL state, which is the version that survives somebody editing the function again.
begin;
insert into addresses (address_lot_number, address_street_number, address_street_2,
                       address_street_1, address_suburb, address_state,
                       address_postcode, address_council)
-- Ironbark Road, not Corner Street: step 1 already put a fixture on Corner Street, and
-- an assertion that sweeps up rows it did not create tells you about the wrong thing.
-- "Lot 3" typed with its label is in here on purpose — that is how people enter it, and
-- prefixing a value that already says Lot produced "Lot Lot 3".
values ('1',     null, null,     'Ironbark Road', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully'),
       (null,   '28',  null,     'Ironbark Road', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully'),
       ('3',    '28',  null,     'Ironbark Road', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully'),
       ('Lot 4', null, null,     'Ironbark Road', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully'),
       ('3',    '28',  'Unit 2', 'Ironbark Road', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully');

select case
  when array_agg(address_consolidated order by address_consolidated) =
       array[
         '28 Ironbark Road, Golden Grove SA 5125, AU',
         'Lot 1, Ironbark Road, Golden Grove SA 5125, AU',
         'Lot 3, 28 Ironbark Road, Golden Grove SA 5125, AU',
         'Lot 4, Ironbark Road, Golden Grove SA 5125, AU',
         'Unit 2, Lot 3, 28 Ironbark Road, Golden Grove SA 5125, AU'
       ]
  then 'ok  lot, street, both, unit and a typed "Lot 4" all render distinguishably'
  else 'FAIL: consolidated address format — ' ||
       array_to_string(array_agg(address_consolidated order by address_consolidated), ' / ')
end
from addresses
where address_street_1 = 'Ironbark Road';
rollback;

\echo '--- 37. a project follows its slowest job, and only forwards'
-- 0041. Lofty: "never move backwards ... a project only moves stages when all its jobs
-- have moved up a lifecycle stage". Those are one rule, not two: the project's stage is
-- the minimum of its jobs' stages, clamped so it can only increase.
--
-- Six steps, because the interesting cases are the ones where nothing should happen.
-- Read the `moved` column as "did the project change" — three of these must say no.
begin;
create temp table t37 (step integer, note text, stage text) on commit drop;

insert into addresses (address_street_number, address_street_1, address_suburb,
                       address_state, address_postcode, address_council)
values ('91','Slowest Job Road','Golden Grove','SA','5125','City of Tea Tree Gully');

insert into projects (project_original_address_id, project_type, project_created_by)
select address_id, 'development', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses where address_street_1 = 'Slowest Job Road';

create temp view p37 as
  select project_id from projects
  where project_original_address_id = (select address_id from addresses where address_street_1='Slowest Job Road');

-- Two jobs, both at the first phase, same as the project.
insert into jobs (project_id, job_original_address_id, job_owning_team, job_created_by)
select (select project_id from p37), address_id, 'design',
       (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses where address_street_1 = 'Slowest Job Road';
insert into jobs (project_id, job_original_address_id, job_owning_team, job_created_by)
select (select project_id from p37), address_id, 'design',
       (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses where address_street_1 = 'Slowest Job Road';

insert into t37 select 1, 'two jobs, both at the first phase', project_stage from projects, p37 where projects.project_id = p37.project_id;

-- ONE job moves up. The other has not, so the project must not either.
update jobs set job_stage = 'Pre-construction'
where job_id = (select min(job_id) from jobs where project_id = (select project_id from p37));
insert into t37 select 2, 'one job of two moved up', project_stage from projects, p37 where projects.project_id = p37.project_id;

-- Now the second one. All its jobs have moved up, so the project moves.
update jobs set job_stage = 'Pre-construction'
where project_id = (select project_id from p37) and job_stage = 'Acquisition & Development';
insert into t37 select 3, 'all jobs moved up', project_stage from projects, p37 where projects.project_id = p37.project_id;

-- A third job is added, at the first phase — an ordinary thing, a project is split more
-- than once. This is the case 0039 could not decide: the minimum now points backwards.
insert into jobs (project_id, job_original_address_id, job_owning_team, job_created_by)
select (select project_id from p37), address_id, 'design',
       (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses where address_street_1 = 'Slowest Job Road';
insert into t37 select 4, 'a new job added behind the project', project_stage from projects, p37 where projects.project_id = p37.project_id;

-- The two older jobs run ahead to Construction. The new one is still at the first phase,
-- so it is the slowest and the project stays where it is.
update jobs set job_stage = 'Construction'
where project_id = (select project_id from p37) and job_stage = 'Pre-construction';
insert into t37 select 5, 'the others ran ahead, the newest is slowest', project_stage from projects, p37 where projects.project_id = p37.project_id;

-- Delete the slowest. The minimum is now Construction, and the project catches up.
delete from jobs
where job_id = (select max(job_id) from jobs where project_id = (select project_id from p37));
insert into t37 select 6, 'the slowest job deleted', project_stage from projects, p37 where projects.project_id = p37.project_id;

select case
  when array_agg(stage order by step) = array[
         'Acquisition & Development',  -- 1  level with its jobs
         'Acquisition & Development',  -- 2  one job up is not all of them
         'Pre-construction',           -- 3  all of them, so it moves
         'Pre-construction',           -- 4  a job behind it cannot drag it back
         'Pre-construction',           -- 5  still held by the slowest
         'Construction'                -- 6  slowest gone, catches up to the rest
       ]
  then 'ok  project moved only when every job had, and never backwards'
  else 'FAIL: project stage tracking — ' || array_to_string(array_agg(step || ':' || stage order by step), ' / ')
end
from t37;
rollback;

\echo '--- 38. moving an address writes the history 0025 promised'
-- 0042. Repointing a current address must record whose the old one was and for what
-- period — and the periods must tile: each stint starts where the previous ended, the
-- first at the record's creation.
begin;
insert into addresses (address_street_number, address_street_1, address_suburb,
                       address_state, address_postcode, address_council)
values ('20',  'History Lane', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully'),
       ('20A', 'History Lane', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully'),
       ('20B', 'History Lane', 'Golden Grove', 'SA', '5125', 'City of Tea Tree Gully');

insert into projects (project_original_address_id, project_type, project_created_by)
select address_id, 'development', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses where address_street_number = '20' and address_street_1 = 'History Lane';

create temp view p38 as
  select project_id, project_created_at from projects
  where project_original_address_id =
    (select address_id from addresses where address_street_number='20' and address_street_1='History Lane');

-- Move it twice: 20 -> 20A -> 20B. Two superseded stints, zero for the original.
update projects set project_current_address_id =
  (select address_id from addresses where address_street_number='20A' and address_street_1='History Lane')
where project_id = (select project_id from p38);
update projects set project_current_address_id =
  (select address_id from addresses where address_street_number='20B' and address_street_1='History Lane')
where project_id = (select project_id from p38);

select case
  when (select count(*) from address_history h, p38
        where h.address_history_project_id = p38.project_id) = 2
   and (select count(*) from address_history h, p38
        where h.address_history_project_id = p38.project_id
          and h.address_history_role = 'current') = 2
  then 'ok  two moves, two superseded stints, both role current'
  else 'FAIL: expected 2 current-role history rows, got ' ||
       (select count(*)::text from address_history h, p38
        where h.address_history_project_id = p38.project_id)
end;

-- The tiling: first stint starts at the project's creation; second starts where the
-- first ended; both ended in order.
select case
  when (select array_agg(a.address_street_number order by h.address_history_valid_from)
        from address_history h
        join addresses a on a.address_id = h.address_history_address_id
        where h.address_history_project_id = (select project_id from p38)) = array['20','20A']
   and (select min(h.address_history_valid_from) from address_history h
        where h.address_history_project_id = (select project_id from p38))
       = (select project_created_at from p38)
   and (select bool_and(tiles) from (
         select h.address_history_valid_from =
                coalesce(lag(h.address_history_valid_to) over (order by h.address_history_valid_from),
                         (select project_created_at from p38)) as tiles
         from address_history h
         where h.address_history_project_id = (select project_id from p38)) t)
  then 'ok  the periods tile: creation -> first move -> second move, no gaps'
  else 'FAIL: history periods do not tile'
end;
rollback;

-- ============================================================================
-- EVERY VIEW IN public CARRIES security_invoker
--
-- The rule has existed since 0020 — *"any migration touching a view must re-apply
-- security_invoker and assert on pg_class.reloptions afterwards"* — and until now it
-- existed only as a sentence in a migration header and in the handoff. Nothing checked
-- it, so `0055` rewrote `job_display` with a bare `create or replace view`, the option
-- was dropped silently, and check.sh stayed green through that migration and the
-- thirteen after it. On the live database that view returned all 60 jobs to an account
-- held at the demo gate, which reads 0 through the table.
--
-- A view without it executes as its OWNER, which is how a view becomes a way around
-- every policy underneath it. There is no view in this schema that wants that: each one
-- exists to shape rows the caller is already entitled to.
--
-- Written as one assertion over pg_class rather than a probe per view, so a view added
-- next month is covered without anybody remembering to extend this.
-- ============================================================================
select case
  when not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=%'
  )
  then 'ok  every view in public sets security_invoker'
  else 'FAIL: view(s) executing as owner, past every policy underneath: ' || (
    select string_agg(c.relname, ', ' order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=%'
  )
end;

-- ============================================================================
-- 39. Every table is audited, and a change knows which record it was on (0080)
--
-- The allowlist inside log_activity_audit() meant a trigger could be attached and log
-- nothing — 0043's property_defs, found in 0077. The function has no list now, and this
-- asserts the trigger is on every table in public except the six that are logs, so the
-- table created next month fails here the day it is created without one.
-- ============================================================================
\echo '--- 39. every table carries the audit trigger, and a task change carries its job and project'
select case
  when not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> all (private.audit_exempt_tables())
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_activity_audit_row'))
  then 'ok  every non-log table in public carries trg_activity_audit_row'
  else 'FAIL: tables without the audit trigger: ' || (
    select string_agg(c.relname, ', ' order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname <> all (private.audit_exempt_tables())
      and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trg_activity_audit_row'))
end;

-- The three renamed tables conform to tablename_attribute, and so does everything else:
-- every column in public is prefixed by its table's singular name, or is a foreign key
-- keeping its parent's name. Asserted once over information_schema rather than by eye.
select case when count(*) = 0
  then 'ok  every column in public is tablename_attribute (or a foreign key keeping its parent''s name)'
  else 'FAIL: columns off the naming convention: ' || string_agg(t || '.' || c, ', ' order by t, c) end
from (
  select c.table_name t, c.column_name c
  from information_schema.columns c
  join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
  where c.table_schema = 'public'
    and c.column_name not like regexp_replace(regexp_replace(regexp_replace(c.table_name, 'sses$', 'ss'), 'ies$', 'y'), '([^s])s$', '\1') || '\_%'
    and c.column_name not in (
      select kcu.column_name from information_schema.key_column_usage kcu
      join information_schema.table_constraints tc using (constraint_name, table_schema)
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public')
    and c.column_name not in ('project_id', 'job_id', 'profile_id', 'team_id', 'task_id', 'variation_id', 'process_id',
                              'document_id', 'comment_id', 'tag_id', 'address_id', 'property_def_key', 'feedback_id',
                              'process_run_id', 'process_task_id', 'pipeline_id', 'pipeline_stage_id', 'release_id', 'roadmap_phase_id')
) x;

-- A task's change lands with the job it is on AND that job's project, resolved through the
-- task, so a project's history includes work on its jobs.
insert into tasks (job_id, task_name) values ('9106-002', 'behaviour probe task 0080');
update tasks set task_status = 'in_progress' where task_name = 'behaviour probe task 0080';
select case when count(*) = 1
  then 'ok  a task update is audited with activity_audit_job_id 9106-002 and its project 9106'
  else 'FAIL: expected 1 audited task update carrying job and project, found ' || count(*) end
from activity_audit
where activity_audit_table = 'tasks' and activity_audit_operation = 'UPDATE'
  and activity_audit_job_id = '9106-002' and activity_audit_project_id = 9106
  and activity_audit_new_row ->> 'task_name' = 'behaviour probe task 0080';

-- A property value recorded on a job is audited the same way — the row carries job_id
-- directly, and 0077's history table is still written beside it.
select case when count(*) >= 1
  then 'ok  property_values carries the audit trigger (a recorded value is a change)'
  else 'FAIL: property_values is not audited' end
from pg_trigger t where t.tgrelid = 'property_values'::regclass and t.tgname = 'trg_activity_audit_row';
delete from tasks where task_name = 'behaviour probe task 0080';

-- ============================================================================
-- 40. Tasks know their health, checklists are copied, a stage counts its milestones (0081)
-- ============================================================================
\echo '--- 40. task_display derives due and health; instantiation copies days and checklist lines; stage_completion counts'
insert into tasks (job_id, task_name, task_expected_days, task_at_risk_lead_days)
values ('9106-002', 'behaviour probe 0081', 7, 2);
update tasks set task_status = 'in_progress' where task_name = 'behaviour probe 0081';
update tasks set task_started_at = now() - interval '5 days' where task_name = 'behaviour probe 0081';
select case when task_health = 'at_risk' and task_due_effective = current_date + 2
  then 'ok  a 7-day task with a 2-day lead, 5 days in, reads at_risk and due in 2 days'
  else 'FAIL: expected at_risk due today+2, got ' || task_health || ' due ' || coalesce(task_due_effective::text, 'null') end
from task_display where task_name = 'behaviour probe 0081';

insert into task_checklist_items (task_id, task_checklist_item_text)
select task_id, 'probe line' from tasks where task_name = 'behaviour probe 0081';
update task_checklist_items set task_checklist_item_is_done = true where task_checklist_item_text = 'probe line';
select case when task_checklist_total = 1 and task_checklist_done = 1
  then 'ok  task_display counts the ticked checklist line'
  else 'FAIL: task_display counted ' || task_checklist_total || ' lines, ' || task_checklist_done || ' done' end
from task_display where task_name = 'behaviour probe 0081';
select case when task_checklist_item_done_at is not null and task_checklist_item_done_by is null
  then 'ok  ticking as the owner stamps the time and leaves the person null — never a stand-in'
  else 'FAIL: done_at/done_by not stamped as expected' end
from task_checklist_items where task_checklist_item_text = 'probe line';

-- A template line with expected days and a checklist line, instantiated onto a run.
insert into processes (process_key, process_name, process_stage, process_scope, process_position)
values ('behaviour_probe_0081', 'Behaviour probe 0081', 'Construction', 'job', 999)
on conflict (process_key) do nothing;
insert into process_tasks (process_id, process_task_name, process_task_expected_days)
select process_id, 'probe template task', 4 from processes where process_key = 'behaviour_probe_0081';
insert into process_task_checklist_items (process_task_id, process_task_checklist_item_text)
select process_task_id, 'probe template line' from process_tasks where process_task_name = 'probe template task';
insert into process_runs (process_id, job_id, process_run_status)
select process_id, '9106-002', 'in_progress' from processes where process_key = 'behaviour_probe_0081';
select instantiate_process_tasks(process_run_id) as made
from process_runs r join processes p using (process_id) where p.process_key = 'behaviour_probe_0081';
select case when t.task_expected_days = 4 and d.task_checklist_total = 1
  then 'ok  instantiation copied the template''s 4 expected days and its checklist line'
  else 'FAIL: instantiated task has ' || coalesce(t.task_expected_days::text, 'null') || ' days and ' || d.task_checklist_total || ' lines' end
from tasks t join task_display d using (task_id)
where t.task_name = 'probe template task';

-- stage_completion: the probe process is open on 9106-002's Construction stage.
select case when processes_open >= 1 and processes_total >= processes_open
  then 'ok  stage_completion sees the open probe process on 9106-002 / Construction (' || processes_open || ' of ' || processes_total || ' open)'
  else 'FAIL: stage_completion reads ' || processes_open || ' open of ' || processes_total end
from stage_completion where job_id = '9106-002' and stage = 'Construction';

select case when exists (select 1 from property_defs where property_def_key = 'sitebook_id' and property_def_scope = 'job')
  then 'ok  sitebook_id is a job-level property definition'
  else 'FAIL: sitebook_id not seeded' end;

-- Left as found. process_runs does not cascade from processes (a run is history), so the
-- probe's run and its instantiated tasks go first.
delete from tasks where process_run_id in (select process_run_id from process_runs r join processes p using (process_id) where p.process_key = 'behaviour_probe_0081');
delete from process_runs where process_id in (select process_id from processes where process_key = 'behaviour_probe_0081');
delete from processes where process_key = 'behaviour_probe_0081';
delete from tasks where task_name = 'behaviour probe 0081';

-- ============================================================================
-- 41. Contacts show their company beside them; a party on a run belongs to its job (0082)
-- ============================================================================
\echo '--- 41. contact_display resolves company, role, primary email; a run-level party surfaces on the job'
insert into companies (company_name, company_abn) values ('Behaviour Plumbing 0082', '53004085616');
insert into contacts (contact_first_name, contact_last_name) values ('Behaviour', 'Plumber 0082');
insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary)
select contact_id, 'email', 'Behaviour.Plumber@Example.com', true from contacts where contact_last_name = 'Plumber 0082';
insert into contact_methods (contact_id, contact_method_kind, contact_method_value)
select contact_id, 'email', 'second@example.com' from contacts where contact_last_name = 'Plumber 0082';
insert into company_contacts (company_id, contact_id, company_contact_job_role)
select co.company_id, c.contact_id, 'Plumber' from companies co, contacts c
 where co.company_name = 'Behaviour Plumbing 0082' and c.contact_last_name = 'Plumber 0082';
insert into contact_classifications (contact_id, classification_id)
select contact_id, 'contractor' from contacts where contact_last_name = 'Plumber 0082';
select case when contact_company_name = 'Behaviour Plumbing 0082' and contact_job_role = 'Plumber'
             and contact_primary_email = 'Behaviour.Plumber@Example.com' and contact_classification_ids = array['contractor']
  then 'ok  contact_display: company beside the person, their role there, the PRIMARY email of two, the classification'
  else 'FAIL: contact_display read ' || coalesce(contact_company_name, 'no company') || ' / ' || coalesce(contact_job_role, 'no role') || ' / ' || coalesce(contact_primary_email, 'no email') end
from contact_display where contact_last_name = 'Plumber 0082';

-- Ending the employment takes the company off the person without losing the row.
update company_contacts set company_contact_ended_on = current_date
 where contact_id = (select contact_id from contacts where contact_last_name = 'Plumber 0082');
select case when contact_company_name is null
  then 'ok  ending the employment clears the company beside the person; the history row stays'
  else 'FAIL: an ended employment still shows ' || contact_company_name end
from contact_display where contact_last_name = 'Plumber 0082';

-- A party on a process run of 9106-002 lists under the job.
insert into processes (process_key, process_name, process_stage, process_scope, process_position)
values ('behaviour_probe_0082', 'Behaviour probe 0082', 'Construction', 'job', 998) on conflict (process_key) do nothing;
insert into process_runs (process_id, job_id, process_run_status)
select process_id, '9106-002', 'in_progress' from processes where process_key = 'behaviour_probe_0082';
insert into record_parties (process_run_id, company_id, party_role_id)
select r.process_run_id, co.company_id, 'contractor'
  from process_runs r join processes p using (process_id), companies co
 where p.process_key = 'behaviour_probe_0082' and co.company_name = 'Behaviour Plumbing 0082';
select case when count(*) = 1
  then 'ok  a party on a process run surfaces on its job (record_job_id 9106-002, process named)'
  else 'FAIL: expected 1 run-level party under 9106-002, found ' || count(*) end
from record_party_display where record_job_id = '9106-002' and process_name = 'Behaviour probe 0082';

-- Deleting a company that is a party is refused: end the party instead.
do $$
begin
  begin
    delete from companies where company_name = 'Behaviour Plumbing 0082';
    raise warning 'FAIL: a company with an open party was deleted';
  exception when foreign_key_violation then raise notice 'ok  a company on a record cannot be deleted; the party is ended instead';
  end;
end $$;

-- Left as found.
delete from record_parties where company_id = (select company_id from companies where company_name = 'Behaviour Plumbing 0082');
delete from process_runs where process_id in (select process_id from processes where process_key = 'behaviour_probe_0082');
delete from processes where process_key = 'behaviour_probe_0082';
delete from company_contacts where contact_id = (select contact_id from contacts where contact_last_name = 'Plumber 0082');
delete from contacts where contact_last_name = 'Plumber 0082';
delete from companies where company_name = 'Behaviour Plumbing 0082';

-- ============================================================================
-- 42. Notifications: assigned fires once to the assignee; the scan fires once a day (0083)
-- ============================================================================
\echo '--- 42. a task assignment notifies its assignee once, in-app sent and email queued; the scan does not repeat itself'
insert into tasks (job_id, task_name, task_assignee_id)
select '9106-002', 'behaviour probe 0083', profile_id from profiles where profile_email = 'behaviour-test@lofty.com.au';
select case when count(*) = 1 then 'ok  one task_assigned notification for the assignee'
  else 'FAIL: ' || count(*) || ' task_assigned notifications' end
from notifications n join tasks t using (task_id) where t.task_name = 'behaviour probe 0083' and n.notification_type_id = 'task_assigned';
select case when count(*) filter (where notification_delivery_channel = 'in_app' and notification_delivery_status = 'sent') = 1
             and count(*) filter (where notification_delivery_channel = 'email' and notification_delivery_status = 'queued') = 1
  then 'ok  in_app sent on the spot, email queued for the worker'
  else 'FAIL: deliveries were ' || string_agg(notification_delivery_channel || '=' || notification_delivery_status, ', ') end
from notification_deliveries d join notifications n using (notification_id) join tasks t using (task_id)
where t.task_name = 'behaviour probe 0083' and n.notification_type_id = 'task_assigned';

update tasks set task_status = 'in_progress', task_expected_days = 2 where task_name = 'behaviour probe 0083';
update tasks set task_started_at = now() - interval '9 days' where task_name = 'behaviour probe 0083';
select notify_scan() as first_scan \gset
select notify_scan() as second_scan \gset
-- The owning team and the managers hear too (their own rows); the assignee's row is the one counted.
select case when count(*) = 1 then 'ok  two scans, one task_overdue row for the assignee — the dedupe key holds for the day'
  else 'FAIL: ' || count(*) || ' task_overdue rows for the assignee after two scans' end
from notifications n join tasks t using (task_id) join profiles p on p.profile_id = n.profile_id
where t.task_name = 'behaviour probe 0083' and n.notification_type_id = 'task_overdue' and p.profile_email = 'behaviour-test@lofty.com.au';
-- 7 days late passes the managers' after_days of 5: a manager-or-above also hears.
select case when count(*) >= 1 then 'ok  seven days late escalates to a manager (after_days 5)'
  else 'FAIL: no manager heard about a task 7 days overdue' end
from notifications n join tasks t using (task_id) join profiles p on p.profile_id = n.profile_id
where t.task_name = 'behaviour probe 0083' and n.notification_type_id = 'task_overdue' and p.profile_permission >= 'manager';
delete from tasks where task_name = 'behaviour probe 0083';

\echo '--- 43. maintenance: warranty from the handover run; a number per job; due and health from the category; the scan does not repeat; mail nobody can match is refused'
-- Handover completed 40 days ago: inside the settings'' three months.
insert into process_runs (process_id, job_id, process_run_status, process_run_completed_at)
select process_id, '9106-002', 'complete', now() - interval '40 days' from processes where process_key = 'handover';
select case when job_is_in_warranty and job_warranty_ends_on = ((now() - interval '40 days')::date + interval '3 months')::date
  then 'ok  job_warranty: handed over 40 days ago, in warranty until handover + 3 months'
  else 'FAIL: job_warranty said in_warranty=' || job_is_in_warranty || ' ends ' || job_warranty_ends_on end
from job_warranty where job_id = '9106-002';

insert into maintenance_categories (maintenance_category_id, maintenance_category_name, party_role_id, maintenance_category_sla_days, maintenance_category_at_risk_lead_days)
values ('probe_tiling_0084', 'Probe tiling', 'contractor', 7, 2);
insert into contacts (contact_first_name, contact_last_name) values ('Probe', 'Reporter 0084');
insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary)
select contact_id, 'email', 'reporter0084@example.com', true from contacts where contact_last_name = 'Reporter 0084';
-- Reported 6 days ago on a 7-day SLA with a 2-day lead: due tomorrow, at risk since yesterday.
insert into maintenance_requests (job_id, maintenance_request_source, maintenance_request_reported_by_contact_id, maintenance_request_reported_at,
                                  maintenance_request_summary, maintenance_category_id, maintenance_request_owner_profile_id)
select '9106-002', 'email', contact_id, now() - interval '6 days', 'behaviour probe 0084 cracked tile', 'probe_tiling_0084',
       (select profile_id from profiles where profile_email = 'behaviour-test@lofty.com.au')
  from contacts where contact_last_name = 'Reporter 0084';
-- Reported 10 days ago: three days over.
insert into maintenance_requests (job_id, maintenance_request_source, maintenance_request_reported_at, maintenance_request_summary, maintenance_category_id, maintenance_request_owner_profile_id)
values ('9106-002', 'phone', now() - interval '10 days', 'behaviour probe 0084 loose grout', 'probe_tiling_0084',
        (select profile_id from profiles where profile_email = 'behaviour-test@lofty.com.au'));
select case when string_agg(maintenance_request_number, ',' order by maintenance_request_number) = '9106-002-M1,9106-002-M2'
  then 'ok  requests numbered 9106-002-M1 and 9106-002-M2'
  else 'FAIL: numbered ' || string_agg(maintenance_request_number, ',' order by maintenance_request_number) end
from maintenance_requests where job_id = '9106-002';
select case when maintenance_request_due_on = (maintenance_request_reported_at at time zone 'Australia/Adelaide')::date + 7
             and maintenance_request_at_risk_on = maintenance_request_due_on - 2
             and maintenance_request_health = 'at_risk' and maintenance_request_is_warranty
  then 'ok  M1: due = reported + 7, at risk = due − 2, health at_risk, inside warranty'
  else 'FAIL: M1 due ' || maintenance_request_due_on || ' at-risk ' || maintenance_request_at_risk_on || ' health ' || maintenance_request_health || ' warranty ' || maintenance_request_is_warranty end
from maintenance_request_display where maintenance_request_number = '9106-002-M1';
select case when maintenance_request_health = 'overdue' then 'ok  M2: three days over its SLA reads overdue'
  else 'FAIL: M2 health ' || maintenance_request_health end
from maintenance_request_display where maintenance_request_number = '9106-002-M2';
select case when maintenance_request_reported_by_email = 'reporter0084@example.com' then 'ok  the reporter''s email is resolved from contact_methods'
  else 'FAIL: reporter email ' || coalesce(maintenance_request_reported_by_email, 'null') end
from maintenance_request_display where maintenance_request_number = '9106-002-M1';

select maintenance_scan() as first_maintenance_scan \gset
select maintenance_scan() as second_maintenance_scan \gset
select case when count(*) = 2 then 'ok  two scans, one maintenance_sla_breach row per request for the owner — the dedupe key holds for the day'
  else 'FAIL: ' || count(*) || ' maintenance_sla_breach rows for the owner after two scans' end
from notifications n join profiles p on p.profile_id = n.profile_id
where n.notification_type_id = 'maintenance_sla_breach' and n.job_id = '9106-002' and p.profile_email = 'behaviour-test@lofty.com.au';
-- Three days over passes the managers'' after_days of 3: a manager who is NOT the owner hears
-- about M2 (the owner is an admin here and would hear as owner regardless — counting them
-- would prove nothing), and nobody but the owner hears about M1, one day short of the lead.
select case when count(*) filter (where n.notification_title like '9106-002-M2%') >= 1
             and count(*) filter (where n.notification_title like '9106-002-M1%') = 0
  then 'ok  three days over escalates to the managers (after_days 3); at risk stays with the owner'
  else 'FAIL: managers other than the owner heard about M2 ' || count(*) filter (where n.notification_title like '9106-002-M2%')
       || ' times and about M1 ' || count(*) filter (where n.notification_title like '9106-002-M1%') || ' times' end
from notifications n join profiles p on p.profile_id = n.profile_id
where n.notification_type_id = 'maintenance_sla_breach' and n.job_id = '9106-002'
  and p.profile_permission >= 'manager' and p.profile_email <> 'behaviour-test@lofty.com.au';

-- Inbound mail: the sender''s open request is found without a number; a stranger with no number is refused.
select case when matched_by = 'sender' and maintenance_request_number = '9106-002-M1' then 'ok  mail from the reporter with no number lands on their open request'
  else 'FAIL: matched_by ' || coalesce(matched_by, 'null') || ' on ' || coalesce(maintenance_request_number, 'null') end
from receive_maintenance_email('graph-in-0084-a', 'reporter0084@example.com', 'the tile again', 'still cracked');
do $$
begin
  perform receive_maintenance_email('graph-in-0084-b', 'stranger@example.com', 'hello', 'who is this');
  raise warning 'FAIL: mail from a stranger with no request number was accepted';
exception when others then
  if sqlerrm like '%log it by hand%' then raise notice 'ok  mail from a stranger with no request number is refused, for a person to log';
  else raise warning 'FAIL: unexpected refusing a stranger''s mail (%)', sqlerrm; end if;
end $$;

-- Left as found.
delete from maintenance_requests where job_id = '9106-002';
delete from notifications where notification_type_id like 'maintenance_%' and job_id = '9106-002';
delete from maintenance_categories where maintenance_category_id = 'probe_tiling_0084';
delete from contacts where contact_last_name = 'Reporter 0084';
delete from process_runs where job_id = '9106-002' and process_id = (select process_id from processes where process_key = 'handover');

-- ============================================================================
-- 44. The staged workbook (0087) loads through import_spine() and unloads without a trace.
--
-- Not a fixture: the real 801 rows, with Amber's decisions (0088): every job in Acquisition
-- & Development unless the sheet says "cancelling" (→ Cancelled); the owning team from the
-- named sales consultant when they are a user in one team, else A&D; shared old numbers
-- carried by no job. The numbering base is shifted to 2001 because this database already
-- has a project 9106 from §6, which is exactly the collision the base exists for (the live
-- load uses 1011). Rolled back at the end: the workbook is not loaded on the replay.
-- ============================================================================
\echo '--- 44. the staged workbook loads (796 jobs, 116 projects, 5 skipped), every job traces to its row, and unloads clean'
begin;
select case when count(*) = 801 and count(*) filter (where import_staging_job_spine ? 'skip_reason') = 5
  then 'ok  801 staging rows from the workbook, 5 with a skip_reason'
  else 'FAIL: ' || count(*) || ' staging rows, ' || count(*) filter (where import_staging_job_spine ? 'skip_reason') || ' skipped' end
from import_staging_jobs where import_staging_job_source = 'Lofty_Jobs_Grouped_by_Project.xlsx · project import';
select projects_made as wb_projects, jobs_made as wb_jobs, rows_skipped as wb_skipped, jobs_cancelled as wb_cancelled, teams_from_people as wb_people
from import_spine('Lofty_Jobs_Grouped_by_Project.xlsx · project import', 'acquisition_development', 'Acquisition & Development', 2001,
                  '{"cancelling": "cancelled", "on hold": "on_hold"}'::jsonb, '{"cancelling": "Cancelled"}'::jsonb, 'S · Sales Consultant', 'omit') \gset
select case when :wb_projects = 116 and :wb_jobs = 796 and :wb_skipped = 5
  then 'ok  the load made 116 projects and 796 jobs and skipped 5 rows'
  else 'FAIL: the load made ' || :wb_projects || ' projects, ' || :wb_jobs || ' jobs, skipped ' || :wb_skipped end;
-- The team rule on the real names: Paul (12 rows, Pre-construction Admin) and Gary P (3, Lofty
-- General) are users in one team; Brenton G and Mitch G are A&D anyway; Olivia, Michael B and
-- the 209 blank rows fall back. So 15 jobs left the fallback team.
select case when :wb_people = 15
       and (select count(*) from jobs where project_id between 2001 and 2121 and job_owning_team = 'pre_construction_admin') = 12
       and (select count(*) from jobs where project_id between 2001 and 2121 and job_owning_team = 'lofty_general') = 3
       and (select count(*) from jobs where project_id between 2001 and 2121 and job_owning_team = 'acquisition_development') = 781
  then 'ok  15 jobs took the named person''s team (12 Paul → Pre-construction Admin, 3 Gary → Lofty General); 781 are Acquisition & Development'
  else 'FAIL: ' || :wb_people || ' from people; PCA ' || (select count(*) from jobs where project_id between 2001 and 2121 and job_owning_team = 'pre_construction_admin')
       || ', LG ' || (select count(*) from jobs where project_id between 2001 and 2121 and job_owning_team = 'lofty_general')
       || ', A&D ' || (select count(*) from jobs where project_id between 2001 and 2121 and job_owning_team = 'acquisition_development') end;
-- The stage rule: 39 "cancelling" rows are Cancelled jobs; every other job is in A&D.
select case when :wb_cancelled = 39
       and count(*) filter (where job_stage = 'Cancelled') = 39
       and count(*) filter (where job_stage = 'Acquisition & Development') = 757
  then 'ok  39 jobs landed in Cancelled and 757 in Acquisition & Development'
  else 'FAIL: ' || count(*) filter (where job_stage = 'Cancelled') || ' Cancelled, ' || count(*) filter (where job_stage = 'Acquisition & Development') || ' A&D' end
from jobs where project_id between 2001 and 2121;
-- Every staged row that carries a spine has a job; an unshared old number is on the job, a
-- shared one is on no job ("ignore the seven old job numbers") and still on the row.
select case when count(*) = 0 then 'ok  every spine row has its job; unshared old numbers carried, shared ones omitted'
  else 'FAIL: ' || count(*) || ' spine rows without a matching job, or with the wrong old number' end
from import_staging_jobs s left join jobs j on j.job_id = s.import_staging_job_job_id
where s.import_staging_job_source = 'Lofty_Jobs_Grouped_by_Project.xlsx · project import'
  and not (s.import_staging_job_spine ? 'skip_reason')
  and (j.job_id is null
       or (coalesce((s.import_staging_job_spine ->> 'old_number_shared')::boolean, false) and j.job_number_old is not null)
       or (not coalesce((s.import_staging_job_spine ->> 'old_number_shared')::boolean, false) and j.job_number_old is distinct from s.import_staging_job_number_old));
-- Lot order: the workbook's 1004-02 (Lot 2) is job 2004-002; its old number 1288 is shared, so the job carries none.
select case when job_number_old is null and (select import_staging_job_number_old from import_staging_jobs where import_staging_job_job_id = '2004-002') = '1288'
  then 'ok  1004-02 became 2004-002, carrying no old number while its row still says 1288'
  else 'FAIL: 2004-002 carries old number ' || coalesce(job_number_old, 'null') end
from jobs where job_id = '2004-002';
-- Every insert is logged as an import, so the way back can tell its projects from anybody else's.
select case when count(*) = 116 then 'ok  116 project inserts logged with origin import'
  else 'FAIL: ' || count(*) || ' project inserts logged with origin import' end
from activity_audit where activity_audit_table = 'projects' and activity_audit_operation = 'INSERT' and activity_audit_origin = 'import'
  and activity_audit_project_id between 2001 and 2121;
-- The status words followed the map; the rest stayed on_track.
select case when count(*) filter (where job_status = 'cancelled') = 39 and count(*) filter (where job_status = 'on_hold') = 20
  then 'ok  39 jobs cancelled and 20 on hold, as the sheet''s words say'
  else 'FAIL: ' || count(*) filter (where job_status = 'cancelled') || ' cancelled, ' || count(*) filter (where job_status = 'on_hold') || ' on hold' end
from jobs where project_id between 2001 and 2121;
select projects_removed as un_projects, jobs_removed as un_jobs from unimport_spine('Lofty_Jobs_Grouped_by_Project.xlsx · project import') \gset
select case when :un_projects = 116 and :un_jobs = 796
       and not exists (select 1 from projects where project_id between 2001 and 2121)
       and not exists (select 1 from import_staging_jobs where import_staging_job_loaded_at is not null)
  then 'ok  unimport removed 116 projects and 796 jobs and cleared every stamp'
  else 'FAIL: unimport removed ' || :un_projects || ' projects and ' || :un_jobs || ' jobs; '
       || (select count(*) from projects where project_id between 2001 and 2121) || ' projects and '
       || (select count(*) from import_staging_jobs where import_staging_job_loaded_at is not null) || ' stamps remain' end;
rollback;

\echo '--- 45. the library round-trips, the touch trigger moves updated_at, and a document keeps its parent'
-- Outside a transaction on purpose, and that IS the check. `extensions.moddatetime`
-- writes now(), the TRANSACTION timestamp, so the same probe inside a DO block reports
-- updated_at equal to created_at whether the trigger fired or not — watched, in 0094,
-- which is why the assertion lives here instead of in the migration.
insert into report_templates (report_template_name, report_template_kind, report_template_scope, report_template_layout)
values ('__behaviour__ progress report', 'template', 'global',
        '{"widgets": [{"id": "w1", "kind": "heading", "options": {"text": "Summary"}}], "page": {"pageSize": "a4"}, "theme": "lofty"}'::jsonb);
update report_templates
   set report_template_layout = jsonb_set(report_template_layout, '{theme}', '"lofty-quiet"')
 where report_template_name = '__behaviour__ progress report';
select case
  when report_template_updated_at > report_template_created_at
   and report_template_layout -> 'widgets' -> 0 ->> 'kind' = 'heading'
   and report_template_layout ->> 'theme' = 'lofty-quiet'
   and report_template_kind = 'template'
  then 'ok  the layout round-tripped and the update moved report_template_updated_at'
  else 'FAIL: updated_at ' || report_template_updated_at || ' vs created_at ' || report_template_created_at
       || ', theme ' || coalesce(report_template_layout ->> 'theme', 'null') end
from report_templates where report_template_name = '__behaviour__ progress report';

-- A template and a section may share a name; two templates may not. Proved by writing
-- the section, because the refusal half is in constraints.sql.
insert into report_templates (report_template_name, report_template_kind)
values ('__behaviour__ progress report', 'section');
select case when count(*) = 2 then 'ok  a template and a section may share one name'
  else 'FAIL: ' || count(*) || ' rows named __behaviour__ progress report' end
from report_templates where report_template_name = '__behaviour__ progress report';

-- Retiring a template does NOT take the documents made from it, and they still name it.
-- Deleting it sets their pointer to null rather than removing the letter that went out.
insert into report_documents (report_document_title, report_template_id, job_id)
select '__behaviour__ letter', report_template_id, '9106-002'
  from report_templates
 where report_template_name = '__behaviour__ progress report' and report_template_kind = 'template';
delete from report_templates
 where report_template_name = '__behaviour__ progress report' and report_template_kind = 'template';
select case when count(*) = 1 and bool_and(report_template_id is null)
  then 'ok  deleting a template leaves the document, with its parent set to null'
  else 'FAIL: ' || count(*) || ' documents survived, parent still set on some' end
from report_documents where report_document_title = '__behaviour__ letter';

-- And deleting the JOB does take the document with it: a document about a job that no
-- longer exists is about nothing, and the cascade says so rather than leaving an orphan.
--
-- INSIDE a transaction that rolls back, and that is not fussiness. The first version of
-- this deleted 9106-002 for real, and every constraint probe after it in check.sh — a
-- dozen of them, all hanging off that one fixture job — went from biting to reporting
-- "FAIL: accepted", because the row they aimed at was gone. A check that destroys the
-- fixture the next check needs turns one assertion into a page of false alarms.
begin;
select count(*) as docs_before from report_documents where report_document_title = '__behaviour__ letter' \gset
delete from jobs where job_id = '9106-002';
select case when :docs_before = 1 and count(*) = 0
  then 'ok  deleting the job cascades to the documents about it'
  else 'FAIL: ' || count(*) || ' documents survived their job' end
from report_documents where report_document_title = '__behaviour__ letter';
rollback;

delete from report_documents where report_document_title like '__behaviour__%';
delete from report_templates where report_template_name like '__behaviour__%';
