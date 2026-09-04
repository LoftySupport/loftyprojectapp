-- Minimal stand-in for what Supabase provides before migration 0001 runs.
-- Enough to replay DDL locally; not a substitute for Supabase itself.
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='supabase_auth_admin') then create role supabase_auth_admin nologin; end if; end $$;
grant anon, authenticated, service_role to authenticator;

-- What Supabase actually does about table privileges, and the timing matters.
--
-- Supabase sets DEFAULT PRIVILEGES, so the grant lands as each table is created. The
-- harness used to stand in for that with a blanket `grant … on all tables` in rls.sql,
-- AFTER the migrations had run — which quietly re-granted anything a migration had
-- deliberately revoked. 0095 revokes column access to the share snapshot and the password
-- hash, and the probe for it read both columns straight back until this moved here.
--
-- A test harness that is more permissive than production does not just miss a bug, it
-- manufactures a passing result for one.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, anon;

create schema if not exists auth authorization postgres;
create schema if not exists extensions authorization postgres;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz default now()
);

-- auth.uid() reads a GUC locally instead of a JWT, so policies can be exercised
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
