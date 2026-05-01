'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// On commission entry create/delete, dismiss/restore the "missing commission"
// notification for the policy's assigned broker.
function reconcileCommissionNotification(db, policyId) {
  try {
    const pol = db.prepare(
      'SELECT assigned_broker_id FROM policies WHERE id = ?'
    ).get(policyId);
    if (!pol || !pol.assigned_broker_id) return;
    const cnt = db.prepare(
      'SELECT COUNT(*) AS n FROM commission_log WHERE policy_id = ?'
    ).get(policyId).n;
    const dedup = `policy_commission_missing:${policyId}`;
    if (cnt > 0) {
      db.prepare(
        `UPDATE notifications SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP),
                                  read_at      = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE dedup_key = ? AND user_id = ?`
      ).run(dedup, pol.assigned_broker_id);
    }
  } catch (_) {}
}

const COMMISSION_TYPES = [
  'As-and-when commission', 'Upfront commission',
  'Fee-based (no commission)', 'Flat fee', 'Other'
];
const ARRANGEMENTS = [
  'Standard market commission', 'Volume-based override',
  'Contingency commission', 'No arrangement', 'Unknown'
];

router.get('/options', (_req, res) => {
  res.json({
    commission_type: COMMISSION_TYPES,
    insurer_arrangement: ARRANGEMENTS,
  });
});

// GET / — list with filters
router.get('/', (req, res) => {
  const db = getDb();
  const { policy_id } = req.query;

  const conditions = [];
  const params = [];

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push('pol.assigned_broker_id = ?');
    params.push(scopedBrokerId);
  }
  if (policy_id) { conditions.push('cl.policy_id = ?'); params.push(policy_id); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT cl.*, pol.policy_number, pol.policy_name, pol.premium AS policy_premium,
           ar.advice_record_number
    FROM commission_log cl
    LEFT JOIN policies pol ON pol.id = cl.policy_id
    LEFT JOIN advice_records ar ON ar.id = cl.linked_advice_record_id
    ${where}
    ORDER BY cl.created_at DESC
  `).all(...params);

  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT cl.*, pol.policy_number, pol.policy_name, pol.premium AS policy_premium, pol.assigned_broker_id,
           ar.advice_record_number, ar.conflict_of_interest_flag, ar.commission_disclosed
    FROM commission_log cl
    LEFT JOIN policies pol ON pol.id = cl.policy_id
    LEFT JOIN advice_records ar ON ar.id = cl.linked_advice_record_id
    WHERE cl.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Commission record not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && row.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(row);
});

function evaluateCompliance(b) {
  // Compliant if standard market or fee-based; Review required if volume-based
  // override without documentation; Non-compliant if arrangement unknown and rate
  // exceeds 20% (a heuristic threshold — the real rule sits with the FSCA).
  if (!b.insurer_arrangement || b.insurer_arrangement === 'Unknown') return 'Review required';
  if (b.insurer_arrangement === 'Volume-based override' && !b.volume_override_details) return 'Review required';
  if (b.commission_type === 'Upfront commission' && (b.commission_rate || 0) > 25) return 'Non-compliant';
  return 'Compliant';
}

router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body || {};
  if (!b.policy_id || !b.commission_type) {
    return res.status(400).json({ error: 'policy_id and commission_type required' });
  }

  const policy = db.prepare('SELECT assigned_broker_id, premium FROM policies WHERE id = ?').get(b.policy_id);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && policy.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Auto-calculate commission amount from rate × annual premium when rate type.
  // '' is explicitly treated as "no value" so R-mode payloads (rate='', amount=N)
  // and %-mode payloads (rate=N, amount='') both behave correctly.
  const rate = (b.commission_rate === '' || b.commission_rate == null)
    ? null
    : Number(b.commission_rate);
  const annualPremium = policy.premium || 0;
  const amount = (rate != null && annualPremium)
    ? (annualPremium * rate / 100)
    : ((b.commission_amount === '' || b.commission_amount == null) ? null : Number(b.commission_amount));

  // Link to most recent ROA for this policy to auto-populate disclosure fields
  const roa = db.prepare(`
    SELECT id, conflict_of_interest_flag, commission_disclosed, advice_date
    FROM advice_records
    WHERE policy_id = ?
    ORDER BY advice_date DESC, id DESC
    LIMIT 1
  `).get(b.policy_id);

  const disclosedInRoa = roa ? (roa.commission_disclosed && roa.commission_disclosed.startsWith('Yes') ? 1 : 0) : 0;

  const compliance = evaluateCompliance(b);

  const _bool = (v) => (v === true || v === 1 || v === '1' || v === 'on' || v === 'true') ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO commission_log (
      policy_id, commission_type, commission_rate, commission_amount,
      disclosed_in_roa, disclosure_date, linked_advice_record_id,
      insurer_arrangement, volume_override_details,
      remuneration_compliant, last_review_date, notes, created_by,
      class_motor, class_non_motor, class_other, class_other_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.policy_id,
    b.commission_type,
    rate,
    amount,
    disclosedInRoa,
    roa ? roa.advice_date : null,
    roa ? roa.id : null,
    b.insurer_arrangement || null,
    b.volume_override_details || null,
    compliance,
    b.last_review_date || new Date().toISOString().slice(0, 10),
    b.notes || null,
    req.session.userId,
    _bool(b.class_motor),
    _bool(b.class_non_motor),
    _bool(b.class_other),
    _bool(b.class_other) ? (b.class_other_text || null) : null
  );

  const created = db.prepare('SELECT * FROM commission_log WHERE id = ?').get(result.lastInsertRowid);

  const detail = [
    b.commission_type,
    rate != null ? `${rate}%` : null,
    amount != null ? `R ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null,
  ].filter(Boolean).join(' · ');
  res.locals.logAudit({
    action:   'CREATE',
    module:   'commission_log',
    recordId: result.lastInsertRowid,
    newValue: created,
    description: `Commission entry added to policy ${b.policy_id}${detail ? ' — ' + detail : ''}`
  });

  reconcileCommissionNotification(db, b.policy_id);

  res.status(201).json(created);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM commission_log WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Commission record not found' });

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  // Treat '' explicitly as "clear" so toggling between R and % does not retain
  // the previous value via the pick() fallback.
  const rateInput = b.commission_rate;
  const rate = rateInput === '' ? null
             : (rateInput !== undefined && rateInput !== null ? Number(rateInput)
             : (existing.commission_rate != null ? Number(existing.commission_rate) : null));

  const policy = db.prepare('SELECT premium FROM policies WHERE id = ?').get(existing.policy_id);
  const annualPremium = policy ? policy.premium || 0 : 0;
  let amount;
  if (rate != null && annualPremium) {
    amount = annualPremium * rate / 100;
  } else if (b.commission_amount === '') {
    amount = null;
  } else if (b.commission_amount !== undefined && b.commission_amount !== null) {
    amount = Number(b.commission_amount);
  } else {
    amount = existing.commission_amount;
  }

  const compliance = evaluateCompliance({ ...existing, ...b });

  const _bool = (v) => (v === true || v === 1 || v === '1' || v === 'on' || v === 'true') ? 1 : 0;
  const newMotor    = b.class_motor     !== undefined ? _bool(b.class_motor)     : (existing.class_motor     ? 1 : 0);
  const newNonMotor = b.class_non_motor !== undefined ? _bool(b.class_non_motor) : (existing.class_non_motor ? 1 : 0);
  const newOther    = b.class_other     !== undefined ? _bool(b.class_other)     : (existing.class_other     ? 1 : 0);
  const newOtherTxt = newOther
    ? (b.class_other_text !== undefined ? (b.class_other_text || null) : (existing.class_other_text || null))
    : null;

  db.prepare(`
    UPDATE commission_log SET
      commission_type           = ?,
      commission_rate           = ?,
      commission_amount         = ?,
      insurer_arrangement       = ?,
      volume_override_details   = ?,
      remuneration_compliant    = ?,
      last_review_date          = ?,
      notes                     = ?,
      class_motor               = ?,
      class_non_motor           = ?,
      class_other               = ?,
      class_other_text          = ?,
      updated_at                = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('commission_type'),
    rate,
    amount,
    pick('insurer_arrangement'),
    pick('volume_override_details'),
    compliance,
    pick('last_review_date'),
    pick('notes'),
    newMotor,
    newNonMotor,
    newOther,
    newOtherTxt,
    id
  );

  const updated = db.prepare('SELECT * FROM commission_log WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'commission_log',
    recordId: id,
    oldValue: existing,
    newValue: updated,
    description: `Commission record ${id} updated`
  });

  res.json(updated);
});

router.delete('/:id', canDelete, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM commission_log WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Commission record not found' });
  db.prepare('DELETE FROM commission_log WHERE id = ?').run(id);
  res.locals.logAudit({
    action:   'DELETE',
    module:   'commission_log',
    recordId: id,
    oldValue: existing,
    description: `Commission record ${id} deleted`
  });
  res.json({ message: 'Deleted' });
});

module.exports = router;
