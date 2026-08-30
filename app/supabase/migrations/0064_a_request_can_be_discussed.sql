-- 0064 — a request can be discussed
--
-- Amber, 30 Aug, pointing at Canny: "like https://canny.io".
--
-- Canny's portal is a feedback tracker with a discussion under every post, an official
-- answer pinned to the top of it, a private lane for the team's own triage talk, and a
-- status change that arrives with a note rather than as a silent move. That thread is
-- the part 0060–0063 has no answer for: today a request can be moved and voted on, and
-- there is nowhere to ask "which council screen do you mean?".
--
-- ================================================================================
-- A FIFTH PARENT ON `comments`, NOT A `feedback_comments` TABLE
--
--   The obvious move is a new table. It is the wrong one, and the reason is what a new
--   table would have to re-grow:
--
--     * @mentions. `comment_mentions` has a foreign key to `comments`, and the header
--       bell reads it. A separate table means either a second mentions table or tracker
--       comments that cannot mention anyone — in the one place where "Ketan, is this the
--       same as yours?" is the whole point.
--     * The edited-at trigger, which marks a body that changed and deliberately does not
--       mark a row that was merely touched.
--     * The author stamp, the audit quartet, the four policies, and CommentsPanel.
--
--   `comments` was already built as one shape with a parent column per record type and
--   a num_nonnulls(...) = 1 check holding it to exactly one — the same pattern the
--   property model settled on for `property_values`. Adding a fifth parent is what that
--   design is for.
--
--   The cost, stated: `comments` now spans work records and the app's own tracker, so a
--   query that means "comments about jobs" must say so. Every existing query already
--   does — they all filter on their parent — and the indexes are partial per parent, so
--   nothing scans the others.
-- ================================================================================

alter table comments
  add column feedback_id uuid references feedback(feedback_id) on delete cascade;

-- The check has to be replaced rather than added to: it names its columns.
alter table comments drop constraint comments_one_parent;
alter table comments
  add constraint comments_one_parent
    check (num_nonnulls(project_id, job_id, task_id, variation_id, feedback_id) = 1);

comment on column comments.feedback_id is
  'The tracker request this comment is on (0064). The fifth parent — a comment has exactly one, and comments_one_parent is what enforces it.';

-- Partial, like the other four, and ordered the way the thread is read.
create index comments_feedback_idx
  on comments (feedback_id, comment_created_at desc) where feedback_id is not null;

-- ------------------------------------------------------------------ the official answer
-- Canny pins one comment to the top of a post: the answer, above the discussion. Without
-- it the reply that matters is the one somebody wrote in March, four screens down, and
-- the eleventh person to ask gets no answer at all.
--
-- A boolean and not a `pinned_comment_id` on the parent: pinning is a property of the
-- comment, and a column on `feedback` would need its own foreign key back into a table
-- that already points here.
alter table comments add column comment_is_pinned boolean not null default false;

-- ---------------------------------------------------------------- the team's own lane
-- Canny calls these internal comments: the team talks in the open thread's own space
-- without the customer reading it. Here the "customer" is a colleague, which makes it
-- MORE useful rather than less — "this is three days if we do it properly, an hour if we
-- fake it" is a sentence somebody will only write if the person who asked is not reading.
--
-- Default false, so nothing that exists becomes hidden. The app offers the tick only on
-- tracker comments; the column is on every comment because the policy has to be, and
-- because job triage will want it next.
alter table comments add column comment_is_internal boolean not null default false;

comment on column comments.comment_is_internal is
  'An admin-only comment (0064, Canny''s internal comments). Enforced by the read policy, not by the screen. Default false: nothing already written becomes hidden.';

-- ------------------------------------------------------- a move that carries a sentence
-- Canny's "status update": the stage changes AND the people who care are told why. The
-- move itself is already recorded (feedback_stage, feedback_stage_entered_at); this is
-- the sentence beside it, stored as an ordinary comment carrying the stage it announced.
--
-- Why not a `feedback_stage_note` column on `feedback`: there is one of those per
-- request, so the note explaining "planned" would be overwritten by the note explaining
-- "in development", and the history of what was said when would be gone. A comment per
-- move keeps them all, in the thread, where the discussion already is.
alter table comments add column comment_feedback_stage text;

alter table comments
  add constraint comments_stage_note_is_on_a_request
    check (comment_feedback_stage is null or feedback_id is not null);

comment on column comments.comment_feedback_stage is
  'Set when this comment was written as the note on a stage change (0064) — the stage it announced. Null on an ordinary comment. One per move rather than one per request, so what was said at each step survives.';

-- ------------------------------------------------------------------------- reading
-- The existing "read comments" policy is replaced, and this is the only behaviour change
-- 0064 makes to comments that already exist: an internal comment is admin and above.
-- Everything else reads exactly as before, because comment_is_internal defaults false.
drop policy "read comments" on comments;

create policy "read comments" on comments
  for select to authenticated
  using (
    (select is_active_user())
    and (
      not comment_is_internal
      or (select current_permission()) >= 'admin'
    )
  );

-- Pinning and marking internal are admin acts, and they are NOT covered by the existing
-- "authors edit their own comments" policy — that is a row rule, and this is a column
-- rule. Same shape as the stage guard in 0060, and the same reason: RLS cannot express
-- "you may edit your words but not your own comment's standing".
create or replace function guard_comment_standing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.comment_is_pinned is distinct from old.comment_is_pinned
      or new.comment_is_internal is distinct from old.comment_is_internal)
     and current_permission() < 'admin'::permission_level then
    raise exception
      'Pinning a comment, or marking it internal, needs admin permission.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function guard_comment_standing() from public;
revoke execute on function guard_comment_standing() from anon;
revoke execute on function guard_comment_standing() from authenticated;

drop trigger if exists comments_guard_standing on comments;
create trigger comments_guard_standing
  before update of comment_is_pinned, comment_is_internal on comments
  for each row
  execute function guard_comment_standing();

-- An INSERT can set them too, and the trigger above only covers UPDATE. Writing a
-- comment that arrives pinned, or arrives internal, is the same act by a different route.
create or replace function guard_comment_standing_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.comment_is_pinned or new.comment_is_internal or new.comment_feedback_stage is not null)
     and current_permission() < 'admin'::permission_level then
    raise exception
      'Posting a pinned, internal or stage-change comment needs admin permission.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function guard_comment_standing_on_insert() from public;
revoke execute on function guard_comment_standing_on_insert() from anon;
revoke execute on function guard_comment_standing_on_insert() from authenticated;

drop trigger if exists comments_guard_standing_insert on comments;
create trigger comments_guard_standing_insert
  before insert on comments
  for each row
  execute function guard_comment_standing_on_insert();

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * an ordinary person reads a normal comment on a request and NOT an internal one —
--     watched against a policy without the internal clause, where they read both;
--   * an admin reads both;
--   * an ordinary person pinning their own comment is refused (42501), and so is one
--     posting a comment that arrives pinned or internal;
--   * a comment naming two parents (a job AND a request) is refused by
--     comments_one_parent — the check that had to be rewritten rather than extended;
--   * a stage note with no feedback_id is refused.
