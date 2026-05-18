'use strict';

// Authenticated API for creating and inspecting e-signature requests.
// Public counterparts (the page the client visits + the submit endpoint)
// live in routes/public-signing.js so they bypass requireAuth.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth, getBrokerId } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { getTemplate, listTemplates } = require('../lib/signable-templates');

router.use(requireAuth);

// GET /api/signature-requests/templates — discover available signable templates
router.get('/templates', (req, res) => {
  res.json(listTemplates());
});

// POST /api/signature-requests — create a pending request.
// Body: { template_key, contact_id?, account_id?, policy_id?,
//         recipient_name?, recipient_email? }
// At least one of contact_id / account_id must be supplied.
// Returns: { id, token, public_url, ... }
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const body = req.body || {};
    const tpl = getTemplate(body.template_key);
    if (!tpl) return res.status(400).json({ error: `Unknown signable template: ${body.template_key}` });

    const contactId = body.contact_id ? parseInt(body.contact_id, 10) : null;
    const accountId = body.account_id ? parseInt(body.account_id, 10) : null;
    const policyId  = body.policy_id  ? parseInt(body.policy_id,  10) : null;
    if (!contactId && !accountId) {
      return res.status(400).json({ error: 'contact_id or account_id is required' });
    }

    // Broker isolation — if the broker can't see the destination, they can't
    // request a signature against it either.
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      const ok = (() => {
        if (contactId) {
          const c = db.prepare('SELECT assigned_broker_id FROM contacts WHERE id = ?').get(contactId);
          if (!c || c.assigned_broker_id !== scopedBrokerId) return false;
        }
        if (accountId) {
          const a = db.prepare('SELECT assigned_broker_id FROM accounts WHERE id = ?').get(accountId);
          if (!a || a.assigned_broker_id !== scopedBrokerId) return false;
        }
        return true;
      })();
      if (!ok) return res.status(403).json({ error: 'Access denied to that destination' });
    }

    // 32-byte random token, URL-safe.
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const result = db.prepare(`
      INSERT INTO signature_requests
        (token, template_key, status, contact_id, account_id, policy_id,
         created_by, expires_at, recipient_name, recipient_email)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token, tpl.key,
      contactId, accountId, policyId,
      req.session.userId,
      expiresAt,
      body.recipient_name || null,
      body.recipient_email || null
    );

    const id = result.lastInsertRowid;
    const publicUrl = `${req.protocol}://${req.get('host')}/sign/${token}`;

    res.locals.logAudit({
      action: 'CREATE',
      module: 'signature_requests',
      recordId: id,
      description: `Signature request created (${tpl.label}) for ${contactId ? 'contact ' + contactId : 'account ' + accountId}`,
    });

    res.status(201).json({
      id, token, public_url: publicUrl,
      template_key: tpl.key, template_label: tpl.label,
      status: 'pending', expires_at: expiresAt,
    });
  } catch (err) {
    console.error('POST /signature-requests error:', err);
    res.status(500).json({ error: 'Failed to create signature request' });
  }
});

// GET /api/signature-requests — list (filterable by contact / account / status)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { contact_id, account_id, policy_id, status, template_key } = req.query;

    const conds = [];
    const params = [];
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      // Brokers only see requests on records they own.
      conds.push(`(
        (sr.contact_id IS NOT NULL AND EXISTS(SELECT 1 FROM contacts c WHERE c.id = sr.contact_id AND c.assigned_broker_id = ?))
        OR
        (sr.account_id IS NOT NULL AND EXISTS(SELECT 1 FROM accounts a WHERE a.id = sr.account_id AND a.assigned_broker_id = ?))
      )`);
      params.push(scopedBrokerId, scopedBrokerId);
    }
    if (contact_id)   { conds.push('sr.contact_id = ?');   params.push(parseInt(contact_id, 10)); }
    if (account_id)   { conds.push('sr.account_id = ?');   params.push(parseInt(account_id, 10)); }
    if (policy_id)    { conds.push('sr.policy_id = ?');    params.push(parseInt(policy_id,  10)); }
    if (status)       { conds.push('sr.status = ?');       params.push(status); }
    if (template_key) { conds.push('sr.template_key = ?'); params.push(template_key); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    // LEFT JOIN documents so callers can render a file link / size without a
    // second round-trip. document_id is set once the request is signed.
    const rows = db.prepare(`
      SELECT sr.*,
             u.full_name AS created_by_name,
             (c.first_name || ' ' || c.last_name) AS contact_name,
             a.account_name,
             d.original_name AS document_original_name,
             d.file_size     AS document_file_size,
             d.uploaded_at   AS document_uploaded_at
      FROM signature_requests sr
      LEFT JOIN users     u ON u.id = sr.created_by
      LEFT JOIN contacts  c ON c.id = sr.contact_id
      LEFT JOIN accounts  a ON a.id = sr.account_id
      LEFT JOIN documents d ON d.id = sr.document_id
      ${where}
      ORDER BY sr.created_at DESC
      LIMIT 200
    `).all(...params);

    res.json({ data: rows });
  } catch (err) {
    console.error('GET /signature-requests error:', err);
    res.status(500).json({ error: 'Failed to load signature requests' });
  }
});

module.exports = router;
