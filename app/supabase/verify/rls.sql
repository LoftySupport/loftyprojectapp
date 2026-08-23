-- Prove the security boundary AS `authenticated`, not as the table owner.
--
-- Everything in behaviour.sql and constraints.sql runs as postgres, which BYPASSES row
-- level security — a policy could be missing entirely and neither file would notice.
-- This one sets the role and the auth claim the way PostgREST does and asks what a real
-- signed-in person can actually see and do.
--
-- The app's can() checks hide controls; they are not security. Every one needs a
-- matching policy or it is decoration. This is where that gets tested.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

-- A real auth identity for the test person. The shim's auth.uid() reads a GUC instead of
-- a JWT, so this is the whole of "signing in".
insert into auth.users (id, email) values (gen_random_uuid(), 'behaviour-test@lofty.com.au')
on conflict do nothing;

update profiles p set profile_auth_user_id = u.id
from auth.users u
where u.email = 'behaviour-test@lofty.com.au'
  and p.profile_email = 'behaviour-test@lofty.com.au';

select profile_auth_user_id::text as uid from profiles
 where profile_email = 'behaviour-test@lofty.com.au' \gset

-- A SECOND address, so "move the original address" is a real move. With only one
-- address in the database the probe set the column to the value it already had, the
-- guard correctly returned early, and the absence of an exception read as the guard
-- having failed. A test that cannot distinguish "refused" from "nothing to do" proves
-- nothing.
insert into addresses (address_lot_number, address_street_1, address_suburb,
                       address_postcode, address_council, address_created_by)
select '99', 'Somewhere Else Road', 'Modbury', '5092', 'City of Tea Tree Gully',
       (select profile_id from profiles where profile_email='behaviour-test@lofty.com.au');

-- What Supabase grants the API roles. Without these, everything below fails on table
-- privileges rather than on policy, and would pass for the wrong reason.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

\echo '=== an ANONYMOUS visitor sees nothing ==='
set role anon;
select 'jobs: '     || count(*) from jobs;
select 'projects: ' || count(*) from projects;
select 'profiles: ' || count(*) from profiles;
select 'teams: '    || count(*) from teams;
reset role;

-- Deliberately at `user`, not admin: these probes are about what an ORDINARY signed-in
-- person can do, and the test profile is seeded as an admin, which would pass several of
-- them for the wrong reason.
update profiles set profile_permission = 'user'
 where profile_email = 'behaviour-test@lofty.com.au';

\echo '=== a signed-in ACTIVE person, at permission level `user` ==='
set role authenticated;
set request.jwt.claim.sub = :'uid';
select 'is_active_user: ' || is_active_user()::text;
select 'permission: '     || current_permission()::text;
select 'jobs visible: '   || count(*) from jobs;
select 'teams visible: '  || count(*) from teams;
-- The board's columns. `listStages()` reads these two, so a policy that hid them would
-- render every board with no columns and every stage filter with no options — an app that
-- looks broken rather than one that says why. Worth a count precisely because the failure
-- is silent: an empty list is a legal answer to a SELECT.
select 'pipelines visible: '       || count(*) from pipelines;
select 'pipeline stages visible: ' || count(*) from pipeline_stages;

\echo '--- probes (each must print ok) ---'
do $$
begin
  begin
    insert into job_stage_events (job_id, pipeline_id, job_stage_event_to_stage_id)
    values ((select job_id from jobs limit 1),
            (select pipeline_id from pipelines limit 1),
            (select pipeline_stage_id from pipeline_stages limit 1));
    raise warning 'FAIL: a real user wrote to the append-only stage log';
  exception
    when insufficient_privilege then raise notice 'ok  job_stage_events has no INSERT policy — the trigger writes it, nobody else';
    when others then raise warning 'FAIL: unexpected on stage log (%)', sqlerrm;
  end;

  begin
    insert into pipelines (pipeline_key, pipeline_name, pipeline_scope)
    values ('sneaky', 'Sneaky', 'job');
    raise warning 'FAIL: a non-superadmin created a pipeline';
  exception
    when insufficient_privilege then raise notice 'ok  pipelines refused a write below superadmin';
    when others then raise warning 'FAIL: unexpected on pipelines (%)', sqlerrm;
  end;

  -- RLS on DELETE and UPDATE FILTERS ROWS; it does not raise. A policy that denies
  -- everything makes the statement affect zero rows and succeed quietly, so these two
  -- have to count rows rather than catch an exception. Testing them the other way
  -- reports a pass whether the policy exists or not.
  begin
    delete from teams where team_id = 'lofty_general';
    if found then
      raise warning 'FAIL: a team was deleted — retirement is meant to be the only path';
    else
      raise notice 'ok  teams has no DELETE policy — team_is_active is the only way to retire one';
    end if;
  exception when others then raise warning 'FAIL: unexpected on team delete (%)', sqlerrm;
  end;

  begin
    -- Named explicitly, NOT `order by address_id desc limit 1`. address_id is a random
    -- uuid, so that ordering picked the address the project already had about half the
    -- time — the guard then correctly returned early, no exception was raised, and the
    -- probe reported a failure. A test whose subject depends on uuid sort order is a
    -- test that reports a different answer on Tuesdays.
    update projects set project_original_address_id =
      (select address_id from addresses where address_street_1 = 'Somewhere Else Road')
     where project_original_address_id is distinct from
      (select address_id from addresses where address_street_1 = 'Somewhere Else Road');
    raise warning 'FAIL: a user below admin moved the original address';
  exception
    when insufficient_privilege then raise notice 'ok  the original address does not move below admin';
    when others then raise warning 'FAIL: unexpected on original address (%)', sqlerrm;
  end;

  -- THE 0011 CHECK. The comments policies call current_profile_id(), which 0024 had
  -- revoked from `authenticated` on the grounds that no policy referenced it. A policy is
  -- evaluated with the CALLER's function privileges, so getting this wrong does not
  -- error — every comment simply becomes invisible to everybody, which is exactly how
  -- 0011 broke every read and write in the app.
  begin
    if (select count(*) from comments) > 0 then
      raise notice 'ok  comments are visible — current_profile_id() is executable by the caller';
    else
      raise warning 'FAIL: no comments visible. current_profile_id() is probably not granted to authenticated — see 0011.';
    end if;
  exception when others then raise warning 'FAIL: reading comments raised (%)', sqlerrm;
  end;

  -- Somebody else's comment is not yours to edit, even at the same permission level.
  begin
    update comments set comment_body = 'rewritten by someone else'
     where comment_created_by is distinct from (select current_profile_id());
    if found then
      raise warning 'FAIL: a user edited a comment they did not write';
    else
      raise notice 'ok  a comment can only be edited by its author or an admin';
    end if;
  exception when others then raise warning 'FAIL: unexpected editing another comment (%)', sqlerrm;
  end;

  begin
    insert into activity_events (job_id, activity_event_kind)
    values ((select job_id from jobs limit 1), 'forged');
    raise warning 'FAIL: a user wrote to the append-only activity feed';
  exception
    when insufficient_privilege then raise notice 'ok  activity_events has no INSERT policy';
    when others then raise warning 'FAIL: unexpected on activity_events (%)', sqlerrm;
  end;

  -- And the positive case, so this file proves the policies let the right things through
  -- as well as keeping the wrong things out. A read-only test suite that only ever
  -- asserts refusal passes just as happily against a database nobody can use.
  begin
    update jobs set job_status = 'at_risk';
    if found then
      raise notice 'ok  an ordinary user can still do ordinary work';
    else
      raise warning 'FAIL: a user could not update a job at all — the policies are too tight';
    end if;
  exception when others then raise warning 'FAIL: unexpected on ordinary update (%)', sqlerrm;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- A MANAGER MOVES JOBS. Lofty's answer, 23 August: "a manager can move jobs between
-- stages and lifecycle stages."
--
-- The policies already permit it — `permission_level` is an ordered enum and every write
-- policy on `jobs` and `job_pipeline_positions` compares `>= 'user'`, which a manager
-- clears. Probed anyway, and this is the reason: nothing in the harness ran at `manager`
-- at all, so "a manager can move a job" was a fact about how the enum sorts rather than
-- an observed one. The next person to tighten a policy to `= 'user'`, or to reorder the
-- enum, would break Lofty's stated rule and no check would say so.
--
-- Both halves are probed because they are two different mechanisms wearing one sentence:
-- the lifecycle is a column on `jobs`, a team's own process is a row in
-- `job_pipeline_positions`, and a policy change could easily reach one and not the other.
-- The claim has to go first. `reset role` puts the session back to postgres but leaves
-- request.jwt.claim.sub set, so guard_privileged_profile_columns() still saw the test
-- user — at `user` level — and refused with "Only an admin may change a profile". The
-- guard was right; the probe was asking as somebody it had just demoted.
reset request.jwt.claim.sub;
update profiles set profile_permission = 'manager'
 where profile_email = 'behaviour-test@lofty.com.au';

\echo '=== a MANAGER ==='
set role authenticated;
set request.jwt.claim.sub = :'uid';
select 'permission: ' || current_permission()::text;

\echo '--- probes (each must print ok) ---'
do $$
declare
  moved integer;
begin
  -- 1. The lifecycle. A column on `jobs`, so RLS filters rows rather than raising —
  --    ROW_COUNT, not the absence of an exception. Three probes in 0035 reported a pass
  --    because a statement that touches nothing succeeds.
  begin
    update jobs set job_stage = 'Construction' where job_stage is distinct from 'Construction';
    get diagnostics moved = row_count;
    if moved > 0 then
      raise notice 'ok  a manager moved % job(s) to another lifecycle phase', moved;
    else
      raise warning 'FAIL: a manager could not move a job between lifecycle phases';
    end if;
  exception when others then raise warning 'FAIL: unexpected moving a lifecycle phase (%)', sqlerrm;
  end;

  -- 2. A team's own process. A row in job_pipeline_positions, moved to a different stage
  --    of the SAME pipeline — the composite foreign key refuses a stage from another one,
  --    so a careless probe here fails for that reason and reads as a permission problem.
  begin
    update job_pipeline_positions jpp
       set pipeline_stage_id = (
             select ps.pipeline_stage_id from pipeline_stages ps
             where ps.pipeline_id = jpp.pipeline_id
               and ps.pipeline_stage_id is distinct from jpp.pipeline_stage_id
             order by ps.pipeline_stage_position limit 1);
    get diagnostics moved = row_count;
    if moved > 0 then
      raise notice 'ok  a manager moved % job(s) to another stage of their pipeline', moved;
    else
      raise warning 'FAIL: a manager could not move a job between pipeline stages';
    end if;
  exception when others then raise warning 'FAIL: unexpected moving a pipeline stage (%)', sqlerrm;
  end;

  -- 3. And the line that answer does NOT cross. Moving a job between stages and changing
  --    what the stages ARE are different acts; the second is superadmin's. Without this
  --    the two probes above would still pass if somebody opened `pipeline_stages` to
  --    everybody, which is the change that would quietly let a manager rename the
  --    lifecycle for the whole company.
  begin
    insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position)
    values ((select pipeline_id from pipelines where pipeline_key = 'build_lifecycle'), 'Invented', 99);
    raise warning 'FAIL: a manager added a stage to the lifecycle';
  exception
    when insufficient_privilege then raise notice 'ok  a manager moves jobs between stages but cannot change what the stages are';
    when others then raise warning 'FAIL: unexpected adding a stage (%)', sqlerrm;
  end;

  -- 4. How long a phase should take. Lofty's answer, same day: "there is no set limit for
  --    how long a phase should take — this needs to be an editable property." Nullable
  --    with no default is the "no set limit" half, and constraints.sql holds the check
  --    that a nonsense one is refused. This is the other half: that it can be edited at
  --    all, and by whom. Superadmin, because it is a property of the process rather than
  --    of a job — the same line as 3.
  begin
    update pipeline_stages set pipeline_stage_expected_days = 30;
    if found then
      raise warning 'FAIL: a manager set how long a phase should take — that is the process, not a job';
    else
      raise notice 'ok  expected days is editable, but not below superadmin';
    end if;
  exception
    when insufficient_privilege then raise notice 'ok  expected days is editable, but not below superadmin';
    when others then raise warning 'FAIL: unexpected setting expected days (%)', sqlerrm;
  end;
end $$;
reset role;

-- Left as it was found, so the file can be read twice and mean the same thing.
reset request.jwt.claim.sub;
update profiles set profile_permission = 'user'
 where profile_email = 'behaviour-test@lofty.com.au';
