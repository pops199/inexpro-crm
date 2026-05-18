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
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const multer = require('multer');
const Database = require('better-sqlite3');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../db/database');
const updater = require('../lib/updater');
const migrate = require('../db/migrate');
const { notifyAdminsIfUpdateAvailable } = require('../lib/system-update-notifier');

// Restore upload — accepts a single .db file up to 500 MB. Held in
// memory rather than streamed to disk so we control exactly when (and
// where) the bytes hit the filesystem; this avoids a half-uploaded file
// being interpreted as a valid restore source.
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    // Accept any extension — we validate the SQLite magic header below
    // before doing anything destructive.
    cb(null, true);
  },
});

// SQLite file format: every database starts with the literal bytes
// "SQLite format 3\0" (16 bytes). Anything else and we refuse to
// touch the live DB.
const SQLITE_MAGIC = Buffer.concat([Buffer.from('SQLite format 3','utf8'), Buffer.from([0x00])]);
function looksLikeSqliteDb(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 100 && buf.slice(0, 16).equals(SQLITE_MAGIC);
}

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

// ── GET /release-tags — every v* tag known locally, newest first ──────
router.get('/release-tags', (_req, res) => {
  try {
    const tags = updater.listReleaseTags();
    res.json({ data: tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /release-notes?tag=v1.0.5 — release notes for one specific tag ─
router.get('/release-notes', (req, res) => {
  const tag = String(req.query.tag || '').trim();
  if (!tag) return res.status(400).json({ error: 'tag query parameter is required' });
  try {
    const cl = updater.getChangelog(null, tag);
    res.json(cl);
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
    // Fire in-app notifications to every admin when a new release is found.
    // Idempotent per release tag — re-clicking the button doesn't spam.
    try { notifyAdminsIfUpdateAvailable(status, 'manual_check'); }
    catch (e) { console.error('[system-update] notify failed:', e.message); }
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

// ── GET /backup — download a consistent copy of the live DB ────────────
//
// Uses SQLite's `VACUUM INTO` to write a clean snapshot to a temp file
// (same approach the in-app updater uses), then streams it to the
// caller as an attachment. The temp file is deleted after the download
// completes — successful or not.
//
// Audit-logged so the trail records *who* downloaded the DB and *when*
// (POPIA: the live DB contains client PII; downloads are a controlled
// admin action).
router.get('/backup', (req, res) => {
  const db = getDb();
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const filename = `inexpro-backup-${stamp}.db`;
  const tmpPath = path.join(os.tmpdir(), filename);
  const safePath = tmpPath.replace(/\\/g, '/').replace(/'/g, "''");

  try {
    db.prepare(`VACUUM INTO '${safePath}'`).run();
  } catch (err) {
    res.locals.logAudit({
      action: 'BACKUP_FAILED',
      module: 'system_update',
      description: `Backup snapshot failed: ${err.message}`,
    });
    return res.status(500).json({ error: err.message });
  }

  const sizeBytes = (() => {
    try { return fs.statSync(tmpPath).size; } catch (_) { return null; }
  })();

  res.locals.logAudit({
    action: 'BACKUP_DOWNLOADED',
    module: 'system_update',
    newValue: { filename, size_bytes: sizeBytes },
    description: `Downloaded DB backup ${filename}${sizeBytes ? ` (${Math.round(sizeBytes/1024/1024 * 10)/10} MB)` : ''}`,
  });

  res.download(tmpPath, filename, (err) => {
    // Always clean up — successful download or aborted transfer.
    fs.unlink(tmpPath, () => {});
    if (err && !res.headersSent) {
      console.error('Backup download error:', err.message);
    }
  });
});

// ── POST /restore — replace the live DB with an uploaded .db file ──────
//
// Validation chain:
//   1. file present, magic header looks like SQLite
//   2. open the upload as a sqlite db, run integrity_check (catches
//      corruption / truncation)
//   3. confirm the upload contains the `users` table — minimal sanity
//      check that this is an Inexpro DB and not some random sqlite file
//   4. snapshot the CURRENT live DB to .update-snapshots/ so this
//      operation is reversible via the Rollback button
//   5. close the live connection, swap files, remove WAL/SHM
//   6. schedule a restart so the new DB is opened cleanly and migrations
//      run against it
//
// Audit trail records who restored, source filename, source size, and
// the snapshot id used as the pre-restore safety net.
router.post('/restore', restoreUpload.single('dbfile'), (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No file uploaded (expected field "dbfile").' });
  }

  const buf = req.file.buffer;
  const sourceName = req.file.originalname || 'unnamed';
  const sourceSize = buf.length;

  // 1. Magic header check — refuse anything that's not a SQLite file
  if (!looksLikeSqliteDb(buf)) {
    res.locals.logAudit({
      action: 'RESTORE_FAILED', module: 'system_update',
      description: `Restore rejected — file ${sourceName} is not a SQLite database`,
    });
    return res.status(400).json({ error: 'File is not a SQLite database (wrong magic header).' });
  }

  // Acquire the same lock used by updates so two admins can't race a
  // restore against an update.
  let locked = false;
  try {
    updater.applyUpdate; // ensure module loaded
    if (fs.existsSync(path.join(path.resolve(__dirname, '..', '..'), '.update-lock'))) {
      return res.status(409).json({ error: 'An update or restore is already in progress.' });
    }
    fs.writeFileSync(path.join(path.resolve(__dirname, '..', '..'), '.update-lock'),
      JSON.stringify({ started_at: new Date().toISOString(), pid: process.pid, reason: `restore by user ${req.session?.userId}` }, null, 2));
    locked = true;
  } catch (err) {
    return res.status(500).json({ error: `Could not acquire restore lock: ${err.message}` });
  }

  // Write the upload to a temp file so we can open it with better-sqlite3
  // for validation — better-sqlite3 doesn't accept buffers, only paths.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inexpro-restore-'));
  const tmpUpload = path.join(tmpDir, 'upload.db');
  fs.writeFileSync(tmpUpload, buf);

  const result = {
    started_at: new Date().toISOString(),
    source_filename: sourceName,
    source_size_bytes: sourceSize,
    snapshot_id: null,
    will_restart: false,
    needs_manual_restart: false,
    error: null,
  };

  const cleanup = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    if (locked) {
      try { fs.unlinkSync(path.join(path.resolve(__dirname, '..', '..'), '.update-lock')); } catch (_) {}
      locked = false;
    }
  };

  try {
    // 2. integrity_check
    const probe = new Database(tmpUpload, { readonly: true, fileMustExist: true });
    let integrityOk = false;
    let hasUsersTable = false;
    try {
      const ic = probe.pragma('integrity_check', { simple: true });
      integrityOk = ic === 'ok';
      // 3. sanity-check the schema
      hasUsersTable = !!probe.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'"
      ).get();
    } finally {
      probe.close();
    }
    if (!integrityOk) throw new Error('Uploaded database failed SQLite integrity_check.');
    if (!hasUsersTable) {
      throw new Error('Uploaded database does not contain the expected `users` table — refusing to restore.');
    }

    // 4. Snapshot the current live DB so this restore is reversible.
    //    Reuse the updater's snapshot dir + format so the same Rollback
    //    UI catches it.
    const liveDb = getDb();
    const snapshots = updater.listSnapshots();
    const before = snapshots.length;
    // We piggy-back on the updater's snapshotDb logic by calling its
    // applyUpdate-style snapshot helper indirectly: there's no public
    // wrapper, so we reach in via the module's exported listSnapshots
    // and create the snapshot manually here.
    const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
    const SNAPSHOT_DIR = path.join(PROJECT_ROOT, '.update-snapshots');
    if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const snapId = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const snapDir = path.join(SNAPSHOT_DIR, snapId);
    fs.mkdirSync(snapDir, { recursive: true });
    const snapDbPath = path.join(snapDir, 'inexpro.db').replace(/\\/g, '/');
    liveDb.prepare(`VACUUM INTO '${snapDbPath.replace(/'/g, "''")}'`).run();
    fs.writeFileSync(path.join(snapDir, 'meta.json'), JSON.stringify({
      id: snapId,
      created_at: new Date().toISOString(),
      reason: 'pre-restore',
      restored_from: { filename: sourceName, size_bytes: sourceSize },
      db_size_bytes: fs.statSync(snapDbPath).size,
    }, null, 2));
    result.snapshot_id = snapId;

    // 5. Swap the live DB file. Close the connection first so the file
    //    handle is released (Windows can't replace open files).
    try { liveDb.close(); } catch (_) {}
    const dbPath = path.resolve(process.env.DB_PATH || './server/db/inexpro.db');
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.copyFileSync(tmpUpload, dbPath);
  } catch (err) {
    result.error = err.message;
    res.locals.logAudit({
      action: 'RESTORE_FAILED', module: 'system_update',
      newValue: { source_filename: sourceName, snapshot_id: result.snapshot_id },
      description: `Restore aborted: ${err.message}`,
    });
    cleanup();
    return res.status(400).json(result);
  }

  // 6. Restart so the new DB is opened cleanly and any pending
  //    migrations run against it on init. Lock will be released by the
  //    new process. Clean up the temp upload but NOT the lock file
  //    (scheduleRestart's exit will overwrite/remove it).
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  result.will_restart = true;
  result.needs_manual_restart = !(process.env.DOCKER === '1' || process.env.PM2_HOME || process.env.NODEMON);

  res.locals.logAudit({
    action: 'RESTORE_APPLIED', module: 'system_update',
    newValue: {
      source_filename: sourceName, source_size_bytes: sourceSize,
      snapshot_id: result.snapshot_id,
    },
    description: `Restored DB from upload ${sourceName} (${Math.round(sourceSize/1024/1024 * 10)/10} MB) — pre-restore snapshot ${result.snapshot_id}`,
  });

  res.json(result);

  // Schedule restart after the response has been flushed.
  setTimeout(() => {
    console.log('[restore] restarting process to open the restored DB…');
    process.exit(0);
  }, 1500);
});

module.exports = router;
