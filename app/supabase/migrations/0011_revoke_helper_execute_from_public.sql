-- =============================================================================
-- 0011 — actually take the helpers out of the API
-- =============================================================================
-- 0010 revoked EXECUTE from anon and authenticated and changed nothing, because that
-- is not where the grant was coming from. Postgres grants EXECUTE on a new function
-- to PUBLIC by default, and anon and authenticated are members of PUBLIC like every
-- other role, so the linter still reported all eight warnings afterwards.
--
-- The ACL said so plainly once looked at:
--
--   {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--    ^^^ empty grantee = PUBLIC
--
-- Revoking from PUBLIC is the one that bites. postgres and service_role keep theirs
-- through the explicit grants above, so nothing server-side loses access — which is
-- the reason to revoke from PUBLIC rather than take the blunter route of revoking
-- from everyone and granting back.
--
-- 0010 is left in place rather than rewritten. It is not wrong, only insufficient,
-- and the explicit revokes it carries state the intent for anyone reading the ACL
-- later.
-- =============================================================================

revoke execute on function current_permission()                  from public;
revoke execute on function is_active_user()                      from public;
revoke execute on function log_activity_audit()                  from public;
revoke execute on function log_login_activity_from_auth_users()  from public;
revoke execute on function redact_audit_row(jsonb)               from public;
