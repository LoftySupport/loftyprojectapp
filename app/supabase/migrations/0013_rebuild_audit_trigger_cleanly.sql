-- =============================================================================
-- 0013 — remove the 31 orphan triggers after all
-- =============================================================================
-- 0008 could not detach trg_activity_audit_row from auth, storage, net and realtime,
-- because DROP TRIGGER requires ownership of the table and postgres owns none of them.
-- The workaround was to neuter the function with an allowlist so those triggers fired
-- and wrote nothing, and the conclusion was that actually removing them needed
-- Supabase support. That conclusion was wrong.
--
-- DROP FUNCTION ... CASCADE removes the objects that depend on the function, and
-- dependency cascade does not re-check ownership of each dependent — the permission
-- that matters is the one on the object being dropped, which is ours. So dropping and
-- recreating the function takes all 36 triggers with it, including the 31 that could
-- not be dropped directly.
--
-- Checked before doing it: pg_depend reports 36 dependent objects on this function and
-- every one is a pg_trigger. Nothing else rides on it, so the cascade has no reach
-- beyond what is intended.
--
-- log_login_activity_from_auth_users is deliberately NOT dropped. Its trigger is on
-- auth.users, which we do not own — cascade would remove it and we could not create it
-- again. It stays exactly as 0008 left it.
--
-- What changes after this: the audit fires on five tables because five triggers exist,
-- which is what it looked like it did all along. The allowlist inside the function
-- stays as the second lock — it costs one comparison and it is what makes a repeat of
-- the original mistake harmless.
-- =============================================================================

-- ------------------------------------------------------- all 36 triggers, gone
drop function log_activity_audit() cascade;

-- ------------------------------------------------- the function, back unchanged
-- Identical to the 0008 version. Repeated in full rather than referenced, because a
-- migration that depends on the reader remembering an earlier one is a migration that
-- rebuilds wrong.
create function log_activity_audit() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('profiles', 'profile_teams', 'addresses', 'projects', 'jobs') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, null, redact_audit_row(to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, redact_audit_row(to_jsonb(old)), redact_audit_row(to_jsonb(new)));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, redact_audit_row(to_jsonb(old)), null);
    return old;
  end if;
  return null;
end $fn$;

-- A new function is created with EXECUTE granted to PUBLIC, so the drop-and-recreate
-- silently undoes 0011. Without this line the four anon warnings come straight back.
revoke execute on function log_activity_audit() from public;

-- ------------------------------------------------------ the five, and only five
create trigger trg_activity_audit_row after insert or update or delete on profiles
  for each row execute function log_activity_audit();
create trigger trg_activity_audit_row after insert or update or delete on profile_teams
  for each row execute function log_activity_audit();
create trigger trg_activity_audit_row after insert or update or delete on addresses
  for each row execute function log_activity_audit();
create trigger trg_activity_audit_row after insert or update or delete on projects
  for each row execute function log_activity_audit();
create trigger trg_activity_audit_row after insert or update or delete on jobs
  for each row execute function log_activity_audit();

-- ------------------------------------------------------------- the junk rows
-- Three rows recorded against supabase_migrations.schema_migrations, from the window
-- when the trigger was on everything. They are not audit history of anything anyone
-- would look for, and leaving them means the first real query against this table
-- returns rows that need explaining.
delete from activity_audit where schema_name <> 'public';

-- ------------------------------------------------- and the other two grantees
-- Revoking from public is not sufficient for a *newly created* function here.
-- Supabase ships ALTER DEFAULT PRIVILEGES for the public schema that grant EXECUTE
-- explicitly to anon, authenticated and service_role, so a fresh function lands with:
--
--   {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
--
-- The revoke above only cleared the PUBLIC entry, which was not the one letting anon
-- in. Caught by checking the ACL after the migration rather than trusting the revoke —
-- the same mistake 0010 made, in the opposite direction.
--
-- service_role keeps its grant: it bypasses RLS anyway, and a future server-side job
-- has legitimate reason to be there.
revoke execute on function log_activity_audit() from anon, authenticated;
