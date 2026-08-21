-- =============================================================================
-- 0032 — what people attach to a record: documents, comments, tags, activity
-- =============================================================================
-- The last structural batch. Everything here hangs off a record rather than defining
-- one, which is why it comes after the four axes rather than among them: none of it
-- changes the shape of a project, a job or a task, and all of it would have to be
-- rewritten if that shape were still moving.
--
-- ------------------------------------------------- one link table, not one per parent
-- A document can be attached to a project, a job, a task or a variation. The obvious
-- shape is four columns and a check, the way tasks and address_history do it — and it
-- stops working here, because the same PDF is genuinely attached to several records at
-- once: a soil report belongs to the project AND to each job on it.
--
-- So `documents` holds the file once and `document_links` holds the attachments, with
-- the exclusive arc on the LINK rather than on the document. The file is stored once,
-- named once, and versioned once, however many records point at it.
--
-- ------------------------------------------------- comments and activity are not the same
-- 0008 built `activity_audit` as a forensic log: every column change, admin-readable,
-- append-only, jsonb. It is the wrong thing to render in a drawer — it is unreadable, it
-- is admin-only, and a comment is not a change.
--
-- So three tables, deliberately:
--
--   activity_audit    every column change, forensic, admin-only, jsonb  (0008)
--   activity_events   the readable feed: "Deanna moved this to Construction"
--   comments          what people wrote, editable by their author
--
-- Merging comments into events was the shape the old spec proposed. It fails because a
-- comment is user-authored and mutable while an event must be append-only, and one table
-- cannot be both without the append-only half becoming a convention rather than a rule.
-- =============================================================================

-- ============================================================================
-- 1. documents
-- ============================================================================
create table documents (
  document_id uuid primary key default gen_random_uuid(),

  document_name text not null check (length(trim(document_name)) > 0),
  document_description text,

  -- The path in Supabase Storage. Nullable so a row can exist for a document Lofty
  -- knows about but has not uploaded — "the signed contract" as a checklist item that
  -- is not there yet is a real and useful state.
  document_storage_path text unique,
  document_mime_type text,
  document_size_bytes bigint check (document_size_bytes >= 0),

  -- What kind of thing it is, for filtering a drawer that will hold dozens. Text with a
  -- check: this list will grow, and every one that has grown so far was an enum first.
  document_category text not null default 'other'
    check (document_category in ('contract', 'drawing', 'permit', 'certificate',
                                 'photo', 'invoice', 'report', 'correspondence', 'other')),

  -- Versions as a chain rather than a number: each row points at the one it replaced.
  -- A version integer on its own cannot say WHICH document a revision revises when two
  -- people upload at once, and superseding is the fact people actually want ("show me
  -- the current drawing, and what it replaced").
  document_supersedes_id uuid references documents(document_id) on delete set null,

  document_created_at timestamptz not null default now(),
  document_created_by uuid references profiles(profile_id),
  document_updated_at timestamptz not null default now(),
  document_updated_by uuid references profiles(profile_id),

  constraint documents_not_its_own_predecessor
    check (document_supersedes_id is distinct from document_id)
);

comment on table documents is
  'A file, held once. Which records it is attached to lives in document_links, because the same soil report genuinely belongs to a project and to every job on it — storing it per attachment would mean four copies of one PDF and four places for the name to drift.';

create index documents_supersedes_idx on documents (document_supersedes_id)
  where document_supersedes_id is not null;
create index documents_category_idx on documents (document_category);

-- A document is current when nothing supersedes it. Derived, so it cannot disagree with
-- the chain.
create view documents_current with (security_invoker = true) as
  select d.*
  from documents d
  where not exists (
    select 1 from documents newer where newer.document_supersedes_id = d.document_id
  );

-- ============================================================================
-- 2. document_links — the attachments
-- ============================================================================
create table document_links (
  document_link_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(document_id) on delete cascade,

  -- Exactly one parent PER LINK. A document with four links is attached to four records;
  -- a link with two parents is a mistake.
  project_id integer references projects(project_id) on update cascade on delete cascade,
  job_id text references jobs(job_id) on update cascade on delete cascade,
  task_id uuid references tasks(task_id) on delete cascade,
  variation_id uuid references variations(variation_id) on delete cascade,

  document_link_created_at timestamptz not null default now(),
  document_link_created_by uuid references profiles(profile_id),

  constraint document_links_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id) = 1)
);

comment on table document_links is
  'Which records a document is attached to. Separate from the document so one file can hang off a project and every job on it at once, which four columns on `documents` could not express.';

-- Partial on each arm, because exactly one is ever set — a full index would be
-- three-quarters dead entries on every one of them.
create index document_links_project_idx on document_links (project_id) where project_id is not null;
create index document_links_job_idx on document_links (job_id) where job_id is not null;
create index document_links_task_idx on document_links (task_id) where task_id is not null;
create index document_links_variation_idx on document_links (variation_id) where variation_id is not null;
create index document_links_document_idx on document_links (document_id);

-- The same document attached to the same record twice is a double-click, not a fact.
-- Partial unique per arm, because a null in a unique index does not collide with itself
-- and a single four-column unique would therefore never fire.
create unique index document_links_once_per_project
  on document_links (document_id, project_id) where project_id is not null;
create unique index document_links_once_per_job
  on document_links (document_id, job_id) where job_id is not null;
create unique index document_links_once_per_task
  on document_links (document_id, task_id) where task_id is not null;
create unique index document_links_once_per_variation
  on document_links (document_id, variation_id) where variation_id is not null;

-- ============================================================================
-- 3. comments
-- ============================================================================
create table comments (
  comment_id uuid primary key default gen_random_uuid(),

  project_id integer references projects(project_id) on update cascade on delete cascade,
  job_id text references jobs(job_id) on update cascade on delete cascade,
  task_id uuid references tasks(task_id) on delete cascade,
  variation_id uuid references variations(variation_id) on delete cascade,

  comment_body text not null check (length(trim(comment_body)) > 0),

  -- Threading, one level deep in practice but unbounded in shape.
  parent_comment_id uuid references comments(comment_id) on delete cascade,

  -- Edited, not rewritten silently. A comment that changed with no sign it changed is
  -- how a record of a conversation stops being one.
  comment_edited_at timestamptz,

  comment_created_at timestamptz not null default now(),
  comment_created_by uuid references profiles(profile_id),
  comment_updated_at timestamptz not null default now(),
  comment_updated_by uuid references profiles(profile_id),

  constraint comments_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id) = 1),
  constraint comments_not_its_own_parent
    check (parent_comment_id is distinct from comment_id)
);

comment on table comments is
  'What people wrote on a record. Separate from activity_events because a comment is user-authored and mutable while an event must be append-only, and one table cannot be both without the append-only half becoming a convention rather than a rule.';

create index comments_project_idx on comments (project_id, comment_created_at desc) where project_id is not null;
create index comments_job_idx on comments (job_id, comment_created_at desc) where job_id is not null;
create index comments_task_idx on comments (task_id, comment_created_at desc) where task_id is not null;
create index comments_variation_idx on comments (variation_id, comment_created_at desc) where variation_id is not null;
create index comments_thread_idx on comments (parent_comment_id) where parent_comment_id is not null;

-- Marks a comment as edited whenever its body actually changes. On the body specifically,
-- not on any update: moving a comment or backfilling a column is not an edit, and a
-- comment falsely marked edited is as misleading as one silently changed.
create or replace function touch_comment_edited_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.comment_body is distinct from old.comment_body then
    new.comment_edited_at := now();
  end if;
  return new;
end $$;

create trigger comments_touch_edited before update of comment_body on comments
  for each row execute function touch_comment_edited_at();

-- ------------------------------------------------------------------- mentions
create table comment_mentions (
  comment_id uuid not null references comments(comment_id) on delete cascade,
  profile_id uuid not null references profiles(profile_id) on delete cascade,

  -- Set when the person has seen it. Null means unread, which is the whole point of the
  -- table — a mention nobody can mark as read is a notification that never stops.
  comment_mention_read_at timestamptz,
  comment_mention_created_at timestamptz not null default now(),

  primary key (comment_id, profile_id)
);

comment on table comment_mentions is
  'Who was @-mentioned in a comment, and whether they have seen it. A table rather than parsing the body on read: the body is text people edit, and a mention that disappears when somebody fixes a typo is not a notification.';

create index comment_mentions_unread_idx on comment_mentions (profile_id)
  where comment_mention_read_at is null;

-- ============================================================================
-- 4. activity_events — the readable feed
-- ============================================================================
-- What the drawer renders. Distinct from activity_audit, which is forensic, admin-only
-- and jsonb: "Deanna moved this to Construction" is not something you can assemble from
-- a diff of two blobs without knowing what every column means.
create table activity_events (
  activity_event_id bigint generated always as identity primary key,

  project_id integer references projects(project_id) on update cascade on delete cascade,
  job_id text references jobs(job_id) on update cascade on delete cascade,
  task_id uuid references tasks(task_id) on delete cascade,
  variation_id uuid references variations(variation_id) on delete cascade,

  -- What happened, as a key the app renders rather than a sentence stored in the
  -- database. A stored sentence cannot be re-worded, translated or re-rendered when the
  -- vocabulary changes, and it will.
  activity_event_kind text not null,

  -- The nouns the sentence needs: which stage, which team, which field. jsonb because
  -- the shape differs per kind and the alternative is thirty nullable columns.
  activity_event_detail jsonb not null default '{}',

  activity_event_at timestamptz not null default now(),
  activity_event_by uuid references profiles(profile_id),

  constraint activity_events_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id) = 1)
);

comment on table activity_events is
  'The readable activity feed. Separate from activity_audit, which is a forensic column-level log that is admin-only and stores whole rows as jsonb — the two answer different questions for different people, and neither can be derived from the other. Append-only: no UPDATE policy and no INSERT policy, because triggers write it.';

create index activity_events_project_idx on activity_events (project_id, activity_event_at desc) where project_id is not null;
create index activity_events_job_idx on activity_events (job_id, activity_event_at desc) where job_id is not null;
create index activity_events_task_idx on activity_events (task_id, activity_event_at desc) where task_id is not null;
create index activity_events_variation_idx on activity_events (variation_id, activity_event_at desc) where variation_id is not null;
create index activity_events_by_idx on activity_events (activity_event_by, activity_event_at desc);

-- ============================================================================
-- 5. tags
-- ============================================================================
create table tags (
  tag_id text primary key check (tag_id ~ '^[a-z][a-z0-9_]*$'),
  tag_name text not null unique,
  -- A colour, so a board is scannable. Hex, checked, because "red" and "#red" and
  -- "rgb(255,0,0)" arriving in the same column is how a palette stops being one.
  tag_colour text check (tag_colour ~ '^#[0-9a-fA-F]{6}$'),
  tag_is_active boolean not null default true,

  tag_created_at timestamptz not null default now(),
  tag_created_by uuid references profiles(profile_id),
  tag_updated_at timestamptz not null default now(),
  tag_updated_by uuid references profiles(profile_id)
);

comment on table tags is
  'Free-form labels, as rows with a slug key — the same shape as teams, and for the same reason: the list is data, it will change, and a retired tag has to stop appearing in pickers without breaking the records that carry it.';

create table taggings (
  tag_id text not null references tags(tag_id) on update cascade on delete cascade,

  project_id integer references projects(project_id) on update cascade on delete cascade,
  job_id text references jobs(job_id) on update cascade on delete cascade,
  task_id uuid references tasks(task_id) on delete cascade,
  variation_id uuid references variations(variation_id) on delete cascade,

  tagging_created_at timestamptz not null default now(),
  tagging_created_by uuid references profiles(profile_id),

  constraint taggings_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id) = 1)
);

comment on table taggings is
  'Which records carry which tags. No primary key across the four parent columns, because a null never equals a null and such a key would let the same tag be applied twice — the partial unique indexes below do the job a composite key cannot.';

create unique index taggings_once_per_project on taggings (tag_id, project_id) where project_id is not null;
create unique index taggings_once_per_job on taggings (tag_id, job_id) where job_id is not null;
create unique index taggings_once_per_task on taggings (tag_id, task_id) where task_id is not null;
create unique index taggings_once_per_variation on taggings (tag_id, variation_id) where variation_id is not null;

-- The other direction: "everything tagged urgent".
create index taggings_tag_idx on taggings (tag_id);

-- ============================================================================
-- 6. Audit triggers
-- ============================================================================
create trigger documents_touch before update on documents
  for each row execute function extensions.moddatetime(document_updated_at);
create trigger comments_touch before update on comments
  for each row execute function extensions.moddatetime(comment_updated_at);
create trigger tags_touch before update on tags
  for each row execute function extensions.moddatetime(tag_updated_at);

create trigger documents_stamp_created_by before insert on documents
  for each row execute function stamp_created_by('document_created_by');
create trigger document_links_stamp_created_by before insert on document_links
  for each row execute function stamp_created_by('document_link_created_by');
create trigger comments_stamp_created_by before insert on comments
  for each row execute function stamp_created_by('comment_created_by');
create trigger tags_stamp_created_by before insert on tags
  for each row execute function stamp_created_by('tag_created_by');
create trigger taggings_stamp_created_by before insert on taggings
  for each row execute function stamp_created_by('tagging_created_by');

-- ============================================================================
-- 7. RLS
-- ============================================================================
alter table documents        enable row level security;
alter table document_links   enable row level security;
alter table comments         enable row level security;
alter table comment_mentions enable row level security;
alter table activity_events  enable row level security;
alter table tags             enable row level security;
alter table taggings         enable row level security;

create policy "read documents" on documents
  for select to authenticated using ((select is_active_user()));
create policy "users add documents" on documents
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update documents" on documents
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "admins delete documents" on documents
  for delete to authenticated using ((select current_permission()) >= 'admin');

create policy "read document links" on document_links
  for select to authenticated using ((select is_active_user()));
create policy "users attach documents" on document_links
  for insert to authenticated with check ((select current_permission()) >= 'user');
-- Detaching is not deleting: the link goes, the file stays, so this is ordinary work.
create policy "users detach documents" on document_links
  for delete to authenticated using ((select current_permission()) >= 'user');

create policy "read comments" on comments
  for select to authenticated using ((select is_active_user()));
create policy "users write comments" on comments
  for insert to authenticated with check ((select current_permission()) >= 'user');

-- Your own comment, or an admin's. Not "anyone at user level", which is what every other
-- table here says: a comment carries a name, and editing somebody else's words under
-- their byline is a different act from editing a shared field.
create policy "authors edit their own comments" on comments
  for update to authenticated
  using (comment_created_by = (select current_profile_id())
         or (select current_permission()) >= 'admin')
  with check (comment_created_by = (select current_profile_id())
         or (select current_permission()) >= 'admin');
create policy "authors delete their own comments" on comments
  for delete to authenticated
  using (comment_created_by = (select current_profile_id())
         or (select current_permission()) >= 'admin');

-- current_profile_id() is called by a policy now, so it needs EXECUTE back. 0024 revoked
-- it on the grounds that no policy referenced it — which was true then and is the reason
-- 0024 checked pg_policy before revoking. It is granted here rather than left to be
-- discovered as "comments are invisible to everyone", which is how 0011 was found.
grant execute on function current_profile_id() to authenticated;

create policy "read own mentions" on comment_mentions
  for select to authenticated
  using (profile_id = (select current_profile_id())
         or (select current_permission()) >= 'admin');
create policy "users create mentions" on comment_mentions
  for insert to authenticated with check ((select current_permission()) >= 'user');
-- Marking your own mention read. Nobody else's.
create policy "mark own mention read" on comment_mentions
  for update to authenticated
  using (profile_id = (select current_profile_id()))
  with check (profile_id = (select current_profile_id()));

-- Read-only to everyone signed in; no INSERT, UPDATE or DELETE policy at all. Triggers
-- write this and triggers do not need one. An append-only feed anybody can edit is a
-- feed, not a record.
create policy "read activity events" on activity_events
  for select to authenticated using ((select is_active_user()));

create policy "read tags" on tags
  for select to authenticated using ((select is_active_user()));
create policy "users manage tags" on tags
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users edit tags" on tags
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
-- No DELETE, for the reason teams has none: retiring is a flag, and deleting a tag would
-- take every tagging with it.

create policy "read taggings" on taggings
  for select to authenticated using ((select is_active_user()));
create policy "users tag things" on taggings
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users untag things" on taggings
  for delete to authenticated using ((select current_permission()) >= 'user');

revoke execute on function touch_comment_edited_at() from public, anon, authenticated;

-- ============================================================================
-- 8. What the drawer reads
-- ============================================================================
-- Comments and events in one stream, because a reader wants one story rather than two
-- lists they have to interleave by eye. A union rather than a merged table, so the
-- append-only half stays append-only.
create view job_timeline with (security_invoker = true) as
  select job_id,
         'comment' as entry_kind,
         comment_created_at as entry_at,
         comment_created_by as entry_by,
         comment_body as entry_text,
         '{}'::jsonb as entry_detail,
         comment_edited_at is not null as entry_was_edited
  from comments
  where job_id is not null
  union all
  select job_id,
         'event',
         activity_event_at,
         activity_event_by,
         activity_event_kind,
         activity_event_detail,
         false
  from activity_events
  where job_id is not null;

comment on view job_timeline is
  'Comments and events as one stream for the job drawer. A union rather than one table, because merging them would make the append-only half a convention rather than a rule — which is the mistake the superseded spec made.';
