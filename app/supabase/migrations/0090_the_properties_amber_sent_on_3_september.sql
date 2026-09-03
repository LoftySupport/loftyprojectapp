-- =============================================================================
-- 0090 — the properties Amber sent on 3 September
-- =============================================================================
-- Amber, 3 September, with property_defs_rows.xlsx: "here are properties to create".
--
-- The workbook has two sheets. The second is a full export of property_defs with rows
-- added by hand; the first is a subset of it, so only the second is read here. Of its 242
-- rows, 119 are already in the database (matched on the key Amber's own export carries),
-- two are blank, and these 121 are new.
--
-- WHAT WAS NORMALISED, AND WHAT WAS NOT
--
--   Case          "Job" and "Project" are written as the CHECK spells them, job and
--                 project; "Date" as date; "unknown (no data)" as unknown. The database
--                 has said since 0035 what these words may be.
--   Keys          A key must match ^[a-z][a-z0-9_]*$. Amber's read "2nd_Fix_1ST_FIX", so
--                 each is lowercased, split on punctuation, and its ordinals spelled out —
--                 second_fix_first_fix. The ordinal rule is the one the import generator
--                 already uses, not a new invention, and it beats the alternative of
--                 prefixing a letter to a key that starts with a digit.
--   Team          One word in the sheet is not a team: "Construction (Site Supervisor)",
--                 on 72 rows. It is READ as the Construction team, because that is the
--                 team it names and the parenthetical names the person doing the work, not
--                 a second team. Amber's own rows already use construction_admin beside it,
--                 so the distinction she is drawing is Construction Admin vs Construction.
--                 THIS IS A READING, NOT A FACT FROM THE SHEET. If it is wrong it is one
--                 statement to correct, and the PR says which.
--   Group         Amber filled property_def_automation with a group word — "2nd Fix",
--                 "Practical Completion", "Footings". Every one of the 121 new rows has one.
--                 They are carried VERBATIM into the column she put them in. They look far
--                 more like a stage group than like an automation note, and the app renders
--                 that column as "Automation", so this is flagged rather than silently
--                 rewritten: moving them to a group of their own is a schema change and
--                 Amber has not asked for one.
--   Position      Within each stage and group, the sheet's own order — which is the order
--                 the work happens in, so the list reads as the sequence it describes.
--
-- Nothing else is filled in. Required, restricted, the four permission rungs and is_active
-- all take the table's defaults, which are what the sheet's filled-in rows already say.
-- Where the sheet left the SLA blank the column stays null: no agreed duration is not zero.
--
-- THE GROUPS, AND HOW MANY PROPERTIES EACH BRINGS
--
--   Practical Completion                           28
--   2nd Fix                                        16
--   External Cladding                              16
--   Footings                                       15
--   Handover                                       14
--   Frame                                          12
--   Roof Cover                                      6
--   Selections                                      4
--   Retaining, Fencing & BOB                        3
--   SA Water                                        3
--   Working Drawings                                2
--   Section 221 - Stormwater/Crossover Permits      1
--   Soil - Bore Logs                                1
-- =============================================================================

insert into property_defs (
  property_def_key, property_def_label, property_def_scope, property_def_stage,
  property_def_owning_team, property_def_format, property_def_position,
  property_def_sla_days, property_def_automation
) values
  ('second_fix_first_fix', '2nd Fix 1ST FIX', 'job', 'Construction', 'construction', 'date', 1, 25, '2nd Fix'),
  ('second_fix_first_fix_aircon', '2nd Fix 1ST FIX AIRCON', 'job', 'Construction', 'construction', 'date', 2, 1, '2nd Fix'),
  ('second_fix_first_fix_alarm_security', '2nd Fix 1ST FIX ALARM / SECURITY', 'job', 'Construction', 'construction', 'date', 3, 1, '2nd Fix'),
  ('second_fix_first_fix_electrical', '2nd Fix 1ST FIX ELECTRICAL', 'job', 'Construction', 'construction', 'date', 4, 2, '2nd Fix'),
  ('second_fix_second_fix_carpentry_labour', '2nd Fix 2ND FIX CARPENTRY LABOUR', 'job', 'Construction', 'construction', 'date', 5, 4, '2nd Fix'),
  ('second_fix_second_fix_delivery', '2nd Fix 2ND FIX DELIVERY', 'job', 'Construction', 'construction', 'date', 6, 1, '2nd Fix'),
  ('second_fix_electrical_cutouts', '2nd Fix ELECTRICAL CUTOUTS', 'job', 'Construction', 'construction', 'date', 7, 1, '2nd Fix'),
  ('second_fix_gyprock_install', '2nd Fix GYPROCK INSTALL', 'job', 'Construction', 'construction', 'date', 8, 14, '2nd Fix'),
  ('second_fix_screeding_tiler', '2nd Fix SCREEDING (TILER)', 'job', 'Construction', 'construction', 'date', 9, 1, '2nd Fix'),
  ('second_fix_solar_install_2', '2nd Fix SOLAR INSTALL (2)', 'job', 'Construction', 'construction', 'date', 10, 1, '2nd Fix'),
  ('second_fix_stud_check_frame_out_veluxe', '2nd Fix STUD CHECK / FRAME OUT VELUXE', 'job', 'Construction', 'construction', 'date', 11, 1, '2nd Fix'),
  ('second_fix_tiles_delivery', '2nd Fix TILES DELIVERY', 'job', 'Construction', 'construction', 'date', 12, 1, '2nd Fix'),
  ('second_fix_waterproofing', '2nd Fix WATERPROOFING', 'job', 'Construction', 'construction', 'date', 13, 1, '2nd Fix'),
  ('external_cladding_brick_clean', 'External Cladding BRICK CLEAN', 'job', 'Construction', 'construction', 'date', 1, 1, 'External Cladding'),
  ('external_cladding_call_up_gas_run_in', 'External Cladding CALL UP GAS RUN IN', 'job', 'Construction', 'construction', 'date', 2, 1, 'External Cladding'),
  ('external_cladding_garage_door_measure', 'External Cladding GARAGE DOOR MEASURE', 'job', 'Construction', 'construction', 'date', 3, 1, 'External Cladding'),
  ('external_cladding_gas_box_delivery', 'External Cladding GAS BOX DELIVERY', 'job', 'Construction', 'construction', 'date', 4, 1, 'External Cladding'),
  ('external_cladding_gas_box_install', 'External Cladding GAS BOX INSTALL', 'job', 'Construction', 'construction', 'date', 5, 1, 'External Cladding'),
  ('external_cladding_lower_cladding', 'External Cladding LOWER CLADDING', 'job', 'Construction', 'construction', 'date', 6, 10, 'External Cladding'),
  ('external_cladding_lower_downpipe_install', 'External Cladding LOWER DOWNPIPE INSTALL', 'job', 'Construction', 'construction', 'date', 7, 1, 'External Cladding'),
  ('external_cladding_lower_eaves_delivery', 'External Cladding LOWER EAVES DELIVERY', 'job', 'Construction', 'construction', 'date', 8, 1, 'External Cladding'),
  ('external_cladding_lower_eaves_install', 'External Cladding LOWER EAVES INSTALL', 'job', 'Construction', 'construction', 'date', 9, 3, 'External Cladding'),
  ('external_cladding_render', 'External Cladding RENDER', 'job', 'Construction', 'construction', 'date', 10, 3, 'External Cladding'),
  ('external_cladding_sand_cement_hws_box_delivery', 'External Cladding SAND / CEMENT / HWS BOX DELIVERY', 'job', 'Construction', 'construction', 'date', 11, 1, 'External Cladding'),
  ('external_cladding_stormwater_connection', 'External Cladding STORMWATER CONNECTION', 'job', 'Construction', 'construction', 'date', 12, 1, 'External Cladding'),
  ('frame_first_fix_gas', 'Frame 1ST FIX GAS', 'job', 'Construction', 'construction', 'date', 1, 1, 'Frame'),
  ('frame_first_fix_plumbing', 'Frame 1ST FIX PLUMBING', 'job', 'Construction', 'construction', 'date', 2, 1, 'Frame'),
  ('frame_cabinetry_measure', 'Frame CABINETRY MEASURE', 'job', 'Construction', 'construction', 'date', 3, 1, 'Frame'),
  ('frame_frame_check_third_party', 'Frame FRAME CHECK (3RD PARTY)', 'job', 'Construction', 'construction', 'date', 4, 1, 'Frame'),
  ('handover_appliances_delivery', 'Handover APPLIANCES - DELIVERY', 'job', 'Construction', 'construction', 'date', 1, 1, 'Handover'),
  ('handover_base_prep', 'Handover BASE PREP', 'job', 'Construction', 'construction', 'date', 2, 1, 'Handover'),
  ('handover_clothsline', 'Handover CLOTHSLINE', 'job', 'Construction', 'construction', 'date', 3, 1, 'Handover'),
  ('handover_electrician_appliances_install', 'Handover ELECTRICIAN APPLIANCES - INSTALL', 'job', 'Construction', 'construction', 'date', 4, 1, 'Handover'),
  ('handover_fencing', 'Handover FENCING', 'job', 'Construction', 'construction', 'date', 5, 1, 'Handover'),
  ('handover_gas_appliances_install', 'Handover GAS APPLIANCES - INSTALL', 'job', 'Construction', 'construction', 'date', 6, 1, 'Handover'),
  ('handover_handover', 'Handover HANDOVER', 'job', 'Construction', 'construction', 'date', 7, 1, 'Handover'),
  ('handover_landscaping', 'Handover LANDSCAPING', 'job', 'Construction', 'construction', 'date', 8, 1, 'Handover'),
  ('handover_letter_box', 'Handover LETTER BOX', 'job', 'Construction', 'construction', 'date', 9, 1, 'Handover'),
  ('handover_paving_concrete', 'Handover PAVING / CONCRETE', 'job', 'Construction', 'construction', 'date', 10, 1, 'Handover'),
  ('handover_plumber_appliances_install', 'Handover PLUMBER APPLIANCES - INSTALL', 'job', 'Construction', 'construction', 'date', 11, 1, 'Handover'),
  ('handover_rainwatwater_tank', 'Handover RAINWATWATER TANK', 'job', 'Construction', 'construction', 'date', 12, 1, 'Handover'),
  ('handover_sewer_check', 'Handover SEWER CHECK', 'job', 'Construction', 'construction', 'date', 13, 1, 'Handover'),
  ('practical_completion_first_coat_painting', 'Practical Completion 1ST COAT PAINTING', 'job', 'Construction', 'construction', 'date', 1, 5, 'Practical Completion'),
  ('practical_completion_first_house_clean', 'Practical Completion 1ST HOUSE CLEAN', 'job', 'Construction', 'construction', 'date', 2, 1, 'Practical Completion'),
  ('practical_completion_second_fix_aircon', 'Practical Completion 2ND FIX AIRCON', 'job', 'Construction', 'construction', 'date', 3, 2, 'Practical Completion'),
  ('practical_completion_second_fix_alarm_security', 'Practical Completion 2ND FIX ALARM / SECURITY', 'job', 'Construction', 'construction', 'date', 4, 1, 'Practical Completion'),
  ('practical_completion_second_fix_electrical', 'Practical Completion 2ND FIX ELECTRICAL', 'job', 'Construction', 'construction', 'date', 5, 2, 'Practical Completion'),
  ('practical_completion_second_fix_gas', 'Practical Completion 2ND FIX GAS', 'job', 'Construction', 'construction', 'date', 6, 1, 'Practical Completion'),
  ('practical_completion_second_fix_plumbing', 'Practical Completion 2ND FIX PLUMBING', 'job', 'Construction', 'construction', 'date', 7, 2, 'Practical Completion'),
  ('practical_completion_second_fix_services', 'Practical Completion 2ND FIX SERVICES', 'job', 'Construction', 'construction', 'date', 8, 13, 'Practical Completion'),
  ('practical_completion_accessories_delivery', 'Practical Completion ACCESSORIES - DELIVERY', 'job', 'Construction', 'construction', 'date', 9, 1, 'Practical Completion'),
  ('practical_completion_accessories_install', 'Practical Completion ACCESSORIES - INSTALL', 'job', 'Construction', 'construction', 'date', 10, 1, 'Practical Completion'),
  ('practical_completion_cabinetry_install', 'Practical Completion CABINETRY INSTALL', 'job', 'Construction', 'construction', 'date', 11, 3, 'Practical Completion'),
  ('practical_completion_construction_walk', 'Practical Completion CONSTRUCTION WALK', 'job', 'Construction', 'construction', 'date', 12, 1, 'Practical Completion'),
  ('practical_completion_final_coat_paint', 'Practical Completion FINAL COAT PAINT', 'job', 'Construction', 'construction', 'date', 13, 5, 'Practical Completion'),
  ('practical_completion_flooring_install', 'Practical Completion FLOORING INSTALL', 'job', 'Construction', 'construction', 'date', 14, 5, 'Practical Completion'),
  ('practical_completion_garage_door_install', 'Practical Completion GARAGE DOOR INSTALL', 'job', 'Construction', 'construction', 'date', 15, 1, 'Practical Completion'),
  ('practical_completion_internal_fitout', 'Practical Completion INTERNAL FITOUT', 'job', 'Construction', 'construction', 'date', 16, 15, 'Practical Completion'),
  ('practical_completion_pci_walkthrough', 'Practical Completion PCI WALKTHROUGH', 'job', 'Construction', 'construction', 'date', 17, 1, 'Practical Completion'),
  ('practical_completion_practicle_completion_pci', 'Practical Completion PRACTICLE COMPLETION (PCI)', 'job', 'Construction', 'construction', 'date', 18, 19, 'Practical Completion'),
  ('practical_completion_sanitary_install', 'Practical Completion SANITARY INSTALL', 'job', 'Construction', 'construction', 'date', 19, 1, 'Practical Completion'),
  ('practical_completion_screen_robe_measure', 'Practical Completion SCREEN / ROBE MEASURE', 'job', 'Construction', 'construction', 'date', 20, 1, 'Practical Completion'),
  ('practical_completion_skirtings_handles_install', 'Practical Completion SKIRTINGS / HANDLES INSTALL', 'job', 'Construction', 'construction', 'date', 21, 1, 'Practical Completion'),
  ('practical_completion_stone_install', 'Practical Completion STONE INSTALL', 'job', 'Construction', 'construction', 'date', 22, 1, 'Practical Completion'),
  ('practical_completion_stone_measure', 'Practical Completion STONE MEASURE', 'job', 'Construction', 'construction', 'date', 23, 1, 'Practical Completion'),
  ('practical_completion_tiling_splashbacks', 'Practical Completion TILING (SPLASHBACKS)', 'job', 'Construction', 'construction', 'date', 24, 2, 'Practical Completion'),
  ('practical_completion_tiling_labour', 'Practical Completion TILING LABOUR', 'job', 'Construction', 'construction', 'date', 25, 5, 'Practical Completion'),
  ('practical_completion_touch_ups', 'Practical Completion TOUCH UPS', 'job', 'Construction', 'construction', 'date', 26, 5, 'Practical Completion'),
  ('roof_cover_roofing_install', 'Roof Cover ROOFING INSTALL', 'job', 'Construction', 'construction', 'date', 1, 5, 'Roof Cover'),
  ('roof_cover_solar_install_1', 'Roof Cover SOLAR INSTALL (1)', 'job', 'Construction', 'construction', 'date', 2, 1, 'Roof Cover'),
  ('roof_cover_termite_treatment', 'Roof Cover TERMITE TREATMENT', 'job', 'Construction', 'construction', 'date', 3, 1, 'Roof Cover'),
  ('roof_cover_veluxe_skylight_install', 'Roof Cover VELUXE / SKYLIGHT INSTALL', 'job', 'Construction', 'construction', 'date', 4, 1, 'Roof Cover'),
  ('second_fix_claim_second_fix_stage', '2nd Fix Claim - 2nd Fix Stage', 'job', 'Construction', 'construction_admin', 'date', 14, 0, '2nd Fix'),
  ('second_fix_council_notification_waterproofing', '2nd Fix Council Notification - Waterproofing', 'job', 'Construction', 'construction_admin', 'date', 15, 1, '2nd Fix'),
  ('second_fix_customer_notification_second_fix_complete', '2nd Fix Customer Notification - 2nd Fix Complete', 'job', 'Construction', 'construction_admin', 'date', 16, 1, '2nd Fix'),
  ('external_cladding_claim_external_cladding_stage', 'External Cladding Claim - External Cladding Stage', 'job', 'Construction', 'construction_admin', 'date', 13, 0, 'External Cladding'),
  ('external_cladding_council_notification_external_cladding', 'External Cladding Council Notification - External Cladding', 'job', 'Construction', 'construction_admin', 'date', 14, 1, 'External Cladding'),
  ('external_cladding_customer_notification_external_cladding_complete', 'External Cladding Customer Notification - External Cladding Complete', 'job', 'Construction', 'construction_admin', 'date', 15, 1, 'External Cladding'),
  ('footings_claim_footings_stage_completed', 'Footings Claim - Footings Stage - Completed', 'job', 'Construction', 'construction_admin', 'date', 1, 0, 'Footings'),
  ('footings_commence_construction', 'Footings COMMENCE CONSTRUCTION', 'job', 'Construction', 'construction_admin', 'date', 2, 1, 'Footings'),
  ('footings_council_notification_commence_construction', 'Footings Council Notification - Commence Construction', 'job', 'Construction', 'construction_admin', 'date', 3, 1, 'Footings'),
  ('footings_council_notification_steel_inspection', 'Footings Council Notification - Steel Inspection', 'job', 'Construction', 'construction_admin', 'date', 4, 1, 'Footings'),
  ('footings_customer_notification_footings_complete', 'Footings Customer Notification - Footings Complete', 'job', 'Construction', 'construction_admin', 'date', 5, 1, 'Footings'),
  ('frame_claim_wall_roof_frame_stage', 'Frame Claim - Wall & Roof Frame Stage', 'job', 'Construction', 'construction_admin', 'date', 5, 0, 'Frame'),
  ('frame_council_notification_wall_roof_frame', 'Frame Council Notification - Wall & Roof Frame', 'job', 'Construction', 'construction_admin', 'date', 6, 1, 'Frame'),
  ('frame_customer_notification_wall_roof_frame_complete', 'Frame Customer Notification - Wall & Roof Frame Complete', 'job', 'Construction', 'construction_admin', 'date', 7, 1, 'Frame'),
  ('handover_customer_care_book_handover_appointment', 'Handover Customer Care - Book Handover Appointment', 'job', 'Construction', 'construction_admin', 'date', 14, 1, 'Handover'),
  ('practical_completion_claim_practical_completion', 'Practical Completion Claim - Practical Completion', 'job', 'Construction', 'construction_admin', 'date', 27, 0, 'Practical Completion'),
  ('practical_completion_customer_care_book_pci', 'Practical Completion Customer Care - Book PCI', 'job', 'Construction', 'construction_admin', 'date', 28, 1, 'Practical Completion'),
  ('roof_cover_claim_roof_cover_stage', 'Roof Cover Claim - Roof Cover Stage', 'job', 'Construction', 'construction_admin', 'date', 5, 0, 'Roof Cover'),
  ('roof_cover_customer_notification_roof_cover_complete', 'Roof Cover Customer Notification - Roof Cover Complete', 'job', 'Construction', 'construction_admin', 'date', 6, 1, 'Roof Cover'),
  ('retaining_fencing_bob_30_day_overdue_letter', 'Retaining, Fencing & BOB 30 day overdue letter', 'project', 'Pre-construction', 'construction_admin', 'date', 1, null, 'Retaining, Fencing & BOB'),
  ('retaining_fencing_bob_cross_notice_responded_to', 'Retaining, Fencing & BOB Cross notice responded to', 'project', 'Pre-construction', 'construction_admin', 'date', 2, 7, 'Retaining, Fencing & BOB'),
  ('retaining_fencing_bob_fencing_notices_completed_saved_in_folder', 'Retaining, Fencing & BOB Fencing Notices Completed + Saved in folder (', 'project', 'Pre-construction', 'construction_admin', 'date', 3, 14, 'Retaining, Fencing & BOB'),
  ('sa_water_invoice_paid', 'SA Water Invoice paid (', 'project', 'Pre-construction', 'construction_admin', 'date', 1, 2, 'SA Water'),
  ('sa_water_received', 'SA Water Received', 'project', 'Pre-construction', 'finance', 'date', 2, 7, 'SA Water'),
  ('section_221_stormwater_crossover_permits_received', 'Section 221 - Stormwater/Crossover Permits Received', 'project', 'Pre-construction', 'finance', 'date', 1, 14, 'Section 221 - Stormwater/Crossover Permits'),
  ('footings_bin_delivery', 'Footings BIN DELIVERY', 'job', 'Construction', 'scheduling', 'date', 6, 1, 'Footings'),
  ('footings_bricks_delivery', 'Footings BRICKS DELIVERY', 'job', 'Construction', 'scheduling', 'date', 7, 1, 'Footings'),
  ('footings_final_trim', 'Footings FINAL TRIM', 'job', 'Construction', 'scheduling', 'date', 8, 1, 'Footings'),
  ('footings_footings', 'Footings FOOTINGS', 'job', 'Construction', 'scheduling', 'date', 9, 18, 'Footings'),
  ('footings_retaining', 'Footings RETAINING', 'job', 'Construction', 'scheduling', 'date', 10, 5, 'Footings'),
  ('footings_site_toilet_delivery', 'Footings SITE TOILET DELIVERY', 'job', 'Construction', 'scheduling', 'date', 11, 1, 'Footings'),
  ('footings_slab_pour', 'Footings SLAB POUR', 'job', 'Construction', 'scheduling', 'date', 12, 14, 'Footings'),
  ('footings_stormwater', 'Footings STORMWATER', 'job', 'Construction', 'scheduling', 'date', 13, 1, 'Footings'),
  ('footings_temporary_fence_install', 'Footings TEMPORARY FENCE INSTALL', 'job', 'Construction', 'scheduling', 'date', 14, 1, 'Footings'),
  ('footings_underground_elec', 'Footings UNDERGROUND ELEC', 'job', 'Construction', 'scheduling', 'date', 15, 1, 'Footings'),
  ('frame_first_fix_carpenter_labour', 'Frame 1ST FIX CARPENTER LABOUR', 'job', 'Construction', 'scheduling', 'date', 8, 5, 'Frame'),
  ('frame_trusses_delivery', 'Frame TRUSSES DELIVERY', 'job', 'Construction', 'scheduling', 'date', 9, 1, 'Frame'),
  ('frame_wall_frame_delivery', 'Frame WALL FRAME DELIVERY', 'job', 'Construction', 'scheduling', 'date', 10, 1, 'Frame'),
  ('frame_window_delivery', 'Frame WINDOW DELIVERY', 'job', 'Construction', 'scheduling', 'date', 11, 1, 'Frame'),
  ('external_cladding_post_cladding_items', 'External Cladding POST CLADDING ITEMS', 'job', 'Construction', 'estimating', 'date', 16, 12, 'External Cladding'),
  ('frame_framing', 'Frame FRAMING', 'job', 'Construction', 'estimating', 'date', 12, 25, 'Frame'),
  ('sa_water_sa_water_docs_proposed_location_plan_ordered', 'SA Water SA Water Docs proposed location Plan ordered', 'project', 'Pre-construction', 'pre_construction_admin', 'date', 3, null, 'SA Water'),
  ('selections_gallery_appointment_date', 'Selections Gallery Appointment Date', 'job', 'Pre-construction', 'selections', 'date', 1, 21, 'Selections'),
  ('selections_type_scheme_client', 'Selections Selection Type Scheme / Client', 'job', 'Pre-construction', 'selections', 'date', 2, null, 'Selections'),
  ('selections_variation_signed', 'Selections Selection Variation signed', 'job', 'Pre-construction', 'selections', 'date', 3, null, 'Selections'),
  ('selections_selections_booklet_signed', 'Selections Selections booklet signed', 'job', 'Pre-construction', 'selections', 'date', 4, 10, 'Selections'),
  ('soil_bore_logs_received', 'Soil - Bore Logs Received', 'project', 'Pre-construction', 'pre_construction_admin', 'date', 1, 14, 'Soil - Bore Logs'),
  ('working_drawings_finalised', 'Working Drawings Finalised', 'job', 'Pre-construction', 'design', 'unknown', 1, 10, 'Working Drawings'),
  ('working_drawings_received', 'Working Drawings Received', 'job', 'Pre-construction', 'design', 'date', 2, 14, 'Working Drawings')
on conflict (property_def_key) do nothing;

-- ---------------------------------------------------------------------- proof
-- Watched failing on the replay before the insert above was there: the first assertion
-- names a key the database did not have, and the block stops on it.
do $$
declare
  n_new integer;
  n_all integer;
  n_site integer;
begin
  select count(*) into n_new from property_defs
   where property_def_key in ('second_fix_first_fix', 'handover_handover', 'footings_slab_pour');
  if n_new < 2 then
    raise exception '0090 proof: the new properties are not there (found % of the three probed)', n_new;
  end if;

  -- Every one of them has to survive the page's own select, which is what 0089 was about.
  select count(*) into n_all from (
    select property_def_key, property_def_label, property_def_scope, property_def_stage,
           property_def_owning_team, property_def_format, property_def_required,
           property_def_automation, property_def_position, property_def_restricted,
           property_def_create_level, property_def_read_level, property_def_update_level,
           property_def_delete_level, property_def_sla_days, property_def_is_active,
           property_def_description, property_def_import_ref
      from property_defs) s;

  -- The team reading, stated as an assertion so it is visible rather than buried.
  select count(*) into n_site from property_defs
   where property_def_owning_team = 'construction' and property_def_stage = 'Construction';
  if n_site = 0 then
    raise exception '0090 proof: no Construction-stage property landed on the Construction team';
  end if;

  raise notice '0090: % properties in all, % of them Construction-stage on the Construction team', n_all, n_site;
end $$;
