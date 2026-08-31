-- 0074 — the comments say which migration
--
-- =============================================================================
-- TWO MIGRATIONS WERE BOTH CALLED 0069, AND THE ONE THAT RAN LAST HAD THE NUMBER
--
--   PR #57 and PR #56 were opened against the same base within minutes of each other
--   and merged nine minutes apart. Neither could see the other's files, so both took
--   `0069`:
--
--       0069_only_the_locality_is_required.sql     (#57)
--       0069_the_view_that_lost_its_invoker.sql    (#56)
--
--   Git merged both cleanly, because they are different files. Nothing failed: a replay
--   applies both (they touch unrelated objects) and `check.sh` stayed green, which is
--   exactly why this is worth a migration of its own — a collision that breaks nothing
--   is a collision nobody notices until they are reading history and cannot tell which
--   `0069` a comment means.
--
--   `schema_migrations` settled which is which. It keys on a timestamp, not on the file
--   prefix, and it says the locality change ran LAST — after 0069, 0070, 0071 and 0072:
--
--       20260831004511  the_view_that_lost_its_invoker             ← 0069, correctly
--       20260831010810  the_request_somebody_else_typed            ← 0070
--       20260831011153  a_new_request_lands_in_the_phase_we_are_in  ← 0071
--       20260831011805  two_nulls_are_not_the_same_person          ← 0072
--       20260831012708  only_the_locality_is_required              ← 0073, not 0069
--
--   So the file is renamed to `0073_only_the_locality_is_required.sql` and the numbering
--   now matches the order things actually happened in. Renaming a file cannot affect the
--   database — `schema_migrations` never stored the prefix — so nothing re-runs and
--   nothing is at risk.
--
--   WHAT THE RENAME COULD NOT FIX, AND WHY THIS FILE EXISTS. Four of that migration's
--   comments name their own number, and those strings are IN the database. Renaming the
--   file left production saying "optional since 0069" while the file said 0073 — the same
--   ambiguity, moved rather than removed, and now split across two places that disagree.
--
--   These four statements are the text the renamed file sets, character for character, so
--   a fresh replay and production end up identical. On a rebuild from empty 0073 sets
--   them and this re-sets the same string, which is a no-op; on production this is the
--   correction.
-- =============================================================================

comment on column addresses.address_council is
  'The local government area the address sits in. Filled in from the suburb off the LGA list where that list is unambiguous, and left blank where it is not — optional since 0073, because the four suburbs that span two councils would otherwise be a guess somebody had to make to save the form. Still SA-only: addresses_council_is_sa refuses one on an interstate address, where the enum has no valid value to give.';

comment on column addresses.address_lot_number is
  'The lot as it appears on the plan of division. Text, not a number — "12A", "5-7" and "Lot 3" are as common as 12. Optional and independent of the street since 0073: on a plan of division the lot number is often the whole address, because the lots are numbered before the roads are named.';

comment on column addresses.address_precision is
  'How exact this address is. `locality` — no street named, which is all Lofty knows when a development is bought and is enough for a project. `street` — a street is named. Generated, so it can never disagree with the column it describes. NOTE since 0073: `street` no longer implies a number, because addresses_street_needs_a_number is gone; what a job needs is both, and guard_job_address_is_a_street is what enforces that.';

comment on function guard_job_address_is_a_street() is
  'A job must sit at an address somebody can build on: a street and a lot or street number. 0037 relaxed `addresses` so a project could be created knowing only its suburb, and 0073 relaxed the rest of the shape for the same reason — which leaves this trigger holding the whole of the old guarantee rather than half of it. It was never true of addresses in general, only of the ones you build on.';

-- ---------------------------------------------------------------------------- proof
-- Checked rather than assumed:
--   * `ls app/supabase/migrations | grep 0069` returns exactly one file afterwards;
--   * the four comments read back from the live database with 0073 in them;
--   * `check.sh` replays the whole set from empty and stays green — the rename changes
--     the ORDER these two files apply in relative to each other, and that had to be
--     shown harmless rather than reasoned about.
--
-- The next number is 0075. Worth saying out loud, because the reason this happened is
-- that two branches each read the repo, saw 0068, and were both right at the time.
