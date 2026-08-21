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
insert into projects (project_original_address_id, project_current_address_id, project_created_by)
select address_id, address_id, (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select project_id, project_status, project_proposed_dwellings from projects;

\echo '--- 3. default_current_address filled the pair from one side'
insert into projects (project_original_address_id, project_created_by)
select address_id, (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select project_id, (project_original_address_id = project_current_address_id) as pair_matches
from projects order by project_id;

\echo '--- 4. job_id is stamped 1000-01, 1000-02 and the FK IS the project number'
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_created_by)
select 1000, address_id, address_id, (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_created_by)
select 1000, address_id, address_id, (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select job_id, project_id, job_sequence, job_owning_team, job_stage from jobs order by job_id;

\echo '--- 5. gaps are permanent: delete 1000-01, next job is 1000-03 not 1000-02'
delete from jobs where job_id = '1000-01';
insert into jobs (project_id, job_original_address_id, job_current_address_id, job_created_by)
select 1000, address_id, address_id, (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select job_id from jobs order by job_id;

\echo '--- 6. RENUMBER: 1000 -> 1106. on update cascade moves the FK, resync moves job_id'
update projects set project_id = 1106 where project_id = 1000;
select job_id, project_id from jobs order by job_id;

\echo '--- 7. bump_project_no_seq: next generated number is above the hand-set one'
insert into projects (project_original_address_id, project_created_by)
select address_id, (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au') from addresses;
select max(project_id) as next_number from projects;

\echo '--- 8. moddatetime maintains the prefixed updated_at column'
select job_updated_at = job_created_at as untouched from jobs where job_id like '1106-%' limit 1;
update jobs set job_status = 'at_risk' where job_id like '1106-%';
select job_updated_at > job_created_at as touched_on_update from jobs where job_id like '1106-%' limit 1;

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
