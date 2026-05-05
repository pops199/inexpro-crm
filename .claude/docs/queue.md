# Inexpro CRM — Notes Queue

Append-only. Richer per-turn notes — raw material for user guides and FAQs.
Annotated entries follow the doc-updater format. Consumed entries are marked, not deleted.

---

### 2026-04-30 — /inspect — initial bootstrap [annotated]
What changed: Read existing codebase end-to-end, scaffolded `.claude/docs/` + `.claude/memory/`,
created root `CLAUDE.md` and project `.claude/CLAUDE.md` with active_skills, seeded
`codebase_overview.md`, wired doc-updater Stop hook in `.claude/settings.json`.
Why: project had partial `.claude/` (launch.json + settings.local.json only) but no Claude OS
scaffolding — needed before any per-turn auto-doc workflow could function.
Gotchas:
  - 28 routes are live; the README's "Phase 2 scaffolded" wording is stale (advice-records,
    complaints, reviews are fully wired).
  - Compliance subsystem (popia, fica, broker-profiles, products, post-sale-events,
    commission-log, tcf-dashboard, notifications) is not in the README's module table.
  - SPA has no bundler — components attach to `window.*`. Avoid suggesting build-step
    refactors without explicit ask.
  - Empty-string → null body normalization happens globally in `server/app.js`; SQLite
    CHECK constraints assume this. Don't break it when adding middleware.
User-facing? no

### 2026-04-30 — Built `compliance/sa-insurance` skill [annotated]
What changed: Created new skill folder `~/.claude/skills/compliance/sa-insurance/`
with SKILL.md (operating brief covering FAIS, GCC, POPIA, FICA, TCF, PPR, COFI,
20 operating principles, per-entity gate map, glossary, source list) and
LESSONS.md. Added a new top-level `compliance/` skill category. Activated the
skill in both root CLAUDE.md and `.claude/CLAUDE.md`.
Why: Highest-leverage skill gap from /inspect — codebase is compliance-driven,
needs domain knowledge encoded so the assistant defaults to the right answer
on schema/route/gate changes.
Gotchas:
  - Tried to use Gemini to research first (per user request) but the API was at
    capacity (gemini-2.5-pro / -flash / -flash-lite all 429; 2.0-flash 404).
    Logged delegation as failed in `~/.claude/delegations/2026-04-30.jsonl`.
    Skill was written from `WORKFLOW_RULES.md` + baseline knowledge instead;
    skill text explicitly flags where authoritative cross-reference is needed.
  - Created the new `compliance/` category without prior explicit confirmation
    of the category name (skill-builder rule). User had named the skill
    `compliance/sa-insurance` in the prior turn, so treated that as authorising
    the path. Worth flagging in case you'd prefer it under research/ or
    domain/.
  - The skill defers to `WORKFLOW_RULES.md` as live source-of-truth — if they
    disagree, prefer that file.
User-facing? no

### 2026-04-30 — Fixed cc-gemini-plugin bridge + ran SA-insurance research [annotated]
What changed: Patched `~/.claude/plugins/cache/cc-gemini-plugin/cc-gemini-plugin/1.3.5/scripts/gemini-bridge.js`
to bypass the gemini.cmd shim on Windows by spawning the current node binary
directly on the gemini.js bundle path (`%APPDATA%/npm/.../bundle/gemini.js`).
Re-ran the failed SA-insurance research; gemini-2.5-flash returned a 388-line
structured brief which is now stored at
`~/.claude/skills/compliance/sa-insurance/research/sa-insurance-compliance-2026-04-30.md`
and referenced from the skill. Updated `compliance/sa-insurance/SKILL.md`:
corrected the FICA accountable-institution claim (short-term brokers are NOT
accountable institutions per Schedule 1 — only s29 STR reporting applies),
nuanced "POPIA applies to natural persons only", added commission caps
(12.5% motor / 20% non-motor, verify), RE5/RE1 exam codes, NFO consolidation
date 2024-03-01, COFI Omni-CBR concept.
Why: Earlier turn's skill had a factual error on FICA accountable-institution
status that would have led the assistant astray. Fixing the bridge unblocks
all future Gemini delegation from this machine.
Gotchas:
  - Three distinct Windows bugs in the bridge stacked on top of each other
    (Node 22+ requirement, .cmd shim resolution, cmd.exe redirect parsing).
    Logged in `~/.claude/skills/agents/gemini-delegate/LESSONS.md`.
  - Patch is to the locally-cached plugin install — a plugin reinstall
    will revert it. Track upstream fix.
  - The cooling-off period number and current FICA Schedule 1 still need
    user verification before relying on them in code.
User-facing? no

### 2026-04-30 16:44 — auto-detected change
Files changed: 1
- `CLAUDE.md`
Session: e4966d30-4f6e-455e-83dd-e1a045d9ad4b
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 15:59 — auto-detected change
Files changed: 6
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/routes/assets.js`
- `server/routes/policies.js`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 16:20 — auto-detected change
Files changed: 16
- `.gitignore`
- `DEPLOY.md`
- `Dockerfile`
- `client/src/api.js`
- `client/src/components/admin.js`
- `docker-compose.yml`
- `server/app.js`
- `server/db/database.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/migrate.js`
- `server/db/migrations/0000_baseline.sql`
- `server/db/migrations/README.md`
- `server/lib/updater.js`
- `server/routes/system-update.js`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 16:24 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 16:31 — auto-detected change
Files changed: 2
- `docker-compose.yml`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 16:36 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 16:46 — auto-detected change
Files changed: 2
- `docker-compose.yml`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:00 — auto-detected change
Files changed: 2
- `Dockerfile`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:00 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:01 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:04 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:04 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:19 — auto-detected change
Files changed: 4
- `DEPLOY.md`
- `Dockerfile`
- `docker-compose.yml`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:23 — auto-detected change
Files changed: 3
- `Dockerfile`
- `docker-compose.yml`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:27 — auto-detected change
Files changed: 2
- `Dockerfile`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 17:46 — auto-detected change
Files changed: 2
- `Dockerfile`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 18:55 — auto-detected change
Files changed: 5
- `client/src/components/admin.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/lib/updater.js`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 18:57 — auto-detected change
Files changed: 7
- `client/src/api.js`
- `client/src/components/admin.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/routes/system-update.js`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:00 — auto-detected change
Files changed: 6
- `client/public/index.html`
- `client/src/components/admin.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:01 — auto-detected change
Files changed: 2
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:07 — auto-detected change
Files changed: 7
- `client/public/index.html`
- `client/src/api.js`
- `client/src/components/admin.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/routes/system-update.js`
Session: d02652a7-58a5-473d-bb73-965ee68ff1f8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:14 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: c8a458ea-16d6-4056-992a-10aacddbb03c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:15 — auto-detected change
Files changed: 2
- `package.json`
- `server/db/sessions.db`
Session: c8a458ea-16d6-4056-992a-10aacddbb03c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:20 — auto-detected change
Files changed: 8
- `client/public/index.html`
- `client/src/components/admin.js`
- `package.json`
- `server/app.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/lib/updater.js`
Session: c8a458ea-16d6-4056-992a-10aacddbb03c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:30 — auto-detected change
Files changed: 7
- `client/public/index.html`
- `client/src/components/admin.js`
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/lib/updater.js`
Session: c8a458ea-16d6-4056-992a-10aacddbb03c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:31 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: c8a458ea-16d6-4056-992a-10aacddbb03c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:33 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: bdd7e899-318b-487b-bcdf-d06c2096c83c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:45 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: 008a2fc1-b97d-418f-9802-13aeaac8c854
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 19:47 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: 008a2fc1-b97d-418f-9802-13aeaac8c854
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 20:09 — auto-detected change
Files changed: 11
- `client/src/components/admin.js`
- `client/src/components/advice-records.js`
- `client/src/components/assets.js`
- `server/db/database.js`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/lib/roa-acknowledgement-reminders.js`
- `server/lib/scheduler.js`
- `server/routes/advice-records.js`
- `server/routes/assets.js`
- `server/routes/settings.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 20:14 — auto-detected change
Files changed: 5
- `client/public/index.html`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 20:16 — auto-detected change
Files changed: 2
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 20:18 — auto-detected change
Files changed: 4
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 20:19 — auto-detected change
Files changed: 2
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 21:00 — auto-detected change
Files changed: 6
- `client/public/index.html`
- `client/src/components/admin.js`
- `client/src/components/compliance.js`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 21:04 — auto-detected change
Files changed: 5
- `client/public/index.html`
- `client/src/components/admin.js`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 21:05 — auto-detected change
Files changed: 2
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 21:28 — auto-detected change
Files changed: 6
- `client/public/index.html`
- `client/src/components/compliance.js`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/routes/products.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 21:32 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 21:33 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:09 — auto-detected change
Files changed: 7
- `client/public/index.html`
- `client/src/components/accounts.js`
- `client/src/components/assets.js`
- `client/src/components/contacts.js`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:13 — auto-detected change
Files changed: 4
- `RELEASES.md`
- `package.json`
- `server/db/sessions.db`
- `server/lib/updater.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:19 — auto-detected change
Files changed: 7
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/reports.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:26 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `client/public/index.html`
- `client/src/api.js`
- `client/src/components/admin.js`
- `server/db/sessions.db`
- `server/routes/admin.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:28 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:32 — auto-detected change
Files changed: 10
- `RELEASES.md`
- `client/public/index.html`
- `client/src/api.js`
- `client/src/components/admin.js`
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
- `server/routes/admin.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:33 — auto-detected change
Files changed: 5
- `client/public/index.html`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:38 — auto-detected change
Files changed: 8
- `RELEASES.md`
- `client/public/index.html`
- `client/src/api.js`
- `client/src/components/admin.js`
- `package.json`
- `server/db/sessions.db`
- `server/lib/updater.js`
- `server/routes/system-update.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:40 — auto-detected change
Files changed: 3
- `client/public/index.html`
- `client/src/components/admin.js`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:50 — auto-detected change
Files changed: 10
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/compliance.js`
- `client/src/components/dashboard.js`
- `client/src/components/schedule.js`
- `client/src/components/workflows.js`
- `client/src/styles/main.css`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:53 — auto-detected change
Files changed: 6
- `client/public/index.html`
- `client/src/styles/main.css`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:58 — auto-detected change
Files changed: 4
- `RELEASES.md`
- `package.json`
- `server/db/sessions.db`
- `server/lib/updater.js`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 22:59 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 23:03 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/dashboard.js`
- `client/src/styles/main.css`
- `package.json`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-01 23:04 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:05 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/dashboard.js`
- `client/src/styles/main.css`
- `package.json`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:06 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:09 — auto-detected change
Files changed: 5
- `RELEASES.md`
- `client/public/index.html`
- `client/src/utils.js`
- `package.json`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:14 — auto-detected change
Files changed: 7
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/assets.js`
- `client/src/components/compliance.js`
- `client/src/styles/main.css`
- `package.json`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:15 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:17 — auto-detected change
Files changed: 7
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/compliance.js`
- `client/src/styles/main.css`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:22 — auto-detected change
Files changed: 11
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/admin.js`
- `client/src/components/complaints.js`
- `client/src/components/compliance.js`
- `client/src/components/profile.js`
- `client/src/styles/main.css`
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:23 — auto-detected change
Files changed: 5
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/admin.js`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-02 00:26 — auto-detected change
Files changed: 4
- `client/public/index.html`
- `client/src/components/profile.js`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: 502bea1f-7e44-4650-831a-9fdebd472c5c
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 12:19 — auto-detected change
Files changed: 6
- `client/public/index.html`
- `client/src/components/policies.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 12:24 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 12:35 — auto-detected change
Files changed: 4
- `client/public/index.html`
- `client/src/components/assets.js`
- `client/src/components/policies.js`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 12:41 — auto-detected change
Files changed: 4
- `RELEASES.md`
- `package.json`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 13:06 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/assets.js`
- `client/src/components/policies.js`
- `package.json`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 13:13 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/assets.js`
- `client/src/components/policies.js`
- `package.json`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 15:10 — auto-detected change
Files changed: 8
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/build-manual.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-wal`
- `server/db/manual_demo.db`
- `server/db/manual_demo.db-shm`
- `server/db/manual_demo.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 15:35 — auto-detected change
Files changed: 8
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/build-manual.js`
- `docs/manual/capture.js`
- `docs/manual/seed-demo.js`
- `server/db/manual_demo.db`
- `server/db/manual_demo.db-shm`
- `server/db/manual_demo.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 15:42 — auto-detected change
Files changed: 28
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/_extracted/[Content_Types].xml`
- `docs/manual/_extracted/docProps/app.xml`
- `docs/manual/_extracted/docProps/core.xml`
- `docs/manual/_extracted/word/_rels/document.xml.rels`
- `docs/manual/_extracted/word/document.xml`
- `docs/manual/_extracted/word/endnotes.xml`
- `docs/manual/_extracted/word/fontTable.xml`
- `docs/manual/_extracted/word/footer1.xml`
- `docs/manual/_extracted/word/footer2.xml`
- `docs/manual/_extracted/word/footer3.xml`
- `docs/manual/_extracted/word/footnotes.xml`
- `docs/manual/_extracted/word/header1.xml`
- `docs/manual/_extracted/word/header2.xml`
- `docs/manual/_extracted/word/header3.xml`
- `docs/manual/_extracted/word/numbering.xml`
- `docs/manual/_extracted/word/settings.xml`
- `docs/manual/_extracted/word/styles.xml`
- `docs/manual/_extracted/word/theme/theme1.xml`
- `docs/manual/_extracted/word/webSettings.xml`
- `docs/manual/_training-module-extracted.docx`
- `docs/manual/build-manual.js`
- `docs/manual/capture.js`
- `docs/manual/~$raining-module-extracted.docx`
- `server/db/manual_demo.db`
- `server/db/manual_demo.db-shm`
- `server/db/manual_demo.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 15:58 — auto-detected change
Files changed: 25
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/_extracted/[Content_Types].xml (deleted)`
- `docs/manual/_extracted/docProps/app.xml (deleted)`
- `docs/manual/_extracted/docProps/core.xml (deleted)`
- `docs/manual/_extracted/word/_rels/document.xml.rels (deleted)`
- `docs/manual/_extracted/word/document.xml (deleted)`
- `docs/manual/_extracted/word/endnotes.xml (deleted)`
- `docs/manual/_extracted/word/fontTable.xml (deleted)`
- `docs/manual/_extracted/word/footer1.xml (deleted)`
- `docs/manual/_extracted/word/footer2.xml (deleted)`
- `docs/manual/_extracted/word/footer3.xml (deleted)`
- `docs/manual/_extracted/word/footnotes.xml (deleted)`
- `docs/manual/_extracted/word/header1.xml (deleted)`
- `docs/manual/_extracted/word/header2.xml (deleted)`
- `docs/manual/_extracted/word/header3.xml (deleted)`
- `docs/manual/_extracted/word/numbering.xml (deleted)`
- `docs/manual/_extracted/word/settings.xml (deleted)`
- `docs/manual/_extracted/word/styles.xml (deleted)`
- `docs/manual/_extracted/word/theme/theme1.xml (deleted)`
- `docs/manual/_extracted/word/webSettings.xml (deleted)`
- `docs/manual/capture.js`
- `server/db/manual_demo.db`
- `server/db/manual_demo.db-shm`
- `server/db/manual_demo.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 16:02 — auto-detected change
Files changed: 3
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/build-manual.js`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 16:08 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 16:14 — auto-detected change
Files changed: 7
- `RELEASES.md`
- `client/public/index.html`
- `client/src/components/notifications.js`
- `docs/manual/~$raining-module-extracted.docx (deleted)`
- `package.json`
- `server/db/database.js`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 17:14 — auto-detected change
Files changed: 3
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/build-manual.js`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 17:25 — auto-detected change
Files changed: 6
- `Inexpro_CRM_User_Manual.docx`
- `docs/manual/capture.js`
- `server/db/manual_demo.db`
- `server/db/manual_demo.db-shm`
- `server/db/manual_demo.db-wal`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 17:29 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-03 17:30 — auto-detected change
Files changed: 3
- `RELEASES.md`
- `package.json`
- `server/db/sessions.db`
Session: fc18185e-d933-456b-ac8b-c8df133c94d8
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:27 — auto-detected change
Files changed: 7
- `client/src/api.js`
- `client/src/components/assets.js`
- `server/db/inexpro.db-wal`
- `server/db/migrations/0001_asset_amendments.sql`
- `server/db/schema.sql`
- `server/db/sessions.db`
- `server/routes/assets.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:30 — auto-detected change
Files changed: 5
- `client/src/components/assets.js`
- `server/db/migrations/0002_documents_asset_amendment_fk.sql`
- `server/db/schema.sql`
- `server/routes/assets.js`
- `server/routes/documents.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:35 — auto-detected change
Files changed: 4
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/schema.sql`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:37 — auto-detected change
Files changed: 5
- `client/src/components/assets.js`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:38 — auto-detected change
Files changed: 2
- `client/public/index.html`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:50 — auto-detected change
Files changed: 10
- `server/db/sessions.db`
- `server/lib/broker-fitness-alerts.js`
- `server/lib/email-signature.js`
- `server/lib/mailer.js`
- `server/lib/roa-acknowledgement-reminders.js`
- `server/lib/scheduler.js`
- `server/routes/advice-records.js`
- `server/routes/complaints.js`
- `server/routes/popia.js`
- `server/routes/settings.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:53 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 17:56 — auto-detected change
Files changed: 1
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:06 — auto-detected change
Files changed: 6
- `client/public/index.html`
- `client/src/components/admin.js`
- `server/db/migrations/0003_users_signature_filename.sql`
- `server/db/sessions.db`
- `server/lib/email-signature.js`
- `server/routes/admin.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:10 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:15 — auto-detected change
Files changed: 3
- `client/public/index.html`
- `client/src/components/engagements.js`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:16 — auto-detected change
Files changed: 3
- `RELEASES.md`
- `package.json`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:21 — auto-detected change
Files changed: 4
- `client/public/index.html`
- `client/src/components/assets.js`
- `server/db/sessions.db`
- `server/routes/assets.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:25 — auto-detected change
Files changed: 3
- `client/public/index.html`
- `client/src/styles/main.css`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:32 — auto-detected change
Files changed: 7
- `server/db/sessions.db`
- `server/lib/broker-fitness-alerts.js`
- `server/lib/mailer.js`
- `server/lib/roa-acknowledgement-reminders.js`
- `server/lib/scheduler.js`
- `server/routes/complaints.js`
- `server/routes/popia.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:34 — auto-detected change
Files changed: 6
- `RELEASES.md`
- `package.json`
- `server/db/inexpro.db`
- `server/db/inexpro.db-shm`
- `server/db/inexpro.db-wal`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:56 — auto-detected change
Files changed: 4
- `client/public/index.html`
- `client/src/components/policies.js`
- `client/src/styles/main.css`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:58 — auto-detected change
Files changed: 3
- `client/public/index.html`
- `client/src/components/assets.js`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 18:59 — auto-detected change
Files changed: 2
- `server/db/sessions.db`
- `server/routes/assets.js`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 19:00 — auto-detected change
Files changed: 3
- `RELEASES.md`
- `package.json`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 19:03 — auto-detected change
Files changed: 2
- `server/db/migrations/0004_rename_asset_amendment_audit_descriptions.sql`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up

### 2026-05-05 19:06 — auto-detected change
Files changed: 3
- `client/public/index.html`
- `client/src/styles/main.css`
- `server/db/sessions.db`
Session: bde54e0c-12b1-41af-b6a9-4f0e6e06baab
User-facing? unknown — annotate yes/no on next turn so /build-user-guide can pick it up
