const express = require('express');
const { getDb } = require('../db/database');
const { requireAuth, canDelete, getBrokerId } = require('../middleware/auth');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

/**
 * Resolve recipient emails for a complaint:
 *   - handler / assignee / broker (linked to the account/contact)
 *   - supervisor(s) — admin role
 *   - senior management — admin role (broadcast for day-30 escalation)
 */
function resolveRecipients(db, complaint) {
  const out = { handler: [], supervisors: [], senior: [], broker: [] };
  const addEmail = (arr, row) => { if (row && row.email) arr.push(row.email); };

  const handlerId = complaint.assigned_handler_id || complaint.assigned_to_id || null;
  if (handlerId) {
    addEmail(out.handler, db.prepare('SELECT email FROM users WHERE id = ?').get(handlerId));
  }
  if (complaint.broker_id) {
    addEmail(out.broker, db.prepare('SELECT email FROM users WHERE id = ?').get(complaint.broker_id));
  }
  // Supervisors / senior management = users with admin role and active = 1
  const admins = db.prepare("SELECT email FROM users WHERE role = 'admin' AND active = 1 AND email IS NOT NULL").all();
  admins.forEach(u => { out.supervisors.push(u.email); out.senior.push(u.email); });
  return out;
}

function _fireAndForgetMail(opts) {
  // Don't await — caller must not block on email send.
  Promise.resolve().then(() => sendMail(opts)).catch(() => {});
}

/**
 * Day-by-day SLA scanner. Walks open complaints and:
 *   - Day 3+ no acknowledgment → set alert_day3_sent, email handler+supervisor
 *   - Day 21+ unresolved      → set alert_day21_sent, email supervisors
 *   - Day 30+ unresolved      → escalate severity to Critical, set
 *                               senior_management_notified, email seniors
 * Each alert is fired only once per complaint.
 */
function processSlaAlerts(db) {
  const today = new Date();
  const open = db.prepare(`
    SELECT * FROM complaints
    WHERE complaint_status NOT IN ('Resolved','Closed')
      AND COALESCE(withdrawn,0) = 0
  `).all();

  const setDay3  = db.prepare('UPDATE complaints SET alert_day3_sent = 1, alert_day3_sent_at = CURRENT_TIMESTAMP WHERE id = ?');
  const setDay21 = db.prepare('UPDATE complaints SET alert_day21_sent = 1, alert_day21_sent_at = CURRENT_TIMESTAMP WHERE id = ?');
  const setDay30 = db.prepare(`UPDATE complaints SET alert_day30_sent = 1, alert_day30_sent_at = CURRENT_TIMESTAMP,
    severity_rating = 'Critical', escalated_to_critical_at = CURRENT_TIMESTAMP,
    senior_management_notified = 1, senior_management_notified_at = CURRENT_TIMESTAMP
    WHERE id = ?`);

  const summary = { day3: 0, day21: 0, day30: 0 };

  for (const c of open) {
    const start = new Date(c.complaint_date);
    if (isNaN(start)) continue;
    const days = Math.floor((today - start) / 86400000);

    const recipients = resolveRecipients(db, c);

    if (days >= 3 && !c.alert_day3_sent && !c.acknowledgment_date) {
      setDay3.run(c.id);
      summary.day3++;
      _fireAndForgetMail({
        to: [...recipients.handler, ...recipients.broker].filter(Boolean),
        cc: recipients.supervisors,
        subject: `Day 3 alert — Complaint ${c.complaint_number} not yet acknowledged`,
        html: `<p>Complaint <strong>${c.complaint_number}</strong> has not been acknowledged 3 days after receipt.</p>
               <p>Summary: ${c.complaint_summary || ''}</p>
               <p>Please record an acknowledgment date in the CRM.</p>`,
      });
    }

    if (days >= 21 && !c.alert_day21_sent) {
      setDay21.run(c.id);
      summary.day21++;
      _fireAndForgetMail({
        to: recipients.supervisors,
        cc: [...recipients.handler, ...recipients.broker].filter(Boolean),
        subject: `Day 21 escalation — Complaint ${c.complaint_number} approaching 30-day deadline`,
        html: `<p>Complaint <strong>${c.complaint_number}</strong> is at day ${days} and remains unresolved.</p>
               <p>Summary: ${c.complaint_summary || ''}</p>
               <p>Please review and accelerate to meet the 30-day FAIS GCC deadline.</p>`,
      });
    }

    if (days >= 30 && !c.alert_day30_sent) {
      setDay30.run(c.id);
      summary.day30++;
      _fireAndForgetMail({
        to: recipients.senior,
        cc: [...recipients.handler, ...recipients.broker].filter(Boolean),
        subject: `Day 30 — Complaint ${c.complaint_number} auto-escalated to Critical`,
        html: `<p>Complaint <strong>${c.complaint_number}</strong> has reached day ${days} unresolved and has been auto-escalated to <strong>Critical</strong>.</p>
               <p>Summary: ${c.complaint_summary || ''}</p>
               <p>Senior management notification triggered.</p>`,
      });
    }
  }
  return summary;
}

// Run scanner once on boot, then every 6 hours.
setTimeout(() => { try { processSlaAlerts(getDb()); } catch (_) {} }, 5000);
setInterval(() => { try { processSlaAlerts(getDb()); } catch (_) {} }, 6 * 60 * 60 * 1000);

const SEVERITY_OPTS = ['Low', 'Medium', 'High', 'Critical'];
const RESOLUTION_OUTCOME_OPTS = [
  'Upheld — full remedy', 'Upheld — partial remedy', 'Not upheld',
  'Withdrawn by client', 'Referred to Ombudsman'
];
const ACCEPTANCE_OPTS = [
  'Yes', 'No — escalated', 'No — referred to Ombudsman', 'No response'
];
const ACK_METHOD_OPTS = ['Email', 'Written letter', 'Phone (with call log)', 'WhatsApp'];
const ROOT_CAUSE_OPTS = [
  'System error', 'Broker error', 'Insurer error',
  'Client misunderstanding', 'Product gap', 'Process gap', 'Other'
];

// ─── Helpers ─────────────────────────────────────────────────

function generateComplaintNumber(db) {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `COMP-${today}-`;

  const last = db.prepare(
    `SELECT complaint_number FROM complaints
     WHERE complaint_number LIKE ?
     ORDER BY complaint_number DESC
     LIMIT 1`
  ).get(`${prefix}%`);

  let seq = 1;
  if (last) {
    const parts = last.complaint_number.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Target resolution date: 30 calendar days from date received (FAIS GCC). */
function calcTargetResolutionDate(receivedDate) {
  if (!receivedDate) return null;
  const d = new Date(receivedDate);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

router.get('/options', requireAuth, (_req, res) => {
  res.json({
    severity: SEVERITY_OPTS,
    resolution_outcome: RESOLUTION_OUTCOME_OPTS,
    client_acceptance: ACCEPTANCE_OPTS,
    acknowledgment_method: ACK_METHOD_OPTS,
    root_cause: ROOT_CAUSE_OPTS,
  });
});

// ─── GET / — list ─────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { contact_id, account_id, status, category, broker_id, severity, page = 1, limit = 25 } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset   = (pageNum - 1) * limitNum;

  const conditions = [];
  const params     = [];

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId) {
    conditions.push('c2.broker_id = ?');
    params.push(scopedBrokerId);
  } else if (broker_id) {
    conditions.push('c2.broker_id = ?');
    params.push(broker_id);
  }

  if (contact_id) { conditions.push('c2.contact_id = ?');        params.push(contact_id); }
  if (account_id) { conditions.push('c2.account_id = ?');        params.push(account_id); }
  if (status)     { conditions.push('c2.complaint_status = ?');   params.push(status); }
  if (category)   { conditions.push('c2.complaint_category = ?'); params.push(category); }
  if (severity)   { conditions.push('c2.severity_rating = ?');    params.push(severity); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM complaints c2
    ${where}
  `).get(...params);

  const rows = db.prepare(`
    SELECT
      c2.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      a.account_name,
      p.policy_number,
      p.policy_name,
      cl.claim_number,
      b.full_name    AS broker_name,
      ow.full_name   AS complaint_owner_name,
      asgn.full_name AS assigned_to_name,
      hdl.full_name  AS handler_name,
      CAST(julianday('now') - julianday(c2.complaint_date) AS INTEGER) AS days_open
    FROM complaints c2
    LEFT JOIN contacts c    ON c.id    = c2.contact_id
    LEFT JOIN accounts a    ON a.id    = c2.account_id
    LEFT JOIN policies p    ON p.id    = c2.policy_id
    LEFT JOIN claims   cl   ON cl.id   = c2.claim_id
    LEFT JOIN users    b    ON b.id    = c2.broker_id
    LEFT JOIN users    ow   ON ow.id   = c2.complaint_owner_id
    LEFT JOIN users    asgn ON asgn.id = c2.assigned_to_id
    LEFT JOIN users    hdl  ON hdl.id  = c2.assigned_handler_id
    ${where}
    ORDER BY c2.complaint_date DESC, c2.id DESC
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

// ─── GET /:id ─────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();

  const row = db.prepare(`
    SELECT
      c2.*,
      c.first_name || ' ' || c.last_name AS contact_name,
      a.account_name,
      p.policy_number,
      p.policy_name,
      cl.claim_number,
      b.full_name    AS broker_name,
      ow.full_name   AS complaint_owner_name,
      asgn.full_name AS assigned_to_name,
      hdl.full_name  AS handler_name,
      cb.full_name   AS created_by_name,
      CAST(julianday('now') - julianday(c2.complaint_date) AS INTEGER) AS days_open
    FROM complaints c2
    LEFT JOIN contacts c    ON c.id    = c2.contact_id
    LEFT JOIN accounts a    ON a.id    = c2.account_id
    LEFT JOIN policies p    ON p.id    = c2.policy_id
    LEFT JOIN claims   cl   ON cl.id   = c2.claim_id
    LEFT JOIN users    b    ON b.id    = c2.broker_id
    LEFT JOIN users    ow   ON ow.id   = c2.complaint_owner_id
    LEFT JOIN users    asgn ON asgn.id = c2.assigned_to_id
    LEFT JOIN users    hdl  ON hdl.id  = c2.assigned_handler_id
    LEFT JOIN users    cb   ON cb.id   = c2.created_by
    WHERE c2.id = ?
  `).get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: 'Complaint not found' });
  }

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && row.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  return res.json(row);
});

// ─── POST / ───────────────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const db = getDb();

  const b = req.body || {};

  if (!b.complaint_date || !b.complaint_summary || !b.complaint_status) {
    return res.status(400).json({
      error: 'Required: complaint_date, complaint_summary, complaint_status'
    });
  }

  if (b.severity_rating && !SEVERITY_OPTS.includes(b.severity_rating)) {
    return res.status(400).json({ error: 'Invalid severity_rating' });
  }

  const complaint_number = generateComplaintNumber(db);
  const targetResolutionDate = calcTargetResolutionDate(b.complaint_date);

  // Supervisor notification trigger: auto-set when severity is High/Critical
  const supervisorNotified = (b.severity_rating === 'High' || b.severity_rating === 'Critical') ? 1 : 0;
  const supervisorNotifiedAt = supervisorNotified ? new Date().toISOString() : null;

  const result = db.prepare(`
    INSERT INTO complaints (
      complaint_number, contact_id, account_id, policy_id, claim_id,
      broker_id, complaint_owner_id, complaint_date, received_via,
      complaint_category, complaint_sub_category, complaint_summary, detailed_complaint,
      complaint_status, assigned_to_id, assigned_handler_id, severity_rating,
      supervisor_notified, supervisor_notified_at,
      acknowledgment_date, acknowledgment_method,
      target_resolution_date, response_due_date,
      resolution_date, resolution_outcome, resolution_summary,
      remedy_provided, compensation_paid, client_acceptance,
      fair_outcome_achieved,
      root_cause_identified, root_cause_category,
      corrective_action_taken, process_change_triggered, process_change_notes,
      complaint_escalated_internally, external_ombud_escalation, fsca_reportable,
      notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    complaint_number,
    b.contact_id                     || null,
    b.account_id                     || null,
    b.policy_id                      || null,
    b.claim_id                       || null,
    b.broker_id                      || null,
    b.complaint_owner_id             || null,
    b.complaint_date,
    b.received_via                   || null,
    b.complaint_category             || null,
    b.complaint_sub_category         || null,
    b.complaint_summary,
    b.detailed_complaint             || null,
    b.complaint_status,
    b.assigned_to_id                 || null,
    b.assigned_handler_id            || null,
    b.severity_rating                || null,
    supervisorNotified,
    supervisorNotifiedAt,
    b.acknowledgment_date            || null,
    b.acknowledgment_method          || null,
    targetResolutionDate,
    b.response_due_date              || targetResolutionDate,
    b.resolution_date                || null,
    b.resolution_outcome             || null,
    b.resolution_summary             || null,
    b.remedy_provided                || null,
    b.compensation_paid != null && b.compensation_paid !== '' ? Number(b.compensation_paid) : null,
    b.client_acceptance              || null,
    b.fair_outcome_achieved          ? 1 : 0,
    b.root_cause_identified          || null,
    b.root_cause_category            || null,
    b.corrective_action_taken        || null,
    b.process_change_triggered       ? 1 : 0,
    b.process_change_notes           || null,
    b.complaint_escalated_internally ? 1 : 0,
    b.external_ombud_escalation      ? 1 : 0,
    b.fsca_reportable                ? 1 : 0,
    b.notes                          || null,
    req.session.userId
  );

  const created = db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid);

  // Notify handler + supervisor (the latter only when severity is High/Critical)
  try {
    const r = resolveRecipients(db, created);
    const handlerTo = [...r.handler, ...r.broker].filter(Boolean);
    if (handlerTo.length) {
      _fireAndForgetMail({
        to: handlerTo,
        cc: supervisorNotified ? r.supervisors : undefined,
        subject: `New complaint logged — ${complaint_number}` +
                 (supervisorNotified ? ` (severity ${b.severity_rating})` : ''),
        html: `<p>A new complaint has been logged in the CRM.</p>
               <p><strong>Complaint #:</strong> ${complaint_number}<br>
                  <strong>Severity:</strong> ${b.severity_rating || '—'}<br>
                  <strong>Target resolution:</strong> ${targetResolutionDate || '—'}</p>
               <p>Summary: ${(b.complaint_summary || '').slice(0, 500)}</p>
               <p>Please open the complaint in the CRM and acknowledge within 3 business days.</p>`,
      });
      db.prepare('UPDATE complaints SET handler_notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(result.lastInsertRowid);
    }
  } catch (_) {}

  res.locals.logAudit({
    action:      'CREATE',
    module:      'complaints',
    recordId:    result.lastInsertRowid,
    newValue:    created,
    description: `Complaint ${complaint_number} created${supervisorNotified ? ' (supervisor auto-notified)' : ''}`
  });

  return res.status(201).json(created);
});

// ─── PUT /:id ─────────────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Complaint not found' });
  }

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const b = req.body || {};
  const pick = (k) => b[k] !== undefined ? b[k] : existing[k];

  // On resolution, require root cause + process change
  const newStatus = pick('complaint_status');
  if ((newStatus === 'Resolved' || newStatus === 'Closed') && existing.complaint_status !== newStatus) {
    if (!pick('root_cause_identified') && !pick('root_cause_category')) {
      return res.status(400).json({
        error: 'Cannot mark Resolved/Closed — root cause must be recorded first.'
      });
    }
  }

  // Auto-set supervisor_notified when severity escalates to High/Critical
  let supervisorNotified = existing.supervisor_notified;
  let supervisorNotifiedAt = existing.supervisor_notified_at;
  const newSeverity = pick('severity_rating');
  if ((newSeverity === 'High' || newSeverity === 'Critical') && !existing.supervisor_notified) {
    supervisorNotified = 1;
    supervisorNotifiedAt = new Date().toISOString();
  }

  const targetResolutionDate = b.complaint_date
    ? calcTargetResolutionDate(b.complaint_date)
    : existing.target_resolution_date;

  db.prepare(`
    UPDATE complaints SET
      contact_id                     = ?,
      account_id                     = ?,
      policy_id                      = ?,
      claim_id                       = ?,
      broker_id                      = ?,
      complaint_owner_id             = ?,
      complaint_date                 = ?,
      received_via                   = ?,
      complaint_category             = ?,
      complaint_sub_category         = ?,
      complaint_summary              = ?,
      detailed_complaint             = ?,
      complaint_status               = ?,
      assigned_to_id                 = ?,
      assigned_handler_id            = ?,
      severity_rating                = ?,
      supervisor_notified            = ?,
      supervisor_notified_at         = ?,
      acknowledgment_date            = ?,
      acknowledgment_method          = ?,
      target_resolution_date         = ?,
      response_due_date              = ?,
      resolution_date                = ?,
      resolution_outcome             = ?,
      resolution_summary             = ?,
      remedy_provided                = ?,
      compensation_paid              = ?,
      client_acceptance              = ?,
      fair_outcome_achieved          = ?,
      root_cause_identified          = ?,
      root_cause_category            = ?,
      corrective_action_taken        = ?,
      process_change_triggered       = ?,
      process_change_notes           = ?,
      complaint_escalated_internally = ?,
      external_ombud_escalation      = ?,
      fsca_reportable                = ?,
      notes                          = ?,
      updated_at                     = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    pick('contact_id'),
    pick('account_id'),
    pick('policy_id'),
    pick('claim_id'),
    pick('broker_id'),
    pick('complaint_owner_id'),
    pick('complaint_date'),
    pick('received_via'),
    pick('complaint_category'),
    pick('complaint_sub_category'),
    pick('complaint_summary'),
    pick('detailed_complaint'),
    pick('complaint_status'),
    pick('assigned_to_id'),
    pick('assigned_handler_id'),
    pick('severity_rating'),
    supervisorNotified,
    supervisorNotifiedAt,
    pick('acknowledgment_date'),
    pick('acknowledgment_method'),
    targetResolutionDate,
    pick('response_due_date'),
    pick('resolution_date'),
    pick('resolution_outcome'),
    pick('resolution_summary'),
    pick('remedy_provided'),
    b.compensation_paid !== undefined && b.compensation_paid !== '' ? Number(b.compensation_paid) : existing.compensation_paid,
    pick('client_acceptance'),
    b.fair_outcome_achieved !== undefined ? (b.fair_outcome_achieved ? 1 : 0) : existing.fair_outcome_achieved,
    pick('root_cause_identified'),
    pick('root_cause_category'),
    pick('corrective_action_taken'),
    b.process_change_triggered !== undefined ? (b.process_change_triggered ? 1 : 0) : existing.process_change_triggered,
    pick('process_change_notes'),
    b.complaint_escalated_internally !== undefined ? (b.complaint_escalated_internally ? 1 : 0) : existing.complaint_escalated_internally,
    b.external_ombud_escalation !== undefined ? (b.external_ombud_escalation ? 1 : 0) : existing.external_ombud_escalation,
    b.fsca_reportable !== undefined ? (b.fsca_reportable ? 1 : 0) : existing.fsca_reportable,
    pick('notes'),
    id
  );

  const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);

  res.locals.logAudit({
    action:      'UPDATE',
    module:      'complaints',
    recordId:    parseInt(id, 10),
    oldValue:    existing,
    newValue:    updated,
    description: `Complaint ${existing.complaint_number} updated`
  });

  return res.json(updated);
});

// ─── DELETE /:id ──────────────────────────────────────────────
// Spec rule: complaints must NOT be deletable. Use POST /:id/withdraw instead.
router.delete('/:id', requireAuth, (req, res) => {
  return res.status(405).json({
    error: 'Complaints cannot be deleted. Mark as Withdrawn (POST /:id/withdraw) — the record must remain on file.'
  });
});

// ─── POST /test-mail ──────────────────────────────────────────
// Diagnostic only — admin sends a sample alert email for a given complaint
// number to a chosen address. Body: { complaint_number, to }.
router.post('/test-mail', requireAuth, async (req, res) => {
  if (req.session.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const db = getDb();
  const { complaint_number, to } = req.body || {};
  if (!complaint_number || !to) {
    return res.status(400).json({ error: 'complaint_number and to are required' });
  }
  const c = db.prepare('SELECT * FROM complaints WHERE complaint_number = ?').get(complaint_number);
  if (!c) return res.status(404).json({ error: `Complaint ${complaint_number} not found` });

  const days = Math.floor((Date.now() - new Date(c.complaint_date).getTime()) / 86400000);
  const result = await sendMail({
    to,
    subject: `[TEST] Complaint ${c.complaint_number} alert preview`,
    html: `<p>This is a <strong>test</strong> alert email for complaint <strong>${c.complaint_number}</strong>.</p>
           <p><strong>Status:</strong> ${c.complaint_status}<br>
              <strong>Severity:</strong> ${c.severity_rating || '—'}<br>
              <strong>Days open:</strong> ${days}<br>
              <strong>Target resolution:</strong> ${c.target_resolution_date || '—'}<br>
              <strong>Acknowledged:</strong> ${c.acknowledgment_date || 'No'}</p>
           <p>Summary: ${(c.complaint_summary || '').slice(0, 500)}</p>
           <p style="color:#888;font-size:.85rem;">Triggered by ${req.session.userId} via /api/complaints/test-mail.</p>`,
  });
  if (!result.ok) return res.status(500).json({ error: 'Mail failed: ' + result.reason });
  res.json({ ok: true, sent_to: to, complaint_number });
});

// ─── POST /:id/withdraw ───────────────────────────────────────
// Sets withdrawn = 1 + status = Closed. The record remains on file.
router.post('/:id/withdraw', requireAuth, (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const reason = (req.body && req.body.reason) || null;
  const existing = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Complaint not found' });

  const scopedBrokerId = getBrokerId(req);
  if (scopedBrokerId && existing.broker_id !== scopedBrokerId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare(`
    UPDATE complaints SET
      withdrawn = 1,
      withdrawn_at = CURRENT_TIMESTAMP,
      withdrawn_by_id = ?,
      withdrawn_reason = ?,
      complaint_status = 'Closed',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.session.userId, reason, id);

  const updated = db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
  res.locals.logAudit({
    action:      'UPDATE',
    module:      'complaints',
    recordId:    parseInt(id, 10),
    oldValue:    existing,
    newValue:    updated,
    description: `Complaint ${existing.complaint_number} withdrawn` + (reason ? ` (${reason})` : ''),
  });
  res.json(updated);
});

// ─── GET /alerts/active ───────────────────────────────────────
// Returns open complaints with computed days_open + alert level.
router.get('/alerts/active', requireAuth, (req, res) => {
  const db = getDb();
  const scopedBrokerId = getBrokerId(req);
  const where = ['c.complaint_status NOT IN (\'Resolved\',\'Closed\')', 'COALESCE(c.withdrawn,0) = 0'];
  const params = [];
  if (scopedBrokerId) { where.push('c.broker_id = ?'); params.push(scopedBrokerId); }

  const rows = db.prepare(`
    SELECT c.id, c.complaint_number, c.complaint_status, c.severity_rating,
           c.complaint_date, c.acknowledgment_date, c.target_resolution_date,
           c.alert_day3_sent, c.alert_day21_sent, c.alert_day30_sent,
           c.contact_id, c.account_id,
           ct.first_name || ' ' || ct.last_name AS contact_name,
           a.account_name,
           u.full_name AS broker_name,
           CAST(julianday('now') - julianday(c.complaint_date) AS INTEGER) AS days_open
    FROM complaints c
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    LEFT JOIN accounts a  ON a.id  = c.account_id
    LEFT JOIN users u     ON u.id  = c.broker_id
    WHERE ${where.join(' AND ')}
    ORDER BY days_open DESC, c.complaint_date ASC
  `).all(...params);

  const annotated = rows.map(r => {
    let level = 'normal';
    if (r.days_open >= 30)      level = 'critical';
    else if (r.days_open >= 21) level = 'escalation';
    else if (r.days_open >= 3 && !r.acknowledgment_date) level = 'unacknowledged';
    return { ...r, alert_level: level };
  });
  res.json(annotated);
});

// ─── POST /alerts/run ─────────────────────────────────────────
// Manual trigger (admin) for the SLA scanner.
router.post('/alerts/run', requireAuth, (req, res) => {
  if (req.session.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  const summary = processSlaAlerts(getDb());
  res.json({ message: 'Scanner run complete', summary });
});

module.exports = router;
module.exports.processSlaAlerts = processSlaAlerts;
