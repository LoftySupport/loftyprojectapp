-- 0014_team_enum_additions.sql
--
-- The `team` enum was built from the pipeline — the teams that hand work to each other
-- through the stages. The staff list is a different taxonomy: departments. Reconciling
-- the two left ten of forty-five people with no team to sit in, because a Marketing
-- Manager and an ICT Manager do not appear anywhere in a construction pipeline.
--
-- Four values close that gap:
--
--   Commercial      commercial development, which is real work with its own pipeline
--   Executive       the Director
--   Lofty General   the roles that serve the whole business rather than one stage —
--                   Marketing, IT, and systems/automation work
--   Admin           reception and executive assistance
--
-- `Admin` reads close to the `admin` value of `permission_level`, and they are
-- unrelated: one is which team someone is in, the other is what they may do. Different
-- types on different columns, so nothing is ambiguous to Postgres — but it is worth
-- knowing before writing a sentence containing both.
--
-- ------------------------------------------------------------- its own migration
-- These cannot share a file with anything that *uses* them. `alter type ... add value`
-- makes the label visible only after the adding transaction commits, so an insert
-- naming 'Commercial' in the same migration fails with "unsafe use of new value". The
-- seed that assigns them is 0015 and later, deliberately.
--
-- `if not exists` so a re-run is a no-op: enum values, once added, cannot be removed
-- without rebuilding the type and everything depending on it.

alter type team add value if not exists 'Commercial';
alter type team add value if not exists 'Executive';
alter type team add value if not exists 'Lofty General';
alter type team add value if not exists 'Admin';
