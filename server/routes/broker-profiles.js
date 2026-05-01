'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { encrypt, decrypt, mask, redactForAudit } = require('../lib/crypto');
const fitnessAlerts = require('../lib/broker-fitness-alerts');
const scheduler     = require('../lib/scheduler');

const router = express.Router();
router.use(requireAuth);

// Boot the alerts + weekly-digest scheduler (cadence read from system_settings).
scheduler.start();

// ─── Spec picklists (Section 4.13/4.14) ────────────────────────────────────

const CATEGORIES = new Set([
  'Personal Lines',
  'Commercial Lines',
  'Personal Lines & Commercial Lines',
  'Life',
  'Other',
]);

const RE1_STATUS = new Set(['Passed', 'Not yet required', 'Pending', 'Failed — action required']);
const RE5_STATUS = new Set(['Passed', 'Pending', 'Failed — action required']);
const NQF_LEVELS = new Set(['NQF Level 4', 'NQF Level 5', 'NQF Level 6+', 'In progress', 'Not yet obtained']);
const COB_STATUS = new Set(['Completed', 'In progress', 'Required', 'Not required']);
const STANDING   = new Set(['In good standing', 'Under review', 'Suspended', 'Debarred']);
const ACTIVITY_TYPES = new Set([
  'Accredited training', 'Industry conference', 'FSCA seminar',
  'Online course', 'Structured reading', 'Other accredited',
]);

const QUAL_OBTAINED = new Set(['NQF Level 4', 'NQF Level 5', 'NQF Level 6+']);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Returns the current CPD cycle (Jun 1 → May 31). e.g. "2025-06 – 2026-05". */
function currentCpdCycle() {
  const now = new Date();
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-06 – ${year + 1}-05`;
}

function cpdCycleFor(date) {
  const d = new Date(date);
  const year = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-06 – ${year + 1}-05`;
}

/** Cycle deadline = 31 May of the cycle's end year. */
function cpdCycleDeadline(cycleStr) {
  const m = /(\d{4})-06\s*–\s*(\d{4})-05/.exec(cycleStr || '');
  return m ? `${m[2]}-05-31` : null;
}

function calcRe5Deadline(appointmentDate) {
  if (!appointmentDate) return null;
  const d = new Date(appointmentDate);
  d.setFullYear(d.getFullYear() + 2);
  return d.toISOString().slice(0, 10);
}

function calcCobDeadline(appointmentDate) {
  if (!appointmentDate) return null;
  const d = new Date(appointmentDate);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Multi-select stored as comma-joined; accepts array or string. */
function normaliseCategories(value) {
  if (value === null || value === undefined || value === '') return null;
  const arr = Array.isArray(value)
    ? value
    : String(value).split(',').map(s => s.trim()).filter(Boolean);
  return arr.length ? arr.join(', ') : null;
}

function categoriesValid(value) {
  if (!value) return true; // null check happens separately
  const arr = String(value).split(',').map(s => s.trim()).filter(Boolean);
  return arr.length > 0 && arr.every(c => CATEGORIES.has(c));
}

/** Verify approver is an admin/admin_only user. */
function isAdminApprover(db, userId) {
  if (!userId) return false;
  const u = db.prepare('SELECT role, active FROM users WHERE id = ?').get(userId);
  return !!u && u.active && (u.role === 'admin' || u.role === 'admin_only');
}

/** Validate a broker profile payload. Returns array of error strings (empty = OK). */
function validateProfile(b, { isCreate }) {
  const errs = [];
  const required = (k, label) => {
    if (b[k] === null || b[k] === undefined || b[k] === '') errs.push(`${label} is required`);
  };

  if (isCreate) required('user_id', 'user_id');

  required('id_number', 'ID Number');
  required('fsca_registration_number', 'FSCA Registration Number');
  required('appointment_date', 'Appointment Date');
  required('re1_status', 'RE1 Status');
  required('re5_status', 'RE5 Status');
  required('qualification_nqf_level', 'NQF Qualification Level');
  required('good_standing_status', 'Good Standing Status');
  if (b.insolvency_flag === undefined || b.insolvency_flag === null || b.insolvency_flag === '') {
    errs.push('Insolvency / Sequestration flag is required');
  }

  // Categories — mandatory + value-checked
  const cats = normaliseCategories(b.categories_authorised);
  if (!cats) errs.push('Categories of Advice Authorised is required');
  else if (!categoriesValid(cats)) errs.push('Categories of Advice Authorised contains invalid value');

  // Picklist enforcement
  if (b.re1_status && !RE1_STATUS.has(b.re1_status)) errs.push('Invalid RE1 Status');
  if (b.re5_status && !RE5_STATUS.has(b.re5_status)) errs.push('Invalid RE5 Status');
  if (b.qualification_nqf_level && !NQF_LEVELS.has(b.qualification_nqf_level)) errs.push('Invalid NQF Level');
  if (b.good_standing_status && !STANDING.has(b.good_standing_status)) errs.push('Invalid Good Standing Status');
  if (b.cob_personal_lines && !COB_STATUS.has(b.cob_personal_lines)) errs.push('Invalid Class of Business — Personal Lines');
  if (b.cob_commercial_lines && !COB_STATUS.has(b.cob_commercial_lines)) errs.push('Invalid Class of Business — Commercial Lines');

  // Conditional requireds
  if (b.re1_status === 'Passed' && !b.re1_pass_date) errs.push('RE1 Pass Date is required when RE1 Status = Passed');
  if (b.re5_status === 'Passed' && !b.re5_pass_date) errs.push('RE5 Pass Date is required when RE5 Status = Passed');

  if (QUAL_OBTAINED.has(b.qualification_nqf_level)) {
    if (!b.qualification_name)     errs.push('Qualification Name is required when qualification obtained');
    if (!b.qualification_provider) errs.push('Qualification Provider is required when qualification obtained');
  }

  if (b.cob_personal_lines === 'Completed' && !b.cob_personal_lines_date) {
    errs.push('Class of Business (Personal Lines) completion date is required when status = Completed');
  }
  if (b.cob_commercial_lines === 'Completed' && !b.cob_commercial_lines_date) {
    errs.push('Class of Business (Commercial Lines) completion date is required when status = Completed');
  }

  if (b.good_standing_status === 'Debarred') {
    if (!b.debarment_date)   errs.push('Debarment Date is required when status = Debarred');
    if (!b.debarment_reason) errs.push('Debarment Reason is required when status = Debarred');
  }

  return errs;
}

/** Hydrate API output with derived/decrypted fields. */
function hydrateProfile(db, row) {
  if (!row) return row;
  const cycle = currentCpdCycle();
  const pts = db.prepare(`
    SELECT COALESCE(SUM(points_awarded), 0) AS total
    FROM cpd_activities
    WHERE broker_profile_id = ? AND cpd_cycle = ?
  `).get(row.id, cycle);

  // The plaintext ID number must NOT be returned over the wire. Send the masked
  // form only — the admin reveal endpoint (with admin-password challenge) is the
  // single supported path for retrieving plaintext.
  const plain = decrypt(row.id_number);
  const hydrated = {
    ...row,
    id_number:            plain ? mask(plain) : null,
    id_number_masked:     mask(plain),
    id_number_encrypted:  !!row.id_number,
    cpd_points_current:  pts.total,
    cpd_points_remaining: Math.max(0, 18 - pts.total),
    current_cpd_cycle:   cycle,
    cpd_cycle_deadline:  cpdCycleDeadline(cycle),
    suspended_from_advice: !!row.suspended_from_advice,
    cpd_short_flag:        !!row.cpd_short_flag,
    categories_list:     row.categories_authorised
      ? row.categories_authorised.split(',').map(s => s.trim()).filter(Boolean)
      : [],
  };
  hydrated.alerts = fitnessAlerts.computeAlerts(hydrated, new Date());
  return hydrated;
}

/** Old/new values for audit log — never include raw or encrypted ID numbers. */
function safeForAudit(row) {
  if (!row) return row;
  return redactForAudit(row);
}

// ─── Routes ────────────────────────────────────────────────────────────────

// GET / — list broker profiles
router.get('/', (req, res) => {
  const db = getDb();
  const resolved = resolveSort('broker_profiles', req.query.sort, req.query.dir);
  const orderBy = resolved
    ? `ORDER BY ${resolved.sql} ${resolved.dir}, bp.id DESC`
    : `ORDER BY u.full_name ASC`;
  const rows = db.prepare(`
    SELECT bp.*, u.full_name, u.email, u.username, u.role, u.active
    FROM broker_profiles bp
    LEFT JOIN users u ON u.id = bp.user_id
    ${orderBy}
  `).all();

  res.json(rows.map(r => hydrateProfile(db, r)));
});

// GET /me/alerts — alerts for the logged-in user (drives dashboard banner)
router.get('/me/alerts', (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM broker_profiles WHERE user_id = ?`).get(req.session.userId);
  if (!row) return res.json({ alerts: [], profile: null });
  const hydrated = hydrateProfile(db, row);
  res.json({
    profile: { id: hydrated.id, suspended_from_advice: hydrated.suspended_from_advice },
    alerts:  hydrated.alerts || [],
  });
});

// GET /:id/alerts — alerts for a specific profile (admins/own broker)
router.get('/:id/alerts', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const row = db.prepare(`SELECT * FROM broker_profiles WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Profile not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && row.user_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const hydrated = hydrateProfile(db, row);
  res.json({
    profile: { id: hydrated.id, suspended_from_advice: hydrated.suspended_from_advice },
    alerts:  hydrated.alerts || [],
  });
});

// POST /admin/run-alerts — manual scanner trigger (admin only)
router.post('/admin/run-alerts', (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const summary = scheduler.runScan('manual');
  res.json({ ok: true, summary: summary || fitnessAlerts.processAlerts() });
});

// POST /admin/run-digest — manual weekly-digest trigger (admin only)
router.post('/admin/run-digest', (req, res) => {
  if (req.session.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
  res.json(scheduler.runDigest());
});

// GET /me — current user's profile
router.get('/me', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT bp.*, u.full_name, u.email
    FROM broker_profiles bp
    LEFT JOIN users u ON u.id = bp.user_id
    WHERE bp.user_id = ?
  `).get(req.session.userId);

  if (!row) return res.json(null);
  res.json(hydrateProfile(db, row));
});

// GET /user/:userId
router.get('/user/:userId', (req, res) => {
  const db = getDb();
  const userId = parseInt(req.params.userId, 10);

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && scopedBrokerId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const row = db.prepare(`
    SELECT bp.*, u.full_name, u.email
    FROM broker_profiles bp
    LEFT JOIN users u ON u.id = bp.user_id
    WHERE bp.user_id = ?
  `).get(userId);

  if (!row) return res.json(null);
  res.json(hydrateProfile(db, row));
});

// GET /:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const row = db.prepare(`
    SELECT bp.*, u.full_name, u.email
    FROM broker_profiles bp
    LEFT JOIN users u ON u.id = bp.user_id
    WHERE bp.id = ?
  `).get(id);
  if (!row) return res.status(404).json({ error: 'Profile not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && row.user_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(hydrateProfile(db, row));
});

// POST / — create profile
router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body || {};

  const userId = b.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  // Only admin can create a profile for someone else
  if (req.session.userRole !== 'admin' && parseInt(userId, 10) !== req.session.userId) {
    return res.status(403).json({ error: 'Cannot create profile for another user' });
  }

  const existing = db.prepare('SELECT id FROM broker_profiles WHERE user_id = ?').get(userId);
  if (existing) return res.status(409).json({ error: 'Profile already exists for this user' });

  const errs = validateProfile(b, { isCreate: true });
  if (errs.length) return res.status(400).json({ error: errs.join('; '), errors: errs });

  const re5Deadline = calcRe5Deadline(b.appointment_date);
  const cobDeadline = calcCobDeadline(b.appointment_date);
  const categories  = normaliseCategories(b.categories_authorised);
  const idNumberEnc = encrypt(b.id_number);

  const result = db.prepare(`
    INSERT INTO broker_profiles (
      user_id, id_number, fsca_registration_number, appointment_date, categories_authorised,
      re1_status, re1_pass_date, re5_status, re5_pass_date, re5_deadline,
      qualification_nqf_level, qualification_name, qualification_provider,
      cob_personal_lines, cob_personal_lines_date, cob_commercial_lines, cob_commercial_lines_date, cob_deadline,
      good_standing_status, debarment_date, debarment_reason, debarment_lifted_date, debarment_authorised_by_id,
      insolvency_flag, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    idNumberEnc,
    b.fsca_registration_number,
    b.appointment_date,
    categories,
    b.re1_status,
    b.re1_pass_date || null,
    b.re5_status,
    b.re5_pass_date || null,
    re5Deadline,
    b.qualification_nqf_level,
    b.qualification_name || null,
    b.qualification_provider || null,
    b.cob_personal_lines || null,
    b.cob_personal_lines_date || null,
    b.cob_commercial_lines || null,
    b.cob_commercial_lines_date || null,
    cobDeadline,
    b.good_standing_status,
    b.debarment_date || null,
    b.debarment_reason || null,
    b.debarment_lifted_date || null,
    b.debarment_authorised_by_id || null,
    b.insolvency_flag ? 1 : 0,
    b.notes || null,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM broker_profiles WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:   'CREATE',
    module:   'broker_profiles',
    recordId: result.lastInsertRowid,
    newValue: safeForAudit(created),
    description: `Broker profile created for user ${userId}`
  });

  res.status(201).json(hydrateProfile(db, created));
});

// PUT /:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM broker_profiles WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Profile not found' });

  if (req.session.userRole !== 'admin' && existing.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  // Build merged-for-validation view (handles partial PUTs from UI).
  const merged = {
    user_id:                   existing.user_id,
    id_number:                 b.id_number !== undefined ? b.id_number : decrypt(existing.id_number),
    fsca_registration_number:  pick('fsca_registration_number'),
    appointment_date:          pick('appointment_date'),
    categories_authorised:     b.categories_authorised !== undefined
                                  ? normaliseCategories(b.categories_authorised)
                                  : existing.categories_authorised,
    re1_status:                pick('re1_status'),
    re1_pass_date:             pick('re1_pass_date'),
    re5_status:                pick('re5_status'),
    re5_pass_date:             pick('re5_pass_date'),
    qualification_nqf_level:   pick('qualification_nqf_level'),
    qualification_name:        pick('qualification_name'),
    qualification_provider:    pick('qualification_provider'),
    cob_personal_lines:        pick('cob_personal_lines'),
    cob_personal_lines_date:   pick('cob_personal_lines_date'),
    cob_commercial_lines:      pick('cob_commercial_lines'),
    cob_commercial_lines_date: pick('cob_commercial_lines_date'),
    good_standing_status:      pick('good_standing_status'),
    debarment_date:            pick('debarment_date'),
    debarment_reason:          pick('debarment_reason'),
    debarment_lifted_date:     pick('debarment_lifted_date'),
    insolvency_flag:           b.insolvency_flag !== undefined
                                  ? (b.insolvency_flag ? 1 : 0)
                                  : existing.insolvency_flag,
  };

  const errs = validateProfile(merged, { isCreate: false });
  if (errs.length) return res.status(400).json({ error: errs.join('; '), errors: errs });

  const appointmentDate = merged.appointment_date;
  const re5Deadline = calcRe5Deadline(appointmentDate);
  const cobDeadline = calcCobDeadline(appointmentDate);

  // Re-encrypt only when the plaintext ID number was supplied/changed. If the
  // submitted value matches the masked rendering of the existing ID, treat as
  // "no change" — the form just round-tripped the masked display.
  let idNumberStored = existing.id_number;
  if (b.id_number !== undefined) {
    const currentPlain = existing.id_number ? decrypt(existing.id_number) : null;
    if (currentPlain && b.id_number === mask(currentPlain)) {
      // unchanged — keep ciphertext intact
    } else {
      idNumberStored = encrypt(b.id_number);
    }
  }

  db.prepare(`
    UPDATE broker_profiles SET
      id_number                      = ?,
      fsca_registration_number       = ?,
      appointment_date               = ?,
      categories_authorised          = ?,
      re1_status                     = ?,
      re1_pass_date                  = ?,
      re5_status                     = ?,
      re5_pass_date                  = ?,
      re5_deadline                   = ?,
      qualification_nqf_level        = ?,
      qualification_name             = ?,
      qualification_provider         = ?,
      cob_personal_lines             = ?,
      cob_personal_lines_date        = ?,
      cob_commercial_lines           = ?,
      cob_commercial_lines_date      = ?,
      cob_deadline                   = ?,
      good_standing_status           = ?,
      debarment_date                 = ?,
      debarment_reason               = ?,
      debarment_lifted_date          = ?,
      debarment_authorised_by_id     = ?,
      insolvency_flag                = ?,
      notes                          = ?,
      updated_at                     = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    idNumberStored,
    merged.fsca_registration_number,
    appointmentDate,
    merged.categories_authorised,
    merged.re1_status,
    merged.re1_pass_date || null,
    merged.re5_status,
    merged.re5_pass_date || null,
    re5Deadline,
    merged.qualification_nqf_level,
    merged.qualification_name || null,
    merged.qualification_provider || null,
    merged.cob_personal_lines || null,
    merged.cob_personal_lines_date || null,
    merged.cob_commercial_lines || null,
    merged.cob_commercial_lines_date || null,
    cobDeadline,
    merged.good_standing_status,
    merged.debarment_date || null,
    merged.debarment_reason || null,
    merged.debarment_lifted_date || null,
    pick('debarment_authorised_by_id') || null,
    merged.insolvency_flag,
    pick('notes'),
    id
  );

  const updated = db.prepare('SELECT * FROM broker_profiles WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'broker_profiles',
    recordId: id,
    oldValue: safeForAudit(existing),
    newValue: safeForAudit(updated),
    description: `Broker profile ${id} updated`
  });

  // Re-evaluate alert state — clears stale suspensions when admin resolves issues.
  try { fitnessAlerts.reconcile(db, id); } catch (_) {}

  const fresh = db.prepare('SELECT * FROM broker_profiles WHERE id = ?').get(id);
  res.json(hydrateProfile(db, fresh));
});

// ─── CPD activities ────────────────────────────────────────────────────────

router.get('/:id/cpd', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);

  const profile = db.prepare('SELECT user_id FROM broker_profiles WHERE id = ?').get(id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && profile.user_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const rows = db.prepare(`
    SELECT ca.*, u.full_name AS approved_by_name
    FROM cpd_activities ca
    LEFT JOIN users u ON u.id = ca.approved_by_id
    WHERE ca.broker_profile_id = ?
    ORDER BY ca.activity_date DESC, ca.id DESC
  `).all(id);

  res.json(rows);
});

router.post('/:id/cpd', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const profile = db.prepare('SELECT user_id FROM broker_profiles WHERE id = ?').get(id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  if (req.session.userRole !== 'admin' && profile.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const b = req.body || {};
  const errs = [];

  if (!b.activity_date)     errs.push('Activity Date is required');
  if (!b.activity_type)     errs.push('Activity Type is required');
  else if (!ACTIVITY_TYPES.has(b.activity_type)) errs.push('Invalid Activity Type');
  if (!b.activity_provider) errs.push('Activity Provider is required');
  if (b.points_awarded === undefined || b.points_awarded === null || b.points_awarded === '') {
    errs.push('Points Awarded is required');
  } else if (isNaN(parseFloat(b.points_awarded)) || parseFloat(b.points_awarded) < 0) {
    errs.push('Points Awarded must be a non-negative number');
  }
  if (!b.certificate_path) errs.push('Certificate / Evidence is required');
  if (!b.approved_by_id)   errs.push('Approved By is required');
  else if (!isAdminApprover(db, parseInt(b.approved_by_id, 10))) {
    errs.push('Approved By must be an active admin user');
  }

  if (errs.length) return res.status(400).json({ error: errs.join('; '), errors: errs });

  const cycle = cpdCycleFor(b.activity_date);

  const result = db.prepare(`
    INSERT INTO cpd_activities (
      broker_profile_id, activity_date, activity_type, activity_provider,
      activity_title, points_awarded, cpd_cycle, certificate_path,
      approved_by_id, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    b.activity_date,
    b.activity_type,
    b.activity_provider,
    b.activity_title || null,
    parseFloat(b.points_awarded) || 0,
    cycle,
    b.certificate_path,
    parseInt(b.approved_by_id, 10),
    b.notes || null,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM cpd_activities WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:   'CREATE',
    module:   'cpd_activities',
    recordId: result.lastInsertRowid,
    newValue: created,
    description: `CPD activity logged: ${b.activity_title || b.activity_type} (${b.points_awarded} pts) for profile ${id}`
  });

  try { fitnessAlerts.reconcile(db, id); } catch (_) {}

  res.status(201).json(created);
});

router.put('/cpd/:cpdId', (req, res) => {
  const db = getDb();
  const cpdId = parseInt(req.params.cpdId, 10);
  const existing = db.prepare('SELECT * FROM cpd_activities WHERE id = ?').get(cpdId);
  if (!existing) return res.status(404).json({ error: 'CPD activity not found' });

  const profile = db.prepare('SELECT user_id FROM broker_profiles WHERE id = ?').get(existing.broker_profile_id);
  if (req.session.userRole !== 'admin' && profile.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];
  const merged = {
    activity_date:     pick('activity_date'),
    activity_type:     pick('activity_type'),
    activity_provider: pick('activity_provider'),
    activity_title:    pick('activity_title'),
    points_awarded:    pick('points_awarded'),
    certificate_path:  pick('certificate_path'),
    approved_by_id:    pick('approved_by_id'),
    notes:             pick('notes'),
  };

  const errs = [];
  if (!merged.activity_date)     errs.push('Activity Date is required');
  if (!merged.activity_type)     errs.push('Activity Type is required');
  else if (!ACTIVITY_TYPES.has(merged.activity_type)) errs.push('Invalid Activity Type');
  if (!merged.activity_provider) errs.push('Activity Provider is required');
  if (merged.points_awarded === undefined || merged.points_awarded === null || merged.points_awarded === '') {
    errs.push('Points Awarded is required');
  }
  if (!merged.certificate_path) errs.push('Certificate / Evidence is required');
  if (!merged.approved_by_id)   errs.push('Approved By is required');
  else if (!isAdminApprover(db, parseInt(merged.approved_by_id, 10))) {
    errs.push('Approved By must be an active admin user');
  }
  if (errs.length) return res.status(400).json({ error: errs.join('; '), errors: errs });

  const cycle = cpdCycleFor(merged.activity_date);

  db.prepare(`
    UPDATE cpd_activities SET
      activity_date     = ?,
      activity_type     = ?,
      activity_provider = ?,
      activity_title    = ?,
      points_awarded    = ?,
      cpd_cycle         = ?,
      certificate_path  = ?,
      approved_by_id    = ?,
      notes             = ?,
      updated_at        = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    merged.activity_date,
    merged.activity_type,
    merged.activity_provider,
    merged.activity_title,
    parseFloat(merged.points_awarded) || 0,
    cycle,
    merged.certificate_path,
    parseInt(merged.approved_by_id, 10),
    merged.notes,
    cpdId
  );

  const updated = db.prepare('SELECT * FROM cpd_activities WHERE id = ?').get(cpdId);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'cpd_activities',
    recordId: cpdId,
    oldValue: existing,
    newValue: updated,
    description: `CPD activity ${cpdId} updated`
  });

  res.json(updated);
});

router.delete('/cpd/:cpdId', canDelete, (req, res) => {
  const db = getDb();
  const path = require('path');
  const fs   = require('fs');

  const cpdId = parseInt(req.params.cpdId, 10);
  const existing = db.prepare('SELECT * FROM cpd_activities WHERE id = ?').get(cpdId);
  if (!existing) return res.status(404).json({ error: 'CPD activity not found' });

  const profile = db.prepare('SELECT user_id FROM broker_profiles WHERE id = ?').get(existing.broker_profile_id);
  if (req.session.userRole !== 'admin' && profile.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Resolve every linked document — by FK column AND by the legacy
  // certificate_path "doc:<id>" pointer used when the activity was created
  // before the FK column existed.
  const linkedDocs = db.prepare(
    'SELECT * FROM documents WHERE cpd_activity_id = ?'
  ).all(cpdId);

  const m = /^doc:(\d+)$/.exec(existing.certificate_path || '');
  if (m) {
    const docId = parseInt(m[1], 10);
    if (!linkedDocs.some(d => d.id === docId)) {
      const extra = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
      if (extra) linkedDocs.push(extra);
    }
  }

  const uploadRoot = process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.resolve(__dirname, '../../uploads');

  const removedFiles = [];
  const fileErrors   = [];

  // Wrap document removal + cpd delete in a single transaction so an
  // FK error doesn't leave orphan rows behind.
  const tx = db.transaction(() => {
    const delDoc = db.prepare('DELETE FROM documents WHERE id = ?');
    for (const d of linkedDocs) {
      try {
        if (d.file_path) {
          const full = path.join(uploadRoot, d.file_path);
          if (fs.existsSync(full)) {
            fs.unlinkSync(full);
            removedFiles.push(d.file_path);
          }
        }
      } catch (err) {
        fileErrors.push({ id: d.id, file_path: d.file_path, error: err.message });
      }
      delDoc.run(d.id);
    }
    db.prepare('DELETE FROM cpd_activities WHERE id = ?').run(cpdId);
  });

  try {
    tx();
  } catch (err) {
    return res.status(500).json({
      error: `Failed to delete CPD activity: ${err.message}`,
      fileErrors,
    });
  }

  // Audit each removed document, then the activity itself.
  for (const d of linkedDocs) {
    res.locals.logAudit({
      action:      'DELETE',
      module:      'documents',
      recordId:    d.id,
      oldValue:    d,
      description: `Document "${d.original_name || d.file_name}" deleted as part of CPD activity ${cpdId} removal`,
    });
  }
  res.locals.logAudit({
    action:   'DELETE',
    module:   'cpd_activities',
    recordId: cpdId,
    oldValue: existing,
    description: `CPD activity ${cpdId} deleted (with ${linkedDocs.length} attached document(s))`
  });

  // Reconcile fitness state — removing points may re-flag CPD shortfall.
  try { fitnessAlerts.reconcile(db, existing.broker_profile_id); } catch (_) {}

  res.json({
    message: 'Deleted',
    documents_removed: linkedDocs.length,
    files_removed: removedFiles.length,
    file_errors: fileErrors,
  });
});

// ─── Per-broker fitness audit report ───────────────────────────────────────
//
// GET /:id/audit-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns a unified timeline of every audit_log entry that touched this
// broker's profile or any of their CPD activities, plus a summary block.

router.get('/:id/audit-report', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const { from, to } = req.query;

  const profile = db.prepare(`
    SELECT bp.*, u.full_name, u.email, u.username
    FROM broker_profiles bp
    LEFT JOIN users u ON u.id = bp.user_id
    WHERE bp.id = ?
  `).get(id);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  // Brokers can only pull their own report
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && profile.user_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const cpdIds = db.prepare(`
    SELECT id FROM cpd_activities WHERE broker_profile_id = ?
  `).all(id).map(r => r.id);

  const params = [id];
  let cpdClause = '';
  if (cpdIds.length) {
    cpdClause = ` OR (al.module = 'cpd_activities' AND al.record_id IN (${cpdIds.map(() => '?').join(',')}))`;
    params.push(...cpdIds);
  }

  const dateConds = [];
  if (from) { dateConds.push('al.timestamp >= ?'); params.push(from); }
  if (to)   { dateConds.push('al.timestamp <= ?'); params.push(to + ' 23:59:59'); }
  const dateWhere = dateConds.length ? ` AND (${dateConds.join(' AND ')})` : '';

  const events = db.prepare(`
    SELECT al.id, al.timestamp, al.user_id, al.action, al.module, al.record_id,
           al.old_value, al.new_value, al.description, al.ip_address,
           u.full_name AS user_full_name, u.username AS user_username
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE ((al.module = 'broker_profiles' AND al.record_id = ?)${cpdClause})${dateWhere}
    ORDER BY al.timestamp ASC, al.id ASC
  `).all(...params);

  const cycle = currentCpdCycle();
  const cpdSummary = db.prepare(`
    SELECT
      COALESCE(SUM(points_awarded), 0)     AS points_current,
      COUNT(*)                             AS activities_current
    FROM cpd_activities
    WHERE broker_profile_id = ? AND cpd_cycle = ?
  `).get(id, cycle);

  res.locals.logAudit({
    action:   'EXPORT',
    module:   'broker_profiles',
    recordId: id,
    description: `Broker fitness audit report pulled for profile ${id}` +
                 (from || to ? ` (${from || 'open'} → ${to || 'open'})` : '')
  });

  res.json({
    profile: {
      id:                profile.id,
      user_id:           profile.user_id,
      full_name:         profile.full_name,
      email:             profile.email,
      username:          profile.username,
      fsca_registration_number: profile.fsca_registration_number,
      appointment_date:  profile.appointment_date,
      id_number_masked:  mask(decrypt(profile.id_number)),
      good_standing_status: profile.good_standing_status,
      re5_deadline:      profile.re5_deadline,
      cob_deadline:      profile.cob_deadline,
    },
    cycle: {
      current:           cycle,
      deadline:          cpdCycleDeadline(cycle),
      points_current:    cpdSummary.points_current,
      points_remaining:  Math.max(0, 18 - cpdSummary.points_current),
      activities_count:  cpdSummary.activities_current,
    },
    range: { from: from || null, to: to || null },
    events,
    generated_at: new Date().toISOString(),
    generated_by: req.session.userId,
  });
});

module.exports = router;
module.exports.currentCpdCycle = currentCpdCycle;
