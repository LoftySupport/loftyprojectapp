-- 0121 — THE AUDIT TRAIL KNOWS WHICH ISSUE IT IS ABOUT
--
-- CORRECTING 0120, AND THE MISTAKE IS WORTH WRITING DOWN
--
--   `0120` gave `activity_events` a `maintenance_request_id`, so that an issue could have a
--   history. It is a sound column and it delivers nothing, because **nothing in the app
--   reads `activity_events`**. The Activity panel reads `activity_audit` — the row-level
--   audit trail `0080` built — through `listRecordActivity`, which filters on
--   `activity_audit_job_id` and `activity_audit_project_id`.
--
--   So `0120` added a parent to the table that models the feed and left the table that
--   FEEDS the feed untouched. Caught while wiring the panel, which is later than it should
--   have been found and earlier than shipping it. The `0120` column stays: it is the right
--   shape for that table and costs nothing, and removing it would leave `activity_events`
--   the only record type a maintenance issue cannot hang off.
--
-- WHY A COLUMN RATHER THAN A JSONB FILTER
--
--   An issue's history could be read today with no migration at all:
--
--       where activity_audit_table = 'maintenance_requests'
--         and activity_audit_new_row ->> 'maintenance_request_id' = $1
--
--   Two reasons that is the wrong answer. `0080`'s own note says the jsonb-path scans it
--   inherited *"are gone with it"* — the denormalised `job_id` and `project_id` columns exist
--   precisely so a record's history is an index lookup. And it would show only the rows
--   about the REQUEST: a photo attached, a task booked, a comment left all write audit rows
--   on other tables, and every one of them belongs in the issue's history.
--
--   So the request id is resolved the same way the job and the project already are, by
--   `private.audit_record_ids`, and stamped by the same trigger.

-- ============================================================ the column and its index
alter table activity_audit
  add column activity_audit_maintenance_request_id uuid;

comment on column activity_audit.activity_audit_maintenance_request_id is
  'The maintenance issue this audit row is about (0121), resolved by private.audit_record_ids the same way the job and the project are. Denormalised on purpose: a record''s history has to be an index lookup rather than a jsonb-path scan over every row ever written, which is the thing 0080 removed. Null for the great majority of rows, so the index below is partial.';

create index activity_audit_maintenance_idx
  on activity_audit (activity_audit_maintenance_request_id, activity_audit_at desc)
  where activity_audit_maintenance_request_id is not null;

-- ================================================ the resolver learns one more parent
--
-- Widened rather than replaced: the job and the project are resolved exactly as before, and
-- this only adds a third OUT parameter. The `create or replace` cannot change the signature,
-- so the old one is dropped first — and `log_activity_audit` below is recreated against the
-- new shape in the same migration, because between the two it would be calling a function
-- that no longer exists.
drop function if exists private.audit_record_ids(text, jsonb);

create function private.audit_record_ids(
  p_table text, r jsonb,
  out job_id text, out project_id integer, out maintenance_request_id uuid
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  t text;
begin
  job_id := null; project_id := null; maintenance_request_id := null;
  if r is null then return; end if;

  job_id := nullif(r ->> 'job_id', '');
  t := r ->> 'project_id';
  if t ~ '^[0-9]+$' then project_id := t::integer; end if;

  begin
    -- The issue, if the row names one. `maintenance_requests` itself keys on
    -- maintenance_request_id; every other table that can belong to an issue — comments,
    -- tasks, document_links, maintenance_items — carries the column by that name since
    -- 0084, 0115 and 0120, so one lookup covers all of them.
    t := nullif(r ->> 'maintenance_request_id', '');
    if t is not null then maintenance_request_id := t::uuid; end if;

    -- An item belongs to a request, and the request is what the drawer is showing.
    if maintenance_request_id is null and r ? 'maintenance_item_id' and p_table <> 'maintenance_items' then
      select i.maintenance_request_id into maintenance_request_id
        from maintenance_items i where i.maintenance_item_id = (r ->> 'maintenance_item_id')::uuid;
    end if;

    -- And an issue always has a job, so a row that found the issue has found the job too.
    if job_id is null and maintenance_request_id is not null then
      select m.job_id into job_id from maintenance_requests m
       where m.maintenance_request_id = audit_record_ids.maintenance_request_id;
    end if;

    if job_id is null and project_id is null then
      if r ? 'task_id' and p_table <> 'tasks' then
        select tk.job_id, tk.project_id into job_id, project_id
          from tasks tk where tk.task_id = (r ->> 'task_id')::uuid;
      elsif r ? 'variation_id' and p_table <> 'variations' then
        select v.job_id into job_id from variations v where v.variation_id = (r ->> 'variation_id')::uuid;
      elsif r ? 'process_run_id' and p_table <> 'process_runs' then
        select pr.job_id, pr.project_id into job_id, project_id
          from process_runs pr where pr.process_run_id = (r ->> 'process_run_id')::uuid;
      elsif r ? 'comment_id' and p_table <> 'comments' then
        select c.job_id, c.project_id into job_id, project_id
          from comments c where c.comment_id = (r ->> 'comment_id')::uuid;
        if job_id is null and project_id is null then
          select ids.job_id, ids.project_id into job_id, project_id
            from comments c, private.audit_record_ids('comments', to_jsonb(c)) ids
           where c.comment_id = (r ->> 'comment_id')::uuid;
        end if;
      end if;
    end if;
    if project_id is null and job_id is not null then
      select j.project_id into project_id from jobs j where j.job_id = audit_record_ids.job_id;
    end if;
  exception when others then
    -- A malformed id, a parent already cascaded away: the row is still logged, with what
    -- could be resolved. 0080's rule, unchanged.
    null;
  end;
end $$;

revoke execute on function private.audit_record_ids(text, jsonb) from public, anon, authenticated;

-- ============================================ the trigger stamps the third id as well
do $$
declare body text;
begin
  -- The function is rebuilt from its own source with the one assignment added, rather than
  -- retyped: 0080's body carries the exempt-table logic, the origin column and the
  -- snapshot handling, and a hand copy of all of it is a copy that drifts.
  select pg_get_functiondef(p.oid) into body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'log_activity_audit';

  if body is null then
    raise exception '0121: log_activity_audit is missing — 0080 has not run';
  end if;

  if position('activity_audit_maintenance_request_id' in body) > 0 then
    raise notice '0121: log_activity_audit already stamps the issue.';
    return;
  end if;

  -- Both halves of the insert: the column list and the value list. Matched on the job id
  -- that already sits in each, so this cannot land in the wrong statement.
  body := replace(body, 'activity_audit_job_id, activity_audit_project_id',
                        'activity_audit_job_id, activity_audit_project_id, activity_audit_maintenance_request_id');
  body := replace(body, 'rec.job_id, rec.project_id',
                        'rec.job_id, rec.project_id, rec.maintenance_request_id');
  -- And the SELECT that fills `rec`, which pulls named columns rather than the whole row —
  -- without this the insert above compiles and then fails at runtime with *record "rec" has
  -- no field "maintenance_request_id"*, which is exactly what the first run of this
  -- migration did.
  body := replace(body, 'select ids.job_id, ids.project_id into rec',
                        'select ids.job_id, ids.project_id, ids.maintenance_request_id into rec');
  execute body;
end $$;

-- ============================================================ the history already written
--
-- Without this, an issue's history starts the day this migration ran and everything before
-- it is invisible — on a record whose whole purpose is being able to say what happened.
-- `0080` did exactly this for the job and the project when it added those columns; the same
-- resolver, over the rows that already exist.
--
-- Bounded to rows that could possibly name an issue, so this is not a full-table rewrite:
-- a row with neither a maintenance_request_id nor a maintenance_item_id in its snapshot
-- cannot resolve to one.
update activity_audit a
   set activity_audit_maintenance_request_id = s.maintenance_request_id
  from (select x.activity_audit_id, ids.maintenance_request_id
          from activity_audit x
          cross join lateral private.audit_record_ids(
            x.activity_audit_table, coalesce(x.activity_audit_new_row, x.activity_audit_old_row)) ids
         where x.activity_audit_maintenance_request_id is null
           and (coalesce(x.activity_audit_new_row, x.activity_audit_old_row) ? 'maintenance_request_id'
             or coalesce(x.activity_audit_new_row, x.activity_audit_old_row) ? 'maintenance_item_id')) s
 where s.activity_audit_id = a.activity_audit_id
   and s.maintenance_request_id is not null;

-- ==================================================================== proof
do $$
declare
  addr uuid; proj integer; job_a text; issue uuid; stamped uuid; n integer;
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('121', 'Probe Street 0121', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into addr;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (addr, addr, 'residential') returning project_id into proj;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (proj, addr, addr, 'construction') returning job_id into job_a;

  insert into maintenance_requests (job_id, maintenance_request_summary)
  values (job_a, 'Probe issue 0121') returning maintenance_request_id into issue;

  -- 1. The issue's own row is stamped with the issue. Without the trigger change this is
  --    null and the Activity panel shows an empty feed on a record that has a history.
  select activity_audit_maintenance_request_id into stamped
    from activity_audit
   where activity_audit_table = 'maintenance_requests'
     and activity_audit_new_row ->> 'maintenance_request_id' = issue::text
   order by activity_audit_at desc limit 1;
  if stamped is distinct from issue then
    raise exception '0121 proof: the issue''s own audit row was stamped %, expected %', stamped, issue;
  end if;

  -- 2. And it still carries the job, so the job's feed does not lose the row to the issue.
  --    Both feeds show it, which is what a history on a child record should do.
  select count(*) into n from activity_audit
   where activity_audit_maintenance_request_id = issue and activity_audit_job_id = job_a;
  if n = 0 then
    raise exception '0121 proof: the issue''s audit row lost its job';
  end if;

  -- 3. A comment on the issue is in the issue's history too — the case a jsonb filter on
  --    maintenance_requests alone would have missed entirely.
  --
  --    AND it carries the job. That second half is the one the "carry the job up from the
  --    issue" branch exists for, and the first version of this block did not test it: a
  --    maintenance_requests row already holds job_id directly, so deleting that branch
  --    changed nothing and the break reported nothing. A comment holds ONLY the issue, so
  --    it is the row that proves the branch.
  insert into comments (comment_body, maintenance_request_id) values ('0121 probe', issue);
  select count(*) into n from activity_audit
   where activity_audit_table = 'comments' and activity_audit_maintenance_request_id = issue;
  if n = 0 then
    raise exception '0121 proof: a comment on the issue is not in the issue''s history';
  end if;
  select count(*) into n from activity_audit
   where activity_audit_table = 'comments' and activity_audit_maintenance_request_id = issue
     and activity_audit_job_id = job_a;
  if n = 0 then
    raise exception '0121 proof: a comment on the issue did not carry the job, so it is missing from the job''s feed';
  end if;

  -- 4. A row about nothing maintenance-related is not swept in.
  select count(*) into n from activity_audit
   where activity_audit_table = 'addresses' and activity_audit_maintenance_request_id is not null;
  if n > 0 then
    raise exception '0121 proof: % address rows were stamped with an issue', n;
  end if;

  raise notice '0121 proof: the audit trail carries the issue, keeps the job, and includes a comment on it.';

  delete from comments where maintenance_request_id = issue;
  delete from maintenance_requests where maintenance_request_id = issue;
  delete from jobs where job_id = job_a;
  delete from projects where project_id = proj;
  delete from addresses where address_id = addr;
  delete from activity_audit where activity_audit_job_id = job_a or activity_audit_project_id = proj;
  execute format('select setval(%L, %s, %L)', seq, seq_last, seq_called);
end
$$;
