'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin, getBrokerId } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const { notify } = require('../lib/notifications');

/** Push barrier alert to broker + supervisors. Idempotent via dedup_key. */
function notifyBarrier(db, eventRow, policy) {
  if (!eventRow || !eventRow.barrier_flagged) return;
  const recipients = new Set();
  if (policy && policy.assigned_broker_id) recipients.add(policy.assigned_broker_id);
  // Supervisors / senior management = admin + admin_only
  db.prepare("SELECT id FROM users WHERE role IN ('admin','admin_only') AND active = 1")
    .all().forEach(u => recipients.add(u.id));
  if (!recipients.size) return;

  const why = eventRow.outcome === 'Refused'
    ? 'outcome = Refused'
    : `${eventRow.days_to_action} days to action`;
  notify({
    userIds:        [...recipients],
    category:       'post_sale_barrier',
    severity:       'danger',
    title:          `Post-sale barrier — ${eventRow.event_type || 'event'}`,
    body:           `Policy ${eventRow.policy_id} ${eventRow.event_type} on ${eventRow.event_date} flagged as a barrier (${why}). Supervisor review required (TCF Outcome 6).`,
    link:           `#/policies/${eventRow.policy_id}`,
    sourceModule:   'post_sale_events',
    sourceRecordId: eventRow.id,
    dedupKey:       `post_sale_barrier:${eventRow.id}`,
  });
}

/** Clear notification when a previously-flagged event is no longer a barrier. */
function clearBarrierNotification(db, eventId) {
  try {
    db.prepare(`
      UPDATE notifications
      SET dismissed_at = COALESCE(dismissed_at, CURRENT_TIMESTAMP),
          read_at      = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE dedup_key = ?
    `).run(`post_sale_barrier:${eventId}`);
  } catch (_) {}
}

const EVENT_TYPES = [
  'Cancellation request', 'Provider switch', 'Mid-term amendment',
  'Policy lapse', 'Cover reduction', 'Complaint arising', 'Client exit'
];
const REQUEST_METHODS = ['Phone', 'Email', 'In person', 'WhatsApp', 'Written'];
const OUTCOMES = [
  'Processed as requested', 'Partially processed', 'Refused', 'Client withdrew request'
];
const LAPSE_REASONS = [
  'Non-payment', 'Voluntary cancellation', 'Client dissatisfaction',
  'Replacement by another broker', 'Unknown'
];
const NOTIFY_METHODS = ['Email', 'Written letter', 'Phone', 'WhatsApp'];

router.get('/options', (_req, res) => {
  res.json({
    event_type: EVENT_TYPES,
    request_method: REQUEST_METHODS,
    outcome: OUTCOMES,
    lapse_reason: LAPSE_REASONS,
    client_notification_method: NOTIFY_METHODS,
  });
});

/**
 * Compute days between two dates (business days approximation — calendar days).
 * The spec distinguishes business days, but to stay auditable we use calendar
 * days and flag > 5 days as a barrier (stricter than business-day equivalent).
 */
function daysBetween(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const a = new Date(fromDate);
  const b = new Date(toDate);
  return Math.round((b - a) / 86400000);
}

// GET / — list (filter by policy, type, barrier_flagged)
router.get('/', (req, res) => {
  const db = getDb();
  const { policy_id, event_type, barrier_flagged, contact_id, account_id } = req.query;
  const conditions = [];
  const params = [];

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push(`pol.assigned_broker_id = ?`);
    params.push(scopedBrokerId);
  }

  if (policy_id)  { conditions.push('pse.policy_id = ?');   params.push(policy_id); }
  if (event_type) { conditions.push('pse.event_type = ?');  params.push(event_type); }
  if (barrier_flagged !== undefined && barrier_flagged !== '') {
    conditions.push('pse.barrier_flagged = ?');
    params.push(parseInt(barrier_flagged, 10) || 0);
  }
  if (contact_id) { conditions.push('pse.contact_id = ?');  params.push(contact_id); }
  if (account_id) { conditions.push('pse.account_id = ?');  params.push(account_id); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT pse.*,
           pol.policy_number, pol.policy_name,
           (c.first_name || ' ' || c.last_name) AS contact_name,
           a.account_name,
           h.full_name AS handler_name,
           sup.full_name AS supervisor_name
    FROM post_sale_events pse
    LEFT JOIN policies pol ON pol.id = pse.policy_id
    LEFT JOIN contacts c   ON c.id   = pse.contact_id
    LEFT JOIN accounts a   ON a.id   = pse.account_id
    LEFT JOIN users    h   ON h.id   = pse.assigned_handler_id
    LEFT JOIN users    sup ON sup.id = pse.supervisor_id
    ${where}
    ORDER BY pse.event_date DESC, pse.id DESC
  `).all(...params);

  res.json(rows);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`
    SELECT pse.*,
           pol.policy_number, pol.policy_name, pol.assigned_broker_id,
           (c.first_name || ' ' || c.last_name) AS contact_name,
           a.account_name,
           h.full_name AS handler_name,
           sup.full_name AS supervisor_name
    FROM post_sale_events pse
    LEFT JOIN policies pol ON pol.id = pse.policy_id
    LEFT JOIN contacts c   ON c.id   = pse.contact_id
    LEFT JOIN accounts a   ON a.id   = pse.account_id
    LEFT JOIN users    h   ON h.id   = pse.assigned_handler_id
    LEFT JOIN users    sup ON sup.id = pse.supervisor_id
    WHERE pse.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Event not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && row.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(row);
});

function computeFields(b, existing) {
  const eventDate = b.event_date || (existing && existing.event_date);
  const dateActioned = b.date_actioned !== undefined ? b.date_actioned : (existing && existing.date_actioned);
  const daysToAction = dateActioned ? daysBetween(eventDate, dateActioned) : null;
  const outcome = b.outcome !== undefined ? b.outcome : (existing && existing.outcome);
  const barrierFlagged = (daysToAction !== null && daysToAction > 5) || outcome === 'Refused' ? 1 : 0;
  return { daysToAction, barrierFlagged };
}

router.post('/', (req, res) => {
  const db = getDb();
  const b = req.body || {};
  if (!b.policy_id || !b.event_type || !b.event_date) {
    return res.status(400).json({ error: 'policy_id, event_type, event_date are required' });
  }

  const policy = db.prepare('SELECT assigned_broker_id, contact_id, account_id FROM policies WHERE id = ?').get(b.policy_id);
  if (!policy) return res.status(404).json({ error: 'Policy not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && policy.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { daysToAction, barrierFlagged } = computeFields(b);

  const result = db.prepare(`
    INSERT INTO post_sale_events (
      policy_id, contact_id, account_id, event_type, event_date, request_method,
      assigned_handler_id, date_actioned, days_to_action, outcome, outcome_notes,
      refusal_reason, lapse_reason, switch_from_insurer, switch_to_insurer,
      client_notification_date, client_notification_method, barrier_flagged,
      supervisor_review_notes, supervisor_id, supervisor_review_date, linked_complaint_id,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.policy_id,
    b.contact_id || policy.contact_id || null,
    b.account_id || policy.account_id || null,
    b.event_type,
    b.event_date,
    b.request_method || null,
    b.assigned_handler_id || req.session.userId,
    b.date_actioned || null,
    daysToAction,
    b.outcome || null,
    b.outcome_notes || null,
    b.refusal_reason || null,
    b.lapse_reason || null,
    b.switch_from_insurer || null,
    b.switch_to_insurer || null,
    b.client_notification_date || null,
    b.client_notification_method || null,
    barrierFlagged,
    b.supervisor_review_notes || null,
    b.supervisor_id || null,
    b.supervisor_review_date || null,
    b.linked_complaint_id || null,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM post_sale_events WHERE id = ?').get(result.lastInsertRowid);

  res.locals.logAudit({
    action:   'CREATE',
    module:   'post_sale_events',
    recordId: result.lastInsertRowid,
    newValue: created,
    description: `Post-sale event logged: ${b.event_type} on policy ${b.policy_id}` +
                 (created.barrier_flagged ? ' [BARRIER FLAGGED]' : '') +
                 (created.lapse_reason ? ` — lapse reason: ${created.lapse_reason}` : '')
  });

  if (created.barrier_flagged) notifyBarrier(db, created, policy);

  res.status(201).json(created);
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM post_sale_events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  const policy = db.prepare('SELECT assigned_broker_id FROM policies WHERE id = ?').get(existing.policy_id);
  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && policy && policy.assigned_broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  const { daysToAction, barrierFlagged } = computeFields(b, existing);

  db.prepare(`
    UPDATE post_sale_events SET
      event_type                  = ?,
      event_date                  = ?,
      request_method              = ?,
      assigned_handler_id         = ?,
      date_actioned               = ?,
      days_to_action              = ?,
      outcome                     = ?,
      outcome_notes               = ?,
      refusal_reason              = ?,
      lapse_reason                = ?,
      switch_from_insurer         = ?,
      switch_to_insurer           = ?,
      client_notification_date    = ?,
      client_notification_method  = ?,
      barrier_flagged             = ?,
      supervisor_review_notes     = ?,
      supervisor_id               = ?,
      supervisor_review_date      = ?,
      linked_complaint_id         = ?,
      updated_at                  = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('event_type'),
    pick('event_date'),
    pick('request_method'),
    pick('assigned_handler_id'),
    pick('date_actioned'),
    daysToAction,
    pick('outcome'),
    pick('outcome_notes'),
    pick('refusal_reason'),
    pick('lapse_reason'),
    pick('switch_from_insurer'),
    pick('switch_to_insurer'),
    pick('client_notification_date'),
    pick('client_notification_method'),
    barrierFlagged,
    pick('supervisor_review_notes'),
    pick('supervisor_id'),
    pick('supervisor_review_date'),
    pick('linked_complaint_id'),
    id
  );

  const updated = db.prepare('SELECT * FROM post_sale_events WHERE id = ?').get(id);

  res.locals.logAudit({
    action:   'UPDATE',
    module:   'post_sale_events',
    recordId: id,
    oldValue: existing,
    newValue: updated,
    description: `Post-sale event ${id} updated` +
                 (updated.barrier_flagged !== existing.barrier_flagged
                   ? (updated.barrier_flagged ? ' [BARRIER FLAGGED]' : ' [BARRIER CLEARED]')
                   : '')
  });

  // Barrier transition handling
  if (updated.barrier_flagged && !existing.barrier_flagged) {
    notifyBarrier(db, updated, policy);
  } else if (!updated.barrier_flagged && existing.barrier_flagged) {
    clearBarrierNotification(db, id);
  } else if (updated.barrier_flagged) {
    // Still flagged — re-fire only if recipients haven't yet acked (dedup_key suppresses duplicates).
    notifyBarrier(db, updated, policy);
  }

  res.json(updated);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM post_sale_events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM post_sale_events WHERE id = ?').run(id);
  clearBarrierNotification(db, id);
  res.locals.logAudit({
    action:   'DELETE',
    module:   'post_sale_events',
    recordId: id,
    oldValue: existing,
    description: `Post-sale event ${id} deleted`
  });
  res.json({ message: 'Deleted' });
});

// ── GET /barriers — list of currently barrier-flagged events for the
// caller (broker sees own; admin sees all). Drives the dashboard banner.
router.get('/barriers', (req, res) => {
  const db = getDb();
  const scopedBrokerId = getBrokerId(req);
  const where = scopedBrokerId ? 'WHERE pol.assigned_broker_id = ? AND pse.barrier_flagged = 1' : 'WHERE pse.barrier_flagged = 1';
  const params = scopedBrokerId ? [scopedBrokerId] : [];
  const rows = db.prepare(`
    SELECT pse.id, pse.policy_id, pse.event_type, pse.event_date, pse.outcome,
           pse.days_to_action, pse.lapse_reason, pse.refusal_reason,
           pol.policy_number, pol.policy_name, pol.assigned_broker_id,
           u.full_name AS broker_name
    FROM post_sale_events pse
    LEFT JOIN policies pol ON pol.id = pse.policy_id
    LEFT JOIN users u ON u.id = pol.assigned_broker_id
    ${where}
    ORDER BY pse.event_date DESC, pse.id DESC
    LIMIT 50
  `).all(...params);
  res.json({ data: rows });
});

module.exports = router;
