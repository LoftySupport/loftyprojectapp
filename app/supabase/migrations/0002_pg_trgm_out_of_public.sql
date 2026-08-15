-- =============================================================================
-- 0002 — pg_trgm out of the public schema
-- =============================================================================
-- `create extension pg_trgm` in 0001 installs into `public` by default, which puts the
-- extension's functions and operators in the same namespace as the app's tables — and
-- `public` is the schema PostgREST exposes. Supabase provisions an `extensions` schema
-- for exactly this, and flags the default as a security warning.
--
-- Safe to run after the trigram indexes exist: an index stores the operator class by
-- OID, and moving the extension moves the opclass with it, so
-- `addresses_consolidated_trgm` and `addresses_suburb_trgm` keep serving the same
-- queries. Verified with EXPLAIN after the move.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
