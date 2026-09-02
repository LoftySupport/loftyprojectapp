-- =============================================================================
-- 0082 — parties: contacts, companies, classifications, employment, roles on records
-- =============================================================================
-- Amber, 1–2 September: *"a list of contacts that are classified as clients, companies
-- and/or contractors noting a client might be a contractor and a company… a list of
-- contacts that shows the company as part of that contact even though the company will be
-- a separate table… multiple contractors per company and sub contractors so job role will
-- need to be recorded and you will need to have a relationship between job id, process,
-- project id, as well as some contacts will be clients… need to be able to have email,
-- phone, address, abn number for contacts and companies… users and above with manager
-- signoff."*
--
-- THE 21 AUGUST DECISION, REVERSED
--
--   schema-plan.md, *Entity model*, closed external parties: Lofty is the developer, a
--   purchaser is one name per house, a text property is enough. That held for building.
--   It stops holding at handover — a homeowner who rings three times, a plumber who works
--   through two companies, the fencing contractor who is also the purchaser of another
--   lot, "who has Wandi Plumbing been sent to this month". Maintenance makes external
--   parties first-class, and the maintenance categories themselves come from who did what
--   on site (Amber, answer 3), which is exactly a party on a construction process run.
--
-- NORMALISED, WHICH IS WHY THERE ARE NINE TABLES AND NOT TWO
--
--   contacts                 a person                    companies      an organisation
--   contact_methods          email / phone / mobile rows, one primary per kind per party —
--                            no email or phone COLUMN anywhere, because people have several
--   contact_classifications  } multi-valued: Sam Okafor is a client on one lot and a
--   company_classifications  } contractor at Okafor Electrical, one record each
--   company_contacts         employment over time; job role lives HERE, because Bob's
--                            role at Wandi Plumbing differed from his role at Bob's Fencing
--   party_roles              purchaser, plumber, certifier… a lookup, not free text
--   record_parties           a contact and/or company, in a role, on a project, job or
--                            process run; engaged_by records a sub-contract as a fact about
--                            the engagement, not about the company
--   staff_roles              SiteBook's project roles (SS, CM, CA, CMA, SET…), Lofty people
--   record_staff_roles       who holds which of those on which project or job
--
-- SIGN-OFF, NOT A GATE
--
--   A user creates a contact or a company (a supervisor meets a new contractor on site);
--   it is usable at once and carries no approval. A manager approves it, or a manager
--   creating one approves it by existing. The guard lets only manager and above touch the
--   approval pair and stamps it from the session, so a user cannot approve their own.
--
-- FUTURE LOGINS
--
--   contact_profile_id, nullable and unique, is the whole provision for a contractor
--   portal. Nothing here is built for it, and nothing would have to be rebuilt.
-- =============================================================================

-- ---------------------------------------------------------- lookups
create table if not exists classifications (
  classification_id         text primary key
    constraint classifications_key_is_a_slug check (classification_id ~ '^[a-z][a-z0-9_]*$'),
  classification_name       text not null unique
    constraint classifications_name_is_not_blank check (length(trim(classification_name)) > 0),
  classification_applies_to text not null default 'both'
    constraint classifications_applies_to_is_known check (classification_applies_to in ('contact', 'company', 'both')),
  classification_position   smallint not null default 0,
  classification_is_active  boolean not null default true,
  classification_created_at timestamptz not null default now(),
  classification_created_by uuid references profiles (profile_id),
  classification_updated_at timestamptz not null default now(),
  classification_updated_by uuid references profiles (profile_id)
);
comment on table classifications is
  'What a contact or company IS to Lofty: client, contractor, supplier, consultant, authority… A lookup managers edit, applied many-to-one through contact_classifications and company_classifications because the same person can be two of them (0082).';

create table if not exists party_roles (
  party_role_id         text primary key
    constraint party_roles_key_is_a_slug check (party_role_id ~ '^[a-z][a-z0-9_]*$'),
  party_role_name       text not null unique
    constraint party_roles_name_is_not_blank check (length(trim(party_role_name)) > 0),
  party_role_applies_to text not null default 'both'
    constraint party_roles_applies_to_is_known check (party_role_applies_to in ('contact', 'company', 'both')),
  party_role_position   smallint not null default 0,
  party_role_is_active  boolean not null default true,
  party_role_created_at timestamptz not null default now(),
  party_role_created_by uuid references profiles (profile_id),
  party_role_updated_at timestamptz not null default now(),
  party_role_updated_by uuid references profiles (profile_id)
);
comment on table party_roles is
  'What an external party is doing ON a record: purchaser, plumber, certifier, council… A lookup, so "Plumber" is never spelled four ways (0082).';

create table if not exists staff_roles (
  staff_role_id           text primary key
    constraint staff_roles_key_is_a_slug check (staff_role_id ~ '^[a-z][a-z0-9_]*$'),
  staff_role_abbreviation text not null unique
    constraint staff_roles_abbreviation_shape check (staff_role_abbreviation ~ '^[A-Z]{1,5}$'),
  staff_role_name         text not null unique
    constraint staff_roles_name_is_not_blank check (length(trim(staff_role_name)) > 0),
  staff_role_position     smallint not null default 0,
  staff_role_is_active    boolean not null default true,
  staff_role_created_at   timestamptz not null default now(),
  staff_role_created_by   uuid references profiles (profile_id),
  staff_role_updated_at   timestamptz not null default now(),
  staff_role_updated_by   uuid references profiles (profile_id)
);
comment on table staff_roles is
  'SiteBook''s project roles, as Lofty runs them: SS Site Supervisor, CM Construction Manager, CA Contracts Administrator… A Lofty person holds one on a project through record_staff_roles (0082).';

insert into classifications (classification_id, classification_name, classification_applies_to, classification_position) values
  ('client',     'Client',     'both', 1),
  ('contractor', 'Contractor', 'both', 2),
  ('supplier',   'Supplier',   'both', 3),
  ('consultant', 'Consultant', 'both', 4),
  ('authority',  'Authority',  'company', 5),
  ('other',      'Other',      'both', 9)
on conflict (classification_id) do nothing;

insert into party_roles (party_role_id, party_role_name, party_role_applies_to, party_role_position) values
  ('purchaser',        'Purchaser',           'contact', 1),
  ('contractor',       'Contractor',          'both', 2),
  ('supplier',         'Supplier',            'both', 3),
  ('certifier',        'Certifier',           'both', 4),
  ('engineer',         'Engineer',            'both', 5),
  ('surveyor',         'Surveyor',            'both', 6),
  ('council',          'Council',             'company', 7),
  ('consultant',       'Consultant',          'both', 8),
  ('real_estate_agent','Real estate agent',   'both', 9),
  ('other',            'Other',               'both', 99)
on conflict (party_role_id) do nothing;

-- The eleven SiteBook project roles, in the order its screen lists them.
insert into staff_roles (staff_role_id, staff_role_abbreviation, staff_role_name, staff_role_position) values
  ('site_supervisor',            'SS',  'Site Supervisor',                   1),
  ('construction_manager',       'CM',  'Construction Manager',              2),
  ('contracts_administrator',    'CA',  'Contracts Administrator',           3),
  ('construction_maintenance_admin', 'CMA', 'Construction & Maintenance Admin', 4),
  ('sales_estimator',            'SET', 'Sales Estimator',                   5),
  ('accounts',                   'AC',  'Accounts',                          6),
  ('selections',                 'SEL', 'Selections',                        7),
  ('drafting',                   'DFT', 'Drafting',                          8),
  ('scheduling',                 'SCH', 'Scheduling',                        9),
  ('workflow_manager',           'WM',  'Workflow Manager',                  10),
  ('sales_administrator',        'SA',  'Sales Administrator',               11)
on conflict (staff_role_id) do nothing;

-- ---------------------------------------------------------- companies
create table if not exists companies (
  company_id           uuid primary key default gen_random_uuid(),
  company_name         text not null
    constraint companies_name_is_not_blank check (length(trim(company_name)) > 0),
  company_trading_name text,
  -- Eleven digits, digits only; the app may show it spaced. Unique where present.
  company_abn          text
    constraint companies_abn_is_eleven_digits check (company_abn is null or company_abn ~ '^[0-9]{11}$'),
  company_address_id   uuid references addresses (address_id),
  company_notes        text,
  company_source       text not null default 'app'
    constraint companies_source_is_known check (company_source in ('app', 'import', 'email', 'form', 'api', 'sitebook')),
  company_is_active    boolean not null default true,
  company_approved_at  timestamptz,
  company_approved_by  uuid references profiles (profile_id),
  company_created_at   timestamptz not null default now(),
  company_created_by   uuid references profiles (profile_id),
  company_updated_at   timestamptz not null default now(),
  company_updated_by   uuid references profiles (profile_id),
  constraint companies_approval_is_a_pair check ((company_approved_at is null) = (company_approved_by is null))
);
create unique index if not exists companies_name_key on companies (lower(trim(company_name)));
create unique index if not exists companies_abn_key on companies (company_abn) where company_abn is not null;
create index if not exists companies_address_idx on companies (company_address_id) where company_address_id is not null;
comment on table companies is
  'An organisation Lofty deals with — a contractor, a supplier, a council, a client company. One row however many people work there; the people are contacts joined through company_contacts. Classified through company_classifications; reached through contact_methods; approved by a manager after a user creates it (0082).';

-- ---------------------------------------------------------- contacts
create table if not exists contacts (
  contact_id             uuid primary key default gen_random_uuid(),
  contact_first_name     text not null
    constraint contacts_first_name_is_not_blank check (length(trim(contact_first_name)) > 0),
  contact_last_name      text,
  contact_full_name      text generated always as
    (trim(contact_first_name || coalesce(' ' || contact_last_name, ''))) stored,
  contact_preferred_name text,
  contact_address_id     uuid references addresses (address_id),
  contact_notes          text,
  -- The whole provision for a contractor portal: the login this person will sign in with.
  contact_profile_id     uuid unique references profiles (profile_id),
  contact_source         text not null default 'app'
    constraint contacts_source_is_known check (contact_source in ('app', 'import', 'email', 'form', 'api', 'sitebook')),
  contact_is_active      boolean not null default true,
  contact_approved_at    timestamptz,
  contact_approved_by    uuid references profiles (profile_id),
  contact_created_at     timestamptz not null default now(),
  contact_created_by     uuid references profiles (profile_id),
  contact_updated_at     timestamptz not null default now(),
  contact_updated_by     uuid references profiles (profile_id),
  constraint contacts_approval_is_a_pair check ((contact_approved_at is null) = (contact_approved_by is null))
);
create index if not exists contacts_full_name_trgm on contacts using gin (contact_full_name extensions.gin_trgm_ops);
create index if not exists contacts_address_idx on contacts (contact_address_id) where contact_address_id is not null;
comment on table contacts is
  'A person outside Lofty — a purchaser, a tradesperson, a council officer. Names only: emails and phones are rows in contact_methods, classifications rows in contact_classifications, employment rows in company_contacts, and what they are doing on a record rows in record_parties. contact_profile_id is the future login (0082).';

-- ---------------------------------------------------------- contact methods
create table if not exists contact_methods (
  contact_method_id          uuid primary key default gen_random_uuid(),
  contact_id                 uuid references contacts (contact_id) on delete cascade,
  company_id                 uuid references companies (company_id) on delete cascade,
  contact_method_kind        text not null
    constraint contact_methods_kind_is_known check (contact_method_kind in ('email', 'phone', 'mobile', 'other')),
  contact_method_value       text not null
    constraint contact_methods_value_is_not_blank check (length(trim(contact_method_value)) > 0),
  contact_method_label       text,
  contact_method_is_primary  boolean not null default false,
  contact_method_is_verified boolean not null default false,
  contact_method_created_at  timestamptz not null default now(),
  contact_method_created_by  uuid references profiles (profile_id),
  contact_method_updated_at  timestamptz not null default now(),
  contact_method_updated_by  uuid references profiles (profile_id),
  constraint contact_methods_one_party check (num_nonnulls(contact_id, company_id) = 1),
  constraint contact_methods_email_has_an_at
    check (contact_method_kind <> 'email' or contact_method_value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);
create index if not exists contact_methods_contact_idx on contact_methods (contact_id) where contact_id is not null;
create index if not exists contact_methods_company_idx on contact_methods (company_id) where company_id is not null;
-- One primary per kind per party — the address a notification goes to has to be definite.
create unique index if not exists contact_methods_one_primary_per_contact_kind
  on contact_methods (contact_id, contact_method_kind) where contact_method_is_primary and contact_id is not null;
create unique index if not exists contact_methods_one_primary_per_company_kind
  on contact_methods (company_id, contact_method_kind) where contact_method_is_primary and company_id is not null;
create index if not exists contact_methods_value_idx on contact_methods (lower(contact_method_value));
comment on table contact_methods is
  'How to reach a contact or a company: email, phone, mobile, other — as rows, because people have several, with one primary per kind so a notification has one definite address. Exclusive arc: a method belongs to a contact or a company, never both (0082).';

-- ---------------------------------------------------------- classifications, applied
create table if not exists contact_classifications (
  contact_id        uuid not null references contacts (contact_id) on delete cascade,
  classification_id text not null references classifications (classification_id) on update cascade,
  contact_classification_created_at timestamptz not null default now(),
  contact_classification_created_by uuid references profiles (profile_id),
  primary key (contact_id, classification_id)
);
create index if not exists contact_classifications_classification_idx on contact_classifications (classification_id);
comment on table contact_classifications is 'Which classifications a contact carries — several at once, because a client can also be a contractor (0082).';

create table if not exists company_classifications (
  company_id        uuid not null references companies (company_id) on delete cascade,
  classification_id text not null references classifications (classification_id) on update cascade,
  company_classification_created_at timestamptz not null default now(),
  company_classification_created_by uuid references profiles (profile_id),
  primary key (company_id, classification_id)
);
create index if not exists company_classifications_classification_idx on company_classifications (classification_id);
comment on table company_classifications is 'Which classifications a company carries — a plumbing company can be a contractor and a supplier (0082).';

-- ---------------------------------------------------------- employment
create table if not exists company_contacts (
  company_contact_id         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references companies (company_id),
  contact_id                 uuid not null references contacts (contact_id),
  company_contact_job_role   text,
  company_contact_is_primary boolean not null default false,
  company_contact_started_on date,
  company_contact_ended_on   date,
  company_contact_created_at timestamptz not null default now(),
  company_contact_created_by uuid references profiles (profile_id),
  company_contact_updated_at timestamptz not null default now(),
  company_contact_updated_by uuid references profiles (profile_id),
  constraint company_contacts_ends_after_start
    check (company_contact_ended_on is null or company_contact_started_on is null or company_contact_ended_on >= company_contact_started_on)
);
create unique index if not exists company_contacts_one_current_per_pair
  on company_contacts (company_id, contact_id) where company_contact_ended_on is null;
create index if not exists company_contacts_contact_idx on company_contacts (contact_id);
create index if not exists company_contacts_company_idx on company_contacts (company_id);
comment on table company_contacts is
  'A person at a company, over time, with the job role they hold THERE — Bob Marsh is a fencer at Bob''s Fencing and was a labourer at Wandi Plumbing. Ending a row keeps the history; one current row per pair (0082).';

-- ---------------------------------------------------------- parties on records
create table if not exists record_parties (
  record_party_id                    uuid primary key default gen_random_uuid(),
  project_id                         integer references projects (project_id) on update cascade on delete cascade,
  job_id                             text references jobs (job_id) on update cascade on delete cascade,
  process_run_id                     uuid references process_runs (process_run_id) on delete cascade,
  contact_id                         uuid references contacts (contact_id),
  company_id                         uuid references companies (company_id),
  party_role_id                      text not null references party_roles (party_role_id) on update cascade,
  -- Who brought them onto this record: a sub-contract is a fact about the engagement.
  record_party_engaged_by_company_id uuid references companies (company_id),
  record_party_is_primary            boolean not null default false,
  record_party_started_on            date not null default current_date,
  record_party_ended_on              date,
  record_party_note                  text,
  record_party_created_at            timestamptz not null default now(),
  record_party_created_by            uuid references profiles (profile_id),
  record_party_updated_at            timestamptz not null default now(),
  record_party_updated_by            uuid references profiles (profile_id),
  constraint record_parties_one_record check (num_nonnulls(project_id, job_id, process_run_id) = 1),
  constraint record_parties_names_somebody check (num_nonnulls(contact_id, company_id) >= 1),
  constraint record_parties_ends_after_start
    check (record_party_ended_on is null or record_party_ended_on >= record_party_started_on)
);
-- The same party in the same role on the same record, once, while current.
create unique index if not exists record_parties_one_current
  on record_parties (coalesce(project_id::text, ''), coalesce(job_id, ''), coalesce(process_run_id::text, ''),
                     party_role_id, coalesce(contact_id::text, ''), coalesce(company_id::text, ''))
  where record_party_ended_on is null;
create index if not exists record_parties_project_idx on record_parties (project_id) where project_id is not null;
create index if not exists record_parties_job_idx on record_parties (job_id) where job_id is not null;
create index if not exists record_parties_run_idx on record_parties (process_run_id) where process_run_id is not null;
create index if not exists record_parties_contact_idx on record_parties (contact_id) where contact_id is not null;
create index if not exists record_parties_company_idx on record_parties (company_id) where company_id is not null;
create index if not exists record_parties_engaged_by_idx on record_parties (record_party_engaged_by_company_id) where record_party_engaged_by_company_id is not null;
comment on table record_parties is
  'Who, from outside Lofty, is on a project, a job or a process run, and as what: Priya Nair, purchaser, 1042-01; Okafor Electrical, electrician, the 2nd Fix run. A contact and/or a company; engaged_by names the sub-contract. Ending a row keeps the history and is how a party is removed — the FKs from here refuse a contact or company delete (0082).';

-- ---------------------------------------------------------- staff roles on records
create table if not exists record_staff_roles (
  record_staff_role_id         uuid primary key default gen_random_uuid(),
  project_id                   integer references projects (project_id) on update cascade on delete cascade,
  job_id                       text references jobs (job_id) on update cascade on delete cascade,
  staff_role_id                text not null references staff_roles (staff_role_id) on update cascade,
  profile_id                   uuid not null references profiles (profile_id),
  record_staff_role_started_on date not null default current_date,
  record_staff_role_ended_on   date,
  record_staff_role_created_at timestamptz not null default now(),
  record_staff_role_created_by uuid references profiles (profile_id),
  record_staff_role_updated_at timestamptz not null default now(),
  record_staff_role_updated_by uuid references profiles (profile_id),
  constraint record_staff_roles_one_record check (num_nonnulls(project_id, job_id) = 1),
  constraint record_staff_roles_ends_after_start
    check (record_staff_role_ended_on is null or record_staff_role_ended_on >= record_staff_role_started_on)
);
create unique index if not exists record_staff_roles_one_current
  on record_staff_roles (coalesce(project_id::text, ''), coalesce(job_id, ''), staff_role_id, profile_id)
  where record_staff_role_ended_on is null;
create index if not exists record_staff_roles_project_idx on record_staff_roles (project_id) where project_id is not null;
create index if not exists record_staff_roles_job_idx on record_staff_roles (job_id) where job_id is not null;
create index if not exists record_staff_roles_profile_idx on record_staff_roles (profile_id);
comment on table record_staff_roles is
  'Which Lofty person holds which SiteBook project role on which project or job — SS Atelio Storti on 1507. Ending a row keeps the history (0082).';

-- ---------------------------------------------------------- stamps, touch, audit
do $$
declare t record;
begin
  for t in
    select * from (values
      ('classifications',        'classification'),
      ('party_roles',            'party_role'),
      ('staff_roles',            'staff_role'),
      ('companies',              'company'),
      ('contacts',               'contact'),
      ('contact_methods',        'contact_method'),
      ('company_contacts',       'company_contact'),
      ('record_parties',         'record_party'),
      ('record_staff_roles',     'record_staff_role')
    ) as v(tbl, pfx)
  loop
    execute format('drop trigger if exists %I_touch on %I', t.tbl, t.tbl);
    execute format('create trigger %I_touch before update on %I for each row execute function extensions.moddatetime(%I)',
                   t.tbl || '_touch', t.tbl, t.pfx || '_updated_at');
    execute format('drop trigger if exists %I on %I', t.tbl || '_stamp_created_by', t.tbl);
    execute format('create trigger %I before insert on %I for each row execute function stamp_created_by(%L)',
                   t.tbl || '_stamp_created_by', t.tbl, t.pfx || '_created_by');
    execute format('drop trigger if exists trg_activity_audit_row on %I', t.tbl);
    execute format('create trigger trg_activity_audit_row after insert or update or delete on %I for each row execute function log_activity_audit()', t.tbl);
    execute format('alter table %I enable row level security', t.tbl);
  end loop;
  for t in select * from (values ('contact_classifications', 'contact_classification'), ('company_classifications', 'company_classification')) as v(tbl, pfx)
  loop
    execute format('drop trigger if exists %I on %I', t.tbl || '_stamp_created_by', t.tbl);
    execute format('create trigger %I before insert on %I for each row execute function stamp_created_by(%L)',
                   t.tbl || '_stamp_created_by', t.tbl, t.pfx || '_created_by');
    execute format('drop trigger if exists trg_activity_audit_row on %I', t.tbl);
    execute format('create trigger trg_activity_audit_row after insert or update or delete on %I for each row execute function log_activity_audit()', t.tbl);
    execute format('alter table %I enable row level security', t.tbl);
  end loop;
end $$;

-- ---------------------------------------------------------- sign-off
-- Only manager and above may set or clear the approval pair, and it is stamped from the
-- session rather than typed. A manager creating a record approves it by existing; a user's
-- record waits. auth.uid() null (a migration, a seed) passes through untouched.
create or replace function guard_party_approval() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := current_profile_id();
  lvl permission_level := current_permission();
  new_at timestamptz; old_at timestamptz;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'contacts' then
    new_at := new.contact_approved_at; old_at := case when tg_op = 'UPDATE' then old.contact_approved_at end;
  else
    new_at := new.company_approved_at; old_at := case when tg_op = 'UPDATE' then old.company_approved_at end;
  end if;

  if tg_op = 'INSERT' then
    if lvl >= 'manager' then
      new_at := now();
    else
      new_at := null;
    end if;
  elsif new_at is distinct from old_at and lvl < 'manager' then
    raise exception 'sign-off is a manager''s: a contact or company is approved by a manager or above'
      using errcode = '42501';
  elsif new_at is not null and old_at is null then
    new_at := now();
  end if;

  if tg_table_name = 'contacts' then
    new.contact_approved_at := new_at;
    new.contact_approved_by := case when new_at is null then null else coalesce(me, new.contact_approved_by) end;
  else
    new.company_approved_at := new_at;
    new.company_approved_by := case when new_at is null then null else coalesce(me, new.company_approved_by) end;
  end if;
  return new;
end $$;

revoke execute on function guard_party_approval() from public, anon, authenticated;

drop trigger if exists contacts_guard_approval on contacts;
create trigger contacts_guard_approval before insert or update on contacts
  for each row execute function guard_party_approval();
drop trigger if exists companies_guard_approval on companies;
create trigger companies_guard_approval before insert or update on companies
  for each row execute function guard_party_approval();

-- A party role on a contact-only party must apply to contacts, and so on. Cheap to check,
-- and the alternative is a purchaser company.
create or replace function guard_record_party_role() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare applies text;
begin
  select party_role_applies_to into applies from party_roles where party_role_id = new.party_role_id;
  if applies = 'contact' and new.contact_id is null then
    raise exception 'the role % is held by a person, not a company', new.party_role_id using errcode = '23514';
  elsif applies = 'company' and new.company_id is null then
    raise exception 'the role % is held by a company, not a person', new.party_role_id using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function guard_record_party_role() from public, anon, authenticated;
drop trigger if exists record_parties_guard_role on record_parties;
create trigger record_parties_guard_role before insert or update on record_parties
  for each row execute function guard_record_party_role();

-- ---------------------------------------------------------- the display views
-- The Contacts list as Amber described it: the person with their company beside them,
-- read from the current employment — a view, never a copy.
drop view if exists contact_display;
create view contact_display with (security_invoker = true) as
  select c.contact_id, c.contact_first_name, c.contact_last_name, c.contact_full_name, c.contact_preferred_name,
         c.contact_address_id, c.contact_notes, c.contact_profile_id, c.contact_source, c.contact_is_active,
         c.contact_approved_at, c.contact_approved_by, c.contact_created_at, c.contact_updated_at,
         (select m.contact_method_value from contact_methods m
           where m.contact_id = c.contact_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc, m.contact_method_created_at limit 1) as contact_primary_email,
         (select m.contact_method_value from contact_methods m
           where m.contact_id = c.contact_id and m.contact_method_kind in ('mobile', 'phone')
           order by m.contact_method_is_primary desc, (m.contact_method_kind = 'mobile') desc, m.contact_method_created_at limit 1) as contact_primary_phone,
         cc.company_id                 as contact_company_id,
         co.company_name               as contact_company_name,
         cc.company_contact_job_role   as contact_job_role,
         coalesce((select array_agg(k.classification_id order by cl.classification_position)
                     from contact_classifications k join classifications cl using (classification_id)
                    where k.contact_id = c.contact_id), '{}'::text[]) as contact_classification_ids,
         (select count(*) from record_parties rp where rp.contact_id = c.contact_id and rp.record_party_ended_on is null)::integer as contact_open_parties,
         a.address_consolidated        as contact_address
    from contacts c
    left join lateral (
      select x.company_id, x.company_contact_job_role from company_contacts x
       where x.contact_id = c.contact_id and x.company_contact_ended_on is null
       order by x.company_contact_is_primary desc, x.company_contact_started_on desc nulls last, x.company_contact_created_at limit 1
    ) cc on true
    left join companies co on co.company_id = cc.company_id
    left join addresses a on a.address_id = c.contact_address_id;

comment on view contact_display is
  'A contact as the Contacts list reads them (0082): the person, their primary email and phone, their current company and job role there, their classifications, how many records they are currently on. Derived from the normalised tables, never stored.';

drop view if exists company_display;
create view company_display with (security_invoker = true) as
  select co.company_id, co.company_name, co.company_trading_name, co.company_abn, co.company_address_id, co.company_notes,
         co.company_source, co.company_is_active, co.company_approved_at, co.company_approved_by, co.company_created_at, co.company_updated_at,
         (select m.contact_method_value from contact_methods m
           where m.company_id = co.company_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc, m.contact_method_created_at limit 1) as company_primary_email,
         (select m.contact_method_value from contact_methods m
           where m.company_id = co.company_id and m.contact_method_kind in ('phone', 'mobile')
           order by m.contact_method_is_primary desc, m.contact_method_created_at limit 1) as company_primary_phone,
         coalesce((select array_agg(k.classification_id order by cl.classification_position)
                     from company_classifications k join classifications cl using (classification_id)
                    where k.company_id = co.company_id), '{}'::text[]) as company_classification_ids,
         (select count(*) from company_contacts x where x.company_id = co.company_id and x.company_contact_ended_on is null)::integer as company_people_count,
         (select count(*) from record_parties rp where (rp.company_id = co.company_id or rp.record_party_engaged_by_company_id = co.company_id) and rp.record_party_ended_on is null)::integer as company_open_parties,
         a.address_consolidated as company_address
    from companies co
    left join addresses a on a.address_id = co.company_address_id;

comment on view company_display is
  'A company as the Contacts list reads it (0082): name, ABN, primary email and phone, classifications, how many people currently work there and how many records it is on.';

drop view if exists record_party_display;
create view record_party_display with (security_invoker = true) as
  select rp.record_party_id, rp.project_id, rp.job_id, rp.process_run_id,
         coalesce(rp.job_id, pr.job_id) as record_job_id,
         coalesce(rp.project_id, j.project_id, pr.project_id) as record_project_id,
         rp.contact_id, c.contact_full_name, rp.company_id, co.company_name,
         rp.party_role_id, r.party_role_name,
         rp.record_party_engaged_by_company_id, eb.company_name as record_party_engaged_by_company_name,
         rp.record_party_is_primary, rp.record_party_started_on, rp.record_party_ended_on, rp.record_party_note,
         rp.record_party_created_at, rp.record_party_created_by,
         p.process_name,
         (select m.contact_method_value from contact_methods m where m.contact_id = rp.contact_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc limit 1) as contact_email,
         (select m.contact_method_value from contact_methods m where m.contact_id = rp.contact_id and m.contact_method_kind in ('mobile', 'phone')
           order by m.contact_method_is_primary desc, (m.contact_method_kind = 'mobile') desc limit 1) as contact_phone
    from record_parties rp
    left join contacts c on c.contact_id = rp.contact_id
    left join companies co on co.company_id = rp.company_id
    left join companies eb on eb.company_id = rp.record_party_engaged_by_company_id
    join party_roles r on r.party_role_id = rp.party_role_id
    left join process_runs pr on pr.process_run_id = rp.process_run_id
    left join processes p on p.process_id = pr.process_id
    left join jobs j on j.job_id = coalesce(rp.job_id, pr.job_id);

comment on view record_party_display is
  'A party on a record with its names resolved (0082): who, which company, which role, engaged by whom, and — for a party on a process run — which process and which job that run is on, so a job''s drawer lists the trades on its runs too.';

-- ---------------------------------------------------------- who may do what
-- Read: every active user. A phone number the site supervisor cannot see is a phone
-- number written on a hand. Create and edit: user and above (Amber, answer 5), with the
-- approval pair guarded above. Delete: admin for people and companies (and the FKs from
-- record_parties refuse it while history exists — end the party instead); user for the
-- rows that ARE the editing (methods, classifications, employment, parties). Lookups:
-- managers.
do $$
declare t text;
begin
  foreach t in array array['classifications', 'party_roles', 'staff_roles'] loop
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "managers write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using ((select is_active_user()))', t);
    execute format('create policy "managers write %1$s" on %1$I for all to authenticated
                      using ((select current_permission()) >= ''manager'') with check ((select current_permission()) >= ''manager'')', t);
  end loop;

  foreach t in array array['companies', 'contacts'] loop
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "users create %1$s" on %1$I', t);
    execute format('drop policy if exists "users update %1$s" on %1$I', t);
    execute format('drop policy if exists "admins delete %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using ((select is_active_user()))', t);
    execute format('create policy "users create %1$s" on %1$I for insert to authenticated with check ((select current_permission()) >= ''user'')', t);
    execute format('create policy "users update %1$s" on %1$I for update to authenticated
                      using ((select current_permission()) >= ''user'') with check ((select current_permission()) >= ''user'')', t);
    execute format('create policy "admins delete %1$s" on %1$I for delete to authenticated using ((select current_permission()) >= ''admin'')', t);
  end loop;

  foreach t in array array['contact_methods', 'contact_classifications', 'company_classifications', 'company_contacts', 'record_parties'] loop
    execute format('drop policy if exists "read %1$s" on %1$I', t);
    execute format('drop policy if exists "users write %1$s" on %1$I', t);
    execute format('create policy "read %1$s" on %1$I for select to authenticated using ((select is_active_user()))', t);
    execute format('create policy "users write %1$s" on %1$I for all to authenticated
                      using ((select current_permission()) >= ''user'') with check ((select current_permission()) >= ''user'')', t);
  end loop;

  -- Who holds a project role is an organisational fact: managers.
  drop policy if exists "read record_staff_roles" on record_staff_roles;
  drop policy if exists "managers write record_staff_roles" on record_staff_roles;
  create policy "read record_staff_roles" on record_staff_roles for select to authenticated using ((select is_active_user()));
  create policy "managers write record_staff_roles" on record_staff_roles for all to authenticated
    using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');
end $$;

-- ---------------------------------------------------------------------- proof
do $$
declare
  probe_co uuid; probe_co2 uuid; probe_ct uuid; probe_address uuid; probe_project integer; probe_job text;
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
  n integer; shown text;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0082', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design') returning job_id into probe_job;

  insert into companies (company_name, company_abn) values ('Probe Plumbing 0082', '51824753556') returning company_id into probe_co;
  insert into companies (company_name) values ('Probe Builders 0082') returning company_id into probe_co2;
  insert into contacts (contact_first_name, contact_last_name) values ('Probe', 'Person 0082') returning contact_id into probe_ct;
  insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary)
  values (probe_ct, 'email', 'probe0082@example.com', true), (probe_ct, 'mobile', '0400 000 000', true);
  insert into company_contacts (company_id, contact_id, company_contact_job_role) values (probe_co, probe_ct, 'Plumber');
  insert into contact_classifications (contact_id, classification_id) values (probe_ct, 'client'), (probe_ct, 'contractor');

  select contact_company_name || ' · ' || contact_job_role || ' · ' || contact_primary_email || ' · ' || array_to_string(contact_classification_ids, ',')
    into shown from contact_display where contact_id = probe_ct;
  if shown <> 'Probe Plumbing 0082 · Plumber · probe0082@example.com · client,contractor' then
    raise exception '0082 proof: contact_display read "%"', shown;
  end if;

  -- Two primary emails on one person is refused; a malformed ABN and an email without an @ too.
  begin
    insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary)
    values (probe_ct, 'email', 'second@example.com', true);
    raise exception '0082 proof: a second primary email was accepted';
  exception when unique_violation then null; end;
  begin
    insert into companies (company_name, company_abn) values ('Bad ABN 0082', '1234');
    raise exception '0082 proof: a four-digit ABN was accepted';
  exception when check_violation then null; end;
  begin
    insert into contact_methods (contact_id, contact_method_kind, contact_method_value) values (probe_ct, 'email', 'not-an-email');
    raise exception '0082 proof: an email without an @ was accepted';
  exception when check_violation then null; end;

  -- A party on the job, engaged by another company; the same party in the same role twice is refused;
  -- a purchaser must be a person; deleting a company that is a party is refused.
  insert into record_parties (job_id, contact_id, company_id, party_role_id, record_party_engaged_by_company_id)
  values (probe_job, probe_ct, probe_co, 'contractor', probe_co2);
  begin
    insert into record_parties (job_id, contact_id, company_id, party_role_id) values (probe_job, probe_ct, probe_co, 'contractor');
    raise exception '0082 proof: the same party in the same role twice was accepted';
  exception when unique_violation then null; end;
  begin
    insert into record_parties (job_id, company_id, party_role_id) values (probe_job, probe_co, 'purchaser');
    raise exception '0082 proof: a company purchaser was accepted';
  exception when check_violation then null; end;
  begin
    delete from companies where company_id = probe_co;
    raise exception '0082 proof: a company with a party on a job was deleted';
  exception when foreign_key_violation then null; end;
  select count(*) into n from record_party_display where record_job_id = probe_job and record_party_engaged_by_company_name = 'Probe Builders 0082';
  if n <> 1 then raise exception '0082 proof: record_party_display did not resolve the engagement'; end if;

  -- A staff role on the project.
  insert into record_staff_roles (project_id, staff_role_id, profile_id)
  select probe_project, 'site_supervisor', profile_id from profiles limit 1;

  -- Left as found.
  delete from record_staff_roles where project_id = probe_project;
  delete from record_parties where job_id = probe_job;
  delete from company_contacts where contact_id = probe_ct;
  delete from contacts where contact_id = probe_ct;
  delete from companies where company_id in (probe_co, probe_co2);
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from activity_audit where activity_audit_project_id = probe_project
     or (activity_audit_table in ('companies', 'contacts', 'contact_methods', 'company_contacts', 'contact_classifications', 'addresses')
         and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'contact_id' = probe_ct::text)
     or (activity_audit_table in ('companies', 'contact_methods', 'company_contacts', 'company_classifications')
         and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'company_id' in (probe_co::text, probe_co2::text))
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_id' = probe_address::text);
  perform setval(seq, seq_last, seq_called);
end $$;
