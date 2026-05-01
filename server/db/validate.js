#!/usr/bin/env node
/**
 * Validation suite for the Inexpro CRM database.
 * Run AFTER test_seed.js: node server/db/validate.js
 *
 * Exits with code 0 if all checks pass, code 1 if any fail.
 */
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { initDb } = require('./database');

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function pass(description) {
  console.log(`  ✅ PASS: ${description}`);
  passed++;
}

function fail(description, reason) {
  console.log(`  ❌ FAIL: ${description} — ${reason}`);
  failed++;
  failures.push({ description, reason });
}

// ---------------------------------------------------------------------------
// Helper: get list of table names
// ---------------------------------------------------------------------------
function getTableNames(db) {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all().map(r => r.name);
}

// ---------------------------------------------------------------------------
// Helper: get list of column names for a table
// ---------------------------------------------------------------------------
function getColumnNames(db, tableName) {
  try {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map(r => r.name);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function runValidation() {
  console.log('=== INEXPRO CRM VALIDATION SUITE ===\n');

  const db = initDb();
  const tables = getTableNames(db);

  // =========================================================================
  // A. TABLE EXISTENCE
  // =========================================================================
  console.log('--- A. Table Existence ---');
  const requiredTables = [
    'users', 'contacts', 'accounts', 'client_engagements',
    'policies', 'policy_sections', 'assets', 'risk_details',
    'claims', 'advice_records', 'complaints', 'reviews',
    'documents', 'audit_log', 'saved_reports',
  ];
  for (const tbl of requiredTables) {
    if (tables.includes(tbl)) {
      pass(`Table '${tbl}' exists`);
    } else {
      fail(`Table '${tbl}' exists`, `Table not found in sqlite_master`);
    }
  }

  // =========================================================================
  // B. COLUMN CHECKS
  // =========================================================================
  console.log('\n--- B. Column Checks ---');

  const columnChecks = [
    {
      table: 'contacts',
      cols: ['popia_consent_obtained', 'fica_status', 'conduct_risk_flag', 'assigned_broker_id'],
    },
    {
      table: 'policy_sections',
      cols: ['gap_identified', 'risk_exists', 'recommended_for_cover', 'implemented', 'section_type'],
    },
    {
      table: 'claims',
      cols: ['delay_flag', 'fair_process_concern', 'claim_number'],
    },
    {
      table: 'audit_log',
      cols: ['user_id', 'action', 'module', 'record_id', 'old_value', 'new_value', 'timestamp'],
    },
    {
      table: 'documents',
      cols: ['file_path', 'file_name', 'file_type', 'uploaded_by', 'uploaded_at'],
    },
    {
      table: 'saved_reports',
      cols: ['config', 'creator_id', 'shared'],
    },
  ];

  for (const check of columnChecks) {
    const cols = getColumnNames(db, check.table);
    for (const col of check.cols) {
      if (cols.includes(col)) {
        pass(`Column '${check.table}.${col}' exists`);
      } else {
        fail(`Column '${check.table}.${col}' exists`, `Column not found in PRAGMA table_info(${check.table})`);
      }
    }
  }

  // =========================================================================
  // C. SEED DATA CHECKS
  // =========================================================================
  console.log('\n--- C. Seed Data Checks ---');

  // Subject 1
  const pieter = db.prepare(
    "SELECT id FROM contacts WHERE first_name = 'Pieter' AND last_name = 'van der Merwe'"
  ).get();
  if (pieter) {
    pass("Subject 1 contact exists (Pieter van der Merwe)");
  } else {
    fail("Subject 1 contact exists (Pieter van der Merwe)", "No row found with first_name='Pieter', last_name='van der Merwe'");
  }

  // Subject 2
  const vdberg = db.prepare(
    "SELECT id FROM accounts WHERE account_name LIKE '%Van der Berg%'"
  ).get();
  if (vdberg) {
    pass("Subject 2 account exists (Van der Berg Logistics)");
  } else {
    fail("Subject 2 account exists (Van der Berg Logistics)", "No account found matching LIKE '%Van der Berg%'");
  }

  // Subject 3
  const nomvula = db.prepare(
    "SELECT id FROM contacts WHERE first_name = 'Nomvula' AND last_name = 'Sithole'"
  ).get();
  if (nomvula) {
    pass("Subject 3 contact exists (Nomvula Sithole)");
  } else {
    fail("Subject 3 contact exists (Nomvula Sithole)", "No row found with first_name='Nomvula', last_name='Sithole'");
  }

  // Policy sections count
  const sectionCount = db.prepare("SELECT COUNT(*) AS cnt FROM policy_sections").get().cnt;
  if (sectionCount >= 3) {
    pass(`At least 3 policy sections exist (found ${sectionCount})`);
  } else {
    fail(`At least 3 policy sections exist`, `Only ${sectionCount} found`);
  }

  // Assets count
  const assetCount = db.prepare("SELECT COUNT(*) AS cnt FROM assets").get().cnt;
  if (assetCount >= 1) {
    pass(`At least 1 asset exists (found ${assetCount})`);
  } else {
    fail(`At least 1 asset exists`, `0 assets found`);
  }

  // Risk details count
  const riskCount = db.prepare("SELECT COUNT(*) AS cnt FROM risk_details").get().cnt;
  if (riskCount >= 1) {
    pass(`At least 1 risk detail exists (found ${riskCount})`);
  } else {
    fail(`At least 1 risk detail exists`, `0 risk details found`);
  }

  // Claim CLM-2023-001
  const clm = db.prepare("SELECT id FROM claims WHERE claim_number = 'CLM-2023-001'").get();
  if (clm) {
    pass("Claim CLM-2023-001 exists");
  } else {
    fail("Claim CLM-2023-001 exists", "No claim found with claim_number='CLM-2023-001'");
  }

  // =========================================================================
  // D. FOREIGN KEY INTEGRITY
  // =========================================================================
  console.log('\n--- D. Foreign Key Integrity ---');

  // contacts.assigned_broker_id -> users.id
  const orphanContactBroker = db.prepare(`
    SELECT COUNT(*) AS cnt FROM contacts
    WHERE assigned_broker_id IS NOT NULL
      AND assigned_broker_id NOT IN (SELECT id FROM users)
  `).get().cnt;
  if (orphanContactBroker === 0) {
    pass("All contacts.assigned_broker_id values reference valid users");
  } else {
    fail("All contacts.assigned_broker_id values reference valid users",
      `${orphanContactBroker} contact(s) reference non-existent user IDs`);
  }

  // policies.assigned_broker_id -> users.id
  const orphanPolicyBroker = db.prepare(`
    SELECT COUNT(*) AS cnt FROM policies
    WHERE assigned_broker_id NOT IN (SELECT id FROM users)
  `).get().cnt;
  if (orphanPolicyBroker === 0) {
    pass("All policies.assigned_broker_id values reference valid users");
  } else {
    fail("All policies.assigned_broker_id values reference valid users",
      `${orphanPolicyBroker} policy/policies reference non-existent user IDs`);
  }

  // policy_sections.policy_id -> policies.id
  const orphanSectionPolicy = db.prepare(`
    SELECT COUNT(*) AS cnt FROM policy_sections
    WHERE policy_id NOT IN (SELECT id FROM policies)
  `).get().cnt;
  if (orphanSectionPolicy === 0) {
    pass("All policy_sections.policy_id values reference valid policies");
  } else {
    fail("All policy_sections.policy_id values reference valid policies",
      `${orphanSectionPolicy} section(s) reference non-existent policy IDs`);
  }

  // assets.contact_id -> contacts.id (where not null)
  const orphanAssetContact = db.prepare(`
    SELECT COUNT(*) AS cnt FROM assets
    WHERE contact_id IS NOT NULL
      AND contact_id NOT IN (SELECT id FROM contacts)
  `).get().cnt;
  if (orphanAssetContact === 0) {
    pass("All assets.contact_id (non-null) values reference valid contacts");
  } else {
    fail("All assets.contact_id (non-null) values reference valid contacts",
      `${orphanAssetContact} asset(s) reference non-existent contact IDs`);
  }

  // risk_details.policy_section_id -> policy_sections.id
  const orphanRiskSection = db.prepare(`
    SELECT COUNT(*) AS cnt FROM risk_details
    WHERE policy_section_id NOT IN (SELECT id FROM policy_sections)
  `).get().cnt;
  if (orphanRiskSection === 0) {
    pass("All risk_details.policy_section_id values reference valid policy_sections");
  } else {
    fail("All risk_details.policy_section_id values reference valid policy_sections",
      `${orphanRiskSection} risk detail(s) reference non-existent section IDs`);
  }

  // claims.policy_id -> policies.id
  const orphanClaimPolicy = db.prepare(`
    SELECT COUNT(*) AS cnt FROM claims
    WHERE policy_id NOT IN (SELECT id FROM policies)
  `).get().cnt;
  if (orphanClaimPolicy === 0) {
    pass("All claims.policy_id values reference valid policies");
  } else {
    fail("All claims.policy_id values reference valid policies",
      `${orphanClaimPolicy} claim(s) reference non-existent policy IDs`);
  }

  // =========================================================================
  // E. REQUIRED FIELD CHECKS
  // =========================================================================
  console.log('\n--- E. Required Field Checks ---');

  // contacts required fields
  const contactsMissingFields = db.prepare(`
    SELECT COUNT(*) AS cnt FROM contacts
    WHERE first_name IS NULL OR first_name = ''
       OR last_name IS NULL OR last_name = ''
       OR contact_type IS NULL OR contact_type = ''
       OR client_category IS NULL OR client_category = ''
       OR contact_status IS NULL OR contact_status = ''
  `).get().cnt;
  if (contactsMissingFields === 0) {
    pass("All contacts have required fields (first_name, last_name, contact_type, client_category, contact_status)");
  } else {
    fail("All contacts have required fields",
      `${contactsMissingFields} contact(s) missing one or more required fields`);
  }

  // policies required fields
  const policiesMissingFields = db.prepare(`
    SELECT COUNT(*) AS cnt FROM policies
    WHERE policy_name IS NULL OR policy_name = ''
       OR insurer IS NULL OR insurer = ''
       OR policy_number IS NULL OR policy_number = ''
       OR inception_date IS NULL OR inception_date = ''
  `).get().cnt;
  if (policiesMissingFields === 0) {
    pass("All policies have required fields (policy_name, insurer, policy_number, inception_date)");
  } else {
    fail("All policies have required fields",
      `${policiesMissingFields} policy/policies missing one or more required fields`);
  }

  // policy_sections required fields
  const sectionsMissingFields = db.prepare(`
    SELECT COUNT(*) AS cnt FROM policy_sections
    WHERE section_name IS NULL OR section_name = ''
       OR section_type IS NULL OR section_type = ''
       OR section_category IS NULL OR section_category = ''
  `).get().cnt;
  if (sectionsMissingFields === 0) {
    pass("All policy_sections have required fields (section_name, section_type, section_category)");
  } else {
    fail("All policy_sections have required fields",
      `${sectionsMissingFields} section(s) missing one or more required fields`);
  }

  // claims required fields
  const claimsMissingFields = db.prepare(`
    SELECT COUNT(*) AS cnt FROM claims
    WHERE claim_number IS NULL OR claim_number = ''
       OR claim_date IS NULL OR claim_date = ''
       OR date_reported IS NULL OR date_reported = ''
       OR claim_type IS NULL OR claim_type = ''
       OR incident_description IS NULL OR incident_description = ''
  `).get().cnt;
  if (claimsMissingFields === 0) {
    pass("All claims have required fields (claim_number, claim_date, date_reported, claim_type, incident_description)");
  } else {
    fail("All claims have required fields",
      `${claimsMissingFields} claim(s) missing one or more required fields`);
  }

  // =========================================================================
  // F. PICKLIST VALUE CHECKS
  // =========================================================================
  console.log('\n--- F. Picklist Value Checks ---');

  const allowedContactTypes = [
    'Individual Client', 'Business Contact Person', 'Trustee',
    'Member', 'Director', 'Employee Contact', 'Supplier', 'Other',
  ];
  const allowedContactStatuses = [
    'Prospect', 'Active Client', 'Inactive Client',
    'Former Client', 'Do Not Service', 'Deceased',
    '3rd Party', 'Co-Insured', 'Contact', 'Other',
  ];
  const allowedPolicyStatuses = [
    'Pending', 'Active', 'Amended', 'Cancelled', 'Lapsed', 'Expired',
  ];
  const allowedSectionCategories = [
    'Personal Lines', 'Commercial Lines', 'Transport', 'Liability', 'Specialist',
  ];

  // contacts.contact_type
  const allContactTypes = db.prepare("SELECT DISTINCT contact_type FROM contacts").all().map(r => r.contact_type);
  const invalidContactTypes = allContactTypes.filter(v => !allowedContactTypes.includes(v));
  if (invalidContactTypes.length === 0) {
    pass("All contacts.contact_type values are valid picklist entries");
  } else {
    fail("All contacts.contact_type values are valid picklist entries",
      `Invalid values found: ${invalidContactTypes.join(', ')}`);
  }

  // contacts.contact_status
  const allContactStatuses = db.prepare("SELECT DISTINCT contact_status FROM contacts").all().map(r => r.contact_status);
  const invalidContactStatuses = allContactStatuses.filter(v => !allowedContactStatuses.includes(v));
  if (invalidContactStatuses.length === 0) {
    pass("All contacts.contact_status values are valid picklist entries");
  } else {
    fail("All contacts.contact_status values are valid picklist entries",
      `Invalid values found: ${invalidContactStatuses.join(', ')}`);
  }

  // policies.policy_status
  const allPolicyStatuses = db.prepare("SELECT DISTINCT policy_status FROM policies").all().map(r => r.policy_status);
  const invalidPolicyStatuses = allPolicyStatuses.filter(v => !allowedPolicyStatuses.includes(v));
  if (invalidPolicyStatuses.length === 0) {
    pass("All policies.policy_status values are valid picklist entries");
  } else {
    fail("All policies.policy_status values are valid picklist entries",
      `Invalid values found: ${invalidPolicyStatuses.join(', ')}`);
  }

  // policy_sections.section_category
  const allSectionCategories = db.prepare("SELECT DISTINCT section_category FROM policy_sections").all().map(r => r.section_category);
  const invalidSectionCategories = allSectionCategories.filter(v => !allowedSectionCategories.includes(v));
  if (invalidSectionCategories.length === 0) {
    pass("All policy_sections.section_category values are valid picklist entries");
  } else {
    fail("All policy_sections.section_category values are valid picklist entries",
      `Invalid values found: ${invalidSectionCategories.join(', ')}`);
  }

  // =========================================================================
  // G. GAP LOGIC CHECK (critical)
  // =========================================================================
  console.log('\n--- G. Gap Logic Check ---');

  // Find Nomvula's policy section with the gap scenario
  const gapSection = db.prepare(`
    SELECT ps.id, ps.gap_identified, ps.gap_severity, ps.needs_analysis_status
    FROM policy_sections ps
    JOIN policies p ON ps.policy_id = p.id
    JOIN contacts c ON p.contact_id = c.id
    WHERE c.first_name = 'Nomvula'
      AND c.last_name = 'Sithole'
      AND ps.risk_exists = 1
      AND ps.recommended_for_cover = 1
      AND ps.implemented = 0
  `).get();

  if (!gapSection) {
    fail("Subject 3 gap section found (risk_exists=1, recommended_for_cover=1, implemented=0)",
      "No such policy section found for Nomvula Sithole");
  } else {
    pass("Subject 3 gap section found (risk_exists=1, recommended_for_cover=1, implemented=0)");

    if (gapSection.gap_identified === 1) {
      pass(`Gap section has gap_identified=1 (section id ${gapSection.id})`);
    } else {
      fail(`Gap section has gap_identified=1 (section id ${gapSection.id})`,
        `gap_identified is ${gapSection.gap_identified}, expected 1`);
    }

    if (gapSection.gap_severity === 'High') {
      pass(`Gap section has gap_severity='High'`);
    } else {
      fail(`Gap section has gap_severity='High'`,
        `gap_severity is '${gapSection.gap_severity}', expected 'High'`);
    }

    if (gapSection.needs_analysis_status === 'Recommendation Made') {
      pass(`Gap section has needs_analysis_status='Recommendation Made'`);
    } else {
      fail(`Gap section has needs_analysis_status='Recommendation Made'`,
        `needs_analysis_status is '${gapSection.needs_analysis_status}'`);
    }
  }

  // =========================================================================
  // H. AUDIT LOG CHECK
  // =========================================================================
  console.log('\n--- H. Audit Log Check ---');

  const auditTotal = db.prepare("SELECT COUNT(*) AS cnt FROM audit_log").get().cnt;
  if (auditTotal >= 10) {
    pass(`Audit log has at least 10 entries (found ${auditTotal})`);
  } else {
    fail(`Audit log has at least 10 entries`, `Only ${auditTotal} entries found`);
  }

  const auditContactCreate = db.prepare(
    "SELECT COUNT(*) AS cnt FROM audit_log WHERE action = 'CREATE' AND module = 'contacts'"
  ).get().cnt;
  if (auditContactCreate >= 1) {
    pass(`Audit log has at least 1 CREATE entry for module='contacts' (found ${auditContactCreate})`);
  } else {
    fail(`Audit log has at least 1 CREATE entry for module='contacts'`,
      `No entries found with action='CREATE' AND module='contacts'`);
  }

  const auditPolicyCreate = db.prepare(
    "SELECT COUNT(*) AS cnt FROM audit_log WHERE action = 'CREATE' AND module = 'policies'"
  ).get().cnt;
  if (auditPolicyCreate >= 1) {
    pass(`Audit log has at least 1 CREATE entry for module='policies' (found ${auditPolicyCreate})`);
  } else {
    fail(`Audit log has at least 1 CREATE entry for module='policies'`,
      `No entries found with action='CREATE' AND module='policies'`);
  }

  // =========================================================================
  // I. SAVED REPORTS TEST
  // =========================================================================
  console.log('\n--- I. Saved Reports Test ---');

  const testReportConfig = JSON.stringify({
    source: 'contacts',
    columns: ['first_name', 'last_name'],
    filters: [],
    joins: [],
    sort_field: 'last_name',
    sort_dir: 'asc',
  });

  // Ensure creator user id=1 exists
  const creatorUser = db.prepare("SELECT id FROM users WHERE id = 1").get();
  if (!creatorUser) {
    fail("Saved reports test — creator user id=1 exists for insert", "No user with id=1 found");
  } else {
    // Insert test report
    let testReportId;
    try {
      const insertResult = db.prepare(`
        INSERT INTO saved_reports (name, config, shared, report_type, creator_id)
        VALUES (?, ?, ?, ?, ?)
      `).run('Validation Test Report', testReportConfig, 0, 'custom', 1);
      testReportId = insertResult.lastInsertRowid;
      pass("Test saved report inserted successfully");
    } catch (err) {
      fail("Test saved report inserted successfully", err.message);
    }

    if (testReportId) {
      // Read it back
      const savedReport = db.prepare(
        "SELECT * FROM saved_reports WHERE id = ?"
      ).get(testReportId);

      if (!savedReport) {
        fail("Test saved report can be read back", "Row not found after insert");
      } else {
        pass("Test saved report can be read back");

        if (savedReport.config === testReportConfig) {
          pass("Test saved report config matches what was inserted");
        } else {
          fail("Test saved report config matches what was inserted",
            `Config mismatch. Got: ${savedReport.config}`);
        }

        if (savedReport.name === 'Validation Test Report') {
          pass("Test saved report name is correct");
        } else {
          fail("Test saved report name is correct",
            `Expected 'Validation Test Report', got '${savedReport.name}'`);
        }

        if (savedReport.shared === 0) {
          pass("Test saved report shared=0");
        } else {
          fail("Test saved report shared=0", `shared is ${savedReport.shared}`);
        }

        // Clean up test report
        db.prepare("DELETE FROM saved_reports WHERE id = ?").run(testReportId);
        pass("Test saved report cleaned up after validation");
      }
    }
  }

  // =========================================================================
  // J. DOCUMENTS TABLE STRUCTURE (double-check)
  // =========================================================================
  console.log('\n--- J. Documents Table Structure ---');

  const docCols = getColumnNames(db, 'documents');
  const requiredDocCols = ['file_path', 'file_name', 'file_type', 'uploaded_by', 'uploaded_at'];
  for (const col of requiredDocCols) {
    if (docCols.includes(col)) {
      pass(`documents.${col} column confirmed present`);
    } else {
      fail(`documents.${col} column confirmed present`,
        `Column '${col}' not found in PRAGMA table_info(documents)`);
    }
  }

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('\n==============================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('==============================');

  if (failures.length > 0) {
    console.log('\n--- Remediation Hints ---');
    for (const f of failures) {
      console.log(`\n  FAIL: ${f.description}`);
      console.log(`  Reason: ${f.reason}`);

      // Table-specific hints
      if (f.description.includes("Table '")) {
        const tblMatch = f.description.match(/Table '(\w+)'/);
        if (tblMatch) {
          console.log(`  Hint: Run 'node server/db/test_seed.js' which calls initDb() to apply schema.sql.`);
          console.log(`        Check schema.sql for the CREATE TABLE IF NOT EXISTS ${tblMatch[1]} statement.`);
        }
      } else if (f.description.includes("Column '")) {
        console.log(`  Hint: The column may be missing from schema.sql. Inspect the CREATE TABLE block and re-run initDb().`);
      } else if (f.description.includes("Pieter") || f.description.includes("Van der Berg") || f.description.includes("Nomvula")) {
        console.log(`  Hint: Run 'node server/db/test_seed.js' to populate test data.`);
        console.log(`        Check that the seed did not exit early due to a pre-existing broker_test user from a partial run.`);
        console.log(`        To re-seed: DELETE FROM users WHERE username='broker_test'; then re-run test_seed.js.`);
      } else if (f.description.includes("gap_identified")) {
        console.log(`  Hint: The gap section must have gap_identified=1 when risk_exists=1, recommended_for_cover=1, implemented=0.`);
        console.log(`        Check Section 17 gap logic in test_seed.js and ensure the INSERT sets gap_identified=1 explicitly.`);
      } else if (f.description.includes("audit_log")) {
        console.log(`  Hint: test_seed.js inserts audit_log entries via auditLog() after each record creation.`);
        console.log(`        Verify the transaction committed successfully and audit_log entries were not rolled back.`);
      } else if (f.description.includes("saved_reports")) {
        console.log(`  Hint: Ensure the saved_reports table exists and schema.sql includes the config, creator_id, shared columns.`);
        console.log(`        Verify user id=1 exists (run node server/db/seed.js first, then test_seed.js).`);
      } else if (f.description.includes("foreign key") || f.description.includes("reference")) {
        console.log(`  Hint: Foreign key violations usually indicate inserts were done in wrong order or IDs were not captured.`);
        console.log(`        Verify PRAGMA foreign_keys = ON in database.js and check test_seed.js insert order.`);
      } else if (f.description.includes("picklist")) {
        console.log(`  Hint: Check the inserted value against the CHECK constraint in schema.sql.`);
        console.log(`        SQLite CHECK constraints are enforced; if the seed ran, the value is likely valid.`);
        console.log(`        A mismatch here may mean data was inserted outside test_seed.js with an invalid value.`);
      } else if (f.description.includes("required field")) {
        console.log(`  Hint: One or more records are missing NOT NULL fields. Re-run test_seed.js on a fresh database.`);
        console.log(`        Check for any manual inserts that may have omitted required columns.`);
      } else {
        console.log(`  Hint: Inspect the relevant table and test_seed.js insertion logic for this module.`);
      }
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('\nAll checks passed. Database is correctly seeded and structured.');
    process.exit(0);
  }
}

try {
  runValidation();
} catch (err) {
  console.error('\nValidation script encountered an unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
}
