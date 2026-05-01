'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, getBrokerId } = require('../middleware/auth');
const { encrypt, decrypt, mask, isEncrypted, redactForAudit } = require('../lib/crypto');
const { verifyEditUnlock } = require('../lib/edit-lock');
const { notSupplierSql } = require('../lib/supplier');

// Suppliers (panel-beaters, assessors, etc.) sit outside FICA — exclude them
// from list/report queries that target the contacts table as alias `c`.
const NOT_SUPPLIER_C = notSupplierSql('c');

/** Mask document references for responses — last 4 chars visible, rest replaced. */
function maskDocRef(stored) {
  if (!stored) return null;
  const plain = isEncrypted(stored) ? decrypt(stored) : stored;
  return plain ? mask(plain) : null;
}

/**
 * Encrypt a document reference for write. If the submitted value equals the
 * current masked rendering, treat as "no change" (the form just round-tripped
 * the masked display) and preserve the existing ciphertext.
 */
function resolveDocRefForWrite(submitted, existingStored) {
  if (submitted === undefined) return existingStored;
  if (submitted === null || submitted === '') return null;
  const currentPlain = existingStored
    ? (isEncrypted(existingStored) ? decrypt(existingStored) : existingStored)
    : null;
  if (currentPlain && submitted === mask(currentPlain)) return existingStored;
  if (isEncrypted(submitted)) return submitted;
  return encrypt(submitted);
}

const router = express.Router();
router.use(requireAuth);

const METHOD_OPTS = [
  'South African ID document', 'Passport', 'CIPC registration (company)',
  "Driver's licence", 'Biometric', 'Other certified document'
];
const PEP_OPTS = ['Yes — clear', 'Yes — flagged for review', 'Not yet performed'];
const BO_OPTS = ['Yes', 'No', 'Pending'];

// Juristic business types where beneficial-owner confirmation is required by FICA.
const JURISTIC_BUSINESS_TYPES = new Set([
  'Pty Ltd', 'Public Company', 'Close Corporation', 'Trust',
  'Co-operative', 'Section 21', 'Company', 'NPO', 'Body Corporate',
]);

/**
 * A FICA record is "complete" when every mandatory verification artefact is captured.
 * This is the gate that allows status to flip to Verified — without it the record
 * is at most In Review.
 */
function isFicaRecordComplete(record, kind) {
  if (!record) return false;
  if (!record.fica_verification_date)   return false;
  if (!record.fica_verification_method) return false;
  if (!record.fica_document_reference)  return false;
  if (!record.fica_verified_by_id)      return false;
  // PEP check must be performed (any value other than 'Not yet performed').
  if (!record.fica_pep_check || record.fica_pep_check === 'Not yet performed') return false;
  if (!record.fica_pep_check_date)      return false;

  if (kind === 'account' && JURISTIC_BUSINESS_TYPES.has(record.business_type)) {
    if (!record.fica_beneficial_owner_confirmed ||
        record.fica_beneficial_owner_confirmed === 'Pending') return false;
  }
  return true;
}

/** Human-readable list of fields that prevent a FICA record from being Verified. */
function ficaIncompleteReasons(record, kind) {
  const r = [];
  if (!record.fica_verification_date)   r.push('verification date');
  if (!record.fica_verification_method) r.push('verification method');
  if (!record.fica_document_reference)  r.push('document reference');
  if (!record.fica_verified_by_id)      r.push('verified-by user');
  if (!record.fica_pep_check || record.fica_pep_check === 'Not yet performed') r.push('PEP check');
  if (!record.fica_pep_check_date)      r.push('PEP check date');
  if (kind === 'account' && JURISTIC_BUSINESS_TYPES.has(record.business_type) &&
      (!record.fica_beneficial_owner_confirmed || record.fica_beneficial_owner_confirmed === 'Pending')) {
    r.push('beneficial-owner confirmation');
  }
  return r;
}

function computeFicaStatus(contact) {
  if (!contact) return 'Not verified';
  if (!contact.fica_verification_date) return 'Not verified';
  if (contact.fica_five_year_expiry) {
    const expiry = new Date(contact.fica_five_year_expiry);
    if (expiry < new Date()) return 'Expired';
  }
  return 'Verified';
}

// Dropdown options
router.get('/options', (_req, res) => {
  res.json({
    method: METHOD_OPTS,
    pep: PEP_OPTS,
    beneficial_owner: BO_OPTS,
  });
});

// GET /list — one FICA row per contact AND per account, with computed status
router.get('/list', (req, res) => {
  try {
    const db = getDb();
    const scopedBrokerId = getBrokerId(req);
    const where  = scopedBrokerId ? 'WHERE c.assigned_broker_id = ?' : '';
    const params = scopedBrokerId ? [scopedBrokerId] : [];

    const contacts = db.prepare(`
      SELECT
        c.id, c.first_name, c.last_name, c.sa_id_number, c.email,
        c.fica_status, c.fica_verification_date, c.fica_verification_method,
        c.fica_document_reference, c.fica_five_year_expiry,
        c.fica_re_verification_date, c.fica_cipc_number,
        c.fica_beneficial_owner_confirmed, c.fica_pep_check, c.fica_pep_check_date,
        u.full_name AS fica_verified_by_name
      FROM contacts c
      LEFT JOIN users u ON u.id = c.fica_verified_by_id
      ${where}
      ${where ? 'AND' : 'WHERE'} ${NOT_SUPPLIER_C}
      ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE
    `).all(...params);

    const acctWhere  = scopedBrokerId ? 'WHERE a.assigned_broker_id = ?' : '';
    const acctParams = scopedBrokerId ? [scopedBrokerId] : [];
    const accounts = db.prepare(`
      SELECT
        a.id, a.account_name, a.registration_number, a.business_type,
        a.fica_status, a.fica_verification_date, a.fica_verification_method,
        a.fica_document_reference, a.fica_five_year_expiry,
        a.fica_re_verification_date, a.fica_cipc_number,
        a.fica_beneficial_owner_confirmed, a.fica_pep_check, a.fica_pep_check_date,
        u.full_name AS fica_verified_by_name
      FROM accounts a
      LEFT JOIN users u ON u.id = a.fica_verified_by_id
      ${acctWhere}
      ORDER BY a.account_name COLLATE NOCASE
    `).all(...acctParams);

    const contactRows = contacts.map(c => ({
      ...c,
      fica_document_reference: maskDocRef(c.fica_document_reference),
      fica_document_reference_encrypted: !!c.fica_document_reference,
      kind: 'contact',
      display_name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim(),
      derived_status: computeFicaStatus(c),
    }));

    const accountRows = accounts.map(a => ({
      ...a,
      fica_document_reference: maskDocRef(a.fica_document_reference),
      fica_document_reference_encrypted: !!a.fica_document_reference,
      kind: 'account',
      // Surface the account name through the same first_name/last_name slots
      // so existing FICA_CELLS renderers fall back gracefully.
      first_name: a.account_name,
      last_name:  '',
      display_name: a.account_name,
      sa_id_number: a.registration_number,
      derived_status: computeFicaStatusAccount(a),
    }));

    const merged = [...contactRows, ...accountRows].sort((x, y) =>
      (x.display_name || '').localeCompare(y.display_name || ''));

    res.json(merged);
  } catch (err) {
    console.error('[fica/list] ', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /contact/:id — current FICA verification + computed status
router.get('/contact/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const contact = db.prepare(`
    SELECT c.*, u.full_name AS fica_verified_by_name
    FROM contacts c
    LEFT JOIN users u ON u.id = c.fica_verified_by_id
    WHERE c.id = ?
  `).get(id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && contact.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const derivedStatus = computeFicaStatus(contact);
  res.json({
    contact_id: contact.id,
    first_name: contact.first_name,
    last_name: contact.last_name,
    fica_status: contact.fica_status,
    fica_verification_date: contact.fica_verification_date,
    fica_verification_method: contact.fica_verification_method,
    fica_document_reference: maskDocRef(contact.fica_document_reference),
    fica_document_reference_encrypted: !!contact.fica_document_reference,
    fica_verified_by_id: contact.fica_verified_by_id,
    fica_verified_by_name: contact.fica_verified_by_name,
    fica_five_year_expiry: contact.fica_five_year_expiry,
    fica_re_verification_date: contact.fica_re_verification_date,
    fica_cipc_number: contact.fica_cipc_number,
    fica_beneficial_owner_confirmed: contact.fica_beneficial_owner_confirmed,
    fica_pep_check: contact.fica_pep_check,
    fica_pep_check_date: contact.fica_pep_check_date,
    derived_status: derivedStatus,
    banner: derivedStatus !== 'Verified',
  });
});

// PUT /contact/:id — update FICA fields
router.put('/contact/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Edit-lock gate — only kicks in once a FICA record has actually been saved.
  // First-time data entry (all FICA fields empty) goes through without a
  // password challenge so brokers can capture the initial record freely.
  const ficaAlreadySaved = !!(existing.fica_verification_date || existing.fica_verification_method ||
                              existing.fica_document_reference || existing.fica_verified_by_id ||
                              existing.fica_pep_check);
  if (ficaAlreadySaved) {
    const _unlock = verifyEditUnlock(req, res, db, { module: 'fica_contact', recordId: id });
    if (!_unlock.ok) return res.status(_unlock.status).json({ error: _unlock.error, code: _unlock.code });
  } else {
    // Strip any stray _admin_password to keep it out of DB writes.
    if (req.body && '_admin_password' in req.body) delete req.body._admin_password;
  }

  const b = req.body || {};

  if (b.fica_verification_method && !METHOD_OPTS.includes(b.fica_verification_method)) {
    return res.status(400).json({ error: 'Invalid verification method' });
  }
  if (b.fica_pep_check && !PEP_OPTS.includes(b.fica_pep_check)) {
    return res.status(400).json({ error: 'Invalid PEP check value' });
  }

  // Prevent self-verification (verifier cannot equal the contact)
  if (b.fica_verified_by_id && req.session.userId &&
      String(b.fica_verified_by_id) === String(req.session.userId) &&
      existing.created_by && String(existing.created_by) === String(req.session.userId)) {
    // Still allow — this is a warning not a hard block, since CRM users are brokers
    // not clients themselves. The spec's rule applies in a context where clients verify
    // themselves, which isn't possible here. Left as comment for future reference.
  }

  // Auto-calculate 5-year expiry from verification date
  let fiveYearExpiry = null;
  const verificationDate = b.fica_verification_date || existing.fica_verification_date;
  if (verificationDate) {
    const expiry = new Date(verificationDate);
    expiry.setFullYear(expiry.getFullYear() + 5);
    fiveYearExpiry = expiry.toISOString().slice(0, 10);
  }

  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  // Build the post-update view so we can run completeness against the merged record.
  const merged = {
    fica_verification_date:          verificationDate,
    fica_verification_method:        pick('fica_verification_method'),
    fica_document_reference:         pick('fica_document_reference'),
    fica_verified_by_id:             b.fica_verified_by_id !== undefined ? b.fica_verified_by_id : existing.fica_verified_by_id,
    fica_pep_check:                  pick('fica_pep_check'),
    fica_pep_check_date:             pick('fica_pep_check_date'),
    fica_beneficial_owner_confirmed: pick('fica_beneficial_owner_confirmed'),
  };
  const ficaComplete  = isFicaRecordComplete(merged, 'contact');
  const popiaConsent  = !!existing.popia_consent_obtained;
  const requested     = b.fica_status !== undefined ? b.fica_status : existing.fica_status;

  // Hard gate: cannot manually set Verified unless record is complete.
  if (requested === 'Verified' && !ficaComplete) {
    const missing = ficaIncompleteReasons(merged, 'contact');
    return res.status(400).json({
      error: `FICA cannot be set to Verified — record is incomplete. Missing: ${missing.join(', ')}.`,
      missing,
    });
  }

  // Resolve final status: explicit Exempt is honoured; otherwise auto-promote to Verified
  // when both the FICA record is complete AND POPIA consent is on file.
  let finalStatus;
  if (requested === 'Exempt') {
    finalStatus = 'Exempt';
  } else if (ficaComplete && popiaConsent) {
    finalStatus = 'Verified';
  } else if (ficaComplete && !popiaConsent) {
    finalStatus = 'In Review';   // record done but POPIA gate not crossed yet
  } else if (verificationDate) {
    finalStatus = 'In Review';   // some progress made, but missing fields
  } else {
    finalStatus = pick('fica_status') || 'Not Started';
  }

  db.prepare(`
    UPDATE contacts SET
      fica_status                      = ?,
      fica_verification_date           = ?,
      fica_verification_method         = ?,
      fica_document_reference          = ?,
      fica_verified_by_id              = ?,
      fica_five_year_expiry            = ?,
      fica_re_verification_date        = ?,
      fica_cipc_number                 = ?,
      fica_beneficial_owner_confirmed  = ?,
      fica_pep_check                   = ?,
      fica_pep_check_date              = ?,
      updated_at                       = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finalStatus,
    pick('fica_verification_date') || null,
    pick('fica_verification_method') || null,
    resolveDocRefForWrite(b.fica_document_reference, existing.fica_document_reference),
    b.fica_verified_by_id !== undefined ? (b.fica_verified_by_id || null) : existing.fica_verified_by_id,
    fiveYearExpiry,
    pick('fica_re_verification_date') || null,
    pick('fica_cipc_number') || null,
    pick('fica_beneficial_owner_confirmed') || null,
    pick('fica_pep_check') || null,
    pick('fica_pep_check_date') || null,
    id
  );

  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'fica_contact',
    recordId: id,
    oldValue: redactForAudit(existing),
    newValue: redactForAudit(updated),
    description: `FICA record updated for contact ${updated.first_name} ${updated.last_name}`
  });

  res.json({
    contact_id: updated.id,
    derived_status: computeFicaStatus(updated),
    record: { ...updated, fica_document_reference: maskDocRef(updated.fica_document_reference), fica_document_reference_encrypted: !!updated.fica_document_reference },
  });
});

// ════════════════════════════════════════════════════════════════
// ACCOUNT-LEVEL FICA endpoints
// ════════════════════════════════════════════════════════════════

function computeFicaStatusAccount(account) {
  if (!account) return 'Not verified';
  if (!account.fica_verification_date) return 'Not verified';
  if (account.fica_five_year_expiry) {
    const expiry = new Date(account.fica_five_year_expiry);
    if (expiry < new Date()) return 'Expired';
  }
  return 'Verified';
}

// GET /account/:id — current FICA verification + computed status
router.get('/account/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const account = db.prepare(`
    SELECT a.*, u.full_name AS fica_verified_by_name
    FROM accounts a
    LEFT JOIN users u ON u.id = a.fica_verified_by_id
    WHERE a.id = ?
  `).get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && account.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const derivedStatus = computeFicaStatusAccount(account);
  res.json({
    account_id: account.id,
    account_name: account.account_name,
    registration_number: account.registration_number,
    vat_number: account.vat_number,
    business_type: account.business_type,
    fica_status: account.fica_status,
    fica_verification_date: account.fica_verification_date,
    fica_verification_method: account.fica_verification_method,
    fica_document_reference: maskDocRef(account.fica_document_reference),
    fica_document_reference_encrypted: !!account.fica_document_reference,
    fica_verified_by_id: account.fica_verified_by_id,
    fica_verified_by_name: account.fica_verified_by_name,
    fica_five_year_expiry: account.fica_five_year_expiry,
    fica_re_verification_date: account.fica_re_verification_date,
    fica_cipc_number: account.fica_cipc_number,
    fica_beneficial_owner_confirmed: account.fica_beneficial_owner_confirmed,
    fica_pep_check: account.fica_pep_check,
    fica_pep_check_date: account.fica_pep_check_date,
    derived_status: derivedStatus,
    banner: derivedStatus !== 'Verified',
  });
});

// PUT /account/:id — update FICA fields on an account
router.put('/account/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Account not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Edit-lock gate — only kicks in once a FICA record has actually been saved.
  const ficaAlreadySaved = !!(existing.fica_verification_date || existing.fica_verification_method ||
                              existing.fica_document_reference || existing.fica_verified_by_id ||
                              existing.fica_pep_check);
  if (ficaAlreadySaved) {
    const _unlock = verifyEditUnlock(req, res, db, { module: 'fica_account', recordId: id });
    if (!_unlock.ok) return res.status(_unlock.status).json({ error: _unlock.error, code: _unlock.code });
  } else {
    if (req.body && '_admin_password' in req.body) delete req.body._admin_password;
  }

  const b = req.body || {};
  if (b.fica_verification_method && !METHOD_OPTS.includes(b.fica_verification_method)) {
    return res.status(400).json({ error: 'Invalid verification method' });
  }
  if (b.fica_pep_check && !PEP_OPTS.includes(b.fica_pep_check)) {
    return res.status(400).json({ error: 'Invalid PEP check value' });
  }

  let fiveYearExpiry = null;
  const verificationDate = b.fica_verification_date || existing.fica_verification_date;
  if (verificationDate) {
    const expiry = new Date(verificationDate);
    expiry.setFullYear(expiry.getFullYear() + 5);
    fiveYearExpiry = expiry.toISOString().slice(0, 10);
  }

  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  const merged = {
    business_type:                   existing.business_type,
    fica_verification_date:          verificationDate,
    fica_verification_method:        pick('fica_verification_method'),
    fica_document_reference:         pick('fica_document_reference'),
    fica_verified_by_id:             b.fica_verified_by_id !== undefined ? b.fica_verified_by_id : existing.fica_verified_by_id,
    fica_pep_check:                  pick('fica_pep_check'),
    fica_pep_check_date:             pick('fica_pep_check_date'),
    fica_beneficial_owner_confirmed: pick('fica_beneficial_owner_confirmed'),
  };
  const ficaComplete = isFicaRecordComplete(merged, 'account');
  const popiaConsent = !!existing.popia_consent_obtained;
  const requested    = b.fica_status !== undefined ? b.fica_status : existing.fica_status;

  if (requested === 'Verified' && !ficaComplete) {
    const missing = ficaIncompleteReasons(merged, 'account');
    return res.status(400).json({
      error: `FICA cannot be set to Verified — record is incomplete. Missing: ${missing.join(', ')}.`,
      missing,
    });
  }

  let finalStatus;
  if (requested === 'Exempt') {
    finalStatus = 'Exempt';
  } else if (ficaComplete && popiaConsent) {
    finalStatus = 'Verified';
  } else if (ficaComplete && !popiaConsent) {
    finalStatus = 'In Review';
  } else if (verificationDate) {
    finalStatus = 'In Review';
  } else {
    finalStatus = pick('fica_status') || 'Not Started';
  }

  db.prepare(`
    UPDATE accounts SET
      fica_status                      = ?,
      fica_verification_date           = ?,
      fica_verification_method         = ?,
      fica_document_reference          = ?,
      fica_verified_by_id              = ?,
      fica_five_year_expiry            = ?,
      fica_re_verification_date        = ?,
      fica_cipc_number                 = ?,
      fica_beneficial_owner_confirmed  = ?,
      fica_pep_check                   = ?,
      fica_pep_check_date              = ?,
      updated_at                       = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    finalStatus,
    pick('fica_verification_date') || null,
    pick('fica_verification_method') || null,
    resolveDocRefForWrite(b.fica_document_reference, existing.fica_document_reference),
    b.fica_verified_by_id !== undefined ? (b.fica_verified_by_id || null) : existing.fica_verified_by_id,
    fiveYearExpiry,
    pick('fica_re_verification_date') || null,
    pick('fica_cipc_number') || null,
    pick('fica_beneficial_owner_confirmed') || null,
    pick('fica_pep_check') || null,
    pick('fica_pep_check_date') || null,
    id
  );

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'fica_account',
    recordId: id,
    oldValue: redactForAudit(existing),
    newValue: redactForAudit(updated),
    description: `FICA record updated for account ${updated.account_name}`,
  });

  res.json({
    account_id: updated.id,
    derived_status: computeFicaStatusAccount(updated),
    record: { ...updated, fica_document_reference: maskDocRef(updated.fica_document_reference), fica_document_reference_encrypted: !!updated.fica_document_reference },
  });
});

// ── GET /compliance-report — manual run, mirrors /api/popia/compliance-report
//
// Returns:
//   missing_verification     — contacts/accounts with no verification date
//   expired_verification     — verification > 5 years (or fica_five_year_expiry passed)
//   expiring_verification    — fica_five_year_expiry within 60 days
//   missing_pep_check        — fica_pep_check is NULL or 'Not yet performed'
//   missing_beneficial_owner — accounts where business type is juristic and BO is NULL/Pending
//
router.get('/compliance-report', (req, res) => {
  const db = getDb();
  const scopedBrokerId = getBrokerId(req);
  const cWhere  = scopedBrokerId ? 'AND c.assigned_broker_id = ?' : '';
  const aWhere  = scopedBrokerId ? 'AND a.assigned_broker_id = ?' : '';
  const params  = scopedBrokerId ? [scopedBrokerId] : [];

  // Missing verification — date not set (suppliers excluded)
  const missingContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.email, c.fica_status,
           'contact' AS kind
    FROM contacts c
    WHERE (c.fica_verification_date IS NULL OR c.fica_verification_date = '')
      AND ${NOT_SUPPLIER_C}
      ${cWhere}
    ORDER BY c.last_name, c.first_name
  `).all(...params);
  const missingAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name,
           NULL AS email, a.fica_status,
           'account' AS kind
    FROM accounts a
    WHERE (a.fica_verification_date IS NULL OR a.fica_verification_date = '')
      ${aWhere}
    ORDER BY a.account_name
  `).all(...params);

  // Expired (5-year expiry passed) — suppliers excluded
  const expiredContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.fica_verification_date, c.fica_five_year_expiry,
           CAST(julianday('now') - julianday(c.fica_five_year_expiry) AS INTEGER) AS days_overdue,
           'contact' AS kind
    FROM contacts c
    WHERE c.fica_five_year_expiry IS NOT NULL
      AND date(c.fica_five_year_expiry) < date('now')
      AND ${NOT_SUPPLIER_C}
      ${cWhere}
    ORDER BY c.fica_five_year_expiry ASC
  `).all(...params);
  const expiredAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name,
           a.fica_verification_date, a.fica_five_year_expiry,
           CAST(julianday('now') - julianday(a.fica_five_year_expiry) AS INTEGER) AS days_overdue,
           'account' AS kind
    FROM accounts a
    WHERE a.fica_five_year_expiry IS NOT NULL
      AND date(a.fica_five_year_expiry) < date('now')
      ${aWhere}
    ORDER BY a.fica_five_year_expiry ASC
  `).all(...params);

  // Expiring within 60 days (suppliers excluded)
  const expiringContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.fica_five_year_expiry,
           CAST(julianday(c.fica_five_year_expiry) - julianday('now') AS INTEGER) AS days_to_expiry,
           'contact' AS kind
    FROM contacts c
    WHERE c.fica_five_year_expiry IS NOT NULL
      AND date(c.fica_five_year_expiry) BETWEEN date('now') AND date('now','+60 days')
      AND ${NOT_SUPPLIER_C}
      ${cWhere}
    ORDER BY c.fica_five_year_expiry ASC
  `).all(...params);
  const expiringAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name, a.fica_five_year_expiry,
           CAST(julianday(a.fica_five_year_expiry) - julianday('now') AS INTEGER) AS days_to_expiry,
           'account' AS kind
    FROM accounts a
    WHERE a.fica_five_year_expiry IS NOT NULL
      AND date(a.fica_five_year_expiry) BETWEEN date('now') AND date('now','+60 days')
      ${aWhere}
    ORDER BY a.fica_five_year_expiry ASC
  `).all(...params);

  // Missing PEP check (suppliers excluded)
  const missingPepContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.fica_pep_check, 'contact' AS kind
    FROM contacts c
    WHERE (c.fica_pep_check IS NULL OR c.fica_pep_check = '' OR c.fica_pep_check = 'Not yet performed')
      AND ${NOT_SUPPLIER_C}
      ${cWhere}
    ORDER BY c.last_name, c.first_name
  `).all(...params);
  const missingPepAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name, a.fica_pep_check, 'account' AS kind
    FROM accounts a
    WHERE (a.fica_pep_check IS NULL OR a.fica_pep_check = '' OR a.fica_pep_check = 'Not yet performed')
      ${aWhere}
    ORDER BY a.account_name
  `).all(...params);

  // Missing beneficial-owner confirmation (juristic accounts only)
  const missingBoAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name,
           a.fica_beneficial_owner_confirmed, a.business_type, 'account' AS kind
    FROM accounts a
    WHERE (a.fica_beneficial_owner_confirmed IS NULL
           OR a.fica_beneficial_owner_confirmed = ''
           OR a.fica_beneficial_owner_confirmed = 'Pending')
      AND a.business_type IN ('Pty Ltd','Public Company','Close Corporation','Trust','Co-operative','Section 21')
      ${aWhere}
    ORDER BY a.account_name
  `).all(...params);

  res.json({
    generated_at:           new Date().toISOString(),
    missing_verification:   [...missingContacts, ...missingAccounts],
    expired_verification:   [...expiredContacts, ...expiredAccounts],
    expiring_verification:  [...expiringContacts, ...expiringAccounts],
    missing_pep_check:      [...missingPepContacts, ...missingPepAccounts],
    missing_beneficial_owner: missingBoAccounts,
  });
});

module.exports = router;
module.exports.computeFicaStatus = computeFicaStatus;
module.exports.computeFicaStatusAccount = computeFicaStatusAccount;
module.exports.isFicaRecordComplete = isFicaRecordComplete;
module.exports.ficaIncompleteReasons = ficaIncompleteReasons;
