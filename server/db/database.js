const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { runMigrations } = require('./migrate');

const dbPath = path.resolve(process.env.DB_PATH || './server/db/inexpro.db');
const schemaPath = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('wal_autocheckpoint = 100');
    // Checkpoint now to consolidate any accumulated WAL
    db.pragma('wal_checkpoint(TRUNCATE)');
  }
  return db;
}

function initDb() {
  const database = getDb();
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Strip comment lines and split on semicolons
  const allStatements = schema
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // PRAGMA statements must run outside a transaction
  const pragmas = allStatements.filter(s => s.toUpperCase().startsWith('PRAGMA'));
  const ddl = allStatements.filter(s => !s.toUpperCase().startsWith('PRAGMA'));

  for (const p of pragmas) {
    try { database.prepare(p + ';').run(); } catch (_) {}
  }

  const initTransaction = database.transaction(() => {
    for (const stmt of ddl) {
      try {
        database.prepare(stmt + ';').run();
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('duplicate column')) {
          throw err;
        }
      }
    }
  });

  initTransaction();

  // ── Migrations ──────────────────────────────────────────────────────────
  // Rename broker_code → mm_number in assets
  try {
    const cols = database.prepare("PRAGMA table_info(assets)").all();
    const hasBrokerCode = cols.some(c => c.name === 'broker_code');
    const hasMmNumber   = cols.some(c => c.name === 'mm_number');
    if (hasBrokerCode && !hasMmNumber) {
      database.prepare('ALTER TABLE assets RENAME COLUMN broker_code TO mm_number').run();
    }
  } catch (_) {}

  // Create system_settings table
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (_) {}

  // Add asset_value column to assets
  try {
    const assetCols = database.prepare('PRAGMA table_info(assets)').all();
    if (!assetCols.some(c => c.name === 'asset_value')) {
      database.prepare('ALTER TABLE assets ADD COLUMN asset_value REAL').run();
    }
  } catch (_) {}

  // Add claims_handler_name text column to claims
  try {
    const claimCols = database.prepare('PRAGMA table_info(claims)').all();
    if (!claimCols.some(c => c.name === 'claims_handler_name')) {
      database.prepare('ALTER TABLE claims ADD COLUMN claims_handler_name TEXT').run();
    }
  } catch (_) {}

  // Add excess percentage columns to policy_sections
  try {
    const psCols = database.prepare('PRAGMA table_info(policy_sections)').all();
    const newPsCols = [
      ['excess_pct_claim',  'REAL'],
      ['excess_pct_insured','REAL'],
      ['minimum_excess',    'REAL'],
    ];
    for (const [col, type] of newPsCols) {
      if (!psCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE policy_sections ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // Add excess columns to claims
  try {
    const claimCols2 = database.prepare('PRAGMA table_info(claims)').all();
    const newClaimCols = [
      ['excess',                 'REAL'],
      ['excess_pct_claim',       'REAL'],
      ['excess_pct_insured',     'REAL'],
      ['minimum_excess',         'REAL'],
      ['claim_related_contacts', 'TEXT'],  // JSON array of {contact_type, name, cell, email}
      // Driver Details (Motor / GIT claims)
      ['driver_name',            'TEXT'],
      ['driver_id_number',       'TEXT'],
      ['driver_licence_number',  'TEXT'],
      ['driver_licence_code',    'TEXT'],
      ['driver_cell',            'TEXT'],
      ['driver_relationship',    'TEXT'],
      ['driver_date_of_birth',   'DATE'],
      ['driver_years_experience','INTEGER'],
    ];
    for (const [col, type] of newClaimCols) {
      if (!claimCols2.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE claims ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // Add per-asset financial + address + section columns to assets
  try {
    const assetCols2 = database.prepare('PRAGMA table_info(assets)').all();
    const newAssetCols = [
      ['premium',       'REAL'],
      ['sasria',        'REAL'],
      ['excess',        'REAL'],
      ['address',       'TEXT'],
      ['suburb',        'TEXT'],
      ['city',          'TEXT'],
      ['province',      'TEXT'],
      ['postal_code',   'TEXT'],
      ['asset_section', 'TEXT'],
      // ── Section-specific fields (from /new_fields spec) ──
      // Motor / Vehicle
      ['use_type',              'TEXT'],     // Private, Business, Dual, Hire, Courtesy
      ['gvm',                   'TEXT'],     // Gross Vehicle Mass
      ['tracking_device',       'TEXT'],     // Tracking device installed
      ['territory',             'TEXT'],     // SA only, Cross-border, SADC
      ['cover_type',            'TEXT'],     // Comprehensive, Third Party, etc.
      ['regular_driver',        'TEXT'],     // Regular driver name
      ['credit_shortfall',      'INTEGER'],  // 0/1 boolean
      // Fire / Buildings
      ['construction_type',     'TEXT'],     // Brick, Wood, Steel, etc.
      ['roof_type',             'TEXT'],     // Tile, Metal, Thatch, etc.
      ['occupancy',             'TEXT'],     // Residential, Commercial, Mixed
      ['flat_no_floors',        'TEXT'],     // Number of floors / flat number
      ['perils_covered',        'TEXT'],     // Fire, Storm, Flood, etc.
      ['subsidence_cover',      'INTEGER'],  // 0/1
      ['geyser_cover',          'INTEGER'],  // 0/1
      ['security_measures',     'TEXT'],     // Alarm, Armed Response, etc.
      // Contents / Householders
      ['contents_category',     'TEXT'],     // Household, Office, Business
      ['unspecified_items',     'REAL'],     // Total unspecified items value
      ['specified_items',       'REAL'],     // Total specified items value
      ['theft_extension',       'INTEGER'],  // 0/1
      ['power_surge_cover',     'INTEGER'],  // 0/1
      // Stock / Deterioration
      ['stock_category',        'TEXT'],     // Raw, Finished, WIP, Perishable
      ['declaration_basis',     'TEXT'],     // Monthly, Annual, etc.
      ['cold_storage',          'INTEGER'],  // 0/1
      ['avg_stock_value',       'REAL'],     // Average stock value
      ['max_stock_value',       'REAL'],     // Maximum stock value
      // Electronic Equipment / Machinery
      ['replacement_value',     'REAL'],     // Replacement / reinstatement value
      ['portable',              'INTEGER'],  // 0/1 is portable
      ['maintenance_contract',  'INTEGER'],  // 0/1
      ['breakdown_cover',       'INTEGER'],  // 0/1
      // Watercraft / Pleasure Craft
      ['vessel_name',           'TEXT'],
      ['vessel_type',           'TEXT'],     // Yacht, Ski boat, PWC, etc.
      ['hull_length',           'TEXT'],     // LOA
      ['motor_details',         'TEXT'],     // Outboard, Inboard, HP, etc.
      ['mooring',               'TEXT'],     // Where moored/stored
      ['navigational_limits',   'TEXT'],     // Inland, Coastal 50nm, etc.
      ['skipper_qualification',  'TEXT'],
      // Livestock / Game
      ['breed',                 'TEXT'],
      ['gender',                'TEXT'],     // Male, Female, Mixed
      ['animal_count',          'INTEGER'],
      ['identification_method', 'TEXT'],     // Brand, Microchip, Ear tag
      ['premises_address',      'TEXT'],     // Where kept
      // Goods in Transit (GIT)
      ['commodity',             'TEXT'],     // Type of goods
      ['conveyance_type',       'TEXT'],     // Own vehicle, Contractor, Rail
      ['route',                 'TEXT'],     // Normal route description
      ['max_single_load',       'REAL'],     // Max value per single load
      // Liability fields
      ['limit_of_indemnity',    'REAL'],     // Limit of indemnity
      ['aggregate_limit',       'REAL'],     // Annual aggregate
      ['business_activity',     'TEXT'],     // Description of business
      ['turnover',              'REAL'],     // Annual turnover
      ['employee_count',        'INTEGER'],  // Number of employees
      ['retroactive_date',      'DATE'],     // Retroactive date for claims-made
      ['trigger_basis',         'TEXT'],     // Occurrence, Claims-made
      ['defence_costs',         'TEXT'],     // Included in limit, In addition to
      // General / Shared
      ['conditions',            'TEXT'],     // Special conditions / warranties
      ['extensions',            'TEXT'],     // Extensions / endorsements
      ['exclusions',            'TEXT'],     // Specific exclusions
      ['sum_insured',           'REAL'],     // Separate sum insured field
      ['basis_of_cover',        'TEXT'],     // Replacement, Market, Agreed, Indemnity
      ['excess_pct_claim',      'REAL'],     // Optional: excess as % of claim value
      ['excess_pct_insured',    'REAL'],     // Optional: excess as % of insured value
      ['minimum_excess',        'REAL'],     // Minimum excess amount in Rands (for % types)
      ['vehicle_extras',        'TEXT'],     // JSON array of {name, amount} vehicle extras
      ['extras_in_total',       'INTEGER'],  // 1 if extras included in total asset value
      // Financial Interest (vehicles)
      ['financial_interest_noted', 'INTEGER'],  // 0/1 boolean
      ['financial_institution',    'TEXT'],     // Name of financial institution
      ['finance_contract_number',  'TEXT'],     // Finance contract number
      ['contract_expiry_date',     'DATE'],     // Contract expiry date
      // Vehicle Risk Details (vehicles)
      ['parking_type',             'TEXT'],     // Locked Garage, Behind Gates, Access Control, Open Carport, Street, Other
      ['parking_other',            'TEXT'],     // Free-text when parking_type = Other
      ['tracker_fitted',           'TEXT'],     // Yes / No
      ['vehicle_use',              'TEXT'],     // Private, Business, Private & Business
      // Related Contacts (all asset types)
      ['related_contacts',         'TEXT'],     // JSON array of {contact_type, name, cell, email}
      // Premium tied to sum insured (contributes to auto-calculated asset premium)
      ['sum_insured_premium',      'REAL'],
      // Item Number (Core Details)
      ['item_number',              'TEXT'],
    ];
    for (const [col, type] of newAssetCols) {
      if (!assetCols2.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE assets ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: update assets table CHECK constraints ────────────────────
  // The old schema used short type/status values ('Vehicle','Building',etc.).
  // The new UI uses descriptive values ('Motor Vehicle','Building / Structure',etc.).
  // Detect old constraint by attempting to insert a new-style value; if it
  // fails the constraint is still in place and we recreate the table.
  try {
    const testStmt = database.prepare(
      `INSERT INTO assets (asset_name, asset_type, asset_status) VALUES ('__chk__','Motor Vehicle','Active')`
    );
    try {
      testStmt.run();
      database.prepare(`DELETE FROM assets WHERE asset_name = '__chk__'`).run();
      // Insert succeeded — constraint is already updated or absent, nothing to do
    } catch (_constraintErr) {
      // Old CHECK constraint in place — recreate table with value mapping
      database.pragma('foreign_keys = OFF');
      database.exec(`
        CREATE TABLE assets_new (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_name         TEXT NOT NULL,
          contact_id         INTEGER REFERENCES contacts(id),
          account_id         INTEGER REFERENCES accounts(id),
          policy_id          INTEGER REFERENCES policies(id),
          policy_section_id  INTEGER REFERENCES policy_sections(id),
          asset_type         TEXT NOT NULL,
          asset_status       TEXT NOT NULL DEFAULT 'Active',
          registration_number TEXT,
          vin_number         TEXT,
          engine_number      TEXT,
          make               TEXT,
          model              TEXT,
          year               INTEGER,
          serial_number      TEXT,
          date_acquired      DATE,
          date_sold          DATE,
          mm_number          TEXT,
          notes              TEXT,
          created_by         INTEGER REFERENCES users(id),
          created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO assets_new
          SELECT
            id, asset_name, contact_id, account_id, policy_id, policy_section_id,
            CASE asset_type
              WHEN 'Vehicle'        THEN 'Motor Vehicle'
              WHEN 'Trailer'        THEN 'Caravan / Trailer'
              WHEN 'Building'       THEN 'Building / Structure'
              WHEN 'Equipment'      THEN 'Plant & Equipment'
              WHEN 'Electronic Item' THEN 'Electronic Equipment'
              WHEN 'Plant'          THEN 'Plant & Equipment'
              ELSE asset_type
            END,
            CASE asset_status
              WHEN 'Pending'  THEN 'Active'
              WHEN 'Removed'  THEN 'Decommissioned'
              WHEN 'Inactive' THEN 'Decommissioned'
              ELSE asset_status
            END,
            registration_number, vin_number, engine_number, make, model, year,
            serial_number, date_acquired, date_sold, mm_number, notes,
            created_by, created_at, updated_at
          FROM assets;

        DROP TABLE assets;
        ALTER TABLE assets_new RENAME TO assets;
      `);
      database.pragma('foreign_keys = ON');
    }
  } catch (_) {}

  // ── Migration: add fleet_number to assets ──────────────────────────────
  try {
    const assetColsCheck = database.prepare("PRAGMA table_info(assets)").all();
    if (!assetColsCheck.some(c => c.name === 'fleet_number')) {
      database.prepare("ALTER TABLE assets ADD COLUMN fleet_number TEXT").run();
    }
  } catch (_) {}

  // ── Migration: add excesses (JSON array of {type, amount}) to assets ──
  try {
    const assetColsCheck = database.prepare("PRAGMA table_info(assets)").all();
    if (!assetColsCheck.some(c => c.name === 'excesses')) {
      database.prepare("ALTER TABLE assets ADD COLUMN excesses TEXT").run();
    }
  } catch (_) {}

  // ── Migration: drop restrictive CHECK constraints ───────────────────
  // writable_schema is blocked on some SQLite builds, so we rebuild the
  // table instead.  We test-insert a new value and if it's rejected by the
  // old CHECK we know we need to rebuild.  The new table keeps all columns
  // but removes the CHECK on the specific column.

  function dropColumnCheck(tableName, testCol, testVal, dummyRow) {
    try {
      // Quick probe: can we insert the value?
      const probe = database.prepare(
        `INSERT INTO ${tableName} (${Object.keys(dummyRow).join(',')}) VALUES (${Object.keys(dummyRow).map(() => '?').join(',')})`
      );
      try {
        probe.run(...Object.values(dummyRow));
        // Succeeded — constraint already allows the value, clean up
        database.prepare(`DELETE FROM ${tableName} WHERE ${testCol} = ? AND ${Object.keys(dummyRow)[0]} = ?`)
          .run(testVal, Object.values(dummyRow)[0]);
        return;
      } catch (probeErr) {
        if (!probeErr.message.includes('CHECK constraint')) return; // some other error
      }

      // Need to rebuild: read existing columns, recreate table without CHECKs on this column
      const cols = database.prepare(`PRAGMA table_info(${tableName})`).all();
      const colNames = cols.map(c => c.name).join(', ');

      database.pragma('foreign_keys = OFF');
      database.exec(`
        CREATE TABLE __tmp_${tableName} AS SELECT * FROM ${tableName};
        DROP TABLE ${tableName};
      `);

      // Read and rebuild CREATE TABLE without the CHECK on testCol
      // Easiest: read current schema, strip CHECK for the column
      // Since we dropped the table, we re-create from schema.sql pattern
      // but actually we just need to create without CHECKs — use a generic approach
      const colDefs = cols.map(c => {
        let def = `${c.name} ${c.type || 'TEXT'}`;
        if (c.notnull && !c.pk) def += ' NOT NULL';
        if (c.pk) def += ' PRIMARY KEY';
        if (c.pk && tableName !== 'audit_log') def += ' AUTOINCREMENT';
        if (c.dflt_value !== null) def += ` DEFAULT ${c.dflt_value}`;
        return def;
      }).join(', ');

      database.exec(`CREATE TABLE ${tableName} (${colDefs})`);
      database.exec(`INSERT INTO ${tableName} SELECT ${colNames} FROM __tmp_${tableName}`);
      database.exec(`DROP TABLE __tmp_${tableName}`);
      database.pragma('foreign_keys = ON');

      console.log(`dropColumnCheck: rebuilt ${tableName} to remove CHECK on ${testCol}`);
    } catch (err) {
      try { database.pragma('foreign_keys = ON'); } catch (_) {}
      console.error(`dropColumnCheck(${tableName}.${testCol}) failed:`, err.message);
    }
  }

  // client_engagements — widen client_decision to allow 'Pending'
  dropColumnCheck('client_engagements', 'client_decision', 'Pending', {
    engagement_name: '__chk__', assigned_broker_id: 1,
    engagement_type: 'New Business', stage: 'Prospect', client_decision: 'Pending'
  });

  // client_engagements — widen engagement_type to allow 'Enquiry'
  dropColumnCheck('client_engagements', 'engagement_type', 'Enquiry', {
    engagement_name: '__chk__', assigned_broker_id: 1,
    engagement_type: 'Enquiry', stage: 'Prospect'
  });

  // advice_records — widen trigger_event to allow 'Enquiry'
  dropColumnCheck('advice_records', 'trigger_event', 'Enquiry', {
    advice_record_number: '__chk__', broker_id: 1, prepared_by_id: 1,
    advice_date: '2020-01-01', advice_type: 'New Business',
    client_needs_identified: 'x', risk_analysis_summary: 'x',
    recommendation_given: 'x', reason_product_suitable: 'x',
    trigger_event: 'Enquiry'
  });

  // advice_records — widen client_decision to allow 'Pending'
  dropColumnCheck('advice_records', 'client_decision', 'Pending', {
    advice_record_number: '__chk2__', broker_id: 1, prepared_by_id: 1,
    advice_date: '2020-01-01', advice_type: 'New Business',
    client_needs_identified: 'x', risk_analysis_summary: 'x',
    recommendation_given: 'x', reason_product_suitable: 'x',
    client_decision: 'Pending'
  });

  // ── Migration: add banking/payment fields to policies ──────────────────
  try {
    const polCols = database.prepare('PRAGMA table_info(policies)').all();
    const newPolCols = [
      ['payment_method',         'TEXT'],
      ['premium_frequency',      'TEXT'],
      ['debit_order_date',       'TEXT'],
      ['bank_name',              'TEXT'],
      ['branch_code',            'TEXT'],
      ['account_number_enc',     'TEXT'],
      ['account_type',           'TEXT'],
      ['account_holder_name',    'TEXT'],
      ['mandate_status',         'TEXT'],
      ['mandate_auth_date',      'DATE'],
      ['debit_order_reference',  'TEXT'],
      ['co_insured',             'TEXT'],
      ['co_insured_id_number',   'TEXT'],
    ];
    for (const [col, type] of newPolCols) {
      if (!polCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE policies ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: add new personal detail fields to contacts ───────────────
  try {
    const contactCols = database.prepare('PRAGMA table_info(contacts)').all();
    const newContactCols = [
      ['title',                    'TEXT'],
      ['gender',                   'TEXT'],
      ['language',                 'TEXT'],
      ['marital_status',           'TEXT'],
      ['occupation',               'TEXT'],
      ['employer',                 'TEXT'],
      ['income_band',              'TEXT'],
      ['nationality',              'TEXT'],
      ['passport_number',          'TEXT'],
      ['alternative_id_type',      'TEXT'],
      ['next_of_kin',              'TEXT'],
      ['preferred_communication',  'TEXT'],
      ['dl_codes',                 'TEXT'],
      ['dl_restrictions',          'TEXT'],
      ['dl_first_issue_date',      'DATE'],
    ];
    for (const [col, type] of newContactCols) {
      if (!contactCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE contacts ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: recreate claim_third_parties with correct columns ────────
  try {
    const tpCols = database.prepare('PRAGMA table_info(claim_third_parties)').all();
    if (tpCols.length && !tpCols.some(c => c.name === 'surname')) {
      // Old table has 'name' column, new schema uses 'surname' etc. — rebuild
      database.pragma('foreign_keys = OFF');
      database.exec('DROP TABLE IF EXISTS claim_third_parties');
      database.exec(`
        CREATE TABLE claim_third_parties (
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
        )
      `);
      database.pragma('foreign_keys = ON');
    }
  } catch (_) {}

  // ── Migration: add notes column to claims ──────────────────────────────
  try {
    const clCols = database.prepare('PRAGMA table_info(claims)').all();
    if (!clCols.some(c => c.name === 'notes')) {
      database.prepare('ALTER TABLE claims ADD COLUMN notes TEXT').run();
    }
  } catch (_) {}

  // ── Migration: standardize address fields ──────────────────────────────
  // Contacts: add structured address fields
  try {
    const cCols = database.prepare('PRAGMA table_info(contacts)').all();
    const addrCols = [
      ['phys_street_address', 'TEXT'], ['phys_complex_building', 'TEXT'],
      ['phys_suburb', 'TEXT'], ['phys_city', 'TEXT'], ['phys_province', 'TEXT'],
      ['phys_postal_code', 'TEXT'], ['phys_country', 'TEXT'],
      ['phys_gps_lat', 'TEXT'], ['phys_gps_lng', 'TEXT'],
      ['post_street_address', 'TEXT'], ['post_complex_building', 'TEXT'],
      ['post_suburb', 'TEXT'], ['post_city', 'TEXT'], ['post_province', 'TEXT'],
      ['post_postal_code', 'TEXT'], ['post_country', 'TEXT'],
    ];
    for (const [col, type] of addrCols) {
      if (!cCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE contacts ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // Accounts: add structured address fields
  try {
    const aCols = database.prepare('PRAGMA table_info(accounts)').all();
    const addrCols = [
      ['phys_street_address', 'TEXT'], ['phys_complex_building', 'TEXT'],
      ['phys_suburb', 'TEXT'], ['phys_city', 'TEXT'], ['phys_province', 'TEXT'],
      ['phys_postal_code', 'TEXT'], ['phys_country', 'TEXT'],
      ['phys_gps_lat', 'TEXT'], ['phys_gps_lng', 'TEXT'],
      ['post_street_address', 'TEXT'], ['post_complex_building', 'TEXT'],
      ['post_suburb', 'TEXT'], ['post_city', 'TEXT'], ['post_province', 'TEXT'],
      ['post_postal_code', 'TEXT'], ['post_country', 'TEXT'],
    ];
    for (const [col, type] of addrCols) {
      if (!aCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE accounts ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // Assets: add missing address fields (complex_building, country, gps)
  try {
    const asCols = database.prepare('PRAGMA table_info(assets)').all();
    const missingAssetAddr = [
      ['complex_building', 'TEXT'], ['country', 'TEXT'],
      ['gps_lat', 'TEXT'], ['gps_lng', 'TEXT'],
    ];
    for (const [col, type] of missingAssetAddr) {
      if (!asCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE assets ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // audit_log — widen action to allow 'EMAIL'
  dropColumnCheck('audit_log', 'action', 'EMAIL', {
    action: 'EMAIL', module: '__chk__'
  });

  // ── Migration: add currency column (ZAR default) to monetary tables ────
  try {
    const moneyTables = [
      'assets','policies','policy_sections','claims',
      'client_engagements','advice_records'
    ];
    for (const t of moneyTables) {
      const cols = database.prepare(`PRAGMA table_info(${t})`).all();
      if (cols.length && !cols.some(c => c.name === 'currency')) {
        database.prepare(`ALTER TABLE ${t} ADD COLUMN currency TEXT DEFAULT 'ZAR'`).run();
      }
    }
  } catch (_) {}

  // ── Migration: add additional_covers (JSON) column to assets ──────────
  try {
    const assetCols = database.prepare('PRAGMA table_info(assets)').all();
    if (!assetCols.some(c => c.name === 'additional_covers')) {
      database.prepare('ALTER TABLE assets ADD COLUMN additional_covers TEXT').run();
    }
  } catch (_) {}

  // ── Migration: add co-insured contact link & other contacts to policies ─
  try {
    const policyCols = database.prepare('PRAGMA table_info(policies)').all();
    const newPolicyCols = [
      ['co_insured_contact_id', 'INTEGER'],
      ['other_contact_ids',     'TEXT'],
    ];
    for (const [col, type] of newPolicyCols) {
      if (!policyCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE policies ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: link each asset to a product in the Product Library ─────
  try {
    const aCols = database.prepare('PRAGMA table_info(assets)').all();
    if (!aCols.some(c => c.name === 'product_id')) {
      database.prepare('ALTER TABLE assets ADD COLUMN product_id INTEGER REFERENCES products(id)').run();
    }
  } catch (_) {}

  // ── Migration: per-policy quotes (FAIS quote-to-bind audit trail) ──
  // A policy may have several quotes uploaded; the policy can only become
  // Active once at least one quote has been marked approved.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS policy_quotes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id       INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        file_name       TEXT NOT NULL,
        original_name   TEXT NOT NULL,
        file_type       TEXT,
        file_path       TEXT NOT NULL,
        file_size       INTEGER,
        approved_at     DATE,
        approved_by_id  INTEGER REFERENCES users(id),
        uploaded_by_id  INTEGER REFERENCES users(id),
        uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare(
      'CREATE INDEX IF NOT EXISTS idx_policy_quotes_policy ON policy_quotes(policy_id)'
    ).run();
    // Add document_type so the same table can hold both fresh quotes and
    // existing schedules carried over from a previous insurer.
    try {
      const cols = database.prepare("PRAGMA table_info(policy_quotes)").all();
      if (!cols.some(c => c.name === 'document_type')) {
        database.prepare(
          "ALTER TABLE policy_quotes ADD COLUMN document_type TEXT NOT NULL DEFAULT 'quote'"
        ).run();
      }
    } catch (_) {}
  } catch (_) {}

  // ── Migration: policy_asset_history — snapshot of assets that were
  //    linked to a policy at the time it was cancelled.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS policy_asset_history (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id            INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        asset_id             INTEGER REFERENCES assets(id) ON DELETE SET NULL,
        asset_name           TEXT,
        asset_type           TEXT,
        asset_section        TEXT,
        make                 TEXT,
        model                TEXT,
        year                 INTEGER,
        registration_number  TEXT,
        vin_number           TEXT,
        serial_number        TEXT,
        asset_value          REAL,
        premium              REAL,
        sasria               REAL,
        currency             TEXT,
        cancelled_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        cancelled_by         INTEGER REFERENCES users(id)
      )
    `).run();
    database.prepare(
      `CREATE INDEX IF NOT EXISTS idx_policy_asset_history_policy ON policy_asset_history(policy_id)`
    ).run();
  } catch (_) {}

  // ── Migration: relax risk_details.policy_section_id NOT NULL ─────────
  //    The risk is logically tied to an asset; policy section may not yet
  //    exist. Rebuild the table to allow NULL.
  try {
    const cols = database.prepare('PRAGMA table_info(risk_details)').all();
    const psCol = cols.find(c => c.name === 'policy_section_id');
    if (psCol && psCol.notnull) {
      database.pragma('foreign_keys = OFF');
      database.exec(`
        CREATE TABLE risk_details_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          risk_detail_name TEXT NOT NULL,
          policy_section_id INTEGER REFERENCES policy_sections(id),
          asset_id INTEGER REFERENCES assets(id),
          policy_id INTEGER REFERENCES policies(id),
          contact_id INTEGER REFERENCES contacts(id),
          account_id INTEGER REFERENCES accounts(id),
          risk_type TEXT NOT NULL,
          occupancy_use TEXT,
          security_details TEXT,
          construction_type TEXT,
          roof_construction TEXT,
          wall_construction TEXT,
          stored_parked_overnight TEXT,
          tracking_device_fitted TEXT,
          route_operating_area TEXT,
          distance_to_water TEXT,
          flood_exposure TEXT,
          fire_exposure TEXT,
          goods_load_type TEXT,
          maximum_exposure_value REAL,
          risk_notes TEXT,
          last_updated DATE,
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO risk_details_new (
          id, risk_detail_name, policy_section_id, asset_id, policy_id,
          contact_id, account_id, risk_type, occupancy_use, security_details,
          construction_type, roof_construction, wall_construction,
          stored_parked_overnight, tracking_device_fitted, route_operating_area,
          distance_to_water, flood_exposure, fire_exposure, goods_load_type,
          maximum_exposure_value, risk_notes, last_updated,
          created_by, created_at, updated_at
        )
        SELECT
          id, risk_detail_name, policy_section_id, asset_id, policy_id,
          contact_id, account_id, risk_type, occupancy_use, security_details,
          construction_type, roof_construction, wall_construction,
          stored_parked_overnight, tracking_device_fitted, route_operating_area,
          distance_to_water, flood_exposure, fire_exposure, goods_load_type,
          maximum_exposure_value, risk_notes, last_updated,
          created_by, created_at, updated_at
        FROM risk_details;
        DROP TABLE risk_details;
        ALTER TABLE risk_details_new RENAME TO risk_details;
      `);
      database.pragma('foreign_keys = ON');
    }
  } catch (_) {}

  // ── Migration: create workflows table (Task 6) ─────────────────────────
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        due_date DATE,
        contact_id INTEGER REFERENCES contacts(id),
        account_id INTEGER REFERENCES accounts(id),
        policy_id INTEGER REFERENCES policies(id),
        asset_id INTEGER REFERENCES assets(id),
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'Assigned',
        assigned_broker_id INTEGER REFERENCES users(id),
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (_) {}
  try {
    database.prepare('CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_workflows_due_date ON workflows(due_date)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_workflows_broker ON workflows(assigned_broker_id)').run();
  } catch (_) {}

  // ── Migration: add claim_id column to workflows ────────────────────────
  try {
    const wCols = database.prepare('PRAGMA table_info(workflows)').all();
    if (wCols.length && !wCols.some(c => c.name === 'claim_id')) {
      database.prepare('ALTER TABLE workflows ADD COLUMN claim_id INTEGER REFERENCES claims(id)').run();
    }
  } catch (_) {}

  // ── Migration: allow workflow_id on documents & audit_log modules ──────
  try {
    const dCols = database.prepare('PRAGMA table_info(documents)').all();
    if (dCols.length && !dCols.some(c => c.name === 'workflow_id')) {
      database.prepare('ALTER TABLE documents ADD COLUMN workflow_id INTEGER REFERENCES workflows(id)').run();
    }
  } catch (_) {}

  // ── Migration: workflow_notes table ────────────────────────────────────
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS workflow_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        note_date DATE NOT NULL,
        details TEXT NOT NULL,
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_workflow_notes_workflow ON workflow_notes(workflow_id)').run();
  } catch (_) {}

  // ── Migration: user_dashboard_config table ─────────────────────────────
  // Stores per-user dashboard layout as JSON. The company-wide default lives
  // in system_settings under key 'dashboard_default_config'.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS user_dashboard_config (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        config TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (_) {}

  // ── Migration: user_view_preferences table ─────────────────────────────
  // Stores per-user column/sort configuration for list views (one row per
  // (user, module) pair). Deleting the row resets the user to the default.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS user_view_preferences (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module  TEXT    NOT NULL,
        config  TEXT    NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, module)
      )
    `).run();
  } catch (_) {}

  // ── Migration: ROA (advice_records) enhancements — COFI / FAIS GCC / TCF
  //    Adds structured suitability, conflict-of-interest, commission disclosure,
  //    rejection, acknowledgment method, and completion fields so ROA records
  //    are auditable and measurable rather than free-text.
  try {
    const arCols = database.prepare('PRAGMA table_info(advice_records)').all();
    const newArCols = [
      // Suitability Assessment
      ['client_risk_appetite',        'TEXT'],
      ['total_financial_exposure',    'REAL'],
      ['existing_cover_summary_auto', 'TEXT'],
      ['identified_gaps',             'TEXT'],  // JSON array of gap categories
      ['identified_gaps_notes',       'TEXT'],
      // Recommendation (structured)
      ['recommendation_rationale',    'TEXT'],  // structured: product|insurer|basis|why alternatives rejected
      ['alternatives_considered_list','TEXT'],  // JSON array: {product_name, insurer, reason_not_recommended}
      ['suitability_match_score',     'TEXT'],  // 'Match' | 'Mismatch' | 'Review Required'
      ['suitability_override_reason', 'TEXT'],  // required when Mismatch
      // Conflict of Interest (GCC 3A)
      ['conflict_of_interest_flag',        'TEXT'],  // 'Yes' | 'No'
      ['conflict_of_interest_description', 'TEXT'],
      // Commission Disclosure
      ['commission_disclosed',   'TEXT'],  // dropdown
      ['commission_rate_type',   'TEXT'],  // 'percent' | 'amount'
      ['commission_rate_value',  'REAL'],
      // Rejection (conditional on client_decision = Declined)
      ['client_rejection_reason', 'TEXT'],  // dropdown
      ['client_rejection_notes',  'TEXT'],
      // Client Acknowledgment
      ['client_acknowledgment_method', 'TEXT'],
      ['acknowledgment_witness_name',  'TEXT'],
      // Completion flag
      ['roa_completed',    'INTEGER DEFAULT 0'],
      ['roa_completed_at', 'DATETIME'],
      // Product Library link + target market suitability (Section 4.5 spec)
      ['product_id',                       'INTEGER REFERENCES products(id)'],
      ['target_market_status',             'TEXT'],   // Confirmed | Review Required | Mismatch
      ['target_market_mismatches',         'TEXT'],   // JSON array of mismatch reasons
      ['supervisor_co_approval_required',  'INTEGER DEFAULT 0'],
      ['supervisor_co_approved_by_id',     'INTEGER REFERENCES users(id)'],
      ['supervisor_co_approved_at',        'DATETIME'],
    ];
    for (const [col, type] of newArCols) {
      if (!arCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE advice_records ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: Client Engagement — Pre-Sale Disclosure (FAIS GCC §4 / TCF
  //    Outcome 1 & 3). Structured checklist that must be Complete before a
  //    ROA can be created from the engagement.
  try {
    const ceCols = database.prepare('PRAGMA table_info(client_engagements)').all();
    const newCeCols = [
      ['fsp_licence_disclosed',         'TEXT'],      // 'Yes — Written' | 'Yes — Verbal' | 'No'
      ['broker_identity_disclosed',     'INTEGER DEFAULT 0'],
      ['product_costs_disclosed',       'INTEGER DEFAULT 0'],
      ['product_costs_disclosed_notes', 'TEXT'],
      ['material_risks_disclosed',      'INTEGER DEFAULT 0'],
      ['material_risks_disclosed_notes','TEXT'],
      ['complaints_process_disclosed',  'TEXT'],      // 'Yes — Written' | 'Yes — Verbal' | 'Complaints form provided'
      ['disclosure_method',             'TEXT'],      // In-person / Phone / Video / Email / WhatsApp / Signed form
      ['disclosure_timestamp',          'DATETIME'],  // auto-stamped once status reaches Complete
      ['disclosing_broker_id',          'INTEGER REFERENCES users(id)'],
    ];
    for (const [col, type] of newCeCols) {
      if (!ceCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE client_engagements ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: Complaints Module enhancements (NEW-01 / FAIS GCC §17) ──
  //   Severity, handler, acknowledgment, target resolution, FSCA reporting,
  //   process-change tracking — to satisfy FAIS GCC and TCF Outcome 1.
  try {
    const cmpCols = database.prepare('PRAGMA table_info(complaints)').all();
    const newCmpCols = [
      ['severity_rating',       'TEXT'],       // Low | Medium | High | Critical
      ['assigned_handler_id',   'INTEGER REFERENCES users(id)'],
      ['supervisor_notified',   'INTEGER DEFAULT 0'],
      ['supervisor_notified_at','DATETIME'],
      ['acknowledgment_date',   'DATE'],
      ['acknowledgment_method', 'TEXT'],       // Email | Written letter | Phone (with call log) | WhatsApp
      ['target_resolution_date','DATE'],
      ['resolution_outcome',    'TEXT'],       // Upheld — full | partial | Not upheld | Withdrawn | Ombudsman
      ['remedy_provided',       'TEXT'],
      ['compensation_paid',     'REAL'],
      ['client_acceptance',     'TEXT'],       // Accepted | No — escalated | No — Ombudsman | No response
      ['process_change_triggered', 'INTEGER DEFAULT 0'],
      ['process_change_notes',  'TEXT'],
      ['fsca_reportable',       'INTEGER DEFAULT 0'],
      ['complaint_sub_category','TEXT'],
      // SLA escalation flags (Section 16 spec — day 3/21/30 alerts)
      ['alert_day3_sent',                  'INTEGER DEFAULT 0'],
      ['alert_day3_sent_at',               'DATETIME'],
      ['alert_day21_sent',                 'INTEGER DEFAULT 0'],
      ['alert_day21_sent_at',              'DATETIME'],
      ['alert_day30_sent',                 'INTEGER DEFAULT 0'],
      ['alert_day30_sent_at',              'DATETIME'],
      ['senior_management_notified',       'INTEGER DEFAULT 0'],
      ['senior_management_notified_at',    'DATETIME'],
      ['escalated_to_critical_at',         'DATETIME'],
      // Withdrawn — kept on record (deletion not permitted)
      ['withdrawn',                        'INTEGER DEFAULT 0'],
      ['withdrawn_at',                     'DATETIME'],
      ['withdrawn_by_id',                  'INTEGER REFERENCES users(id)'],
      ['withdrawn_reason',                 'TEXT'],
      // Email-on-create audit
      ['handler_notified_at',              'DATETIME'],
    ];
    for (const [col, type] of newCmpCols) {
      if (!cmpCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE complaints ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: Claims Module enhancements (MOD-03 / TCF Outcome 5) ──
  //   Claim category, reference number, assessment, repudiation, satisfaction.
  try {
    const clmCols = database.prepare('PRAGMA table_info(claims)').all();
    const newClmCols = [
      ['claim_category',             'TEXT'],      // Fire | Theft | Water damage | Motor | Liability | Business interruption | Other
      ['claim_reference_number',     'TEXT'],      // Insurer-assigned reference
      ['insurer_assessment_date',    'DATE'],
      ['repudiation_reason',         'TEXT'],      // Non-disclosure | Exclusion applied | Late notification | Fraudulent claim | Policy lapsed | Other
      ['repudiation_reason_notes',   'TEXT'],
      ['broker_dispute_action',      'TEXT'],      // Accepted | Challenged | Referred to Ombudsman | Client declined to dispute
      ['post_claim_satisfaction',    'TEXT'],      // Very satisfied | Satisfied | Neutral | Dissatisfied | Very dissatisfied | Not captured
      ['outcome_vs_roa_expectation', 'TEXT'],      // Yes | Partial | No
      ['complaint_arising',          'INTEGER DEFAULT 0'],
    ];
    for (const [col, type] of newClmCols) {
      if (!clmCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE claims ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: POPIA Compliance — mirror to accounts table ──
  try {
    const aCols = database.prepare('PRAGMA table_info(accounts)').all();
    const newAcctPopCols = [
      ['data_processing_basis',   'TEXT'],
      ['popia_consent_obtained',  'INTEGER DEFAULT 0'],
      ['popia_consent_date',      'DATE'],
      ['consent_method',          'TEXT'],
      ['consent_scope',           'TEXT'],
      ['direct_marketing_consent','INTEGER DEFAULT 0'],
      ['data_source',             'TEXT'],
      ['data_categories_held',    'TEXT'],
      ['third_party_sharing',     'INTEGER DEFAULT 0'],
      ['third_party_sharing_notes','TEXT'],
      ['retention_period_years',  'INTEGER DEFAULT 5'],
      ['retention_expiry_date',   'DATE'],
      ['information_officer_id',  'INTEGER REFERENCES users(id)'],
      ['privacy_notice_provided', 'INTEGER DEFAULT 0'],
      ['privacy_notice_date',     'DATE'],
      ['last_activity_date',      'DATE'],
    ];
    for (const [col, type] of newAcctPopCols) {
      if (!aCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE accounts ADD COLUMN ${col} ${type}`).run();
      }
    }

    // Accounts FICA columns (mirror of contacts FICA fields)
    const aColsAfter = database.prepare('PRAGMA table_info(accounts)').all();
    const newAcctFicaCols = [
      ['fica_verification_date',          'DATE'],
      ['fica_verification_method',        'TEXT'],
      ['fica_document_reference',         'TEXT'],
      ['fica_verified_by_id',             'INTEGER REFERENCES users(id)'],
      ['fica_five_year_expiry',           'DATE'],
      ['fica_re_verification_date',       'DATE'],
      ['fica_cipc_number',                'TEXT'],
      ['fica_beneficial_owner_confirmed', 'TEXT'],
      ['fica_pep_check',                  'TEXT'],
      ['fica_pep_check_date',             'DATE'],
    ];
    for (const [col, type] of newAcctFicaCols) {
      if (!aColsAfter.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE accounts ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: account_id on data_subject_requests (account-level DSARs) ──
  try {
    const dsrCols = database.prepare('PRAGMA table_info(data_subject_requests)').all();
    if (dsrCols.length && !dsrCols.some(c => c.name === 'account_id')) {
      database.prepare(
        'ALTER TABLE data_subject_requests ADD COLUMN account_id INTEGER REFERENCES accounts(id)'
      ).run();
      database.prepare('CREATE INDEX IF NOT EXISTS idx_dsr_account ON data_subject_requests(account_id)').run();
    }
  } catch (_) {}

  // ── Migration: POPIA Compliance (NEW-02) — fields on Contact + DSAR/breach tables ──
  try {
    const cCols = database.prepare('PRAGMA table_info(contacts)').all();
    const newPopCols = [
      ['data_processing_basis',   'TEXT'],       // Consent | Contractual necessity | Legal obligation | Legitimate interest | Vital interest
      ['consent_method',          'TEXT'],       // Signed form | Digital opt-in | Email confirmation | Verbal (with witness)
      ['consent_scope',           'TEXT'],       // JSON array of scopes
      ['direct_marketing_consent','INTEGER DEFAULT 0'],
      ['data_source',             'TEXT'],       // Client-provided directly | Referred by third party | Public record | Existing relationship
      ['data_categories_held',    'TEXT'],       // JSON array
      ['third_party_sharing',     'INTEGER DEFAULT 0'],
      ['third_party_sharing_notes','TEXT'],
      ['retention_period_years',  'INTEGER DEFAULT 5'],
      ['retention_expiry_date',   'DATE'],
      ['information_officer_id',  'INTEGER REFERENCES users(id)'],
      ['privacy_notice_provided', 'INTEGER DEFAULT 0'],
      ['privacy_notice_date',     'DATE'],
      ['last_activity_date',      'DATE'],
    ];
    for (const [col, type] of newPopCols) {
      if (!cCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE contacts ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // Data subject requests (access, correction, erasure, objection, withdraw consent)
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS data_subject_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL REFERENCES contacts(id),
        request_type TEXT NOT NULL CHECK(request_type IN (
          'Access','Correction','Erasure','Object','Withdraw Consent'
        )),
        request_date DATE NOT NULL,
        request_details TEXT,
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN (
          'Open','In Progress','Completed','Rejected'
        )),
        target_completion_date DATE,
        completion_date DATE,
        outcome TEXT,
        outcome_notes TEXT,
        handled_by INTEGER REFERENCES users(id),
        delivery_method TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_dsr_contact ON data_subject_requests(contact_id)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_dsr_status ON data_subject_requests(status)').run();
  } catch (_) {}

  // ── Migration: per-right workflow fields on DSARs ────────────────────
  try {
    const dsrCols = database.prepare('PRAGMA table_info(data_subject_requests)').all();
    const newDsrCols = [
      // Right to Access
      ['delivery_date',             'DATE'],         // when export delivered
      ['export_format',             'TEXT'],         // PDF | CSV | ZIP | Other
      // Right to Correction
      ['corrected_fields',          'TEXT'],         // JSON array of field names
      ['corrected_by_id',           'INTEGER REFERENCES users(id)'],
      ['client_notified_date',      'DATE'],
      // Right to Erasure
      ['legal_basis_assessment',    'TEXT'],
      ['erasure_action',            'TEXT'],         // Anonymised | Deleted | Retained — legal basis | Pending
      // Right to Object
      ['processing_suspended',      'INTEGER DEFAULT 0'],
      ['suspension_lifted_date',    'DATE'],
      // Right to Withdraw Consent
      ['consent_withdrawn_date',    'DATE'],
    ];
    for (const [col, type] of newDsrCols) {
      if (!dsrCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE data_subject_requests ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // Data breach log (POPIA s22)
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS data_breach_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        breach_date DATE NOT NULL,
        discovered_date DATE NOT NULL,
        nature TEXT NOT NULL,
        data_affected TEXT,
        affected_contact_ids TEXT,
        affected_recipients TEXT,
        notification_email_summary TEXT,
        information_regulator_notified INTEGER DEFAULT 0,
        regulator_notified_date DATE,
        data_subjects_notified INTEGER DEFAULT 0,
        subjects_notified_date DATE,
        remediation TEXT,
        status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN (
          'Open','Under Investigation','Resolved','Closed'
        )),
        logged_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    const breachCols = database.prepare('PRAGMA table_info(data_breach_log)').all();
    if (!breachCols.some(c => c.name === 'affected_recipients')) {
      database.prepare('ALTER TABLE data_breach_log ADD COLUMN affected_recipients TEXT').run();
    }
    if (!breachCols.some(c => c.name === 'notification_email_summary')) {
      database.prepare('ALTER TABLE data_breach_log ADD COLUMN notification_email_summary TEXT').run();
    }
  } catch (_) {}

  // ── Migration: FICA Verification (NEW-06) — extend contacts + history table ──
  try {
    const cCols = database.prepare('PRAGMA table_info(contacts)').all();
    const newFicaCols = [
      ['fica_verification_date',   'DATE'],
      ['fica_verification_method', 'TEXT'],       // ID | Passport | CIPC | Drivers licence | Biometric | Other
      ['fica_document_reference',  'TEXT'],
      ['fica_verified_by_id',      'INTEGER REFERENCES users(id)'],
      ['fica_five_year_expiry',    'DATE'],
      ['fica_re_verification_date','DATE'],
      ['fica_cipc_number',         'TEXT'],
      ['fica_beneficial_owner_confirmed', 'TEXT'],   // Yes | No | Pending
      ['fica_pep_check',           'TEXT'],       // Yes — clear | Yes — flagged | Not yet
      ['fica_pep_check_date',      'DATE'],
    ];
    for (const [col, type] of newFicaCols) {
      if (!cCols.some(c => c.name === col)) {
        database.prepare(`ALTER TABLE contacts ADD COLUMN ${col} ${type}`).run();
      }
    }
  } catch (_) {}

  // ── Migration: Broker Profile Module (NEW-03) ──
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS broker_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        id_number TEXT,
        fsca_registration_number TEXT,
        appointment_date DATE,
        categories_authorised TEXT,
        re1_status TEXT,
        re1_pass_date DATE,
        re5_status TEXT,
        re5_pass_date DATE,
        re5_deadline DATE,
        qualification_nqf_level TEXT,
        qualification_name TEXT,
        qualification_provider TEXT,
        cob_personal_lines TEXT,
        cob_personal_lines_date DATE,
        cob_commercial_lines TEXT,
        cob_commercial_lines_date DATE,
        cob_deadline DATE,
        good_standing_status TEXT DEFAULT 'In good standing',
        debarment_date DATE,
        debarment_reason TEXT,
        debarment_lifted_date DATE,
        debarment_authorised_by_id INTEGER REFERENCES users(id),
        insolvency_flag INTEGER DEFAULT 0,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  } catch (_) {}

  // CPD activities table
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS cpd_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_profile_id INTEGER NOT NULL REFERENCES broker_profiles(id) ON DELETE CASCADE,
        activity_date DATE NOT NULL,
        activity_type TEXT NOT NULL,
        activity_provider TEXT NOT NULL,
        activity_title TEXT,
        points_awarded REAL NOT NULL,
        cpd_cycle TEXT,
        certificate_path TEXT,
        approved_by_id INTEGER REFERENCES users(id),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_cpd_profile ON cpd_activities(broker_profile_id)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_cpd_cycle ON cpd_activities(cpd_cycle)').run();
  } catch (_) {}

  // ── Migration: documents FKs for broker fitness module ─────────────────
  try {
    const dCols = database.prepare('PRAGMA table_info(documents)').all();
    if (dCols.length && !dCols.some(c => c.name === 'broker_profile_id')) {
      database.prepare('ALTER TABLE documents ADD COLUMN broker_profile_id INTEGER REFERENCES broker_profiles(id)').run();
    }
    if (dCols.length && !dCols.some(c => c.name === 'cpd_activity_id')) {
      database.prepare('ALTER TABLE documents ADD COLUMN cpd_activity_id INTEGER REFERENCES cpd_activities(id)').run();
    }
    database.prepare('CREATE INDEX IF NOT EXISTS idx_docs_broker_profile ON documents(broker_profile_id)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_docs_cpd_activity ON documents(cpd_activity_id)').run();
  } catch (_) {}

  // ── Migration: encrypt any plaintext id_number values (one-shot) ───────
  // Detects rows where id_number is set but doesn't carry the v1 prefix and
  // re-encrypts them in place. Safe to run repeatedly.
  try {
    const { encrypt, isEncrypted } = require('../lib/crypto');
    const rows = database.prepare(
      `SELECT id, id_number FROM broker_profiles WHERE id_number IS NOT NULL AND id_number != ''`
    ).all();
    const upd = database.prepare('UPDATE broker_profiles SET id_number = ? WHERE id = ?');
    const tx = database.transaction((list) => {
      for (const r of list) {
        if (!isEncrypted(r.id_number)) {
          try { upd.run(encrypt(r.id_number), r.id); } catch (_) {}
        }
      }
    });
    if (rows.length) tx(rows);
  } catch (err) {
    console.warn('id_number encryption migration skipped:', err.message);
  }

  // ── Migration: broker fitness alerts (suspension flags + dispatch log) ──
  try {
    const bpCols = database.prepare('PRAGMA table_info(broker_profiles)').all();
    if (bpCols.length && !bpCols.some(c => c.name === 'suspended_from_advice')) {
      database.prepare('ALTER TABLE broker_profiles ADD COLUMN suspended_from_advice INTEGER DEFAULT 0').run();
    }
    if (bpCols.length && !bpCols.some(c => c.name === 'cpd_short_flag')) {
      database.prepare('ALTER TABLE broker_profiles ADD COLUMN cpd_short_flag INTEGER DEFAULT 0').run();
    }
    const arCols = database.prepare('PRAGMA table_info(advice_records)').all();
    if (arCols.length && !arCols.some(c => c.name === 're5_flag')) {
      database.prepare('ALTER TABLE advice_records ADD COLUMN re5_flag INTEGER DEFAULT 0').run();
    }
    database.prepare(`
      CREATE TABLE IF NOT EXISTS broker_fitness_alerts_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_profile_id INTEGER NOT NULL REFERENCES broker_profiles(id) ON DELETE CASCADE,
        alert_code TEXT NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(broker_profile_id, alert_code)
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_bfas_profile ON broker_fitness_alerts_sent(broker_profile_id)').run();
  } catch (_) {}

  // ── Migration: ROA acknowledgement reminder dispatch tracking ────────
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS roa_acknowledgement_reminders_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        advice_record_id INTEGER NOT NULL REFERENCES advice_records(id) ON DELETE CASCADE,
        reminder_stage INTEGER NOT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(advice_record_id, reminder_stage)
      )
    `).run();
    database.prepare(
      'CREATE INDEX IF NOT EXISTS idx_roa_ack_reminders_record ON roa_acknowledgement_reminders_sent(advice_record_id)'
    ).run();
  } catch (_) {}

  // ── Migration: in-app notifications ──────────────────────────────────
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','danger','success')),
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        source_module TEXT,
        source_record_id INTEGER,
        dedup_key TEXT,
        read_at DATETIME,
        dismissed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, dedup_key)
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, dismissed_at)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)').run();

    // Seed: welcome + complete-your-fitness for every active user.
    // dedup_key is per-user, so this is idempotent across restarts.
    try {
      const users = database.prepare(
        'SELECT id FROM users WHERE active = 1'
      ).all();
      const ins = database.prepare(`
        INSERT OR IGNORE INTO notifications
          (user_id, category, severity, title, body, link, source_module, source_record_id, dedup_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of users) {
        // Welcome notification — placeholder until the user manual is published.
        // Updating the dedup_key forces the new wording to land on existing users.
        ins.run(u.id, 'system',         'info',    'Welcome to Inexpro CRM',
          'Welcome aboard! A user manual will be linked here soon — until then, click the bell anytime to manage your notifications. Your administrator will reach out if action is needed on your part.',
          '#/dashboard', 'system', null, 'seed:welcome_inexpro_v1');

        ins.run(u.id, 'broker_fitness', 'warning', 'Complete your Broker Fitness profile',
          'Please open Broker Fitness and confirm your ID number, FSCA registration, RE1/RE5 status, NQF qualification and Class of Business training. The compliance team needs this to keep your record FSCA-ready.',
          '#/broker-profiles', 'broker_profiles', null, 'seed:complete_fitness');

        // User manual published — one row per active user, idempotent on
        // dedup_key. Re-bump the dedup_key (manual_v3 → manual_v4 …) when a
        // new edition is published so existing users see the new entry.
        ins.run(u.id, 'system',         'info',    'New User Manual available (Version 3.0)',
          'Version 3.0 of the Inexpro CRM User Manual has been published. It covers the new Sections breakdown, per-row "In total" tickboxes on Vehicle Extras and Additional Covers, customizable columns, the edit-lock + admin OTP flow, and a 14-step quick-start guide. Click Open to view the PDF (right-click to open in a new tab).',
          '/Inexpro_CRM_User_Manual.pdf', 'system', null, 'seed:manual_v3');
      }
    } catch (_) {}
  } catch (_) {}

  // ── Migration: Post-Sale Event Log (NEW-04) ──
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS post_sale_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        contact_id INTEGER REFERENCES contacts(id),
        account_id INTEGER REFERENCES accounts(id),
        event_type TEXT NOT NULL CHECK(event_type IN (
          'Cancellation request','Provider switch','Mid-term amendment',
          'Policy lapse','Cover reduction','Complaint arising','Client exit'
        )),
        event_date DATE NOT NULL,
        request_method TEXT,
        assigned_handler_id INTEGER REFERENCES users(id),
        date_actioned DATE,
        days_to_action INTEGER,
        outcome TEXT,
        outcome_notes TEXT,
        refusal_reason TEXT,
        lapse_reason TEXT,
        switch_from_insurer TEXT,
        switch_to_insurer TEXT,
        client_notification_date DATE,
        client_notification_method TEXT,
        barrier_flagged INTEGER DEFAULT 0,
        supervisor_review_notes TEXT,
        supervisor_id INTEGER REFERENCES users(id),
        supervisor_review_date DATE,
        linked_complaint_id INTEGER REFERENCES complaints(id),
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_pse_policy ON post_sale_events(policy_id)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_pse_type ON post_sale_events(event_type)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_pse_barrier ON post_sale_events(barrier_flagged)').run();
  } catch (_) {}

  // ── Migration: Product Library (NEW-05) ──
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_code TEXT NOT NULL UNIQUE,
        product_name TEXT NOT NULL,
        insurer TEXT NOT NULL,
        product_category TEXT NOT NULL,
        target_client_type TEXT,
        min_insurable_value REAL,
        max_insurable_value REAL,
        suitable_risk_appetite TEXT,
        geographic_scope TEXT,
        key_exclusions_summary TEXT,
        product_status TEXT NOT NULL DEFAULT 'Active',
        last_review_date DATE,
        reviewed_by_id INTEGER REFERENCES users(id),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_products_category ON products(product_category)').run();
  } catch (_) {}

  // ── Migration: keep contacts picklist CHECK constraints aligned with UI/schema ──
  // Existing SQLite databases keep the original CREATE TABLE SQL, so new picklist
  // values need the table definition rewritten. Bumping schema_version makes
  // SQLite discard any cached copy of the old CHECK constraints immediately.
  function sqlQuote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  function replaceTextCheckList(tableSql, columnName, values) {
    const escapedColumn = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `(${escapedColumn}\\s+TEXT\\s+(?:NOT\\s+NULL\\s+)?CHECK\\s*\\(\\s*${escapedColumn}\\s+IN\\s*\\()([\\s\\S]*?)(\\)\\s*\\))`,
      'i'
    );
    return tableSql.replace(re, `$1\n    ${values.map(sqlQuote).join(',')}\n  $3`);
  }

  function updateTableSql(tableName, newSql) {
    database.pragma('writable_schema = ON');
    try {
      database.prepare(
        "UPDATE sqlite_master SET sql = ? WHERE type='table' AND name = ?"
      ).run(newSql, tableName);
      const schemaVersion = database.pragma('schema_version', { simple: true });
      database.pragma(`schema_version = ${schemaVersion + 1}`);
    } finally {
      database.pragma('writable_schema = OFF');
    }
    try { database.pragma('integrity_check'); } catch (_) {}
  }

  try {
    const row = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='contacts'"
    ).get();
    if (row && row.sql) {
      let newSql = row.sql;
      newSql = replaceTextCheckList(newSql, 'contact_type', [
        'Individual Client', 'Business Contact Person', 'Trustee',
        'Member', 'Director', 'Employee Contact', 'Supplier', 'Other',
      ]);
      newSql = replaceTextCheckList(newSql, 'client_category', [
        'Personal Lines', 'Commercial Lines', 'Agri', 'Transport', 'Mixed',
        'Supplier', 'Prospect Only',
      ]);
      newSql = replaceTextCheckList(newSql, 'contact_status', [
        'Prospect', 'Active Client', 'Inactive Client', 'Former Client',
        'Do Not Service', 'Deceased', '3rd Party', 'Co-Insured', 'Contact', 'Other',
      ]);
      if (newSql !== row.sql) {
        updateTableSql('contacts', newSql);
      }
    }
  } catch (_) {}

  // ── Migration: Commission & Fee Transparency Log (NEW-07) ──
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS commission_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        commission_type TEXT NOT NULL,
        commission_rate REAL,
        commission_amount REAL,
        disclosed_in_roa INTEGER DEFAULT 0,
        disclosure_date DATE,
        linked_advice_record_id INTEGER REFERENCES advice_records(id),
        insurer_arrangement TEXT,
        volume_override_details TEXT,
        remuneration_compliant TEXT,
        last_review_date DATE,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_comm_log_policy ON commission_log(policy_id)').run();
    // Business-class flags + free-text "Other" — added to commission_log so a
    // commission can be tagged Motor / Non-Motor / Other for FSCA reporting.
    try {
      const cols = database.prepare("PRAGMA table_info(commission_log)").all();
      const have = (n) => cols.some(c => c.name === n);
      if (!have('class_motor'))      database.prepare("ALTER TABLE commission_log ADD COLUMN class_motor INTEGER DEFAULT 0").run();
      if (!have('class_non_motor'))  database.prepare("ALTER TABLE commission_log ADD COLUMN class_non_motor INTEGER DEFAULT 0").run();
      if (!have('class_other'))      database.prepare("ALTER TABLE commission_log ADD COLUMN class_other INTEGER DEFAULT 0").run();
      if (!have('class_other_text')) database.prepare("ALTER TABLE commission_log ADD COLUMN class_other_text TEXT").run();
    } catch (_) {}
  } catch (_) {}

  // ── Migration: One-Time PIN codes (admin-issued edit override) ──
  // Admins generate a 6-digit OTP for a broker so they can authorise an edit
  // on a locked record without sharing an admin password. Each code is
  // single-use and expires at expires_at; usage is audit-logged.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        code               TEXT NOT NULL,
        created_by_user_id INTEGER NOT NULL REFERENCES users(id),
        target_user_id     INTEGER REFERENCES users(id),
        expires_at         DATETIME NOT NULL,
        used_at            DATETIME,
        used_by_user_id    INTEGER REFERENCES users(id),
        revoked_at         DATETIME,
        revoked_by_user_id INTEGER REFERENCES users(id),
        notes              TEXT,
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_otp_code   ON otp_codes(code)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_otp_target ON otp_codes(target_user_id)').run();
  } catch (_) {}

  // ── Migration: trusted devices for 2FA ──
  // When a user ticks "Remember this device for 30 days" on the 2FA prompt,
  // we issue a random token, store its hash here against the user, and set
  // a long-lived cookie. On subsequent logins for that user the token is
  // verified — when valid, the 2FA step is skipped.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS device_2fa_trust (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash   TEXT NOT NULL,
        user_agent   TEXT,
        ip_address   TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at   DATETIME NOT NULL,
        revoked_at   DATETIME
      )
    `).run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_dt_user  ON device_2fa_trust(user_id)').run();
    database.prepare('CREATE INDEX IF NOT EXISTS idx_dt_token ON device_2fa_trust(token_hash)').run();
  } catch (_) {}

  // ── Migration: Two-Factor Authentication (TOTP) ──
  // Stores the user's TOTP secret + recovery codes. enrolled = 0 means the
  // user has started enrollment but hasn't yet verified the first code, so
  // login MUST NOT enforce 2FA until enrolled flips to 1.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS user_2fa (
        user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        secret           TEXT NOT NULL,
        enrolled         INTEGER NOT NULL DEFAULT 0,
        recovery_codes   TEXT,
        created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
        enrolled_at      DATETIME,
        last_used_at     DATETIME
      )
    `).run();
  } catch (_) {}

  // Broker codes — one user (broker) can have many codes registered with insurers.
  // Each code is the broker's identifier on a particular insurer's panel and is
  // selected per policy at write time.
  try {
    database.prepare(`
      CREATE TABLE IF NOT EXISTS user_broker_codes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        description TEXT,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, code)
      )
    `).run();
    database.prepare(`CREATE INDEX IF NOT EXISTS idx_user_broker_codes_user ON user_broker_codes(user_id)`).run();
  } catch (_) {}

  // Policies — capture the broker code chosen at write time. Snapshot fields
  // (code text + description) preserve the value if the source row is later
  // edited or deleted, so reprinted schedules keep showing the original.
  try {
    const polCols = database.prepare('PRAGMA table_info(policies)').all().map(c => c.name);
    if (!polCols.includes('broker_code_id')) {
      database.prepare('ALTER TABLE policies ADD COLUMN broker_code_id INTEGER REFERENCES user_broker_codes(id) ON DELETE SET NULL').run();
    }
    if (!polCols.includes('broker_code_snapshot')) {
      database.prepare('ALTER TABLE policies ADD COLUMN broker_code_snapshot TEXT').run();
    }
    if (!polCols.includes('broker_code_description_snapshot')) {
      database.prepare('ALTER TABLE policies ADD COLUMN broker_code_description_snapshot TEXT').run();
    }
  } catch (_) {}

  // ── Versioned migrations (server/db/migrations/*.sql) ──────────────────
  // Runs after the legacy inline migrations above so any new schema change
  // ships as a numbered file going forward. Existing live DBs already have
  // the core tables, so 0000_baseline is recorded as applied without
  // running.
  try {
    runMigrations(database);
  } catch (err) {
    console.error('❌ Migration runner failed at startup:', err.message);
    throw err;
  }

  return database;
}

module.exports = { getDb, initDb };
