-- 0095 — a shared document is what was sent, not a live window into Lofty
--
-- 0094 shipped the share columns inert: a token, a mandatory expiry, a password hash, and
-- nothing that writes them. What was missing was not plumbing. It was an answer to
-- "what does a person outside Lofty see when they open the link", and 0094's own README
-- called filling that in "the single most likely serious bug in an endpoint of this kind".
--
-- Amber's screenshots settled the intent: *"Create a shareable link so clients or
-- teammates can view this report without logging in."* A client. Not a colleague with a
-- narrower account — somebody with no account at all.
--
-- THE ANSWER IS A SNAPSHOT, AND IT REMOVES THE QUESTION RATHER THAN ANSWERING IT
--
--   A block in a document holds a REFERENCE, and resolves against the app every time it
--   renders. That is right inside Lofty and wrong on the way out: a link sent to the
--   client at 28 Corner Street in September would still be resolving in March, showing
--   them whatever is true then, including jobs and numbers nobody chose to send.
--
--   So the link does not resolve anything. When the author clicks Share, the document is
--   compiled ONCE, in their browser, under their own session and therefore their own RLS,
--   and the compiled result is stored here. The endpoint serves that.
--
--   Three things follow, and they are the reason this is the design rather than a
--   simplification of it:
--
--   1. THERE IS NO QUERY TO GET WRONG. The alternative was an endpoint holding the
--      service role and re-querying jobs, properties and people with RLS switched off,
--      where one forgotten `.eq(job_id, …)` returns the whole book of work to anybody
--      with a link. That endpoint no longer needs to exist.
--   2. RESTRICTED DATA CANNOT ENTER, because the snapshot is taken through the author's
--      own RLS. A margin the author cannot see is not in the compile, so it is not in the
--      snapshot. No second copy of the permission rules to drift from the first.
--   3. WHAT THE AUTHOR SAW IS WHAT THE CLIENT GETS. Same compiled model the PDF and the
--      Word file are built from, so the link and the attachment cannot disagree.
--
--   The cost, stated plainly: a shared link does not update. Send a new one. That is what
--   sending a document has always meant, and it is the behaviour of the PDF that would
--   otherwise have been attached to the same email.

alter table report_documents
  -- The compiled document: `{ report: { title, subtitle, meta, sections: [...] }, theme,
  -- page }` — the output of the module's own compileReport(), which is also what the
  -- HTML, Markdown and Word writers take. Storing the renderers' input rather than a
  -- rendered string is what lets a shared page use the same component the app does.
  add column report_document_share_snapshot jsonb;

comment on column report_documents.report_document_share_snapshot is
  'The document as it was when the link was made: compiled in the author''s browser under their own RLS, so it holds only what they could see and only what they chose to send. Not re-resolved on open — a shared link is a sent document, not a live window. Re-share to send newer numbers.';

-- A token without a snapshot is a link to nothing, and the endpoint would have to fall
-- back to resolving live — which is the design this migration exists to prevent. Written
-- as an implication rather than an equivalence: clearing a share leaves the snapshot
-- behind harmlessly, and keeping it means "what did we send them" survives revocation.
alter table report_documents
  add constraint report_documents_share_needs_a_snapshot
    check (report_document_share_token is null or report_document_share_snapshot is not null);

-- The same shape check the layout column carries, for the same reason: the shared page
-- maps over `sections` on open, so an object here is a blank page in front of a client.
-- coalesce for the reason 0094 wrote down at length — jsonb_typeof of a missing key is
-- SQL NULL, and a CHECK reads NULL as a pass.
alter table report_documents
  add constraint report_documents_snapshot_has_sections
    check (
      report_document_share_snapshot is null
      or coalesce(jsonb_typeof(report_document_share_snapshot -> 'report' -> 'sections'), 'missing') = 'array'
    );

-- ============================================ answering "is there one" without sending it
--
-- The Share panel has to know whether a link already has a password, and the document
-- list has to know whether a share was ever taken. Both are one bit, and the columns that
-- hold the answers must not leave the database:
--
--   the password hash    a hash in a browser is a hash somebody can attack offline
--   the snapshot         a whole compiled document, on every row of a list nobody is
--                        rendering, on every load
--
-- Generated columns rather than a boolean the app maintains: a derived value that some
-- code path forgets to update is how a revoked password goes on reading as set.
alter table report_documents
  add column report_document_has_share_password boolean
    generated always as (report_document_share_password_hash is not null) stored,
  add column report_document_has_share_snapshot boolean
    generated always as (report_document_share_snapshot is not null) stored;

comment on column report_documents.report_document_has_share_password is
  'Whether a password is set, for the Share panel. The hash itself is never selected into the browser: it is a hash somebody could attack offline, and the browser has no use for it.';

-- ====================================== two columns nobody signed in may read
--
-- RLS decides which ROWS you get. It says nothing about which COLUMNS, so an authenticated
-- session that can read a document row can read every column on it — including these two,
-- whatever the app's own select lists happen to ask for. The repository is careful; a
-- hand-written PostgREST call from the browser console is not bound by that care.
--
--   the password hash    a hash in anybody's hands is a hash they can attack offline, and
--                        the person who set it is protecting the document FROM colleagues
--                        as much as from strangers
--   the snapshot         a whole compiled document per row, which nothing signed in
--                        renders: the builder reads the live layout, and the shared page
--                        gets the snapshot from the endpoint, not from here
--
-- So the grant is withdrawn at the column level. The generated booleans above exist
-- exactly so the app can still answer "is there a password" and "was this ever shared"
-- without either column leaving the database.
--
-- AND IT HAS TO BE DONE BY INVERSION, which is the part that is easy to get wrong.
--
-- A column-level REVOKE does not subtract from a table-level GRANT: with `select` held on
-- the table, every column comes with it and the revoke is silently a no-op. The first
-- version of this did exactly that and verify/rls.sql read both columns straight back.
--
-- So the table-level grant goes and an explicit column list replaces it. That inverts the
-- default for this table: a column added later is NOT readable until somebody adds it
-- here. That is the failure mode worth having — a visible one, on the day the column is
-- added, rather than a silent exposure nobody looks for.
--
-- The service role is untouched and is what the endpoint holds. UPDATE is untouched too,
-- so a share can still be written — you may set these columns, you may not read them back.
revoke select on report_documents from authenticated, anon;
grant select (
  report_document_id,
  report_document_title,
  report_document_layout,
  report_template_id,
  job_id,
  project_id,
  report_document_share_token,
  report_document_share_expires_at,
  report_document_has_share_password,
  report_document_has_share_snapshot,
  report_document_created_at,
  report_document_created_by,
  report_document_updated_at,
  report_document_updated_by
) on report_documents to authenticated;

-- ==================================================================== proof
-- Each rule watched biting, in a sub-block whose rollback removes the attempt. The
-- accepted rows are deleted explicitly, so this leaves the table exactly as it found it.
do $$
declare
  made uuid;
  ok_snapshot jsonb := '{"report": {"title": "Progress report", "sections": []}}'::jsonb;
begin
  -- A share with no snapshot is refused. This is the whole point of the migration: it is
  -- what makes "resolve it live instead" unwritable rather than merely discouraged.
  begin
    insert into report_documents (
      report_document_title, report_document_share_token, report_document_share_expires_at
    ) values ('__proof__', 'tok_proof', now() + interval '30 days');
    raise exception 'a share token with no snapshot was accepted';
  exception when check_violation then null; end;

  -- A snapshot whose sections are not a list is refused — the shared page maps over them.
  begin
    insert into report_documents (report_document_title, report_document_share_snapshot)
    values ('__proof__', '{"report": {"sections": {}}}'::jsonb);
    raise exception 'a snapshot with a non-array sections key was accepted';
  exception when check_violation then null; end;

  -- And one with no sections key at all, for the coalesce reason above.
  begin
    insert into report_documents (report_document_title, report_document_share_snapshot)
    values ('__proof__', '{"report": {"title": "no sections"}}'::jsonb);
    raise exception 'a snapshot with no sections key was accepted';
  exception when check_violation then null; end;

  -- The expiry stays mandatory: 0094's pair constraint must still bite with a snapshot
  -- present, or "forever" becomes writable again through the new column.
  begin
    insert into report_documents (
      report_document_title, report_document_share_token, report_document_share_snapshot
    ) values ('__proof__', 'tok_proof', ok_snapshot);
    raise exception 'a share token with no expiry was accepted';
  exception when check_violation then null; end;

  -- A complete share is accepted.
  insert into report_documents (
    report_document_title,
    report_document_share_token,
    report_document_share_expires_at,
    report_document_share_snapshot
  ) values ('__proof__', 'tok_proof', now() + interval '30 days', ok_snapshot)
    returning report_document_id into made;

  -- Revoking keeps the snapshot: "what did we send them" outlives the link.
  update report_documents
     set report_document_share_token = null,
         report_document_share_expires_at = null
   where report_document_id = made;
  if (select report_document_share_snapshot from report_documents where report_document_id = made) is null then
    raise exception 'revoking a share discarded the record of what was sent';
  end if;

  -- The generated columns follow the data rather than being set. Watched by flipping the
  -- underlying column and reading the derived one back, because a derived value that does
  -- not derive is exactly the bug generated columns are chosen to prevent.
  if (select report_document_has_share_snapshot from report_documents where report_document_id = made) is not true then
    raise exception 'has_share_snapshot did not follow the snapshot';
  end if;
  if (select report_document_has_share_password from report_documents where report_document_id = made) is not false then
    raise exception 'has_share_password is set on a document with no password';
  end if;
  update report_documents set report_document_share_password_hash = 'pbkdf2$sha256$1$c2FsdA==$aGFzaA=='
   where report_document_id = made;
  raise exception 'a password with no share was accepted';
exception when check_violation then
  -- Expected: 0094's password_needs_a_share still bites now that the share was revoked
  -- above, which is the ordering this proof exists to pin down.
  null;
end $$;

do $$
declare
  made uuid;
  ok_snapshot jsonb := '{"report": {"title": "Progress report", "sections": []}}'::jsonb;
begin
  -- Same check the other way round: with a live share, setting a password flips the
  -- generated column and clearing it flips it back.
  insert into report_documents (
    report_document_title,
    report_document_share_token,
    report_document_share_expires_at,
    report_document_share_snapshot
  ) values ('__proof__', 'tok_proof_2', now() + interval '30 days', ok_snapshot)
    returning report_document_id into made;

  update report_documents set report_document_share_password_hash = 'pbkdf2$sha256$1$c2FsdA==$aGFzaA=='
   where report_document_id = made;
  if (select report_document_has_share_password from report_documents where report_document_id = made) is not true then
    raise exception 'has_share_password did not follow a password being set';
  end if;

  update report_documents set report_document_share_password_hash = null
   where report_document_id = made;
  if (select report_document_has_share_password from report_documents where report_document_id = made) is not false then
    raise exception 'has_share_password did not follow a password being cleared';
  end if;

  -- A document with no share at all is still fine, which is every document today.
  insert into report_documents (report_document_title) values ('__proof__');

  delete from report_documents where report_document_title = '__proof__';
end $$;
