-- 0103 — a document can be a URL.
--
-- Amber, 10 September: *"when adding a document I need to be able to save it as a url in
-- sharepoint (integration coming) but for now I need to be able to add and delete them"*.
--
-- =============================================================================
-- ONE COLUMN, NOT A TABLE, AND THAT IS THE WHOLE POINT
--
--   The first draft of this migration created `document_links` — a title, a URL, and a
--   job or project to hang it off. It got as far as being written before somebody read
--   0032, which had already built exactly that table, under exactly that name, three
--   months earlier and for a better reason.
--
--   0032's pair is the right shape and it is worth restating why, because the wrong
--   version was rebuilt once already:
--
--     documents        THE FILE, held once. Named once, categorised once, versioned once.
--     document_links   WHERE IT IS ATTACHED. One row per record it hangs off.
--
--   The exclusive arc is on the LINK, not on the document, because the same soil report
--   genuinely belongs to a project AND to every job on it. A per-record table would have
--   meant one row per copy — four rows for one PDF, four names to drift apart, and no way
--   to say "this is the same document" when somebody renamed it on one of them.
--
--   A SharePoint link has that property even more strongly than an upload does: the
--   contract for project 1042 is one document in one place, and it is relevant to the
--   project and to the one job it actually governs. So this is a column on `documents`,
--   and everything else 0032 built — the links, the categories, the supersedes chain,
--   the RLS, the audit triggers — already works on it unchanged.
--
-- =============================================================================
-- WHAT `documents` NOW MEANS, IN THREE STATES
--
--   storage_path set, url null    An upload. Lofty holds the bytes. (0032's case.)
--   url set, storage_path null    A pointer. The bytes are in SharePoint. (This one.)
--   both null                     Expected, not arrived. 0032 built this deliberately —
--                                 "the signed contract" as a row that is not there yet.
--
--   Both set is allowed and NOT constrained against, because the coming integration is
--   the case for it: a document uploaded here and then filed into SharePoint has both,
--   and a check refusing that would have to be dropped the week the integration lands.
--
-- =============================================================================
-- WHAT THE COMING INTEGRATION WILL NEED, AND WHY NONE OF IT IS HERE YET
--
--   "(integration coming)" is doing real work in that sentence. A SharePoint sync will
--   want a drive id, an item id, an eTag, a synced-at, probably a webhook subscription —
--   none of which anybody has decided, because it has not been scoped. Guessing at those
--   columns now gives either a row of nulls nothing writes, or a shape the integration
--   then has to work around.
--
--   So this stores what a person can paste today and nothing else. Adding the sync's
--   columns later is `alter table add column`, which is cheap. Removing invented ones
--   after something has started reading them is not.

alter table documents
  add column if not exists document_url text;

-- https and no whitespace, and nothing tighter. The same shape as 0040's folder check on
-- jobs and projects, and for the same reason: SharePoint URLs come in at least three
-- forms (tenant paths, personal sites, shortened `:b:/s/` share links) and a pattern
-- strict enough to be useful about one of them refuses the other two. What this catches
-- is the thing people actually paste by accident — a Windows path off the file server, a
-- bare filename, a half-copied string.
alter table documents drop constraint if exists documents_url_is_https;
alter table documents add constraint documents_url_is_https
  check (document_url is null or document_url ~ '^https://\S+$');

comment on column documents.document_url is
  'Where the document is when Lofty does not hold the bytes — a SharePoint link, pasted by hand until the integration lands. Nullable, and independent of document_storage_path: an upload has a path, a link has a URL, a document that is expected but has not arrived has neither, and a synced one may have both. This app never fetches it — the link opens under the reader''s own Microsoft session, so somebody without access to the file sees SharePoint''s refusal rather than the file.';

-- The dashboard's "recent documents" reads this order, and it is the only query in the
-- app that scans the table rather than reaching it through a link.
create index if not exists documents_updated_idx on documents (document_updated_at desc);

-- The same link filed twice against one record is a double-click, not a decision — and
-- 0032 already refuses it (`document_links_once_per_job` and friends). What it cannot
-- refuse is the same URL arriving as a SECOND documents row, because it is a different
-- document_id. This does, per URL, across the whole table: one SharePoint address is one
-- document, which is the premise the whole "held once" design rests on.
--
-- Partial, because null is the ordinary case here — an uploaded file has no URL, and a
-- full unique index would be mostly dead entries with nulls that never collide anyway.
create unique index if not exists documents_one_row_per_url
  on documents (document_url) where document_url is not null;

-- ================================================================== reaping
--
-- A document reachable from nowhere.
--
-- 0032 made detaching ordinary work (`users detach documents`) and deleting a document
-- admin-only, which is right for an upload: the link goes, the file stays, and somebody
-- who took a drawing off one job has not destroyed it. A POINTER row is different. It has
-- no bytes, it is only ever reachable through its links, and once the last one goes it is
-- a row nobody can see, list, or delete without being an admin — which is how a table
-- fills up with rubbish nobody knows is there.
--
-- So: when the last link to a document goes, and that document has nothing in Storage,
-- the row goes with it.
--
-- WHY A TRIGGER RATHER THAN A SECOND DELETE FROM THE APP
--
--   The app cannot do it. `admins delete documents` means an ordinary user's cleanup
--   would be refused silently — RLS returns "no rows" rather than an error — and the app
--   would report a success it did not achieve. Widening that policy instead was the other
--   option and it is worse: it would let a user delete an uploaded file's row, losing the
--   storage path and orphaning the object in the bucket.
--
--   A trigger runs as the function's owner, so it does the one narrow thing that is safe
--   regardless of who detached: reap a pointer with nothing pointing at it.
--
-- WHY `document_storage_path is null` IS THE GUARD AND NOT `document_url is not null`
--
--   Both would cover the SharePoint case. The storage test also covers 0032's third
--   state — the row for a contract Lofty is waiting on, which has neither a path nor a
--   URL and is exactly as unreachable once detached. Testing for a URL would leave those
--   behind, which is the same rubbish under a different name.
--
--   And it is the safe half of the pair: it is the presence of a stored object, not the
--   absence of a URL, that makes deleting the row lose something.
create or replace function reap_unlinked_pointer_document() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from documents d
  where d.document_id = old.document_id
    and d.document_storage_path is null
    and not exists (
      select 1 from document_links l where l.document_id = d.document_id
    );
  return old;
end $$;

revoke execute on function reap_unlinked_pointer_document() from public, anon, authenticated;

comment on function reap_unlinked_pointer_document() is
  'After the last link to a document goes, delete the document too — but only when it has nothing in Storage. An uploaded file survives being detached (0032''s rule); a pointer with no links is reachable from nowhere and would otherwise need an admin to remove.';

-- AFTER, not BEFORE: the row has to be gone from document_links before the NOT EXISTS
-- above can be true. As a BEFORE trigger this deletes nothing, ever — the link being
-- deleted is still visible to the subquery — which is a trigger that fires, succeeds and
-- does nothing, and is the kind of green tick this repo does not accept as evidence. It
-- was watched failing that way before it was watched working.
create trigger document_links_reap_pointer after delete on document_links
  for each row execute function reap_unlinked_pointer_document();

-- ==================================================================== proof
-- Each rule watched biting, in a sub-block whose rollback removes the attempt. Everything
-- accepted is deleted explicitly, so the migration leaves both tables exactly as it found
-- them.
--
-- RLS is NOT proved here and cannot be: a migration runs as the owner and bypasses it
-- entirely. It is unchanged by this migration in any case — 0032's four policies on
-- `documents` and three on `document_links` govern the new column as they governed the
-- old ones, which is the argument for a column rather than a table.
do $$
declare
  a_job text;
  doc_id uuid;
  link_id uuid;
  still integer;
begin
  -- Not a URL. This is the one people will actually hit: a path off the file server is
  -- what gets copied when somebody has the document open rather than the link.
  begin
    insert into documents (document_name, document_url)
    values ('__proof__', '\\lofty-fs01\projects\1042\contract.pdf');
    raise exception 'a Windows path was accepted as a document URL';
  exception when check_violation then null; end;

  -- http, not https. Worth its own probe rather than trusting the regex to be read
  -- correctly: `^https://` also refuses `http://`, but only because of the anchor, and an
  -- unanchored version would accept it inside a longer string.
  begin
    insert into documents (document_name, document_url)
    values ('__proof__', 'http://lofty.sharepoint.com/x');
    raise exception 'an http document URL was accepted';
  exception when check_violation then null; end;

  -- A well-formed one is accepted, which is what proves the two above were refused for
  -- their own reasons rather than because the column refuses everything.
  insert into documents (document_name, document_url, document_category)
  values ('__proof__', 'https://lofty.sharepoint.com/proof', 'contract')
  returning document_id into doc_id;

  -- The same URL again is refused, wherever it is filed. Watched rather than assumed: a
  -- partial unique index over a nullable column is exactly the shape that silently
  -- enforces nothing when its WHERE clause is wrong.
  begin
    insert into documents (document_name, document_url)
    values ('__proof__ again', 'https://lofty.sharepoint.com/proof');
    raise exception 'the same document URL was accepted twice';
  exception when unique_violation then null; end;

  -- An upload still needs no URL, which is 0032's case and must not have become harder.
  -- Deleted immediately; it exists only to prove the column is optional.
  insert into documents (document_name, document_storage_path)
  values ('__proof__ upload', 'proof/__proof__.pdf');
  delete from documents where document_name = '__proof__ upload';

  -- ---- the reaper, both halves ----------------------------------------------
  select job_id into a_job from jobs limit 1;

  if a_job is null then
    -- Phase B never ran, so there may be no job to attach to. Say so rather than
    -- reporting a pass: the reaper is the one thing here a constraint cannot express,
    -- and "skipped" and "proved" must not look the same in the log.
    raise notice '0103: no jobs yet — the reaper was NOT proved on this database. The URL and uniqueness checks were.';
    delete from documents where document_id = doc_id;
    return;
  end if;

  insert into document_links (document_id, job_id) values (doc_id, a_job)
  returning document_link_id into link_id;

  -- Detaching the last link takes the pointer with it.
  delete from document_links where document_link_id = link_id;
  select count(*) into still from documents where document_id = doc_id;
  if still <> 0 then
    raise exception 'a pointer document survived losing its last link';
  end if;

  -- And an UPLOAD does not: the same detach, the same last link, and the row stays,
  -- because deleting it would lose the storage path and orphan the object in the bucket.
  -- This is the half that makes the guard mean something; without it the reaper would
  -- pass its test by deleting everything.
  insert into documents (document_name, document_storage_path)
  values ('__proof__ upload survives', 'proof/__survives__.pdf')
  returning document_id into doc_id;
  insert into document_links (document_id, job_id) values (doc_id, a_job)
  returning document_link_id into link_id;
  delete from document_links where document_link_id = link_id;
  select count(*) into still from documents where document_id = doc_id;
  if still <> 1 then
    raise exception 'an uploaded document was reaped when it was merely detached';
  end if;
  delete from documents where document_id = doc_id;
end
$$;
