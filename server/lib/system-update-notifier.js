'use strict';

/**
 * Sends an in-app notification to every active admin / admin_only user
 * when a newer tagged release is available on GitHub.
 *
 * Idempotent per release: the dedup_key embeds the target tag, so each
 * admin gets at most one notification per version. The manual "Check for
 * updates" button and the weekly Monday auto-scan share the same key,
 * so clicking the button repeatedly while v1.2.3 is the latest will not
 * spam anyone — only the first call inserts the row.
 *
 * Used by:
 *   - POST /api/admin/system/check-updates  (manual click)
 *   - server/lib/scheduler.js weekly tick   (Monday 07:00 auto-scan)
 */

const { getDb } = require('../db/database');
const { notify } = require('./notifications');

/**
 * @param {object} status   — payload returned by updater.getStatus / checkForUpdates
 * @param {string} [source] — 'manual_check' | 'weekly_scan' (telemetry only)
 * @returns {{notified:number, latest_tag?:string, skipped?:string, source?:string}}
 */
function notifyAdminsIfUpdateAvailable(status, source) {
  if (!status || !status.update_available || !status.latest_tag) {
    return { notified: 0, skipped: 'no update available', source };
  }
  const db = getDb();
  const admins = db.prepare(
    "SELECT id FROM users WHERE role IN ('admin','admin_only') AND active = 1"
  ).all().map(u => u.id);
  if (!admins.length) return { notified: 0, skipped: 'no admin recipients', source };

  const fromLabel = status.current_tag
    || (status.current_commit ? status.current_commit.slice(0, 7) : 'current');
  const inserted = notify({
    userIds:      admins,
    category:     'system_update',
    severity:     'info',
    title:        `New release available — ${status.latest_tag}`,
    body:         `A new Inexpro CRM release is available (${fromLabel} → ${status.latest_tag}). Open Admin → System Update to review the release notes and apply.`,
    link:         '#/admin',
    sourceModule: 'system_update',
    dedupKey:     `system_update_available:${status.latest_tag}`,
  });
  return { notified: inserted, latest_tag: status.latest_tag, source };
}

module.exports = { notifyAdminsIfUpdateAvailable };
