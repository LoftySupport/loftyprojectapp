-- 0021_drop_preferred_name.sql
--
-- Remove `profiles.preferred_name`.
--
-- It was the one field on a profile that was genuinely personal — what somebody wants to
-- be called when it differs from their first name — and then 0019 made it admin-set like
-- everything else. What was left is a nullable column that, in practice, either repeats
-- `first_name` or is null, and a greeting that has to COALESCE the two on every read to
-- work out which. Lofty's answer is to use the first name. So the column goes rather than
-- being left as a nullable field nobody fills in: an empty column is a standing invitation
-- to fill it in, and a second place a person's name can live is a second place it can be
-- wrong.
--
-- Order matters here. `profile_display.greeting_name` reads the column, so the view is
-- rewritten first — dropping the column with the old view still in place would either fail
-- or, with CASCADE, take the view with it and leave the app querying something that no
-- longer exists.

-- ------------------------------------------------------------------- the greeting first
-- `create or replace`, not drop-and-recreate: the column list is unchanged in name, type
-- and order — greeting_name is still text, still second — which is exactly the case
-- replace allows, and it keeps the view's permissions and dependents.
--
-- It does NOT keep reloptions. `create or replace view` resets them to null, so the
-- `security_invoker = on` that 0001 set is dropped by the statement above and has to be
-- put back — which is what the next line is for, and why it is not decoration.
--
-- The consequence of forgetting it is not cosmetic. Without security_invoker the view
-- executes as its owner, so `select * from profile_display` returns every name in the
-- company to any caller, straight past the policies on `profiles`. Verified rather than
-- assumed: on 16.x, `alter view … set (security_invoker = on)` then `create or replace
-- view` leaves pg_class.reloptions NULL.
create or replace view profile_display as
  select id, first_name as greeting_name, full_name
  from profiles;

alter view profile_display set (security_invoker = on);

-- --------------------------------------------------------------------------- the column
-- No CASCADE, deliberately. If anything else has come to depend on this column since,
-- this migration should stop and say so rather than quietly dropping whatever it was.
alter table profiles drop column preferred_name;

comment on view profile_display is
  'What the app greets you with, in one place so "Hi, …" is never assembled ad hoc. greeting_name was coalesce(preferred_name, first_name) until 0021 dropped preferred_name; it is the first name now. security_invoker is on, so the reader''s own policies apply rather than the view owner''s.';
