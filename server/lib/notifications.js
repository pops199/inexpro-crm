'use strict';

/**
 * In-app notifications helper. Server-side modules call `notify()` to push
 * a row into the notifications table for one or more users. The route
 * `/api/notifications` exposes the feed to the UI (sidebar bell + view).
 *
 * Each call accepts a `dedup_key` so repeated triggers (e.g. the same
 * broker-fitness alert firing on each scan) don't create duplicate rows.
 */

const { getDb } = require('../db/database');

/**
 * Push a notification to one or more users.
 * @param {object} opts
 * @param {number|number[]} opts.userIds       - recipient user id(s)
 * @param {string} opts.category               - bucket key, e.g. 'broker_fitness'
 * @param {'info'|'warning'|'danger'|'success'} [opts.severity='info']
 * @param {string} opts.title                  - one-line summary
 * @param {string} [opts.body]                 - longer description
 * @param {string} [opts.link]                 - SPA hash route to open
 * @param {string} [opts.sourceModule]         - audit module name
 * @param {number} [opts.sourceRecordId]
 * @param {string} [opts.dedupKey]             - per-user uniqueness key
 */
function notify(opts) {
  const db = getDb();
  const userIds = Array.isArray(opts.userIds) ? opts.userIds : [opts.userIds];
  const ins = db.prepare(`
    INSERT OR IGNORE INTO notifications
      (user_id, category, severity, title, body, link, source_module, source_record_id, dedup_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  for (const uid of userIds.filter(Boolean)) {
    const r = ins.run(
      uid,
      opts.category,
      opts.severity || 'info',
      opts.title,
      opts.body || null,
      opts.link || null,
      opts.sourceModule || null,
      opts.sourceRecordId || null,
      opts.dedupKey || null
    );
    if (r.changes) inserted++;
  }
  return inserted;
}

function unreadCount(db, userId) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM notifications
     WHERE user_id = ? AND read_at IS NULL AND dismissed_at IS NULL`
  ).get(userId).n;
}

module.exports = { notify, unreadCount };
