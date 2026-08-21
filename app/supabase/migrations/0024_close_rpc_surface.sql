-- =============================================================================
-- 0024 — take the trigger functions out of the REST API, and pin the last search_path
-- =============================================================================
-- Found by `get_advisors(security)` against the live project, not by reading the SQL.
-- Two findings, plus one piece of history worth writing down.
--
-- ---------------------------------------------------------------- the exposure
-- Postgres grants EXECUTE to PUBLIC on every new function, and `anon` and
-- `authenticated` inherit from PUBLIC. Supabase then publishes anything callable in
-- the `public` schema at /rest/v1/rpc/<name>. So all thirteen trigger functions below
-- are currently reachable, unauthenticated, from the internet:
--
--     POST /rest/v1/rpc/stamp_created_by
--     POST /rest/v1/rpc/link_profile_to_auth_user
--     POST /rest/v1/rpc/guard_privileged_profile_columns
--
-- Calling one raises an error rather than doing damage — a trigger function reads
-- TG_OP and NEW, and outside a trigger there is neither. But three of them are
-- SECURITY DEFINER, which means they run as the owner, and "it errors out" is a
-- property of today's function bodies rather than a guarantee. They have no business
-- being in the API surface at all.
--
-- 0008 and 0013 already learned this for log_activity_audit. The lesson was never
-- applied to the other thirteen, and 0023 added two more.
--
-- ------------------------------------------------------- why this is safe to revoke
-- Revoking EXECUTE on a *policy helper* is what broke every read and write in 0011:
-- a policy expression is evaluated with the caller's function privileges, so
-- is_active_user() and current_permission() must stay granted to `authenticated`.
--
-- A trigger function is different, and the difference was tested rather than assumed:
-- firing a trigger does NOT re-check EXECUTE on its function. With the privilege
-- revoked from the inserting role, the trigger still ran. So this migration removes
-- the functions from the API without touching what the database does.
--
-- Left granted deliberately:
--   is_active_user(), current_permission()  — policies call them; see 0012
--   is_current(record_status)               — the display views call it
--   redact_audit_row(jsonb), log_*()        — already locked down in 0008 and 0013
--
-- ------------------------------------------------------------------ the ledger note
-- The live ledger holds 24 migrations; this repo holds 23 files. The database has
-- `0014_revoke_recreated_audit_function`, which has no file here, and every migration
-- after it lost its numeric prefix in the ledger (`team_enum_additions` rather than
-- `0015_...`). That migration's whole body is:
--
--     revoke execute on function log_activity_audit() from anon, authenticated;
--
-- which 0013 already does at its line 100. The end states match, so nothing is missing
-- from this repo's schema — only from its numbering. Recorded here rather than
-- renumbering ten files to correct a cosmetic drift.
-- =============================================================================

-- ------------------------------------------------- the one unpinned search_path
-- Every other function in this schema pins it. normalise_profile_teams, added in
-- 0022, was missed. An unpinned search_path lets whoever calls the function decide
-- which schema its unqualified names resolve in.
alter function normalise_profile_teams() set search_path = public, pg_temp;

-- --------------------------------------------------------- close the RPC surface
revoke execute on function assign_job_sequence()              from public, anon, authenticated;
revoke execute on function build_consolidated_address()       from public, anon, authenticated;
revoke execute on function bump_project_no_seq()              from public, anon, authenticated;
revoke execute on function cascade_project_renumber()         from public, anon, authenticated;
revoke execute on function default_current_address()          from public, anon, authenticated;
revoke execute on function guard_privileged_profile_columns() from public, anon, authenticated;
revoke execute on function guard_profile_privileges()         from public, anon, authenticated;
revoke execute on function link_profile_to_auth_user()        from public, anon, authenticated;
revoke execute on function normalise_profile_teams()          from public, anon, authenticated;
revoke execute on function stamp_created_by()                 from public, anon, authenticated;
revoke execute on function sync_job_project_number()          from public, anon, authenticated;
revoke execute on function touch_stage_entered_at()           from public, anon, authenticated;
revoke execute on function touch_updated_at()                 from public, anon, authenticated;

-- ------------------------------------------------- the two helpers added in 0023
-- SECURITY DEFINER, in the public schema, callable by anon. No policy references
-- either — checked against pg_policy before revoking, which is the step 0011 skipped.
-- Their only caller is stamp_created_by(), which is itself SECURITY DEFINER and so
-- runs as the owner, who keeps EXECUTE.
revoke execute on function current_profile_id() from public, anon, authenticated;
revoke execute on function support_profile_id() from public, anon, authenticated;

-- ----------------------------------------------------------------- what is left
-- After this, `get_advisors(security)` should report neither
-- anon_security_definer_function_executable nor function_search_path_mutable.
--
-- It will still report the pg_graphql exposure lints for every table, and
-- authenticated_security_definer_function_executable for is_active_user() and
-- current_permission(). Both are expected: the tables are meant to be reachable
-- through the Data API with RLS deciding the rows, and those two functions are
-- granted on purpose. Accepted rather than fixed — see 0012.
