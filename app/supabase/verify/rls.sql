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
-- Supabase also grants the API roles usage on `extensions` (pg_trgm operators in searches,
-- pgcrypto in offer_maintenance_item run as the caller); the shim has to say so too.
grant usage on schema extensions to authenticated, anon;
--
-- The TABLE grants are NOT here any more. They are default privileges in
-- supabase-shim.sql, which runs before the migrations, so each table gets them as it is
-- created — the way Supabase does it. Granting on `all tables` from here ran after every
-- migration and re-granted whatever a migration had revoked on purpose, which made 0095's
-- column revoke read as broken when it was not. See the note in the shim.

-- Planted as the owner, before any role is assumed: 0064's internal lane can only be
-- written by an admin, and the probe that matters is whether an ordinary person can READ
-- one. auth.uid() is null here, so the insert guard passes through — the same carve-out
-- every guard in this schema makes for migrations and seeds.
insert into feedback (feedback_kind, feedback_title)
values ('idea', '__rls_probe_parent__');
insert into comments (feedback_id, comment_body, comment_is_internal)
select feedback_id, '__rls_probe_internal__', true
  from feedback where feedback_title = '__rls_probe_parent__';

\echo '=== an ANONYMOUS visitor is refused, not answered ==='
-- These used to print `jobs: 0`, `projects: 0` and so on — RLS on, no policy reaching anon,
-- zero rows. Since 0101 anon holds no privilege on any table in `public`, so the same
-- statement is refused before RLS gets a say, and a probe that expects an answer of zero
-- would abort this file on the first `permission denied`. The distinction is the point:
-- "0 rows" left the table's name and columns discoverable through pg_graphql; "refused"
-- does not. Each probe below prints ok on the refusal and FAIL on an answer of any size.
do $$
declare
  n int;
  t text;
begin
  foreach t in array array['jobs', 'projects', 'profiles', 'teams', 'maintenance_message_secrets']
  loop
    begin
      set local role anon;
      execute format('select count(*) from public.%I', t) into n;
      reset role;
      raise warning 'FAIL: anon was answered on % (% rows) — the table is back on the map', t, n;
    exception
      when insufficient_privilege then
        reset role;
        raise notice 'ok  anon is refused on % at the privilege, not by RLS', t;
    end;
  end loop;

  -- The whole schema, not four names: one table with a stray grant is one table
  -- discoverable, and a probe over a fixed list would not notice the eighty-ninth.
  select string_agg(table_name || ':' || privilege_type, ', ' order by table_name) into t
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public';
  if t is null then
    raise notice 'ok  anon holds no privilege on any table or view in public';
  else
    raise warning 'FAIL: anon still holds a privilege in public: %', t;
  end if;
end $$;

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

  -- 0048: a saved view is private. Two halves, because they are different mechanisms:
  -- the WITH CHECK stops you writing a view onto somebody else, and the USING stops you
  -- reading or removing theirs. A policy with only the first would let anybody list the
  -- whole company's saved views, which is a person's working habits.
  begin
    insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
    values ((select profile_id from profiles
              where profile_email <> 'behaviour-test@lofty.com.au' limit 1),
            'jobs', '__rls_probe__', 'view=Table');
    raise warning 'FAIL: a saved view was written onto somebody else';
  exception
    when insufficient_privilege then raise notice 'ok  saved_views refused a view written onto another person';
    when others then raise warning 'FAIL: unexpected writing another person''s saved view (%)', sqlerrm;
  end;

  begin
    -- Planted as the owner (this block runs as `authenticated`, so the insert itself is
    -- the WITH CHECK passing for your own row), then read back and removed.
    insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
    values ((select profile_id from profiles where profile_email = 'behaviour-test@lofty.com.au'),
            'jobs', '__rls_probe__', 'view=Table');
    if (select count(*) from saved_views where saved_view_name = '__rls_probe__') = 1 then
      raise notice 'ok  saved_views: your own view is yours to read';
    else
      raise warning 'FAIL: a person could not read the saved view they just made';
    end if;
    delete from saved_views where saved_view_name = '__rls_probe__';
  exception when others then raise warning 'FAIL: unexpected on your own saved view (%)', sqlerrm;
  end;

  -- 0049's demo gate is probed AFTER this block — see the note below. It cannot live in
  -- here, and finding out why fixed a check that had been reporting a failure it did not
  -- have.

  -- 0050: preferences are yours alone. The same two halves as saved_views, and the
  -- reason this table exists rather than a column on profiles: the policy that would
  -- have let somebody save preferences onto their own profiles row would also have let
  -- them edit profile_permission on it.
  begin
    insert into user_preferences (profile_id, user_preference_payload)
    values ((select profile_id from profiles
              where profile_email <> 'behaviour-test@lofty.com.au' limit 1),
            '{"landingPage":"Jobs"}'::jsonb);
    raise warning 'FAIL: preferences were written onto somebody else';
  exception
    when insufficient_privilege then raise notice 'ok  user_preferences refused a write onto another person';
    when unique_violation then raise notice 'ok  user_preferences refused a write onto another person';
    when others then raise warning 'FAIL: unexpected writing another person''s preferences (%)', sqlerrm;
  end;

  begin
    insert into user_preferences (profile_id, user_preference_payload)
    values ((select profile_id from profiles where profile_email = 'behaviour-test@lofty.com.au'),
            '{"landingPage":"Jobs"}'::jsonb)
    on conflict (profile_id) do update set user_preference_payload = excluded.user_preference_payload;
    if (select count(*) from user_preferences) = 1 then
      raise notice 'ok  user_preferences: your own bag is yours, and only yours is visible';
    else
      raise warning 'FAIL: a person saw % preference rows, expected only their own', (select count(*) from user_preferences);
    end if;
    delete from user_preferences;
  exception when others then raise warning 'FAIL: unexpected on your own preferences (%)', sqlerrm;
  end;

  -- 0051: a shared view is readable by the team and editable only by its owner. The
  -- split read/write policies are the whole safety here — a widened `for all` would
  -- have let anybody in Construction delete Deanna's view. Probed as the test person
  -- against a view somebody else owns and shares with a team they are both in.
  declare
    other_p uuid; shared_team text; touched int;
  begin
    select p.profile_id, pt.team_id into other_p, shared_team
    from profiles p join profile_teams pt on pt.profile_id = p.profile_id
    where p.profile_email <> 'behaviour-test@lofty.com.au'
      and pt.team_id in (select team_id from profile_teams
                          where profile_id = (select current_profile_id()))
    limit 1;

    if other_p is null then
      raise notice 'ok  (skipped: nobody else shares a team with the test person)';
    else
      -- Planted privileged would need a role change; instead assert the shape that
      -- matters — the write policies never admit a row that is not yours.
      update saved_views set saved_view_name = saved_view_name
       where profile_id <> (select current_profile_id());
      get diagnostics touched = row_count;
      if touched = 0 then
        raise notice 'ok  saved_views: no view belonging to somebody else is writable, shared or not';
      else
        raise warning 'FAIL: % view(s) belonging to others were writable', touched;
      end if;
    end if;
  exception when others then
    raise warning 'FAIL: unexpected on shared saved views (%)', sqlerrm;
  end;

  -- 0052, REVERSED BY 0060: bugs and requests. The read used to be admin-only and this
  -- probe asserted a non-admin saw NOTHING. It now asserts the opposite, and the flip is
  -- deliberate: Amber's reason for the tracker was "this will help stop people saying I
  -- want this to happen when it is already planned", which a queue nobody can see cannot
  -- do. What did not change is the write — see the next two blocks.
  begin
    insert into feedback (profile_id, feedback_kind, feedback_title, feedback_page)
    values ((select current_profile_id()), 'bug', '__rls_probe__', '/jobs');
    if (select count(*) from feedback where feedback_title = '__rls_probe__') = 1 then
      raise notice 'ok  feedback: an ordinary person reports, and can read the tracker back (0060)';
    else
      raise warning 'FAIL: an ordinary person could not read the tracker they just wrote to';
    end if;

    -- 0065: reporting follows you. Asserted HERE, before anything has voted, and that
    -- placement is the whole probe: further down the file a vote has already been cast on
    -- this request, and follow_on_vote() would have created the same row — so the check
    -- passed with follow_on_report() dropped. Watched doing exactly that.
    if (select count(*) from feedback_follows fl
          join feedback f on f.feedback_id = fl.feedback_id
         where f.feedback_title = '__rls_probe__') = 1 then
      raise notice 'ok  feedback_follows: reporting follows you, by trigger';
    else
      raise warning 'FAIL: reporting did not follow the person who reported it';
    end if;
  exception when others then raise warning 'FAIL: unexpected reporting a bug (%)', sqlerrm;
  end;

  -- 0060: the stage is superadmin's. At `user` the UPDATE policy matches no row, so the
  -- refusal is a row count of zero — the trigger never even runs. The admin case, where
  -- the policy passes and the trigger is the only thing standing in the way, is probed
  -- separately below, because they are two mechanisms wearing one sentence.
  declare
    moved_stage int;
  begin
    update feedback set feedback_stage = 'planned' where feedback_title = '__rls_probe__';
    get diagnostics moved_stage = row_count;
    if moved_stage = 0 then
      raise notice 'ok  feedback: a user cannot move a request — the policy matches nothing';
    else
      raise warning 'FAIL: a user moved % request(s) along the queue', moved_stage;
    end if;
  exception
    when insufficient_privilege then
      raise notice 'ok  feedback: a user cannot move a request (refused outright)';
    when others then raise warning 'FAIL: unexpected moving a request at user (%)', sqlerrm;
  end;

  -- 0061: one thumbs up each, and the primary key is what says so. Three things, in the
  -- order they can go wrong: a vote works, a second one from the same person is refused
  -- by the key rather than by the app, and a vote stamped onto a colleague is refused by
  -- the with-check. The middle one is the rule Amber actually stated.
  declare
    probe_id uuid;
  begin
    select feedback_id into probe_id from feedback where feedback_title = '__rls_probe__' limit 1;

    insert into feedback_votes (feedback_id, profile_id)
    values (probe_id, (select current_profile_id()));
    if (select count(*) from feedback_votes where feedback_id = probe_id) = 1 then
      raise notice 'ok  feedback_votes: an ordinary person can vote';
    else
      raise warning 'FAIL: a vote was cast and not readable';
    end if;

    begin
      insert into feedback_votes (feedback_id, profile_id)
      values (probe_id, (select current_profile_id()));
      raise warning 'FAIL: the same person voted twice';
    exception
      when unique_violation then
        raise notice 'ok  feedback_votes: a second vote from the same person is refused by the key';
    end;

    begin
      insert into feedback_votes (feedback_id, profile_id)
      values (probe_id, (select profile_id from profiles
                          where profile_email <> 'behaviour-test@lofty.com.au' limit 1));
      raise warning 'FAIL: a vote was cast under somebody else';
    exception
      when insufficient_privilege then
        raise notice 'ok  feedback_votes: refused a vote cast under another person';
    end;

    -- And taking it back, which is the whole reason there is no counter column.
    delete from feedback_votes where feedback_id = probe_id;
    if (select count(*) from feedback_votes where feedback_id = probe_id) = 0 then
      raise notice 'ok  feedback_votes: your own vote is yours to withdraw';
    else
      raise warning 'FAIL: a vote could not be withdrawn';
    end if;
  exception when others then raise warning 'FAIL: unexpected voting (%)', sqlerrm;
  end;

  -- 0064: the discussion under a request. An ordinary person writes one and reads it
  -- back; the team's internal lane is invisible to them. The internal comment is planted
  -- as the owner further up this file (no JWT), because an admin has not run yet.
  declare
    probe_id uuid;
    mine int;
    internal_seen int;
  begin
    select feedback_id into probe_id from feedback where feedback_title = '__rls_probe__' limit 1;

    insert into comments (feedback_id, comment_body) values (probe_id, '__rls_probe_comment__');
    select count(*) into mine from comments where comment_body = '__rls_probe_comment__';
    if mine = 1 then
      raise notice 'ok  comments: an ordinary person can talk on a request';
    else
      raise warning 'FAIL: a comment on a request was not readable by its author';
    end if;

    select count(*) into internal_seen from comments
      where comment_body = '__rls_probe_internal__';
    if internal_seen = 0 then
      raise notice 'ok  comments: the internal lane is invisible below admin';
    else
      raise warning 'FAIL: a non-admin read % internal comment(s)', internal_seen;
    end if;
  exception when others then raise warning 'FAIL: unexpected commenting on a request (%)', sqlerrm;
  end;

  -- The standing of a comment is admin's, and it is a COLUMN rule — so the author's own
  -- edit policy would happily let them pin themselves to the top without the trigger.
  begin
    update comments set comment_is_pinned = true where comment_body = '__rls_probe_comment__';
    raise warning 'FAIL: an ordinary person pinned their own comment';
  exception
    when insufficient_privilege then raise notice 'ok  comments: pinning is admin work, refused by the trigger';
    when others then raise warning 'FAIL: unexpected pinning a comment (%)', sqlerrm;
  end;

  begin
    insert into comments (feedback_id, comment_body, comment_is_internal)
    select feedback_id, '__rls_probe_sneaky__', true from feedback
     where feedback_title = '__rls_probe__' limit 1;
    raise warning 'FAIL: an ordinary person posted an internal comment';
  exception
    when insufficient_privilege then raise notice 'ok  comments: posting an internal comment is refused below admin';
    when others then raise warning 'FAIL: unexpected posting internal (%)', sqlerrm;
  end;

  -- 0065: voting follows you, and un-voting does not unfollow. Both halves, because the
  -- second is a deliberate asymmetry somebody will "tidy up" otherwise.
  --
  -- IT ASKS ABOUT A REQUEST THIS PERSON DID NOT FILE, and that is not incidental. The
  -- first version of this probe used their own report — which follow_on_report() has
  -- ALREADY followed them to — so the count was 1 whether or not voting followed them at
  -- all. It passed with the vote trigger dropped. Watched doing exactly that, which is
  -- why the planted '__rls_probe_parent__' row (filed by nobody) is what it votes on.
  declare
    probe_id uuid;
    follows_after_vote int;
    follows_after_unvote int;
  begin
    select feedback_id into probe_id from feedback
     where feedback_title = '__rls_probe_parent__' limit 1;

    insert into feedback_votes (feedback_id, profile_id)
    values (probe_id, (select current_profile_id()))
    on conflict do nothing;
    select count(*) into follows_after_vote from feedback_follows where feedback_id = probe_id;
    if follows_after_vote = 1 then
      raise notice 'ok  feedback_follows: voting follows you, by trigger';
    else
      raise warning 'FAIL: voting created % follow(s)', follows_after_vote;
    end if;

    delete from feedback_votes where feedback_id = probe_id
      and profile_id = (select current_profile_id());
    select count(*) into follows_after_unvote from feedback_follows where feedback_id = probe_id;
    if follows_after_unvote = 1 then
      raise notice 'ok  feedback_follows: un-voting does NOT unfollow';
    else
      raise warning 'FAIL: un-voting removed the follow';
    end if;
  exception when others then raise warning 'FAIL: unexpected following (%)', sqlerrm;
  end;

  -- A follow is private, unlike a vote. Nobody needs to know what somebody is watching.
  begin
    insert into feedback_follows (feedback_id, profile_id)
    select feedback_id, (select profile_id from profiles
                          where profile_email <> 'behaviour-test@lofty.com.au' limit 1)
      from feedback where feedback_title = '__rls_probe__' limit 1;
    raise warning 'FAIL: a follow was created for somebody else';
  exception
    when insufficient_privilege then raise notice 'ok  feedback_follows: refused a follow created for another person';
    when others then raise warning 'FAIL: unexpected following for another (%)', sqlerrm;
  end;

  -- 0066: merging is admin work. Below it the policy matches nothing, so the trigger
  -- never runs — the same two-mechanism shape as the stage move.
  declare
    merged int;
  begin
    update feedback set feedback_merged_into_id = feedback_id
      where false;  -- shape only; the real attempt is next
    update feedback f set feedback_merged_into_id = (
      select f2.feedback_id from feedback f2 where f2.feedback_id <> f.feedback_id limit 1
    ) where f.feedback_title = '__rls_probe__';
    get diagnostics merged = row_count;
    if merged = 0 then
      raise notice 'ok  feedback: merging is refused below admin';
    else
      raise warning 'FAIL: a user merged % request(s)', merged;
    end if;
  exception
    when insufficient_privilege then raise notice 'ok  feedback: merging is refused below admin';
    when others then raise warning 'FAIL: unexpected merging at user (%)', sqlerrm;
  end;

  -- 0067: adding somebody else's vote is admin's. This is the clause that answers 0061's
  -- objection, so it has to be seen refusing at this rung.
  begin
    insert into feedback_votes (feedback_id, profile_id, feedback_vote_added_by)
    select feedback_id,
           (select profile_id from profiles where profile_email <> 'behaviour-test@lofty.com.au' limit 1),
           (select current_profile_id())
      from feedback where feedback_title = '__rls_probe__' limit 1;
    raise warning 'FAIL: a user added a vote on somebody else''s behalf';
  exception
    when insufficient_privilege then raise notice 'ok  feedback_votes: adding a vote for somebody is refused below admin';
    when others then raise warning 'FAIL: unexpected on-behalf vote at user (%)', sqlerrm;
  end;

  -- 0063: the roadmap and the changelog are read by everybody and written by superadmin.
  -- The read half here; the write half is probed at manager and again at admin below.
  begin
    perform 1 from roadmap_phases limit 1;
    perform 1 from releases limit 1;
    raise notice 'ok  the roadmap and the changelog are readable by an ordinary person';
  exception when others then raise warning 'FAIL: an ordinary person could not read the roadmap (%)', sqlerrm;
  end;

  begin
    insert into roadmap_phases (roadmap_phase_name, roadmap_phase_position)
    values ('__rls_probe__', 999);
    raise warning 'FAIL: a user added a roadmap phase';
  exception
    when insufficient_privilege then raise notice 'ok  roadmap_phases refused a phase below superadmin';
    when others then raise warning 'FAIL: unexpected adding a phase (%)', sqlerrm;
  end;

  -- The other half of the insert policy: the row must be stamped with the sender. Without
  -- this, a report could be filed under a colleague — and the whole value of the list is
  -- knowing who to go back to.
  begin
    insert into feedback (profile_id, feedback_kind, feedback_title)
    values ((select profile_id from profiles
              where profile_email <> 'behaviour-test@lofty.com.au' limit 1),
            'idea', '__rls_probe__');
    raise warning 'FAIL: a report was filed under somebody else';
  exception
    when insufficient_privilege then raise notice 'ok  feedback refused a report filed under another person';
    when others then raise warning 'FAIL: unexpected filing under another person (%)', sqlerrm;
  end;

  -- Editing somebody's report — the title, or which phase it is planned into — is admin
  -- work. Below it the update matches no row rather than erroring, which is the only
  -- signal available, so the probe asserts the row count and not an exception.
  declare
    triaged int;
  begin
    update feedback set roadmap_phase_id = null where feedback_title = '__rls_probe__';
    get diagnostics triaged = row_count;
    if triaged = 0 then
      raise notice 'ok  feedback: editing a report is admin work, and matches nothing below it';
    else
      raise warning 'FAIL: a non-admin edited % report(s)', triaged;
    end if;
  exception when others then raise warning 'FAIL: unexpected editing feedback (%)', sqlerrm;
  end;

  begin
    insert into pipelines (pipeline_key, pipeline_name, pipeline_scope)
    values ('sneaky', 'Sneaky', 'job');
    raise warning 'FAIL: a non-superadmin created a pipeline';
  exception
    when insufficient_privilege then raise notice 'ok  pipelines refused a write below superadmin';
    when others then raise warning 'FAIL: unexpected on pipelines (%)', sqlerrm;
  end;

  -- 0043, widened in 0077: defining what the company captures is a manager's work; a user is refused.
  begin
    insert into property_defs (property_def_key, property_def_label, property_def_scope,
                               property_def_stage, property_def_owning_team, property_def_format)
    values ('sneaky_field', 'Sneaky', 'project', 'Construction', 'design', 'text');
    raise warning 'FAIL: a user defined a property';
  exception
    when insufficient_privilege then raise notice 'ok  property_defs refused a write below manager';
    when others then raise warning 'FAIL: unexpected on property_defs (%)', sqlerrm;
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

-- =============================================================================
-- 0049 — THE DEMO GATE, AND A PROBE THAT WAS FAILING FOR A REASON OF ITS OWN
--
--   This ran inside the block above, as `authenticated`, and it began by setting
--   profile_is_demo on the test person. THAT UPDATE MATCHED NO ROW: writing profiles
--   needs admin, and the test person is at `user` there. So the flag was never set, the
--   reads that followed were ordinary reads, and the probe reported
--
--       FAIL: a demo account read 2 job(s)
--       FAIL: a demo account read 48 profile(s), expected exactly its own
--
--   …which is a true statement about a probe that had not managed to make anybody a demo
--   account, and a false statement about the gate. It has been red on `main` for a while
--   and read as a fault in 0049, which is exactly what a silently-failing SETUP does: the
--   assertion is fine, the arrangement never happened, and the report is confident.
--
--   The gate itself was proved against the LIVE database when 0049 landed (6 projects ·
--   60 jobs → 0 · 0 with the tick on), so nothing was ever wrong with it here.
--
--   The fix is to flip the flag as the OWNER — outside the role, where a migration or an
--   admin would do it — and only then read as the signed-in person. And the probe now
--   asserts its own setup: if the flag is not on, it says so instead of testing nothing.
-- =============================================================================
reset request.jwt.claim.sub;
update profiles set profile_is_demo = true
 where profile_email = 'behaviour-test@lofty.com.au';

\echo '=== the same person, held at the demo gate ==='
set role authenticated;
set request.jwt.claim.sub = :'uid';

do $$
declare
  is_demo boolean;
  demo_jobs int;
  demo_me int;
begin
  select p.profile_is_demo into is_demo from profiles p
   where p.profile_email = 'behaviour-test@lofty.com.au';
  -- The setup, asserted. Without this the two probes below can only ever report on
  -- whatever state the row happened to be in.
  if is_demo is not true then
    raise warning 'FAIL: the demo flag is not set — the probe below would prove nothing';
  end if;

  select count(*) into demo_jobs from jobs;
  select count(*) into demo_me from profiles;

  if demo_jobs = 0 then
    raise notice 'ok  a demo account reads no jobs — every policy hangs off is_active_user';
  else
    raise warning 'FAIL: a demo account read % job(s)', demo_jobs;
  end if;
  if demo_me = 1 then
    raise notice 'ok  …but still reads its own profile, so the gate can name them';
  else
    raise warning 'FAIL: a demo account read % profile(s), expected exactly its own', demo_me;
  end if;
end $$;
reset role;

-- Cleared immediately, or every probe after this one runs as somebody who reads nothing.
-- The session is left as the OWNER, exactly as the `reset role` above this block left it:
-- the manager section that follows sets a permission level, which is an admin write, and
-- it would be refused if this block handed it back an `authenticated` session. Watched
-- happening — the manager probes reported three failures that were really this line.
reset request.jwt.claim.sub;
update profiles set profile_is_demo = false
 where profile_email = 'behaviour-test@lofty.com.au';


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

-- Probe 4 in the block below now SUCCEEDS where its predecessor was refused (0096), so
-- unlike every other probe here it leaves numbers behind. Snapshot as postgres, restore
-- after the block: a later probe reading an SLA nobody at Lofty set would be reading this
-- file's own scribble.
create temp table sla_before as
  select pipeline_stage_id, pipeline_stage_expected_days from pipeline_stages;

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
  --
  --    Forwards only: 0039 made the lifecycle linear, and the first version of this
  --    probe swept every job to Construction — including a fixture already past it,
  --    which the guard rightly refused. The probe now moves only the jobs that are
  --    behind, which is the only move a manager is allowed anyway.
  -- 0044: the dictionary ladder's first rung. Wording is a manager's; status is not.
  begin
    insert into dictionary_overrides (dictionary_override_id, dictionary_override_friendly_name)
    values ('jobs.job_stage', 'Phase')
    on conflict (dictionary_override_id)
    do update set dictionary_override_friendly_name = 'Phase';
    raise notice 'ok  a manager retitled a dictionary entry';
  exception when others then raise warning 'FAIL: manager dictionary wording refused (%)', sqlerrm;
  end;

  begin
    update dictionary_overrides set dictionary_override_status = 'updates_required'
     where dictionary_override_id = 'jobs.job_stage';
    raise warning 'FAIL: a manager set a dictionary status — that is admin''s';
  exception
    when insufficient_privilege then raise notice 'ok  dictionary status refused below admin';
    when others then raise warning 'FAIL: unexpected on dictionary status (%)', sqlerrm;
  end;

  begin
    update jobs set job_stage = 'Construction'
     where lifecycle_position(job_stage) < lifecycle_position('Construction');
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

  -- 4. How long a phase should take. Lofty's answer, 23 August: "there is no set limit for
  --    how long a phase should take — this needs to be an editable property." Nullable
  --    with no default is the "no set limit" half, and constraints.sql holds the check
  --    that a nonsense one is refused. This is the other half: that it can be edited at
  --    all, and by whom.
  --
  --    **THIS PROBE ASSERTED THE OPPOSITE UNTIL 0096, AND THE REVERSAL IS THE POINT.**
  --    It read "expected days is editable, but not below superadmin", per 0029's blanket
  --    write policy and 0047's reasoning that the SLA is part of what a stage IS. Amber,
  --    4 September, moved it: Settings is the managers' screen and its purpose is to
  --    "allow managers and above update properties, processes, contact settings,
  --    maintenance tabs, SLAs and automations". So the manager now gets the number, and
  --    probe 3 above is what keeps the rest of 0047's reasoning true — the same person
  --    still cannot rename the stage the number is about.
  begin
    update pipeline_stages set pipeline_stage_expected_days = 30;
    if found then
      raise notice 'ok  a manager sets how long a phase should take (0096)';
    else
      raise warning 'FAIL: a manager could not set expected days — Settings offers the control';
    end if;
  exception
    when insufficient_privilege then raise warning 'FAIL: expected days refused a manager (%)', sqlerrm;
    when others then raise warning 'FAIL: unexpected setting expected days (%)', sqlerrm;
  end;

  -- 5. The column rule, which is a TRIGGER and not a policy — so it only shows at
  --    manager, exactly like 0060's stage guard only shows at admin. Probe 3 above
  --    covers insert, which the policy refuses; this covers the update the policy now
  --    ALLOWS and guard_stage_shape_change() has to stop. Drop that trigger and 3 and 4
  --    both still pass while a manager quietly renames the company's lifecycle.
  begin
    update pipeline_stages set pipeline_stage_name = pipeline_stage_name || ' (renamed)';
    raise warning 'FAIL: a manager renamed a stage — that is the process, not its SLA';
  exception
    when insufficient_privilege then raise notice 'ok  a manager sets the SLA on a stage but cannot rename it';
    when others then raise warning 'FAIL: unexpected renaming a stage (%)', sqlerrm;
  end;

  -- 6. And who hears about it. The notification rules moved down with the SLAs (0096):
  --    a manager who can say when something is overdue and not who finds out has half a
  --    feature. `user` is refused a few hundred lines below, which is the other end of
  --    the same rule.
  begin
    insert into notification_rules (notification_type_id, notification_rule_audience)
    values ('task_overdue', 'managers');
    raise notice 'ok  a manager sets who hears an overdue task (0096)';
    delete from notification_rules
     where notification_type_id = 'task_overdue' and notification_rule_audience = 'managers';
  exception when others then raise warning 'FAIL: a manager could not write a notification rule (%)', sqlerrm;
  end;

  -- 7. But NOT what kinds of notification exist. 0097 split what 0096 had bundled: a rule
  --    is who hears a thing (probe 6, a manager's), a type is whether that kind of thing
  --    exists at all (this one, admin's). These two probes are the whole of 0097 — 6 must
  --    keep passing while 7 refuses, and a single policy change that moved both would
  --    break one of them whichever way it went.
  begin
    insert into notification_types (notification_type_id, notification_type_name, notification_type_position)
    values ('__rls_probe_type__', 'RLS probe type', 999);
    raise warning 'FAIL: a manager invented a notification type — that is the vocabulary, not the automation';
    delete from notification_types where notification_type_id = '__rls_probe_type__';
  exception
    when insufficient_privilege then raise notice 'ok  a manager writes notification rules but cannot create a type (0097)';
    when others then raise warning 'FAIL: unexpected creating a notification type as manager (%)', sqlerrm;
  end;

  -- 8. And a manager CAN still change an existing type's defaults. This is the probe that
  --    guards against the obvious wrong version of 0097: one `for all ... >= 'admin'`
  --    policy instead of three split by command. `saveNotificationType()` is an UPDATE and
  --    it is what Settings -> Automations is made of, so a single admin-only policy would
  --    have taken that screen away from every manager with nobody asking for it.
  declare
    timing_before text;
    timing_after  text;
  begin
    select notification_type_default_timing into timing_before
      from notification_types where notification_type_id = 'task_overdue';
    update notification_types
       set notification_type_default_timing = case when timing_before = 'digest' then 'immediate' else 'digest' end
     where notification_type_id = 'task_overdue';
    select notification_type_default_timing into timing_after
      from notification_types where notification_type_id = 'task_overdue';
    if timing_after is distinct from timing_before then
      raise notice 'ok  a manager still sets an existing type''s defaults (0097 keeps UPDATE at manager)';
    else
      raise warning 'FAIL: a manager''s update to a notification type did not take';
    end if;
    -- Put it back: a probe that leaves a real type reconfigured is a side effect, not a test.
    update notification_types set notification_type_default_timing = timing_before
     where notification_type_id = 'task_overdue';
  exception when others then
    raise warning 'FAIL: a manager could not change a notification type''s defaults — 0097 is too tight (%)', sqlerrm;
  end;
end $$;
reset role;
update pipeline_stages ps
   set pipeline_stage_expected_days = b.pipeline_stage_expected_days
  from sla_before b
 where b.pipeline_stage_id = ps.pipeline_stage_id
   and ps.pipeline_stage_expected_days is distinct from b.pipeline_stage_expected_days;
drop table sla_before;

-- =============================================================================
-- AN ADMIN, THEN A SUPERADMIN — the one rule that needs both (0060)
--
-- "Only super admin can move the requests between stages" (Amber, 30 Aug) is enforced by
-- a TRIGGER, not a policy, and the difference only shows at admin: an admin passes the
-- UPDATE policy on `feedback` — they must, or they could not fix a title — and is then
-- refused by guard_feedback_stage_change() with 42501. At `user` the policy already
-- matched nothing, so that probe (above) would pass even with the trigger dropped. This
-- is the block that would catch that.
-- =============================================================================
reset request.jwt.claim.sub;
update profiles set profile_permission = 'admin'
 where profile_email = 'behaviour-test@lofty.com.au';

\echo '=== an ADMIN ==='
set role authenticated;
set request.jwt.claim.sub = :'uid';
select 'permission: ' || current_permission()::text;

\echo '--- probes (each must print ok) ---'
do $$
declare
  edited int;
begin
  -- The half an admin DOES have: the words. Probed first, because if this fails the next
  -- probe's refusal would prove nothing — a refusal is only interesting when the policy
  -- it sits behind is passing.
  begin
    update feedback set feedback_detail = 'edited by the probe'
     where feedback_title = '__rls_probe__';
    get diagnostics edited = row_count;
    if edited = 1 then
      raise notice 'ok  an admin can edit a report';
    else
      raise warning 'FAIL: an admin could not edit a report (% rows)', edited;
    end if;
  exception when others then raise warning 'FAIL: unexpected admin editing a report (%)', sqlerrm;
  end;

  -- …and the half they do not: the stage.
  begin
    update feedback set feedback_stage = 'planned' where feedback_title = '__rls_probe__';
    raise warning 'FAIL: an ADMIN moved a request between stages — the trigger did not bite';
  exception
    when insufficient_privilege then
      raise notice 'ok  an admin passes the policy and is refused by the stage trigger';
    when others then raise warning 'FAIL: unexpected admin moving a request (%)', sqlerrm;
  end;

  -- 0064: what an admin CAN do with a comment's standing, and reading the internal lane.
  declare
    seen int;
  begin
    select count(*) into seen from comments where comment_body = '__rls_probe_internal__';
    if seen = 1 then
      raise notice 'ok  comments: an admin reads the internal lane';
    else
      raise warning 'FAIL: an admin read % internal comment(s), expected 1', seen;
    end if;

    update comments set comment_is_pinned = true where comment_body = '__rls_probe_comment__';
    if found then
      raise notice 'ok  comments: an admin can pin the official answer';
    else
      raise warning 'FAIL: an admin could not pin a comment';
    end if;
  exception when others then raise warning 'FAIL: unexpected admin comment standing (%)', sqlerrm;
  end;

  -- 0066 and 0067, the two things an admin is meant to be able to do, and the two shapes
  -- of refusal around them. The votes being moved is the part that cannot work without
  -- SECURITY DEFINER, so it is the one worth watching most closely.
  declare
    source_id uuid;
    target_id uuid;
    other_person uuid;
    moved_votes int;
  begin
    select feedback_id into source_id from feedback where feedback_title = '__rls_probe__' limit 1;
    select feedback_id into target_id from feedback where feedback_title = '__rls_probe_parent__' limit 1;
    select profile_id into other_person from profiles
     where profile_email <> 'behaviour-test@lofty.com.au' and profile_is_active limit 1;

    -- An on-behalf vote on the source, which the merge then has to carry across. Two
    -- probes in one: this is 0067's happy path.
    insert into feedback_votes (feedback_id, profile_id, feedback_vote_added_by)
    values (source_id, other_person, (select current_profile_id()));
    raise notice 'ok  feedback_votes: an admin adds a vote on somebody''s behalf';

    -- …but not one that lies about who added it.
    begin
      insert into feedback_votes (feedback_id, profile_id, feedback_vote_added_by)
      values (target_id, other_person, other_person);
      raise warning 'FAIL: an on-behalf vote was stamped with somebody else as the adder';
    exception
      when insufficient_privilege then
        raise notice 'ok  feedback_votes: an on-behalf vote cannot lie about who added it';
    end;

    -- …and not their own, which belongs on the ordinary path where added_by is null.
    --
    -- This one is refused by a CHECK and not by the policy, and the difference is the
    -- point: the policy clause alone did nothing, because 0061's own-vote policy is OR'd
    -- with it and admits the row first. This probe is what found that — it reported
    -- "FAIL: an admin added their OWN vote through the on-behalf path" — and 0067 carries
    -- the reasoning.
    begin
      insert into feedback_votes (feedback_id, profile_id, feedback_vote_added_by)
      values (target_id, (select current_profile_id()), (select current_profile_id()));
      raise warning 'FAIL: an admin added their OWN vote through the on-behalf path';
    exception
      when check_violation then
        raise notice 'ok  feedback_votes: a vote cannot be added on your own behalf (CHECK, not policy)';
      when insufficient_privilege then
        raise warning 'FAIL: refused by a policy — that clause is OR''d away; it needs the CHECK';
    end;

    -- The merge itself.
    update feedback set feedback_merged_into_id = target_id where feedback_id = source_id;
    select count(*) into moved_votes from feedback_votes
     where feedback_id = target_id and profile_id = other_person;
    if moved_votes = 1 then
      raise notice 'ok  feedback: merging carried another person''s vote across';
    else
      raise warning 'FAIL: merging moved % vote(s), expected 1', moved_votes;
    end if;

    -- No chains: the target of a merge must be a live request.
    begin
      update feedback set feedback_merged_into_id = source_id where feedback_id = target_id;
      raise warning 'FAIL: a merge chain was allowed';
    exception
      when check_violation then raise notice 'ok  feedback: merging into a duplicate is refused — no chains';
    end;

    -- Left as it was found.
    update feedback set feedback_merged_into_id = null where feedback_id = source_id;
  exception when others then raise warning 'FAIL: unexpected merging or on-behalf voting (%)', sqlerrm;
  end;

  -- The roadmap and the changelog are superadmin's too, and admin is the rung that would
  -- most plausibly have been given them by mistake.
  begin
    insert into roadmap_phases (roadmap_phase_name, roadmap_phase_position)
    values ('__rls_probe__', 999);
    raise warning 'FAIL: an admin added a roadmap phase';
  exception
    when insufficient_privilege then raise notice 'ok  the roadmap is superadmin''s, not admin''s';
    when others then raise warning 'FAIL: unexpected admin adding a phase (%)', sqlerrm;
  end;

  begin
    insert into releases (release_version) values ('__rls_probe__');
    raise warning 'FAIL: an admin published a release';
  exception
    when insufficient_privilege then raise notice 'ok  the changelog is superadmin''s, not admin''s';
    when others then raise warning 'FAIL: unexpected admin publishing a release (%)', sqlerrm;
  end;
end $$;
reset role;

reset request.jwt.claim.sub;
update profiles set profile_permission = 'superadmin'
 where profile_email = 'behaviour-test@lofty.com.au';

\echo '=== a SUPERADMIN ==='
set role authenticated;
set request.jwt.claim.sub = :'uid';

\echo '--- probes (each must print ok) ---'
do $$
declare
  before_stamp timestamptz;
  after_stamp timestamptz;
  phase uuid;
  orphans int;
begin
  -- The move goes through, AND it restamps. Both, because a move that does not stamp
  -- leaves "in this stage since" reading as the day the request was filed — which looks
  -- like a date rather than like a bug.
  begin
    -- Parked in the past for the same reason the no-op probe below parks it: now() is
    -- transaction time, so "the stamp moved" is only observable against a date that is
    -- definitely older than this transaction.
    update feedback set feedback_stage_entered_at = timestamptz '2020-01-01'
     where feedback_title = '__rls_probe__';
    select feedback_stage_entered_at into before_stamp
      from feedback where feedback_title = '__rls_probe__';
    update feedback set feedback_stage = 'planned' where feedback_title = '__rls_probe__';
    select feedback_stage_entered_at into after_stamp
      from feedback where feedback_title = '__rls_probe__';
    if after_stamp > before_stamp then
      raise notice 'ok  a superadmin moves a request, and the stage stamp moves with it';
    else
      raise warning 'FAIL: the stage moved and feedback_stage_entered_at did not';
    end if;
  exception when others then raise warning 'FAIL: unexpected superadmin moving a request (%)', sqlerrm;
  end;

  -- Setting the stage to the stage it already holds is not a move, and must not restamp.
  -- Without the `is distinct from` in the trigger this passes silently and every "stuck
  -- since" date quietly resets whenever anything else on the row is saved.
  --
  -- The anchor date is not decoration. now() is transaction time, so a trigger stamping
  -- unconditionally writes the SAME value the row already had and a straight before/after
  -- comparison cannot see it — watched happening: with the guard removed from the stamp,
  -- this probe passed. Parking the stamp in 2020 first (an update that does not mention
  -- feedback_stage, so the trigger does not fire) makes any restamp visible.
  begin
    update feedback set feedback_stage_entered_at = timestamptz '2020-01-01'
     where feedback_title = '__rls_probe__';
    select feedback_stage_entered_at into before_stamp
      from feedback where feedback_title = '__rls_probe__';
    update feedback set feedback_stage = 'planned' where feedback_title = '__rls_probe__';
    select feedback_stage_entered_at into after_stamp
      from feedback where feedback_title = '__rls_probe__';
    if after_stamp = before_stamp then
      raise notice 'ok  setting a stage to the one it already holds does not restamp';
    else
      raise warning 'FAIL: a no-op stage write restamped feedback_stage_entered_at';
    end if;
  exception when others then raise warning 'FAIL: unexpected no-op stage write (%)', sqlerrm;
  end;

  -- 0064: a move can carry a sentence, and the sentence is a comment on the request
  -- rather than a column that the next move would overwrite.
  declare
    notes int;
  begin
    insert into comments (feedback_id, comment_body, comment_feedback_stage)
    select feedback_id, 'doing this in the import phase', 'planned'
      from feedback where feedback_title = '__rls_probe__' limit 1;
    select count(*) into notes from comments where comment_feedback_stage is not null;
    if notes >= 1 then
      raise notice 'ok  comments: a stage change can carry a note';
    else
      raise warning 'FAIL: a stage note was not written';
    end if;
  exception when others then raise warning 'FAIL: unexpected stage note (%)', sqlerrm;
  end;

  -- 0063, the destructive one: removing a phase must never remove what people asked for.
  -- ON DELETE SET NULL is one word away from CASCADE, and the difference is forty
  -- people's requests.
  begin
    insert into roadmap_phases (roadmap_phase_name, roadmap_phase_position)
    values ('__rls_probe__', 999) returning roadmap_phase_id into phase;
    update feedback set roadmap_phase_id = phase where feedback_title = '__rls_probe__';
    delete from roadmap_phases where roadmap_phase_id = phase;
    select count(*) into orphans from feedback where feedback_title = '__rls_probe__';
    if orphans = 1 then
      raise notice 'ok  deleting a phase clears the link and leaves the request standing';
    else
      raise warning 'FAIL: deleting a roadmap phase took its requests with it';
    end if;
  exception when others then raise warning 'FAIL: unexpected removing a phase (%)', sqlerrm;
  end;
end $$;
reset role;

-- Left as it was found, so the file can be read twice and mean the same thing. The
-- feedback probe's row has to be swept as the owner: the table has no delete policy at
-- all by design ('declined' is the answer to a report going nowhere), so the person who
-- wrote it cannot take it back.
delete from comments where comment_body in
  ('__rls_probe_comment__', '__rls_probe_internal__', 'doing this in the import phase');
delete from feedback where feedback_title in ('__rls_probe__', '__rls_probe_parent__');
reset request.jwt.claim.sub;
update profiles set profile_permission = 'user'
 where profile_email = 'behaviour-test@lofty.com.au';

-- =============================================================================
-- 0077 / 0078 — the property locks and the process runs, as real signed-in people
-- =============================================================================
-- The resolution the policies promise, walked rung by rung on three fixtures:
--
--   probe_pour       unrestricted, nobody named       -> open at the rung to everybody
--   probe_team_only  unrestricted, finance named      -> finance and managers, nobody else
--   probe_margin     RESTRICTED, nobody named         -> superadmin only, until granted
--
-- The test person sits in design and not in finance. Every count below is read as
-- `authenticated` with RLS on, so a policy that quietly stopped filtering shows up as
-- the wrong number, not as silence. Fixtures are made and removed as the owner.
\echo '=== the property locks (0077) and process runs (0078) ==='
reset role;
reset request.jwt.claim.sub;

insert into profile_teams (profile_id, team_id)
select profile_id, 'design' from profiles where profile_email = 'behaviour-test@lofty.com.au'
on conflict do nothing;
delete from profile_teams pt using profiles p
 where pt.profile_id = p.profile_id and p.profile_email = 'behaviour-test@lofty.com.au'
   and pt.team_id = 'finance';

insert into property_defs (property_def_key, property_def_label, property_def_scope,
                           property_def_stage, property_def_format, property_def_restricted)
values ('probe_margin',    'Probe margin',    'job', 'Pre-construction', 'currency', true),
       ('probe_pour',      'Probe pour date', 'job', 'Construction',     'date',     false),
       ('probe_team_only', 'Probe team only', 'job', 'Construction',     'text',     false);
insert into property_values (property_def_key, property_def_format, job_id, property_value_number)
select 'probe_margin', 'currency', job_id, 12345 from jobs where job_id like '9106-%' order by job_id limit 1;
insert into property_values (property_def_key, property_def_format, job_id, property_value_date)
select 'probe_pour', 'date', job_id, date '2026-09-01' from jobs where job_id like '9106-%' order by job_id limit 1;
insert into property_values (property_def_key, property_def_format, job_id, property_value_text)
select 'probe_team_only', 'text', job_id, 'finance only' from jobs where job_id like '9106-%' order by job_id limit 1;
insert into property_access (property_def_key, team_id) values ('probe_team_only', 'finance');

update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';

\echo '--- as a USER in design ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; run uuid; other_job text;
begin
  select count(*) into n from property_values where property_def_key = 'probe_pour';
  if n = 1 then raise notice 'ok  a user reads an unrestricted value nobody has narrowed';
  else raise warning 'FAIL: a user saw % rows of an open property (expected 1)', n; end if;

  select count(*) into n from property_values where property_def_key = 'probe_team_only';
  if n = 0 then raise notice 'ok  a user outside the named team does not see a team-only value';
  else raise warning 'FAIL: a user outside finance saw a finance-only value'; end if;

  select count(*) into n from property_values where property_def_key = 'probe_margin';
  if n = 0 then raise notice 'ok  a user does not see a restricted value';
  else raise warning 'FAIL: a user saw a restricted value'; end if;

  select count(*) into n from property_value_history where property_def_key = 'probe_margin';
  if n = 0 then raise notice 'ok  the history of a restricted value is hidden with it';
  else raise warning 'FAIL: a user read the history of a restricted value'; end if;

  -- Recording is at the user rung on an open property; clearing is manager's, and RLS on
  -- DELETE filters rather than raising, so the count is the assertion.
  select job_id into other_job from jobs where job_id like '9106-%' order by job_id desc limit 1;
  begin
    insert into property_values (property_def_key, property_def_format, job_id, property_value_date)
    values ('probe_pour', 'date', other_job, current_date);
    raise notice 'ok  a user records an open property';
  exception when others then raise warning 'FAIL: a user could not record an open property (%)', sqlerrm; end;
  delete from property_values where property_def_key = 'probe_pour' and job_id = other_job;
  if found then raise warning 'FAIL: a user cleared a value — that is manager''s';
  else raise notice 'ok  clearing a value is refused below manager'; end if;

  begin
    insert into property_values (property_def_key, property_def_format, job_id, property_value_text)
    values ('probe_team_only', 'text', other_job, 'sneaked');
    raise warning 'FAIL: a user outside finance recorded a finance-only property';
  exception
    when insufficient_privilege then raise notice 'ok  a user outside the named team cannot record it either';
    when others then raise warning 'FAIL: unexpected recording a team-only value (%)', sqlerrm;
  end;

  begin
    insert into property_defs (property_def_key, property_def_label, property_def_scope, property_def_stage, property_def_format)
    values ('probe_sneaky', 'Sneaky', 'job', 'Construction', 'text');
    raise warning 'FAIL: a user defined a property';
  exception
    when insufficient_privilege then raise notice 'ok  defining a property is refused below manager';
    when others then raise warning 'FAIL: unexpected defining a property (%)', sqlerrm;
  end;

  begin
    insert into processes (process_key, process_name, process_stage, process_scope)
    values ('probe_sneaky', 'Sneaky', 'Construction', 'job');
    raise warning 'FAIL: a user defined a process';
  exception
    when insufficient_privilege then raise notice 'ok  defining a process is refused below manager';
    when others then raise warning 'FAIL: unexpected defining a process (%)', sqlerrm;
  end;

  -- Running a process is ordinary work: a user starts one and completes it, and the
  -- database stamps both times.
  begin
    insert into process_runs (process_id, job_id, process_run_status)
    select process_id, other_job, 'in_progress' from processes where process_key = 'pwa'
    returning process_run_id into run;
    update process_runs set process_run_status = 'complete' where process_run_id = run;
    if (select process_run_completed_at from process_run_display where process_run_id = run) is not null
       and (select process_run_health from process_run_display where process_run_id = run) = 'complete' then
      raise notice 'ok  a user runs a process to completion and the view reads it back';
    else
      raise warning 'FAIL: the completed run did not read back as complete';
    end if;
  exception when others then raise warning 'FAIL: a user could not run a process (%)', sqlerrm; end;
  delete from process_runs where process_run_id = run;
  if found then raise warning 'FAIL: a user deleted a process run — that is admin''s';
  else raise notice 'ok  deleting a run is refused below admin'; end if;
end $$;
reset role;

reset request.jwt.claim.sub;
update profiles set profile_permission = 'manager' where profile_email = 'behaviour-test@lofty.com.au';
\echo '--- as a MANAGER ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; stamped_by uuid;
begin
  select count(*) into n from property_values where property_def_key = 'probe_team_only';
  if n = 1 then raise notice 'ok  a manager sees an unrestricted value whatever team holds it';
  else raise warning 'FAIL: a manager saw % rows of a team-only value (expected 1)', n; end if;

  select count(*) into n from property_values where property_def_key = 'probe_margin';
  if n = 0 then raise notice 'ok  a manager does NOT see a restricted value — restricted means restricted';
  else raise warning 'FAIL: a manager saw a restricted value'; end if;

  begin
    update property_defs set property_def_label = 'Probe pour date (renamed)' where property_def_key = 'probe_pour';
    if found then raise notice 'ok  a manager edits a property definition';
    else raise warning 'FAIL: a manager''s edit to a property definition touched nothing'; end if;
  exception when others then raise warning 'FAIL: a manager could not edit a property (%)', sqlerrm; end;

  begin
    update property_defs set property_def_restricted = false where property_def_key = 'probe_margin';
    raise warning 'FAIL: a manager lifted a restriction';
  exception
    when insufficient_privilege then raise notice 'ok  lifting a restriction is refused below superadmin';
    when others then raise warning 'FAIL: unexpected lifting a restriction (%)', sqlerrm;
  end;

  begin
    update property_defs set property_def_read_level = 'manager' where property_def_key = 'probe_pour';
    raise warning 'FAIL: a manager changed a security level';
  exception
    when insufficient_privilege then raise notice 'ok  changing a security level is refused below admin';
    when others then raise warning 'FAIL: unexpected changing a level (%)', sqlerrm;
  end;

  begin
    insert into property_access (property_def_key, team_id) values ('probe_pour', 'design');
    raise warning 'FAIL: a manager granted property access';
  exception
    when insufficient_privilege then raise notice 'ok  granting access is refused below admin';
    when others then raise warning 'FAIL: unexpected granting access (%)', sqlerrm;
  end;

  begin
    insert into processes (process_key, process_name, process_stage, process_scope)
    values ('probe_manager_process', 'Manager''s process', 'Construction', 'job');
    raise notice 'ok  a manager defines a process';
  exception when others then raise warning 'FAIL: a manager could not define a process (%)', sqlerrm; end;

  -- 0091: the POSITIVE half of stamp_updated_by, which the migration's own proof block
  -- cannot reach — current_profile_id() resolves auth.uid(), and a migration has no JWT.
  -- Here there is one: this whole block runs as `authenticated` with the test person's
  -- sub set, so an edit made here is an edit made by a real signed-in manager, and the
  -- name Setup → Processes prints comes from this column.
  begin
    update processes set process_expected_days = 12 where process_key = 'probe_manager_process';
    select process_updated_by into stamped_by from processes where process_key = 'probe_manager_process';
    if stamped_by is null then
      raise warning 'FAIL: a manager edited a process and process_updated_by stayed null';
    elsif stamped_by <> current_profile_id() then
      raise warning 'FAIL: process_updated_by named % rather than the manager who edited it', stamped_by;
    else
      raise notice 'ok  a manager''s edit stamps process_updated_by with that manager';
    end if;
  exception when others then raise warning 'FAIL: unexpected stamping a process editor (%)', sqlerrm; end;
end $$;
reset role;

reset request.jwt.claim.sub;
update profiles set profile_permission = 'admin' where profile_email = 'behaviour-test@lofty.com.au';
\echo '--- as an ADMIN ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  select count(*) into n from property_values where property_def_key = 'probe_margin';
  if n = 0 then raise notice 'ok  an admin does NOT see a restricted value either';
  else raise warning 'FAIL: an admin saw a restricted value'; end if;

  begin
    insert into property_access (property_def_key, team_id) values ('probe_margin', 'design');
    raise warning 'FAIL: an admin granted access to a RESTRICTED property';
  exception
    when insufficient_privilege then raise notice 'ok  access to a restricted property is superadmin''s to grant';
    when others then raise warning 'FAIL: unexpected granting restricted access (%)', sqlerrm;
  end;

  begin
    insert into property_access (property_def_key, team_id) values ('probe_team_only', 'design');
    raise notice 'ok  an admin grants a team access to an unrestricted property';
  exception when others then raise warning 'FAIL: an admin could not grant access (%)', sqlerrm; end;
end $$;
reset role;

reset request.jwt.claim.sub;
update profiles set profile_permission = 'superadmin' where profile_email = 'behaviour-test@lofty.com.au';
\echo '--- as a SUPERADMIN ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  select count(*) into n from property_values where property_def_key = 'probe_margin';
  if n = 1 then raise notice 'ok  a superadmin sees the restricted value';
  else raise warning 'FAIL: a superadmin saw % rows of a restricted value (expected 1)', n; end if;

  begin
    insert into property_access (property_def_key, team_id) values ('probe_margin', 'design');
    raise notice 'ok  a superadmin grants design access to the restricted property';
  exception when others then raise warning 'FAIL: a superadmin could not grant restricted access (%)', sqlerrm; end;
end $$;
reset role;

reset request.jwt.claim.sub;
update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';
\echo '--- as the USER again, now that design is named ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  select count(*) into n from property_values where property_def_key = 'probe_margin';
  if n = 1 then raise notice 'ok  the grant opens the restricted value to the named team';
  else raise warning 'FAIL: design was granted the restricted value and saw % rows', n; end if;

  select count(*) into n from property_values where property_def_key = 'probe_team_only';
  if n = 1 then raise notice 'ok  the grant opens the team-only value to the second team';
  else raise warning 'FAIL: design was granted the team-only value and saw % rows', n; end if;

  select count(*) into n from my_property_access() where property_def_key = 'probe_margin' and can_read;
  if n = 1 then raise notice 'ok  my_property_access() agrees with the policy';
  else raise warning 'FAIL: my_property_access() disagrees with what the policy let through'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------- the audit, readable (0080)
-- Amber: "record history is viewable for everything and everyone except for restricted
-- fields". As a USER: a task's audit row on a job is readable; the restricted property's
-- audit row is not, and the open one is; the personal tables' rows are not.
\echo '--- the audit is readable by a user, except restricted values and personal tables (0080) ---'
reset request.jwt.claim.sub;
insert into tasks (job_id, task_name) values ('9106-002', 'rls probe task 0080');
update tasks set task_status = 'in_progress' where task_name = 'rls probe task 0080';
-- A restricted property NOBODY has been granted — probe_margin was opened to design above,
-- and the test person is in design, so it can no longer stand for "locked".
insert into property_defs (property_def_key, property_def_label, property_def_scope, property_def_stage, property_def_format, property_def_restricted)
values ('probe_locked_0080', 'Probe locked', 'job', 'Pre-construction', 'text', true);
insert into property_values (property_def_key, property_def_format, job_id, property_value_text)
values ('probe_locked_0080', 'text', '9106-002', 'secret');
insert into user_preferences (profile_id, user_preference_payload)
select profile_id, '{"probe":"0080"}'::jsonb from profiles where profile_email = 'behaviour-test@lofty.com.au'
on conflict (profile_id) do update set user_preference_payload = excluded.user_preference_payload;
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  select count(*) into n from activity_audit
   where activity_audit_table = 'tasks' and activity_audit_job_id = '9106-002'
     and activity_audit_new_row ->> 'task_name' = 'rls probe task 0080';
  if n >= 2 then raise notice 'ok  a user reads the audit rows of a task on a job (% rows)', n;
  else raise warning 'FAIL: a user saw % audit rows for a task change, expected at least 2', n; end if;

  select count(*) into n from activity_audit
   where activity_audit_table = 'property_values'
     and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'property_def_key' = 'probe_locked_0080';
  if n = 0 then raise notice 'ok  the restricted property''s audit rows are hidden from a user';
  else raise warning 'FAIL: a user saw % audit rows of the restricted property probe_locked_0080', n; end if;

  select count(*) into n from activity_audit
   where activity_audit_table = 'property_values'
     and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'property_def_key' = 'probe_margin';
  if n >= 1 then raise notice 'ok  the restricted property GRANTED to the user''s team shows its audit rows';
  else raise warning 'FAIL: design was granted probe_margin and saw none of its audit rows'; end if;

  select count(*) into n from activity_audit
   where activity_audit_table = 'property_values'
     and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'property_def_key' = 'probe_pour';
  if n >= 1 then raise notice 'ok  the open property''s audit rows are readable by a user';
  else raise warning 'FAIL: a user saw no audit rows of the open property probe_pour'; end if;

  select count(*) into n from activity_audit where activity_audit_table = 'user_preferences';
  if n = 0 then raise notice 'ok  the personal tables'' audit rows are hidden from a user';
  else raise warning 'FAIL: a user saw % audit rows of user_preferences', n; end if;

  begin
    insert into activity_audit (activity_audit_schema, activity_audit_table, activity_audit_operation)
    values ('public', 'jobs', 'INSERT');
    raise warning 'FAIL: a user wrote an audit row by hand';
  exception when insufficient_privilege then raise notice 'ok  the audit is append-only from triggers; a user cannot write it';
    when others then raise warning 'FAIL: unexpected writing the audit (%)', sqlerrm; end;
end $$;
reset role;
reset request.jwt.claim.sub;
delete from tasks where task_name = 'rls probe task 0080';
delete from user_preferences where user_preference_payload ->> 'probe' = '0080';
delete from property_defs where property_def_key = 'probe_locked_0080';
delete from property_value_history where property_def_key = 'probe_locked_0080';

-- ---------------------------------------------------------------- checklists (0081)
\echo '--- a user ticks a checklist line; a user cannot write a template line (0081) ---'
reset request.jwt.claim.sub;
insert into tasks (job_id, task_name) values ('9106-002', 'rls probe task 0081');
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare item uuid; n integer;
begin
  begin
    insert into task_checklist_items (task_id, task_checklist_item_text)
    select task_id, 'rls line' from tasks where task_name = 'rls probe task 0081'
    returning task_checklist_item_id into item;
    update task_checklist_items set task_checklist_item_is_done = true where task_checklist_item_id = item;
    select count(*) into n from task_checklist_items
     where task_checklist_item_id = item and task_checklist_item_is_done and task_checklist_item_done_by is not null;
    if n = 1 then raise notice 'ok  a user adds and ticks a checklist line, and the tick names them';
    else raise warning 'FAIL: the ticked line did not record the user (% rows)', n; end if;
    delete from task_checklist_items where task_checklist_item_id = item;
    if not exists (select 1 from task_checklist_items where task_checklist_item_id = item) then
      raise notice 'ok  a user removes their own checklist line';
    else raise warning 'FAIL: a user could not remove a checklist line'; end if;
  exception when others then raise warning 'FAIL: unexpected on checklist items (%)', sqlerrm; end;

  begin
    insert into process_task_checklist_items (process_task_id, process_task_checklist_item_text)
    select process_task_id, 'sneaky' from process_tasks limit 1;
    if found then raise warning 'FAIL: a user wrote a template checklist line';
    else raise notice 'note: no template task to probe against'; end if;
  exception when insufficient_privilege then raise notice 'ok  template checklist lines refuse a write below manager';
    when others then raise warning 'FAIL: unexpected on template checklist (%)', sqlerrm; end;

  select count(*) into n from stage_completion where job_id = '9106-002';
  if n >= 1 then raise notice 'ok  a user reads stage_completion for a job (% stage rows)', n;
  else raise warning 'FAIL: a user saw no stage_completion rows for 9106-002'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
delete from tasks where task_name = 'rls probe task 0081';

-- ---------------------------------------------------------------- parties (0082)
-- Amber: users and above create contacts and companies, with manager sign-off. As a USER:
-- create both (unapproved), reach and classify them, put one on a job; fail to approve,
-- fail to write a lookup. Then as a MANAGER: approve, and the stamp names the manager.
\echo '--- a user creates a contact and a company, unapproved; a manager signs off (0082) ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare co uuid; ct uuid; n integer;
begin
  begin
    insert into companies (company_name, company_abn) values ('RLS Fencing 0082', '83914571673') returning company_id into co;
    insert into contacts (contact_first_name, contact_last_name) values ('Rls', 'Fencer 0082') returning contact_id into ct;
    insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary) values (ct, 'mobile', '0400 111 222', true);
    insert into contact_classifications (contact_id, classification_id) values (ct, 'contractor');
    insert into company_contacts (company_id, contact_id, company_contact_job_role) values (co, ct, 'Fencer');
    insert into record_parties (job_id, contact_id, company_id, party_role_id) values ('9106-002', ct, co, 'contractor');
    select count(*) into n from contact_display where contact_id = ct and contact_approved_at is null and contact_company_name = 'RLS Fencing 0082';
    if n = 1 then raise notice 'ok  a user creates a contact at a company, reaches, classifies and places them — unapproved';
    else raise warning 'FAIL: the user''s contact did not come back unapproved with its company (% rows)', n; end if;
  exception when others then raise warning 'FAIL: unexpected creating parties as a user (%)', sqlerrm; end;

  begin
    update contacts set contact_approved_at = now() where contact_id = ct;
    raise warning 'FAIL: a user approved a contact';
  exception when insufficient_privilege then raise notice 'ok  a user cannot sign off a contact';
    when others then raise warning 'FAIL: unexpected approving as a user (%)', sqlerrm; end;

  begin
    insert into party_roles (party_role_id, party_role_name) values ('sneaky_role', 'Sneaky');
    raise warning 'FAIL: a user added a party role';
  exception when insufficient_privilege then raise notice 'ok  party_roles refuse a write below manager';
    when others then raise warning 'FAIL: unexpected on party_roles (%)', sqlerrm; end;

  begin
    insert into record_staff_roles (job_id, staff_role_id, profile_id) values ('9106-002', 'site_supervisor', (select current_profile_id()));
    raise warning 'FAIL: a user assigned a staff role';
  exception when insufficient_privilege then raise notice 'ok  record_staff_roles refuse a write below manager';
    when others then raise warning 'FAIL: unexpected on record_staff_roles (%)', sqlerrm; end;

  begin
    delete from companies where company_id = co;
    if exists (select 1 from companies where company_id = co) then raise notice 'ok  a user cannot delete a company (the row is still there)';
    else raise warning 'FAIL: a user deleted a company'; end if;
  exception when foreign_key_violation then raise notice 'ok  a company on a record cannot be deleted';
    when others then raise warning 'FAIL: unexpected deleting a company as a user (%)', sqlerrm; end;
end $$;
reset role;
reset request.jwt.claim.sub;
update profiles set profile_permission = 'manager' where profile_email = 'behaviour-test@lofty.com.au';
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  update contacts set contact_approved_at = now() where contact_last_name = 'Fencer 0082';
  select count(*) into n from contacts
   where contact_last_name = 'Fencer 0082' and contact_approved_at is not null and contact_approved_by = (select current_profile_id());
  if n = 1 then raise notice 'ok  a manager signs off the contact, and the stamp names the manager';
  else raise warning 'FAIL: the manager''s approval did not stamp (% rows)', n; end if;
  insert into companies (company_name) values ('RLS Managers Co 0082');
  select count(*) into n from companies where company_name = 'RLS Managers Co 0082' and company_approved_at is not null;
  if n = 1 then raise notice 'ok  a company a manager creates is approved by existing';
  else raise warning 'FAIL: a manager-created company came back unapproved'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';
delete from record_parties where job_id = '9106-002' and contact_id in (select contact_id from contacts where contact_last_name = 'Fencer 0082');
delete from company_contacts where contact_id in (select contact_id from contacts where contact_last_name = 'Fencer 0082');
delete from contacts where contact_last_name = 'Fencer 0082';
delete from companies where company_name in ('RLS Fencing 0082', 'RLS Managers Co 0082');

-- ---------------------------------------------------------------- notifications (0083)
\echo '--- a user reads only their own inbox, sets their own preferences, cannot write the inbox or the rules (0083) ---'
reset request.jwt.claim.sub;
insert into tasks (job_id, task_name, task_assignee_id)
select '9106-002', 'rls probe 0083', profile_id from profiles where profile_email = 'behaviour-test@lofty.com.au';
insert into tasks (job_id, task_name, task_assignee_id)
select '9106-002', 'rls probe 0083 other', profile_id from profiles where profile_email <> 'behaviour-test@lofty.com.au' and profile_is_active limit 1;
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; mine integer;
begin
  select count(*) into n from notifications where notification_type_id = 'task_assigned' and notification_title like '%rls probe 0083%';
  select count(*) into mine from notifications where notification_type_id = 'task_assigned' and notification_title = 'You were assigned rls probe 0083';
  if n = mine and mine = 1 then raise notice 'ok  a user sees their own notification and not the other person''s';
  else raise warning 'FAIL: a user saw % rls-probe notifications, % their own', n, mine; end if;

  perform mark_my_notifications_read();
  if not exists (select 1 from notifications where notification_read_at is null) then raise notice 'ok  mark_my_notifications_read() clears the person''s own unread';
  else raise warning 'FAIL: unread notifications remain after mark_my_notifications_read()'; end if;

  begin
    insert into notifications (profile_id, notification_type_id, notification_title, notification_dedupe_key)
    values ((select current_profile_id()), 'mention', 'forged', 'forged');
    raise warning 'FAIL: a user wrote into the inbox';
  exception when insufficient_privilege then raise notice 'ok  the inbox refuses a client insert';
    when others then raise warning 'FAIL: unexpected writing the inbox (%)', sqlerrm; end;

  begin
    insert into notification_preferences (profile_id, notification_type_id, notification_preference_channel, notification_preference_is_enabled)
    values ((select current_profile_id()), 'task_overdue', 'email', false);
    raise notice 'ok  a user turns a channel off for themselves';
  exception when others then raise warning 'FAIL: unexpected saving a preference (%)', sqlerrm; end;

  begin
    insert into notification_preferences (profile_id, notification_type_id, notification_preference_channel, notification_preference_is_enabled)
    select profile_id, 'task_overdue', 'email', false from profiles where profile_email <> 'behaviour-test@lofty.com.au' limit 1;
    raise warning 'FAIL: a user set another person''s preference';
  exception when insufficient_privilege then raise notice 'ok  a user cannot set another person''s preference';
    when others then raise warning 'FAIL: unexpected on another''s preference (%)', sqlerrm; end;

  begin
    insert into notification_rules (notification_type_id, notification_rule_audience) values ('mention', 'managers');
    raise warning 'FAIL: a user added a notification rule';
  -- "below manager" since 0096, not "below admin": the rules sit on Settings →
  -- Automations, which is the managers' screen. A user is still refused, which is what
  -- this probe is for — the floor moved one rung, it did not disappear.
  exception when insufficient_privilege then raise notice 'ok  notification rules refuse a write below manager';
    when others then raise warning 'FAIL: unexpected on rules (%)', sqlerrm; end;

  begin
    insert into record_watchers (profile_id, job_id) values ((select current_profile_id()), '9106-002');
    raise notice 'ok  a user watches a job';
  exception when others then raise warning 'FAIL: unexpected watching (%)', sqlerrm; end;

  begin
    perform claim_notification_deliveries('email', 1);
    raise warning 'FAIL: a user drained the outbox';
  exception when insufficient_privilege then raise notice 'ok  the outbox claim is not a user''s to call';
    when others then raise warning 'FAIL: unexpected claiming deliveries (%)', sqlerrm; end;
end $$;
reset role;
reset request.jwt.claim.sub;
delete from record_watchers where job_id = '9106-002';
delete from notification_preferences where notification_type_id = 'task_overdue';
delete from tasks where task_name like 'rls probe 0083%';
delete from notifications where notification_title like '%rls probe 0083%';

-- ---------------------------------------------------------------- maintenance (0084)
\echo '--- a user logs a request and offers an item; settings and categories are the managers''; the token and the two service RPCs are nobody''s (0084) ---'
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; req uuid; req_no text; item uuid; co uuid; tok text; sent text;
begin
  select count(*) into n from maintenance_settings;
  if n = 1 then raise notice 'ok  a user reads the one settings row';
  else raise warning 'FAIL: a user saw % settings rows', n; end if;

  update maintenance_settings set maintenance_setting_warranty_months = 12 where maintenance_setting_id = 1;
  get diagnostics n = row_count;
  if n = 0 then raise notice 'ok  a user cannot change the settings (0 rows reached)';
  else raise warning 'FAIL: a user changed the maintenance settings'; end if;

  begin
    insert into maintenance_categories (maintenance_category_id, maintenance_category_name) values ('rls_probe_0084', 'RLS probe');
    raise warning 'FAIL: a user added a maintenance category';
  exception when insufficient_privilege then raise notice 'ok  maintenance categories refuse a write below manager';
    when others then raise warning 'FAIL: unexpected on categories (%)', sqlerrm; end;

  insert into maintenance_requests (job_id, maintenance_request_source, maintenance_request_summary)
  values ('9106-002', 'phone', 'rls probe 0084') returning maintenance_request_id, maintenance_request_number into req, req_no;
  if req_no ~ '^9106-002-M[0-9]+$' then raise notice 'ok  a user logs a request and it is numbered on the job (%)', req_no;
  else raise warning 'FAIL: the request was numbered %', req_no; end if;

  insert into maintenance_items (maintenance_request_id, maintenance_item_description) values (req, 'rls probe item') returning maintenance_item_id into item;
  insert into companies (company_name) values ('RLS probe trade 0084') returning company_id into co;
  insert into contact_methods (company_id, contact_method_kind, contact_method_value, contact_method_is_primary) values (co, 'email', 'trade0084@example.com', true);
  select o.accept_token, o.sent_to into tok, sent from offer_maintenance_item(item, co, null, null) o;
  if length(tok) = 48 and sent = 'trade0084@example.com' then raise notice 'ok  a user offers an item; the token comes back once and the email is queued to the company';
  else raise warning 'FAIL: offer returned token length % to %', length(tok), sent; end if;

  begin
    select count(*) into n from maintenance_message_secrets;
    if n = 0 then raise notice 'ok  the parked token is invisible to a user (RLS, no policy)';
    else raise warning 'FAIL: a user read % parked tokens', n; end if;
  exception when insufficient_privilege then raise notice 'ok  the parked token is invisible to a user (table revoked)'; end;

  begin
    perform answer_maintenance_offer(tok, true);
    raise warning 'FAIL: a user answered an offer through the service RPC';
  exception when insufficient_privilege then raise notice 'ok  answer_maintenance_offer() is not a user''s to call';
    when others then raise warning 'FAIL: unexpected answering (%)', sqlerrm; end;

  begin
    perform receive_maintenance_email('rls-0084', 'x@example.com', 'x', 'x');
    raise warning 'FAIL: a user fed the inbound mail RPC';
  exception when insufficient_privilege then raise notice 'ok  receive_maintenance_email() is not a user''s to call';
    when others then raise warning 'FAIL: unexpected on inbound (%)', sqlerrm; end;

  delete from maintenance_requests where maintenance_request_id = req;
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from maintenance_requests where maintenance_request_id = req) then raise notice 'ok  a user cannot delete a request (the row is still there)';
  else raise warning 'FAIL: a user deleted a maintenance request'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
update profiles set profile_permission = 'manager' where profile_email = 'behaviour-test@lofty.com.au';
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  update maintenance_settings set maintenance_setting_offer_response_hours = 48 where maintenance_setting_id = 1;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'ok  a manager edits the settings (the SLAs are theirs)';
  else raise warning 'FAIL: a manager could not edit the settings'; end if;
  begin
    insert into maintenance_categories (maintenance_category_id, maintenance_category_name, maintenance_category_sla_days) values ('rls_probe_0084', 'RLS probe', 5);
    raise notice 'ok  a manager adds a category';
  exception when others then raise warning 'FAIL: a manager could not add a category (%)', sqlerrm; end;
end $$;
reset role;
reset request.jwt.claim.sub;
update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';
delete from maintenance_requests where job_id = '9106-002';
delete from maintenance_categories where maintenance_category_id = 'rls_probe_0084';
delete from companies where company_name = 'RLS probe trade 0084';
delete from notifications where notification_type_id like 'maintenance_%' and job_id = '9106-002';

-- Left as found.
reset request.jwt.claim.sub;
delete from processes where process_key = 'probe_manager_process';
delete from property_defs where property_def_key in ('probe_margin', 'probe_pour', 'probe_team_only');
delete from property_value_history where property_def_key in ('probe_margin', 'probe_pour', 'probe_team_only');
update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';

-- ============================================ the library and its documents (0094)
--
-- Amber, 4 September, set the floor at `user` throughout and put the gate on the
-- SIGN-OFF instead: anyone may propose a template or a section, a manager signs it into
-- the library, and until then it is the author's own draft that nobody else can see.
--
-- So these probes are about four things a permission floor cannot express:
--   * an unapproved draft is invisible to everybody but its author
--   * a user cannot sign one off, their own included
--   * an APPROVED entry is no longer its author's to edit
--   * a manager-scoped entry is not readable below manager
--
-- Each was watched failing with the matching policy or the trigger widened before it was
-- watched passing.
\echo '=== the library: anyone proposes, a manager signs off, an approved entry is the library''s ==='

-- Somebody else's draft and somebody else's approved entry, planted as the OWNER so the
-- probe below is asking "can this person see a row they did not write", which is the
-- whole question. current_profile_id() is null here, so the approval guard passes
-- through and the values written are the values that stick.
insert into profiles (profile_first_name, profile_last_name, profile_email, profile_permission)
values ('Someone','Else','rls-other@lofty.com.au','user')
on conflict (profile_email) do nothing;
insert into report_templates (report_template_name, report_template_kind, report_template_created_by)
select '__rls__ somebody else''s draft', 'template', profile_id
  from profiles where profile_email = 'rls-other@lofty.com.au';
insert into report_templates (report_template_name, report_template_approved_at, report_template_approved_by, report_template_created_by)
select '__rls__ in the library', now(), profile_id, profile_id
  from profiles where profile_email = 'rls-other@lofty.com.au';
-- A manager-only entry, to prove the scope band.
insert into report_templates (report_template_name, report_template_scope, report_template_approved_at, report_template_approved_by)
select '__rls__ managers only', 'managers', now(), profile_id
  from profiles where profile_email = 'rls-other@lofty.com.au';

update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; mine uuid;
begin
  -- The approved one is readable; the other person's DRAFT is not. If the read policy
  -- ever loses its approval clause, the second half of this reports it.
  select count(*) into n from report_templates where report_template_name = '__rls__ in the library';
  if n = 1 then raise notice 'ok  a user reads an approved library entry';
  else raise warning 'FAIL: a user could not read an approved library entry'; end if;

  select count(*) into n from report_templates where report_template_name = '__rls__ somebody else''s draft';
  if n = 0 then raise notice 'ok  a user cannot see somebody else''s unapproved draft';
  else raise warning 'FAIL: a user read another person''s draft'; end if;

  select count(*) into n from report_templates where report_template_name = '__rls__ managers only';
  if n = 0 then raise notice 'ok  a manager-scoped entry is invisible below manager';
  else raise warning 'FAIL: a user read a manager-scoped template'; end if;

  -- Proposing is allowed…
  begin
    insert into report_templates (report_template_name, report_template_kind)
    values ('__rls__ a user''s proposal', 'section')
    returning report_template_id into mine;
    raise notice 'ok  a user proposes a section';
  exception when others then raise warning 'FAIL: a user could not propose a section (%)', sqlerrm; end;

  -- …and it lands unapproved, whatever the client sent. The trigger decides this, not
  -- the payload: watched with the guard's manager branch removed, when the same insert
  -- came back already in the library.
  if (select report_template_approved_at from report_templates where report_template_id = mine) is null then
    raise notice 'ok  a user''s proposal waits for a manager';
  else raise warning 'FAIL: a user''s proposal approved itself'; end if;

  -- Their own draft is theirs to see and to edit.
  update report_templates set report_template_layout = '{"widgets": [{"id":"w","kind":"heading","options":{}}]}'::jsonb
   where report_template_id = mine;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'ok  a user edits their own draft';
  else raise warning 'FAIL: a user could not edit their own draft'; end if;

  -- Signing it off is not.
  begin
    update report_templates set report_template_approved_at = now() where report_template_id = mine;
    raise warning 'FAIL: a user signed off their own template';
  exception when insufficient_privilege then raise notice 'ok  a user cannot sign off their own template';
    when others then raise warning 'FAIL: unexpected on self sign-off (%)', sqlerrm; end;

  -- Nor is editing something already in the library.
  update report_templates set report_template_name = '__rls__ renamed by a user'
   where report_template_name = '__rls__ in the library';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'ok  a user cannot edit an approved library entry';
  else raise warning 'FAIL: a user edited an approved library entry'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

update profiles set profile_permission = 'manager' where profile_email = 'behaviour-test@lofty.com.au';
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; approver uuid; who uuid;
begin
  -- A manager sees the manager-scoped entry the user could not.
  select count(*) into n from report_templates where report_template_name = '__rls__ managers only';
  if n = 1 then raise notice 'ok  a manager reads a manager-scoped entry';
  else raise warning 'FAIL: a manager could not read a manager-scoped entry'; end if;

  -- Signing off stamps the manager from the SESSION. Watched with the guard's
  -- coalesce(me, ...) replaced by the submitted value: the row came back approved by
  -- whoever the client named.
  update report_templates set report_template_approved_at = now()
   where report_template_name = '__rls__ a user''s proposal';
  get diagnostics n = row_count;
  select report_template_approved_by into approver from report_templates
   where report_template_name = '__rls__ a user''s proposal';
  select profile_id into who from profiles where profile_email = 'behaviour-test@lofty.com.au';
  if n = 1 and approver = who then raise notice 'ok  a manager signs a proposal into the library, and is named as the approver';
  else raise warning 'FAIL: sign-off wrote % rows, approver %', n, approver; end if;

  -- A manager writing one approves it by existing — the same rule contacts and companies
  -- have had since 0082.
  insert into report_templates (report_template_name) values ('__rls__ a manager''s own');
  if (select report_template_approved_at from report_templates where report_template_name = '__rls__ a manager''s own') is not null then
    raise notice 'ok  a manager''s own template is in the library on creation';
  else raise warning 'FAIL: a manager''s template waited for approval'; end if;

  -- Taking a sign-off back is a manager's too, and it puts the entry out of sight again.
  update report_templates set report_template_approved_at = null, report_template_approved_by = null
   where report_template_name = '__rls__ a manager''s own';
  if (select report_template_approved_at from report_templates where report_template_name = '__rls__ a manager''s own') is null then
    raise notice 'ok  a manager can take a sign-off back';
  else raise warning 'FAIL: a sign-off could not be withdrawn'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ─────────────────────────────────────────────────────────────────────────
-- EVERY KIND IS COVERED BY THE SAME FOUR POLICIES, AND THAT IS LOAD-BEARING.
--
-- 0098 added `snippet` as a third kind with one value on one CHECK and no policy work at
-- all. That was only correct because none of the four policies on this table look at
-- `report_template_kind` — a snippet therefore inherits the visibility bands, the
-- sign-off and the delete rules already proved above, rather than arriving unguarded.
--
-- The assumption is invisible in the diff that relies on it, so it is asserted here. The
-- day somebody writes "…and templates may also be read by…", the next kind added the
-- 0098 way is a row nothing protects, and this is what says so.
do $$
declare kinded text;
begin
  select string_agg(polname, ', ') into kinded
    from pg_policy
   where polrelid = 'report_templates'::regclass
     and (coalesce(pg_get_expr(polqual, polrelid), '') like '%report_template_kind%'
       or coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%report_template_kind%');
  if kinded is null then
    raise notice 'ok  no policy on report_templates branches on kind, so a new kind inherits the sign-off';
  else
    raise warning 'FAIL: these policies branch on kind, so a new kind is not covered by what was proved above: %', kinded;
  end if;
end $$;

\echo '=== documents: a user makes and edits one; deleting somebody else''s is not theirs ==='
-- Somebody else's document, planted as the owner for the same reason as above.
insert into report_documents (report_document_title, report_document_created_by)
select '__rls__ somebody else''s letter', profile_id
  from profiles where profile_email = 'rls-other@lofty.com.au';

update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer; doc uuid;
begin
  insert into report_documents (report_document_title, report_document_layout)
  values ('__rls__ a user''s letter', '{"widgets": []}'::jsonb)
  returning report_document_id into doc;
  raise notice 'ok  a user makes a document';

  update report_documents set report_document_title = '__rls__ a user''s letter, edited'
   where report_document_id = doc;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'ok  a user edits their own document';
  else raise warning 'FAIL: a user could not edit their own document'; end if;

  -- A document is internal work product and reads like every other record here.
  select count(*) into n from report_documents where report_document_title = '__rls__ somebody else''s letter';
  if n = 1 then raise notice 'ok  a user reads a colleague''s document';
  else raise warning 'FAIL: a user could not read a colleague''s document'; end if;

  -- Deleting one is not the same as reading it.
  delete from report_documents where report_document_title = '__rls__ somebody else''s letter';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'ok  a user cannot delete a colleague''s document';
  else raise warning 'FAIL: a user deleted a colleague''s document'; end if;

  delete from report_documents where report_document_id = doc;
  get diagnostics n = row_count;
  if n = 1 then raise notice 'ok  a user deletes their own document';
  else raise warning 'FAIL: a user could not delete their own document'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

update profiles set profile_permission = 'admin' where profile_email = 'behaviour-test@lofty.com.au';
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare n integer;
begin
  delete from report_documents where report_document_title like '__rls__%';
  get diagnostics n = row_count;
  if n >= 1 then raise notice 'ok  an admin deletes anybody''s document';
  else raise warning 'FAIL: an admin deleted nothing'; end if;

  delete from report_templates where report_template_name like '__rls__%';
  get diagnostics n = row_count;
  if n >= 3 then raise notice 'ok  an admin clears the library';
  else raise warning 'FAIL: an admin deleted % library entries', n; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

\echo '--- sharing: a document leaves Lofty as a snapshot, and two columns never come back ---'

-- Sharing is an UPDATE, so the floor is the one editing already had (0094). What is new
-- is that the two columns a share writes must not be READABLE by anybody signed in,
-- whatever their level: 0095 revokes the column grant, because RLS chooses rows and says
-- nothing about columns. Run as a plain user, which is the weakest thing that can share.
set role authenticated;
set request.jwt.claim.sub = :'uid';
do $$
declare
  doc uuid;
  n integer;
  snap jsonb := '{"report": {"title": "__rls__ progress report", "sections": []}}'::jsonb;
begin
  insert into report_documents (report_document_title) values ('__rls__ to share')
    returning report_document_id into doc;

  update report_documents
     set report_document_share_token = '__rls__tok',
         report_document_share_expires_at = now() + interval '30 days',
         report_document_share_snapshot = snap
   where report_document_id = doc;
  select count(*) into n from report_documents
   where report_document_id = doc and report_document_share_token = '__rls__tok';
  if n = 1 then raise notice 'ok  a user shares their own document';
  else raise warning 'FAIL: a user could not share their own document'; end if;

  -- The derived boolean answers what the app asks…
  select count(*) into n from report_documents
   where report_document_id = doc and report_document_has_share_snapshot;
  if n = 1 then raise notice 'ok  the app can tell a document was shared';
  else raise warning 'FAIL: has_share_snapshot did not report a share'; end if;

  -- …and the columns behind it cannot be read back, by this user or any other.
  begin
    perform report_document_share_snapshot from report_documents where report_document_id = doc;
    raise warning 'FAIL: a signed-in user read the share snapshot';
  exception when insufficient_privilege then
    raise notice 'ok  the snapshot is not readable by a signed-in session';
  end;
  begin
    perform report_document_share_password_hash from report_documents where report_document_id = doc;
    raise warning 'FAIL: a signed-in user read the share password hash';
  exception when insufficient_privilege then
    raise notice 'ok  the password hash is not readable by a signed-in session';
  end;

  -- Revoking keeps the record of what was sent — 0095's constraint is an implication
  -- rather than an equivalence precisely so that it can.
  update report_documents
     set report_document_share_token = null, report_document_share_expires_at = null
   where report_document_id = doc;
  select count(*) into n from report_documents
   where report_document_id = doc and report_document_has_share_snapshot;
  if n = 1 then raise notice 'ok  revoking a link keeps what was sent';
  else raise warning 'FAIL: revoking a link discarded the snapshot'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- Left as found.
delete from report_documents where report_document_title like '__rls__%';
delete from report_templates where report_template_name like '__rls__%';
delete from profiles where profile_email = 'rls-other@lofty.com.au';
update profiles set profile_permission = 'user' where profile_email = 'behaviour-test@lofty.com.au';
