const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin, canDelete, getBrokerId } = require('../middleware/auth');
const { getDb } = require('../db/database');
const { resolveSort } = require('./view-prefs');
const { redactForAudit } = require('../lib/crypto');
const { verifyEditUnlock } = require('../lib/edit-lock');

// All routes require authentication
router.use(requireAuth);

// ============================================================
// GET / — list claims with filters and pagination
// ============================================================
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const {
      policy_id,
      asset_id,
      status,
      delay_flag,
      broker_id,
      contact_id,
      account_id,
      claim_type,
      page = 1,
      limit = 25
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    // Broker isolation: brokers can only see their own claims
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      conditions.push('cl.broker_id = ?');
      params.push(scopedBrokerId);
    }

    if (policy_id) {
      conditions.push('cl.policy_id = ?');
      params.push(policy_id);
    }
    if (asset_id) {
      conditions.push('cl.asset_id = ?');
      params.push(asset_id);
    }
    if (status) {
      conditions.push('cl.claim_status = ?');
      params.push(status);
    }
    if (delay_flag !== undefined && delay_flag !== '') {
      conditions.push('cl.delay_flag = ?');
      params.push(parseInt(delay_flag));
    }
    if (broker_id && !scopedBrokerId) {
      conditions.push('cl.broker_id = ?');
      params.push(broker_id);
    }
    if (contact_id) {
      conditions.push('cl.contact_id = ?');
      params.push(contact_id);
    }
    if (account_id) {
      conditions.push('cl.account_id = ?');
      params.push(account_id);
    }
    if (claim_type) {
      conditions.push('cl.claim_type = ?');
      params.push(claim_type);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const baseQuery = `
      FROM claims cl
      LEFT JOIN policies p ON cl.policy_id = p.id
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN accounts ac ON cl.account_id = ac.id
      LEFT JOIN users b ON cl.broker_id = b.id
      LEFT JOIN users ha ON cl.claims_handler_admin_id = ha.id
      ${where}
    `;

    const countRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery}`).get(...params);

    const resolved = resolveSort('claims', req.query.sort, req.query.dir);
    const orderBy = resolved
      ? `ORDER BY ${resolved.sql} ${resolved.dir}, cl.id DESC`
      : `ORDER BY cl.created_at DESC`;

    const rows = db.prepare(`
      SELECT
        cl.*,
        p.policy_name,
        p.policy_number,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        ac.account_name,
        b.full_name AS broker_name,
        COALESCE(cl.claims_handler_name, ha.full_name) AS claims_handler_name
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
    console.error('GET /claims error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve claims' });
  }
});

// ============================================================
// GET /:id — single claim with all joins
// ============================================================
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        cl.*,
        p.policy_name,
        p.policy_number,
        p.insurer,
        p.product_category,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        c.email AS contact_email,
        c.mobile AS contact_mobile,
        ac.account_name,
        ps.section_name AS policy_section_name,
        ps.section_type AS policy_section_type,
        a.asset_name,
        a.asset_type,
        a.registration_number AS asset_registration_number,
        b.full_name AS broker_name,
        b.email AS broker_email,
        COALESCE(cl.claims_handler_name, ha.full_name) AS claims_handler_name,
        ha.email AS claims_handler_email
      FROM claims cl
      LEFT JOIN policies p ON cl.policy_id = p.id
      LEFT JOIN contacts c ON cl.contact_id = c.id
      LEFT JOIN accounts ac ON cl.account_id = ac.id
      LEFT JOIN policy_sections ps ON cl.policy_section_id = ps.id
      LEFT JOIN assets a ON cl.asset_id = a.id
      LEFT JOIN users b ON cl.broker_id = b.id
      LEFT JOIN users ha ON cl.claims_handler_admin_id = ha.id
      WHERE cl.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && row.broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(row);
  } catch (err) {
    console.error('GET /claims/:id error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve claim' });
  }
});

// ============================================================
// POST / — create claim; auto-increment policy.claims_count
// ============================================================
router.post('/', (req, res) => {
  try {
    const {
      claim_number,
      policy_id,
      claim_date,
      date_reported,
      claim_type,
      incident_description,
      claim_status,
      contact_id,
      account_id,
      policy_section_id,
      asset_id,
      broker_id,
      claims_handler_admin_id,
      claims_handler_name,
      estimated_value,
      client_kept_informed,
      last_client_update_date,
      fair_process_concern,
      dispute_raised,
      dispute_details,
      settlement_amount,
      settlement_date,
      rejection_reason,
      outcome_notes,
      related_advice_record_id,
      excess,
      excess_pct_claim,
      excess_pct_insured,
      minimum_excess,
      currency,
      notes,
      claim_related_contacts,
      driver_name,
      driver_id_number,
      driver_licence_number,
      driver_licence_code,
      driver_cell,
      driver_relationship,
      driver_date_of_birth,
      driver_years_experience,
      // Compliance enhancements (MOD-03 / TCF Outcome 5)
      claim_category,
      claim_reference_number,
      insurer_assessment_date,
      repudiation_reason,
      repudiation_reason_notes,
      broker_dispute_action,
      post_claim_satisfaction,
      outcome_vs_roa_expectation,
      complaint_arising
    } = req.body;

    // Validation
    if (
      !claim_number ||
      !policy_id ||
      !claim_date ||
      !date_reported ||
      !claim_type ||
      !incident_description ||
      !claim_status
    ) {
      return res.status(400).json({
        error:
          'claim_number, policy_id, claim_date, date_reported, claim_type, incident_description, and claim_status are required'
      });
    }

    // Repudiation workflow (TCF Outcome 5): if status indicates repudiation,
    // the broker must record both a repudiation reason and a dispute action.
    if (claim_status === 'Rejected' || repudiation_reason) {
      if (!repudiation_reason) {
        return res.status(400).json({
          error: 'Repudiation reason is required when the claim is rejected/repudiated.'
        });
      }
      if (!broker_dispute_action) {
        return res.status(400).json({
          error: 'Broker dispute action is required for repudiated claims.'
        });
      }
    }

    const db = getDb();

    // Verify policy exists and is in a state that permits new claims.
    // Rule: a claim cannot be added if the policy is not Active or has been
    // cancelled / lapsed / expired (i.e. carries any disqualifying status flag).
    const policy = db.prepare(
      'SELECT id, policy_number, policy_status, cancellation_date FROM policies WHERE id = ?'
    ).get(policy_id);
    if (!policy) {
      return res.status(400).json({ error: 'Referenced policy does not exist' });
    }
    if (policy.policy_status !== 'Active') {
      return res.status(422).json({
        error: `Cannot add a claim — policy ${policy.policy_number} is ${policy.policy_status}. Only Active policies (with no cancellation/lapse/expiry flags) accept new claims.`
      });
    }
    if (policy.cancellation_date) {
      return res.status(422).json({
        error: `Cannot add a claim — policy ${policy.policy_number} has a cancellation date on record.`
      });
    }

    // An asset must be selected and must be Active.
    if (!asset_id) {
      return res.status(422).json({
        error: 'An asset must be selected before a claim can be saved.'
      });
    }
    const asset = db.prepare(
      'SELECT id, asset_name, asset_status FROM assets WHERE id = ?'
    ).get(asset_id);
    if (!asset) {
      return res.status(400).json({ error: 'Referenced asset does not exist' });
    }
    if (asset.asset_status !== 'Active') {
      return res.status(422).json({
        error: `Cannot add a claim — asset "${asset.asset_name}" is ${asset.asset_status}. Only Active assets can have new claims raised against them.`
      });
    }

    const insertAndIncrement = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO claims (
          claim_number, policy_id, claim_date, date_reported,
          claim_type, incident_description, claim_status,
          contact_id, account_id, policy_section_id, asset_id,
          broker_id, claims_handler_admin_id, claims_handler_name,
          estimated_value, client_kept_informed, last_client_update_date,
          delay_flag, fair_process_concern, dispute_raised, dispute_details,
          settlement_amount, settlement_date, rejection_reason, outcome_notes,
          related_advice_record_id,
          excess, excess_pct_claim, excess_pct_insured, minimum_excess,
          currency,
          notes,
          claim_related_contacts,
          driver_name, driver_id_number, driver_licence_number, driver_licence_code,
          driver_cell, driver_relationship, driver_date_of_birth, driver_years_experience,
          claim_category, claim_reference_number, insurer_assessment_date,
          repudiation_reason, repudiation_reason_notes, broker_dispute_action,
          post_claim_satisfaction, outcome_vs_roa_expectation, complaint_arising,
          created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          0, ?, ?, ?,
          ?, ?, ?, ?,
          ?,
          ?, ?, ?, ?,
          ?,
          ?,
          ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `).run(
        claim_number, policy_id, claim_date, date_reported,
        claim_type, incident_description, claim_status,
        contact_id || null, account_id || null, policy_section_id || null, asset_id || null,
        broker_id || null, claims_handler_admin_id || null, claims_handler_name || null,
        estimated_value ?? null, client_kept_informed ? 1 : 0, last_client_update_date || null,
        fair_process_concern ? 1 : 0, dispute_raised ? 1 : 0, dispute_details || null,
        settlement_amount ?? null, settlement_date || null, rejection_reason || null, outcome_notes || null,
        related_advice_record_id || null,
        excess ?? null, excess_pct_claim ?? null, excess_pct_insured ?? null, minimum_excess ?? null,
        currency || 'ZAR',
        notes || null,
        claim_related_contacts || null,
        driver_name || null, driver_id_number || null, driver_licence_number || null, driver_licence_code || null,
        driver_cell || null, driver_relationship || null, driver_date_of_birth || null, driver_years_experience ?? null,
        claim_category || null, claim_reference_number || null, insurer_assessment_date || null,
        repudiation_reason || null, repudiation_reason_notes || null, broker_dispute_action || null,
        post_claim_satisfaction || null, outcome_vs_roa_expectation || null, (complaint_arising ? 1 : 0),
        req.session.userId
      );

      // Auto-increment claims_count on the related policy
      db.prepare(`
        UPDATE policies SET claims_count = claims_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(policy_id);

      return result;
    });

    const result = insertAndIncrement();
    const newClaim = db.prepare('SELECT * FROM claims WHERE id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({
      action: 'CREATE',
      module: 'claims',
      recordId: result.lastInsertRowid,
      newValue: newClaim,
      description: `Claim created: ${claim_number}`
    });

    res.status(201).json(newClaim);
  } catch (err) {
    console.error('POST /claims error:', err.message);
    // Unique constraint on claim_number
    if (err.message && err.message.includes('UNIQUE constraint failed: claims.claim_number')) {
      return res.status(409).json({ error: 'A claim with this claim number already exists' });
    }
    res.status(500).json({ error: 'Failed to create claim' });
  }
});

// ============================================================
// PUT /:id — update claim; auto-set delay_flag
// ============================================================
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Edit-lock gate — every saved claim requires an admin password to edit.
    const unlock = verifyEditUnlock(req, res, db, { module: 'claims', recordId: req.params.id });
    if (!unlock.ok) return res.status(unlock.status).json({ error: unlock.error, code: unlock.code });

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Settled claims are locked — must be re-opened first
    if (existing.claim_status === 'Settled') {
      return res.status(403).json({ error: 'This claim is settled and locked for editing. An admin must re-open it first.' });
    }

    const {
      claim_number,
      policy_id,
      claim_date,
      date_reported,
      claim_type,
      incident_description,
      claim_status,
      contact_id,
      account_id,
      policy_section_id,
      asset_id,
      broker_id,
      claims_handler_admin_id,
      claims_handler_name,
      estimated_value,
      client_kept_informed,
      last_client_update_date,
      delay_flag,
      fair_process_concern,
      dispute_raised,
      dispute_details,
      settlement_amount,
      settlement_date,
      rejection_reason,
      outcome_notes,
      related_advice_record_id,
      excess,
      excess_pct_claim,
      excess_pct_insured,
      minimum_excess,
      currency,
      notes: notesField,
      claim_related_contacts,
      driver_name,
      driver_id_number,
      driver_licence_number,
      driver_licence_code,
      driver_cell,
      driver_relationship,
      driver_date_of_birth,
      driver_years_experience,
      // Compliance enhancements
      claim_category,
      claim_reference_number,
      insurer_assessment_date,
      repudiation_reason,
      repudiation_reason_notes,
      broker_dispute_action,
      post_claim_satisfaction,
      outcome_vs_roa_expectation,
      complaint_arising
    } = req.body;

    // Repudiation workflow: when moving to Rejected, require reason + action
    const moveToRejected = (claim_status === 'Rejected' && existing.claim_status !== 'Rejected');
    if (moveToRejected || (repudiation_reason && !existing.repudiation_reason)) {
      const effReason = repudiation_reason ?? existing.repudiation_reason;
      const effAction = broker_dispute_action ?? existing.broker_dispute_action;
      if (!effReason) {
        return res.status(400).json({
          error: 'Repudiation reason is required when the claim is rejected/repudiated.'
        });
      }
      if (!effAction) {
        return res.status(400).json({
          error: 'Broker dispute action is required for repudiated claims.'
        });
      }
    }

    // Determine the effective values after merge (for delay flag logic)
    const effectiveStatus = claim_status ?? existing.claim_status;
    const effectiveLastUpdate = last_client_update_date ?? existing.last_client_update_date;

    // DELAY FLAG: auto-set if status is 'In Progress' or 'Awaiting Documents'
    // and last_client_update_date is more than 7 days ago (or missing)
    let computedDelayFlag = delay_flag !== undefined ? (delay_flag ? 1 : 0) : existing.delay_flag;

    const delayTriggerStatuses = ['In Progress', 'Awaiting Documents'];
    if (delayTriggerStatuses.includes(effectiveStatus)) {
      if (!effectiveLastUpdate) {
        // No update date recorded — flag as delayed
        computedDelayFlag = 1;
      } else {
        const lastUpdate = new Date(effectiveLastUpdate);
        const now = new Date();
        const diffDays = (now - lastUpdate) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
          computedDelayFlag = 1;
        }
      }
    }

    db.prepare(`
      UPDATE claims SET
        claim_number             = COALESCE(?, claim_number),
        policy_id                = COALESCE(?, policy_id),
        claim_date               = COALESCE(?, claim_date),
        date_reported            = COALESCE(?, date_reported),
        claim_type               = COALESCE(?, claim_type),
        incident_description     = COALESCE(?, incident_description),
        claim_status             = COALESCE(?, claim_status),
        contact_id               = COALESCE(?, contact_id),
        account_id               = COALESCE(?, account_id),
        policy_section_id        = COALESCE(?, policy_section_id),
        asset_id                 = COALESCE(?, asset_id),
        broker_id                = COALESCE(?, broker_id),
        claims_handler_admin_id  = COALESCE(?, claims_handler_admin_id),
        claims_handler_name      = COALESCE(?, claims_handler_name),
        estimated_value          = COALESCE(?, estimated_value),
        client_kept_informed     = COALESCE(?, client_kept_informed),
        last_client_update_date  = COALESCE(?, last_client_update_date),
        delay_flag               = ?,
        fair_process_concern     = COALESCE(?, fair_process_concern),
        dispute_raised           = COALESCE(?, dispute_raised),
        dispute_details          = COALESCE(?, dispute_details),
        settlement_amount        = COALESCE(?, settlement_amount),
        settlement_date          = COALESCE(?, settlement_date),
        rejection_reason         = COALESCE(?, rejection_reason),
        outcome_notes            = COALESCE(?, outcome_notes),
        related_advice_record_id = COALESCE(?, related_advice_record_id),
        excess                   = COALESCE(?, excess),
        excess_pct_claim         = COALESCE(?, excess_pct_claim),
        excess_pct_insured       = COALESCE(?, excess_pct_insured),
        minimum_excess           = COALESCE(?, minimum_excess),
        currency                 = COALESCE(?, currency),
        notes                    = COALESCE(?, notes),
        claim_related_contacts   = COALESCE(?, claim_related_contacts),
        driver_name              = COALESCE(?, driver_name),
        driver_id_number         = COALESCE(?, driver_id_number),
        driver_licence_number    = COALESCE(?, driver_licence_number),
        driver_licence_code      = COALESCE(?, driver_licence_code),
        driver_cell              = COALESCE(?, driver_cell),
        driver_relationship      = COALESCE(?, driver_relationship),
        driver_date_of_birth     = COALESCE(?, driver_date_of_birth),
        driver_years_experience  = COALESCE(?, driver_years_experience),
        claim_category             = COALESCE(?, claim_category),
        claim_reference_number     = COALESCE(?, claim_reference_number),
        insurer_assessment_date    = COALESCE(?, insurer_assessment_date),
        repudiation_reason         = COALESCE(?, repudiation_reason),
        repudiation_reason_notes   = COALESCE(?, repudiation_reason_notes),
        broker_dispute_action      = COALESCE(?, broker_dispute_action),
        post_claim_satisfaction    = COALESCE(?, post_claim_satisfaction),
        outcome_vs_roa_expectation = COALESCE(?, outcome_vs_roa_expectation),
        complaint_arising          = COALESCE(?, complaint_arising),
        updated_at                 = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      claim_number ?? null,
      policy_id ?? null,
      claim_date ?? null,
      date_reported ?? null,
      claim_type ?? null,
      incident_description ?? null,
      claim_status ?? null,
      contact_id ?? null,
      account_id ?? null,
      policy_section_id ?? null,
      asset_id ?? null,
      broker_id ?? null,
      claims_handler_admin_id ?? null,
      claims_handler_name ?? null,
      estimated_value ?? null,
      client_kept_informed !== undefined ? (client_kept_informed ? 1 : 0) : null,
      last_client_update_date ?? null,
      computedDelayFlag,
      fair_process_concern !== undefined ? (fair_process_concern ? 1 : 0) : null,
      dispute_raised !== undefined ? (dispute_raised ? 1 : 0) : null,
      dispute_details ?? null,
      settlement_amount ?? null,
      settlement_date ?? null,
      rejection_reason ?? null,
      outcome_notes ?? null,
      related_advice_record_id ?? null,
      excess ?? null,
      excess_pct_claim ?? null,
      excess_pct_insured ?? null,
      minimum_excess ?? null,
      currency !== undefined ? (currency || 'ZAR') : null,
      notesField ?? null,
      claim_related_contacts ?? null,
      driver_name ?? null,
      driver_id_number ?? null,
      driver_licence_number ?? null,
      driver_licence_code ?? null,
      driver_cell ?? null,
      driver_relationship ?? null,
      driver_date_of_birth ?? null,
      driver_years_experience ?? null,
      claim_category ?? null,
      claim_reference_number ?? null,
      insurer_assessment_date ?? null,
      repudiation_reason ?? null,
      repudiation_reason_notes ?? null,
      broker_dispute_action ?? null,
      post_claim_satisfaction ?? null,
      outcome_vs_roa_expectation ?? null,
      complaint_arising !== undefined ? (complaint_arising ? 1 : 0) : null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);

    res.locals.logAudit({
      action: 'UPDATE',
      module: 'claims',
      recordId: parseInt(req.params.id),
      oldValue: redactForAudit(existing),
      newValue: redactForAudit(updated),
      description: `Claim updated: ${updated.claim_number}${updated.delay_flag && !existing.delay_flag ? ' [delay flag set]' : ''}`
    });

    res.json(updated);
  } catch (err) {
    console.error('PUT /claims/:id error:', err.message);
    if (err.message && err.message.includes('UNIQUE constraint failed: claims.claim_number')) {
      return res.status(409).json({ error: 'A claim with this claim number already exists' });
    }
    res.status(500).json({ error: 'Failed to update claim' });
  }
});

// ============================================================
// POST /:id/reopen — admin-only: re-open a settled claim
// ============================================================
router.post('/:id/reopen', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    if (existing.claim_status !== 'Settled') {
      return res.status(400).json({ error: 'Only settled claims can be re-opened' });
    }

    db.prepare(`
      UPDATE claims SET claim_status = 'In Progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(req.params.id);

    const updated = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);

    res.locals.logAudit({
      action: 'UPDATE',
      module: 'claims',
      recordId: parseInt(req.params.id),
      oldValue: redactForAudit(existing),
      newValue: redactForAudit(updated),
      description: `Claim re-opened by admin: ${updated.claim_number}`
    });

    res.json(updated);
  } catch (err) {
    console.error('POST /claims/:id/reopen error:', err.message);
    res.status(500).json({ error: 'Failed to re-open claim' });
  }
});

// ============================================================
// DELETE /:id — delete claim
// ============================================================
router.delete('/:id', canDelete, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM claims WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM claims WHERE id = ?').run(req.params.id);

    res.locals.logAudit({
      action: 'DELETE',
      module: 'claims',
      recordId: parseInt(req.params.id),
      oldValue: redactForAudit(existing),
      description: `Claim deleted: ${existing.claim_number}`
    });

    res.json({ message: 'Claim deleted successfully' });
  } catch (err) {
    console.error('DELETE /claims/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete claim' });
  }
});

// ============================================================
// CLAIM NOTES — CRUD
// ============================================================

// GET /:id/notes
router.get('/:id/notes', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT cn.*, u.full_name AS created_by_name
      FROM claim_notes cn
      LEFT JOIN users u ON u.id = cn.created_by
      WHERE cn.claim_id = ?
      ORDER BY cn.note_date DESC, cn.created_at DESC
    `).all(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('GET /claims/:id/notes error:', err.message);
    res.status(500).json({ error: 'Failed to load notes' });
  }
});

// POST /:id/notes
router.post('/:id/notes', (req, res) => {
  try {
    const db = getDb();
    const { note_date, details, expected_outcome } = req.body;
    if (!details) return res.status(400).json({ error: 'Details are required' });

    const result = db.prepare(`
      INSERT INTO claim_notes (claim_id, note_date, details, expected_outcome, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.id, note_date || new Date().toISOString().slice(0, 10), details, expected_outcome || null, req.session.userId);

    const created = db.prepare('SELECT cn.*, u.full_name AS created_by_name FROM claim_notes cn LEFT JOIN users u ON u.id = cn.created_by WHERE cn.id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({
      action: 'CREATE', module: 'claims', recordId: parseInt(req.params.id),
      newValue: created, description: `Note added to claim`
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('POST /claims/:id/notes error:', err.message);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// DELETE /:claimId/notes/:noteId
router.delete('/:claimId/notes/:noteId', canDelete, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM claim_notes WHERE id = ? AND claim_id = ?').get(req.params.noteId, req.params.claimId);
    if (!existing) return res.status(404).json({ error: 'Note not found' });

    db.prepare('DELETE FROM claim_notes WHERE id = ?').run(req.params.noteId);

    res.locals.logAudit({
      action: 'DELETE', module: 'claims', recordId: parseInt(req.params.claimId),
      oldValue: existing, description: `Note deleted from claim`
    });

    res.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('DELETE claim note error:', err.message);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ============================================================
// CLAIM THIRD PARTIES — CRUD
// ============================================================

// GET /:id/third-parties
router.get('/:id/third-parties', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT ctp.*, u.full_name AS created_by_name
      FROM claim_third_parties ctp
      LEFT JOIN users u ON u.id = ctp.created_by
      WHERE ctp.claim_id = ?
      ORDER BY ctp.created_at DESC
    `).all(req.params.id);
    res.json(rows);
  } catch (err) {
    console.error('GET /claims/:id/third-parties error:', err.message);
    res.status(500).json({ error: 'Failed to load third parties' });
  }
});

// POST /:id/third-parties
router.post('/:id/third-parties', (req, res) => {
  try {
    const db = getDb();
    const { surname, initials, address, cell_no, telephone_no, occupation, vehicle_make, vehicle_model, vehicle_reg, damage_description, is_insured, insurer, notes } = req.body;
    if (!surname) return res.status(400).json({ error: 'Surname is required' });

    const result = db.prepare(`
      INSERT INTO claim_third_parties (claim_id, surname, initials, address, cell_no, telephone_no, occupation, vehicle_make, vehicle_model, vehicle_reg, damage_description, is_insured, insurer, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, surname, initials || null, address || null, cell_no || null, telephone_no || null, occupation || null, vehicle_make || null, vehicle_model || null, vehicle_reg || null, damage_description || null, is_insured ? 1 : 0, insurer || null, notes || null, req.session.userId);

    const created = db.prepare('SELECT ctp.*, u.full_name AS created_by_name FROM claim_third_parties ctp LEFT JOIN users u ON u.id = ctp.created_by WHERE ctp.id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({
      action: 'CREATE', module: 'claims', recordId: parseInt(req.params.id),
      newValue: created, description: `Third party added to claim: ${surname}`
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('POST /claims/:id/third-parties error:', err.message);
    res.status(500).json({ error: 'Failed to add third party' });
  }
});

// PUT /:claimId/third-parties/:tpId
router.put('/:claimId/third-parties/:tpId', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM claim_third_parties WHERE id = ? AND claim_id = ?').get(req.params.tpId, req.params.claimId);
    if (!existing) return res.status(404).json({ error: 'Third party not found' });

    const b = req.body;
    db.prepare(`
      UPDATE claim_third_parties SET
        surname = ?, initials = ?, address = ?, cell_no = ?,
        telephone_no = ?, occupation = ?, vehicle_make = ?,
        vehicle_model = ?, vehicle_reg = ?, damage_description = ?,
        is_insured = ?, insurer = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      b.surname ?? existing.surname, b.initials ?? existing.initials,
      b.address ?? existing.address, b.cell_no ?? existing.cell_no,
      b.telephone_no ?? existing.telephone_no, b.occupation ?? existing.occupation,
      b.vehicle_make ?? existing.vehicle_make, b.vehicle_model ?? existing.vehicle_model,
      b.vehicle_reg ?? existing.vehicle_reg, b.damage_description ?? existing.damage_description,
      b.is_insured !== undefined ? (b.is_insured ? 1 : 0) : existing.is_insured,
      b.insurer ?? existing.insurer, b.notes ?? existing.notes,
      req.params.tpId
    );

    const updated = db.prepare('SELECT * FROM claim_third_parties WHERE id = ?').get(req.params.tpId);

    res.locals.logAudit({
      action: 'UPDATE', module: 'claims', recordId: parseInt(req.params.claimId),
      oldValue: redactForAudit(existing), newValue: redactForAudit(updated), description: `Third party updated: ${updated.surname}`
    });

    res.json(updated);
  } catch (err) {
    console.error('PUT claim third-party error:', err.message);
    res.status(500).json({ error: 'Failed to update third party' });
  }
});

// DELETE /:claimId/third-parties/:tpId
router.delete('/:claimId/third-parties/:tpId', canDelete, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM claim_third_parties WHERE id = ? AND claim_id = ?').get(req.params.tpId, req.params.claimId);
    if (!existing) return res.status(404).json({ error: 'Third party not found' });

    db.prepare('DELETE FROM claim_third_parties WHERE id = ?').run(req.params.tpId);

    res.locals.logAudit({
      action: 'DELETE', module: 'claims', recordId: parseInt(req.params.claimId),
      oldValue: redactForAudit(existing), description: `Third party deleted: ${existing.name}`
    });

    res.json({ message: 'Third party deleted' });
  } catch (err) {
    console.error('DELETE claim third-party error:', err.message);
    res.status(500).json({ error: 'Failed to delete third party' });
  }
});

module.exports = router;
