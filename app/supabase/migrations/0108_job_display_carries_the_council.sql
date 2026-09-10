-- =============================================================================
-- 0108 — the council was write-only on a job
-- =============================================================================
-- Amber, 10 September, on the address format `0105` and `0106` settled:
--
--   "ok the council area still needs to be recorded, but just not in the full
--    address line. it stays as a property field"
--
-- The first two halves were already true and are worth stating rather than assuming:
--
--   RECORDED — `addresses.address_council` is an `sa_council` enum value on every
--   address row, filled in from the suburb off the LGA list, and every address form in
--   the app offers the picker. `0106` did not touch it.
--
--   NOT IN THE LINE — `build_consolidated_address()` has never composed the council
--   into `address_consolidated`. Not in `0034`, not in `0105`, not in `0106`. The line
--   is Res, Lot, street number, street, suburb, state, postcode, and that is all.
--
-- The third half was NOT true, and that is what this migration is for.
--
-- A JOB'S COUNCIL COULD BE SET AND NEVER READ
--
--   A project shows "Council region" as its own field on the drawer, read from
--   `project_display.project_council`. A job shows nothing of the kind — and since
--   yesterday a job's address can be CHANGED from the drawer, through the same
--   `AddressFields` that carries the council picker. So the app has had a field you can
--   write and cannot read: pick "City of Onkaparinga" on a job's new address, save, and
--   nowhere in the app will ever say so again.
--
--   The cause is `job_display`'s column list. The view resolves `job_suburb` off the
--   job's current address and stops there; `address_council` sits on the same joined
--   row, one column away, and was never selected. This is `0055`'s lesson twice over —
--   "a view's column list is frozen at creation" — and the same shape as the
--   `project_type` read that rendered a token for a value the view already returned.
--
-- WHAT "A PROPERTY FIELD" IS TAKEN TO MEAN
--
--   A field on the record, shown and editable where the rest of the address is — not a
--   row in `property_defs`. There is no council property definition today and this does
--   not add one: the council is an attribute of an address, it moves when the address
--   moves, and a `property_values` row would be a second place for it to disagree with
--   `addresses.address_council`. If Amber meant the properties list specifically, that
--   is a migration to add a `project`-scope definition and a decision about which of the
--   two is then authoritative — recorded as an open question rather than guessed at.
--
-- ------------------------------------------------------------------------------------
-- `create or replace`, columns APPENDED only, and `security_invoker` NAMED — 0069.
-- `create or replace view` drops reloptions silently, which is how this view spent
-- thirteen migrations executing as its owner and handing a demo-gated account every job
-- in the company. The `with` clause below is not decoration and the assertion at the
-- bottom is the thing that would catch it going missing again.
-- ------------------------------------------------------------------------------------
create or replace view job_display with (security_invoker = true) as
 SELECT j.job_id,
    j.project_id,
    j.job_sequence,
    j.job_number_old,
    j.job_original_address_id,
    j.job_current_address_id,
    j.job_created_at,
    j.job_created_by,
    j.job_updated_at,
    j.job_updated_by,
    p.project_type,
    j.job_status,
    is_current(j.job_status) AS job_is_current,
    j.job_stage,
    j.job_stage_entered_at,
    j.job_owning_team,
    j.job_engaged_teams,
    j.job_assignee_id,
    j.job_sharepoint_url,
    cur.address_consolidated AS job_current_address,
    orig.address_consolidated AS job_original_address,
    cur.address_suburb AS job_suburb,
    pcur.address_consolidated AS project_current_address,
    p.project_sharepoint_url,
    j.job_title_type,
    -- New, and last, because replace refuses a reorder and that refusal is the point.
    cur.address_council AS job_council
   FROM jobs j
     JOIN projects p USING (project_id)
     JOIN addresses cur ON cur.address_id = j.job_current_address_id
     LEFT JOIN addresses orig ON orig.address_id = j.job_original_address_id
     JOIN addresses pcur ON pcur.address_id = p.project_current_address_id;

comment on view job_display is
  'The job board''s read. security_invoker = true, restored in 0069 after 0055''s '
  'create-or-replace dropped it: without it the view executes as its owner and hands '
  'every reader rows the policies on jobs would refuse, including an account held at '
  'the demo gate. Asserted in verify/behaviour.sql for every view, not just this one. '
  'Carries job_council since 0108 — the council of the job''s OWN current address, '
  'which the drawer could set and could not show.';

-- =============================================================================
-- Prove it.
--
-- WATCHED FAILING BEFORE TRUSTED, against the live database:
--   * the `with (security_invoker = true)` clause removed -> assertion 1 raises, which
--     is the 0069 hole reproduced and caught this time;
--   * `cur.address_council` written as `pcur.address_council` -> assertion 3 raises.
--     It only can because it MANUFACTURES the disagreement: every one of the 79 jobs
--     today sits on its project's site and carries the identical council, so a probe
--     that merely compared the two would have passed on the wrong join.
-- =============================================================================
do $$
declare
  opts   text[];
  reads  text;
  counted integer;
begin
  -- 1. The invoker survived the replace. 0069's whole reason for existing.
  select c.reloptions into opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'job_display';

  if opts is null or not ('security_invoker=true' = any(opts)) then
    raise exception '0108: job_display lost security_invoker in the replace — reloptions %',
      coalesce(opts::text, '(none)');
  end if;

  -- 2. The column is there and answers.
  select count(*) into counted
    from information_schema.columns
   where table_schema = 'public' and table_name = 'job_display' and column_name = 'job_council';
  if counted <> 1 then
    raise exception '0108: job_display has no job_council column.';
  end if;

  -- 3. It is the JOB's council, not the PROJECT's — and comparing the two as they
  --    stand proves nothing, because all 79 jobs today sit on their project's site and
  --    carry the identical council. `cur` and `pcur` are indistinguishable on this data.
  --
  --    So make them differ, inside a sub-transaction that is rolled back by raising:
  --    move one job's own address to a council its project's address does not have,
  --    read the view, and put it back. 0034's probe pattern, and the plpgsql variables
  --    survive the rollback, which is the only reason it can be checked afterwards.
  declare
    victim   text;
    other    sa_council;
    original sa_council;
  begin
    select j.job_id, ja.address_council into victim, original
      from jobs j
      join addresses ja on ja.address_id = j.job_current_address_id
     where ja.address_council is not null
     limit 1;

    if victim is null then
      raise notice '0108: no job carries a council, so the cur/pcur probe is skipped.';
    else
      select v into other
        from unnest(enum_range(null::sa_council)) v
       where v is distinct from original
       limit 1;

      begin
        update addresses set address_council = other
         where address_id = (select job_current_address_id from jobs where job_id = victim);

        select d.job_council::text into reads from job_display d where d.job_id = victim;

        raise exception 'undo_probe';
      exception when others then
        if sqlerrm <> 'undo_probe' then raise; end if;
      end;

      if reads is distinct from other::text then
        raise exception '0108: job_council read "%" when the job''s own address said "%" — '
          'the view is reading the project''s address, not the job''s.',
          coalesce(reads, '(null)'), other::text;
      end if;
    end if;
  end;

  raise notice '0108: job_display carries job_council, off the job''s own address, and kept its invoker.';
end $$;
