'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');

// Apply requireAuth to all policy-section routes
router.use(requireAuth);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 1000;

function parsePage(query) {
  const page = parseInt(query.page, 10);
  return page > 0 ? page : 1;
}

/**
 * Enforce gap logic:
 * If risk_exists=1 AND recommended_for_cover=1 AND implemented=0
 * then gap_identified MUST be 1 regardless of what was supplied.
 */
function applyGapLogic(data) {
  if (data.risk_exists === 1 && data.recommended_for_cover === 1 && data.implemented === 0) {
    data.gap_identified = 1;
  }
  return data;
}

// ---------------------------------------------------------------------------
// GET / — list with optional filters, paginated
// ---------------------------------------------------------------------------
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { policy_id, gap_identified, contact_id, account_id, section_type } = req.query;
    const page = parsePage(req.query);
    const requestedLimit = parseInt(req.query.limit, 10);
    const pageSize = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_PAGE_SIZE)
      : PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    const params = [];

    // Broker isolation: filter sections by policy's assigned_broker_id
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId) {
      conditions.push('pol.assigned_broker_id = ?');
      params.push(scopedBrokerId);
    }

    if (policy_id) {
      conditions.push('ps.policy_id = ?');
      params.push(policy_id);
    }

    if (gap_identified !== undefined) {
      conditions.push('ps.gap_identified = ?');
      params.push(gap_identified === 'true' || gap_identified === '1' ? 1 : 0);
    }

    if (contact_id) {
      conditions.push('ps.contact_id = ?');
      params.push(contact_id);
    }

    if (account_id) {
      conditions.push('ps.account_id = ?');
      params.push(account_id);
    }

    if (section_type) {
      conditions.push('ps.section_type = ?');
      params.push(section_type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseQuery = `
      FROM policy_sections ps
      LEFT JOIN policies pol ON ps.policy_id = pol.id
      LEFT JOIN contacts c ON ps.contact_id = c.id
      LEFT JOIN accounts a ON ps.account_id = a.id
    `;

    const countRow = db.prepare(`SELECT COUNT(*) AS total ${baseQuery} ${where}`).get(...params);
    const total = countRow.total;

    const rows = db.prepare(`
      SELECT
        ps.*,
        pol.policy_name,
        pol.policy_number,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name
      ${baseQuery}
      ${where}
      ORDER BY ps.updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id — single record with joins
// ---------------------------------------------------------------------------
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();

    const row = db.prepare(`
      SELECT
        ps.*,
        pol.policy_name,
        pol.policy_number,
        (c.first_name || ' ' || c.last_name) AS contact_name,
        a.account_name,
        creator.full_name AS created_by_name,
        ce.engagement_name
      FROM policy_sections ps
      LEFT JOIN policies pol ON ps.policy_id = pol.id
      LEFT JOIN contacts c ON ps.contact_id = c.id
      LEFT JOIN accounts a ON ps.account_id = a.id
      LEFT JOIN users creator ON ps.created_by = creator.id
      LEFT JOIN client_engagements ce ON ps.engagement_id = ce.id
      WHERE ps.id = ?
    `).get(req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Policy section not found' });
    }

    // Broker isolation: check via the linked policy
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && row.policy_id) {
      const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(row.policy_id);
      if (policy && policy.assigned_broker_id !== scopedBrokerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

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
    if (!body.section_name) missing.push('section_name');
    if (!body.policy_id) missing.push('policy_id');
    if (!body.section_type) missing.push('section_type');
    if (!body.section_category) missing.push('section_category');
    if (body.risk_exists === undefined || body.risk_exists === null) missing.push('risk_exists');
    if (body.cover_required === undefined || body.cover_required === null) missing.push('cover_required');
    if (body.currently_covered === undefined || body.currently_covered === null) missing.push('currently_covered');
    if (body.recommended_for_cover === undefined || body.recommended_for_cover === null) missing.push('recommended_for_cover');
    if (body.implemented === undefined || body.implemented === null) missing.push('implemented');
    if (body.gap_identified === undefined || body.gap_identified === null) missing.push('gap_identified');
    if (!body.needs_analysis_status) missing.push('needs_analysis_status');
    if (missing.length) {
      return res.status(400).json({ error: 'Missing required fields', fields: missing });
    }

    // Build the data object and enforce gap logic
    const data = applyGapLogic({
      section_name: body.section_name,
      policy_id: body.policy_id,
      contact_id: body.contact_id ?? null,
      account_id: body.account_id ?? null,
      engagement_id: body.engagement_id ?? null,
      advice_record_id: body.advice_record_id ?? null,
      asset_id: body.asset_id ?? null,
      section_type: body.section_type,
      section_category: body.section_category,
      risk_exists: body.risk_exists ? 1 : 0,
      cover_required: body.cover_required ? 1 : 0,
      currently_covered: body.currently_covered ? 1 : 0,
      recommended_for_cover: body.recommended_for_cover ? 1 : 0,
      implemented: body.implemented ? 1 : 0,
      gap_identified: body.gap_identified ? 1 : 0,
      gap_severity: body.gap_severity ?? null,
      client_accepted_recommendation: body.client_accepted_recommendation ? 1 : 0,
      client_declined_recommendation: body.client_declined_recommendation ? 1 : 0,
      decline_reason: body.decline_reason ?? null,
      sum_insured_limit: body.sum_insured_limit ?? null,
      premium: body.premium ?? null,
      currency: body.currency || 'ZAR',
      excess: body.excess ?? null,
      excess_pct_claim: body.excess_pct_claim ?? null,
      excess_pct_insured: body.excess_pct_insured ?? null,
      minimum_excess: body.minimum_excess ?? null,
      excess_structure_notes: body.excess_structure_notes ?? null,
      buy_down_applies: body.buy_down_applies ? 1 : 0,
      buy_down_premium: body.buy_down_premium ?? null,
      section_provider: body.section_provider ?? null,
      cover_description: body.cover_description ?? null,
      main_exclusions_limitations: body.main_exclusions_limitations ?? null,
      disclosure_explained: body.disclosure_explained ? 1 : 0,
      client_understanding_confirmed: body.client_understanding_confirmed ? 1 : 0,
      needs_analysis_status: body.needs_analysis_status,
      conduct_concern_flag: body.conduct_concern_flag ? 1 : 0,
      conduct_notes: body.conduct_notes ?? null,
      last_reviewed_date: body.last_reviewed_date ?? null,
      next_review_date: body.next_review_date ?? null,
      notes: body.notes ?? null,
      created_by: req.session.userId,
    });

    const result = db.prepare(`
      INSERT INTO policy_sections (
        section_name, policy_id, contact_id, account_id, engagement_id,
        advice_record_id, asset_id,
        section_type, section_category,
        risk_exists, cover_required, currently_covered,
        recommended_for_cover, implemented, gap_identified,
        gap_severity, client_accepted_recommendation, client_declined_recommendation,
        decline_reason, sum_insured_limit, premium, currency, excess, excess_pct_claim, excess_pct_insured, minimum_excess, excess_structure_notes,
        buy_down_applies, buy_down_premium, section_provider,
        cover_description, main_exclusions_limitations,
        disclosure_explained, client_understanding_confirmed,
        needs_analysis_status, conduct_concern_flag, conduct_notes,
        last_reviewed_date, next_review_date, notes,
        created_by, created_at, updated_at
      ) VALUES (
        @section_name, @policy_id, @contact_id, @account_id, @engagement_id,
        @advice_record_id, @asset_id,
        @section_type, @section_category,
        @risk_exists, @cover_required, @currently_covered,
        @recommended_for_cover, @implemented, @gap_identified,
        @gap_severity, @client_accepted_recommendation, @client_declined_recommendation,
        @decline_reason, @sum_insured_limit, @premium, @currency, @excess, @excess_pct_claim, @excess_pct_insured, @minimum_excess, @excess_structure_notes,
        @buy_down_applies, @buy_down_premium, @section_provider,
        @cover_description, @main_exclusions_limitations,
        @disclosure_explained, @client_understanding_confirmed,
        @needs_analysis_status, @conduct_concern_flag, @conduct_notes,
        @last_reviewed_date, @next_review_date, @notes,
        @created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(data);

    const created = db.prepare('SELECT * FROM policy_sections WHERE id = ?').get(result.lastInsertRowid);

    res.locals.logAudit({ action: 'CREATE', module: 'policy_sections', recordId: result.lastInsertRowid, newValue: created, description: 'Policy section created' });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update, re-applying gap logic
// ---------------------------------------------------------------------------
router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = req.params.id;

    const existing = db.prepare('SELECT * FROM policy_sections WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Policy section not found' });
    }

    // Broker isolation: check via the linked policy
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.policy_id) {
      const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(existing.policy_id);
      if (policy && policy.assigned_broker_id !== scopedBrokerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const body = req.body;

    // Merge existing with incoming values, then apply gap logic
    const merged = applyGapLogic({
      section_name: body.section_name ?? existing.section_name,
      policy_id: body.policy_id ?? existing.policy_id,
      contact_id: body.contact_id !== undefined ? (body.contact_id ?? null) : existing.contact_id,
      account_id: body.account_id !== undefined ? (body.account_id ?? null) : existing.account_id,
      engagement_id: body.engagement_id !== undefined ? (body.engagement_id ?? null) : existing.engagement_id,
      advice_record_id: body.advice_record_id !== undefined ? (body.advice_record_id ?? null) : existing.advice_record_id,
      asset_id: body.asset_id !== undefined ? (body.asset_id ?? null) : existing.asset_id,
      section_type: body.section_type ?? existing.section_type,
      section_category: body.section_category ?? existing.section_category,
      risk_exists: body.risk_exists !== undefined ? (body.risk_exists ? 1 : 0) : existing.risk_exists,
      cover_required: body.cover_required !== undefined ? (body.cover_required ? 1 : 0) : existing.cover_required,
      currently_covered: body.currently_covered !== undefined ? (body.currently_covered ? 1 : 0) : existing.currently_covered,
      recommended_for_cover: body.recommended_for_cover !== undefined ? (body.recommended_for_cover ? 1 : 0) : existing.recommended_for_cover,
      implemented: body.implemented !== undefined ? (body.implemented ? 1 : 0) : existing.implemented,
      gap_identified: body.gap_identified !== undefined ? (body.gap_identified ? 1 : 0) : existing.gap_identified,
      gap_severity: body.gap_severity !== undefined ? body.gap_severity : existing.gap_severity,
      client_accepted_recommendation: body.client_accepted_recommendation !== undefined ? (body.client_accepted_recommendation ? 1 : 0) : existing.client_accepted_recommendation,
      client_declined_recommendation: body.client_declined_recommendation !== undefined ? (body.client_declined_recommendation ? 1 : 0) : existing.client_declined_recommendation,
      decline_reason: body.decline_reason !== undefined ? body.decline_reason : existing.decline_reason,
      sum_insured_limit: body.sum_insured_limit !== undefined ? body.sum_insured_limit : existing.sum_insured_limit,
      premium: body.premium !== undefined ? body.premium : existing.premium,
      currency: body.currency !== undefined ? (body.currency || 'ZAR') : (existing.currency || 'ZAR'),
      excess: body.excess !== undefined ? body.excess : existing.excess,
      excess_pct_claim: body.excess_pct_claim !== undefined ? body.excess_pct_claim : existing.excess_pct_claim,
      excess_pct_insured: body.excess_pct_insured !== undefined ? body.excess_pct_insured : existing.excess_pct_insured,
      minimum_excess: body.minimum_excess !== undefined ? body.minimum_excess : existing.minimum_excess,
      excess_structure_notes: body.excess_structure_notes !== undefined ? body.excess_structure_notes : existing.excess_structure_notes,
      buy_down_applies: body.buy_down_applies !== undefined ? (body.buy_down_applies ? 1 : 0) : existing.buy_down_applies,
      buy_down_premium: body.buy_down_premium !== undefined ? body.buy_down_premium : existing.buy_down_premium,
      section_provider: body.section_provider !== undefined ? body.section_provider : existing.section_provider,
      cover_description: body.cover_description !== undefined ? body.cover_description : existing.cover_description,
      main_exclusions_limitations: body.main_exclusions_limitations !== undefined ? body.main_exclusions_limitations : existing.main_exclusions_limitations,
      disclosure_explained: body.disclosure_explained !== undefined ? (body.disclosure_explained ? 1 : 0) : existing.disclosure_explained,
      client_understanding_confirmed: body.client_understanding_confirmed !== undefined ? (body.client_understanding_confirmed ? 1 : 0) : existing.client_understanding_confirmed,
      needs_analysis_status: body.needs_analysis_status ?? existing.needs_analysis_status,
      conduct_concern_flag: body.conduct_concern_flag !== undefined ? (body.conduct_concern_flag ? 1 : 0) : existing.conduct_concern_flag,
      conduct_notes: body.conduct_notes !== undefined ? body.conduct_notes : existing.conduct_notes,
      last_reviewed_date: body.last_reviewed_date !== undefined ? body.last_reviewed_date : existing.last_reviewed_date,
      next_review_date: body.next_review_date !== undefined ? body.next_review_date : existing.next_review_date,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      id,
    });

    db.prepare(`
      UPDATE policy_sections SET
        section_name = @section_name,
        policy_id = @policy_id,
        contact_id = @contact_id,
        account_id = @account_id,
        engagement_id = @engagement_id,
        advice_record_id = @advice_record_id,
        asset_id = @asset_id,
        section_type = @section_type,
        section_category = @section_category,
        risk_exists = @risk_exists,
        cover_required = @cover_required,
        currently_covered = @currently_covered,
        recommended_for_cover = @recommended_for_cover,
        implemented = @implemented,
        gap_identified = @gap_identified,
        gap_severity = @gap_severity,
        client_accepted_recommendation = @client_accepted_recommendation,
        client_declined_recommendation = @client_declined_recommendation,
        decline_reason = @decline_reason,
        sum_insured_limit = @sum_insured_limit,
        premium = @premium,
        currency = @currency,
        excess = @excess,
        excess_pct_claim = @excess_pct_claim,
        excess_pct_insured = @excess_pct_insured,
        minimum_excess = @minimum_excess,
        excess_structure_notes = @excess_structure_notes,
        buy_down_applies = @buy_down_applies,
        buy_down_premium = @buy_down_premium,
        section_provider = @section_provider,
        cover_description = @cover_description,
        main_exclusions_limitations = @main_exclusions_limitations,
        disclosure_explained = @disclosure_explained,
        client_understanding_confirmed = @client_understanding_confirmed,
        needs_analysis_status = @needs_analysis_status,
        conduct_concern_flag = @conduct_concern_flag,
        conduct_notes = @conduct_notes,
        last_reviewed_date = @last_reviewed_date,
        next_review_date = @next_review_date,
        notes = @notes,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run(merged);

    const saved = db.prepare('SELECT * FROM policy_sections WHERE id = ?').get(id);

    res.locals.logAudit({ action: 'UPDATE', module: 'policy_sections', recordId: id, oldValue: existing, newValue: saved, description: 'Policy section updated' });

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

    const existing = db.prepare('SELECT * FROM policy_sections WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Policy section not found' });
    }

    // Broker isolation: check via the linked policy
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.policy_id) {
      const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(existing.policy_id);
      if (policy && policy.assigned_broker_id !== scopedBrokerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    db.prepare('DELETE FROM policy_sections WHERE id = ?').run(id);

    res.locals.logAudit({ action: 'DELETE', module: 'policy_sections', recordId: id, oldValue: existing, description: 'Policy section deleted' });

    res.json({ success: true, id: Number(id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
