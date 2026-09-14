-- 0116 — a repair has a day it was booked and a day it was done
--
-- Amber, 14 September, looking at the drawer: *"add in the date booked, date completed
-- into UI and drawer when clicked on."*
--
-- `maintenance_request_booked_on` already exists — `0114` added it with the follow-up date
-- and nothing has ever shown either. **Completed did not.** The nearest things on the table
-- are the `completed` STATUS, which says where the issue is rather than when it got there,
-- and `maintenance_request_closed_at`, which the guard stamps only on closed or rejected
-- and which is a timestamp of an app action rather than the day a tradesperson finished.
--
-- So one column, and it is the same kind of thing as the two beside it: a date somebody
-- sets, nullable, nothing derives it.
--
-- NO TRIGGER, ON PURPOSE
--
--   The obvious next thought is that setting the date should move the status to
--   `completed`, or that moving the status should stamp the date. Neither is built.
--   Amber asked for a field, and a trigger that writes one column from another is exactly
--   the coupling the schema plan keeps finding at the bottom of a bug: the day the two
--   disagree, nobody can say which is right. `maintenance_item_completed_at` IS stamped
--   by a trigger, and that is different — it is stamped from the status it belongs to and
--   cleared when the status leaves, one fact with one writer.
--
--   A request can therefore carry a completion date while its status is still In progress.
--   That is a real state — the tradesperson finished on Tuesday and nobody has closed the
--   ticket — and the drawer shows both rather than reconciling them.
--
-- THE VIEW IS REBUILT, AGAIN, AND THAT IS THE COST `0114` NAMED
--
--   `maintenance_request_display` selects `r.*`, which expands at creation. A column added
--   afterwards does not reach it, and `create or replace view` refuses the reordering that
--   re-expanding `r.*` implies. So every new column on this table means dropping and
--   recreating the view verbatim. It is written out below unchanged apart from picking up
--   the new column through `r.*`.

alter table maintenance_requests
  add column maintenance_request_completed_on date;

comment on column maintenance_requests.maintenance_request_completed_on is
  'The day the repair was actually done (0116) — a date somebody sets, like the booking and the follow-up beside it. Deliberately NOT derived from the status and not stamped by a trigger: a request may carry this date while its status is still In progress, because the tradesperson finishing and the ticket being closed are two events. maintenance_request_closed_at remains the timestamp of the close itself.';

create index if not exists maintenance_requests_completed_idx
  on maintenance_requests (maintenance_request_completed_on)
  where maintenance_request_completed_on is not null;

-- ------------------------------------------------------------------ the read
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
  'A request as the Maintenance tab reads it (0084, widened in 0114 and 0116): the job''s address, who reported it — the homeowner contact and, since 0114, the Lofty person — the owner, the category and its clock, the warranty flag, item and offer counts, the next visit, health (no_sla · on_track · at_risk · overdue · complete · closed) derived from today, and who it is assigned to, named rather than a uuid.';

-- ---------------------------------------------------------------------- proof
-- The column takes a date and gives it back, the view carries it, and the view still
-- executes as the invoker. Watched failing by dropping the `alter table` (the view probe
-- reported the missing column) and by removing `with (security_invoker = true)` from the
-- create above — the 0069 hole, reproduced and caught on a drop-and-create, which is
-- exactly how that hole was made the first time.
--
-- The probe makes its own job rather than reading one, so it bites on a replay from empty
-- as well as on production, and puts the projects identity sequence back.
do $$
declare
  probe_address uuid; probe_project integer; probe_job text; req uuid; got date; opts text[];
  seq text := pg_get_serial_sequence('projects', 'project_id'); seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('116', 'Probe Street 0116', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'construction') returning job_id into probe_job;
  insert into maintenance_requests (job_id, maintenance_request_summary)
  values (probe_job, 'Probe issue 0116') returning maintenance_request_id into req;

  -- A completion date with the status left alone. This is the state the no-trigger
  -- decision above allows on purpose, so it is the state the proof asserts.
  update maintenance_requests
     set maintenance_request_completed_on = (now() at time zone 'Australia/Adelaide')::date,
         maintenance_request_booked_on    = (now() at time zone 'Australia/Adelaide')::date - 3
   where maintenance_request_id = req;
  select maintenance_request_completed_on into got from maintenance_request_display where maintenance_request_id = req;
  if got is null then raise exception '0116 proof: maintenance_request_display does not carry the completion date'; end if;
  perform 1 from maintenance_requests
   where maintenance_request_id = req and maintenance_request_status = 'new';
  if not found then raise exception '0116 proof: setting the completion date moved the status — something stamps it after all'; end if;

  -- And it clears, because a date typed by mistake has to be removable.
  update maintenance_requests set maintenance_request_completed_on = null where maintenance_request_id = req;

  select c.reloptions into opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'maintenance_request_display';
  if opts is null or not (array_to_string(opts, ',') like '%security_invoker=%') then
    raise exception '0116 proof: maintenance_request_display lost security_invoker — see 0069';
  end if;

  delete from maintenance_requests where maintenance_request_id = req;
  delete from jobs where job_id = probe_job;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  execute format('select setval(%L, %s, %L)', seq, seq_last, seq_called);
end $$;
