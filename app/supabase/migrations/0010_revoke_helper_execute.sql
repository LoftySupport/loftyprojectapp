-- =============================================================================
-- 0010 — take the helper functions out of the public API
-- =============================================================================
-- 0008 and 0009 added four SECURITY DEFINER functions, and every function in the
-- public schema is a PostgREST endpoint by default. So they became callable as
-- /rest/v1/rpc/current_permission and so on, by anon as well as authenticated —
-- which the Supabase linter flags as anon_security_definer_function_executable and
-- authenticated_security_definer_function_executable, eight warnings between them.
-- Warnings this branch introduced, so this closes them.
--
-- None of the four is meant to be called by anyone. Two are trigger functions, which
-- raise "may only be called as a trigger" if invoked directly, and two exist for
-- policies to call. Nothing is lost by revoking EXECUTE and something is gained: the
-- API surface stops advertising functions that run as the owner.
--
-- The question worth checking, because getting it wrong breaks every write on the
-- app: does a policy that calls current_permission() still work once the caller
-- cannot execute it? It does. A policy expression is not evaluated with the caller's
-- function privileges, so revoking EXECUTE closes the RPC endpoint without touching
-- the policies. Verified against a signed-in probe user before this was written —
-- read, write, the audit row and the escalation block all still behave.
--
-- Not a REVOKE ... FROM PUBLIC: that would also take EXECUTE away from postgres and
-- service_role, and service_role is what a future server-side job would use.
-- =============================================================================

revoke execute on function current_permission()                  from anon, authenticated;
revoke execute on function is_active_user()                      from anon, authenticated;
revoke execute on function log_activity_audit()                  from anon, authenticated;
revoke execute on function log_login_activity_from_auth_users()  from anon, authenticated;

-- redact_audit_row is SECURITY INVOKER, so it is not in the same class — it runs as
-- whoever calls it and can reach nothing they could not. Revoked anyway: it is an
-- internal of the audit trigger, and an endpoint nobody calls is an endpoint worth
-- removing.
revoke execute on function redact_audit_row(jsonb) from anon, authenticated;
