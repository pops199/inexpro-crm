# Inexpro CRM — Architecture (as of 2026-04-30)

Built from `/inspect` on existing code. Rebuilt on `/checkpoint`.

## Purpose

Compliance-driven CRM for South African short-term insurance brokers. Embeds FAIS,
COFI-readiness, POPIA, FICA, and TCF into the workflow itself — every lifecycle
gate, advisory step, claim, and complaint is enforced by the schema and route
guards rather than left to broker discipline.

## Stack

Node 18 + Express · better-sqlite3 (WAL) · express-session w/ connect-sqlite3 ·
@anthropic-ai/sdk · multer · pdfkit + docx · bcryptjs · TOTP 2FA · Nodemailer ·
vanilla-JS SPA (no bundler, hash router, components attach to `window`) ·
Docker (Alpine, Africa/Johannesburg TZ, single `/crm-data` bind mount) ·
Playwright + custom `validate.js` for tests.

## Architecture pattern

Single-process **monolith** — one Node/Express server serves the JSON API and
the static SPA shell. SQLite single-file DB plus a separate `sessions.db`.
Single-tenant per deployment. Background schedulers run inside the same
process (broker-fitness alerts, complaint escalations).

## Top-level folder map

```
inexpro-crm/
├── server/
│   ├── app.js                # Express bootstrap, route mounting, middleware order
│   ├── routes/               # 28 route files — one per module
│   ├── middleware/           # auth.js (roles + ownership), audit.js, error.js
│   ├── lib/                  # crypto, file-encryption, totp, scheduler,
│   │                         # broker-fitness-alerts, mailer, edit-lock, xlsx, supplier
│   └── db/
│       ├── schema.sql        # 15+ tables — full data model
│       ├── database.js       # better-sqlite3 connection (WAL)
│       ├── seed.js           # Default admin user (admin/admin123)
│       ├── test_seed.js      # 3 realistic test subjects
│       ├── validate.js       # Full validation suite (tables, FKs, picklists, gap rule)
│       └── wipe_for_go_live.py
├── client/
│   ├── public/               # index.html, logos, claim_forms/, popia indicator images
│   └── src/
│       ├── main.js           # SPA bootstrap, login flow, currentUser
│       ├── router.js         # Hash-based router
│       ├── api.js            # All API calls
│       ├── utils.js          # Shared utilities
│       ├── styles/main.css   # Full UI stylesheet
│       └── components/       # 20 component files — one per module
├── docs/manual/              # Playwright-driven user-manual builder
│   ├── build-manual.js
│   ├── capture.js
│   ├── seed-demo.js
│   └── screenshots/
├── scripts/
│   └── generate-claim-form-pdfs.js
├── signatures/               # Per-user email signature images (bind-mounted)
├── uploads/, reports/        # Local-disk artifact storage
├── .planning/todos/          # User's pending/completed task notes
├── Dockerfile, docker-compose.yml, nginx.conf
├── package.json, .env.example
├── README.md                 # Author intent + module table (Phase-2 wording stale)
└── WORKFLOW_RULES.md         # Authoritative source for compliance gates with file:line cites
```

## Modules (server routes)

**Core CRM:** auth, contacts, accounts, engagements, policies, policy-sections,
assets, risk-details, claims, advice-records, complaints, reviews, documents,
reports, admin, dashboard, timeline, settings, workflows, view-prefs.

**Compliance subsystem:** popia, fica, broker-profiles, products,
post-sale-events, commission-log, tcf-dashboard, notifications.

(README's 12-module table is stale — Phase 2 modules are now fully live.)

## Key files

If a new contributor read only these, they'd understand ~80%:

- `README.md` — author intent, quick start, module overview
- `WORKFLOW_RULES.md` — single source of truth for every compliance gate, with
  `path/to/file.js:line` citations. Read this before changing any lifecycle
  rule.
- `server/app.js` — Express bootstrap, route mounting, middleware order,
  empty-string→null normalization, static-asset cache strategy
- `server/db/schema.sql` — full data model (15+ tables, CHECK constraints,
  FKs, picklists)
- `server/middleware/auth.js` — `requireAuth`, `requireAdmin`, `canDelete`,
  broker data-isolation pattern
- `server/middleware/audit.js` — `res.locals.logAudit({...})` injection;
  every CREATE/UPDATE/DELETE/LOGIN/LOGOUT/EXPORT calls it
- `client/src/main.js` — SPA bootstrap, login flow, `window.currentUser`
- `client/src/router.js` — hash-based routing
- `client/src/api.js` — all backend calls in one file
- `package.json` — scripts: `start`, `dev`, `seed`, `test:seed`,
  `generate:claim-forms`

## Data flow / entry points

1. **Server start** — `node server/app.js` (must run from project root; DB
   path is resolved relative to CWD). `initDb()` runs `schema.sql`. Schedulers
   start (broker-fitness alerts on interval, complaints escalation every 6h).
2. **Auth** — session cookie (HttpOnly, 8h, optional `Secure` via
   `COOKIE_SECURE`). Sessions stored in a separate SQLite DB
   (`sessions.db`).
3. **Request lifecycle** — JSON middleware → session → audit middleware
   (attaches `res.locals.logAudit`) → empty-string→null body normalization →
   route handler. Routes call `logAudit` before responding.
4. **Frontend** — static `client/public/index.html` loads the SPA shell;
   plain `<script>` tags pull in `main.js`, `router.js`, `api.js`, then
   each `components/*.js` file. Components attach themselves to `window`.
   Hash-route changes drive view rendering.
5. **AI report builder** — Reports tab → user types plain English →
   `@anthropic-ai/sdk` call → server pre-fills the Custom Report Builder.
   No raw SQL ever shown to the user.

## Conventions

- **Empty-string → null body normalization** in `server/app.js`. SQLite
  CHECK constraints depend on this — don't bypass.
- **Audit on every mutation:** routes call `res.locals.logAudit({...})` before
  responding. Never short-circuit this.
- **Computed-not-stored statuses:** FICA status, POPIA status, pre-sale
  disclosure status — derived on read. Don't add a stored mirror column.
- **Auto-numbered records:** RoA `AR-YYYYMMDD-XXXX`, complaints
  `COMP-YYYYMMDD-XXXX`. Pattern lives in the route files.
- **Broker isolation:** broker users get `assigned_broker_id = ?` injected
  into list queries; detail endpoints add an explicit ownership check before
  responding.
- **Roles:** `admin`, `broker`, `admin_only`. Only `admin` and the owning
  `broker` can delete; `admin_only` is data-entry-only (no delete).
- **Lifecycle gates** are enforced server-side, not client-side. The client
  hides UI when the user lacks permission, but the server still rejects.
- **No bundler.** Frontend is plain JS files attached to `window.*`. Don't
  suggest a build step without an explicit ask.

## Deployment

Docker (Alpine, Africa/Johannesburg TZ). Single bind mount `/crm-data` holds
DB, uploads, reports — same paths inside and outside the container so a host
backup of `/crm-data` is a complete backup. Optional nginx reverse proxy for
HTTPS (commented in `docker-compose.yml`); when enabled, set
`COOKIE_SECURE=true`.

Healthcheck hits `/api/auth/me` every 30s.

## Testing

- `npm run test:seed` — runs `test_seed.js` (inserts 3 realistic clients)
  then `validate.js` (every table, FK, picklist, plus the gap-logic rule).
  All checks must pass.
- `playwright` is a devDependency, used by `docs/manual/capture.js` to
  build the user manual via real browser screenshots.

## Deployment & tenancy

- **Local** for development/testing.
- **VPS + Docker** for production (single `/crm-data` bind mount holds DB,
  uploads, reports).
- **Single tenant per instance** — multi-tenancy is not on the roadmap.
- **Codex** was used once as a test (the `inexpro.db.bak.codex_*` artifact);
  not part of the standard workflow.
