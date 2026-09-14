-- 0117 — a company carries the person you ring
--
-- Amber, 14 September, on a maintenance issue given to a contractor: *"with the assigned
-- contact to maintenance can you display company name, primary contact, email and phone
-- and suburb"*.
--
-- Four of those five already exist on `company_display`. **The primary contact does not**,
-- and the suburb is only reachable inside `company_address`, which is the whole address as
-- one line. So the view is widened; no table changes.
--
-- NOTHING IS INVENTED, BECAUSE THE FACT IS ALREADY MODELLED
--
--   `company_contacts.company_contact_is_primary` has existed since `0082` — "the primary
--   contact" is a flag somebody sets, not a guess this view makes. A company with nobody
--   flagged gets NULL and the screen says so; picking the oldest employee and calling them
--   the contact is exactly the plausible value CLAUDE.md keeps warning about.
--
--   Ended employments are excluded. Somebody who left is not who you ring.
--
-- THE EMAIL AND THE PHONE ARE THE CONTACT'S OWN
--
--   `company_primary_email` and `company_primary_phone` already carry the COMPANY's —
--   the office address, the office number. These four new columns carry the PERSON's, and
--   they are separate rather than a coalesce, because "the mobile of the person you ring"
--   and "the switchboard" are different facts and a screen that silently substitutes one
--   for the other is a screen that rings the wrong number. The app decides what to show
--   when the person has none; the view reports both truthfully.
--
-- SUBURB, SEPARATELY FROM THE ADDRESS
--
--   `company_address` stays exactly as it is. The suburb is added beside it because a
--   contractor list is scanned by area — "who do we have in Golden Grove" — and picking a
--   suburb back out of a consolidated line means parsing, which is how an address ends up
--   being reformatted differently in two places.

drop view if exists company_display;
create view company_display with (security_invoker = true) as
  select co.company_id, co.company_name, co.company_trading_name, co.company_abn, co.company_address_id, co.company_notes,
         co.company_source, co.company_is_active, co.company_approved_at, co.company_approved_by, co.company_created_at, co.company_updated_at,
         (select m.contact_method_value from contact_methods m
           where m.company_id = co.company_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc, m.contact_method_created_at limit 1) as company_primary_email,
         (select m.contact_method_value from contact_methods m
           where m.company_id = co.company_id and m.contact_method_kind in ('phone', 'mobile')
           order by m.contact_method_is_primary desc, m.contact_method_created_at limit 1) as company_primary_phone,
         coalesce((select array_agg(k.classification_id order by cl.classification_position)
                     from company_classifications k join classifications cl using (classification_id)
                    where k.company_id = co.company_id), '{}'::text[]) as company_classification_ids,
         (select count(*) from company_contacts x where x.company_id = co.company_id and x.company_contact_ended_on is null)::integer as company_people_count,
         (select count(*) from record_parties rp where (rp.company_id = co.company_id or rp.record_party_engaged_by_company_id = co.company_id) and rp.record_party_ended_on is null)::integer as company_open_parties,
         a.address_consolidated as company_address,
         -- 0117, at the end: the person you ring, their own email and phone, and the suburb.
         pc.contact_full_name  as company_primary_contact_name,
         pc.contact_id         as company_primary_contact_id,
         pc.company_contact_job_role as company_primary_contact_role,
         (select m.contact_method_value from contact_methods m
           where m.contact_id = pc.contact_id and m.contact_method_kind = 'email'
           order by m.contact_method_is_primary desc, m.contact_method_created_at limit 1) as company_primary_contact_email,
         (select m.contact_method_value from contact_methods m
           where m.contact_id = pc.contact_id and m.contact_method_kind in ('mobile', 'phone')
           order by m.contact_method_is_primary desc, (m.contact_method_kind = 'mobile') desc, m.contact_method_created_at limit 1) as company_primary_contact_phone,
         a.address_suburb as company_suburb
    from companies co
    left join addresses a on a.address_id = co.company_address_id
    -- The one flagged primary, and only while they still work there. `limit 1` in a
    -- lateral rather than a join, because two rows flagged primary would otherwise
    -- duplicate the company in every contractor list that reads this view.
    left join lateral (
      select cc.contact_id, cc.company_contact_job_role, ct.contact_full_name
        from company_contacts cc
        join contacts ct on ct.contact_id = cc.contact_id
       where cc.company_id = co.company_id
         and cc.company_contact_ended_on is null
         and cc.company_contact_is_primary
       order by cc.company_contact_started_on nulls last, cc.company_contact_created_at
       limit 1
    ) pc on true;

comment on view company_display is
  'A company as the Contacts list reads it (0082, widened in 0117): name, ABN, the company''s own primary email and phone, classifications, how many people currently work there and how many records it is on, the whole address and — since 0117 — the flagged primary contact with their OWN email and phone, and the suburb on its own. The person''s contact details are separate columns from the company''s on purpose: a mobile and a switchboard are different facts.';

-- ---------------------------------------------------------------------- proof
-- Watched failing by dropping the lateral join (the contact probe reported the missing
-- name), by removing the `company_contact_is_primary` filter (a non-primary employee was
-- named as the contact), by dropping the `company_contact_ended_on is null` filter (a
-- person who had left was named), and by removing `with (security_invoker = true)` — the
-- 0069 hole, reproduced and caught on a drop-and-create.
--
-- The probe makes its own company, contacts and address, so it bites on a replay from
-- empty as well as on production, and deletes every row it made.
do $$
declare
  probe_addr uuid; probe_co uuid; the_one uuid; a_leaver uuid; an_extra uuid;
  got record; opts text[];
begin
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('117', 'Probe Street 0117', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_addr;
  insert into companies (company_name, company_address_id) values ('Probe Trades 0117', probe_addr) returning company_id into probe_co;

  insert into contacts (contact_first_name, contact_last_name) values ('Probe', 'Primary 0117') returning contact_id into the_one;
  insert into contacts (contact_first_name, contact_last_name) values ('Probe', 'Leaver 0117') returning contact_id into a_leaver;
  insert into contacts (contact_first_name, contact_last_name) values ('Probe', 'Extra 0117') returning contact_id into an_extra;

  -- The person's own details, and the company's, deliberately different so a view that
  -- substituted one for the other would be caught rather than look right.
  insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary)
  values (the_one, 'email', 'primary0117@example.com', true);
  insert into contact_methods (contact_id, contact_method_kind, contact_method_value, contact_method_is_primary)
  values (the_one, 'mobile', '0400 000 117', true);
  insert into contact_methods (company_id, contact_method_kind, contact_method_value, contact_method_is_primary)
  values (probe_co, 'email', 'office0117@example.com', true);

  -- A leaver who was primary, and a current employee who is not. Either one being named
  -- is the failure this proves against.
  --
  -- THE START DATES ARE THE WHOLE FIXTURE, and they were missing the first time.
  --   Without them all three employments share one `created_at` — every insert in a `do`
  --   block gets the same transaction `now()` — and `started_on` was null on all three, so
  --   the lateral's ORDER BY had nothing to sort on and `limit 1` returned whichever row
  --   the planner reached first. Removing the `company_contact_is_primary` filter to watch
  --   this bite therefore reported ALL MIGRATIONS APPLIED CLEANLY: the probe passed by
  --   luck, on an ordering no rule guarantees.
  --
  --   `an_extra` now starts EARLIEST, so without the primary filter the lateral must
  --   return them. The assertion has something to fail on.
  insert into company_contacts (company_id, contact_id, company_contact_is_primary, company_contact_ended_on, company_contact_started_on)
  values (probe_co, a_leaver, true, current_date - 30, current_date - 400);
  insert into company_contacts (company_id, contact_id, company_contact_is_primary, company_contact_started_on)
  values (probe_co, an_extra, false, current_date - 300);
  insert into company_contacts (company_id, contact_id, company_contact_is_primary, company_contact_job_role, company_contact_started_on)
  values (probe_co, the_one, true, 'Site supervisor', current_date - 10);

  select company_primary_contact_name, company_primary_contact_email, company_primary_contact_phone,
         company_primary_contact_role, company_suburb, company_primary_email
    into got
    from company_display where company_id = probe_co;

  if got.company_primary_contact_name is distinct from 'Probe Primary 0117' then
    raise exception '0117 proof: the primary contact is %, expected Probe Primary 0117', coalesce(got.company_primary_contact_name, '<null>');
  end if;
  if got.company_primary_contact_email is distinct from 'primary0117@example.com' then
    raise exception '0117 proof: the contact email is %, expected the person''s own', coalesce(got.company_primary_contact_email, '<null>');
  end if;
  if got.company_primary_contact_phone is distinct from '0400 000 117' then
    raise exception '0117 proof: the contact phone is %, expected the person''s mobile', coalesce(got.company_primary_contact_phone, '<null>');
  end if;
  if got.company_primary_contact_role is distinct from 'Site supervisor' then
    raise exception '0117 proof: the job role did not come through';
  end if;
  if got.company_suburb is distinct from 'Golden Grove' then
    raise exception '0117 proof: the suburb is %, expected Golden Grove', coalesce(got.company_suburb, '<null>');
  end if;
  -- The company's own email is still its own, beside the person's rather than replaced.
  if got.company_primary_email is distinct from 'office0117@example.com' then
    raise exception '0117 proof: the company email was overwritten by the contact''s';
  end if;

  -- Exactly one row for the company, whatever the employment history holds. Two rows
  -- flagged primary would otherwise duplicate every contractor in the picker.
  perform 1 from company_display where company_id = probe_co having count(*) = 1;
  if not found then raise exception '0117 proof: the company appears more than once'; end if;

  select c.reloptions into opts
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'company_display';
  if opts is null or not (array_to_string(opts, ',') like '%security_invoker=%') then
    raise exception '0117 proof: company_display lost security_invoker — see 0069';
  end if;

  delete from company_contacts where company_id = probe_co;
  delete from contact_methods where company_id = probe_co or contact_id in (the_one, a_leaver, an_extra);
  delete from contacts where contact_id in (the_one, a_leaver, an_extra);
  delete from companies where company_id = probe_co;
  delete from addresses where address_id = probe_addr;
end $$;
