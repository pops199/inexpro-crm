/**
 * Schema migration runner.
 *
 * - Reads server/db/migrations/*.sql in lexicographic order.
 * - Applies any whose version (NNNN prefix) is greater than the max
 *   already recorded in _schema_migrations.
 * - Each file runs inside its own transaction; on error, the txn rolls
 *   back, the run aborts, and the error is rethrown.
 *
 * Used by:
 *   - server/db/database.js → initDb() at server boot
 *   - server/lib/updater.js → after pulling a new release
 *
 * Returns a summary suitable for logging / showing in the admin UI.
 */
const fs   = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checksum   TEXT
    )
  `).run();
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.+\.sql$/i.test(f))
    .sort();
}

function parseVersion(filename) {
  const m = filename.match(/^(\d{4})_(.+)\.sql$/i);
  if (!m) return null;
  return { version: parseInt(m[1], 10), name: m[2] };
}

function checksumOf(text) {
  // Tiny non-crypto hash — enough to detect accidental edits to an
  // already-applied migration file. Not a security boundary.
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
}

/**
 * Returns:
 *  {
 *    appliedBefore: [{version, name, applied_at}, ...],
 *    appliedNow:    [{version, name}, ...],
 *    pending:       [],   // empty after a successful run
 *    skippedBaseline: boolean,
 *    drift:         [{version, name, reason}]  // already-applied files whose checksum changed
 *  }
 */
function runMigrations(db, { logger = console } = {}) {
  ensureMigrationsTable(db);

  const files = listMigrationFiles();
  const applied = db.prepare(
    'SELECT version, name, applied_at, checksum FROM _schema_migrations ORDER BY version'
  ).all();
  const appliedByVersion = new Map(applied.map(r => [r.version, r]));
  const summary = {
    appliedBefore: applied,
    appliedNow:    [],
    pending:       [],
    skippedBaseline: false,
    drift: [],
  };

  for (const file of files) {
    const parsed = parseVersion(file);
    if (!parsed) continue;
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const sum = checksumOf(sql);

    if (appliedByVersion.has(parsed.version)) {
      const prev = appliedByVersion.get(parsed.version);
      if (prev.checksum && prev.checksum !== sum) {
        summary.drift.push({
          version: parsed.version,
          name: parsed.name,
          reason: 'checksum changed since it was applied',
        });
      }
      continue;
    }

    // Special case: 0000_baseline runs only on a fresh DB. If the DB
    // already has core tables (e.g. `users`), record baseline as applied
    // without executing it — the existing schema.sql bootstrap covered it.
    if (parsed.version === 0) {
      const hasCore = !!db.prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'"
      ).get();
      const stamp = db.prepare(
        'INSERT INTO _schema_migrations (version, name, checksum) VALUES (?, ?, ?)'
      );
      stamp.run(parsed.version, parsed.name, sum);
      summary.appliedNow.push({ version: parsed.version, name: parsed.name, skipped: hasCore });
      summary.skippedBaseline = hasCore;
      continue;
    }

    const apply = db.transaction(() => {
      // Allow multiple statements separated by `;`. better-sqlite3's exec()
      // does not support parameter binding but does run multiple statements.
      db.exec(sql);
      db.prepare(
        'INSERT INTO _schema_migrations (version, name, checksum) VALUES (?, ?, ?)'
      ).run(parsed.version, parsed.name, sum);
    });

    try {
      apply();
      summary.appliedNow.push({ version: parsed.version, name: parsed.name });
      logger.log(`✅ migration ${file} applied`);
    } catch (err) {
      logger.error(`❌ migration ${file} failed:`, err.message);
      err.migrationFile = file;
      throw err;
    }
  }

  return summary;
}

/**
 * Returns the list of migration files that haven't been applied yet,
 * without applying anything. Used by the "Check for updates" preview.
 */
function pendingMigrations(db) {
  ensureMigrationsTable(db);
  const applied = new Set(
    db.prepare('SELECT version FROM _schema_migrations').all().map(r => r.version)
  );
  return listMigrationFiles()
    .map(parseVersion)
    .filter(p => p && !applied.has(p.version))
    .map(p => ({ version: p.version, name: p.name }));
}

module.exports = { runMigrations, pendingMigrations, listMigrationFiles };
