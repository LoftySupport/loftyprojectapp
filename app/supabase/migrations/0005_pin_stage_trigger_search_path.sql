-- =============================================================================
-- 0005 — pin touch_stage_entered_at's search_path
-- =============================================================================
-- 0004 added the function and forgot the line every other function in 0001 carries.
-- The convention is in 0001 under "search_path": pinned rather than left to the
-- caller's, because a mutable search_path lets a caller put a schema of their own in
-- front of public and have the function resolve to their objects instead of ours.
--
-- Caught by the Supabase database linter as function_search_path_mutable:
-- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- =============================================================================

alter function touch_stage_entered_at() set search_path = public, pg_temp;
