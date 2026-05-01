const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { isFicaRecordComplete, computeFicaStatusAccount } = require('./fica');
const { computePopiaStatus } = require('./popia');
const { redactForAudit } = require('../lib/crypto');

const router = express.Router();

// All accounts routes require authentication
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitise(value) {
  if (typeof value === 'string') return value.trim();
  return value;
}

function sanitiseBody(body, fields) {
  const out = {};
  for (const field of fields) {
    if (body[field] !== undefined) {
      out[field] = sanitise(body[field]);
    }
  }
  return out;
}

const ALL_FIELDS = [
  'account_name', 'registration_number', 'vat_number', 'industry',
  'business_type', 'number_of_employees', 'annual_turnover_band',
  'physical_address', 'postal_address', 'main_contact_id',
  'assigned_broker_id', 'assigned_admin_id', 'client_status',
  'fica_status', 'date_became_client', 'last_review_date',
  'next_review_date', 'notes',
  'phys_street_address', 'phys_complex_building', 'phys_suburb',
  'phys_city', 'phys_province', 'phys_postal_code', 'phys_country',
  'phys_gps_lat', 'phys_gps_lng',
  'post_street_address', 'post_complex_building', 'post_suburb',
  'post_city', 'post_province', 'post_postal_code', 'post_country'
];

const REQUIRED_CREATE = [
  'account_name', 'business_type', 'assigned_broker_id', 'client_status', 'fica_status'
];

// ---------------------------------------------------------------------------
// GET / — list all accounts with optional filters and pagination
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const db = getDb();

  const {
    search    = '',
    status    = '',
    broker_id = '',
    page      = 1,
    limit     = 50
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const params     = [];

  // Broker isolation: brokers can only see their own accounts
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push('a.assigned_broker_id = ?');
    params.push(scopedBrokerId);
  } else if (broker_id) {
    conditions.push('a.assigned_broker_id = ?');
    params.push(parseInt(broker_id, 10));
  }

  if (search) {
    conditions.push(
      "(a.account_name LIKE ? OR a.registration_number LIKE ? OR a.vat_number LIKE ?)"
    );
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (status) {
    conditions.push('a.client_status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM accounts a
    ${where}
  `).get(...params);

  const resolved = resolveSort('accounts', req.query.sort, req.query.dir);
  const orderBy = resolved
    ? `ORDER BY ${resolved.sql} ${resolved.dir}, a.id DESC`
    : `ORDER BY a.account_name ASC`;

  const rows = db.prepare(`
    SELECT
      a.*,
      c.first_name || ' ' || c.last_name AS main_contact_name,
      b.full_name                          AS broker_full_name,
      adm.full_name                        AS admin_full_name
    FROM accounts a
    LEFT JOIN contacts c   ON c.id  = a.main_contact_id
    LEFT JOIN users b      ON b.id  = a.assigned_broker_id
    LEFT JOIN users adm    ON adm.id = a.assigned_admin_id
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  // Erasure DSARs filed against any account in this page.
  const acctErasureIds = new Set(
    db.prepare(
      "SELECT account_id FROM data_subject_requests WHERE request_type = 'Erasure' AND status != 'Completed' AND account_id IS NOT NULL"
    ).all().map(r => r.account_id)
  );

  return res.json({
    data: rows.map(r => ({
      ...r,
      popia_status: computePopiaStatus(
        r,
        acctErasureIds.has(r.id) ? [{ request_type: 'Erasure', status: 'Open' }] : []
      ),
      fica_status_derived: computeFicaStatusAccount(r),
    })),
    total: countRow.total,
    page:  pageNum,
    limit: limitNum,
    pages: Math.ceil(countRow.total / limitNum)
  });
});

// ---------------------------------------------------------------------------
// GET /:id — single account
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const db = getDb();

  const account = db.prepare(`
    SELECT
      a.*,
      c.first_name || ' ' || c.last_name AS main_contact_name,
      b.full_name                          AS broker_full_name,
      adm.full_name                        AS admin_full_name
    FROM accounts a
    LEFT JOIN contacts c   ON c.id   = a.main_contact_id
    LEFT JOIN users b      ON b.id   = a.assigned_broker_id
    LEFT JOIN users adm    ON adm.id = a.assigned_admin_id
    WHERE a.id = ?
  `).get(parseInt(req.params.id, 10));

  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && account.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Computed compliance status — same logic the dedicated POPIA/FICA modules use.
  const erasures = db.prepare(
    "SELECT id FROM data_subject_requests WHERE account_id = ? AND request_type = 'Erasure' AND status != 'Completed'"
  ).all(account.id).map(() => ({ request_type: 'Erasure', status: 'Open' }));
  account.popia_status = computePopiaStatus(account, erasures);
  account.fica_status_derived = computeFicaStatusAccount(account);

  return res.json(account);
});

// ---------------------------------------------------------------------------
// POST / — create account
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const body = sanitiseBody(req.body, ALL_FIELDS);

  const missing = REQUIRED_CREATE.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ''
  );
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields', fields: missing });
  }

  // POPIA s11/12 — cannot activate an account without a Data Processing Basis
  if (body.client_status === 'Active Client' &&
      (!body.data_processing_basis || body.data_processing_basis === '')) {
    return res.status(400).json({
      error: 'POPIA: a Data Processing Basis must be recorded before this account can be set to Active Client.'
    });
  }

  // Activation gate — FICA Verified is required at create time. (POPIA consent is
  // captured via the POPIA module after creation, so it is enforced on PUT.)
  if (body.client_status === 'Active Client') {
    const ficaOk = body.fica_status === 'Verified' || body.fica_status === 'Exempt';
    if (!ficaOk) {
      return res.status(400).json({
        error: 'Cannot set account to Active — FICA must be Verified (or Exempt) first.',
      });
    }
  }

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO accounts (
      account_name, registration_number, vat_number, industry,
      business_type, number_of_employees, annual_turnover_band,
      physical_address, postal_address, main_contact_id,
      assigned_broker_id, assigned_admin_id, client_status,
      fica_status, date_became_client, last_review_date,
      next_review_date, notes,
      phys_street_address, phys_complex_building, phys_suburb,
      phys_city, phys_province, phys_postal_code, phys_country,
      phys_gps_lat, phys_gps_lng,
      post_street_address, post_complex_building, post_suburb,
      post_city, post_province, post_postal_code, post_country,
      created_by, updated_at
    ) VALUES (
      ${Array(35).fill('?').join(', ')},
      CURRENT_TIMESTAMP
    )
  `).run(
    body.account_name,
    body.registration_number   || null,
    body.vat_number            || null,
    body.industry              || null,
    body.business_type,
    body.number_of_employees   ? parseInt(body.number_of_employees, 10) : null,
    body.annual_turnover_band  || null,
    body.physical_address      || null,
    body.postal_address        || null,
    body.main_contact_id       ? parseInt(body.main_contact_id, 10)     : null,
    parseInt(body.assigned_broker_id, 10),
    body.assigned_admin_id     ? parseInt(body.assigned_admin_id, 10)   : null,
    body.client_status,
    body.fica_status,
    body.date_became_client    || null,
    body.last_review_date      || null,
    body.next_review_date      || null,
    body.notes                 || null,
    body.phys_street_address   || null,
    body.phys_complex_building || null,
    body.phys_suburb           || null,
    body.phys_city             || null,
    body.phys_province         || null,
    body.phys_postal_code      || null,
    body.phys_country          || null,
    body.phys_gps_lat          || null,
    body.phys_gps_lng          || null,
    body.post_street_address   || null,
    body.post_complex_building || null,
    body.post_suburb           || null,
    body.post_city             || null,
    body.post_province         || null,
    body.post_postal_code      || null,
    body.post_country          || null,
    req.session.userId
  );

  const newAccount = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:      'CREATE',
    module:      'accounts',
    recordId:    result.lastInsertRowid,
    newValue:    redactForAudit(newAccount),
    description: `Created account: ${newAccount.account_name}`
  });

  return res.status(201).json(newAccount);
});

// ---------------------------------------------------------------------------
// PUT /:id — update account
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const body = sanitiseBody(req.body, ALL_FIELDS);

  // POPIA s11/12 — cannot transition to Active Client without a Data Processing Basis
  const newStatus = body.client_status !== undefined ? body.client_status : existing.client_status;
  const newBasis  = body.data_processing_basis !== undefined ? body.data_processing_basis : existing.data_processing_basis;
  if (newStatus === 'Active Client' && (!newBasis || newBasis === '')) {
    return res.status(400).json({
      error: 'POPIA: a Data Processing Basis must be recorded before this account can be set to Active Client.'
    });
  }

  // Block manual fica_status escalation to 'Verified' unless the FICA record on the
  // account is actually complete.
  if (body.fica_status === 'Verified' && existing.fica_status !== 'Verified') {
    if (!isFicaRecordComplete(existing, 'account')) {
      return res.status(400).json({
        error: 'FICA cannot be set to Verified — complete the FICA record (verification date, method, document reference, verified-by, PEP check, beneficial owner for juristic entities) first.'
      });
    }
  }

  // Activation gate — both FICA Verified and POPIA consent must be in place.
  if (newStatus === 'Active Client') {
    const newFica = body.fica_status !== undefined ? body.fica_status : existing.fica_status;
    const ficaOk  = newFica === 'Verified' || newFica === 'Exempt';
    const popiaOk = !!existing.popia_consent_obtained;
    if (!ficaOk || !popiaOk) {
      const reasons = [];
      if (!ficaOk)  reasons.push('FICA must be Verified');
      if (!popiaOk) reasons.push('POPIA consent must be obtained');
      return res.status(400).json({
        error: `Cannot set account to Active — ${reasons.join(' and ')}.`,
        reasons,
      });
    }
  }

  db.prepare(`
    UPDATE accounts SET
      account_name          = ?,
      registration_number   = ?,
      vat_number            = ?,
      industry              = ?,
      business_type         = ?,
      number_of_employees   = ?,
      annual_turnover_band  = ?,
      physical_address      = ?,
      postal_address        = ?,
      main_contact_id       = ?,
      assigned_broker_id    = ?,
      assigned_admin_id     = ?,
      client_status         = ?,
      fica_status           = ?,
      date_became_client    = ?,
      last_review_date      = ?,
      next_review_date      = ?,
      notes                 = ?,
      phys_street_address   = ?,
      phys_complex_building = ?,
      phys_suburb           = ?,
      phys_city             = ?,
      phys_province         = ?,
      phys_postal_code      = ?,
      phys_country          = ?,
      phys_gps_lat          = ?,
      phys_gps_lng          = ?,
      post_street_address   = ?,
      post_complex_building = ?,
      post_suburb           = ?,
      post_city             = ?,
      post_province         = ?,
      post_postal_code      = ?,
      post_country          = ?,
      updated_at            = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    body.account_name              ?? existing.account_name,
    body.registration_number       !== undefined ? (body.registration_number || null)      : existing.registration_number,
    body.vat_number                !== undefined ? (body.vat_number || null)               : existing.vat_number,
    body.industry                  !== undefined ? (body.industry || null)                 : existing.industry,
    body.business_type             ?? existing.business_type,
    body.number_of_employees       !== undefined
      ? (body.number_of_employees ? parseInt(body.number_of_employees, 10) : null)
      : existing.number_of_employees,
    body.annual_turnover_band      !== undefined ? (body.annual_turnover_band || null)     : existing.annual_turnover_band,
    body.physical_address          !== undefined ? (body.physical_address || null)         : existing.physical_address,
    body.postal_address            !== undefined ? (body.postal_address || null)           : existing.postal_address,
    body.main_contact_id           !== undefined
      ? (body.main_contact_id ? parseInt(body.main_contact_id, 10) : null)
      : existing.main_contact_id,
    body.assigned_broker_id        !== undefined
      ? (body.assigned_broker_id ? parseInt(body.assigned_broker_id, 10) : null)
      : existing.assigned_broker_id,
    body.assigned_admin_id         !== undefined
      ? (body.assigned_admin_id ? parseInt(body.assigned_admin_id, 10) : null)
      : existing.assigned_admin_id,
    body.client_status             ?? existing.client_status,
    body.fica_status               ?? existing.fica_status,
    body.date_became_client        !== undefined ? (body.date_became_client || null)       : existing.date_became_client,
    body.last_review_date          !== undefined ? (body.last_review_date || null)         : existing.last_review_date,
    body.next_review_date          !== undefined ? (body.next_review_date || null)         : existing.next_review_date,
    body.notes                     !== undefined ? (body.notes || null)                    : existing.notes,
    body.phys_street_address       !== undefined ? (body.phys_street_address || null)     : existing.phys_street_address,
    body.phys_complex_building     !== undefined ? (body.phys_complex_building || null)   : existing.phys_complex_building,
    body.phys_suburb               !== undefined ? (body.phys_suburb || null)              : existing.phys_suburb,
    body.phys_city                 !== undefined ? (body.phys_city || null)                : existing.phys_city,
    body.phys_province             !== undefined ? (body.phys_province || null)            : existing.phys_province,
    body.phys_postal_code          !== undefined ? (body.phys_postal_code || null)         : existing.phys_postal_code,
    body.phys_country              !== undefined ? (body.phys_country || null)             : existing.phys_country,
    body.phys_gps_lat              !== undefined ? (body.phys_gps_lat || null)             : existing.phys_gps_lat,
    body.phys_gps_lng              !== undefined ? (body.phys_gps_lng || null)             : existing.phys_gps_lng,
    body.post_street_address       !== undefined ? (body.post_street_address || null)      : existing.post_street_address,
    body.post_complex_building     !== undefined ? (body.post_complex_building || null)    : existing.post_complex_building,
    body.post_suburb               !== undefined ? (body.post_suburb || null)               : existing.post_suburb,
    body.post_city                 !== undefined ? (body.post_city || null)                 : existing.post_city,
    body.post_province             !== undefined ? (body.post_province || null)             : existing.post_province,
    body.post_postal_code          !== undefined ? (body.post_postal_code || null)          : existing.post_postal_code,
    body.post_country              !== undefined ? (body.post_country || null)              : existing.post_country,
    id
  );

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

  res.locals.logAudit({
    action:      'UPDATE',
    module:      'accounts',
    recordId:    id,
    oldValue:    redactForAudit(existing),
    newValue:    redactForAudit(updated),
    description: `Updated account: ${updated.account_name}`
  });

  return res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, canDelete, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = getDb();

    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // NULL out FK references in child tables
    db.prepare('UPDATE contacts SET related_account_id = NULL WHERE related_account_id = ?').run(id);
    db.prepare('UPDATE policies SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE assets SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE claims SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE policy_sections SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE client_engagements SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE risk_details SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE advice_records SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE complaints SET account_id = NULL WHERE account_id = ?').run(id);
    db.prepare('UPDATE reviews SET account_id = NULL WHERE account_id = ?').run(id);

    db.prepare('DELETE FROM accounts WHERE id = ?').run(id);

    res.locals.logAudit({
      action:      'DELETE',
      module:      'accounts',
      recordId:    id,
      oldValue:    redactForAudit(existing),
      description: `Deleted account: ${existing.account_name}`
    });

    return res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('DELETE /accounts/:id error:', err.message);
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Cannot delete: this record is referenced by other records.' });
    }
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/contacts — contacts linked to this account
// ---------------------------------------------------------------------------
router.get('/:id/contacts', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();

  const account = db.prepare('SELECT id, assigned_broker_id FROM accounts WHERE id = ?').get(id);
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && account.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const contacts = db.prepare(`
    SELECT
      c.*,
      b.full_name   AS broker_full_name,
      adm.full_name AS admin_full_name
    FROM contacts c
    LEFT JOIN users b   ON b.id   = c.assigned_broker_id
    LEFT JOIN users adm ON adm.id = c.assigned_admin_id
    WHERE c.related_account_id = ?
    ORDER BY c.last_name ASC, c.first_name ASC
  `).all(id);

  return res.json(contacts);
});

module.exports = router;
