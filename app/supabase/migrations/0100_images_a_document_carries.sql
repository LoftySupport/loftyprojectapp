-- 0100 — images a document carries.
--
-- Amber, 7 September: *"upload to public bucket that stores in the document only"*.
--
-- The Image block took a URL and nothing else, so putting a site photo in a report meant
-- hosting the photo somewhere first. This is the bucket it goes into instead.
--
-- =============================================================================
-- PUBLIC, AND THAT WAS ASKED FOR AFTER THE TRADE WAS PUT
--
--   0062's bucket is private and this one is not, so the difference is worth recording
--   rather than looking like an oversight.
--
--   The alternative offered was a signed URL written into the share snapshot with the
--   same expiry as the link, so that revoking a shared document revoked its pictures too.
--   Amber chose the public bucket. **The consequence, stated plainly: an image in a
--   shared document stays fetchable at its URL after the link expires.** `0095` made a
--   share link's expiry mandatory because nothing should be forever; the images are now
--   the exception to that, deliberately, in exchange for a much simpler upload.
--
--   What that costs is bounded by what goes in here: a logo, a site photo, a diagram —
--   things somebody is choosing to put in a document they are sending to a client
--   anyway. It is not a hole in RLS. Nothing derived from a job, a property or a person
--   is in this bucket; those are read live and rendered by the browser at export time.
--
--   If that trade is ever revisited, the change is: flip `public` to false, and have
--   `compileForShare` sign each image URL with the link's own expiry. The layout stores a
--   URL either way, so nothing about the block or the document has to change.
--
-- =============================================================================
-- "STORES IN THE DOCUMENT ONLY" — WHY THERE IS NO SECOND TABLE
--
--   0062 needed `feedback_attachments`, because a screenshot has to be findable from the
--   report it belongs to and storage.objects has no column for that. **An image in a
--   report does not have that problem.** The layout already names it: the block holds
--   the URL, and the block is in `report_document_layout`. A row here as well would be a
--   second record of the same fact, and the two would disagree the first time somebody
--   deleted the block.
--
--   So: no table. The document IS the record of what images it carries, exactly as asked.
--   The cost is that an image whose block was deleted is orphaned in the bucket rather
--   than reaped, which is a housekeeping job and not a correctness one.
--
--   The object path carries the record anyway — `documents/<id>/…` or `library/<id>/…` —
--   because a flat bucket of uuids is impossible to audit by eye, and because it makes
--   "what did this document upload" answerable with a prefix list. It is a convenience,
--   NOT a source of truth: the layout is. Nothing reads the path to decide anything.

do $$
begin
  -- Guarded exactly as 0062 is, and for the same reason: `verify/replay.sh` rebuilds the
  -- schema in a plain Postgres that has no Storage. Unguarded, this breaks the one check
  -- that proves the repo can rebuild production. On a replayed database the bucket does
  -- not exist and the app's upload fails visibly rather than writing nowhere.
  if to_regclass('storage.buckets') is null then
    raise notice '0100: no storage schema (replay harness) — bucket and object policies skipped.';
    return;
  end if;

  -- Images only, and no PDF: 0062 allows PDF because a bug report may have one attached,
  -- but this is the Image block and a PDF in it renders as a broken picture. 10MB matches
  -- 0062 so there is one number to remember, and it is there so a mis-picked video fails
  -- at the door with a size message rather than half-uploading over a site connection.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'report-images', 'report-images', true, 10485760,
    array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
  )
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- READ: the bucket's `public` flag is what serves these over HTTP with no session, and
  -- that is the read path the documents use. This policy is for the API — listing and
  -- managing from a signed-in session — and is deliberately NOT the thing that makes a
  -- client's browser able to see the picture. Removing it would not lock the bucket.
  execute $p$
    create policy "anyone active lists report images" on storage.objects
      for select to authenticated
      using (bucket_id = 'report-images' and (select is_active_user()))
  $p$;

  -- WRITE: any active member of staff, into a path shaped like a record's folder.
  --
  -- The floor is `user` and not the document's own editability, and that is a choice: a
  -- cross-table lookup per upload would tie the two together, but every user can create
  -- a document anyway, so it would buy nothing but a slower upload and a policy that has
  -- to be rewritten every time the document rules move. What it would prevent is
  -- uploading a stray object into another document's folder — a nuisance, because the
  -- layout references specific URLs and never lists the folder.
  --
  -- The shape IS enforced, so the bucket cannot become a flat dumping ground: the first
  -- segment is one of two known words and the second looks like a uuid. Matched with a
  -- regex rather than a cast, because `'nonsense'::uuid` raises inside a policy and an
  -- error is not a refusal.
  execute $p$
    create policy "active staff upload report images" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'report-images'
        and (select is_active_user())
        and (storage.foldername(name))[1] in ('documents', 'library')
        and (storage.foldername(name))[2] ~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
  $p$;

  -- DELETE: admin only, as 0062 has it. Not the uploader — an image referenced by a
  -- document somebody else now owns should not vanish because the person who uploaded it
  -- decided to tidy up. Reaping orphans is an admin job, and a rare one.
  execute $p$
    create policy "admins remove report images" on storage.objects
      for delete to authenticated
      using (bucket_id = 'report-images' and (select current_permission()) >= 'admin')
  $p$;
exception
  when duplicate_object then
    raise notice '0100: storage policies already present — left as they are.';
end
$$;

-- ---------------------------------------------------------------------------- proof
-- WHAT IS PROVED HERE: NOTHING, and that is the same limitation 0062 records. None of
-- this exists on the replay database, so a DO block asserting it would assert nothing
-- there — the sort of green tick that means less than silence.
--
-- WHAT WAS ACTUALLY CHECKED, against the live project, and what was not:
--
--   CHECKED — the path-shape predicate, evaluated on seven paths. It is the half of the
--   policy written by hand and so the half that can be wrong:
--
--     documents/<uuid>/site.png          → true
--     library/<uuid>/logo.png            → true
--     nonsense/<uuid>/x.png              → false   (first segment is not a folder here)
--     documents/not-a-uuid/x.png         → false   (refused, not raised — see below)
--     documents/../../etc/x.png          → false
--     documents/<UPPERCASE-UUID>/x.png   → false
--     x.png                              → NULL
--
--   That last one is worth its own line. `(storage.foldername('x.png'))[1]` is NULL, so
--   the whole expression is NULL — and a WITH CHECK treats NULL as a refusal, which is
--   the answer wanted. It is the same NULL trap 0094 hit from the other side, where a
--   CHECK treated NULL as a PASS and accepted a layout with no widgets. Worth knowing
--   which way round each one falls rather than assuming they agree.
--
--   The regex is why `documents/not-a-uuid/…` is REFUSED rather than ERRORING. Written
--   as `(storage.foldername(name))[2]::uuid` it would raise 22P02 inside the policy, and
--   an error is not a refusal: it surfaces as a 500 rather than a permission denial, and
--   somebody debugging it looks in the wrong place.
--
--   NOT CHECKED, and stated rather than implied — each needs a real authenticated JWT or
--   an HTTP client, neither of which this session had against the live project:
--     * that an active user's upload to a well-formed path is accepted end to end;
--     * that a non-admin's delete matches nothing;
--     * that the object comes back over plain HTTP with no Authorization header.
--   The bucket row says `public = true` and the policies are attached — both verified by
--   query — but "public" is a claim to confirm with curl, and it has not been.
