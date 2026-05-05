'use strict';

/**
 * Broker Fitness alert engine — implements spec section 4.15.
 *
 * Two responsibilities:
 *   1. computeAlerts(profile, now) — pure function returning the list of
 *      alerts for a broker right now. Used both by the scheduler and by
 *      the GET /alerts endpoints that feed the dashboard banner.
 *   2. processAlerts(db) — scheduled side-effecting pass that:
 *        - applies hard side-effects (auto-suspend, flag ROAs, escalate)
 *        - sends each alert's email exactly once per state transition
 *      Persistence is via broker_fitness_alerts_sent (key = broker_id +
 *      alert_code) so re-runs don't spam recipients.
 */

const { getDb } = require('../db/database');
const { sendMail } = require('./mailer');
const { notify } = require('./notifications');
const { logAudit } = require('../middleware/audit');

// ── Alert rules ────────────────────────────────────────────────────────────

const RULES = [
  {
    code: 're5_90',
    severity: 'warning',
    when: (p, ctx) => p.re5_status !== 'Passed' && ctx.re5Days !== null && ctx.re5Days > 30 && ctx.re5Days <= 90,
    msg:  (p, ctx) => `RE5 deadline in ${ctx.re5Days} days (${p.re5_deadline}).`,
    audience: 'broker_supervisor',
  },
  {
    code: 're5_30',
    severity: 'danger',
    when: (p, ctx) => p.re5_status !== 'Passed' && ctx.re5Days !== null && ctx.re5Days > 0 && ctx.re5Days <= 30,
    msg:  (p, ctx) => `RE5 deadline in ${ctx.re5Days} days — escalation: all advice records by this broker are now flagged.`,
    audience: 'senior',
    sideEffect: 'flag_advice_records',
  },
  {
    code: 're5_passed',
    severity: 'danger',
    when: (p, ctx) => p.re5_status !== 'Passed' && ctx.re5Days !== null && ctx.re5Days <= 0,
    msg:  (p, ctx) => `RE5 deadline passed (${p.re5_deadline}) — broker auto-suspended from creating new ROAs.`,
    audience: 'senior',
    sideEffect: 'suspend_advice',
  },
  {
    code: 'cpd_90_low',
    severity: 'warning',
    when: (p, ctx) => ctx.cycleDays !== null && ctx.cycleDays > 30 && ctx.cycleDays <= 90 && (p.cpd_points_current || 0) < 14,
    msg:  (p, ctx) => `CPD cycle closes in ${ctx.cycleDays} days — only ${p.cpd_points_current || 0} points logged (< 14).`,
    audience: 'broker_supervisor',
  },
  {
    code: 'cpd_30',
    severity: 'danger',
    when: (p, ctx) => ctx.cycleDays !== null && ctx.cycleDays > 7 && ctx.cycleDays <= 30 && (p.cpd_points_current || 0) < 18,
    msg:  (p, ctx) => `CPD cycle closes in ${ctx.cycleDays} days — ${p.cpd_points_current || 0}/18 logged.`,
    audience: 'broker_supervisor',
  },
  {
    code: 'cpd_7',
    severity: 'danger',
    when: (p, ctx) => ctx.cycleDays !== null && ctx.cycleDays > 0 && ctx.cycleDays <= 7 && (p.cpd_points_current || 0) < 18,
    msg:  (p, ctx) => `CPD cycle closes in ${ctx.cycleDays} days — ${p.cpd_points_current || 0}/18 logged.`,
    audience: 'senior',
  },
  {
    code: 'cpd_closed_short',
    severity: 'danger',
    when: (p, ctx) => ctx.cycleDays !== null && ctx.cycleDays <= 0 && (p.cpd_points_current || 0) < 18,
    msg:  (p, ctx) => `CPD cycle closed with only ${p.cpd_points_current || 0}/18 points — broker flagged.`,
    audience: 'senior',
    sideEffect: 'flag_cpd_short',
  },
  {
    code: 'cob_30',
    severity: 'warning',
    when: (p, ctx) => ctx.cobDays !== null && ctx.cobDays <= 30 && ctx.cobIncomplete,
    msg:  (p, ctx) => `Class of Business deadline ${ctx.cobDays < 0 ? 'passed' : `in ${ctx.cobDays} days`} (${p.cob_deadline}).`,
    audience: 'broker_supervisor',
  },
  {
    code: 'debarred',
    severity: 'danger',
    when: (p) => p.good_standing_status === 'Debarred',
    msg:  () => `Broker is DEBARRED — all advice functions suspended.`,
    audience: 'senior',
    sideEffect: 'suspend_advice',
  },
  {
    code: 'insolvent',
    severity: 'danger',
    when: (p) => !!p.insolvency_flag,
    msg:  () => `Broker flagged as insolvent / sequestrated.`,
    audience: 'senior',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function currentCpdCycle(now = new Date()) {
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-06 – ${year + 1}-05`;
}
function cycleDeadlineFor(cycle) {
  const m = /(\d{4})-06\s*–\s*(\d{4})-05/.exec(cycle || '');
  return m ? `${m[2]}-05-31` : null;
}
function daysUntil(dateStr, now) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.round((d - now) / 86400000);
}

/**
 * Pure compute: return the alerts array for a single profile.
 * Caller must hydrate `cpd_points_current` first.
 */
function computeAlerts(profile, now = new Date()) {
  const cycle = currentCpdCycle(now);
  const ctx = {
    re5Days:   daysUntil(profile.re5_deadline, now),
    cobDays:   daysUntil(profile.cob_deadline, now),
    cycleDays: daysUntil(profile.cpd_cycle_deadline || cycleDeadlineFor(cycle), now),
    cobIncomplete:
      (profile.cob_personal_lines !== 'Completed' && profile.cob_personal_lines !== 'Not required') ||
      (profile.cob_commercial_lines !== 'Completed' && profile.cob_commercial_lines !== 'Not required'),
  };

  return RULES
    .filter(r => {
      try { return r.when(profile, ctx); } catch (_) { return false; }
    })
    .map(r => ({
      code:     r.code,
      severity: r.severity,
      message:  r.msg(profile, ctx),
      audience: r.audience,
      sideEffect: r.sideEffect || null,
    }));
}

/** Resolve recipients for a given audience tag. Returns { emails, userIds }. */
function resolveAudience(db, profile, audience) {
  const emails = new Set();
  const userIds = new Set();
  const broker = db.prepare('SELECT id, email FROM users WHERE id = ?').get(profile.user_id);
  if (broker) {
    if (broker.email) emails.add(broker.email);
    userIds.add(broker.id);
  }
  // Supervisors / senior management = admin + admin_only
  db.prepare("SELECT id, email FROM users WHERE role IN ('admin','admin_only') AND active = 1")
    .all().forEach(u => {
      userIds.add(u.id);
      if (u.email) emails.add(u.email);
    });
  return { emails: [...emails], userIds: [...userIds] };
}

// ── Side-effects ───────────────────────────────────────────────────────────

const SIDE_EFFECTS = {
  suspend_advice(db, profile) {
    db.prepare('UPDATE broker_profiles SET suspended_from_advice = 1 WHERE id = ?').run(profile.id);
  },
  flag_advice_records(db, profile) {
    db.prepare(`
      UPDATE advice_records SET re5_flag = 1
      WHERE broker_id = ? AND COALESCE(re5_flag, 0) = 0
    `).run(profile.user_id);
  },
  flag_cpd_short(db, profile) {
    db.prepare('UPDATE broker_profiles SET cpd_short_flag = 1 WHERE id = ?').run(profile.id);
  },
};

// ── Once-per-state-transition tracking ─────────────────────────────────────

function alreadySent(db, brokerProfileId, code) {
  const row = db.prepare(
    'SELECT 1 FROM broker_fitness_alerts_sent WHERE broker_profile_id = ? AND alert_code = ?'
  ).get(brokerProfileId, code);
  return !!row;
}
function markSent(db, brokerProfileId, code) {
  db.prepare(`
    INSERT OR IGNORE INTO broker_fitness_alerts_sent
      (broker_profile_id, alert_code, sent_at) VALUES (?, ?, CURRENT_TIMESTAMP)
  `).run(brokerProfileId, code);
}

// ── Scheduler entry-point ──────────────────────────────────────────────────

function loadProfilesWithCpd(db) {
  const cycle = currentCpdCycle();
  const rows = db.prepare(`
    SELECT bp.*, u.email AS broker_email, u.full_name AS broker_name
    FROM broker_profiles bp
    LEFT JOIN users u ON u.id = bp.user_id
  `).all();
  for (const r of rows) {
    const pts = db.prepare(`
      SELECT COALESCE(SUM(points_awarded), 0) AS total
      FROM cpd_activities WHERE broker_profile_id = ? AND cpd_cycle = ?
    `).get(r.id, cycle);
    r.cpd_points_current  = pts.total;
    r.cpd_cycle_deadline  = cycleDeadlineFor(cycle);
    r.current_cpd_cycle   = cycle;
  }
  return rows;
}

function processAlerts(db = getDb()) {
  const now = new Date();
  const profiles = loadProfilesWithCpd(db);
  const summary = { evaluated: profiles.length, fired: 0, suppressed: 0 };

  for (const p of profiles) {
    const alerts = computeAlerts(p, now);

    for (const a of alerts) {
      if (alreadySent(db, p.id, a.code)) { summary.suppressed++; continue; }

      try {
        // 1) Apply side-effect (idempotent — guarded by once-per-code flag).
        if (a.sideEffect && SIDE_EFFECTS[a.sideEffect]) {
          SIDE_EFFECTS[a.sideEffect](db, p);
        }

        const { emails, userIds } = resolveAudience(db, p, a.audience);

        // 2) Send email (fire-and-forget).
        // System alert — no `userId` so no personal signature is appended;
        // this is an automated compliance message, not "from a user".
        if (emails.length) {
          Promise.resolve()
            .then(() => sendMail({
              to: emails,
              subject: `[${a.severity.toUpperCase()}] Broker Fitness — ${p.broker_name || 'broker'} — ${a.code}`,
              html: `<p><strong>${a.message}</strong></p>
                     <p>Broker: ${p.broker_name} (${p.broker_email || 'no email'})</p>
                     <p>FSCA reg: ${p.fsca_registration_number || '—'}</p>
                     <p>Open the broker fitness audit report in the CRM for full history.</p>`,
              audit: {
                module: 'broker_profiles',
                recordId: p.id,
                description: `[${a.severity.toUpperCase()}] Broker fitness alert "${a.code}" emailed`,
              },
            }))
            .catch(() => {});
        }

        // 3) In-app notifications for every recipient (broker + admins).
        try {
          notify({
            userIds,
            category:        'broker_fitness',
            severity:        a.severity,
            title:           `Broker fitness — ${p.broker_name || 'broker'}`,
            body:            a.message,
            link:            `#/broker-profiles/${p.id}`,
            sourceModule:    'broker_profiles',
            sourceRecordId:  p.id,
            dedupKey:        `broker_fitness:${p.id}:${a.code}`,
          });
        } catch (_) {}

        // 4) Audit-log the dispatch.
        try {
          logAudit({
            action:      'EMAIL',
            module:      'broker_profiles',
            recordId:    p.id,
            description: `Broker fitness alert dispatched: ${a.code} — ${a.message}`,
          });
        } catch (_) {}

        // 5) Mark sent.
        markSent(db, p.id, a.code);
        summary.fired++;
      } catch (err) {
        console.error('Broker fitness alert error', a.code, p.id, err.message);
      }
    }
  }
  return summary;
}

/** Re-evaluate one broker (used after profile edits to clear stale suspensions). */
function reconcile(db, brokerProfileId) {
  const cycle = currentCpdCycle();
  const p = db.prepare(`
    SELECT bp.*, u.email AS broker_email, u.full_name AS broker_name
    FROM broker_profiles bp LEFT JOIN users u ON u.id = bp.user_id
    WHERE bp.id = ?
  `).get(brokerProfileId);
  if (!p) return null;
  const pts = db.prepare(`
    SELECT COALESCE(SUM(points_awarded), 0) AS total
    FROM cpd_activities WHERE broker_profile_id = ? AND cpd_cycle = ?
  `).get(brokerProfileId, cycle);
  p.cpd_points_current  = pts.total;
  p.cpd_cycle_deadline  = cycleDeadlineFor(cycle);

  const live = computeAlerts(p, new Date());
  const liveCodes = new Set(live.map(a => a.code));

  // Clear suspension if the trigger conditions no longer apply.
  if (p.suspended_from_advice && !liveCodes.has('re5_passed') && !liveCodes.has('debarred')) {
    db.prepare('UPDATE broker_profiles SET suspended_from_advice = 0 WHERE id = ?').run(p.id);
  }
  // Clear CPD-short flag if cycle has rolled over.
  if (p.cpd_short_flag && !liveCodes.has('cpd_closed_short')) {
    db.prepare('UPDATE broker_profiles SET cpd_short_flag = 0 WHERE id = ?').run(p.id);
  }
  // Reset alert dispatch tracking for any code no longer firing → next time it
  // comes back we email again (state transition).
  const sent = db.prepare(
    'SELECT alert_code FROM broker_fitness_alerts_sent WHERE broker_profile_id = ?'
  ).all(p.id).map(r => r.alert_code);
  for (const code of sent) {
    if (!liveCodes.has(code)) {
      db.prepare('DELETE FROM broker_fitness_alerts_sent WHERE broker_profile_id = ? AND alert_code = ?')
        .run(p.id, code);
    }
  }
  return live;
}

module.exports = {
  computeAlerts,
  processAlerts,
  reconcile,
  currentCpdCycle,
  cycleDeadlineFor,
};
