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
