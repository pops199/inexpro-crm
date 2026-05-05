'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { redactForAudit } = require('../lib/crypto');
const { verifyEditUnlock } = require('../lib/edit-lock');
const { sendMail } = require('../lib/mailer');
const { notSupplierSql } = require('../lib/supplier');

// Suppliers (panel-beaters, assessors, etc.) sit outside POPIA — exclude them
// from compliance-report queries that target the contacts table as alias `c`.
const NOT_SUPPLIER_C = notSupplierSql('c');

const router = express.Router();
router.use(requireAuth);

const PROCESSING_BASIS_OPTS = [
  'Consent', 'Contractual necessity', 'Legal obligation',
  'Legitimate interest', 'Vital interest'
];
const CONSENT_METHOD_OPTS = [
  'Signed form', 'Digital opt-in', 'Email confirmation', 'Verbal (with witness)'
];
const DATA_SOURCE_OPTS = [
  'Client-provided directly', 'Referred by third party', 'Public record', 'Existing relationship'
];
const SCOPE_OPTS = [
  'Insurance administration', 'Claims processing', 'Risk assessment',
  'Direct marketing', 'Third-party sharing'
];
const DATA_CATEGORY_OPTS = [
  'ID number', 'Contact details', 'Financial info', 'Health info',
  'Biometric', 'Risk/property data', 'Claims history'
];

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

function fromJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function escHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replacePlaceholders(text, values) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] !== undefined && values[key] !== null ? String(values[key]) : match
  );
}

function loadTemplate(db, key, fallback) {
  const getVal = (name) => {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(name);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch (_) { return row.value; }
  };
  return {
    subject: getVal(`template_${key}_subject`) || fallback.subject,
    body:    getVal(`template_${key}_body`)    || fallback.body,
  };
}

function addRecipient(map, row) {
  if (!row || !row.email) return;
  const email = String(row.email).trim();
  if (!email || !email.includes('@')) return;
  const key = email.toLowerCase();
  if (!map.has(key)) {
    map.set(key, {
      type: row.type,
      id: row.id,
      name: row.name || email,
      email,
    });
  }
}

function resolveBreachRecipients(db, selection = {}) {
  const recipients = new Map();
  const selected = Array.isArray(selection.selected) ? selection.selected : [];
  const contactById = db.prepare(`
    SELECT 'contact' AS type, id, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name, email
    FROM contacts
    WHERE id = ?
  `);
  const accountContactsById = db.prepare(`
    SELECT 'account' AS type, a.id, a.account_name AS name, c.email
    FROM accounts a
    JOIN contacts c ON c.id = a.main_contact_id OR c.related_account_id = a.id
    WHERE a.id = ?
  `);
  const userById = db.prepare(`
    SELECT 'user' AS type, id, COALESCE(full_name, username, email) AS name, email
    FROM users
    WHERE id = ?
  `);

  if (selection.all_contacts) {
    db.prepare(`
      SELECT 'contact' AS type, id, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name, email
      FROM contacts
      WHERE email IS NOT NULL AND TRIM(email) != ''
      ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE
    `).all().forEach(r => addRecipient(recipients, r));
  }
  if (selection.all_accounts) {
    db.prepare(`
      SELECT 'account' AS type, a.id, a.account_name AS name, c.email
      FROM accounts a
      JOIN contacts c ON c.id = a.main_contact_id OR c.related_account_id = a.id
      WHERE c.email IS NOT NULL AND TRIM(c.email) != ''
      ORDER BY a.account_name COLLATE NOCASE
    `).all().forEach(r => addRecipient(recipients, r));
  }
  if (selection.all_users) {
    db.prepare(`
      SELECT 'user' AS type, id, COALESCE(full_name, username, email) AS name, email
      FROM users
      WHERE active = 1 AND email IS NOT NULL AND TRIM(email) != ''
      ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE
    `).all().forEach(r => addRecipient(recipients, r));
  }

  selected.forEach(item => {
    const type = String(item.type || '').toLowerCase();
    const id = parseInt(item.id, 10);
    if (!id) return;
    if (type === 'contact') addRecipient(recipients, contactById.get(id));
    if (type === 'account') accountContactsById.all(id).forEach(r => addRecipient(recipients, r));
    if (type === 'user') addRecipient(recipients, userById.get(id));
  });

  return [...recipients.values()];
}

async function sendBreachNotifications(db, breach, recipients, userId) {
  if (!recipients.length) return { attempted: 0, sent: 0, failed: 0, failures: [] };
  const template = loadTemplate(db, 'data_breach_notification', {
    subject: 'Important: Data breach notification',
    body: [
      '<p>Dear {{recipient_name}},</p>',
      '<p>We are notifying you immediately after discovering a data breach that may affect information we hold.</p>',
      '<p><strong>Date of breach:</strong> {{breach_date}}<br>',
      '<strong>Date discovered:</strong> {{discovered_date}}<br>',
      '<strong>Nature of breach:</strong> {{nature}}<br>',
      '<strong>Data affected:</strong> {{data_affected}}</p>',
      '<p><strong>Remediation:</strong> {{remediation}}</p>',
      '<p>We will provide further updates as our investigation progresses.</p>',
    ].join('\n'),
  });
  const failures = [];
  let sent = 0;

  for (const recipient of recipients) {
    const values = {
      recipient_name: escHtml(recipient.name || recipient.email),
      breach_id: breach.id,
      breach_date: breach.breach_date || '',
      discovered_date: breach.discovered_date || '',
      nature: escHtml(breach.nature || ''),
      data_affected: escHtml(breach.data_affected || 'To be confirmed'),
      remediation: escHtml(breach.remediation || 'Investigation and containment actions are underway.'),
    };
    const subject = replacePlaceholders(template.subject, values);
    const html = replacePlaceholders(template.body, values);
    // Map recipient type → timeline module so the breach mail lands on
    // the right record (contact / account). Users have no timeline page.
    const moduleByType = { contact: 'contacts', account: 'accounts' };
    const timelineModule = moduleByType[recipient.type];
    const result = await sendMail({
      to: recipient.email,
      subject,
      html,
      userId,
      audit: timelineModule && recipient.id
        ? {
            module: timelineModule,
            recordId: recipient.id,
            description: `POPIA breach notification (#${breach.id}) emailed to ${recipient.email} — "${subject}"`,
          }
        : { description: `POPIA breach notification (#${breach.id}) emailed to ${recipient.email} — "${subject}"` },
    });
    if (result.ok) sent += 1;
    else failures.push({ email: recipient.email, reason: result.reason || 'send failed' });
  }

  return {
    attempted: recipients.length,
    sent,
    failed: failures.length,
    failures,
  };
}

/**
 * POPIA status for a contact — Green (complete), Amber (incomplete), Red
 * (consent expired, erasure pending, or retention expiry passed).
 */
function computePopiaStatus(contact, openRequests) {
  if (!contact) return 'Red';
  if (openRequests && openRequests.some(r => r.request_type === 'Erasure' && r.status !== 'Completed')) {
    return 'Red';
  }
  if (contact.retention_expiry_date) {
    const expiry = new Date(contact.retention_expiry_date);
    if (expiry < new Date()) return 'Red';
  }
  const hasBasis = !!contact.data_processing_basis;
  const consentComplete = contact.data_processing_basis === 'Consent'
    ? !!(contact.popia_consent_date && contact.consent_method)
    : true;
  const hasSource  = !!contact.data_source;
  const hasCategories = !!(contact.data_categories_held && contact.data_categories_held !== '[]');
  const hasIO      = !!contact.information_officer_id;
  const hasNotice  = !!contact.privacy_notice_provided;
  if (!hasBasis) return 'Red';
  if (hasBasis && consentComplete && hasSource && hasCategories && hasIO && hasNotice) return 'Green';
  return 'Amber';
}

// ── GET /options — dropdown options for UI ─────────────────────
router.get('/options', (_req, res) => {
  res.json({
    processing_basis: PROCESSING_BASIS_OPTS,
    consent_method:   CONSENT_METHOD_OPTS,
    data_source:      DATA_SOURCE_OPTS,
    consent_scope:    SCOPE_OPTS,
    data_categories:  DATA_CATEGORY_OPTS,
  });
});

// ── GET /list — one POPIA row per contact with computed status ─
router.get('/list', (req, res) => {
  try {
    const db = getDb();
    const scopedBrokerId = getBrokerId(req);
    const where  = scopedBrokerId ? 'WHERE c.assigned_broker_id = ?' : '';
    const params = scopedBrokerId ? [scopedBrokerId] : [];

    const contacts = db.prepare(`
      SELECT
        c.id, c.first_name, c.last_name, c.email, c.mobile,
        c.data_processing_basis, c.popia_consent_obtained,
        c.popia_consent_date, c.consent_method, c.consent_scope,
        c.direct_marketing_consent, c.data_source, c.data_categories_held,
        c.third_party_sharing, c.retention_period_years, c.retention_expiry_date,
        c.information_officer_id, c.privacy_notice_provided, c.privacy_notice_date,
        c.last_activity_date, c.updated_at,
        io.full_name AS information_officer_name
      FROM contacts c
      LEFT JOIN users io ON io.id = c.information_officer_id
      ${where}
      ${where ? 'AND' : 'WHERE'} ${NOT_SUPPLIER_C}
      ORDER BY c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE
    `).all(...params);

    const openErasures = db.prepare(`
      SELECT contact_id FROM data_subject_requests
      WHERE request_type = 'Erasure' AND status != 'Completed'
    `).all().map(r => r.contact_id);
    const erasureSet = new Set(openErasures);

    const acctWhere  = scopedBrokerId ? 'WHERE a.assigned_broker_id = ?' : '';
    const acctParams = scopedBrokerId ? [scopedBrokerId] : [];
    const accounts = db.prepare(`
      SELECT
        a.id, a.account_name, NULL AS email, NULL AS mobile,
        a.data_processing_basis, a.popia_consent_obtained,
        a.popia_consent_date, a.consent_method, a.consent_scope,
        a.direct_marketing_consent, a.data_source, a.data_categories_held,
        a.third_party_sharing, a.retention_period_years, a.retention_expiry_date,
        a.information_officer_id, a.privacy_notice_provided, a.privacy_notice_date,
        a.last_activity_date, a.updated_at,
        io.full_name AS information_officer_name
      FROM accounts a
      LEFT JOIN users io ON io.id = a.information_officer_id
      ${acctWhere}
      ORDER BY a.account_name COLLATE NOCASE
    `).all(...acctParams);

    const contactRows = contacts.map(c => ({
      ...c,
      kind: 'contact',
      display_name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim(),
      status_badge: computePopiaStatus(
        c,
        erasureSet.has(c.id) ? [{ request_type: 'Erasure', status: 'Open' }] : []
      ),
    }));

    const accountRows = accounts.map(a => ({
      ...a,
      first_name: a.account_name,
      last_name:  '',
      kind: 'account',
      display_name: a.account_name,
      status_badge: computePopiaStatus(a, []),
    }));

    const rows = [...contactRows, ...accountRows].sort((x, y) =>
      (x.display_name || '').localeCompare(y.display_name || ''));

    res.json(rows);
  } catch (err) {
    console.error('[popia/list] ', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ── GET /contact/:id — POPIA record for a contact ─────────────
router.get('/contact/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  const contact = db.prepare(`
    SELECT c.*, io.full_name AS information_officer_name
    FROM contacts c
    LEFT JOIN users io ON io.id = c.information_officer_id
    WHERE c.id = ?
  `).get(id);

  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && contact.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const requests = db.prepare(`
    SELECT dsr.*, u.full_name AS handled_by_name
    FROM data_subject_requests dsr
    LEFT JOIN users u ON u.id = dsr.handled_by
    WHERE dsr.contact_id = ?
    ORDER BY dsr.request_date DESC, dsr.id DESC
  `).all(id);

  res.json({
    contact_id: contact.id,
    first_name: contact.first_name,
    last_name: contact.last_name,
    data_processing_basis: contact.data_processing_basis,
    popia_consent_obtained: contact.popia_consent_obtained,
    popia_consent_date: contact.popia_consent_date,
    consent_method: contact.consent_method,
    consent_scope: contact.consent_scope,
    direct_marketing_consent: contact.direct_marketing_consent,
    data_source: contact.data_source,
    data_categories_held: contact.data_categories_held,
    third_party_sharing: contact.third_party_sharing,
    third_party_sharing_notes: contact.third_party_sharing_notes,
    retention_period_years: contact.retention_period_years,
    retention_expiry_date: contact.retention_expiry_date,
    information_officer_id: contact.information_officer_id,
    information_officer_name: contact.information_officer_name,
    privacy_notice_provided: contact.privacy_notice_provided,
    privacy_notice_date: contact.privacy_notice_date,
    last_activity_date: contact.last_activity_date,
    status_badge: computePopiaStatus(contact, requests),
    requests,
  });
});

// ── PUT /contact/:id — update POPIA fields on a contact ───────
router.put('/contact/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Edit-lock gate — only kicks in once a POPIA record has actually been
  // saved. First-time data entry goes through unlocked.
  const popiaAlreadySaved = !!(existing.data_processing_basis || existing.popia_consent_date ||
                                existing.consent_method       || existing.data_source ||
                                existing.popia_consent_obtained);
  if (popiaAlreadySaved) {
    const _unlock = verifyEditUnlock(req, res, db, { module: 'popia_contact', recordId: id });
    if (!_unlock.ok) return res.status(_unlock.status).json({ error: _unlock.error, code: _unlock.code });
  } else {
    if (req.body && '_admin_password' in req.body) delete req.body._admin_password;
  }

  const b = req.body || {};

  if (b.data_processing_basis && !PROCESSING_BASIS_OPTS.includes(b.data_processing_basis)) {
    return res.status(400).json({ error: 'Invalid data_processing_basis' });
  }
  if (b.data_processing_basis === 'Consent') {
    if (!b.popia_consent_date || !b.consent_method) {
      return res.status(400).json({
        error: 'When basis is Consent, consent date and method are required.'
      });
    }
  }

  const retentionYears = b.retention_period_years !== undefined
    ? parseInt(b.retention_period_years, 10) || 5
    : (existing.retention_period_years || 5);

  // Auto-calculate retention expiry from last_activity_date (or now)
  const lastAct = b.last_activity_date || existing.last_activity_date || new Date().toISOString().slice(0, 10);
  const expiry = new Date(lastAct);
  expiry.setFullYear(expiry.getFullYear() + retentionYears);
  const retentionExpiryDate = expiry.toISOString().slice(0, 10);

  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  db.prepare(`
    UPDATE contacts SET
      data_processing_basis      = ?,
      popia_consent_obtained     = ?,
      popia_consent_date         = ?,
      consent_method             = ?,
      consent_scope              = ?,
      direct_marketing_consent   = ?,
      data_source                = ?,
      data_categories_held       = ?,
      third_party_sharing        = ?,
      third_party_sharing_notes  = ?,
      retention_period_years     = ?,
      retention_expiry_date      = ?,
      information_officer_id     = ?,
      privacy_notice_provided    = ?,
      privacy_notice_date        = ?,
      last_activity_date         = ?,
      updated_at                 = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('data_processing_basis') || null,
    b.popia_consent_obtained !== undefined ? (b.popia_consent_obtained ? 1 : 0) : existing.popia_consent_obtained,
    pick('popia_consent_date') || null,
    pick('consent_method') || null,
    b.consent_scope !== undefined ? toJsonArray(b.consent_scope) : existing.consent_scope,
    b.direct_marketing_consent !== undefined ? (b.direct_marketing_consent ? 1 : 0) : existing.direct_marketing_consent,
    pick('data_source') || null,
    b.data_categories_held !== undefined ? toJsonArray(b.data_categories_held) : existing.data_categories_held,
    b.third_party_sharing !== undefined ? (b.third_party_sharing ? 1 : 0) : existing.third_party_sharing,
    pick('third_party_sharing_notes') || null,
    retentionYears,
    retentionExpiryDate,
    b.information_officer_id !== undefined ? (b.information_officer_id || null) : existing.information_officer_id,
    b.privacy_notice_provided !== undefined ? (b.privacy_notice_provided ? 1 : 0) : existing.privacy_notice_provided,
    pick('privacy_notice_date') || null,
    lastAct,
    id
  );

  const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'popia_contact',
    recordId: id,
    oldValue: redactForAudit(existing),
    newValue: redactForAudit(updated),
    description: `POPIA record updated for contact ${updated.first_name} ${updated.last_name}`
  });

  res.json({
    contact_id: updated.id,
    status_badge: computePopiaStatus(updated, []),
    record: updated,
  });
});

// ── POST /contact/:id/requests — log a data subject request ───
router.post('/contact/:id/requests', (req, res) => {
  const db = getDb();
  const contactId = parseInt(req.params.id, 10);
  const b = req.body || {};

  if (!b.request_type || !b.request_date) {
    return res.status(400).json({ error: 'request_type and request_date are required' });
  }
  if (!['Access','Correction','Erasure','Object','Withdraw Consent'].includes(b.request_type)) {
    return res.status(400).json({ error: 'Invalid request_type' });
  }

  const contact = db.prepare('SELECT id, assigned_broker_id FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && contact.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // POPIA: 30-day completion target
  const target = new Date(b.request_date);
  target.setDate(target.getDate() + 30);

  // Right to Object → suspend processing immediately on creation
  const initialSuspended = b.request_type === 'Object' ? 1 : (b.processing_suspended ? 1 : 0);
  // Right to Withdraw Consent → flip the contact's marketing consent immediately
  const consentWithdrawnDate = b.request_type === 'Withdraw Consent'
    ? (b.consent_withdrawn_date || b.request_date)
    : (b.consent_withdrawn_date || null);

  const result = db.prepare(`
    INSERT INTO data_subject_requests (
      contact_id, request_type, request_date, request_details,
      status, target_completion_date, handled_by, created_by,
      delivery_date, export_format,
      corrected_fields, corrected_by_id, client_notified_date,
      legal_basis_assessment, erasure_action,
      processing_suspended, suspension_lifted_date,
      consent_withdrawn_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contactId,
    b.request_type,
    b.request_date,
    b.request_details || null,
    b.status || 'Open',
    target.toISOString().slice(0, 10),
    b.handled_by || req.session.userId,
    req.session.userId,
    b.delivery_date || null,
    b.export_format || null,
    toJsonArray(b.corrected_fields),
    b.corrected_by_id || null,
    b.client_notified_date || null,
    b.legal_basis_assessment || null,
    b.erasure_action || null,
    initialSuspended,
    b.suspension_lifted_date || null,
    consentWithdrawnDate
  );

  const created = db.prepare('SELECT * FROM data_subject_requests WHERE id = ?').get(result.lastInsertRowid);

  // Right to Withdraw Consent — apply immediately on the contact record
  if (b.request_type === 'Withdraw Consent') {
    db.prepare(`
      UPDATE contacts SET
        direct_marketing_consent = 0,
        popia_consent_obtained   = 0,
        updated_at               = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(contactId);
  }

  res.locals.logAudit({
    action:   'CREATE',
    module:   'popia_request',
    recordId: result.lastInsertRowid,
    newValue: redactForAudit(created),
    description: `POPIA ${b.request_type} request logged for contact ${contactId}` +
                 (b.request_type === 'Withdraw Consent' ? ' (consent flags cleared)' : '') +
                 (b.request_type === 'Object' ? ' (processing suspended)' : '')
  });

  res.status(201).json(created);
});

// ── PUT /requests/:id — update a DSAR ─────────────────────────
router.put('/requests/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};

  const existing = db.prepare('SELECT * FROM data_subject_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Request not found' });

  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  db.prepare(`
    UPDATE data_subject_requests SET
      status                  = ?,
      completion_date         = ?,
      outcome                 = ?,
      outcome_notes           = ?,
      handled_by              = ?,
      delivery_method         = ?,
      target_completion_date  = ?,
      delivery_date           = ?,
      export_format           = ?,
      corrected_fields        = ?,
      corrected_by_id         = ?,
      client_notified_date    = ?,
      legal_basis_assessment  = ?,
      erasure_action          = ?,
      processing_suspended    = ?,
      suspension_lifted_date  = ?,
      consent_withdrawn_date  = ?,
      updated_at              = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('status') || 'Open',
    pick('completion_date') || null,
    pick('outcome') || null,
    pick('outcome_notes') || null,
    pick('handled_by') || null,
    pick('delivery_method') || null,
    pick('target_completion_date') || null,
    pick('delivery_date') || null,
    pick('export_format') || null,
    b.corrected_fields !== undefined ? toJsonArray(b.corrected_fields) : existing.corrected_fields,
    pick('corrected_by_id') || null,
    pick('client_notified_date') || null,
    pick('legal_basis_assessment') || null,
    pick('erasure_action') || null,
    b.processing_suspended !== undefined ? (b.processing_suspended ? 1 : 0) : existing.processing_suspended,
    pick('suspension_lifted_date') || null,
    pick('consent_withdrawn_date') || null,
    id
  );

  // Apply on-resolution side-effects to the contact record
  if (existing.request_type === 'Erasure' && pick('status') === 'Completed') {
    const action = pick('erasure_action');
    if (action === 'Anonymised') {
      db.prepare(`
        UPDATE contacts SET
          first_name = '[anonymised]',
          last_name  = '[anonymised]',
          email = NULL, mobile = NULL, work_number = NULL,
          sa_id_number = NULL, passport_number = NULL,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(`[anonymised per POPIA erasure DSAR ${id}]`, existing.contact_id);
    }
  }

  const updated = db.prepare('SELECT * FROM data_subject_requests WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'popia_request',
    recordId: id,
    oldValue: redactForAudit(existing),
    newValue: redactForAudit(updated),
    description: `POPIA request ${id} updated`
  });

  res.json(updated);
});

// ── DELETE /requests/:id ─────────────────────────────────────
router.delete('/requests/:id', canDelete, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM data_subject_requests WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Request not found' });

  db.prepare('DELETE FROM data_subject_requests WHERE id = ?').run(id);

  res.locals.logAudit({
    action:   'DELETE',
    module:   'popia_request',
    recordId: id,
    oldValue: redactForAudit(existing),
    description: `POPIA request ${id} deleted`
  });

  res.json({ message: 'Request deleted' });
});

// ── GET /breaches — list breach log ───────────────────────────
router.get('/breaches', (req, res) => {
  const db = getDb();
  const resolved = resolveSort('data_breaches', req.query.sort, req.query.dir);
  const orderBy = resolved
    ? `ORDER BY ${resolved.sql} ${resolved.dir}, b.id DESC`
    : `ORDER BY b.breach_date DESC, b.id DESC`;
  const rows = db.prepare(`
    SELECT b.*, u.full_name AS logged_by_name
    FROM data_breach_log b
    LEFT JOIN users u ON u.id = b.logged_by
    ${orderBy}
  `).all();
  res.json(rows);
});

router.get('/breach-recipients', (req, res) => {
  const db = getDb();
  const rawSearch = String(req.query.search || '').trim();
  const like = `%${rawSearch}%`;
  const limit = Math.min(25, Math.max(1, parseInt(req.query.limit, 10) || 10));

  const counts = {
    contacts: db.prepare("SELECT COUNT(*) AS n FROM contacts WHERE email IS NOT NULL AND TRIM(email) != ''").get().n,
    accounts: db.prepare(`
      SELECT COUNT(DISTINCT a.id) AS n
      FROM accounts a
      JOIN contacts c ON c.id = a.main_contact_id OR c.related_account_id = a.id
      WHERE c.email IS NOT NULL AND TRIM(c.email) != ''
    `).get().n,
    users: db.prepare("SELECT COUNT(*) AS n FROM users WHERE active = 1 AND email IS NOT NULL AND TRIM(email) != ''").get().n,
  };

  if (!rawSearch) return res.json({ counts, results: [] });

  const contacts = db.prepare(`
    SELECT 'contact' AS type, id,
           TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name,
           email,
           NULL AS secondary
    FROM contacts
    WHERE email IS NOT NULL AND TRIM(email) != ''
      AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)
    ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE
    LIMIT ?
  `).all(like, like, like, limit);

  const accounts = db.prepare(`
    SELECT 'account' AS type, a.id, a.account_name AS name, MIN(c.email) AS email,
           TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS secondary
    FROM accounts a
    JOIN contacts c ON c.id = a.main_contact_id OR c.related_account_id = a.id
    WHERE c.email IS NOT NULL AND TRIM(c.email) != ''
      AND (a.account_name LIKE ? OR a.registration_number LIKE ? OR c.email LIKE ?)
    GROUP BY a.id, a.account_name
    ORDER BY a.account_name COLLATE NOCASE
    LIMIT ?
  `).all(like, like, like, limit);

  const users = db.prepare(`
    SELECT 'user' AS type, id, COALESCE(full_name, username, email) AS name, email,
           role AS secondary
    FROM users
    WHERE active = 1 AND email IS NOT NULL AND TRIM(email) != ''
      AND (full_name LIKE ? OR username LIKE ? OR email LIKE ?)
    ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE
    LIMIT ?
  `).all(like, like, like, limit);

  res.json({
    counts,
    results: [...contacts, ...accounts, ...users].slice(0, limit * 3),
  });
});

router.get('/breaches/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT b.*, u.full_name AS logged_by_name
    FROM data_breach_log b
    LEFT JOIN users u ON u.id = b.logged_by
    WHERE b.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Breach not found' });
  res.json(row);
});

router.post('/breaches', async (req, res) => {
  const db = getDb();
  const b = req.body || {};

  if (!b.breach_date || !b.discovered_date || !b.nature) {
    return res.status(400).json({ error: 'breach_date, discovered_date and nature are required' });
  }

  const recipientSelection = b.recipient_selection || {};
  const recipients = resolveBreachRecipients(db, recipientSelection);
  const affectedContactIds = recipients
    .filter(r => r.type === 'contact')
    .map(r => r.id);

  const result = db.prepare(`
    INSERT INTO data_breach_log (
      breach_date, discovered_date, nature, data_affected,
      affected_contact_ids, affected_recipients, information_regulator_notified, regulator_notified_date,
      data_subjects_notified, subjects_notified_date, remediation, status, logged_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.breach_date,
    b.discovered_date,
    b.nature,
    b.data_affected || null,
    toJsonArray(b.affected_contact_ids || affectedContactIds),
    JSON.stringify(recipients),
    b.information_regulator_notified ? 1 : 0,
    b.regulator_notified_date || null,
    b.data_subjects_notified ? 1 : 0,
    b.subjects_notified_date || null,
    b.remediation || null,
    b.status || 'Open',
    req.session.userId
  );

  let created = db.prepare('SELECT * FROM data_breach_log WHERE id = ?').get(result.lastInsertRowid);
  let emailSummary = null;

  if (b.notify_recipients) {
    emailSummary = await sendBreachNotifications(db, created, recipients, req.session.userId);
    const notified = emailSummary.sent > 0 ? 1 : 0;
    db.prepare(`
      UPDATE data_breach_log SET
        data_subjects_notified = ?,
        subjects_notified_date = ?,
        notification_email_summary = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(notified, notified ? new Date().toISOString().slice(0, 10) : null, JSON.stringify(emailSummary), created.id);
    created = db.prepare('SELECT * FROM data_breach_log WHERE id = ?').get(created.id);
  }

  res.locals.logAudit({
    action:   'CREATE',
    module:   'data_breach',
    recordId: result.lastInsertRowid,
    newValue: redactForAudit(created),
    description: `Data breach logged: ${b.nature}` +
                 (emailSummary ? `; email notifications sent ${emailSummary.sent}/${emailSummary.attempted}` : '')
  });

  res.status(201).json({
    ...created,
    recipient_count: recipients.length,
    email_summary: emailSummary,
  });
});

router.put('/breaches/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM data_breach_log WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Breach not found' });

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  db.prepare(`
    UPDATE data_breach_log SET
      breach_date                    = ?,
      discovered_date                = ?,
      nature                         = ?,
      data_affected                  = ?,
      affected_contact_ids           = ?,
      information_regulator_notified = ?,
      regulator_notified_date        = ?,
      data_subjects_notified         = ?,
      subjects_notified_date         = ?,
      remediation                    = ?,
      status                         = ?,
      updated_at                     = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('breach_date'),
    pick('discovered_date'),
    pick('nature'),
    pick('data_affected') || null,
    b.affected_contact_ids !== undefined ? toJsonArray(b.affected_contact_ids) : existing.affected_contact_ids,
    b.information_regulator_notified !== undefined ? (b.information_regulator_notified ? 1 : 0) : existing.information_regulator_notified,
    pick('regulator_notified_date') || null,
    b.data_subjects_notified !== undefined ? (b.data_subjects_notified ? 1 : 0) : existing.data_subjects_notified,
    pick('subjects_notified_date') || null,
    pick('remediation') || null,
    pick('status') || 'Open',
    id
  );

  const updated = db.prepare('SELECT * FROM data_breach_log WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'data_breach',
    recordId: id,
    oldValue: redactForAudit(existing),
    newValue: redactForAudit(updated),
    description: `Data breach ${id} updated`
  });

  res.json(updated);
});

// ── GET /compliance-report — weekly POPIA compliance snapshot ─
router.get('/compliance-report', (req, res) => {
  const db = getDb();
  const scopedBrokerId = getBrokerId(req);
  const where  = scopedBrokerId ? 'WHERE c.assigned_broker_id = ?' : '';
  const params = scopedBrokerId ? [scopedBrokerId] : [];

  // Contacts missing a Data Processing Basis (suppliers excluded)
  const missingBasisContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.email, c.contact_status,
           'contact' AS kind
    FROM contacts c
    ${where}
    ${where ? 'AND' : 'WHERE'}
      (c.data_processing_basis IS NULL OR c.data_processing_basis = '')
      AND ${NOT_SUPPLIER_C}
    ORDER BY c.last_name, c.first_name
  `).all(...params);

  // Accounts missing a Data Processing Basis
  const acctWhere  = scopedBrokerId ? 'WHERE a.assigned_broker_id = ?' : '';
  const acctParams = scopedBrokerId ? [scopedBrokerId] : [];
  const missingBasisAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name,
           NULL AS email, a.client_status AS contact_status,
           'account' AS kind
    FROM accounts a
    ${acctWhere}
    ${acctWhere ? 'AND' : 'WHERE'}
      (a.data_processing_basis IS NULL OR a.data_processing_basis = '')
    ORDER BY a.account_name
  `).all(...acctParams);

  const missingBasis = [...missingBasisContacts, ...missingBasisAccounts];

  // Pending data subject requests (Open / In Progress) with overdue flag
  const pendingDsrs = db.prepare(`
    SELECT dsr.*, c.first_name, c.last_name,
           CAST(julianday('now') - julianday(dsr.request_date) AS INTEGER) AS days_open,
           CASE WHEN dsr.target_completion_date < date('now') THEN 1 ELSE 0 END AS overdue
    FROM data_subject_requests dsr
    JOIN contacts c ON c.id = dsr.contact_id
    WHERE dsr.status IN ('Open','In Progress')
      ${scopedBrokerId ? 'AND c.assigned_broker_id = ?' : ''}
    ORDER BY dsr.request_date ASC
  `).all(...(scopedBrokerId ? [scopedBrokerId] : []));

  // Contacts whose retention expires within 30 days or already passed (suppliers excluded)
  const expiringRetentionContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.retention_expiry_date,
           CAST(julianday(c.retention_expiry_date) - julianday('now') AS INTEGER) AS days_to_expiry,
           'contact' AS kind
    FROM contacts c
    ${where}
    ${where ? 'AND' : 'WHERE'}
      c.retention_expiry_date IS NOT NULL
      AND date(c.retention_expiry_date) <= date('now','+30 days')
      AND ${NOT_SUPPLIER_C}
    ORDER BY c.retention_expiry_date ASC
  `).all(...params);

  const expiringRetentionAccounts = db.prepare(`
    SELECT a.id, a.account_name AS first_name, '' AS last_name,
           a.retention_expiry_date,
           CAST(julianday(a.retention_expiry_date) - julianday('now') AS INTEGER) AS days_to_expiry,
           'account' AS kind
    FROM accounts a
    ${acctWhere}
    ${acctWhere ? 'AND' : 'WHERE'}
      a.retention_expiry_date IS NOT NULL
      AND date(a.retention_expiry_date) <= date('now','+30 days')
    ORDER BY a.retention_expiry_date ASC
  `).all(...acctParams);

  const expiringRetention = [...expiringRetentionContacts, ...expiringRetentionAccounts];

  res.json({
    generated_at: new Date().toISOString(),
    missing_processing_basis: missingBasis,
    pending_dsrs: pendingDsrs,
    expiring_retention: expiringRetention,
  });
});

// ── GET /compliance-report.pdf — generate PDF export ─────────
router.get('/compliance-report.pdf', (req, res) => {
  const db = getDb();
  const scopedBrokerId = getBrokerId(req);
  const where  = scopedBrokerId ? 'WHERE c.assigned_broker_id = ?' : '';
  const params = scopedBrokerId ? [scopedBrokerId] : [];
  const acctWhere  = scopedBrokerId ? 'WHERE a.assigned_broker_id = ?' : '';
  const acctParams = scopedBrokerId ? [scopedBrokerId] : [];

  const missingContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.email, c.contact_status
    FROM contacts c ${where}
    ${where ? 'AND' : 'WHERE'}
      (c.data_processing_basis IS NULL OR c.data_processing_basis = '')
      AND ${NOT_SUPPLIER_C}
    ORDER BY c.last_name, c.first_name
  `).all(...params);
  const missingAccounts = db.prepare(`
    SELECT a.id, a.account_name, a.client_status
    FROM accounts a ${acctWhere}
    ${acctWhere ? 'AND' : 'WHERE'}
      (a.data_processing_basis IS NULL OR a.data_processing_basis = '')
    ORDER BY a.account_name
  `).all(...acctParams);
  const pendingDsrs = db.prepare(`
    SELECT dsr.*, c.first_name, c.last_name,
           CAST(julianday('now') - julianday(dsr.request_date) AS INTEGER) AS days_open,
           CASE WHEN dsr.target_completion_date < date('now') THEN 1 ELSE 0 END AS overdue
    FROM data_subject_requests dsr
    JOIN contacts c ON c.id = dsr.contact_id
    WHERE dsr.status IN ('Open','In Progress')
      ${scopedBrokerId ? 'AND c.assigned_broker_id = ?' : ''}
    ORDER BY dsr.request_date ASC
  `).all(...(scopedBrokerId ? [scopedBrokerId] : []));
  const expiringContacts = db.prepare(`
    SELECT c.id, c.first_name, c.last_name, c.retention_expiry_date,
           CAST(julianday(c.retention_expiry_date) - julianday('now') AS INTEGER) AS days_to_expiry
    FROM contacts c ${where}
    ${where ? 'AND' : 'WHERE'}
      c.retention_expiry_date IS NOT NULL
      AND date(c.retention_expiry_date) <= date('now','+30 days')
      AND ${NOT_SUPPLIER_C}
    ORDER BY c.retention_expiry_date ASC
  `).all(...params);
  const expiringAccounts = db.prepare(`
    SELECT a.id, a.account_name, a.retention_expiry_date,
           CAST(julianday(a.retention_expiry_date) - julianday('now') AS INTEGER) AS days_to_expiry
    FROM accounts a ${acctWhere}
    ${acctWhere ? 'AND' : 'WHERE'}
      a.retention_expiry_date IS NOT NULL
      AND date(a.retention_expiry_date) <= date('now','+30 days')
    ORDER BY a.retention_expiry_date ASC
  `).all(...acctParams);

  const PDFDocument = require('pdfkit');
  const fs   = require('fs');
  const path = require('path');

  // Locate Unicode-capable TTF triplet so glyphs like U+2264 render in PDF.
  // pdfkit's built-in Helvetica is WinAnsi only and cannot draw "≤".
  function findUnicodeFontTriplet() {
    const sets = [
      // Windows — Arial
      { reg: 'C:\\Windows\\Fonts\\arial.ttf',
        bold: 'C:\\Windows\\Fonts\\arialbd.ttf',
        italic: 'C:\\Windows\\Fonts\\ariali.ttf' },
      // Windows — Segoe UI
      { reg: 'C:\\Windows\\Fonts\\segoeui.ttf',
        bold: 'C:\\Windows\\Fonts\\segoeuib.ttf',
        italic: 'C:\\Windows\\Fonts\\segoeuii.ttf' },
      // Linux — DejaVu
      { reg: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        italic: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf' },
      // macOS — Arial
      { reg: '/Library/Fonts/Arial.ttf',
        bold: '/Library/Fonts/Arial Bold.ttf',
        italic: '/Library/Fonts/Arial Italic.ttf' },
    ];
    if (process.env.PDF_UNICODE_FONT) {
      sets.unshift({ reg: process.env.PDF_UNICODE_FONT });
    }
    for (const s of sets) {
      try {
        if (s.reg && fs.existsSync(s.reg)) {
          return {
            reg:    s.reg,
            bold:   s.bold   && fs.existsSync(s.bold)   ? s.bold   : s.reg,
            italic: s.italic && fs.existsSync(s.italic) ? s.italic : s.reg,
          };
        }
      } catch (_) {}
    }
    return null;
  }
  const _trip = findUnicodeFontTriplet();
  const FONT_REG  = _trip ? _trip.reg    : 'Helvetica';
  const FONT_BOLD = _trip ? _trip.bold   : 'Helvetica-Bold';
  const FONT_OBL  = _trip ? _trip.italic : 'Helvetica-Oblique';

  const PAGE_W   = 595.28;
  const PAGE_H   = 841.89;
  const MARGIN   = 42;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const PRIMARY  = '#1a5276';
  const LIGHT_BG = '#f8f9fa';
  const BORDER   = '#dee2e6';
  const ACCENT_AMBER = '#b78105';
  const ACCENT_RED   = '#a71d2a';

  const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
  const filename = `popia-compliance-report-${new Date().toISOString().slice(0,10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // ── Letterhead at top of page ──
  const letterheadPath = path.join(__dirname, '..', '..', 'client', 'public', 'letterhead-ROA.png');
  let contentStartY = 20;
  if (fs.existsSync(letterheadPath)) {
    try {
      const imgData = fs.readFileSync(letterheadPath);
      const imgW = imgData.readUInt32BE(16);
      const imgH = imgData.readUInt32BE(20);
      const renderedH = (imgH / imgW) * PAGE_W;
      doc.image(letterheadPath, 0, 0, { width: PAGE_W });
      contentStartY = renderedH + 12;
    } catch (_) {}
  }
  doc.y = contentStartY;
  doc.x = MARGIN;

  // ── Title block ──
  doc.fontSize(18).fillColor(PRIMARY).font(FONT_BOLD)
    .text('POPIA Compliance Report', MARGIN, doc.y, { width: CONTENT_W, align: 'left' });
  doc.fontSize(9).fillColor('#666').font(FONT_REG)
    .text(`Generated: ${new Date().toLocaleString('en-ZA')}`, MARGIN, doc.y + 2, { width: CONTENT_W, align: 'left' });
  doc.moveDown(0.5);
  // accent rule under title
  const titleRuleY = doc.y;
  doc.moveTo(MARGIN, titleRuleY).lineTo(MARGIN + CONTENT_W, titleRuleY)
    .strokeColor(PRIMARY).lineWidth(2).stroke();
  doc.strokeColor('#000').lineWidth(1);
  doc.moveDown(0.6);

  // ── Helpers (mirroring ROA PDF style) ──
  function ensureRoom(needed) {
    if (doc.y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      doc.y = MARGIN;
      doc.x = MARGIN;
    }
  }
  function sectionHead(title, count) {
    ensureRoom(40);
    doc.moveDown(0.6);
    const y = doc.y;
    doc.fontSize(12).fillColor(PRIMARY).font(FONT_BOLD)
      .text(title, MARGIN, y, { continued: true, width: CONTENT_W });
    doc.fillColor('#666').fontSize(10).font(FONT_REG)
      .text(`   (${count})`);
    const lineY = doc.y + 1;
    doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
      .strokeColor(BORDER).lineWidth(0.75).stroke();
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#222').font(FONT_REG);
  }
  function summaryBox(label, val, accent) {
    ensureRoom(50);
    const boxY = doc.y;
    const boxW = (CONTENT_W - 16) / 4;
    return { boxY, boxW };
  }
  function emptyMessage() {
    doc.fontSize(9).fillColor('#888').font(FONT_OBL)
      .text('None.', MARGIN, doc.y, { width: CONTENT_W });
    doc.fillColor('#222').font(FONT_REG);
  }
  function tableRow(cells, widths, opts = {}) {
    ensureRoom(opts.bold ? 16 : 14);
    const startY = doc.y;
    let cx = MARGIN;
    if (opts.fillBg) {
      doc.rect(MARGIN, startY - 2, CONTENT_W, 14).fillColor(LIGHT_BG).fill();
      doc.fillColor('#222');
    }
    doc.font(opts.bold ? FONT_BOLD : FONT_REG).fontSize(opts.bold ? 9.5 : 9);
    if (opts.color) doc.fillColor(opts.color);
    cells.forEach((cell, i) => {
      doc.text(String(cell || '\u2014'), cx + 2, startY, { width: widths[i] - 4, lineBreak: false, ellipsis: true });
      cx += widths[i];
    });
    doc.fillColor('#222');
    doc.y = startY + (opts.bold ? 14 : 12);
  }

  // ── Summary chips ──
  doc.moveDown(0.3);
  const totalMissing = missingContacts.length + missingAccounts.length;
  const totalRetention = expiringContacts.length + expiringAccounts.length;
  const chipW = (CONTENT_W - 18) / 4;
  const chipY = doc.y;
  const chips = [
    { label: 'Missing Basis',       value: totalMissing,   color: totalMissing  ? ACCENT_RED   : '#1a7a3a' },
    { label: 'Pending DSARs',       value: pendingDsrs.length,
      color: pendingDsrs.length ? ACCENT_AMBER : '#1a7a3a' },
    { label: 'Retention \u2264 30 days', value: totalRetention, color: totalRetention ? ACCENT_AMBER : '#1a7a3a' },
    { label: 'Overdue DSARs',       value: pendingDsrs.filter(d => d.overdue).length,
      color: pendingDsrs.some(d => d.overdue) ? ACCENT_RED : '#1a7a3a' },
  ];
  chips.forEach((c, i) => {
    const x = MARGIN + i * (chipW + 6);
    doc.rect(x, chipY, chipW, 38).fillColor(LIGHT_BG).fill();
    doc.rect(x, chipY, 3, 38).fillColor(c.color).fill();
    doc.fillColor(c.color).font(FONT_BOLD).fontSize(18)
      .text(String(c.value), x + 10, chipY + 4, { width: chipW - 12 });
    doc.fillColor('#666').font(FONT_REG).fontSize(8.5)
      .text(c.label, x + 10, chipY + 24, { width: chipW - 12 });
  });
  doc.fillColor('#222');
  doc.y = chipY + 50;

  // ── Section 1: Contacts missing basis ──
  sectionHead('Contacts missing a Data Processing Basis', missingContacts.length);
  if (missingContacts.length === 0) emptyMessage();
  else {
    const widths = [CONTENT_W * 0.7, CONTENT_W * 0.3];
    tableRow(['Contact', 'Status'], widths, { bold: true, fillBg: true });
    missingContacts.forEach(c => {
      tableRow([
        ((c.first_name || '') + ' ' + (c.last_name || '')).trim(),
        c.contact_status || '\u2014',
      ], widths);
    });
  }

  // ── Section 2: Accounts missing basis ──
  sectionHead('Accounts missing a Data Processing Basis', missingAccounts.length);
  if (missingAccounts.length === 0) emptyMessage();
  else {
    const widths = [CONTENT_W * 0.6, CONTENT_W * 0.4];
    tableRow(['Account', 'Status'], widths, { bold: true, fillBg: true });
    missingAccounts.forEach(a => {
      tableRow([a.account_name, a.client_status || '\u2014'], widths);
    });
  }

  // ── Section 3: Pending DSARs ──
  sectionHead('Pending Data Subject Requests', pendingDsrs.length);
  if (pendingDsrs.length === 0) emptyMessage();
  else {
    const widths = [CONTENT_W * 0.28, CONTENT_W * 0.18, CONTENT_W * 0.18, CONTENT_W * 0.16, CONTENT_W * 0.20];
    tableRow(['Contact', 'Type', 'Requested', 'Days Open', 'Status'], widths, { bold: true, fillBg: true });
    pendingDsrs.forEach(d => {
      const overdue = d.overdue;
      tableRow([
        ((d.first_name || '') + ' ' + (d.last_name || '')).trim(),
        d.request_type,
        d.request_date,
        `${d.days_open}${overdue ? '  (overdue)' : ''}`,
        d.status,
      ], widths, { color: overdue ? ACCENT_RED : '#222' });
    });
  }

  // ── Section 4: Retention expiring ──
  sectionHead('Retention records expiring (\u2264 30 days)', totalRetention);
  if (totalRetention === 0) emptyMessage();
  else {
    const widths = [CONTENT_W * 0.20, CONTENT_W * 0.45, CONTENT_W * 0.20, CONTENT_W * 0.15];
    tableRow(['Type', 'Name', 'Expires', 'Days'], widths, { bold: true, fillBg: true });
    expiringContacts.forEach(c => {
      const days = c.days_to_expiry;
      const label = days < 0 ? `${Math.abs(days)} OVERDUE` : `${days}`;
      tableRow([
        'Contact',
        ((c.first_name || '') + ' ' + (c.last_name || '')).trim(),
        c.retention_expiry_date,
        label,
      ], widths, { color: days < 0 ? ACCENT_RED : ACCENT_AMBER });
    });
    expiringAccounts.forEach(a => {
      const days = a.days_to_expiry;
      const label = days < 0 ? `${Math.abs(days)} OVERDUE` : `${days}`;
      tableRow([
        'Account',
        a.account_name,
        a.retention_expiry_date,
        label,
      ], widths, { color: days < 0 ? ACCENT_RED : ACCENT_AMBER });
    });
  }

  // ── Footer (every page) ──
  const range = doc.bufferedPageRange ? doc.bufferedPageRange() : { start: 0, count: 1 };
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7.5).fillColor('#888').font(FONT_OBL)
      .text('Confidential — generated by Inexpro CRM. Distribute only to authorised compliance personnel.',
        MARGIN, PAGE_H - 28, { width: CONTENT_W, align: 'center' });
    doc.fontSize(7.5).fillColor('#888').font(FONT_REG)
      .text(`Page ${i - range.start + 1} of ${range.count}`,
        MARGIN, PAGE_H - 16, { width: CONTENT_W, align: 'center' });
  }

  doc.end();

  // ── Audit log ──
  if (res.locals && res.locals.logAudit) {
    res.locals.logAudit({
      action:   'EXPORT',
      module:   'popia_compliance_report',
      recordId: null,
      description: `Weekly POPIA compliance report PDF exported (${missingContacts.length + missingAccounts.length} missing-basis, ${pendingDsrs.length} pending DSARs, ${expiringContacts.length + expiringAccounts.length} retention)`,
    });
  }
});

// ════════════════════════════════════════════════════════════════
// ACCOUNT-LEVEL POPIA endpoints (mirrors /contact/:id behaviour)
// ════════════════════════════════════════════════════════════════

// ── GET /account/:id — POPIA record for an account
router.get('/account/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  const account = db.prepare(`
    SELECT a.*, io.full_name AS information_officer_name
    FROM accounts a
    LEFT JOIN users io ON io.id = a.information_officer_id
    WHERE a.id = ?
  `).get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && account.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const requests = db.prepare(`
    SELECT dsr.*, u.full_name AS handled_by_name
    FROM data_subject_requests dsr
    LEFT JOIN users u ON u.id = dsr.handled_by
    WHERE dsr.account_id = ?
    ORDER BY dsr.request_date DESC, dsr.id DESC
  `).all(id);

  res.json({
    account_id: account.id,
    account_name: account.account_name,
    registration_number: account.registration_number,
    vat_number: account.vat_number,
    business_type: account.business_type,
    data_processing_basis: account.data_processing_basis,
    popia_consent_obtained: account.popia_consent_obtained,
    popia_consent_date: account.popia_consent_date,
    consent_method: account.consent_method,
    consent_scope: account.consent_scope,
    direct_marketing_consent: account.direct_marketing_consent,
    data_source: account.data_source,
    data_categories_held: account.data_categories_held,
    third_party_sharing: account.third_party_sharing,
    third_party_sharing_notes: account.third_party_sharing_notes,
    retention_period_years: account.retention_period_years,
    retention_expiry_date: account.retention_expiry_date,
    information_officer_id: account.information_officer_id,
    information_officer_name: account.information_officer_name,
    privacy_notice_provided: account.privacy_notice_provided,
    privacy_notice_date: account.privacy_notice_date,
    last_activity_date: account.last_activity_date,
    status_badge: computePopiaStatus(account, requests),
    requests,
  });
});

// ── PUT /account/:id — update POPIA fields on an account
router.put('/account/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Account not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Edit-lock gate — only kicks in once a POPIA record has actually been saved.
  const popiaAlreadySaved = !!(existing.data_processing_basis || existing.popia_consent_date ||
                                existing.consent_method       || existing.data_source ||
                                existing.popia_consent_obtained);
  if (popiaAlreadySaved) {
    const _unlock = verifyEditUnlock(req, res, db, { module: 'popia_account', recordId: id });
    if (!_unlock.ok) return res.status(_unlock.status).json({ error: _unlock.error, code: _unlock.code });
  } else {
    if (req.body && '_admin_password' in req.body) delete req.body._admin_password;
  }

  const b = req.body || {};
  if (b.data_processing_basis && !PROCESSING_BASIS_OPTS.includes(b.data_processing_basis)) {
    return res.status(400).json({ error: 'Invalid data_processing_basis' });
  }
  if (b.data_processing_basis === 'Consent' && (!b.popia_consent_date || !b.consent_method)) {
    return res.status(400).json({ error: 'When basis is Consent, consent date and method are required.' });
  }

  const retentionYears = b.retention_period_years !== undefined
    ? parseInt(b.retention_period_years, 10) || 5
    : (existing.retention_period_years || 5);

  const lastAct = b.last_activity_date || existing.last_activity_date || new Date().toISOString().slice(0, 10);
  const expiry  = new Date(lastAct);
  expiry.setFullYear(expiry.getFullYear() + retentionYears);
  const retentionExpiryDate = expiry.toISOString().slice(0, 10);

  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  db.prepare(`
    UPDATE accounts SET
      data_processing_basis      = ?,
      popia_consent_obtained     = ?,
      popia_consent_date         = ?,
      consent_method             = ?,
      consent_scope              = ?,
      direct_marketing_consent   = ?,
      data_source                = ?,
      data_categories_held       = ?,
      third_party_sharing        = ?,
      third_party_sharing_notes  = ?,
      retention_period_years     = ?,
      retention_expiry_date      = ?,
      information_officer_id     = ?,
      privacy_notice_provided    = ?,
      privacy_notice_date        = ?,
      last_activity_date         = ?,
      updated_at                 = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('data_processing_basis') || null,
    b.popia_consent_obtained !== undefined ? (b.popia_consent_obtained ? 1 : 0) : existing.popia_consent_obtained,
    pick('popia_consent_date') || null,
    pick('consent_method') || null,
    b.consent_scope !== undefined ? toJsonArray(b.consent_scope) : existing.consent_scope,
    b.direct_marketing_consent !== undefined ? (b.direct_marketing_consent ? 1 : 0) : existing.direct_marketing_consent,
    pick('data_source') || null,
    b.data_categories_held !== undefined ? toJsonArray(b.data_categories_held) : existing.data_categories_held,
    b.third_party_sharing !== undefined ? (b.third_party_sharing ? 1 : 0) : existing.third_party_sharing,
    pick('third_party_sharing_notes') || null,
    retentionYears,
    retentionExpiryDate,
    b.information_officer_id !== undefined ? (b.information_officer_id || null) : existing.information_officer_id,
    b.privacy_notice_provided !== undefined ? (b.privacy_notice_provided ? 1 : 0) : existing.privacy_notice_provided,
    pick('privacy_notice_date') || null,
    lastAct,
    id
  );

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'popia_account',
    recordId: id,
    oldValue: redactForAudit(existing),
    newValue: redactForAudit(updated),
    description: `POPIA record updated for account ${updated.account_name}`,
  });

  res.json({
    account_id: updated.id,
    status_badge: computePopiaStatus(updated, []),
    record: updated,
  });
});

// ── POST /account/:id/requests — log a DSAR against an account
router.post('/account/:id/requests', (req, res) => {
  const db = getDb();
  const accountId = parseInt(req.params.id, 10);
  const b = req.body || {};

  if (!b.request_type || !b.request_date) {
    return res.status(400).json({ error: 'request_type and request_date are required' });
  }
  if (!['Access','Correction','Erasure','Object','Withdraw Consent'].includes(b.request_type)) {
    return res.status(400).json({ error: 'Invalid request_type' });
  }

  const account = db.prepare('SELECT id, account_name, assigned_broker_id FROM accounts WHERE id = ?').get(accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && account.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const target = new Date(b.request_date);
  target.setDate(target.getDate() + 30);
  const initialSuspended = b.request_type === 'Object' ? 1 : (b.processing_suspended ? 1 : 0);
  const consentWithdrawnDate = b.request_type === 'Withdraw Consent'
    ? (b.consent_withdrawn_date || b.request_date)
    : (b.consent_withdrawn_date || null);

  const result = db.prepare(`
    INSERT INTO data_subject_requests (
      account_id, request_type, request_date, request_details,
      status, target_completion_date, handled_by, created_by,
      delivery_date, export_format,
      corrected_fields, corrected_by_id, client_notified_date,
      legal_basis_assessment, erasure_action,
      processing_suspended, suspension_lifted_date,
      consent_withdrawn_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    accountId,
    b.request_type,
    b.request_date,
    b.request_details || null,
    b.status || 'Open',
    target.toISOString().slice(0, 10),
    b.handled_by || req.session.userId,
    req.session.userId,
    b.delivery_date || null,
    b.export_format || null,
    toJsonArray(b.corrected_fields),
    b.corrected_by_id || null,
    b.client_notified_date || null,
    b.legal_basis_assessment || null,
    b.erasure_action || null,
    initialSuspended,
    b.suspension_lifted_date || null,
    consentWithdrawnDate
  );

  if (b.request_type === 'Withdraw Consent') {
    db.prepare(`
      UPDATE accounts SET
        direct_marketing_consent = 0,
        popia_consent_obtained   = 0,
        updated_at               = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(accountId);
  }

  const created = db.prepare('SELECT * FROM data_subject_requests WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:   'CREATE',
    module:   'popia_request',
    recordId: result.lastInsertRowid,
    newValue: redactForAudit(created),
    description: `POPIA ${b.request_type} request logged for account ${account.account_name}` +
                 (b.request_type === 'Withdraw Consent' ? ' (consent flags cleared)' : '') +
                 (b.request_type === 'Object' ? ' (processing suspended)' : ''),
  });

  res.status(201).json(created);
});

module.exports = router;
module.exports.computePopiaStatus = computePopiaStatus;
