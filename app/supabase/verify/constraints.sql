\set QUIET on
\pset tuples_only on
\echo '--- these must ALL be rejected ---'
\set ON_ERROR_STOP off
DO $$ BEGIN
  BEGIN
    INSERT INTO addresses (address_street_1,address_suburb,address_postcode,address_council)
    VALUES ('No Number St','Golden Grove','5125','City of Tea Tree Gully');
    RAISE WARNING 'FAIL: address with neither lot nor street number was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_has_a_number rejected it';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  addresses_has_a_number rejected it)', SQLERRM; END;

  BEGIN
    INSERT INTO addresses (address_lot_number,address_street_1,address_suburb,address_postcode,address_council)
    VALUES ('1','X St','Golden Grove','512','City of Tea Tree Gully');
    RAISE WARNING 'FAIL: 3-digit postcode was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_postcode_shape rejected 512';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  addresses_postcode_shape rejected 512)', SQLERRM; END;

  BEGIN
    INSERT INTO addresses (address_lot_number,address_street_1,address_suburb,address_postcode)
    VALUES ('1','X St','Golden Grove','5125');
    RAISE WARNING 'FAIL: SA address with no council was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_council_required_in_sa rejected it';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  addresses_council_required_in_sa rejected it)', SQLERRM; END;

  BEGIN
    INSERT INTO projects (project_id,project_original_address_id,project_current_address_id,project_type,project_created_by)
    SELECT 999, address_id, address_id, 'residential', (SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: project number below 1000 was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  projects_number_floor rejected 999';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  projects_number_floor rejected 999)', SQLERRM; END;

  BEGIN
    UPDATE jobs SET job_engaged_teams = ARRAY['design','not_a_team'] WHERE job_id LIKE '1106-%';
    RAISE WARNING 'FAIL: unknown team accepted into job_engaged_teams';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  validate_engaged_teams rejected not_a_team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  validate_engaged_teams rejected not_a_team)', SQLERRM; END;

  BEGIN
    UPDATE jobs SET job_owning_team = 'not_a_team' WHERE job_id LIKE '1106-%';
    RAISE WARNING 'FAIL: unknown owning team accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  job_owning_team FK rejected not_a_team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  job_owning_team FK rejected not_a_team)', SQLERRM; END;

  BEGIN
    INSERT INTO address_history (address_history_project_id,address_history_job_id,
      address_history_address_id,address_history_role,address_history_valid_from,address_history_valid_to)
    SELECT 1106,'1106-02',address_id,'current',now(),now() FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: address_history row with TWO parents accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  address_history_one_parent rejected two parents';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  address_history_one_parent rejected two parents)', SQLERRM; END;

  BEGIN
    INSERT INTO profile_teams (profile_id, team_id)
    SELECT profile_id,'not_a_team' FROM profiles LIMIT 1;
    RAISE WARNING 'FAIL: membership in a non-existent team accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  profile_teams FK rejected not_a_team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  profile_teams FK rejected not_a_team)', SQLERRM; END;

  BEGIN
    INSERT INTO jobs (project_id,job_sequence,job_original_address_id,job_current_address_id,job_owning_team,job_created_by)
    SELECT 1106,'02',address_id,address_id,'design',(SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: duplicate job_sequence within a project accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  unique(project_id,job_sequence) rejected a duplicate';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  unique(project_id,job_sequence) rejected a duplicate)', SQLERRM; END;

  BEGIN
    -- The composite FK: a job parked in a stage belonging to a DIFFERENT pipeline.
    INSERT INTO job_pipeline_positions (job_id, pipeline_id, pipeline_stage_id)
    SELECT (SELECT max(job_id) FROM jobs WHERE project_id=1106),
           (SELECT pipeline_id FROM pipelines WHERE pipeline_key='build_lifecycle'),
           (SELECT ps.pipeline_stage_id FROM pipeline_stages ps JOIN pipelines p USING (pipeline_id)
             WHERE p.pipeline_key='preconstruction' LIMIT 1);
    RAISE WARNING 'FAIL: job parked in a stage from another pipeline';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  composite FK rejected a stage from another pipeline';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  composite FK rejected a stage from another pipeline)', SQLERRM; END;

  BEGIN
    -- A pipeline cannot contain itself: point build_lifecycle at a stage of its own child.
    UPDATE pipelines SET pipeline_parent_stage_id =
      (SELECT ps.pipeline_stage_id FROM pipeline_stages ps JOIN pipelines p USING (pipeline_id)
        WHERE p.pipeline_key='preconstruction' LIMIT 1)
    WHERE pipeline_key='build_lifecycle';
    RAISE WARNING 'FAIL: a pipeline was allowed to contain itself';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  guard_pipeline_nesting rejected a cycle';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  guard_pipeline_nesting rejected a cycle)', SQLERRM; END;

  BEGIN
    UPDATE job_pipeline_positions SET job_pipeline_position_state='waiting',
           job_pipeline_position_waiting_on=NULL WHERE job_id='1106-02';
    RAISE WARNING 'FAIL: waiting on nobody was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  waiting must name a team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  waiting must name a team)', SQLERRM; END;

  BEGIN
    -- Two pipelines both claiming to be "what happens inside" the same stage.
    INSERT INTO pipelines (pipeline_key, pipeline_name, pipeline_scope, pipeline_parent_stage_id)
    SELECT 'rival', 'Rival', 'job', pipeline_parent_stage_id
    FROM pipelines WHERE pipeline_key='preconstruction';
    RAISE WARNING 'FAIL: two pipelines elaborate the same stage';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  one child pipeline per stage';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  one child pipeline per stage)', SQLERRM; END;

  BEGIN
    INSERT INTO job_stage_events (job_id, pipeline_id, job_stage_event_to_stage_id)
    SELECT '1106-02', (SELECT pipeline_id FROM pipelines WHERE pipeline_key='build_lifecycle'),
           (SELECT ps.pipeline_stage_id FROM pipeline_stages ps JOIN pipelines p USING (pipeline_id)
             WHERE p.pipeline_key='build_lifecycle' LIMIT 1);
    RAISE NOTICE 'note: job_stage_events accepts a direct insert as the table owner — RLS has no INSERT policy, so `authenticated` cannot. Checked separately.';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok  job_stage_events refused a direct insert';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  job_stage_events refused a direct insert)', SQLERRM; END;

  BEGIN
    -- The NULL that used to slip straight through the array validator.
    UPDATE jobs SET job_engaged_teams = ARRAY['design', NULL, 'not_a_team'] WHERE project_id = 1106;
    RAISE WARNING 'FAIL: a NULL let an unknown team into job_engaged_teams';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  a NULL no longer masks an unknown team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  a NULL no longer masks an unknown team)', SQLERRM; END;

  BEGIN
    -- The primary key must always equal its parts.
    UPDATE jobs SET job_id = '9999-99' WHERE project_id = 1106;
    RAISE WARNING 'FAIL: job_id was rewritten away from its project and sequence';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  job_id cannot be rewritten away from its parts';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  job_id cannot be rewritten away from its parts)', SQLERRM; END;

  BEGIN
    UPDATE projects SET project_original_address_id =
      (SELECT address_id FROM addresses LIMIT 1) WHERE project_id = 1106;
    RAISE NOTICE 'note: original address moved — allowed here because this runs as the owner with no auth.uid(); the guard defers to admin. Checked as a real user in rls.sql.';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok  original address refused';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  original address refused)', SQLERRM; END;

  BEGIN
    DELETE FROM teams WHERE team_id = 'selections';
    RAISE NOTICE 'note: team deleted as the owner. RLS has no DELETE policy for teams, so admins cannot — checked in rls.sql.';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok  team delete refused';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  team delete refused)', SQLERRM; END;

  BEGIN
    INSERT INTO task_dependencies (task_id, depends_on_task_id)
    SELECT d.task_id, t.task_id FROM tasks t, tasks d
     WHERE t.job_id='1106-02' AND d.job_id='1106-02'
       AND t.task_name='Released to Construction' AND d.task_name='Contract Deposit Paid';
    RAISE WARNING 'FAIL: a dependency cycle was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  guard_task_dependency_cycle rejected a cycle';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on cycle (%)', SQLERRM; END;

  BEGIN
    INSERT INTO tasks (job_id, project_id, task_name)
    VALUES ('1106-02', 1106, 'Two parents');
    RAISE WARNING 'FAIL: a task with two parents was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  tasks_one_parent rejected two parents';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on task parents (%)', SQLERRM; END;

  BEGIN
    INSERT INTO tasks (task_name) VALUES ('No parent at all');
    RAISE WARNING 'FAIL: an orphan task was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  tasks_one_parent rejected an orphan';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on orphan task (%)', SQLERRM; END;

  BEGIN
    -- Clearing the completion time on a task that is already done.
    --
    -- The trigger only fills it when a task BECOMES done, which is right — it must not
    -- quietly rewrite a completion time that is already recorded. So this is the CHECK's
    -- job, and being refused is the correct answer rather than being silently repaired:
    -- "done, and we no longer know when" is not a state worth accepting.
    UPDATE tasks SET task_completed_at = NULL
     WHERE job_id='1106-02' AND task_status='done';
    RAISE WARNING 'FAIL: a done task was left with no completion time';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a done task cannot lose its completion time';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on completion (%)', SQLERRM; END;

  BEGIN
    INSERT INTO task_dependencies (task_id, depends_on_task_id)
    SELECT a.task_id, b.task_id FROM tasks a, tasks b
     WHERE a.job_id='1106-02' AND a.task_name='Working Drawings'
       AND b.task_name='A task on another job' LIMIT 1;
    RAISE WARNING 'FAIL: a dependency crossed two different jobs';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a task cannot depend on another record''s task';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on cross-record dependency (%)', SQLERRM; END;
END $$;
