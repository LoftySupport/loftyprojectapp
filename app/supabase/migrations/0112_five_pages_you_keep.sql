-- 0112 — five pages you keep
--
-- The rail's **Pinned** section, from the 11 September design handoff. Amber, asked what
-- Pinned pins: *"pinned is new and allows people to save/bookmark a page"* — **any page**,
-- a URL with a name. A filtered board, a settings screen, a job, a report.
--
-- THE MOCKUP DRAWS THIS WRONG, AND THE DIFFERENCE IS THE WHOLE TABLE
--
--   7a renders pinned rows as PROJECTS, each with an 8px health dot in orange, teal or
--   grey. That would be a second, weaker list of projects beside the Projects
--   destination. What Amber described is a bookmark, and a bookmark has no health — so
--   there is no status column here and the rail draws a small icon for the KIND of page
--   instead. See `docs/design/handoff/README.md`, correction 3.
--
-- THE KIND IS NOT A COLUMN, DELIBERATELY
--
--   `/jobs/1209-002` is a job, `/projects?saved=current` is a board, `/setup/processes`
--   is a settings screen. The URL already says which, so the app derives the icon from
--   it. A `pinned_page_kind` column would be a second source for a fact the first column
--   already carries, and the two would disagree the first time somebody edited one.
--
-- FIVE, AND HOW FIVE IS ENFORCED
--
--   *"max five"*. Not a counting trigger: two tabs pinning at once would both count four
--   and both insert. A position of 1..5 with a UNIQUE per person caps it declaratively
--   and race-safely — the sixth insert has nowhere to go, because there is no sixth slot.
--   It also gives the rail a stable order, which a created_at sort would only approximate
--   once somebody wanted to move a row up.
--
-- WHY THE URL IS CONSTRAINED TO AN IN-APP PATH
--
--   This value is written by a person and rendered by the app into an anchor's `href`.
--   Left free, `https://…` or the protocol-relative `//evil.example` would both be
--   stored happily and both navigate off Lofty from inside the navigation rail — the one
--   component on every screen that people trust without reading. A leading single slash
--   is the whole of the rule, and it is in the database rather than only in the app
--   because the app's checks hide controls and the database is the boundary.

create table pinned_pages (
  pinned_page_id uuid primary key default gen_random_uuid(),

  -- Whose pin it is. Cascade: a person's bookmarks are theirs and go with them, exactly
  -- as saved_views does it (0048).
  profile_id uuid not null references profiles(profile_id) on delete cascade,

  -- What they called it. Capped so one pin cannot push the rail's width around; the app
  -- ellipsises anyway, but a 4 kB label is a paste accident rather than a name.
  pinned_page_label text not null
    constraint pinned_pages_label_is_not_blank
      check (btrim(pinned_page_label) <> '')
    constraint pinned_pages_label_is_not_an_essay
      check (length(pinned_page_label) <= 60),

  -- Where it goes: a path inside this app, query string and all. See above for why the
  -- leading slash is a constraint and not a convention.
  pinned_page_url text not null
    constraint pinned_pages_url_is_an_in_app_path
      check (pinned_page_url like '/%' and pinned_page_url not like '//%')
    constraint pinned_pages_url_is_not_an_essay
      check (length(pinned_page_url) <= 2000),

  -- 1..5, and the slot is the order in the rail.
  pinned_page_position integer not null
    constraint pinned_pages_position_is_one_of_five
      check (pinned_page_position between 1 and 5),

  pinned_page_created_at timestamptz not null default now(),
  pinned_page_updated_at timestamptz not null default now(),

  -- The cap, and the ordering, in one constraint: five slots, one row each.
  constraint pinned_pages_five_slots_per_person unique (profile_id, pinned_page_position),

  -- The same page pinned twice is a mistake every time, and it costs one of five slots.
  constraint pinned_pages_one_pin_per_page unique (profile_id, pinned_page_url)
);

comment on table pinned_pages is
  'Up to five pages a person has bookmarked into the navigation rail (0112) — a label and an in-app path, nothing else. Private to the owner by RLS. Deliberately NOT projects with a health dot, which is how the mockup drew it: a URL has no health, so the rail shows an icon for the kind of page instead, derived from the path.';
comment on column pinned_pages.pinned_page_url is
  'An in-app path with its query string, e.g. /jobs/1209-002 or /projects?saved=current. CHECKed to start with a single slash: the value is written by a person and rendered into an href, and an absolute or protocol-relative URL would navigate off Lofty from the one component that is on every screen.';
comment on column pinned_pages.pinned_page_position is
  'Which of the five slots this pin occupies, and the order it draws in. UNIQUE per person, which is how the five-pin cap is enforced — a counting trigger would let two concurrent pins both see four and both insert.';

alter table pinned_pages enable row level security;

-- Owner-only, all four verbs — nobody reads or edits anybody else's bookmarks. The
-- subselect keeps current_profile_id() an initplan rather than a per-row call, which is
-- the 0048 convention.
create policy "own pinned pages" on pinned_pages
  for all to authenticated
  using (profile_id = (select current_profile_id()))
  with check (profile_id = (select current_profile_id()));

-- moddatetime with the column as its argument — the 0028 convention, since the column
-- names carry their table's prefix.
create trigger pinned_pages_touch before update on pinned_pages
  for each row execute function extensions.moddatetime(pinned_page_updated_at);

-- Audited like everything else. 0080 took the allowlist out of log_activity_audit() and
-- verify/behaviour.sql asserts that every non-log table in public carries this trigger,
-- so a table created without one fails the check on the day it is created. This one did:
-- the assertion reported `tables without the audit trigger: pinned_pages` on the first
-- run, which is the check doing exactly the job 0080 built it for.
create trigger trg_activity_audit_row after insert or update or delete on pinned_pages
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- Each rule watched biting: an insert that should be refused, refused for the right
-- reason, in a sub-block whose rollback removes the attempt. The accepted rows are
-- deleted explicitly, so the migration leaves the table exactly as created: empty.
--
-- The RLS half is proved in `verify/rls.sql` — as `authenticated`, because everything
-- here runs as the owner and BYPASSES the policy.
do $$
declare
  someone uuid;
begin
  select profile_id into strict someone from profiles limit 1;

  -- A blank label is refused.
  begin
    insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
    values (someone, '   ', '/jobs', 1);
    raise exception 'a blank pin label was accepted';
  exception
    when check_violation then null;
  end;

  -- An absolute URL is refused — this is the one that matters.
  begin
    insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
    values (someone, '__proof__', 'https://example.invalid/steal', 1);
    raise exception 'an off-site pin URL was accepted';
  exception
    when check_violation then null;
  end;

  -- …and so is the protocol-relative form, which is the one people forget.
  begin
    insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
    values (someone, '__proof__', '//example.invalid/steal', 1);
    raise exception 'a protocol-relative pin URL was accepted';
  exception
    when check_violation then null;
  end;

  -- A sixth slot does not exist.
  begin
    insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
    values (someone, '__proof__', '/jobs', 6);
    raise exception 'a sixth pin slot was accepted';
  exception
    when check_violation then null;
  end;

  -- Five fit.
  insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
  values (someone, '__proof__ 1', '/jobs', 1),
         (someone, '__proof__ 2', '/projects', 2),
         (someone, '__proof__ 3', '/maintenance', 3),
         (someone, '__proof__ 4', '/reports', 4),
         (someone, '__proof__ 5', '/contacts', 5);

  -- A sixth does not, because every slot is taken.
  begin
    insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
    values (someone, '__proof__ 6', '/tools', 1);
    raise exception 'a sixth pin was accepted into an occupied slot';
  exception
    when unique_violation then null;
  end;

  -- The same page twice is refused even into a free slot — freed here by deleting one.
  delete from pinned_pages where pinned_page_url = '/contacts' and profile_id = someone;
  begin
    insert into pinned_pages (profile_id, pinned_page_label, pinned_page_url, pinned_page_position)
    values (someone, '__proof__ again', '/jobs', 5);
    raise exception 'the same page was pinned twice';
  exception
    when unique_violation then null;
  end;

  delete from pinned_pages where pinned_page_label like '__proof__%';
end $$;
