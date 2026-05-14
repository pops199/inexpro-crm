const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router = express.Router();
const { requireAuth, canDelete, requireAdmin, getBrokerId } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { resolveSort } = require('./view-prefs');

function _amendmentUploadRoot() {
  return process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(__dirname, '../../uploads');
}

// All routes require authentication
router.use(requireAuth);

// ============================================================
// GET / — list assets with filters, joins, pagination
// ============================================================
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      contact_id,
      account_id,
      policy_id,
      policy_section_id,
      asset_section,
      asset_type,
      status,
      search,
      page = 1,
      limit = 25
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    // Broker isolation: filter assets by policy's assigned_broker_id
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      conditions.push('p.assigned_broker_id = ?');
      params.push(scopedBrokerId);
    }

    if (contact_id) {
      conditions.push('a.contact_id = ?');
      params.push(contact_id);
    }
    if (account_id) {
      conditions.push('a.account_id = ?');
      params.push(account_id);
    }
    if (policy_id) {
      conditions.push('a.policy_id = ?');
      params.push(policy_id);
    }
    if (policy_section_id) {
      conditions.push('a.policy_section_id = ?');
      params.push(policy_section_id);
    }
    if (asset_section) {
      conditions.push('a.asset_section = ?');
      params.push(asset_section);
    }
    if (asset_type) {
      conditions.push('a.asset_type = ?');
      params.push(asset_type);
    }
    if (status) {
      conditions.push('a.asset_status = ?');
      params.push(status);
    }
    if (search) {
      // Search spans asset identity fields plus the joined contact / account /
      // policy context so users can find an asset by client name or policy
      // number as well as reg/VIN/serial/make/model.
      const like = `%${search}%`;
      conditions.push(`(
        a.asset_name           LIKE ? OR
        a.registration_number  LIKE ? OR
        a.vin_number           LIKE ? OR
        a.serial_number        LIKE ? OR
        a.make                 LIKE ? OR
        a.model                LIKE ? OR
        c.first_name           LIKE ? OR
        c.last_name            LIKE ? OR
        (c.first_name || ' ' || c.last_name) LIKE ? OR
        ac.account_name        LIKE ? OR
        p.policy_name          LIKE ? OR
        p.policy_number        LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like, like, like, like, like);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const baseQuery = `
      FROM assets a
      LEFT JOIN contacts c ON a.contact_id = c.id
      LEFT JOIN accounts ac ON a.account_id = ac.id
      LEFT JOIN policies p ON a.policy_id = p.id
      LEFT JOIN policy_sections ps ON a.policy_section_id = ps.id
      ${where}
    `;

    const countRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery}`).get(...params);

    const resolved = resolveSort('assets', req.query.sort, req.query.dir);
    const orderBy = resolved
      ? `ORDER BY ${resolved.sql} ${resolved.dir}, a.id DESC`
      : `ORDER BY a.asset_type ASC, a.asset_name ASC`;

    const rows = db.prepare(`
      SELECT
        a.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        ac.account_name,
        p.policy_name,
        p.policy_number,
        ps.section_name AS policy_section_name,
        ps.section_type AS policy_section_type
      ${baseQuery}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({
      data: rows,
      pagination: {
        total: countRow.total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(countRow.total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('GET /assets error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve assets' });
  }
});

// ============================================================
// GET /:id — single asset with joins
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        a.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        c.email AS contact_email,
        ac.account_name,
        p.policy_name,
        p.policy_number,
        ps.section_name AS policy_section_name,
        ps.section_type AS policy_section_type
      FROM assets a
      LEFT JOIN contacts c ON a.contact_id = c.id
      LEFT JOIN accounts ac ON a.account_id = ac.id
      LEFT JOIN policies p ON a.policy_id = p.id
      LEFT JOIN policy_sections ps ON a.policy_section_id = ps.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Broker isolation: check via the linked policy
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && row.policy_id) {
      const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(row.policy_id);
      if (policy && policy.assigned_broker_id !== scopedBrokerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(row);
  } catch (err) {
    console.error('GET /assets/:id error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve asset' });
  }
});

// ── All writable asset columns (excluding id, created_by, created_at, updated_at) ──
const ASSET_COLUMNS = [
  'asset_name','asset_type','asset_status',
  'contact_id','account_id','policy_id','policy_section_id',
  'registration_number','vin_number','engine_number',
  'make','model','year','serial_number',
  'date_acquired','date_sold','mm_number','notes','asset_value',
  'premium','sasria','excess','excess_pct_claim','excess_pct_insured','minimum_excess',
  'address','complex_building','suburb','city','province','postal_code','country','gps_lat','gps_lng',
  'asset_section',
  // Section-specific fields
  'use_type','gvm','tracking_device','territory','cover_type','regular_driver','credit_shortfall',
  'construction_type','roof_type','occupancy','flat_no_floors','perils_covered',
  'subsidence_cover','geyser_cover','security_measures',
  'contents_category','unspecified_items','specified_items','theft_extension','power_surge_cover',
  'stock_category','declaration_basis','cold_storage','avg_stock_value','max_stock_value',
  'replacement_value','portable','maintenance_contract','breakdown_cover',
  'vessel_name','vessel_type','hull_length','motor_details','mooring','navigational_limits','skipper_qualification',
  'breed','gender','animal_count','identification_method','premises_address',
  'commodity','conveyance_type','route','max_single_load',
  'limit_of_indemnity','aggregate_limit','business_activity','turnover','employee_count',
  'retroactive_date','trigger_basis','defence_costs',
  'conditions','extensions','exclusions','sum_insured','basis_of_cover',
  'vehicle_extras','extras_in_total','excesses',
  'financial_interest_noted','financial_institution','finance_contract_number','contract_expiry_date',
  'fleet_number',
  'currency','additional_covers',
  // Vehicle Risk Details
  'parking_type','parking_other','tracker_fitted','vehicle_use',
  // Related Contacts (JSON)
  'related_contacts',
  // Premium tied to sum insured
  'sum_insured_premium',
  // Item Number (Core Details)
  'item_number',
  // Product Library link
  'product_id',
];

/** Validate the linked product exists and is Active. */
function validateAssetProduct(db, productId) {
  if (!productId) {
    return 'A product must be selected from the Product Library before an asset can be saved.';
  }
  const p = db.prepare('SELECT id, product_name, product_status FROM products WHERE id = ?').get(productId);
  if (!p) return 'Selected product does not exist in the Product Library.';
  if (p.product_status !== 'Active') {
    return `Selected product "${p.product_name}" is ${p.product_status} — only Active products can be used on assets.`;
  }
  return null;
}

// Normalise body values: empty strings → null
function normalise(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/**
 * True for asset types that are buildings/structures and therefore require
 * a physical address (street + city/suburb).
 *
 * SASRIA coupons (Material Damage / Motor / Contract Works / Goods in
 * Transit / Money) sit on top of an underlying policy and don't need an
 * asset-level address — even though the Material Damage Fire Coupon
 * section name contains the word "Fire", it is not a building section.
 */
function isBuildingAsset(b) {
  const t = String(b.asset_type || '').toLowerCase();
  const s = String(b.asset_section || '').toLowerCase();
  if (s.startsWith('sasria') || t.startsWith('sasria')) return false;
  return /property|fire|building|structure|homeowners|farm building/.test(t)
      || /property|fire|building|structure|homeowners|farm building/.test(s);
}

/**
 * Validate a building/structure asset has an address. Returns null if OK,
 * otherwise an error message string.
 */
function validateBuildingAddress(b) {
  if (!isBuildingAsset(b)) return null;
  const addr = normalise(b.address);
  const city = normalise(b.city);
  const suburb = normalise(b.suburb);
  if (!addr || !(city || suburb)) {
    return 'A physical address (street + city or suburb) is required for building/structure assets before they can be saved.';
  }
  return null;
}

// ============================================================
// POST / — create asset
// ============================================================
router.post('/', (req, res) => {
  try {
    const b = req.body;

    // Validation
    if (!b.asset_name || !b.asset_type || !b.asset_status) {
      return res.status(400).json({ error: 'asset_name, asset_type, and asset_status are required' });
    }
    if (!b.contact_id && !b.account_id) {
      return res.status(400).json({ error: 'Select a Contact or an Account before saving the asset.' });
    }
    // A policy section is mandatory for every asset.
    if (!b.policy_section_id && !(b.asset_section && String(b.asset_section).trim())) {
      return res.status(422).json({ error: 'Select a Policy Section before saving the asset.' });
    }
    const addrErr = validateBuildingAddress(b);
    if (addrErr) return res.status(422).json({ error: addrErr });

    const db = getDb();

    const prodErr = validateAssetProduct(db, b.product_id);
    if (prodErr) return res.status(422).json({ error: prodErr });

    // Only insert columns that actually exist in the table
    const tableInfo = db.prepare('PRAGMA table_info(assets)').all();
    const existingCols = new Set(tableInfo.map(c => c.name));
    const cols = ASSET_COLUMNS.filter(c => existingCols.has(c));

    const colNames = [...cols, 'created_by'].join(', ');
    const placeholders = [...cols.map(() => '?'), '?'].join(', ');
    const values = cols.map(c => normalise(b[c]));
    values.push(req.session.userId);

    const stmt = db.prepare(`
      INSERT INTO assets (${colNames}, created_at, updated_at)
      VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(...values);
    const newAsset = db.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({
      action: 'CREATE',
      module: 'assets',
      recordId: result.lastInsertRowid,
      newValue: newAsset,
      description: `Asset created: ${b.asset_name}`
    });

    res.status(201).json(newAsset);
  } catch (err) {
    console.error('POST /assets error:', err.message);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// ============================================================
// PUT /:id — update asset
// ============================================================
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Broker isolation: check via the linked policy
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.policy_id) {
      const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(existing.policy_id);
      if (policy && policy.assigned_broker_id !== scopedBrokerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const b = req.body;

    // Building/structure assets must have an address. Use the merged value
    // (body falls back to existing) so partial updates don't bypass the rule.
    const merged = {
      asset_type:    b.asset_type    !== undefined ? b.asset_type    : existing.asset_type,
      asset_section: b.asset_section !== undefined ? b.asset_section : existing.asset_section,
      address:       b.address       !== undefined ? b.address       : existing.address,
      city:          b.city          !== undefined ? b.city          : existing.city,
      suburb:        b.suburb        !== undefined ? b.suburb        : existing.suburb,
    };
    const addrErr = validateBuildingAddress(merged);
    if (addrErr) return res.status(422).json({ error: addrErr });

    // Policy section is mandatory for every asset.
    const mergedPolicySectionId = b.policy_section_id !== undefined ? b.policy_section_id : existing.policy_section_id;
    const mergedAssetSection    = b.asset_section     !== undefined ? b.asset_section     : existing.asset_section;
    if (!mergedPolicySectionId && !(mergedAssetSection && String(mergedAssetSection).trim())) {
      return res.status(422).json({ error: 'Select a Policy Section before saving the asset.' });
    }

    const mergedProductId = b.product_id !== undefined ? b.product_id : existing.product_id;
    const prodErr = validateAssetProduct(db, mergedProductId);
    if (prodErr) return res.status(422).json({ error: prodErr });

    // Only update columns that actually exist in the table
    const tableInfo = db.prepare('PRAGMA table_info(assets)').all();
    const existingCols = new Set(tableInfo.map(c => c.name));
    const cols = ASSET_COLUMNS.filter(c => existingCols.has(c));

    // Required fields: keep existing value if body is empty
    const reqStr = (col) => {
      const v = normalise(b[col]);
      return v || existing[col];
    };

    const setClause = cols.map(c => `${c} = ?`).join(',\n        ');
    const values = cols.map(c => {
      if (c === 'asset_name' || c === 'asset_type' || c === 'asset_status') return reqStr(c);
      return normalise(b[c]);
    });

    db.prepare(`
      UPDATE assets SET
        ${setClause},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(...values, req.params.id);

    const updated = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);

    // Build description of changed fields
    const changes = [];
    for (const col of cols) {
      const oldVal = existing[col];
      const newVal = updated[col];
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changes.push(`${col}: "${oldVal ?? ''}" → "${newVal ?? ''}"`);
      }
    }

    res.locals.logAudit({
      action: 'UPDATE',
      module: 'assets',
      recordId: parseInt(req.params.id),
      oldValue: existing,
      newValue: updated,
      description: changes.length
        ? `Asset updated: ${updated.asset_name}. Changes: ${changes.join('; ')}`
        : `Asset updated: ${updated.asset_name} (no field changes detected)`
    });

    res.json(updated);
  } catch (err) {
    console.error('PUT /assets/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// ============================================================
// DELETE /:id — delete asset
// ============================================================
router.delete('/:id', canDelete, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Broker isolation: check via the linked policy
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.policy_id) {
      const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(existing.policy_id);
      if (policy && policy.assigned_broker_id !== scopedBrokerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);

    res.locals.logAudit({
      action: 'DELETE',
      module: 'assets',
      recordId: parseInt(req.params.id),
      oldValue: existing,
      description: `Asset deleted: ${existing.asset_name}`
    });

    res.json({ message: 'Asset deleted successfully' });
  } catch (err) {
    console.error('DELETE /assets/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// ============================================================
// GET /:id/amendment-changes — recent changes (or all current values)
//   Query params:
//     range = '24h'  (default) — UPDATE diffs from the last 24 hours
//             'week'           — UPDATE diffs from the last 7 days
//             'all'            — UPDATE diffs since the asset was created
//             'new'            — current populated field values (used by
//                                the post-create "send to insurer" popup)
// ============================================================
router.get('/:id/amendment-changes', (req, res) => {
  try {
    const db = getDb();
    const asset = db.prepare(`
      SELECT a.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        ac.account_name,
        p.policy_name, p.policy_number, p.insurer
      FROM assets a
      LEFT JOIN contacts c ON a.contact_id = c.id
      LEFT JOIN accounts ac ON a.account_id = ac.id
      LEFT JOIN policies p ON a.policy_id = p.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const range = ['24h', 'week', 'all', 'new'].includes(String(req.query.range))
      ? String(req.query.range)
      : '24h';
    const RANGE_LABELS = {
      '24h':  'in the last 24 hours',
      'week': 'in the last 7 days',
      'all':  'since the asset was created',
      'new':  'on creation',
    };

    let auditRows = [];
    if (range !== 'new') {
      const sinceClause =
        range === 'all'  ? '' :
        range === 'week' ? 'AND al.timestamp >= ?' :
                           'AND al.timestamp >= ?';
      const sinceParam =
        range === 'all'  ? null :
        range === 'week' ? new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString() :
                           new Date(Date.now() - 1  * 24 * 60 * 60 * 1000).toISOString();
      const params = [parseInt(req.params.id, 10)];
      if (sinceParam) params.push(sinceParam);
      auditRows = db.prepare(`
        SELECT al.*, u.full_name AS user_name
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.module = 'assets' AND al.record_id = ? AND al.action = 'UPDATE' ${sinceClause}
        ORDER BY al.timestamp DESC
      `).all(...params);
    }

    // Build human-readable change descriptions
    const FIELD_LABELS = {
      asset_name: 'Asset Name', asset_type: 'Asset Type', asset_status: 'Status',
      asset_value: 'Insured Value', premium: 'Premium', sasria: 'SASRIA', excess: 'Excess',
      excess_pct_claim: 'Excess % of Claim', excess_pct_insured: 'Excess % of Insured',
      minimum_excess: 'Minimum Excess', sum_insured: 'Sum Insured', basis_of_cover: 'Basis of Cover',
      registration_number: 'Registration Number', vin_number: 'VIN Number', engine_number: 'Engine Number',
      make: 'Make', model: 'Model', year: 'Year', serial_number: 'Serial Number',
      mm_number: 'M & M Number', asset_section: 'Policy Section',
      address: 'Street Address', suburb: 'Suburb', city: 'City', province: 'Province', postal_code: 'Postal Code',
      use_type: 'Use Type', gvm: 'GVM', tracking_device: 'Tracking Device', territory: 'Territory',
      cover_type: 'Cover Type', regular_driver: 'Regular Driver', credit_shortfall: 'Credit Shortfall',
      financial_interest_noted: 'Financial Interest Noted', financial_institution: 'Financial Institution',
      finance_contract_number: 'Finance Contract Number', contract_expiry_date: 'Contract Expiry Date',
      conditions: 'Conditions/Warranties', extensions: 'Extensions/Endorsements', exclusions: 'Exclusions',
      notes: 'Notes', date_acquired: 'Date Acquired', date_sold: 'Date Sold',
      vehicle_extras: 'Vehicle Extras', extras_in_total: 'Extras in Total', excesses: 'Excesses',
      contact_id: 'Contact', account_id: 'Account', policy_id: 'Policy',
    };
    const SKIP = new Set(['id','created_at','updated_at','created_by','policy_section_id']);
    const CURRENCY_FIELDS = new Set(['asset_value','premium','sasria','excess','minimum_excess','sum_insured',
      'excess_pct_claim','excess_pct_insured','unspecified_items','specified_items','avg_stock_value',
      'max_stock_value','replacement_value','limit_of_indemnity','aggregate_limit','turnover','max_single_load']);
    const fmtCur = (v) => {
      const n = Number(v);
      if (isNaN(n)) return String(v);
      return 'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const fmtExtras = (v) => {
      try {
        const arr = typeof v === 'string' ? JSON.parse(v) : v;
        if (!Array.isArray(arr) || !arr.length) return '(none)';
        return arr.map(ex => `${ex.name || '(unnamed)'} ${fmtCur(ex.amount || 0)}`).join(', ');
      } catch (_) { return String(v); }
    };
    const fmtVal = (v, field) => {
      if (v === null || v === undefined || v === '') return '(empty)';
      if (field === 'vehicle_extras') return fmtExtras(v);
      if (v === 1 || v === true) return 'Yes';
      if (v === 0 || v === false) return 'No';
      if (CURRENCY_FIELDS.has(field) && !isNaN(Number(v))) return fmtCur(v);
      return String(v);
    };

    // Build asset description: e.g. "Motor Vehicle 2002 Mazda Drifter, Registration ABC 123 GP"
    const assetDesc = [
      asset.asset_type,
      asset.asset_name,
      [asset.make, asset.model].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ')
      + (asset.registration_number ? ', Registration ' + asset.registration_number : '');

    const humanize = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const changes = [];
    if (range === 'new') {
      // Dump every populated field on the asset as a "Add Label: Value" line.
      // The popup is opened straight after asset creation so this represents
      // the full set of values entered.
      const SECTION_NAME = asset.policy_section_name || asset.asset_section || null;
      const DISPLAY_OVERRIDES = {
        contact_id: () => asset.contact_name || null,
        account_id: () => asset.account_name || null,
        policy_id:  () => asset.policy_name || asset.policy_number || null,
        policy_section_id: () => SECTION_NAME,
      };
      // Stable, sensible ordering — anything not listed appears at the end.
      const ORDER = [
        'asset_name', 'asset_type', 'asset_section', 'asset_status',
        'contact_id', 'account_id', 'policy_id',
        'make', 'model', 'year', 'registration_number', 'vin_number',
        'engine_number', 'serial_number', 'mm_number',
        'cover_type', 'use_type', 'territory', 'gvm', 'tracking_device',
        'regular_driver', 'credit_shortfall',
        'address', 'suburb', 'city', 'province', 'postal_code',
        'sum_insured', 'asset_value', 'premium', 'sasria', 'excess',
        'excess_pct_claim', 'excess_pct_insured', 'minimum_excess',
        'basis_of_cover',
        'financial_interest_noted', 'financial_institution',
        'finance_contract_number', 'contract_expiry_date',
        'date_acquired', 'date_sold',
        'vehicle_extras', 'extras_in_total', 'excesses', 'additional_covers',
        'conditions', 'extensions', 'exclusions',
        'notes',
      ];
      const orderIndex = new Map(ORDER.map((k, i) => [k, i]));
      const isEmpty = (v) => v === null || v === undefined || v === '' ||
                              (Array.isArray(v) && v.length === 0);

      const allKeys = Object.keys(asset)
        // exclude joined/derived columns and internal SKIP set
        .filter(k => !SKIP.has(k))
        .filter(k => !['contact_name', 'account_name', 'policy_name', 'policy_number',
                       'insurer', 'policy_section_name', 'policy_section_type'].includes(k))
        .sort((a, b) => {
          const ai = orderIndex.has(a) ? orderIndex.get(a) :  999;
          const bi = orderIndex.has(b) ? orderIndex.get(b) :  999;
          if (ai !== bi) return ai - bi;
          return a.localeCompare(b);
        });

      for (const key of allKeys) {
        let raw = asset[key];
        if (DISPLAY_OVERRIDES[key]) {
          const override = DISPLAY_OVERRIDES[key]();
          if (override) raw = override;
        }
        if (isEmpty(raw)) continue;
        const label = FIELD_LABELS[key] || humanize(key);
        const value = fmtVal(raw, key);
        changes.push({
          field: key,
          label,
          to: value,
          description: `${label}: ${value}`,
        });
      }
    } else {
      auditRows.forEach(entry => {
        if (!entry.old_value || !entry.new_value) return;
        try {
          const oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
          const newObj = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
          const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
          for (const key of keys) {
            if (SKIP.has(key)) continue;
            const norm = v => (v === null || v === undefined) ? '' : String(v);
            if (norm(oldObj[key]) !== norm(newObj[key])) {
              const label = FIELD_LABELS[key] || humanize(key);
              changes.push({
                field: key,
                label,
                from: fmtVal(oldObj[key], key),
                to: fmtVal(newObj[key], key),
                description: `Amend ${label} of ${assetDesc} from ${fmtVal(oldObj[key], key)} to ${fmtVal(newObj[key], key)}`,
              });
            }
          }
        } catch (_) {}
      });
    }

    // Get broker name
    const broker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.session.userId);

    res.json({
      asset,
      changes,
      range,
      range_label: RANGE_LABELS[range],
      is_new_asset: range === 'new',
      broker_name: broker?.full_name || '',
      client_name: asset.contact_name || asset.account_name || '',
      policy_number: asset.policy_number || '',
      insurer: asset.insurer || '',
    });
  } catch (err) {
    console.error('amendment-changes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /:id/amendment-pdf — generate amendment PDF with recent changes
// ============================================================
router.get('/:id/amendment-pdf', async (req, res) => {
  try {
    const db = getDb();
    const asset = db.prepare(`
      SELECT a.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        ac.account_name,
        p.policy_name, p.policy_number, p.insurer,
        ps.section_name AS policy_section_name
      FROM assets a
      LEFT JOIN contacts c ON a.contact_id = c.id
      LEFT JOIN accounts ac ON a.account_id = ac.id
      LEFT JOIN policies p ON a.policy_id = p.id
      LEFT JOIN policy_sections ps ON a.policy_section_id = ps.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // Get audit log entries from last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const auditRows = db.prepare(`
      SELECT al.*, u.full_name AS user_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.module = 'assets' AND al.record_id = ? AND al.timestamp >= ?
      ORDER BY al.timestamp DESC
    `).all(parseInt(req.params.id), since);

    // Collect changed fields from audit log
    const changedFields = new Set();
    auditRows.forEach(entry => {
      if (entry.action === 'UPDATE' && entry.old_value && entry.new_value) {
        try {
          const oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
          const newObj = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
          const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
          for (const key of keys) {
            const norm = v => (v === null || v === undefined) ? '' : String(v);
            if (norm(oldObj[key]) !== norm(newObj[key])) changedFields.add(key);
          }
        } catch (_) {}
      }
    });

    // Vehicle extras
    let extras = [];
    try { extras = JSON.parse(asset.vehicle_extras || '[]'); } catch (_) {}

    const PDFDocument = require('pdfkit');
    const chunks = [];
    const pdfDoc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    pdfDoc.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      pdfDoc.on('end', resolve);
      pdfDoc.on('error', reject);

      const PAGE_W = 595.28, PAGE_H = 841.89;
      const M = 36, W = PAGE_W - M * 2;
      const PRIMARY = '#1a73e8';
      const DARK = '#2c3e50';
      const GREEN = '#22863a';
      const GREEN_BG = '#e6f9ed';
      const LIGHT_BG = '#f5f7fa';
      const BORDER = '#dee2e6';
      const dash = v => (v != null && v !== '') ? String(v) : '\u2014';
      const fmtCur = v => (v != null && v !== '' && Number(v) !== 0)
        ? 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '\u2014';
      const fmtDate = v => v ? String(v).slice(0, 10) : '\u2014';
      const today = new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const hasChanges = changedFields.size > 0;

      function checkPage(needed) {
        if (pdfDoc.y + needed > PAGE_H - 50) pdfDoc.addPage();
      }

      // ═══ HEADER BAR ═══
      pdfDoc.rect(0, 0, PAGE_W, 60).fillColor(PRIMARY).fill();
      pdfDoc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff')
        .text('AMENDMENT NOTIFICATION', M, 14, { width: W / 2 });
      pdfDoc.font('Helvetica').fontSize(8).fillColor('#ffffffcc')
        .text('Confidential \u2014 prepared by Inexpro CC', M, 34);
      pdfDoc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
        .text('Inexpro CC', M + W / 2, 14, { width: W / 2, align: 'right' });
      pdfDoc.font('Helvetica').fontSize(8).fillColor('#ffffffcc')
        .text(`Date: ${today}`, M + W / 2, 28, { width: W / 2, align: 'right' })
        .text(hasChanges ? `${changedFields.size} field(s) amended in last 24h` : 'No changes in last 24h', M + W / 2, 40, { width: W / 2, align: 'right' });

      // ═══ POLICY INFO BAR ═══
      let cy = 64;
      pdfDoc.rect(0, cy, PAGE_W, 36).fillColor(LIGHT_BG).fill();
      pdfDoc.moveTo(0, cy + 36).lineTo(PAGE_W, cy + 36).strokeColor(BORDER).lineWidth(0.5).stroke();
      const pFields = [];
      if (asset.policy_name || asset.policy_number) pFields.push(['POLICY', asset.policy_name || asset.policy_number]);
      if (asset.policy_number) pFields.push(['POLICY #', asset.policy_number]);
      if (asset.insurer) pFields.push(['INSURER', asset.insurer]);
      if (asset.contact_name) pFields.push(['INSURED', asset.contact_name]);
      if (asset.account_name) pFields.push(['ACCOUNT', asset.account_name]);
      const pfW = W / Math.max(pFields.length, 1);
      pFields.forEach(([label, value], i) => {
        pdfDoc.font('Helvetica').fontSize(6).fillColor('#888').text(label, M + i * pfW, cy + 6, { width: pfW - 4 });
        pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor('#222').text(dash(value), M + i * pfW, cy + 16, { width: pfW - 4 });
      });
      cy += 40;
      pdfDoc.y = cy;

      // ═══ HELPER: field row ═══
      function fieldRow(label, value, fieldName) {
        checkPage(16);
        const isChanged = changedFields.has(fieldName);
        const y = pdfDoc.y;
        if (isChanged) {
          pdfDoc.rect(M, y, W, 14).fillColor(GREEN_BG).fill();
        }
        pdfDoc.font('Helvetica-Bold').fontSize(8).fillColor(isChanged ? GREEN : '#555')
          .text(label, M + 4, y + 3, { width: 160 });
        pdfDoc.font('Helvetica').fontSize(8).fillColor(isChanged ? GREEN : '#222')
          .text(dash(value), M + 168, y + 3, { width: W - 172 });
        if (isChanged) {
          pdfDoc.font('Helvetica-Bold').fontSize(7).fillColor(GREEN)
            .text('AMENDED', M + W - 55, y + 3, { width: 50, align: 'right' });
        }
        pdfDoc.moveTo(M, y + 14).lineTo(M + W, y + 14).strokeColor(BORDER).lineWidth(0.3).stroke();
        pdfDoc.y = y + 15;
      }

      function sectionHead(title) {
        checkPage(24);
        const y = pdfDoc.y + 4;
        pdfDoc.rect(M, y, W, 18).fillColor(DARK).fill();
        pdfDoc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff')
          .text(title.toUpperCase(), M + 8, y + 4, { width: W - 16 });
        pdfDoc.y = y + 20;
      }

      // ═══ ASSET DETAILS ═══
      sectionHead('Asset Details');
      fieldRow('Asset Name', asset.asset_name, 'asset_name');
      fieldRow('Asset Type', asset.asset_type, 'asset_type');
      fieldRow('Status', asset.asset_status, 'asset_status');
      if (asset.asset_section) fieldRow('Policy Section', asset.asset_section, 'asset_section');
      fieldRow('Asset Value', fmtCur(asset.asset_value), 'asset_value');
      if (asset.mm_number) fieldRow('M & M Number', asset.mm_number, 'mm_number');

      // ═══ INSURANCE FINANCIALS ═══
      sectionHead('Insurance Financials');
      fieldRow('Premium', fmtCur(asset.premium), 'premium');
      fieldRow('SASRIA', fmtCur(asset.sasria), 'sasria');
      fieldRow('Basic Excess', fmtCur(asset.excess), 'excess');
      if (asset.excess_pct_claim != null) fieldRow('Excess % of Claim', asset.excess_pct_claim + '%', 'excess_pct_claim');
      if (asset.excess_pct_insured != null) fieldRow('Excess % of Insured', asset.excess_pct_insured + '%', 'excess_pct_insured');
      if (asset.minimum_excess != null) fieldRow('Minimum Excess', fmtCur(asset.minimum_excess), 'minimum_excess');
      if (asset.sum_insured != null) fieldRow('Sum Insured', fmtCur(asset.sum_insured), 'sum_insured');
      if (asset.basis_of_cover) fieldRow('Basis of Cover', asset.basis_of_cover, 'basis_of_cover');

      // ═══ IDENTIFICATION ═══
      if (asset.make || asset.model || asset.year || asset.registration_number || asset.vin_number || asset.engine_number || asset.serial_number) {
        sectionHead('Identification');
        if (asset.make) fieldRow('Make', asset.make, 'make');
        if (asset.model) fieldRow('Model', asset.model, 'model');
        if (asset.year) fieldRow('Year', asset.year, 'year');
        if (asset.registration_number) fieldRow('Registration Number', asset.registration_number, 'registration_number');
        if (asset.vin_number) fieldRow('VIN Number', asset.vin_number, 'vin_number');
        if (asset.engine_number) fieldRow('Engine Number', asset.engine_number, 'engine_number');
        if (asset.serial_number) fieldRow('Serial Number', asset.serial_number, 'serial_number');
      }

      // ═══ FINANCIAL INTEREST ═══
      if (asset.financial_interest_noted || asset.financial_institution || asset.finance_contract_number || asset.contract_expiry_date) {
        sectionHead('Financial Interest');
        fieldRow('Financial Interest Noted', asset.financial_interest_noted ? 'Yes' : 'No', 'financial_interest_noted');
        if (asset.financial_institution) fieldRow('Financial Institution', asset.financial_institution, 'financial_institution');
        if (asset.finance_contract_number) fieldRow('Finance Contract Number', asset.finance_contract_number, 'finance_contract_number');
        if (asset.contract_expiry_date) fieldRow('Contract Expiry Date', fmtDate(asset.contract_expiry_date), 'contract_expiry_date');
      }

      // ═══ VEHICLE EXTRAS ═══
      if (extras.length) {
        sectionHead('Vehicle Extras');
        extras.forEach((ex, i) => {
          fieldRow(`Extra ${i + 1}`, `${ex.name || '\u2014'} \u2014 ${fmtCur(ex.amount)}`, 'vehicle_extras');
        });
      }

      // ═══ BUILDING ADDRESS ═══
      if (asset.asset_type === 'Building / Structure' && (asset.address || asset.city)) {
        sectionHead('Building Address');
        if (asset.address) fieldRow('Street Address', asset.address, 'address');
        if (asset.suburb) fieldRow('Suburb', asset.suburb, 'suburb');
        if (asset.city) fieldRow('City / Town', asset.city, 'city');
        if (asset.province) fieldRow('Province', asset.province, 'province');
        if (asset.postal_code) fieldRow('Postal Code', asset.postal_code, 'postal_code');
      }

      // ═══ COVER DETAILS ═══
      if (asset.conditions || asset.extensions || asset.exclusions) {
        sectionHead('Cover Details');
        if (asset.conditions) fieldRow('Conditions / Warranties', asset.conditions, 'conditions');
        if (asset.extensions) fieldRow('Extensions / Endorsements', asset.extensions, 'extensions');
        if (asset.exclusions) fieldRow('Exclusions', asset.exclusions, 'exclusions');
      }

      // ═══ DATES ═══
      sectionHead('Dates');
      fieldRow('Date Acquired', fmtDate(asset.date_acquired), 'date_acquired');
      if (asset.date_sold) fieldRow('Date Sold', fmtDate(asset.date_sold), 'date_sold');

      // ═══ NOTES ═══
      if (asset.notes) {
        sectionHead('Notes');
        checkPage(30);
        pdfDoc.font('Helvetica').fontSize(8).fillColor('#222')
          .text(asset.notes, M + 4, pdfDoc.y + 2, { width: W - 8 });
        pdfDoc.moveDown(0.5);
      }

      // ═══ CHANGE LOG ═══
      if (auditRows.length) {
        sectionHead('Change Log (Last 24 Hours)');
        auditRows.forEach(entry => {
          checkPage(30);
          const y = pdfDoc.y;
          pdfDoc.font('Helvetica-Bold').fontSize(7).fillColor('#555')
            .text(`${entry.action} by ${entry.user_name || 'System'} \u2014 ${entry.timestamp ? entry.timestamp.slice(0, 19).replace('T', ' ') : ''}`,
              M + 4, y + 2, { width: W - 8 });
          if (entry.old_value && entry.new_value && entry.action === 'UPDATE') {
            try {
              const oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
              const newObj = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
              const skip = new Set(['id','created_at','updated_at','created_by']);
              const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
              for (const key of keys) {
                if (skip.has(key)) continue;
                const norm = v => (v === null || v === undefined) ? '' : String(v);
                if (norm(oldObj[key]) !== norm(newObj[key])) {
                  checkPage(12);
                  const lbl = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  pdfDoc.font('Helvetica').fontSize(7).fillColor(GREEN)
                    .text(`  ${lbl}: "${norm(oldObj[key]) || '(empty)'}" \u2192 "${norm(newObj[key]) || '(empty)'}"`,
                      M + 8, pdfDoc.y + 1, { width: W - 16 });
                }
              }
            } catch (_) {}
          }
          pdfDoc.moveDown(0.4);
        });
      }

      // ═══ FOOTER ═══
      checkPage(30);
      const ftY = pdfDoc.y + 8;
      pdfDoc.moveTo(M, ftY).lineTo(M + W, ftY).strokeColor(BORDER).lineWidth(0.5).stroke();
      pdfDoc.font('Helvetica').fontSize(7).fillColor('#999')
        .text('This document is confidential. Inexpro CC \u2014 Authorised Financial Services Provider.',
          M, ftY + 6, { width: W, align: 'center' });

      pdfDoc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Amendment-${asset.asset_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('amendment-pdf error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /:id/confirmation-of-cover-pdf — generate Confirmation of Cover PDF
// Returns { base64, filename } so the client can attach it to an email.
// Uses letterhead-ROA.png as the page background and populates text
// fields from the asset (registered owner, policy, vehicle, cover).
// ============================================================
router.get('/:id/confirmation-of-cover-pdf', async (req, res) => {
  try {
    const db = getDb();
    const asset = db.prepare(`
      SELECT a.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        ac.account_name,
        p.policy_name, p.policy_number, p.insurer,
        ps.section_name AS policy_section_name
      FROM assets a
      LEFT JOIN contacts c ON a.contact_id = c.id
      LEFT JOIN accounts ac ON a.account_id = ac.id
      LEFT JOIN policies p ON a.policy_id = p.id
      LEFT JOIN policy_sections ps ON a.policy_section_id = ps.id
      WHERE a.id = ?
    `).get(req.params.id);

    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const path = require('path');
    const fs = require('fs');
    const letterheadPath = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');
    const hasLetterhead = fs.existsSync(letterheadPath);

    const PDFDocument = require('pdfkit');
    const chunks = [];
    const pdfDoc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    pdfDoc.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      pdfDoc.on('end', resolve);
      pdfDoc.on('error', reject);

      const PAGE_W = 595.28, PAGE_H = 841.89;

      // Letterhead — header only (top of page, auto-scaled to full width)
      if (hasLetterhead) {
        try { pdfDoc.image(letterheadPath, 0, 0, { width: PAGE_W }); }
        catch (_) {}
      }

      const LEFT = 60;
      const RIGHT = PAGE_W - 60;
      const W = RIGHT - LEFT;

      // Field helpers
      const dash = v => (v != null && v !== '') ? String(v) : '\u2014';
      const fmtCur = v => (v != null && v !== '' && !isNaN(Number(v)))
        ? 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' (INCL VAT)'
        : '\u2014';
      const fmtDate = v => {
        if (!v) return '\u2014';
        const s = String(v).slice(0, 10);
        const [y, m, d] = s.split('-');
        if (!y || !m || !d) return s;
        return `${d}/${m}/${y}`;
      };
      const longDate = (() => {
        const d = new Date();
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      })();

      // Derived values
      const registeredOwner = asset.account_name || asset.contact_name || '\u2014';
      const addressParts = [asset.address, asset.suburb, asset.city, asset.province, asset.postal_code]
        .filter(Boolean).join(', ');
      const riskAddress = addressParts || '\u2014';
      const makeModel = [asset.make, asset.model].filter(Boolean).join(' ') || '\u2014';
      const effectiveDate = fmtDate(asset.date_acquired || new Date().toISOString());

      // Signature (sending user)
      let signerName = 'Inexpro CC';
      try {
        const u = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.session?.userId);
        if (u && u.full_name) signerName = u.full_name;
      } catch (_) {}

      // Start writing content — start below the letterhead header area (~150pt down)
      let y = 160;

      pdfDoc.font('Helvetica').fontSize(10).fillColor('#000')
        .text(longDate, LEFT, y, { width: W, align: 'right' });
      y += 30;

      pdfDoc.font('Helvetica-Bold').fontSize(14).fillColor('#000')
        .text('Confirmation of Cover', LEFT, y, { width: W, align: 'center' });
      y += 40;

      // Field label+value renderer
      function line(label, value, opts = {}) {
        const lineH = opts.lineH || 16;
        pdfDoc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
          .text(label, LEFT, y, { width: 130, continued: false });
        pdfDoc.font('Helvetica').fontSize(10).fillColor('#000')
          .text(dash(value), LEFT + 130, y, { width: W - 130 });
        const h = Math.max(lineH, pdfDoc.y - y);
        y += h;
      }

      line('Policy name:',   asset.policy_name || asset.policy_number);
      line('Risk Address:',  riskAddress, { lineH: 20 });
      y += 6;
      line('Policy number:', asset.policy_number);
      y += 10;

      pdfDoc.font('Helvetica').fontSize(10).fillColor('#000')
        .text(
          `It is hereby declared and agreed that the item below is covered under the above-mentioned policy. Subject to the terms, conditions, and exceptions of the policy, with effect of ${effectiveDate}.`,
          LEFT, y, { width: W, align: 'left' }
        );
      y = pdfDoc.y + 14;

      line('Cover Type:',       asset.cover_type);
      line('Make:',             makeModel, { lineH: 20 });
      line('Year model:',       asset.year);
      line('VIN NR:',           asset.vin_number);
      line('Engine No:',        asset.engine_number);
      line('REGNR:',            asset.registration_number);
      line('Registered owner:', registeredOwner, { lineH: 20 });
      y += 4;
      line('Sum insured:',      fmtCur(asset.sum_insured));
      y += 8;

      // Financial interest paragraph (only if data present)
      if (asset.financial_institution) {
        const contractNum = asset.finance_contract_number ? ` with contract number ${asset.finance_contract_number}` : '';
        const endDate = asset.contract_expiry_date ? ` and end date ${fmtDate(asset.contract_expiry_date)}` : '';
        pdfDoc.font('Helvetica').fontSize(10).fillColor('#000')
          .text(`The interest of ${asset.financial_institution} has been noted${contractNum}${endDate}.`,
            LEFT, y, { width: W });
        y = pdfDoc.y + 20;
      }

      // Signature
      pdfDoc.font('Helvetica').fontSize(10).fillColor('#000')
        .text('Regards,', LEFT, y);
      y += 48;
      pdfDoc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
        .text(signerName, LEFT, y);

      pdfDoc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);
    const safeName = (asset.asset_name || 'asset').replace(/[^a-zA-Z0-9]/g, '_');
    res.json({
      base64:   pdfBuffer.toString('base64'),
      filename: `Confirmation-of-Cover-${safeName}.pdf`,
    });
  } catch (err) {
    console.error('confirmation-of-cover-pdf error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ASSET AMENDMENTS — CRUD
// ============================================================

// Helper: ensure caller can access asset (via linked policy's broker)
function _checkAssetAccess(db, req, assetId) {
  const asset = db.prepare('SELECT id, policy_id FROM assets WHERE id = ?').get(assetId);
  if (!asset) return { error: 404, message: 'Asset not found' };
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && asset.policy_id) {
    const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(asset.policy_id);
    if (policy && policy.assigned_broker_id !== scopedBrokerId) {
      return { error: 403, message: 'Access denied' };
    }
  }
  return { asset };
}

// GET /:id/amendments — list all amendments for an asset (with attachments)
router.get('/:id/amendments', (req, res) => {
  try {
    const db = getDb();
    const check = _checkAssetAccess(db, req, req.params.id);
    if (check.error) return res.status(check.error).json({ error: check.message });

    const rows = db.prepare(`
      SELECT aa.*, u.full_name AS created_by_name
      FROM asset_amendments aa
      LEFT JOIN users u ON u.id = aa.created_by
      WHERE aa.asset_id = ?
      ORDER BY aa.amendment_date DESC, aa.created_at DESC
    `).all(req.params.id);

    if (rows.length) {
      const ids = rows.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const docs = db.prepare(`
        SELECT id, asset_amendment_id, original_name, file_type, file_size, uploaded_at
        FROM documents
        WHERE asset_amendment_id IN (${placeholders})
        ORDER BY uploaded_at DESC
      `).all(...ids);
      const byAmendment = new Map(rows.map(r => [r.id, []]));
      docs.forEach(d => {
        const list = byAmendment.get(d.asset_amendment_id);
        if (list) list.push(d);
      });
      rows.forEach(r => { r.attachments = byAmendment.get(r.id) || []; });
    }

    res.json(rows);
  } catch (err) {
    console.error('GET /assets/:id/amendments error:', err.message);
    res.status(500).json({ error: 'Failed to load amendments' });
  }
});

// POST /:id/amendments — add an amendment note
router.post('/:id/amendments', (req, res) => {
  try {
    const db = getDb();
    const check = _checkAssetAccess(db, req, req.params.id);
    if (check.error) return res.status(check.error).json({ error: check.message });

    const { amendment_date, amendment_type, details } = req.body;
    if (!details || !details.trim()) return res.status(400).json({ error: 'Details are required' });

    const result = db.prepare(`
      INSERT INTO asset_amendments (asset_id, amendment_date, amendment_type, details, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      amendment_date || new Date().toISOString().slice(0, 10),
      amendment_type || null,
      details.trim(),
      req.session.userId
    );

    const created = db.prepare(`
      SELECT aa.*, u.full_name AS created_by_name
      FROM asset_amendments aa
      LEFT JOIN users u ON u.id = aa.created_by
      WHERE aa.id = ?
    `).get(result.lastInsertRowid);

    res.locals.logAudit({
      action: 'CREATE', module: 'assets', recordId: parseInt(req.params.id),
      newValue: created, description: `Note added to asset`
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('POST /assets/:id/amendments error:', err.message);
    res.status(500).json({ error: 'Failed to add amendment' });
  }
});

// PUT /:assetId/amendments/:amendmentId — update an amendment note
router.put('/:assetId/amendments/:amendmentId', (req, res) => {
  try {
    const db = getDb();
    const check = _checkAssetAccess(db, req, req.params.assetId);
    if (check.error) return res.status(check.error).json({ error: check.message });

    const existing = db.prepare(
      'SELECT * FROM asset_amendments WHERE id = ? AND asset_id = ?'
    ).get(req.params.amendmentId, req.params.assetId);
    if (!existing) return res.status(404).json({ error: 'Amendment not found' });

    const { amendment_date, amendment_type, details } = req.body;
    if (!details || !details.trim()) return res.status(400).json({ error: 'Details are required' });

    db.prepare(`
      UPDATE asset_amendments
      SET amendment_date = ?, amendment_type = ?, details = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      amendment_date || existing.amendment_date,
      amendment_type || null,
      details.trim(),
      req.params.amendmentId
    );

    const updated = db.prepare(`
      SELECT aa.*, u.full_name AS created_by_name
      FROM asset_amendments aa
      LEFT JOIN users u ON u.id = aa.created_by
      WHERE aa.id = ?
    `).get(req.params.amendmentId);

    res.locals.logAudit({
      action: 'UPDATE', module: 'assets', recordId: parseInt(req.params.assetId),
      oldValue: existing, newValue: updated, description: `Note updated on asset`
    });

    res.json(updated);
  } catch (err) {
    console.error('PUT /assets/:assetId/amendments/:amendmentId error:', err.message);
    res.status(500).json({ error: 'Failed to update amendment' });
  }
});

// DELETE /:assetId/amendments/:amendmentId — admin role only
router.delete('/:assetId/amendments/:amendmentId', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const check = _checkAssetAccess(db, req, req.params.assetId);
    if (check.error) return res.status(check.error).json({ error: check.message });

    const existing = db.prepare(
      'SELECT * FROM asset_amendments WHERE id = ? AND asset_id = ?'
    ).get(req.params.amendmentId, req.params.assetId);
    if (!existing) return res.status(404).json({ error: 'Amendment not found' });

    // Remove attached files from disk + DB before deleting the amendment row
    const docs = db.prepare(
      'SELECT id, file_path FROM documents WHERE asset_amendment_id = ?'
    ).all(req.params.amendmentId);
    const uploadRoot = _amendmentUploadRoot();
    docs.forEach(d => {
      if (d.file_path) {
        const full = path.resolve(uploadRoot, d.file_path);
        const rel  = path.relative(uploadRoot, full);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(full)) {
          try { fs.unlinkSync(full); } catch (e) { console.error('amendment file unlink failed:', e.message); }
        }
      }
    });
    db.prepare('DELETE FROM documents WHERE asset_amendment_id = ?').run(req.params.amendmentId);
    db.prepare('DELETE FROM asset_amendments WHERE id = ?').run(req.params.amendmentId);

    res.locals.logAudit({
      action: 'DELETE', module: 'assets', recordId: parseInt(req.params.assetId),
      oldValue: existing, description: `Note deleted from asset (${docs.length} attachment(s) removed)`
    });

    res.json({ message: 'Amendment deleted', removed_attachments: docs.length });
  } catch (err) {
    console.error('DELETE asset amendment error:', err.message);
    res.status(500).json({ error: 'Failed to delete amendment' });
  }
});

module.exports = router;
