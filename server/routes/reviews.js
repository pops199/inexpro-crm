const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Generate a review number in the format REV-YYYYMMDD-XXXX.
 */
function generateReviewNumber(db) {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `REV-${today}-`;

  const last = db.prepare(
    `SELECT review_number FROM reviews
     WHERE review_number LIKE ?
     ORDER BY review_number DESC
     LIMIT 1`
  ).get(`${prefix}%`);

  let seq = 1;
  if (last) {
    const parts = last.review_number.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ─── GET / — list with optional filters, paginated ───────────

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { contact_id, policy_id, broker_id, completed, page = 1, limit = 25 } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const params     = [];

  // Broker isolation: brokers can only see their own reviews
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push('r.broker_id = ?');
    params.push(scopedBrokerId);
  } else if (broker_id !== undefined) {
    conditions.push('r.broker_id = ?');
    params.push(broker_id);
  }

  if (contact_id !== undefined) { conditions.push('r.contact_id = ?');        params.push(contact_id); }
  if (policy_id  !== undefined) { conditions.push('r.policy_id = ?');         params.push(policy_id); }
  if (completed  !== undefined) {
    conditions.push('r.review_completed = ?');
    params.push(completed === 'true' || completed === '1' ? 1 : 0);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM reviews r
    ${where}
  `).get(...params);

  const rows = db.prepare(`
    SELECT
      r.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      a.account_name,
      p.policy_number,
      p.policy_name,
      b.full_name    AS broker_name,
      adm.full_name  AS assigned_admin_name,
      ar.advice_record_number AS linked_advice_record_number
    FROM reviews r
    LEFT JOIN contacts      c   ON c.id   = r.contact_id
    LEFT JOIN accounts      a   ON a.id   = r.account_id
    LEFT JOIN policies      p   ON p.id   = r.policy_id
    LEFT JOIN users         b   ON b.id   = r.broker_id
    LEFT JOIN users         adm ON adm.id = r.assigned_admin_id
    LEFT JOIN advice_records ar ON ar.id  = r.linked_advice_record_id
    ${where}
    ORDER BY r.review_date DESC, r.id DESC
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

// ─── GET /:id — single record ─────────────────────────────────

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();

  const row = db.prepare(`
    SELECT
      r.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      a.account_name,
      p.policy_number,
      p.policy_name,
      b.full_name    AS broker_name,
      adm.full_name  AS assigned_admin_name,
      ar.advice_record_number AS linked_advice_record_number,
      cb.full_name   AS created_by_name
    FROM reviews r
    LEFT JOIN contacts       c   ON c.id   = r.contact_id
    LEFT JOIN accounts       a   ON a.id   = r.account_id
    LEFT JOIN policies       p   ON p.id   = r.policy_id
    LEFT JOIN users          b   ON b.id   = r.broker_id
    LEFT JOIN users          adm ON adm.id = r.assigned_admin_id
    LEFT JOIN advice_records ar  ON ar.id  = r.linked_advice_record_id
    LEFT JOIN users          cb  ON cb.id  = r.created_by
    WHERE r.id = ?
  `).get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: 'Review not found' });
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

  const {
    contact_id,
    account_id,
    policy_id,
    broker_id,
    assigned_admin_id,
    review_type,
    review_date,
    review_outcome,
    changes_in_risk_profile,
    changes_in_assets_exposure,
    gaps_identified,
    recommendations,
    follow_up_actions,
    next_review_date,
    review_completed,
    advice_record_required,
    linked_advice_record_id,
    notes
  } = req.body;

  // Required field validation
  if (!review_type || !review_date) {
    return res.status(400).json({
      error: 'Required fields: review_type, review_date'
    });
  }

  const review_number = generateReviewNumber(db);

  const result = db.prepare(`
    INSERT INTO reviews (
      review_number, contact_id, account_id, policy_id,
      broker_id, assigned_admin_id, review_type, review_date,
      review_outcome, changes_in_risk_profile, changes_in_assets_exposure,
      gaps_identified, recommendations, follow_up_actions, next_review_date,
      review_completed, advice_record_required, linked_advice_record_id,
      notes, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )
  `).run(
    review_number,
    contact_id              || null,
    account_id              || null,
    policy_id               || null,
    broker_id               || null,
    assigned_admin_id       || null,
    review_type,
    review_date,
    review_outcome          || null,
    changes_in_risk_profile || null,
    changes_in_assets_exposure || null,
    gaps_identified         || null,
    recommendations         || null,
    follow_up_actions       || null,
    next_review_date        || null,
    review_completed        ? 1 : 0,
    advice_record_required  ? 1 : 0,
    linked_advice_record_id || null,
    notes                   || null,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:      'CREATE',
    module:      'reviews',
    recordId:    result.lastInsertRowid,
    newValue:    created,
    description: `Review ${review_number} created`
  });

  return res.status(201).json(created);
});

// ─── PUT /:id — update ────────────────────────────────────────

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Review not found' });
  }

  // Broker isolation
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const {
    contact_id,
    account_id,
    policy_id,
    broker_id,
    assigned_admin_id,
    review_type,
    review_date,
    review_outcome,
    changes_in_risk_profile,
    changes_in_assets_exposure,
    gaps_identified,
    recommendations,
    follow_up_actions,
    next_review_date,
    review_completed,
    advice_record_required,
    linked_advice_record_id,
    notes
  } = req.body;

  db.prepare(`
    UPDATE reviews SET
      contact_id                 = ?,
      account_id                 = ?,
      policy_id                  = ?,
      broker_id                  = ?,
      assigned_admin_id          = ?,
      review_type                = ?,
      review_date                = ?,
      review_outcome             = ?,
      changes_in_risk_profile    = ?,
      changes_in_assets_exposure = ?,
      gaps_identified            = ?,
      recommendations            = ?,
      follow_up_actions          = ?,
      next_review_date           = ?,
      review_completed           = ?,
      advice_record_required     = ?,
      linked_advice_record_id    = ?,
      notes                      = ?,
      updated_at                 = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    contact_id                 !== undefined ? contact_id                 : existing.contact_id,
    account_id                 !== undefined ? account_id                 : existing.account_id,
    policy_id                  !== undefined ? policy_id                  : existing.policy_id,
    broker_id                  !== undefined ? broker_id                  : existing.broker_id,
    assigned_admin_id          !== undefined ? assigned_admin_id          : existing.assigned_admin_id,
    review_type                !== undefined ? review_type                : existing.review_type,
    review_date                !== undefined ? review_date                : existing.review_date,
    review_outcome             !== undefined ? review_outcome             : existing.review_outcome,
    changes_in_risk_profile    !== undefined ? changes_in_risk_profile    : existing.changes_in_risk_profile,
    changes_in_assets_exposure !== undefined ? changes_in_assets_exposure : existing.changes_in_assets_exposure,
    gaps_identified            !== undefined ? gaps_identified            : existing.gaps_identified,
    recommendations            !== undefined ? recommendations            : existing.recommendations,
    follow_up_actions          !== undefined ? follow_up_actions          : existing.follow_up_actions,
    next_review_date           !== undefined ? next_review_date           : existing.next_review_date,
    review_completed           !== undefined ? (review_completed        ? 1 : 0) : existing.review_completed,
    advice_record_required     !== undefined ? (advice_record_required  ? 1 : 0) : existing.advice_record_required,
    linked_advice_record_id    !== undefined ? linked_advice_record_id    : existing.linked_advice_record_id,
    notes                      !== undefined ? notes                      : existing.notes,
    id
  );

  const updated = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);

  res.locals.logAudit({
    action:      'UPDATE',
    module:      'reviews',
    recordId:    parseInt(id, 10),
    oldValue:    existing,
    newValue:    updated,
    description: `Review ${existing.review_number} updated`
  });

  return res.json(updated);
});

// ─── DELETE /:id ──────────────────────────────────────────────

router.delete('/:id', requireAuth, canDelete, (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Broker isolation
    const scopedBrokerId = getBrokerId(req);
    if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    db.prepare('DELETE FROM reviews WHERE id = ?').run(id);

    res.locals.logAudit({
      action:      'DELETE',
      module:      'reviews',
      recordId:    parseInt(id, 10),
      oldValue:    existing,
      description: `Review ${existing.review_number} deleted`
    });

    return res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    console.error('DELETE /reviews/:id error:', err.message);
    if (err.message && err.message.includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'Cannot delete: this record is referenced by other records.' });
    }
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
