-- 0065 — you hear back about what you asked for
--
-- Canny's loop, and the half of it 0060–0064 does not close: *"Status Updates — email
-- notifications closing the feedback loop"*, *"notification system alerting voters when
-- requests are completed"*.
--
-- Everything so far is pull. A person files a request, and to find out what happened
-- they have to remember to go and look. Canny's whole claim is that they do not have to:
-- voting subscribes you, and the move comes to you.
--
-- ----------------------------------------------------------------- what "told" means here
-- Not email. Amber's Q4 settled the order — notifications land in-app this phase, Teams
-- and email later — and the header bell already delivers one real signal (@mentions) with
-- six named as not built. This makes the seventh real, and it is deliberately the one that
-- needs no health model, no SLA and no derivation: somebody moved your request, which is
-- a fact with a timestamp on it already.

create table feedback_follows (
  feedback_id uuid not null references feedback(feedback_id) on delete cascade,
  profile_id uuid not null references profiles(profile_id) on delete cascade,

  -- WHY A SEEN-STAMP AND NOT A NOTIFICATIONS TABLE.
  --
  -- The obvious shape is a row per person per event, written by a trigger on every stage
  -- change. That is a table that grows with (requests × followers) forever, needs its own
  -- policies and cleanup, and can disagree with the request it describes — a notification
  -- saying "moved to Planned" beside a request that has since been declined.
  --
  -- This holds one date instead. Unread is a comparison the reader makes:
  --   feedback.feedback_stage_entered_at > feedback_follow_seen_stage_at
  -- The stage stamp is already maintained by the 0060 trigger, so there is exactly one
  -- record of when the move happened and the bell reads it rather than a copy of it.
  --
  -- Null means never seen: somebody who followed a request is told about the stage it is
  -- in now, not only about the next move. That is the right default — following something
  -- already In development and hearing nothing until it ships reads as a broken bell.
  feedback_follow_seen_stage_at timestamptz,

  feedback_follow_at timestamptz not null default now(),

  primary key (feedback_id, profile_id)
);

comment on table feedback_follows is
  'Who hears about a request moving (0065, Canny''s "alert the voters"). Voting and reporting both follow automatically, by trigger. Unread is derived by comparing feedback_stage_entered_at to the seen stamp rather than stored as notification rows, so a notice cannot outlive or contradict the move it describes.';

-- "What am I following, and what has moved" is the bell's query: by person, and it wants
-- the unseen ones. The primary key leads with feedback_id, which is the wrong way round
-- for that, so this index is not redundant with it.
create index feedback_follows_mine_idx on feedback_follows (profile_id, feedback_follow_at desc);

alter table feedback_follows enable row level security;

-- Your own follows, and only yours. Unlike votes, this is NOT public: a vote is a
-- position somebody took on a question everybody can see, and following is closer to a
-- browser bookmark. Nobody needs to know what Ketan is keeping an eye on.
create policy "your follows are yours" on feedback_follows
  for select to authenticated
  using ((select is_active_user()) and profile_id = (select current_profile_id()));

create policy "follow for yourself" on feedback_follows
  for insert to authenticated
  with check ((select is_active_user()) and profile_id = (select current_profile_id()));

-- Two updates only ever happen: marking it seen, and nothing else. The policy cannot say
-- "only that column", so the with-check keeps it to your own row and the app sends one
-- field. A wrong write here costs a bell row, which is the right amount of blast radius
-- for the loosest rule in this migration.
create policy "mark your own as seen" on feedback_follows
  for update to authenticated
  using ((select is_active_user()) and profile_id = (select current_profile_id()))
  with check (profile_id = (select current_profile_id()));

create policy "unfollow yourself" on feedback_follows
  for delete to authenticated
  using ((select is_active_user()) and profile_id = (select current_profile_id()));

-- ------------------------------------------------------- following is not a second click
-- Canny subscribes you by voting. It is the right default and it is not a shortcut: a
-- person who voted has already said they want this to happen, and asking them to also
-- press a bell is asking them to say it twice.
--
-- A TRIGGER AND NOT THE APP, and this is the part that matters. `feedback_votes` is
-- written by the app today; it will be written by an import, by a merge (0066) and by an
-- admin voting on somebody's behalf (0067) tomorrow. A follow created in the repository
-- would exist for the first of those and silently not for the other three.
create or replace function follow_on_vote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Seen-stamp set to now(): you know what stage it is in, because you were just looking
  -- at it. Otherwise every vote would immediately light the bell for the move that had
  -- already happened before you got there.
  insert into feedback_follows (feedback_id, profile_id, feedback_follow_seen_stage_at)
  values (new.feedback_id, new.profile_id, now())
  on conflict (feedback_id, profile_id) do nothing;
  return new;
end;
$$;

revoke execute on function follow_on_vote() from public;
revoke execute on function follow_on_vote() from anon;
revoke execute on function follow_on_vote() from authenticated;

create trigger feedback_votes_follow after insert on feedback_votes
  for each row execute function follow_on_vote();

-- Un-voting deliberately does NOT unfollow. Changing your mind about whether something
-- should be built is not the same as not wanting to know what happens to it, and a bell
-- that goes quiet as a side effect of a click somewhere else is a bell nobody trusts.

-- Reporting follows too, by the same argument: the person who wrote it is the person
-- most entitled to hear what became of it.
create or replace function follow_on_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.profile_id is not null then
    insert into feedback_follows (feedback_id, profile_id, feedback_follow_seen_stage_at)
    values (new.feedback_id, new.profile_id, now())
    on conflict (feedback_id, profile_id) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function follow_on_report() from public;
revoke execute on function follow_on_report() from anon;
revoke execute on function follow_on_report() from authenticated;

create trigger feedback_follow_reporter after insert on feedback
  for each row execute function follow_on_report();

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * voting creates a follow, and a second vote attempt does not duplicate it;
--   * un-voting leaves the follow standing — watched by counting follows either side;
--   * reporting creates a follow for the reporter;
--   * a person cannot read, create or delete a follow on somebody else's behalf;
--   * after a superadmin moves a followed request, the follower's row reads as unseen
--     (feedback_stage_entered_at > seen stamp), and reads as seen once marked. Watched
--     against a version that stamped the seen date at insert time with now() + the move,
--     which reports everything as read.
