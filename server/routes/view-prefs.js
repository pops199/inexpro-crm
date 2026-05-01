/* ═══════════════════════════════════════════════════════════════════════════
   View Preferences — per-user column and sort config for list views
   ═══════════════════════════════════════════════════════════════════════════
   Endpoints:
     GET    /api/view-prefs/:module      → { catalog, config, source }
     PUT    /api/view-prefs/:module      → save the user's prefs for this module
     DELETE /api/view-prefs/:module      → reset the user to the module default

   The server is the source of truth for:
     - which columns each module exposes (id, label, default visibility, order)
     - which columns may be used for sorting (server-side allowlist)
     - the default layout (what a fresh user sees)

   The client reads the catalog and only renders columns it knows about.
   ═══════════════════════════════════════════════════════════════════════════ */

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

/* ───────────────────── Module registry ─────────────────────
   For each module:
     columns : ordered list of { id, label, sortable, defaultVisible }
               (client maps id → its own cell renderer)
     sortAllowlist : whitelist of sort keys the server honours.
                     Each entry maps the public id to a safe SQL expression.
     defaultSort   : [column, direction]
   ─────────────────────────────────────────────────────────── */

const MODULES = {
  /* ───────────────────────── WORKFLOWS ───────────────────────── */
  workflows: {
    label: 'Workflows',
    columns: [
      { id: 'description',    label: 'Description',         sortable: true,  defaultVisible: true  },
      { id: 'due_date',       label: 'Due Date',            sortable: true,  defaultVisible: true  },
      { id: 'status',         label: 'Status',              sortable: true,  defaultVisible: true  },
      { id: 'broker_name',    label: 'Responsible',         sortable: true,  defaultVisible: true  },
      { id: 'contact_name',   label: 'Contact',             sortable: true,  defaultVisible: true  },
      { id: 'account_name',   label: 'Account',             sortable: true,  defaultVisible: true  },
      { id: 'policy_name',    label: 'Policy',              sortable: true,  defaultVisible: true  },
      { id: 'policy_number',  label: 'Policy Number',       sortable: true,  defaultVisible: false },
      { id: 'asset_name',     label: 'Asset',               sortable: true,  defaultVisible: true  },
      { id: 'claim_number',   label: 'Claim #',             sortable: true,  defaultVisible: true  },
      { id: 'notes',          label: 'Notes (preview)',     sortable: false, defaultVisible: false },
      { id: 'created_at',     label: 'Created',             sortable: true,  defaultVisible: false },
      { id: 'updated_at',     label: 'Last Updated',        sortable: true,  defaultVisible: false },
    ],
    sortAllowlist: {
      description:   'w.description',
      due_date:      "COALESCE(w.due_date, '9999-12-31')",
      status:        'w.status',
      broker_name:   'u.full_name',
      contact_name:  '(c.first_name || \' \' || c.last_name)',
      account_name:  'a.account_name',
      policy_name:   'p.policy_name',
      policy_number: 'p.policy_number',
      asset_name:    's.asset_name',
      claim_number:  'cl.claim_number',
      created_at:    'w.created_at',
      updated_at:    'w.updated_at',
    },
    defaultSort: { sortBy: 'due_date', sortDir: 'asc' },
  },

  /* ───────────────────────── CONTACTS ───────────────────────── */
  contacts: {
    label: 'Contacts',
    columns: [
      { id: 'name',              label: 'Name',              sortable: true,  defaultVisible: true  },
      { id: 'contact_type',      label: 'Type',              sortable: true,  defaultVisible: true  },
      { id: 'client_category',   label: 'Category',          sortable: true,  defaultVisible: true  },
      { id: 'client_segment',    label: 'Segment',           sortable: true,  defaultVisible: false },
      { id: 'contact_status',    label: 'Status',            sortable: true,  defaultVisible: true  },
      { id: 'email',             label: 'Email',             sortable: true,  defaultVisible: false },
      { id: 'mobile',            label: 'Mobile',            sortable: false, defaultVisible: false },
      { id: 'popia',             label: 'POPIA',             sortable: true,  defaultVisible: true  },
      { id: 'fica_status',       label: 'FICA',              sortable: true,  defaultVisible: true  },
      { id: 'conduct_risk_flag', label: 'Conduct Flag',      sortable: true,  defaultVisible: false },
      { id: 'broker_full_name',  label: 'Broker',            sortable: true,  defaultVisible: true  },
      { id: 'source_of_lead',    label: 'Lead Source',       sortable: true,  defaultVisible: false },
      { id: 'last_review_date',  label: 'Last Review',       sortable: true,  defaultVisible: false },
      { id: 'next_review_date',  label: 'Next Review',       sortable: true,  defaultVisible: false },
      { id: 'created_at',        label: 'Assigned',          sortable: true,  defaultVisible: true  },
      { id: 'updated_at',        label: 'Last Updated',      sortable: true,  defaultVisible: false },
      { id: 'actions',           label: 'Actions',           sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      name:              'c.last_name',
      contact_type:      'c.contact_type',
      client_category:   'c.client_category',
      client_segment:    'c.client_segment',
      contact_status:    'c.contact_status',
      email:             'c.email',
      popia:             'c.popia_consent_obtained',
      fica_status:       'c.fica_status',
      conduct_risk_flag: 'c.conduct_risk_flag',
      broker_full_name:  'b.full_name',
      source_of_lead:    'c.source_of_lead',
      last_review_date:  'c.last_review_date',
      next_review_date:  'c.next_review_date',
      created_at:        'c.created_at',
      updated_at:        'c.updated_at',
    },
    defaultSort: { sortBy: 'name', sortDir: 'asc' },
  },

  /* ───────────────────────── ACCOUNTS ───────────────────────── */
  accounts: {
    label: 'Accounts',
    columns: [
      { id: 'account_name',      label: 'Account Name',      sortable: true,  defaultVisible: true  },
      { id: 'business_type',     label: 'Type',              sortable: true,  defaultVisible: true  },
      { id: 'industry',          label: 'Industry',          sortable: true,  defaultVisible: true  },
      { id: 'client_status',     label: 'Status',            sortable: true,  defaultVisible: true  },
      { id: 'popia',             label: 'POPIA',             sortable: true,  defaultVisible: true  },
      { id: 'fica_status',       label: 'FICA',              sortable: true,  defaultVisible: true  },
      { id: 'registration_number', label: 'Reg Number',      sortable: true,  defaultVisible: false },
      { id: 'vat_number',        label: 'VAT Number',        sortable: true,  defaultVisible: false },
      { id: 'annual_turnover_band', label: 'Turnover',        sortable: true,  defaultVisible: false },
      { id: 'number_of_employees',  label: 'Employees',      sortable: true,  defaultVisible: false },
      { id: 'main_contact_name', label: 'Main Contact',      sortable: true,  defaultVisible: true  },
      { id: 'broker_full_name',  label: 'Broker',            sortable: true,  defaultVisible: true  },
      { id: 'last_review_date',  label: 'Last Review',       sortable: true,  defaultVisible: false },
      { id: 'next_review_date',  label: 'Next Review',       sortable: true,  defaultVisible: false },
      { id: 'created_at',        label: 'Created',           sortable: true,  defaultVisible: false },
      { id: 'updated_at',        label: 'Last Updated',      sortable: true,  defaultVisible: false },
      { id: 'actions',           label: 'Actions',           sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      account_name:         'a.account_name',
      business_type:        'a.business_type',
      industry:             'a.industry',
      client_status:        'a.client_status',
      popia:                'a.popia_consent_obtained',
      fica_status:          'a.fica_status',
      registration_number:  'a.registration_number',
      vat_number:           'a.vat_number',
      annual_turnover_band: 'a.annual_turnover_band',
      number_of_employees:  'a.number_of_employees',
      main_contact_name:    '(c.first_name || \' \' || c.last_name)',
      broker_full_name:     'b.full_name',
      last_review_date:     'a.last_review_date',
      next_review_date:     'a.next_review_date',
      created_at:           'a.created_at',
      updated_at:           'a.updated_at',
    },
    defaultSort: { sortBy: 'account_name', sortDir: 'asc' },
  },

  /* ─────────────────────── ENGAGEMENTS ─────────────────────── */
  engagements: {
    label: 'Client Engagements',
    columns: [
      { id: 'engagement_name',  label: 'Name',             sortable: true,  defaultVisible: true  },
      { id: 'party_name',       label: 'Contact / Account', sortable: true, defaultVisible: true  },
      { id: 'engagement_type',  label: 'Type',             sortable: true,  defaultVisible: true  },
      { id: 'stage',            label: 'Stage',            sortable: true,  defaultVisible: true  },
      { id: 'risk_priority',    label: 'Risk Priority',    sortable: true,  defaultVisible: false },
      { id: 'source_of_lead',   label: 'Lead Source',      sortable: true,  defaultVisible: false },
      { id: 'current_insurer',  label: 'Current Insurer',  sortable: true,  defaultVisible: false },
      { id: 'current_premium',  label: 'Current Premium',  sortable: true,  defaultVisible: false },
      { id: 'expected_premium', label: 'Expected Premium', sortable: true,  defaultVisible: false },
      { id: 'inception_date',   label: 'Inception',        sortable: true,  defaultVisible: false },
      { id: 'client_decision',  label: 'Client Decision',  sortable: true,  defaultVisible: false },
      { id: 'broker_name',      label: 'Broker',           sortable: true,  defaultVisible: true  },
      { id: 'created_at',       label: 'Created',          sortable: true,  defaultVisible: true  },
      { id: 'updated_at',       label: 'Last Updated',     sortable: true,  defaultVisible: false },
      { id: 'actions',          label: 'Actions',          sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      engagement_name:  'ce.engagement_name',
      party_name:       'COALESCE((c.first_name || \' \' || c.last_name), a.account_name)',
      engagement_type:  'ce.engagement_type',
      stage:            'ce.stage',
      risk_priority:    'ce.risk_priority',
      source_of_lead:   'ce.source_of_lead',
      current_insurer:  'ce.current_insurer',
      current_premium:  'ce.current_premium',
      expected_premium: 'ce.expected_premium',
      inception_date:   'ce.inception_date',
      client_decision:  'ce.client_decision',
      broker_name:      'b.full_name',
      created_at:       'ce.created_at',
      updated_at:       'ce.updated_at',
    },
    defaultSort: { sortBy: 'updated_at', sortDir: 'desc' },
  },

  /* ───────────────────────── POLICIES ───────────────────────── */
  policies: {
    label: 'Policies',
    columns: [
      { id: 'policy_name',    label: 'Policy Name',     sortable: true,  defaultVisible: true  },
      { id: 'policy_number',  label: 'Policy Number',   sortable: true,  defaultVisible: true  },
      { id: 'insurer',        label: 'Insurer',         sortable: true,  defaultVisible: true  },
      { id: 'product_category', label: 'Product',       sortable: true,  defaultVisible: false },
      { id: 'policy_type',    label: 'Type',            sortable: true,  defaultVisible: true  },
      { id: 'policy_status',  label: 'Status',          sortable: true,  defaultVisible: true  },
      { id: 'inception_date', label: 'Inception',       sortable: true,  defaultVisible: true  },
      { id: 'renewal_date',   label: 'Renewal',         sortable: true,  defaultVisible: true  },
      { id: 'premium',        label: 'Premium',         sortable: true,  defaultVisible: true  },
      { id: 'party_name',     label: 'Contact / Account', sortable: true, defaultVisible: false },
      { id: 'broker_name',    label: 'Broker',          sortable: true,  defaultVisible: true  },
      { id: 'claims_count',   label: 'Claims',          sortable: true,  defaultVisible: false },
      { id: 'last_review_date', label: 'Last Review',   sortable: true,  defaultVisible: false },
      { id: 'next_review_date', label: 'Next Review',   sortable: true,  defaultVisible: false },
      { id: 'created_at',     label: 'Created',         sortable: true,  defaultVisible: false },
      { id: 'updated_at',     label: 'Last Updated',    sortable: true,  defaultVisible: false },
      { id: 'actions',        label: 'Actions',         sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      policy_name:      'p.policy_name',
      policy_number:    'p.policy_number',
      insurer:          'p.insurer',
      product_category: 'p.product_category',
      policy_type:      'p.policy_type',
      policy_status:    'p.policy_status',
      inception_date:   'p.inception_date',
      renewal_date:     "COALESCE(p.renewal_date, '9999-12-31')",
      premium:          'p.premium',
      party_name:       'COALESCE((c.first_name || \' \' || c.last_name), a.account_name)',
      broker_name:      'b.full_name',
      claims_count:     'p.claims_count',
      last_review_date: 'p.last_review_date',
      next_review_date: 'p.next_review_date',
      created_at:       'p.created_at',
      updated_at:       'p.updated_at',
    },
    defaultSort: { sortBy: 'updated_at', sortDir: 'desc' },
  },

  /* ───────────────────────── ASSETS ───────────────────────── */
  assets: {
    label: 'Assets',
    columns: [
      { id: 'asset_name',      label: 'Asset Name',       sortable: true,  defaultVisible: true  },
      { id: 'asset_type',      label: 'Type',             sortable: true,  defaultVisible: true  },
      { id: 'asset_section',   label: 'Section',          sortable: true,  defaultVisible: false },
      { id: 'make_model_year', label: 'Make / Model / Year', sortable: false, defaultVisible: true },
      { id: 'registration_number', label: 'Reg Number',   sortable: true,  defaultVisible: true  },
      { id: 'vin_number',      label: 'VIN',              sortable: true,  defaultVisible: false },
      { id: 'serial_number',   label: 'Serial Number',    sortable: true,  defaultVisible: false },
      { id: 'item_number',     label: 'Item Number',      sortable: true,  defaultVisible: false },
      { id: 'fleet_number',    label: 'Fleet Number',     sortable: true,  defaultVisible: false },
      { id: 'asset_status',    label: 'Status',           sortable: true,  defaultVisible: true  },
      { id: 'asset_value',     label: 'Value',            sortable: true,  defaultVisible: false },
      { id: 'sum_insured',     label: 'Sum Insured',      sortable: true,  defaultVisible: false },
      { id: 'premium',         label: 'Premium',          sortable: true,  defaultVisible: false },
      { id: 'party_name',      label: 'Contact / Account', sortable: true, defaultVisible: true  },
      { id: 'policy_name',     label: 'Policy',           sortable: true,  defaultVisible: false },
      { id: 'policy_section_name', label: 'Policy Section', sortable: true, defaultVisible: false },
      { id: 'date_acquired',   label: 'Acquired',         sortable: true,  defaultVisible: false },
      { id: 'created_at',      label: 'Created',          sortable: true,  defaultVisible: false },
      { id: 'updated_at',      label: 'Last Updated',     sortable: true,  defaultVisible: false },
      { id: 'actions',         label: 'Actions',          sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      asset_name:          'a.asset_name',
      asset_type:          'a.asset_type',
      asset_section:       'a.asset_section',
      registration_number: 'a.registration_number',
      vin_number:          'a.vin_number',
      serial_number:       'a.serial_number',
      item_number:         'a.item_number',
      fleet_number:        'a.fleet_number',
      asset_status:        'a.asset_status',
      asset_value:         'a.asset_value',
      sum_insured:         'a.sum_insured',
      premium:             'a.premium',
      party_name:          'COALESCE((c.first_name || \' \' || c.last_name), ac.account_name)',
      policy_name:         'p.policy_name',
      policy_section_name: 'ps.section_name',
      date_acquired:       'a.date_acquired',
      created_at:          'a.created_at',
      updated_at:          'a.updated_at',
    },
    defaultSort: { sortBy: 'asset_type', sortDir: 'asc' },
  },

  /* ─────────────────────── RISK DETAILS ─────────────────────── */
  risk_details: {
    label: 'Risk Details',
    columns: [
      { id: 'risk_detail_name',   label: 'Name',              sortable: true,  defaultVisible: true  },
      { id: 'risk_type',          label: 'Risk Type',         sortable: true,  defaultVisible: true  },
      { id: 'policy_section_name', label: 'Policy Section',   sortable: true,  defaultVisible: true  },
      { id: 'asset_name',         label: 'Asset',             sortable: true,  defaultVisible: true  },
      { id: 'construction_type',  label: 'Construction',      sortable: true,  defaultVisible: false },
      { id: 'flood_exposure',     label: 'Flood Exposure',    sortable: true,  defaultVisible: false },
      { id: 'fire_exposure',      label: 'Fire Exposure',     sortable: true,  defaultVisible: false },
      { id: 'tracking_device_fitted', label: 'Tracking',      sortable: true,  defaultVisible: false },
      { id: 'maximum_exposure_value', label: 'Max Exposure',  sortable: true,  defaultVisible: false },
      { id: 'party_name',         label: 'Contact / Account', sortable: true,  defaultVisible: false },
      { id: 'policy_name',        label: 'Policy',            sortable: true,  defaultVisible: false },
      { id: 'last_updated',       label: 'Last Updated',      sortable: true,  defaultVisible: true  },
      { id: 'created_at',         label: 'Created',           sortable: true,  defaultVisible: false },
      { id: 'actions',            label: 'Actions',           sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      risk_detail_name:       'rd.risk_detail_name',
      risk_type:              'rd.risk_type',
      policy_section_name:    'ps.section_name',
      asset_name:             'a.asset_name',
      construction_type:      'rd.construction_type',
      flood_exposure:         'rd.flood_exposure',
      fire_exposure:          'rd.fire_exposure',
      tracking_device_fitted: 'rd.tracking_device_fitted',
      maximum_exposure_value: 'rd.maximum_exposure_value',
      party_name:             'COALESCE((c.first_name || \' \' || c.last_name), ac.account_name)',
      policy_name:            'p.policy_name',
      last_updated:           "COALESCE(rd.last_updated, rd.updated_at)",
      created_at:             'rd.created_at',
    },
    defaultSort: { sortBy: 'created_at', sortDir: 'desc' },
  },

  /* ───────────────────────── CLAIMS ───────────────────────── */
  claims: {
    label: 'Claims',
    columns: [
      { id: 'claim_number',     label: 'Claim Number',      sortable: true,  defaultVisible: true  },
      { id: 'policy_name',      label: 'Policy',            sortable: true,  defaultVisible: true  },
      { id: 'party_name',       label: 'Contact / Account', sortable: true,  defaultVisible: true  },
      { id: 'claim_type',       label: 'Type',              sortable: true,  defaultVisible: true  },
      { id: 'claim_status',     label: 'Status',            sortable: true,  defaultVisible: true  },
      { id: 'claim_date',       label: 'Claim Date',        sortable: true,  defaultVisible: true  },
      { id: 'date_reported',    label: 'Reported',          sortable: true,  defaultVisible: false },
      { id: 'estimated_value',  label: 'Est. Value',        sortable: true,  defaultVisible: true  },
      { id: 'settlement_amount', label: 'Settlement',       sortable: true,  defaultVisible: false },
      { id: 'delay_flag',       label: 'Delay',             sortable: true,  defaultVisible: true  },
      { id: 'fair_process_concern', label: 'Fair Process',  sortable: true,  defaultVisible: false },
      { id: 'dispute_raised',   label: 'Disputed',          sortable: true,  defaultVisible: false },
      { id: 'client_kept_informed', label: 'Client Updated', sortable: true, defaultVisible: false },
      { id: 'broker_name',      label: 'Broker',            sortable: true,  defaultVisible: false },
      { id: 'claims_handler_name', label: 'Claims Handler', sortable: true,  defaultVisible: false },
      { id: 'last_client_update_date', label: 'Last Client Update', sortable: true, defaultVisible: false },
      { id: 'created_at',       label: 'Created',           sortable: true,  defaultVisible: false },
      { id: 'updated_at',       label: 'Last Updated',      sortable: true,  defaultVisible: false },
      { id: 'actions',          label: 'Actions',           sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      claim_number:           'cl.claim_number',
      policy_name:            'p.policy_name',
      party_name:             'COALESCE((c.first_name || \' \' || c.last_name), ac.account_name)',
      claim_type:             'cl.claim_type',
      claim_status:           'cl.claim_status',
      claim_date:             'cl.claim_date',
      date_reported:          'cl.date_reported',
      estimated_value:        'cl.estimated_value',
      settlement_amount:      'cl.settlement_amount',
      delay_flag:             'cl.delay_flag',
      fair_process_concern:   'cl.fair_process_concern',
      dispute_raised:         'cl.dispute_raised',
      client_kept_informed:   'cl.client_kept_informed',
      broker_name:            'b.full_name',
      claims_handler_name:    'COALESCE(cl.claims_handler_name, ha.full_name)',
      last_client_update_date: 'cl.last_client_update_date',
      created_at:             'cl.created_at',
      updated_at:             'cl.updated_at',
    },
    defaultSort: { sortBy: 'created_at', sortDir: 'desc' },
  },

  /* ─────────────────────── ADVICE RECORDS ─────────────────────── */
  advice_records: {
    label: 'Records of Advice',
    columns: [
      { id: 'advice_record_number', label: 'Number',        sortable: true,  defaultVisible: true  },
      { id: 'advice_date',         label: 'Date',           sortable: true,  defaultVisible: true  },
      { id: 'contact_name',        label: 'Contact / Account', sortable: true, defaultVisible: true  },
      { id: 'policy_name',         label: 'Policy',         sortable: true,  defaultVisible: false },
      { id: 'advice_type',         label: 'Type',           sortable: true,  defaultVisible: true  },
      { id: 'trigger_event',       label: 'Trigger',        sortable: true,  defaultVisible: false },
      { id: 'client_decision',     label: 'Client Decision', sortable: true, defaultVisible: true  },
      { id: 'decision_date',       label: 'Decision Date',  sortable: true,  defaultVisible: false },
      { id: 'roa_generated',       label: 'RoA Issued',     sortable: true,  defaultVisible: false },
      { id: 'issue_date',          label: 'Issue Date',     sortable: true,  defaultVisible: false },
      { id: 'client_acknowledgement_received', label: 'Ack Received', sortable: true, defaultVisible: false },
      { id: 'broker_name',         label: 'Broker',         sortable: true,  defaultVisible: true  },
      { id: 'prepared_by_name',    label: 'Prepared By',    sortable: true,  defaultVisible: false },
      { id: 'created_at',          label: 'Created',        sortable: true,  defaultVisible: false },
      { id: 'updated_at',          label: 'Last Updated',   sortable: true,  defaultVisible: false },
      { id: 'actions',             label: 'Actions',        sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      advice_record_number:           'ar.advice_record_number',
      advice_date:                    'ar.advice_date',
      contact_name:                   "COALESCE(c.first_name || ' ' || c.last_name, a.account_name)",
      policy_name:                    'p.policy_name',
      advice_type:                    'ar.advice_type',
      trigger_event:                  'ar.trigger_event',
      client_decision:                'ar.client_decision',
      decision_date:                  'ar.decision_date',
      roa_generated:                  'ar.roa_generated',
      issue_date:                     'ar.issue_date',
      client_acknowledgement_received: 'ar.client_acknowledgement_received',
      broker_name:                    'b.full_name',
      prepared_by_name:               'pb.full_name',
      created_at:                     'ar.created_at',
      updated_at:                     'ar.updated_at',
    },
    defaultSort: { sortBy: 'advice_date', sortDir: 'desc' },
  },

  /* ───────────────────────── BROKER PROFILES ───────────────────────── */
  broker_profiles: {
    label: 'Broker Profiles',
    columns: [
      { id: 'full_name',                 label: 'Broker',             sortable: true,  defaultVisible: true  },
      { id: 'fsca_registration_number',  label: 'FSCA #',             sortable: true,  defaultVisible: true  },
      { id: 'appointment_date',          label: 'Appointed',          sortable: true,  defaultVisible: true  },
      { id: 're1_status',                label: 'RE1',                sortable: true,  defaultVisible: false },
      { id: 're5_status',                label: 'RE5',                sortable: true,  defaultVisible: true  },
      { id: 're5_deadline',              label: 'RE5 Deadline',       sortable: true,  defaultVisible: true  },
      { id: 'qualification_nqf_level',   label: 'NQF Level',          sortable: true,  defaultVisible: false },
      { id: 'cpd_points_current',        label: 'CPD Points',         sortable: false, defaultVisible: true  },
      { id: 'good_standing_status',      label: 'Good Standing',      sortable: true,  defaultVisible: true  },
      { id: 'insolvency_flag',           label: 'Insolvency',         sortable: true,  defaultVisible: false },
      { id: 'updated_at',                label: 'Last Updated',       sortable: true,  defaultVisible: false },
      { id: 'actions',                   label: 'Actions',            sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      full_name:                'u.full_name',
      fsca_registration_number: 'bp.fsca_registration_number',
      appointment_date:         'bp.appointment_date',
      re1_status:               'bp.re1_status',
      re5_status:               'bp.re5_status',
      re5_deadline:             'bp.re5_deadline',
      qualification_nqf_level:  'bp.qualification_nqf_level',
      good_standing_status:     'bp.good_standing_status',
      insolvency_flag:          'bp.insolvency_flag',
      updated_at:               'bp.updated_at',
    },
    defaultSort: { sortBy: 'full_name', sortDir: 'asc' },
  },

  /* ───────────────────────── PRODUCTS ───────────────────────── */
  products: {
    label: 'Product Library',
    columns: [
      { id: 'product_code',         label: 'Code',           sortable: true,  defaultVisible: true  },
      { id: 'product_name',         label: 'Name',           sortable: true,  defaultVisible: true  },
      { id: 'insurer',              label: 'Insurer',        sortable: true,  defaultVisible: true  },
      { id: 'product_category',     label: 'Category',       sortable: true,  defaultVisible: true  },
      { id: 'product_status',       label: 'Status',         sortable: true,  defaultVisible: true  },
      { id: 'min_insurable_value',  label: 'Min Value',      sortable: true,  defaultVisible: false },
      { id: 'max_insurable_value',  label: 'Max Value',      sortable: true,  defaultVisible: false },
      { id: 'geographic_scope',     label: 'Geography',      sortable: true,  defaultVisible: false },
      { id: 'last_review_date',     label: 'Last Review',    sortable: true,  defaultVisible: true  },
      { id: 'reviewed_by_name',     label: 'Reviewed By',    sortable: true,  defaultVisible: false },
      { id: 'updated_at',           label: 'Last Updated',   sortable: true,  defaultVisible: false },
      { id: 'actions',              label: 'Actions',        sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      product_code:        'p.product_code',
      product_name:        'p.product_name',
      insurer:             'p.insurer',
      product_category:    'p.product_category',
      product_status:      'p.product_status',
      min_insurable_value: 'p.min_insurable_value',
      max_insurable_value: 'p.max_insurable_value',
      geographic_scope:    'p.geographic_scope',
      last_review_date:    'p.last_review_date',
      reviewed_by_name:    'u.full_name',
      updated_at:          'p.updated_at',
    },
    defaultSort: { sortBy: 'product_category', sortDir: 'asc' },
  },

  /* ───────────────────────── POPIA ───────────────────────── */
  popia: {
    label: 'POPIA',
    columns: [
      { id: 'name',                     label: 'Contact',              sortable: false, defaultVisible: true  },
      { id: 'status_badge',             label: 'Status',               sortable: false, defaultVisible: true  },
      { id: 'data_processing_basis',    label: 'Processing Basis',     sortable: false, defaultVisible: true  },
      { id: 'popia_consent_date',       label: 'Consent Date',         sortable: false, defaultVisible: true  },
      { id: 'consent_method',           label: 'Consent Method',       sortable: false, defaultVisible: false },
      { id: 'information_officer_name', label: 'Information Officer',  sortable: false, defaultVisible: true  },
      { id: 'retention_expiry_date',    label: 'Retention Expires',    sortable: false, defaultVisible: true  },
      { id: 'direct_marketing_consent', label: 'Direct Marketing',     sortable: false, defaultVisible: false },
      { id: 'third_party_sharing',      label: '3rd Party Sharing',    sortable: false, defaultVisible: false },
      { id: 'privacy_notice_provided',  label: 'Privacy Notice',       sortable: false, defaultVisible: false },
      { id: 'data_source',              label: 'Data Source',          sortable: false, defaultVisible: false },
      { id: 'email',                    label: 'Email',                sortable: false, defaultVisible: false },
      { id: 'mobile',                   label: 'Mobile',               sortable: false, defaultVisible: false },
      { id: 'actions',                  label: 'Actions',              sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {},
    defaultSort: { sortBy: 'name', sortDir: 'asc' },
  },

  /* ───────────────────────── FICA ───────────────────────── */
  fica: {
    label: 'FICA',
    columns: [
      { id: 'name',                            label: 'Contact',           sortable: false, defaultVisible: true  },
      { id: 'derived_status',                  label: 'Status',            sortable: false, defaultVisible: true  },
      { id: 'fica_verification_date',          label: 'Verification Date', sortable: false, defaultVisible: true  },
      { id: 'fica_verification_method',        label: 'Method',            sortable: false, defaultVisible: true  },
      { id: 'fica_verified_by_name',           label: 'Verified By',       sortable: false, defaultVisible: true  },
      { id: 'fica_five_year_expiry',           label: '5-Year Expiry',     sortable: false, defaultVisible: true  },
      { id: 'fica_pep_check',                  label: 'PEP Check',         sortable: false, defaultVisible: true  },
      { id: 'fica_document_reference',         label: 'Document Ref',      sortable: false, defaultVisible: false },
      { id: 'fica_cipc_number',                label: 'CIPC Number',       sortable: false, defaultVisible: false },
      { id: 'fica_beneficial_owner_confirmed', label: 'Beneficial Owner',  sortable: false, defaultVisible: false },
      { id: 'fica_pep_check_date',             label: 'PEP Check Date',    sortable: false, defaultVisible: false },
      { id: 'sa_id_number',                    label: 'SA ID Number',      sortable: false, defaultVisible: false },
      { id: 'email',                           label: 'Email',             sortable: false, defaultVisible: false },
      { id: 'actions',                         label: 'Actions',           sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {},
    defaultSort: { sortBy: 'name', sortDir: 'asc' },
  },

  /* ───────────────────────── COMPLAINTS ───────────────────────── */
  complaints: {
    label: 'Complaints',
    columns: [
      { id: 'complaint_number',     label: 'Complaint #',   sortable: false, defaultVisible: true  },
      { id: 'contact_name',         label: 'Contact',       sortable: false, defaultVisible: true  },
      { id: 'account_name',         label: 'Account',       sortable: false, defaultVisible: true  },
      { id: 'complaint_category',   label: 'Category',      sortable: false, defaultVisible: true  },
      { id: 'complaint_status',     label: 'Status',        sortable: false, defaultVisible: true  },
      { id: 'complaint_date',       label: 'Date',          sortable: false, defaultVisible: true  },
      { id: 'assigned_to_name',     label: 'Assigned To',   sortable: false, defaultVisible: true  },
      { id: 'severity_rating',      label: 'Severity',      sortable: false, defaultVisible: false },
      { id: 'broker_name',          label: 'Broker',        sortable: false, defaultVisible: false },
      { id: 'complaint_owner_name', label: 'Owner',         sortable: false, defaultVisible: false },
      { id: 'days_open',            label: 'Days Open',     sortable: false, defaultVisible: false },
      { id: 'policy_number',        label: 'Policy',        sortable: false, defaultVisible: false },
      { id: 'actions',              label: 'Actions',       sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {},
    defaultSort: { sortBy: 'complaint_date', sortDir: 'desc' },
  },

  /* ───────────────────────── DATA BREACHES ───────────────────────── */
  data_breaches: {
    label: 'Data Breach Log',
    columns: [
      { id: 'breach_date',                    label: 'Breach Date',       sortable: true,  defaultVisible: true  },
      { id: 'discovered_date',                label: 'Discovered',        sortable: true,  defaultVisible: true  },
      { id: 'nature',                         label: 'Nature',            sortable: true,  defaultVisible: true  },
      { id: 'status',                         label: 'Status',            sortable: true,  defaultVisible: true  },
      { id: 'information_regulator_notified', label: 'Regulator Notified', sortable: true, defaultVisible: true  },
      { id: 'regulator_notified_date',        label: 'Regulator Date',    sortable: true,  defaultVisible: false },
      { id: 'data_subjects_notified',         label: 'Subjects Notified', sortable: true,  defaultVisible: true  },
      { id: 'logged_by_name',                 label: 'Logged By',         sortable: true,  defaultVisible: false },
      { id: 'created_at',                     label: 'Logged At',         sortable: true,  defaultVisible: false },
      { id: 'actions',                        label: 'Actions',           sortable: false, defaultVisible: true  },
    ],
    sortAllowlist: {
      breach_date:                    'b.breach_date',
      discovered_date:                'b.discovered_date',
      nature:                         'b.nature',
      status:                         'b.status',
      information_regulator_notified: 'b.information_regulator_notified',
      regulator_notified_date:        'b.regulator_notified_date',
      data_subjects_notified:         'b.data_subjects_notified',
      logged_by_name:                 'u.full_name',
      created_at:                     'b.created_at',
    },
    defaultSort: { sortBy: 'breach_date', sortDir: 'desc' },
  },
};

function getModule(name) {
  return Object.prototype.hasOwnProperty.call(MODULES, name) ? MODULES[name] : null;
}

/* ───────── Config shape helpers ───────── */

function defaultConfigFor(mod) {
  return {
    columns: mod.columns.map(c => ({ id: c.id, visible: !!c.defaultVisible })),
    sortBy:  mod.defaultSort.sortBy,
    sortDir: mod.defaultSort.sortDir,
  };
}

function sanitizeConfig(mod, incoming) {
  const validIds = new Set(mod.columns.map(c => c.id));
  const cfg = { columns: [], sortBy: mod.defaultSort.sortBy, sortDir: mod.defaultSort.sortDir };

  if (incoming && typeof incoming === 'object') {
    const seen = new Set();
    if (Array.isArray(incoming.columns)) {
      for (const c of incoming.columns) {
        if (!c || !validIds.has(c.id) || seen.has(c.id)) continue;
        cfg.columns.push({ id: c.id, visible: !!c.visible });
        seen.add(c.id);
      }
    }
    // Any columns the catalog knows about but user didn't include → append as hidden
    for (const c of mod.columns) {
      if (!seen.has(c.id)) cfg.columns.push({ id: c.id, visible: false });
    }
    if (typeof incoming.sortBy === 'string' && mod.sortAllowlist[incoming.sortBy]) {
      cfg.sortBy = incoming.sortBy;
    }
    if (incoming.sortDir === 'asc' || incoming.sortDir === 'desc') {
      cfg.sortDir = incoming.sortDir;
    }
  } else {
    return defaultConfigFor(mod);
  }

  // Guarantee at least one visible column (fall back to defaults)
  if (!cfg.columns.some(c => c.visible)) {
    const def = defaultConfigFor(mod);
    cfg.columns = def.columns;
  }
  return cfg;
}

/* ───────── Storage helpers ───────── */

function getUserPrefs(db, userId, moduleName) {
  const row = db.prepare(
    'SELECT config FROM user_view_preferences WHERE user_id = ? AND module = ?'
  ).get(userId, moduleName);
  if (!row) return null;
  try { return JSON.parse(row.config); } catch (_) { return null; }
}

function setUserPrefs(db, userId, moduleName, cfg) {
  db.prepare(`
    INSERT INTO user_view_preferences (user_id, module, config, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, module) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP
  `).run(userId, moduleName, JSON.stringify(cfg));
}

function deleteUserPrefs(db, userId, moduleName) {
  db.prepare('DELETE FROM user_view_preferences WHERE user_id = ? AND module = ?').run(userId, moduleName);
}

/* ───────── Catalog exposed to the client ───────── */

function publicCatalog(mod) {
  return {
    label: mod.label,
    columns: mod.columns.map(c => ({
      id: c.id, label: c.label, sortable: !!c.sortable, defaultVisible: !!c.defaultVisible,
    })),
    defaultSort: { ...mod.defaultSort },
  };
}

/* ═══════════════════════════════════ Routes ═══════════════════════════════ */

// GET /api/view-prefs/:module
router.get('/:module', (req, res) => {
  const mod = getModule(req.params.module);
  if (!mod) return res.status(404).json({ error: 'Unknown module' });
  const db = getDb();
  const user = getUserPrefs(db, req.session.userId, req.params.module);
  const cfg  = sanitizeConfig(mod, user || defaultConfigFor(mod));
  res.json({ catalog: publicCatalog(mod), config: cfg, source: user ? 'user' : 'default' });
});

// PUT /api/view-prefs/:module
router.put('/:module', (req, res) => {
  const mod = getModule(req.params.module);
  if (!mod) return res.status(404).json({ error: 'Unknown module' });
  const cfg = sanitizeConfig(mod, req.body && req.body.config);
  setUserPrefs(getDb(), req.session.userId, req.params.module, cfg);
  res.json({ catalog: publicCatalog(mod), config: cfg, source: 'user' });
});

// DELETE /api/view-prefs/:module → reset to default
router.delete('/:module', (req, res) => {
  const mod = getModule(req.params.module);
  if (!mod) return res.status(404).json({ error: 'Unknown module' });
  deleteUserPrefs(getDb(), req.session.userId, req.params.module);
  const cfg = defaultConfigFor(mod);
  res.json({ catalog: publicCatalog(mod), config: cfg, source: 'default' });
});

/* ───────── Helper exported for list routes to use the allowlist ───────── */

function resolveSort(moduleName, sortBy, sortDir) {
  const mod = getModule(moduleName);
  if (!mod) return null;
  const sql = mod.sortAllowlist[sortBy];
  if (!sql) return null;
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  return { sql, dir };
}

module.exports = router;
module.exports.resolveSort = resolveSort;
module.exports.MODULES = MODULES;
