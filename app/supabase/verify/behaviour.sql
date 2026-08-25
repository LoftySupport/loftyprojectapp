\set ON_ERROR_STOP on
-- a person to own the rows (the seed migrations already put people here)
insert into profiles (profile_first_name, profile_last_name, profile_email, profile_permission)
values ('Behaviour','Test','behaviour-test@lofty.com.au','admin')
on conflict (profile_email) do nothing;

-- an address
insert into addresses (address_lot_number, address_street_1, address_suburb,
                       address_postcode, address_council, address_created_by)
select 'Lot 3','Corner Street','Golden Grove','5125','City of Tea Tree Gully', profile_id from profiles where profile_email='behaviour-test@lofty.com.au';

\echo '--- 1. consolidated address includes lot number and postcode'
select address_consolidated from addresses;

\echo '--- 2. project_id starts at 1000 and IS the key'
insert into projects (project_original_address_id, project_current_address_id, project_type, project_created_by)
select address_id, address_id, 'residential', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select project_id, project_status, project_proposed_dwellings from projects;

\echo '--- 3. default_current_address filled the pair from one side'
insert into projects (project_original_address_id, project_type, project_created_by)
select address_id, 'development', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select project_id, (project_original_address_id = project_current_address_id) as pair_matches
from projects order by project_id;

\echo '--- 4. job_id is stamped 1000-01, 1000-02 and the FK IS the project number'
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select 1000, address_id, address_id, 'design', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select 1000, address_id, address_id, 'design', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select job_id, project_id, job_sequence, job_owning_team, job_stage from jobs order by job_id;

\echo '--- 5. gaps are permanent: delete 1000-01, next job is 1000-03 not 1000-02'
delete from jobs where job_id = '1000-01';
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select 1000, address_id, address_id, 'design', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select job_id from jobs order by job_id;

\echo '--- 6. RENUMBER: 1000 -> 1106. on update cascade moves the FK, resync moves job_id'
update projects set project_id = 1106 where project_id = 1000;
select job_id, project_id from jobs order by job_id;

\echo '--- 7. bump_project_no_seq: next generated number is above the hand-set one'
insert into projects (project_original_address_id, project_type, project_created_by)
select address_id, 'development', (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select max(project_id) as next_number from projects;

\echo '--- 8. moddatetime maintains the prefixed updated_at column'
-- Compared against its own previous value, not against created_at: step 6's renumber
-- already fired this trigger through the cascade, so created_at is not a live baseline.
select max(job_updated_at) as before_update from jobs where job_id like '1106-%' \gset
update jobs set job_status = 'at_risk' where job_id like '1106-%';
select bool_and(job_updated_at > :'before_update'::timestamptz) as touched_on_update
from jobs where job_id like '1106-%';

\echo '--- 9. job_engaged_teams accepts real teams'
update jobs set job_engaged_teams = array['design','estimating'] where job_id like '1106-%';
select job_id, job_engaged_teams from jobs order by job_id limit 1;

\echo '--- 10. address_history follows the new key types'
insert into address_history (address_history_project_id, address_history_address_id,
  address_history_role, address_history_valid_from, address_history_valid_to)
select 1106, address_id, 'current', now() - interval '1 day', now() from addresses;
select address_history_project_id, address_history_role from address_history;

\echo '--- 11. views read'
select project_id, project_current_address, project_is_current from project_display;
select job_id, project_id, job_is_current, job_suburb from job_display order by job_id limit 2;

\echo '--- 12. the lifecycle pipeline seeded its nine stages, in order'
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
select '1106-02', p.pipeline_id, ps.pipeline_stage_id
from pipelines p join pipeline_stages ps using (pipeline_id)
where p.pipeline_key = 'build_lifecycle' and ps.pipeline_stage_name = 'Pre-construction';

insert into job_pipeline_positions (job_id, pipeline_id, pipeline_stage_id)
select '1106-02', p.pipeline_id, ps.pipeline_stage_id
from pipelines p join pipeline_stages ps using (pipeline_id)
where p.pipeline_key = 'preconstruction' and ps.pipeline_stage_name = 'Working Drawings';

select p.pipeline_name, ps.pipeline_stage_name, jpp.job_pipeline_position_state
from job_pipeline_positions jpp
join pipelines p using (pipeline_id)
join pipeline_stages ps on ps.pipeline_stage_id = jpp.pipeline_stage_id
where jpp.job_id = '1106-02' order by p.pipeline_position, p.pipeline_name;

\echo '--- 15. moving a stage writes history and resets the clock; a state change does not'
update job_pipeline_positions set pipeline_stage_id = (
  select ps.pipeline_stage_id from pipeline_stages ps join pipelines p using (pipeline_id)
  where p.pipeline_key = 'preconstruction' and ps.pipeline_stage_name = 'Development Approval')
where job_id = '1106-02'
  and pipeline_id = (select pipeline_id from pipelines where pipeline_key = 'preconstruction');

select count(*) as stage_events_logged from job_stage_events where job_id = '1106-02';
select coalesce(f.pipeline_stage_name,'(none)') as moved_from, t.pipeline_stage_name as moved_to
from job_stage_events e
left join pipeline_stages f on f.pipeline_stage_id = e.job_stage_event_from_stage_id
join pipeline_stages t on t.pipeline_stage_id = e.job_stage_event_to_stage_id
where e.job_id = '1106-02' order by e.job_stage_event_id;

\echo '--- 16. blocked is a state: the job keeps its real stage'
update job_pipeline_positions
   set job_pipeline_position_state = 'waiting', job_pipeline_position_waiting_on = 'estimating'
 where job_id = '1106-02'
   and pipeline_id = (select pipeline_id from pipelines where pipeline_key = 'preconstruction');
select ps.pipeline_stage_name as still_at, jpp.job_pipeline_position_state, jpp.job_pipeline_position_waiting_on
from job_pipeline_positions jpp join pipeline_stages ps on ps.pipeline_stage_id = jpp.pipeline_stage_id
where jpp.job_id = '1106-02'
  and jpp.pipeline_id = (select pipeline_id from pipelines where pipeline_key = 'preconstruction');
select (select count(*) from job_stage_events where job_id='1106-02') as events_unchanged_by_state_move;

\echo '--- 17. deleting the HIGHEST job does not reissue its number'
select job_id as highest from jobs where project_id = 1106 order by job_id desc limit 1 \gset
delete from jobs where job_id = :'highest';
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team, job_created_by)
select 1106, address_id, address_id, 'design',
       (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au')
from addresses;
select :'highest' as deleted, (select max(job_id) from jobs where project_id=1106) as next_issued,
       (select max(job_id) from jobs where project_id=1106) <> :'highest' as number_not_reused;

\echo '--- 18. renaming a team slug reaches job_engaged_teams too'
update jobs set job_engaged_teams = array['design','estimating'] where project_id = 1106;
update teams set team_id = 'design_team' where team_id = 'design';
select job_id, job_engaged_teams from jobs where project_id = 1106 order by job_id limit 1;
-- and the job is still editable afterwards, which is the part that actually bites
update jobs set job_status = 'on_track' where project_id = 1106;
select 'job still editable after the rename' as check;
update teams set team_id = 'design' where team_id = 'design_team';

\echo '--- 19. the array is normalised: duplicates and nulls do not survive'
update jobs set job_engaged_teams = array['estimating','design','estimating'] where project_id = 1106;
select distinct job_engaged_teams as sorted_and_deduplicated from jobs where project_id = 1106;

\echo '--- 20. tasks: a fan-out, and what is ready to start'
insert into tasks (job_id, task_name, task_owning_team, task_position)
select '1106-02', n, 'design', r::smallint
from (values ('Contract Deposit Paid',1),('Order Soil Test',2),('Order Prelim FCR',3),
             ('Working Drawings',4),('Released to Construction',5)) v(n,r);

-- Deposit releases three things at once; the release waits on all three.
insert into task_dependencies (task_id, depends_on_task_id, task_dependency_lag_days)
select t.task_id, d.task_id, 14
from tasks t, tasks d
where t.job_id='1106-02' and d.job_id='1106-02'
  and d.task_name='Contract Deposit Paid'
  and t.task_name in ('Order Soil Test','Order Prelim FCR','Working Drawings');

insert into task_dependencies (task_id, depends_on_task_id)
select t.task_id, d.task_id
from tasks t, tasks d
where t.job_id='1106-02' and d.job_id='1106-02'
  and t.task_name='Released to Construction'
  and d.task_name in ('Order Soil Test','Order Prelim FCR','Working Drawings');

select task_name as ready_now from tasks_ready where job_id='1106-02' order by task_name;

-- A task on a DIFFERENT job, so the cross-record dependency probe in constraints.sql has
-- something real to aim at. Without it that insert matches no rows, does nothing, raises
-- nothing, and reports the guard as broken.
insert into tasks (job_id, task_name, task_owning_team)
select max(job_id), 'A task on another job', 'design' from jobs where project_id=1106
  and job_id <> '1106-02';

\echo '--- 21. finishing the root releases exactly the three that waited on it'
update tasks set task_status='done' where job_id='1106-02' and task_name='Contract Deposit Paid';
select task_name as ready_now from tasks_ready where job_id='1106-02' order by task_name;

\echo '--- 22. completion is stamped by the database, and reopening clears it'
-- has_person is false here and that is correct: this runs as postgres with no JWT, so
-- current_profile_id() has nobody to return. The point of the check is has_time, which
-- the database fills in whether or not it knows who did it.
select task_name, task_completed_at is not null as has_time,
       task_completed_by is not null as has_person_no_jwt_so_false
from tasks where job_id='1106-02' and task_name='Contract Deposit Paid';
update tasks set task_status='open' where job_id='1106-02' and task_name='Contract Deposit Paid';
select task_name, task_completed_at is null as time_cleared
from tasks where job_id='1106-02' and task_name='Contract Deposit Paid';

\echo '--- 23. a cancelled predecessor does not freeze what is behind it'
update tasks set task_status='done' where job_id='1106-02' and task_name='Contract Deposit Paid';
update tasks set task_status='cancelled' where job_id='1106-02' and task_name='Order Prelim FCR';
update tasks set task_status='done' where job_id='1106-02'
  and task_name in ('Order Soil Test','Working Drawings');
select task_name as ready_now from tasks_ready where job_id='1106-02' order by task_name;

\echo '--- 24. THREE variations on one job at once, each with its own team'
insert into variations (job_id, variation_title, variation_reason, variation_origin,
                        variation_status, variation_current_team)
values ('1106-02','Tiles unavailable','Supplier discontinued the range','supplier',
        'with_us','selections'),
       ('1106-02','Client wants a wider driveway','Requested at the site walk','client',
        'waiting_on_client','estimating'),
       ('1106-02','Beam size correction','Engineer revised the span','consultant',
        'with_us','design');
select variation_number, variation_current_team, variation_status, variation_origin
from variations where job_id='1106-02' order by variation_sequence;

\echo '--- 25. the job badge is derived, so it cannot go stale'
select variations_open, variations_with_client, variations_completed
from job_variation_summary where job_id='1106-02';

\echo '--- 26. a deleted variation number is never reissued'
delete from variations where variation_number='1106-02-V3';
insert into variations (job_id, variation_title) values ('1106-02','Raised after the delete');
select variation_number as next_issued from variations
where job_id='1106-02' order by variation_sequence desc limit 1;

\echo '--- 27. REWORK: the variation reopens finished work, and it is counted'
-- Contract Deposit Paid and Working Drawings are done from step 23.
insert into variation_reopened_tasks (variation_id, task_id)
select v.variation_id, t.task_id
from variations v, tasks t
where v.variation_number='1106-02-V1' and t.job_id='1106-02'
  and t.task_name in ('Contract Deposit Paid','Working Drawings','Order Soil Test');

select variation_number, tasks_reopened, tasks_that_were_finished
from variation_rework where variation_number='1106-02-V1';

\echo '--- 28. the snapshot survives the task being reopened afterwards'
update tasks set task_status='open'
 where job_id='1106-02' and task_name in ('Contract Deposit Paid','Working Drawings');
select 'task completed_at now cleared: ' ||
       (select count(*) from tasks where job_id='1106-02'
         and task_name='Working Drawings' and task_completed_at is null)::text;
select variation_number, tasks_that_were_finished as still_counted_as_rework
from variation_rework where variation_number='1106-02-V1';

\echo '--- 29. approving a variation stamps it and it lands in the cost'
update variations set variation_status='completed', variation_cost=4250.00,
       variation_days_impact=7
 where variation_number='1106-02-V1';
select variation_approved_at is not null as stamped,
       variation_cost, variation_days_impact
from variations where variation_number='1106-02-V1';
select variations_open, variations_approved_cost, variations_approved_days
from job_variation_summary where job_id='1106-02';

\echo '--- 30. ONE document, attached to the project AND both its jobs'
insert into documents (document_name, document_category, document_storage_path)
values ('Soil report — bore logs','report','projects/1106/soil-report.pdf');

insert into document_links (document_id, project_id)
select document_id, 1106 from documents where document_name like 'Soil report%';
insert into document_links (document_id, job_id)
select d.document_id, j.job_id from documents d, jobs j
where d.document_name like 'Soil report%' and j.project_id = 1106;

select d.document_name,
       count(*) filter (where l.project_id is not null) as on_projects,
       count(*) filter (where l.job_id is not null) as on_jobs,
       (select count(*) from documents where document_name like 'Soil report%') as stored_copies
from documents d join document_links l using (document_id)
where d.document_name like 'Soil report%' group by d.document_name;

\echo '--- 31. superseding a drawing: the chain says which is current'
insert into documents (document_name, document_category) values ('Working drawing rev A','drawing');
insert into documents (document_name, document_category, document_supersedes_id)
select 'Working drawing rev B','drawing', document_id from documents where document_name='Working drawing rev A';
select document_name from documents_current where document_category='drawing';

\echo '--- 32. a comment records that it was edited, but only when the body changes'
insert into comments (job_id, comment_body) values ('1106-02','Client asked about the tiles today.');
select comment_edited_at is null as not_edited_yet from comments where job_id='1106-02';
update comments set comment_body='Client asked about the tiles this morning.' where job_id='1106-02';
select comment_edited_at is not null as marked_edited from comments where job_id='1106-02';

\echo '--- 33. tags, and the same tag twice is a double-click not a fact'
insert into tags (tag_id, tag_name, tag_colour) values ('urgent','Urgent','#d9534f');
insert into taggings (tag_id, job_id) values ('urgent','1106-02');
select t.tag_name, count(*) as times_applied from taggings tg join tags t using (tag_id)
where tg.job_id='1106-02' group by t.tag_name;

\echo '--- 34. the job timeline reads comments and events as one stream'
insert into activity_events (job_id, activity_event_kind, activity_event_detail)
values ('1106-02','stage_changed','{"from":"Working Drawings","to":"Development Approval"}');
select entry_kind, entry_text, entry_was_edited from job_timeline
where job_id='1106-02' order by entry_at;

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

select event_type, (occurred_at is not null) as has_time
from login_activity
where email = 'signin-test@lofty.com.au'
order by event_type;

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
