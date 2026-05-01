PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'broker', 'admin_only')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CONTACTS TABLE (Section 5)
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  work_number TEXT,
  date_of_birth DATE,
  sa_id_number TEXT,
  contact_type TEXT NOT NULL CHECK(contact_type IN (
    'Individual Client','Business Contact Person','Trustee',
    'Member','Director','Employee Contact','Supplier','Other'
  )),
  client_category TEXT NOT NULL CHECK(client_category IN (
    'Personal Lines','Commercial Lines','Agri','Transport','Mixed','Supplier','Prospect Only'
  )),
  client_segment TEXT CHECK(client_segment IN (
    'A','B','C','VIP','Standard','High Risk','Strategic'
  )),
  existing_client INTEGER NOT NULL DEFAULT 0,
  date_became_client DATE,
  contact_status TEXT NOT NULL CHECK(contact_status IN (
    'Prospect','Active Client','Inactive Client','Former Client','Do Not Service','Deceased',
    '3rd Party','Co-Insured','Contact','Other'
  )),
  popia_consent_obtained INTEGER NOT NULL DEFAULT 0,
  popia_consent_date DATE,
  fica_status TEXT NOT NULL CHECK(fica_status IN (
    'Not Started','Pending Documents','In Review','Verified','Expired','Exempt'
  )),
  assigned_broker_id INTEGER REFERENCES users(id),
  assigned_admin_id INTEGER REFERENCES users(id),
  related_account_id INTEGER REFERENCES accounts(id),
  primary_client_record INTEGER NOT NULL DEFAULT 1,
  conduct_risk_flag INTEGER NOT NULL DEFAULT 0,
  conduct_risk_notes TEXT,
  last_review_date DATE,
  next_review_date DATE,
  physical_address TEXT,
  postal_address TEXT,
  source_of_lead TEXT CHECK(source_of_lead IN (
    'Referral','Walk-in','Existing Client','Website','Call-in','Social Media','Broker Initiative','Other'
  )),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ACCOUNTS TABLE (Section 6)
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL,
  registration_number TEXT,
  vat_number TEXT,
  industry TEXT CHECK(industry IN (
    'Agriculture','Transport','Construction','Retail','Manufacturing',
    'Professional Services','Hospitality','Property','Logistics','Other'
  )),
  business_type TEXT NOT NULL CHECK(business_type IN (
    'Company','Close Corporation','Sole Proprietor','Partnership',
    'Trust','NPO','School','Church','Body Corporate','Other'
  )),
  number_of_employees INTEGER,
  annual_turnover_band TEXT CHECK(annual_turnover_band IN (
    'Under R1m','R1m-R5m','R5m-R10m','R10m-R50m','Above R50m','Not Disclosed'
  )),
  physical_address TEXT,
  postal_address TEXT,
  main_contact_id INTEGER REFERENCES contacts(id),
  assigned_broker_id INTEGER REFERENCES users(id),
  assigned_admin_id INTEGER REFERENCES users(id),
  client_status TEXT NOT NULL CHECK(client_status IN (
    'Prospect','Active Client','Inactive Client','Former Client','Do Not Service'
  )),
  fica_status TEXT NOT NULL CHECK(fica_status IN (
    'Not Started','Pending Documents','In Review','Verified','Expired','Exempt'
  )),
  date_became_client DATE,
  last_review_date DATE,
  next_review_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add FK after accounts exists
-- contacts.related_account_id already references accounts

-- ============================================================
-- CLIENT ENGAGEMENTS TABLE (Section 7)
-- ============================================================
CREATE TABLE IF NOT EXISTS client_engagements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engagement_name TEXT NOT NULL,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  assigned_broker_id INTEGER REFERENCES users(id) NOT NULL,
  assigned_admin_id INTEGER REFERENCES users(id),
  stage TEXT NOT NULL CHECK(stage IN (
    'Prospect','Initial Contact','Appointment Scheduled','Fact Find Completed',
    'Needs Analysis Completed','Quote / Proposal Prepared','Advice Presented',
    'Client Decision Pending','Accepted - Implementation','Implemented / Active',
    'Lost / Declined','On Hold'
  )) DEFAULT 'Prospect',
  engagement_type TEXT NOT NULL CHECK(engagement_type IN (
    'New Business','Replacement Cover','Additional Cover','Amendment',
    'Renewal Review','Cancellation Review','Claims-Driven Advice','Complaint-Driven Review','Enquiry'
  )),
  source_of_lead TEXT CHECK(source_of_lead IN (
    'Referral','Walk-in','Existing Client','Website','Call-in',
    'Social Media','Broker Initiative','Other'
  )),
  current_insurer TEXT,
  current_premium REAL,
  existing_cover_summary TEXT,
  identified_risks TEXT,
  client_needs_summary TEXT,
  risk_priority TEXT CHECK(risk_priority IN ('Low','Medium','High','Critical')),
  fact_find_completed INTEGER NOT NULL DEFAULT 0,
  needs_analysis_completed INTEGER NOT NULL DEFAULT 0,
  proposal_prepared INTEGER NOT NULL DEFAULT 0,
  advice_presented INTEGER NOT NULL DEFAULT 0,
  disclosure_completed INTEGER NOT NULL DEFAULT 0,
  policy_wording_provided INTEGER NOT NULL DEFAULT 0,
  key_risks_explained INTEGER NOT NULL DEFAULT 0,
  excess_explained INTEGER NOT NULL DEFAULT 0,
  premium_explained INTEGER NOT NULL DEFAULT 0,
  limitations_explained INTEGER NOT NULL DEFAULT 0,
  client_questions_answered INTEGER NOT NULL DEFAULT 0,
  client_decision TEXT CHECK(client_decision IN (
    'Accepted','Declined','Deferred','No Response','Needs Revision','Pending'
  )),
  decline_reason TEXT CHECK(decline_reason IN (
    'Price','Cover Not Suitable','Stayed With Current Insurer',
    'No Longer Needed','No Response','Other'
  )),
  inception_date DATE,
  expected_premium REAL,
  suitability_confirmed INTEGER NOT NULL DEFAULT 0,
  client_understanding_confirmed INTEGER NOT NULL DEFAULT 0,
  alternative_options_considered TEXT,
  conduct_concern_flag INTEGER NOT NULL DEFAULT 0,
  conduct_notes TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- POLICIES TABLE (Section 8)
-- ============================================================
CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_name TEXT NOT NULL,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  engagement_id INTEGER REFERENCES client_engagements(id),
  advice_record_id INTEGER,  -- FK added after advice_records created
  insurer TEXT NOT NULL,
  assigned_broker_id INTEGER REFERENCES users(id) NOT NULL,
  assigned_admin_id INTEGER REFERENCES users(id),
  policy_number TEXT NOT NULL,
  product_category TEXT NOT NULL,
  policy_type TEXT CHECK(policy_type IN (
    'Personal','Commercial','Agri','Transport','Mixed'
  )),
  cover_description TEXT,
  premium REAL,
  inception_date DATE NOT NULL,
  renewal_date DATE,
  policy_status TEXT NOT NULL CHECK(policy_status IN (
    'Pending','Active','Amended','Cancelled','Lapsed','Expired'
  )) DEFAULT 'Pending',
  disclosure_completed INTEGER NOT NULL DEFAULT 0,
  last_review_date DATE,
  next_review_date DATE,
  amendment_count INTEGER DEFAULT 0,
  claims_count INTEGER DEFAULT 0,
  cancellation_date DATE,
  cancellation_reason TEXT CHECK(cancellation_reason IN (
    'Client Request','Non-Payment','Replaced','Risk Unacceptable','Other'
  )),
  replacement_policy_id INTEGER REFERENCES policies(id),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- POLICY SECTIONS TABLE (Section 9 + 10)
-- ============================================================
CREATE TABLE IF NOT EXISTS policy_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_name TEXT NOT NULL,
  policy_id INTEGER NOT NULL REFERENCES policies(id),
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  engagement_id INTEGER REFERENCES client_engagements(id),
  advice_record_id INTEGER,
  asset_id INTEGER REFERENCES assets(id),
  section_type TEXT NOT NULL CHECK(section_type IN (
    -- Personal Lines
    'Personal Motor','Household Contents','Buildings','All Risks',
    'Personal Liability','Watercraft','Caravan / Trailer','Personal Accident',
    'Extended Household / Portable Possessions',
    -- Commercial Lines
    'Commercial Motor','Business Assets','Office Contents','Buildings Combined',
    'Electronic Equipment','Business Interruption','Money','Glass',
    'Fidelity Guarantee','Accounts Receivable',
    -- Liability
    'Public Liability','Products Liability','Employers Liability',
    'Directors and Officers','Professional Indemnity','Cyber Liability',
    'Event Liability','Extended Third Party Liability',
    -- Transport / Logistics
    'Goods in Transit','Carrier Liability','Fleet Cover',
    'Trailer Combination Cover','Load Limit','Wreckage Removal',
    'Passenger Liability','Cross Border / Special Risk',
    -- Agri / Specialist
    'Agri Assets','Tractors and Implements','Livestock',
    'Irrigation Equipment','Specialist Plant','Contract Works',
    'Marine / Inland Marine','Other'
  )),
  section_category TEXT NOT NULL CHECK(section_category IN (
    'Personal Lines','Commercial Lines','Transport','Liability','Specialist'
  )),
  risk_exists INTEGER NOT NULL DEFAULT 0,
  cover_required INTEGER NOT NULL DEFAULT 0,
  currently_covered INTEGER NOT NULL DEFAULT 0,
  recommended_for_cover INTEGER NOT NULL DEFAULT 0,
  implemented INTEGER NOT NULL DEFAULT 0,
  gap_identified INTEGER NOT NULL DEFAULT 0,
  gap_severity TEXT CHECK(gap_severity IN ('Low','Medium','High','Critical')),
  client_accepted_recommendation INTEGER NOT NULL DEFAULT 0,
  client_declined_recommendation INTEGER NOT NULL DEFAULT 0,
  decline_reason TEXT CHECK(decline_reason IN (
    'Price','Not Required by Client','Existing Cover Retained','Deferred','Other'
  )),
  sum_insured_limit REAL,
  premium REAL,
  excess REAL,
  excess_structure_notes TEXT,
  buy_down_applies INTEGER NOT NULL DEFAULT 0,
  buy_down_premium REAL,
  section_provider TEXT,
  cover_description TEXT,
  main_exclusions_limitations TEXT,
  disclosure_explained INTEGER NOT NULL DEFAULT 0,
  client_understanding_confirmed INTEGER NOT NULL DEFAULT 0,
  needs_analysis_status TEXT NOT NULL CHECK(needs_analysis_status IN (
    'Not Assessed','Assessed','Recommendation Made','Accepted',
    'Declined','Implemented','Not Applicable'
  )) DEFAULT 'Not Assessed',
  conduct_concern_flag INTEGER NOT NULL DEFAULT 0,
  conduct_notes TEXT,
  last_reviewed_date DATE,
  next_review_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ASSETS TABLE (Section 11)
-- ============================================================
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name TEXT NOT NULL,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  policy_id INTEGER REFERENCES policies(id),
  policy_section_id INTEGER REFERENCES policy_sections(id),
  asset_type TEXT NOT NULL,
  asset_status TEXT NOT NULL DEFAULT 'Active',
  registration_number TEXT,
  vin_number TEXT,
  engine_number TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  serial_number TEXT,
  date_acquired DATE,
  date_sold DATE,
  mm_number TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- RISK DETAILS TABLE (Section 12)
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  risk_detail_name TEXT NOT NULL,
  policy_section_id INTEGER NOT NULL REFERENCES policy_sections(id),
  asset_id INTEGER REFERENCES assets(id),
  policy_id INTEGER REFERENCES policies(id),
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  risk_type TEXT NOT NULL CHECK(risk_type IN (
    'Motor Risk','Building Risk','Contents Risk','GIT Risk',
    'Liability Risk','Electronic Equipment Risk','Specialist Risk'
  )),
  occupancy_use TEXT,
  security_details TEXT,
  construction_type TEXT CHECK(construction_type IN (
    'Brick','Concrete','Steel','Timber','Thatch','Mixed','Other'
  )),
  roof_construction TEXT,
  wall_construction TEXT,
  stored_parked_overnight TEXT,
  tracking_device_fitted INTEGER NOT NULL DEFAULT 0,
  route_operating_area TEXT,
  distance_to_water TEXT,
  flood_exposure TEXT CHECK(flood_exposure IN ('Low','Medium','High','Unknown')),
  fire_exposure TEXT CHECK(fire_exposure IN ('Low','Medium','High','Unknown')),
  goods_load_type TEXT,
  maximum_exposure_value REAL,
  risk_notes TEXT,
  last_updated DATE,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CLAIMS TABLE (Section 13)
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_number TEXT NOT NULL UNIQUE,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  policy_id INTEGER NOT NULL REFERENCES policies(id),
  policy_section_id INTEGER REFERENCES policy_sections(id),
  asset_id INTEGER REFERENCES assets(id),
  broker_id INTEGER REFERENCES users(id),
  claims_handler_admin_id INTEGER REFERENCES users(id),
  claim_date DATE NOT NULL,
  date_reported DATE NOT NULL,
  claim_type TEXT NOT NULL CHECK(claim_type IN (
    'Motor','Property','Liability','GIT','Theft','Fire','Other'
  )),
  incident_description TEXT NOT NULL,
  estimated_value REAL,
  claim_status TEXT NOT NULL CHECK(claim_status IN (
    'Notified','In Progress','Awaiting Documents','Settled',
    'Rejected','Closed','Disputed'
  )) DEFAULT 'Notified',
  client_kept_informed INTEGER NOT NULL DEFAULT 0,
  last_client_update_date DATE,
  delay_flag INTEGER NOT NULL DEFAULT 0,
  fair_process_concern INTEGER NOT NULL DEFAULT 0,
  dispute_raised INTEGER NOT NULL DEFAULT 0,
  dispute_details TEXT,
  settlement_amount REAL,
  settlement_date DATE,
  rejection_reason TEXT,
  outcome_notes TEXT,
  related_advice_record_id INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- ADVICE RECORDS TABLE (Section 14) - Phase 2, scaffold now
-- ============================================================
CREATE TABLE IF NOT EXISTS advice_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advice_record_number TEXT NOT NULL UNIQUE,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  engagement_id INTEGER REFERENCES client_engagements(id),
  policy_id INTEGER REFERENCES policies(id),
  broker_id INTEGER NOT NULL REFERENCES users(id),
  prepared_by_id INTEGER NOT NULL REFERENCES users(id),
  advice_date DATE NOT NULL,
  advice_type TEXT NOT NULL CHECK(advice_type IN (
    'New Business','Amendment','Cancellation','Review','Claims-Driven Advice'
  )),
  trigger_event TEXT CHECK(trigger_event IN (
    'Client Engagement','Policy Amendment','Cancellation','Review','Claim','Enquiry'
  )),
  client_needs_identified TEXT NOT NULL,
  risk_analysis_summary TEXT NOT NULL,
  current_cover_considered TEXT,
  shortfalls_identified TEXT,
  recommendation_given TEXT NOT NULL,
  alternative_options_considered TEXT,
  reason_product_suitable TEXT NOT NULL,
  consequences_of_not_proceeding TEXT,
  risks_explained INTEGER NOT NULL DEFAULT 0,
  costs_explained INTEGER NOT NULL DEFAULT 0,
  excess_explained INTEGER NOT NULL DEFAULT 0,
  waiting_period_limitations_explained INTEGER NOT NULL DEFAULT 0,
  exclusions_explained INTEGER NOT NULL DEFAULT 0,
  client_understanding_confirmed INTEGER NOT NULL DEFAULT 0,
  fair_outcome_considered INTEGER NOT NULL DEFAULT 0,
  client_decision TEXT CHECK(client_decision IN (
    'Accepted','Declined','Deferred','Pending'
  )),
  decision_date DATE,
  decision_notes TEXT,
  roa_generated INTEGER NOT NULL DEFAULT 0,
  roa_generation_date DATE,
  final_document_issued INTEGER NOT NULL DEFAULT 0,
  issue_date DATE,
  client_acknowledgement_received INTEGER NOT NULL DEFAULT 0,
  acknowledgement_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- COMPLAINTS TABLE (Section 15) - Phase 2
-- ============================================================
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_number TEXT NOT NULL UNIQUE,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  policy_id INTEGER REFERENCES policies(id),
  claim_id INTEGER REFERENCES claims(id),
  broker_id INTEGER REFERENCES users(id),
  complaint_owner_id INTEGER REFERENCES users(id),
  complaint_date DATE NOT NULL,
  received_via TEXT CHECK(received_via IN (
    'Email','Phone','Letter','In Person','Online Form','Other'
  )),
  complaint_category TEXT CHECK(complaint_category IN (
    'Service Quality','Incorrect Advice','Claims Handling','Premium Dispute',
    'Policy Cancellation','POPIA Breach','Conduct','Other'
  )),
  complaint_summary TEXT NOT NULL,
  detailed_complaint TEXT,
  complaint_status TEXT NOT NULL CHECK(complaint_status IN (
    'Open','In Progress','Awaiting Response','Resolved','Closed','Escalated'
  )) DEFAULT 'Open',
  assigned_to_id INTEGER REFERENCES users(id),
  response_due_date DATE,
  resolution_date DATE,
  resolution_summary TEXT,
  fair_outcome_achieved INTEGER NOT NULL DEFAULT 0,
  root_cause_identified TEXT,
  root_cause_category TEXT CHECK(root_cause_category IN (
    'Process Failure','Communication Failure','System Error',
    'Staff Conduct','Policy Wording','Claims Decision','Other'
  )),
  corrective_action_taken TEXT,
  complaint_escalated_internally INTEGER NOT NULL DEFAULT 0,
  external_ombud_escalation INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- REVIEWS TABLE (Section 15) - Phase 2
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_number TEXT NOT NULL UNIQUE,
  contact_id INTEGER REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  policy_id INTEGER REFERENCES policies(id),
  broker_id INTEGER REFERENCES users(id),
  assigned_admin_id INTEGER REFERENCES users(id),
  review_type TEXT NOT NULL CHECK(review_type IN (
    'Annual Review','Mid-Year Review','Renewal Review',
    'Claims Review','Ad Hoc Review','Complaint Review'
  )),
  review_date DATE NOT NULL,
  review_outcome TEXT CHECK(review_outcome IN (
    'No Changes Required','Changes Recommended','Urgent Action Required',
    'Policy Cancelled','Follow-Up Required'
  )),
  changes_in_risk_profile TEXT,
  changes_in_assets_exposure TEXT,
  gaps_identified TEXT,
  recommendations TEXT,
  follow_up_actions TEXT,
  next_review_date DATE,
  review_completed INTEGER NOT NULL DEFAULT 0,
  advice_record_required INTEGER NOT NULL DEFAULT 0,
  linked_advice_record_id INTEGER REFERENCES advice_records(id),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DOCUMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id),
  policy_id INTEGER REFERENCES policies(id),
  claim_id INTEGER REFERENCES claims(id),
  account_id INTEGER REFERENCES accounts(id),
  engagement_id INTEGER REFERENCES client_engagements(id),
  policy_section_id INTEGER REFERENCES policy_sections(id),
  asset_id INTEGER REFERENCES assets(id),
  risk_detail_id INTEGER REFERENCES risk_details(id),
  advice_record_id INTEGER REFERENCES advice_records(id),
  complaint_id INTEGER REFERENCES complaints(id),
  review_id INTEGER REFERENCES reviews(id),
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  description TEXT,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- AUDIT LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','EMAIL')),
  module TEXT NOT NULL,
  record_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  description TEXT,
  ip_address TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SAVED REPORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  config TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  report_type TEXT NOT NULL CHECK(report_type IN ('predefined','custom')) DEFAULT 'custom',
  predefined_key TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CLAIM NOTES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS claim_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  note_date DATE NOT NULL,
  details TEXT NOT NULL,
  expected_outcome TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CLAIM THIRD PARTIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS claim_third_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  surname TEXT NOT NULL,
  initials TEXT,
  address TEXT,
  cell_no TEXT,
  telephone_no TEXT,
  occupation TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_reg TEXT,
  damage_description TEXT,
  is_insured INTEGER NOT NULL DEFAULT 0,
  insurer TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_broker ON contacts(assigned_broker_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(contact_status);
CREATE INDEX IF NOT EXISTS idx_accounts_broker ON accounts(assigned_broker_id);
CREATE INDEX IF NOT EXISTS idx_engagements_contact ON client_engagements(contact_id);
CREATE INDEX IF NOT EXISTS idx_engagements_broker ON client_engagements(assigned_broker_id);
CREATE INDEX IF NOT EXISTS idx_engagements_stage ON client_engagements(stage);
CREATE INDEX IF NOT EXISTS idx_policies_contact ON policies(contact_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(policy_status);
CREATE INDEX IF NOT EXISTS idx_policies_renewal ON policies(renewal_date);
CREATE INDEX IF NOT EXISTS idx_policy_sections_policy ON policy_sections(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_sections_gap ON policy_sections(gap_identified);
CREATE INDEX IF NOT EXISTS idx_assets_contact ON assets(contact_id);
CREATE INDEX IF NOT EXISTS idx_risk_details_section ON risk_details(policy_section_id);
CREATE INDEX IF NOT EXISTS idx_claims_policy ON claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(claim_status);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_log_module_record ON audit_log(module, record_id);
CREATE INDEX IF NOT EXISTS idx_claims_contact ON claims(contact_id);
CREATE INDEX IF NOT EXISTS idx_complaints_contact ON complaints(contact_id);
CREATE INDEX IF NOT EXISTS idx_reviews_contact ON reviews(contact_id);
CREATE INDEX IF NOT EXISTS idx_advice_records_contact ON advice_records(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_contact ON documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_policy ON documents(policy_id);
CREATE INDEX IF NOT EXISTS idx_claim_notes_claim ON claim_notes(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_third_parties_claim ON claim_third_parties(claim_id);
