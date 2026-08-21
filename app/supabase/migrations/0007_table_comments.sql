-- =============================================================================
-- 0007 — what each table and view is for, in the database
-- =============================================================================
-- These land in pg_description, which is what the Supabase dashboard shows under a
-- table's name and what `\dt+` prints in psql. The reasoning has been living in
-- migration comments and data-dictionary.md — neither of which is open in front of
-- someone looking at the table list and wondering what `profile_teams` is.
--
-- Kept to purpose rather than column-by-column detail: what the table is for, and the
-- one thing about it that is not obvious from its columns.
-- =============================================================================

-- ------------------------------------------------------------------- tables

comment on table profiles is
  'A person who uses Lofty. One row per auth user — the primary key IS auth.users.id, so this is the application-facing half of an account rather than a separate identity. Carries the permission ladder, which is an ordered enum: `permission >= ''manager''` is a valid comparison and is how the policies read it. Deactivating someone is `active = false`, never a delete: created_by and updated_by across every other table point here.';

comment on table profile_teams is
  'Which people are in which teams. A many-to-many, not a lookup — the list of teams is the `team` enum, while this table holds the relationship, so one person can sit in several teams. A partial unique index allows exactly one row per person with is_primary set, which is the team they are counted under when something needs a single answer.';

comment on table addresses is
  'A site address as its own record, so a correction happens in one place. Addresses change more than they look like they should — a lot renumbered by council, a street renamed, a typo found at handover — and projects and jobs each point at both the original and the current one so history survives the change. consolidated_address is assembled by trigger, never written by the app, so every card, export and search reads exactly the same string. Trigram indexes on it and on suburb are what make fuzzy address search work.';

comment on table projects is
  'The top-level container: a piece of land being developed, holding one or more jobs. project_no is the human key people say out loud (1000 and up, from a sequence) but never the join key — renumbering a project must not orphan its jobs, so everything joins on id. project_type is set here and inherited by jobs rather than repeated on them; a commercial project does not contain residential jobs.';

comment on table jobs is
  'The unit of work inside a project — one dwelling, one build, the thing that moves across the board. job_number is generated as project_no-job_sequence (1000-01) and is the number that appears in emails and on paperwork. stage is where it is in the eight-phase pipeline now, and stage_entered_at is when it got there; "days in stage" is computed from that pair and is never stored. Both are maintained together by trigger so they cannot drift apart.';

-- activity_audit and login_activity are commented in 0008, not here.
--
-- They used to be commented here, and it made this migration unreplayable: both tables
-- are created by 0008, so a fresh database failed on the first of them with
-- `relation "activity_audit" does not exist`. It only ever worked because the two
-- migrations were applied out of file order. A comment belongs with the CREATE it
-- describes; moving them there is what lets `supabase db reset` rebuild this database
-- from nothing.

-- -------------------------------------------------------------------- views
-- All five are security_invoker, so RLS on the underlying tables still applies to
-- whoever is querying. Without that flag a view runs as its owner and quietly bypasses
-- the policies.

comment on view project_display is
  'What project cards and rows show: the project with its current and original addresses already joined. A generated column cannot reach another table, so this is a view rather than columns on projects.';

comment on view job_display is
  'What job cards and rows show: the job with its project, its addresses, and is_current(status) resolved — anything not completed, cancelled or archived.';

comment on view profile_display is
  'A person''s two display names in one place: full_name, and greeting_name, which is the preferred name where someone has set one and their first name otherwise.';

comment on view project_address_search is
  'Projects unpivoted against both their addresses, one row per project per address, so searching finds a project by its previous address as well as its current one. The role column says which matched, so the UI can explain why a result appeared. Where a project has never moved, both pointers are the same address and it returns a single row marked current.';

comment on view job_address_search is
  'Jobs unpivoted against both their addresses — the same shape as project_address_search, and for the same reason: someone searching an old address should still find the job. Filters push down to the trigram index on addresses, so an ilike here still uses it.';
