-- 0094 — a report template is a question, not an answer
--
-- The table behind Tools → Template Builder. One row is one report layout: an ordered
-- list of blocks, the page setup, and which theme it prints in.
--
-- WHY ONE JSONB COLUMN AND NOT A BLOCKS TABLE
--
--   Because a block holds a REFERENCE, never a copy. "The jobs table grouped by stage"
--   is what is stored; the jobs themselves are read out of the app every time the
--   template is opened or exported. That is the whole point of a template — one built in
--   September and used in March shows March's jobs — and it is why this column stays
--   small no matter how much data the report renders.
--
--   A `report_template_blocks` table would buy nothing for that. Nothing joins to a
--   block, nothing filters by one, and the builder rewrites the whole list on every
--   autosave, so a child table would be a delete-and-reinsert on every keystroke's worth
--   of debounce. It would also make adding a block type a migration, which is exactly the
--   coupling the app has spent 0077 and 0078 removing elsewhere.
--
--   The cost is real and worth naming: Postgres cannot check what is inside the layout.
--   The one thing it CAN check is that the shape is the shape the builder expects, so it
--   does — see the constraint below — and everything past that is the app's to validate.
--
-- WHAT IS NOT HERE, DELIBERATELY
--
--   * No `scope_id`. The module's own schema scopes a report to a workspace or a
--     customer; at Lofty a template is a company-wide thing, the way a process
--     definition is. A template that belonged to one project would have to be copied to
--     be used on the next one, which is the opposite of a template.
--
--   * No `share_token` and no `password_hash`. Public share links are the half of that
--     module with real security consequences — an anonymous read path around RLS — and
--     nothing has asked for them. Adding them later is a migration and an edge function,
--     not a rewrite: the builder feature-detects the store's share methods and hides the
--     panel when they are absent, so today it simply is not offered.
--
-- WHO MAY DO WHAT, AND THE OPEN QUESTION IN IT
--
--   Read: any active user, like everything else.
--   Create and edit: manager and above.
--   Delete: admin and above.
--
--   The middle line is a judgement call nobody at Lofty has made yet. A template is
--   shared by the whole company, so one person's edit changes the report everybody else
--   sends — that reads as a manager act rather than a `user` one, and it sits between
--   "add or rename a team" (admin) and "move a job" (user) on the ladder the app already
--   has. If Amber wants everyone building templates, this is one word in two policies.

create table report_templates (
  report_template_id uuid primary key default gen_random_uuid(),

  report_template_name text not null
    constraint report_templates_name_is_not_blank
      check (btrim(report_template_name) <> ''),

  -- The builder's layout: { widgets: [{ id, kind, options }], page: {...}, theme: '...' }.
  --
  -- The CHECK is the shape and nothing else. `widgets` must be an array, because the
  -- builder does `layout.widgets.map(...)` the moment it opens a row and an object there
  -- is a white screen rather than an error. It does NOT check what is in the array: a
  -- block kind is registered in the app's widget adapter, not in Postgres, and a
  -- constraint listing them would need a migration every time somebody adds a block.
  report_template_layout jsonb not null default '{"widgets": []}'::jsonb
    --
    -- coalesce, and it is not decoration. `jsonb_typeof(x -> 'widgets')` on a layout
    -- with no widgets key returns SQL NULL, and `null = 'array'` is null, which a CHECK
    -- treats as passing. The first version of this constraint read `= 'array'` and was
    -- watched accepting `{"page": {...}}` in the proof block below — exactly the row
    -- that opens the builder as a blank screen. The coalesce turns the missing key into
    -- a value that fails.
    constraint report_templates_layout_has_widgets
      check (coalesce(jsonb_typeof(report_template_layout -> 'widgets'), 'missing') = 'array'),

  report_template_created_at timestamptz not null default now(),
  report_template_created_by uuid references profiles(profile_id) on delete set null,
  report_template_updated_at timestamptz not null default now(),
  report_template_updated_by uuid references profiles(profile_id) on delete set null,

  -- One name, company-wide. Two templates called "Monthly leadership summary" is a
  -- coin-toss every time somebody picks one, and the same reasoning as saved_views —
  -- except the scope is everybody, because so is the template.
  constraint report_templates_one_name unique (report_template_name)
);

comment on table report_templates is
  'A report layout built in Tools → Template Builder: an ordered list of blocks, the page setup and the theme. Blocks hold references to the app''s data, never copies of it, so a template renders current jobs whenever it is opened. Company-wide — no scope column, because a template scoped to one project would have to be copied to be used on the next.';
comment on column report_templates.report_template_layout is
  'The builder''s whole layout as jsonb: { widgets: [{ id, kind, options }], page: { pageSize, orientation }, theme }. One column because nothing joins to a block and the builder rewrites the list on every autosave. The CHECK enforces the shape (widgets is an array) and nothing about the contents — block kinds are registered in the app, not here.';

alter table report_templates enable row level security;

-- Read: the same gate as everything else. No linked, active profile, no rows.
create policy "read report_templates" on report_templates
  for select to authenticated
  using ((select is_active_user()));

-- Write: manager and above. Split from delete on purpose — see the note at the top.
create policy "managers write report_templates" on report_templates
  for insert to authenticated
  with check ((select current_permission()) >= 'manager');
create policy "managers update report_templates" on report_templates
  for update to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');

-- Delete is tighter than editing, the way it is on jobs and projects: an edit is
-- recoverable by editing back, a delete takes the layout with it.
create policy "admins delete report_templates" on report_templates
  for delete to authenticated
  using ((select current_permission()) >= 'admin');

-- moddatetime with the column as its argument — the 0028 convention, since the column
-- names carry their table's prefix.
create trigger report_templates_touch before update on report_templates
  for each row execute function extensions.moddatetime(report_template_updated_at);

create trigger report_templates_stamp_created_by before insert on report_templates
  for each row execute function stamp_created_by('report_template_created_by');

-- Every save answers "who last changed this template", which is the question a shared
-- layout raises the first time one changes under somebody. 0091 wrote the function; this
-- is the second table to take it.
create trigger report_templates_stamp_updated_by before update on report_templates
  for each row execute function stamp_updated_by('report_template_updated_by');

-- Audited like everything else. 0080 took the allowlist out of log_activity_audit() and
-- verify/behaviour.sql now asserts that every non-log table in public carries this
-- trigger, so a table created without one fails the check on the day it is created —
-- which is how this line came to be here.
create trigger trg_activity_audit_row after insert or update or delete on report_templates
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- Each rule watched biting: an insert that should be refused, refused for the right
-- reason, in a sub-block whose rollback removes the attempt. The accepted rows are
-- deleted explicitly, so the migration leaves the table exactly as created: empty.
--
-- The RLS half is proved in verify/rls.sql — as `authenticated`, because everything here
-- runs as the owner and BYPASSES the policies. Watched failing there before it was
-- watched passing: with "managers write report_templates" widened to `true`, the probe
-- reported a viewer writing a company-wide template.
do $$
declare
  made uuid;
begin
  -- A blank name is refused.
  begin
    insert into report_templates (report_template_name) values ('   ');
    raise exception 'a blank template name was accepted';
  exception
    when check_violation then null;
  end;

  -- A layout whose widgets are not an array is refused. This is the one that matters:
  -- the builder maps over it on open, so an object here is a blank screen.
  begin
    insert into report_templates (report_template_name, report_template_layout)
    values ('__proof__', '{"widgets": {}}'::jsonb);
    raise exception 'a layout with a non-array widgets key was accepted';
  exception
    when check_violation then null;
  end;

  -- A layout with no widgets key at all is refused for the same reason: jsonb_typeof of
  -- a missing key is null, which is not 'array'.
  begin
    insert into report_templates (report_template_name, report_template_layout)
    values ('__proof__', '{"page": {"pageSize": "a4"}}'::jsonb);
    raise exception 'a layout with no widgets key was accepted';
  exception
    when check_violation then null;
  end;

  -- The default is a usable empty layout, not null.
  insert into report_templates (report_template_name) values ('__proof__')
    returning report_template_id into made;
  if (select report_template_layout from report_templates where report_template_id = made)
     <> '{"widgets": []}'::jsonb then
    raise exception 'the default layout is not an empty widget list';
  end if;

  -- The same name twice is refused.
  begin
    insert into report_templates (report_template_name) values ('__proof__');
    raise exception 'a duplicate template name was accepted';
  exception
    when unique_violation then null;
  end;

  -- The touch trigger is NOT proved here, and the reason is worth writing down because
  -- the first version of this block did try and reported a pass that meant nothing.
  -- `extensions.moddatetime` writes `now()`, which is the TRANSACTION timestamp, and a
  -- DO block is one transaction — so inside it updated_at comes back exactly equal to
  -- created_at whether the trigger fired or not. Watched: the assertion failed with the
  -- trigger present and correct. It is proved in verify/behaviour.sql instead, where the
  -- update lands in a later transaction than the insert and the clock has actually moved.
  update report_templates
     set report_template_layout = '{"widgets": [{"id": "w1", "kind": "heading", "options": {}}]}'::jsonb
   where report_template_id = made;

  delete from report_templates where report_template_name = '__proof__';
end $$;
