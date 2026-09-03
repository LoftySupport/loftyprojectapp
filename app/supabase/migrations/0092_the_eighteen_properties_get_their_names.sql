-- 0092 — the eighteen properties get their names back
--
-- Amber, 3 September: "just do the first shee from project def rows" — the FIRST sheet
-- of `property_defs_rows.xlsx`, which is her 139 hand-added rows. 121 of them became new
-- properties in 0090. These are the other 18.
--
-- WHY THEY WERE NOT CREATED, AND WHY THEY ARE NOT CREATED NOW EITHER
--
--   Each one already exists. Not "looks similar" — the same property: same scope, same
--   lifecycle stage, and the same SLA where there is one. All five of the SLAs line up
--   exactly (30, 7, 14, 10 and 3 days), which is not a coincidence you can get twice.
--   0090's `on conflict do nothing` skipped them because the key its label slugs to is
--   the key already sitting in the table.
--
--   What Amber's sheet adds is not a row. It is the three things those rows never had:
--   the full name, the team that owns them, and a format instead of "unknown".
--
--   Asked which she wanted, Amber chose updating the eighteen in place over creating
--   eighteen more beside them. Creating them would have put two identical
--   "BOB Signed + Contact Details (30 Days)" fields on every project drawer, and would
--   have needed an invented suffix to tell the keys apart — a token that means nothing,
--   which is exactly what this repo does not put in a column.
--
-- WHAT THIS FIXES ON THE SCREEN
--
--   The group lived in the key and not in the label, so Setup → Properties showed four
--   different rows all reading "Ordered" — Section 221, Site Survey, Soil Bore Logs and
--   Working Drawings — and three reading "Received (14 Days)". The names below are
--   Amber's own from the sheet, so a person reading the page sees which is which.
--
-- WHAT IS DELIBERATELY NOT OVERWRITTEN
--
--   * A FORMAT THAT IS ALREADY SET. The sheet says `date` for all eighteen; two of them
--     already carry a format somebody chose — `retaining_fencing_bob_fencing_in_contract`
--     is a checkbox and `selections_consultant` is text, and both are right: "Fencing In
--     Contract?" is a yes-or-no and a consultant is a person's name, neither of which is
--     a date. So the format is filled in only where it currently reads `unknown`, which
--     is the app's way of saying nobody has chosen. Four more are already `date` and stay
--     that way.
--   * A TEAM THAT IS ALREADY NAMED. Only `selections_email_request_to_selections_to_contact_client`
--     has one, and the sheet agrees with it.
--   * THE SLA. It already matches; there is nothing to write.
--
--   One thing IS worth Amber's eye: "Retaining In Contract?" and "Retaining Required
--   Before Or During Build" both read as questions and both get `date` from this, because
--   their format is unset and the sheet says date. Their sibling "Fencing In Contract?" is
--   a checkbox. If they should be checkboxes too it is two clicks on the Properties page.
--
-- The group word goes into `property_def_automation` the way 0090 put it there for the
-- other 121 — same column, same reservation recorded in that migration: it looks like a
-- stage group rather than an automation note, and when a column for that exists these
-- eighteen move with the rest rather than being left behind.

with sheet(key, label, team, format) as (values
  ('retaining_fencing_bob_bob_sent', 'Retaining, Fencing & BOB BOB Sent', 'construction_admin', 'date'),
  ('retaining_fencing_bob_bob_signed_contact_details_30_days', 'Retaining, Fencing & BOB BOB Signed + Contact Details (30 Days)', 'construction_admin', 'date'),
  ('retaining_fencing_bob_fencing_in_contract', 'Retaining, Fencing & BOB Fencing In Contract?', 'construction_admin', 'date'),
  ('retaining_fencing_bob_fencing_notices_issued_to_client', 'Retaining, Fencing & BOB Fencing Notices Issued to client', 'construction_admin', 'date'),
  ('retaining_fencing_bob_fencing_sent_via_registered_mail', 'Retaining, Fencing & BOB Fencing Sent Via Registered Mail', 'construction_admin', 'date'),
  ('retaining_fencing_bob_registered_mail_collected', 'Retaining, Fencing & BOB Registered Mail Collected', 'construction_admin', 'date'),
  ('retaining_fencing_bob_retaining_in_contract', 'Retaining, Fencing & BOB Retaining In Contract?', 'construction_admin', 'date'),
  ('retaining_fencing_bob_retaining_required_before_or_during_build', 'Retaining, Fencing & BOB Retaining Required Before Or During Build', 'construction_admin', 'date'),
  ('sa_water_confirmation_of_sa_water_meters_sewer_connection_on_site', 'SA Water Confirmation of SA Water Meters & Sewer Connection on Site', 'construction_admin', 'date'),
  ('sa_water_cross_check_sa_water_locations_against_working_drawings', 'SA Water Cross check SA Water Locations against Working Drawings', 'construction_admin', 'date'),
  ('sa_water_invoice_received', 'SA Water Invoice Received', 'construction_admin', 'date'),
  ('selections_email_request_to_selections_to_contact_client', 'Selections Email Request to selections to contact client', 'selections', 'date'),
  ('section_221_stormwater_crossover_permits_ordered', 'Section 221 - Stormwater/Crossover Permits Ordered', 'pre_construction_admin', 'date'),
  -- Amber's sheet says "Selections Selections Consultant". That is her group word
  -- ("Selections") in front of a label that already begins with it, and the point of
  -- this migration is a name a person can read — "Selections Selections Consultant" is
  -- not that. The existing label already carries the group, so it is kept as it is.
  -- Her row's TEAM and FORMAT still apply; only the stutter is dropped.
  ('selections_consultant', 'Selections Consultant', 'selections', 'date'),
  ('site_survey_ordered', 'Site Survey Ordered', 'pre_construction_admin', 'date'),
  ('site_survey_received', 'Site Survey Received', 'pre_construction_admin', 'date'),
  ('soil_bore_logs_ordered', 'Soil - Bore Logs Ordered', 'pre_construction_admin', 'date'),
  ('working_drawings_plan_check_complete', 'Working Drawings Plan Check complete', 'design', 'date')
)
update property_defs d set
  property_def_label = s.label,
  -- Only where nobody has chosen. `unknown` is the app's "not set"; a real format is a
  -- decision, and this migration is not entitled to reverse one.
  property_def_format = case when d.property_def_format = 'unknown' then s.format
                             else d.property_def_format end,
  property_def_owning_team = coalesce(d.property_def_owning_team, s.team),
  property_def_automation = coalesce(d.property_def_automation, split_part(s.label, ' ', 1))
  from sheet s
 where d.property_def_key = s.key;

-- The group word, verbatim from the sheet rather than the first word of the label, for
-- the seven groups whose names are more than one word.
--
-- Keys listed rather than `like 'retaining_fencing_bob%'`, which was the first draft:
-- that pattern also matches seven rows that are NOT among the eighteen — the cross
-- notices, the folder-saved notices and the overdue letters. Setting their group would
-- have been reasonable and would still have made this migration do more than it says,
-- and a migration that quietly reaches past its own description is how the next person
-- stops trusting the descriptions.
update property_defs set property_def_automation = 'Retaining, Fencing & BOB'
 where property_def_key in ('retaining_fencing_bob_bob_sent',
                            'retaining_fencing_bob_bob_signed_contact_details_30_days',
                            'retaining_fencing_bob_fencing_in_contract',
                            'retaining_fencing_bob_fencing_notices_issued_to_client',
                            'retaining_fencing_bob_fencing_sent_via_registered_mail',
                            'retaining_fencing_bob_registered_mail_collected',
                            'retaining_fencing_bob_retaining_in_contract',
                            'retaining_fencing_bob_retaining_required_before_or_during_build');
update property_defs set property_def_automation = 'SA Water'
 where property_def_key in ('sa_water_confirmation_of_sa_water_meters_sewer_connection_on_site',
                            'sa_water_cross_check_sa_water_locations_against_working_drawings',
                            'sa_water_invoice_received');
update property_defs set property_def_automation = 'Section 221 - Stormwater/Crossover Permits'
 where property_def_key = 'section_221_stormwater_crossover_permits_ordered';
update property_defs set property_def_automation = 'Selections'
 where property_def_key in ('selections_consultant', 'selections_email_request_to_selections_to_contact_client');
update property_defs set property_def_automation = 'Site Survey'
 where property_def_key in ('site_survey_ordered', 'site_survey_received');
update property_defs set property_def_automation = 'Soil - Bore Logs'
 where property_def_key = 'soil_bore_logs_ordered';
update property_defs set property_def_automation = 'Working Drawings'
 where property_def_key = 'working_drawings_plan_check_complete';

-- ============================================================================ proof
--
-- Every one of these was watched failing first, each on a database replayed WITHOUT this
-- migration — because it is idempotent by outcome, so a broken copy re-run over an
-- already-migrated database passes for the wrong reason. The messages, verbatim:
--
--   * the update's WHERE clause pointed at a key that does not exist
--       ERROR: 18 rows expected to be named, 1 are
--   * `property_def_format` assigned unconditionally instead of only where unknown
--       ERROR: a format somebody chose was overwritten ("Fencing In Contract?" is date,
--       "Selections Consultant" is date)
--   * the seven multi-word group statements removed, leaving split_part's first word
--       ERROR: 8 rows carry a group word truncated at the first space
--   * Amber's label written through verbatim instead of de-stuttered
--       ERROR: a name repeats its group word (Selections Selections Consultant)
-- A plain temporary table, NOT `on commit drop`: psql autocommits each statement, so an
-- on-commit-drop table is gone before the next line can insert into it. Dropped
-- explicitly at the end instead, which behaves the same whether this runs statement by
-- statement here or inside one transaction through the Supabase connector.
create temporary table sheet_keys(key text primary key);
insert into sheet_keys values
  ('retaining_fencing_bob_bob_sent'),('retaining_fencing_bob_bob_signed_contact_details_30_days'),
  ('retaining_fencing_bob_fencing_in_contract'),('retaining_fencing_bob_fencing_notices_issued_to_client'),
  ('retaining_fencing_bob_fencing_sent_via_registered_mail'),('retaining_fencing_bob_registered_mail_collected'),
  ('retaining_fencing_bob_retaining_in_contract'),('retaining_fencing_bob_retaining_required_before_or_during_build'),
  ('sa_water_confirmation_of_sa_water_meters_sewer_connection_on_site'),
  ('sa_water_cross_check_sa_water_locations_against_working_drawings'),('sa_water_invoice_received'),
  ('section_221_stormwater_crossover_permits_ordered'),('selections_consultant'),
  ('selections_email_request_to_selections_to_contact_client'),('site_survey_ordered'),('site_survey_received'),
  ('soil_bore_logs_ordered'),('working_drawings_plan_check_complete');

do $$
declare
  named        integer;
  still_short  integer;
  checkbox     text;
  consultant   text;
  bad_group    integer;
begin
  select count(*) into named from property_defs
   where property_def_key in (select key from sheet_keys)
     and property_def_owning_team is not null
     and property_def_automation is not null;
  if named <> 18 then
    raise exception '18 rows expected to be named, % are', named;
  end if;
  raise notice 'ok  all eighteen carry a full name, a team and their group';

  -- The screen test, and the reason for the whole migration: none of the EIGHTEEN may
  -- still share its label with another property. Three rows read "Ordered" before this.
  --
  -- Scoped to the eighteen, and not to the whole table, because the whole table is not
  -- what this migration fixes. `working_drawings_ordered` is also called "Ordered" and is
  -- not on Amber's first sheet, so it stays that way and this check must not claim
  -- otherwise. The first draft asserted over the whole table, failed on exactly that row
  -- and on "Received (14 Days)", "Issued", "Received (7 Days)" and "Contract Issued" —
  -- which is the check doing its job: it caught the migration's own description
  -- overreaching, before the description reached anybody.
  select count(*) into still_short from property_defs d
   where d.property_def_key in (select key from sheet_keys)
     and exists (select 1 from property_defs o
                  where o.property_def_key <> d.property_def_key
                    and btrim(o.property_def_label) = btrim(d.property_def_label));
  if still_short > 0 then
    raise exception '% of the eighteen still share a label with another property', still_short;
  end if;
  raise notice 'ok  none of the eighteen shares its name with another property';

  select property_def_format into checkbox from property_defs where property_def_key = 'retaining_fencing_bob_fencing_in_contract';
  select property_def_format into consultant from property_defs where property_def_key = 'selections_consultant';
  if checkbox <> 'checkbox' or consultant <> 'text' then
    raise exception 'a format somebody chose was overwritten ("Fencing In Contract?" is %, "Selections Consultant" is %)', checkbox, consultant;
  end if;
  raise notice 'ok  the checkbox and the text field somebody chose are untouched';

  select count(*) into bad_group from property_defs
   where property_def_automation in ('Retaining', 'SA', 'Section', 'Soil', 'Site', 'Working');
  if bad_group > 0 then
    raise exception '% rows carry a group word truncated at the first space', bad_group;
  end if;
  raise notice 'ok  the multi-word group names survived whole';

  -- No name may repeat its own group word. Watched failing with Amber's label written
  -- through verbatim, which reported: a name repeats its group word ("Selections
  -- Selections Consultant").
  select btrim(property_def_label) into consultant from property_defs where property_def_key = 'selections_consultant';
  if consultant like 'Selections Selections%' then
    raise exception 'a name repeats its group word (%)', consultant;
  end if;
  raise notice 'ok  no name stutters its group';
  raise notice 'ok  0092: the eighteen properties Amber sent carry her names, teams and formats';
end $$;

drop table sheet_keys;
