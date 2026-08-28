-- 0052 — a place to put a bug and an idea
--
-- Amber, 28 Aug: "add in setup a tab called 'ideas' and 'bugs' and have an icon for
-- each in the bottom footer that opens a form to enter a bug in the app or an idea for
-- improvement. Anyone from a viewer up can submit a bug or an idea. Only admins and
-- superadmins can see these in the setup tab. This way I can track what needs to be
-- implemented."
--
-- So: the widest write in the schema, and one of its narrowest reads. That asymmetry is
-- the whole design, and it is why the policies are split rather than one `for all`.
--
-- ------------------------------------------------------------------ one table, two kinds
-- A bug and an idea are the same row with a different word on it: somebody hit
-- something, wrote it down, and it needs triaging. Two tables would mean two policies,
-- two repository pairs and two screens that drift apart — for a column. The Setup tabs
-- filter on the kind.

create table feedback (
  feedback_id uuid primary key default gen_random_uuid(),

  feedback_kind text not null
    constraint feedback_kind_is_known check (feedback_kind in ('bug', 'idea')),

  -- The one-line version, which is what the list shows. Blank is refused: a report
  -- nobody can identify in a list is a report nobody will action.
  feedback_title text not null
    constraint feedback_title_not_blank check (btrim(feedback_title) <> ''),

  -- Everything else. Empty is allowed and means empty — somebody had a title and
  -- nothing more, which is still worth having.
  feedback_detail text not null default '',

  -- Where they were when they sent it: the app path, captured rather than typed. For a
  -- bug this is most of the reproduction, and it is the one field a person reporting in
  -- a hurry will always leave out.
  feedback_page text,

  -- Amber's reason for the whole feature is tracking: "this way I can track what needs
  -- to be implemented". A list with no state cannot be tracked — you would be reading
  -- the same forty rows every week to remember which were done. Four values, and no
  -- more, because a triage board is not what she asked for.
  feedback_status text not null default 'new'
    constraint feedback_status_is_known
      check (feedback_status in ('new', 'planned', 'done', 'declined')),

  -- Nullable, and ON DELETE SET NULL rather than CASCADE: the report outlives the
  -- reporter. Nobody is hard-deleted here (their name is on years of activity), so this
  -- is a rule about what matters if that ever changes — a bug report is about the app,
  -- not about the person who noticed it.
  profile_id uuid references profiles(profile_id) on delete set null,

  feedback_created_at timestamptz not null default now(),
  feedback_updated_at timestamptz not null default now()
);

comment on table feedback is
  'Bugs and ideas, sent from the footer by anyone signed in and read only by admins in Setup (Amber, 28 Aug). Insert is the widest write in the schema and select one of the narrowest, which is why the policies are split rather than one for-all.';

-- The Setup tabs read one kind at a time, newest first, and nothing else ever queries
-- this table — so one index, shaped like that query.
create index feedback_kind_recent_idx on feedback (feedback_kind, feedback_created_at desc);

alter table feedback enable row level security;

-- ------------------------------------------------------------------------- writing
-- "Anyone from a viewer up": every active person, which is exactly what is_active_user()
-- already means — and it also holds the demo gate (0049), so an account held at the door
-- cannot post from a screen it never reaches.
--
-- The row must be stamped with the sender. Without this clause somebody could file a
-- report under a colleague's name, and the whole value of the list is knowing who to go
-- back to for the details.
create policy "anyone active reports" on feedback
  for insert to authenticated
  with check (
    (select is_active_user())
    and profile_id = (select current_profile_id())
  );

-- ------------------------------------------------------------------------- reading
-- Admin and above only, by her instruction. Note what this costs and why it is right:
-- the sender cannot read back what they sent, so the app must not ask for the row after
-- inserting it (the repository inserts without a returning clause, or the write fails
-- on the select). The alternative — "…or it is mine" — would put a second, wider
-- predicate on a table whose whole point is that only admins triage it, and OR'd
-- policies are how a narrow rule quietly becomes a broad one.
create policy "admins read feedback" on feedback
  for select to authenticated
  using ((select current_permission()) >= 'admin');

-- Triage is admin work: setting status is the only edit, and the screen only offers
-- that. No delete policy at all — 'declined' is the answer to a report that is not
-- going anywhere, and it keeps the record of having considered it.
create policy "admins triage feedback" on feedback
  for update to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');

-- moddatetime with the column as its argument — the 0028 convention.
create trigger feedback_touch before update on feedback
  for each row execute function extensions.moddatetime(feedback_updated_at);

-- ---------------------------------------------------------------------------- proof
-- Watched failing before it was trusted, in rolled-back transactions on the live
-- database (verify/rls.sql carries the standing probes):
--   * a viewer inserts a bug, and cannot then select it back;
--   * a viewer stamping somebody else's profile_id is refused by the with-check;
--   * a demo account is refused the insert outright, because is_active_user() is false;
--   * a manager sees no rows at all; an admin sees them and can set a status;
--   * a manager's status update matches no row rather than erroring.
-- Each one watched biting against a deliberately permissive `using (true)` first.
