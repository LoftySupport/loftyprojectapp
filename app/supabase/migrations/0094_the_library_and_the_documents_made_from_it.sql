-- 0094 — the library, and the documents made from it
--
-- Behind Tools → Template Builder. Amber, 4 September, set out what this has to be, and
-- it is three things rather than one:
--
--   report_templates   THE LIBRARY. A whole template, or a reusable section that gets
--                      dropped into one. Anyone may write one; a manager signs it off
--                      before anybody else can use it.
--   report_documents   WHAT SOMEBODY MADE. A copy taken from a template, about a job or
--                      a project or about nothing, and theirs to edit freely.
--
-- WHY A DOCUMENT IS NOT A TEMPLATE, AND THIS IS THE WHOLE REASON THE SECOND TABLE EXISTS
--
--   Amber: *"a user may take an existing template and modify it for a particular instance
--   eg sending a letter and they need to change the wording or add and remove section
--   blocks in the template"*.
--
--   If that edit wrote back to the template, the next person to use it would inherit one
--   letter's wording — and they would inherit it silently, because the template would
--   still be called what it was called. One row per thing sent is the only shape where
--   "change the wording for this one" and "change the wording for everyone" are
--   different acts.
--
-- WHAT IS STILL ONE JSONB COLUMN, AND WHY
--
--   Both layouts. A block holds a REFERENCE — "the jobs table grouped by stage", "the
--   Site Start properties for this job" — and never the rows, so the column stays small
--   no matter how much data the document renders. Nothing joins to a block, nothing
--   filters by one, and the builder rewrites the whole list on every autosave, so a
--   child table would be a delete-and-reinsert on every debounce. It would also make
--   adding a block type a migration, which is the coupling 0077 and 0078 spent two
--   batches removing elsewhere.
--
--   The cost is real: Postgres cannot see inside the layout. The one thing it CAN check
--   is the shape the builder needs, so it does. See the constraint, and the note on the
--   `coalesce` in it, which is not decoration.

-- ============================================================== the library

create table report_templates (
  report_template_id uuid primary key default gen_random_uuid(),

  -- A whole template, or a fragment meant to be inserted into one. Same shape, same
  -- library, same sign-off, so one table with a discriminator rather than two tables
  -- that would need every policy, trigger and constraint written twice.
  report_template_kind text not null default 'template'
    constraint report_templates_kind_is_known
      check (report_template_kind in ('template', 'section')),

  report_template_name text not null
    constraint report_templates_name_is_not_blank
      check (btrim(report_template_name) <> ''),

  -- What it is for, in the author's words. Null is a real answer — not every template
  -- needs explaining — so this is nullable rather than defaulted to ''.
  report_template_description text,

  -- WHO THE LIBRARY ENTRY IS FOR (Amber: "a global level, team level and manager (and
  -- above) level"). A visibility band, not an owner:
  --   global   — everybody active
  --   team     — the team named below, plus manager and above
  --   managers — manager and above only
  report_template_scope text not null default 'global'
    constraint report_templates_scope_is_known
      check (report_template_scope in ('global', 'team', 'managers')),

  -- Required by exactly the 'team' scope and forbidden otherwise. Written as an
  -- equivalence rather than two checks: a team-scoped row with no team is invisible to
  -- everyone, and a global row carrying a team is a lie about who it is for.
  team_id text references teams (team_id),
  constraint report_templates_team_scope_names_a_team
    check ((report_template_scope = 'team') = (team_id is not null)),

  report_template_layout jsonb not null default '{"widgets": []}'::jsonb
    --
    -- coalesce, and it is not decoration. `jsonb_typeof(x -> 'widgets')` on a layout
    -- with no widgets key returns SQL NULL, and `null = 'array'` is null, which a CHECK
    -- treats as passing. The first version of this constraint read `= 'array'` and was
    -- watched accepting `{"page": {...}}` in the proof block below — exactly the row
    -- that opens the builder as a blank screen.
    constraint report_templates_layout_has_widgets
      check (coalesce(jsonb_typeof(report_template_layout -> 'widgets'), 'missing') = 'array'),

  -- SIGN-OFF (Amber: "a manager and above must approve it before it is saved as a
  -- template in the template library"). The same pair, the same both-or-neither check
  -- and the same trigger shape as contacts and companies in 0082 — a manager writing one
  -- approves it by existing, and a user's waits. Unapproved rows are the author's own
  -- draft: nobody else sees them, and the read policy below is what makes that true.
  report_template_approved_at timestamptz,
  report_template_approved_by uuid references profiles (profile_id),
  constraint report_templates_approval_is_a_pair
    check ((report_template_approved_at is null) = (report_template_approved_by is null)),

  -- Retire rather than delete. A template that has been used is named by every document
  -- made from it, and deleting it would take that trail with it.
  report_template_is_active boolean not null default true,

  report_template_created_at timestamptz not null default now(),
  report_template_created_by uuid references profiles (profile_id) on delete set null,
  report_template_updated_at timestamptz not null default now(),
  report_template_updated_by uuid references profiles (profile_id) on delete set null,

  -- Unique per kind, not overall: a template and a section may both be called "Progress
  -- update" without either being ambiguous, because they are offered in different
  -- places. Two templates of that name would be a coin-toss every time somebody picked.
  constraint report_templates_one_name_per_kind
    unique (report_template_kind, report_template_name)
);

comment on table report_templates is
  'The template library behind Tools → Template Builder: whole templates and the reusable sections dropped into them, at global, team or manager visibility. Anyone may write one; it is not in the library until a manager signs it off. Blocks hold references to the app''s data, never copies, so a template renders current jobs whenever it is opened.';
comment on column report_templates.report_template_kind is
  'template — a whole document''s worth of blocks. section — a fragment inserted into one by the "Library section" block, which resolves it live, so editing a section changes every template using it.';
comment on column report_templates.report_template_scope is
  'Who the entry is for: global (everybody), team (that team plus manager and above), managers (manager and above only). A visibility band, not an owner — the author is report_template_created_by.';
comment on column report_templates.report_template_approved_at is
  'Null means it is still the author''s draft and nobody else can see it. Set by guard_report_template_approval() from the session, never typed; a manager creating one approves it by existing.';

-- ========================================================= what was made from it

create table report_documents (
  report_document_id uuid primary key default gen_random_uuid(),

  report_document_title text not null
    constraint report_documents_title_is_not_blank
      check (btrim(report_document_title) <> ''),

  report_document_layout jsonb not null default '{"widgets": []}'::jsonb
    constraint report_documents_layout_has_widgets
      check (coalesce(jsonb_typeof(report_document_layout -> 'widgets'), 'missing') = 'array'),

  -- What it started from, when it started from something. SET NULL rather than CASCADE:
  -- a letter that has already gone to a client does not vanish because somebody retired
  -- the template it was drafted from. Null is also a real state — a document written
  -- from scratch has no parent.
  report_template_id uuid references report_templates (report_template_id) on delete set null,

  -- WHAT IT IS ABOUT, and this is the column the property blocks resolve against:
  -- "pulls in the properties selected for a job/project" only means something once the
  -- document names one. At most one, and neither is also fine — a portfolio report is
  -- about the whole book of work rather than about one site.
  job_id text references jobs (job_id) on delete cascade,
  project_id integer references projects (project_id) on delete cascade,
  constraint report_documents_is_about_at_most_one_record
    check (num_nonnulls(job_id, project_id) <= 1),

  -- SHARING, and read the note at the bottom of this file before switching it on.
  --
  -- A token is a way into this row for somebody with no login, so it is deliberately
  -- inert until the read endpoint exists: nothing in the app writes these columns yet.
  -- The expiry is NOT nullable-alongside — the pair check makes a share without an end
  -- date impossible to write, because a link that never expires outlives the reason it
  -- was made and nobody ever goes back to revoke it.
  report_document_share_token text unique,
  report_document_share_expires_at timestamptz,
  report_document_share_password_hash text,
  constraint report_documents_share_is_a_pair
    check ((report_document_share_token is null) = (report_document_share_expires_at is null)),
  constraint report_documents_password_needs_a_share
    check (report_document_share_password_hash is null or report_document_share_token is not null),

  report_document_created_at timestamptz not null default now(),
  report_document_created_by uuid references profiles (profile_id) on delete set null,
  report_document_updated_at timestamptz not null default now(),
  report_document_updated_by uuid references profiles (profile_id) on delete set null
);

comment on table report_documents is
  'One document somebody made — a progress report, a client letter, a maintenance report. Copied from a template and then theirs to edit, because a per-instance edit must never write back to the library. Optionally about a job or a project, which is what the property blocks read.';
comment on column report_documents.report_document_share_token is
  'A way into this row for somebody with no login. Inert as shipped: nothing writes it, and reading by token needs the report-share endpoint, which is not deployed. The expiry beside it is mandatory by constraint.';

-- Only shared rows are ever looked up by token.
create index report_documents_share_token_idx
  on report_documents (report_document_share_token)
  where report_document_share_token is not null;
create index report_documents_job_idx on report_documents (job_id) where job_id is not null;
create index report_documents_project_idx on report_documents (project_id) where project_id is not null;
-- The library list filters on these three every time it loads.
create index report_templates_kind_scope_idx
  on report_templates (report_template_kind, report_template_scope)
  where report_template_is_active;

-- ================================================================== sign-off

-- Only manager and above may set or clear the approval pair, and it is stamped from the
-- session rather than typed. A manager writing a template signs it off by existing; a
-- user's waits for somebody. auth.uid() null — a migration, a seed, a script — passes
-- through untouched, the same carve-out every guard in this schema makes.
--
-- Modelled on guard_party_approval() (0082) deliberately, down to the error code, so
-- there is one approval idiom in this schema rather than two that drift.
create or replace function guard_report_template_approval() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := current_profile_id();
  lvl permission_level := current_permission();
  new_at timestamptz := new.report_template_approved_at;
  old_at timestamptz := case when tg_op = 'UPDATE' then old.report_template_approved_at end;
begin
  if auth.uid() is null then return new; end if;

  if tg_op = 'INSERT' then
    if lvl >= 'manager' then
      new_at := now();
    else
      new_at := null;
    end if;
  elsif new_at is distinct from old_at and lvl < 'manager' then
    raise exception 'sign-off is a manager''s: a template or section joins the library when a manager or above approves it'
      using errcode = '42501';
  elsif new_at is not null and old_at is null then
    new_at := now();
  end if;

  new.report_template_approved_at := new_at;
  new.report_template_approved_by :=
    case when new_at is null then null else coalesce(me, new.report_template_approved_by) end;
  return new;
end $$;

revoke execute on function guard_report_template_approval() from public, anon, authenticated;

create trigger report_templates_guard_approval before insert or update on report_templates
  for each row execute function guard_report_template_approval();

-- ============================================================ who may do what
--
-- Amber, 4 September, in her own order:
--   "any user and above can create a report using existing templates saved"
--   "any user and above can create a reusable section … approved by a manager"
--   "any user and above can create a template but a manager and above must approve it"
--
-- So the write floor is `user` throughout, and the gate is the sign-off rather than the
-- policy. What the policies still have to enforce is the part a floor cannot: that an
-- unapproved draft is private to its author, that an approved library entry is not
-- editable by whoever happens to open it, and that a manager-scoped entry is not
-- readable below manager.

alter table report_templates enable row level security;

-- Read: your own drafts always; everybody else's only once approved, and then only if
-- the scope admits you. The `is_active` clause is not a security rule — a retired
-- template stays readable so the documents made from it can still name it — it is the
-- listing that filters, not this.
create policy "read report_templates" on report_templates
  for select to authenticated
  using (
    (select is_active_user())
    and (
      report_template_created_by = (select current_profile_id())
      or (
        report_template_approved_at is not null
        and (
          report_template_scope = 'global'
          or (select current_permission()) >= 'manager'
          or (
            report_template_scope = 'team'
            and exists (
              select 1 from profile_teams pt
              where pt.profile_id = (select current_profile_id())
                and pt.team_id = report_templates.team_id
            )
          )
        )
      )
    )
  );

-- Write: anyone who works here may propose one. The sign-off decides whether it becomes
-- the library's; the INSERT floor only decides whether they may write at all.
create policy "users propose report_templates" on report_templates
  for insert to authenticated
  with check ((select current_permission()) >= 'user');

-- Edit: your own draft, or anything if you are a manager. The middle clause is the one
-- that matters — once a manager has signed a template off it belongs to the library, and
-- its author editing it afterwards would change what everybody else sends without a
-- second sign-off.
--
-- The WITH CHECK is also the second lock on the sign-off itself, and that was found by
-- experiment rather than designed: disabling the trigger's refusal alone did NOT let a
-- user approve their own template, because the new row then fails this clause —
-- `approved_at` is no longer null and they are not a manager. Both had to be widened
-- before verify/rls.sql reported it. Two independent mechanisms, and neither is
-- redundant: the trigger also governs what a MANAGER's write is allowed to say, which a
-- row-level policy cannot see.
create policy "authors edit their drafts, managers edit the library" on report_templates
  for update to authenticated
  using (
    (select current_permission()) >= 'manager'
    or (report_template_created_by = (select current_profile_id())
        and report_template_approved_at is null)
  )
  with check (
    (select current_permission()) >= 'manager'
    or (report_template_created_by = (select current_profile_id())
        and report_template_approved_at is null)
  );

-- Delete: withdraw your own draft, or admin and above. An approved entry is retired with
-- report_template_is_active rather than deleted, because documents name it.
create policy "authors withdraw their drafts, admins delete" on report_templates
  for delete to authenticated
  using (
    (select current_permission()) >= 'admin'
    or (report_template_created_by = (select current_profile_id())
        and report_template_approved_at is null)
  );

alter table report_documents enable row level security;

-- A document is internal work product and reads like every other record in this schema:
-- an active profile sees it. Sharing it OUTSIDE Lofty is the token's job, not this
-- policy's, and that path deliberately does not go through RLS at all.
create policy "read report_documents" on report_documents
  for select to authenticated
  using ((select is_active_user()));

create policy "users write report_documents" on report_documents
  for insert to authenticated
  with check ((select current_permission()) >= 'user');
create policy "users update report_documents" on report_documents
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
-- Deleting somebody else's draft letter is not an ordinary user's to do.
create policy "authors and admins delete report_documents" on report_documents
  for delete to authenticated
  using (
    (select current_permission()) >= 'admin'
    or report_document_created_by = (select current_profile_id())
  );

-- ================================================================== plumbing

-- moddatetime with the column as its argument — the 0028 convention, since the column
-- names carry their table's prefix.
create trigger report_templates_touch before update on report_templates
  for each row execute function extensions.moddatetime(report_template_updated_at);
create trigger report_documents_touch before update on report_documents
  for each row execute function extensions.moddatetime(report_document_updated_at);

create trigger report_templates_stamp_created_by before insert on report_templates
  for each row execute function stamp_created_by('report_template_created_by');
create trigger report_documents_stamp_created_by before insert on report_documents
  for each row execute function stamp_created_by('report_document_created_by');

-- Every save answers "who last changed this", which is the question a shared library
-- raises the first time an entry changes under somebody. 0091 wrote the function.
create trigger report_templates_stamp_updated_by before update on report_templates
  for each row execute function stamp_updated_by('report_template_updated_by');
create trigger report_documents_stamp_updated_by before update on report_documents
  for each row execute function stamp_updated_by('report_document_updated_by');

-- Audited like everything else. 0080 took the allowlist out of log_activity_audit() and
-- verify/behaviour.sql asserts that every non-log table in public carries this trigger,
-- so a table created without one fails the check on the day it is created.
create trigger trg_activity_audit_row after insert or update or delete on report_templates
  for each row execute function log_activity_audit();
create trigger trg_activity_audit_row after insert or update or delete on report_documents
  for each row execute function log_activity_audit();

-- ==================================================================== proof
-- Each rule watched biting: an insert that should be refused, refused for the right
-- reason, in a sub-block whose rollback removes the attempt. The accepted rows are
-- deleted explicitly, so the migration leaves both tables exactly as created: empty.
--
-- The RLS and sign-off halves are proved in verify/rls.sql, as `authenticated`, because
-- everything here runs as the owner and BYPASSES both. Each of those probes was watched
-- failing with the matching policy widened before it was watched passing.
--
-- The touch trigger is NOT proved here, and the reason is worth writing down because the
-- first version of this block did try and reported a pass that meant nothing.
-- `extensions.moddatetime` writes now(), which is the TRANSACTION timestamp, and a DO
-- block is one transaction — so inside it updated_at comes back exactly equal to
-- created_at whether the trigger fired or not. It is proved in verify/behaviour.sql
-- instead, where the update lands in a later transaction and the clock has moved.
do $$
declare
  made uuid;
  a_team text;
begin
  select team_id into strict a_team from teams where team_is_active limit 1;

  -- A blank name is refused.
  begin
    insert into report_templates (report_template_name) values ('   ');
    raise exception 'a blank template name was accepted';
  exception when check_violation then null; end;

  -- A kind that is not a kind is refused. Without this, a typo'd 'sections' would be a
  -- row nothing ever lists — invisible rather than wrong, which is worse.
  begin
    insert into report_templates (report_template_name, report_template_kind)
    values ('__proof__', 'fragment');
    raise exception 'an unknown template kind was accepted';
  exception when check_violation then null; end;

  -- A layout whose widgets are not an array is refused. This is the one that matters:
  -- the builder maps over it on open, so an object here is a blank screen.
  begin
    insert into report_templates (report_template_name, report_template_layout)
    values ('__proof__', '{"widgets": {}}'::jsonb);
    raise exception 'a layout with a non-array widgets key was accepted';
  exception when check_violation then null; end;

  -- A layout with no widgets key at all is refused for the same reason: jsonb_typeof of
  -- a missing key is null, which is not 'array' — and which a bare `= 'array'` would
  -- have let through.
  begin
    insert into report_templates (report_template_name, report_template_layout)
    values ('__proof__', '{"page": {"pageSize": "a4"}}'::jsonb);
    raise exception 'a layout with no widgets key was accepted';
  exception when check_violation then null; end;

  -- Team scope without a team is invisible to everybody, so it is refused.
  begin
    insert into report_templates (report_template_name, report_template_scope)
    values ('__proof__', 'team');
    raise exception 'a team-scoped template naming no team was accepted';
  exception when check_violation then null; end;

  -- And a global template carrying a team is a lie about who it is for.
  begin
    insert into report_templates (report_template_name, report_template_scope, team_id)
    values ('__proof__', 'global', a_team);
    raise exception 'a global template carrying a team was accepted';
  exception when check_violation then null; end;

  -- Half an approval is refused: a date with nobody behind it cannot answer "who".
  begin
    insert into report_templates (report_template_name, report_template_approved_at)
    values ('__proof__', now());
    raise exception 'an approval with no approver was accepted';
  exception when check_violation then null; end;

  -- The default is a usable empty layout, not null, and the default kind is a template.
  insert into report_templates (report_template_name) values ('__proof__')
    returning report_template_id into made;
  if (select report_template_layout from report_templates where report_template_id = made)
     <> '{"widgets": []}'::jsonb then
    raise exception 'the default layout is not an empty widget list';
  end if;
  if (select report_template_kind from report_templates where report_template_id = made) <> 'template' then
    raise exception 'the default kind is not template';
  end if;

  -- The same name twice in one kind is refused…
  begin
    insert into report_templates (report_template_name) values ('__proof__');
    raise exception 'a duplicate template name was accepted';
  exception when unique_violation then null; end;

  -- …and the same name as a SECTION is fine, because they are offered in different places.
  insert into report_templates (report_template_name, report_template_kind)
  values ('__proof__', 'section');

  -- A document about both a job and a project is refused: the property blocks would not
  -- know which record to read.
  begin
    insert into report_documents (report_document_title, job_id, project_id)
    values ('__proof__', '9999-999', 9999);
    raise exception 'a document about both a job and a project was accepted';
  exception
    when check_violation then null;
    -- The CHECK fires before the foreign keys, but if the FKs ever win the race this
    -- probe must not report a pass for the wrong reason.
    when foreign_key_violation then raise exception 'the two-parent check did not fire before the foreign keys';
  end;

  -- A share token with no expiry is refused. A link that never ends is one nobody
  -- revokes, and this is the constraint that makes "forever" unwritable.
  begin
    insert into report_documents (report_document_title, report_document_share_token)
    values ('__proof__', 'tok_proof');
    raise exception 'a share token with no expiry was accepted';
  exception when check_violation then null; end;

  -- A password with no share is meaningless, and it is refused too.
  begin
    insert into report_documents (report_document_title, report_document_share_password_hash)
    values ('__proof__', 'notahash');
    raise exception 'a share password with no share was accepted';
  exception when check_violation then null; end;

  -- A document about nothing at all is fine: a portfolio report is about the whole book.
  insert into report_documents (report_document_title) values ('__proof__');

  delete from report_documents where report_document_title = '__proof__';
  delete from report_templates where report_template_name = '__proof__';
end $$;

-- ============================================================ on the share token
--
-- The columns exist and nothing writes them. That is the shipped state, and it is a
-- decision rather than an omission.
--
-- Reading a document by token means answering somebody with no session, which cannot go
-- through RLS: making this table readable by `anon` to serve a share link would expose
-- every other document in it to anybody holding any link. It has to be a server endpoint
-- holding the service role, returning only the one row and only the viewer-safe parts of
-- it — `supabase/functions/report-share/` is that endpoint, and it is not deployed.
--
-- So the app does not offer a Share button yet: the store implements no createShareLink,
-- and the builder feature-detects that and hides the panel. When the endpoint is
-- deployed, wiring it is the store's three share methods and nothing here changes.
