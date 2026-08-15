-- =============================================================================
-- 0008 — the audit tables: captured, scoped, and made safe to keep
-- =============================================================================
-- activity_audit and login_activity were built outside the numbered migrations, so
-- this file does two jobs: it writes them down so the repo rebuilds what is actually
-- running, and it fixes three problems with how they were wired.
--
-- Everything here is written to be replayable — `if not exists`, `create or replace`,
-- `drop trigger if exists` — so it is correct both against the live database, where
-- most of it already exists, and against a rebuild from empty.
--
-- ---------------------------------------------------------------------------
-- Problem 1: the trigger was on the whole database, not the business tables
-- ---------------------------------------------------------------------------
-- trg_activity_audit_row was attached to 40 tables across auth, net, storage,
-- realtime, supabase_functions and supabase_migrations as well as public. Because
-- log_activity_audit stores to_jsonb(old) and to_jsonb(new) — whole rows — that meant
-- copying, into a table in the PostgREST-exposed public schema:
--
--   auth.users                 encrypted_password, recovery_token, confirmation_token
--   auth.refresh_tokens        live session refresh tokens
--   auth.one_time_tokens       OTP values
--   auth.flow_state            PKCE code verifiers
--   auth.mfa_factors           MFA secrets
--   auth.webauthn_credentials  credential material
--   net.http_request_queue     outbound headers, which routinely carry bearer tokens
--   net._http_response         response bodies from outbound calls
--
-- The only thing standing between those and the API was activity_audit having RLS on
-- with no policy. That is one permissive policy away from being readable, and it would
-- be in every pg_dump in the meantime. Nothing had actually leaked — three rows
-- existed, all from schema_migrations, and no auth users had been created — so this is
-- closing a latent hole rather than cleaning up after one.
--
-- Volume mattered too: auth.refresh_tokens and auth.sessions write on every token
-- refresh, so the table would have grown with session churn rather than with anything
-- anyone wants to audit.
--
-- The audit now covers the five business tables and nothing else. Those are the rows
-- where "who changed this, and what did it say before" is a real question.
--
-- ---------------------------------------------------------------------------
-- Problem 2: the audit insert would have broken every user write
-- ---------------------------------------------------------------------------
-- Both functions were SECURITY INVOKER, so the insert into activity_audit ran as the
-- end user. activity_audit has RLS enabled and no INSERT policy, so that insert is
-- rejected — and because the trigger is part of the user's transaction, it would have
-- taken their UPDATE down with it. Empty tables and no write policies are the only
-- reason this had not been hit yet. SECURITY DEFINER makes the insert run as the
-- function owner, which is the whole point of an append-only audit table: users cause
-- rows, users do not write them.
--
-- SECURITY DEFINER without a pinned search_path is its own hazard, which is also the
-- linter's function_search_path_mutable warning. Both are set below.
--
-- ---------------------------------------------------------------------------
-- Problem 3: jwt_sub never resolved
-- ---------------------------------------------------------------------------
-- The column default read current_setting('request.jwt.claim.sub', true) — the legacy
-- singular GUC. Modern PostgREST sets request.jwt.claims as one JSON object instead,
-- which is why Supabase's own auth.uid() coalesces the two. Left as it was, the column
-- recording *who* made a change would have been null for every request through the
-- API. It uses auth.uid() now.
-- =============================================================================

-- ------------------------------------------------------------ the tables
-- Written as if from scratch; they already exist on the live project, so these are
-- no-ops there and the point of them is the rebuild.

create table if not exists activity_audit (
  id          bigint generated always as identity primary key,
  schema_name text        not null,
  table_name  text        not null,
  operation   text        not null,
  changed_at  timestamptz not null default now(),
  txid        bigint      not null default txid_current(),
  changed_by  text        not null default current_user,
  jwt_sub     text,
  old_row     jsonb,
  new_row     jsonb
);

create table if not exists login_activity (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null,
  email       text,
  event_type  text        not null,
  occurred_at timestamptz not null default now(),
  metadata    jsonb
);

-- jwt_sub's default is replaced rather than left alone — see problem 3.
alter table activity_audit alter column jwt_sub set default auth.uid()::text;

-- ------------------------------------------------------------- redaction
-- Defence in depth. The trigger is scoped to the business tables below, none of which
-- hold credentials, so in normal operation this strips nothing. It exists for the day
-- someone attaches the trigger to a table that does — the mistake this migration is
-- undoing — so that the blast radius is a null instead of a password hash.
--
-- Keys are matched exactly, not by pattern: a LIKE '%token%' would also eat
-- jobs.requested_note-style columns that legitimately mention one, and an audit log
-- that quietly drops business data is worse than one that keeps too much.
create or replace function redact_audit_row(row_data jsonb) returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select case when row_data is null then null else row_data
    - 'encrypted_password' - 'confirmation_token'  - 'recovery_token'
    - 'email_change_token_current' - 'email_change_token_new'
    - 'phone_change_token' - 'reauthentication_token'
    - 'token' - 'secret' - 'access_token' - 'refresh_token'
    - 'code_verifier' - 'code_challenge' - 'authentication_method'
    - 'private_key' - 'headers' - 'body'
  end
$$;

comment on function redact_audit_row(jsonb) is
  'Strips credential-bearing keys from an audited row. A safety net, not the control — the control is which tables carry trg_activity_audit_row.';

-- -------------------------------------------------------- the audit function
-- SECURITY DEFINER so the insert runs as the owner rather than the end user, which is
-- what lets an ordinary user's UPDATE succeed against an append-only table they have
-- no INSERT policy on.
--
-- The scope check at the top is the load-bearing part, and it is here rather than left
-- to which tables carry the trigger for a reason we found the hard way: 31 of the 40
-- triggers are on tables owned by supabase_auth_admin, supabase_storage_admin,
-- supabase_admin and supabase_realtime_admin. CREATE TRIGGER needs only the TRIGGER
-- privilege, but DROP TRIGGER needs ownership — so the postgres role could attach them
-- and cannot detach them. They stay bound to auth.refresh_tokens and the rest until
-- someone with those roles removes them.
--
-- Enforcing scope inside the function makes that not matter. Every one of those
-- triggers still fires and now writes nothing. It is also the more robust design:
-- the allowlist is one place, in version control, rather than a fact about which
-- CREATE TRIGGER statements someone happened to run.
create or replace function log_activity_audit() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Anything outside the five business tables is ignored. AFTER ROW triggers discard
  -- the return value, so leaving early changes nothing about the statement itself.
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
end $$;

-- -------------------------------------------------------- the login function
-- Same treatment, plus one change of substance: the SIGNUP branch stored
-- to_jsonb(new) — the entire auth.users row, password hash and all — into
-- login_activity.metadata. login_activity answers "who signed in and when"; it has no
-- use for the rest of the row. It records the provider and nothing else now.
create or replace function log_login_activity_from_auth_users() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.login_activity (user_id, email, event_type, occurred_at, metadata)
    values (new.id, new.email, 'SIGNUP', coalesce(new.created_at, now()),
            jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      insert into public.login_activity (user_id, email, event_type, occurred_at, metadata)
      values (new.id, new.email, 'LOGIN', new.last_sign_in_at,
              jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));
    end if;
    return new;
  end if;
  return null;
end $$;

-- ------------------------------------------------------------ detach the trigger
-- Off every table we are permitted to touch, then back onto the five business ones.
--
-- The ownership filter is not optional: DROP TRIGGER requires ownership of the table,
-- and postgres owns none of auth, storage, net or realtime. Without the filter this
-- block aborts on the first auth table and the whole migration rolls back. With it,
-- the trigger comes off what we own and stays — inert, per the function's scope check
-- — on what we do not.
--
-- Removing the rest needs a role that owns those tables. Until then they cost a
-- no-op function call per row, which is cheap but not free on auth.refresh_tokens.
do $$
declare r record;
begin
  for r in
    select c.relnamespace::regnamespace::text as sch, c.relname as tbl
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal
       and t.tgname = 'trg_activity_audit_row'
       and pg_has_role(current_user, c.relowner, 'USAGE')
  loop
    execute format('drop trigger if exists trg_activity_audit_row on %I.%I', r.sch, r.tbl);
  end loop;
end $$;

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

-- trg_login_activity_auth_users on auth.users is left exactly as it is. It is wanted,
-- and it could not be recreated anyway — auth.users belongs to supabase_auth_admin, so
-- the drop half of a drop-and-recreate would fail. Replacing the function it calls is
-- enough: the trigger looks the function up by name at fire time, so the hardened
-- version above is already what runs.
--
-- On a rebuild from empty this trigger will not exist and must be created by whoever
-- has the rights to do it:
--   create trigger trg_login_activity_auth_users after insert or update on auth.users
--     for each row execute function log_login_activity_from_auth_users();

-- --------------------------------------------------------------- indexes
-- Only id was indexed, which made every audit question a sequential scan.
--
-- The record_id expression index is what makes "show me this job's history" cheap.
-- coalesce(new_row, old_row) rather than new_row alone, so a DELETE — where new_row is
-- null — is still findable by the id of the row that was deleted.
create index if not exists activity_audit_table_changed_idx
  on activity_audit (table_name, changed_at desc);

create index if not exists activity_audit_record_idx
  on activity_audit ((coalesce(new_row, old_row) ->> 'id'), changed_at desc);

create index if not exists activity_audit_jwt_sub_idx
  on activity_audit (jwt_sub, changed_at desc);

-- ------------------------------------------------------------------- RLS
-- Both tables had RLS on and no policies, which is deny-all: correct as a default, but
-- it meant nobody could read an audit trail, including the people whose job it is.
--
-- Read for admin and up, and no write policy for anyone. The triggers are the only
-- writer and they are SECURITY DEFINER, so they do not need one — which is exactly the
-- property an audit log should have: append-only, and only by the database.
--
-- current_permission() arrives properly in 0009 alongside the rest of the policies;
-- these read profiles directly so this migration stands on its own.

alter table activity_audit  enable row level security;
alter table login_activity  enable row level security;

drop policy if exists "read activity_audit" on activity_audit;
create policy "read activity_audit" on activity_audit for select to authenticated
  using (exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.active and p.permission >= 'admin'
  ));

drop policy if exists "read own login_activity" on login_activity;
create policy "read own login_activity" on login_activity for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from profiles p
       where p.id = auth.uid() and p.active and p.permission >= 'admin'
    )
  );

-- ---------------------------------------------------------------- comments
comment on table activity_audit is
  'Row-level change log for the five business tables — profiles, profile_teams, addresses, projects, jobs. trg_activity_audit_row fires after every insert, update and delete and log_activity_audit writes the before and after rows as jsonb, redacted. Because it captures whole rows it is also where stage history lives now that job_stages is gone: an update changing jobs.stage leaves old_row->>''stage'', new_row->>''stage'' and changed_at. Append-only — the trigger is SECURITY DEFINER and there is no insert policy, so nothing but the database can write to it. Scoped to these five tables in 0008; it had been on all 40 tables in the database, including auth and net.';

comment on table login_activity is
  'Authentication events per user — who signed in, when, and which provider. Written by a trigger on auth.users. Separate from activity_audit because it records access rather than data changes. metadata carries the provider only; it stored the whole auth.users row until 0008.';

comment on column activity_audit.jwt_sub is
  'The authenticated user who caused the change, from auth.uid(). Was current_setting(''request.jwt.claim.sub'') until 0008, a legacy GUC modern PostgREST does not set — so it resolved to null for every API request.';
