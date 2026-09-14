-- 0115 — a defect photo is a document about the job
--
-- Amber, 14 September, on the maintenance drawer: *"Attach Files: (add in a section to
-- upload one or multiple a image, photo, file, pdfs, or take a photo)"*.
--
-- Asked where those photos should live, given the app's two storage paths behave
-- oppositely, she chose **`job-documents`, private**: a defect photo is filed against the
-- job like any other document and appears in that job's Documents list, and every read is
-- a short-lived signed URL.
--
-- THE ONLY THING IN THE WAY WAS THE BUCKET'S OWN ALLOWLIST
--
--   `0110` created `job-documents` with `allowed_mime_types` covering PDF, Word, HTML,
--   Markdown and plain text — the shapes a built document comes out as. **No image type is
--   on it**, so an upload of a phone photo is refused by Storage before any policy or
--   constraint is consulted. That is the whole of this migration: five image types added
--   to the allowlist of a bucket that already exists.
--
--   The allowlist stays an allowlist. `image/*` would make the bucket a drive, which is
--   the thing `0110` says the list is the cheapest guard against. HEIC and HEIF are on it
--   because an iPhone's camera roll is HEIC by default and a person photographing a
--   cracked tile should not have to convert it first.
--
-- NOTHING ELSE IS NEEDED, AND THAT IS THE POINT
--
--   `document_links.maintenance_request_id` has existed since `0084`, put there for
--   exactly this. `documents.document_category` has taken `'photo'` since `0032`. The
--   `documents` and `document_links` policies already let any active user at `user` attach
--   and detach. So the app writes two link rows for one uploaded file — one to the job, so
--   it appears in the job's Documents list the way Amber asked, and one to the maintenance
--   request, so the issue knows its own pictures — and both are ordinary rows under
--   policies that already hold.
--
--   Two links for one document is `0032`'s design rather than a workaround: a document is
--   held once and attached as many times as it is about something.
--
-- WHAT THE PRIVATE CHOICE COSTS, WRITTEN DOWN BEFORE IT SURPRISES ANYBODY
--
--   A private object has no permanent URL. The maintenance report (still to build) cannot
--   point at these images the way a shared document points at `report-images`; it has to
--   embed the bytes or sign at the moment of building, and a signed link in an email stops
--   working. That is the accepted cost of not making a photograph of somebody's house
--   permanently public to anyone who ever sees the URL.

do $$
declare
  types text[];
begin
  -- Guarded exactly as 0110 is: `verify/replay.sh` rebuilds the schema in a plain Postgres
  -- with no Storage schema at all, and an unguarded update here breaks the one check that
  -- proves this repository can rebuild production.
  if to_regclass('storage.buckets') is null then
    raise notice '0115: no storage schema (replay harness) — the bucket allowlist is skipped.';
    return;
  end if;

  -- Added to whatever is there rather than rewritten. 0110's list is the document half and
  -- this migration has no opinion about it; replacing the array would silently drop a type
  -- somebody added between then and now.
  update storage.buckets
     set allowed_mime_types = (
           select array(select distinct unnest(
             coalesce(allowed_mime_types, array[]::text[])
             || array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
           ) order by 1)
         )
   where id = 'job-documents';

  select allowed_mime_types into types from storage.buckets where id = 'job-documents';
  if types is null or not ('image/jpeg' = any(types)) then
    raise exception '0115: job-documents still refuses a photograph';
  end if;
  -- The document half has to survive: this migration adds, it does not replace.
  if not ('application/pdf' = any(types)) then
    raise exception '0115: job-documents lost application/pdf — the allowlist was replaced rather than widened';
  end if;
  -- And it is still private. A bucket flipped public is the failure this whole choice was
  -- made to avoid, and it is one column away at all times.
  if (select public from storage.buckets where id = 'job-documents') then
    raise exception '0115: job-documents is public — see the choice recorded in docs/open-questions.md';
  end if;
end
$$;

-- ==================================================================== proof
-- The bucket half cannot be proved on the replay database, because none of it exists
-- there — the same limitation 0062, 0100 and 0110 each record rather than paper over, and
-- the assertions above run inside the guarded block so they bite on production, where the
-- bucket is real. What IS proved here is the part that lives in tables: a document can be
-- attached to a maintenance request and to its job at the same time, which is what the app
-- writes for every attached photo, and neither link excludes the other.
do $$
declare
  probe_address uuid; probe_project integer; probe_job text;
  req uuid; doc uuid; doc_both uuid; n integer;
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('115', 'Probe Street 0115', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'construction') returning job_id into probe_job;
  insert into maintenance_requests (job_id, maintenance_request_summary)
  values (probe_job, 'Probe issue 0115') returning maintenance_request_id into req;

  insert into documents (document_name, document_storage_path, document_mime_type, document_size_bytes, document_category)
  values ('Probe photo 0115', 'jobs/' || probe_job || '/probe-0115.jpg', 'image/jpeg', 1234, 'photo')
  returning document_id into doc;

  -- Two links, one document. The job's Documents list finds it, and so does the issue.
  insert into document_links (document_id, job_id) values (doc, probe_job);
  insert into document_links (document_id, maintenance_request_id) values (doc, req);

  select count(*) into n from document_links where document_id = doc;
  if n <> 2 then raise exception '0115 proof: one document did not take both links (% found)', n; end if;

  -- A link naming both at once is still refused. This is the rule the app relies on to
  -- keep "which record is this about" answerable, and it is one insert away from being
  -- broken by a well-meaning simplification of the two rows above into one.
  --
  -- A SECOND document, not `doc`. Tried first with `doc`, loosening
  -- `document_links_one_parent` to `>= 1` to watch this bite: the insert was refused, but
  -- by `document_links_once_per_job` — the unique index, because `doc` already has a job
  -- link — and `exception when check_violation` did not catch a unique_violation. The
  -- probe would have reported a rule it had not tested. A fresh document removes the
  -- second guard so only the one being probed can do the refusing.
  insert into documents (document_name, document_storage_path, document_mime_type, document_size_bytes, document_category)
  values ('Probe photo 0115 b', 'jobs/' || probe_job || '/probe-0115b.jpg', 'image/jpeg', 1234, 'photo')
  returning document_id into doc_both;
  begin
    insert into document_links (document_id, job_id, maintenance_request_id) values (doc_both, probe_job, req);
    raise exception '0115 proof: a link named both a job and a request';
  exception when check_violation then null;
  end;
  delete from documents where document_id = doc_both;

  -- Deleting the request takes its link and leaves the job's, so removing an issue does
  -- not remove the photograph from the job it is about.
  delete from maintenance_requests where maintenance_request_id = req;
  select count(*) into n from document_links where document_id = doc;
  if n <> 1 then raise exception '0115 proof: deleting the request left % links, expected 1', n; end if;

  delete from documents where document_id = doc;
  delete from jobs where job_id = probe_job;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  execute format('select setval(%L, %s, %L)', seq, seq_last, seq_called);
end $$;
