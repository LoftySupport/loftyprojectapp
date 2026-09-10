-- 0106 — a document can be published to the job, not only to a link.
--
-- Amber, 10 September, after 0104 shipped: *"until Documents are integrated to Sharepoint,
-- please allow the option of saving to Job in the system and/or downloading it and adding a
-- link to that document file"*.
--
-- 0104 made publishing require a SharePoint address. That was right for the case it was
-- built for and wrong as the only case: SharePoint is not integrated, so "publish" meant
-- "go and save this somewhere else first, then come back and paste where you put it". For
-- anybody who has not set a folder up yet, that is a door with no handle.
--
-- =============================================================================
-- TWO WAYS TO BE PUBLISHED, AND "AND/OR" IS LITERAL
--
--   A link      — where it went, outside Lofty. 0104's column, unchanged.
--   A document  — the file itself, held here, attached to the record.
--
--   Either satisfies "published". Both together is a real and useful state rather than a
--   contradiction: the .docx saved against the job IS what was sent, and the SharePoint
--   address is where the copy people edit lives. Recording one does not make the other a
--   lie, so nothing here forces a choice.
--
--   The constraint 0104 wrote — published_at requires a url — is REPLACED rather than
--   added to, because as written it refuses the new case outright.
--
-- =============================================================================
-- THE FILE GOES IN `documents`, WHICH IS WHERE FILES ALREADY GO
--
--   0032 built `documents` (the file, held once) and `document_links` (where it is
--   attached), and 0103 taught it to hold a URL. A document saved against a job is exactly
--   that table's job — a row with a `document_storage_path`, linked to the record. So this
--   adds a POINTER from the report document to the file it produced, not a second place to
--   keep files.
--
--   ON DELETE SET NULL, not CASCADE — but SET NULL alone is not enough, and this was
--   written the wrong way first. `on delete set null` reads as "the pointer goes, the
--   publication survives", and against the constraint below that is not what happens: the
--   nulling is an UPDATE, the UPDATE leaves a published row naming neither a file nor a
--   link, and the check refuses it. The DELETE fails. Watched, on the replay database:
--
--     DELETE REFUSED: 23514 / new row for relation "report_documents" violates check
--     constraint "report_documents_published_names_where"
--
--   An admin reaping a file got a message about a constraint they have never heard of and
--   no way to act on it. So the question the FK was quietly ducking has to be answered:
--   WHAT IS A PUBLISHED DOCUMENT WHOSE PUBLISHED FILE HAS BEEN DELETED?
--
--   It is a draft. That is not a preference, it is 0104's rule applied honestly: the state
--   is derived from a fact rather than stored as a word, precisely so it *cannot* say
--   "published" about something that is not. A row still flying the published flag over a
--   file that no longer exists is the exact drift that design exists to prevent.
--
--   So `reap_publication_of_deleted_document()` below clears the publication when the file
--   it names is deleted AND no URL is left — and leaves it alone when a URL is, because
--   then the document really did go somewhere and still is there. The watermark comes back
--   on, which is the truthful thing for an editor to see.
--
-- =============================================================================
-- WHY THE BUCKET IS PRIVATE, AND WHY THAT IS NOT THE SAME DECISION AS 0100'S
--
--   0100's `report-images` is PUBLIC, and deliberately: Amber chose the simpler upload for
--   pictures a client is being sent anyway. This bucket is the opposite case. A published
--   job document is a contract, a report, a letter — the actual work product, with real
--   addresses, names and figures in it. It is served by signed URL, the same as 0062's bug
--   screenshots, and for the same reason.

alter table report_documents
  add column if not exists report_document_published_document_id uuid
    references documents (document_id) on delete set null;

comment on column report_documents.report_document_published_document_id is
  'The file this document was published AS, saved against the record in Lofty''s own storage — the alternative to report_document_published_url, and allowed alongside it. Deleting the file clears this, and where it was the only answer to "where did it go" the publication goes with it (documents_reap_publication): a document cannot stay published as a file that no longer exists. A document that also went to SharePoint keeps its publication, because the copy people were sent is still where it was sent.';

-- 0104's rule, widened. Published still has to say WHERE it went; there are now two ways
-- to answer. Dropped and recreated rather than added beside, because the old one refuses
-- the new case on its own and two checks would make the pair unsatisfiable.
alter table report_documents drop constraint if exists report_documents_published_names_where;
alter table report_documents
  add constraint report_documents_published_names_where
    check (report_document_published_at is null
           or report_document_published_url is not null
           or report_document_published_document_id is not null);

-- The column list 0095 inverted, again. Same rule, same reason: a column added to this
-- table is unreadable until it is named here, and the app asks for every column by name.
-- 0104 was the first time that bit; this is the second, and it is cheaper because the
-- first one wrote down what to do.
grant select (report_document_published_document_id) on report_documents to authenticated;

-- ================================================ the file goes, the publication goes
--
-- See the note at the top. The FK's SET NULL cannot stand on its own against the check
-- above, and the answer is not to weaken the check — it is to say what deleting the file
-- means. This runs BEFORE the delete, so the report document is already consistent by the
-- time the foreign key would have acted.
--
-- SECURITY DEFINER and a pinned search_path, as 0099 requires of every function here. No
-- auth.uid() carve-out, unlike the guards that stamp a person: this one records nothing
-- about who did it, it removes a claim that has stopped being true. A migration deleting a
-- file should leave the same consistent state a person does.
create or replace function reap_publication_of_deleted_document() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update report_documents
     set report_document_published_at = null,
         report_document_published_by = null,
         report_document_published_document_id = null
   where report_document_published_document_id = old.document_id
     -- Only where the file was the ONLY answer to "where did it go". A document published
     -- to SharePoint AND saved here is still published: the copy people were sent is
     -- exactly where it always was, and deleting Lofty's copy says nothing about it.
     and report_document_published_url is null;

  -- The both-together case, left for the foreign key: the pointer goes, published_at
  -- stays, the URL still satisfies the check. Nothing to do here.
  return old;
end $$;

revoke execute on function reap_publication_of_deleted_document() from public, anon, authenticated;

comment on function reap_publication_of_deleted_document() is
  'When a stored file is deleted, any document published AS that file and nowhere else goes back to being a draft. 0104''s rule applied honestly: published is derived from a fact, so it must not outlive the fact. Without this the delete is refused by report_documents_published_names_where, with a message an admin cannot act on.';

create trigger documents_reap_publication before delete on documents
  for each row execute function reap_publication_of_deleted_document();

-- ============================================================ where the file lives
do $$
begin
  -- Guarded exactly as 0062 and 0100 are: `verify/replay.sh` rebuilds the schema in a
  -- plain Postgres with no Storage schema at all, and an unguarded insert here breaks the
  -- one check that proves this repository can rebuild production.
  if to_regclass('storage.buckets') is null then
    raise notice '0106: no storage schema (replay harness) — bucket and object policies skipped.';
    return;
  end if;

  -- PRIVATE. See the note above: this is the work product, not a decoration inside it.
  --
  -- 25MB rather than 0062's 10: a bug screenshot is a few hundred KB, and a published
  -- report with site photographs in it is not. The limit is still there so a mis-picked
  -- video fails at the door with a size message rather than half-uploading over a site
  -- connection.
  --
  -- The types are what this app can actually produce or that somebody would file as the
  -- sent version: Word, PDF, and the HTML the builder also exports. Deliberately NOT a
  -- free-for-all — an allowlist is the cheapest guard against a bucket becoming a drive.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'job-documents', 'job-documents', false, 26214400,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/html',
      'text/markdown',
      'text/plain'
    ]
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- READ: any active member of staff, by signed URL. A published document is internal work
  -- product and reads like every other record in this schema — the same line 0094 draws for
  -- the documents themselves. Somebody outside Lofty reaches it through the share token or
  -- not at all.
  execute $p$
    create policy "anyone active reads job documents" on storage.objects
      for select to authenticated
      using (bucket_id = 'job-documents' and (select is_active_user()))
  $p$;

  -- WRITE: any active member of staff, into a path shaped like the record it is for.
  --
  -- The shape is enforced so the bucket cannot become a flat pile of uuids: the first
  -- segment is `jobs` or `projects` and the second is the record's own key. Matched with a
  -- regex rather than a cast, the lesson 0100 records — `'nonsense'::uuid` RAISES inside a
  -- policy, and an error is a 500 rather than a refusal, which sends whoever debugs it to
  -- the wrong place.
  --
  -- A job key is `1042-01`, a project key is digits. Neither is a uuid, which is why this
  -- pattern is not 0100's.
  execute $p$
    create policy "active staff save job documents" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'job-documents'
        and (select is_active_user())
        and (storage.foldername(name))[1] in ('jobs', 'projects')
        and (storage.foldername(name))[2] ~ '^[0-9][0-9A-Za-z._-]{0,63}$'
      )
  $p$;

  -- DELETE: admin only, as 0062 and 0100 both have it. Not the uploader — a published
  -- document somebody else now relies on should not vanish because the person who saved it
  -- decided to tidy up. The `documents` row is unfiled by ordinary detaching; reaping the
  -- object behind it is a separate, rarer, admin act.
  execute $p$
    create policy "admins remove job documents" on storage.objects
      for delete to authenticated
      using (bucket_id = 'job-documents' and (select current_permission()) >= 'admin')
  $p$;
exception
  when duplicate_object then
    raise notice '0106: storage policies already present — left as they are.';
end
$$;

-- ==================================================================== proof
-- The constraint half is proved here. The bucket half cannot be — none of it exists on the
-- replay database, so a probe asserting it would assert nothing, which is the limitation
-- 0062 and 0100 both record rather than paper over.
--
-- What was checked by hand against the live project, and what was not, is written into
-- docs/schema/schema-plan.md beside this migration rather than claimed here.
do $$
declare
  made uuid;
  a_person uuid;
  a_doc uuid;
begin
  select profile_id into strict a_person from profiles limit 1;

  insert into documents (document_name, document_storage_path)
  values ('__proof__ published file', 'jobs/__proof__/x.docx')
  returning document_id into a_doc;

  insert into report_documents (report_document_title) values ('__proof__ 0106')
  returning report_document_id into made;

  -- THE NEW CASE, and the whole point of the migration: published with a FILE and no URL.
  -- 0104's constraint refused exactly this, so it is the probe that proves the widening
  -- landed rather than merely being written.
  update report_documents
     set report_document_published_at = now(),
         report_document_published_by = a_person,
         report_document_published_document_id = a_doc
   where report_document_id = made;

  -- Still refused: published and saying nothing about where it went. Widening a constraint
  -- is the easiest way to widen it to nothing, so the half that must still bite is watched
  -- biting.
  begin
    update report_documents
       set report_document_published_document_id = null,
           report_document_published_url = null
     where report_document_id = made;
    raise exception 'a published document was allowed to name neither a file nor a link';
  exception when check_violation then null; end;

  -- And both together is accepted — the "and/or" in Amber's sentence, made a fact rather
  -- than an intention.
  update report_documents
     set report_document_published_url = 'https://lofty.sharepoint.com/sites/jobs/1103/report.docx'
   where report_document_id = made;

  -- ---- deleting the file, with a URL still standing. The publication SURVIVES: the copy
  -- that was sent is still where it was sent, and only the pointer to Lofty's copy goes.
  delete from documents where document_id = a_doc;

  if (select report_document_published_at from report_documents where report_document_id = made) is null then
    raise exception 'deleting the stored copy un-published a document that also went to SharePoint';
  end if;
  if (select report_document_published_document_id from report_documents where report_document_id = made) is not null then
    raise exception 'a document still points at a file that was deleted';
  end if;

  -- ---- and deleting the file when it was the ONLY answer. The document goes back to
  -- being a draft, and the delete is ACCEPTED — which is the whole of the fix: written the
  -- obvious way, with the foreign key left to do it alone, this delete is refused with a
  -- check-constraint error an admin cannot act on.
  insert into documents (document_name, document_storage_path)
  values ('__proof__ only copy', 'jobs/__proof__/only.docx')
  returning document_id into a_doc;

  update report_documents
     set report_document_published_at = now(),
         report_document_published_by = a_person,
         report_document_published_url = null,
         report_document_published_document_id = a_doc
   where report_document_id = made;

  delete from documents where document_id = a_doc;

  if (select report_document_published_at from report_documents where report_document_id = made) is not null then
    raise exception 'a document is still published as a file that no longer exists';
  end if;
  if (select report_document_published_by from report_documents where report_document_id = made) is not null then
    raise exception 'the publisher outlived the publication';
  end if;

  delete from report_documents where report_document_id = made;
end
$$;
