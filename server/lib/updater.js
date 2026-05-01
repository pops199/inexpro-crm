/**
 * Self-update mechanism for Inexpro CRM.
 *
 * Releases (not raw HEAD) drive updates: the admin UI compares the
 * running version (from package.json) against the latest annotated tag
 * matching `v*` in the GitHub repo, then checks out that tag, installs
 * dependencies, and runs any pending DB migrations. Every step is
 * snapshotted so a failed update can be rolled back with one click.
 *
 * Compliance notes:
 *   - Snapshots the live DB *before* any code or schema change so a
 *     bad release can be rolled back without data loss (POPIA / FAIS
 *     record-keeping).
 *   - Uses an exclusive lock file so two admins can't race an update.
 *   - The route layer wraps every entry point in res.locals.logAudit
 *     so the trigger, target version, and outcome are recorded.
 */
const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT     = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR     = path.join(PROJECT_ROOT, '.update-snapshots');
const LOCK_FILE        = path.join(PROJECT_ROOT, '.update-lock');
const SNAPSHOT_KEEP    = 5;         // retain last N snapshots
const RESTART_DELAY_MS = 1500;      // give HTTP response time to flush

// ── Lock helpers ────────────────────────────────────────────────────────

function acquireLock(reason) {
  if (fs.existsSync(LOCK_FILE)) {
    const data = readLock();
    throw lockedError(`Update already in progress (started ${data.started_at} by user ${data.user_id || 'unknown'}).`);
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({
    started_at: new Date().toISOString(),
    pid: process.pid,
    reason,
  }, null, 2));
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

function readLock() {
  try { return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')); }
  catch (_) { return {}; }
}

function lockedError(msg) {
  const err = new Error(msg);
  err.code = 'UPDATE_LOCKED';
  return err;
}

// ── Git helpers ─────────────────────────────────────────────────────────

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    ...opts,
  }).toString('utf8').trim();
}

function isGitRepo() {
  try { git(['rev-parse', '--is-inside-work-tree']); return true; }
  catch (_) { return false; }
}

function currentCommit()   { return git(['rev-parse', 'HEAD']); }
function currentBranchTag() {
  try { return git(['describe', '--tags', '--exact-match', 'HEAD']); }
  catch (_) { return null; }
}

function fetchTags() {
  // --tags --force keeps local tags in sync if a release was retagged.
  // --prune-tags removes tags that disappeared upstream.
  git(['fetch', '--tags', '--force', '--prune', '--prune-tags', 'origin']);
}

/**
 * Returns the latest `v*` tag by semver-aware comparison. Falls back to
 * lexicographic order if a tag isn't strict semver.
 */
function latestReleaseTag() {
  let raw;
  try { raw = git(['tag', '--list', 'v*']); }
  catch (_) { return null; }
  const tags = raw.split(/\r?\n/).filter(Boolean);
  if (!tags.length) return null;
  tags.sort(semverCompareTag);
  return tags[tags.length - 1];
}

function semverCompareTag(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function parseSemver(tag) {
  const m = String(tag).match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function workingTreeDirty() {
  // Untracked files are fine (uploads, db sidecars). We only care about
  // modifications to tracked files, which would block a clean checkout.
  const status = git(['status', '--porcelain', '--untracked-files=no']);
  return status.length > 0;
}

/**
 * Returns release notes for `toTag` plus the commit log between the
 * running version and `toTag`. Used by the admin UI to show users what
 * an update will actually contain *before* they click Apply.
 *
 *   {
 *     to_tag: 'v1.0.1',
 *     to_tag_date: '2026-05-01',
 *     to_tag_message: '<annotated tag body, plain text>',
 *     from_ref: 'v1.0.0' | <commit sha> | null,
 *     commits: [
 *       { sha: 'abcd123', subject: 'fix: …', date: '2026-05-01' },
 *       …
 *     ],
 *     truncated: false,    // true if there are >50 commits and we capped the list
 *   }
 *
 * Errors are caught and surfaced as { error } so the UI degrades
 * gracefully — a missing changelog should never block the update flow.
 */
function getChangelog(fromRef, toTag) {
  const result = {
    to_tag: toTag,
    to_tag_date: null,
    to_tag_message: null,
    from_ref: fromRef || null,
    commits: [],
    truncated: false,
    error: null,
  };
  if (!toTag) {
    result.error = 'No release tag to summarise.';
    return result;
  }
  try {
    // Annotated tag message — strip the leading "tag <name>" / signature
    // headers `git cat-file` would include. `git for-each-ref` with
    // `%(contents:body)` returns just the user-supplied annotation.
    const ref = `refs/tags/${toTag}`;
    result.to_tag_message = git([
      'for-each-ref',
      '--format=%(contents:subject)%0a%0a%(contents:body)',
      ref,
    ]).trim() || null;
    result.to_tag_date = git([
      'for-each-ref',
      '--format=%(taggerdate:short)',
      ref,
    ]).trim() || null;

    // Commit log between the running ref and the new tag. If `fromRef`
    // is missing or unreachable, fall back to the last 20 commits leading
    // up to the tag so the UI still shows something useful.
    const MAX = 50;
    let range = `${toTag}~50..${toTag}`;   // safe default
    if (fromRef) {
      try {
        // Verify the from-ref exists locally; if not, the `..` range
        // throws.
        git(['rev-parse', '--verify', `${fromRef}^{commit}`]);
        range = `${fromRef}..${toTag}`;
      } catch (_) {
        // fall through with default range
      }
    }
    const raw = git([
      'log',
      `--max-count=${MAX + 1}`,
      '--pretty=format:%h%x09%cs%x09%s',
      range,
    ]);
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length > MAX) {
      result.truncated = true;
      lines.length = MAX;
    }
    result.commits = lines.map(line => {
      const [sha, date, ...rest] = line.split('\t');
      return { sha, date, subject: rest.join('\t') };
    });
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// ── Snapshot helpers ────────────────────────────────────────────────────

function ensureSnapshotDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function tsId() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Snapshots the live DB using SQLite's VACUUM INTO. This produces a
 * consistent copy that already incorporates the WAL — safer than a raw
 * file copy. Returns the snapshot directory path.
 */
function snapshotDb(db, { fromCommit, toTag }) {
  ensureSnapshotDir();
  const id = tsId();
  const snapDir = path.join(SNAPSHOT_DIR, id);
  fs.mkdirSync(snapDir, { recursive: true });

  const dbDest = path.join(snapDir, 'inexpro.db').replace(/\\/g, '/');
  // Quote single-quotes inside the path the SQLite-safe way: '' (doubled).
  const safePath = dbDest.replace(/'/g, "''");
  db.prepare(`VACUUM INTO '${safePath}'`).run();

  fs.writeFileSync(path.join(snapDir, 'meta.json'), JSON.stringify({
    id,
    created_at: new Date().toISOString(),
    from_commit: fromCommit,
    to_tag: toTag || null,
    db_size_bytes: fs.statSync(dbDest).size,
  }, null, 2));

  pruneOldSnapshots();
  return { id, dir: snapDir, dbPath: dbDest };
}

function pruneOldSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return;
  const dirs = fs.readdirSync(SNAPSHOT_DIR)
    .filter(n => /^\d{8}_\d{6}$/.test(n))
    .sort();
  while (dirs.length > SNAPSHOT_KEEP) {
    const old = dirs.shift();
    try { fs.rmSync(path.join(SNAPSHOT_DIR, old), { recursive: true, force: true }); }
    catch (_) {}
  }
}

function listSnapshots() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(n => /^\d{8}_\d{6}$/.test(n))
    .sort()
    .reverse()
    .map(id => {
      let meta = {};
      try { meta = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, id, 'meta.json'), 'utf8')); }
      catch (_) {}
      return { id, ...meta };
    });
}

// ── Public API ──────────────────────────────────────────────────────────

function readPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
    return pkg.version || null;
  } catch (_) { return null; }
}

/**
 * Status payload for the "Check for Updates" panel. Read-only — never
 * mutates the repo or the DB.
 */
function getStatus(db, { runMigrationsModule }) {
  const status = {
    is_git_repo: isGitRepo(),
    current_version: readPackageVersion(),
    current_commit: null,
    current_tag: null,
    latest_tag: null,
    update_available: false,
    pending_migrations: [],
    working_tree_dirty: false,
    last_fetch_at: null,
    locked: fs.existsSync(LOCK_FILE),
    lock_info: fs.existsSync(LOCK_FILE) ? readLock() : null,
    snapshots: listSnapshots(),
    changelog: null,
    error: null,
  };
  if (!status.is_git_repo) {
    status.error = 'Project is not a git checkout — updates disabled.';
    return status;
  }
  try {
    status.current_commit     = currentCommit();
    status.current_tag        = currentBranchTag();
    status.working_tree_dirty = workingTreeDirty();
    status.latest_tag         = latestReleaseTag();
    status.update_available   = !!status.latest_tag &&
                                 status.current_tag !== status.latest_tag &&
                                 (!status.current_tag ||
                                  semverCompareTag(status.current_tag, status.latest_tag) < 0);
    if (runMigrationsModule && typeof runMigrationsModule.pendingMigrations === 'function') {
      status.pending_migrations = runMigrationsModule.pendingMigrations(db);
    }
    // Surface the changelog whenever we have a target tag — even when
    // the user is already up-to-date, since they may want to read the
    // notes for the release they're running.
    if (status.latest_tag) {
      const fromRef = status.current_tag || status.current_commit || null;
      status.changelog = getChangelog(fromRef, status.latest_tag);
    }
  } catch (err) {
    status.error = err.message;
  }
  return status;
}

/**
 * Refreshes the tag list from origin. Run before the user clicks Apply
 * so the diff shown in the modal matches what will actually be installed.
 */
function checkForUpdates(db, { runMigrationsModule }) {
  if (!isGitRepo()) {
    const e = new Error('Project is not a git checkout — updates disabled.');
    e.code = 'NOT_A_GIT_REPO';
    throw e;
  }
  fetchTags();
  return getStatus(db, { runMigrationsModule });
}

/**
 * Applies the latest release. Steps:
 *   1. Acquire lock.
 *   2. Snapshot DB.
 *   3. git fetch --tags + checkout latest tag (detached).
 *   4. npm install --production.
 *   5. Run pending migrations against the live DB connection.
 *   6. Schedule a graceful process.exit so Docker / nodemon restart with
 *      the new code. Plain `node server/app.js` will need a manual restart;
 *      the response payload tells the caller which case applies.
 *
 * On failure at any step *after* the snapshot is taken, the function
 * does NOT auto-rollback — admin must click Rollback (so they see the
 * error, decide whether to fix-forward or revert). The lock is always
 * released.
 */
function applyUpdate(db, opts) {
  const {
    runMigrationsModule,
    triggerUserId,
    skipNpm = false,
  } = opts;

  acquireLock(`update by user ${triggerUserId}`);

  const result = {
    started_at: new Date().toISOString(),
    from_commit: null,
    from_tag: null,
    to_tag: null,
    snapshot_id: null,
    npm_installed: false,
    migrations_applied: [],
    needs_manual_restart: false,
    will_restart: false,
    error: null,
  };

  try {
    if (!isGitRepo()) throw new Error('Project is not a git checkout — updates disabled.');
    if (workingTreeDirty()) {
      throw new Error('Working tree has uncommitted changes — refusing to update. Commit or stash first.');
    }

    fetchTags();
    result.from_commit = currentCommit();
    result.from_tag    = currentBranchTag();
    result.to_tag      = latestReleaseTag();

    if (!result.to_tag) throw new Error('No release tags found in origin (expected vX.Y.Z).');
    if (result.from_tag === result.to_tag) {
      result.error = 'Already on latest release.';
      releaseLock();
      return result;
    }

    // 1. Snapshot DB before touching anything.
    const snap = snapshotDb(db, { fromCommit: result.from_commit, toTag: result.to_tag });
    result.snapshot_id = snap.id;

    // 2. Check out the release tag (detached HEAD is intentional — release
    //    tags are immutable; we never want a "main" working tree on prod).
    git(['checkout', '--detach', result.to_tag]);

    // 3. Install dependencies. Skippable in tests.
    if (!skipNpm) {
      execFileSync(npmCmd(), ['install', '--production', '--no-audit', '--no-fund'], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 600_000,
      });
      result.npm_installed = true;
    }

    // 4. Re-require the migrate module so it picks up any new files added
    //    by the release we just checked out.
    const migratePath = require.resolve('../db/migrate');
    delete require.cache[migratePath];
    const fresh = require('../db/migrate');
    const summary = fresh.runMigrations(db);
    result.migrations_applied = summary.appliedNow.filter(m => !m.skipped);
  } catch (err) {
    result.error = err.message;
    releaseLock();
    return result;
  }

  // Success — schedule a restart so the new code takes effect. Whether
  // the process actually comes back up is the orchestrator's job
  // (Docker `restart: unless-stopped`, nodemon, pm2 etc.).
  result.will_restart = true;
  result.needs_manual_restart = !isManagedProcess();
  scheduleRestart();
  // Lock is intentionally NOT released here — the new process startup
  // will overwrite or remove it. If the restart doesn't happen, the lock
  // stays as a flag for the next admin.
  return result;
}

/**
 * Rolls back to the most recent snapshot: restores the DB file, then
 * checks out the commit that was running when the snapshot was taken.
 */
function rollback(db, opts) {
  const { snapshotId } = opts;

  acquireLock('rollback');
  const result = {
    started_at: new Date().toISOString(),
    snapshot_id: null,
    restored_db: false,
    checked_out: null,
    will_restart: false,
    needs_manual_restart: false,
    error: null,
  };

  try {
    const snaps = listSnapshots();
    if (!snaps.length) throw new Error('No snapshots available to roll back to.');
    const target = snapshotId
      ? snaps.find(s => s.id === snapshotId)
      : snaps[0];
    if (!target) throw new Error(`Snapshot ${snapshotId} not found.`);
    result.snapshot_id = target.id;

    // Close the live DB connection so we can swap the file.
    try { db.close(); } catch (_) {}

    const dbPath = path.resolve(process.env.DB_PATH || './server/db/inexpro.db');
    const snapDb = path.join(SNAPSHOT_DIR, target.id, 'inexpro.db');
    if (!fs.existsSync(snapDb)) throw new Error(`Snapshot DB missing at ${snapDb}`);

    // Remove WAL/SHM sidecars from the live location so the restored
    // file isn't shadowed by stale write-ahead state.
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.copyFileSync(snapDb, dbPath);
    result.restored_db = true;

    // Check out the commit captured when the snapshot was taken.
    if (target.from_commit) {
      git(['checkout', '--detach', target.from_commit]);
      result.checked_out = target.from_commit;
    }
  } catch (err) {
    result.error = err.message;
    releaseLock();
    return result;
  }

  result.will_restart = true;
  result.needs_manual_restart = !isManagedProcess();
  scheduleRestart();
  return result;
}

// ── Process control ─────────────────────────────────────────────────────

function isManagedProcess() {
  // Docker (we set this in the compose file), nodemon, or pm2.
  return process.env.DOCKER === '1'
      || process.env.PM2_HOME
      || !!process.env.npm_lifecycle_event && process.env.npm_lifecycle_event === 'dev'
      || !!process.env.NODEMON;
}

function scheduleRestart() {
  setTimeout(() => {
    console.log('[updater] restarting process for update to take effect…');
    process.exit(0);
  }, RESTART_DELAY_MS);
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

module.exports = {
  getStatus,
  checkForUpdates,
  applyUpdate,
  rollback,
  listSnapshots,
  getChangelog,
  // Exposed for tests:
  _internals: { parseSemver, semverCompareTag, latestReleaseTag, currentCommit, isGitRepo },
};
