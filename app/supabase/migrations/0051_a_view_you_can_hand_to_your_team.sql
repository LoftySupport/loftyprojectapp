-- 0051 — a view you can hand to your team
--
-- Amber, 27 Aug: "team views matter, plan for them". 0048 said this would be "a column,
-- not a redesign", and it is. Private stays the default; sharing is a deliberate act
-- somebody takes on one view.

alter table saved_views
  -- Null means private, which is the state every existing row is already in — so this
  -- ships without a backfill and without changing what anybody sees today.
  add column saved_view_shared_with_team text references teams(team_id);

comment on column saved_views.saved_view_shared_with_team is
  'The team this view is shared with, or null for private (the default). A shared view is readable by everybody in that team and editable only by the person who made it.';

-- The single "own saved views" policy splits in two, because reading and writing stop
-- having the same answer:
--
--   READ   your own, plus anything shared with a team you are in.
--   WRITE  your own. Always. Somebody who wants their own version of a shared view
--          saves a copy — which is one click and cannot surprise the person who made
--          the original by rewriting it under them.
--
-- Splitting rather than widening the ALL policy is the whole safety of this change: a
-- widened `for all` would have let anyone in Construction delete Deanna's view.
drop policy "own saved views" on saved_views;

create policy "read own and shared views" on saved_views
  for select to authenticated
  using (
    profile_id = (select current_profile_id())
    -- Membership is a TABLE (0026 brought profile_teams back for the managing flag),
    -- not the array 0022 briefly made it. The subquery names no column of saved_views,
    -- so Postgres runs it once as an initplan rather than per row.
    or saved_view_shared_with_team = any (
         select team_id from profile_teams
          where profile_id = (select current_profile_id()))
  );

create policy "write own views" on saved_views
  for insert to authenticated with check (profile_id = (select current_profile_id()));
create policy "update own views" on saved_views
  for update to authenticated
  using (profile_id = (select current_profile_id()))
  with check (profile_id = (select current_profile_id()));
create policy "delete own views" on saved_views
  for delete to authenticated using (profile_id = (select current_profile_id()));

-- --------------------------------------------------------------- what NOT to change
-- The unique (profile_id, board, name) stays as it is. Two people may both call a view
-- "Site this week" and both share it — that is not a collision, it is two people using
-- the same words, and a constraint stopping the second one would be the app telling
-- somebody their own private naming is wrong. The tab row answers it instead: a shared
-- view carries whose it is ("Site this week · Deanna"), so the row is never ambiguous.

-- ---------------------------------------------------------------------- proof
-- The write policies must never see the shared clause — that is the whole safety of
-- splitting them. Watched here as the owner (this block runs privileged, so it proves
-- the SHAPE); the RLS half, as a real signed-in person, is in verify/rls.sql and was
-- watched failing against a deliberately widened `for all` policy first.
do $$
declare
  someone uuid; a_team text;
begin
  select profile_id into strict someone from profiles limit 1;
  select team_id into strict a_team from teams where team_is_active limit 1;

  -- A team that is not a team is refused: the FK is what stops a typo becoming a
  -- share with nobody, which would look private and read as broken.
  begin
    insert into saved_views (profile_id, saved_view_board, saved_view_name,
                             saved_view_query, saved_view_shared_with_team)
    values (someone, 'jobs', '__share_proof__', 'view=Table', 'not_a_team');
    raise exception 'a view was shared with a team that does not exist';
  exception when foreign_key_violation then null;
  end;

  -- A real team is fine, and null stays the default.
  insert into saved_views (profile_id, saved_view_board, saved_view_name,
                           saved_view_query, saved_view_shared_with_team)
  values (someone, 'jobs', '__share_proof__', 'view=Table', a_team);
  if (select saved_view_shared_with_team from saved_views
       where saved_view_name = '__share_proof__') is null then
    raise exception 'the share did not stick';
  end if;

  insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
  values (someone, 'jobs', '__private_proof__', 'view=Gantt');
  if (select saved_view_shared_with_team from saved_views
       where saved_view_name = '__private_proof__') is not null then
    raise exception 'a view defaulted to shared';
  end if;

  delete from saved_views where saved_view_name in ('__share_proof__', '__private_proof__');
end $$;
