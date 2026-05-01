# Deployment & Updates

Two deploy targets are supported:

- **Production: Docker on a Linux server.** Image is built directly
  from the GitHub repo — no local clone required on the server.
- **Local development: plain `node` / `npm run dev` on Windows / macOS
  / Linux.** Standard checkout-and-run.

There are two update mechanisms once the app is running, used in
different situations — see section 4.

---

## 1. First-time production deployment (Docker)

Server prerequisites: Docker Engine + Compose plugin (v2.x).

```bash
# 1. Persistent data tree (SQLite DB, uploads, reports).
sudo mkdir -p /crm-data/server/db /crm-data/client/uploads /crm-data/client/reports

# 2. Pull the compose file. (The repo is small so a shallow clone is fine —
#    you only need docker-compose.yml on the host. The Dockerfile and source
#    are fetched by Docker itself when it builds the image.)
sudo mkdir -p /opt/inexpro-crm
cd /opt/inexpro-crm
sudo curl -fsSLO https://raw.githubusercontent.com/pops199/inexpro-crm/main/docker-compose.yml

# 3. Configure secrets via a .env file in the same dir as docker-compose.yml.
#    Compose substitutes ${VAR} references at startup.
sudo tee .env >/dev/null <<'EOF'
SESSION_SECRET=replace-with-a-long-random-string
DOCUMENT_ENCRYPTION_KEY=replace-with-a-separate-long-random-string
ANTHROPIC_API_KEY=your-key-or-leave-blank
EOF

# 4. Build & start. Compose fetches the repo and builds the image.
sudo docker compose up -d --build

# 5. Seed the default admin (one-time only — skip after first deploy).
sudo docker compose exec app node server/db/seed.js

# 6. Confirm it's healthy.
sudo docker compose logs -f app
```

Default admin login: `admin / admin123` — **change immediately**.

The image installs `git`, `python3`, `make`, `g++` so the in-app
updater can compile native modules when it runs `npm install` after
pulling a new release tag (see section 4).

---

## 2. Local development

```bash
git clone https://github.com/pops199/inexpro-crm.git
cd inexpro-crm
npm install
cp .env.example .env
# Edit .env — at minimum, set SESSION_SECRET and DOCUMENT_ENCRYPTION_KEY.
npm run seed            # creates admin/admin123
npm run dev             # nodemon — auto-restart on file save
```

---

## 3. Cutting a new release

Tag-based releases drive the in-app updater. To ship one:

```bash
# 1. Bump version in package.json.
# 2. Commit on main, push.
git add -A && git commit -m "feat: …"
git push origin main

# 3. Tag the release and push the tag.
git tag -a v1.0.1 -m "v1.0.1 — short summary"
git push origin v1.0.1

# 4. (Recommended) Create a GitHub Release at
#    github.com/pops199/inexpro-crm/releases so the changelog is visible.
```

---

## 4. Two ways to update a running production server

### A) **Image rebuild (the canonical path)** — survives container recreation

Pulls the chosen ref from GitHub, rebuilds the image, and recreates
the container. This is the only update path that survives
`docker compose down/up`.

```bash
cd /opt/inexpro-crm
sudo docker compose build --no-cache app    # fetches latest from main
sudo docker compose up -d                   # recreates the container
sudo docker compose logs -f app
```

To pin to a specific release tag instead of `main`, edit
`docker-compose.yml` and change the build context:

```yaml
build:
  context: https://github.com/pops199/inexpro-crm.git#v1.0.1
```

### B) **In-app "Apply Update" button** — fast, snapshotted, ephemeral

`Admin → Settings → System Update` (full-admin only). Snapshots the
DB, `git fetch && git checkout <latest tag>`, runs `npm install`,
applies pending DB migrations, restarts the container.

**Important caveat:** the in-app updater modifies the running
container's filesystem. `restart: unless-stopped` keeps the container
alive across the restart so the new code persists, **but**
`docker compose down/up` recreates the container from the image and
loses the in-container changes. So:

- Use the in-app updater for fast, audited, snapshot-protected
  upgrades during normal operation.
- Once the same release has been validated, run path **A** so it's
  baked into the image.

The DB migrations are applied to the live SQLite file under
`/crm-data` either way, so the schema state survives container
recreation.

---

## 5. Database migrations

Schema changes ship as numbered SQL files in `server/db/migrations/`:

```
server/db/migrations/
  README.md
  0000_baseline.sql           ← marker, not executed on existing DBs
  0001_add_xyz_to_assets.sql  ← real changes start at 0001
```

The runner (`server/db/migrate.js`) records applied versions in
`_schema_migrations` and applies each pending file once, in a
transaction. It runs automatically:
- At server boot (right after `schema.sql` bootstrap).
- After the in-app updater pulls a new release.

See `server/db/migrations/README.md` for the rules.

---

## 6. Things that are intentionally not shipped

`.gitignore` excludes anything client-data or local:

- `*.db`, `*.db-shm`, `*.db-wal`, `*.bak*` — SQLite files
- `uploads/`, `reports/`, `signatures/` — client documents and
  signatures (POPIA-sensitive)
- `.env` — secrets
- `.planning/`, `.claude/memory/` — local working notes
- `.update-snapshots/` — DB snapshots created by the in-app updater

If you need to move client data between environments, use a secure
channel — never push it to the repo.

---

## 7. Troubleshooting

**`502 Bad Gateway`** — the container exited. Check logs:
```bash
sudo docker compose logs --tail=100 app
```

**`Exec format error` on a native module** — usually means a
prebuilt binary doesn't match the host CPU. The Dockerfile sets
`npm_config_build_from_source=true` so `better-sqlite3` always
compiles for the actual arch; if you see this error, do
`docker compose build --no-cache app` to discard cached layers.

**`Cannot find module '<x>'`** — node_modules is missing or
incomplete. Same fix: `docker compose build --no-cache app`.

**Port 3000 already in use** — change the host-side port in
`docker-compose.yml`:
```yaml
ports:
  - "3001:3000"   # host:container
```

**In-app update failed** — open Admin → Settings → System Update.
If a snapshot was taken before the failure, click **Rollback to
Last Snapshot**. The audit log records every attempt under module
`system_update`.
