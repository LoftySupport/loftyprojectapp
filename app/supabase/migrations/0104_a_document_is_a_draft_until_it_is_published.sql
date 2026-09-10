-- 0104 — a document is a draft until it is published.
--
-- Amber, 10 September: *"they need to be able to edit it in the app and pull in
-- information, but it should be linked in sharepoint.. until it is published… what it
-- needs to do is have a DRAFT watermark across it while editable and saved to the job.
-- and as soon as it is ready to share or publish it, you choose the sharepoint location
-- to save it to (which should default to job file)"*, and — the sentence this migration
-- is really about — *"if editing it in the app it reverts to draft"*.
--
-- =============================================================================
-- THE STATE IS DERIVED FROM A TIMESTAMP, NOT STORED AS A WORD
--
--   A `report_document_status text check (in ('draft','published'))` column was the
--   obvious shape and it is the wrong one, for a reason this schema has hit before: it
--   records the conclusion and not the fact. "Published" would then be a word somebody
--   sets, and the first time an edit forgot to set it back the document would be a draft
--   wearing a published label — which is precisely the failure the watermark exists to
--   prevent, and it would be invisible.
--
--   `published_at is not null` cannot drift, because the same trigger that sets it is the
--   one that clears it. There is no second place to keep in step.
--
-- =============================================================================
-- EDITING REVERTS IT, AND THAT IS THE DATABASE'S JOB RATHER THAN THE SCREEN'S
--
--   The app has a builder that autosaves on a debounce, a record panel, an import path
--   and a share compile — four places that write a layout today and an unknown number
--   tomorrow. "Remember to clear the publication" is a promise every one of them has to
--   keep, and 0052's undo taught this repo exactly what a per-caller opt-in is worth:
--   *"a per-screen opt-in is a promise every future screen has to remember to keep, and
--   the first one did not"*.
--
--   So the trigger below watches the layout and the title. Change either while the
--   document is published and the publication is gone in the same statement, with no
--   cooperation from the caller.
--
--   WHAT COUNTS AS AN EDIT, precisely: `report_document_layout` or
--   `report_document_title`. NOT the share columns, NOT the record it is about, NOT the
--   audit quartet. Sharing a published document, or moving it to another job, does not
--   make it a draft again — nothing about what a reader would see has changed.
--
-- =============================================================================
-- THE URL SURVIVES THE REVERT, AND IS NOT ENOUGH ON ITS OWN
--
--   Amber: *"to download it again you need to add the link again to save to sharepoint"*.
--   Re-publishing is an act somebody has to perform — so `published_at` goes.
--
--   The URL stays, and that is deliberate rather than sloppy: a document re-published
--   after an edit almost always goes back to the same place, and making somebody find
--   that address again in SharePoint is the sort of friction that ends with the document
--   filed somewhere new. The dialog pre-fills from it; confirming is still a click, which
--   is the "again" in her sentence.
--
--   So a row with a URL and no `published_at` is a real and readable state: *this went to
--   SharePoint, then somebody edited it, and what is up there is now out of date.* That
--   is worth being able to see, and the app says it on the row.

alter table report_documents
  -- When it was last published, and by whom. Null is the ordinary state: a document is a
  -- draft from the moment it is created until somebody sends it somewhere.
  add column report_document_published_at timestamptz,
  add column report_document_published_by uuid references profiles (profile_id) on delete set null,

  -- WHERE IT WENT. Amber, 10 September: *"until integration is in place add in the draft
  -- watermark and when ready to publish you have to add in the sharepoint link which
  -- replaces the draft document"*.
  --
  -- The same https-and-no-whitespace shape as 0040's folder check and 0103's document
  -- URL, and loose for the same reason: SharePoint addresses come in at least three
  -- forms and a pattern tight enough to be useful about one refuses the other two.
  --
  -- Survives a revert, so it can pre-fill the next publish. Never on its own proof that
  -- anything is published — `published_at` is.
  add column report_document_published_url text;

alter table report_documents
  add constraint report_documents_published_url_is_https
    check (report_document_published_url is null
           or report_document_published_url ~ '^https://\S+$'),

  -- The pair, as every stamped pair in this schema is written (0082, 0094).
  add constraint report_documents_publication_is_a_pair
    check ((report_document_published_at is null) = (report_document_published_by is null)),

  -- An implication rather than an equivalence, and the direction matters. Published
  -- REQUIRES somewhere it was published to — that is the whole of Amber's sentence. The
  -- reverse is deliberately allowed: a URL with no publication is the after-an-edit state
  -- described above, and forbidding it would mean throwing the address away.
  add constraint report_documents_published_names_where
    check (report_document_published_at is null
           or report_document_published_url is not null);

comment on column report_documents.report_document_published_at is
  'Null means it is a draft — which is what the DRAFT watermark on screen, in print, in the .html and in the .docx is reading. Set by guard_report_document_publication() and CLEARED by it whenever the layout or title changes, so an edited document cannot keep a published label. Never typed.';
comment on column report_documents.report_document_published_url is
  'Where it was sent — a SharePoint address, pasted by hand until the integration lands. Survives an edit on purpose, so re-publishing pre-fills the place it went last time; a URL with no report_document_published_at means what is in SharePoint is now out of date.';

-- ================================================================== the guard

-- Stamp the publisher from the session, and take the publication back the moment the
-- document changes.
--
-- SECURITY DEFINER and a pinned search_path, as 0099 requires of every function here.
-- Modelled on guard_report_template_approval() (0094) down to the auth.uid() carve-out,
-- so this schema has one stamping idiom rather than two that drift.
create or replace function guard_report_document_publication() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := current_profile_id();
begin
  -- A migration, a seed or a script writes what it says. Every guard in this schema
  -- makes the same carve-out, and verify/rls.sql is where the authenticated path is
  -- proved instead.
  if auth.uid() is null then return new; end if;

  if tg_op = 'UPDATE'
     and (new.report_document_layout is distinct from old.report_document_layout
          or new.report_document_title is distinct from old.report_document_title)
  then
    -- The edit wins, whatever else the statement said. A caller that changed the layout
    -- AND set published_at in one update is describing two contradictory things; the
    -- content changed, so it is a draft.
    new.report_document_published_at := null;
    new.report_document_published_by := null;
    -- The URL is left alone. See the note at the top of this file.
    return new;
  end if;

  -- Publishing, or re-publishing. `published_by` is read from the session rather than
  -- trusted from the argument — the same rule as every other "who did this" column here.
  if new.report_document_published_at is not null
     and (tg_op = 'INSERT' or old.report_document_published_at is null
          or new.report_document_published_at is distinct from old.report_document_published_at)
  then
    new.report_document_published_at := now();
    new.report_document_published_by := coalesce(me, new.report_document_published_by);
  end if;

  return new;
end $$;

revoke execute on function guard_report_document_publication() from public, anon, authenticated;

comment on function guard_report_document_publication() is
  'Stamps who published a document from the session, and clears the publication whenever the layout or title changes — Amber, 10 Sep: "if editing it in the app it reverts to draft". A trigger rather than a rule each caller keeps: the builder autosaves, the panel writes, the importer writes, and a per-caller promise is one every future caller has to remember.';

-- BEFORE, because it rewrites the row being written. The audit trigger is AFTER and sees
-- the corrected values, which is what makes the activity feed say "reverted to draft"
-- rather than reporting the publication the caller thought it was keeping.
create trigger report_documents_guard_publication before insert or update on report_documents
  for each row execute function guard_report_document_publication();

-- The Documents panel and the dashboard both ask "what is still a draft". Partial,
-- because published rows are the minority that this index is not for.
create index report_documents_draft_idx on report_documents (report_document_updated_at desc)
  where report_document_published_at is null;

-- ============================================ and the grant, which is not optional
--
-- 0095 took the table-level SELECT off `report_documents` and replaced it with a column
-- list, so the share snapshot and the password hash could not be read back by a signed-in
-- session. It said what that would cost, in as many words:
--
--   *"That inverts the default for this table: a column added later is NOT readable until
--   somebody adds it here. That is the failure mode worth having — a visible one, on the
--   day the column is added."*
--
-- This is that day, and it was visible exactly as promised: `verify/rls.sql` stopped with
-- `permission denied for table report_documents` the first time it read the new columns
-- as `authenticated`. Without these three lines the app's own document query — which asks
-- for every column by name — fails the same way for every user on the first page load.
--
-- Nothing is revoked here. The two columns 0095 withheld stay withheld: this list is the
-- one it wrote plus the three added above.
grant select (
  report_document_published_at,
  report_document_published_by,
  report_document_published_url
) on report_documents to authenticated;

-- ==================================================================== proof
-- Each rule watched biting, in a sub-block whose rollback removes the attempt. The rows
-- that are accepted are deleted explicitly, so the migration leaves the table as it found
-- it.
--
-- THE TRIGGER IS NOT PROVED HERE AND CANNOT BE, and that is worth stating rather than
-- implying: every statement in a migration runs with `auth.uid()` null, which is the
-- carve-out at the top of the function — so the revert never fires and a probe asserting
-- it would asserting nothing. It is proved in verify/rls.sql, as `authenticated`, where
-- the session is real. That is the same division 0094 records for the approval guard.
--
-- What CAN be proved here is the constraints, which do not care who is writing.
do $$
declare
  made uuid;
  a_person uuid;
begin
  -- STRICT: without a person the first probe below would be refused by the pair check
  -- rather than by the rule it is aiming at, and report a pass it had not earned. The
  -- migrations seed 48 profiles, so this raises only if something upstream broke.
  select profile_id into strict a_person from profiles limit 1;

  insert into report_documents (report_document_title) values ('__proof__ publication')
  returning report_document_id into made;

  -- Published with nowhere to have been published to. THE rule of this migration.
  begin
    update report_documents
       set report_document_published_at = now(), report_document_published_by = a_person
     where report_document_id = made;
    raise exception 'a document was published with no SharePoint address';
  exception when check_violation then null; end;

  -- Half a pair. Written both ways round, because a both-or-neither check that only
  -- refuses one of its two halves passes a careless reading.
  begin
    update report_documents
       set report_document_published_at = now(),
           report_document_published_url = 'https://lofty.sharepoint.com/x'
     where report_document_id = made;
    raise exception 'a publication with no publisher was accepted';
  exception when check_violation then null; end;

  begin
    update report_documents
       set report_document_published_by = a_person,
           report_document_published_url = 'https://lofty.sharepoint.com/x'
     where report_document_id = made;
    raise exception 'a publisher with no publication date was accepted';
  exception when check_violation then null; end;

  -- Not a URL. The one people will actually hit: a path off the file server, copied
  -- because they had the document open rather than the link.
  begin
    update report_documents
       set report_document_published_url = '\\lofty-fs01\projects\1103\report.docx'
     where report_document_id = made;
    raise exception 'a Windows path was accepted as a publication address';
  exception when check_violation then null; end;

  -- And a whole, well-formed publication is accepted — which is what proves the four
  -- refusals above were about their own rules rather than the table refusing everything.
  update report_documents
     set report_document_published_at = now(),
         report_document_published_by = a_person,
         report_document_published_url = 'https://lofty.sharepoint.com/sites/jobs/1103/report.docx'
   where report_document_id = made;

  -- A URL with no publication is ALLOWED, and it is the state a document lands in after
  -- somebody edits a published one. Proved rather than assumed, because the obvious way
  -- to write the constraint above — an equivalence rather than an implication — would
  -- refuse it, and the app would then have to throw the address away on every edit.
  update report_documents
     set report_document_published_at = null, report_document_published_by = null
   where report_document_id = made;

  delete from report_documents where report_document_id = made;
end
$$;
