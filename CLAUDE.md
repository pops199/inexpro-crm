# Inexpro CRM

COFI-aligned compliance-driven CRM for South African short-term insurance
brokers. Single-process Node/Express monolith serving a vanilla-JS SPA from
SQLite. Compliance is embedded in the workflow itself — FAIS, COFI-readiness,
POPIA, FICA, and TCF are enforced via schema CHECK constraints, route gates,
and an audit trail rather than optional checkboxes.

## Stack
Node 18 + Express · better-sqlite3 (WAL) · express-session/connect-sqlite3 ·
@anthropic-ai/sdk · vanilla-JS SPA (no bundler, hash router) · Docker
(Alpine, Africa/Johannesburg TZ).

## Source of truth for compliance gates
**`WORKFLOW_RULES.md`** maps every lifecycle gate, prerequisite, and
"you cannot do X until Y" rule, with `path/to/file.js:line` citations. Read
it before changing any lifecycle behavior.

## Active Skills (Claude OS)

```yaml
active_skills:
  - coding/html
  - coding/css
  - documentation/user-guide-writer
  - documentation/faq-builder
  - meta/doc-updater
  - agents/codex-review
  - agents/gemini-delegate
  - compliance/sa-insurance
```

Skills not yet built but flagged as high-leverage gaps:
- `coding/nodejs-express` — biggest remaining gap; this is a Node/Express
  backend.
- `coding/sqlite` — schema and migrations are central.

## Load-bearing conventions (don't break)
- **Empty-string → null** body normalization in `server/app.js` — SQLite
  CHECK constraints depend on it.
- **Audit on every mutation:** routes call `res.locals.logAudit({...})`
  before responding.
- **Computed-not-stored statuses:** FICA, POPIA, pre-sale disclosure —
  derived on read; never add a stored mirror.
- **Broker data isolation:** `assigned_broker_id = ?` injection in list
  queries + explicit 403 check on detail.
- **No frontend bundler.** Components attach to `window.*`. Don't suggest a
  build step or ESM refactor without an explicit ask.
- **DB path is CWD-relative.** Always start the server from project root.

## Server start (Claude Code on Windows)
`node` is not in the default bash PATH. Use the VS-bundled Node:
```bash
"/c/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Microsoft/VisualStudio/NodeJs/node.exe" server/app.js
```
Run with `run_in_background: true`, then check output. Entry point is
`server/app.js` (not `server.js`).

## Useful npm scripts
- `npm start` — production start
- `npm run dev` — nodemon watch
- `npm run seed` — create default admin (admin/admin123)
- `npm run test:seed` — seed 3 test clients + run validate.js
- `npm run generate:claim-forms` — regenerate PDF claim forms

## Key files
- `server/app.js` — Express bootstrap, middleware order
- `server/db/schema.sql` — full data model (15+ tables)
- `server/middleware/auth.js` — role gates + broker isolation
- `server/middleware/audit.js` — audit-log injection
- `client/src/main.js` / `router.js` / `api.js` — SPA bootstrap, routing,
  API client
- `WORKFLOW_RULES.md` — compliance-gate source of truth
- `README.md` — author intent (module table is stale: Phase 2 is now live)

## Where things live
- `.claude/docs/architecture.md` — current architecture snapshot
  (rebuilt on `/checkpoint`)
- `.claude/docs/CHANGELOG.md` — append-only per-turn history
- `.claude/docs/queue.md` — richer per-turn notes; raw material for
  `/build-user-guide` and `/build-faq`
- `.claude/memory/` — project-scoped memory (separate from the global
  auto-memory layer)
- `.planning/todos/` — Johan's pending/completed task notes
