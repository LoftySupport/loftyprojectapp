-- 0119 — A DEFECT PHOTO IS EVIDENCE YOU CAN LINK TO
--
-- THIS REVERSES 0115'S HOME FOR A MAINTENANCE PHOTO, AND THE REVERSAL IS AMBER'S
--
--   `0c`, answered 14 September, put a defect photo in `job-documents`: private, every read
--   a signed URL that expires in five minutes. That answer carried a consequence written
--   down at the time — *"an emailed report cannot simply point at these images … a signed
--   link expires and a private object has no permanent URL"*.
--
--   The report is now being built, so the consequence arrived. Asked twice, with the cost
--   stated both times, Amber reversed it: *"Keep them forever and there may be videos as
--   well. It is essential to keep these as a record"*, then *"No videos or photos are
--   private accept video and photos with permanent links"*.
--
--   **What that means, plainly, because it is not a small thing:** a photograph of a defect
--   inside somebody's house becomes fetchable by anyone who ever sees the URL, with no
--   sign-in, for good. Those are the terms `report-images` has carried since 7 September and
--   they are now the terms these carry too. It was put to her before she chose it, weighed
--   against a sheet whose pictures break minutes after it is emailed. The 0c row in
--   `docs/open-questions.md` is kept rather than rewritten, because a schema choice without
--   its reasoning gets "simplified" back into a bug by the next person.
--
-- WHY A COLUMN AND NOT JUST A SECOND BUCKET
--
--   `documents.document_storage_path` has never said WHICH bucket it is a path in. It did
--   not need to: there was one, and `JOB_DOCUMENT_BUCKET` in the repository was the whole
--   answer. Two buckets makes that constant a guess, and a guess that is wrong renders a
--   broken image rather than an error somebody notices.
--
--   `job-documents` cannot simply be made public. It holds contracts, permits and published
--   documents; `public` is a flag on the bucket, not on the object, so flipping it would put
--   every contract on a permanent URL. That is not what was asked for and nobody would want
--   it.
--
--   So: a second bucket for the media, and a column that records which bucket a row is in.
--
-- THE TWELVE THAT ARE ALREADY THERE
--
--   Twelve photographs are filed in `job-documents` today, across jobs 1002-001 and
--   1991-001. This migration does NOT move them, and cannot: the bytes are objects in
--   storage and no SQL statement copies them. They keep `document_storage_bucket =
--   'job-documents'`, which is true of them, and the app signs a private one and links a
--   public one — both paths are real, so both are handled rather than one being assumed.
--   Moving them is a separate, deliberate act with Amber's say-so, not a side effect of a
--   migration.

-- ============================================================ which bucket a row is in
alter table documents
  add column document_storage_bucket text not null default 'job-documents'
    constraint documents_storage_bucket_is_known
      check (document_storage_bucket in ('job-documents', 'maintenance-media'));

comment on column documents.document_storage_bucket is
  'Which storage bucket document_storage_path is a path in (0119). Defaults to job-documents, which is where every row written before 0119 is and where contracts, permits and published documents continue to go — private, read by signed URL. Maintenance photos and videos go to maintenance-media, which is PUBLIC: Amber, 14 September, reversing 0c — "No videos or photos are private accept video and photos with permanent links" — so a generated maintenance sheet can point at the picture instead of embedding it or watching it expire. A defect photo is therefore fetchable by anyone holding the URL, for good; that was stated before it was chosen. Constrained to the two known buckets rather than left free text, because a typo here is a broken image rather than an error.';

-- The reader groups by bucket before it signs anything, so this is the index that query wants.
create index if not exists documents_bucket_idx
  on documents (document_storage_bucket)
  where document_storage_bucket <> 'job-documents';

-- ============================================================ a video is a kind of document
--
-- `0032`'s vocabulary has nine categories and none of them is a video, because until now
-- nothing could upload one. Filing a two-minute clip of a leaking shower as `other` — beside
-- a stray spreadsheet and an unclassified scan — loses the one fact the sheet needs: a photo
-- is shown and a video is linked. Deriving it from the MIME type instead would work and is
-- what the first draft did; the category is where this schema keeps that vocabulary, and two
-- places to ask "is this a video" is one place to get a different answer.
alter table documents drop constraint if exists documents_document_category_check;
alter table documents
  add constraint documents_document_category_check
    check (document_category in ('contract', 'drawing', 'permit', 'certificate',
                                 'photo', 'video', 'invoice', 'report', 'correspondence', 'other'));

-- ==================================================================== the bucket
do $$
begin
  -- PUBLIC, and that is the whole point of the migration rather than an oversight.
  --
  -- 200 MB against job-documents' 25 MB: a two-minute clip of a leaking shower off a phone
  -- is tens of megabytes and 25 MB refuses it. The cap is still a cap — it is the guard
  -- against somebody filing a site walkthrough, which belongs in SharePoint.
  --
  -- The type list stays an allowlist, the reason 0110 gives: `image/*` makes a bucket a
  -- drive. Images are 0115's five. Video is the four a phone or a laptop actually produces
  -- — quicktime is what an iPhone records, mp4 what Android does, webm what a browser
  -- capture gives, and mpeg for the older cameras still on site.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'maintenance-media', 'maintenance-media', true, 209715200,
    array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg'
    ]
  )
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- READ is the bucket's `public` flag, not a policy: a public bucket serves its objects
  -- over a permanent URL without consulting `storage.objects` at all. The select policy
  -- below is for the API path — listing a folder in the dashboard or through the client —
  -- and it is staff-only, because being able to FETCH a photo you have the URL of is a
  -- different thing from being able to ENUMERATE every photo Lofty holds. The first is what
  -- Amber asked for; the second was never on the table.
  execute $p$
    create policy "anyone active lists maintenance media" on storage.objects
      for select to authenticated
      using (bucket_id = 'maintenance-media' and (select is_active_user()))
  $p$;

  -- WRITE: active staff, into a path shaped like the record it is for — `jobs/<job key>/…`,
  -- the same shape and the same regex reasoning as 0110. Matched with a regex rather than a
  -- cast because `'nonsense'::uuid` RAISES inside a policy and an error is a 500 rather than
  -- a refusal, which sends whoever debugs it to the wrong place.
  execute $p$
    create policy "active staff save maintenance media" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'maintenance-media'
        and (select is_active_user())
        and (storage.foldername(name))[1] = 'jobs'
        and (storage.foldername(name))[2] ~ '^[0-9][0-9A-Za-z._-]{0,63}$'
      )
  $p$;

  -- DELETE: admin only, as 0062, 0100 and 0110 all have it. Amber's reason for the whole
  -- change is that these are the record — *"It is essential to keep these as a record"* — so
  -- the person who uploaded a photo tidying up later is exactly the case to refuse.
  execute $p$
    create policy "admins remove maintenance media" on storage.objects
      for delete to authenticated
      using (bucket_id = 'maintenance-media' and (select current_permission()) >= 'admin')
  $p$;
exception
  when duplicate_object then
    raise notice '0119: storage policies already present — left as they are.';
  when undefined_table then
    -- The replay database has no storage schema. 0062, 0100 and 0110 all record the same
    -- limitation rather than papering over it: the bucket half is proved against the live
    -- project by hand, the column half is proved below.
    raise notice '0119: no storage schema here — the bucket half is not replayed.';
end
$$;

-- ==================================================================== proof
-- The column half, proved by breaking it. The bucket half cannot be proved here for the
-- reason the exception block above gives.
do $$
declare
  probe uuid;
  bucket text;
begin
  insert into documents (document_name, document_storage_path)
  values ('0119 probe', '0119/probe/' || gen_random_uuid())
  returning document_id into probe;

  -- 1. A row written the old way lands in the old bucket, which is what makes the twelve
  --    already filed keep working rather than becoming broken images.
  select document_storage_bucket into bucket from documents where document_id = probe;
  if bucket is distinct from 'job-documents' then
    raise exception '0119 proof: a document with no bucket given landed in %, expected job-documents', bucket;
  end if;

  -- 2. The new bucket is accepted.
  update documents set document_storage_bucket = 'maintenance-media' where document_id = probe;

  -- 3. Anything else is refused. Without this the column is a text field that accepts
  --    'maintenance_media' with an underscore and renders nothing, silently.
  begin
    update documents set document_storage_bucket = 'report-images' where document_id = probe;
    raise exception '0119 proof: documents_storage_bucket_is_known let an unknown bucket through';
  exception
    when check_violation then null;
  end;

  -- 4. And null is refused, so the reader never has to ask what no bucket means.
  begin
    update documents set document_storage_bucket = null where document_id = probe;
    raise exception '0119 proof: document_storage_bucket accepted null';
  exception
    when not_null_violation then null;
  end;

  -- 5. A video is a category of its own, so the sheet can tell one from a PDF without
  --    re-deriving it from the MIME type in a second place.
  update documents set document_category = 'video' where document_id = probe;

  -- 6. And the nine that were already there still are — this migration widens the
  --    vocabulary, it does not replace it.
  update documents set document_category = 'contract' where document_id = probe;
  begin
    update documents set document_category = 'moving-picture' where document_id = probe;
    raise exception '0119 proof: the category check let an unknown category through';
  exception
    when check_violation then null;
  end;

  delete from documents where document_id = probe;
  raise notice '0119 proof: the bucket defaults, constrains and refuses null; a video is a category.';
end
$$;
