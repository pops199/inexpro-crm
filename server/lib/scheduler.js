'use strict';

/**
 * Lightweight scheduler for the broker-fitness alert engine and the
 * weekly digest email. Cadence is read from system_settings:
 *
 *   alert_scan_interval_hours  (default 6)   — full scan every N hours
 *   weekly_digest_day          (default Mon) — 0=Sun..6=Sat
 *   weekly_digest_hour         (default 7)   — 0..23 local time
 *
 * Re-reads settings every minute so admins can change cadence without a
 * server restart.
 */

const { getDb } = require('../db/database');
const { sendMail } = require('./mailer');
const fitness = require('./broker-fitness-alerts');
const { notify } = require('./notifications');

let _scanTimer        = null;
let _scanIntervalMs   = 0;
let _lastScanAt       = 0;
let _lastDigestKey    = ''; // 'YYYY-WW' marker for once-per-week guard

function readSetting(key, fallback) {
  try {
    const db  = getDb();
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    if (!row || row.value === null || row.value === '') return fallback;
    try { return JSON.parse(row.value); }
    catch (_) { return row.value; }
  } catch (_) { return fallback; }
}

function effectiveScanIntervalMs() {
  const hrs = parseFloat(readSetting('alert_scan_interval_hours', 6));
  const safe = isFinite(hrs) && hrs > 0 ? hrs : 6;
  return Math.max(5 * 60 * 1000, safe * 3600 * 1000); // 5-minute floor
}

/** Notify the assigned broker for any active policy with no commission entry. */
function scanCommissionGaps() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT p.id, p.policy_number, p.policy_name, p.assigned_broker_id
      FROM policies p
      LEFT JOIN commission_log cl ON cl.policy_id = p.id
      WHERE p.policy_status NOT IN ('Cancelled','Lapsed','Expired')
        AND p.assigned_broker_id IS NOT NULL
      GROUP BY p.id
      HAVING COUNT(cl.id) = 0
    `).all();
    let created = 0;
    for (const r of rows) {
      created += notify({
        userIds:        r.assigned_broker_id,
        category:       'policy_commission',
        severity:       'warning',
        title:          'Commission entry missing',
        body:           `Policy ${r.policy_number || ''} ${r.policy_name ? '— ' + r.policy_name : ''} has no commission entry yet. Open the policy and log the commission type, rate, and arrangement.`,
        link:           `#/policies/${r.id}`,
        sourceModule:   'policies',
        sourceRecordId: r.id,
        dedupKey:       `policy_commission_missing:${r.id}`,
      });
    }
    return { policies: rows.length, notifications_created: created };
  } catch (err) {
    console.error('[commission-scan] error:', err.message);
    return { error: err.message };
  }
}

function runScan(reason) {
  _lastScanAt = Date.now();
  try {
    const summary = fitness.processAlerts();
    console.log(`[fitness-scan] ${reason} — fired=${summary.fired} suppressed=${summary.suppressed} brokers=${summary.evaluated}`);
  } catch (err) {
    console.error('[fitness-scan] error:', err.message);
  }
  try {
    const cs = scanCommissionGaps();
    console.log(`[commission-scan] ${reason} — policies=${cs.policies || 0} notifications_created=${cs.notifications_created || 0}`);
  } catch (err) {
    console.error('[commission-scan] error:', err.message);
  }
}

function scheduleNextScan() {
  if (_scanTimer) clearTimeout(_scanTimer);
  _scanIntervalMs = effectiveScanIntervalMs();
  _scanTimer = setTimeout(() => {
    runScan('interval');
    scheduleNextScan();
  }, _scanIntervalMs);
}

// ── Weekly digest ──────────────────────────────────────────────────────────

function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function buildDigest(db) {
  const profiles = db.prepare(`
    SELECT bp.*, u.email AS broker_email, u.full_name AS broker_name
    FROM broker_profiles bp LEFT JOIN users u ON u.id = bp.user_id
  `).all();
  const cycle    = fitness.currentCpdCycle();
  const deadline = fitness.cycleDeadlineFor(cycle);

  const rows = [];
  for (const p of profiles) {
    const pts = db.prepare(`
      SELECT COALESCE(SUM(points_awarded), 0) AS total
      FROM cpd_activities WHERE broker_profile_id = ? AND cpd_cycle = ?
    `).get(p.id, cycle);
    p.cpd_points_current = pts.total;
    p.cpd_cycle_deadline = deadline;
    const alerts = fitness.computeAlerts(p, new Date());
    if (alerts.length) rows.push({ profile: p, alerts });
  }
  return rows;
}

function runDigest() {
  const db = getDb();
  const rows = buildDigest(db);
  if (!rows.length) return { ok: true, brokers: 0 };

  const admins = db.prepare(
    "SELECT email FROM users WHERE role IN ('admin','admin_only') AND active = 1 AND email IS NOT NULL"
  ).all().map(u => u.email);
  if (!admins.length) return { ok: false, reason: 'no admin recipients' };

  const html = `
    <h2>Weekly Broker Fitness Digest</h2>
    <p>${rows.length} broker(s) currently have active fitness alerts.</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      <thead style="background:#eee;"><tr>
        <th align="left">Broker</th><th align="left">Alert</th><th align="left">Severity</th><th align="left">Detail</th>
      </tr></thead>
      <tbody>
        ${rows.flatMap(r =>
          r.alerts.map(a => `
            <tr>
              <td>${r.profile.broker_name || ''}</td>
              <td>${a.code}</td>
              <td>${a.severity}</td>
              <td>${a.message}</td>
            </tr>`)
        ).join('')}
      </tbody>
    </table>
  `;

  Promise.resolve()
    .then(() => sendMail({
      to: admins,
      subject: `[Weekly] Broker Fitness Digest — ${rows.length} broker(s) flagged`,
      html,
    }))
    .catch(() => {});
  return { ok: true, brokers: rows.length, alerts: rows.reduce((s, r) => s + r.alerts.length, 0) };
}

function digestTick() {
  try {
    const day  = parseInt(readSetting('weekly_digest_day', 1), 10);  // Mon
    const hour = parseInt(readSetting('weekly_digest_hour', 7), 10); // 07:00
    const now  = new Date();
    if (now.getDay() !== day || now.getHours() !== hour) return;
    const key = isoWeekKey(now);
    if (_lastDigestKey === key) return; // already sent this ISO week
    const r = runDigest();
    _lastDigestKey = key;
    console.log(`[fitness-digest] sent — brokers=${r.brokers || 0}`);
  } catch (err) {
    console.error('[fitness-digest] error:', err.message);
  }
}

// ── Public boot ────────────────────────────────────────────────────────────

function start() {
  // Initial scan ~7s after boot, then on dynamic interval.
  setTimeout(() => runScan('boot'), 7000);
  scheduleNextScan();

  // Re-evaluate cadence every minute (so admin changes apply quickly).
  setInterval(() => {
    if (effectiveScanIntervalMs() !== _scanIntervalMs) scheduleNextScan();
  }, 60 * 1000);

  // Weekly digest checker — runs each minute, sends only when day/hour matches
  // and not yet sent this ISO week.
  setInterval(digestTick, 60 * 1000);
}

module.exports = { start, runScan, runDigest, scanCommissionGaps };
