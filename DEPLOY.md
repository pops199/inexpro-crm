# Deployment & In-App Updates

This file covers how to deploy Inexpro CRM and how the in-app **System
Update** button works (Admin → Settings → System Update, full-admin only).

---

## 1. First-time deployment (Docker, Linux server)

```bash
# 1. Clone the repo into a stable host path. The path is what the
#    container will bind-mount, so don't move it after.
sudo git clone https://github.com/pops199/inexpro-crm.git /opt/inexpro-crm
cd /opt/inexpro-crm

# 2. Create the persistent data tree (DB, uploads, reports).
sudo mkdir -p /crm-data/server/db /crm-data/client/uploads /crm-data/client/reports

# 3. Configure environment.
cp .env.example .env
sudo $EDITOR .env   # set SESSION_SECRET, DOCUMENT_ENCRYPTION_KEY, ANTHROPIC_API_KEY

# 4. Enable in-app updates by uncommenting the bind-mount in
#    docker-compose.yml:
#       - /opt/inexpro-crm:/app

# 5. Build & start.
docker compose up -d --build

# 6. Seed the default admin user (one-time).
docker compose exec app node server/db/seed.js
```

Default admin login: `admin / admin123` — **change immediately**.

---

## 2. Local development (Windows / macOS / Linux)

```bash
npm install
cp .env.example .env
npm run seed            # creates admin/admin123
npm run dev             # nodemon — auto-restart on save
```

The in-app update button works in this mode too: it'll pull the latest
release into your working tree and `nodemon` picks up the file changes.

---

## 3. How the in-app update button works

**Where:** Admin module → Settings tab → System Update (above Export).
**Who:** Full-admin role only (audit-logged either way).

### "Check for Updates"
- Runs `git fetch --tags --prune --force` against `origin`.
- Compares the running version (from `package.json`) against the
  highest `vX.Y.Z` tag in the remote.
- Lists any DB migrations in `server/db/migrations/` that haven't been
  applied yet.

### "Apply Update"
1. **Snapshot the live DB** to `.update-snapshots/<timestamp>/inexpro.db`
   using SQLite's `VACUUM INTO`. This is a consistent copy that already
   incorporates the WAL — safe to restore from. The last 5 snapshots are
   retained automatically.
2. Refuses to proceed if the working tree has uncommitted changes (so
   nothing in production is silently overwritten).
3. `git checkout --detach <latest-tag>` — release tags are immutable, so
   we never want a `main` working tree on prod.
4. `npm install --production --no-audit --no-fund`.
5. Re-loads the migration runner (so it sees any new files added by the
   release) and applies pending migrations in a transaction.
6. Calls `process.exit(0)` after a 1.5s delay so Docker / nodemon
   restarts the process with the new code.

If any step fails, the function aborts, releases the lock, and surfaces
the error in the admin UI. **It does not auto-rollback** — admin
inspects the error and clicks Rollback if appropriate.

### "Rollback to Last Snapshot"
1. Closes the live DB connection, removes the WAL/SHM sidecars, copies
   the most recent snapshot's `inexpro.db` into place.
2. Checks out the commit that was running when the snapshot was taken
   (`from_commit` in the snapshot's `meta.json`).
3. Restarts the process.

---

## 4. Cutting a new release

The update button only sees **tagged releases** (`vX.Y.Z`), not raw
`main`. To ship an update:

```bash
# 1. Bump the version in package.json (semver).
# 2. Commit your changes on main.
git add -A && git commit -m "feat: …"
git push origin main

# 3. Tag and push.
git tag -a v1.0.1 -m "v1.0.1 — short summary"
git push origin v1.0.1

# 4. Optional but recommended: create a GitHub Release from the tag,
#    so the changelog is visible at github.com/pops199/inexpro-crm/releases.
```

The next time an admin clicks **Check for Updates**, the new tag shows
up and Apply becomes enabled.

---

## 5. Database migrations

Schema changes ship as numbered SQL files in `server/db/migrations/`:

```
server/db/migrations/
  README.md
  0000_baseline.sql           ← marker, not executed on existing DBs
  0001_add_xyz_to_assets.sql  ← real changes start at 0001
  0002_…
```

The runner records applied versions in the `_schema_migrations` table,
applies each pending file once, in a transaction. See
`server/db/migrations/README.md` for the rules.

---

## 6. Things that intentionally don't get committed

`.gitignore` excludes anything that contains client data or local state:

- `*.db`, `*.db-shm`, `*.db-wal`, `*.bak*` — SQLite files
- `uploads/`, `reports/`, `signatures/` — client documents and
  signature images (POPIA-sensitive — never push to a public repo)
- `.env` — secrets
- `.planning/`, `.claude/memory/` — local working notes
- `.update-snapshots/` — DB snapshots created by the updater itself

If you need to share an encrypted backup of any of the above, use a
secure channel (not GitHub).
