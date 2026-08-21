-- =============================================================================
-- 0030 — what is being done: tasks, and what has to happen before what
-- =============================================================================
-- The second of the four axes. Position (0029) says where a job is; this says what is
-- being done to it. Keeping them apart is what makes Lofty's "it is not snakes and
-- ladders" requirement free rather than unbuildable: move a job's position backwards and
-- the completed tasks stay completed, because they were never the same fact.
--
-- ------------------------------------------------------------- one table, not two
-- A checklist item instantiated from a process template and a task somebody typed in
-- differ by exactly one thing: whether they came from a template. Two tables would make
-- every "what am I working on" query a `union all` forever, and that query is the one
-- the whole app is for.
--
-- The template link itself is NOT added here. `template_steps` does not exist until the
-- process batch, and a column pointing at a table that does not exist is the mistake
-- 0001 made with profile_teams.team_id — it pointed at a `teams` table nobody had built,
-- for three migrations. The column arrives with its foreign key, in the migration that
-- creates the thing it references.
--
-- ------------------------------------------------------ why dependencies are a table
-- Lofty's preconstruction schedule has 57 steps. Twenty-one of them have two or more
-- predecessors and one has five; `Contract Deposit Paid` releases nine steps at once.
-- A single `depends_on` column cannot express any of that, and the export is directly
-- loadable into this shape once the steps are mapped to teams.
--
-- The critical path through that schedule is 180 days against 434 days of total step
-- duration — about 59% of the work runs in parallel. That number only exists because
-- the dependencies are a graph. A linear checklist cannot produce it.
--
-- ------------------------------------------------------------- what is deliberately absent
--   * No `task_is_complete` boolean beside `task_completed_at`. Two columns for one fact
--     can disagree, and the timestamp answers both questions.
--   * No stored progress percentage on the job. It is a count over these rows, and a
--     stored copy is a number people trust that is quietly wrong.
--   * No template tables. Phase C.
-- =============================================================================

-- ============================================================================
-- 1. tasks
-- ============================================================================
create table tasks (
  task_id uuid primary key default gen_random_uuid(),

  -- Exactly one parent, as two real foreign keys rather than a subject_type
  -- discriminator: the reference is enforced and the delete cascades. Most work hangs
  -- off a job; some genuinely belongs to the site as a whole (a land division, a shared
  -- driveway) and would otherwise have to be filed under an arbitrary one of its jobs.
  job_id text references jobs(job_id) on update cascade on delete cascade,
  project_id integer references projects(project_id) on update cascade on delete cascade,

  task_name text not null check (length(trim(task_name)) > 0),
  task_description text,

  -- Sub-tasks. The process map has 57 steps and the checklists group them into about 40;
  -- rather than resolving that mismatch by hand, a step that is really several becomes a
  -- parent with children.
  parent_task_id uuid references tasks(task_id) on delete cascade,

  task_position smallint not null default 0,

  -- Who owns the work, and who is doing it. Both nullable: an unassigned task in a
  -- team's queue is a real and useful state, and forcing a name onto it at creation
  -- means somebody picks one at random.
  task_owning_team text references teams(team_id) on update cascade,
  task_assignee_id uuid references profiles(profile_id),

  task_status text not null default 'open'
    check (task_status in ('open', 'in_progress', 'blocked', 'done', 'cancelled')),

  task_due_date date,

  -- The single source of truth for "is it done". A boolean beside this could disagree
  -- with it, and one of them would be wrong without anything noticing.
  task_completed_at timestamptz,
  task_completed_by uuid references profiles(profile_id),

  -- Council, the EER consultant, SA Water. The process map marks these in orange:
  -- nothing downstream moves until they are done and they are not the owning team's
  -- fault when they run late. Without the flag, Design looks permanently overdue for
  -- council's statutory 28 days.
  task_is_external boolean not null default false,

  task_created_at timestamptz not null default now(),
  task_created_by uuid references profiles(profile_id),
  task_updated_at timestamptz not null default now(),
  task_updated_by uuid references profiles(profile_id),

  constraint tasks_one_parent check (num_nonnulls(job_id, project_id) = 1),

  -- done and completed_at agree, in both directions. Without the second half a task can
  -- be marked done with no completion time, and "how long did this take" silently
  -- becomes unanswerable for exactly the tasks somebody rushed.
  constraint tasks_done_has_a_time
    check ((task_status = 'done') = (task_completed_at is not null)),

  constraint tasks_not_its_own_parent check (parent_task_id is distinct from task_id)
);

comment on table tasks is
  'What is being done. One table for template-instantiated checklist items and typed-in tasks alike, because they differ only by where they came from and every "what am I working on" query would otherwise be a union forever. Deliberately separate from where the job sits: moving a job backwards must not erase what has already been finished.';

-- The three access paths: a record's task list, a person's queue, a team's queue.
create index tasks_job_idx on tasks (job_id, task_position) where job_id is not null;
create index tasks_project_idx on tasks (project_id, task_position) where project_id is not null;
create index tasks_parent_idx on tasks (parent_task_id) where parent_task_id is not null;

-- "My work" and "my team's work" — partial, because a done task is not in anybody's
-- queue and those rows will eventually outnumber the open ones many times over.
create index tasks_assignee_open_idx on tasks (task_assignee_id, task_due_date)
  where task_status in ('open', 'in_progress', 'blocked');
create index tasks_team_open_idx on tasks (task_owning_team, task_due_date)
  where task_status in ('open', 'in_progress', 'blocked');

-- Overdue, across everything, which is the report that runs every morning.
create index tasks_due_idx on tasks (task_due_date)
  where task_status in ('open', 'in_progress', 'blocked') and task_due_date is not null;

-- ============================================================================
-- 2. task_dependencies
-- ============================================================================
-- Many-to-many, because 21 of the schedule's 57 steps have two or more predecessors and
-- one has five. A `depends_on` column on tasks could hold one of those five.
create table task_dependencies (
  task_id uuid not null references tasks(task_id) on delete cascade,
  depends_on_task_id uuid not null references tasks(task_id) on delete cascade,

  -- How many days after the predecessor finishes this one is due.
  --
  -- The SLAs in Lofty's process map sit on the ARROWS, not on the steps — "Within 14
  -- Days", "7 DAYS" label the transition between two steps rather than either step
  -- itself. So they belong on the edge, which is this row, and not as a duration column
  -- on the task.
  task_dependency_lag_days smallint not null default 0,

  task_dependency_created_at timestamptz not null default now(),
  task_dependency_created_by uuid references profiles(profile_id),

  primary key (task_id, depends_on_task_id),
  constraint task_dependencies_not_self check (task_id <> depends_on_task_id)
);

comment on table task_dependencies is
  'What has to happen before what. A table rather than a column because 21 of the 57 preconstruction steps have two or more predecessors and one has five. The lag sits here rather than on the task because Lofty''s process map puts its SLAs on the arrows — "Within 14 Days" labels a transition, not a step.';

create index task_dependencies_depends_on_idx on task_dependencies (depends_on_task_id);

-- A dependency cycle would make the schedule unsatisfiable and every "what is ready to
-- start" query non-terminating. A CHECK cannot hold a subquery, so this is a trigger —
-- the same shape as the pipeline nesting guard.
create or replace function guard_task_dependency_cycle() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  cycles boolean;
begin
  -- Walk forward from the predecessor. If we can reach the dependent task, adding this
  -- edge closes a loop. The recursive CTE terminates because UNION (not UNION ALL)
  -- discards nodes already seen.
  with recursive reachable as (
    select new.depends_on_task_id as task_id
    union
    select d.depends_on_task_id
    from task_dependencies d
    join reachable r on d.task_id = r.task_id
  )
  select exists (select 1 from reachable where task_id = new.task_id) into cycles;

  if cycles then
    raise exception 'that dependency would create a cycle: % already has to wait for %',
      new.depends_on_task_id, new.task_id
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger task_dependencies_guard_cycle
  before insert or update on task_dependencies
  for each row execute function guard_task_dependency_cycle();

-- Both tasks must hang off the same record. A dependency across two different jobs is
-- job_dependencies' job, not this table's, and letting it in here would make "the tasks
-- for this job" stop being a closed set.
create or replace function guard_task_dependency_same_record() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  a_job text; a_project integer;
  b_job text; b_project integer;
begin
  select job_id, project_id into a_job, a_project from tasks where task_id = new.task_id;
  select job_id, project_id into b_job, b_project from tasks where task_id = new.depends_on_task_id;

  if a_job is distinct from b_job or a_project is distinct from b_project then
    raise exception 'a task can only depend on another task on the same record'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger task_dependencies_guard_same_record
  before insert or update on task_dependencies
  for each row execute function guard_task_dependency_same_record();

-- ============================================================================
-- 3. Keeping completion honest
-- ============================================================================
-- task_completed_at and task_completed_by are stamped by the database rather than sent
-- by the client, for the same reason created_by is: a client that can write them can
-- write somebody else's name into them.
create or replace function stamp_task_completion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.task_status = 'done' and (tg_op = 'INSERT' or old.task_status is distinct from 'done') then
    new.task_completed_at := coalesce(new.task_completed_at, now());
    new.task_completed_by := coalesce(current_profile_id(), new.task_completed_by);
  elsif new.task_status <> 'done' then
    -- Reopening clears both. A completion time on a task that is open again is a lie,
    -- and it is exactly the lie a variation produces: work marked done, then reopened
    -- because the client changed the tiles.
    new.task_completed_at := null;
    new.task_completed_by := null;
  end if;
  return new;
end $$;

create trigger tasks_stamp_completion before insert or update on tasks
  for each row execute function stamp_task_completion();

create trigger tasks_touch before update on tasks
  for each row execute function extensions.moddatetime(task_updated_at);
create trigger tasks_stamp_created_by before insert on tasks
  for each row execute function stamp_created_by('task_created_by');
create trigger task_dependencies_stamp_created_by before insert on task_dependencies
  for each row execute function stamp_created_by('task_dependency_created_by');

create trigger trg_activity_audit_row after insert or update or delete on tasks
  for each row execute function log_activity_audit();

-- log_activity_audit() filters on an allowlist of table names, so `tasks` has to join it
-- or the trigger above fires and writes nothing — which is worse than not attaching it,
-- because the trigger reads as coverage that is not there.
create or replace function log_activity_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('profiles', 'addresses', 'projects', 'jobs',
                              'teams', 'profile_teams', 'tasks') then
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

-- ============================================================================
-- 4. RLS
-- ============================================================================
alter table tasks enable row level security;
alter table task_dependencies enable row level security;

create policy "read tasks" on tasks
  for select to authenticated using ((select is_active_user()));
create policy "users write tasks" on tasks
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update tasks" on tasks
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "admins delete tasks" on tasks
  for delete to authenticated using ((select current_permission()) >= 'admin');

create policy "read task dependencies" on task_dependencies
  for select to authenticated using ((select is_active_user()));
create policy "users write task dependencies" on task_dependencies
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update task dependencies" on task_dependencies
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "users delete task dependencies" on task_dependencies
  for delete to authenticated using ((select current_permission()) >= 'user');

-- These policies are team-blind, and that is temporary rather than intended. Scoping a
-- task to the teams engaged with its job is what the permission batch is for; doing it
-- here would mean writing the predicate twice, because private.my_teams() does not exist
-- yet. Said plainly rather than left to be discovered: today any signed-in user can edit
-- any task.

-- ------------------------------------------------- keep the new functions off the API
revoke execute on function guard_task_dependency_cycle()       from public, anon, authenticated;
revoke execute on function guard_task_dependency_same_record() from public, anon, authenticated;
revoke execute on function stamp_task_completion()             from public, anon, authenticated;

-- ============================================================================
-- 5. What is ready to start
-- ============================================================================
-- The query the board needs and the one most likely to be written wrongly by hand: a
-- task is ready when every task it depends on is done. `not exists` over the unfinished
-- predecessors, so a task with no dependencies at all is ready — which is right, and is
-- the case a `count(done) = count(*)` formulation gets wrong by excluding it.
create view tasks_ready with (security_invoker = true) as
  select t.*
  from tasks t
  where t.task_status in ('open', 'in_progress')
    and not exists (
      select 1
      from task_dependencies d
      join tasks p on p.task_id = d.depends_on_task_id
      where d.task_id = t.task_id
        and p.task_status not in ('done', 'cancelled')
    );

comment on view tasks_ready is
  'Tasks whose predecessors are all finished. A cancelled predecessor counts as finished — otherwise cancelling one step silently freezes everything behind it, which is the opposite of what cancelling means.';
