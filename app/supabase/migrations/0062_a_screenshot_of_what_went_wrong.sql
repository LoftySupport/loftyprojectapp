-- 0062 — a screenshot of what went wrong
--
-- Amber, 30 Aug: "the ability to update bug tracking and Wishlist so it submits the form
-- with who submitted it and idea and any screenshots and what page it was on and errors."
--
-- Who submitted it, the page and the error are done (0052, 0060). This is the screenshots,
-- and it is the only part of the brief that needs somewhere to put bytes.
--
-- ------------------------------------------------------------- a table, and a bucket
-- The file goes in Supabase Storage; the row goes here. Both, not one:
--
--   * The bucket alone would mean the app listing a folder to find out what a report has
--     attached, and a listing is not a query — it cannot be joined, ordered or counted,
--     and it has no idea which report a file belongs to except by a naming convention
--     somebody has to keep obeying.
--   * The table alone cannot hold a PNG. `bytea` in a row read by every board render is
--     how a 40-card board becomes 60MB of JSON.
--
-- The row carries the storage path and nothing about the image's content. If the two ever
-- disagree — a row whose object was deleted — the app shows the attachment as missing,
-- which is true, rather than a broken image.

create table feedback_attachments (
  feedback_attachment_id uuid primary key default gen_random_uuid(),

  -- CASCADE: an attachment has no meaning without its report. This is the opposite call
  -- to feedback.profile_id (SET NULL) and for the opposite reason — the screenshot is
  -- part of the report, not an independent fact about the app.
  feedback_id uuid not null references feedback(feedback_id) on delete cascade,

  -- The object's path inside the bucket, exactly as uploaded. Unique, because two rows
  -- pointing at one object means deleting one report can blank an attachment on another.
  feedback_attachment_path text not null unique
    constraint feedback_attachment_path_not_blank
      check (btrim(feedback_attachment_path) <> ''),

  -- What the person called it on their machine. Shown as the link text, so a report with
  -- three screenshots reads as three named things rather than three UUIDs.
  feedback_attachment_name text not null default '',

  -- Recorded rather than trusted at render: the app decides whether to draw an <img> or
  -- offer a download from this, and asking the browser to sniff it is how a .pdf gets
  -- rendered as a broken image.
  feedback_attachment_mime text not null default '',

  -- Recorded because "why is this report slow to open" is answerable from a number and
  -- not from a folder. integer, not bigint: the upload limit below is 10MB.
  feedback_attachment_bytes integer not null default 0
    constraint feedback_attachment_bytes_not_negative check (feedback_attachment_bytes >= 0),

  feedback_attachment_created_at timestamptz not null default now()
);

comment on table feedback_attachments is
  'Screenshots on a bug or an idea (Amber, 30 Aug). One row per uploaded object; the bytes live in the feedback-screenshots storage bucket and the path is the only link between them.';

-- Every query is "the attachments on this report", which is what a board opening one card
-- asks. Nothing ever lists attachments across reports.
create index feedback_attachments_by_report_idx
  on feedback_attachments (feedback_id, feedback_attachment_created_at);

alter table feedback_attachments enable row level security;

-- Reading follows the report: 0060 opened the tracker to everyone active, and a bug you
-- can read with the screenshot hidden is a bug report with the evidence removed.
create policy "anyone active reads attachments" on feedback_attachments
  for select to authenticated
  using ((select is_active_user()));

-- Attaching is part of reporting, so it sits at the same rung as the insert on feedback —
-- but only to YOUR OWN report, and that is what the exists() clause is for. Without it
-- anybody could staple a file onto somebody else's bug, which is both a way to put an
-- image in front of the whole company and a way to make a report say something its author
-- did not.
create policy "attach to your own report" on feedback_attachments
  for insert to authenticated
  with check (
    (select is_active_user())
    and exists (
      select 1 from feedback f
      where f.feedback_id = feedback_attachments.feedback_id
        and f.profile_id = (select current_profile_id())
    )
  );

-- Removing one is admin work — the same rung as editing the report's words. The reporter
-- deliberately cannot: a screenshot somebody can quietly withdraw from a report others
-- have already acted on is a hole in the record, and "I attached the wrong one" is a
-- sentence, not a permission.
create policy "admins remove an attachment" on feedback_attachments
  for delete to authenticated
  using ((select current_permission()) >= 'admin');

-- =============================================================================
-- THE BUCKET
--
-- Guarded on `storage.buckets` existing, and that guard is not defensive habit: the
-- verify harness replays every migration into a plain Postgres with the shim's `auth`
-- and `extensions` schemas and nothing else. Supabase Storage is not part of that
-- database and never will be, so an unguarded insert here would break `replay.sh` — the
-- one check that proves the repo can rebuild production.
--
-- The consequence, stated so nobody trips on it: on a replayed database the bucket and
-- its policies DO NOT EXIST. `feedback_attachments` does, and the app's upload is what
-- fails there, visibly, rather than silently writing nowhere.
-- =============================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0062: no storage schema (replay harness) — bucket and object policies skipped.';
    return;
  end if;

  -- PRIVATE, not public. A public bucket serves every object to anyone with the URL and
  -- no session at all, and a screenshot of a bug is a screenshot of the app with real
  -- project numbers, addresses and names in it. Signed URLs are the read path.
  --
  -- 10MB and images plus PDF: a screenshot is a few hundred KB, and the limit is there so
  -- a mis-click on a video file fails at the door with a size message rather than
  -- half-uploading over a site connection.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'feedback-screenshots', 'feedback-screenshots', false, 10485760,
    array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Objects are named `<profile_id>/<uuid>-<filename>`, so the first path segment is the
  -- uploader. That is what makes "your own uploads" expressible in a policy at all —
  -- storage.objects has no column saying which report a file belongs to, and it must not
  -- get one: the link is feedback_attachments, and a second copy of it in the object path
  -- would be a second source that can disagree.
  execute $p$
    create policy "anyone active reads feedback screenshots" on storage.objects
      for select to authenticated
      using (bucket_id = 'feedback-screenshots' and (select is_active_user()))
  $p$;

  execute $p$
    create policy "upload your own feedback screenshots" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'feedback-screenshots'
        and (select is_active_user())
        and (storage.foldername(name))[1] = (select current_profile_id())::text
      )
  $p$;

  execute $p$
    create policy "admins remove feedback screenshots" on storage.objects
      for delete to authenticated
      using (bucket_id = 'feedback-screenshots' and (select current_permission()) >= 'admin')
  $p$;
exception
  when duplicate_object then
    raise notice '0062: storage policies already present — left as they are.';
end
$$;

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * a person attaches a row to somebody else's report and is refused by the with-check;
--   * a person uploads to `<somebody else's profile_id>/…` and storage refuses it;
--   * a demo account reads no attachments and uploads nothing;
--   * a non-admin's delete of an attachment row matches nothing;
--   * an anonymous request for the object URL is refused — the bucket is private, and
--     "public = false" is a claim to check with a plain curl, not to believe.
