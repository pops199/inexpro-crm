# Inexpro CRM — project-scoped Claude OS manual

This file declares which skills are active for this project and any
project-specific overrides. The root `CLAUDE.md` carries the project
overview; this file is just the Claude OS hook.

## Active skills

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

Only load skills from this list. If a needed skill is missing, suggest
`meta/skill-builder` rather than improvising.

## Project-specific behavior

- Treat `WORKFLOW_RULES.md` as authoritative for any lifecycle / gate
  question. Verify against current code before relying on its file:line
  citations (it's a living document and may drift between updates).
- When proposing changes, frame them in **regulatory-compliance value**,
  not just code ergonomics. Schema-level suggestions are welcomed.
- Don't break the load-bearing conventions listed in the root `CLAUDE.md`.
- The `meta/doc-updater` Stop hook is wired via `.claude/settings.json` —
  per-turn auto-entries land in `.claude/docs/CHANGELOG.md` and
  `.claude/docs/queue.md`. Augment substantive turns with an annotation
  block in `queue.md` per the doc-updater skill.

## Reflection
Follow the reflection protocol in `~/.claude/CLAUDE.md`. Project-specific
non-obvious lessons go in `.claude/memory/`; cross-project user
preferences go to `~/.claude/memory/`; skill-specific lessons go to the
relevant skill's `LESSONS.md`.
