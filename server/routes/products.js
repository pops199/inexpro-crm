'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');

const router = express.Router();
router.use(requireAuth);

const CATEGORY_OPTS = [
  'Personal Lines — Buildings',
  'Personal Lines — Contents',
  'Personal Lines — Motor',
  'Commercial Lines — Property',
  'Commercial Lines — Liability',
  'Commercial — Motor fleet',
  'Specialty',
  'Other',
];

// Target Market — combined union of:
//   • Account.business_type values (juristic clients)
//   • Contact.client_category values (individual clients / books of business)
// Plus a single 'Any' wildcard so a product can be marked applicable to all
// client profiles without ticking every box. The advice-records gate compares
// the linked party's business_type / client_category against this list to
// produce the suitability score.
const CLIENT_TYPE_OPTS = [
  // Contact client categories
  'Personal Lines', 'Commercial Lines', 'Agri', 'Transport', 'Mixed',
  'Supplier', 'Prospect Only',
  // Account business types
  'Company', 'Close Corporation', 'Sole Proprietor', 'Partnership',
  'Trust', 'NPO', 'School', 'Church', 'Body Corporate', 'Other',
  // Wildcard
  'Any',
];

const RISK_APPETITE_OPTS = ['Conservative', 'Moderate', 'Aggressive'];

const GEO_SCOPE_OPTS = [
  'South Africa — nationwide',
  'South Africa & Neighboring Countries',
  'Namibia & Neighboring Countries',
  'Specific provinces',
  'Specific areas',
  'Excluding high-risk zones'
];

const STATUS_OPTS = ['Active', 'Discontinued', 'Under review'];

function toJsonArray(v) {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) && parsed.length ? JSON.stringify(parsed) : null;
    } catch (_) {
      return JSON.stringify([v]);
    }
  }
  return null;
}

// Dropdown options
router.get('/options', (_req, res) => {
  const db = getDb();
  const insurers = db.prepare(
    "SELECT DISTINCT insurer FROM products WHERE insurer IS NOT NULL AND TRIM(insurer) != '' ORDER BY insurer COLLATE NOCASE"
  ).all().map(r => r.insurer);
  res.json({
    product_category: CATEGORY_OPTS,
    target_client_type: CLIENT_TYPE_OPTS,
    suitable_risk_appetite: RISK_APPETITE_OPTS,
    geographic_scope: GEO_SCOPE_OPTS,
    product_status: STATUS_OPTS,
    insurers,
  });
});

// GET / — list
router.get('/', (req, res) => {
  const db = getDb();
  const { category, status, search, insurer } = req.query;
  const conditions = [];
  const params = [];
  if (category) { conditions.push('p.product_category = ?'); params.push(category); }
  if (status)   { conditions.push('p.product_status = ?');   params.push(status); }
  if (insurer)  { conditions.push('p.insurer = ?');          params.push(insurer); }
  if (search)   {
    conditions.push('(p.product_name LIKE ? OR p.product_code LIKE ? OR p.insurer LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const resolved = resolveSort('products', req.query.sort, req.query.dir);
  const orderBy = resolved
    ? `ORDER BY ${resolved.sql} ${resolved.dir}, p.id DESC`
    : `ORDER BY p.product_category, p.product_name`;
  const rows = db.prepare(`
    SELECT p.*, u.full_name AS reviewed_by_name
    FROM products p
    LEFT JOIN users u ON u.id = p.reviewed_by_id
    ${where}
    ${orderBy}
  `).all(...params);
  res.json(rows);
});

// GET /:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.*, u.full_name AS reviewed_by_name
    FROM products p
    LEFT JOIN users u ON u.id = p.reviewed_by_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found' });
  res.json(row);
});

// POST /
router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body || {};
  if (!b.product_code || !b.product_name || !b.insurer || !b.product_category) {
    return res.status(400).json({
      error: 'Required: product_code, product_name, insurer, product_category'
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO products (
        product_code, product_name, insurer, product_category,
        target_client_type, min_insurable_value, max_insurable_value,
        suitable_risk_appetite, geographic_scope, key_exclusions_summary,
        product_status, last_review_date, reviewed_by_id, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.product_code,
      b.product_name,
      b.insurer,
      b.product_category,
      toJsonArray(b.target_client_type),
      b.min_insurable_value != null && b.min_insurable_value !== '' ? Number(b.min_insurable_value) : null,
      b.max_insurable_value != null && b.max_insurable_value !== '' ? Number(b.max_insurable_value) : null,
      toJsonArray(b.suitable_risk_appetite),
      b.geographic_scope || null,
      b.key_exclusions_summary || null,
      b.product_status || 'Active',
      b.last_review_date || null,
      b.reviewed_by_id || null,
      b.notes || null,
      req.session.userId
    );

    const created = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({
      action:   'CREATE',
      module:   'products',
      recordId: result.lastInsertRowid,
      newValue: created,
      description: `Product created: ${b.product_code} — ${b.product_name}`
    });

    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Product code already exists' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  db.prepare(`
    UPDATE products SET
      product_code             = ?,
      product_name             = ?,
      insurer                  = ?,
      product_category         = ?,
      target_client_type       = ?,
      min_insurable_value      = ?,
      max_insurable_value      = ?,
      suitable_risk_appetite   = ?,
      geographic_scope         = ?,
      key_exclusions_summary   = ?,
      product_status           = ?,
      last_review_date         = ?,
      reviewed_by_id           = ?,
      notes                    = ?,
      updated_at               = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('product_code'),
    pick('product_name'),
    pick('insurer'),
    pick('product_category'),
    b.target_client_type !== undefined ? toJsonArray(b.target_client_type) : existing.target_client_type,
    b.min_insurable_value !== undefined && b.min_insurable_value !== '' ? Number(b.min_insurable_value) : existing.min_insurable_value,
    b.max_insurable_value !== undefined && b.max_insurable_value !== '' ? Number(b.max_insurable_value) : existing.max_insurable_value,
    b.suitable_risk_appetite !== undefined ? toJsonArray(b.suitable_risk_appetite) : existing.suitable_risk_appetite,
    pick('geographic_scope'),
    pick('key_exclusions_summary'),
    pick('product_status'),
    pick('last_review_date'),
    pick('reviewed_by_id'),
    pick('notes'),
    id
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'products',
    recordId: id,
    oldValue: existing,
    newValue: updated,
    description: `Product ${existing.product_code} updated`
  });

  res.json(updated);
});

router.delete('/:id', canDelete, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.locals.logAudit({
    action:   'DELETE',
    module:   'products',
    recordId: id,
    oldValue: existing,
    description: `Product ${existing.product_code} deleted`
  });
  res.json({ message: 'Deleted' });
});

/**
 * Evaluate the Product Library target-market match for a given product
 * + client context. Returns:
 *   { status: 'Confirmed' | 'Review Required' | 'Mismatch',
 *     mismatches: [strings...],
 *     client_type_mismatch: bool }
 *
 * Spec (Section 4.5):
 *   - All match → 'Confirmed' (green).
 *   - Any param outside target → 'Review Required' (amber, override required).
 *   - Client type completely outside target → 'Mismatch' (red, supervisor co-approval).
 */
function evaluateTargetMarketStatus(product, ctx) {
  const out = { status: 'Confirmed', mismatches: [], client_type_mismatch: false };
  if (!product) {
    out.status = 'Review Required';
    out.mismatches.push('Product not found');
    return out;
  }

  const tryParse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };

  if (ctx.client_risk_appetite && product.suitable_risk_appetite) {
    const appetites = tryParse(product.suitable_risk_appetite);
    if (Array.isArray(appetites) && appetites.length && !appetites.includes(ctx.client_risk_appetite)) {
      out.mismatches.push(`Client risk appetite "${ctx.client_risk_appetite}" not in product's suitable appetites`);
    }
  }
  // Accepts either a single ctx.client_type string OR an array of tokens
  // (the new advice-records gate sends business_type + client_category).
  // The product matches if any token overlaps OR the product has 'Any'.
  const ctxTokens = Array.isArray(ctx.client_types)
    ? ctx.client_types
    : (ctx.client_type ? [ctx.client_type] : []);
  if (ctxTokens.length && product.target_client_type) {
    const types = tryParse(product.target_client_type);
    if (Array.isArray(types) && types.length && !types.includes('Any')) {
      const hit = ctxTokens.some(t => t && types.includes(t));
      if (!hit) {
        out.client_type_mismatch = true;
        out.mismatches.push(`Client profile (${ctxTokens.filter(Boolean).join(' / ')}) outside target market`);
      }
    }
  }
  if (ctx.insurable_value != null && ctx.insurable_value !== '') {
    const v = Number(ctx.insurable_value);
    if (!isNaN(v)) {
      if (product.min_insurable_value != null && v < product.min_insurable_value) {
        out.mismatches.push(`Insurable value below product minimum (R ${product.min_insurable_value})`);
      }
      if (product.max_insurable_value != null && v > product.max_insurable_value) {
        out.mismatches.push(`Insurable value above product maximum (R ${product.max_insurable_value})`);
      }
    }
  }

  if (out.client_type_mismatch) out.status = 'Mismatch';
  else if (out.mismatches.length > 0) out.status = 'Review Required';
  else out.status = 'Confirmed';

  return out;
}

// POST /check-suitability — evaluate target market match
router.post('/check-suitability', (req, res) => {
  const db = getDb();
  const { product_id, client_risk_appetite, client_type, client_types, insurable_value } = req.body || {};
  if (!product_id) return res.status(400).json({ error: 'product_id required' });

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const r = evaluateTargetMarketStatus(product, { client_risk_appetite, client_type, client_types, insurable_value });
  res.json({
    status:               r.status,
    result:               r.status,             // legacy alias
    mismatches:           r.mismatches,
    client_type_mismatch: r.client_type_mismatch,
    product,
  });
});

module.exports = router;
module.exports.evaluateTargetMarketStatus = evaluateTargetMarketStatus;
