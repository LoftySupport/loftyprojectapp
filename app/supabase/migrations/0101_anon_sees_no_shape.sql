-- 0101 — anon sees no shape.
--
-- Supabase's security advisor reports `pg_graphql_anon_table_exposed` against 93 tables
-- and views in `public`. 0099's note left it in place and put the decision in
-- docs/open-questions.md, because it was a choice rather than a fault. Amber, 7 September,
-- evening, asked whether the tables should stop being visible to `anon`: "yes".
--
-- WHAT WAS AND WAS NOT EXPOSED, SO THIS IS NOT MISREAD AS A LEAK THAT WAS OPEN
--
--   Visible is not readable. Every one of the 93 has RLS on and no policy reaches `anon` —
--   every policy in this schema is `to authenticated` — and `set role anon; select
--   count(*)` returned 0 from `profiles`, `teams`, `addresses` and `activity_audit`,
--   watched rather than assumed (schema-plan, 7 September). Two tables were already
--   further along: `report_documents` (0095) and `maintenance_message_secrets` had their
--   `anon` grant revoked outright, which is how 95 objects became the advisor's 93.
--
--   What the SELECT grant did expose is the SHAPE. pg_graphql builds each role's schema
--   from what that role holds privileges on, so somebody with the publishable key and no
--   account could introspect `/graphql/v1` and learn that Lofty has a table called
--   `maintenance_message_secrets`, what its columns are called, and the same for the
--   other 92. Names are a map. This closes the map.
--
-- WHY NOTHING SHOULD NOTICE
--
--   Nothing in the app runs as `anon`. Every read and write goes through a signed-in
--   session (`authenticated`); the one endpoint a person with no account reaches —
--   `/shared/:token` — is an edge function holding the service role (0095), and the four
--   edge functions all create their client with `SUPABASE_SERVICE_ROLE_KEY`. The functions
--   `anon` could once call were revoked in 0010–0012 and 0024. So the expected blast
--   radius is zero, and the proof below checks the part of "expected" that can be checked
--   here: that the grant is gone from every table, and that a query as `anon` is now
--   refused at the privilege rather than answered with zero rows.
--
-- SCOPE, AND WHAT IS DELIBERATELY LEFT
--
--   Tables and views (`all tables` covers both), present and future — the default
--   privilege is revoked too, so the next `create table` does not quietly put one object
--   back on the map. `alter default privileges` without `for role` acts on the current
--   role, which is `postgres` both here and on Supabase, and `postgres` is the role that
--   creates every table in this repository. Supabase also keeps a default under
--   `supabase_admin`; it applies only to tables that role creates, and no migration is
--   one of those.
--
--   Sequences stay as they are. `anon` holds USAGE on ten of them; the advisor does not
--   name them, a sequence's name says less than a table's, and `nextval` on a sequence
--   `anon` cannot insert into is not a capability. Widening this to sequences would be a
--   change nobody asked for, made in the same migration as one somebody did.

revoke all privileges on all tables in schema public from anon;
alter default privileges in schema public revoke all privileges on tables from anon;

-- ==================================================================== proof
-- Three claims: no table in `public` grants `anon` anything; a read as `anon` is refused
-- at the privilege, not answered with zero rows; and the default for the next table is
-- gone too, so this holds for a table that does not exist yet.
do $$
declare
  leftover text;
  n int;
begin
  select string_agg(table_name || ':' || privilege_type, ', ' order by table_name)
    into leftover
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public';
  if leftover is not null then
    raise exception 'anon still holds a table privilege in public: %', leftover;
  end if;

  -- Refused, not empty. Before this migration the same statement returned 0 — RLS doing
  -- its job — and the difference between "0 rows" and "permission denied" is the whole of
  -- what changed, so it is the thing to watch.
  begin
    set local role anon;
    select count(*) into n from public.profiles;
    reset role;
    raise exception 'anon was answered (% rows) rather than refused on profiles', n;
  exception
    when insufficient_privilege then reset role;
  end;

  -- The default for tables not yet created. `pg_default_acl` holds the per-creator
  -- defaults; an entry for `public` tables that still names `anon` would put the next
  -- table straight back on the map.
  if exists (
    select 1
      from pg_default_acl d
      join pg_namespace ns on ns.oid = d.defaclnamespace
     where ns.nspname = 'public' and d.defaclobjtype = 'r'
       and d.defaclrole = current_user::regrole
       and array_to_string(d.defaclacl, ',') like '%anon=%'
  ) then
    raise exception 'the default privilege for new tables in public still grants anon';
  end if;
end $$;
