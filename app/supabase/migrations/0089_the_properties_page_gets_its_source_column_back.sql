-- =============================================================================
-- 0089 — the Properties page gets its source column back
-- =============================================================================
-- Amber, 3 September: "The properties are not showing anymore."
--
-- Setup → Properties rendered nothing at all. Not a filter, not an empty list — the
-- whole page, blank. The cause is not in the app: property_defs.property_def_import_ref
-- was gone from the live database.
--
-- 0077 added that column and 0079 filled it. No migration ever dropped it, so it went by
-- hand, most likely while the properties table was being tidied on 2 September. The app
-- names every column it wants in one select, so PostgREST answered the whole request with
-- 42703 (undefined column) rather than returning the other seventeen, listPropertyDefs
-- threw, and the page had nothing to draw. One missing column, 149 invisible properties.
--
-- Checked before writing this: every column the app selects, in every table, against the
-- live schema. property_def_import_ref was the only one missing. Nothing else had drifted.
--
-- WHAT THIS DOES
--
--   1. Puts the column back, exactly as 0077 declared it. Nullable text, no default.
--   2. Refills it from 0079's own values, matched by key — 174 pairs read back out of that
--      migration, not retyped from memory. A property added since is not in the seed and
--      keeps a null, which is the honest answer for one the workbook never had.
--
-- The values are provenance: "Properties!12" is the workbook row a field was read from, so
-- a question about a field can be taken back to its source. The page shows it as "Source"
-- only when it is set, so the rows that stay null show nothing rather than an empty label.
--
-- If the column was dropped on purpose, the way to remove it is a migration that drops it
-- AND takes it out of the app's select, its type and the dictionary together — not a hand
-- edit that leaves the app asking for something the database no longer has.
-- =============================================================================

alter table property_defs add column if not exists property_def_import_ref text;

comment on column property_defs.property_def_import_ref is
  'Where this came from — the workbook row ("Properties!12") — so a question about a field can be taken back to its source.';

-- ---------------------------------------------------------------- the values, from 0079
update property_defs d
   set property_def_import_ref = v.ref
  from (values
    ('project_creation_agreement_type', 'Properties!2'),
    ('project_creation_sales_consultant', 'Properties!3'),
    ('job_creation_site_supervisor', 'Properties!4'),
    ('job_creation_estimator', 'Properties!5'),
    ('job_creation_link', 'Properties!6'),
    ('job_creation_number_of_single_stories_dwellings', 'Properties!7'),
    ('job_creation_number_of_double_stories_dwellings', 'Properties!8'),
    ('project_creation_number_of_total_dwellings', 'Properties!9'),
    ('pwa_contract_issued', 'Properties!10'),
    ('pwa_contract_signed', 'Properties!11'),
    ('invoice_deposit_1_paid', 'Properties!12'),
    ('invoice_amount_paid', 'Properties!13'),
    ('sales_documents_incl_site_inspection_complete', 'Properties!14'),
    ('trello', 'Properties!15'),
    ('concept_plan_ordered', 'Properties!16'),
    ('concept_plan_received', 'Properties!17'),
    ('concept_plan_amendment_ordered', 'Properties!18'),
    ('concept_plan_amendment_received', 'Properties!19'),
    ('concept_plan_signed_off_7_days', 'Properties!20'),
    ('site_survey_ordered', 'Properties!21'),
    ('site_survey_received', 'Properties!22'),
    ('soil_bore_logs_ordered', 'Properties!23'),
    ('soil_bore_logs_received_14_days', 'Properties!24'),
    ('planning_drawings_ordered', 'Properties!25'),
    ('planning_drawings_received', 'Properties!26'),
    ('planning_drawings_amendment_ordered', 'Properties!27'),
    ('planning_drawings_amendment_received', 'Properties!28'),
    ('planning_drawings_signed_off_14_days', 'Properties!29'),
    ('preliminary_eer_ordered', 'Properties!30'),
    ('preliminary_eer_received_2_days', 'Properties!31'),
    ('preliminary_eer_confirm_eer_option_with_scheduling', 'Properties!32'),
    ('preliminary_eer_log_on_sales_estimating_trello', 'Properties!33'),
    ('preliminary_eer_received_back_from_estimating', 'Properties!35'),
    ('civil_plan_ordered', 'Properties!36'),
    ('civil_plan_received_10_days', 'Properties!37'),
    ('civil_plan_gavin_check_ordered', 'Properties!38'),
    ('civil_plan_gavin_check_returned_2_days', 'Properties!39'),
    ('civil_plan_amended_ordered', 'Properties!40'),
    ('civil_plan_amended_received_10_days', 'Properties!41'),
    ('preliminary_footings_ordered', 'Properties!42'),
    ('preliminary_footings_received_2_days', 'Properties!43'),
    ('planning_approval_lodged', 'Properties!44'),
    ('planning_approval_approved_28_days', 'Properties!45'),
    ('planning_approval_rfi_received', 'Properties!46'),
    ('planning_approval_rfi_responded_14_days', 'Properties!47'),
    ('final_quote_check_issued_to_estimator', 'Properties!48'),
    ('final_quote_check_sent_to_s_c', 'Properties!49'),
    ('final_quote_check_contract_sent_to_ryan', 'Properties!50'),
    ('final_quote_check_contract_approved_by_ryan', 'Properties!51'),
    ('contract_signing_issued', 'Properties!52'),
    ('contract_signing_received_7_days', 'Properties!53'),
    ('contract_signing_sale_contact_client_to_confirm_no_more_changes', 'Properties!54'),
    ('second_deposit_contract_deposit_issued', 'Properties!55'),
    ('second_deposit_contract_deposit_received_7_days', 'Properties!56'),
    ('contract_value', 'Properties!57'),
    ('stage_1_complete', 'Properties!58'),
    ('dnf_conditions_check_completed', 'Properties!59'),
    ('working_drawings_ordered', 'Properties!60'),
    ('working_drawings_received_14_days', 'Properties!61'),
    ('working_drawings_plan_check_complete', 'Properties!62'),
    ('working_drawings_logged_for_amends', 'Properties!63'),
    ('working_drawings_amends_received', 'Properties!64'),
    ('working_drawings_amended_plans_checked', 'Properties!65'),
    ('working_drawings_finalised_and_signed_10_days', 'Properties!66'),
    ('pegging_plan_encroachment_plan_ordered', 'Properties!67'),
    ('pegging_plan_encroachment_plan_received_7_days', 'Properties!68'),
    ('finalised_eer_ordered', 'Properties!69'),
    ('finalised_eer_received_7_days', 'Properties!70'),
    ('finalised_eer_sent_to_scheduling', 'Properties!71'),
    ('finalised_eer_received_back_from_scheduling_1_day', 'Properties!72'),
    ('stage_2_complete', 'Properties!73'),
    ('added_to_pre_construction_trello_move_to_stage_3_on_lmwf', 'Properties!74'),
    ('attached_lightweight_verandah_engineering_ordered', 'Properties!75'),
    ('attached_lightweight_verandah_engineering_received_14_days', 'Properties!76'),
    ('footings_construction_report_fcr_ordered', 'Properties!77'),
    ('footings_construction_report_fcr_received_14_days', 'Properties!78'),
    ('footings_construction_report_fcr_amendment_ordered', 'Properties!79'),
    ('footings_construction_report_fcr_amendment_received', 'Properties!80'),
    ('footings_construction_report_fcr_sent_to_gavin', 'Properties!81'),
    ('footings_construction_report_fcr_received_back_from_gavin_7_days', 'Properties!82'),
    ('electrical_nbn_undergrounds_plan_ordered', 'Properties!83'),
    ('electrical_nbn_undergrounds_plan_received_10_days', 'Properties!84'),
    ('electrical_nbn_undergrounds_permit_application_lodged_to_council', 'Properties!85'),
    ('electrical_nbn_undergrounds_permit_received', 'Properties!86'),
    ('electrical_nbn_undergrounds_nbn_layout_sent_to_cma_s', 'Properties!87'),
    ('section_221_stormwater_crossover_permits_ordered', 'Properties!88'),
    ('section_221_stormwater_crossover_permits_received_14_days', 'Properties!89'),
    ('framing_and_trusses_timber_frame_steel_frame', 'Properties!90'),
    ('framing_and_trusses_ordered', 'Properties!91'),
    ('framing_and_trusses_received_21_days', 'Properties!92'),
    ('framing_and_trusses_amendment_ordered', 'Properties!93'),
    ('framing_and_trusses_amendment_received', 'Properties!94'),
    ('beam_design_ordered', 'Properties!95'),
    ('beam_design_received_21_days', 'Properties!96'),
    ('beam_design_amendment_ordered', 'Properties!97'),
    ('beam_design_amendment_received', 'Properties!98'),
    ('construction_timber_beam_jordan_check_sent_to_management', 'Properties!99'),
    ('construction_timber_beam_jordan_check_approved_7_days', 'Properties!100'),
    ('selections_consultant', 'Properties!101'),
    ('selections_selection_type_scheme_client', 'Properties!102'),
    ('selections_email_request_to_selections_to_contact_client', 'Properties!103'),
    ('selections_gallery_appointment_date_21_days', 'Properties!104'),
    ('selections_selection_variation_signed', 'Properties!105'),
    ('selections_booklet_signed_10_days', 'Properties!106'),
    ('first_site_inspection_ordered', 'Properties!107'),
    ('first_site_inspection_back_14_days', 'Properties!108'),
    ('first_site_inspection_items_actioned_5_days', 'Properties!109'),
    ('retaining_fencing_bob_retaining_in_contract', 'Properties!110'),
    ('retaining_fencing_bob_retaining_required_before_or_during_build', 'Properties!111'),
    ('retaining_fencing_bob_fencing_in_contract', 'Properties!112'),
    ('retaining_fencing_bob_bob_sent', 'Properties!113'),
    ('retaining_fencing_bob_bob_signed_contact_details_30_days', 'Properties!114'),
    ('retaining_fencing_bob_fencing_notices_issued_to_client', 'Properties!115'),
    ('retaining_fencing_bob_fencing_sent_via_registered_mail', 'Properties!116'),
    ('retaining_fencing_bob_registered_mail_collected', 'Properties!117'),
    ('retaining_fencing_bob_p_30_day_overdue_letter', 'Properties!118'),
    ('retaining_fencing_bob_cross_notice_received_notes', 'Properties!119'),
    ('retaining_fencing_bob_cross_notice_responded_to_7_days', 'Properties!120'),
    ('retaining_fencing_bob_fencing_notices_completed_saved_in_folder_14_days', 'Properties!121'),
    ('sa_water_docs_proposed_location_plan_ordered', 'Properties!122'),
    ('sa_water_received_7_days', 'Properties!123'),
    ('sa_water_cross_check_sa_water_locations_against_working_drawings', 'Properties!124'),
    ('sa_water_invoice_received', 'Properties!125'),
    ('sa_water_invoice_paid_2_days', 'Properties!126'),
    ('sa_water_confirmation_of_sa_water_meters_sewer_connection_on_site', 'Properties!127'),
    ('construction_price_check_cpc_sheet_log_on_trello', 'Properties!128'),
    ('construction_price_check_cpc_sheet_received_14_days', 'Properties!129'),
    ('construction_price_check_cpc_sheet_sent_to_gary', 'Properties!130'),
    ('construction_price_check_cpc_sheet_gary_communicate_to_client_meeting_3_days', 'Properties!131'),
    ('construction_price_check_cpc_sheet_variation_issued', 'Properties!132'),
    ('construction_price_check_cpc_sheet_variation_signed_approved_14_days', 'Properties!133'),
    ('variation_check_contract_vegetation_site_scrape', 'Properties!134'),
    ('variation_required_yes_no', 'Properties!135'),
    ('variation_issued', 'Properties!136'),
    ('variation_received_5_days', 'Properties!137'),
    ('building_rules_consent_brc_lodged', 'Properties!138'),
    ('building_rules_consent_brc_approved_28_days', 'Properties!139'),
    ('building_rules_consent_brc_rfi_received', 'Properties!140'),
    ('building_rules_consent_brc_rfi_responded_14_days', 'Properties!141'),
    ('citb_paid_admin_cc', 'Properties!142'),
    ('development_approval_da_da_requested', 'Properties!143'),
    ('development_approval_da_da_approved_7_days', 'Properties!144'),
    ('final_site_inspection_ordered', 'Properties!145'),
    ('final_site_inspection_back_7_days', 'Properties!146'),
    ('final_site_inspection_actioned', 'Properties!147'),
    ('finance_updated_progress_payment_schedule_issued_for_vo_s_over_40k', 'Properties!148'),
    ('finance_total_of_variations_incl_cpc', 'Properties!149'),
    ('finance_revised_progress_claim_amount_total_build_amount_approved_by_accounts', 'Properties!150'),
    ('finance_loan_approval_requested', 'Properties!151'),
    ('finance_loan_approval_received_14_days', 'Properties!152'),
    ('finance_further_proof_of_finance', 'Properties!153'),
    ('finance_commencement_letter_requested', 'Properties!154'),
    ('finance_commencement_letter_received', 'Properties!155'),
    ('finance_settlement_on_land_titles', 'Properties!156'),
    ('how_insurance_discuss_amount_with_craig', 'Properties!157'),
    ('how_insurance_requested', 'Properties!158'),
    ('how_insurance_received', 'Properties!159'),
    ('how_insurance_invoiced_paid', 'Properties!160'),
    ('construction_release_request_released_to_construction_template_craig', 'Properties!161'),
    ('construction_release_pre_release_to_scheduling_and_po_s', 'Properties!162'),
    ('construction_release_released_to_construction_how_complete', 'Properties!163'),
    ('pwa_cancellation_letter_issued_also_update_col_b_to_cancelling', 'Properties!164'),
    ('pwa_cancellation_signed_returned', 'Properties!165'),
    ('pwa_cancellation_followed_up_unsigned', 'Properties!166'),
    ('pwa_cancellation_advised_departments_job_closed', 'Properties!167'),
    ('contract_cancellation_refund_y_n', 'Properties!168'),
    ('contract_cancellation_agreed_amount', 'Properties!169'),
    ('contract_cancellation_release_of_documents_y_n', 'Properties!170'),
    ('contract_cancellation_letter_issued', 'Properties!171'),
    ('contract_cancellation_followed_up_unsigned', 'Properties!172'),
    ('contract_cancellation_signed_returned', 'Properties!173'),
    ('contract_cancellation_payment_made', 'Properties!174'),
    ('contract_cancellation_documents_released', 'Properties!175'),
    ('contract_cancellation_advised_departments_job_closed', 'Properties!176')
  ) as v(key, ref)
 where d.property_def_key = v.key
   and d.property_def_import_ref is null;

-- ---------------------------------------------------------------------- proof
-- Watched failing with the column dropped from the replay: the select below is the app's
-- own column list, and without the column it raises 42703 exactly as the live page did.
do $$
declare
  n_rows integer;
  n_refs integer;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'property_defs'
       and column_name = 'property_def_import_ref'
  ) then
    raise exception '0089 proof: the column is still missing';
  end if;

  -- The app asks for these eighteen columns in one select. If any one of them is absent
  -- the page goes blank, so the proof asks for all of them the same way.
  execute $q$
    select count(*) from (
      select property_def_key, property_def_label, property_def_scope, property_def_stage,
             property_def_owning_team, property_def_format, property_def_required,
             property_def_automation, property_def_position, property_def_restricted,
             property_def_create_level, property_def_read_level, property_def_update_level,
             property_def_delete_level, property_def_sla_days, property_def_is_active,
             property_def_description, property_def_import_ref
        from property_defs
    ) s $q$ into n_rows;
  if n_rows = 0 then
    raise exception '0089 proof: the page''s own select returns no rows';
  end if;

  select count(*) into n_refs from property_defs where property_def_import_ref is not null;
  if n_refs = 0 then
    raise exception '0089 proof: every source ref is null - the backfill matched nothing';
  end if;

  raise notice '0089: % properties readable, % carrying a source ref', n_rows, n_refs;
end $$;
