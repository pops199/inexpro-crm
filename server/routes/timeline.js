'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// All timeline routes require authentication (no admin role required)
router.use(requireAuth);

// ---------------------------------------------------------------------------
// FK resolution: turn raw foreign-key integers stored in audit_log JSON into
// human-readable names so the timeline reads "Assigned Broker: Sarah Smith"
// instead of "Assigned Broker: 2".
// ---------------------------------------------------------------------------
//
// Each entry maps an audit-log column name to a {table, key, fmt} resolver.
// `key` is the column queried by id; `fmt` builds the friendly display string.
const FK_RESOLVERS = {
  // Users
  assigned_broker_id:        { table: 'users',     fmt: r => r.full_name },
  assigned_admin_id:         { table: 'users',     fmt: r => r.full_name },
  broker_id:                 { table: 'users',     fmt: r => r.full_name },
  admin_id:                  { table: 'users',     fmt: r => r.full_name },
  created_by:                { table: 'users',     fmt: r => r.full_name },
  uploaded_by:               { table: 'users',     fmt: r => r.full_name },
  uploaded_by_id:            { table: 'users',     fmt: r => r.full_name },
  approved_by_id:            { table: 'users',     fmt: r => r.full_name },
  claims_handler_admin_id:   { table: 'users',     fmt: r => r.full_name },
  complaint_owner_id:        { table: 'users',     fmt: r => r.full_name },
  complaint_handler_id:      { table: 'users',     fmt: r => r.full_name },
  assigned_handler_id:       { table: 'users',     fmt: r => r.full_name },
  assigned_to_id:            { table: 'users',     fmt: r => r.full_name },
  prepared_by_id:            { table: 'users',     fmt: r => r.full_name },
  conducted_by_id:           { table: 'users',     fmt: r => r.full_name },
  reviewed_by_id:            { table: 'users',     fmt: r => r.full_name },
  information_officer_id:    { table: 'users',     fmt: r => r.full_name },
  fica_verified_by_id:       { table: 'users',     fmt: r => r.full_name },
  supervisor_co_approved_by_id: { table: 'users',  fmt: r => r.full_name },
  disclosing_broker_id:      { table: 'users',     fmt: r => r.full_name },
  user_id:                   { table: 'users',     fmt: r => r.full_name },

  // Contacts
  contact_id:                { table: 'contacts',  fmt: r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || `#${r.id}` },
  co_insured_contact_id:     { table: 'contacts',  fmt: r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || `#${r.id}` },
  main_contact_id:           { table: 'contacts',  fmt: r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || `#${r.id}` },

  // Accounts
  account_id:                { table: 'accounts',  fmt: r => r.account_name || `#${r.id}` },
  related_account_id:        { table: 'accounts',  fmt: r => r.account_name || `#${r.id}` },

  // Policies
  policy_id:                 { table: 'policies',  fmt: r => r.policy_number ? `${r.policy_name || ''} (${r.policy_number})`.trim() : (r.policy_name || `#${r.id}`) },
  replacement_policy_id:     { table: 'policies',  fmt: r => r.policy_number ? `${r.policy_name || ''} (${r.policy_number})`.trim() : (r.policy_name || `#${r.id}`) },

  // Engagements
  engagement_id:             { table: 'client_engagements', fmt: r => r.engagement_name || `#${r.id}` },

  // Advice records
  advice_record_id:          { table: 'advice_records', fmt: r => r.advice_record_number || `#${r.id}` },
  related_advice_record_id:  { table: 'advice_records', fmt: r => r.advice_record_number || `#${r.id}` },
  linked_advice_record_id:   { table: 'advice_records', fmt: r => r.advice_record_number || `#${r.id}` },

  // Other module FKs
  policy_section_id:         { table: 'policy_sections', fmt: r => r.section_name || `#${r.id}` },
  asset_id:                  { table: 'assets',          fmt: r => r.asset_name || `#${r.id}` },
  claim_id:                  { table: 'claims',          fmt: r => r.claim_number || `#${r.id}` },
  complaint_id:              { table: 'complaints',      fmt: r => r.complaint_number || `#${r.id}` },
  review_id:                 { table: 'reviews',         fmt: r => r.review_number || `#${r.id}` },
  risk_detail_id:            { table: 'risk_details',    fmt: r => r.risk_detail_name || `#${r.id}` },
  product_id:                { table: 'products',        fmt: r => r.product_name || r.product_code || `#${r.id}` },
};

const TABLE_COLUMNS = {
  users:              'id, full_name',
  contacts:           'id, first_name, last_name',
  accounts:           'id, account_name',
  policies:           'id, policy_name, policy_number',
  client_engagements: 'id, engagement_name',
  advice_records:     'id, advice_record_number',
  policy_sections:    'id, section_name',
  assets:             'id, asset_name',
  claims:             'id, claim_number',
  complaints:         'id, complaint_number',
  reviews:            'id, review_number',
  risk_details:       'id, risk_detail_name',
  products:           'id, product_name, product_code',
};

/**
 * Walk every row's old_value/new_value JSON. Replace any FK integer with the
 * matching human-readable string. Mutates `rows` in place.
 */
function enrichTimelineRows(db, rows) {
  if (!rows || !rows.length) return rows;

  // First pass: collect (table, id) pairs we need to look up.
  const need = {}; // table → Set<id>
  const parsed = []; // [{ row, oldObj, newObj }]
  for (const row of rows) {
    let oldObj = null, newObj = null;
    try { oldObj = row.old_value ? (typeof row.old_value === 'string' ? JSON.parse(row.old_value) : row.old_value) : null; } catch (_) {}
    try { newObj = row.new_value ? (typeof row.new_value === 'string' ? JSON.parse(row.new_value) : row.new_value) : null; } catch (_) {}
    parsed.push({ row, oldObj, newObj });
    for (const obj of [oldObj, newObj]) {
      if (!obj || typeof obj !== 'object') continue;
      for (const [k, v] of Object.entries(obj)) {
        const r = FK_RESOLVERS[k];
        if (!r) continue;
        const id = parseInt(v, 10);
        if (!Number.isFinite(id)) continue;
        if (!need[r.table]) need[r.table] = new Set();
        need[r.table].add(id);
      }
    }
  }

  // Second pass: hydrate caches with one query per touched table.
  const cache = {}; // table → Map<id, row>
  for (const [table, idSet] of Object.entries(need)) {
    const ids = [...idSet];
    if (!ids.length) continue;
    const cols = TABLE_COLUMNS[table] || 'id';
    try {
      const placeholders = ids.map(() => '?').join(',');
      const fetched = db.prepare(`SELECT ${cols} FROM ${table} WHERE id IN (${placeholders})`).all(...ids);
      const m = new Map();
      fetched.forEach(r => m.set(r.id, r));
      cache[table] = m;
    } catch (_) { /* table may not exist in older DBs */ }
  }

  // Third pass: rewrite each value blob and re-serialize so the existing
  // client renderer (which JSON.parses old_value/new_value) sees clean strings.
  const replaceIds = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const [k, v] of Object.entries(obj)) {
      const r = FK_RESOLVERS[k];
      if (!r) continue;
      const id = parseInt(v, 10);
      if (!Number.isFinite(id)) continue;
      const lookup = cache[r.table]?.get(id);
      if (lookup) {
        const display = r.fmt(lookup);
        if (display) obj[k] = display;
      }
    }
    return obj;
  };

  for (const { row, oldObj, newObj } of parsed) {
    if (oldObj) row.old_value = JSON.stringify(replaceIds(oldObj));
    if (newObj) row.new_value = JSON.stringify(replaceIds(newObj));
  }

  return rows;
}

// ---------------------------------------------------------------------------
// GET /api/timeline?module=X&record_id=Y
// Returns audit log entries for a specific module + record combination.
// ---------------------------------------------------------------------------
router.get('/', (req, res, next) => {
  try {
    const { module: mod, record_id } = req.query;

    if (!mod || !record_id) {
      return res.status(400).json({ error: 'Both module and record_id query parameters are required' });
    }

    const recordIdInt = parseInt(record_id, 10);
    if (isNaN(recordIdInt)) {
      return res.status(400).json({ error: 'record_id must be a valid integer' });
    }

    const db = getDb();

    let rows;
    if (mod === 'policies') {
      // Policy timeline must also include child events that reference this
      // policy: commission_log entries and post_sale_events.
      rows = db.prepare(`
        SELECT al.*, u.full_name AS user_name
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE
              (al.module = 'policies'         AND al.record_id = ?)
           OR (al.module = 'commission_log'   AND al.record_id IN (
                 SELECT id FROM commission_log   WHERE policy_id = ?))
           OR (al.module = 'post_sale_events' AND al.record_id IN (
                 SELECT id FROM post_sale_events WHERE policy_id = ?))
        ORDER BY al.timestamp DESC
        LIMIT 200
      `).all(recordIdInt, recordIdInt, recordIdInt);
    } else {
      rows = db.prepare(`
        SELECT al.*, u.full_name AS user_name
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.module = ? AND al.record_id = ?
        ORDER BY al.timestamp DESC
        LIMIT 100
      `).all(mod, recordIdInt);
    }

    res.json(enrichTimelineRows(db, rows));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/timeline/contact/:id
// Returns ALL audit entries related to a contact:
//   - the contact record itself
//   - policies, assets, claims, engagements, complaints, reviews linked to contact
// ---------------------------------------------------------------------------
router.get('/contact/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Contact id must be a valid integer' });
    }

    const db = getDb();

    const rows = db.prepare(`
      SELECT al.*, u.full_name AS user_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE
        (al.module = 'contacts' AND al.record_id = ?)
        OR (al.module = 'policies'     AND al.record_id IN (SELECT id FROM policies          WHERE contact_id = ?))
        OR (al.module = 'assets'       AND al.record_id IN (SELECT id FROM assets            WHERE contact_id = ?))
        OR (al.module = 'claims'       AND al.record_id IN (SELECT id FROM claims            WHERE contact_id = ?))
        OR (al.module = 'engagements'  AND al.record_id IN (SELECT id FROM client_engagements WHERE contact_id = ?))
        OR (al.module = 'complaints'   AND al.record_id IN (SELECT id FROM complaints        WHERE contact_id = ?))
        OR (al.module = 'reviews'      AND al.record_id IN (SELECT id FROM reviews           WHERE contact_id = ?))
      ORDER BY al.timestamp DESC
      LIMIT 200
    `).all(id, id, id, id, id, id, id);

    res.json(enrichTimelineRows(db, rows));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/timeline/account/:id
// Returns ALL audit entries related to an account:
//   - the account record itself
//   - policies, assets, claims, engagements, complaints, reviews linked to account
// ---------------------------------------------------------------------------
router.get('/account/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Account id must be a valid integer' });
    }

    const db = getDb();

    const rows = db.prepare(`
      SELECT al.*, u.full_name AS user_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE
        (al.module = 'accounts'    AND al.record_id = ?)
        OR (al.module = 'policies'   AND al.record_id IN (SELECT id FROM policies           WHERE account_id = ?))
        OR (al.module = 'assets'     AND al.record_id IN (SELECT id FROM assets             WHERE account_id = ?))
        OR (al.module = 'claims'     AND al.record_id IN (SELECT id FROM claims             WHERE account_id = ?))
        OR (al.module = 'engagements' AND al.record_id IN (SELECT id FROM client_engagements WHERE account_id = ?))
        OR (al.module = 'complaints' AND al.record_id IN (SELECT id FROM complaints         WHERE account_id = ?))
        OR (al.module = 'reviews'    AND al.record_id IN (SELECT id FROM reviews            WHERE account_id = ?))
      ORDER BY al.timestamp DESC
      LIMIT 200
    `).all(id, id, id, id, id, id, id);

    res.json(enrichTimelineRows(db, rows));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
