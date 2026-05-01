'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { verifyEditUnlock } = require('../lib/edit-lock');
const { readDecryptedFile, writeEncryptedFile } = require('../lib/file-encryption');

// ---------------------------------------------------------------------------
// QUOTES (per-policy uploads + approval) — multer config
// ---------------------------------------------------------------------------
const QUOTE_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
  'text/plain',
]);
const quoteUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (QUOTE_ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid quote file type. Allowed: pdf, jpg, png, docx, xlsx, doc, xls, txt'));
  },
});
function quoteUploadRoot() {
  return process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(__dirname, '../../uploads');
}
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function quoteExtFromMime(m) {
  return ({
    'application/pdf': '.pdf',
    'image/jpeg':      '.jpg',
    'image/png':       '.png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       '.xlsx',
    'application/msword':       '.doc',
    'application/vnd.ms-excel': '.xls',
    'text/plain':               '.txt',
  })[m] || '';
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

// Apply requireAuth to all policy routes
router.use(requireAuth);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

/**
 * Validate that the contact/account selected for a policy has FICA verified
 * and (for contacts) POPIA consent obtained.
 *
 * Returns { ok: true } or { ok: false, status, error } where status is the
 * HTTP status to return.
 */
function validatePolicyCompliance(db, { contact_id, account_id }) {
  const { computePopiaStatus } = require('./popia');
  const { computeFicaStatus, computeFicaStatusAccount } = require('./fica');
  const { isSupplierContact } = require('../lib/supplier');

  if (contact_id) {
    const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
    if (!c) return { ok: false, status: 400, error: 'Selected contact does not exist.' };

    // Suppliers (panel-beaters, assessors, etc.) sit outside POPIA/FICA — skip.
    if (isSupplierContact(c)) return { ok: true };

    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `contact #${c.id}`;
    const erasures = db.prepare(
      "SELECT id FROM data_subject_requests WHERE contact_id = ? AND request_type = 'Erasure' AND status != 'Completed'"
    ).all(c.id).map(() => ({ request_type: 'Erasure', status: 'Open' }));
    const popia = computePopiaStatus(c, erasures);
    const fica  = computeFicaStatus(c);
    const reasons = [];
    if (popia !== 'Green')   reasons.push(`POPIA status is ${popia} — must be Compliant`);
    if (fica  !== 'Verified') reasons.push(`FICA status is ${fica} — must be Verified`);
    if (reasons.length) {
      return {
        ok: false, status: 422, code: 'COMPLIANCE_GATE',
        error: `Cannot add a policy for ${name}: ${reasons.join('; ')}.`,
        reasons,
      };
    }
  }

  if (account_id) {
    const a = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account_id);
    if (!a) return { ok: false, status: 400, error: 'Selected account does not exist.' };

    const name = a.account_name || `account #${a.id}`;
    const erasures = db.prepare(
      "SELECT id FROM data_subject_requests WHERE account_id = ? AND request_type = 'Erasure' AND status != 'Completed'"
    ).all(a.id).map(() => ({ request_type: 'Erasure', status: 'Open' }));
    const popia = computePopiaStatus(a, erasures);
    const fica  = computeFicaStatusAccount(a);
    const reasons = [];
    if (popia !== 'Green')   reasons.push(`POPIA status is ${popia} — must be Compliant`);
    if (fica  !== 'Verified') reasons.push(`FICA status is ${fica} — must be Verified`);
    if (reasons.length) {
      return {
        ok: false, status: 422, code: 'COMPLIANCE_GATE',
        error: `Cannot add a policy for ${name}: ${reasons.join('; ')}.`,
        reasons,
      };
    }
  }

  return { ok: true };
}

// Override path — accepts an admin password OR a 6-digit OTP and audits the
// successful or failed attempt. Mirrors edit-lock.js so brokers can be handed
// a one-time PIN by an admin to push past a compliance failure on a per-policy
// basis. The supplied secret is stripped from req.body before any DB write.
function tryComplianceOverride(req, res, db, recordHint) {
  const supplied = req.body && req.body._compliance_override;
  if (req.body && '_compliance_override' in req.body) {
    delete req.body._compliance_override;
  }

  const { _isOtpFormat, _redeemOtp, _bypassEnabled } = require('../lib/edit-lock');

  // Global "disable password requirements" toggle (Security tab) — when on,
  // the same flag that disables the edit-lock gate also waives the POPIA/FICA
  // compliance override prompt. Audited so the bypass is traceable.
  if (_bypassEnabled(db)) {
    if (res.locals && res.locals.logAudit) {
      const sessionUserId = req.session && req.session.userId;
      const sessionUser = sessionUserId
        ? db.prepare('SELECT id, full_name, username FROM users WHERE id = ?').get(sessionUserId)
        : null;
      const sessionLabel = sessionUser
        ? (sessionUser.full_name || sessionUser.username || `user ${sessionUser.id}`)
        : 'unknown user';
      res.locals.logAudit({
        action: 'COMPLIANCE_OVERRIDE', module: 'policies',
        description: `${sessionLabel} bypassed POPIA/FICA gate for ${recordHint} — Security override (disable-password-requirements) is active`,
      });
    }
    return { ok: true, bypassed: true };
  }

  if (!supplied) return { ok: false };

  const bcrypt = require('bcryptjs');
  const sessionUserId = req.session && req.session.userId;
  const sessionUser = sessionUserId
    ? db.prepare('SELECT id, full_name, username FROM users WHERE id = ?').get(sessionUserId)
    : null;
  const sessionLabel = sessionUser ? (sessionUser.full_name || sessionUser.username || `user ${sessionUser.id}`) : 'unknown user';

  if (_isOtpFormat(supplied)) {
    const redeemed = _redeemOtp(db, supplied, sessionUserId);
    if (redeemed) {
      const issuerLabel = redeemed.issuer
        ? (redeemed.issuer.full_name || redeemed.issuer.username || `user ${redeemed.issuer.id}`)
        : 'unknown admin';
      if (res.locals && res.locals.logAudit) {
        res.locals.logAudit({
          action: 'COMPLIANCE_OVERRIDE', module: 'policies',
          description: `${sessionLabel} bypassed POPIA/FICA gate for ${recordHint} using OTP #${redeemed.otp.id} issued by ${issuerLabel}`,
        });
      }
      return { ok: true };
    }
  }

  const admins = db.prepare(
    `SELECT id, password_hash, full_name, username FROM users
     WHERE active = 1 AND role IN ('admin', 'admin_only')`
  ).all();
  for (const a of admins) {
    if (a.password_hash && bcrypt.compareSync(String(supplied), a.password_hash)) {
      const adminLabel = a.full_name || a.username || `user ${a.id}`;
      if (res.locals && res.locals.logAudit) {
        res.locals.logAudit({
          action: 'COMPLIANCE_OVERRIDE', module: 'policies',
          description: `${sessionLabel} bypassed POPIA/FICA gate for ${recordHint} — authorised by admin ${adminLabel}`,
        });
      }
      return { ok: true };
    }
  }

  if (res.locals && res.locals.logAudit) {
    res.locals.logAudit({
      action: 'COMPLIANCE_OVERRIDE_DENIED', module: 'policies',
      description: `${sessionLabel} entered an incorrect admin password / OTP attempting to bypass POPIA/FICA for ${recordHint}`,
    });
  }
  return { ok: false, denied: true };
}

/** Mask sensitive fields before writing to audit log */
function maskForAudit(obj) {
  if (!obj) return obj;
  const copy = { ...obj };
  if (copy.account_number_enc) {
    copy.account_number_enc = '••••' + String(copy.account_number_enc).slice(-4);
  }
  return copy;
}

function parsePage(query) {
  const page = parseInt(query.page, 10);
  return page > 0 ? page : 1;
}

/**
 * When a policy is cancelled, for every asset linked to it:
 *   1. Insert a snapshot into policy_asset_history (preserves the record of
 *      which assets were on this policy at the time of cancellation).
 *   2. Zero all monetary fields on the asset (flat amounts + percentages +
 *      amounts inside JSON blobs: vehicle_extras, excesses, additional_covers).
 *   3. Set asset_status='Inactive' and unlink (policy_id=NULL) so the asset
 *      is free to be attached to a new policy while its identifying data
 *      (make/model/VIN/address/etc.) is preserved.
 */
function cascadeCancelAssets(db, policyId, userId, res) {
  const assets = db.prepare('SELECT * FROM assets WHERE policy_id = ?').all(policyId);
  if (!assets.length) return;

  const zeroJsonAmounts = (jsonStr, amountKeys) => {
    try {
      const arr = JSON.parse(jsonStr || '[]');
      if (!Array.isArray(arr)) return jsonStr;
      const zeroed = arr.map(item => {
        const next = { ...item };
        for (const k of amountKeys) if (k in next) next[k] = 0;
        return next;
      });
      return JSON.stringify(zeroed);
    } catch (_) {
      return jsonStr;
    }
  };

  const insertHistory = db.prepare(`
    INSERT INTO policy_asset_history (
      policy_id, asset_id, asset_name, asset_type, asset_section,
      make, model, year, registration_number, vin_number, serial_number,
      asset_value, premium, sasria, currency, cancelled_by
    ) VALUES (
      @policy_id, @asset_id, @asset_name, @asset_type, @asset_section,
      @make, @model, @year, @registration_number, @vin_number, @serial_number,
      @asset_value, @premium, @sasria, @currency, @cancelled_by
    )
  `);

  const update = db.prepare(`
    UPDATE assets SET
      asset_status       = 'Inactive',
      policy_id          = NULL,
      policy_section_id  = NULL,
      asset_section      = NULL,
      premium            = 0,
      sasria             = 0,
      excess             = 0,
      minimum_excess     = 0,
      excess_pct_claim   = 0,
      excess_pct_insured = 0,
      asset_value        = 0,
      sum_insured        = 0,
      vehicle_extras     = @vehicle_extras,
      excesses           = @excesses,
      additional_covers  = @additional_covers,
      updated_at         = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  const txn = db.transaction(() => {
    for (const a of assets) {
      insertHistory.run({
        policy_id:           policyId,
        asset_id:            a.id,
        asset_name:          a.asset_name || null,
        asset_type:          a.asset_type || null,
        asset_section:       a.asset_section || null,
        make:                a.make || null,
        model:               a.model || null,
        year:                a.year != null ? a.year : null,
        registration_number: a.registration_number || null,
        vin_number:          a.vin_number || null,
        serial_number:       a.serial_number || null,
        asset_value:         a.asset_value != null ? a.asset_value : null,
        premium:             a.premium != null ? a.premium : null,
        sasria:              a.sasria != null ? a.sasria : null,
        currency:            a.currency || null,
        cancelled_by:        userId || null,
      });
      update.run({
        id: a.id,
        vehicle_extras:    zeroJsonAmounts(a.vehicle_extras,    ['amount', 'premium']),
        excesses:          zeroJsonAmounts(a.excesses,          ['amount', 'premium']),
        additional_covers: zeroJsonAmounts(a.additional_covers, ['cover_amount', 'premium']),
      });
    }
  });
  txn();

  // Audit each asset change
  if (res && res.locals && typeof res.locals.logAudit === 'function') {
    for (const a of assets) {
      const updated = db.prepare('SELECT * FROM assets WHERE id = ?').get(a.id);
      res.locals.logAudit({
        action: 'UPDATE',
        module: 'assets',
        recordId: a.id,
        oldValue: a,
        newValue: updated,
        description: `Auto-deactivated and unlinked by policy ${policyId} cancellation (snapshot saved to history)`,
      });
    }
  }
}

/**
 * Compute the total premium for a policy by aggregating (from parts):
 *   sum(vehicle_extras[].premium) + sum(additional_covers[].premium) + sum(excesses[].premium)
 *   + sum(asset.sasria)
 * Computed from parts rather than asset.premium so the value is correct
 * regardless of whether the stored premium was auto-calculated at save time.
 * Inactive assets contribute 0.
 */
function computePolicyTotalPremium(db, policyId) {
  const assets = db.prepare(
    'SELECT sasria, sum_insured_premium, vehicle_extras, additional_covers, excesses, asset_status FROM assets WHERE policy_id = ?'
  ).all(policyId);
  let total = 0;
  for (const a of assets) {
    if (a.asset_status === 'Inactive') continue;
    total += parseFloat(a.sasria)               || 0;
    total += parseFloat(a.sum_insured_premium)  || 0;
    try {
      const extras = JSON.parse(a.vehicle_extras || '[]');
      if (Array.isArray(extras)) {
        for (const ex of extras) total += parseFloat(ex.premium) || 0;
      }
    } catch (_) {}
    try {
      const addl = JSON.parse(a.additional_covers || '[]');
      if (Array.isArray(addl)) {
        for (const ac of addl) total += parseFloat(ac.premium) || 0;
      }
    } catch (_) {}
    try {
      const excs = JSON.parse(a.excesses || '[]');
      if (Array.isArray(excs)) {
        for (const ex of excs) total += parseFloat(ex.premium) || 0;
      }
    } catch (_) {}
  }
  return total;
}

// ---------------------------------------------------------------------------
// GET / — list all with optional filters, paginated
// ---------------------------------------------------------------------------
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, status, broker_id, type, renewal_from, renewal_to, contact_id, account_id, engagement_id } = req.query;
    const page = parsePage(req.query);
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [];
    const params = [];

    // Broker isolation: brokers can only see their own policies
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      conditions.push('p.assigned_broker_id = ?');
      params.push(scopedBrokerId);
    }

    if (search) {
      conditions.push(`(
        p.policy_name LIKE ?
        OR p.policy_number LIKE ?
        OR p.insurer LIKE ?
        OR (c.first_name || ' ' || c.last_name) LIKE ?
        OR a.account_name LIKE ?
        OR b.full_name LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }

    if (status) {
      conditions.push('p.policy_status = ?');
      params.push(status);
    }

    if (broker_id && !scopedBrokerId) {
      conditions.push('p.assigned_broker_id = ?');
      params.push(broker_id);
    }

    if (type) {
      conditions.push('p.policy_type = ?');
      params.push(type);
    }

    if (renewal_from) {
      conditions.push('p.renewal_date >= ?');
      params.push(renewal_from);
    }

    if (renewal_to) {
      conditions.push('p.renewal_date <= ?');
      params.push(renewal_to);
    }

    if (contact_id) {
      conditions.push('p.contact_id = ?');
      params.push(contact_id);
    }

    if (account_id) {
      conditions.push('p.account_id = ?');
      params.push(account_id);
    }

    if (engagement_id) {
      conditions.push('p.engagement_id = ?');
      params.push(engagement_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM policies p
      LEFT JOIN contacts c ON p.contact_id = c.id
      LEFT JOIN accounts a ON p.account_id = a.id
      LEFT JOIN users b ON p.assigned_broker_id = b.id
    `;

    const countRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery} ${where}`).get(...params);
    const total = countRow.total;

    const resolved = resolveSort('policies', req.query.sort, req.query.dir);
    const orderBy = resolved
      ? `ORDER BY ${resolved.sql} ${resolved.dir}, p.id DESC`
      : `ORDER BY p.updated_at DESC`;

    const rows = db.prepare(`
      SELECT
        p.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        b.full_name AS broker_name
      ${baseQuery}
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE, offset);

    for (const row of rows) {
      row.total_premium = computePolicyTotalPremium(db, row.id);
    }

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id — single record with all joins
// ---------------------------------------------------------------------------
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();

    const row = db.prepare(`
      SELECT
        p.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        (ci.first_name || ' ' || ci.last_name) AS co_insured_name,
        a.account_name,
        b.full_name AS broker_name,
        adm.full_name AS admin_name,
        creator.full_name AS created_by_name,
        ce.engagement_name
      FROM policies p
      LEFT JOIN contacts c ON p.contact_id = c.id
      LEFT JOIN contacts ci ON p.co_insured_contact_id = ci.id
      LEFT JOIN accounts a ON p.account_id = a.id
      LEFT JOIN users b ON p.assigned_broker_id = b.id
      LEFT JOIN users adm ON p.assigned_admin_id = adm.id
      LEFT JOIN users creator ON p.created_by = creator.id
      LEFT JOIN client_engagements ce ON p.engagement_id = ce.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && row.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Resolve other_contact_ids → array of { id, name }
    let otherContacts = [];
    try {
      const ids = JSON.parse(row.other_contact_ids || '[]');
      if (Array.isArray(ids) && ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        otherContacts = db.prepare(
          `SELECT id, (first_name || ' ' || last_name) AS name FROM contacts WHERE id IN (${placeholders})`
        ).all(...ids);
      }
    } catch (_) {}
    row.other_contacts = otherContacts;

    row.total_premium = computePolicyTotalPremium(db, row.id);

    const cl = db.prepare(
      'SELECT COUNT(*) AS n FROM commission_log WHERE policy_id = ?'
    ).get(row.id);
    row.commission_entry_count = cl.n;
    row.commission_entry_missing = cl.n === 0
      && row.policy_status !== 'Cancelled'
      && row.policy_status !== 'Lapsed'
      && row.policy_status !== 'Expired';

    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / — create
// ---------------------------------------------------------------------------
router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const body = req.body;

    // Required field validation
    const missing = [];
    if (!body.policy_name) missing.push('policy_name');
    if (!body.insurer) missing.push('insurer');
    if (!body.assigned_broker_id) missing.push('assigned_broker_id');
    if (!body.broker_code_id) missing.push('broker_code_id');
    if (!body.policy_number) missing.push('policy_number');
    if (!body.product_category) missing.push('product_category');
    if (!body.inception_date) missing.push('inception_date');
    if (!body.policy_status) missing.push('policy_status');
    if (missing.length) {
      return res.status(400).json({ error: 'Missing required fields', fields: missing });
    }

    // Resolve broker code — must belong to the assigned broker, captured as
    // a snapshot so reprinted schedules survive code edits/deletions.
    const brokerCodeRow = db.prepare(
      'SELECT id, user_id, code, description FROM user_broker_codes WHERE id = ?'
    ).get(parseInt(body.broker_code_id, 10));
    if (!brokerCodeRow) {
      return res.status(400).json({ error: 'Selected broker code does not exist' });
    }
    if (parseInt(brokerCodeRow.user_id, 10) !== parseInt(body.assigned_broker_id, 10)) {
      return res.status(400).json({ error: 'Selected broker code does not belong to the assigned broker' });
    }

    // At least one of contact_id or account_id
    if (!body.contact_id && !body.account_id) {
      return res.status(400).json({
        error: 'At least one of contact_id or account_id must be provided',
      });
    }

    // A new policy cannot be created in Active status — at least one approved
    // quote OR existing schedule must be on file first.
    if (body.policy_status === 'Active') {
      return res.status(422).json({
        error: 'A policy cannot be created in Active status. Save it first (e.g. as Pending), upload either a Quote or an Existing Schedule and approve it, then change the status to Active.'
      });
    }

    // Compliance gate: POPIA Compliant + FICA Verified on the linked party.
    // Suppliers exempt. An admin password / OTP in `_compliance_override`
    // can authorise a one-off bypass — audited on success and on failure.
    const compliance = validatePolicyCompliance(db, {
      contact_id: body.contact_id,
      account_id: body.account_id,
    });
    if (!compliance.ok) {
      const recordHint = body.contact_id ? `contact #${body.contact_id}` : `account #${body.account_id}`;
      const override = tryComplianceOverride(req, res, db, recordHint);
      if (!override.ok) {
        return res.status(compliance.status).json({
          error: compliance.error,
          code: compliance.code || 'COMPLIANCE_GATE',
          reasons: compliance.reasons,
          override_denied: !!override.denied,
        });
      }
    } else {
      // Strip any stray override secret even when not needed.
      if (req.body && '_compliance_override' in req.body) delete req.body._compliance_override;
    }

    const stmt = db.prepare(`
      INSERT INTO policies (
        policy_name, contact_id, account_id, engagement_id, advice_record_id,
        insurer, assigned_broker_id, assigned_admin_id,
        broker_code_id, broker_code_snapshot, broker_code_description_snapshot,
        policy_number, product_category, policy_type,
        cover_description, premium, inception_date, renewal_date,
        policy_status, disclosure_completed,
        last_review_date, next_review_date,
        amendment_count, claims_count,
        cancellation_date, cancellation_reason,
        replacement_policy_id, notes,
        payment_method, premium_frequency, debit_order_date,
        bank_name, branch_code, account_number_enc, account_type,
        account_holder_name, mandate_status, mandate_auth_date,
        debit_order_reference, co_insured, co_insured_id_number,
        co_insured_contact_id, other_contact_ids,
        currency,
        created_by, created_at, updated_at
      ) VALUES (
        @policy_name, @contact_id, @account_id, @engagement_id, @advice_record_id,
        @insurer, @assigned_broker_id, @assigned_admin_id,
        @broker_code_id, @broker_code_snapshot, @broker_code_description_snapshot,
        @policy_number, @product_category, @policy_type,
        @cover_description, @premium, @inception_date, @renewal_date,
        @policy_status, @disclosure_completed,
        @last_review_date, @next_review_date,
        @amendment_count, @claims_count,
        @cancellation_date, @cancellation_reason,
        @replacement_policy_id, @notes,
        @payment_method, @premium_frequency, @debit_order_date,
        @bank_name, @branch_code, @account_number_enc, @account_type,
        @account_holder_name, @mandate_status, @mandate_auth_date,
        @debit_order_reference, @co_insured, @co_insured_id_number,
        @co_insured_contact_id, @other_contact_ids,
        @currency,
        @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run({
      policy_name: body.policy_name,
      contact_id: body.contact_id ?? null,
      account_id: body.account_id ?? null,
      engagement_id: body.engagement_id ?? null,
      advice_record_id: body.advice_record_id ?? null,
      insurer: body.insurer,
      assigned_broker_id: body.assigned_broker_id,
      assigned_admin_id: body.assigned_admin_id ?? null,
      broker_code_id: brokerCodeRow.id,
      broker_code_snapshot: brokerCodeRow.code,
      broker_code_description_snapshot: brokerCodeRow.description,
      policy_number: body.policy_number,
      product_category: body.product_category,
      policy_type: body.policy_type ?? null,
      cover_description: body.cover_description ?? null,
      premium: body.premium ?? null,
      inception_date: body.inception_date,
      renewal_date: body.renewal_date ?? null,
      policy_status: body.policy_status,
      disclosure_completed: body.disclosure_completed ? 1 : 0,
      last_review_date: body.last_review_date ?? null,
      next_review_date: body.next_review_date ?? null,
      amendment_count: body.amendment_count ?? 0,
      claims_count: body.claims_count ?? 0,
      cancellation_date: body.cancellation_date ?? null,
      cancellation_reason: body.cancellation_reason ?? null,
      replacement_policy_id: body.replacement_policy_id ?? null,
      notes: body.notes ?? null,
      payment_method: body.payment_method ?? null,
      premium_frequency: body.premium_frequency ?? null,
      debit_order_date: body.debit_order_date ?? null,
      bank_name: body.bank_name ?? null,
      branch_code: body.branch_code ?? null,
      account_number_enc: body.account_number_enc ?? null,
      account_type: body.account_type ?? null,
      account_holder_name: body.account_holder_name ?? null,
      mandate_status: body.mandate_status ?? null,
      mandate_auth_date: body.mandate_auth_date ?? null,
      debit_order_reference: body.debit_order_reference ?? null,
      co_insured: body.co_insured ?? null,
      co_insured_id_number: body.co_insured_id_number ?? null,
      co_insured_contact_id: body.co_insured_contact_id ? parseInt(body.co_insured_contact_id, 10) : null,
      other_contact_ids: body.other_contact_ids || null,
      currency: body.currency || 'ZAR',
      created_by: req.session.userId,
    });

    const created = db.prepare('SELECT * FROM policies WHERE id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({ action: 'CREATE', module: 'policies', recordId: result.lastInsertRowid, newValue: maskForAudit(created), description: 'Policy created' });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update
// ---------------------------------------------------------------------------
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const existing = db.prepare('SELECT * FROM policies WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Edit-lock gate — every saved policy requires an admin password to edit.
    const unlock = verifyEditUnlock(req, res, db, { module: 'policies', recordId: id });
    if (!unlock.ok) return res.status(unlock.status).json({ error: unlock.error, code: unlock.code });

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const body = req.body;

    // A policy can only become Active once at least one approved Quote OR an
    // approved Existing Schedule is on file. Either path is sufficient.
    if (body.policy_status === 'Active' && existing.policy_status !== 'Active') {
      const approved = db.prepare(
        'SELECT COUNT(*) AS n FROM policy_quotes WHERE policy_id = ? AND approved_at IS NOT NULL'
      ).get(id);
      if (!approved || !approved.n) {
        return res.status(422).json({
          error: 'This policy cannot be set to Active — upload either a Quote or an Existing Schedule in the Quotes tab and mark it approved before activating the policy.'
        });
      }
    }

    // Re-verify compliance if contact/account is being changed.
    const newContactId = body.contact_id !== undefined ? (body.contact_id ?? null) : existing.contact_id;
    const newAccountId = body.account_id !== undefined ? (body.account_id ?? null) : existing.account_id;
    const contactChanged = body.contact_id !== undefined && body.contact_id !== existing.contact_id;
    const accountChanged = body.account_id !== undefined && body.account_id !== existing.account_id;
    if (contactChanged || accountChanged) {
      const compliance = validatePolicyCompliance(db, {
        contact_id: newContactId,
        account_id: newAccountId,
      });
      if (!compliance.ok) {
        const recordHint = newContactId ? `contact #${newContactId}` : `account #${newAccountId}`;
        const override = tryComplianceOverride(req, res, db, recordHint);
        if (!override.ok) {
          return res.status(compliance.status).json({
            error: compliance.error,
            code: compliance.code || 'COMPLIANCE_GATE',
            reasons: compliance.reasons,
            override_denied: !!override.denied,
          });
        }
      } else {
        if (req.body && '_compliance_override' in req.body) delete req.body._compliance_override;
      }
    } else {
      if (req.body && '_compliance_override' in req.body) delete req.body._compliance_override;
    }

    // Resolve broker code if changing — must belong to the (possibly updated) broker.
    const newBrokerId = body.assigned_broker_id ?? existing.assigned_broker_id;
    let brokerCodeId = existing.broker_code_id;
    let brokerCodeSnap = existing.broker_code_snapshot;
    let brokerCodeDescSnap = existing.broker_code_description_snapshot;
    if (body.broker_code_id !== undefined) {
      if (!body.broker_code_id) {
        return res.status(400).json({ error: 'broker_code_id is required' });
      }
      const row = db.prepare(
        'SELECT id, user_id, code, description FROM user_broker_codes WHERE id = ?'
      ).get(parseInt(body.broker_code_id, 10));
      if (!row) {
        return res.status(400).json({ error: 'Selected broker code does not exist' });
      }
      if (parseInt(row.user_id, 10) !== parseInt(newBrokerId, 10)) {
        return res.status(400).json({ error: 'Selected broker code does not belong to the assigned broker' });
      }
      brokerCodeId = row.id;
      brokerCodeSnap = row.code;
      brokerCodeDescSnap = row.description;
    } else if (body.assigned_broker_id !== undefined && body.assigned_broker_id !== existing.assigned_broker_id) {
      return res.status(400).json({ error: 'broker_code_id must be provided when changing the assigned broker' });
    }

    const updated = {
      policy_name: body.policy_name ?? existing.policy_name,
      contact_id: newContactId,
      account_id: newAccountId,
      engagement_id: body.engagement_id !== undefined ? (body.engagement_id ?? null) : existing.engagement_id,
      advice_record_id: body.advice_record_id !== undefined ? (body.advice_record_id ?? null) : existing.advice_record_id,
      insurer: body.insurer ?? existing.insurer,
      assigned_broker_id: newBrokerId,
      assigned_admin_id: body.assigned_admin_id !== undefined ? (body.assigned_admin_id ?? null) : existing.assigned_admin_id,
      broker_code_id: brokerCodeId,
      broker_code_snapshot: brokerCodeSnap,
      broker_code_description_snapshot: brokerCodeDescSnap,
      policy_number: body.policy_number ?? existing.policy_number,
      product_category: body.product_category ?? existing.product_category,
      policy_type: body.policy_type !== undefined ? body.policy_type : existing.policy_type,
      cover_description: body.cover_description !== undefined ? body.cover_description : existing.cover_description,
      premium: body.premium !== undefined ? body.premium : existing.premium,
      inception_date: body.inception_date ?? existing.inception_date,
      renewal_date: body.renewal_date !== undefined ? body.renewal_date : existing.renewal_date,
      policy_status: body.policy_status ?? existing.policy_status,
      disclosure_completed: body.disclosure_completed !== undefined ? (body.disclosure_completed ? 1 : 0) : existing.disclosure_completed,
      last_review_date: body.last_review_date !== undefined ? body.last_review_date : existing.last_review_date,
      next_review_date: body.next_review_date !== undefined ? body.next_review_date : existing.next_review_date,
      amendment_count: body.amendment_count !== undefined ? body.amendment_count : existing.amendment_count,
      claims_count: body.claims_count !== undefined ? body.claims_count : existing.claims_count,
      cancellation_date: body.cancellation_date !== undefined ? body.cancellation_date : existing.cancellation_date,
      cancellation_reason: body.cancellation_reason !== undefined ? body.cancellation_reason : existing.cancellation_reason,
      replacement_policy_id: body.replacement_policy_id !== undefined ? (body.replacement_policy_id ?? null) : existing.replacement_policy_id,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      payment_method: body.payment_method !== undefined ? body.payment_method : existing.payment_method,
      premium_frequency: body.premium_frequency !== undefined ? body.premium_frequency : existing.premium_frequency,
      debit_order_date: body.debit_order_date !== undefined ? body.debit_order_date : existing.debit_order_date,
      bank_name: body.bank_name !== undefined ? body.bank_name : existing.bank_name,
      branch_code: body.branch_code !== undefined ? body.branch_code : existing.branch_code,
      account_number_enc: body.account_number_enc !== undefined ? body.account_number_enc : existing.account_number_enc,
      account_type: body.account_type !== undefined ? body.account_type : existing.account_type,
      account_holder_name: body.account_holder_name !== undefined ? body.account_holder_name : existing.account_holder_name,
      mandate_status: body.mandate_status !== undefined ? body.mandate_status : existing.mandate_status,
      mandate_auth_date: body.mandate_auth_date !== undefined ? body.mandate_auth_date : existing.mandate_auth_date,
      debit_order_reference: body.debit_order_reference !== undefined ? body.debit_order_reference : existing.debit_order_reference,
      co_insured: body.co_insured !== undefined ? body.co_insured : existing.co_insured,
      co_insured_id_number: body.co_insured_id_number !== undefined ? body.co_insured_id_number : existing.co_insured_id_number,
      co_insured_contact_id: body.co_insured_contact_id !== undefined ? (body.co_insured_contact_id ? parseInt(body.co_insured_contact_id, 10) : null) : existing.co_insured_contact_id,
      other_contact_ids: body.other_contact_ids !== undefined ? (body.other_contact_ids || null) : existing.other_contact_ids,
      currency: body.currency !== undefined ? (body.currency || 'ZAR') : (existing.currency || 'ZAR'),
      id,
    };

    db.prepare(`
      UPDATE policies SET
        policy_name = @policy_name,
        contact_id = @contact_id,
        account_id = @account_id,
        engagement_id = @engagement_id,
        advice_record_id = @advice_record_id,
        insurer = @insurer,
        assigned_broker_id = @assigned_broker_id,
        assigned_admin_id = @assigned_admin_id,
        broker_code_id = @broker_code_id,
        broker_code_snapshot = @broker_code_snapshot,
        broker_code_description_snapshot = @broker_code_description_snapshot,
        policy_number = @policy_number,
        product_category = @product_category,
        policy_type = @policy_type,
        cover_description = @cover_description,
        premium = @premium,
        inception_date = @inception_date,
        renewal_date = @renewal_date,
        policy_status = @policy_status,
        disclosure_completed = @disclosure_completed,
        last_review_date = @last_review_date,
        next_review_date = @next_review_date,
        amendment_count = @amendment_count,
        claims_count = @claims_count,
        cancellation_date = @cancellation_date,
        cancellation_reason = @cancellation_reason,
        replacement_policy_id = @replacement_policy_id,
        notes = @notes,
        payment_method = @payment_method,
        premium_frequency = @premium_frequency,
        debit_order_date = @debit_order_date,
        bank_name = @bank_name,
        branch_code = @branch_code,
        account_number_enc = @account_number_enc,
        account_type = @account_type,
        account_holder_name = @account_holder_name,
        mandate_status = @mandate_status,
        mandate_auth_date = @mandate_auth_date,
        debit_order_reference = @debit_order_reference,
        co_insured = @co_insured,
        co_insured_id_number = @co_insured_id_number,
        co_insured_contact_id = @co_insured_contact_id,
        other_contact_ids = @other_contact_ids,
        currency = @currency,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run(updated);

    const saved = db.prepare('SELECT * FROM policies WHERE id = ?').get(id);

    // Cascade: when a policy transitions INTO Cancelled, deactivate all
    // linked assets and zero their monetary amounts.
    if (saved.policy_status === 'Cancelled' && existing.policy_status !== 'Cancelled') {
      cascadeCancelAssets(db, id, req.session.userId, res);
    }

    res.locals.logAudit({ action: 'UPDATE', module: 'policies', recordId: id, oldValue: maskForAudit(existing), newValue: maskForAudit(saved), description: 'Policy updated' });

    res.json(saved);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------
router.delete('/:id', canDelete, (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const existing = db.prepare('SELECT * FROM policies WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete or NULL out FK references in child tables
    db.prepare('DELETE FROM policy_sections WHERE policy_id = ?').run(id);
    db.prepare('DELETE FROM claims WHERE policy_id = ?').run(id);
    db.prepare('UPDATE assets SET policy_id = NULL WHERE policy_id = ?').run(id);
    db.prepare('UPDATE risk_details SET policy_id = NULL WHERE policy_id = ?').run(id);
    db.prepare('UPDATE advice_records SET policy_id = NULL WHERE policy_id = ?').run(id);

    db.prepare('DELETE FROM policies WHERE id = ?').run(id);

    res.locals.logAudit({ action: 'DELETE', module: 'policies', recordId: id, oldValue: maskForAudit(existing), description: 'Policy deleted' });

    res.json({ success: true, id: Number(id) });
  } catch (err) {
    console.error('DELETE /policies/:id error:', err.message);
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Cannot delete: this record is referenced by other records.' });
    }
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ---------------------------------------------------------------------------
// GET /:id/sections — return policy_sections for this policy
// ---------------------------------------------------------------------------
router.get('/:id/sections', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const policy = db.prepare('SELECT id, assigned_broker_id FROM policies WHERE id = ?').get(id);
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && policy.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const sections = db.prepare(`
      SELECT
        ps.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name
      FROM policy_sections ps
      LEFT JOIN contacts c ON ps.contact_id = c.id
      LEFT JOIN accounts a ON ps.account_id = a.id
      WHERE ps.policy_id = ?
      ORDER BY ps.section_name ASC
    `).all(id);

    res.json(sections);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/asset-history — assets snapshotted when this policy was cancelled
// ---------------------------------------------------------------------------
router.get('/:id/asset-history', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const policy = db.prepare('SELECT id, assigned_broker_id FROM policies WHERE id = ?').get(id);
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && policy.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const rows = db.prepare(`
      SELECT h.*, u.full_name AS cancelled_by_name
      FROM policy_asset_history h
      LEFT JOIN users u ON h.cancelled_by = u.id
      WHERE h.policy_id = ?
      ORDER BY h.cancelled_at DESC, h.id DESC
    `).all(id);

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/claims — return claims for this policy
// ---------------------------------------------------------------------------
router.get('/:id/claims', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const policy = db.prepare('SELECT id, assigned_broker_id FROM policies WHERE id = ?').get(id);
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Broker isolation
    const scopedBrokerId2 = getBrokerId(req);
    if (scopedBrokerId2 && policy.assigned_broker_id !== scopedBrokerId2) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const claims = db.prepare(`
      SELECT
        cl.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        b.full_name AS broker_name
      FROM claims cl
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN accounts a ON cl.account_id = a.id
      LEFT JOIN users b ON cl.broker_id = b.id
      WHERE cl.policy_id = ?
      ORDER BY cl.claim_date DESC
    `).all(id);

    res.json(claims);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /:id/amendment-changes — get recent changes for all assets under this policy
// ============================================================
router.get('/:id/amendment-changes', (req, res) => {
  try {
    const db = getDb();
    const policy = db.prepare(`
      SELECT p.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name
      FROM policies p
      LEFT JOIN contacts c ON p.contact_id = c.id
      LEFT JOIN accounts a ON p.account_id = a.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    // Broker isolation
    const scopedBrokerId3 = getBrokerId(req);
    if (scopedBrokerId3 && policy.assigned_broker_id !== scopedBrokerId3) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all assets for this policy
    const assets = db.prepare('SELECT * FROM assets WHERE policy_id = ?').all(policy.id);

    // Get audit log entries from last 24 hours for the policy and all its assets
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
      vehicle_extras: 'Vehicle Extras', extras_in_total: 'Extras in Total',
      // Policy-level fields
      policy_name: 'Policy Name', policy_number: 'Policy Number', policy_status: 'Policy Status',
      policy_type: 'Policy Type', product_category: 'Product Category', insurer: 'Insurer',
      premium: 'Premium', inception_date: 'Inception Date', renewal_date: 'Renewal Date',
      cover_description: 'Cover Description',
    };
    const SKIP = new Set(['id','created_at','updated_at','created_by','policy_section_id','contact_id','account_id','policy_id']);
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

    const changes = [];

    // Policy-level changes
    const policyAudit = db.prepare(`
      SELECT al.*, u.full_name AS user_name FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.module = 'policies' AND al.record_id = ? AND al.action = 'UPDATE' AND al.timestamp >= ?
      ORDER BY al.timestamp DESC
    `).all(policy.id, since);

    policyAudit.forEach(entry => {
      if (!entry.old_value || !entry.new_value) return;
      try {
        const oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
        const newObj = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
        const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
        for (const key of keys) {
          if (SKIP.has(key)) continue;
          const norm = v => (v === null || v === undefined) ? '' : String(v);
          if (norm(oldObj[key]) !== norm(newObj[key])) {
            const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            changes.push({
              field: key, label,
              from: fmtVal(oldObj[key], key), to: fmtVal(newObj[key], key),
              description: `Amend ${label} of Policy from ${fmtVal(oldObj[key], key)} to ${fmtVal(newObj[key], key)}`,
            });
          }
        }
      } catch (_) {}
    });

    // Asset-level changes
    assets.forEach(asset => {
      const assetAudit = db.prepare(`
        SELECT al.*, u.full_name AS user_name FROM audit_log al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.module = 'assets' AND al.record_id = ? AND al.action = 'UPDATE' AND al.timestamp >= ?
        ORDER BY al.timestamp DESC
      `).all(asset.id, since);

      const assetDesc = [
        asset.asset_type,
        asset.asset_name,
        [asset.make, asset.model].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ')
        + (asset.registration_number ? ', Registration ' + asset.registration_number : '');

      assetAudit.forEach(entry => {
        if (!entry.old_value || !entry.new_value) return;
        try {
          const oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
          const newObj = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
          const keys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
          for (const key of keys) {
            if (SKIP.has(key)) continue;
            const norm = v => (v === null || v === undefined) ? '' : String(v);
            if (norm(oldObj[key]) !== norm(newObj[key])) {
              const label = FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              changes.push({
                field: key, label,
                from: fmtVal(oldObj[key], key), to: fmtVal(newObj[key], key),
                description: `Amend ${label} of ${assetDesc} from ${fmtVal(oldObj[key], key)} to ${fmtVal(newObj[key], key)}`,
              });
            }
          }
        } catch (_) {}
      });

      // Also detect newly created assets in the last 24h
      const createAudit = db.prepare(`
        SELECT al.* FROM audit_log al
        WHERE al.module = 'assets' AND al.record_id = ? AND al.action = 'CREATE' AND al.timestamp >= ?
      `).all(asset.id, since);

      if (createAudit.length) {
        changes.push({
          field: '_new_asset', label: 'New Asset',
          from: '', to: '',
          description: `Add ${assetDesc} to Policy, Insured Value ${fmtCur(asset.asset_value || 0)}`,
        });
      }
    });

    // Detect deleted assets
    const deletedAudit = db.prepare(`
      SELECT al.*, u.full_name AS user_name FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE al.module = 'assets' AND al.action = 'DELETE' AND al.timestamp >= ?
    `).all(since);

    deletedAudit.forEach(entry => {
      try {
        const oldObj = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
        if (oldObj && String(oldObj.policy_id) === String(policy.id)) {
          const desc = [oldObj.asset_type, oldObj.asset_name, [oldObj.make, oldObj.model].filter(Boolean).join(' ')].filter(Boolean).join(', ')
            + (oldObj.registration_number ? ', Registration ' + oldObj.registration_number : '');
          changes.push({
            field: '_deleted_asset', label: 'Deleted Asset',
            from: '', to: '',
            description: `Remove ${desc} from Policy`,
          });
        }
      } catch (_) {}
    });

    const broker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(req.session.userId);

    res.json({
      policy,
      changes,
      broker_name: broker?.full_name || '',
      client_name: policy.contact_name || policy.account_name || '',
      policy_number: policy.policy_number || '',
      insurer: policy.insurer || '',
      broker_code: policy.broker_code_snapshot || '',
      broker_code_description: policy.broker_code_description_snapshot || '',
    });
  } catch (err) {
    console.error('policy amendment-changes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// QUOTES — list / upload / approve / delete (per policy)
// ---------------------------------------------------------------------------

// Helper: load a policy and apply broker isolation; returns the row or sends
// the appropriate error response and returns null.
function _loadPolicyForQuote(req, res, policyId) {
  const db = getDb();
  const policy = db.prepare(
    'SELECT id, assigned_broker_id FROM policies WHERE id = ?'
  ).get(policyId);
  if (!policy) { res.status(404).json({ error: 'Policy not found' }); return null; }
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && policy.assigned_broker_id !== scopedBrokerId) {
    res.status(403).json({ error: 'Access denied' }); return null;
  }
  return policy;
}

function _quoteDisposition(mode, filename) {
  const baseName = path.basename(String(filename || 'policy-document'));
  const safeName = baseName
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\;\r\n]/g, '_')
    .trim() || 'policy-document';
  return `${mode}; filename="${safeName}"; filename*=UTF-8''${encodeRFC5987Value(baseName)}`;
}

function _resolveQuoteFilePath(filePath) {
  const root = quoteUploadRoot();
  const fullPath = path.resolve(root, filePath || '');
  const relative = path.relative(root, fullPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return fullPath;
}

function _streamQuoteFile(req, res, next, disposition) {
  try {
    const db = getDb();
    const quote = db.prepare('SELECT * FROM policy_quotes WHERE id = ?').get(req.params.quoteId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (!_loadPolicyForQuote(req, res, quote.policy_id)) return;

    const fullPath = _resolveQuoteFilePath(quote.file_path);
    if (!fullPath || !fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found on disk' });

    let fileBuffer;
    try {
      fileBuffer = readDecryptedFile(fullPath);
    } catch (err) {
      console.error('Policy quote decrypt error:', err);
      return res.status(500).json({ error: 'Failed to decrypt file' });
    }

    res.setHeader('Content-Type', quote.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', _quoteDisposition(disposition, quote.original_name));
    res.setHeader('Content-Length', fileBuffer.length);
    return res.send(fileBuffer);
  } catch (err) { next(err); }
}

// GET /:id/quotes — list quotes for a policy
router.get('/:id/quotes', (req, res, next) => {
  try {
    const policyId = parseInt(req.params.id, 10);
    if (!_loadPolicyForQuote(req, res, policyId)) return;
    const db = getDb();
    const rows = db.prepare(`
      SELECT q.*,
             u1.full_name AS uploaded_by_name,
             u2.full_name AS approved_by_name
      FROM policy_quotes q
      LEFT JOIN users u1 ON u1.id = q.uploaded_by_id
      LEFT JOIN users u2 ON u2.id = q.approved_by_id
      WHERE q.policy_id = ?
      ORDER BY q.uploaded_at DESC
    `).all(policyId);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /:id/quotes — upload a new quote or existing schedule (multipart "file").
// `document_type` (form field or query param) selects between 'quote' (default)
// and 'schedule'. Either an approved quote OR an approved schedule is enough to
// activate the policy.
router.post('/:id/quotes', quoteUpload.single('file'), (req, res, next) => {
  try {
    const policyId = parseInt(req.params.id, 10);
    if (!_loadPolicyForQuote(req, res, policyId)) return;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const rawType = (req.body?.document_type || req.query?.document_type || 'quote').toLowerCase();
    const documentType = rawType === 'schedule' ? 'schedule' : 'quote';

    const root = quoteUploadRoot();
    const dest = path.join(root, 'policy-quotes', String(policyId));
    ensureDir(dest);
    const ext        = quoteExtFromMime(req.file.mimetype) || path.extname(req.file.originalname || '');
    const uniqueName = `${uuidv4()}${ext}`;
    const fullPath   = path.join(dest, uniqueName);
    const relPath    = path.join('policy-quotes', String(policyId), uniqueName).replace(/\\/g, '/');
    writeEncryptedFile(fullPath, req.file.buffer);

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO policy_quotes (
        policy_id, file_name, original_name, file_type,
        file_path, file_size, uploaded_by_id, document_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      policyId, uniqueName, req.file.originalname, req.file.mimetype,
      relPath, req.file.size, req.session.userId, documentType
    );
    const created = db.prepare('SELECT * FROM policy_quotes WHERE id = ?').get(result.lastInsertRowid);

    const label = documentType === 'schedule' ? 'Existing schedule' : 'Quote';
    res.locals.logAudit?.({
      action: 'CREATE', module: 'policy_quotes', recordId: result.lastInsertRowid,
      newValue: { policy_id: policyId, original_name: req.file.originalname, document_type: documentType },
      description: `${label} "${req.file.originalname}" uploaded for policy ${policyId}`,
    });

    res.status(201).json(created);
  } catch (err) { next(err); }
});

// POST /:id/schedules — convenience alias that always tags upload as schedule.
router.post('/:id/schedules', quoteUpload.single('file'), (req, res, next) => {
  req.body = req.body || {};
  req.body.document_type = 'schedule';
  // Re-route through the quotes handler for unified behaviour.
  router.handle(Object.assign(req, { url: `/${req.params.id}/quotes`, method: 'POST' }), res, next);
});

// POST /quotes/:quoteId/approve — mark a quote approved on a given date
router.post('/quotes/:quoteId/approve', (req, res, next) => {
  try {
    const db = getDb();
    const quote = db.prepare('SELECT * FROM policy_quotes WHERE id = ?').get(req.params.quoteId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (!_loadPolicyForQuote(req, res, quote.policy_id)) return;

    const approved_at = req.body?.approved_at;
    if (!approved_at || !/^\d{4}-\d{2}-\d{2}$/.test(approved_at)) {
      return res.status(400).json({ error: 'approved_at (YYYY-MM-DD) is required.' });
    }

    db.prepare(
      'UPDATE policy_quotes SET approved_at = ?, approved_by_id = ? WHERE id = ?'
    ).run(approved_at, req.session.userId, quote.id);

    const updated = db.prepare('SELECT * FROM policy_quotes WHERE id = ?').get(quote.id);

    res.locals.logAudit?.({
      action: 'UPDATE', module: 'policy_quotes', recordId: quote.id,
      oldValue: { approved_at: quote.approved_at },
      newValue: { approved_at },
      description: `Quote ${quote.id} (${quote.original_name}) approved on ${approved_at}`,
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /quotes/:quoteId
router.delete('/quotes/:quoteId', canDelete, (req, res, next) => {
  try {
    const db = getDb();
    const quote = db.prepare('SELECT * FROM policy_quotes WHERE id = ?').get(req.params.quoteId);
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (!_loadPolicyForQuote(req, res, quote.policy_id)) return;

    const fullPath = path.join(quoteUploadRoot(), quote.file_path);
    if (fs.existsSync(fullPath)) { try { fs.unlinkSync(fullPath); } catch (_) {} }
    db.prepare('DELETE FROM policy_quotes WHERE id = ?').run(quote.id);

    res.locals.logAudit?.({
      action: 'DELETE', module: 'policy_quotes', recordId: quote.id,
      oldValue: quote, description: `Quote "${quote.original_name}" deleted`,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /quotes/:quoteId/view - stream the quote/schedule inline for browser viewing
router.get('/quotes/:quoteId/view', (req, res, next) => {
  _streamQuoteFile(req, res, next, 'inline');
});

// GET /quotes/:quoteId/download - stream the quote file as an attachment
router.get('/quotes/:quoteId/download', (req, res, next) => {
  _streamQuoteFile(req, res, next, 'attachment');
});

module.exports = router;
