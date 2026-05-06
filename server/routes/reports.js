'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth, getBrokerId } = require('../middleware/auth');
const { getDb } = require('../db/database');
const Anthropic = require('@anthropic-ai/sdk');
const { createObjectCsvWriter } = require('csv-writer');
const PDFDocument = require('pdfkit');

// All routes require authentication
router.use(requireAuth);

// ============================================================
// CONSTANTS
// ============================================================

const PREDEFINED_REPORTS = [
  {
    key: 'overdue_reviews',
    name: 'Clients with Overdue Reviews',
    description: 'Lists active contacts and accounts whose next review date has passed and no review has been completed.',
  },
  {
    key: 'gap_sections',
    name: 'Policy Sections with Identified Gaps',
    description: 'Shows all policy sections where a coverage gap has been identified, grouped by client and policy.',
  },
  {
    key: 'declined_recommendations',
    name: 'Sections Recommended but Declined',
    description: 'Lists policy sections that were recommended for cover but declined by the client.',
  },
  {
    key: 'delay_flag_claims',
    name: 'Claims with Delay Flags',
    description: 'All claims that have been flagged for handling delays, with broker and client details.',
  },
  {
    key: 'complaints_by_category',
    name: 'Complaints by Category and Root Cause',
    description: 'Aggregated complaint counts grouped by complaint category and root cause category.',
  },
  {
    key: 'conduct_concerns',
    name: 'High-Severity Conduct Concerns',
    description: 'Combined list of conduct concerns from contacts, policy sections, and client engagements.',
  },
  {
    key: 'renewal_due',
    name: 'Policies Due for Renewal',
    description: 'Active policies with a renewal date falling within the next 30 days.',
  },
  {
    key: 'open_engagements',
    name: 'Open Client Engagements by Stage and Broker',
    description: 'Count of open (non-terminal) client engagements grouped by pipeline stage and assigned broker.',
  },
  {
    key: 'active_clients_accounts',
    name: 'Active Clients & Accounts',
    description: 'All active contacts and accounts with category, broker, and date became client.',
  },
  {
    key: 'popia_compliance',
    name: 'POPIA Compliance Report',
    description: 'POPIA consent status across all contacts — flags missing consent, no consent date, or consent older than 12 months.',
  },
  {
    key: 'fica_compliance',
    name: 'FICA Compliance Report',
    description: 'FICA verification status across contacts and accounts — verified, pending, in review, or expired.',
  },
  {
    key: 'broker_fitness',
    name: 'Broker Fitness Report',
    description: 'Per-broker activity summary: active clients, policies, advice records, claims, complaints, conduct flags, and overdue reviews.',
  },
  {
    key: 'claims_report',
    name: 'Claims Report',
    description: 'All claims with status, type, value, and outcome. Filterable by claim date and broker.',
  },
  {
    key: 'complaints_report',
    name: 'Complaints Report',
    description: 'All complaints with category, status, resolution outcome, and root cause. Filterable by complaint date and broker.',
  },
  {
    key: 'advice_records_report',
    name: 'Record of Advice Report',
    description: 'All Records of Advice with type, advice date, client decision, and broker. Filterable by advice date and broker.',
  },
  {
    key: 'third_party_claims',
    name: 'Third Party Claim Report',
    description: 'Claims with one or more third parties recorded — third-party details and linked claim information.',
  },
  {
    key: 'client_engagements_report',
    name: 'Client Engagement Report',
    description: 'All client engagements with stage, type, decision, and broker. Filterable by creation date and broker.',
  },
  {
    key: 'policies_report',
    name: 'Policies Report',
    description: 'All policies with insurer, status, premium, type, and broker. Filterable by inception date and broker.',
  },
  {
    key: 'reviews_report',
    name: 'Reviews Report',
    description: 'All reviews with type, outcome, gaps identified, and broker. Filterable by review date and broker.',
  },
];

const PREDEFINED_NAMES = Object.fromEntries(PREDEFINED_REPORTS.map((r) => [r.key, r.name]));

// ============================================================
// SOURCE FIELDS ALLOWLIST (used for custom reports)
// ============================================================

// Computed (virtual) fields: table → field → SQL expression
const COMPUTED_FIELDS = {
  contacts: {
    full_name: `("contacts"."first_name" || ' ' || "contacts"."last_name")`,
  },
};

// Source field lists. Kept comprehensive — every real column on each
// reportable table is exposed (sensitive/encrypted columns excluded:
// users.password_hash, policies.account_number_enc).
//
// Removed in this revision (these columns DO NOT exist in the live
// schema and were producing crashes when selected):
//   advice_records.client_understood_advice  (use client_understanding_confirmed)
//   advice_records.client_decline_reason     (use client_rejection_reason)
//   advice_records.replacement_product_involved
//   advice_records.replacement_product_details
//   advice_records.financial_interest_disclosed
//   advice_records.financial_interest_details
//   advice_records.fais_disclosure_given
//   advice_records.popi_disclosure_given
//   advice_records.status
//   advice_records.advice_notes              (use notes)
const SOURCE_FIELDS = {
  contacts: [
    'id','full_name','first_name','last_name','title','gender','language',
    'marital_status','occupation','employer','income_band','nationality',
    'email','mobile','work_number','preferred_communication',
    'date_of_birth','sa_id_number','passport_number','alternative_id_type','next_of_kin',
    'contact_type','client_category','client_segment','existing_client',
    'date_became_client','contact_status','primary_client_record',
    'assigned_broker_id','assigned_admin_id','related_account_id',
    'source_of_lead',
    // Address: free-text + structured
    'physical_address','postal_address',
    'phys_street_address','phys_complex_building','phys_suburb','phys_city','phys_province','phys_postal_code','phys_country','phys_gps_lat','phys_gps_lng',
    'post_street_address','post_complex_building','post_suburb','post_city','post_province','post_postal_code','post_country',
    // Driver licence
    'dl_codes','dl_restrictions','dl_first_issue_date',
    // POPIA / data processing
    'data_processing_basis','consent_method','consent_scope','direct_marketing_consent',
    'data_source','data_categories_held','third_party_sharing','third_party_sharing_notes',
    'retention_period_years','retention_expiry_date','information_officer_id',
    'privacy_notice_provided','privacy_notice_date',
    'popia_consent_obtained','popia_consent_date',
    // FICA
    'fica_status','fica_verification_date','fica_verification_method','fica_document_reference',
    'fica_verified_by_id','fica_five_year_expiry','fica_re_verification_date',
    'fica_cipc_number','fica_beneficial_owner_confirmed','fica_pep_check','fica_pep_check_date',
    // Conduct + reviews
    'conduct_risk_flag','conduct_risk_notes',
    'last_activity_date','last_review_date','next_review_date',
    'notes','created_by','created_at','updated_at',
  ],
  accounts: [
    'id','account_name','registration_number','vat_number','industry','business_type',
    'number_of_employees','annual_turnover_band',
    'main_contact_id','assigned_broker_id','assigned_admin_id','client_status',
    // Address: free-text + structured
    'physical_address','postal_address',
    'phys_street_address','phys_complex_building','phys_suburb','phys_city','phys_province','phys_postal_code','phys_country','phys_gps_lat','phys_gps_lng',
    'post_street_address','post_complex_building','post_suburb','post_city','post_province','post_postal_code','post_country',
    // POPIA / data processing
    'data_processing_basis','popia_consent_obtained','popia_consent_date','consent_method','consent_scope',
    'direct_marketing_consent','data_source','data_categories_held','third_party_sharing',
    'third_party_sharing_notes','retention_period_years','retention_expiry_date',
    'information_officer_id','privacy_notice_provided','privacy_notice_date',
    // FICA
    'fica_status','fica_verification_date','fica_verification_method','fica_document_reference',
    'fica_verified_by_id','fica_five_year_expiry','fica_re_verification_date',
    'fica_cipc_number','fica_beneficial_owner_confirmed','fica_pep_check','fica_pep_check_date',
    'date_became_client','last_activity_date','last_review_date','next_review_date',
    'notes','created_by','created_at','updated_at',
  ],
  policies: [
    'id','policy_name','policy_number','contact_id','account_id','engagement_id','advice_record_id',
    'co_insured','co_insured_id_number','co_insured_contact_id','other_contact_ids',
    'insurer','product_id','product_category','policy_type','cover_description',
    'premium','currency',
    'inception_date','renewal_date','policy_status',
    // Banking / debit-order (account_number_enc excluded — encrypted)
    'payment_method','premium_frequency','debit_order_date',
    'bank_name','branch_code','account_type','account_holder_name',
    'mandate_status','mandate_auth_date','debit_order_reference',
    // Broker code snapshot
    'broker_code_id','broker_code_snapshot','broker_code_description_snapshot',
    'assigned_broker_id','assigned_admin_id',
    'disclosure_completed','last_review_date','next_review_date',
    'amendment_count','claims_count',
    'cancellation_date','cancellation_reason','replacement_policy_id',
    'notes','created_by','created_at','updated_at',
  ],
  // policy_sections reads from the assets table (section data lives there).
  policy_sections: [
    'id','asset_name','asset_type','asset_status','asset_section','item_number',
    'contact_id','account_id','policy_id','policy_section_id','product_id','currency',
    // Identifiers
    'registration_number','vin_number','engine_number','make','model','year',
    'serial_number','mm_number','fleet_number',
    // Address
    'address','complex_building','suburb','city','province','postal_code','country','gps_lat','gps_lng',
    // Financials
    'sum_insured','sum_insured_premium','asset_value','premium','sasria',
    'excess','excess_pct_claim','excess_pct_insured','minimum_excess',
    'date_acquired','date_sold',
    // Vehicle
    'use_type','vehicle_use','gvm','tracking_device','tracker_fitted','territory','cover_type','regular_driver','credit_shortfall',
    'parking_type','parking_other',
    // Buildings / structure
    'construction_type','roof_type','occupancy','flat_no_floors','perils_covered','subsidence_cover','geyser_cover','security_measures',
    // Contents / electronics
    'contents_category','unspecified_items','specified_items','theft_extension','power_surge_cover',
    // Stock
    'stock_category','declaration_basis','cold_storage','avg_stock_value','max_stock_value',
    'replacement_value','portable','maintenance_contract','breakdown_cover',
    // Marine
    'vessel_name','vessel_type','hull_length','motor_details','mooring','navigational_limits','skipper_qualification',
    // Animals
    'breed','gender','animal_count','identification_method','premises_address',
    // GIT
    'commodity','conveyance_type','route','max_single_load',
    // Liability
    'limit_of_indemnity','aggregate_limit','business_activity','turnover','employee_count','retroactive_date','trigger_basis','defence_costs',
    'basis_of_cover',
    // Cover detail (JSON arrays — exposed as raw JSON)
    'additional_covers','vehicle_extras','extras_in_total','excesses','related_contacts',
    'conditions','extensions','exclusions',
    // Financial interest
    'financial_interest_noted','financial_institution','finance_contract_number','contract_expiry_date',
    'notes','created_by','created_at','updated_at',
  ],
  assets: [
    'id','asset_name','asset_type','asset_status','asset_section','item_number',
    'contact_id','account_id','policy_id','policy_section_id','product_id','currency',
    // Identifiers
    'registration_number','vin_number','engine_number','make','model','year',
    'serial_number','mm_number','fleet_number',
    // Address
    'address','complex_building','suburb','city','province','postal_code','country','gps_lat','gps_lng',
    // Financials
    'sum_insured','sum_insured_premium','asset_value','premium','sasria',
    'excess','excess_pct_claim','excess_pct_insured','minimum_excess',
    'date_acquired','date_sold',
    // Vehicle
    'use_type','vehicle_use','gvm','tracking_device','tracker_fitted','territory','cover_type','regular_driver','credit_shortfall',
    'parking_type','parking_other',
    // Buildings / structure
    'construction_type','roof_type','occupancy','flat_no_floors','perils_covered','subsidence_cover','geyser_cover','security_measures',
    // Contents / electronics
    'contents_category','unspecified_items','specified_items','theft_extension','power_surge_cover',
    // Stock
    'stock_category','declaration_basis','cold_storage','avg_stock_value','max_stock_value',
    'replacement_value','portable','maintenance_contract','breakdown_cover',
    // Marine
    'vessel_name','vessel_type','hull_length','motor_details','mooring','navigational_limits','skipper_qualification',
    // Animals
    'breed','gender','animal_count','identification_method','premises_address',
    // GIT
    'commodity','conveyance_type','route','max_single_load',
    // Liability
    'limit_of_indemnity','aggregate_limit','business_activity','turnover','employee_count','retroactive_date','trigger_basis','defence_costs',
    'basis_of_cover',
    // Cover detail (JSON arrays — exposed as raw JSON)
    'additional_covers','vehicle_extras','extras_in_total','excesses','related_contacts',
    'conditions','extensions','exclusions',
    // Financial interest
    'financial_interest_noted','financial_institution','finance_contract_number','contract_expiry_date',
    'notes','created_by','created_at','updated_at',
  ],
  claims: [
    'id','claim_number','claim_reference_number','claim_category','claim_type',
    'contact_id','account_id','policy_id','policy_section_id','asset_id',
    'broker_id','claims_handler_admin_id','claims_handler_name',
    'claim_date','date_reported','insurer_assessment_date',
    'incident_description','estimated_value','currency','claim_status',
    'client_kept_informed','last_client_update_date',
    'delay_flag','fair_process_concern',
    'dispute_raised','dispute_details','broker_dispute_action',
    'settlement_amount','settlement_date',
    'rejection_reason','repudiation_reason','repudiation_reason_notes',
    'outcome_notes','outcome_vs_roa_expectation',
    'post_claim_satisfaction','complaint_arising','related_advice_record_id',
    // Excess at claim time
    'excess','excess_pct_claim','excess_pct_insured','minimum_excess',
    // Driver details (Motor / GIT)
    'driver_name','driver_id_number','driver_licence_number','driver_licence_code',
    'driver_cell','driver_relationship','driver_date_of_birth','driver_years_experience',
    // Cross-references (JSON)
    'claim_related_contacts',
    'notes','created_by','created_at','updated_at',
  ],
  client_engagements: [
    'id','engagement_name','contact_id','account_id','assigned_broker_id','assigned_admin_id',
    'stage','engagement_type','source_of_lead','currency',
    'current_insurer','current_premium','existing_cover_summary','identified_risks',
    'client_needs_summary','risk_priority',
    // Process gates
    'fact_find_completed','needs_analysis_completed','proposal_prepared',
    'advice_presented','disclosure_completed','policy_wording_provided',
    'key_risks_explained','excess_explained','premium_explained','limitations_explained',
    'client_questions_answered',
    // COFI disclosure
    'fsp_licence_disclosed','broker_identity_disclosed',
    'product_costs_disclosed','product_costs_disclosed_notes',
    'material_risks_disclosed','material_risks_disclosed_notes',
    'complaints_process_disclosed','disclosure_method','disclosure_timestamp','disclosing_broker_id',
    'client_decision','decline_reason','inception_date','expected_premium',
    'suitability_confirmed','client_understanding_confirmed',
    'alternative_options_considered',
    'conduct_concern_flag','conduct_notes',
    'notes','created_by','created_at','updated_at',
  ],
  risk_details: [
    'id','risk_detail_name','policy_section_id','asset_id','policy_id','contact_id','account_id',
    'risk_type','occupancy_use','security_details','construction_type',
    'roof_construction','wall_construction','stored_parked_overnight',
    'tracking_device_fitted','route_operating_area','distance_to_water','flood_exposure',
    'fire_exposure','goods_load_type','maximum_exposure_value',
    'risk_notes','last_updated','created_by','created_at','updated_at',
  ],
  complaints: [
    'id','complaint_number','contact_id','account_id','policy_id','claim_id',
    'broker_id','complaint_owner_id','assigned_handler_id','assigned_to_id',
    'complaint_date','received_via','complaint_category','complaint_sub_category',
    'severity_rating','complaint_summary','detailed_complaint','complaint_status',
    // SLA / acknowledgement
    'acknowledgment_date','acknowledgment_method','target_resolution_date','response_due_date',
    'supervisor_notified','supervisor_notified_at','handler_notified_at',
    'alert_day3_sent','alert_day3_sent_at','alert_day21_sent','alert_day21_sent_at',
    'alert_day30_sent','alert_day30_sent_at','escalated_to_critical_at',
    'senior_management_notified','senior_management_notified_at',
    // Resolution
    'resolution_date','resolution_summary','resolution_outcome','remedy_provided',
    'compensation_paid','client_acceptance','fair_outcome_achieved',
    // Root cause
    'root_cause_identified','root_cause_category','corrective_action_taken',
    'process_change_triggered','process_change_notes',
    'complaint_escalated_internally','external_ombud_escalation','fsca_reportable',
    'withdrawn','withdrawn_at','withdrawn_by_id','withdrawn_reason',
    'notes','created_by','created_at','updated_at',
  ],
  reviews: [
    'id','review_number','contact_id','account_id','policy_id','broker_id','assigned_admin_id',
    'review_type','review_date','review_outcome',
    'changes_in_risk_profile','changes_in_assets_exposure','gaps_identified',
    'recommendations','follow_up_actions','next_review_date','review_completed',
    'advice_record_required','linked_advice_record_id',
    'notes','created_by','created_at','updated_at',
  ],
  advice_records: [
    'id','advice_record_number','contact_id','account_id','engagement_id','policy_id','product_id',
    'broker_id','prepared_by_id','advice_date','advice_type','trigger_event','currency',
    // Risk + needs
    'client_risk_appetite','total_financial_exposure','client_needs_identified',
    'risk_analysis_summary','current_cover_considered','existing_cover_summary_auto',
    'shortfalls_identified','identified_gaps','identified_gaps_notes',
    'recommendation_given','recommendation_rationale',
    'alternative_options_considered','alternatives_considered_list',
    'reason_product_suitable','consequences_of_not_proceeding',
    'suitability_match_score','suitability_override_reason',
    // Disclosure
    'risks_explained','costs_explained','excess_explained',
    'waiting_period_limitations_explained','exclusions_explained',
    'client_understanding_confirmed','fair_outcome_considered',
    // Conflict of interest + commission disclosure
    'conflict_of_interest_flag','conflict_of_interest_description',
    'commission_disclosed','commission_rate_type','commission_rate_value',
    // Decision
    'client_decision','decision_date','decision_notes',
    'client_rejection_reason','client_rejection_notes',
    // Target market
    'target_market_status','target_market_mismatches',
    // Acknowledgement
    'roa_generated','roa_generation_date','final_document_issued','issue_date',
    'roa_completed','roa_completed_at',
    'client_acknowledgement_received','acknowledgement_date',
    'client_acknowledgment_method','acknowledgment_witness_name',
    // Supervision
    'supervisor_co_approval_required','supervisor_co_approved_by_id','supervisor_co_approved_at',
    're5_flag',
    'notes','created_by','created_at','updated_at',
  ],
};

// Valid join definitions per source table
// Format: { [joinAlias]: { table, on: 'source_table.fk = join_table.pk', fields: [...] } }
const _USER_FIELDS = ['id','full_name','email','role'];

const VALID_JOINS = {
  contacts: {
    accounts:          { table: 'accounts',          on: 'contacts.related_account_id = accounts.id',              fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'policies.contact_id = contacts.id',                      fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.contact_id = contacts.id',               fields: SOURCE_FIELDS.policy_sections },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = contacts.id',            fields: SOURCE_FIELDS.client_engagements },
    claims:            { table: 'claims',            on: 'claims.contact_id = contacts.id',                        fields: SOURCE_FIELDS.claims },
    reviews:           { table: 'reviews',           on: 'reviews.contact_id = contacts.id',                      fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = contacts.id',                    fields: SOURCE_FIELDS.complaints },
    advice_records:    { table: 'advice_records',    on: 'advice_records.contact_id = contacts.id',                fields: SOURCE_FIELDS.advice_records },
    assets:            { table: 'assets',            on: 'assets.contact_id = contacts.id',                        fields: SOURCE_FIELDS.assets },
    risk_details:      { table: 'risk_details',      on: 'risk_details.contact_id = contacts.id',                  fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'contacts.assigned_broker_id = broker.id',                fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'contacts.assigned_admin_id = admin.id',                  fields: _USER_FIELDS },
  },
  accounts: {
    contacts:          { table: 'contacts',          on: 'accounts.main_contact_id = contacts.id',                 fields: SOURCE_FIELDS.contacts },
    policies:          { table: 'policies',          on: 'policies.account_id = accounts.id',                     fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.account_id = accounts.id',               fields: SOURCE_FIELDS.policy_sections },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.account_id = accounts.id',           fields: SOURCE_FIELDS.client_engagements },
    claims:            { table: 'claims',            on: 'claims.account_id = accounts.id',                       fields: SOURCE_FIELDS.claims },
    reviews:           { table: 'reviews',           on: 'reviews.account_id = accounts.id',                     fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.account_id = accounts.id',                   fields: SOURCE_FIELDS.complaints },
    advice_records:    { table: 'advice_records',    on: 'advice_records.account_id = accounts.id',               fields: SOURCE_FIELDS.advice_records },
    assets:            { table: 'assets',            on: 'assets.account_id = accounts.id',                       fields: SOURCE_FIELDS.assets },
    risk_details:      { table: 'risk_details',      on: 'risk_details.account_id = accounts.id',                 fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'accounts.assigned_broker_id = broker.id',               fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'accounts.assigned_admin_id = admin.id',                 fields: _USER_FIELDS },
  },
  policies: {
    contacts:          { table: 'contacts',          on: 'policies.contact_id = contacts.id',                     fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'policies.account_id = accounts.id',                     fields: SOURCE_FIELDS.accounts },
    client_engagements:{ table: 'client_engagements',on: 'policies.engagement_id = client_engagements.id',        fields: SOURCE_FIELDS.client_engagements },
    policy_sections:   { table: 'assets',            on: 'policy_sections.policy_id = policies.id',               fields: SOURCE_FIELDS.policy_sections },
    claims:            { table: 'claims',            on: 'claims.policy_id = policies.id',                        fields: SOURCE_FIELDS.claims },
    reviews:           { table: 'reviews',           on: 'reviews.policy_id = policies.id',                      fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.policy_id = policies.id',                    fields: SOURCE_FIELDS.complaints },
    advice_records:    { table: 'advice_records',    on: 'advice_records.policy_id = policies.id',                fields: SOURCE_FIELDS.advice_records },
    assets:            { table: 'assets',            on: 'assets.policy_id = policies.id',                       fields: SOURCE_FIELDS.assets },
    risk_details:      { table: 'risk_details',      on: 'risk_details.policy_id = policies.id',                  fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'policies.assigned_broker_id = broker.id',               fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'policies.assigned_admin_id = admin.id',                 fields: _USER_FIELDS },
  },
  // policy_sections source also reads from assets table
  policy_sections: {
    policies:          { table: 'policies',          on: 'policy_sections.policy_id = policies.id',               fields: SOURCE_FIELDS.policies },
    contacts:          { table: 'contacts',          on: 'policy_sections.contact_id = contacts.id',              fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'policy_sections.account_id = accounts.id',             fields: SOURCE_FIELDS.accounts },
    assets:            { table: 'assets',            on: 'assets.policy_id = policy_sections.policy_id AND assets.id != policy_sections.id', fields: SOURCE_FIELDS.assets },
    claims:            { table: 'claims',            on: 'claims.asset_id = policy_sections.id',                  fields: SOURCE_FIELDS.claims },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = policy_sections.contact_id', fields: SOURCE_FIELDS.client_engagements },
    reviews:           { table: 'reviews',           on: 'reviews.contact_id = policy_sections.contact_id',       fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = policy_sections.contact_id',    fields: SOURCE_FIELDS.complaints },
    advice_records:    { table: 'advice_records',    on: 'advice_records.contact_id = policy_sections.contact_id',fields: SOURCE_FIELDS.advice_records },
    risk_details:      { table: 'risk_details',      on: 'risk_details.asset_id = policy_sections.id',            fields: SOURCE_FIELDS.risk_details },
  },
  assets: {
    contacts:          { table: 'contacts',          on: 'assets.contact_id = contacts.id',                       fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'assets.account_id = accounts.id',                      fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'assets.policy_id = policies.id',                       fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.policy_id = assets.policy_id AND policy_sections.id != assets.id', fields: SOURCE_FIELDS.policy_sections },
    claims:            { table: 'claims',            on: 'claims.asset_id = assets.id',                          fields: SOURCE_FIELDS.claims },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = assets.contact_id',    fields: SOURCE_FIELDS.client_engagements },
    reviews:           { table: 'reviews',           on: 'reviews.contact_id = assets.contact_id',               fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = assets.contact_id',            fields: SOURCE_FIELDS.complaints },
    advice_records:    { table: 'advice_records',    on: 'advice_records.contact_id = assets.contact_id',        fields: SOURCE_FIELDS.advice_records },
    risk_details:      { table: 'risk_details',      on: 'risk_details.asset_id = assets.id',                     fields: SOURCE_FIELDS.risk_details },
  },
  claims: {
    policies:          { table: 'policies',          on: 'claims.policy_id = policies.id',                        fields: SOURCE_FIELDS.policies },
    contacts:          { table: 'contacts',          on: 'claims.contact_id = contacts.id',                       fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'claims.account_id = accounts.id',                      fields: SOURCE_FIELDS.accounts },
    assets:            { table: 'assets',            on: 'claims.asset_id = assets.id',                           fields: SOURCE_FIELDS.assets },
    policy_sections:   { table: 'assets',            on: 'policy_sections.id = claims.asset_id',                  fields: SOURCE_FIELDS.policy_sections },
    complaints:        { table: 'complaints',        on: 'complaints.claim_id = claims.id',                       fields: SOURCE_FIELDS.complaints },
    reviews:           { table: 'reviews',           on: 'reviews.policy_id = claims.policy_id',                 fields: SOURCE_FIELDS.reviews },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = claims.contact_id',    fields: SOURCE_FIELDS.client_engagements },
    advice_records:    { table: 'advice_records',    on: 'advice_records.contact_id = claims.contact_id',        fields: SOURCE_FIELDS.advice_records },
    risk_details:      { table: 'risk_details',      on: 'risk_details.asset_id = claims.asset_id',               fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'claims.broker_id = broker.id',                          fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'claims.claims_handler_admin_id = admin.id',             fields: _USER_FIELDS },
  },
  client_engagements: {
    contacts:          { table: 'contacts',          on: 'client_engagements.contact_id = contacts.id',           fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'client_engagements.account_id = accounts.id',          fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'policies.engagement_id = client_engagements.id',        fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.contact_id = client_engagements.contact_id', fields: SOURCE_FIELDS.policy_sections },
    assets:            { table: 'assets',            on: 'assets.contact_id = client_engagements.contact_id',    fields: SOURCE_FIELDS.assets },
    advice_records:    { table: 'advice_records',    on: 'advice_records.engagement_id = client_engagements.id',  fields: SOURCE_FIELDS.advice_records },
    claims:            { table: 'claims',            on: 'claims.contact_id = client_engagements.contact_id',    fields: SOURCE_FIELDS.claims },
    reviews:           { table: 'reviews',           on: 'reviews.contact_id = client_engagements.contact_id',   fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = client_engagements.contact_id',fields: SOURCE_FIELDS.complaints },
    risk_details:      { table: 'risk_details',      on: 'risk_details.contact_id = client_engagements.contact_id', fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'client_engagements.assigned_broker_id = broker.id',    fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'client_engagements.assigned_admin_id = admin.id',      fields: _USER_FIELDS },
  },
  risk_details: {
    policy_sections:   { table: 'assets',            on: 'policy_sections.id = risk_details.asset_id',            fields: SOURCE_FIELDS.policy_sections },
    contacts:          { table: 'contacts',          on: 'risk_details.contact_id = contacts.id',                 fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'risk_details.account_id = accounts.id',                fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'risk_details.policy_id = policies.id',                  fields: SOURCE_FIELDS.policies },
    assets:            { table: 'assets',            on: 'risk_details.asset_id = assets.id',                     fields: SOURCE_FIELDS.assets },
    claims:            { table: 'claims',            on: 'claims.asset_id = risk_details.asset_id',               fields: SOURCE_FIELDS.claims },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = risk_details.contact_id', fields: SOURCE_FIELDS.client_engagements },
    reviews:           { table: 'reviews',           on: 'reviews.contact_id = risk_details.contact_id',          fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = risk_details.contact_id',       fields: SOURCE_FIELDS.complaints },
    advice_records:    { table: 'advice_records',    on: 'advice_records.contact_id = risk_details.contact_id',   fields: SOURCE_FIELDS.advice_records },
  },
  complaints: {
    contacts:          { table: 'contacts',          on: 'complaints.contact_id = contacts.id',                   fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'complaints.account_id = accounts.id',                  fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'complaints.policy_id = policies.id',                    fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.contact_id = complaints.contact_id',    fields: SOURCE_FIELDS.policy_sections },
    claims:            { table: 'claims',            on: 'complaints.claim_id = claims.id',                       fields: SOURCE_FIELDS.claims },
    assets:            { table: 'assets',            on: 'assets.contact_id = complaints.contact_id',             fields: SOURCE_FIELDS.assets },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = complaints.contact_id',fields: SOURCE_FIELDS.client_engagements },
    reviews:           { table: 'reviews',           on: 'reviews.contact_id = complaints.contact_id',            fields: SOURCE_FIELDS.reviews },
    advice_records:    { table: 'advice_records',    on: 'advice_records.contact_id = complaints.contact_id',    fields: SOURCE_FIELDS.advice_records },
    risk_details:      { table: 'risk_details',      on: 'risk_details.contact_id = complaints.contact_id',       fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'complaints.broker_id = broker.id',                      fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'complaints.complaint_owner_id = admin.id',              fields: _USER_FIELDS },
  },
  reviews: {
    contacts:          { table: 'contacts',          on: 'reviews.contact_id = contacts.id',                      fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'reviews.account_id = accounts.id',                     fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'reviews.policy_id = policies.id',                      fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.contact_id = reviews.contact_id',       fields: SOURCE_FIELDS.policy_sections },
    assets:            { table: 'assets',            on: 'assets.contact_id = reviews.contact_id',                fields: SOURCE_FIELDS.assets },
    advice_records:    { table: 'advice_records',    on: 'reviews.linked_advice_record_id = advice_records.id',   fields: SOURCE_FIELDS.advice_records },
    claims:            { table: 'claims',            on: 'claims.policy_id = reviews.policy_id',                  fields: SOURCE_FIELDS.claims },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = reviews.contact_id',            fields: SOURCE_FIELDS.complaints },
    client_engagements:{ table: 'client_engagements',on: 'client_engagements.contact_id = reviews.contact_id',   fields: SOURCE_FIELDS.client_engagements },
    risk_details:      { table: 'risk_details',      on: 'risk_details.contact_id = reviews.contact_id',          fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'reviews.broker_id = broker.id',                         fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'reviews.assigned_admin_id = admin.id',                  fields: _USER_FIELDS },
  },
  advice_records: {
    contacts:          { table: 'contacts',          on: 'advice_records.contact_id = contacts.id',               fields: SOURCE_FIELDS.contacts },
    accounts:          { table: 'accounts',          on: 'advice_records.account_id = accounts.id',              fields: SOURCE_FIELDS.accounts },
    policies:          { table: 'policies',          on: 'advice_records.policy_id = policies.id',                fields: SOURCE_FIELDS.policies },
    policy_sections:   { table: 'assets',            on: 'policy_sections.contact_id = advice_records.contact_id',fields: SOURCE_FIELDS.policy_sections },
    assets:            { table: 'assets',            on: 'assets.contact_id = advice_records.contact_id',         fields: SOURCE_FIELDS.assets },
    client_engagements:{ table: 'client_engagements',on: 'advice_records.engagement_id = client_engagements.id', fields: SOURCE_FIELDS.client_engagements },
    reviews:           { table: 'reviews',           on: 'reviews.linked_advice_record_id = advice_records.id',   fields: SOURCE_FIELDS.reviews },
    complaints:        { table: 'complaints',        on: 'complaints.contact_id = advice_records.contact_id',     fields: SOURCE_FIELDS.complaints },
    claims:            { table: 'claims',            on: 'claims.contact_id = advice_records.contact_id',         fields: SOURCE_FIELDS.claims },
    risk_details:      { table: 'risk_details',      on: 'risk_details.contact_id = advice_records.contact_id',   fields: SOURCE_FIELDS.risk_details },
    broker:            { table: 'users',             on: 'advice_records.broker_id = broker.id',                  fields: _USER_FIELDS },
    admin:             { table: 'users',             on: 'advice_records.prepared_by_id = admin.id',              fields: _USER_FIELDS },
  },
};

const ALLOWED_OPERATORS = [
  'equals','not_equals','contains','is_empty','is_not_empty',
  'greater_than','less_than','between','is_one_of',
];

const ALLOWED_SOURCES = Object.keys(SOURCE_FIELDS);

// ============================================================
// HELPERS
// ============================================================

/**
 * Validate that a column name belongs to the allowed set for a given source.
 */
function isValidField(source, field) {
  const fields = SOURCE_FIELDS[source];
  if (!fields) return false;
  // Allow table-prefixed fields like "contacts.first_name"
  if (field.includes('.')) {
    const [tbl, col] = field.split('.');
    const tblFields = SOURCE_FIELDS[tbl];
    return tblFields ? tblFields.includes(col) : false;
  }
  return fields.includes(field);
}

/**
 * Build a WHERE clause fragment for a single filter.
 * Returns { sql, params } or throws on invalid input.
 */
function buildFilterClause(source, filter) {
  const { field, operator, value, value2 } = filter;

  if (!ALLOWED_OPERATORS.includes(operator)) {
    throw new Error(`Invalid operator: ${operator}`);
  }

  // Determine qualified field name (allow cross-table in joins)
  let qualifiedField;
  if (field.includes('.')) {
    const [tbl, col] = field.split('.');
    const tblFields = SOURCE_FIELDS[tbl];
    if (!tblFields || !tblFields.includes(col)) {
      throw new Error(`Invalid field: ${field}`);
    }
    // Handle computed fields
    if (COMPUTED_FIELDS[tbl] && COMPUTED_FIELDS[tbl][col]) {
      qualifiedField = COMPUTED_FIELDS[tbl][col].replace(/"contacts"/g, `"${tbl}"`);
    } else {
      qualifiedField = `"${tbl}"."${col}"`;
    }
  } else {
    if (!SOURCE_FIELDS[source] || !SOURCE_FIELDS[source].includes(field)) {
      throw new Error(`Invalid field for source ${source}: ${field}`);
    }
    // Handle computed fields
    if (COMPUTED_FIELDS[source] && COMPUTED_FIELDS[source][field]) {
      qualifiedField = COMPUTED_FIELDS[source][field];
    } else {
      qualifiedField = `"${source}"."${field}"`;
    }
  }

  switch (operator) {
    case 'equals':
      return { sql: `${qualifiedField} = ?`, params: [value] };
    case 'not_equals':
      return { sql: `${qualifiedField} != ?`, params: [value] };
    case 'contains':
      return { sql: `${qualifiedField} LIKE ?`, params: [`%${value}%`] };
    case 'is_empty':
      return { sql: `(${qualifiedField} IS NULL OR ${qualifiedField} = '')`, params: [] };
    case 'is_not_empty':
      return { sql: `(${qualifiedField} IS NOT NULL AND ${qualifiedField} != '')`, params: [] };
    case 'greater_than':
      return { sql: `${qualifiedField} > ?`, params: [value] };
    case 'less_than':
      return { sql: `${qualifiedField} < ?`, params: [value] };
    case 'between':
      return { sql: `${qualifiedField} BETWEEN ? AND ?`, params: [value, value2] };
    case 'is_one_of': {
      const vals = Array.isArray(value) ? value : [value];
      const placeholders = vals.map(() => '?').join(', ');
      return { sql: `${qualifiedField} IN (${placeholders})`, params: vals };
    }
    default:
      throw new Error(`Unhandled operator: ${operator}`);
  }
}

/**
 * Run the predefined SQL for a given report key with optional filters.
 */
function runPredefinedQuery(key, { date_from, date_to, broker_id } = {}) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  switch (key) {
    case 'overdue_reviews': {
      const cParams = [today];
      const cExtra = broker_id ? ` AND c.assigned_broker_id = ?` : '';
      if (broker_id) cParams.push(broker_id);

      const aParams = [today];
      const aExtra = broker_id ? ` AND a.assigned_broker_id = ?` : '';
      if (broker_id) aParams.push(broker_id);

      return db.prepare(`
        SELECT
          'contact'                              AS record_type,
          c.id,
          (c.first_name || ' ' || c.last_name)  AS client_name,
          c.contact_status                       AS status,
          c.next_review_date                     AS next_review_date,
          c.last_review_date                     AS last_review_date,
          b.full_name                            AS broker_name,
          c.email,
          c.mobile
        FROM contacts c
        LEFT JOIN users b ON c.assigned_broker_id = b.id
        WHERE c.next_review_date < ?
          AND c.contact_status = 'Active Client'
          ${cExtra}
        UNION ALL
        SELECT
          'account'         AS record_type,
          a.id,
          a.account_name    AS client_name,
          a.client_status   AS status,
          a.next_review_date AS next_review_date,
          a.last_review_date AS last_review_date,
          b.full_name       AS broker_name,
          NULL              AS email,
          NULL              AS mobile
        FROM accounts a
        LEFT JOIN users b ON a.assigned_broker_id = b.id
        WHERE a.next_review_date < ?
          AND a.client_status = 'Active Client'
          ${aExtra}
        ORDER BY 5 ASC
      `).all(...cParams, ...aParams);
    }

    case 'gap_sections': {
      const conditions = ['ps.gap_identified = 1'];
      const params = [];
      if (date_from) { conditions.push('ps.created_at >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('ps.created_at <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('p.assigned_broker_id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          ps.id,
          ps.section_name,
          ps.section_type,
          ps.section_category,
          ps.gap_severity,
          ps.needs_analysis_status,
          ps.created_at,
          p.policy_name,
          p.policy_number,
          p.insurer,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM policy_sections ps
        LEFT JOIN policies p ON ps.policy_id = p.id
        LEFT JOIN contacts c ON ps.contact_id = c.id
        LEFT JOIN accounts a ON ps.account_id = a.id
        LEFT JOIN users b ON p.assigned_broker_id = b.id
        ${where}
        ORDER BY ps.gap_severity DESC, ps.created_at DESC
      `).all(...params);
    }

    case 'declined_recommendations': {
      const conditions = [
        'ps.recommended_for_cover = 1',
        'ps.client_declined_recommendation = 1',
      ];
      const params = [];
      if (date_from) { conditions.push('ps.created_at >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('ps.created_at <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('p.assigned_broker_id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          ps.id,
          ps.section_name,
          ps.section_type,
          ps.section_category,
          ps.decline_reason,
          ps.gap_identified,
          ps.gap_severity,
          ps.created_at,
          p.policy_name,
          p.policy_number,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM policy_sections ps
        LEFT JOIN policies p ON ps.policy_id = p.id
        LEFT JOIN contacts c ON ps.contact_id = c.id
        LEFT JOIN accounts a ON ps.account_id = a.id
        LEFT JOIN users b ON p.assigned_broker_id = b.id
        ${where}
        ORDER BY ps.created_at DESC
      `).all(...params);
    }

    case 'delay_flag_claims': {
      const conditions = ['cl.delay_flag = 1'];
      const params = [];
      if (date_from) { conditions.push('cl.claim_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('cl.claim_date <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('cl.broker_id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          cl.id,
          cl.claim_number,
          cl.claim_date,
          cl.date_reported,
          cl.claim_type,
          cl.claim_status,
          cl.estimated_value,
          cl.fair_process_concern,
          cl.dispute_raised,
          cl.incident_description,
          p.policy_name,
          p.policy_number,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM claims cl
        LEFT JOIN policies p ON cl.policy_id = p.id
        LEFT JOIN contacts c ON cl.contact_id = c.id
        LEFT JOIN accounts a ON cl.account_id = a.id
        LEFT JOIN users b ON cl.broker_id = b.id
        ${where}
        ORDER BY cl.claim_date DESC
      `).all(...params);
    }

    case 'complaints_by_category': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('complaint_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('complaint_date <= ?'); params.push(date_to); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          complaint_category,
          root_cause_category,
          COUNT(*) AS count
        FROM complaints
        ${where}
        GROUP BY complaint_category, root_cause_category
        ORDER BY count DESC, complaint_category ASC
      `).all(...params);
    }

    case 'conduct_concerns': {
      const params = [];
      return db.prepare(`
        SELECT
          'contacts' AS source_module,
          c.id,
          (c.first_name || ' ' || c.last_name) AS subject,
          c.conduct_risk_notes AS conduct_notes,
          NULL AS section_type,
          NULL AS stage,
          c.updated_at
        FROM contacts c
        WHERE c.conduct_risk_flag = 1
        UNION ALL
        SELECT
          'policy_sections' AS source_module,
          ps.id,
          ps.section_name AS subject,
          ps.conduct_notes,
          ps.section_type,
          NULL AS stage,
          ps.updated_at
        FROM policy_sections ps
        WHERE ps.conduct_concern_flag = 1
        UNION ALL
        SELECT
          'client_engagements' AS source_module,
          ce.id,
          ce.engagement_name AS subject,
          ce.conduct_notes,
          NULL AS section_type,
          ce.stage,
          ce.updated_at
        FROM client_engagements ce
        WHERE ce.conduct_concern_flag = 1
        ORDER BY updated_at DESC
      `).all(...params);
    }

    case 'renewal_due': {
      const conditions = [
        `p.policy_status = 'Active'`,
        `p.renewal_date BETWEEN ? AND ?`,
      ];
      const params = [today, thirtyDaysOut];
      if (broker_id) { conditions.push('p.assigned_broker_id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          p.id,
          p.policy_name,
          p.policy_number,
          p.insurer,
          p.product_category,
          p.policy_type,
          p.premium,
          p.renewal_date,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM policies p
        LEFT JOIN contacts c ON p.contact_id = c.id
        LEFT JOIN accounts a ON p.account_id = a.id
        LEFT JOIN users b ON p.assigned_broker_id = b.id
        ${where}
        ORDER BY p.renewal_date ASC
      `).all(...params);
    }

    case 'open_engagements': {
      const conditions = [`ce.stage NOT IN ('Implemented / Active','Lost / Declined')`];
      const params = [];
      if (broker_id) { conditions.push('ce.assigned_broker_id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          ce.stage,
          b.full_name AS broker_name,
          COUNT(*) AS count
        FROM client_engagements ce
        LEFT JOIN contacts c ON ce.contact_id = c.id
        LEFT JOIN accounts a ON ce.account_id = a.id
        LEFT JOIN users b ON ce.assigned_broker_id = b.id
        ${where}
        GROUP BY ce.stage, b.full_name
        ORDER BY ce.stage ASC, broker_name ASC
      `).all(...params);
    }

    case 'active_clients_accounts': {
      const cParams = [];
      const cExtra = [];
      if (date_from) { cExtra.push('c.date_became_client >= ?'); cParams.push(date_from); }
      if (date_to)   { cExtra.push('c.date_became_client <= ?'); cParams.push(date_to);   }
      if (broker_id) { cExtra.push('c.assigned_broker_id = ?');  cParams.push(broker_id); }
      const cWhere = cExtra.length ? ` AND ${cExtra.join(' AND ')}` : '';

      const aParams = [];
      const aExtra = [];
      if (date_from) { aExtra.push('a.date_became_client >= ?'); aParams.push(date_from); }
      if (date_to)   { aExtra.push('a.date_became_client <= ?'); aParams.push(date_to);   }
      if (broker_id) { aExtra.push('a.assigned_broker_id = ?');  aParams.push(broker_id); }
      const aWhere = aExtra.length ? ` AND ${aExtra.join(' AND ')}` : '';

      return db.prepare(`
        SELECT
          'contact' AS record_type,
          c.id,
          (c.first_name || ' ' || c.last_name) AS client_name,
          c.contact_status AS status,
          c.contact_type   AS type,
          c.client_category AS category,
          c.email,
          c.mobile,
          c.date_became_client,
          b.full_name AS broker_name
        FROM contacts c
        LEFT JOIN users b ON c.assigned_broker_id = b.id
        WHERE c.contact_status = 'Active Client'${cWhere}
        UNION ALL
        SELECT
          'account' AS record_type,
          a.id,
          a.account_name AS client_name,
          a.client_status AS status,
          a.business_type AS type,
          a.industry AS category,
          NULL AS email,
          NULL AS mobile,
          a.date_became_client,
          b.full_name AS broker_name
        FROM accounts a
        LEFT JOIN users b ON a.assigned_broker_id = b.id
        WHERE a.client_status = 'Active Client'${aWhere}
        ORDER BY date_became_client DESC, client_name ASC
      `).all(...cParams, ...aParams);
    }

    case 'popia_compliance': {
      const conditions = [`c.contact_status IN ('Active Client','Prospect')`];
      const params = [];
      if (broker_id) { conditions.push('c.assigned_broker_id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          c.id,
          (c.first_name || ' ' || c.last_name) AS client_name,
          c.contact_status,
          c.popia_consent_obtained,
          c.popia_consent_date,
          CASE
            WHEN c.popia_consent_obtained = 0 THEN 'Not Obtained'
            WHEN c.popia_consent_date IS NULL THEN 'Obtained - No Date'
            WHEN date(c.popia_consent_date) < date('now','-12 months') THEN 'Expired (>12 months)'
            ELSE 'Compliant'
          END AS popia_status,
          c.email,
          c.mobile,
          b.full_name AS broker_name
        FROM contacts c
        LEFT JOIN users b ON c.assigned_broker_id = b.id
        ${where}
        ORDER BY popia_status ASC, client_name ASC
      `).all(...params);
    }

    case 'fica_compliance': {
      const cParams = [];
      const cExtra = broker_id ? ' AND c.assigned_broker_id = ?' : '';
      if (broker_id) cParams.push(broker_id);

      const aParams = [];
      const aExtra = broker_id ? ' AND a.assigned_broker_id = ?' : '';
      if (broker_id) aParams.push(broker_id);

      return db.prepare(`
        SELECT
          'contact' AS record_type,
          c.id,
          (c.first_name || ' ' || c.last_name) AS client_name,
          c.contact_status AS status,
          c.fica_status,
          c.email,
          c.mobile,
          b.full_name AS broker_name
        FROM contacts c
        LEFT JOIN users b ON c.assigned_broker_id = b.id
        WHERE c.contact_status NOT IN ('Former Client','Deceased','Do Not Service')${cExtra}
        UNION ALL
        SELECT
          'account' AS record_type,
          a.id,
          a.account_name AS client_name,
          a.client_status AS status,
          a.fica_status,
          NULL AS email,
          NULL AS mobile,
          b.full_name AS broker_name
        FROM accounts a
        LEFT JOIN users b ON a.assigned_broker_id = b.id
        WHERE a.client_status NOT IN ('Former Client','Do Not Service')${aExtra}
        ORDER BY fica_status ASC, client_name ASC
      `).all(...cParams, ...aParams);
    }

    case 'broker_fitness': {
      const conditions = [`u.role IN ('broker','admin')`, `u.active = 1`];
      const params = [];
      if (broker_id) { conditions.push('u.id = ?'); params.push(broker_id); }
      const where = `WHERE ${conditions.join(' AND ')}`;
      return db.prepare(`
        SELECT
          u.id AS broker_id,
          u.full_name AS broker_name,
          (SELECT COUNT(*) FROM contacts c
             WHERE c.assigned_broker_id = u.id
               AND c.contact_status = 'Active Client') AS active_contacts,
          (SELECT COUNT(*) FROM accounts a
             WHERE a.assigned_broker_id = u.id
               AND a.client_status = 'Active Client') AS active_accounts,
          (SELECT COUNT(*) FROM policies p
             WHERE p.assigned_broker_id = u.id
               AND p.policy_status = 'Active') AS active_policies,
          (SELECT COUNT(*) FROM client_engagements e
             WHERE e.assigned_broker_id = u.id
               AND e.stage NOT IN ('Implemented / Active','Lost / Declined')) AS open_engagements,
          (SELECT COUNT(*) FROM advice_records r
             WHERE r.broker_id = u.id) AS advice_records,
          (SELECT COUNT(*) FROM claims cl
             WHERE cl.broker_id = u.id
               AND cl.claim_status NOT IN ('Settled','Closed','Rejected')) AS open_claims,
          (SELECT COUNT(*) FROM complaints cm
             LEFT JOIN contacts cc ON cm.contact_id = cc.id
             LEFT JOIN accounts ca ON cm.account_id = ca.id
             LEFT JOIN policies cp ON cm.policy_id  = cp.id
             WHERE cm.complaint_status NOT IN ('Resolved','Closed')
               AND (cm.broker_id = u.id
                 OR cm.complaint_owner_id = u.id
                 OR cm.assigned_to_id = u.id
                 OR cc.assigned_broker_id = u.id
                 OR ca.assigned_broker_id = u.id
                 OR cp.assigned_broker_id = u.id)) AS open_complaints,
          (SELECT COUNT(*) FROM complaints cm
             LEFT JOIN contacts cc ON cm.contact_id = cc.id
             LEFT JOIN accounts ca ON cm.account_id = ca.id
             LEFT JOIN policies cp ON cm.policy_id  = cp.id
             WHERE cm.broker_id = u.id
                OR cm.complaint_owner_id = u.id
                OR cm.assigned_to_id = u.id
                OR cc.assigned_broker_id = u.id
                OR ca.assigned_broker_id = u.id
                OR cp.assigned_broker_id = u.id) AS total_complaints,
          (SELECT COUNT(*) FROM contacts c
             WHERE c.assigned_broker_id = u.id
               AND c.conduct_risk_flag = 1) AS conduct_concerns,
          (SELECT COUNT(*) FROM contacts c
             WHERE c.assigned_broker_id = u.id
               AND c.contact_status = 'Active Client'
               AND c.next_review_date < date('now')) AS overdue_reviews
        FROM users u
        ${where}
        ORDER BY u.full_name ASC
      `).all(...params);
    }

    case 'claims_report': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('cl.claim_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('cl.claim_date <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('cl.broker_id = ?');   params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          cl.id,
          cl.claim_number,
          cl.claim_date,
          cl.date_reported,
          cl.claim_type,
          cl.claim_status,
          cl.estimated_value,
          cl.settlement_amount,
          cl.settlement_date,
          cl.delay_flag,
          cl.dispute_raised,
          p.policy_name,
          p.policy_number,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM claims cl
        LEFT JOIN policies p ON cl.policy_id = p.id
        LEFT JOIN contacts c ON cl.contact_id = c.id
        LEFT JOIN accounts a ON cl.account_id = a.id
        LEFT JOIN users    b ON cl.broker_id  = b.id
        ${where}
        ORDER BY cl.claim_date DESC
      `).all(...params);
    }

    case 'complaints_report': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('cm.complaint_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('cm.complaint_date <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('cm.broker_id = ?');       params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          cm.id,
          cm.complaint_number,
          cm.complaint_date,
          cm.received_via,
          cm.complaint_category,
          cm.complaint_status,
          cm.response_due_date,
          cm.resolution_date,
          cm.fair_outcome_achieved,
          cm.root_cause_category,
          cm.complaint_escalated_internally,
          cm.external_ombud_escalation,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM complaints cm
        LEFT JOIN contacts c ON cm.contact_id = c.id
        LEFT JOIN accounts a ON cm.account_id = a.id
        LEFT JOIN users    b ON cm.broker_id  = b.id
        ${where}
        ORDER BY cm.complaint_date DESC
      `).all(...params);
    }

    case 'advice_records_report': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('ar.advice_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('ar.advice_date <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('ar.broker_id = ?');    params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          ar.id,
          ar.advice_record_number,
          ar.advice_date,
          ar.advice_type,
          ar.trigger_event,
          ar.client_decision,
          ar.decision_date,
          ar.roa_generated,
          ar.final_document_issued,
          ar.client_acknowledgement_received,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          p.policy_name,
          b.full_name AS broker_name
        FROM advice_records ar
        LEFT JOIN contacts c ON ar.contact_id = c.id
        LEFT JOIN accounts a ON ar.account_id = a.id
        LEFT JOIN policies p ON ar.policy_id  = p.id
        LEFT JOIN users    b ON ar.broker_id  = b.id
        ${where}
        ORDER BY ar.advice_date DESC
      `).all(...params);
    }

    case 'third_party_claims': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('cl.claim_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('cl.claim_date <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('cl.broker_id = ?');   params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          tp.id,
          cl.claim_number,
          cl.claim_date,
          cl.claim_type,
          cl.claim_status,
          (TRIM(IFNULL(tp.initials,'') || ' ' || tp.surname)) AS third_party_name,
          tp.cell_no,
          tp.telephone_no,
          tp.address,
          tp.vehicle_make,
          tp.vehicle_model,
          tp.vehicle_reg,
          tp.damage_description,
          tp.is_insured,
          tp.insurer AS third_party_insurer,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM claim_third_parties tp
        JOIN claims cl    ON tp.claim_id   = cl.id
        LEFT JOIN contacts c ON cl.contact_id = c.id
        LEFT JOIN accounts a ON cl.account_id = a.id
        LEFT JOIN users    b ON cl.broker_id  = b.id
        ${where}
        ORDER BY cl.claim_date DESC
      `).all(...params);
    }

    case 'client_engagements_report': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('ce.created_at >= ?');         params.push(date_from); }
      if (date_to)   { conditions.push('ce.created_at <= ?');         params.push(date_to); }
      if (broker_id) { conditions.push('ce.assigned_broker_id = ?');  params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          ce.id,
          ce.engagement_name,
          ce.stage,
          ce.engagement_type,
          ce.source_of_lead,
          ce.risk_priority,
          ce.client_decision,
          ce.decline_reason,
          ce.fact_find_completed,
          ce.needs_analysis_completed,
          ce.advice_presented,
          ce.disclosure_completed,
          ce.suitability_confirmed,
          ce.inception_date,
          ce.created_at,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM client_engagements ce
        LEFT JOIN contacts c ON ce.contact_id = c.id
        LEFT JOIN accounts a ON ce.account_id = a.id
        LEFT JOIN users    b ON ce.assigned_broker_id = b.id
        ${where}
        ORDER BY ce.created_at DESC
      `).all(...params);
    }

    case 'policies_report': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('p.inception_date >= ?');     params.push(date_from); }
      if (date_to)   { conditions.push('p.inception_date <= ?');     params.push(date_to); }
      if (broker_id) { conditions.push('p.assigned_broker_id = ?');  params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          p.id,
          p.policy_name,
          p.policy_number,
          p.insurer,
          p.policy_type,
          p.product_category,
          p.policy_status,
          p.premium,
          p.inception_date,
          p.renewal_date,
          p.cancellation_date,
          p.disclosure_completed,
          p.amendment_count,
          p.claims_count,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          b.full_name AS broker_name
        FROM policies p
        LEFT JOIN contacts c ON p.contact_id = c.id
        LEFT JOIN accounts a ON p.account_id = a.id
        LEFT JOIN users    b ON p.assigned_broker_id = b.id
        ${where}
        ORDER BY p.inception_date DESC
      `).all(...params);
    }

    case 'reviews_report': {
      const conditions = [];
      const params = [];
      if (date_from) { conditions.push('r.review_date >= ?'); params.push(date_from); }
      if (date_to)   { conditions.push('r.review_date <= ?'); params.push(date_to); }
      if (broker_id) { conditions.push('r.broker_id = ?');    params.push(broker_id); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return db.prepare(`
        SELECT
          r.id,
          r.review_number,
          r.review_date,
          r.review_type,
          r.review_outcome,
          r.review_completed,
          r.advice_record_required,
          r.next_review_date,
          r.gaps_identified,
          r.recommendations,
          (c.first_name || ' ' || c.last_name) AS contact_name,
          a.account_name,
          p.policy_name,
          b.full_name AS broker_name
        FROM reviews r
        LEFT JOIN contacts c ON r.contact_id = c.id
        LEFT JOIN accounts a ON r.account_id = a.id
        LEFT JOIN policies p ON r.policy_id  = p.id
        LEFT JOIN users    b ON r.broker_id  = b.id
        ${where}
        ORDER BY r.review_date DESC
      `).all(...params);
    }

    default:
      throw new Error(`Unknown report key: ${key}`);
  }
}

/**
 * Build a custom SQL query from the provided config object.
 * Returns { dataSql, countSql, params, columns }.
 */
function buildCustomQuery(config) {
  const {
    source,
    columns = [],
    filters = [],
    joins = [],
    sort_field,
    sort_dir = 'asc',
    group_by,
    page = 1,
    limit = 50,
  } = config;

  if (!ALLOWED_SOURCES.includes(source)) {
    throw new Error(`Invalid source: ${source}`);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const safePage  = Math.max(parseInt(page, 10) || 1, 1);
  const offset    = (safePage - 1) * safeLimit;

  // Validate and resolve columns
  const validCols = (SOURCE_FIELDS[source] || []);
  let selectedColumns;
  if (!columns || columns.length === 0) {
    selectedColumns = validCols.map((f) => {
      if (COMPUTED_FIELDS[source] && COMPUTED_FIELDS[source][f]) {
        return `${COMPUTED_FIELDS[source][f]} AS "${source}_${f}"`;
      }
      return `"${source}"."${f}" AS "${source}_${f}"`;
    });
  } else {
    selectedColumns = columns.map((col) => {
      if (!isValidField(source, col)) {
        throw new Error(`Invalid column: ${col}`);
      }
      if (col.includes('.')) {
        const [tbl, f] = col.split('.');
        // Handle computed fields for joined tables
        if (COMPUTED_FIELDS[tbl] && COMPUTED_FIELDS[tbl][f]) {
          const expr = COMPUTED_FIELDS[tbl][f].replace(/"contacts"/g, `"${tbl}"`);
          return `${expr} AS "${tbl}_${f}"`;
        }
        return `"${tbl}"."${f}" AS "${tbl}_${f}"`;
      }
      // Handle computed fields for source table
      if (COMPUTED_FIELDS[source] && COMPUTED_FIELDS[source][col]) {
        return `${COMPUTED_FIELDS[source][col]} AS "${source}_${col}"`;
      }
      return `"${source}"."${col}" AS "${source}_${col}"`;
    });
  }

  // Validate and build JOIN clauses
  const joinClauses = [];
  const validJoinsForSource = VALID_JOINS[source] || {};

  // Detect if both policy_sections and assets are being joined (both use assets table).
  // When both are present, we must process policy_sections first so its alias exists
  // when assets references it, and link assets to policy_sections to avoid cartesian product.
  const joinAliases = joins.map(j => j.module);
  const hasBothSectionsAndAssets = joinAliases.includes('policy_sections') && joinAliases.includes('assets');
  if (hasBothSectionsAndAssets) {
    joins.sort((a, b) => {
      if (a.module === 'policy_sections') return -1;
      if (b.module === 'policy_sections') return 1;
      return 0;
    });
  }

  for (const j of joins) {
    const joinAlias = j.module;
    const joinDef = validJoinsForSource[joinAlias];
    if (!joinDef) {
      throw new Error(`Invalid join for source ${source}: ${joinAlias}`);
    }
    // Add requested join fields to SELECT
    const jFields = j.fields && j.fields.length > 0 ? j.fields : ['id'];
    // Determine which COMPUTED_FIELDS map to use for this join
    // joinAlias may differ from the underlying table (e.g. 'broker' uses 'users' table)
    const joinTableKey = joinDef.table === joinAlias ? joinAlias : joinDef.table;
    for (const jf of jFields) {
      if (!joinDef.fields.includes(jf)) {
        throw new Error(`Invalid join field ${jf} for join ${joinAlias}`);
      }
      const alias = `"${joinAlias}_${jf}"`;
      // Handle computed fields (e.g. contacts.full_name)
      if (COMPUTED_FIELDS[joinTableKey] && COMPUTED_FIELDS[joinTableKey][jf]) {
        // Replace the default table reference with the actual join alias used in the query
        const expr = COMPUTED_FIELDS[joinTableKey][jf]
          .replace(new RegExp(`"${joinTableKey}"`, 'g'), `"${joinAlias}"`);
        selectedColumns.push(`${expr} AS ${alias}`);
      } else {
        selectedColumns.push(`"${joinAlias}"."${jf}" AS ${alias}`);
      }
    }

    // Determine whether we need an alias (users table joined under broker/admin)
    // For policy_sections joins (backed by assets), filter to only assets with a section assigned
    const sectionFilter = joinAlias === 'policy_sections'
      ? ` AND "${joinAlias}"."asset_section" IS NOT NULL AND "${joinAlias}"."asset_section" != ''`
      : '';

    // When both policy_sections and assets are joined, they both reference the assets table.
    // To avoid a cartesian product, link assets directly to policy_sections (same row).
    let onClause = joinDef.on;
    if (hasBothSectionsAndAssets && joinAlias === 'assets') {
      onClause = 'assets.id = policy_sections.id';
    }

    if (joinDef.table !== joinAlias) {
      joinClauses.push(
        `LEFT JOIN "${joinDef.table}" AS "${joinAlias}" ON ${onClause}${sectionFilter}`
      );
    } else {
      joinClauses.push(
        `LEFT JOIN "${joinDef.table}" ON ${onClause}${sectionFilter}`
      );
    }
  }

  // Build WHERE clause
  const whereParts = [];
  const queryParams = [];
  for (const filter of filters) {
    const { sql, params } = buildFilterClause(source, filter);
    whereParts.push(sql);
    queryParams.push(...params);
  }
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  // GROUP BY
  let groupByClause = '';
  if (group_by) {
    if (!isValidField(source, group_by)) {
      throw new Error(`Invalid group_by field: ${group_by}`);
    }
    const gbField = group_by.includes('.')
      ? (() => { const [t, f] = group_by.split('.'); return `"${t}"."${f}"`; })()
      : `"${source}"."${group_by}"`;
    groupByClause = `GROUP BY ${gbField}`;
  }

  // ORDER BY
  let orderByClause = '';
  if (sort_field) {
    if (!isValidField(source, sort_field)) {
      throw new Error(`Invalid sort_field: ${sort_field}`);
    }
    const safeSortDir = sort_dir === 'desc' ? 'DESC' : 'ASC';
    const sfField = sort_field.includes('.')
      ? (() => { const [t, f] = sort_field.split('.'); return `"${t}"."${f}"`; })()
      : `"${source}"."${sort_field}"`;
    orderByClause = `ORDER BY ${sfField} ${safeSortDir}`;
  }

  // policy_sections source reads from the assets table (section data migrated to assets)
  const sourceTable = source === 'policy_sections'
    ? `"assets" AS "policy_sections"`
    : `"${source}"`;
  // When source is policy_sections, only include assets that have a section assigned
  if (source === 'policy_sections') {
    whereParts.push(`"policy_sections"."asset_section" IS NOT NULL AND "policy_sections"."asset_section" != ''`);
  }
  const fullWhere = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : whereClause;
  const baseFrom = `
    FROM ${sourceTable}
    ${joinClauses.join('\n')}
    ${fullWhere}
    ${groupByClause}
  `;

  const selectList = selectedColumns.join(', ');
  const dataSql  = `SELECT ${selectList} ${baseFrom} ${orderByClause} LIMIT ? OFFSET ?`;
  const countSql = `SELECT COUNT(*) AS total ${baseFrom}`;

  const usedColumns = columns.length > 0 ? columns : SOURCE_FIELDS[source];

  return {
    dataSql,
    countSql,
    params: queryParams,
    columns: usedColumns,
    safeLimit,
    safePage,
    offset,
  };
}

/**
 * Write rows to a temp CSV file and return the file path.
 */
async function writeCsvTempFile(rows, columns, prefix = 'report') {
  const tmpDir  = require('os').tmpdir();
  const tmpFile = path.join(tmpDir, `${prefix}_${Date.now()}.csv`);

  if (!rows || rows.length === 0) {
    fs.writeFileSync(tmpFile, '');
    return tmpFile;
  }

  const headers = Object.keys(rows[0]).map((id) => ({ id, title: id }));
  const csvWriter = createObjectCsvWriter({ path: tmpFile, header: headers });
  await csvWriter.writeRecords(rows);
  return tmpFile;
}

/**
 * Stream a file as a download and delete it after sending.
 */
function streamFileDownload(res, filePath, downloadName, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('end', () => {
    fs.unlink(filePath, () => {});
  });
  stream.on('error', (err) => {
    fs.unlink(filePath, () => {});
    // Headers already sent, just destroy
    res.destroy(err);
  });
}

/**
 * Build a PDF from rows and stream it to the response.
 */
function streamPdfReport(res, { title, filters, rows, columns, generatedAt }) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report_${Date.now()}.pdf"`);
  doc.pipe(res);

  // --- Header ---
  doc.fontSize(16).font('Helvetica-Bold').text(title || 'Custom Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica').text(`Generated: ${generatedAt || new Date().toISOString()}`, { align: 'center' });

  if (filters && Object.keys(filters).length > 0) {
    const filterStr = Object.entries(filters)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`)
      .join('  |  ');
    if (filterStr) {
      doc.moveDown(0.2);
      doc.fontSize(8).text(`Filters: ${filterStr}`, { align: 'center' });
    }
  }

  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
  doc.moveDown(0.3);

  if (!rows || rows.length === 0) {
    doc.fontSize(10).text('No data returned for this report.');
    doc.end();
    return;
  }

  // Determine columns to display
  const displayCols = columns && columns.length > 0
    ? columns
    : Object.keys(rows[0]);

  const pageWidth    = doc.page.width - 80;
  const colWidth     = Math.max(60, Math.floor(pageWidth / Math.min(displayCols.length, 10)));
  const visibleCols  = displayCols.slice(0, Math.floor(pageWidth / colWidth));
  const rowHeight    = 14;
  const headerHeight = 16;
  let currentY       = doc.y;

  // --- Column headers ---
  doc.fontSize(7).font('Helvetica-Bold');
  visibleCols.forEach((col, i) => {
    const x = 40 + i * colWidth;
    doc.text(String(col).toUpperCase().slice(0, 18), x, currentY, {
      width: colWidth - 4,
      ellipsis: true,
      lineBreak: false,
    });
  });

  currentY += headerHeight;
  doc.moveTo(40, currentY).lineTo(40 + visibleCols.length * colWidth, currentY).stroke();
  currentY += 3;

  // --- Data rows ---
  doc.fontSize(7).font('Helvetica');
  for (const row of rows) {
    if (currentY + rowHeight > doc.page.height - 60) {
      doc.addPage();
      currentY = 40;
    }
    visibleCols.forEach((col, i) => {
      const x = 40 + i * colWidth;
      const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
      doc.text(val.slice(0, 30), x, currentY, {
        width: colWidth - 4,
        ellipsis: true,
        lineBreak: false,
      });
    });
    currentY += rowHeight;
  }

  // --- Footer ---
  currentY += 8;
  doc.moveTo(40, currentY).lineTo(40 + visibleCols.length * colWidth, currentY).stroke();
  currentY += 6;
  doc.fontSize(8).font('Helvetica').text(`Total rows: ${rows.length}`, 40, currentY);

  doc.end();
}

// ============================================================
// 1. GET /predefined — list predefined reports
// ============================================================
router.get('/predefined', (req, res, next) => {
  try {
    res.json(PREDEFINED_REPORTS);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 2. POST /predefined/:key/run — run a predefined report
// ============================================================
router.post('/predefined/:key/run', (req, res, next) => {
  try {
    const { key } = req.params;
    const validKeys = PREDEFINED_REPORTS.map((r) => r.key);
    if (!validKeys.includes(key)) {
      return res.status(404).json({ error: `Unknown report key: ${key}` });
    }

    const { date_from, date_to, broker_id } = req.body || {};
    // Broker isolation: force broker_id for broker users
    const scopedBrokerId = getBrokerId(req);
    const effectiveBrokerId = scopedBrokerId || broker_id;

    const filtersApplied = {};
    if (date_from) filtersApplied.date_from = date_from;
    if (date_to)   filtersApplied.date_to   = date_to;
    if (effectiveBrokerId) filtersApplied.broker_id = effectiveBrokerId;

    const data = runPredefinedQuery(key, { date_from, date_to, broker_id: effectiveBrokerId });

    res.json({
      key,
      name: PREDEFINED_NAMES[key] || key,
      data,
      count: data.length,
      generated_at: new Date().toISOString(),
      filters_applied: filtersApplied,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 3. POST /predefined/:key/export-csv
// ============================================================
router.post('/predefined/:key/export-csv', async (req, res, next) => {
  try {
    const { key } = req.params;
    const validKeys = PREDEFINED_REPORTS.map((r) => r.key);
    if (!validKeys.includes(key)) {
      return res.status(404).json({ error: `Unknown report key: ${key}` });
    }

    const { date_from, date_to, broker_id } = req.body || {};
    // Broker isolation: force broker_id for broker users
    const scopedBrokerId = getBrokerId(req);
    const effectiveBrokerId = scopedBrokerId || broker_id;
    const data = runPredefinedQuery(key, { date_from, date_to, broker_id: effectiveBrokerId });

    const tmpFile = await writeCsvTempFile(data, [], key);
    streamFileDownload(res, tmpFile, `${key}_${Date.now()}.csv`, 'text/csv');
  } catch (err) {
    next(err);
  }
});

// ============================================================
// HELPER: inject broker isolation filter into custom report config
// ============================================================
const BROKER_FIELD_MAP = {
  contacts: 'assigned_broker_id',
  accounts: 'assigned_broker_id',
  policies: 'assigned_broker_id',
  client_engagements: 'assigned_broker_id',
  claims: 'broker_id',
  advice_records: 'broker_id',
  complaints: 'broker_id',
  reviews: 'broker_id',
};

function injectBrokerFilter(config, req) {
  const scopedBrokerId = getBrokerId(req);
  if (!scopedBrokerId) return config;

  const brokerField = BROKER_FIELD_MAP[config.source];
  if (!brokerField) return config;

  const filters = Array.isArray(config.filters) ? [...config.filters] : [];
  filters.push({ field: brokerField, operator: 'equals', value: scopedBrokerId });
  return { ...config, filters };
}

// ============================================================
// 4. POST /custom/run — run a custom report
// ============================================================
router.post('/custom/run', (req, res, next) => {
  try {
    const config = injectBrokerFilter(req.body || {}, req);
    const { dataSql, countSql, params, columns, safeLimit, safePage } = buildCustomQuery(config);

    const db   = getDb();
    const rows = db.prepare(dataSql).all(...params, safeLimit, (safePage - 1) * safeLimit);
    const { total } = db.prepare(countSql).get(...params);

    res.json({
      data: rows,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
      columns_used: columns,
      source: config.source,
    });
  } catch (err) {
    if (err.message && (err.message.startsWith('Invalid') || err.message.startsWith('Unknown'))) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ============================================================
// 5. POST /custom/export-csv
// ============================================================
router.post('/custom/export-csv', async (req, res, next) => {
  try {
    const config = injectBrokerFilter(req.body || {}, req);
    // Remove pagination limits for full export
    const exportConfig = { ...config, page: 1, limit: 10000 };
    const { dataSql, countSql, params, columns, safeLimit, safePage } = buildCustomQuery(exportConfig);

    const db   = getDb();
    const rows = db.prepare(dataSql).all(...params, safeLimit, 0);

    const tmpFile = await writeCsvTempFile(rows, columns, `custom_${config.source || 'report'}`);
    streamFileDownload(res, tmpFile, `custom_report_${Date.now()}.csv`, 'text/csv');
  } catch (err) {
    if (err.message && (err.message.startsWith('Invalid') || err.message.startsWith('Unknown'))) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ============================================================
// 6. POST /custom/export-pdf
// ============================================================
router.post('/custom/export-pdf', (req, res, next) => {
  try {
    const config = injectBrokerFilter(req.body || {}, req);
    const exportConfig = { ...config, page: 1, limit: 5000 };
    const { dataSql, countSql, params, columns, safeLimit } = buildCustomQuery(exportConfig);

    const db   = getDb();
    const rows = db.prepare(dataSql).all(...params, safeLimit, 0);

    const filtersApplied = {};
    if (config.source) filtersApplied.source = config.source;
    if (config.filters && config.filters.length > 0) {
      filtersApplied.filter_count = config.filters.length;
    }

    streamPdfReport(res, {
      title: `Custom Report — ${config.source || 'Unknown Source'}`,
      filters: filtersApplied,
      rows,
      columns,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err.message && (err.message.startsWith('Invalid') || err.message.startsWith('Unknown'))) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// ============================================================
// 7. POST /custom/ai-query — AI-assisted report building
// ============================================================
router.post('/custom/ai-query', async (req, res, next) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_anthropic_api_key_here' || apiKey.trim() === '') {
      return res.status(503).json({
        error: 'AI query not configured. Set ANTHROPIC_API_KEY in .env.',
      });
    }

    const { query } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }

    // Build a schema description from the SOURCE_FIELDS allowlist
    const schemaDescription = Object.entries(SOURCE_FIELDS)
      .map(([tbl, fields]) => `${tbl}: ${fields.join(', ')}`)
      .join('\n');

    const systemPrompt = `You are a report configuration assistant for an insurance brokerage CRM. Given a natural language query, return a JSON configuration object for a custom report.

The database has the following tables and fields:
${schemaDescription}

Valid operators for filters: equals, not_equals, contains, is_empty, is_not_empty, greater_than, less_than, between, is_one_of.

Return ONLY valid JSON (no markdown, no explanation) with these keys:
{
  "source": "<table_name>",
  "columns": ["field1", "field2"],
  "filters": [{ "field": "field_name", "operator": "equals", "value": "some_value" }],
  "joins": [{ "module": "join_alias", "fields": ["field1"] }],
  "sort_field": "field_name",
  "sort_dir": "asc",
  "group_by": "field_name"
}

Omit keys you don't need. If you cannot confidently map the request to a valid configuration, return:
{ "clarification_needed": true, "question": "your clarifying question" }`;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: query.trim() }],
    });

    const rawText = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let parsed;
    try {
      // Strip any accidental markdown code fences
      const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        error: 'AI returned an invalid JSON response.',
        raw: rawText.slice(0, 500),
      });
    }

    if (parsed.clarification_needed) {
      return res.json({ clarification_needed: true, question: parsed.question });
    }

    res.json({ config: parsed });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 8. Saved Reports CRUD
// ============================================================

// GET /saved — list saved reports (own + shared)
router.get('/saved', (req, res, next) => {
  try {
    const db     = getDb();
    const userId = req.session.userId;
    const rows   = db.prepare(`
      SELECT
        sr.*,
        u.full_name AS creator_name
      FROM saved_reports sr
      LEFT JOIN users u ON sr.creator_id = u.id
      WHERE sr.creator_id = ? OR sr.shared = 1
      ORDER BY sr.updated_at DESC
    `).all(userId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /saved — save a report config
router.post('/saved', (req, res, next) => {
  try {
    const db     = getDb();
    const userId = req.session.userId;
    const { name, description, config, shared, report_type, predefined_key } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!config) {
      return res.status(400).json({ error: 'config is required' });
    }
    const validTypes = ['predefined', 'custom'];
    const safeType = validTypes.includes(report_type) ? report_type : 'custom';

    const configStr = typeof config === 'string' ? config : JSON.stringify(config);

    const result = db.prepare(`
      INSERT INTO saved_reports (name, description, creator_id, config, shared, report_type, predefined_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      name.trim(),
      description || null,
      userId,
      configStr,
      shared ? 1 : 0,
      safeType,
      predefined_key || null,
    );

    const created = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// PUT /saved/:id — update (own reports or admin)
router.put('/saved/:id', (req, res, next) => {
  try {
    const db     = getDb();
    const userId = req.session.userId;
    const userRole = req.session.userRole;
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Saved report not found' });
    }
    if (existing.creator_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to update this report' });
    }

    const { name, description, config, shared, report_type, predefined_key } = req.body || {};
    const validTypes = ['predefined', 'custom'];
    const safeType = report_type && validTypes.includes(report_type) ? report_type : existing.report_type;
    const configStr = config
      ? (typeof config === 'string' ? config : JSON.stringify(config))
      : existing.config;

    db.prepare(`
      UPDATE saved_reports SET
        name = ?,
        description = ?,
        config = ?,
        shared = ?,
        report_type = ?,
        predefined_key = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      description !== undefined ? (description || null) : existing.description,
      configStr,
      shared !== undefined ? (shared ? 1 : 0) : existing.shared,
      safeType,
      predefined_key !== undefined ? (predefined_key || null) : existing.predefined_key,
      id,
    );

    const updated = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /saved/:id — delete (own or admin)
router.delete('/saved/:id', (req, res, next) => {
  try {
    const db       = getDb();
    const userId   = req.session.userId;
    const userRole = req.session.userRole;
    const { id }   = req.params;

    const existing = db.prepare('SELECT * FROM saved_reports WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Saved report not found' });
    }
    if (existing.creator_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'You do not have permission to delete this report' });
    }

    db.prepare('DELETE FROM saved_reports WHERE id = ?').run(id);
    res.json({ success: true, id: Number(id) });
  } catch (err) {
    next(err);
  }
});

// POST /saved/:id/run — run a saved report
router.post('/saved/:id/run', (req, res, next) => {
  try {
    const db     = getDb();
    const userId = req.session.userId;
    const { id } = req.params;

    const saved = db.prepare(`
      SELECT * FROM saved_reports WHERE id = ? AND (creator_id = ? OR shared = 1)
    `).get(id, userId);

    if (!saved) {
      return res.status(404).json({ error: 'Saved report not found or not accessible' });
    }

    let config;
    try {
      config = typeof saved.config === 'string' ? JSON.parse(saved.config) : saved.config;
    } catch {
      return res.status(422).json({ error: 'Saved report has invalid config JSON' });
    }

    if (saved.report_type === 'predefined') {
      const key = saved.predefined_key || config.key;
      const validKeys = PREDEFINED_REPORTS.map((r) => r.key);
      if (!validKeys.includes(key)) {
        return res.status(422).json({ error: `Invalid predefined report key: ${key}` });
      }
      const overrides = req.body || {};
      const { date_from, date_to, broker_id } = { ...config, ...overrides };
      // Broker isolation: force broker_id for broker users
      const scopedBrokerId = getBrokerId(req);
      const effectiveBrokerId = scopedBrokerId || broker_id;
      const data = runPredefinedQuery(key, { date_from, date_to, broker_id: effectiveBrokerId });
      return res.json({
        key,
        name: saved.name,
        data,
        count: data.length,
        generated_at: new Date().toISOString(),
        filters_applied: { date_from, date_to, broker_id },
      });
    }

    // Custom report
    const mergedConfig = injectBrokerFilter({ ...config, ...(req.body || {}) }, req);
    const { dataSql, countSql, params, columns, safeLimit, safePage } = buildCustomQuery(mergedConfig);

    const rows    = db.prepare(dataSql).all(...params, safeLimit, (safePage - 1) * safeLimit);
    const { total } = db.prepare(countSql).get(...params);

    res.json({
      data: rows,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
      columns_used: columns,
      source: mergedConfig.source,
      saved_report_name: saved.name,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err.message && (err.message.startsWith('Invalid') || err.message.startsWith('Unknown'))) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
