'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { verifyEditUnlock } = require('../lib/edit-lock');

// Apply requireAuth to all engagement routes
router.use(requireAuth);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

function parsePage(query) {
  const page = parseInt(query.page, 10);
  return page > 0 ? page : 1;
}

// Pre-Sale Disclosure evaluator (FAIS GCC §4 / TCF Outcome 1 & 3).
// Returns 'Complete' | 'Incomplete'. Status is derived from stored fields so
// we never ship a stale value on the wire.
const FSP_DISCLOSURE_OK       = ['Yes — Written', 'Yes — Verbal'];
const COMPLAINTS_DISCLOSURE_OK = ['Yes — Written', 'Yes — Verbal', 'Complaints form provided'];
const DISCLOSURE_METHOD_OPTS   = [
  'In-person meeting', 'Phone call', 'Video call', 'Email', 'WhatsApp', 'Signed form'
];

function evalDisclosureStatus(row) {
  if (!row) return 'Incomplete';
  const fspOk        = FSP_DISCLOSURE_OK.includes(row.fsp_licence_disclosed);
  const brokerOk     = !!row.broker_identity_disclosed;
  const costsOk      = !!row.product_costs_disclosed && !!(row.product_costs_disclosed_notes && row.product_costs_disclosed_notes.trim());
  const risksOk      = !!row.material_risks_disclosed && !!(row.material_risks_disclosed_notes && row.material_risks_disclosed_notes.trim());
  const complaintsOk = COMPLAINTS_DISCLOSURE_OK.includes(row.complaints_process_disclosed);
  const methodOk     = DISCLOSURE_METHOD_OPTS.includes(row.disclosure_method);
  return (fspOk && brokerOk && costsOk && risksOk && complaintsOk && methodOk) ? 'Complete' : 'Incomplete';
}

// Ordered stage list used for progression checks
const STAGE_ORDER = [
  'Prospect',
  'Initial Contact',
  'Appointment Scheduled',
  'Fact Find Completed',
  'Needs Analysis Completed',
  'Quote / Proposal Prepared',
  'Advice Presented',
  'Client Decision Pending',
  'Accepted - Implementation',
  'Implemented / Active',
  'Lost / Declined',
  'On Hold',
];

// ---------------------------------------------------------------------------
// GET / — list all with optional filters, paginated
// ---------------------------------------------------------------------------
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, stage, broker_id, type, contact_id, account_id } = req.query;
    const page = parsePage(req.query);
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [];
    const params = [];

    // Broker isolation: brokers can only see their own engagements
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      conditions.push('ce.assigned_broker_id = ?');
      params.push(scopedBrokerId);
    }

    if (search) {
      conditions.push(`(
        ce.engagement_name LIKE ?
        OR (c.first_name || ' ' || c.last_name) LIKE ?
        OR a.account_name LIKE ?
        OR b.full_name LIKE ?
      )`);
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (stage) {
      conditions.push('ce.stage = ?');
      params.push(stage);
    }

    if (broker_id && !scopedBrokerId) {
      conditions.push('ce.assigned_broker_id = ?');
      params.push(broker_id);
    }

    if (type) {
      conditions.push('ce.engagement_type = ?');
      params.push(type);
    }

    if (contact_id) {
      conditions.push('ce.contact_id = ?');
      params.push(contact_id);
    }

    if (account_id) {
      conditions.push('ce.account_id = ?');
      params.push(account_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM client_engagements ce
      LEFT JOIN contacts c ON ce.contact_id = c.id
      LEFT JOIN accounts a ON ce.account_id = a.id
      LEFT JOIN users b ON ce.assigned_broker_id = b.id
    `;

    const countRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery} ${where}`).get(...params);
    const total = countRow.total;

    const resolved = resolveSort('engagements', req.query.sort, req.query.dir);
    const orderBy = resolved
      ? `ORDER BY ${resolved.sql} ${resolved.dir}, ce.id DESC`
      : `ORDER BY ce.updated_at DESC`;

    const rows = db.prepare(`
      SELECT
        ce.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        b.full_name AS broker_name
      ${baseQuery}
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE, offset);

    // Decorate every row with the derived Pre-Sale Disclosure Status
    rows.forEach(r => { r.presale_disclosure_status = evalDisclosureStatus(r); });

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
        ce.*,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        b.full_name AS broker_name,
        adm.full_name AS admin_name,
        creator.full_name AS created_by_name,
        disc.full_name AS disclosing_broker_name
      FROM client_engagements ce
      LEFT JOIN contacts c ON ce.contact_id = c.id
      LEFT JOIN accounts a ON ce.account_id = a.id
      LEFT JOIN users b ON ce.assigned_broker_id = b.id
      LEFT JOIN users adm ON ce.assigned_admin_id = adm.id
      LEFT JOIN users creator ON ce.created_by = creator.id
      LEFT JOIN users disc ON ce.disclosing_broker_id = disc.id
      WHERE ce.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && row.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    row.presale_disclosure_status = evalDisclosureStatus(row);

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
    if (!body.engagement_name) missing.push('engagement_name');
    if (!body.assigned_broker_id) missing.push('assigned_broker_id');
    if (!body.engagement_type) missing.push('engagement_type');
    if (missing.length) {
      return res.status(400).json({ error: 'Missing required fields', fields: missing });
    }

    // At least one of contact_id or account_id
    if (!body.contact_id && !body.account_id) {
      return res.status(400).json({
        error: 'At least one of contact_id or account_id must be provided',
      });
    }

    // Decide initial disclosure status from incoming payload so we can stamp
    // timestamp/broker at the first transition into Complete.
    const preStatusDraft = evalDisclosureStatus({
      fsp_licence_disclosed:         body.fsp_licence_disclosed,
      broker_identity_disclosed:     body.broker_identity_disclosed ? 1 : 0,
      product_costs_disclosed:       body.product_costs_disclosed ? 1 : 0,
      product_costs_disclosed_notes: body.product_costs_disclosed_notes,
      material_risks_disclosed:      body.material_risks_disclosed ? 1 : 0,
      material_risks_disclosed_notes:body.material_risks_disclosed_notes,
      complaints_process_disclosed:  body.complaints_process_disclosed,
      disclosure_method:             body.disclosure_method,
    });

    const stmt = db.prepare(`
      INSERT INTO client_engagements (
        engagement_name, contact_id, account_id,
        assigned_broker_id, assigned_admin_id,
        stage, engagement_type, source_of_lead,
        current_insurer, current_premium, currency, existing_cover_summary,
        identified_risks, client_needs_summary, risk_priority,
        fact_find_completed, needs_analysis_completed, proposal_prepared,
        advice_presented, disclosure_completed, policy_wording_provided,
        key_risks_explained, excess_explained, premium_explained,
        limitations_explained, client_questions_answered,
        client_decision, decline_reason, inception_date, expected_premium,
        suitability_confirmed, client_understanding_confirmed,
        alternative_options_considered, conduct_concern_flag, conduct_notes,
        notes,
        fsp_licence_disclosed, broker_identity_disclosed,
        product_costs_disclosed, product_costs_disclosed_notes,
        material_risks_disclosed, material_risks_disclosed_notes,
        complaints_process_disclosed, disclosure_method,
        disclosure_timestamp, disclosing_broker_id,
        created_by, created_at, updated_at
      ) VALUES (
        @engagement_name, @contact_id, @account_id,
        @assigned_broker_id, @assigned_admin_id,
        @stage, @engagement_type, @source_of_lead,
        @current_insurer, @current_premium, @currency, @existing_cover_summary,
        @identified_risks, @client_needs_summary, @risk_priority,
        @fact_find_completed, @needs_analysis_completed, @proposal_prepared,
        @advice_presented, @disclosure_completed, @policy_wording_provided,
        @key_risks_explained, @excess_explained, @premium_explained,
        @limitations_explained, @client_questions_answered,
        @client_decision, @decline_reason, @inception_date, @expected_premium,
        @suitability_confirmed, @client_understanding_confirmed,
        @alternative_options_considered, @conduct_concern_flag, @conduct_notes,
        @notes,
        @fsp_licence_disclosed, @broker_identity_disclosed,
        @product_costs_disclosed, @product_costs_disclosed_notes,
        @material_risks_disclosed, @material_risks_disclosed_notes,
        @complaints_process_disclosed, @disclosure_method,
        @disclosure_timestamp, @disclosing_broker_id,
        @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run({
      engagement_name: body.engagement_name,
      contact_id: body.contact_id ?? null,
      account_id: body.account_id ?? null,
      assigned_broker_id: body.assigned_broker_id,
      assigned_admin_id: body.assigned_admin_id ?? null,
      stage: body.stage ?? 'Prospect',
      engagement_type: body.engagement_type,
      source_of_lead: body.source_of_lead ?? null,
      current_insurer: body.current_insurer ?? null,
      current_premium: body.current_premium ?? null,
      currency: body.currency || 'ZAR',
      existing_cover_summary: body.existing_cover_summary ?? null,
      identified_risks: body.identified_risks ?? null,
      client_needs_summary: body.client_needs_summary ?? null,
      risk_priority: body.risk_priority ?? null,
      fact_find_completed: body.fact_find_completed ? 1 : 0,
      needs_analysis_completed: body.needs_analysis_completed ? 1 : 0,
      proposal_prepared: body.proposal_prepared ? 1 : 0,
      advice_presented: body.advice_presented ? 1 : 0,
      disclosure_completed: body.disclosure_completed ? 1 : 0,
      policy_wording_provided: body.policy_wording_provided ? 1 : 0,
      key_risks_explained: body.key_risks_explained ? 1 : 0,
      excess_explained: body.excess_explained ? 1 : 0,
      premium_explained: body.premium_explained ? 1 : 0,
      limitations_explained: body.limitations_explained ? 1 : 0,
      client_questions_answered: body.client_questions_answered ? 1 : 0,
      client_decision: body.client_decision ?? null,
      decline_reason: body.decline_reason ?? null,
      inception_date: body.inception_date ?? null,
      expected_premium: body.expected_premium ?? null,
      suitability_confirmed: body.suitability_confirmed ? 1 : 0,
      client_understanding_confirmed: body.client_understanding_confirmed ? 1 : 0,
      alternative_options_considered: body.alternative_options_considered ?? null,
      conduct_concern_flag: body.conduct_concern_flag ? 1 : 0,
      conduct_notes: body.conduct_notes ?? null,
      notes: body.notes ?? null,
      fsp_licence_disclosed:          body.fsp_licence_disclosed ?? null,
      broker_identity_disclosed:      body.broker_identity_disclosed ? 1 : 0,
      product_costs_disclosed:        body.product_costs_disclosed ? 1 : 0,
      product_costs_disclosed_notes:  body.product_costs_disclosed_notes ?? null,
      material_risks_disclosed:       body.material_risks_disclosed ? 1 : 0,
      material_risks_disclosed_notes: body.material_risks_disclosed_notes ?? null,
      complaints_process_disclosed:   body.complaints_process_disclosed ?? null,
      disclosure_method:              body.disclosure_method ?? null,
      disclosure_timestamp:           preStatusDraft === 'Complete' ? new Date().toISOString() : null,
      disclosing_broker_id:           preStatusDraft === 'Complete' ? req.session.userId : null,
      created_by: req.session.userId,
    });

    const created = db.prepare('SELECT * FROM client_engagements WHERE id = ?').get(result.lastInsertRowid);
    created.presale_disclosure_status = evalDisclosureStatus(created);

    res.locals.logAudit({ action: 'CREATE', module: 'client_engagements', recordId: result.lastInsertRowid, newValue: created, description: 'Engagement created' });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update with stage progression logic
// ---------------------------------------------------------------------------
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const existing = db.prepare('SELECT * FROM client_engagements WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    // Edit-lock gate — every saved engagement requires admin password to edit.
    const unlock = verifyEditUnlock(req, res, db, { module: 'client_engagements', recordId: id });
    if (!unlock.ok) return res.status(unlock.status).json({ error: unlock.error, code: unlock.code });

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const body = req.body;

    // --- Stage progression logic ---
    const incomingStage = body.stage !== undefined ? body.stage : existing.stage;
    const existingStageIdx = STAGE_ORDER.indexOf(existing.stage);
    const incomingStageIdx = STAGE_ORDER.indexOf(incomingStage);

    if (incomingStage && incomingStage !== existing.stage) {
      // Determine disclosure_completed and client_decision as they will be after this update
      const disclosureCompleted =
        body.disclosure_completed !== undefined
          ? (body.disclosure_completed ? 1 : 0)
          : existing.disclosure_completed;
      const clientDecision =
        body.client_decision !== undefined ? body.client_decision : existing.client_decision;

      const advicePresentedIdx = STAGE_ORDER.indexOf('Advice Presented');
      const implementedIdx = STAGE_ORDER.indexOf('Implemented / Active');

      // Cannot advance past "Advice Presented" unless disclosure_completed=1 AND client_decision="Accepted"
      if (
        incomingStageIdx > advicePresentedIdx &&
        existingStageIdx <= advicePresentedIdx
      ) {
        if (!disclosureCompleted || clientDecision !== 'Accepted') {
          return res.status(422).json({
            error:
              'Cannot advance past "Advice Presented" unless disclosure_completed is true and client_decision is "Accepted".',
          });
        }
      }

      // Cannot set to "Implemented / Active" unless a policy is linked
      if (incomingStageIdx === implementedIdx) {
        const linkedPolicy = db
          .prepare('SELECT id FROM policies WHERE engagement_id = ? LIMIT 1')
          .get(id);
        if (!linkedPolicy) {
          return res.status(422).json({
            error:
              'Cannot set stage to "Implemented / Active" unless at least one policy is linked to this engagement.',
          });
        }
      }
    }

    // Build the updated record by merging existing with incoming body
    const updated = {
      engagement_name: body.engagement_name ?? existing.engagement_name,
      contact_id: body.contact_id !== undefined ? (body.contact_id ?? null) : existing.contact_id,
      account_id: body.account_id !== undefined ? (body.account_id ?? null) : existing.account_id,
      assigned_broker_id: body.assigned_broker_id ?? existing.assigned_broker_id,
      assigned_admin_id: body.assigned_admin_id !== undefined ? (body.assigned_admin_id ?? null) : existing.assigned_admin_id,
      stage: incomingStage,
      engagement_type: body.engagement_type ?? existing.engagement_type,
      source_of_lead: body.source_of_lead !== undefined ? body.source_of_lead : existing.source_of_lead,
      current_insurer: body.current_insurer !== undefined ? body.current_insurer : existing.current_insurer,
      current_premium: body.current_premium !== undefined ? body.current_premium : existing.current_premium,
      currency: body.currency !== undefined ? (body.currency || 'ZAR') : (existing.currency || 'ZAR'),
      existing_cover_summary: body.existing_cover_summary !== undefined ? body.existing_cover_summary : existing.existing_cover_summary,
      identified_risks: body.identified_risks !== undefined ? body.identified_risks : existing.identified_risks,
      client_needs_summary: body.client_needs_summary !== undefined ? body.client_needs_summary : existing.client_needs_summary,
      risk_priority: body.risk_priority !== undefined ? body.risk_priority : existing.risk_priority,
      fact_find_completed: body.fact_find_completed !== undefined ? (body.fact_find_completed ? 1 : 0) : existing.fact_find_completed,
      needs_analysis_completed: body.needs_analysis_completed !== undefined ? (body.needs_analysis_completed ? 1 : 0) : existing.needs_analysis_completed,
      proposal_prepared: body.proposal_prepared !== undefined ? (body.proposal_prepared ? 1 : 0) : existing.proposal_prepared,
      advice_presented: body.advice_presented !== undefined ? (body.advice_presented ? 1 : 0) : existing.advice_presented,
      disclosure_completed: body.disclosure_completed !== undefined ? (body.disclosure_completed ? 1 : 0) : existing.disclosure_completed,
      policy_wording_provided: body.policy_wording_provided !== undefined ? (body.policy_wording_provided ? 1 : 0) : existing.policy_wording_provided,
      key_risks_explained: body.key_risks_explained !== undefined ? (body.key_risks_explained ? 1 : 0) : existing.key_risks_explained,
      excess_explained: body.excess_explained !== undefined ? (body.excess_explained ? 1 : 0) : existing.excess_explained,
      premium_explained: body.premium_explained !== undefined ? (body.premium_explained ? 1 : 0) : existing.premium_explained,
      limitations_explained: body.limitations_explained !== undefined ? (body.limitations_explained ? 1 : 0) : existing.limitations_explained,
      client_questions_answered: body.client_questions_answered !== undefined ? (body.client_questions_answered ? 1 : 0) : existing.client_questions_answered,
      client_decision: body.client_decision !== undefined ? body.client_decision : existing.client_decision,
      decline_reason: body.decline_reason !== undefined ? body.decline_reason : existing.decline_reason,
      inception_date: body.inception_date !== undefined ? body.inception_date : existing.inception_date,
      expected_premium: body.expected_premium !== undefined ? body.expected_premium : existing.expected_premium,
      suitability_confirmed: body.suitability_confirmed !== undefined ? (body.suitability_confirmed ? 1 : 0) : existing.suitability_confirmed,
      client_understanding_confirmed: body.client_understanding_confirmed !== undefined ? (body.client_understanding_confirmed ? 1 : 0) : existing.client_understanding_confirmed,
      alternative_options_considered: body.alternative_options_considered !== undefined ? body.alternative_options_considered : existing.alternative_options_considered,
      conduct_concern_flag: body.conduct_concern_flag !== undefined ? (body.conduct_concern_flag ? 1 : 0) : existing.conduct_concern_flag,
      conduct_notes: body.conduct_notes !== undefined ? body.conduct_notes : existing.conduct_notes,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      fsp_licence_disclosed:
        body.fsp_licence_disclosed !== undefined ? body.fsp_licence_disclosed : existing.fsp_licence_disclosed,
      broker_identity_disclosed:
        body.broker_identity_disclosed !== undefined ? (body.broker_identity_disclosed ? 1 : 0) : existing.broker_identity_disclosed,
      product_costs_disclosed:
        body.product_costs_disclosed !== undefined ? (body.product_costs_disclosed ? 1 : 0) : existing.product_costs_disclosed,
      product_costs_disclosed_notes:
        body.product_costs_disclosed_notes !== undefined ? body.product_costs_disclosed_notes : existing.product_costs_disclosed_notes,
      material_risks_disclosed:
        body.material_risks_disclosed !== undefined ? (body.material_risks_disclosed ? 1 : 0) : existing.material_risks_disclosed,
      material_risks_disclosed_notes:
        body.material_risks_disclosed_notes !== undefined ? body.material_risks_disclosed_notes : existing.material_risks_disclosed_notes,
      complaints_process_disclosed:
        body.complaints_process_disclosed !== undefined ? body.complaints_process_disclosed : existing.complaints_process_disclosed,
      disclosure_method:
        body.disclosure_method !== undefined ? body.disclosure_method : existing.disclosure_method,
      id,
    };

    // Auto-stamp disclosure timestamp + broker on first transition to Complete.
    // Once stamped, the timestamp/broker are immutable — they can never be
    // manually edited (per GCC §4 audit requirement).
    const prevStatus = evalDisclosureStatus(existing);
    const nextStatus = evalDisclosureStatus(updated);
    let disclosure_timestamp  = existing.disclosure_timestamp;
    let disclosing_broker_id  = existing.disclosing_broker_id;
    if (nextStatus === 'Complete' && prevStatus !== 'Complete') {
      disclosure_timestamp = new Date().toISOString();
      disclosing_broker_id = req.session.userId;
    }
    // Note: we intentionally do NOT clear the stamp if the status regresses —
    // the original disclosure event remains part of the audit trail.
    updated.disclosure_timestamp = disclosure_timestamp;
    updated.disclosing_broker_id = disclosing_broker_id;

    db.prepare(`
      UPDATE client_engagements SET
        engagement_name = @engagement_name,
        contact_id = @contact_id,
        account_id = @account_id,
        assigned_broker_id = @assigned_broker_id,
        assigned_admin_id = @assigned_admin_id,
        stage = @stage,
        engagement_type = @engagement_type,
        source_of_lead = @source_of_lead,
        current_insurer = @current_insurer,
        current_premium = @current_premium,
        currency = @currency,
        existing_cover_summary = @existing_cover_summary,
        identified_risks = @identified_risks,
        client_needs_summary = @client_needs_summary,
        risk_priority = @risk_priority,
        fact_find_completed = @fact_find_completed,
        needs_analysis_completed = @needs_analysis_completed,
        proposal_prepared = @proposal_prepared,
        advice_presented = @advice_presented,
        disclosure_completed = @disclosure_completed,
        policy_wording_provided = @policy_wording_provided,
        key_risks_explained = @key_risks_explained,
        excess_explained = @excess_explained,
        premium_explained = @premium_explained,
        limitations_explained = @limitations_explained,
        client_questions_answered = @client_questions_answered,
        client_decision = @client_decision,
        decline_reason = @decline_reason,
        inception_date = @inception_date,
        expected_premium = @expected_premium,
        suitability_confirmed = @suitability_confirmed,
        client_understanding_confirmed = @client_understanding_confirmed,
        alternative_options_considered = @alternative_options_considered,
        conduct_concern_flag = @conduct_concern_flag,
        conduct_notes = @conduct_notes,
        notes = @notes,
        fsp_licence_disclosed          = @fsp_licence_disclosed,
        broker_identity_disclosed      = @broker_identity_disclosed,
        product_costs_disclosed        = @product_costs_disclosed,
        product_costs_disclosed_notes  = @product_costs_disclosed_notes,
        material_risks_disclosed       = @material_risks_disclosed,
        material_risks_disclosed_notes = @material_risks_disclosed_notes,
        complaints_process_disclosed   = @complaints_process_disclosed,
        disclosure_method              = @disclosure_method,
        disclosure_timestamp           = @disclosure_timestamp,
        disclosing_broker_id           = @disclosing_broker_id,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run(updated);

    const saved = db.prepare('SELECT * FROM client_engagements WHERE id = ?').get(id);
    saved.presale_disclosure_status = evalDisclosureStatus(saved);

    res.locals.logAudit({ action: 'UPDATE', module: 'client_engagements', recordId: id, oldValue: existing, newValue: saved, description: 'Engagement updated' });

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

    const existing = db.prepare('SELECT * FROM client_engagements WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Engagement not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.assigned_broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM client_engagements WHERE id = ?').run(id);

    res.locals.logAudit({ action: 'DELETE', module: 'client_engagements', recordId: id, oldValue: existing, description: 'Engagement deleted' });

    res.json({ success: true, id: Number(id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
