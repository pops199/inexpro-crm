const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { resolveSort } = require('./view-prefs');
const { evaluateTargetMarketStatus } = require('./products');
const { verifyEditUnlock } = require('../lib/edit-lock');

const router = express.Router();

// ─── Constants ───────────────────────────────────────────────

const RISK_APPETITE_OPTS = ['Conservative', 'Moderate', 'Aggressive', 'High-Risk Commercial'];
const GAP_CATEGORY_OPTS  = ['Underinsurance', 'Missing cover type', 'Outdated values', 'Other'];
const COMMISSION_OPTS    = [
  'Yes — disclosed in writing',
  'Yes — disclosed verbally',
  'Not applicable (fee-based)',
];
const REJECTION_OPTS = ['Cost', 'Preferred different insurer', 'Will self-insure', 'Other'];
const ACK_METHOD_OPTS = [
  'Signed physical copy',
  'Electronic signature',
  'Email confirmation',
  'WhatsApp confirmation',
  'Verbal (with witness name)',
];

// Target-market mapping used by the suitability match calculator.
// Reference mapping used until the Product Library (Section 4.5) ships;
// intentionally permissive so we flag only clear mismatches.
const TARGET_MARKET_MAP = {
  'Conservative':           ['Personal', 'Agri'],
  'Moderate':               ['Personal', 'Commercial', 'Agri', 'Mixed'],
  'Aggressive':             ['Personal', 'Commercial', 'Transport', 'Mixed'],
  'High-Risk Commercial':   ['Commercial', 'Transport', 'Mixed'],
};

// Pre-Sale Disclosure checker (MOD-02 / FAIS GCC §4). Mirrors the server-side
// evaluator in engagements.js — duplicated here to avoid a circular require.
function engagementDisclosureComplete(db, engagementId) {
  if (!engagementId) return { complete: false, reason: 'no engagement linked' };
  const e = db.prepare(`
    SELECT fsp_licence_disclosed, broker_identity_disclosed,
           product_costs_disclosed, product_costs_disclosed_notes,
           material_risks_disclosed, material_risks_disclosed_notes,
           complaints_process_disclosed, disclosure_method
    FROM client_engagements WHERE id = ?
  `).get(engagementId);
  if (!e) return { complete: false, reason: 'engagement not found' };
  const fspOk        = ['Yes — Written', 'Yes — Verbal'].includes(e.fsp_licence_disclosed);
  const brokerOk     = !!e.broker_identity_disclosed;
  const costsOk      = !!e.product_costs_disclosed && !!(e.product_costs_disclosed_notes && e.product_costs_disclosed_notes.trim());
  const risksOk      = !!e.material_risks_disclosed && !!(e.material_risks_disclosed_notes && e.material_risks_disclosed_notes.trim());
  const complaintsOk = ['Yes — Written', 'Yes — Verbal', 'Complaints form provided'].includes(e.complaints_process_disclosed);
  const methodOk     = ['In-person meeting','Phone call','Video call','Email','WhatsApp','Signed form'].includes(e.disclosure_method);
  return {
    complete: fspOk && brokerOk && costsOk && risksOk && complaintsOk && methodOk,
    reason: [
      !fspOk        && 'FSP licence disclosure',
      !brokerOk     && 'broker identity/role disclosure',
      !costsOk      && 'product costs disclosure + notes',
      !risksOk      && 'material risks disclosure + notes',
      !complaintsOk && 'complaints process disclosure',
      !methodOk     && 'disclosure method',
    ].filter(Boolean).join(', ')
  };
}

/**
 * Compute the suitability match score for an ROA.
 * Returns 'Match' | 'Mismatch' | 'Review Required'.
 */
function computeSuitabilityScore(db, riskAppetite, policyId) {
  if (!riskAppetite) return 'Review Required';
  if (!policyId)     return 'Review Required';
  const policy = db.prepare('SELECT policy_type FROM policies WHERE id = ?').get(policyId);
  if (!policy || !policy.policy_type) return 'Review Required';
  const allowed = TARGET_MARKET_MAP[riskAppetite];
  if (!allowed) return 'Review Required';
  return allowed.includes(policy.policy_type) ? 'Match' : 'Mismatch';
}

/**
 * Derive the list of target-market tokens to compare against the product's
 * `target_client_type` allow-list. Returns an array of strings drawn from
 *   • Account.business_type     (e.g. "Trust", "Pty Ltd", "Sole Proprietor")
 *   • Contact.client_category   (e.g. "Personal Lines", "Commercial Lines")
 * The product matches when ANY token is in its target_client_type array (or
 * the product carries the 'Any' wildcard).
 *
 * If neither party is set, returns an empty array (caller treats as
 * "review required" rather than auto-confirming).
 */
function deriveClientType(db, contactId, accountId) {
  const tokens = [];
  if (accountId) {
    const a = db.prepare('SELECT business_type FROM accounts WHERE id = ?').get(accountId);
    if (a && a.business_type) tokens.push(a.business_type);
  }
  if (contactId) {
    const c = db.prepare('SELECT client_category, related_account_id FROM contacts WHERE id = ?').get(contactId);
    if (c && c.client_category) tokens.push(c.client_category);
    // If the contact is linked to an account, also pull that account's type.
    if (c && c.related_account_id && !accountId) {
      const a = db.prepare('SELECT business_type FROM accounts WHERE id = ?').get(c.related_account_id);
      if (a && a.business_type) tokens.push(a.business_type);
    }
  }
  return tokens;
}

/**
 * Run the Product Library target-market evaluation for an ROA, returning
 * { status, mismatches, client_type_mismatch } (status is one of
 * 'Confirmed' | 'Review Required' | 'Mismatch'). When no product is linked
 * the status is null so callers can fall back to the legacy logic.
 */
function computeProductTargetMarket(db, productId, ctx) {
  if (!productId) return { status: null, mismatches: [], client_type_mismatch: false };
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return { status: 'Review Required', mismatches: ['Product not found'], client_type_mismatch: false };
  return evaluateTargetMarketStatus(product, ctx);
}

/**
 * Build an auto-populated summary of existing cover for a contact/account
 * at the moment the ROA is saved — insurer, policy number, product category.
 */
function buildExistingCoverSummary(db, contactId, accountId) {
  const where = [];
  const params = [];
  if (contactId) { where.push('contact_id = ?'); params.push(contactId); }
  if (accountId) { where.push('account_id = ?'); params.push(accountId); }
  if (!where.length) return null;
  const rows = db.prepare(`
    SELECT insurer, policy_number, product_category, policy_status
    FROM policies
    WHERE (${where.join(' OR ')}) AND policy_status IN ('Active','Pending','Amended')
    ORDER BY insurer, policy_number
  `).all(...params);
  if (!rows.length) return 'No active policies on file.';
  return rows.map(r =>
    `• ${r.insurer || 'Unknown insurer'} — ${r.policy_number || 'no number'}` +
    `${r.product_category ? ` (${r.product_category})` : ''}` +
    ` [${r.policy_status}]`
  ).join('\n');
}

/**
 * Normalise a JSON-or-array payload to a stringified JSON array ready for
 * storage. Returns null when the input is empty.
 */
function toJsonArray(v) {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
  if (typeof v === 'string') {
    // Try to parse; if it's already JSON pass it through
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) && parsed.length ? JSON.stringify(parsed) : null;
    } catch (_) {
      // fall through — treat as single-item array
      return JSON.stringify([v]);
    }
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate an advice record number in the format AR-YYYYMMDD-XXXX.
 * Finds the highest sequence number already used for today's date prefix
 * and increments by one.
 */
function generateAdviceRecordNumber(db) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const prefix = `AR-${today}-`;

  const last = db.prepare(
    `SELECT advice_record_number FROM advice_records
     WHERE advice_record_number LIKE ?
     ORDER BY advice_record_number DESC
     LIMIT 1`
  ).get(`${prefix}%`);

  let seq = 1;
  if (last) {
    const parts = last.advice_record_number.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── GET / — list with optional filters, paginated ───────────

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { contact_id, account_id, policy_id, broker_id, advice_type, page = 1, limit = 25 } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const params     = [];

  // Broker isolation: brokers can only see their own advice records
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push('ar.broker_id = ?');
    params.push(scopedBrokerId);
  } else if (broker_id) {
    conditions.push('ar.broker_id = ?');
    params.push(broker_id);
  }

  if (contact_id) { conditions.push('ar.contact_id = ?');  params.push(contact_id); }
  if (account_id) { conditions.push('ar.account_id = ?');  params.push(account_id); }
  if (policy_id)  { conditions.push('ar.policy_id = ?');   params.push(policy_id); }
  if (advice_type){ conditions.push('ar.advice_type = ?'); params.push(advice_type); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM advice_records ar
    ${where}
  `).get(...params);

  const resolved = resolveSort('advice_records', req.query.sort, req.query.dir);
  const orderBy = resolved
    ? `ORDER BY ${resolved.sql} ${resolved.dir}, ar.id DESC`
    : `ORDER BY ar.advice_date DESC, ar.id DESC`;

  const rows = db.prepare(`
    SELECT
      ar.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      a.account_name,
      p.policy_number,
      p.policy_name,
      b.full_name  AS broker_name,
      pb.full_name AS prepared_by_name
    FROM advice_records ar
    LEFT JOIN contacts  c  ON c.id  = ar.contact_id
    LEFT JOIN accounts  a  ON a.id  = ar.account_id
    LEFT JOIN policies  p  ON p.id  = ar.policy_id
    LEFT JOIN users     b  ON b.id  = ar.broker_id
    LEFT JOIN users     pb ON pb.id = ar.prepared_by_id
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  return res.json({
    data:       rows,
    pagination: {
      page:       pageNum,
      limit:      limitNum,
      total:      countRow.total,
      totalPages: Math.ceil(countRow.total / limitNum)
    }
  });
});

// ─── GET /:id — single record with joins ─────────────────────

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();

  const row = db.prepare(`
    SELECT
      ar.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      a.account_name,
      e.engagement_name,
      e.disclosure_timestamp AS engagement_disclosure_ts,
      dsc.full_name          AS engagement_disclosing_broker,
      p.policy_number,
      p.policy_name,
      b.full_name  AS broker_name,
      pb.full_name AS prepared_by_name,
      cb.full_name AS created_by_name
    FROM advice_records ar
    LEFT JOIN contacts          c  ON c.id  = ar.contact_id
    LEFT JOIN accounts          a  ON a.id  = ar.account_id
    LEFT JOIN client_engagements e ON e.id  = ar.engagement_id
    LEFT JOIN users             dsc ON dsc.id = e.disclosing_broker_id
    LEFT JOIN policies          p  ON p.id  = ar.policy_id
    LEFT JOIN users             b  ON b.id  = ar.broker_id
    LEFT JOIN users             pb ON pb.id = ar.prepared_by_id
    LEFT JOIN users             cb ON cb.id = ar.created_by
    WHERE ar.id = ?
  `).get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: 'Advice record not found' });
  }

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && row.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  return res.json(row);
});

// ─── POST / — create ─────────────────────────────────────────

router.post('/', requireAuth, (req, res) => {
  const db = getDb();

  const b = req.body || {};

  // Block creation when the broker is suspended from advice (RE5 lapsed,
  // debarred, etc). Spec 4.15 — "auto-suspend broker from creating new ROA
  // records until resolved".
  if (b.broker_id) {
    const bp = db.prepare(
      'SELECT id, suspended_from_advice, good_standing_status FROM broker_profiles WHERE user_id = ?'
    ).get(b.broker_id);
    if (bp && bp.suspended_from_advice) {
      return res.status(403).json({
        error: 'This broker is suspended from creating new advice records ' +
               '(RE5 deadline lapsed or debarred). Resolve the fitness issue ' +
               'in Admin → Broker Fitness before continuing.'
      });
    }
  }

  // Required field validation — keep the original minimal guard for
  // draft-saves; completion-level validation runs only when mark_complete=1.
  if (!b.broker_id || !b.prepared_by_id || !b.advice_date || !b.advice_type ||
      !b.client_needs_identified || !b.risk_analysis_summary ||
      !b.recommendation_given || !b.reason_product_suitable) {
    return res.status(400).json({
      error: 'Required fields: broker_id, prepared_by_id, advice_date, advice_type, ' +
             'client_needs_identified, risk_analysis_summary, recommendation_given, reason_product_suitable'
    });
  }

  // COI Declaration cannot be blank — spec GCC 3A (blocks save even on draft)
  if (b.conflict_of_interest_flag !== undefined &&
      b.conflict_of_interest_flag !== '' &&
      !['Yes', 'No'].includes(b.conflict_of_interest_flag)) {
    return res.status(400).json({ error: 'Conflict of Interest declaration must be "Yes" or "No".' });
  }
  if (b.conflict_of_interest_flag === 'Yes' && !b.conflict_of_interest_description) {
    return res.status(400).json({
      error: 'Conflict of Interest description is required when a financial interest is declared.'
    });
  }

  // Client rejection reason required when declined
  if (b.client_decision === 'Declined' && !b.client_rejection_reason) {
    return res.status(400).json({
      error: 'Client rejection reason is required when the decision is Declined.'
    });
  }

  // Acknowledgment date (when provided) must be on/after advice_date
  if (b.acknowledgement_date && b.advice_date &&
      String(b.acknowledgement_date) < String(b.advice_date)) {
    return res.status(400).json({
      error: 'Acknowledgment date must be on or after the ROA creation (advice) date.'
    });
  }

  // Completion-level validation — blocks marking as Complete unless every
  // mandatory suitability/COI/disclosure field is populated.
  if (b.roa_completed) {
    const missing = [];
    if (!b.client_risk_appetite)          missing.push('Client Risk Appetite');
    if (b.total_financial_exposure === undefined || b.total_financial_exposure === null || b.total_financial_exposure === '')
                                          missing.push('Total Financial Exposure');
    if (!b.identified_gaps || (Array.isArray(b.identified_gaps) && !b.identified_gaps.length))
                                          missing.push('Identified Gaps');
    if (!b.recommendation_rationale)      missing.push('Recommendation Rationale');
    if (!b.alternatives_considered_list || !toJsonArray(b.alternatives_considered_list))
                                          missing.push('Alternatives Considered (at least one)');
    if (!b.conflict_of_interest_flag)     missing.push('Conflict of Interest Declaration');
    if (!b.commission_disclosed)          missing.push('Commission Disclosed');
    if (!b.client_acknowledgment_method)  missing.push('Client Acknowledgment Method');
    if (!b.acknowledgement_date)          missing.push('Date Acknowledgment Received');
    if (missing.length) {
      return res.status(400).json({
        error: 'Cannot mark Complete — missing mandatory fields: ' + missing.join(', ')
      });
    }
  }

  // Pre-sale disclosure gate (FAIS GCC §4) — when an engagement is linked,
  // the ROA may only be created once the disclosure checklist is Complete.
  if (b.engagement_id) {
    const gate = engagementDisclosureComplete(db, b.engagement_id);
    if (!gate.complete) {
      return res.status(422).json({
        error: 'Cannot create ROA — pre-sale disclosure on the linked engagement is incomplete. Missing: ' + gate.reason + '.'
      });
    }
  }

  // Auto-populated existing cover summary (always refreshed on save)
  const existing_cover_summary_auto = buildExistingCoverSummary(db, b.contact_id, b.account_id);

  // Suitability match score (legacy: risk-appetite × policy_type heuristic)
  const suitability_match_score = computeSuitabilityScore(db, b.client_risk_appetite, b.policy_id);

  // Target-market status (Product Library driven, Section 4.5)
  const tmCtx = {
    client_risk_appetite: b.client_risk_appetite,
    client_types:         deriveClientType(db, b.contact_id, b.account_id),
    insurable_value:      b.total_financial_exposure,
  };
  const tm = computeProductTargetMarket(db, b.product_id, tmCtx);

  // Validate per spec:
  //   - Mismatch (red, client_type outside target): supervisor co-approval required.
  //   - Review Required (amber): override reason required.
  //   - When no product linked, fall back to the legacy mismatch rule.
  if (tm.status === 'Mismatch' && !b.supervisor_co_approved_by_id) {
    return res.status(400).json({
      error: 'Target market mismatch — client type is outside this product\'s target market. ' +
             'A supervisor must co-approve this ROA before it can be saved.'
    });
  }
  if (tm.status === 'Review Required' && !b.suitability_override_reason) {
    return res.status(400).json({
      error: 'Suitability review required — one or more parameters fall outside the target market. ' +
             'Please supply a written override reason.'
    });
  }
  if (!tm.status && suitability_match_score === 'Mismatch' && !b.suitability_override_reason) {
    return res.status(400).json({
      error: 'Recommendation does not match target market for the client risk appetite. ' +
             'Please supply a written override reason.'
    });
  }

  const supervisor_co_approval_required = tm.status === 'Mismatch' ? 1 : 0;
  const supervisor_co_approved_at = b.supervisor_co_approved_by_id ? new Date().toISOString() : null;
  const target_market_mismatches_json = tm.mismatches && tm.mismatches.length
    ? JSON.stringify(tm.mismatches) : null;

  const advice_record_number = generateAdviceRecordNumber(db);

  const result = db.prepare(`
    INSERT INTO advice_records (
      advice_record_number, contact_id, account_id, engagement_id, policy_id,
      broker_id, prepared_by_id, advice_date, advice_type, trigger_event,
      client_needs_identified, risk_analysis_summary, current_cover_considered,
      shortfalls_identified, recommendation_given, alternative_options_considered,
      reason_product_suitable, consequences_of_not_proceeding,
      risks_explained, costs_explained, excess_explained,
      waiting_period_limitations_explained, exclusions_explained,
      client_understanding_confirmed, fair_outcome_considered,
      client_decision, decision_date, decision_notes,
      roa_generated, roa_generation_date, final_document_issued, issue_date,
      client_acknowledgement_received, acknowledgement_date, currency, notes,
      client_risk_appetite, total_financial_exposure, existing_cover_summary_auto,
      identified_gaps, identified_gaps_notes,
      recommendation_rationale, alternatives_considered_list,
      suitability_match_score, suitability_override_reason,
      conflict_of_interest_flag, conflict_of_interest_description,
      commission_disclosed, commission_rate_type, commission_rate_value,
      client_rejection_reason, client_rejection_notes,
      client_acknowledgment_method, acknowledgment_witness_name,
      roa_completed, roa_completed_at,
      product_id, target_market_status, target_market_mismatches,
      supervisor_co_approval_required, supervisor_co_approved_by_id, supervisor_co_approved_at,
      created_by
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?
    )
  `).run(
    advice_record_number,
    b.contact_id        || null,
    b.account_id        || null,
    b.engagement_id     || null,
    b.policy_id         || null,
    b.broker_id,
    b.prepared_by_id,
    b.advice_date,
    b.advice_type,
    b.trigger_event     || null,
    b.client_needs_identified,
    b.risk_analysis_summary,
    b.current_cover_considered              || null,
    b.shortfalls_identified                 || null,
    b.recommendation_given,
    b.alternative_options_considered        || null,
    b.reason_product_suitable,
    b.consequences_of_not_proceeding        || null,
    b.risks_explained                       ? 1 : 0,
    b.costs_explained                       ? 1 : 0,
    b.excess_explained                      ? 1 : 0,
    b.waiting_period_limitations_explained  ? 1 : 0,
    b.exclusions_explained                  ? 1 : 0,
    b.client_understanding_confirmed        ? 1 : 0,
    b.fair_outcome_considered               ? 1 : 0,
    b.client_decision                       || null,
    b.decision_date                         || null,
    b.decision_notes                        || null,
    b.roa_generated                         ? 1 : 0,
    b.roa_generation_date                   || null,
    b.final_document_issued                 ? 1 : 0,
    b.issue_date                            || null,
    b.client_acknowledgement_received       ? 1 : 0,
    b.acknowledgement_date                  || null,
    b.currency                              || 'ZAR',
    b.notes                                 || null,
    b.client_risk_appetite                  || null,
    (b.total_financial_exposure === '' || b.total_financial_exposure === undefined) ? null : Number(b.total_financial_exposure),
    existing_cover_summary_auto             || null,
    toJsonArray(b.identified_gaps),
    b.identified_gaps_notes                 || null,
    b.recommendation_rationale              || null,
    toJsonArray(b.alternatives_considered_list),
    suitability_match_score                 || null,
    b.suitability_override_reason           || null,
    b.conflict_of_interest_flag             || null,
    b.conflict_of_interest_description      || null,
    b.commission_disclosed                  || null,
    b.commission_rate_type                  || null,
    (b.commission_rate_value === '' || b.commission_rate_value === undefined) ? null : Number(b.commission_rate_value),
    b.client_rejection_reason               || null,
    b.client_rejection_notes                || null,
    b.client_acknowledgment_method          || null,
    b.acknowledgment_witness_name           || null,
    b.roa_completed                         ? 1 : 0,
    b.roa_completed                         ? new Date().toISOString() : null,
    b.product_id                            || null,
    tm.status                               || null,
    target_market_mismatches_json,
    supervisor_co_approval_required,
    b.supervisor_co_approved_by_id          || null,
    supervisor_co_approved_at,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM advice_records WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:      'CREATE',
    module:      'advice_records',
    recordId:    result.lastInsertRowid,
    newValue:    created,
    description: `Advice record ${advice_record_number} created` +
                 (b.roa_completed ? ' (marked Complete)' : '')
  });

  return res.status(201).json(created);
});

// ─── PUT /:id — update ────────────────────────────────────────

router.put('/:id', requireAuth, (req, res) => {
  const db  = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM advice_records WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Advice record not found' });
  }

  // Edit-lock gate — once an ROA has been marked Complete, every PUT requires
  // an admin password. Pre-completion edits flow through unchanged.
  if (existing.roa_completed) {
    const _u = verifyEditUnlock(req, res, db, { module: 'advice_records', recordId: id });
    if (!_u.ok) return res.status(_u.status).json({ error: _u.error, code: _u.code });
  }

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const b = req.body || {};

  // Merge: for any field not provided, fall back to existing row value.
  const pick   = (k) => b[k] !== undefined ? b[k] : existing[k];
  const pickBool = (k) => b[k] !== undefined ? (b[k] ? 1 : 0) : existing[k];

  // COI validation — same rule as create
  const coiFlag = pick('conflict_of_interest_flag');
  if (coiFlag && !['Yes', 'No'].includes(coiFlag)) {
    return res.status(400).json({ error: 'Conflict of Interest declaration must be "Yes" or "No".' });
  }
  if (coiFlag === 'Yes' && !pick('conflict_of_interest_description')) {
    return res.status(400).json({
      error: 'Conflict of Interest description is required when a financial interest is declared.'
    });
  }

  // Rejection reason required when declined
  if (pick('client_decision') === 'Declined' && !pick('client_rejection_reason')) {
    return res.status(400).json({
      error: 'Client rejection reason is required when the decision is Declined.'
    });
  }

  // Acknowledgment date must be on/after advice_date
  const ackDate = pick('acknowledgement_date');
  const advDate = pick('advice_date');
  if (ackDate && advDate && String(ackDate) < String(advDate)) {
    return res.status(400).json({
      error: 'Acknowledgment date must be on or after the ROA creation (advice) date.'
    });
  }

  // Completion-level validation if the update transitions to complete
  if (pick('roa_completed')) {
    const missing = [];
    if (!pick('client_risk_appetite'))          missing.push('Client Risk Appetite');
    const tfe = pick('total_financial_exposure');
    if (tfe === null || tfe === undefined || tfe === '')
                                                missing.push('Total Financial Exposure');
    const ig = pick('identified_gaps');
    if (!ig || (Array.isArray(ig) && !ig.length) || ig === '[]')
                                                missing.push('Identified Gaps');
    if (!pick('recommendation_rationale'))      missing.push('Recommendation Rationale');
    const altsRaw = b.alternatives_considered_list !== undefined
      ? toJsonArray(b.alternatives_considered_list)
      : existing.alternatives_considered_list;
    if (!altsRaw || altsRaw === '[]')           missing.push('Alternatives Considered (at least one)');
    if (!pick('conflict_of_interest_flag'))     missing.push('Conflict of Interest Declaration');
    if (!pick('commission_disclosed'))          missing.push('Commission Disclosed');
    if (!pick('client_acknowledgment_method'))  missing.push('Client Acknowledgment Method');
    if (!pick('acknowledgement_date'))          missing.push('Date Acknowledgment Received');
    if (missing.length) {
      return res.status(400).json({
        error: 'Cannot mark Complete — missing mandatory fields: ' + missing.join(', ')
      });
    }
  }

  // Recompute auto-populated fields
  const existing_cover_summary_auto = buildExistingCoverSummary(
    db,
    pick('contact_id'),
    pick('account_id')
  );
  const suitability_match_score = computeSuitabilityScore(
    db,
    pick('client_risk_appetite'),
    pick('policy_id')
  );

  // Target-market check (Product Library)
  const tmCtxU = {
    client_risk_appetite: pick('client_risk_appetite'),
    client_types:         deriveClientType(db, pick('contact_id'), pick('account_id')),
    insurable_value:      pick('total_financial_exposure'),
  };
  const tmU = computeProductTargetMarket(db, pick('product_id'), tmCtxU);

  if (tmU.status === 'Mismatch' && !pick('supervisor_co_approved_by_id')) {
    return res.status(400).json({
      error: 'Target market mismatch — client type is outside this product\'s target market. ' +
             'A supervisor must co-approve this ROA before it can be saved.'
    });
  }
  if (tmU.status === 'Review Required' && !pick('suitability_override_reason')) {
    return res.status(400).json({
      error: 'Suitability review required — one or more parameters fall outside the target market. ' +
             'Please supply a written override reason.'
    });
  }
  if (!tmU.status && suitability_match_score === 'Mismatch' && !pick('suitability_override_reason')) {
    return res.status(400).json({
      error: 'Recommendation does not match target market for the client risk appetite. ' +
             'Please supply a written override reason.'
    });
  }

  const supervisor_co_approval_required_u = tmU.status === 'Mismatch' ? 1 : 0;
  const supervisor_co_approved_by_id_u    = pick('supervisor_co_approved_by_id') || null;
  const supervisor_co_approved_at_u       = supervisor_co_approved_by_id_u
    ? (existing.supervisor_co_approved_by_id && String(existing.supervisor_co_approved_by_id) === String(supervisor_co_approved_by_id_u)
        ? existing.supervisor_co_approved_at
        : new Date().toISOString())
    : null;
  const target_market_mismatches_json_u = tmU.mismatches && tmU.mismatches.length
    ? JSON.stringify(tmU.mismatches) : null;

  // Normalise list-shaped inputs
  const identifiedGapsJson = b.identified_gaps !== undefined
    ? toJsonArray(b.identified_gaps)
    : existing.identified_gaps;
  const alternativesJson = b.alternatives_considered_list !== undefined
    ? toJsonArray(b.alternatives_considered_list)
    : existing.alternatives_considered_list;

  const tfeVal = (() => {
    const v = pick('total_financial_exposure');
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();
  const commissionVal = (() => {
    const v = pick('commission_rate_value');
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  })();

  const roaCompletedNow = b.roa_completed !== undefined ? (b.roa_completed ? 1 : 0) : existing.roa_completed;
  const roaCompletedAt = roaCompletedNow
    ? (existing.roa_completed ? existing.roa_completed_at : new Date().toISOString())
    : null;

  db.prepare(`
    UPDATE advice_records SET
      contact_id                           = ?,
      account_id                           = ?,
      engagement_id                        = ?,
      policy_id                            = ?,
      broker_id                            = ?,
      prepared_by_id                       = ?,
      advice_date                          = ?,
      advice_type                          = ?,
      trigger_event                        = ?,
      client_needs_identified              = ?,
      risk_analysis_summary                = ?,
      current_cover_considered             = ?,
      shortfalls_identified                = ?,
      recommendation_given                 = ?,
      alternative_options_considered       = ?,
      reason_product_suitable              = ?,
      consequences_of_not_proceeding       = ?,
      risks_explained                      = ?,
      costs_explained                      = ?,
      excess_explained                     = ?,
      waiting_period_limitations_explained = ?,
      exclusions_explained                 = ?,
      client_understanding_confirmed       = ?,
      fair_outcome_considered              = ?,
      client_decision                      = ?,
      decision_date                        = ?,
      decision_notes                       = ?,
      roa_generated                        = ?,
      roa_generation_date                  = ?,
      final_document_issued                = ?,
      issue_date                           = ?,
      client_acknowledgement_received      = ?,
      acknowledgement_date                 = ?,
      currency                             = ?,
      notes                                = ?,
      client_risk_appetite                 = ?,
      total_financial_exposure             = ?,
      existing_cover_summary_auto          = ?,
      identified_gaps                      = ?,
      identified_gaps_notes                = ?,
      recommendation_rationale             = ?,
      alternatives_considered_list         = ?,
      suitability_match_score              = ?,
      suitability_override_reason          = ?,
      conflict_of_interest_flag            = ?,
      conflict_of_interest_description     = ?,
      commission_disclosed                 = ?,
      commission_rate_type                 = ?,
      commission_rate_value                = ?,
      client_rejection_reason              = ?,
      client_rejection_notes               = ?,
      client_acknowledgment_method         = ?,
      acknowledgment_witness_name          = ?,
      roa_completed                        = ?,
      roa_completed_at                     = ?,
      product_id                           = ?,
      target_market_status                 = ?,
      target_market_mismatches             = ?,
      supervisor_co_approval_required      = ?,
      supervisor_co_approved_by_id         = ?,
      supervisor_co_approved_at            = ?,
      updated_at                           = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('contact_id'),
    pick('account_id'),
    pick('engagement_id'),
    pick('policy_id'),
    pick('broker_id'),
    pick('prepared_by_id'),
    pick('advice_date'),
    pick('advice_type'),
    pick('trigger_event'),
    pick('client_needs_identified'),
    pick('risk_analysis_summary'),
    pick('current_cover_considered'),
    pick('shortfalls_identified'),
    pick('recommendation_given'),
    pick('alternative_options_considered'),
    pick('reason_product_suitable'),
    pick('consequences_of_not_proceeding'),
    pickBool('risks_explained'),
    pickBool('costs_explained'),
    pickBool('excess_explained'),
    pickBool('waiting_period_limitations_explained'),
    pickBool('exclusions_explained'),
    pickBool('client_understanding_confirmed'),
    pickBool('fair_outcome_considered'),
    pick('client_decision'),
    pick('decision_date'),
    pick('decision_notes'),
    pickBool('roa_generated'),
    pick('roa_generation_date'),
    pickBool('final_document_issued'),
    pick('issue_date'),
    pickBool('client_acknowledgement_received'),
    pick('acknowledgement_date'),
    b.currency !== undefined ? (b.currency || 'ZAR') : (existing.currency || 'ZAR'),
    pick('notes'),
    pick('client_risk_appetite'),
    tfeVal,
    existing_cover_summary_auto,
    identifiedGapsJson,
    pick('identified_gaps_notes'),
    pick('recommendation_rationale'),
    alternativesJson,
    suitability_match_score,
    pick('suitability_override_reason'),
    coiFlag,
    pick('conflict_of_interest_description'),
    pick('commission_disclosed'),
    pick('commission_rate_type'),
    commissionVal,
    pick('client_rejection_reason'),
    pick('client_rejection_notes'),
    pick('client_acknowledgment_method'),
    pick('acknowledgment_witness_name'),
    roaCompletedNow,
    roaCompletedAt,
    pick('product_id') || null,
    tmU.status || null,
    target_market_mismatches_json_u,
    supervisor_co_approval_required_u,
    supervisor_co_approved_by_id_u,
    supervisor_co_approved_at_u,
    id
  );

  const updated = db.prepare('SELECT * FROM advice_records WHERE id = ?').get(id);

  res.locals.logAudit({
    action:      'UPDATE',
    module:      'advice_records',
    recordId:    parseInt(id, 10),
    oldValue:    existing,
    newValue:    updated,
    description: `Advice record ${existing.advice_record_number} updated`
  });

  return res.json(updated);
});

// ─── POST /:id/send-roa — generate PDF and email ─────────────

router.post('/:id/send-roa', requireAuth, async (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { to, subject, message } = req.body;

  if (!to || !subject) {
    return res.status(400).json({ error: 'to and subject are required' });
  }

  const d = db.prepare(`
    SELECT
      ar.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      c.email   AS contact_email,
      c.mobile  AS contact_mobile,
      c.sa_id_number AS contact_id_number,
      b.full_name  AS broker_name,
      ce.disclosure_timestamp  AS engagement_disclosure_ts,
      dsc.full_name            AS engagement_disclosing_broker
    FROM advice_records ar
    LEFT JOIN contacts          c   ON c.id   = ar.contact_id
    LEFT JOIN users             b   ON b.id   = ar.broker_id
    LEFT JOIN client_engagements ce ON ce.id  = ar.engagement_id
    LEFT JOIN users             dsc ON dsc.id = ce.disclosing_broker_id
    WHERE ar.id = ?
  `).get(id);

  if (!d) return res.status(404).json({ error: 'Advice record not found' });

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && d.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const db2 = getDb();
    const smRows = db2.prepare('SELECT key, value FROM system_settings WHERE key LIKE ?').all('smtp_%');
    const smtp = {};
    smRows.forEach(r => { try { smtp[r.key] = JSON.parse(r.value); } catch { smtp[r.key] = r.value; } });

    if (!smtp.smtp_host || !smtp.smtp_user) {
      return res.status(400).json({ error: 'SMTP not configured. Please configure email settings in Admin.' });
    }

    // ── Build PDF with pdfkit ──────────────────────────────────
    const PDFDocument = require('pdfkit');
    const fs          = require('fs');
    const path        = require('path');

    const chunks = [];
    // No top margin on page 1 — letterhead bleeds to top edge
    const pdfDoc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    pdfDoc.on('data', chunk => chunks.push(chunk));

    await new Promise((resolve, reject) => {
      pdfDoc.on('end', resolve);
      pdfDoc.on('error', reject);

      const PAGE_W   = 595.28;
      const PAGE_H   = 841.89;
      const MARGIN   = 42;           // ~15mm side margins (matching @page 15mm)
      const CONTENT_W = PAGE_W - MARGIN * 2;
      const PRIMARY  = '#1a5276';   // matches HTML h3 colour
      const LIGHT_BG = '#f8f9fa';
      const BORDER   = '#dee2e6';
      const BODY_SZ  = 10;
      const H2_SZ    = 11;
      const SMALL_SZ = 8;

      const dateStr = (v) => v ? String(v).slice(0, 10) : '\u2014';
      const dash    = (v) => v || '\u2014';

      // ── Letterhead image ──────────────────────────────────────
      const letterheadPath = path.join(__dirname, '../../client/public/letterhead-ROA.png');
      let contentStartY = 20;
      if (fs.existsSync(letterheadPath)) {
        // Get image dimensions to calculate rendered height at full page width
        const imgData = fs.readFileSync(letterheadPath);
        // PNG dimensions are at bytes 16-23
        const imgW = imgData.readUInt32BE(16);
        const imgH = imgData.readUInt32BE(20);
        const renderedH = (imgH / imgW) * PAGE_W;
        pdfDoc.image(letterheadPath, 0, 0, { width: PAGE_W });
        contentStartY = renderedH + 8; // 8pt breathing room below letterhead
      }
      pdfDoc.y = contentStartY;
      pdfDoc.x = MARGIN;

      // ── Doc ref (right-aligned, below letterhead) ─────────────
      pdfDoc.moveDown(0.4);
      pdfDoc.fontSize(SMALL_SZ).fillColor('#666').font('Helvetica')
        .text(`Document Reference: ${dash(d.advice_record_number)}`, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'right' });
      pdfDoc.moveDown(0.6);

      // ── Helpers ───────────────────────────────────────────────
      function sectionHead(title) {
        pdfDoc.moveDown(0.5);
        const y = pdfDoc.y;
        pdfDoc.fontSize(H2_SZ).fillColor(PRIMARY).font('Helvetica-Bold')
          .text(title, MARGIN, y, { width: CONTENT_W });
        const lineY = pdfDoc.y + 1;
        pdfDoc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY)
          .strokeColor(BORDER).lineWidth(0.75).stroke();
        pdfDoc.moveDown(0.4);
        pdfDoc.fontSize(BODY_SZ).fillColor('#222').font('Helvetica');
      }

      function fieldLine(label, value) {
        pdfDoc.font('Helvetica-Bold').fontSize(BODY_SZ).fillColor('#222')
          .text(`${label}: `, MARGIN, pdfDoc.y, { continued: true, width: CONTENT_W });
        pdfDoc.font('Helvetica').text(String(value || '\u2014'));
      }

      function textBlock(label, value) {
        if (!value) return;
        pdfDoc.moveDown(0.2);
        pdfDoc.font('Helvetica-Bold').fontSize(BODY_SZ).fillColor('#222')
          .text(`${label}:`, MARGIN, pdfDoc.y, { width: CONTENT_W });
        // Background rect
        const blockX = MARGIN;
        const blockY = pdfDoc.y + 2;
        const textX  = MARGIN + 8;
        // Draw text first to measure height
        pdfDoc.font('Helvetica').fontSize(9.5).fillColor('#222')
          .text(String(value), textX, blockY + 4, { width: CONTENT_W - 8 });
        const afterY = pdfDoc.y + 4;
        const blockH = afterY - blockY;
        // Draw bg behind text (drawn after, so use save/restore trick via rect)
        // pdfkit doesn't support z-order, so we draw bg BEFORE text
        // Re-draw properly:
        pdfDoc.moveDown(0.4);
      }

      function textBlockStyled(label, value, accent) {
        if (!value) return;
        pdfDoc.moveDown(0.3);
        pdfDoc.font('Helvetica-Bold').fontSize(BODY_SZ).fillColor('#222')
          .text(`${label}:`, MARGIN, pdfDoc.y, { width: CONTENT_W });
        const blockY = pdfDoc.y + 1;
        const blockX = MARGIN;
        // Accent left bar
        if (accent) {
          pdfDoc.rect(blockX, blockY, 3, 1).fillColor(PRIMARY); // placeholder — extended after text
        }
        const textX = accent ? MARGIN + 8 : MARGIN + 4;
        // Measure text height
        const textH = pdfDoc.heightOfString(String(value), { width: CONTENT_W - (accent ? 8 : 4) });
        const padV  = 5;
        const rectH = textH + padV * 2;
        // bg
        pdfDoc.rect(blockX, blockY, CONTENT_W, rectH).fillColor(LIGHT_BG).fill();
        // accent bar
        if (accent) {
          pdfDoc.rect(blockX, blockY, 3, rectH).fillColor(PRIMARY).fill();
        }
        // text
        pdfDoc.font('Helvetica').fontSize(9.5).fillColor('#222')
          .text(String(value), textX, blockY + padV, { width: CONTENT_W - (accent ? 8 : 4) });
        pdfDoc.moveDown(0.4);
      }

      // ── Section 1: Client & Adviser Details (two columns) ─────
      sectionHead('Client Details & Adviser Details');

      const colW  = (CONTENT_W - 16) / 2;
      const col1X = MARGIN;
      const col2X = MARGIN + colW + 16;
      const lineH = BODY_SZ * 1.4; // approx line height at BODY_SZ

      // Helper: write a label+value line at explicit x,y; returns new y
      function colField(label, value, x, y) {
        const lineStr = `${label}: ${value || '\u2014'}`;
        const h = pdfDoc.heightOfString(lineStr, { width: colW });
        pdfDoc.font('Helvetica-Bold').fontSize(BODY_SZ).fillColor('#222')
          .text(`${label}: `, x, y, { continued: true, width: colW });
        pdfDoc.font('Helvetica').text(String(value || '\u2014'), { width: colW });
        return y + h + 2;
      }

      const startY = pdfDoc.y;

      // ── Left column ───────────────────────────────────────────
      pdfDoc.font('Helvetica-Bold').fontSize(BODY_SZ).fillColor(PRIMARY)
        .text('Client Details', col1X, startY, { width: colW });
      let lY = startY + lineH + 2;
      lY = colField('Name',      d.contact_name,      col1X, lY);
      if (d.contact_email)     lY = colField('Email',     d.contact_email,     col1X, lY);
      if (d.contact_mobile)    lY = colField('Mobile',    d.contact_mobile,    col1X, lY);
      if (d.contact_id_number) lY = colField('ID Number', d.contact_id_number, col1X, lY);

      // ── Right column ──────────────────────────────────────────
      pdfDoc.font('Helvetica-Bold').fontSize(BODY_SZ).fillColor(PRIMARY)
        .text('Adviser Details', col2X, startY, { width: colW });
      let rY = startY + lineH + 2;
      rY = colField('Adviser',        d.broker_name,   col2X, rY);
      rY = colField('Date of Advice', dateStr(d.advice_date), col2X, rY);
      rY = colField('Advice Type',    d.advice_type,   col2X, rY);
      if (d.trigger_event) rY = colField('Trigger Event', d.trigger_event, col2X, rY);

      // Vertical divider between columns
      const divH = Math.max(lY, rY) - startY + 4;
      pdfDoc.moveTo(col2X - 8, startY).lineTo(col2X - 8, startY + divH)
        .strokeColor(BORDER).lineWidth(0.75).stroke();

      pdfDoc.y = Math.max(lY, rY) + 8;
      pdfDoc.x = MARGIN;

      // ── Section 2: Suitability Assessment (new — COFI/TCF Outcome 4) ──
      sectionHead('Suitability Assessment');
      if (d.client_risk_appetite)       fieldLine('Client Risk Appetite', d.client_risk_appetite);
      if (d.total_financial_exposure != null && d.total_financial_exposure !== '') {
        fieldLine(
          'Total Financial Exposure',
          'R ' + Number(d.total_financial_exposure).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        );
      }
      if (d.existing_cover_summary_auto) textBlockStyled('Existing Cover (auto-populated)', d.existing_cover_summary_auto, false);
      // Identified gaps (stored as JSON array) + notes
      try {
        const gaps = d.identified_gaps ? JSON.parse(d.identified_gaps) : null;
        if (Array.isArray(gaps) && gaps.length) {
          textBlockStyled('Identified Gaps', gaps.map(g => '• ' + g).join('\n'), true);
        }
      } catch (_) {}
      if (d.identified_gaps_notes) textBlockStyled('Gap Notes', d.identified_gaps_notes, false);

      // ── Section 3: Needs Analysis ─────────────────────────────
      sectionHead('Needs Analysis');
      textBlockStyled('Client Needs Identified', d.client_needs_identified, true);
      textBlockStyled('Risk Analysis Summary',   d.risk_analysis_summary,   true);
      if (d.current_cover_considered) textBlockStyled('Current Cover Considered', d.current_cover_considered, false);
      if (d.shortfalls_identified)    textBlockStyled('Shortfalls Identified',    d.shortfalls_identified,    false);

      // ── Section 4: Recommendation ────────────────────────────
      sectionHead('Recommendation');
      textBlockStyled('Recommendation Given',           d.recommendation_given,           true);
      if (d.recommendation_rationale) textBlockStyled('Recommendation Rationale (structured)', d.recommendation_rationale, true);
      // Structured alternatives list
      try {
        const alts = d.alternatives_considered_list ? JSON.parse(d.alternatives_considered_list) : null;
        if (Array.isArray(alts) && alts.length) {
          const altsStr = alts.map((a, i) =>
            `${i + 1}. ${a.product_name || '—'} (${a.insurer || '—'}) — ${a.reason_not_recommended || '—'}`
          ).join('\n');
          textBlockStyled('Alternatives Considered', altsStr, false);
        }
      } catch (_) {}
      if (d.alternative_options_considered) textBlockStyled('Alternative Options Considered (legacy notes)', d.alternative_options_considered, false);
      textBlockStyled('Reason Product is Suitable',     d.reason_product_suitable,         true);
      if (d.consequences_of_not_proceeding) textBlockStyled('Consequences of Not Proceeding', d.consequences_of_not_proceeding, false);
      if (d.suitability_match_score) fieldLine('Suitability Match Score', d.suitability_match_score);
      if (d.suitability_match_score === 'Mismatch' && d.suitability_override_reason) {
        textBlockStyled('Suitability Override Reason', d.suitability_override_reason, true);
      }

      // ── Section 4b: Conflict of Interest (GCC 3A) ────────────
      sectionHead('Conflict of Interest Declaration');
      fieldLine('Financial Interest Disclosed', d.conflict_of_interest_flag || '—');
      if (d.conflict_of_interest_flag === 'Yes' && d.conflict_of_interest_description) {
        textBlockStyled('Nature of Conflict', d.conflict_of_interest_description, true);
      }
      if (d.commission_disclosed) fieldLine('Commission Disclosure', d.commission_disclosed);
      if (d.commission_rate_type && d.commission_rate_value != null && d.commission_rate_value !== '') {
        const v = Number(d.commission_rate_value);
        fieldLine(
          'Commission Rate / Fee',
          d.commission_rate_type === 'percent'
            ? `${v}%`
            : 'R ' + v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        );
      }

      // ── Section 4: Disclosures Checklist ─────────────────────
      sectionHead('Disclosures Checklist');
      const disclosures = [
        ['Risks explained to client',               d.risks_explained],
        ['Costs explained to client',               d.costs_explained],
        ['Excess explained to client',              d.excess_explained],
        ['Waiting period & limitations explained',  d.waiting_period_limitations_explained],
        ['Exclusions explained to client',          d.exclusions_explained],
        ['Client understanding confirmed',          d.client_understanding_confirmed],
        ['Fair outcome considered',                 d.fair_outcome_considered],
      ];
      // Header row
      const tableY   = pdfDoc.y;
      const col1W    = CONTENT_W - 60;
      const col2W    = 60;
      pdfDoc.rect(MARGIN, tableY, CONTENT_W, 16).fillColor(PRIMARY).fill();
      pdfDoc.font('Helvetica-Bold').fontSize(9).fillColor('#fff')
        .text('Disclosure Item', MARGIN + 4, tableY + 4, { width: col1W })
        .text('Completed', MARGIN + col1W + 4, tableY + 4, { width: col2W - 8, align: 'center' });
      let rowY = tableY + 16;
      disclosures.forEach(([label, val], idx) => {
        const bg = idx % 2 === 1 ? LIGHT_BG : '#ffffff';
        pdfDoc.rect(MARGIN, rowY, CONTENT_W, 14).fillColor(bg).fill();
        pdfDoc.font('Helvetica').fontSize(9).fillColor('#222')
          .text(label, MARGIN + 4, rowY + 3, { width: col1W });
        const mark = val ? '\u2713' : '\u2717';
        pdfDoc.fillColor(val ? '#1a7a3a' : '#c0392b')
          .text(mark, MARGIN + col1W + 4, rowY + 3, { width: col2W - 8, align: 'center' });
        // Bottom border
        pdfDoc.moveTo(MARGIN, rowY + 14).lineTo(MARGIN + CONTENT_W, rowY + 14)
          .strokeColor(BORDER).lineWidth(0.5).stroke();
        rowY += 14;
      });
      pdfDoc.y = rowY + 6;
      pdfDoc.x = MARGIN;

      // ── Section 5: Client Decision ────────────────────────────
      sectionHead('Client Decision');
      fieldLine('Decision', d.client_decision);
      if (d.decision_date) fieldLine('Decision Date', dateStr(d.decision_date));
      if (d.decision_notes) textBlockStyled('Decision Notes', d.decision_notes, false);
      if (d.client_decision === 'Declined' && d.client_rejection_reason) {
        fieldLine('Rejection Reason', d.client_rejection_reason);
        if (d.client_rejection_notes) textBlockStyled('Rejection Notes', d.client_rejection_notes, false);
      }
      if (d.client_acknowledgment_method) fieldLine('Acknowledgment Method', d.client_acknowledgment_method);
      if (d.acknowledgment_witness_name) fieldLine('Witness', d.acknowledgment_witness_name);
      if (d.acknowledgement_date) fieldLine('Date Acknowledgment Received', dateStr(d.acknowledgement_date));
      pdfDoc.moveDown(0.6);

      // ── Section 6: Signatures ─────────────────────────────────
      sectionHead('Signatures');
      pdfDoc.moveDown(1.8);
      const sigY  = pdfDoc.y;
      const sig1X = MARGIN + 10;
      const sig2X = MARGIN + CONTENT_W / 2 + 10;
      const sigW  = CONTENT_W / 2 - 30;
      pdfDoc.moveTo(sig1X, sigY).lineTo(sig1X + sigW, sigY).strokeColor('#222').lineWidth(0.75).stroke();
      pdfDoc.moveTo(sig2X, sigY).lineTo(sig2X + sigW, sigY).strokeColor('#222').lineWidth(0.75).stroke();
      pdfDoc.fontSize(SMALL_SZ).fillColor('#666')
        .text('Client Signature & Date',  sig1X, sigY + 3, { width: sigW })
        .text('Adviser Signature & Date', sig2X, sigY + 3, { width: sigW });
      pdfDoc.moveDown(2);

      // ── Footer ────────────────────────────────────────────────
      // Pre-sale disclosure reference (FAIS GCC §4 / TCF Outcome 3)
      if (d.engagement_disclosure_ts) {
        const ts = new Date(d.engagement_disclosure_ts);
        const tsStr = isNaN(ts.getTime()) ? d.engagement_disclosure_ts
          : ts.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
        pdfDoc.fontSize(SMALL_SZ).fillColor('#555').font('Helvetica-Oblique')
          .text(
            `Pre-sale disclosure completed by ${d.engagement_disclosing_broker || '—'} on ${tsStr}.`,
            MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' }
          );
        pdfDoc.moveDown(0.15);
      }
      pdfDoc.fontSize(7.5).fillColor('#999').font('Helvetica')
        .text(`Generated by Inexpro CRM on ${new Date().toLocaleDateString('en-ZA')}`, MARGIN, pdfDoc.y, { width: CONTENT_W, align: 'center' });

      pdfDoc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    // ── Send email with PDF attachment ─────────────────────────
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp.smtp_host,
      port: parseInt(smtp.smtp_port) || 587,
      secure: String(smtp.smtp_port) === '465',
      auth: { user: smtp.smtp_user, pass: smtp.smtp_pass },
    });

    // ── Per-user From + Signature + Auto-CC (same logic as send-email) ──
    let fromAddress = smtp.smtp_from || smtp.smtp_user;
    let userEntry = null;
    try {
      const fromList = Array.isArray(smtp.smtp_from_list) ? smtp.smtp_from_list : [];
      userEntry = fromList.find(f => String(f.user_id) === String(req.session.userId) && f.email) || null;
      if (userEntry) {
        fromAddress = userEntry.name
          ? `"${String(userEntry.name).replace(/"/g, '')}" <${userEntry.email}>`
          : userEntry.email;
      }
    } catch (_) {}

    const attachments = [{
      filename: `ROA-${d.advice_record_number || id}.pdf`,
      content:  pdfBuffer,
      contentType: 'application/pdf',
    }];

    let htmlBody = message
      ? `<p>${message.replace(/\n/g, '<br>')}</p><p>Please find your Record of Advice (${d.advice_record_number || ''}) attached as a PDF.</p>`
      : `<p>Please find your Record of Advice (${d.advice_record_number || ''}) attached as a PDF.</p>`;

    // Append signature image if mapped
    if (userEntry && userEntry.signature) {
      const safeName = path.basename(String(userEntry.signature));
      const sigPath = path.join(__dirname, '..', '..', 'signatures', safeName);
      if (fs.existsSync(sigPath)) {
        const cid = 'user-signature@inexpro';
        attachments.push({ filename: safeName, path: sigPath, cid });
        htmlBody += `<br><br><img src="cid:${cid}" alt="signature" style="max-width:400px;height:auto;">`;
      }
    }

    // Auto-CC the sending user
    let senderEmail = userEntry ? userEntry.email : null;
    if (!senderEmail) {
      const senderRow = db2.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId);
      if (senderRow) senderEmail = senderRow.email;
    }

    await transporter.sendMail({
      from: fromAddress,
      to,
      ...(senderEmail ? { cc: senderEmail } : {}),
      subject,
      html: htmlBody,
      attachments,
    });

    const { logAudit } = require('../middleware/audit');
    logAudit({
      userId: req.session.userId,
      ip: req.ip,
      action:      'EMAIL',
      module:      'advice_records',
      recordId:    parseInt(id, 10),
      description: `ROA ${d.advice_record_number} emailed to ${to}`,
      newValue:    { to, cc: senderEmail, subject, from: fromAddress },
    });

    res.json({ message: 'ROA sent successfully' });
  } catch (err) {
    console.error('send-roa error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────

router.delete('/:id', requireAuth, canDelete, (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM advice_records WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Advice record not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM advice_records WHERE id = ?').run(id);

    res.locals.logAudit({
      action:      'DELETE',
      module:      'advice_records',
      recordId:    parseInt(id, 10),
      oldValue:    existing,
      description: `Advice record ${existing.advice_record_number} deleted`
    });

    return res.json({ message: 'Advice record deleted successfully' });
  } catch (err) {
    console.error('DELETE /advice-records/:id error:', err.message);
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Cannot delete: this record is referenced by other records.' });
    }
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ─── POST /:id/complete — Mark a ROA complete (locks future edits) ───
//
// One-shot endpoint that flips roa_completed=1. Pre-completion edits did not
// require an admin password; once flipped, every subsequent PUT requires one.
// Validates the SAME fields the in-form bottom Complete button checks so a
// broker can never bypass the bottom validator by clicking the top button.
router.post('/:id/complete', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM advice_records WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Advice record not found' });

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (existing.roa_completed) {
    return res.status(409).json({ error: 'This ROA is already marked Complete.' });
  }

  // Pre-Sale Disclosure gate — same rule the form's banner enforces.
  if (existing.engagement_id) {
    const gate = engagementDisclosureComplete(db, existing.engagement_id);
    if (!gate.complete) {
      return res.status(400).json({
        error: 'Cannot mark Complete — pre-sale disclosure on the linked engagement is incomplete. Missing: ' + gate.reason + '.',
      });
    }
  }

  // Completeness validation — mirrors the four-step check on the form.
  const isEmpty = (v) => v === undefined || v === null || v === '' || v === '[]';
  const missing = [];

  // Step 1 — Suitability Assessment
  if (isEmpty(existing.client_risk_appetite))     missing.push('Step 1: Client Risk Appetite');
  if (isEmpty(existing.total_financial_exposure)) missing.push('Step 1: Total Financial Exposure');
  if (isEmpty(existing.identified_gaps))          missing.push('Step 1: Identified Gaps');

  // Step 2 — Recommendation
  if (isEmpty(existing.recommendation_given))         missing.push('Step 2: Recommendation Given');
  if (isEmpty(existing.recommendation_rationale))     missing.push('Step 2: Recommendation Rationale');
  if (isEmpty(existing.alternatives_considered_list)) missing.push('Step 2: Alternatives Considered');
  if (isEmpty(existing.reason_product_suitable))      missing.push('Step 2: Reason Product is Suitable');

  // Step 3 — Conflict of Interest + Commission disclosure
  if (isEmpty(existing.conflict_of_interest_flag)) {
    missing.push('Step 3: Conflict of Interest declaration');
  } else if (existing.conflict_of_interest_flag === 'Yes' && isEmpty(existing.conflict_of_interest_description)) {
    missing.push('Step 3: Conflict of Interest description');
  }
  if (isEmpty(existing.commission_disclosed)) missing.push('Step 3: Commission disclosure');

  // Step 4 — Disclosures checklist
  if (!existing.risks_explained)              missing.push('Step 4: Risks Explained');
  if (!existing.costs_explained)              missing.push('Step 4: Costs Explained');
  if (!existing.excess_explained)             missing.push('Step 4: Excess Explained');
  if (!existing.exclusions_explained)         missing.push('Step 4: Exclusions Explained');
  if (!existing.client_understanding_confirmed) missing.push('Step 4: Client Understanding Confirmed');
  if (!existing.fair_outcome_considered)        missing.push('Step 4: Fair Outcome Considered');

  // Acknowledgement
  if (isEmpty(existing.client_acknowledgment_method)) missing.push('Acknowledgment Method');
  if (isEmpty(existing.acknowledgement_date))         missing.push('Acknowledgment Date');

  if (missing.length) {
    return res.status(400).json({
      error: `Cannot mark Complete — required fields missing: ${missing.join(', ')}.`,
      missing,
    });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE advice_records SET
      roa_completed     = 1,
      roa_completed_at  = ?,
      updated_at        = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(now, id);

  const updated = db.prepare('SELECT * FROM advice_records WHERE id = ?').get(id);

  res.locals.logAudit?.({
    action:   'UPDATE',
    module:   'advice_records',
    recordId: id,
    oldValue: { roa_completed: 0 },
    newValue: { roa_completed: 1, roa_completed_at: now },
    description: `ROA ${existing.advice_record_number || id} marked Complete (now locked for editing — admin password required to amend)`,
  });

  res.json(updated);
});

module.exports = router;
