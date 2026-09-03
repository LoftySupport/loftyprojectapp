\set QUIET on
\pset tuples_only on
\echo '--- these must ALL be rejected ---'
\set ON_ERROR_STOP off
DO $$
DECLARE
  -- Row counts, so a probe whose target fixture disappears says so instead of
  -- reporting that the constraint it guards has stopped biting.
  touched integer;
  -- The address the job-number probe below aims at, held so its absence can be reported
  -- as itself rather than as a NULL update.
  no_number uuid;
BEGIN
  BEGIN
    INSERT INTO addresses (address_lot_number,address_street_1,address_suburb,address_postcode,address_council)
    VALUES ('1','X St','Golden Grove','512','City of Tea Tree Gully');
    RAISE WARNING 'FAIL: 3-digit postcode was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_postcode_shape rejected 512';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  addresses_postcode_shape rejected 512)', SQLERRM; END;

  -- What an SA address may still not carry: a council is optional since 0073, but the
  -- enum is SA-only, so an interstate one has no valid value to give.
  BEGIN
    INSERT INTO addresses (address_lot_number,address_street_1,address_suburb,address_state,
                           address_postcode,address_council)
    VALUES ('1','X St','Ballarat','VIC','3350','City of Tea Tree Gully');
    RAISE WARNING 'FAIL: a council outside SA was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  addresses_council_is_sa rejected a VIC address with a council';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  addresses_council_is_sa rejected it)', SQLERRM; END;

  BEGIN
    INSERT INTO projects (project_id,project_original_address_id,project_current_address_id,project_type,project_created_by)
    SELECT 999, address_id, address_id, 'residential', (SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: project number below 1000 was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  projects_number_floor rejected 999';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  projects_number_floor rejected 999)', SQLERRM; END;

  BEGIN
    UPDATE jobs SET job_engaged_teams = ARRAY['design','not_a_team'] WHERE job_id LIKE '9106-%';
    RAISE WARNING 'FAIL: unknown team accepted into job_engaged_teams';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  validate_engaged_teams rejected not_a_team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  validate_engaged_teams rejected not_a_team)', SQLERRM; END;

  BEGIN
    UPDATE jobs SET job_owning_team = 'not_a_team' WHERE job_id LIKE '9106-%';
    RAISE WARNING 'FAIL: unknown owning team accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  job_owning_team FK rejected not_a_team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  job_owning_team FK rejected not_a_team)', SQLERRM; END;

  BEGIN
    INSERT INTO address_history (address_history_project_id,address_history_job_id,
      address_history_address_id,address_history_role,address_history_valid_from,address_history_valid_to)
    SELECT 9106,'9106-002',address_id,'current',now(),now() FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: address_history row with TWO parents accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  address_history_one_parent rejected two parents';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  address_history_one_parent rejected two parents)', SQLERRM; END;

  BEGIN
    INSERT INTO profile_teams (profile_id, team_id)
    SELECT profile_id,'not_a_team' FROM profiles LIMIT 1;
    RAISE WARNING 'FAIL: membership in a non-existent team accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  profile_teams FK rejected not_a_team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  profile_teams FK rejected not_a_team)', SQLERRM; END;

  -- '002', not '02'. 0073 widened every job number to three digits, and this probe went
  -- on inserting the old shape: '02' stopped colliding with anything, the insert was
  -- accepted, and the probe reported that the unique constraint had stopped biting. It
  -- was right — that is what sent jobs_sequence_is_padded into 0073, so that the two
  -- spellings of job 2 can no longer both exist.
  BEGIN
    INSERT INTO jobs (project_id,job_sequence,job_original_address_id,job_current_address_id,job_owning_team,job_created_by)
    SELECT 9106,'002',address_id,address_id,'design',(SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: duplicate job_sequence within a project accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  unique(project_id,job_sequence) rejected a duplicate';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  unique(project_id,job_sequence) rejected a duplicate)', SQLERRM; END;

  -- 0073: three digits is the shape, not merely what the trigger happens to emit. The
  -- app never sets job_sequence — the trigger does — but the import writes rows directly, and
  -- an unpadded '2' beside an existing '002' is two jobs a person reads as one.
  BEGIN
    INSERT INTO jobs (project_id,job_sequence,job_original_address_id,job_current_address_id,job_owning_team,job_created_by)
    SELECT 9106,'7',address_id,address_id,'design',(SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: an unpadded job_sequence was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  jobs_sequence_is_padded rejected ''7''';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  jobs_sequence_is_padded rejected 7)', SQLERRM; END;

  -- The other side: a four-digit number past 999 is legal, and a zero-padded one is not.
  BEGIN
    INSERT INTO jobs (project_id,job_sequence,job_original_address_id,job_current_address_id,job_owning_team,job_created_by)
    SELECT 9106,'0100',address_id,address_id,'design',(SELECT profile_id FROM profiles LIMIT 1) FROM addresses LIMIT 1;
    RAISE WARNING 'FAIL: a four-digit job_sequence with a leading zero was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  jobs_sequence_is_padded rejected ''0100''';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  jobs_sequence_is_padded rejected 0100)', SQLERRM; END;

  BEGIN
    -- The composite FK: a job parked in a stage belonging to a DIFFERENT pipeline.
    INSERT INTO job_pipeline_positions (job_id, pipeline_id, pipeline_stage_id)
    SELECT (SELECT max(job_id) FROM jobs WHERE project_id=9106),
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
           job_pipeline_position_waiting_on=NULL WHERE job_id='9106-002';
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
    SELECT '9106-002', (SELECT pipeline_id FROM pipelines WHERE pipeline_key='build_lifecycle'),
           (SELECT ps.pipeline_stage_id FROM pipeline_stages ps JOIN pipelines p USING (pipeline_id)
             WHERE p.pipeline_key='build_lifecycle' LIMIT 1);
    RAISE NOTICE 'note: job_stage_events accepts a direct insert as the table owner — RLS has no INSERT policy, so `authenticated` cannot. Checked separately.';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ok  job_stage_events refused a direct insert';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  job_stage_events refused a direct insert)', SQLERRM; END;

  BEGIN
    -- The NULL that used to slip straight through the array validator.
    UPDATE jobs SET job_engaged_teams = ARRAY['design', NULL, 'not_a_team'] WHERE project_id = 9106;
    RAISE WARNING 'FAIL: a NULL let an unknown team into job_engaged_teams';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'ok  a NULL no longer masks an unknown team';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  a NULL no longer masks an unknown team)', SQLERRM; END;

  BEGIN
    -- The primary key must always equal its parts.
    UPDATE jobs SET job_id = '9999-99' WHERE project_id = 9106;
    RAISE WARNING 'FAIL: job_id was rewritten away from its project and sequence';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  job_id cannot be rewritten away from its parts';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  job_id cannot be rewritten away from its parts)', SQLERRM; END;

  BEGIN
    UPDATE projects SET project_original_address_id =
      (SELECT address_id FROM addresses LIMIT 1) WHERE project_id = 9106;
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
     WHERE t.job_id='9106-002' AND d.job_id='9106-002'
       AND t.task_name='Released to Construction' AND d.task_name='Contract Deposit Paid';
    RAISE WARNING 'FAIL: a dependency cycle was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  guard_task_dependency_cycle rejected a cycle';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on cycle (%)', SQLERRM; END;

  BEGIN
    INSERT INTO tasks (job_id, project_id, task_name)
    VALUES ('9106-002', 9106, 'Two parents');
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
     WHERE job_id='9106-002' AND task_status='done';
    RAISE WARNING 'FAIL: a done task was left with no completion time';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a done task cannot lose its completion time';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on completion (%)', SQLERRM; END;

  BEGIN
    INSERT INTO task_dependencies (task_id, depends_on_task_id)
    SELECT a.task_id, b.task_id FROM tasks a, tasks b
     WHERE a.job_id='9106-002' AND a.task_name='Working Drawings'
       AND b.task_name='A task on another job' LIMIT 1;
    RAISE WARNING 'FAIL: a dependency crossed two different jobs';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a task cannot depend on another record''s task';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on cross-record dependency (%)', SQLERRM; END;

  BEGIN
    UPDATE variations SET variation_status='cancelled', variation_cancelled_reason=NULL
     WHERE job_id='9106-002' AND variation_sequence=2;
    RAISE WARNING 'FAIL: a variation was cancelled with no reason';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a cancelled variation must say why';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on cancel reason (%)', SQLERRM; END;

  BEGIN
    UPDATE variations SET variation_number='9999-99-V9'
     WHERE job_id='9106-002' AND variation_sequence=2;
    RAISE WARNING 'FAIL: a variation number was rewritten away from its parts';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a variation number cannot be rewritten';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on variation number (%)', SQLERRM; END;

  BEGIN
    -- An approver with no approval date. The reverse — a date with no name — is allowed
    -- on purpose, for history imported from a system that did not record who.
    UPDATE variations SET variation_approved_by = (SELECT profile_id FROM profiles LIMIT 1),
           variation_approved_at = NULL
     WHERE job_id='9106-002' AND variation_sequence=2;
    RAISE WARNING 'FAIL: an approver with no approval date was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  an approver must carry an approval date';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on approval (%)', SQLERRM; END;

  BEGIN
    INSERT INTO variation_reopened_tasks (variation_id, task_id)
    SELECT v.variation_id, t.task_id FROM variations v, tasks t
     WHERE v.job_id='9106-002' AND v.variation_sequence=2
       AND t.task_name='A task on another job' LIMIT 1;
    RAISE WARNING 'FAIL: a variation reopened a task on a different job';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a variation cannot reopen another job''s task';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on cross-job rework (%)', SQLERRM; END;

  BEGIN
    INSERT INTO taggings (tag_id, job_id) VALUES ('urgent','9106-002');
    RAISE WARNING 'FAIL: the same tag was applied to the same job twice';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  a tag applies to a record once';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on duplicate tag (%)', SQLERRM; END;

  BEGIN
    INSERT INTO document_links (document_id, project_id, job_id)
    SELECT document_id, 9106, '9106-002' FROM documents LIMIT 1;
    RAISE WARNING 'FAIL: a document link with two parents was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a document link has exactly one parent';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on document link parents (%)', SQLERRM; END;

  BEGIN
    INSERT INTO comments (comment_body) VALUES ('Attached to nothing');
    RAISE WARNING 'FAIL: a comment on no record was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a comment must hang off a record';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on orphan comment (%)', SQLERRM; END;

  BEGIN
    INSERT INTO tags (tag_id, tag_name, tag_colour) VALUES ('bad_colour','Bad colour','red');
    RAISE WARNING 'FAIL: a non-hex tag colour was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  a tag colour must be hex';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on tag colour (%)', SQLERRM; END;

  -- 0035 cut the lifecycle from nine stages to the five Lofty confirmed, and moved
  -- job_stage from an enum to text so a vocabulary that changes can lose a value. Text
  -- only constrains what a check constrains, so this is the probe that makes the column
  -- mean anything.
  --
  -- The row count is checked, not assumed. Written first against '9106-01', which the
  -- fixtures do not create — the UPDATE matched nothing, raised nothing, and the probe
  -- reported that the constraint had failed to bite. That is the third zero-row statement
  -- this harness has mistaken for a result, so this one says so out loud instead.
  BEGIN
    UPDATE jobs SET job_stage = 'Working Drawings & Contracts' WHERE job_id = '9106-002';
    GET DIAGNOSTICS touched = ROW_COUNT;
    IF touched = 0 THEN
      RAISE WARNING 'FAIL: the stage probe matched no job — the fixture it targets is gone';
    ELSE
      RAISE WARNING 'FAIL: a retired stage name was accepted on a job';
    END IF;
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  job_stage admits only the five lifecycle phases';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on retired stage name (%)', SQLERRM; END;

  BEGIN
    UPDATE jobs SET job_stage = 'Maintenance' WHERE job_id = '9106-002';
    GET DIAGNOSTICS touched = ROW_COUNT;
    IF touched = 0 THEN
      RAISE WARNING 'FAIL: the stage probe matched no job — the fixture it targets is gone';
    ELSE
      RAISE NOTICE 'ok  ...and does admit one of them, so the probe above is not a false pass';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL: a real lifecycle stage was rejected (%)', SQLERRM; END;

  -- 0037 moved "an address needs a street and a number" off `addresses` and onto jobs,
  -- because Lofty buys land before it has a frontage and a project may sit at nothing
  -- more than a suburb. 0073 moved the rest of it the same way — a council, a street
  -- and the numbers are all optional now (Amber: "the only thing required is suburb,
  -- state, postcode and project type"). The guarantee is only worth relaxing if the
  -- half that still matters is enforced somewhere, so the four probes below are that
  -- half: three shapes a project may legitimately take, and then a job, which is a
  -- dwelling, refused at every one of them.
  BEGIN
    INSERT INTO addresses (address_suburb, address_state, address_postcode, address_council)
    VALUES ('Mount Gambier', 'SA', '5290', 'City of Mount Gambier');
    RAISE NOTICE 'ok  a project-shaped address needs no street';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL: a locality address was refused (%)', SQLERRM; END;

  -- 0073, first half: an SA address with no council at all. The form fills the council
  -- in from the suburb and cannot for the four suburbs that span two, and a guess on a
  -- lodged application is worse than a blank.
  BEGIN
    INSERT INTO addresses (address_suburb, address_state, address_postcode)
    VALUES ('Mount Gambier', 'SA', '5290');
    RAISE NOTICE 'ok  an SA address may be created with no council';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL: an SA address with no council was refused (%)', SQLERRM; END;

  -- 0073, second half: the two shapes 0037 called half an address. A street with no
  -- number is "the Mt Gambier division, Penola Road"; a lot number with no street is
  -- how every plan of division reads before the roads are named.
  BEGIN
    INSERT INTO addresses (address_street_1, address_suburb, address_state, address_postcode)
    VALUES ('Penola Road', 'Mount Gambier', 'SA', '5290');
    RAISE NOTICE 'ok  a street with no number is accepted';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL: a street with no number was refused (%)', SQLERRM; END;

  BEGIN
    INSERT INTO addresses (address_lot_number, address_suburb, address_state, address_postcode)
    VALUES ('7', 'Mount Gambier', 'SA', '5290');
    RAISE NOTICE 'ok  a lot number with no street is accepted';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'FAIL: a lot number with no street was refused (%)', SQLERRM; END;

  BEGIN
    UPDATE jobs SET job_current_address_id =
      (SELECT address_id FROM addresses WHERE address_precision = 'locality' LIMIT 1)
     WHERE job_id = '9106-002';
    GET DIAGNOSTICS touched = ROW_COUNT;
    IF touched = 0 THEN
      RAISE WARNING 'FAIL: the address probe matched no job — the fixture it targets is gone';
    ELSE
      RAISE WARNING 'FAIL: a job was moved to a locality address it cannot be built at';
    END IF;
  EXCEPTION
    -- The trigger raises a bare exception, so this catches by class rather than by code.
    WHEN raise_exception THEN RAISE NOTICE 'ok  a job cannot sit at a locality — it needs a street';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on the job address guard (%)', SQLERRM; END;

  -- The half 0073 handed to the trigger. `addresses_street_needs_a_number` used to make
  -- this unwritable; with it gone, `address_precision` alone would have called Penola
  -- Road a street address and let a job be built at a road with no number on it.
  BEGIN
    SELECT address_id INTO no_number FROM addresses
      WHERE address_street_1 = 'Penola Road'
        AND address_street_number IS NULL AND address_lot_number IS NULL LIMIT 1;
    IF no_number IS NULL THEN
      -- Said out loud rather than left to the UPDATE: setting the column to NULL is a
      -- different refusal, and it would read as this probe passing.
      RAISE WARNING 'FAIL: the no-number address the probe needs was never created';
    ELSE
      UPDATE jobs SET job_current_address_id = no_number WHERE job_id = '9106-002';
      GET DIAGNOSTICS touched = ROW_COUNT;
      IF touched = 0 THEN
        RAISE WARNING 'FAIL: the no-number probe matched no job — the fixture it targets is gone';
      ELSE
        RAISE WARNING 'FAIL: a job was moved to a street with no number on it';
      END IF;
    END IF;
  EXCEPTION
    WHEN raise_exception THEN RAISE NOTICE 'ok  a job cannot sit at a street with no number either';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected on the job number guard (%)', SQLERRM; END;

  -- 0043: a property definition's three vocabularies are all CHECKed.
  BEGIN
    INSERT INTO property_defs (property_def_key, property_def_label, property_def_scope,
                               property_def_stage, property_def_owning_team, property_def_format)
    VALUES ('Bad Key', 'X', 'project', 'Construction', 'design', 'text');
    RAISE WARNING 'FAIL: a property key with spaces and capitals was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  property_defs_key_is_a_slug rejected "Bad Key"';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  property_defs_key_is_a_slug)', SQLERRM; END;

  BEGIN
    INSERT INTO property_defs (property_def_key, property_def_label, property_def_scope,
                               property_def_stage, property_def_owning_team, property_def_format)
    VALUES ('fencing_type', 'Fencing type', 'site', 'Construction', 'design', 'text');
    RAISE WARNING 'FAIL: a property at scope "site" was accepted — project and job are the only levels';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  property_defs_scope_is_project_or_job rejected "site"';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  property_defs_scope)', SQLERRM; END;

  BEGIN
    INSERT INTO property_defs (property_def_key, property_def_label, property_def_scope,
                               property_def_stage, property_def_owning_team, property_def_format)
    VALUES ('fencing_type', 'Fencing type', 'project', 'Framing', 'design', 'text');
    RAISE WARNING 'FAIL: a property capturing at stage "Framing" was accepted — not a lifecycle stage';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  property_defs_stage_is_a_lifecycle_stage rejected "Framing"';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  property_defs_stage)', SQLERRM; END;

  BEGIN
    INSERT INTO property_defs (property_def_key, property_def_label, property_def_scope,
                               property_def_stage, property_def_owning_team, property_def_format)
    VALUES ('fencing_type', 'Fencing type', 'project', 'Construction', 'design', 'paragraph');
    RAISE WARNING 'FAIL: a property with format "paragraph" was accepted — not a known format';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  property_defs_format_is_known rejected "paragraph"';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  property_defs_format)', SQLERRM; END;

  -- ------------------------------------------------- the tracker (0060-0063)
  BEGIN
    INSERT INTO feedback (feedback_kind, feedback_title, feedback_stage)
    VALUES ('bug', 'A stage that does not exist', 'triaged');
    RAISE WARNING 'FAIL: an unknown feedback stage was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  feedback_stage_is_known rejected "triaged"';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  feedback_stage_is_known)', SQLERRM; END;

  BEGIN
    INSERT INTO roadmap_phases (roadmap_phase_name, roadmap_phase_position,
                                roadmap_phase_starts_on, roadmap_phase_ends_on)
    VALUES ('Backwards', 901, DATE '2026-10-01', DATE '2026-09-01');
    RAISE WARNING 'FAIL: a phase ending before it starts was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  roadmap_phase_dates_in_order rejected an end before a start';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  roadmap_phase_dates_in_order)', SQLERRM; END;

  -- A phase with no dates at all must be ACCEPTED — the check is written to allow it, and
  -- an unscheduled phase is the normal state of anything past the next one. Probed here
  -- rather than assumed, because "dates in order" is one careless rewrite away from
  -- "dates required", which would force somebody to invent a date to save a phase.
  BEGIN
    INSERT INTO roadmap_phases (roadmap_phase_name, roadmap_phase_position)
    VALUES ('__constraint_probe_undated__', 902);
    RAISE NOTICE 'ok  an undated phase is allowed — unscheduled is a real state';
    DELETE FROM roadmap_phases WHERE roadmap_phase_name = '__constraint_probe_undated__';
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'FAIL: an undated roadmap phase was refused (%)', SQLERRM; END;

  BEGIN
    INSERT INTO roadmap_phases (roadmap_phase_name, roadmap_phase_position)
    VALUES ('__constraint_probe_a__', 903);
    INSERT INTO roadmap_phases (roadmap_phase_name, roadmap_phase_position)
    VALUES ('__constraint_probe_b__', 903);
    RAISE WARNING 'FAIL: two phases claimed position 903';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  roadmap_phases_position_idx refused a second phase in one slot';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  roadmap_phases_position_idx)', SQLERRM; END;
  DELETE FROM roadmap_phases WHERE roadmap_phase_name LIKE '__constraint_probe%';

  BEGIN
    INSERT INTO releases (release_version) VALUES ('   ');
    RAISE WARNING 'FAIL: a release with a blank version was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  release_version_not_blank rejected whitespace';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  release_version_not_blank)', SQLERRM; END;

  BEGIN
    INSERT INTO releases (release_version) VALUES ('__constraint_probe__');
    INSERT INTO release_entries (release_id, release_entry_kind, release_entry_summary)
    SELECT release_id, 'improved', 'Not one of the four verbs'
      FROM releases WHERE release_version = '__constraint_probe__';
    RAISE WARNING 'FAIL: a changelog line of kind "improved" was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  release_entry_kind_is_known rejected "improved"';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  release_entry_kind_is_known)', SQLERRM; END;
  DELETE FROM releases WHERE release_version = '__constraint_probe__';

  BEGIN
    INSERT INTO feedback (feedback_kind, feedback_title) VALUES ('bug', '__constraint_probe__');
    INSERT INTO feedback_attachments (feedback_id, feedback_attachment_path)
    SELECT feedback_id, '/same/object.png' FROM feedback WHERE feedback_title = '__constraint_probe__';
    INSERT INTO feedback_attachments (feedback_id, feedback_attachment_path)
    SELECT feedback_id, '/same/object.png' FROM feedback WHERE feedback_title = '__constraint_probe__';
    RAISE WARNING 'FAIL: two attachment rows pointed at one stored object';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'ok  feedback_attachment_path is unique — one row per object';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  feedback_attachment_path unique)', SQLERRM; END;
  DELETE FROM feedback WHERE feedback_title = '__constraint_probe__';

  -- --------------------------------------------------- the Canny round (0064-0067)
  -- comments_one_parent had to be REWRITTEN to add the fifth parent, and a rewritten
  -- constraint is one that can quietly come back weaker. So: a comment claiming two
  -- parents must still be refused.
  -- The row these four probes act on, planted in a block of its own.
  --
  -- Not inside the first one, and this is a plpgsql fact worth knowing: BEGIN…EXCEPTION
  -- opens a subtransaction, so when the probe below is REFUSED — which is the pass — the
  -- rollback takes the parent row with it, and every probe after it silently acts on
  -- nothing. Watched happening: the self-merge probe reported "a request was merged into
  -- itself" because the UPDATE matched no rows at all.
  BEGIN
    INSERT INTO feedback (feedback_kind, feedback_title) VALUES ('bug', '__constraint_probe__');
    -- Reports "note:" rather than staying silent, because check.sh counts BEGIN blocks
    -- against reported lines to catch a run that aborted early. A block that says nothing
    -- makes that count wrong and the harness announce a failure it does not have.
    RAISE NOTICE 'note: planted the row the four probes below act on';
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'FAIL: could not plant the constraint probe row (%)', SQLERRM; END;

  BEGIN
    INSERT INTO comments (feedback_id, job_id, comment_body)
    SELECT (SELECT feedback_id FROM feedback WHERE feedback_title = '__constraint_probe__'),
           job_id, 'two parents' FROM jobs LIMIT 1;
    RAISE WARNING 'FAIL: a comment on BOTH a job and a request was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  comments_one_parent still refuses two parents after 0064 widened it';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  comments_one_parent)', SQLERRM; END;

  -- A stage note is a note ON a request. On a job it would be a value with nothing to
  -- mean — the stage it names belongs to a vocabulary jobs do not use.
  BEGIN
    INSERT INTO comments (job_id, comment_body, comment_feedback_stage)
    SELECT job_id, 'stage note on a job', 'planned' FROM jobs LIMIT 1;
    RAISE WARNING 'FAIL: a stage note was accepted on a job';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  comments_stage_note_is_on_a_request rejected a note on a job';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  stage note parent)', SQLERRM; END;

  -- 0066: a request cannot be its own duplicate. The trigger refuses chains; this is the
  -- one case a CHECK can see on its own, and it holds even for a write that bypasses the
  -- trigger.
  BEGIN
    UPDATE feedback SET feedback_merged_into_id = feedback_id
     WHERE feedback_title = '__constraint_probe__';
    RAISE WARNING 'FAIL: a request was merged into itself';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  feedback_not_merged_into_itself rejected a self-merge';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  self-merge)', SQLERRM; END;

  -- 0067: and a vote cannot be added on your own behalf — the CHECK that replaced a
  -- policy clause the OR'd policies were quietly ignoring.
  BEGIN
    INSERT INTO feedback_votes (feedback_id, profile_id, feedback_vote_added_by)
    SELECT (SELECT feedback_id FROM feedback WHERE feedback_title = '__constraint_probe__'),
           profile_id, profile_id FROM profiles LIMIT 1;
    RAISE WARNING 'FAIL: a vote was added on the voter''s own behalf';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  feedback_vote_added_by_is_not_the_voter rejected a self-added vote';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  self-added vote)', SQLERRM; END;

  DELETE FROM feedback WHERE feedback_title = '__constraint_probe__';

  -- 0081: a lead longer than the duration would flag a task at risk before it started.
  BEGIN
    INSERT INTO tasks (job_id, task_name, task_expected_days, task_at_risk_lead_days)
    VALUES ('9106-002', 'constraint probe 0081', 7, 9);
    RAISE WARNING 'FAIL: a 9-day at-risk lead on a 7-day task was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  tasks_at_risk_lead_within_duration rejected lead 9 on 7 days';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  tasks_at_risk_lead_within_duration rejected lead 9 on 7 days)', SQLERRM; END;

  -- 0081: a checklist line with no words is not a line.
  BEGIN
    INSERT INTO task_checklist_items (task_id, task_checklist_item_text)
    SELECT task_id, '  ' FROM tasks WHERE job_id = '9106-002' LIMIT 1;
    IF NOT FOUND THEN RAISE NOTICE 'note: no task on 9106-002 to hang a blank checklist line on'; ELSE
    RAISE WARNING 'FAIL: a blank checklist line was accepted'; END IF;
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  task_checklist_items_text_is_not_blank rejected a blank line';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  task_checklist_items_text_is_not_blank rejected a blank line)', SQLERRM; END;

  -- 0082: an ABN is eleven digits, an email has an @, a party names somebody, one primary email per person.
  BEGIN
    INSERT INTO companies (company_name, company_abn) VALUES ('Constraint probe co 0082', '12345');
    RAISE WARNING 'FAIL: a five-digit ABN was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  companies_abn_is_eleven_digits rejected 12345';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  companies_abn_is_eleven_digits rejected 12345)', SQLERRM; END;

  BEGIN
    INSERT INTO record_parties (job_id, party_role_id) VALUES ('9106-002', 'contractor');
    RAISE WARNING 'FAIL: a party naming nobody was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  record_parties_names_somebody rejected a party with no contact and no company';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  record_parties_names_somebody rejected it)', SQLERRM; END;

  BEGIN
    INSERT INTO contact_methods (contact_method_kind, contact_method_value) VALUES ('email', 'nobody@example.com');
    RAISE WARNING 'FAIL: a contact method with no party was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  contact_methods_one_party rejected a method belonging to nobody';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  contact_methods_one_party rejected it)', SQLERRM; END;

  -- 0084: one settings row; a lead longer than the SLA would flag a request at risk on arrival;
  -- a request needs words; an offer names somebody. The CHECKs fire before the FK triggers,
  -- so a made-up item id still proves the CHECK and not the key.
  BEGIN
    INSERT INTO maintenance_settings (maintenance_setting_id) VALUES (2);
    RAISE WARNING 'FAIL: a second maintenance_settings row was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  maintenance_settings_is_one_row rejected a second row';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  maintenance_settings_is_one_row)', SQLERRM; END;

  BEGIN
    INSERT INTO maintenance_categories (maintenance_category_id, maintenance_category_name, maintenance_category_sla_days, maintenance_category_at_risk_lead_days)
    VALUES ('constraint_probe_0084', 'Constraint probe', 3, 5);
    RAISE WARNING 'FAIL: a 5-day at-risk lead on a 3-day SLA was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  maintenance_categories_lead_within_sla rejected lead 5 on 3 days';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  maintenance_categories_lead_within_sla)', SQLERRM; END;

  BEGIN
    INSERT INTO maintenance_requests (job_id, maintenance_request_summary) VALUES ('9106-002', '   ');
    RAISE WARNING 'FAIL: a maintenance request with a blank summary was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  maintenance_requests_summary_is_not_blank rejected a blank summary';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  maintenance_requests_summary_is_not_blank)', SQLERRM; END;

  BEGIN
    INSERT INTO maintenance_assignments (maintenance_item_id) VALUES (gen_random_uuid());
    RAISE WARNING 'FAIL: an offer naming no company and no contact was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok  maintenance_assignments_names_somebody rejected an offer to nobody';
    WHEN OTHERS THEN RAISE WARNING 'FAIL: unexpected %  (ok  maintenance_assignments_names_somebody)', SQLERRM; END;
END $$;
