const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { isFicaRecordComplete, computeFicaStatus } = require('./fica');
const { computePopiaStatus } = require('./popia');
const { isSupplierContact } = require('../lib/supplier');
const { encrypt, decrypt, mask, isEncrypted, redactForAudit } = require('../lib/crypto');

/**
 * Encrypt a sensitive PII value for write. If the submitted value matches the
 * masked rendering of the existing value (i.e. the form just round-tripped the
 * masked display) treat it as "no change" and return the existing ciphertext.
 */
function resolveEncryptedForWrite(submitted, existingStored) {
  if (submitted === undefined) return existingStored;
  if (submitted === null || submitted === '') return null;
  const currentPlain = existingStored
    ? (isEncrypted(existingStored) ? decrypt(existingStored) : existingStored)
    : null;
  if (currentPlain && submitted === mask(currentPlain)) return existingStored;
  if (isEncrypted(submitted)) return submitted;
  return encrypt(submitted);
}

/**
 * Replace sensitive PII columns on a contact row with masked renderings before
 * sending to the client. The plaintext can only be retrieved via the
 * /api/admin/reveal-encrypted endpoint (admin-password gated).
 */
function redactContactForResponse(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.passport_number) {
    const plain = isEncrypted(out.passport_number) ? decrypt(out.passport_number) : out.passport_number;
    out.passport_number = plain ? mask(plain) : null;
    out.passport_number_encrypted = true;
  }
  if (out.sa_id_number) {
    const plain = isEncrypted(out.sa_id_number) ? decrypt(out.sa_id_number) : out.sa_id_number;
    out.sa_id_number = plain ? mask(plain) : null;
    out.sa_id_number_encrypted = true;
  }
  return out;
}

const router = express.Router();

// All contacts routes require authentication
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
  'first_name', 'last_name', 'email', 'mobile', 'work_number',
  'date_of_birth', 'sa_id_number', 'contact_type', 'client_category',
  'client_segment', 'existing_client', 'date_became_client',
  'contact_status', 'popia_consent_obtained', 'popia_consent_date',
  'fica_status', 'assigned_broker_id', 'assigned_admin_id',
  'related_account_id', 'primary_client_record', 'conduct_risk_flag',
  'conduct_risk_notes', 'last_review_date', 'next_review_date',
  'physical_address', 'postal_address', 'source_of_lead', 'notes',
  'title', 'gender', 'language', 'marital_status', 'occupation',
  'employer', 'income_band', 'nationality', 'passport_number',
  'alternative_id_type', 'next_of_kin', 'preferred_communication',
  'dl_codes', 'dl_restrictions', 'dl_first_issue_date',
  'phys_street_address', 'phys_complex_building', 'phys_suburb',
  'phys_city', 'phys_province', 'phys_postal_code', 'phys_country',
  'phys_gps_lat', 'phys_gps_lng',
  'post_street_address', 'post_complex_building', 'post_suburb',
  'post_city', 'post_province', 'post_postal_code', 'post_country'
];

const REQUIRED_CREATE = [
  'first_name', 'last_name', 'contact_type', 'client_category',
  'existing_client', 'contact_status', 'popia_consent_obtained',
  'fica_status', 'primary_client_record'
];

// ---------------------------------------------------------------------------
// GET / — list all contacts with optional filters and pagination
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const db = getDb();

  const {
    search    = '',
    status    = '',
    broker_id = '',
    category  = '',
    page      = 1,
    limit     = 50
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const params     = [];

  // Broker isolation: brokers can only see their own contacts
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push('c.assigned_broker_id = ?');
    params.push(scopedBrokerId);
  } else if (broker_id) {
    conditions.push('c.assigned_broker_id = ?');
    params.push(parseInt(broker_id, 10));
  }

  if (search) {
    conditions.push(
      // sa_id_number is encrypted at rest — LIKE-matching the ciphertext is meaningless,
      // so search now only covers name/email/mobile. Use the FICA module to look up by ID.
      "(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.mobile LIKE ?)"
    );
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (status) {
    conditions.push('c.contact_status = ?');
    params.push(status);
  }
  if (category) {
    conditions.push('c.client_category = ?');
    params.push(category);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM contacts c
    LEFT JOIN users b ON b.id = c.assigned_broker_id
    ${where}
  `).get(...params);

  const resolved = resolveSort('contacts', req.query.sort, req.query.dir);
  const orderBy = resolved
    ? `ORDER BY ${resolved.sql} ${resolved.dir}, c.id DESC`
    : `ORDER BY c.last_name ASC, c.first_name ASC`;

  const rows = db.prepare(`
    SELECT
      c.*,
      b.full_name AS broker_full_name,
      a.full_name AS admin_full_name
    FROM contacts c
    LEFT JOIN users b ON b.id = c.assigned_broker_id
    LEFT JOIN users a ON a.id = c.assigned_admin_id
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  // Enrich each row with computed POPIA + FICA status from the dedicated
  // compliance modules so list-view pills don't drift from the source of truth.
  const erasureSet = new Set(
    db.prepare(
      "SELECT contact_id FROM data_subject_requests WHERE request_type = 'Erasure' AND status != 'Completed'"
    ).all().map(r => r.contact_id)
  );

  return res.json({
    data: rows.map(r => {
      const out = redactContactForResponse(r);
      const erasures = erasureSet.has(r.id) ? [{ request_type: 'Erasure', status: 'Open' }] : [];
      out.popia_status = computePopiaStatus(r, erasures);
      out.fica_status_derived = computeFicaStatus(r);
      return out;
    }),
    total:   countRow.total,
    page:    pageNum,
    limit:   limitNum,
    pages:   Math.ceil(countRow.total / limitNum)
  });
});

// ---------------------------------------------------------------------------
// GET /:id — single contact
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const db = getDb();

  const contact = db.prepare(`
    SELECT
      c.*,
      b.full_name AS broker_full_name,
      a.full_name AS admin_full_name
    FROM contacts c
    LEFT JOIN users b ON b.id = c.assigned_broker_id
    LEFT JOIN users a ON a.id = c.assigned_admin_id
    WHERE c.id = ?
  `).get(parseInt(req.params.id, 10));

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  // Broker isolation: brokers can only view their own contacts
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && contact.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Compute POPIA + FICA status from the same logic the dedicated modules use,
  // so the contact detail's compliance snapshot can render an accurate pill.
  const erasures = db.prepare(
    "SELECT id FROM data_subject_requests WHERE contact_id = ? AND request_type = 'Erasure' AND status != 'Completed'"
  ).all(contact.id).map(() => ({ request_type: 'Erasure', status: 'Open' }));
  const out = redactContactForResponse(contact);
  out.popia_status = computePopiaStatus(contact, erasures);
  out.fica_status_derived = computeFicaStatus(contact);

  return res.json(out);
});

// ---------------------------------------------------------------------------
// POST / — create contact
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const body = sanitiseBody(req.body, ALL_FIELDS);

  // Required field validation — suppliers don't need fica_status or popia_consent_obtained.
  const isSupplierBody = body.contact_type === 'Supplier' && body.client_category === 'Supplier';
  const requiredFields = isSupplierBody
    ? REQUIRED_CREATE.filter(f => f !== 'fica_status' && f !== 'popia_consent_obtained')
    : REQUIRED_CREATE;
  const missing = requiredFields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ''
  );
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields', fields: missing });
  }

  // Schema requires fica_status NOT NULL — for suppliers (FICA n/a) default to 'Exempt'.
  if (isSupplierBody && (!body.fica_status || body.fica_status === '')) {
    body.fica_status = 'Exempt';
  }

  // Suppliers (panel-beaters, assessors, etc.) sit outside the advisory pipeline
  // and are not data subjects under POPIA/FICA — skip the activation gates entirely.
  const supplier = isSupplierContact(body);

  // POPIA s11/12 — cannot activate a client without a Data Processing Basis
  if (!supplier && body.contact_status === 'Active Client' &&
      (!body.data_processing_basis || body.data_processing_basis === '')) {
    return res.status(400).json({
      error: 'POPIA: a Data Processing Basis must be recorded before this contact can be set to Active Client.'
    });
  }

  // Activation gate — both FICA Verified and POPIA consent are required.
  if (!supplier && body.contact_status === 'Active Client') {
    const popiaOk = body.popia_consent_obtained === 1 || body.popia_consent_obtained === '1' || body.popia_consent_obtained === true;
    const ficaOk  = body.fica_status === 'Verified' || body.fica_status === 'Exempt';
    if (!popiaOk || !ficaOk) {
      const reasons = [];
      if (!ficaOk)  reasons.push('FICA must be Verified');
      if (!popiaOk) reasons.push('POPIA consent must be obtained');
      return res.status(400).json({
        error: `Cannot set contact to Active — ${reasons.join(' and ')}.`,
        reasons,
      });
    }
  }

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO contacts (
      first_name, last_name, email, mobile, work_number,
      date_of_birth, sa_id_number, contact_type, client_category,
      client_segment, existing_client, date_became_client,
      contact_status, popia_consent_obtained, popia_consent_date,
      fica_status, assigned_broker_id, assigned_admin_id,
      related_account_id, primary_client_record, conduct_risk_flag,
      conduct_risk_notes, last_review_date, next_review_date,
      physical_address, postal_address, source_of_lead, notes,
      title, gender, language, marital_status, occupation,
      employer, income_band, nationality, passport_number,
      alternative_id_type, next_of_kin, preferred_communication,
      dl_codes, dl_restrictions, dl_first_issue_date,
      phys_street_address, phys_complex_building, phys_suburb,
      phys_city, phys_province, phys_postal_code, phys_country,
      phys_gps_lat, phys_gps_lng,
      post_street_address, post_complex_building, post_suburb,
      post_city, post_province, post_postal_code, post_country,
      created_by, updated_at
    ) VALUES (
      ${Array(60).fill('?').join(', ')},
      CURRENT_TIMESTAMP
    )
  `).run(
    body.first_name,
    body.last_name,
    body.email           || null,
    body.mobile          || null,
    body.work_number     || null,
    body.date_of_birth   || null,
    resolveEncryptedForWrite(body.sa_id_number, null),
    body.contact_type,
    body.client_category,
    body.client_segment  || null,
    body.existing_client        ?? 0,
    body.date_became_client      || null,
    body.contact_status,
    body.popia_consent_obtained ?? 0,
    body.popia_consent_date      || null,
    body.fica_status,
    body.assigned_broker_id      ? parseInt(body.assigned_broker_id, 10)  : null,
    body.assigned_admin_id       ? parseInt(body.assigned_admin_id, 10)   : null,
    body.related_account_id      ? parseInt(body.related_account_id, 10)  : null,
    body.primary_client_record  ?? 1,
    body.conduct_risk_flag      ?? 0,
    body.conduct_risk_notes      || null,
    body.last_review_date        || null,
    body.next_review_date        || null,
    body.physical_address        || null,
    body.postal_address          || null,
    body.source_of_lead          || null,
    body.notes                   || null,
    body.title                   || null,
    body.gender                  || null,
    body.language                || null,
    body.marital_status          || null,
    body.occupation              || null,
    body.employer                || null,
    body.income_band             || null,
    body.nationality             || null,
    resolveEncryptedForWrite(body.passport_number, null),
    body.alternative_id_type     || null,
    body.next_of_kin             || null,
    body.preferred_communication || null,
    body.dl_codes                || null,
    body.dl_restrictions         || null,
    body.dl_first_issue_date     || null,
    body.phys_street_address     || null,
    body.phys_complex_building   || null,
    body.phys_suburb             || null,
    body.phys_city               || null,
    body.phys_province           || null,
    body.phys_postal_code        || null,
    body.phys_country            || null,
    body.phys_gps_lat            || null,
    body.phys_gps_lng            || null,
    body.post_street_address     || null,
    body.post_complex_building   || null,
    body.post_suburb             || null,
    body.post_city               || null,
    body.post_province           || null,
    body.post_postal_code        || null,
    body.post_country            || null,
    req.session.userId
  );

  const newContact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:      'CREATE',
    module:      'contacts',
    recordId:    result.lastInsertRowid,
    newValue:    redactForAudit(newContact),
    description: `Created contact: ${newContact.first_name} ${newContact.last_name}`
  });

  return res.status(201).json(redactContactForResponse(newContact));
});

// ---------------------------------------------------------------------------
// PUT /:id — update contact
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  // Broker isolation: brokers can only edit their own contacts
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const body = sanitiseBody(req.body, ALL_FIELDS);

  // Suppliers sit outside POPIA/FICA — skip the gates if the merged record is supplier.
  const mergedForSupplierCheck = {
    contact_type:    body.contact_type    !== undefined ? body.contact_type    : existing.contact_type,
    client_category: body.client_category !== undefined ? body.client_category : existing.client_category,
  };
  const supplier = isSupplierContact(mergedForSupplierCheck);

  // POPIA s11/12 — cannot transition to Active Client without a Data Processing Basis
  const newStatus = body.contact_status !== undefined ? body.contact_status : existing.contact_status;
  const newBasis  = body.data_processing_basis !== undefined ? body.data_processing_basis : existing.data_processing_basis;
  if (!supplier && newStatus === 'Active Client' && (!newBasis || newBasis === '')) {
    return res.status(400).json({
      error: 'POPIA: a Data Processing Basis must be recorded before this contact can be set to Active Client.'
    });
  }

  // Block manual fica_status escalation to 'Verified' unless the FICA record on the
  // contact is actually complete. Mirrors the gate in routes/fica.js so the contact
  // form cannot be used to side-step it.
  if (!supplier && body.fica_status === 'Verified' && existing.fica_status !== 'Verified') {
    if (!isFicaRecordComplete(existing, 'contact')) {
      return res.status(400).json({
        error: 'FICA cannot be set to Verified — complete the FICA record (verification date, method, document reference, verified-by, PEP check) first.'
      });
    }
  }

  // Activation gate — both FICA Verified and POPIA consent must be in place.
  if (!supplier && newStatus === 'Active Client') {
    const newPopia = body.popia_consent_obtained !== undefined
      ? (body.popia_consent_obtained === 1 || body.popia_consent_obtained === '1' || body.popia_consent_obtained === true)
      : !!existing.popia_consent_obtained;
    const newFica  = body.fica_status !== undefined ? body.fica_status : existing.fica_status;
    const ficaOk   = newFica === 'Verified' || newFica === 'Exempt';
    if (!newPopia || !ficaOk) {
      const reasons = [];
      if (!ficaOk)   reasons.push('FICA must be Verified');
      if (!newPopia) reasons.push('POPIA consent must be obtained');
      return res.status(400).json({
        error: `Cannot set contact to Active — ${reasons.join(' and ')}.`,
        reasons,
      });
    }
  }

  db.prepare(`
    UPDATE contacts SET
      first_name              = ?,
      last_name               = ?,
      email                   = ?,
      mobile                  = ?,
      work_number             = ?,
      date_of_birth           = ?,
      sa_id_number            = ?,
      contact_type            = ?,
      client_category         = ?,
      client_segment          = ?,
      existing_client         = ?,
      date_became_client      = ?,
      contact_status          = ?,
      popia_consent_obtained  = ?,
      popia_consent_date      = ?,
      fica_status             = ?,
      assigned_broker_id      = ?,
      assigned_admin_id       = ?,
      related_account_id      = ?,
      primary_client_record   = ?,
      conduct_risk_flag       = ?,
      conduct_risk_notes      = ?,
      last_review_date        = ?,
      next_review_date        = ?,
      physical_address        = ?,
      postal_address          = ?,
      source_of_lead          = ?,
      notes                   = ?,
      title                   = ?,
      gender                  = ?,
      language                = ?,
      marital_status          = ?,
      occupation              = ?,
      employer                = ?,
      income_band             = ?,
      nationality             = ?,
      passport_number         = ?,
      alternative_id_type     = ?,
      next_of_kin             = ?,
      preferred_communication = ?,
      dl_codes                = ?,
      dl_restrictions         = ?,
      dl_first_issue_date     = ?,
      phys_street_address     = ?,
      phys_complex_building   = ?,
      phys_suburb             = ?,
      phys_city               = ?,
      phys_province           = ?,
      phys_postal_code        = ?,
      phys_country            = ?,
      phys_gps_lat            = ?,
      phys_gps_lng            = ?,
      post_street_address     = ?,
      post_complex_building   = ?,
      post_suburb             = ?,
      post_city               = ?,
      post_province           = ?,
      post_postal_code        = ?,
      post_country            = ?,
      updated_at              = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    body.first_name               ?? existing.first_name,
    body.last_name                ?? existing.last_name,
    body.email                    !== undefined ? (body.email || null)                   : existing.email,
    body.mobile                   !== undefined ? (body.mobile || null)                  : existing.mobile,
    body.work_number              !== undefined ? (body.work_number || null)             : existing.work_number,
    body.date_of_birth            !== undefined ? (body.date_of_birth || null)           : existing.date_of_birth,
    resolveEncryptedForWrite(body.sa_id_number, existing.sa_id_number),
    body.contact_type             ?? existing.contact_type,
    body.client_category          ?? existing.client_category,
    body.client_segment           !== undefined ? (body.client_segment || null)          : existing.client_segment,
    body.existing_client          !== undefined ? body.existing_client                   : existing.existing_client,
    body.date_became_client       !== undefined ? (body.date_became_client || null)      : existing.date_became_client,
    body.contact_status           ?? existing.contact_status,
    body.popia_consent_obtained   !== undefined ? body.popia_consent_obtained            : existing.popia_consent_obtained,
    body.popia_consent_date       !== undefined ? (body.popia_consent_date || null)      : existing.popia_consent_date,
    body.fica_status              ?? existing.fica_status,
    body.assigned_broker_id       !== undefined ? (body.assigned_broker_id ? parseInt(body.assigned_broker_id, 10) : null) : existing.assigned_broker_id,
    body.assigned_admin_id        !== undefined ? (body.assigned_admin_id  ? parseInt(body.assigned_admin_id, 10)  : null) : existing.assigned_admin_id,
    body.related_account_id       !== undefined ? (body.related_account_id ? parseInt(body.related_account_id, 10): null) : existing.related_account_id,
    body.primary_client_record    !== undefined ? body.primary_client_record              : existing.primary_client_record,
    body.conduct_risk_flag        !== undefined ? body.conduct_risk_flag                  : existing.conduct_risk_flag,
    body.conduct_risk_notes       !== undefined ? (body.conduct_risk_notes || null)      : existing.conduct_risk_notes,
    body.last_review_date         !== undefined ? (body.last_review_date || null)        : existing.last_review_date,
    body.next_review_date         !== undefined ? (body.next_review_date || null)        : existing.next_review_date,
    body.physical_address         !== undefined ? (body.physical_address || null)        : existing.physical_address,
    body.postal_address           !== undefined ? (body.postal_address || null)          : existing.postal_address,
    body.source_of_lead           !== undefined ? (body.source_of_lead || null)          : existing.source_of_lead,
    body.notes                    !== undefined ? (body.notes || null)                   : existing.notes,
    body.title                    !== undefined ? (body.title || null)                   : existing.title,
    body.gender                   !== undefined ? (body.gender || null)                  : existing.gender,
    body.language                 !== undefined ? (body.language || null)                : existing.language,
    body.marital_status           !== undefined ? (body.marital_status || null)          : existing.marital_status,
    body.occupation               !== undefined ? (body.occupation || null)              : existing.occupation,
    body.employer                 !== undefined ? (body.employer || null)                : existing.employer,
    body.income_band              !== undefined ? (body.income_band || null)             : existing.income_band,
    body.nationality              !== undefined ? (body.nationality || null)             : existing.nationality,
    resolveEncryptedForWrite(body.passport_number, existing.passport_number),
    body.alternative_id_type      !== undefined ? (body.alternative_id_type || null)     : existing.alternative_id_type,
    body.next_of_kin              !== undefined ? (body.next_of_kin || null)             : existing.next_of_kin,
    body.preferred_communication  !== undefined ? (body.preferred_communication || null) : existing.preferred_communication,
    body.dl_codes                 !== undefined ? (body.dl_codes || null)                : existing.dl_codes,
    body.dl_restrictions          !== undefined ? (body.dl_restrictions || null)         : existing.dl_restrictions,
    body.dl_first_issue_date      !== undefined ? (body.dl_first_issue_date || null)     : existing.dl_first_issue_date,
    body.phys_street_address      !== undefined ? (body.phys_street_address || null)   : existing.phys_street_address,
    body.phys_complex_building    !== undefined ? (body.phys_complex_building || null) : existing.phys_complex_building,
    body.phys_suburb              !== undefined ? (body.phys_suburb || null)            : existing.phys_suburb,
    body.phys_city                !== undefined ? (body.phys_city || null)              : existing.phys_city,
    body.phys_province            !== undefined ? (body.phys_province || null)          : existing.phys_province,
    body.phys_postal_code         !== undefined ? (body.phys_postal_code || null)       : existing.phys_postal_code,
    body.phys_country             !== undefined ? (body.phys_country || null)           : existing.phys_country,
    body.phys_gps_lat             !== undefined ? (body.phys_gps_lat || null)           : existing.phys_gps_lat,
    body.phys_gps_lng             !== undefined ? (body.phys_gps_lng || null)           : existing.phys_gps_lng,
    body.post_street_address      !== undefined ? (body.post_street_address || null)    : existing.post_street_address,
    body.post_complex_building    !== undefined ? (body.post_complex_building || null)  : existing.post_complex_building,
    body.post_suburb              !== undefined ? (body.post_suburb || null)             : existing.post_suburb,
    body.post_city                !== undefined ? (body.post_city || null)               : existing.post_city,
    body.post_province            !== undefined ? (body.post_province || null)           : existing.post_province,
    body.post_postal_code         !== undefined ? (body.post_postal_code || null)        : existing.post_postal_code,
    body.post_country             !== undefined ? (body.post_country || null)            : existing.post_country,
    id
  );

  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);

  res.locals.logAudit({
    action:      'UPDATE',
    module:      'contacts',
    recordId:    id,
    oldValue:    redactForAudit(existing),
    newValue:    redactForAudit(updated),
    description: `Updated contact: ${updated.first_name} ${updated.last_name}`
  });

  return res.json(redactContactForResponse(updated));
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, canDelete, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const db = getDb();

    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Broker isolation: brokers can only delete their own contacts
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // NULL out FK references in child tables
    db.prepare('UPDATE accounts SET main_contact_id = NULL WHERE main_contact_id = ?').run(id);
    db.prepare('UPDATE policies SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE assets SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE claims SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE policy_sections SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE client_engagements SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE risk_details SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE advice_records SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE complaints SET contact_id = NULL WHERE contact_id = ?').run(id);
    db.prepare('UPDATE reviews SET contact_id = NULL WHERE contact_id = ?').run(id);

    db.prepare('DELETE FROM contacts WHERE id = ?').run(id);

    res.locals.logAudit({
      action:      'DELETE',
      module:      'contacts',
      recordId:    id,
      oldValue:    redactForAudit(existing),
      description: `Deleted contact: ${existing.first_name} ${existing.last_name}`
    });

    return res.json({ message: 'Contact deleted successfully' });
  } catch (err) {
    console.error('DELETE /contacts/:id error:', err.message);
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Cannot delete: this record is referenced by other records.' });
    }
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/documents — documents linked to this contact
// ---------------------------------------------------------------------------
router.get('/:id/documents', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();

  const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get(id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  const docs = db.prepare(`
    SELECT
      d.*,
      u.full_name AS uploaded_by_name
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.contact_id = ?
    ORDER BY d.uploaded_at DESC
  `).all(id);

  return res.json(docs);
});

module.exports = router;
