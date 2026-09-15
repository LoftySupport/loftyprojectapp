-- 0114 — an issue is a request, and the header is typed once
--
-- Amber, 14 September, rewriting the new-maintenance-request drawer:
--
--   *"each one of these issues have its own record id but you only enter the job number,
--   reported by, identifies at, date once so you can then have a status, date booked,
--   and followup for each"*
--
-- and, asked whether an issue should be a line inside one request or a request of its
-- own, she took the second: **1042-01-M3, -M4, -M5, one per issue, created together from
-- one drawer with the job, the date, where it was identified and who reported it typed
-- once.**
--
-- So nothing new is created here. `maintenance_requests` grows the header fields it did
-- not have, the per-issue fields she named, and a batch id that records which issues were
-- entered in the same sitting.
--
-- WHAT THE DRAWER STOPS ASKING FOR
--
--   How it arrived, the trade, the priority and the owner come off the form (Amber: item
--   2). The columns stay — `maintenance_request_source` still defaults to `staff`, the
--   priority to `normal`, the category and the owner to null — because email and form
--   intake still set them and the queue still reads them. A form that stops asking is a
--   UI change; dropping the columns would be a data loss for a path that still runs.
--
--   The consequence, stated rather than hidden: with no category there is no SLA, so a
--   request logged this way has no due date and the queue reads **No SLA** for it. That is
--   the honest readout, not a defect, and it is what `maintenance_request_health` has
--   always said for a request with no trade.
--
-- WHY `maintenance_request_identified_on` IS NOT A REWRITE OF `reported_at`
--
--   `maintenance_request_reported_at` is not null, defaults to now(), starts the SLA clock
--   and is what the warranty flag compares with handover. Amber's *Date Identified*
--   defaults to today **and can be cleared** — a nullable business date, which is a
--   different thing from the moment the row was logged. Collapsing them would mean either
--   making the SLA clock nullable or refusing to clear the field she asked to be
--   clearable. They are two columns because they are two facts.
--
--   Whether the SLA should run from the identification date rather than the logging date
--   is a real question and it is in docs/open-questions.md rather than answered here.
--   Today it changes nothing, because this drawer sets no category and no category means
--   no SLA at all.
--
-- WHY `maintenance_request_identified_at` IS A CHECK AND NOT A LOOKUP TABLE
--
--   The nine values are Amber's, given in full and in her order. A lookup table would be
--   the right shape the day she wants to add a tenth from Setup, and it would need a Setup
--   screen nobody has asked for. The CHECK is what `source`, `priority` and `status` on
--   this same table already are; HANDOFF.md records the swap as the step to take when
--   editing the list matters.
--
-- WHY A BATCH ID
--
--   Three issues from one PCI walk are three rows that differ only in the issue text.
--   Same job, same day, same inspection is *inferable* from the columns, and it is wrong
--   the first time two people log a PCI on one house on one day. The batch id is the fact
--   itself: these were entered together. The report in part 2 groups on it.

-- --------------------------------------------------------------- the header
alter table maintenance_requests
  add column maintenance_request_identified_on           date,
  add column maintenance_request_identified_at           text,
  add column maintenance_request_reported_by_profile_id  uuid references profiles (profile_id),
  add column maintenance_request_batch_id                uuid;

alter table maintenance_requests
  add constraint maintenance_requests_identified_at_is_known
    check (maintenance_request_identified_at is null or maintenance_request_identified_at in (
      'pci',
      'building_inspector_client',
      'building_inspector_house_inspect',
      'handover_inspection',
      'site_inspection',
      'inspection_1_month',
      'inspection_2_month',
      'inspection_3_month',
      'other'));

comment on column maintenance_requests.maintenance_request_identified_on is
  'The day the issue was identified, as opposed to the moment the row was logged (0114). Defaults to today in the drawer and can be cleared, so it is nullable; maintenance_request_reported_at stays the SLA clock and the warranty comparison.';
comment on column maintenance_requests.maintenance_request_identified_at is
  'Where it was identified (0114), from Amber''s list: pci, building_inspector_client, building_inspector_house_inspect, handover_inspection, site_inspection, inspection_1_month, inspection_2_month, inspection_3_month, other. A CHECK rather than a lookup table because the list is hers and nothing edits it yet.';
comment on column maintenance_requests.maintenance_request_reported_by_profile_id is
  'The Lofty person who reported it (0114) — Amber: "Reported by: Change to select from Internal User name". Separate from maintenance_request_reported_by_contact_id, which is the homeowner an email or form came from and is still how inbound mail is matched.';
comment on column maintenance_requests.maintenance_request_batch_id is
  'The issues entered together in one drawer share this (0114). Not a foreign key and deliberately not a table: it records that these rows were typed in one sitting, which same-job-same-day cannot, and it is what the maintenance report groups a section on.';

create index if not exists maintenance_requests_batch_idx
  on maintenance_requests (maintenance_request_batch_id)
  where maintenance_request_batch_id is not null;
create index if not exists maintenance_requests_reported_by_profile_idx
  on maintenance_requests (maintenance_request_reported_by_profile_id)
  where maintenance_request_reported_by_profile_id is not null;

-- ------------------------------------------------------- who is fixing it
-- Amber: *"Assigned to: Internal / External — (radio select enum type that defaults to
-- internal) — this then adds a dropdown picker of either internal (anyone on maintenance
-- team or construction team from users) or if External then it allows you to select from
-- any companies in the system that are trades or contractors"*.
--
-- This is NOT `maintenance_assignments`. That table is an *offer*: a signed accept link,
-- an expiry, a decline that keeps its row. This is the plain answer to "whose is this",
-- set when the issue is logged and before anybody has been asked. An offer made later
-- still goes through `offer_maintenance_item()` and still emails the contractor; nothing
-- here sends anything.
alter table maintenance_requests
  add column maintenance_request_assignee_kind        text not null default 'internal',
  add column maintenance_request_assignee_profile_id  uuid references profiles (profile_id),
  add column maintenance_request_assigned_company_id  uuid references companies (company_id),
  add column maintenance_request_booked_on            date,
  add column maintenance_request_followup_on          date;

alter table maintenance_requests
  add constraint maintenance_requests_assignee_kind_is_known
    check (maintenance_request_assignee_kind in ('internal', 'external'));

-- Internal names a person, external names a company; neither names the other, and both
-- may name nobody yet. The wrong half being settable is how a row ends up claiming a
-- company is an employee.
alter table maintenance_requests
  add constraint maintenance_requests_assignee_matches_kind
    check (case maintenance_request_assignee_kind
             when 'internal' then maintenance_request_assigned_company_id is null
             when 'external' then maintenance_request_assignee_profile_id is null
           end);

comment on column maintenance_requests.maintenance_request_assignee_kind is
  'internal or external (0114), defaulting to internal — the radio Amber asked for. Decides which of the two assignee columns may be set; the CHECK refuses the other.';
comment on column maintenance_requests.maintenance_request_assignee_profile_id is
  'The Lofty person fixing it when the kind is internal (0114). Null until somebody is picked. Not an offer — maintenance_assignments is the offer, with its accept link and its expiry.';
comment on column maintenance_requests.maintenance_request_assigned_company_id is
  'The trade or contractor fixing it when the kind is external (0114). Null until somebody is picked. Typing a name nothing matches creates the company as a contractor from the drawer, which is what Amber asked for; it is a real companies row and a manager still approves it.';
comment on column maintenance_requests.maintenance_request_booked_on is
  'The day the repair is booked in (0114). Per issue, which is why each issue is its own request.';
comment on column maintenance_requests.maintenance_request_followup_on is
  'The day to chase this issue (0114). Per issue, and nothing derives it — it is a date somebody sets.';

create index if not exists maintenance_requests_assignee_profile_idx
  on maintenance_requests (maintenance_request_assignee_profile_id)
  where maintenance_request_assignee_profile_id is not null;
create index if not exists maintenance_requests_assigned_company_idx
  on maintenance_requests (maintenance_request_assigned_company_id)
  where maintenance_request_assigned_company_id is not null;
create index if not exists maintenance_requests_followup_idx
  on maintenance_requests (maintenance_request_followup_on)
  where maintenance_request_followup_on is not null;

-- ------------------------------------------------------------------ the read
-- `maintenance_request_display` selects `r.*`, so the eleven columns above reach it only
-- when the view is rebuilt — `create or replace` keeps the column list it was made with
-- and refuses a reordering, which is why this is a drop and a create rather than a
-- replace. Everything else about the view is unchanged; the three added names at the end
-- are the joins the drawer needs so it can show a person or a company rather than a uuid.
--
-- security_invoker = true is not decoration: 0069 records what happens without it — the
-- view executes as its owner and hands every reader rows the policies on the table would
-- refuse. Asserted in the proof below.
drop view if exists maintenance_request_display;
create view maintenance_request_display with (security_invoker = true) as
  select r.*,
         jd.job_current_address, jd.job_suburb, jd.project_id,
         c.contact_full_name as maintenance_request_reported_by_name,
         (select m.contact_method_value from contact_methods m where m.contact_id = r.maintenance_request_reported_by_contact_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc limit 1) as maintenance_request_reported_by_email,
         (select m.contact_method_value from contact_methods m where m.contact_id = r.maintenance_request_reported_by_contact_id and m.contact_method_kind in ('mobile', 'phone')
           order by m.contact_method_is_primary desc, (m.contact_method_kind = 'mobile') desc limit 1) as maintenance_request_reported_by_phone,
         o.profile_full_name as maintenance_request_owner_name,
         cat.maintenance_category_name, cat.maintenance_category_at_risk_lead_days,
         w.job_handover_at, w.job_warranty_ends_on,
         (w.job_handover_at is not null
          and (r.maintenance_request_reported_at at time zone 'Australia/Adelaide')::date <= w.job_warranty_ends_on) as maintenance_request_is_warranty,
         (select count(*) from maintenance_items i where i.maintenance_request_id = r.maintenance_request_id)::integer as maintenance_request_items_total,
         (select count(*) from maintenance_items i where i.maintenance_request_id = r.maintenance_request_id
            and i.maintenance_item_status in ('done', 'not_applicable'))::integer as maintenance_request_items_done,
         (select count(*) from maintenance_assignments a join maintenance_items i using (maintenance_item_id)
           where i.maintenance_request_id = r.maintenance_request_id and a.maintenance_assignment_status = 'offered')::integer as maintenance_request_offers_open,
         (select min(a.maintenance_assignment_scheduled_for) from maintenance_assignments a join maintenance_items i using (maintenance_item_id)
           where i.maintenance_request_id = r.maintenance_request_id and a.maintenance_assignment_status in ('accepted', 'scheduled')
             and a.maintenance_assignment_scheduled_for >= now()) as maintenance_request_next_visit,
         (r.maintenance_request_due_on - coalesce(cat.maintenance_category_at_risk_lead_days, 0)) as maintenance_request_at_risk_on,
         case
           when r.maintenance_request_status in ('closed', 'rejected') then 'closed'
           when r.maintenance_request_status = 'completed' then 'complete'
           when r.maintenance_request_due_on is null then 'no_sla'
           when (now() at time zone 'Australia/Adelaide')::date > r.maintenance_request_due_on then 'overdue'
           when cat.maintenance_category_at_risk_lead_days is not null
                and (now() at time zone 'Australia/Adelaide')::date >= r.maintenance_request_due_on - cat.maintenance_category_at_risk_lead_days then 'at_risk'
           else 'on_track'
         end as maintenance_request_health,
         (select count(*) from maintenance_messages m where m.maintenance_request_id = r.maintenance_request_id)::integer as maintenance_request_messages_total,
         (select max(m.maintenance_message_at) from maintenance_messages m where m.maintenance_request_id = r.maintenance_request_id) as maintenance_request_last_message_at,
         -- 0114, at the end: who reported it inside Lofty, and who is fixing it.
         rp.profile_full_name as maintenance_request_reported_by_profile_name,
         asg.profile_full_name as maintenance_request_assignee_name,
         aco.company_name      as maintenance_request_assigned_company_name
    from maintenance_requests r
    join job_display jd on jd.job_id = r.job_id
    left join contacts c on c.contact_id = r.maintenance_request_reported_by_contact_id
    left join profiles o on o.profile_id = r.maintenance_request_owner_profile_id
    left join profiles rp on rp.profile_id = r.maintenance_request_reported_by_profile_id
    left join profiles asg on asg.profile_id = r.maintenance_request_assignee_profile_id
    left join companies aco on aco.company_id = r.maintenance_request_assigned_company_id
    left join maintenance_categories cat on cat.maintenance_category_id = r.maintenance_category_id
    left join job_warranty w on w.job_id = r.job_id;
comment on view maintenance_request_display is
  'A request as the Maintenance tab reads it (0084, widened in 0114): the job''s address, who reported it — the homeowner contact and, since 0114, the Lofty person — the owner, the category and its clock, the warranty flag, item and offer counts, the next visit, health (no_sla · on_track · at_risk · overdue · complete · closed) derived from today, and who it is assigned to, named rather than a uuid.';

-- ---------------------------------------------------------------------- proof
-- Every rule below was watched failing before it was watched passing: each CHECK body was
-- removed in turn and this block raised each time.
--
-- The probe MAKES its fixture rather than reading one, so it bites on a replay from empty
-- as well as on production. 0113's guarded probe is the counter-example it documents
-- itself: with no jobs on the table it skipped and reported a clean migration.
--
-- The projects identity sequence is captured and put back, the way 0084's proof does it —
-- a probe that quietly advances the number the next real project will take is a probe
-- that changed production.
do $$
declare
  probe_address uuid; probe_project integer; probe_job text; probe_company uuid; probe_profile uuid;
  req uuid; opts text[];
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('114', 'Probe Street 0114', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'construction') returning job_id into probe_job;
  insert into companies (company_name) values ('Probe Trades 0114') returning company_id into probe_company;
  select profile_id into probe_profile from profiles limit 1;

  insert into maintenance_requests (job_id, maintenance_request_summary)
  values (probe_job, 'Probe issue 0114') returning maintenance_request_id into req;

  -- An inspection nobody named is refused; one of Amber's nine is accepted.
  begin
    update maintenance_requests set maintenance_request_identified_at = 'over_the_fence' where maintenance_request_id = req;
    raise exception '0114 proof: an unknown identified_at was accepted';
  exception when check_violation then null;
  end;
  update maintenance_requests set maintenance_request_identified_at = 'inspection_3_month',
                                  maintenance_request_identified_on = (now() at time zone 'Australia/Adelaide')::date
   where maintenance_request_id = req;
  -- Clearing the date is allowed. This is the half of "defaults to today, but can be
  -- cleared" that a not-null column would have refused, which is why it is not one.
  update maintenance_requests set maintenance_request_identified_on = null where maintenance_request_id = req;

  -- The default is internal, unasked.
  perform 1 from maintenance_requests
   where maintenance_request_id = req and maintenance_request_assignee_kind = 'internal';
  if not found then raise exception '0114 proof: a new request did not default to internal'; end if;

  -- Internal cannot name a company...
  begin
    update maintenance_requests set maintenance_request_assigned_company_id = probe_company where maintenance_request_id = req;
    raise exception '0114 proof: an internal request took a company';
  exception when check_violation then null;
  end;
  -- ...and external can, once the kind says so.
  update maintenance_requests set maintenance_request_assignee_kind = 'external',
                                  maintenance_request_assigned_company_id = probe_company
   where maintenance_request_id = req;

  -- External cannot then also name a person. probe_profile is never null: 0016 seeds the
  -- team, so a replay from empty has profiles even though it has no jobs.
  if probe_profile is null then raise exception '0114 proof: no profile to test the external/internal pair with'; end if;
  begin
    update maintenance_requests set maintenance_request_assignee_profile_id = probe_profile where maintenance_request_id = req;
    raise exception '0114 proof: an external request took a person as well as a company';
  exception when check_violation then null;
  end;

  -- A kind that is neither is refused.
  begin
    update maintenance_requests set maintenance_request_assignee_kind = 'subcontractor' where maintenance_request_id = req;
    raise exception '0114 proof: an unknown assignee kind was accepted';
  exception when check_violation then null;
  end;

  -- The three dates and the batch id take what they are given.
  update maintenance_requests
     set maintenance_request_booked_on   = (now() at time zone 'Australia/Adelaide')::date + 4,
         maintenance_request_followup_on = (now() at time zone 'Australia/Adelaide')::date + 11,
         maintenance_request_batch_id    = gen_random_uuid()
   where maintenance_request_id = req;

  -- The view carries all eleven and still executes as the invoker. Without the second
  -- half this would be the 0069 hole reopened on a drop-and-create, silently.
  perform 1 from information_schema.columns
   where table_name = 'maintenance_request_display'
     and column_name in ('maintenance_request_identified_on', 'maintenance_request_identified_at',
                         'maintenance_request_reported_by_profile_id', 'maintenance_request_batch_id',
                         'maintenance_request_assignee_kind', 'maintenance_request_assignee_profile_id',
                         'maintenance_request_assigned_company_id', 'maintenance_request_booked_on',
                         'maintenance_request_followup_on', 'maintenance_request_assignee_name',
                         'maintenance_request_assigned_company_name')
  having count(*) = 11;
  if not found then raise exception '0114 proof: maintenance_request_display is missing one of the eleven columns'; end if;

  select c.reloptions into opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'maintenance_request_display';
  if opts is null or not (array_to_string(opts, ',') like '%security_invoker=%') then
    raise exception '0114 proof: maintenance_request_display lost security_invoker — see 0069';
  end if;

  -- The fixture goes, and the project number it took goes back.
  delete from maintenance_requests where maintenance_request_id = req;
  delete from companies where company_id = probe_company;
  delete from jobs where job_id = probe_job;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  execute format('select setval(%L, %s, %L)', seq, seq_last, seq_called);
end $$;
