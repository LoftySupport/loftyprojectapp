-- 0063 — phases with dates, and a changelog
--
-- Amber, 30 Aug: "I also need to have a roadmap which is in set to phases and dates so I
-- can show how they are being developed… Also I need to be able to update the bug tracker
-- with improvements I am doing and include new releases on change log."
--
-- Two objects, and they answer two different questions:
--
--   ROADMAP   — what is coming, and roughly when. Forward-looking, dated, and allowed to
--               move; a phase's dates are an intention.
--   CHANGELOG — what went out, and when. Backward-looking and fixed; a release that has
--               shipped never changes date, because it happened.
--
-- The temptation is one table with a boolean. It is wrong: the roadmap is planning and the
-- changelog is history, and the moment they share a row a plan that slips silently
-- rewrites what the changelog said happened.
--
-- ================================================================== the roadmap
create table roadmap_phases (
  roadmap_phase_id uuid primary key default gen_random_uuid(),

  roadmap_phase_name text not null unique
    constraint roadmap_phase_name_not_blank check (btrim(roadmap_phase_name) <> ''),

  -- What the phase is for, in a sentence, shown under its heading. Empty allowed: a
  -- phase named "Phase 3 — Costings" may need no gloss, and an empty string is a
  -- different statement from an invented one.
  roadmap_phase_summary text not null default '',

  -- The dates. NULLABLE, deliberately and importantly: a phase somebody has not scheduled
  -- yet is a real and common thing ("after the import, whenever that lands"), and the one
  -- rule this project keeps returning to is that a blank invites filling in while a
  -- plausible guess gets quoted back as agreed. The roadmap draws an undated phase as
  -- undated rather than estimating a bar for it.
  roadmap_phase_starts_on date,
  roadmap_phase_ends_on date,

  -- Not `>` — a phase can start and finish on one day.
  constraint roadmap_phase_dates_in_order check (
    roadmap_phase_starts_on is null
    or roadmap_phase_ends_on is null
    or roadmap_phase_ends_on >= roadmap_phase_starts_on
  ),

  -- The order they are shown in, and it is stored rather than derived from the dates for
  -- the same reason the dates are nullable: an undated phase still has a place in the
  -- sequence, and sorting by a null date puts "everything after the import" first or last
  -- by accident of collation rather than by anybody's decision.
  roadmap_phase_position integer not null,

  -- Asserted, not derived. A phase whose end date has passed is not thereby delivered —
  -- that is exactly the case where a derived status would quietly tell the whole company
  -- something shipped when it did not.
  roadmap_phase_status text not null default 'planned'
    constraint roadmap_phase_status_is_known
      check (roadmap_phase_status in ('planned', 'in_progress', 'delivered')),

  roadmap_phase_created_at timestamptz not null default now(),
  roadmap_phase_updated_at timestamptz not null default now()
);

-- Unique so two phases cannot claim one slot and leave the order to chance. Deferrable
-- would be needed to swap two positions in one statement; the app moves a phase by
-- renumbering the run in order, which is what the initially-immediate constraint forces
-- it to do honestly.
create unique index roadmap_phases_position_idx on roadmap_phases (roadmap_phase_position);

comment on table roadmap_phases is
  'The phases the build is planned in, with the dates Amber shows people (30 Aug). Dates are nullable because an unscheduled phase is real; status is asserted rather than derived from the dates, so a slipped phase never reads as delivered.';

alter table roadmap_phases enable row level security;

-- Everyone reads: "so they can see what is coming up and planned" is the whole feature.
create policy "anyone active reads the roadmap" on roadmap_phases
  for select to authenticated
  using ((select is_active_user()));

-- Superadmin writes, matching the stage rule in 0060 and the 0029 policy on
-- pipeline_stages. Same reasoning: deciding what the company is doing next quarter is not
-- the same act as filing a request, and it is the one Amber named a level for.
create policy "superadmins shape the roadmap" on roadmap_phases
  for all to authenticated
  using ((select current_permission()) >= 'superadmin')
  with check ((select current_permission()) >= 'superadmin');

create trigger roadmap_phases_touch before update on roadmap_phases
  for each row execute function extensions.moddatetime(roadmap_phase_updated_at);

-- ------------------------------------------------- a request can sit in a phase
-- This is the join that answers "when is my request happening": the tracker says planned,
-- and the phase says which phase and therefore roughly when.
--
-- SET NULL, not CASCADE: deleting a phase must never delete the requests in it. That is
-- the single most destructive plausible mistake available on this screen — a superadmin
-- tidying up an obsolete phase and taking forty people's requests with it.
alter table feedback
  add column roadmap_phase_id uuid references roadmap_phases(roadmap_phase_id) on delete set null;

comment on column feedback.roadmap_phase_id is
  'Which roadmap phase this request is planned into, when it is planned at all. Null is the normal state for anything not yet planned, and ON DELETE SET NULL so removing a phase never removes the requests in it.';

-- "What is in phase 3" is the roadmap's per-phase query.
create index feedback_by_phase_idx on feedback (roadmap_phase_id) where roadmap_phase_id is not null;

-- ================================================================== the changelog
create table releases (
  release_id uuid primary key default gen_random_uuid(),

  -- The version people say out loud. Free text and unique rather than a parsed semver:
  -- Lofty ships "0.9 — the import" and dated builds, and a type that refuses that would
  -- be a schema deciding a naming convention nobody agreed to.
  release_version text not null unique
    constraint release_version_not_blank check (btrim(release_version) <> ''),

  -- The headline. Empty allowed — some releases are a list of fixes and nothing more.
  release_name text not null default '',
  release_summary text not null default '',

  -- A date, not a timestamp. "What shipped on the 28th" is the question; the hour it went
  -- out is not something anybody has ever asked, and a timestamptz would make the answer
  -- depend on the reader's timezone.
  release_shipped_on date not null default current_date,

  release_created_at timestamptz not null default now(),
  release_updated_at timestamptz not null default now()
);

comment on table releases is
  'What actually went out, newest first — the changelog people read (Amber, 30 Aug). Superadmin writes; everybody reads. A shipped release is history and is not rewritten by a plan that later changed.';

create index releases_recent_idx on releases (release_shipped_on desc);

create table release_entries (
  release_entry_id uuid primary key default gen_random_uuid(),

  -- CASCADE: an entry is part of its release and has no life without it.
  release_id uuid not null references releases(release_id) on delete cascade,

  -- Keep a Changelog's four verbs, and no more. They are the vocabulary the generator in
  -- scripts/changelog.mjs parses out of commit trailers, so a fifth value here would be a
  -- value the tooling silently drops.
  release_entry_kind text not null
    constraint release_entry_kind_is_known
      check (release_entry_kind in ('added', 'fixed', 'changed', 'removed')),

  release_entry_summary text not null
    constraint release_entry_summary_not_blank check (btrim(release_entry_summary) <> ''),

  -- The link back to the request this shipped, when there was one. Nullable because most
  -- entries have none — Amber's own words: "I need to be able to update the bug tracker
  -- with improvements I am doing", which is work nobody filed a request for.
  --
  -- SET NULL rather than CASCADE for the same reason as the phase: deleting a request must
  -- never quietly remove a line from the history of what shipped.
  feedback_id uuid references feedback(feedback_id) on delete set null,

  release_entry_position integer not null default 0,
  release_entry_created_at timestamptz not null default now()
);

comment on table release_entries is
  'The lines under one release. feedback_id closes the loop — a person who asked for something sees their own request named in the changelog — and is null for the improvements nobody filed a request for.';

create index release_entries_by_release_idx
  on release_entries (release_id, release_entry_kind, release_entry_position);

-- "Did my request ship, and in which release" — the query the tracker card asks.
create index release_entries_by_feedback_idx
  on release_entries (feedback_id) where feedback_id is not null;

alter table releases enable row level security;
alter table release_entries enable row level security;

create policy "anyone active reads releases" on releases
  for select to authenticated
  using ((select is_active_user()));

create policy "superadmins publish releases" on releases
  for all to authenticated
  using ((select current_permission()) >= 'superadmin')
  with check ((select current_permission()) >= 'superadmin');

create policy "anyone active reads release entries" on release_entries
  for select to authenticated
  using ((select is_active_user()));

create policy "superadmins write release entries" on release_entries
  for all to authenticated
  using ((select current_permission()) >= 'superadmin')
  with check ((select current_permission()) >= 'superadmin');

create trigger releases_touch before update on releases
  for each row execute function extensions.moddatetime(release_updated_at);

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * a phase with ends_on before starts_on is refused;
--   * two phases at position 3 are refused by the unique index;
--   * deleting a phase leaves its requests standing with roadmap_phase_id null — the
--     check that matters most, watched by counting the requests before and after;
--   * an admin (not superadmin) cannot insert a phase or a release;
--   * a viewer reads both and writes neither;
--   * a demo account reads nothing at all.
--
-- NOTHING IS SEEDED HERE. No phases, no releases, not one example row. The house rule —
-- never fill a gap with a plausible value — bites hardest on exactly this table: an
-- invented "Phase 2 — Costings, October" would be read by the whole company as the plan,
-- and Amber would find herself arguing with a roadmap she never wrote.
