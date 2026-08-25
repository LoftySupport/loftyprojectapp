-- =============================================================================
-- 0044 — dictionary edits survive a refresh
-- =============================================================================
-- The data dictionary's source of truth is `dictionary.ts` in the repo — deliberately,
-- because an entry is written alongside the migration that creates its column, and
-- `data-dictionary.md` is generated from it. That does not change here.
--
-- What changes: the page has let a manager retitle a property and rewrite its
-- definition since it was built, and held the edit in page state with a note admitting
-- a refresh would lose it. This is the table those edits land in.
--
-- OVERRIDES, NOT A COPY
--
--   One row per entry somebody has edited, keyed by the entry's id ("jobs.job_stage"),
--   holding ONLY the fields the page can edit — friendly name, definition, status.
--   A null column means "the repo's wording stands". The app merges on read, so the
--   dictionary is still the code's schema truth wearing Lofty's words on top, and
--   sweeping an override back into dictionary.ts (then deleting the row) is the
--   maintenance path, not a migration.
--
-- WHO EDITS WHAT
--
--   The page's ladder, now enforced rather than displayed: manager retitles and
--   redefines (the two fields about the business rather than the database); admin sets
--   status; superadmin archives. RLS admits manager and above; a guard trigger holds
--   the two status rungs, because policies cannot see which column changed.
-- =============================================================================

create table if not exists dictionary_overrides (
  -- "table.column", exactly as dictionary.ts spells it. Free text rather than a FK —
  -- the entries live in code, and a CHECK that duplicated the list would go stale on
  -- every migration.
  dictionary_override_id            text primary key
    constraint dictionary_overrides_id_is_table_dot_column
    check (dictionary_override_id ~ '^[a-z_]+\.[a-z_0-9]+$'),
  dictionary_override_friendly_name text,
  dictionary_override_definition    text,
  dictionary_override_status        text
    constraint dictionary_overrides_status_is_known
    check (dictionary_override_status is null or dictionary_override_status in
           ('to_do', 'created', 'updates_required', 'merged', 'archived')),

  dictionary_override_created_at timestamptz not null default now(),
  dictionary_override_created_by uuid references profiles (profile_id),
  dictionary_override_updated_at timestamptz not null default now(),
  dictionary_override_updated_by uuid references profiles (profile_id),

  -- A row of nothing overrides nothing and would read as an edit in the audit log.
  constraint dictionary_overrides_say_something
    check (num_nonnulls(dictionary_override_friendly_name,
                        dictionary_override_definition,
                        dictionary_override_status) > 0)
);

comment on table dictionary_overrides is
  'Lofty''s words on top of the repo''s dictionary. One row per entry somebody edited, keyed "table.column"; null fields mean the repo''s wording stands. dictionary.ts stays the schema''s source of truth — sweeping an override back into it and deleting the row is maintenance, not a migration. Manager+ writes wording; the guard trigger holds status at admin and archiving at superadmin.';

create trigger dictionary_overrides_touch before update on dictionary_overrides
  for each row execute function extensions.moddatetime(dictionary_override_updated_at);
create trigger dictionary_overrides_stamp_created_by before insert on dictionary_overrides
  for each row execute function stamp_created_by('dictionary_override_created_by');
create trigger trg_activity_audit_row after insert or update or delete on dictionary_overrides
  for each row execute function log_activity_audit();

-- --------------------------------------------------- the two status rungs
create or replace function guard_dictionary_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_status text;
begin
  if auth.uid() is null then
    return new;
  end if;

  old_status := case when tg_op = 'UPDATE' then old.dictionary_override_status end;

  if new.dictionary_override_status is distinct from old_status then
    if new.dictionary_override_status = 'archived'
       and current_permission() < 'superadmin'::permission_level then
      raise exception 'Archiving a dictionary entry needs superadmin permission.'
        using errcode = '42501';
    end if;
    if current_permission() < 'admin'::permission_level then
      raise exception 'Setting a dictionary entry''s status needs admin permission or above.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function guard_dictionary_status() from public;
revoke execute on function guard_dictionary_status() from anon;
revoke execute on function guard_dictionary_status() from authenticated;

drop trigger if exists dictionary_overrides_guard_status on dictionary_overrides;
create trigger dictionary_overrides_guard_status
  before insert or update on dictionary_overrides
  for each row execute function guard_dictionary_status();

-- ------------------------------------------------------------------------- RLS
alter table dictionary_overrides enable row level security;

create policy "read dictionary overrides" on dictionary_overrides
  for select to authenticated
  using ((select is_active_user()));

-- Manager and above — retitling a field is a business call, not an admin one. The
-- status rungs above are the trigger's.
create policy "managers write dictionary overrides" on dictionary_overrides
  for all to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');
