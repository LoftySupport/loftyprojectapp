-- 0111 — one published copy per document, and the last one goes.
--
-- Amber, 10 September, asked whether the copies a document leaves on a job are a version
-- history or clutter: *"only onver version of the document. if they want another copy they
-- can download it"*.
--
-- 0110 let a document be published by saving the file against the record. Publish, edit,
-- publish again, and the job held TWO files — both under the document's title, one out of
-- date, nothing on either row saying which was current. On a job that runs eighteen months
-- that list is unreadable, and an unreadable list of contracts is worse than a short one.
--
-- =============================================================================
-- THE VERSION CHAIN IS DELIBERATELY NOT USED
--
--   `documents.supersedes_id` exists for exactly this shape, and 0032 argues for it well:
--   *"a version integer cannot say WHICH document a revision revises"*. It is the right
--   tool for a drawing that goes to revision C and whose revision B somebody still needs.
--
--   It is the wrong tool here, because Amber's answer is not "show the old one behind the
--   new one" — it is that the old one is not wanted. Chaining would keep every superseded
--   file in storage forever to serve a question nobody asked, and the second half of her
--   sentence says what to do instead: download it first if you want it.
--
-- =============================================================================
-- A TRIGGER, NOT A RULE THE PANEL KEEPS
--
--   The same argument 0104 makes about the revert, and it holds harder here: the panel
--   publishes today, and the builder will, and the importer might. "Remember to remove the
--   copy the last publish saved" is a promise every one of them has to keep, and the first
--   one that forgets leaves a job with two contracts on it and no way to tell which was
--   sent.
--
--   SECURITY DEFINER, and that is load-bearing rather than habitual: 0032 makes deleting a
--   `documents` row ADMIN-ONLY, while re-publishing is ordinary `user` work. Without the
--   definer the delete matches no rows, silently, for everybody except an admin — which is
--   the worst of the three possible failures, because it looks like it worked.
--
-- =============================================================================
-- ONE CARVE-OUT, AND IT IS NOT A HEDGE
--
--   A copy that somebody has since filed on ANOTHER record is left alone — unpointed, but
--   not deleted. `documents` holds a file ONCE and `document_links` says where it is
--   attached (0032), so deleting it would take a document off a job nobody was publishing
--   to. That is somebody else's filing, and re-publishing here is not a reason to undo it.
--
--   The ordinary case — the copy this publish made, attached to this record and nowhere
--   else — is deleted outright, links and all.

create or replace function replace_previous_published_copy() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  gone uuid := old.report_document_published_document_id;
  elsewhere integer;
begin
  -- Only when the pointer actually MOVED TO ANOTHER FILE. Three ways it does not:
  --
  --   * there was no copy to supersede;
  --   * the pointer was written back with the value it already had (`update of` fires on
  --     assignment, not on change);
  --   * IT WAS CLEARED. This third one is not tidiness — without it the two triggers
  --     deadlock on each other, and `verify/rls.sql` is where that was found:
  --
  --       FAIL: an admin could not delete a published file — 27000 / tuple to be deleted
  --       was already modified by an operation triggered by the current command
  --
  --     An admin deleting a published file fires 0110's reap, which clears the pointer,
  --     which fires THIS trigger, which tries to delete the row the outer command is
  --     already deleting. Nothing about that delete is wrong — the file is going, and
  --     there is no superseding copy to make room for. Clearing the pointer is never this
  --     trigger's business; only replacing it is.
  if gone is null
     or new.report_document_published_document_id is null
     or gone is not distinct from new.report_document_published_document_id
  then
    return null;
  end if;

  -- Filed anywhere other than this record? Then it is somebody else's now — see the
  -- carve-out at the top. Written as the negation of "is this record"
  -- rather than as two inequalities: `document_links_one_parent` (0032) means one of the
  -- two columns is always null, and a pair of `is distinct from` clauses over a nullable
  -- pair reads as though it says this and does not.
  select count(*) into elsewhere
    from document_links l
   where l.document_id = gone
     and not (l.job_id is not distinct from new.job_id
              and l.project_id is not distinct from new.project_id);

  if elsewhere > 0 then
    return null;
  end if;

  -- THE BYTES ARE NOT DELETED HERE, and that is not an omission — it was tried.
  --
  -- This trigger first did `delete from storage.objects` beside the row delete. It
  -- replayed perfectly, because the verify harness rebuilds into a plain Postgres with no
  -- storage schema at all and the whole branch was guarded away. THE LIVE DATABASE
  -- refused it on the first apply:
  --
  --   42501: Direct deletion from storage tables is not allowed. Use the Storage API
  --   instead.  HINT: This prevents accidental data loss from orphaned objects.
  --   CONTEXT: PL/pgSQL function storage.protect_delete()
  --
  -- Supabase owns that table and will not have SQL reach into it. The object therefore
  -- OUTLIVES the row: superseded copies stay in the `job-documents` bucket, unreachable
  -- from the app because nothing points at them any more, costing storage and nothing
  -- else. That is the same shape 0062 already lives with — deleting a feedback attachment
  -- row does not delete its screenshot — and it is written here rather than discovered by
  -- somebody wondering why a private bucket keeps growing.
  --
  -- Sweeping them needs the Storage API, so it is an admin job or a scheduled one, not a
  -- trigger's. Left undone deliberately rather than done wrongly: the alternative on offer
  -- was widening the bucket's admin-only delete policy to every member of staff, which
  -- buys tidiness with the rule that stops somebody removing a published contract.
  --
  -- Worth keeping for its own sake: replaying a migration proves the DDL applies, and this
  -- is a rule no replay could have caught, because the object it guards does not exist
  -- there.

  -- The row. `document_links` is ON DELETE CASCADE from here (0032), so the attachment
  -- goes with it and the record's Documents list loses the stale copy in the same
  -- statement it gains the new one.
  delete from documents where document_id = gone;

  return null;
end $$;

revoke execute on function replace_previous_published_copy() from public, anon, authenticated;

comment on function replace_previous_published_copy() is
  'Publishing a document again removes the copy the previous publish saved on the record — Amber, 10 Sep: "only onver version of the document. if they want another copy they can download it". AFTER, because it reads the row''s new job and project to decide whether the old copy is filed anywhere else; SECURITY DEFINER because deleting a documents row is admin-only (0032) while re-publishing is ordinary user work.';

-- AFTER, NOT BEFORE, and this was written the other way first and tried.
--
-- As a BEFORE trigger it does not merely misbehave, it does not terminate:
--
--   ERROR:  stack depth limit exceeded
--
-- The chain is short once seen. BEFORE, the row still holds the OLD pointer, so deleting
-- the superseded file fires 0110's reap — which finds a report document still naming that
-- file and UPDATEs the pointer to null. That update fires this trigger again, which
-- deletes again, which reaps again, all the way down.
--
-- AFTER, the new pointer is already in the row, 0110's reap matches nothing, and the two
-- triggers never see each other. Ordering them by name would be a rule nobody can see in
-- the schema; ordering them by phase is one the database enforces.
create trigger report_documents_replace_published_copy
  after update of report_document_published_document_id on report_documents
  for each row execute function replace_previous_published_copy();

-- ==================================================================== proof
-- Projects are seeded (110 of them) and jobs are not until the import runs, so the
-- records here are projects. Nothing about the rule is job-shaped — the trigger compares
-- whatever pair the report document carries.
do $$
declare
  made uuid;
  a_person uuid;
  mine integer;
  other integer;
  copy1 uuid; copy2 uuid; copy3 uuid; copy4 uuid;
begin
  select profile_id into strict a_person from profiles limit 1;
  -- STRICT on both: without two distinct projects the carve-out below would test nothing
  -- and report a pass it had not earned.
  select project_id into strict mine from projects order by project_id limit 1;
  select project_id into strict other from projects order by project_id desc limit 1;
  if mine = other then
    raise exception 'the proof needs two projects and found one';
  end if;

  insert into report_documents (report_document_title, project_id)
  values ('__proof__ 0111', mine)
  returning report_document_id into made;

  insert into documents (document_name, document_storage_path)
  values ('__proof__ copy 1', 'projects/__proof__/1.docx') returning document_id into copy1;
  insert into document_links (document_id, project_id) values (copy1, mine);

  update report_documents
     set report_document_published_at = now(),
         report_document_published_by = a_person,
         report_document_published_document_id = copy1
   where report_document_id = made;

  -- THE RULE. Publishing again replaces the copy rather than adding one beside it.
  insert into documents (document_name, document_storage_path)
  values ('__proof__ copy 2', 'projects/__proof__/2.docx') returning document_id into copy2;
  insert into document_links (document_id, project_id) values (copy2, mine);

  update report_documents
     set report_document_published_document_id = copy2
   where report_document_id = made;

  if exists (select 1 from documents where document_id = copy1) then
    raise exception 'publishing again left the previous copy on the record';
  end if;
  if not exists (select 1 from documents where document_id = copy2) then
    raise exception 'publishing again removed the copy it had just saved';
  end if;
  -- The replacement must not disturb the publication itself. This is the assertion that
  -- catches the trigger being written BEFORE instead of AFTER: 0110's reap then sees a
  -- published row still naming the file being deleted and takes the publication back, so
  -- the document goes to draft in the middle of being published.
  if (select report_document_published_at from report_documents where report_document_id = made) is null then
    raise exception 'replacing the copy took the publication back';
  end if;

  -- Re-publishing with a LINK and no new file touches nothing. This one is about the
  -- `update of` clause on the trigger: a statement that never mentions the pointer column
  -- must not fire it at all.
  update report_documents
     set report_document_published_url = 'https://lofty.sharepoint.com/sites/p/r.docx'
   where report_document_id = made;
  if not exists (select 1 from documents where document_id = copy2) then
    raise exception 'publishing to a link deleted the copy saved on the record';
  end if;

  -- And this one is about the guard INSIDE the function, which is a different protection
  -- and needs its own probe: `update of` fires on ASSIGNMENT, not on change, so a caller
  -- writing the pointer back with the value it already had gets here with old = new.
  -- Broken by testing `gone is not null` alone — the copy currently published is then
  -- deleted by the very statement re-publishing it, and the row is left naming a file that
  -- no longer exists.
  update report_documents
     set report_document_published_document_id = copy2
   where report_document_id = made;
  if not exists (select 1 from documents where document_id = copy2) then
    raise exception 'writing the pointer back unchanged deleted the copy it names';
  end if;

  -- THE CARVE-OUT. copy3 is filed on this project AND on another one. Superseding it must
  -- unpoint it and leave it filed where somebody else put it.
  insert into documents (document_name, document_storage_path)
  values ('__proof__ copy 3', 'projects/__proof__/3.docx') returning document_id into copy3;
  insert into document_links (document_id, project_id) values (copy3, mine);
  insert into document_links (document_id, project_id) values (copy3, other);

  update report_documents
     set report_document_published_document_id = copy3
   where report_document_id = made;
  if exists (select 1 from documents where document_id = copy2) then
    raise exception 'the copy this record alone held survived being superseded';
  end if;

  insert into documents (document_name, document_storage_path)
  values ('__proof__ copy 4', 'projects/__proof__/4.docx') returning document_id into copy4;
  insert into document_links (document_id, project_id) values (copy4, mine);

  update report_documents
     set report_document_published_document_id = copy4
   where report_document_id = made;

  if not exists (select 1 from documents where document_id = copy3) then
    raise exception 'a copy filed on another record was deleted by a re-publish';
  end if;
  if not exists (select 1 from document_links where document_id = copy3 and project_id = other) then
    raise exception 'the other record lost its attachment';
  end if;

  -- AND THE FILE ITSELF CAN STILL BE DELETED. This is the probe that found the deadlock
  -- between the two triggers, and it only bites with NO URL — which is the condition
  -- 0110's reap needs before it clears the pointer, and the clearing is what brought this
  -- trigger down on the row the outer command was already deleting:
  --
  --   27000 / tuple to be deleted was already modified by an operation triggered by the
  --   current command
  --
  -- With a URL standing, the reap declines and the pointer is cleared by the foreign key
  -- instead, AFTER the delete has finished — which never collided and so never reported.
  -- The first version of this probe left the URL set and passed against the broken
  -- trigger; verify/rls.sql caught it because its admin deletes a file-only publication.
  update report_documents
     set report_document_published_url = null
   where report_document_id = made;

  begin
    delete from documents where document_id = copy4;
  exception when others then
    raise exception 'deleting the published file failed — % / %', sqlstate, sqlerrm;
  end;
  if exists (select 1 from documents where document_id = copy4) then
    raise exception 'the published file was not deleted';
  end if;
  -- 0110's rule, unchanged by any of this: the file was the only answer to "where did it
  -- go", so the document is a draft again.
  if (select report_document_published_at from report_documents where report_document_id = made) is not null then
    raise exception 'a document is still published as a file that no longer exists';
  end if;

  delete from report_documents where report_document_id = made;
  delete from documents where document_id = copy3;
end
$$;
