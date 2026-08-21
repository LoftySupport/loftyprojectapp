-- =============================================================================
-- 0031 — why a job deviated: variations, and what they cost in rework
-- =============================================================================
-- The third axis. Position says where a job is, tasks say what is being done, and this
-- says why any of it changed.
--
-- ------------------------------------------------ a variation is a record, not a state
-- The pain point Lofty described is three teams raising conflicting changes to one job.
-- A flag cannot represent three of anything, and a status column on `jobs` would mean a
-- job has exactly one variation, forever. So each change is a row, numbered
-- 1042-01-V3, with its own owner, cost, approval and position.
--
-- This is also why the axes cannot be merged. Position + Change collapsed would make a
-- variation a state of the job — one at a time — which is the original problem restated.
-- Work + Change collapsed would make variation effort inseparable from build effort, and
-- "what did rework cost us" could never be answered.
--
-- ------------------------------------------------------ always against a job
-- Confirmed by Lofty: changes happen at a job level, never at a project level. A
-- project-level property change is an ordinary edit, and because project properties are
-- read through by their jobs rather than copied, "push it to all jobs" needs no push —
-- the jobs already show it.
--
-- ------------------------------------------- rewinding is only coherent inside a phase
-- Two cases, and they are genuinely different:
--
--   * A variation while the job is still in the phase that owns the work — at
--     Development Approval, needing drawings redone, still inside Pre-construction. The
--     build position may move back within that pipeline.
--   * A variation after that phase has passed — the tiles case, job in Construction.
--     The job does NOT rewind to a Pre-construction stage. Nobody at Lofty would say
--     "the job is back at working drawings"; they would say "it is in construction with
--     an open variation and Design is updating the drawings". The work lives on the
--     VARIATION, which carries its own tasks and its own team.
--
-- That is what keeps the lifecycle honestly forward-only, and it is the common case.
--
-- --------------------------------------------------- the number that justifies change
-- variation_reopened_tasks is the point of the whole batch. It records which tasks a
-- variation sent back, so Lofty can finally answer "how much rework did this change
-- cause" — a number nobody has today, and the one that makes a process argument
-- settleable. It cannot be backfilled: if it is not recorded as it happens it is gone.
-- =============================================================================

-- ============================================================================
-- 1. variations
-- ============================================================================
create table variations (
  variation_id uuid primary key default gen_random_uuid(),

  job_id text not null references jobs(job_id) on update cascade on delete cascade,

  -- Per-job, so the third variation on 1042-01 is V3 whatever is happening elsewhere.
  -- Assigned by trigger from a high-water mark on the job, the same way job sequences
  -- are: max()+1 would reissue V3 after V3 was deleted, and a variation number appears
  -- on client correspondence.
  variation_sequence smallint not null,

  -- '1042-01-V3'. Stamped at insert, and tied to its parts by a CHECK for the same
  -- reason job_id is — this is what goes in an email to a client.
  variation_number text not null unique,

  variation_title text not null check (length(trim(variation_title)) > 0),

  -- WHY, captured at the point the request is raised rather than reconstructed later.
  -- Lofty asked for this specifically: a variation without its reason is an argument
  -- nobody can settle six months on.
  variation_reason text,

  -- Who asked. A client-requested change and a Lofty-caused rework are the same shape
  -- and completely different facts, and the difference decides who pays.
  variation_origin text not null default 'client'
    check (variation_origin in ('client', 'lofty', 'consultant', 'authority', 'supplier')),

  -- New → With us → Waiting on external → Waiting on client → On hold →
  -- Completed | Cancelled. Lofty's own words, as a check rather than an enum, because
  -- this is a process and processes change.
  variation_status text not null default 'new'
    check (variation_status in ('new', 'with_us', 'waiting_on_external',
                                'waiting_on_client', 'on_hold', 'completed', 'cancelled')),

  -- The board reads "With us — Estimating". Which team currently holds it, which is not
  -- the same as which team the job belongs to: the whole point is that a variation moves
  -- between teams while the job stays where it is.
  variation_current_team text references teams(team_id) on update cascade,
  variation_assignee_id uuid references profiles(profile_id),

  -- numeric, never float. Money that does not add up exactly is money somebody argues
  -- about. Nullable because a variation is raised long before it is priced.
  variation_cost numeric(12, 2),
  variation_days_impact smallint,

  variation_raised_at timestamptz not null default now(),
  variation_raised_by uuid references profiles(profile_id),

  variation_approved_at timestamptz,
  variation_approved_by uuid references profiles(profile_id),

  -- Why it was dropped, when it is dropped. Lofty asked for the reason to be captured;
  -- a cancelled variation with no reason is the same dead end as an unexplained one.
  variation_cancelled_reason text,

  variation_created_at timestamptz not null default now(),
  variation_created_by uuid references profiles(profile_id),
  variation_updated_at timestamptz not null default now(),
  variation_updated_by uuid references profiles(profile_id),

  constraint variations_sequence_positive check (variation_sequence >= 1),
  unique (job_id, variation_sequence),

  -- The number always equals its parts, the same invariant job_id carries.
  constraint variations_number_matches_its_parts
    check (variation_number = job_id || '-V' || variation_sequence::text),

  -- Cancelled says why. Not a soft convention — the reason is the only thing that makes
  -- a cancelled variation worth keeping rather than deleting.
  constraint variations_cancelled_has_a_reason
    check (variation_status <> 'cancelled'
           or (variation_cancelled_reason is not null
               and length(trim(variation_cancelled_reason)) > 0)),

  -- A person without a time is meaningless; a time without a person is not.
  --
  -- The symmetric version of this rule — "both or neither" — looked tidier and was
  -- wrong, which my own behaviour test found by failing: current_profile_id() returns
  -- null wherever there is no JWT, so completing a variation became impossible from a
  -- migration, a seed or the import. And "approved on this date, by somebody we no
  -- longer know" is a real state for history coming out of the old system. What is NOT
  -- a real state is an approver with no approval date, so only that half is forbidden.
  constraint variations_approved_by_needs_a_time
    check (variation_approved_by is null or variation_approved_at is not null),

  -- Completed means approved. Whatever else is unknown, the date is not.
  constraint variations_completed_is_approved
    check (variation_status <> 'completed' or variation_approved_at is not null)
);

comment on table variations is
  'A change to a job, as a record rather than a state. Three teams raising conflicting changes to one job is the problem this exists for, and a flag cannot represent three of anything. Always against a job, never a project: a project-level change is an ordinary edit, and project properties are read through by their jobs rather than copied.';

create index variations_job_idx on variations (job_id, variation_sequence);
-- The board: everything a team currently holds, open only. Partial, because completed
-- and cancelled variations will outnumber open ones many times over.
create index variations_team_open_idx on variations (variation_current_team)
  where variation_status not in ('completed', 'cancelled');
create index variations_assignee_open_idx on variations (variation_assignee_id)
  where variation_status not in ('completed', 'cancelled');

-- The high-water mark, on jobs, for the same reason projects carries one for job
-- numbers: a deleted V3 must never be reissued.
alter table jobs add column if not exists job_variation_seq_high_water smallint not null default 0;

comment on column jobs.job_variation_seq_high_water is
  'The highest variation number ever issued on this job — not the highest in use. Only goes up, so a deleted V3 is never handed out twice, because that number has been in an email to a client.';

create or replace function assign_variation_number() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  next_no smallint;
begin
  if new.variation_sequence is null then
    -- The UPDATE takes a row lock on the parent job, which is also what stops two people
    -- raising a variation at the same moment from both claiming V3.
    update jobs
       set job_variation_seq_high_water = job_variation_seq_high_water + 1
     where job_id = new.job_id
    returning job_variation_seq_high_water into next_no;

    if next_no is null then
      raise exception 'job % does not exist', new.job_id using errcode = '23503';
    end if;
    new.variation_sequence := next_no;
  end if;

  new.variation_number := new.job_id || '-V' || new.variation_sequence::text;
  return new;
end $$;

create trigger variations_assign_number before insert on variations
  for each row execute function assign_variation_number();

-- A renumbered job carries its variations' numbers with it, the same way it carries
-- job_id. Fires only when the job actually changed, which happens during the import.
create or replace function resync_variation_number() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.job_id is distinct from old.job_id
     or new.variation_sequence is distinct from old.variation_sequence then
    new.variation_number := new.job_id || '-V' || new.variation_sequence::text;
  end if;
  return new;
end $$;

create trigger variations_resync_number before update on variations
  for each row execute function resync_variation_number();

-- Approval is stamped by the database, not sent by the client. A client that can write
-- variation_approved_by can write somebody else's name into an approval — and this one
-- has a dollar value attached to it.
create or replace function stamp_variation_approval() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.variation_status = 'completed'
     and (tg_op = 'INSERT' or old.variation_status is distinct from 'completed') then
    new.variation_approved_at := coalesce(new.variation_approved_at, now());
    -- Falls through to the support profile the way stamp_created_by does, so an approval
    -- made by an automation still carries a name rather than a blank. Both can be null
    -- for imported history, which the constraint above allows on purpose.
    new.variation_approved_by := coalesce(
      new.variation_approved_by, current_profile_id(), support_profile_id());
  end if;
  return new;
end $$;

create trigger variations_stamp_approval before insert or update on variations
  for each row execute function stamp_variation_approval();

-- ============================================================================
-- 2. variation_reopened_tasks — the rework record
-- ============================================================================
-- What a variation sent back. This is the table that answers "how much rework did this
-- change cause", and it is the reason the batch exists.
--
-- It cannot be backfilled. Once a task has been reopened and finished again, nothing in
-- the database says which change caused it — the task just looks like it took a long
-- time. So this is written from day one even though nothing reads it for months.
create table variation_reopened_tasks (
  variation_id uuid not null references variations(variation_id) on delete cascade,
  task_id uuid not null references tasks(task_id) on delete cascade,

  -- Snapshotted, not derived. If the task is reopened again by a second variation, the
  -- first variation's row still records what IT interrupted — and "was this task already
  -- finished when the change landed" is the question that separates rework from work.
  variation_reopened_task_was_complete boolean not null,
  variation_reopened_task_completed_at timestamptz,

  variation_reopened_task_at timestamptz not null default now(),
  variation_reopened_task_by uuid references profiles(profile_id),

  primary key (variation_id, task_id)
);

comment on table variation_reopened_tasks is
  'Which tasks a variation sent back, and whether they were already finished when it did. The number that justifies a process change — "this variation cost us eleven completed tasks" — and one that cannot be reconstructed later, because a reopened-and-refinished task just looks slow.';

create index variation_reopened_tasks_task_idx on variation_reopened_tasks (task_id);

-- The variation and the task must be on the same job. A variation on 1042-01 reopening
-- a task on 1042-02 is a data-entry accident, and it would corrupt exactly the number
-- this table exists to produce.
create or replace function guard_reopened_task_same_job() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  variation_job text;
  task_job text;
begin
  select job_id into variation_job from variations where variation_id = new.variation_id;
  select job_id into task_job from tasks where task_id = new.task_id;

  if variation_job is distinct from task_job then
    raise exception 'variation % is on job %, but task % is on job %',
      new.variation_id, variation_job, new.task_id, coalesce(task_job, '(a project)')
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger variation_reopened_tasks_guard_job
  before insert or update on variation_reopened_tasks
  for each row execute function guard_reopened_task_same_job();

-- Snapshot the task's state at the moment it is recorded as reopened, rather than
-- trusting the client to describe it. The client is about to reopen the task; asking it
-- to also tell us what the task used to be is asking it to be honest about the thing
-- being measured.
create or replace function snapshot_reopened_task() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  was_done boolean;
  done_at timestamptz;
begin
  select task_status = 'done', task_completed_at
    into was_done, done_at
    from tasks where task_id = new.task_id;

  new.variation_reopened_task_was_complete := coalesce(was_done, false);
  new.variation_reopened_task_completed_at := done_at;
  new.variation_reopened_task_by := coalesce(current_profile_id(), new.variation_reopened_task_by);
  return new;
end $$;

create trigger variation_reopened_tasks_snapshot
  before insert on variation_reopened_tasks
  for each row execute function snapshot_reopened_task();

-- ============================================================================
-- 3. Audit, RLS and the API surface
-- ============================================================================
create trigger variations_touch before update on variations
  for each row execute function extensions.moddatetime(variation_updated_at);
create trigger variations_stamp_created_by before insert on variations
  for each row execute function stamp_created_by('variation_created_by');

create trigger trg_activity_audit_row after insert or update or delete on variations
  for each row execute function log_activity_audit();

-- The allowlist again. A trigger attached to a table the function filters out fires and
-- writes nothing, which reads as coverage that is not there.
create or replace function log_activity_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('profiles', 'addresses', 'projects', 'jobs',
                              'teams', 'profile_teams', 'tasks', 'variations') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, null, redact_audit_row(to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op,
            redact_audit_row(to_jsonb(old)), redact_audit_row(to_jsonb(new)));
    return new;
  else
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, redact_audit_row(to_jsonb(old)), null);
    return old;
  end if;
end;
$$;

alter table variations enable row level security;
alter table variation_reopened_tasks enable row level security;

create policy "read variations" on variations
  for select to authenticated using ((select is_active_user()));
create policy "users raise variations" on variations
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update variations" on variations
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
-- No delete below admin. A variation is correspondence with a client; it is cancelled
-- with a reason, not removed.
create policy "admins delete variations" on variations
  for delete to authenticated using ((select current_permission()) >= 'admin');

create policy "read reopened tasks" on variation_reopened_tasks
  for select to authenticated using ((select is_active_user()));
create policy "users record reopened tasks" on variation_reopened_tasks
  for insert to authenticated with check ((select current_permission()) >= 'user');
-- No UPDATE policy at all. Every column here is either a key or a snapshot taken by the
-- database; there is nothing a person should be editing afterwards, and an editable
-- record of what a change cost is not a record.
create policy "admins delete reopened tasks" on variation_reopened_tasks
  for delete to authenticated using ((select current_permission()) >= 'admin');

revoke execute on function assign_variation_number()      from public, anon, authenticated;
revoke execute on function resync_variation_number()      from public, anon, authenticated;
revoke execute on function stamp_variation_approval()     from public, anon, authenticated;
revoke execute on function guard_reopened_task_same_job() from public, anon, authenticated;
revoke execute on function snapshot_reopened_task()       from public, anon, authenticated;

-- ============================================================================
-- 4. The job's variation badge, derived
-- ============================================================================
-- "3 open · 1 with client" on a job card. Derived every time rather than stored, so it
-- cannot go stale — a counter on `jobs` needs a trigger on every variation write and is
-- wrong the first time one is missed.
create view job_variation_summary with (security_invoker = true) as
  select j.job_id,
         count(*) filter (where v.variation_status not in ('completed', 'cancelled'))
           as variations_open,
         count(*) filter (where v.variation_status = 'waiting_on_client')
           as variations_with_client,
         count(*) filter (where v.variation_status = 'completed')
           as variations_completed,
         coalesce(sum(v.variation_cost) filter (where v.variation_status = 'completed'), 0)
           as variations_approved_cost,
         coalesce(sum(v.variation_days_impact) filter (where v.variation_status = 'completed'), 0)
           as variations_approved_days
  from jobs j
  left join variations v using (job_id)
  group by j.job_id;

comment on view job_variation_summary is
  'The badge on a job card, and the only honest way to carry it: derived, so it cannot disagree with the variations sitting next to it. Cost and days count approved variations only — a proposed change is not money spent.';

-- What rework each change caused. The reporting question Lofty cannot answer today.
create view variation_rework with (security_invoker = true) as
  select v.variation_id,
         v.variation_number,
         v.job_id,
         v.variation_origin,
         v.variation_status,
         v.variation_cost,
         count(r.task_id) as tasks_reopened,
         count(r.task_id) filter (where r.variation_reopened_task_was_complete)
           as tasks_that_were_finished
  from variations v
  left join variation_reopened_tasks r using (variation_id)
  group by v.variation_id, v.variation_number, v.job_id,
           v.variation_origin, v.variation_status, v.variation_cost;

comment on view variation_rework is
  'How much work each variation sent back. tasks_that_were_finished is the number that makes a process argument settleable — work that was done, and then had to be done again.';
