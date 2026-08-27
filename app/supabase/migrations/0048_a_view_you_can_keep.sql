-- 0048 — a view you can keep
--
-- Amber's Q9, third layer: beyond the three fixed tabs, a person saves a named view —
-- the view mode, grouping and filters they are looking at — and gets it back anywhere
-- they sign in. The first two layers shipped app-side (the URL is the state; the
-- session remembers per board); this is the durable one.
--
-- The state itself is the board's QUERY STRING, stored verbatim. The URL is already
-- the app's serialisation of "what am I looking at" — every control writes it, links
-- share it, and unknown keys fall back harmlessly on read (useBoardParams ignores what
-- it does not know). Inventing a second schema for the same fact would give the two a
-- way to disagree.
--
-- Private by default: a saved view is a working habit, not a broadcast. A shared flag
-- can come later if Lofty wants team views — a column, not a redesign.

create table saved_views (
  saved_view_id uuid primary key default gen_random_uuid(),

  -- Whose view it is. Cascade: a person's saved views are theirs, and go with them.
  profile_id uuid not null references profiles(profile_id) on delete cascade,

  -- Which board it belongs to — the first path segment, the same key the session
  -- persistence uses. CHECKed to the two boards that have saved views.
  saved_view_board text not null
    constraint saved_views_board_is_a_board
      check (saved_view_board in ('jobs', 'projects')),

  saved_view_name text not null
    constraint saved_views_name_is_not_blank
      check (btrim(saved_view_name) <> ''),

  -- The board's query string, without the leading '?'. Verbatim — see above.
  saved_view_query text not null,

  saved_view_created_at timestamptz not null default now(),
  saved_view_updated_at timestamptz not null default now(),

  -- One name per board per person — two views both called "My site work" would be a
  -- coin-toss every time. Doubles as the index the RLS filter on profile_id uses.
  constraint saved_views_one_name_per_board unique (profile_id, saved_view_board, saved_view_name)
);

comment on table saved_views is
  'A person''s named board states (Amber''s Q9, third layer): the query string of a board, saved verbatim under a name. Private to the owner by RLS; the three built-in tabs stay code, these render after them.';
comment on column saved_views.saved_view_board is
  'Which board the view belongs to — jobs or projects, the URL''s first path segment.';
comment on column saved_views.saved_view_query is
  'The board''s query string without the leading ?, stored verbatim. The URL is already the app''s serialisation of the board''s state; a second schema for the same fact could only disagree with it.';

alter table saved_views enable row level security;

-- Owner-only, all four verbs: nobody reads or edits another person's saved views.
-- The subselect keeps current_profile_id() an initplan rather than per-row.
create policy "own saved views" on saved_views
  for all to authenticated
  using (profile_id = (select current_profile_id()))
  with check (profile_id = (select current_profile_id()));

-- moddatetime with the column as its argument — the 0028 convention, since the
-- column names carry their table's prefix.
create trigger saved_views_touch before update on saved_views
  for each row execute function extensions.moddatetime(saved_view_updated_at);

-- ---------------------------------------------------------------------- proof
-- Each rule watched biting: an insert that should be refused, refused for the right
-- reason, in a sub-block whose rollback removes the attempt. The accepted rows are
-- deleted explicitly, so the migration leaves the table exactly as created: empty.
--
-- The RLS half is proved in `verify/rls.sql` — as `authenticated`, because everything
-- here runs as the owner and BYPASSES the policy. That probe was itself watched failing
-- against the live database inside a rolled-back transaction: with "own saved views"
-- swapped for a permissive `using (true)`, it reported another person's view as readable
-- and let one be written onto them. With the real policy, all five probes pass.
do $$
declare
  someone uuid;
begin
  select profile_id into strict someone from profiles limit 1;

  -- A board that isn't a board is refused.
  begin
    insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
    values (someone, 'reports', '__proof__', 'view=Table');
    raise exception 'a non-board saved view was accepted';
  exception
    when check_violation then null;
  end;

  -- A blank name is refused.
  begin
    insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
    values (someone, 'jobs', '   ', 'view=Table');
    raise exception 'a blank saved-view name was accepted';
  exception
    when check_violation then null;
  end;

  -- The same name twice on one board for one person is refused.
  insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
  values (someone, 'jobs', '__proof__', 'view=Table');
  begin
    insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
    values (someone, 'jobs', '__proof__', 'view=Gantt');
    raise exception 'a duplicate saved-view name was accepted';
  exception
    when unique_violation then null;
  end;

  -- The same name on the OTHER board is fine — the uniqueness is per board.
  insert into saved_views (profile_id, saved_view_board, saved_view_name, saved_view_query)
  values (someone, 'projects', '__proof__', 'view=Gantt');

  delete from saved_views where saved_view_name = '__proof__';
end $$;
