\set QUIET on
\pset tuples_only on
\echo '--- these must ALL be rejected ---'
\set ON_ERROR_STOP off
DO $$ BEGIN
  BEGIN
    INSERT INTO addresses (address_street_1,address_suburb,address_postcode,address_council)
    VALUES ('No Number St','Golden Grove','5125','City of Tea Tree Gully');
    RAISE WARNING 'FAIL: address with neither lot nor street number was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_has_a_number rejected it'; END;

  BEGIN
    INSERT INTO addresses (address_lot_number,address_street_1,address_suburb,address_postcode,address_council)
    VALUES ('1','X St','Golden Grove','512','City of Tea Tree Gully');
    RAISE WARNING 'FAIL: 3-digit postcode was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_postcode_shape rejected 512'; END;

  BEGIN
    INSERT INTO addresses (address_lot_number,address_street_1,address_suburb,address_postcode)
    VALUES ('1','X St','Golden Grove','5125');
    RAISE WARNING 'FAIL: SA address with no council was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_council_required_in_sa rejected it'; END;

  BEGIN
    INSERT INTO projects (project_id,project_original_address_id,project_current_address_id,project_created_by)
    SELECT 999, address_id, address_id, (SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: project number below 1000 was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  projects_number_floor rejected 999'; END;

  BEGIN
    UPDATE jobs SET job_engaged_teams = ARRAY['design','not_a_team'] WHERE job_id LIKE '1106-%';
    RAISE WARNING 'FAIL: unknown team accepted into job_engaged_teams';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  validate_engaged_teams rejected not_a_team'; END;

  BEGIN
    UPDATE jobs SET job_owning_team = 'not_a_team' WHERE job_id LIKE '1106-%';
    RAISE WARNING 'FAIL: unknown owning team accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  job_owning_team FK rejected not_a_team'; END;

  BEGIN
    INSERT INTO address_history (address_history_project_id,address_history_job_id,
      address_history_address_id,address_history_role,address_history_valid_from,address_history_valid_to)
    SELECT 1106,'1106-02',address_id,'current',now(),now() FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: address_history row with TWO parents accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  address_history_one_parent rejected two parents'; END;

  BEGIN
    INSERT INTO profile_teams (profile_id, team_id)
    SELECT profile_id,'not_a_team' FROM profiles LIMIT 1;
    RAISE WARNING 'FAIL: membership in a non-existent team accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  profile_teams FK rejected not_a_team'; END;

  BEGIN
    INSERT INTO jobs (project_id,job_sequence,job_original_address_id,job_current_address_id,job_created_by)
    SELECT 1106,'02',address_id,address_id,(SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: duplicate job_sequence within a project accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  unique(project_id,job_sequence) rejected a duplicate'; END;
END $$;
