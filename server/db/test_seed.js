#!/usr/bin/env node
/**
 * Test seed — creates 3 realistic South African insurance brokerage test subjects.
 * Run with: node server/db/test_seed.js
 *
 * Subjects:
 *   1. Pieter van der Merwe — Individual Personal Lines Client
 *   2. Van der Berg Logistics (Pty) Ltd — Business Commercial Lines Client
 *   3. Nomvula Sithole — Prospect with a Gap
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { initDb } = require('./database');

// ---------------------------------------------------------------------------
// Helper: insert an audit log entry (synchronous, inside transaction)
// ---------------------------------------------------------------------------
function auditLog(db, userId, action, module, recordId, description, newValue) {
  db.prepare(`
    INSERT INTO audit_log (user_id, action, module, record_id, new_value, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    action,
    module,
    recordId,
    newValue ? JSON.stringify(newValue) : null,
    description
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seedTests() {
  console.log('=== INEXPRO CRM TEST SEED ===');
  console.log('Initialising database schema...');
  const db = initDb();
  console.log('Schema ready.\n');

  // -------------------------------------------------------------------------
  // Guard: skip if test data already present
  // -------------------------------------------------------------------------
  const alreadySeeded = db.prepare(
    "SELECT id FROM users WHERE username = 'broker_test'"
  ).get();

  if (alreadySeeded) {
    console.log('Test data already exists (broker_test user found). Skipping seed.');
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Hash passwords (async, outside transaction)
  // -------------------------------------------------------------------------
  console.log('Hashing passwords...');
  const [adminHash, brokerHash, adminTestHash] = await Promise.all([
    bcrypt.hash('admin123', 12),
    bcrypt.hash('broker123', 12),
    bcrypt.hash('admintest123', 12),
  ]);
  console.log('Passwords hashed.\n');

  // -------------------------------------------------------------------------
  // Counters for summary
  // -------------------------------------------------------------------------
  const counts = {
    users: 0,
    contacts: 0,
    accounts: 0,
    policies: 0,
    policy_sections: 0,
    assets: 0,
    risk_details: 0,
    claims: 0,
    client_engagements: 0,
    audit_log: 0,
  };

  // =========================================================================
  // SINGLE TRANSACTION — all inserts wrapped for atomicity
  // =========================================================================
  console.log('Starting transaction...');
  const seedTransaction = db.transaction(() => {

    // -----------------------------------------------------------------------
    // USERS
    // -----------------------------------------------------------------------
    console.log('  Creating users...');

    // 1. admin (only if not already there — may exist from original seed.js)
    let adminId;
    const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (existingAdmin) {
      adminId = existingAdmin.id;
      console.log('    admin user already exists, reusing id', adminId);
    } else {
      const adminResult = db.prepare(`
        INSERT INTO users (username, email, password_hash, full_name, role)
        VALUES (?, ?, ?, ?, ?)
      `).run('admin', 'admin@inexpro.co.za', adminHash, 'System Administrator', 'admin');
      adminId = adminResult.lastInsertRowid;
      counts.users++;
      auditLog(db, adminId, 'CREATE', 'users', adminId, 'Created admin user', { username: 'admin', role: 'admin' });
      counts.audit_log++;
      console.log('    Created admin user id', adminId);
    }

    // 2. broker_test
    const brokerResult = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('broker_test', 'sipho.nkosi@inexpro.co.za', brokerHash, 'Sipho Nkosi', 'broker');
    const brokerId = brokerResult.lastInsertRowid;
    counts.users++;
    auditLog(db, adminId, 'CREATE', 'users', brokerId, 'Created broker_test user', { username: 'broker_test', full_name: 'Sipho Nkosi', role: 'broker' });
    counts.audit_log++;
    console.log('    Created broker_test user id', brokerId);

    // 3. admin_test
    const adminTestResult = db.prepare(`
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin_test', 'zanele.dlamini@inexpro.co.za', adminTestHash, 'Zanele Dlamini', 'admin_only');
    const adminTestId = adminTestResult.lastInsertRowid;
    counts.users++;
    auditLog(db, adminId, 'CREATE', 'users', adminTestId, 'Created admin_test user', { username: 'admin_test', full_name: 'Zanele Dlamini', role: 'admin_only' });
    counts.audit_log++;
    console.log('    Created admin_test user id', adminTestId);

    // =======================================================================
    // SUBJECT 1 — Individual Personal Lines Client: Pieter van der Merwe
    // =======================================================================
    console.log('\n  Seeding Subject 1: Pieter van der Merwe (Personal Lines)...');

    const pieterResult = db.prepare(`
      INSERT INTO contacts (
        first_name, last_name, email, mobile,
        date_of_birth, sa_id_number,
        contact_type, client_category,
        existing_client, date_became_client,
        contact_status,
        popia_consent_obtained, popia_consent_date,
        fica_status,
        assigned_broker_id,
        physical_address,
        created_by
      ) VALUES (
        'Pieter', 'van der Merwe', 'pieter@example.co.za', '0821234567',
        '1978-04-15', '7804155012087',
        'Individual Client', 'Personal Lines',
        1, '2020-03-10',
        'Active Client',
        1, '2023-01-15',
        'Verified',
        ?,
        '12 Jacaranda Street, Centurion, Gauteng, 0157',
        ?
      )
    `).run(brokerId, adminId);
    const pieterId = pieterResult.lastInsertRowid;
    counts.contacts++;
    auditLog(db, brokerId, 'CREATE', 'contacts', pieterId,
      'Created contact: Pieter van der Merwe',
      { first_name: 'Pieter', last_name: 'van der Merwe', contact_type: 'Individual Client' });
    counts.audit_log++;
    console.log('    Created contact Pieter van der Merwe id', pieterId);

    // Policy POL-2020-001 (Santam, Personal Lines)
    const pol1Result = db.prepare(`
      INSERT INTO policies (
        policy_name, contact_id,
        insurer, assigned_broker_id,
        policy_number, product_category,
        policy_type, premium,
        inception_date, renewal_date,
        policy_status,
        created_by
      ) VALUES (
        'Pieter van der Merwe - Personal Lines', ?,
        'Santam', ?,
        'POL-2020-001', 'Personal Lines',
        'Personal', 4800,
        '2020-03-15', '2025-03-15',
        'Active',
        ?
      )
    `).run(pieterId, brokerId, adminId);
    const pol1Id = pol1Result.lastInsertRowid;
    counts.policies++;
    auditLog(db, brokerId, 'CREATE', 'policies', pol1Id,
      'Created policy POL-2020-001 for Pieter van der Merwe',
      { policy_number: 'POL-2020-001', insurer: 'Santam', policy_status: 'Active' });
    counts.audit_log++;
    console.log('    Created policy POL-2020-001 id', pol1Id);

    // Policy Section 1 — Personal Motor
    const sec1aResult = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, contact_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        sum_insured_limit, premium, excess,
        needs_analysis_status,
        created_by
      ) VALUES (
        'Personal Motor', ?, ?,
        'Personal Motor', 'Personal Lines',
        1, 1, 1,
        1, 1, 0,
        350000, 3200, 5000,
        'Implemented',
        ?
      )
    `).run(pol1Id, pieterId, adminId);
    const sec1aId = sec1aResult.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec1aId,
      'Created policy section: Personal Motor (POL-2020-001)',
      { section_type: 'Personal Motor', policy_id: pol1Id });
    counts.audit_log++;

    // Policy Section 2 — Household Contents
    const sec1bResult = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, contact_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        sum_insured_limit, premium, excess,
        needs_analysis_status,
        created_by
      ) VALUES (
        'Household Contents', ?, ?,
        'Household Contents', 'Personal Lines',
        1, 1, 1,
        1, 1, 0,
        120000, 800, 2500,
        'Implemented',
        ?
      )
    `).run(pol1Id, pieterId, adminId);
    const sec1bId = sec1bResult.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec1bId,
      'Created policy section: Household Contents (POL-2020-001)',
      { section_type: 'Household Contents', policy_id: pol1Id });
    counts.audit_log++;

    // Policy Section 3 — Buildings
    const sec1cResult = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, contact_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        sum_insured_limit, premium, excess,
        needs_analysis_status,
        created_by
      ) VALUES (
        'Buildings', ?, ?,
        'Buildings', 'Personal Lines',
        1, 1, 1,
        1, 1, 0,
        1500000, 600, 3000,
        'Implemented',
        ?
      )
    `).run(pol1Id, pieterId, adminId);
    const sec1cId = sec1cResult.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec1cId,
      'Created policy section: Buildings (POL-2020-001)',
      { section_type: 'Buildings', policy_id: pol1Id });
    counts.audit_log++;

    // Policy Section 4 — All Risks
    const sec1dResult = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, contact_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        sum_insured_limit, premium, excess,
        needs_analysis_status,
        created_by
      ) VALUES (
        'All Risks', ?, ?,
        'All Risks', 'Personal Lines',
        1, 1, 1,
        1, 1, 0,
        25000, 200, 1000,
        'Implemented',
        ?
      )
    `).run(pol1Id, pieterId, adminId);
    const sec1dId = sec1dResult.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec1dId,
      'Created policy section: All Risks (POL-2020-001)',
      { section_type: 'All Risks', policy_id: pol1Id });
    counts.audit_log++;
    console.log('    Created 4 policy sections for POL-2020-001');

    // Asset — 2019 Toyota Hilux
    const asset1Result = db.prepare(`
      INSERT INTO assets (
        asset_name, contact_id, policy_id, policy_section_id,
        asset_type, asset_status,
        registration_number, vin_number,
        make, model, year,
        created_by
      ) VALUES (
        '2019 Toyota Hilux Double Cab', ?, ?, ?,
        'Vehicle', 'Active',
        'JHB 123 GP', 'AHTFB3CD5K1234567',
        'Toyota', 'Hilux Double Cab', 2019,
        ?
      )
    `).run(pieterId, pol1Id, sec1aId, adminId);
    const asset1Id = asset1Result.lastInsertRowid;
    counts.assets++;
    auditLog(db, brokerId, 'CREATE', 'assets', asset1Id,
      'Created asset: 2019 Toyota Hilux Double Cab',
      { asset_name: '2019 Toyota Hilux Double Cab', registration_number: 'JHB 123 GP' });
    counts.audit_log++;
    console.log('    Created asset: Toyota Hilux id', asset1Id);

    // Update the Personal Motor section to link the asset
    db.prepare('UPDATE policy_sections SET asset_id = ? WHERE id = ?').run(asset1Id, sec1aId);

    // Risk Detail — Motor Risk
    const risk1Result = db.prepare(`
      INSERT INTO risk_details (
        risk_detail_name, policy_section_id, asset_id, policy_id, contact_id,
        risk_type,
        security_details,
        tracking_device_fitted,
        stored_parked_overnight,
        route_operating_area,
        created_by
      ) VALUES (
        'Pieter van der Merwe - Motor Risk', ?, ?, ?, ?,
        'Motor Risk',
        'Tracker device, alarm, locked garage',
        1,
        'Locked garage',
        'Centurion to Sandton daily commute',
        ?
      )
    `).run(sec1aId, asset1Id, pol1Id, pieterId, adminId);
    const risk1Id = risk1Result.lastInsertRowid;
    counts.risk_details++;
    auditLog(db, brokerId, 'CREATE', 'risk_details', risk1Id,
      'Created risk detail: Motor Risk for Pieter van der Merwe',
      { risk_type: 'Motor Risk', policy_section_id: sec1aId });
    counts.audit_log++;
    console.log('    Created risk detail id', risk1Id);

    // Claim CLM-2023-001
    const claim1Result = db.prepare(`
      INSERT INTO claims (
        claim_number, contact_id, policy_id, policy_section_id, asset_id,
        broker_id,
        claim_date, date_reported,
        claim_type, incident_description,
        estimated_value,
        claim_status,
        client_kept_informed, delay_flag,
        settlement_amount, settlement_date,
        created_by
      ) VALUES (
        'CLM-2023-001', ?, ?, ?, ?,
        ?,
        '2023-08-10', '2023-08-11',
        'Motor',
        'Rear-end collision at traffic lights on N1 highway. Third party at fault. Vehicle sustained bumper and boot damage.',
        18500,
        'Settled',
        1, 0,
        16800, '2023-09-05',
        ?
      )
    `).run(pieterId, pol1Id, sec1aId, asset1Id, brokerId, adminId);
    const claim1Id = claim1Result.lastInsertRowid;
    counts.claims++;
    auditLog(db, brokerId, 'CREATE', 'claims', claim1Id,
      'Created claim CLM-2023-001 for Pieter van der Merwe',
      { claim_number: 'CLM-2023-001', claim_type: 'Motor', claim_status: 'Settled' });
    counts.audit_log++;
    console.log('    Created claim CLM-2023-001 id', claim1Id);

    // =======================================================================
    // SUBJECT 2 — Business Commercial Lines Client: Van der Berg Logistics
    // =======================================================================
    console.log('\n  Seeding Subject 2: Van der Berg Logistics (Commercial Lines)...');

    // Contact person first (needed for account.main_contact_id)
    const johanResult = db.prepare(`
      INSERT INTO contacts (
        first_name, last_name, email, mobile,
        contact_type, client_category,
        existing_client,
        contact_status,
        popia_consent_obtained,
        fica_status,
        assigned_broker_id,
        created_by
      ) VALUES (
        'Johan', 'van den Berg', 'johan@vandenberglogistics.co.za', '0839876543',
        'Business Contact Person', 'Commercial Lines',
        1,
        'Active Client',
        1,
        'Verified',
        ?,
        ?
      )
    `).run(brokerId, adminId);
    const johanId = johanResult.lastInsertRowid;
    counts.contacts++;
    auditLog(db, brokerId, 'CREATE', 'contacts', johanId,
      'Created contact: Johan van den Berg',
      { first_name: 'Johan', last_name: 'van den Berg', contact_type: 'Business Contact Person' });
    counts.audit_log++;
    console.log('    Created contact Johan van den Berg id', johanId);

    // Account: Van der Berg Logistics
    const accResult = db.prepare(`
      INSERT INTO accounts (
        account_name, registration_number,
        industry, business_type,
        annual_turnover_band,
        physical_address,
        main_contact_id,
        assigned_broker_id,
        client_status, fica_status,
        date_became_client,
        created_by
      ) VALUES (
        'Van der Berg Logistics (Pty) Ltd', '2015/123456/07',
        'Logistics', 'Company',
        'R10m-R50m',
        'Unit 5, Industrial Park, Alrode, Alberton, 1449',
        ?,
        ?,
        'Active Client', 'Verified',
        '2021-06-01',
        ?
      )
    `).run(johanId, brokerId, adminId);
    const accId = accResult.lastInsertRowid;
    counts.accounts++;
    auditLog(db, brokerId, 'CREATE', 'accounts', accId,
      'Created account: Van der Berg Logistics (Pty) Ltd',
      { account_name: 'Van der Berg Logistics (Pty) Ltd', business_type: 'Company' });
    counts.audit_log++;
    console.log('    Created account Van der Berg Logistics id', accId);

    // Link the contact back to the account
    db.prepare('UPDATE contacts SET related_account_id = ? WHERE id = ?').run(accId, johanId);

    // Policy POL-2021-002 (OUTsurance Commercial, Commercial Lines)
    const pol2Result = db.prepare(`
      INSERT INTO policies (
        policy_name, account_id,
        insurer, assigned_broker_id,
        policy_number, product_category,
        policy_type, premium,
        inception_date, renewal_date,
        policy_status,
        created_by
      ) VALUES (
        'Van der Berg Logistics - Commercial Lines', ?,
        'OUTsurance Commercial', ?,
        'POL-2021-002', 'Commercial Lines',
        'Commercial', 22000,
        '2021-06-15', '2025-06-15',
        'Active',
        ?
      )
    `).run(accId, brokerId, adminId);
    const pol2Id = pol2Result.lastInsertRowid;
    counts.policies++;
    auditLog(db, brokerId, 'CREATE', 'policies', pol2Id,
      'Created policy POL-2021-002 for Van der Berg Logistics',
      { policy_number: 'POL-2021-002', insurer: 'OUTsurance Commercial', policy_status: 'Active' });
    counts.audit_log++;
    console.log('    Created policy POL-2021-002 id', pol2Id);

    // Policy Section 1 — Business Assets
    const sec2aResult = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, account_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        sum_insured_limit, premium, excess,
        needs_analysis_status,
        created_by
      ) VALUES (
        'Business Assets', ?, ?,
        'Business Assets', 'Commercial Lines',
        1, 1, 1,
        1, 1, 0,
        850000, 8500, 7500,
        'Implemented',
        ?
      )
    `).run(pol2Id, accId, adminId);
    const sec2aId = sec2aResult.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec2aId,
      'Created policy section: Business Assets (POL-2021-002)',
      { section_type: 'Business Assets', policy_id: pol2Id });
    counts.audit_log++;

    // Policy Section 2 — Commercial Motor
    const sec2bResult = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, account_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        sum_insured_limit, premium, excess,
        needs_analysis_status,
        created_by
      ) VALUES (
        'Commercial Motor', ?, ?,
        'Commercial Motor', 'Commercial Lines',
        1, 1, 1,
        1, 1, 0,
        600000, 13500, 10000,
        'Implemented',
        ?
      )
    `).run(pol2Id, accId, adminId);
    const sec2bId = sec2bResult.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec2bId,
      'Created policy section: Commercial Motor (POL-2021-002)',
      { section_type: 'Commercial Motor', policy_id: pol2Id });
    counts.audit_log++;
    console.log('    Created 2 policy sections for POL-2021-002');

    // Asset 1 — 2020 Freightliner Argosy
    const asset2Result = db.prepare(`
      INSERT INTO assets (
        asset_name, account_id, policy_id, policy_section_id,
        asset_type, asset_status,
        registration_number, vin_number,
        make, model, year,
        created_by
      ) VALUES (
        '2020 Freightliner Argosy', ?, ?, ?,
        'Vehicle', 'Active',
        'GP 45 789', 'JH4KA3150KC012345',
        'Freightliner', 'Argosy', 2020,
        ?
      )
    `).run(accId, pol2Id, sec2bId, adminId);
    const asset2Id = asset2Result.lastInsertRowid;
    counts.assets++;
    auditLog(db, brokerId, 'CREATE', 'assets', asset2Id,
      'Created asset: 2020 Freightliner Argosy',
      { asset_name: '2020 Freightliner Argosy', registration_number: 'GP 45 789' });
    counts.audit_log++;

    // Asset 2 — Workshop Equipment Set
    const asset3Result = db.prepare(`
      INSERT INTO assets (
        asset_name, account_id, policy_id, policy_section_id,
        asset_type, asset_status,
        serial_number, date_acquired,
        created_by
      ) VALUES (
        'Workshop Equipment Set', ?, ?, ?,
        'Equipment', 'Active',
        'WE-2021-045', '2021-01-15',
        ?
      )
    `).run(accId, pol2Id, sec2aId, adminId);
    const asset3Id = asset3Result.lastInsertRowid;
    counts.assets++;
    auditLog(db, brokerId, 'CREATE', 'assets', asset3Id,
      'Created asset: Workshop Equipment Set',
      { asset_name: 'Workshop Equipment Set', serial_number: 'WE-2021-045' });
    counts.audit_log++;
    console.log('    Created 2 assets for Van der Berg Logistics');

    // Update Commercial Motor section to link the truck asset
    db.prepare('UPDATE policy_sections SET asset_id = ? WHERE id = ?').run(asset2Id, sec2bId);

    // Risk Detail — GIT Risk
    const risk2Result = db.prepare(`
      INSERT INTO risk_details (
        risk_detail_name, policy_section_id, asset_id, policy_id, account_id,
        risk_type,
        route_operating_area,
        goods_load_type,
        maximum_exposure_value,
        security_details,
        created_by
      ) VALUES (
        'Van der Berg Logistics - GIT Risk', ?, ?, ?, ?,
        'GIT Risk',
        'Gauteng to Cape Town and Durban regular routes',
        'General freight, FMCG',
        250000,
        'Fleet management system, 24hr tracking',
        ?
      )
    `).run(sec2bId, asset2Id, pol2Id, accId, adminId);
    const risk2Id = risk2Result.lastInsertRowid;
    counts.risk_details++;
    auditLog(db, brokerId, 'CREATE', 'risk_details', risk2Id,
      'Created risk detail: GIT Risk for Van der Berg Logistics',
      { risk_type: 'GIT Risk', policy_section_id: sec2bId });
    counts.audit_log++;
    console.log('    Created risk detail id', risk2Id);

    // Client Engagement — Commercial Renewal Review 2025
    const eng2Result = db.prepare(`
      INSERT INTO client_engagements (
        engagement_name, account_id,
        assigned_broker_id,
        stage, engagement_type,
        fact_find_completed, needs_analysis_completed,
        created_by
      ) VALUES (
        'Van den Berg Logistics - Commercial Renewal Review 2025', ?,
        ?,
        'Appointment Scheduled', 'Renewal Review',
        0, 0,
        ?
      )
    `).run(accId, brokerId, adminId);
    const eng2Id = eng2Result.lastInsertRowid;
    counts.client_engagements++;
    auditLog(db, brokerId, 'CREATE', 'client_engagements', eng2Id,
      'Created engagement: Commercial Renewal Review 2025',
      { engagement_name: 'Van den Berg Logistics - Commercial Renewal Review 2025', stage: 'Appointment Scheduled' });
    counts.audit_log++;
    console.log('    Created client engagement id', eng2Id);

    // =======================================================================
    // SUBJECT 3 — Prospect with a Gap: Nomvula Sithole
    // =======================================================================
    console.log('\n  Seeding Subject 3: Nomvula Sithole (Prospect with Gap)...');

    const nomvulaResult = db.prepare(`
      INSERT INTO contacts (
        first_name, last_name, email, mobile,
        contact_type, client_category,
        existing_client,
        contact_status,
        popia_consent_obtained,
        fica_status,
        assigned_broker_id,
        source_of_lead,
        created_by
      ) VALUES (
        'Nomvula', 'Sithole', 'nomvula.sithole@gmail.com', '0761234567',
        'Individual Client', 'Personal Lines',
        0,
        'Prospect',
        0,
        'Not Started',
        ?,
        'Referral',
        ?
      )
    `).run(brokerId, adminId);
    const nomvulaId = nomvulaResult.lastInsertRowid;
    counts.contacts++;
    auditLog(db, brokerId, 'CREATE', 'contacts', nomvulaId,
      'Created contact: Nomvula Sithole (Prospect)',
      { first_name: 'Nomvula', last_name: 'Sithole', contact_status: 'Prospect' });
    counts.audit_log++;
    console.log('    Created contact Nomvula Sithole id', nomvulaId);

    // Client Engagement — New Business
    const eng3Result = db.prepare(`
      INSERT INTO client_engagements (
        engagement_name, contact_id,
        assigned_broker_id,
        stage, engagement_type,
        fact_find_completed, needs_analysis_completed,
        created_by
      ) VALUES (
        'Nomvula Sithole - New Business', ?,
        ?,
        'Fact Find Completed', 'New Business',
        1, 0,
        ?
      )
    `).run(nomvulaId, brokerId, adminId);
    const eng3Id = eng3Result.lastInsertRowid;
    counts.client_engagements++;
    auditLog(db, brokerId, 'CREATE', 'client_engagements', eng3Id,
      'Created engagement: Nomvula Sithole - New Business',
      { engagement_name: 'Nomvula Sithole - New Business', stage: 'Fact Find Completed' });
    counts.audit_log++;
    console.log('    Created client engagement id', eng3Id);

    // Policy POL-PROSPECT-003 (Hollard, Pending)
    const today = new Date().toISOString().split('T')[0];
    const pol3Result = db.prepare(`
      INSERT INTO policies (
        policy_name, contact_id,
        insurer, assigned_broker_id,
        policy_number, product_category,
        policy_type,
        inception_date,
        policy_status,
        created_by
      ) VALUES (
        'Nomvula Sithole - Personal Lines Prospect', ?,
        'Hollard', ?,
        'POL-PROSPECT-003', 'Personal Lines',
        'Personal',
        ?,
        'Pending',
        ?
      )
    `).run(nomvulaId, brokerId, today, adminId);
    const pol3Id = pol3Result.lastInsertRowid;
    counts.policies++;
    auditLog(db, brokerId, 'CREATE', 'policies', pol3Id,
      'Created pending policy POL-PROSPECT-003 for Nomvula Sithole',
      { policy_number: 'POL-PROSPECT-003', insurer: 'Hollard', policy_status: 'Pending' });
    counts.audit_log++;
    console.log('    Created policy POL-PROSPECT-003 id', pol3Id);

    // Policy Section — Household Contents with GAP
    // Gap logic: risk_exists=1, recommended_for_cover=1, implemented=0 => gap_identified must be 1
    const sec3Result = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, contact_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented,
        gap_identified, gap_severity,
        client_declined_recommendation,
        needs_analysis_status,
        created_by
      ) VALUES (
        'Household Contents - Prospect', ?, ?,
        'Household Contents', 'Personal Lines',
        1, 1, 0,
        1, 0,
        1, 'High',
        0,
        'Recommendation Made',
        ?
      )
    `).run(pol3Id, nomvulaId, adminId);
    const sec3Id = sec3Result.lastInsertRowid;
    counts.policy_sections++;
    auditLog(db, brokerId, 'CREATE', 'policy_sections', sec3Id,
      'Created policy section with gap: Household Contents (POL-PROSPECT-003)',
      { section_type: 'Household Contents', gap_identified: 1, gap_severity: 'High' });
    counts.audit_log++;
    console.log('    Created policy section with gap id', sec3Id, '(gap_identified=1, gap_severity=High)');

    console.log('\n  All records inserted. Transaction committing...');
  });

  // Execute transaction
  seedTransaction();
  console.log('Transaction committed successfully.\n');

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('=== SEED SUMMARY ===');
  console.log(`  Users created     : ${counts.users}`);
  console.log(`  Contacts          : ${counts.contacts}`);
  console.log(`  Accounts          : ${counts.accounts}`);
  console.log(`  Policies          : ${counts.policies}`);
  console.log(`  Policy Sections   : ${counts.policy_sections}`);
  console.log(`  Assets            : ${counts.assets}`);
  console.log(`  Risk Details      : ${counts.risk_details}`);
  console.log(`  Claims            : ${counts.claims}`);
  console.log(`  Client Engagements: ${counts.client_engagements}`);
  console.log(`  Audit Log Entries : ${counts.audit_log}`);
  console.log('');
  console.log('Test subjects seeded:');
  console.log('  Subject 1: Pieter van der Merwe (Personal Lines, Active Client, POL-2020-001 Santam)');
  console.log('  Subject 2: Van der Berg Logistics (Commercial Lines, Active Client, POL-2021-002 OUTsurance)');
  console.log('  Subject 3: Nomvula Sithole (Prospect, Gap flagged on Household Contents, POL-PROSPECT-003 Hollard)');
  console.log('');
  console.log('Test user credentials:');
  console.log('  broker_test  / broker123   (role: broker)');
  console.log('  admin_test   / admintest123 (role: admin_only)');
  console.log('');
  console.log('Done. Run node server/db/validate.js to verify.');
}

seedTests().catch(err => {
  console.error('\nTest seed FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
