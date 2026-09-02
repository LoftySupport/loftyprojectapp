-- =============================================================================
-- 0084 — maintenance: one table for every way a request arrives
-- =============================================================================
-- Amber, 1–2 September: *"a separate tab for maintenance as this will have a lot of
-- automation and needs a quick access"*; intake by *"manual email or phone call and forms.
-- Think of every option"*; warranty *"3 months is standard"*; SLAs *"editable in app"*;
-- the categories *"pull from the contractors who are listed in the database and assigned
-- during the construction stage so we know who did what job on site and then who needs to
-- repair it"*; contractor accept links without a login *"yes but needs to be logged"*;
-- the request number `1042-01-M3` — *"yes"*.
--
-- DATES ARE ADELAIDE DATES
--
--   `maintenance_request_due_on` is a date, set by the guard from the report's Adelaide
--   calendar day. Every comparison against it — health, warranty, the once-a-day
--   notification keys, and the proof below — uses `(now() at time zone
--   'Australia/Adelaide')::date` for "today", never `current_date`. Supabase runs
--   Postgres in UTC, so `current_date` is yesterday in Adelaide until 09:30 each
--   morning: on the live apply of 2 September (07:00 Adelaide, 21:30 UTC the day
--   before) the proof compared the Adelaide due date with the UTC one and refused the
--   whole migration. Watched failing on the local replay at the same hour, then passing.
--
-- THE SHAPE
--
--   maintenance_settings      one row: warranty months, hours a contractor has to answer,
--                             the day-before reminder, the intake mailbox
--   maintenance_categories    a trade and its clock: which party role did this work on site
--                             (so the default repairer is that party on the job), SLA days,
--                             at-risk lead, the Lofty team that owns it
--   maintenance_requests      the ticket — one per thing the homeowner reported, however it
--                             arrived (source: email, phone, form, portal, api, staff)
--   maintenance_items         the defects inside it: "leaking ensuite tap, cracked laundry
--                             tile" is one email and two trades
--   maintenance_assignments   an offer to a contractor, one row each so a decline keeps its
--                             history; a signed token for the accept link, hash stored
--   maintenance_messages      the thread: what came in, what went out, what was said on the
--                             phone — with the Graph message id so mail is matched once
--
--   record_parties gains maintenance_request_id in its arc: the homeowner and the trades
--   on a request are parties like any other. document_links gains it too, for photos.
--
-- THE CLOCK
--
--   A request is due `reported + category SLA days`, at risk `due − lead`; health is derived
--   in maintenance_request_display the way process_run_display does it, never stored. The
--   warranty flag is a comparison of the report date with the job's handover — the
--   completion of the "7 - Handover" run — plus the settings' months. Nobody types it.
--
-- WHAT RUNS BY ITSELF
--
--   Triggers: a new request tells the Maintenance team; an offer writes the contractor's
--   email into the outbox (maintenance_messages, direction out, status queued) with the
--   accept link; a close writes the homeowner's. maintenance_scan(), every 15 minutes:
--   offers unanswered past the settings' hours, requests at risk or over SLA, visits
--   tomorrow. Every send is a row a worker drains; nothing in a trigger calls out.
--
--   The accept link is a token; only its hash is stored, it expires, and using it is an
--   audited write with activity_audit_origin = 'accept_link' (Amber: "needs to be logged").
-- =============================================================================

-- ---------------------------------------------------------- settings, one row
create table if not exists maintenance_settings (
  maintenance_setting_id                    smallint primary key default 1
    constraint maintenance_settings_is_one_row check (maintenance_setting_id = 1),
  maintenance_setting_warranty_months       smallint not null default 3
    constraint maintenance_settings_warranty_is_positive check (maintenance_setting_warranty_months > 0),
  maintenance_setting_offer_response_hours  smallint not null default 48
    constraint maintenance_settings_offer_hours_positive check (maintenance_setting_offer_response_hours > 0),
  maintenance_setting_reminder_days_before  smallint not null default 1
    constraint maintenance_settings_reminder_not_negative check (maintenance_setting_reminder_days_before >= 0),
  maintenance_setting_intake_mailbox        text,
  maintenance_setting_accept_link_days      smallint not null default 14
    constraint maintenance_settings_link_days_positive check (maintenance_setting_accept_link_days > 0),
  maintenance_setting_updated_at            timestamptz not null default now(),
  maintenance_setting_updated_by            uuid references profiles (profile_id)
);
insert into maintenance_settings (maintenance_setting_id) values (1) on conflict do nothing;
comment on table maintenance_settings is
  'One row (0084): the warranty period after handover (Amber: 3 months standard), how long a contractor has to answer an offer, the day-before reminder, the intake mailbox, how long an accept link lives. Managers edit; everyone reads.';

-- ---------------------------------------------------------- categories
create table if not exists maintenance_categories (
  maintenance_category_id                text primary key
    constraint maintenance_categories_key_is_a_slug check (maintenance_category_id ~ '^[a-z][a-z0-9_]*$'),
  maintenance_category_name              text not null unique
    constraint maintenance_categories_name_is_not_blank check (length(trim(maintenance_category_name)) > 0),
  -- The trade: the party role that did this work on site. The default repairer of an item
  -- in this category is the record party in this role on the job's construction runs.
  party_role_id                          text references party_roles (party_role_id) on update cascade,
  team_id                                text references teams (team_id) on update cascade,
  maintenance_category_sla_days          smallint
    constraint maintenance_categories_sla_not_negative check (maintenance_category_sla_days >= 0),
  maintenance_category_at_risk_lead_days smallint
    constraint maintenance_categories_lead_not_negative check (maintenance_category_at_risk_lead_days >= 0),
  maintenance_category_position          smallint not null default 0,
  maintenance_category_is_active         boolean not null default true,
  maintenance_category_created_at        timestamptz not null default now(),
  maintenance_category_created_by        uuid references profiles (profile_id),
  maintenance_category_updated_at        timestamptz not null default now(),
  maintenance_category_updated_by        uuid references profiles (profile_id),
  constraint maintenance_categories_lead_within_sla
    check (maintenance_category_at_risk_lead_days is null or maintenance_category_sla_days is null
           or maintenance_category_at_risk_lead_days <= maintenance_category_sla_days)
);
comment on table maintenance_categories is
  'A trade and its clock (0084): the party role that did this work on site — so the default repairer is that party on the job — the SLA days, the at-risk lead, the Lofty team. Empty on purpose: Amber said the categories come from the contractors on the jobs, and the SLAs are hers to set in the app; nothing is seeded that would be quoted back as agreed.';

-- ---------------------------------------------------------- the request
alter table jobs add column if not exists job_maintenance_seq_high_water smallint not null default 0;
comment on column jobs.job_maintenance_seq_high_water is 'The highest maintenance request sequence ever handed out on this job (0084) — the counter behind 1042-01-M3. Never goes down, so a deleted request''s number is never reused.';

create table if not exists maintenance_requests (
  maintenance_request_id                uuid primary key default gen_random_uuid(),
  job_id                                text not null references jobs (job_id) on update cascade,
  maintenance_request_sequence          smallint,
  maintenance_request_number            text unique,
  maintenance_request_source            text not null default 'staff'
    constraint maintenance_requests_source_is_known
      check (maintenance_request_source in ('email', 'phone', 'form', 'portal', 'api', 'staff')),
  maintenance_request_reported_by_contact_id uuid references contacts (contact_id),
  maintenance_request_reported_at       timestamptz not null default now(),
  maintenance_request_summary           text not null
    constraint maintenance_requests_summary_is_not_blank check (length(trim(maintenance_request_summary)) > 0),
  maintenance_request_description       text,
  maintenance_request_priority          text not null default 'normal'
    constraint maintenance_requests_priority_is_known check (maintenance_request_priority in ('urgent', 'high', 'normal', 'low')),
  maintenance_request_status            text not null default 'new'
    constraint maintenance_requests_status_is_known
      check (maintenance_request_status in ('new', 'triaged', 'in_progress', 'waiting_on_contractor', 'waiting_on_client', 'completed', 'closed', 'rejected')),
  maintenance_category_id               text references maintenance_categories (maintenance_category_id) on update cascade,
  maintenance_request_due_on            date,
  maintenance_request_owner_profile_id  uuid references profiles (profile_id),
  maintenance_request_closed_at         timestamptz,
  maintenance_request_closed_by         uuid references profiles (profile_id),
  maintenance_request_closed_reason     text,
  maintenance_request_external_ref      text,
  maintenance_request_created_at        timestamptz not null default now(),
  maintenance_request_created_by        uuid references profiles (profile_id),
  maintenance_request_updated_at        timestamptz not null default now(),
  maintenance_request_updated_by        uuid references profiles (profile_id),
  constraint maintenance_requests_closed_is_a_pair
    check ((maintenance_request_status in ('closed', 'rejected')) = (maintenance_request_closed_at is not null))
);
create index if not exists maintenance_requests_job_idx on maintenance_requests (job_id, maintenance_request_reported_at desc);
create index if not exists maintenance_requests_open_idx on maintenance_requests (maintenance_request_status, maintenance_request_due_on)
  where maintenance_request_status not in ('closed', 'rejected');
create index if not exists maintenance_requests_owner_idx on maintenance_requests (maintenance_request_owner_profile_id) where maintenance_request_owner_profile_id is not null;
create index if not exists maintenance_requests_reporter_idx on maintenance_requests (maintenance_request_reported_by_contact_id) where maintenance_request_reported_by_contact_id is not null;
create index if not exists maintenance_requests_category_idx on maintenance_requests (maintenance_category_id) where maintenance_category_id is not null;
comment on table maintenance_requests is
  'The ticket (0084): one per thing a homeowner reported on a handed-over job, however it arrived — the source says which. Numbered <job>-M<n> by trigger. Status new → triaged → in_progress / waiting → completed → closed, or rejected; closing is refused while an item is open. Due is reported + the category''s SLA unless typed; health is derived in the display view.';

create or replace function assign_maintenance_request_number() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare next_no smallint;
begin
  if new.maintenance_request_sequence is null then
    update jobs set job_maintenance_seq_high_water = job_maintenance_seq_high_water + 1
     where job_id = new.job_id returning job_maintenance_seq_high_water into next_no;
    if next_no is null then
      raise exception 'job % does not exist', new.job_id using errcode = '23503';
    end if;
    new.maintenance_request_sequence := next_no;
  end if;
  new.maintenance_request_number := new.job_id || '-M' || new.maintenance_request_sequence::text;
  return new;
end $$;
revoke execute on function assign_maintenance_request_number() from public, anon, authenticated;
drop trigger if exists maintenance_requests_assign_number on maintenance_requests;
create trigger maintenance_requests_assign_number before insert on maintenance_requests
  for each row execute function assign_maintenance_request_number();

-- Due from the category when nobody typed one; the closing pair stamped and cleared; a
-- close refused while an item is open.
create or replace function guard_maintenance_request() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare sla smallint; open_items integer;
begin
  if new.maintenance_request_due_on is null and new.maintenance_category_id is not null then
    select maintenance_category_sla_days into sla from maintenance_categories where maintenance_category_id = new.maintenance_category_id;
    if sla is not null then
      new.maintenance_request_due_on := (new.maintenance_request_reported_at at time zone 'Australia/Adelaide')::date + sla;
    end if;
  end if;
  if new.maintenance_request_status in ('closed', 'rejected') then
    if tg_op = 'INSERT' or old.maintenance_request_status not in ('closed', 'rejected') then
      if new.maintenance_request_status = 'closed' then
        select count(*) into open_items from maintenance_items
         where maintenance_request_id = new.maintenance_request_id
           and maintenance_item_status not in ('done', 'not_applicable');
        if open_items > 0 then
          raise exception 'this request still has % open item%: finish them or mark them not applicable first',
            open_items, case when open_items = 1 then '' else 's' end using errcode = '23514';
        end if;
      end if;
      new.maintenance_request_closed_at := coalesce(new.maintenance_request_closed_at, now());
      new.maintenance_request_closed_by := coalesce(current_profile_id(), new.maintenance_request_closed_by);
    end if;
  else
    new.maintenance_request_closed_at := null;
    new.maintenance_request_closed_by := null;
  end if;
  return new;
end $$;
revoke execute on function guard_maintenance_request() from public, anon, authenticated;
drop trigger if exists maintenance_requests_guard on maintenance_requests;
create trigger maintenance_requests_guard before insert or update on maintenance_requests
  for each row execute function guard_maintenance_request();

-- ---------------------------------------------------------- the items
create table if not exists maintenance_items (
  maintenance_item_id           uuid primary key default gen_random_uuid(),
  maintenance_request_id        uuid not null references maintenance_requests (maintenance_request_id) on delete cascade,
  maintenance_item_position     smallint not null default 0,
  maintenance_item_description  text not null
    constraint maintenance_items_description_is_not_blank check (length(trim(maintenance_item_description)) > 0),
  maintenance_item_location     text,
  maintenance_category_id       text references maintenance_categories (maintenance_category_id) on update cascade,
  maintenance_item_status       text not null default 'open'
    constraint maintenance_items_status_is_known
      check (maintenance_item_status in ('open', 'assigned', 'scheduled', 'done', 'not_applicable')),
  maintenance_item_is_warranty  boolean,
  maintenance_item_cost         numeric(12, 2)
    constraint maintenance_items_cost_not_negative check (maintenance_item_cost >= 0),
  maintenance_item_completed_at timestamptz,
  maintenance_item_completed_by uuid references profiles (profile_id),
  maintenance_item_created_at   timestamptz not null default now(),
  maintenance_item_created_by   uuid references profiles (profile_id),
  maintenance_item_updated_at   timestamptz not null default now(),
  maintenance_item_updated_by   uuid references profiles (profile_id),
  constraint maintenance_items_done_has_a_time
    check ((maintenance_item_status = 'done') = (maintenance_item_completed_at is not null))
);
create index if not exists maintenance_items_request_idx on maintenance_items (maintenance_request_id, maintenance_item_position);
create index if not exists maintenance_items_category_idx on maintenance_items (maintenance_category_id) where maintenance_category_id is not null;
comment on table maintenance_items is
  'One defect, one trade (0084): the lines inside a request. Assigned through maintenance_assignments; done is stamped with who and when; not_applicable is a real answer. Cost is numeric, never float.';

create or replace function stamp_maintenance_item_done() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.maintenance_item_status = 'done' and (tg_op = 'INSERT' or old.maintenance_item_status <> 'done') then
    new.maintenance_item_completed_at := coalesce(new.maintenance_item_completed_at, now());
    new.maintenance_item_completed_by := coalesce(current_profile_id(), new.maintenance_item_completed_by);
  elsif new.maintenance_item_status <> 'done' then
    new.maintenance_item_completed_at := null;
    new.maintenance_item_completed_by := null;
  end if;
  return new;
end $$;
revoke execute on function stamp_maintenance_item_done() from public, anon, authenticated;
drop trigger if exists maintenance_items_stamp_done on maintenance_items;
create trigger maintenance_items_stamp_done before insert or update on maintenance_items
  for each row execute function stamp_maintenance_item_done();

-- ---------------------------------------------------------- the offers
create table if not exists maintenance_assignments (
  maintenance_assignment_id            uuid primary key default gen_random_uuid(),
  maintenance_item_id                  uuid not null references maintenance_items (maintenance_item_id) on delete cascade,
  company_id                           uuid references companies (company_id),
  contact_id                           uuid references contacts (contact_id),
  maintenance_assignment_status        text not null default 'offered'
    constraint maintenance_assignments_status_is_known
      check (maintenance_assignment_status in ('offered', 'accepted', 'declined', 'scheduled', 'done', 'cancelled')),
  maintenance_assignment_offered_at    timestamptz not null default now(),
  maintenance_assignment_responded_at  timestamptz,
  maintenance_assignment_scheduled_for timestamptz,
  maintenance_assignment_note          text,
  maintenance_assignment_token_hash    text,
  maintenance_assignment_token_expires_at timestamptz,
  maintenance_assignment_created_at    timestamptz not null default now(),
  maintenance_assignment_created_by    uuid references profiles (profile_id),
  maintenance_assignment_updated_at    timestamptz not null default now(),
  maintenance_assignment_updated_by    uuid references profiles (profile_id),
  constraint maintenance_assignments_names_somebody check (num_nonnulls(company_id, contact_id) >= 1)
);
-- One open offer per item at a time; a decline closes it and the next offer is a new row.
create unique index if not exists maintenance_assignments_one_open_per_item
  on maintenance_assignments (maintenance_item_id)
  where maintenance_assignment_status in ('offered', 'accepted', 'scheduled');
create index if not exists maintenance_assignments_company_idx on maintenance_assignments (company_id) where company_id is not null;
create index if not exists maintenance_assignments_contact_idx on maintenance_assignments (contact_id) where contact_id is not null;
create index if not exists maintenance_assignments_token_idx on maintenance_assignments (maintenance_assignment_token_hash) where maintenance_assignment_token_hash is not null;
comment on table maintenance_assignments is
  'An offer of one item to one contractor (0084): offered → accepted → scheduled → done, or declined / cancelled. One open offer per item; a decline keeps its row and the next offer is a new one. The accept link is a token: only its sha256 is stored, it expires, and using it is audited with origin accept_link.';

-- The item follows its assignment.
create or replace function reflect_assignment_on_item() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update maintenance_items
     set maintenance_item_status = case new.maintenance_assignment_status
                                     when 'offered'   then 'assigned'
                                     when 'accepted'  then 'assigned'
                                     when 'scheduled' then 'scheduled'
                                     when 'done'      then 'done'
                                     else 'open' end
   where maintenance_item_id = new.maintenance_item_id
     and maintenance_item_status <> 'not_applicable';
  return new;
end $$;
revoke execute on function reflect_assignment_on_item() from public, anon, authenticated;
drop trigger if exists maintenance_assignments_reflect on maintenance_assignments;
create trigger maintenance_assignments_reflect after insert or update of maintenance_assignment_status on maintenance_assignments
  for each row execute function reflect_assignment_on_item();

-- ---------------------------------------------------------- the thread
create table if not exists maintenance_messages (
  maintenance_message_id          uuid primary key default gen_random_uuid(),
  maintenance_request_id          uuid not null references maintenance_requests (maintenance_request_id) on delete cascade,
  maintenance_assignment_id       uuid references maintenance_assignments (maintenance_assignment_id) on delete set null,
  maintenance_message_direction   text not null
    constraint maintenance_messages_direction_is_known check (maintenance_message_direction in ('in', 'out', 'note')),
  maintenance_message_channel     text not null
    constraint maintenance_messages_channel_is_known check (maintenance_message_channel in ('email', 'sms', 'phone', 'form', 'portal', 'app')),
  maintenance_message_from_contact_id uuid references contacts (contact_id),
  maintenance_message_from_profile_id uuid references profiles (profile_id),
  maintenance_message_to_address  text,
  maintenance_message_subject     text,
  maintenance_message_body        text not null,
  maintenance_message_status      text not null default 'received'
    constraint maintenance_messages_status_is_known
      check (maintenance_message_status in ('received', 'queued', 'sending', 'sent', 'failed', 'noted')),
  maintenance_message_attempts    smallint not null default 0,
  maintenance_message_next_attempt_at timestamptz not null default now(),
  maintenance_message_external_id text unique,
  maintenance_message_error       text,
  maintenance_message_at          timestamptz not null default now(),
  maintenance_message_created_by  uuid references profiles (profile_id)
);
create index if not exists maintenance_messages_request_idx on maintenance_messages (maintenance_request_id, maintenance_message_at);
create index if not exists maintenance_messages_outbox_idx on maintenance_messages (maintenance_message_next_attempt_at)
  where maintenance_message_direction = 'out' and maintenance_message_status in ('queued');
comment on table maintenance_messages is
  'The thread on a request (0084): what came in (email, form, portal), what went out (the offer with its accept link, the reminder, the closing mail — queued here, sent by the worker), and what was said on the phone (a note). The Graph message id is unique so inbound mail is matched once.';

-- The accept link's token, for the worker and nobody else. maintenance_assignments keeps
-- only the hash, so the queued offer email carries an {{ACCEPT_LINK}} placeholder and the
-- token waits here until the send; complete_maintenance_message() deletes it on success.
-- RLS on, no policies: invisible to every API role. Not audited — a log of secrets is a
-- second copy of them.
create table if not exists maintenance_message_secrets (
  maintenance_message_id      uuid primary key references maintenance_messages (maintenance_message_id) on delete cascade,
  maintenance_message_secret_token text not null,
  maintenance_message_secret_created_at timestamptz not null default now()
);
alter table maintenance_message_secrets enable row level security;
revoke all on maintenance_message_secrets from public, anon, authenticated;
comment on table maintenance_message_secrets is
  'The accept-link token behind a queued offer email (0084), held until the worker sends and deletes it. Service role only — RLS on with no policies, and revoked from the API roles. Exempt from the audit on purpose.';

-- offer_maintenance_item() runs as the caller, who cannot see the table above; parking the
-- token goes through one narrow definer that can only insert, and only behind a queued
-- outgoing message. The same carve-out every guard makes: no auth.uid() is a migration or
-- a seed, not a stranger.
create or replace function private.park_maintenance_message_secret(p_message uuid, p_token text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not is_active_user() then
    raise exception 'not an active user' using errcode = '42501';
  end if;
  if not exists (select 1 from maintenance_messages
                  where maintenance_message_id = p_message and maintenance_message_direction = 'out' and maintenance_message_status = 'queued') then
    raise exception 'no queued outgoing message to park a token behind' using errcode = 'P0002';
  end if;
  insert into maintenance_message_secrets (maintenance_message_id, maintenance_message_secret_token) values (p_message, p_token);
end $$;
revoke execute on function private.park_maintenance_message_secret(uuid, text) from public, anon;
grant execute on function private.park_maintenance_message_secret(uuid, text) to authenticated;

create or replace function private.audit_exempt_tables() returns text[]
language sql immutable as $$
  select array['activity_audit', 'login_activity', 'activity_events',
               'property_value_history', 'job_stage_events', 'address_history',
               'notifications', 'notification_deliveries', 'maintenance_message_secrets']
$$;

-- ---------------------------------------------------------- arcs widen
alter table record_parties add column if not exists maintenance_request_id uuid references maintenance_requests (maintenance_request_id) on delete cascade;
alter table record_parties drop constraint if exists record_parties_one_record;
alter table record_parties add constraint record_parties_one_record
  check (num_nonnulls(project_id, job_id, process_run_id, maintenance_request_id) = 1);
drop index if exists record_parties_one_current;
create unique index record_parties_one_current
  on record_parties (coalesce(project_id::text, ''), coalesce(job_id, ''), coalesce(process_run_id::text, ''), coalesce(maintenance_request_id::text, ''),
                     party_role_id, coalesce(contact_id::text, ''), coalesce(company_id::text, ''))
  where record_party_ended_on is null;
create index if not exists record_parties_request_idx on record_parties (maintenance_request_id) where maintenance_request_id is not null;

alter table document_links add column if not exists maintenance_request_id uuid references maintenance_requests (maintenance_request_id) on delete cascade;
alter table document_links drop constraint if exists document_links_one_parent;
alter table document_links add constraint document_links_one_parent
  check (num_nonnulls(project_id, job_id, task_id, variation_id, maintenance_request_id) = 1);
create index if not exists document_links_request_idx on document_links (maintenance_request_id) where maintenance_request_id is not null;

-- ---------------------------------------------------------- stamps, audit, RLS
do $$
declare t record;
begin
  for t in select * from (values
      ('maintenance_categories',  'maintenance_category'),
      ('maintenance_requests',    'maintenance_request'),
      ('maintenance_items',       'maintenance_item'),
      ('maintenance_assignments', 'maintenance_assignment')
    ) as v(tbl, pfx)
  loop
    execute format('drop trigger if exists %I on %I', t.tbl || '_touch', t.tbl);
    execute format('create trigger %I before update on %I for each row execute function extensions.moddatetime(%I)', t.tbl || '_touch', t.tbl, t.pfx || '_updated_at');
    execute format('drop trigger if exists %I on %I', t.tbl || '_stamp_created_by', t.tbl);
    execute format('create trigger %I before insert on %I for each row execute function stamp_created_by(%L)', t.tbl || '_stamp_created_by', t.tbl, t.pfx || '_created_by');
  end loop;
  drop trigger if exists maintenance_settings_touch on maintenance_settings;
  create trigger maintenance_settings_touch before update on maintenance_settings
    for each row execute function extensions.moddatetime(maintenance_setting_updated_at);
  drop trigger if exists maintenance_messages_stamp_created_by on maintenance_messages;
  create trigger maintenance_messages_stamp_created_by before insert on maintenance_messages
    for each row execute function stamp_created_by('maintenance_message_created_by');
  for t in select unnest(array['maintenance_settings', 'maintenance_categories', 'maintenance_requests', 'maintenance_items', 'maintenance_assignments', 'maintenance_messages']) as tbl loop
    execute format('drop trigger if exists trg_activity_audit_row on %I', t.tbl);
    execute format('create trigger trg_activity_audit_row after insert or update or delete on %I for each row execute function log_activity_audit()', t.tbl);
    execute format('alter table %I enable row level security', t.tbl);
  end loop;
end $$;

-- The audit resolves a request's job through the request.
create or replace function private.audit_record_ids(p_table text, r jsonb, out job_id text, out project_id integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t text;
begin
  job_id := null; project_id := null;
  if r is null then return; end if;
  job_id := nullif(r ->> 'job_id', '');
  t := r ->> 'project_id';
  if t ~ '^[0-9]+$' then project_id := t::integer; end if;
  begin
    if job_id is null and project_id is null then
      if r ? 'task_id' and p_table <> 'tasks' then
        select tk.job_id, tk.project_id into job_id, project_id from tasks tk where tk.task_id = (r ->> 'task_id')::uuid;
      elsif r ? 'variation_id' and p_table <> 'variations' then
        select v.job_id into job_id from variations v where v.variation_id = (r ->> 'variation_id')::uuid;
      elsif r ? 'process_run_id' and p_table <> 'process_runs' then
        select pr.job_id, pr.project_id into job_id, project_id from process_runs pr where pr.process_run_id = (r ->> 'process_run_id')::uuid;
      elsif r ? 'maintenance_request_id' and p_table <> 'maintenance_requests' then
        select mr.job_id into job_id from maintenance_requests mr where mr.maintenance_request_id = (r ->> 'maintenance_request_id')::uuid;
      elsif r ? 'maintenance_item_id' and p_table <> 'maintenance_items' then
        select mr.job_id into job_id from maintenance_items mi join maintenance_requests mr using (maintenance_request_id)
         where mi.maintenance_item_id = (r ->> 'maintenance_item_id')::uuid;
      elsif r ? 'comment_id' and p_table <> 'comments' then
        select c.job_id, c.project_id into job_id, project_id from comments c where c.comment_id = (r ->> 'comment_id')::uuid;
        if job_id is null and project_id is null then
          select ids.job_id, ids.project_id into job_id, project_id
            from comments c, private.audit_record_ids('comments', to_jsonb(c)) ids
           where c.comment_id = (r ->> 'comment_id')::uuid;
        end if;
      end if;
    end if;
    if project_id is null and job_id is not null then
      select j.project_id into project_id from jobs j where j.job_id = audit_record_ids.job_id;
    end if;
  exception when others then null;
  end;
end $$;

do $$
declare t text;
begin
  -- Everyone active reads maintenance; users and above write requests, items, offers and
  -- the thread; managers own the settings and the categories (the SLAs are theirs);
  -- admins delete requests.
  foreach t in array array['maintenance_settings', 'maintenance_categories'] loop
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "managers write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using ((select is_active_user()))', t);
    execute format('create policy "managers write %1$s" on %1$I for all to authenticated
                      using ((select current_permission()) >= ''manager'') with check ((select current_permission()) >= ''manager'')', t);
  end loop;
  foreach t in array array['maintenance_items', 'maintenance_assignments', 'maintenance_messages'] loop
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "users write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using ((select is_active_user()))', t);
    execute format('create policy "users write %1$s" on %1$I for all to authenticated
                      using ((select current_permission()) >= ''user'') with check ((select current_permission()) >= ''user'')', t);
  end loop;
  drop policy if exists "read maintenance_requests" on maintenance_requests;
  drop policy if exists "users create maintenance_requests" on maintenance_requests;
  drop policy if exists "users update maintenance_requests" on maintenance_requests;
  drop policy if exists "admins delete maintenance_requests" on maintenance_requests;
  create policy "read maintenance_requests" on maintenance_requests for select to authenticated using ((select is_active_user()));
  create policy "users create maintenance_requests" on maintenance_requests for insert to authenticated with check ((select current_permission()) >= 'user');
  create policy "users update maintenance_requests" on maintenance_requests for update to authenticated
    using ((select current_permission()) >= 'user') with check ((select current_permission()) >= 'user');
  create policy "admins delete maintenance_requests" on maintenance_requests for delete to authenticated using ((select current_permission()) >= 'admin');
end $$;

-- ---------------------------------------------------------- the views
-- The warranty: handover is the completion of the "7 - Handover" run; the period is the
-- settings'. Nobody types the end date.
drop view if exists job_warranty;
create view job_warranty with (security_invoker = true) as
  select j.job_id,
         h.process_run_completed_at as job_handover_at,
         (h.process_run_completed_at::date + (s.maintenance_setting_warranty_months || ' months')::interval)::date as job_warranty_ends_on,
         (h.process_run_completed_at is not null
          and (now() at time zone 'Australia/Adelaide')::date <= (h.process_run_completed_at::date + (s.maintenance_setting_warranty_months || ' months')::interval)::date) as job_is_in_warranty
    from jobs j
    cross join maintenance_settings s
    left join lateral (
      select r.process_run_completed_at
        from process_runs r join processes p using (process_id)
       where r.job_id = j.job_id and p.process_key = 'handover' and r.process_run_status = 'complete'
       order by r.process_run_attempt desc limit 1
    ) h on true;
comment on view job_warranty is 'When each job was handed over (the completion of the 7 - Handover run) and when its warranty ends — handover plus maintenance_settings'' months (0084). Derived; nobody types it.';

drop view if exists maintenance_request_display;
create view maintenance_request_display with (security_invoker = true) as
  select r.*,
         jd.job_current_address, jd.job_suburb, jd.project_id,
         c.contact_full_name as maintenance_request_reported_by_name,
         (select m.contact_method_value from contact_methods m where m.contact_id = r.maintenance_request_reported_by_contact_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc limit 1) as maintenance_request_reported_by_email,
         (select m.contact_method_value from contact_methods m where m.contact_id = r.maintenance_request_reported_by_contact_id and m.contact_method_kind in ('mobile', 'phone')
           order by m.contact_method_is_primary desc, (m.contact_method_kind = 'mobile') desc limit 1) as maintenance_request_reported_by_phone,
         o.profile_full_name as maintenance_request_owner_name,
         cat.maintenance_category_name, cat.maintenance_category_at_risk_lead_days,
         w.job_handover_at, w.job_warranty_ends_on,
         (w.job_handover_at is not null
          and (r.maintenance_request_reported_at at time zone 'Australia/Adelaide')::date <= w.job_warranty_ends_on) as maintenance_request_is_warranty,
         (select count(*) from maintenance_items i where i.maintenance_request_id = r.maintenance_request_id)::integer as maintenance_request_items_total,
         (select count(*) from maintenance_items i where i.maintenance_request_id = r.maintenance_request_id
            and i.maintenance_item_status in ('done', 'not_applicable'))::integer as maintenance_request_items_done,
         (select count(*) from maintenance_assignments a join maintenance_items i using (maintenance_item_id)
           where i.maintenance_request_id = r.maintenance_request_id and a.maintenance_assignment_status = 'offered')::integer as maintenance_request_offers_open,
         (select min(a.maintenance_assignment_scheduled_for) from maintenance_assignments a join maintenance_items i using (maintenance_item_id)
           where i.maintenance_request_id = r.maintenance_request_id and a.maintenance_assignment_status in ('accepted', 'scheduled')
             and a.maintenance_assignment_scheduled_for >= now()) as maintenance_request_next_visit,
         (r.maintenance_request_due_on - coalesce(cat.maintenance_category_at_risk_lead_days, 0)) as maintenance_request_at_risk_on,
         case
           when r.maintenance_request_status in ('closed', 'rejected') then 'closed'
           when r.maintenance_request_status = 'completed' then 'complete'
           when r.maintenance_request_due_on is null then 'no_sla'
           when (now() at time zone 'Australia/Adelaide')::date > r.maintenance_request_due_on then 'overdue'
           when cat.maintenance_category_at_risk_lead_days is not null
                and (now() at time zone 'Australia/Adelaide')::date >= r.maintenance_request_due_on - cat.maintenance_category_at_risk_lead_days then 'at_risk'
           else 'on_track'
         end as maintenance_request_health,
         (select count(*) from maintenance_messages m where m.maintenance_request_id = r.maintenance_request_id)::integer as maintenance_request_messages_total,
         (select max(m.maintenance_message_at) from maintenance_messages m where m.maintenance_request_id = r.maintenance_request_id) as maintenance_request_last_message_at
    from maintenance_requests r
    join job_display jd on jd.job_id = r.job_id
    left join contacts c on c.contact_id = r.maintenance_request_reported_by_contact_id
    left join profiles o on o.profile_id = r.maintenance_request_owner_profile_id
    left join maintenance_categories cat on cat.maintenance_category_id = r.maintenance_category_id
    left join job_warranty w on w.job_id = r.job_id;
comment on view maintenance_request_display is
  'A request as the Maintenance tab reads it (0084): the job''s address, who reported it and how to reach them, the owner, the category and its clock, the warranty flag, item and offer counts, the next visit, and health — no_sla · on_track · at_risk · overdue · complete · closed — derived from today.';

drop view if exists maintenance_item_display;
create view maintenance_item_display with (security_invoker = true) as
  select i.*,
         cat.maintenance_category_name, cat.party_role_id as maintenance_item_party_role_id,
         a.maintenance_assignment_id, a.maintenance_assignment_status, a.maintenance_assignment_offered_at,
         a.maintenance_assignment_responded_at, a.maintenance_assignment_scheduled_for, a.maintenance_assignment_note,
         a.company_id as maintenance_item_company_id, co.company_name as maintenance_item_company_name,
         a.contact_id as maintenance_item_contact_id, ct.contact_full_name as maintenance_item_contact_name,
         f.profile_full_name as maintenance_item_completed_by_name,
         -- Who did this trade on the job during construction: the default repairer.
         (select string_agg(coalesce(rpc.company_name, rpk.contact_full_name), ', ')
            from record_parties rp
            left join companies rpc on rpc.company_id = rp.company_id
            left join contacts rpk on rpk.contact_id = rp.contact_id
            left join process_runs pr on pr.process_run_id = rp.process_run_id
           where rp.party_role_id = cat.party_role_id and rp.record_party_ended_on is null
             and (rp.job_id = r.job_id or pr.job_id = r.job_id)) as maintenance_item_original_trade
    from maintenance_items i
    join maintenance_requests r using (maintenance_request_id)
    left join maintenance_categories cat on cat.maintenance_category_id = i.maintenance_category_id
    left join lateral (
      select * from maintenance_assignments x where x.maintenance_item_id = i.maintenance_item_id
       order by (x.maintenance_assignment_status in ('offered', 'accepted', 'scheduled', 'done')) desc, x.maintenance_assignment_offered_at desc limit 1
    ) a on true
    left join companies co on co.company_id = a.company_id
    left join contacts ct on ct.contact_id = a.contact_id
    left join profiles f on f.profile_id = i.maintenance_item_completed_by;
comment on view maintenance_item_display is
  'An item with its current offer and its contractor named (0084), and — from record_parties on the job''s construction runs — who did that trade originally, which is the default repairer (Amber, answer 3).';

-- ---------------------------------------------------------- notifications join in
insert into notification_types (notification_type_id, notification_type_name, notification_type_description, notification_type_default_channels, notification_type_default_timing, notification_type_position) values
  ('maintenance_new',            'Maintenance request arrived',   'A new maintenance request was logged, by any channel.',                          array['in_app', 'email'], 'immediate', 20),
  ('maintenance_no_answer',      'Contractor has not answered',   'An offer to a contractor has had no answer within the settings'' hours.',        array['in_app', 'email'], 'immediate', 21),
  ('maintenance_sla_breach',     'Maintenance request over SLA',  'A request is at risk or past its SLA.',                                           array['in_app', 'email'], 'digest',    22),
  ('maintenance_visit_tomorrow', 'Maintenance visit tomorrow',    'A contractor is scheduled on site tomorrow.',                                     array['in_app'],          'digest',    23),
  ('maintenance_closed',         'Maintenance request closed',    'A request you own was closed.',                                                   array['in_app'],          'immediate', 24)
on conflict (notification_type_id) do nothing;
insert into notification_rules (notification_type_id, notification_rule_audience, team_id, notification_rule_after_days)
select * from (values
  ('maintenance_new',            'specific_team', 'maintenance', 0),
  ('maintenance_no_answer',      'assignee',      null,          0),
  ('maintenance_sla_breach',     'assignee',      null,          0),
  ('maintenance_sla_breach',     'specific_team', 'maintenance', 0),
  ('maintenance_sla_breach',     'managers',      null,          3),
  ('maintenance_visit_tomorrow', 'assignee',      null,          0),
  ('maintenance_closed',         'assignee',      null,          0)
) as v(t, a, team, d)
where not exists (select 1 from notification_rules where notification_type_id like 'maintenance_%');

-- A new request tells the Maintenance team (and the owner, if one was named at once).
create or replace function notify_maintenance_new() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid[]; addr text;
begin
  who := private.notification_recipients('maintenance_new', new.job_id, null, new.maintenance_request_owner_profile_id, 'maintenance', null, 0);
  who := array(select u from unnest(who) u where u is distinct from current_profile_id());
  select job_current_address into addr from job_display where job_id = new.job_id;
  perform private.notify('maintenance_new', who,
    format('%s · %s', new.maintenance_request_number, new.maintenance_request_summary),
    format('%s at %s, by %s%s.', new.maintenance_request_number, coalesce(addr, new.job_id), new.maintenance_request_source,
           case when new.maintenance_request_priority in ('urgent', 'high') then ' — ' || new.maintenance_request_priority else '' end),
    '/maintenance?request=' || new.maintenance_request_id,
    'maintenance_new:' || new.maintenance_request_id,
    new.job_id, null, null, null, null);
  return new;
end $$;
revoke execute on function notify_maintenance_new() from public, anon, authenticated;
drop trigger if exists maintenance_requests_notify_new on maintenance_requests;
create trigger maintenance_requests_notify_new after insert on maintenance_requests
  for each row execute function notify_maintenance_new();

-- Closing tells the owner and queues the homeowner's closing mail.
create or replace function on_maintenance_request_closed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare who uuid[]; addr text; email text; reporter text;
begin
  if new.maintenance_request_status <> 'closed' or old.maintenance_request_status = 'closed' then return new; end if;
  who := private.notification_recipients('maintenance_closed', new.job_id, null, new.maintenance_request_owner_profile_id, 'maintenance', null, 0);
  who := array(select u from unnest(who) u where u is distinct from current_profile_id());
  perform private.notify('maintenance_closed', who,
    format('%s closed', new.maintenance_request_number),
    format('%s — %s — was closed%s.', new.maintenance_request_number, new.maintenance_request_summary,
           case when new.maintenance_request_closed_reason is not null then ': ' || new.maintenance_request_closed_reason else '' end),
    '/maintenance?request=' || new.maintenance_request_id,
    'maintenance_closed:' || new.maintenance_request_id || ':' || to_char(now(), 'YYYY-MM-DD'),
    new.job_id, null, null, null, null);
  select m.contact_method_value, c.contact_first_name into email, reporter
    from contacts c join contact_methods m on m.contact_id = c.contact_id and m.contact_method_kind = 'email'
   where c.contact_id = new.maintenance_request_reported_by_contact_id
   order by m.contact_method_is_primary desc limit 1;
  if email is not null then
    select job_current_address into addr from job_display where job_id = new.job_id;
    insert into maintenance_messages (maintenance_request_id, maintenance_message_direction, maintenance_message_channel,
                                      maintenance_message_to_address, maintenance_message_subject, maintenance_message_body, maintenance_message_status)
    values (new.maintenance_request_id, 'out', 'email', email,
            format('%s · %s · %s — closed', new.maintenance_request_number, coalesce(addr, new.job_id), new.maintenance_request_summary),
            format('Hi %s,%s%sYour maintenance request %s (%s) has been closed%s. If anything is not right, reply to this email and it will reopen the request.%s%sLofty Building Group',
                   coalesce(reporter, 'there'), chr(10), chr(10), new.maintenance_request_number, new.maintenance_request_summary,
                   case when new.maintenance_request_closed_reason is not null then ': ' || new.maintenance_request_closed_reason else '' end, chr(10), chr(10)),
            'queued');
  end if;
  return new;
end $$;
revoke execute on function on_maintenance_request_closed() from public, anon, authenticated;
drop trigger if exists maintenance_requests_on_closed on maintenance_requests;
create trigger maintenance_requests_on_closed after update of maintenance_request_status on maintenance_requests
  for each row execute function on_maintenance_request_closed();

-- ---------------------------------------------------------- the offer, with its link
-- Offering an item to a contractor: one row, one token, one queued email. Returns the
-- assignment id; the token itself is returned to the caller ONCE and never stored.
create or replace function offer_maintenance_item(p_item uuid, p_company uuid, p_contact uuid, p_note text default null)
returns table (maintenance_assignment_id uuid, accept_token text, sent_to text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  token text := encode(extensions.gen_random_bytes(24), 'hex');
  aid uuid; mid uuid; req maintenance_requests%rowtype; item maintenance_items%rowtype; addr text; to_email text; who text; days smallint; hours smallint;
begin
  select * into item from maintenance_items where maintenance_items.maintenance_item_id = p_item;
  if item.maintenance_item_id is null then raise exception 'no such item, or you may not see it' using errcode = 'P0002'; end if;
  select * into req from maintenance_requests where maintenance_requests.maintenance_request_id = item.maintenance_request_id;
  select maintenance_setting_accept_link_days, maintenance_setting_offer_response_hours into days, hours from maintenance_settings;

  insert into maintenance_assignments (maintenance_item_id, company_id, contact_id, maintenance_assignment_note,
                                       maintenance_assignment_token_hash, maintenance_assignment_token_expires_at)
  values (p_item, p_company, p_contact, p_note, encode(extensions.digest(token, 'sha256'), 'hex'), now() + (days || ' days')::interval)
  returning maintenance_assignments.maintenance_assignment_id into aid;

  -- The address: the contact's email first, else the company's.
  select m.contact_method_value into to_email from contact_methods m
   where ((p_contact is not null and m.contact_id = p_contact) or (p_contact is null and m.company_id = p_company))
     and m.contact_method_kind = 'email' order by m.contact_method_is_primary desc limit 1;
  if to_email is null and p_contact is not null then
    select m.contact_method_value into to_email from contact_methods m where m.company_id = p_company and m.contact_method_kind = 'email'
     order by m.contact_method_is_primary desc limit 1;
  end if;
  select coalesce((select contact_first_name from contacts where contact_id = p_contact), (select company_name from companies where company_id = p_company)) into who;
  select job_current_address into addr from job_display where job_id = req.job_id;

  if to_email is not null then
    insert into maintenance_messages (maintenance_request_id, maintenance_assignment_id, maintenance_message_direction, maintenance_message_channel,
                                      maintenance_message_to_address, maintenance_message_subject, maintenance_message_body, maintenance_message_status)
    values (req.maintenance_request_id, aid, 'out', 'email', to_email,
            format('%s · %s · %s', req.maintenance_request_number, coalesce(addr, req.job_id), item.maintenance_item_description),
            format('Hi %s,%s%sLofty has a maintenance item for you at %s:%s%s  %s%s%s%sPlease let us know within %s hours by opening the link below and choosing Accept (with a time) or Decline. The link is for this job only and expires in %s days.%s%s{{ACCEPT_LINK}}%s%sLofty Building Group',
                   coalesce(who, 'there'), chr(10), chr(10), coalesce(addr, req.job_id), chr(10), chr(10),
                   item.maintenance_item_description || coalesce(' (' || item.maintenance_item_location || ')', ''), chr(10),
                   coalesce(chr(10) || 'Note: ' || p_note || chr(10), ''), chr(10), hours, days, chr(10), chr(10), chr(10), chr(10)),
            'queued')
    returning maintenance_messages.maintenance_message_id into mid;
    perform private.park_maintenance_message_secret(mid, token);
  end if;
  return query select aid, token, to_email;
end $$;
grant execute on function offer_maintenance_item(uuid, uuid, uuid, text) to authenticated;
comment on function offer_maintenance_item(uuid, uuid, uuid, text) is
  'Offers an item to a contractor (0084): writes the assignment with a hashed token, queues the offer email with an {{ACCEPT_LINK}} placeholder, parks the token in maintenance_message_secrets for the worker to fill the link from, and returns the token once to the caller. Security invoker: the caller''s policies decide.';

-- The link is used: verify the hash, refuse an expired or spent token, record the answer,
-- and log it as an accept_link write (Amber: "yes but needs to be logged").
create or replace function answer_maintenance_offer(p_token text, p_accept boolean, p_scheduled_for timestamptz default null, p_note text default null)
returns table (maintenance_request_number text, item_description text, job_address text, outcome text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare a maintenance_assignments%rowtype; item maintenance_items%rowtype; req maintenance_requests%rowtype; addr text;
begin
  select * into a from maintenance_assignments
   where maintenance_assignment_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if a.maintenance_assignment_id is null then
    raise exception 'this link is not one we sent' using errcode = 'P0002';
  end if;
  if a.maintenance_assignment_token_expires_at < now() then
    raise exception 'this link has expired — ask Lofty to send a new one' using errcode = '22023';
  end if;
  if a.maintenance_assignment_status <> 'offered' then
    raise exception 'this offer has already been answered (%)', a.maintenance_assignment_status using errcode = '22023';
  end if;
  perform set_config('app.sync_origin', 'accept_link', true);
  update maintenance_assignments
     set maintenance_assignment_status = case when p_accept then case when p_scheduled_for is not null then 'scheduled' else 'accepted' end else 'declined' end,
         maintenance_assignment_responded_at = now(),
         maintenance_assignment_scheduled_for = case when p_accept then p_scheduled_for else null end,
         maintenance_assignment_note = coalesce(p_note, maintenance_assignment_note),
         maintenance_assignment_token_hash = null
   where maintenance_assignments.maintenance_assignment_id = a.maintenance_assignment_id;
  select * into item from maintenance_items where maintenance_items.maintenance_item_id = a.maintenance_item_id;
  select * into req from maintenance_requests where maintenance_requests.maintenance_request_id = item.maintenance_request_id;
  select job_current_address into addr from job_display where job_id = req.job_id;
  insert into maintenance_messages (maintenance_request_id, maintenance_assignment_id, maintenance_message_direction, maintenance_message_channel,
                                    maintenance_message_from_contact_id, maintenance_message_body, maintenance_message_status)
  values (req.maintenance_request_id, a.maintenance_assignment_id, 'in', 'portal', a.contact_id,
          format('%s via the accept link%s%s', case when p_accept then 'Accepted' else 'Declined' end,
                 case when p_scheduled_for is not null then ' for ' || to_char(p_scheduled_for at time zone 'Australia/Adelaide', 'Dy DD Mon HH24:MI') else '' end,
                 coalesce(': ' || p_note, '')), 'received');
  perform set_config('app.sync_origin', '', true);
  return query select req.maintenance_request_number, item.maintenance_item_description, addr,
                      case when p_accept then case when p_scheduled_for is not null then 'scheduled' else 'accepted' end else 'declined' end;
end $$;
revoke execute on function answer_maintenance_offer(text, boolean, timestamptz, text) from public, anon, authenticated;
comment on function answer_maintenance_offer(text, boolean, timestamptz, text) is
  'The accept link''s landing (0084): verifies the token''s hash, refuses expired or spent ones, records accept (with a time) or decline, spends the token, and writes the answer into the thread — with activity_audit_origin accept_link, so it is logged. Service role only; the maintenance-accept Edge Function calls it.';

-- ---------------------------------------------------------- the scan
create or replace function maintenance_scan() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; made integer := 0; who uuid[]; hours smallint; remind smallint; late integer;
begin
  select maintenance_setting_offer_response_hours, maintenance_setting_reminder_days_before into hours, remind from maintenance_settings;

  -- Offers unanswered past the hours: the request's owner, once a day.
  for r in
    select a.maintenance_assignment_id, a.maintenance_assignment_offered_at, req.*, i.maintenance_item_description,
           coalesce(co.company_name, ct.contact_full_name) as contractor
      from maintenance_assignments a
      join maintenance_items i using (maintenance_item_id)
      join maintenance_requests req using (maintenance_request_id)
      left join companies co on co.company_id = a.company_id
      left join contacts ct on ct.contact_id = a.contact_id
     where a.maintenance_assignment_status = 'offered'
       and a.maintenance_assignment_offered_at < now() - (hours || ' hours')::interval
  loop
    who := private.notification_recipients('maintenance_no_answer', r.job_id, null, r.maintenance_request_owner_profile_id, 'maintenance', null, 0);
    made := made + private.notify('maintenance_no_answer', who,
      format('%s has not answered — %s', coalesce(r.contractor, 'The contractor'), r.maintenance_request_number),
      format('%s was offered "%s" on %s and has not answered within %s hours.', coalesce(r.contractor, 'The contractor'), r.maintenance_item_description,
             to_char(r.maintenance_assignment_offered_at at time zone 'Australia/Adelaide', 'DD Mon'), hours),
      '/maintenance?request=' || r.maintenance_request_id,
      format('maintenance_no_answer:%s:%s', r.maintenance_assignment_id, (now() at time zone 'Australia/Adelaide')::date),
      r.job_id, null, null, null, null);
  end loop;

  -- Requests at risk or over SLA, once a day, escalating by days late.
  for r in select * from maintenance_request_display where maintenance_request_health in ('at_risk', 'overdue') loop
    late := greatest(0, (now() at time zone 'Australia/Adelaide')::date - r.maintenance_request_due_on);
    who := private.notification_recipients('maintenance_sla_breach', r.job_id, null, r.maintenance_request_owner_profile_id, 'maintenance', null, late);
    made := made + private.notify('maintenance_sla_breach', who,
      format('%s is %s', r.maintenance_request_number, case when r.maintenance_request_health = 'overdue' then 'over its SLA' else 'at risk' end),
      format('%s — %s at %s — due %s%s.', r.maintenance_request_number, r.maintenance_request_summary, coalesce(r.job_current_address, r.job_id),
             to_char(r.maintenance_request_due_on, 'DD Mon'),
             case when late > 0 then format(', %s day%s ago', late, case when late = 1 then '' else 's' end) else '' end),
      '/maintenance?request=' || r.maintenance_request_id,
      format('maintenance_sla_breach:%s:%s', r.maintenance_request_id, (now() at time zone 'Australia/Adelaide')::date),
      r.job_id, null, null, null, null);
  end loop;

  -- Visits within the reminder window: the owner; the homeowner's and contractor's mail
  -- goes through the thread.
  for r in
    select a.*, req.maintenance_request_id, req.maintenance_request_number, req.job_id, req.maintenance_request_owner_profile_id,
           req.maintenance_request_reported_by_contact_id, i.maintenance_item_description,
           coalesce(co.company_name, ct.contact_full_name) as contractor
      from maintenance_assignments a
      join maintenance_items i using (maintenance_item_id)
      join maintenance_requests req using (maintenance_request_id)
      left join companies co on co.company_id = a.company_id
      left join contacts ct on ct.contact_id = a.contact_id
     where a.maintenance_assignment_status in ('accepted', 'scheduled')
       and a.maintenance_assignment_scheduled_for is not null
       and (a.maintenance_assignment_scheduled_for at time zone 'Australia/Adelaide')::date = (now() at time zone 'Australia/Adelaide')::date + remind
  loop
    who := private.notification_recipients('maintenance_visit_tomorrow', r.job_id, null, r.maintenance_request_owner_profile_id, 'maintenance', null, 0);
    made := made + private.notify('maintenance_visit_tomorrow', who,
      format('%s on site %s — %s', coalesce(r.contractor, 'A contractor'),
             case when remind = 1 then 'tomorrow' else 'in ' || remind || ' days' end, r.maintenance_request_number),
      format('%s for "%s", %s.', coalesce(r.contractor, 'A contractor'), r.maintenance_item_description,
             to_char(r.maintenance_assignment_scheduled_for at time zone 'Australia/Adelaide', 'Dy DD Mon HH24:MI')),
      '/maintenance?request=' || r.maintenance_request_id,
      format('maintenance_visit_tomorrow:%s:%s', r.maintenance_assignment_id, (now() at time zone 'Australia/Adelaide')::date),
      r.job_id, null, null, null, null);
    -- The homeowner's reminder, once per visit.
    insert into maintenance_messages (maintenance_request_id, maintenance_assignment_id, maintenance_message_direction, maintenance_message_channel,
                                      maintenance_message_to_address, maintenance_message_subject, maintenance_message_body, maintenance_message_status,
                                      maintenance_message_external_id)
    select r.maintenance_request_id, r.maintenance_assignment_id, 'out', 'email', m.contact_method_value,
           format('%s · a visit %s', r.maintenance_request_number, case when remind = 1 then 'tomorrow' else 'in ' || remind || ' days' end),
           format('Hi %s,%s%s%s is scheduled to attend for "%s" on %s. Reply to this email if that time does not work.%s%sLofty Building Group',
                  c.contact_first_name, chr(10), chr(10), coalesce(r.contractor, 'A contractor'), r.maintenance_item_description,
                  to_char(r.maintenance_assignment_scheduled_for at time zone 'Australia/Adelaide', 'Dy DD Mon HH24:MI'), chr(10), chr(10)),
           'queued', 'reminder:' || r.maintenance_assignment_id
      from contacts c join contact_methods m on m.contact_id = c.contact_id and m.contact_method_kind = 'email'
     where c.contact_id = r.maintenance_request_reported_by_contact_id
     order by m.contact_method_is_primary desc limit 1
    on conflict (maintenance_message_external_id) do nothing;
  end loop;
  return made;
end $$;
revoke execute on function maintenance_scan() from public, anon, authenticated;
comment on function maintenance_scan() is 'Every 15 minutes by pg_cron (job name: maintenance_scan): unanswered offers, requests at risk or over SLA, and visits inside the reminder window — each once a day per record (0084).';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('maintenance_scan', '7,22,37,52 * * * *', 'select maintenance_scan()');
  end if;
end $$;

-- The thread's outbox, for the worker: the same two calls the notification outbox has,
-- plus the accept-link token where the message has one, so the worker can fill the link.
create or replace function claim_maintenance_messages(p_limit integer default 50)
returns table (maintenance_message_id uuid, maintenance_request_id uuid, maintenance_assignment_id uuid,
               maintenance_message_to_address text, maintenance_message_subject text, maintenance_message_body text,
               maintenance_message_attempts smallint, accept_link_token text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select m.maintenance_message_id from maintenance_messages m
     where m.maintenance_message_direction = 'out' and m.maintenance_message_status = 'queued'
       and m.maintenance_message_next_attempt_at <= now()
     order by m.maintenance_message_next_attempt_at limit p_limit
     for update skip locked
  ), claimed as (
    update maintenance_messages m
       set maintenance_message_status = 'sending', maintenance_message_attempts = m.maintenance_message_attempts + 1
      from due where m.maintenance_message_id = due.maintenance_message_id
    returning m.*
  )
  select c.maintenance_message_id, c.maintenance_request_id, c.maintenance_assignment_id,
         c.maintenance_message_to_address, c.maintenance_message_subject, c.maintenance_message_body,
         c.maintenance_message_attempts, sec.maintenance_message_secret_token
    from claimed c left join maintenance_message_secrets sec using (maintenance_message_id);
end $$;
revoke execute on function claim_maintenance_messages(integer) from public, anon, authenticated;

create or replace function complete_maintenance_message(p_id uuid, p_ok boolean, p_external_id text default null, p_error text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare attempts integer;
begin
  select maintenance_message_attempts into attempts from maintenance_messages where maintenance_message_id = p_id;
  if p_ok then
    update maintenance_messages set maintenance_message_status = 'sent', maintenance_message_external_id = coalesce(p_external_id, maintenance_message_external_id),
           maintenance_message_error = null where maintenance_message_id = p_id;
    delete from maintenance_message_secrets where maintenance_message_id = p_id;
  elsif coalesce(attempts, 0) >= 5 then
    update maintenance_messages set maintenance_message_status = 'failed', maintenance_message_error = left(p_error, 1000) where maintenance_message_id = p_id;
  else
    update maintenance_messages set maintenance_message_status = 'queued', maintenance_message_error = left(p_error, 1000),
           maintenance_message_next_attempt_at = now() + (interval '5 minutes' * power(5, greatest(attempts - 1, 0))) where maintenance_message_id = p_id;
  end if;
end $$;
revoke execute on function complete_maintenance_message(uuid, boolean, text, text) from public, anon, authenticated;

-- Inbound mail lands here (the maintenance-inbound Edge Function calls it): matched to a
-- request by the number in the subject, else by the sender's address, else it becomes a
-- new request in "new" with source email. Idempotent on the Graph message id.
create or replace function receive_maintenance_email(p_external_id text, p_from_address text, p_subject text, p_body text, p_received_at timestamptz default now())
returns table (maintenance_request_id uuid, maintenance_request_number text, matched_by text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare req_id uuid; req_no text; how text; sender uuid; job text;
begin
  if exists (select 1 from maintenance_messages where maintenance_message_external_id = p_external_id) then
    return query select m.maintenance_request_id, r.maintenance_request_number, 'already_received'::text
      from maintenance_messages m join maintenance_requests r using (maintenance_request_id) where m.maintenance_message_external_id = p_external_id;
    return;
  end if;
  perform set_config('app.sync_origin', 'inbound_mail', true);
  select contact_id into sender from contact_methods where contact_method_kind = 'email' and lower(contact_method_value) = lower(p_from_address) limit 1;

  select r.maintenance_request_id, r.maintenance_request_number into req_id, req_no
    from maintenance_requests r
   where r.maintenance_request_status not in ('rejected')
     and p_subject ~* ('\m' || regexp_replace(r.maintenance_request_number, '(\W)', '\\\1', 'g') || '\M')
   order by r.maintenance_request_reported_at desc limit 1;
  if req_id is not null then how := 'number';
  elsif sender is not null then
    select r.maintenance_request_id, r.maintenance_request_number into req_id, req_no
      from maintenance_requests r
     where r.maintenance_request_reported_by_contact_id = sender and r.maintenance_request_status not in ('closed', 'rejected')
     order by r.maintenance_request_reported_at desc limit 1;
    if req_id is not null then how := 'sender'; end if;
  end if;

  if req_id is null then
    -- A new request needs a job. The sender's most recent job as a party, if any; else the
    -- request is parked on no job and cannot exist here — so it is refused with a clear
    -- message and the function's caller leaves the mail for a person to log by hand.
    select rp.job_id into job from record_parties rp
     where rp.contact_id = sender and rp.job_id is not null and rp.party_role_id = 'purchaser' and rp.record_party_ended_on is null
     order by rp.record_party_started_on desc limit 1;
    if job is null then
      raise exception 'no request number in the subject and the sender is not a purchaser on record: log it by hand' using errcode = 'P0002';
    end if;
    insert into maintenance_requests (job_id, maintenance_request_source, maintenance_request_reported_by_contact_id, maintenance_request_reported_at,
                                      maintenance_request_summary, maintenance_request_description)
    values (job, 'email', sender, p_received_at, left(coalesce(nullif(trim(p_subject), ''), 'Email from ' || p_from_address), 200), p_body)
    returning maintenance_requests.maintenance_request_id, maintenance_requests.maintenance_request_number into req_id, req_no;
    how := 'new';
  else
    -- A reply reopens a closed request.
    update maintenance_requests set maintenance_request_status = 'in_progress'
     where maintenance_requests.maintenance_request_id = req_id and maintenance_request_status = 'closed';
  end if;

  insert into maintenance_messages (maintenance_request_id, maintenance_message_direction, maintenance_message_channel, maintenance_message_from_contact_id,
                                    maintenance_message_to_address, maintenance_message_subject, maintenance_message_body, maintenance_message_status,
                                    maintenance_message_external_id, maintenance_message_at)
  values (req_id, 'in', 'email', sender, p_from_address, p_subject, p_body, 'received', p_external_id, p_received_at);
  perform set_config('app.sync_origin', '', true);
  return query select req_id, req_no, how;
end $$;
revoke execute on function receive_maintenance_email(text, text, text, text, timestamptz) from public, anon, authenticated;
comment on function receive_maintenance_email(text, text, text, text, timestamptz) is
  'Inbound mail to the maintenance mailbox (0084): matched by the request number in the subject, else by the sender''s address to their open request, else a new request on the sender''s job; a reply reopens a closed request; refused, for a person to log, when neither the number nor a purchaser matches. Idempotent on the Graph message id. Service role only.';

-- ---------------------------------------------------------------------- proof
do $$
declare
  probe_address uuid; probe_project integer; probe_job text; homeowner uuid; plumber_co uuid; plumber uuid;
  req uuid; req_no text; item uuid; aid uuid; tok text; n integer; made integer; r record;
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0084', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'construction') returning job_id into probe_job;
  insert into contacts (contact_first_name, contact_last_name) values ('Probe', 'Homeowner 0084') returning contact_id into homeowner;
  insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary) values (homeowner, 'email', 'homeowner0084@example.com', true);
  insert into companies (company_name) values ('Probe Plumbing 0084') returning company_id into plumber_co;
  insert into contact_methods (company_id, contact_method_kind, contact_method_value, contact_method_is_primary) values (plumber_co, 'email', 'plumbing0084@example.com', true);
  insert into maintenance_categories (maintenance_category_id, maintenance_category_name, party_role_id, maintenance_category_sla_days, maintenance_category_at_risk_lead_days)
  values ('probe_plumbing_0084', 'Probe plumbing', 'contractor', 5, 2);
  insert into record_parties (job_id, company_id, party_role_id) values (probe_job, plumber_co, 'contractor');

  -- Numbered per job; due from the category; the plumber on the job is the default repairer.
  insert into maintenance_requests (job_id, maintenance_request_source, maintenance_request_reported_by_contact_id, maintenance_request_summary, maintenance_category_id)
  values (probe_job, 'phone', homeowner, 'leaking ensuite tap', 'probe_plumbing_0084') returning maintenance_request_id, maintenance_request_number into req, req_no;
  if req_no <> probe_job || '-M1' then raise exception '0084 proof: request numbered %, expected %-M1', req_no, probe_job; end if;
  -- Adelaide "today", not current_date: the server is UTC and the two differ after 14:30 UTC.
  if (select maintenance_request_due_on from maintenance_requests where maintenance_request_id = req) <> (now() at time zone 'Australia/Adelaide')::date + 5 then
    raise exception '0084 proof: due was not set from the category''s 5 days';
  end if;
  insert into maintenance_items (maintenance_request_id, maintenance_item_description, maintenance_category_id)
  values (req, 'ensuite tap', 'probe_plumbing_0084') returning maintenance_item_id into item;
  if (select maintenance_item_original_trade from maintenance_item_display where maintenance_item_id = item) <> 'Probe Plumbing 0084' then
    raise exception '0084 proof: the default repairer was not read from the job''s parties';
  end if;

  -- Offer: one assignment, a queued email with the placeholder, the token returned once.
  select o.maintenance_assignment_id, o.accept_token into aid, tok from offer_maintenance_item(item, plumber_co, null, 'before Friday please') o;
  if tok is null or length(tok) <> 48 then raise exception '0084 proof: no token returned'; end if;
  select count(*) into n from maintenance_messages where maintenance_assignment_id = aid and maintenance_message_status = 'queued' and maintenance_message_body like '%{{ACCEPT_LINK}}%';
  if n <> 1 then raise exception '0084 proof: the offer email was not queued with its placeholder'; end if;
  if (select maintenance_item_status from maintenance_items where maintenance_item_id = item) <> 'assigned' then
    raise exception '0084 proof: the item did not follow its offer to assigned';
  end if;
  -- A second open offer on the same item is refused.
  begin
    insert into maintenance_assignments (maintenance_item_id, company_id) values (item, plumber_co);
    raise exception '0084 proof: a second open offer on one item was accepted';
  exception when unique_violation then null; end;

  -- The link: a wrong token is refused; the right one schedules, spends itself, and is logged as accept_link.
  begin
    perform answer_maintenance_offer('not-a-token', true);
    raise exception '0084 proof: a bad token was accepted';
  exception when no_data_found or others then
    if sqlerrm not like '%not one we sent%' then raise; end if;
  end;
  select * into r from answer_maintenance_offer(tok, true, now() + interval '2 days', 'will bring parts');
  if r.outcome <> 'scheduled' then raise exception '0084 proof: the accept did not schedule (%)', r.outcome; end if;
  if (select maintenance_item_status from maintenance_items where maintenance_item_id = item) <> 'scheduled' then
    raise exception '0084 proof: the item did not follow to scheduled';
  end if;
  if exists (select 1 from maintenance_assignments where maintenance_assignment_id = aid and maintenance_assignment_token_hash is not null) then
    raise exception '0084 proof: the token was not spent';
  end if;
  select count(*) into n from activity_audit where activity_audit_table = 'maintenance_assignments' and activity_audit_origin = 'accept_link'
     and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'maintenance_assignment_id' = aid::text;
  if n < 1 then raise exception '0084 proof: the accept was not logged with origin accept_link'; end if;
  begin
    perform answer_maintenance_offer(tok, true);
    raise exception '0084 proof: a spent token was accepted again';
  exception when others then if sqlerrm not like '%not one we sent%' then raise; end if; end;

  -- Closing with an open item is refused; done, then closed, queues the homeowner's mail.
  begin
    update maintenance_requests set maintenance_request_status = 'closed' where maintenance_request_id = req;
    raise exception '0084 proof: closed with an open item';
  exception when check_violation then null; end;
  update maintenance_assignments set maintenance_assignment_status = 'done' where maintenance_assignment_id = aid;
  if (select maintenance_item_status from maintenance_items where maintenance_item_id = item) <> 'done' then
    raise exception '0084 proof: the item did not follow to done';
  end if;
  update maintenance_requests set maintenance_request_status = 'closed', maintenance_request_closed_reason = 'tap replaced' where maintenance_request_id = req;
  select count(*) into n from maintenance_messages where maintenance_request_id = req and maintenance_message_direction = 'out'
     and maintenance_message_to_address = 'homeowner0084@example.com' and maintenance_message_status = 'queued';
  if n <> 1 then raise exception '0084 proof: the closing email to the homeowner was not queued (found %)', n; end if;

  -- Inbound: a reply quoting the number lands on the request and reopens it; the same message twice is one row.
  select * into r from receive_maintenance_email('graph-msg-0084', 'homeowner0084@example.com', 'Re: ' || req_no || ' · still dripping', 'It still drips.');
  if r.matched_by <> 'number' then raise exception '0084 proof: inbound mail matched by % not number', r.matched_by; end if;
  if (select maintenance_request_status from maintenance_requests where maintenance_request_id = req) <> 'in_progress' then
    raise exception '0084 proof: a reply did not reopen the closed request';
  end if;
  select * into r from receive_maintenance_email('graph-msg-0084', 'homeowner0084@example.com', 'Re: ' || req_no, 'dup');
  if r.matched_by <> 'already_received' then raise exception '0084 proof: a duplicate Graph id was not recognised'; end if;
  select count(*) into n from maintenance_messages where maintenance_message_external_id = 'graph-msg-0084';
  if n <> 1 then raise exception '0084 proof: duplicate inbound mail produced % rows', n; end if;

  -- The token is parked for the worker, and only there: the assignment holds the hash.
  if not exists (select 1 from maintenance_message_secrets sec join maintenance_messages m using (maintenance_message_id)
                  where m.maintenance_assignment_id = aid and sec.maintenance_message_secret_token = tok) then
    raise exception '0084 proof: the offer''s token was not parked for the worker';
  end if;
  -- The worker's claim sees the queued mail and only the queued mail, the offer with its token.
  select count(*), count(*) filter (where c.accept_link_token = tok) into n, made
    from claim_maintenance_messages(50) c where c.maintenance_request_id = req;
  if n <> 2 then raise exception '0084 proof: the worker claimed % of the request''s 2 queued emails', n; end if;
  if made <> 1 then raise exception '0084 proof: the claim did not carry the offer''s token'; end if;
  -- Marked sent, the secret is gone; the hash-only assignment still verifies nothing (spent).
  perform complete_maintenance_message(m.maintenance_message_id, true, 'graph-out-0084')
     from maintenance_messages m where m.maintenance_assignment_id = aid and m.maintenance_message_direction = 'out';
  if exists (select 1 from maintenance_message_secrets sec join maintenance_messages m using (maintenance_message_id) where m.maintenance_assignment_id = aid) then
    raise exception '0084 proof: the token survived the send';
  end if;

  -- Left as found.
  delete from maintenance_requests where maintenance_request_id = req;
  delete from record_parties where job_id = probe_job;
  delete from maintenance_categories where maintenance_category_id = 'probe_plumbing_0084';
  delete from notifications where job_id = probe_job;
  delete from contacts where contact_id = homeowner;
  delete from companies where company_id = plumber_co;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from activity_audit where activity_audit_job_id = probe_job or activity_audit_project_id = probe_project
     or (activity_audit_table in ('contacts', 'contact_methods') and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'contact_id' = homeowner::text)
     or (activity_audit_table in ('companies', 'contact_methods') and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'company_id' = plumber_co::text)
     or (activity_audit_table = 'maintenance_categories' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'maintenance_category_id' = 'probe_plumbing_0084')
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_id' = probe_address::text);
  perform setval(seq, seq_last, seq_called);
end $$;
