/**
 * System update endpoints — wraps server/lib/updater.js with auth + audit.
 *
 * Mounted at /api/admin/system. Full-admin only — admin_only role
 * cannot update production code (matches the broader "admin_only can't
 * delete / can't change auth surface" pattern in middleware/auth.js).
 *
 * COFI/POPIA: every action is audit-logged with the trigger user, the
 * version transition, snapshot id, and outcome. This makes the upgrade
 * trail discoverable in the existing audit module without a new schema.
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../db/database');
const updater = require('../lib/updater');
const migrate = require('../db/migrate');

const router = express.Router();

router.use(requireAuth, requireAdmin);

// ── GET /status — read-only summary for the admin UI ──────────────────
router.get('/status', (req, res) => {
  try {
    const db = getDb();
    const status = updater.getStatus(db, { runMigrationsModule: migrate });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /check-updates — fetches tags from origin then returns status ─
router.post('/check-updates', (req, res) => {
  try {
    const db = getDb();
    const status = updater.checkForUpdates(db, { runMigrationsModule: migrate });
    res.locals.logAudit({
      action: 'CHECK',
      module: 'system_update',
      description: `Checked for updates — current ${status.current_tag || status.current_commit?.slice(0,7)}, latest ${status.latest_tag}`,
    });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message, code: err.code || null });
  }
});

// ── POST /apply — snapshot, checkout latest tag, npm install, migrate ──
router.post('/apply', (req, res) => {
  const db = getDb();
  const triggerUserId = req.session?.userId;
  let result;
  try {
    result = updater.applyUpdate(db, {
      runMigrationsModule: migrate,
      triggerUserId,
      skipNpm: req.body?.skipNpm === true,
    });
  } catch (err) {
    res.locals.logAudit({
      action: 'UPDATE_FAILED',
      module: 'system_update',
      description: `Update aborted: ${err.message}`,
    });
    return res.status(409).json({ error: err.message, code: err.code || null });
  }

  res.locals.logAudit({
    action: result.error ? 'UPDATE_FAILED' : 'UPDATE_APPLIED',
    module: 'system_update',
    newValue: {
      from_tag: result.from_tag,
      to_tag: result.to_tag,
      snapshot_id: result.snapshot_id,
      migrations: result.migrations_applied,
    },
    description: result.error
      ? `Update to ${result.to_tag} failed: ${result.error}`
      : `Updated ${result.from_tag || result.from_commit?.slice(0,7)} → ${result.to_tag} (snapshot ${result.snapshot_id})`,
  });
  res.json(result);
});

// ── POST /rollback — restore last (or chosen) snapshot + checkout origin
router.post('/rollback', (req, res) => {
  const db = getDb();
  let result;
  try {
    result = updater.rollback(db, { snapshotId: req.body?.snapshotId });
  } catch (err) {
    res.locals.logAudit({
      action: 'ROLLBACK_FAILED',
      module: 'system_update',
      description: `Rollback aborted: ${err.message}`,
    });
    return res.status(409).json({ error: err.message, code: err.code || null });
  }

  res.locals.logAudit({
    action: result.error ? 'ROLLBACK_FAILED' : 'ROLLBACK_APPLIED',
    module: 'system_update',
    newValue: { snapshot_id: result.snapshot_id, checked_out: result.checked_out },
    description: result.error
      ? `Rollback failed: ${result.error}`
      : `Rolled back to snapshot ${result.snapshot_id}${result.checked_out ? ` @ ${result.checked_out.slice(0,7)}` : ''}`,
  });
  res.json(result);
});

// ── GET /snapshots — list all DB snapshots ─────────────────────────────
router.get('/snapshots', (req, res) => {
  res.json({ data: updater.listSnapshots() });
});

module.exports = router;
