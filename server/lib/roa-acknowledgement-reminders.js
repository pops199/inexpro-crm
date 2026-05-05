'use strict';

/**
 * ROA acknowledgement reminders.
 *
 * For every ROA where the client has not yet acknowledged receipt, send a
 * reminder to the assigned broker (email + in-app notification) at 3, 7,
 * 14, and 30 days after the document was issued. Once the client
 * acknowledges, the ROA stops appearing in the candidate query and no
 * further reminders fire.
 *
 * Idempotency lives in `roa_acknowledgement_reminders_sent`: each
 * (advice_record_id, reminder_stage) pair is unique, so the scheduler
 * can run any number of times without re-sending a stage that has
 * already gone out.
 */

const { getDb } = require('../db/database');
const { sendMail } = require('./mailer');
const { notify } = require('./notifications');
const { logAudit } = require('../middleware/audit');

const STAGES = [3, 7, 14, 30];

function alreadySent(db, adviceRecordId, stage) {
  return !!db.prepare(
    'SELECT 1 FROM roa_acknowledgement_reminders_sent WHERE advice_record_id = ? AND reminder_stage = ?'
  ).get(adviceRecordId, stage);
}

function markSent(db, adviceRecordId, stage) {
  db.prepare(`
    INSERT OR IGNORE INTO roa_acknowledgement_reminders_sent
      (advice_record_id, reminder_stage, sent_at) VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(adviceRecordId, stage);
}

function loadCandidates(db) {
  return db.prepare(`
    SELECT
      ar.id,
      ar.advice_record_number,
      ar.broker_id,
      ar.contact_id,
      ar.account_id,
      ar.advice_date,
      ar.roa_generation_date,
      ar.issue_date,
      ar.final_document_issued,
      ar.client_acknowledgement_received,
      COALESCE(ar.issue_date, ar.roa_generation_date) AS clock_start,
      u.email      AS broker_email,
      u.full_name  AS broker_name,
      c.first_name || ' ' || c.last_name AS contact_name,
      c.email      AS contact_email,
      a.account_name AS account_name
    FROM advice_records ar
    LEFT JOIN users    u ON u.id = ar.broker_id
    LEFT JOIN contacts c ON c.id = ar.contact_id
    LEFT JOIN accounts a ON a.id = ar.account_id
    WHERE COALESCE(ar.client_acknowledgement_received, 0) = 0
      AND ar.broker_id IS NOT NULL
      AND COALESCE(ar.issue_date, ar.roa_generation_date) IS NOT NULL
  `).all();
}

function daysSince(dateStr, now) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const ms = now - d;
  return Math.floor(ms / 86400000);
}

function processRoaReminders(db = getDb()) {
  const now = new Date();
  const rows = loadCandidates(db);
  const summary = { evaluated: rows.length, fired: 0, suppressed: 0 };

  for (const r of rows) {
    const days = daysSince(r.clock_start, now);
    if (days == null) continue;

    for (const stage of STAGES) {
      if (days < stage) continue;
      if (alreadySent(db, r.id, stage)) { summary.suppressed++; continue; }

      try {
        const clientLabel = r.contact_name || r.account_name || 'the client';
        const refLabel    = r.advice_record_number || `ROA #${r.id}`;
        const link        = `#/advice-records/${r.id}`;
        const title       = `ROA ${refLabel} — no acknowledgement after ${stage} days`;
        const bodyText =
          `${clientLabel} has not yet acknowledged receipt of ${refLabel}.\n` +
          `Issued: ${String(r.clock_start).slice(0, 10)} (${days} days ago).\n` +
          `Follow up with the client to confirm receipt and acknowledgement.`;

        // 1) In-app notification for the broker.
        try {
          notify({
            userIds:        r.broker_id,
            category:       'roa_acknowledgement',
            severity:       stage >= 14 ? 'danger' : 'warning',
            title,
            body:           bodyText,
            link,
            sourceModule:   'advice_records',
            sourceRecordId: r.id,
            dedupKey:       `roa_ack_reminder:${r.id}:${stage}`,
          });
        } catch (_) {}

        // 2) Email the broker (fire-and-forget).
        // System reminder — no `userId` so no personal signature is appended.
        // This goes TO the broker (the assigned owner) reminding them to chase
        // their client; it is not a mail "from a user".
        if (r.broker_email) {
          Promise.resolve()
            .then(() => sendMail({
              to:      r.broker_email,
              subject: `[Reminder] ${title}`,
              html: `
                <p>This is an automated reminder from the Inexpro CRM.</p>
                <p><strong>${clientLabel}</strong> has not yet acknowledged receipt of
                <strong>${refLabel}</strong>.</p>
                <ul>
                  <li>Issued: ${String(r.clock_start).slice(0, 10)} (${days} days ago)</li>
                  <li>Reminder stage: ${stage}-day</li>
                  ${r.contact_email ? `<li>Client email on file: ${r.contact_email}</li>` : ''}
                </ul>
                <p>Please follow up with the client to confirm acknowledgement.
                Reminders will continue at 3, 7, 14, and 30 days until the
                ROA is marked acknowledged in the CRM.</p>`,
              audit: {
                module: 'advice_records',
                recordId: r.id,
                description: `ROA acknowledgement reminder (${stage}-day) emailed to ${r.broker_email}`,
              },
            }))
            .catch(() => {});
        }

        // 3) Audit-log the dispatch.
        try {
          logAudit({
            action:      'EMAIL',
            module:      'advice_records',
            recordId:    r.id,
            description: `ROA acknowledgement reminder (${stage}-day) dispatched to broker ${r.broker_name || r.broker_id}`,
          });
        } catch (_) {}

        // 4) Mark sent so it never repeats.
        markSent(db, r.id, stage);
        summary.fired++;
      } catch (err) {
        console.error('[roa-ack-reminder] error', r.id, stage, err.message);
      }
    }
  }

  return summary;
}

module.exports = { processRoaReminders, STAGES };
